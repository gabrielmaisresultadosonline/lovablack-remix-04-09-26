import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { postgresClient as supabase } from '@/lib/postgres-client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Users, CreditCard, Clock, CheckCircle, XCircle, Download, Video, Settings, BookOpen, Ban, MessageSquare, RefreshCw, UserPlus, AlertTriangle, FileText, Plus, Trash2, Image as ImageIcon, ExternalLink, Clipboard, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { adminListUsers, adminCreateUser, adminUpdateUser, adminSetPlan } from '@/lib/admin.functions';

/**
 * Error boundary local do painel: evita tela branca caso alguma query
 * ou renderização de tabela falhe em runtime.
 */
function AdminDashboardError({ error, reset }: { error: Error; reset: () => void }) {
  console.error('[AdminDashboard] Erro de renderização:', error);
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <Card className="max-w-md w-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" /> Erro no Painel
          </CardTitle>
          <CardDescription>
            Não foi possível carregar os dados administrativos. Tente novamente.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <pre className="text-xs bg-muted p-3 rounded-md overflow-auto max-h-40 text-muted-foreground">
            {error.message}
          </pre>
          <Button onClick={reset} className="w-full">
            <RefreshCw className="h-4 w-4 mr-2" /> Tentar novamente
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export const Route = createFileRoute('/admin/dashboard')({
  component: AdminDashboard,
  errorComponent: AdminDashboardError,
});

type PlanType = 'trial' | 'fortnight' | 'monthly' | 'semiannual' | 'annual';

const PLAN_LABELS: Record<PlanType, string> = {
  trial: 'Teste 30 min',
  fortnight: '15 Dias',
  monthly: 'Mensal',
  semiannual: 'Semestral',
  annual: 'Anual',
};

function AdminDashboard() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('usuarios');

  const listUsers = useServerFn(adminListUsers);
  const createUser = useServerFn(adminCreateUser);
  const updateUser = useServerFn(adminUpdateUser);
  const setPlanFn = useServerFn(adminSetPlan);

  const { data: users, isLoading: loadingUsers } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => listUsers(),
  });

  const { data: stats } = useQuery({
    queryKey: ['admin-stats'],
    queryFn: async () => {
      const { data: subs, error } = await supabase.from('subscriptions').select('id, status, expires_at, type, user_id');
      if (error) {
        console.error('Stats query error:', error);
        return { total: 0, active: 0, expired: 0, trials: 0, subs: [] };
      }

      const total = subs.length;
      const active = subs.filter(s => s.status === 'active' && new Date(s.expires_at) > new Date()).length;
      const expired = total - active;
      const trials = subs.filter(s => s.type === 'trial').length;

      return { total, active, expired, trials, subs };
    }
  });

  const { data: transactions } = useQuery({
    queryKey: ['admin-transactions'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('infinitepay_transactions')
        .select('id, amount, status, plan_name, created_at, order_nsu, user_id, provider, currency, payment_link')
        .order('created_at', { ascending: false });
      if (error) {
        console.error('Transactions query error:', error);
        return [];
      }
      return data;
    }
  });

  const { data: settings } = useQuery({
    queryKey: ['admin-settings'],
    queryFn: async () => {
      const { data, error } = await supabase.from('app_settings').select('*');
      if (error) {
        console.error('Settings query error:', error);
        return {};
      }
      const s: Record<string, any> = {};
      data.forEach(item => s[item.key] = item.value);
      return s;
    }
  });

  const updateSettingMutation = useMutation({
    mutationFn: async ({ key, value }: { key: string, value: any }) => {
      const { error } = await supabase
        .from('app_settings')
        .update({ value })
        .eq('key', key);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-settings'] });
      toast.success("Configuração atualizada!");
    },
    onError: (e: Error) => toast.error(e.message || 'Falha ao salvar configuração'),
  });

  const invalidateUsers = () => queryClient.invalidateQueries({ queryKey: ['admin-users'] });

  const updateUserMutation = useMutation({
    mutationFn: (data: { userId: string; blocked?: boolean; customMessage?: string; resetSession?: boolean }) =>
      updateUser({ data }),
    onSuccess: () => { invalidateUsers(); toast.success('Usuário atualizado!'); },
    onError: (e: Error) => toast.error(e.message),
  });

  const setPlanMutation = useMutation({
    mutationFn: (data: { userId: string; plan: PlanType }) => setPlanFn({ data }),
    onSuccess: () => {
      invalidateUsers();
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
      toast.success('Plano liberado!');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const createUserMutation = useMutation({
    mutationFn: (data: CreateUserPayload) =>
      createUser({ data }),
    onSuccess: () => {
      invalidateUsers();
      queryClient.invalidateQueries({ queryKey: ['admin-stats'] });
      toast.success('Usuário criado com sucesso!');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="min-h-screen bg-[#F7F1EB] p-4 md:p-8 pb-20">
      <div className="max-w-7xl mx-auto space-y-8">
        <header>
          <h1 className="text-3xl font-bold text-[#1A1B1A]">Painel Administrativo</h1>
          <p className="text-neutral-500">Gestão Total LOVABLACK</p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <StatCard icon={Users} label="Total Registros" value={stats?.total || 0} />
          <StatCard icon={CheckCircle} label="Assinaturas Ativas" value={stats?.active || 0} color="text-green-600" />
          <StatCard icon={XCircle} label="Expirados" value={stats?.expired || 0} color="text-red-600" />
          <StatCard icon={Clock} label="Testes (Trials)" value={stats?.trials || 0} color="text-blue-600" />
        </div>

        <div className="flex flex-col md:flex-row gap-8">
          <aside className="w-full md:w-64 space-y-2">
            <nav className="flex flex-col space-y-1">
              {[
                { id: 'usuarios', label: 'Usuários', icon: Users },
                { id: 'vendas', label: 'Vendas', icon: CreditCard },
                { id: 'config', label: 'Configurações', icon: Settings },
                { id: 'avisos', label: 'Avisos & Docs', icon: AlertTriangle },
                { id: 'docs', label: 'API Ref', icon: BookOpen },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all ${
                    activeTab === item.id 
                      ? 'bg-[#1A1B1A] text-white shadow-lg' 
                      : 'bg-white text-neutral-600 hover:bg-neutral-100 border border-neutral-200'
                  }`}
                >
                  <item.icon className="w-5 h-5" />
                  {item.label}
                </button>
              ))}
            </nav>

            <div className="pt-8 border-t border-neutral-200 mt-8">
              <Button 
                variant="outline" 
                className="w-full justify-start gap-3 rounded-xl border-red-100 text-red-600 hover:bg-red-50 hover:text-red-700"
                onClick={async () => {
                  await supabase.auth.signOut();
                  window.location.replace('/');
                }}
              >
                <Ban className="w-5 h-5" />
                Sair do Painel
              </Button>
            </div>
          </aside>

          <main className="flex-1 min-w-0">
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
              <TabsList className="hidden">
                <TabsTrigger value="usuarios">Usuários</TabsTrigger>
                <TabsTrigger value="vendas">Vendas</TabsTrigger>
                <TabsTrigger value="config">Configurações</TabsTrigger>
                <TabsTrigger value="avisos">Avisos & Docs</TabsTrigger>
                <TabsTrigger value="docs">Documentação</TabsTrigger>
              </TabsList>
            </Tabs>
          </main>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          {/* ============ USUÁRIOS ============ */}
          <TabsContent value="usuarios" className="space-y-6">
            <Card className="bg-white border-neutral-200">
              <CardHeader className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2"><Users className="w-5 h-5" /> Controle de Usuários</CardTitle>
                  <CardDescription>Acessos, último login, bloqueios, avisos e liberação manual de planos</CardDescription>
                </div>
                <CreateUserDialog
                  onCreate={(payload) => createUserMutation.mutate(payload)}
                  isPending={createUserMutation.isPending}
                />
              </CardHeader>
              <CardContent className="overflow-x-auto">
                {loadingUsers ? (
                  <p className="text-neutral-500 py-8 text-center">Carregando usuários...</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Usuário</TableHead>
                        <TableHead>Idioma</TableHead>
                        <TableHead>Plano</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Expira</TableHead>
                        <TableHead>Último acesso</TableHead>
                        <TableHead>Online</TableHead>
                        <TableHead>IP Registro</TableHead>
                        <TableHead>Bloqueio</TableHead>
                        <TableHead className="text-right">Ações</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(users ?? []).map((u) => (
                        <TableRow key={u.id}>
                          <TableCell>
                            <div className="font-bold">{u.full_name || 'Sem nome'}</div>
                            <div className="text-xs text-neutral-500">{u.email}</div>
                            {u.access_password ? (
                              <div className="text-[11px] font-mono text-neutral-400">senha ext: {u.access_password}</div>
                            ) : null}
                          </TableCell>
                          <TableCell><LangTag lang={u.language} withCurrency /></TableCell>
                          <TableCell>
                            {u.plan ? <Badge variant="outline">{u.plan.toUpperCase()}</Badge> : <span className="text-xs text-neutral-400">—</span>}
                          </TableCell>
                          <TableCell>
                            <Badge className={u.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
                              {u.is_active ? 'ATIVO' : 'INATIVO'}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs">
                            {u.expires_at ? new Date(u.expires_at).toLocaleString() : '—'}
                          </TableCell>
                          <TableCell className="text-xs">
                            {u.last_login_at ? new Date(u.last_login_at).toLocaleString() : 'Nunca acessou'}
                          </TableCell>
                          <TableCell>
                            {(() => {
                              const isOnline = u.last_heartbeat_at && 
                                (new Date().getTime() - new Date(u.last_heartbeat_at).getTime() < 5 * 60 * 1000);
                              return (
                                <div className="flex items-center gap-2">
                                  <div className={`w-2 h-2 rounded-full ${isOnline ? 'bg-green-500 animate-pulse' : 'bg-neutral-300'}`} />
                                  <span className="text-[10px] uppercase font-bold text-neutral-500">
                                    {isOnline ? 'ON' : 'OFF'}
                                  </span>
                                </div>
                              );
                            })()}
                          </TableCell>
                          <TableCell className="text-[10px] font-mono text-neutral-500">
                            {u.registration_ip || '—'}
                          </TableCell>
                          <TableCell>
                            <Switch
                              checked={!!u.blocked}
                              onCheckedChange={(checked) => updateUserMutation.mutate({ userId: u.id, blocked: checked })}
                            />
                          </TableCell>
                          <TableCell className="text-right whitespace-nowrap">
                            <UserActions
                              user={u}
                              onEdit={(email, whatsapp) => updateUserMutation.mutate({ userId: u.id, email, whatsapp })}
                              onMessage={(msg) => updateUserMutation.mutate({ userId: u.id, customMessage: msg })}
                              onPlan={(plan) => setPlanMutation.mutate({ userId: u.id, plan })}
                              onResetSession={() => updateUserMutation.mutate({ userId: u.id, resetSession: true })}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            <Card className="bg-white border-neutral-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><MessageSquare className="w-5 h-5" /> Avisos e Segurança Global</CardTitle>
                <CardDescription>Valem para toda a base de usuários da extensão</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label>Aviso global (global_announcement)</Label>
                  <Textarea
                    key={String(settings?.['global_announcement'] ?? 'ga')}
                    id="global-announcement-input"
                    defaultValue={(settings?.['global_announcement'] as string) ?? ''}
                    placeholder="Ex: Manutenção programada às 22h"
                  />
                  <Button onClick={() => {
                    const val = (document.getElementById('global-announcement-input') as HTMLTextAreaElement).value;
                    updateSettingMutation.mutate({ key: 'global_announcement', value: val });
                  }}>Salvar aviso</Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t">
                  <div className="space-y-2">
                    <Label>Versão mínima da extensão (min_version)</Label>
                    <div className="flex gap-2">
                      <Input
                        key={String(settings?.['min_version'] ?? 'mv')}
                        id="min-version-input"
                        defaultValue={(settings?.['min_version'] as string) ?? '1.0.0'}
                      />
                      <Button onClick={() => {
                        const val = (document.getElementById('min-version-input') as HTMLInputElement).value;
                        updateSettingMutation.mutate({ key: 'min_version', value: val });
                      }}>Salvar</Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Bloqueio multi-login (multi_login_block)</Label>
                    <div className="flex items-center gap-3 h-10">
                      <Switch
                        checked={settings?.['multi_login_block'] === true}
                        onCheckedChange={(checked) => updateSettingMutation.mutate({ key: 'multi_login_block', value: checked })}
                      />
                      <span className="text-sm text-neutral-500">
                        {settings?.['multi_login_block'] === true ? 'Ativado — 1 máquina por conta' : 'Desativado'}
                      </span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
          
          {/* ============ AVISOS & DOCS ============ */}
          <TabsContent value="avisos" className="space-y-6">
            <NoticesAndDocsManager />
          </TabsContent>

          {/* ============ VENDAS ============ */}
          <TabsContent value="vendas" className="space-y-6">
            <Card className="bg-white border-neutral-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="w-5 h-5" /> Vendas (InfinitePay R$ + Stripe US$)
                </CardTitle>
                <CardDescription>Acompanhamento de links e pagamentos em tempo real, nos dois idiomas</CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Comprador</TableHead>
                      <TableHead>Idioma</TableHead>
                      <TableHead>Gateway</TableHead>
                      <TableHead>Plano</TableHead>
                      <TableHead>Valor</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>NSU Pedido</TableHead>
                      <TableHead>Checkout</TableHead>
                      <TableHead>Data</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions?.map((tx: any) => (
                      <TableRow key={tx.id}>
                        <TableCell>
                          <div className="font-bold">{users?.find((user) => user.id === tx.user_id)?.full_name || 'Usuário'}</div>
                          <div className="text-xs text-neutral-400">{users?.find((user) => user.id === tx.user_id)?.whatsapp}</div>
                        </TableCell>
                        <TableCell><LangTag lang={users?.find((user) => user.id === tx.user_id)?.language ?? null} /></TableCell>
                        <TableCell>
                          <Badge className={tx.provider === 'stripe' ? 'bg-indigo-100 text-indigo-800' : 'bg-neutral-100 text-neutral-800'}>
                            {tx.provider === 'stripe' ? 'Stripe' : 'InfinitePay'}
                          </Badge>
                        </TableCell>
                        <TableCell>{tx.plan_name}</TableCell>
                        <TableCell>
                          {tx.currency === 'USD' ? 'US$ ' : 'R$ '}
                          {(tx.amount / 100).toFixed(2)}
                        </TableCell>
                        <TableCell>
                          <Badge className={tx.status === 'paid' ? 'bg-green-100 text-green-800' : tx.status === 'pending' ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'}>
                            {tx.status.toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs font-mono">{tx.order_nsu}</TableCell>
                        <TableCell>
                          <Button variant="link" size="sm" onClick={() => window.open(tx.payment_link, '_blank')}>Abrir</Button>
                        </TableCell>
                        <TableCell className="text-xs">{new Date(tx.created_at).toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ============ CONFIGURAÇÕES ============ */}
          <TabsContent value="config" className="space-y-6">
            <Card className="bg-white border-neutral-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageCircle className="w-5 h-5 text-[#25D366]" /> Link do Grupo (Comunidade WhatsApp)
                </CardTitle>
                <CardDescription>Exibido na página inicial, no /dashboard e nas demais páginas</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex gap-2">
                  <Input
                    key={settings?.['community_link'] || 'community-empty'}
                    defaultValue={typeof settings?.['community_link'] === 'string' ? settings['community_link'] : ''}
                    id="community-link-input"
                    placeholder="https://chat.whatsapp.com/..."
                  />
                  <Button onClick={() => {
                    const val = (document.getElementById('community-link-input') as HTMLInputElement).value.trim();
                    updateSettingMutation.mutate({ key: 'community_link', value: val });
                  }}>Salvar</Button>
                </div>
                <p className="mt-2 text-[10px] text-neutral-400">Deixe em branco para ocultar a faixa da comunidade.</p>
              </CardContent>
            </Card>

            <Card className="bg-white border-neutral-200">
              <CardHeader>
                <CardTitle>IPs liberados do bloqueio de cadastro</CardTitle>
                <CardDescription>
                  Um IP por linha (ou separados por vírgula). Estes IPs podem criar contas sem o limite de 2 cadastros.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <textarea
                    key={JSON.stringify(settings?.['ip_allowlist'] ?? '')}
                    id="ip-allowlist-input"
                    className="w-full min-h-[90px] rounded-md border border-neutral-200 bg-background p-2 text-sm font-mono"
                    placeholder="187.10.20.30&#10;2804:xxxx::1"
                    defaultValue={
                      Array.isArray(settings?.['ip_allowlist'])
                        ? (settings['ip_allowlist'] as string[]).join('\n')
                        : typeof settings?.['ip_allowlist'] === 'string'
                          ? settings['ip_allowlist']
                          : ''
                    }
                  />
                  <Button onClick={() => {
                    const raw = (document.getElementById('ip-allowlist-input') as HTMLTextAreaElement).value;
                    const list = raw.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
                    updateSettingMutation.mutate({ key: 'ip_allowlist', value: list });
                  }}>Salvar IPs liberados</Button>
                </div>
              </CardContent>
            </Card>


            <section className="grid grid-cols-1 md:grid-cols-2 gap-6">

              <Card className="bg-white border-neutral-200">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Download className="w-5 h-5" /> Arquivo da Extensão (.zip)
                  </CardTitle>
                  <CardDescription>Upload direto (até 30MB) ou link externo</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Link atual</Label>
                    <div className="flex gap-2">
                      <Input
                        key={settings?.['download_link'] || 'dl-empty'}
                        defaultValue={settings?.['download_link']}
                        id="download-link-input"
                        placeholder="https://..."
                      />
                      <Button onClick={() => {
                        const val = (document.getElementById('download-link-input') as HTMLInputElement).value;
                        updateSettingMutation.mutate({ key: 'download_link', value: val });
                      }}>Salvar</Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Subir novo arquivo (.zip)</Label>
                    <Input 
                      type="file" 
                      accept=".zip"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (file.size > 30 * 1024 * 1024) {
                          toast.error("Arquivo muito grande! Máximo 30MB.");
                          return;
                        }
                        const toastId = toast.loading("Subindo extensão...");
                        try {
                          const fileName = file.name;
                          const { data, error } = await supabase.storage
                            .from('assets')
                            .upload(fileName, file, {
                              cacheControl: '3600',
                              upsert: true,
                              contentType: file.type
                            });
                          if (error) throw error;
                          
                          // Para o download_link, não usamos publicUrl pois o bucket assets é privado.
                          // Salvamos o path relativo e deixamos o frontend assinar se necessário,
                          // ou passamos o path para uma função que gere a signed url de download.
                          updateSettingMutation.mutate({ key: 'download_link', value: data.path });
                          toast.success("Extensão atualizada!", { id: toastId });
                        } catch (err: any) {
                          toast.error(err.message, { id: toastId });
                        }
                      }}
                    />
                    <p className="text-[10px] text-neutral-400">Limite: 30MB. O link será atualizado automaticamente ao subir.</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="bg-white border-neutral-200">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Video className="w-5 h-5" /> Vídeos Tutoriais (.mp4 ou YouTube)
                  </CardTitle>
                  <CardDescription>Upload de arquivos MP4 (até 300MB), links externos ou thumbs de vídeos</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {(settings?.['tutorials'] || []).map((tut: any, index: number) => (
                    <div key={index} className="flex flex-col gap-2 p-3 border rounded-lg bg-neutral-50 relative">
                      <Input
                        placeholder="Título do Vídeo"
                        defaultValue={tut.title}
                        onBlur={(e) => {
                          if (!settings) return;
                          const newTuts = [...(settings['tutorials'] || [])];
                          newTuts[index].title = e.target.value;
                          updateSettingMutation.mutate({ key: 'tutorials', value: newTuts });
                        }}
                      />
                      <div className="flex gap-2">
                        <Input
                          placeholder="URL (YouTube ou link MP4)"
                          defaultValue={tut.url}
                          id={`tut-url-${index}`}
                          onBlur={(e) => {
                            if (!settings) return;
                            const newTuts = [...(settings['tutorials'] || [])];
                            newTuts[index].url = e.target.value;
                            updateSettingMutation.mutate({ key: 'tutorials', value: newTuts });
                          }}
                        />
                        <div className="flex gap-1 shrink-0">
                          <Input
                            placeholder="Thumbnail URL"
                            defaultValue={tut.thumbnail}
                            className="w-[150px]"
                            id={`tut-thumb-input-${index}`}
                            onBlur={(e) => {
                              if (!settings) return;
                              const newTuts = [...(settings['tutorials'] || [])];
                              newTuts[index].thumbnail = e.target.value;
                              updateSettingMutation.mutate({ key: 'tutorials', value: newTuts });
                            }}
                            onPaste={async (e) => {
                              const items = e.clipboardData.items;
                              for (const item of Array.from(items)) {
                                if (item.type.indexOf("image") !== -1) {
                                  const file = item.getAsFile();
                                  if (!file) continue;
                                  const toastId = toast.loading("Subindo thumb colada...");
                                  try {
                                    const fileName = `thumb-paste-${Math.random()}-${file.name.replace(/\s+/g, '_')}`;
                                    const { data, error } = await supabase.storage.from('assets').upload(fileName, file, { 
                                      upsert: true,
                                      contentType: file.type || 'image/png',
                                      cacheControl: '3600'
                                    });
                                    if (error) throw error;
                                     // Armazenamos apenas o path relativo. O frontend assinará a URL se o bucket for privado.
                                     const filePath = data.path;
                                     
                                     if (!settings) return;
                                     const newTuts = [...(settings['tutorials'] || [])];
                                     newTuts[index].thumbnail = filePath;
                                    updateSettingMutation.mutate({ key: 'tutorials', value: newTuts });
                                    toast.success("Thumbnail atualizada!", { id: toastId });
                                  } catch (err: any) {
                                    toast.error(err.message, { id: toastId });
                                  }
                                }
                              }
                            }}
                          />
                          <Button variant="outline" size="icon" title="Subir Thumbnail" onClick={() => document.getElementById(`tut-thumb-upload-${index}`)?.click()}>
                            <ImageIcon className="w-4 h-4" />
                          </Button>
                          <input 
                            type="file" 
                            id={`tut-thumb-upload-${index}`} 
                            className="hidden" 
                            accept="image/*" 
                            onChange={async (e) => {
                              const file = e.target.files?.[0];
                              if (!file) return;
                              const toastId = toast.loading("Subindo thumbnail...");
                              try {
                                const fileName = `thumb-${Math.random()}-${file.name.replace(/\s+/g, '_')}`;
                                const { data, error } = await supabase.storage.from('assets').upload(fileName, file, { 
                                  upsert: true,
                                  contentType: file.type || 'image/png',
                                  cacheControl: '3600'
                                });
                                if (error) throw error;
                                 const filePath = data.path;
                                 
                                 if (!settings) return;
                                 const newTuts = [...(settings['tutorials'] || [])];
                                 newTuts[index].thumbnail = filePath;
                                updateSettingMutation.mutate({ key: 'tutorials', value: newTuts });
                                toast.success("Thumbnail atualizada!", { id: toastId });
                              } catch (err: any) {
                                toast.error(err.message, { id: toastId });
                              }
                            }} 
                          />
                        </div>
                        <Button variant="destructive" size="icon" onClick={() => {
                          if (!settings) return;
                          const newTuts = settings['tutorials'].filter((_: any, i: number) => i !== index);
                          updateSettingMutation.mutate({ key: 'tutorials', value: newTuts });
                        }}><XCircle className="w-4 h-4" /></Button>
                      </div>
                      <div className="flex flex-col gap-1">
                        <Label className="text-[10px] text-neutral-500">Ou subir arquivo MP4 (300MB)</Label>
                        <Input 
                          type="file" 
                          accept="video/mp4"
                          className="h-8 text-[10px]"
                          onChange={async (e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            if (file.size > 300 * 1024 * 1024) {
                              toast.error("Vídeo muito grande! Máximo 300MB.");
                              return;
                            }
                            const toastId = toast.loading("Subindo vídeo...");
                            try {
                              const fileName = `video-${Math.random()}-${file.name.replace(/\s+/g, '_')}`;
                              const { data, error } = await supabase.storage
                                .from('assets')
                                .upload(fileName, file, { 
                                  upsert: true,
                                  contentType: 'video/mp4',
                                  cacheControl: '3600'
                                });
                              if (error) throw error;
                              
                               const filePath = data.path;
                               
                               const newTuts = [...(settings?.['tutorials'] || [])];
                               newTuts[index].url = filePath;
                              updateSettingMutation.mutate({ key: 'tutorials', value: newTuts });
                              toast.success("Vídeo atualizado!", { id: toastId });
                            } catch (err: any) {
                              toast.error(err.message, { id: toastId });
                            }
                          }}
                        />
                      </div>
                    </div>
                  ))}
                  <Button variant="outline" className="w-full gap-2" onClick={() => {
                    const newTuts = [...(settings?.['tutorials'] || []), { title: 'Novo Vídeo', url: '', thumbnail: '' }];
                    updateSettingMutation.mutate({ key: 'tutorials', value: newTuts });
                  }}><Plus className="w-4 h-4" /> Adicionar Vídeo</Button>
                </CardContent>
              </Card>

            </section>

            <Card className="bg-white border-neutral-200">
              <CardHeader>
                <CardTitle>Assinaturas registradas</CardTitle>
                <CardDescription>Histórico completo de planos e trials</CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Usuário</TableHead>
                      <TableHead>Idioma</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Expiração</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {stats?.subs?.map((sub: any) => (
                      <TableRow key={sub.id}>
                        <TableCell>
                          <div className="font-medium">{users?.find((user) => user.id === sub.user_id)?.full_name || 'N/A'}</div>
                          <div className="text-xs text-neutral-400">{users?.find((user) => user.id === sub.user_id)?.whatsapp}</div>
                        </TableCell>
                        <TableCell><LangTag lang={users?.find((user) => user.id === sub.user_id)?.language ?? null} withCurrency /></TableCell>
                        <TableCell><Badge variant="outline">{sub.type.toUpperCase()}</Badge></TableCell>
                        <TableCell>
                          <Badge className={sub.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
                            {sub.status.toUpperCase()}
                          </Badge>
                        </TableCell>
                        <TableCell>{new Date(sub.expires_at).toLocaleDateString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ============ DOCUMENTAÇÃO ============ */}
          <TabsContent value="docs" className="space-y-6">
            <ApiDocs />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

interface CreateUserPayload {
  email: string;
  password: string;
  fullName: string;
  whatsapp?: string | undefined;
  language: 'pt' | 'en';
  plan: PlanType;
}

function CreateUserDialog({ onCreate, isPending }: { onCreate: (p: CreateUserPayload) => void; isPending: boolean }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [language, setLanguage] = useState<'pt' | 'en'>('pt');
  const [plan, setPlan] = useState<PlanType>('monthly');

  const submit = () => {
    if (!email || !password || !fullName) {
      toast.error('Preencha nome, e-mail e senha.');
      return;
    }
    onCreate({ email, password, fullName, whatsapp: whatsapp || undefined, language, plan });
    setOpen(false);
    setEmail(''); setPassword(''); setFullName(''); setWhatsapp('');
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="gap-2 bg-[#1A1B1A]"><UserPlus className="w-4 h-4" /> Criar usuário manual</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Novo usuário manual</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>Nome completo</Label><Input value={fullName} onChange={(e) => setFullName(e.target.value)} /></div>
          <div className="space-y-1"><Label>E-mail</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
          <div className="space-y-1"><Label>Senha</Label><Input value={password} onChange={(e) => setPassword(e.target.value)} /></div>
          <div className="space-y-1"><Label>WhatsApp (opcional)</Label><Input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Idioma</Label>
              <Select value={language} onValueChange={(v) => setLanguage(v as 'pt' | 'en')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="pt">🇧🇷 Português (R$ / InfinitePay)</SelectItem>
                  <SelectItem value="en">🇺🇸 English (US$ / Stripe)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Plano</Label>
              <Select value={plan} onValueChange={(v) => setPlan(v as PlanType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(PLAN_LABELS) as PlanType[]).map((p) => (
                    <SelectItem key={p} value={p}>{PLAN_LABELS[p]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={submit} disabled={isPending} className="bg-[#1A1B1A]">
            {isPending ? 'Criando...' : 'Criar usuário'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface UserActionsProps {
  user: { id: string; custom_message: string | null; full_name: string | null; email: string; whatsapp: string | null };
  onEdit: (email: string, whatsapp: string) => void;
  onMessage: (msg: string) => void;
  onPlan: (plan: PlanType) => void;
  onResetSession: () => void;
}

function UserActions({ user, onEdit, onMessage, onPlan, onResetSession }: UserActionsProps) {
  const [msgOpen, setMsgOpen] = useState(false);
  const [message, setMessage] = useState(user.custom_message ?? '');
  const [editOpen, setEditOpen] = useState(false);
  const [email, setEmail] = useState(user.email);
  const [whatsapp, setWhatsapp] = useState(user.whatsapp ?? '');

  return (
    <div className="flex items-center justify-end gap-2">
      <Select onValueChange={(v) => onPlan(v as PlanType)}>
        <SelectTrigger className="w-[150px] h-9"><SelectValue placeholder="Liberar plano" /></SelectTrigger>
        <SelectContent>
          {(Object.keys(PLAN_LABELS) as PlanType[]).map((p) => (
            <SelectItem key={p} value={p}>{PLAN_LABELS[p]}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="icon" title="Editar e-mail / telefone"><Pencil className="w-4 h-4" /></Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader><DialogTitle>Editar dados de {user.full_name || 'usuário'}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>E-mail</Label><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
            <div className="space-y-1"><Label>WhatsApp / Telefone</Label><Input value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button className="bg-[#1A1B1A]" onClick={() => { onEdit(email.trim(), whatsapp.trim()); setEditOpen(false); }}>Salvar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={msgOpen} onOpenChange={setMsgOpen}>
        <DialogTrigger asChild>
          <Button variant="outline" size="icon" title="Enviar aviso individual"><MessageSquare className="w-4 h-4" /></Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader><DialogTitle>Aviso para {user.full_name || 'usuário'}</DialogTitle></DialogHeader>
          <Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Mensagem exibida na extensão" />
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setMessage(''); onMessage(''); setMsgOpen(false); }}>Limpar</Button>
            <Button className="bg-[#1A1B1A]" onClick={() => { onMessage(message); setMsgOpen(false); }}>Enviar aviso</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Button variant="outline" size="icon" title="Resetar máquina (multi-login)" onClick={onResetSession}>
        <RefreshCw className="w-4 h-4" />
      </Button>
    </div>
  );
}

function ApiDocs() {
  const endpoint = typeof window !== 'undefined'
    ? `${window.location.protocol}//${window.location.host}/api/public/lovablack-api`
    : 'https://lovblack.online/api/public/lovablack-api';

  return (
    <Card className="bg-white border-neutral-200">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><BookOpen className="w-5 h-5" /> Documentação da API Lovablack</CardTitle>
        <CardDescription>
          API para autenticação da extensão Chrome e outros serviços externos, usando o e-mail e a senha cadastrados aqui.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-8 text-sm text-neutral-700">
        <section className="space-y-2">
          <h3 className="font-bold text-[#1A1B1A] flex items-center gap-2">
            <Badge className="bg-[#1A1B1A] text-white">POST</Badge> Login (Extensão)
          </h3>
          <p className="font-mono text-xs bg-neutral-100 p-2 rounded break-all">{endpoint}</p>
          <p className="text-xs text-neutral-500">Content-Type: application/json</p>
          <CodeBlock>{`{
  "action": "login",
  "email": "usuario@exemplo.com",
  "password": "senha_do_usuario",
  "session_id": "id_unico_da_maquina"  // OPCIONAL para bloqueio multi-login
}`}</CodeBlock>
          <p className="text-xs text-neutral-500">
            A senha aceita é a senha da conta OU a "senha ext" gerada no dashboard do cliente.
          </p>
        </section>

        <section className="space-y-2">
          <h3 className="font-bold text-[#1A1B1A]">Estrutura de Resposta (Sucesso)</h3>
          <CodeBlock>{`{
  "success": true,
  "user": {
    "name": "João Silva",
    "email": "usuario@exemplo.com",
    "language": "pt",
    "plan": "monthly",
    "expires_at": "2026-09-12T00:00:00.000Z",
    "is_active": true,
    "is_expired": false,
    "blocked": false,
    "custom_message": "Aviso individual aqui",
    "global_announcement": "Aviso para todos!",
    "min_version": "1.0.0"
  }
}`}</CodeBlock>
        </section>

        <section className="space-y-3">
          <h3 className="font-bold text-[#1A1B1A]">Regras de Negócio, Bloqueios e Segurança</h3>
          <DocRule icon={Ban} title="1. Bloqueio de Acesso (blocked)">
            Se <code>blocked: true</code> (HTTP 403), a extensão deve encerrar a sessão imediatamente,
            limpar dados sensíveis e exibir a tela de bloqueio administrativo.
          </DocRule>
          <DocRule icon={Clock} title="2. Expiração de Plano e Compra Direta (is_expired)">
            Retorna <code>true</code> quando o teste de 30 minutos acabou ou a assinatura expirou.
            Nessa documentação, precisa aparecer algo exemplo: se ele está usando 30 min e expirando na própria ferramenta, tem que aparecer para ele pagar. O botão de pagar direto na ferramenta, como ele já está logado, ele vai clicar e vai com e-mail e senha dele direto para a área de membros sem precisar pedir login; ele vai acessar direto ali, aparecerá o dashboard do cliente com o acesso dele e os planos para ele fazer isso dentro da área de dashboard. Ou seja, na ferramenta vai um botão para comprar um plano, ele vai clicar e vai direto para área de membros já logado, pois já vai com e-mail e senha dele que está logado na ferramenta extensão e acessará nosso site direto.
          </DocRule>
          <DocRule icon={Download} title="3. Controle de Versão (min_version)">
            A extensão compara a versão local do manifest com <code>min_version</code>.
            Se for inferior, o uso é bloqueado com link para baixar a nova versão.
          </DocRule>
          <DocRule icon={MessageSquare} title="5. Mensagens e Alertas">
            <code>global_announcement</code> vale para toda a base; <code>custom_message</code> é individual.
            Se não estiverem vazios, exiba em destaque (toast ou modal).
          </DocRule>
          <DocRule icon={RefreshCw} title="6. Heartbeat e Status Online">
            Para aparecer como "Online" no painel administrativo, a extensão deve chamar o endpoint de Login periodicamente (ex: a cada 3 a 5 minutos). 
            O campo <code>last_heartbeat_at</code> no banco de dados é atualizado a cada chamada bem-sucedida ao endpoint de login.
            Um usuário é considerado "Online" no painel se o último heartbeat foi há menos de 5 minutos.
          </DocRule>
        </section>

        <section className="space-y-2">
          <h3 className="font-bold text-[#1A1B1A]">Exemplo de chamada</h3>
          <CodeBlock>{`fetch("${endpoint}", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    action: "login",
    email: email,
    password: password,
    session_id: hwid
  })
}).then(r => r.json())`}</CodeBlock>
        </section>
      </CardContent>
    </Card>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="bg-[#1A1B1A] text-neutral-100 text-xs p-4 rounded-xl overflow-x-auto whitespace-pre">
      {children}
    </pre>
  );
}

function DocRule({ icon: Icon, title, children }: { icon: any; title: string; children: React.ReactNode }) {
  return (

    <div className="p-4 rounded-xl border border-neutral-200 bg-neutral-50">
      <h4 className="font-bold text-[#1A1B1A] flex items-center gap-2 mb-1"><Icon className="w-4 h-4" /> {title}</h4>
      <p className="text-sm text-neutral-600 leading-relaxed">{children}</p>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color = "text-[#1A1B1A]" }: any) {
  return (
    <Card className="bg-white border-neutral-200">
      <CardContent className="pt-6">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-neutral-100 rounded-2xl">
            <Icon className="w-6 h-6 text-[#1A1B1A]" />
          </div>
          <div>
            <p className="text-xs text-neutral-500 font-bold uppercase">{label}</p>
            <p className={`text-2xl font-black ${color}`}>{value}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function NoticesAndDocsManager() {
  const queryClient = useQueryClient();
  const [extId, setExtId] = useState('extensao_1');
  const [newNotice, setNewNotice] = useState({ 
    notice_type: 'info' as 'info' | 'block', 
    content_type: 'text' as 'text' | 'video' | 'image' | 'button', 
    content: '',
    image_thumb_url: ''
  });
  
  const [newDoc, setNewDoc] = useState({ title: '', content: '' });
  const [editingDocId, setEditingDocId] = useState<string | null>(null);

  const { data: notices, isLoading: loadingNotices } = useQuery({
    queryKey: ['admin-notices', extId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('extension_notices')
        .select('*')
        .eq('extension_id', extId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    }
  });

  const { data: docs, isLoading: loadingDocs } = useQuery({
    queryKey: ['admin-docs', extId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('extension_docs')
        .select('*')
        .eq('extension_id', extId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return data;
    }
  });

  const addNoticeMutation = useMutation({
    mutationFn: async (payload: any) => {
      const { error } = await supabase.from('extension_notices').insert([{ ...payload, extension_id: extId }]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-notices'] });
      toast.success("Aviso adicionado!");
      setNewNotice({ notice_type: 'info', content_type: 'text', content: '', image_thumb_url: '' });
    }
  });

  const saveDocMutation = useMutation({
    mutationFn: async (payload: { id?: string | null; title: string; content: string }) => {
      if (payload.id) {
        const { error } = await supabase
          .from('extension_docs')
          .update({ title: payload.title, content: payload.content })
          .eq('id', payload.id);
        if (error) throw error;
      } else {
        const { id, ...rest } = payload;
        const { error } = await supabase
          .from('extension_docs')
          .insert([{ ...rest, extension_id: extId }]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-docs'] });
      toast.success("Documentação salva!");
      setNewDoc({ title: '', content: '' });
      setEditingDocId(null);
    }
  });

  const deleteDocMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('extension_docs').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-docs'] });
      toast.success("Documentação removida!");
    }
  });

  const toggleNoticeMutation = useMutation({
    mutationFn: async ({ id, active }: { id: string, active: boolean }) => {
      const { error } = await supabase.from('extension_notices').update({ is_active: active }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-notices'] })
  });

  const deleteNoticeMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('extension_notices').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin-notices'] })
  });

  const handleFileUpload = async (file: File, type: 'notice_image' | 'notice_thumb') => {
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random()}-${file.name.replace(/\s+/g, '_')}`;
      const filePath = `notices/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('assets')
        .upload(filePath, file, { 
          upsert: true,
          contentType: file.type || (type === 'notice_image' ? 'image/png' : 'image/jpeg'),
          cacheControl: '3600'
        });

      if (uploadError) throw uploadError;

      if (type === 'notice_image') {
        setNewNotice(prev => ({ ...prev, content: filePath }));
      } else {
        setNewNotice(prev => ({ ...prev, image_thumb_url: filePath }));
      }
      toast.success("Upload concluído!");
    } catch (error: any) {
      toast.error("Erro no upload: " + error.message);
    }
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    const clipboardData = e.clipboardData;
    if (!clipboardData || !clipboardData.items) return;
    
    const items = Array.from(clipboardData.items);
    for (const item of items) {
      if (item.type.indexOf("image") !== -1) {
        const file = item.getAsFile();
        if (file) {
          await handleFileUpload(file, 'notice_image');
        }
      }
    }
  };

  return (
    <div className="space-y-6">
      <Card className="bg-white border-neutral-200 shadow-sm overflow-hidden">
        <CardHeader className="bg-neutral-50/50 border-b border-neutral-100">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-amber-500" /> Gestão de Avisos e Documentação</CardTitle>
              <CardDescription>Configure avisos (normais ou bloqueios) e documentação por extensão</CardDescription>
            </div>
            <div className="flex items-center gap-3 bg-white p-1 rounded-lg border border-neutral-200">
              <Label className="pl-3 text-xs font-bold text-neutral-500 uppercase">Extensão:</Label>
              <Select value={extId} onValueChange={setExtId}>
                <SelectTrigger className="w-[180px] border-none shadow-none focus:ring-0 font-bold">
                  <SelectValue placeholder="Selecione a extensão" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="extensao_1">Extensão 1 (LOVABLACK)</SelectItem>
                  <SelectItem value="extensao_2">Extensão 2</SelectItem>
                  <SelectItem value="extensao_3">Extensão 3</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <Tabs defaultValue="notices_list" className="space-y-6">
            <TabsList className="bg-neutral-100 p-1 rounded-xl">
              <TabsTrigger value="notices_list" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">Avisos Ativos</TabsTrigger>
              <TabsTrigger value="add_notice" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">Criar Novo Aviso</TabsTrigger>
              <TabsTrigger value="docs_list" className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm">Documentação</TabsTrigger>
            </TabsList>

            <TabsContent value="notices_list" className="space-y-4">
              {loadingNotices ? (
                <div className="flex items-center justify-center py-12 text-neutral-400"><RefreshCw className="w-6 h-6 animate-spin" /></div>
              ) : (notices?.length === 0) ? (
                <div className="text-center py-12 bg-neutral-50 rounded-2xl border-2 border-dashed border-neutral-200">
                  <MessageSquare className="w-12 h-12 text-neutral-300 mx-auto mb-3" />
                  <p className="text-neutral-500 font-medium">Nenhum aviso configurado para {extId}</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {notices?.map((n) => (
                    <Card key={n.id} className={`overflow-hidden border-l-4 ${n.notice_type === 'block' ? 'border-l-red-500' : 'border-l-blue-500'}`}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex gap-4">
                            {n.image_thumb_url && (
                              <img src={n.image_thumb_url} alt="Thumb" className="w-16 h-16 rounded-lg object-cover bg-neutral-100 border border-neutral-200" />
                            )}
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <Badge className={n.notice_type === 'block' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}>
                                  {n.notice_type === 'block' ? 'BLOQUEIO TOTAL' : 'AVISO'}
                                </Badge>
                                <Badge variant="outline" className="text-[10px] uppercase">{n.content_type}</Badge>
                                {!n.is_active && <Badge variant="secondary" className="opacity-50">INATIVO</Badge>}
                              </div>
                              <div className="text-sm font-medium text-neutral-800 line-clamp-2">
                                {n.content_type === 'button' ? JSON.parse(n.content).text : n.content}
                              </div>
                              <div className="text-[10px] text-neutral-400">{n.created_at ? new Date(n.created_at).toLocaleString() : ''}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Switch 
                              checked={!!n.is_active} 
                              onCheckedChange={(val) => toggleNoticeMutation.mutate({ id: n.id, active: val })}
                            />
                            <Button 
                              variant="ghost" 
                              size="icon" 
                              className="text-red-400 hover:text-red-600 hover:bg-red-50"
                              onClick={() => { if(confirm("Remover aviso?")) deleteNoticeMutation.mutate(n.id) }}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="add_notice" className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Tipo de Aviso</Label>
                    <Select value={newNotice.notice_type} onValueChange={(v: any) => setNewNotice({...newNotice, notice_type: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="info">Informativo (Pode ser fechado)</SelectItem>
                        <SelectItem value="block">Bloqueio Total (Não pode fechar)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Conteúdo</Label>
                    <Select value={newNotice.content_type} onValueChange={(v: any) => setNewNotice({...newNotice, content_type: v, content: ''})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="text">Apenas Texto</SelectItem>
                        <SelectItem value="video">Vídeo (YouTube/MP4 Link)</SelectItem>
                        <SelectItem value="image">Imagem</SelectItem>
                        <SelectItem value="button">Botão com Link</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Thumbnail (Opcional)</Label>
                    <div className="flex gap-2">
                      <Input 
                        placeholder="URL ou suba arquivo" 
                        value={newNotice.image_thumb_url} 
                        onChange={(e) => setNewNotice({...newNotice, image_thumb_url: e.target.value})}
                      />
                      <Button variant="outline" size="icon" className="shrink-0" onClick={() => document.getElementById('thumb-upload')?.click()}>
                        <ImageIcon className="w-4 h-4" />
                      </Button>
                      <input type="file" id="thumb-upload" className="hidden" accept="image/*" onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], 'notice_thumb')} />
                    </div>
                  </div>
                  
                  {newNotice.content_type === 'text' && (
                    <div className="space-y-2">
                      <Label>Mensagem do Aviso</Label>
                      <Textarea 
                        placeholder="Digite o aviso..." 
                        value={newNotice.content} 
                        onChange={(e) => setNewNotice({...newNotice, content: e.target.value})}
                      />
                    </div>
                  )}

                  {newNotice.content_type === 'image' && (
                    <div className="space-y-2">
                      <Label>URL da Imagem (Pode dar Ctrl+V aqui)</Label>
                      <div className="flex gap-2">
                        <Input 
                          placeholder="Cole a URL ou a imagem aqui..." 
                          value={newNotice.content} 
                          onPaste={handlePaste}
                          onChange={(e) => setNewNotice({...newNotice, content: e.target.value})}
                        />
                        <Button variant="outline" size="icon" onClick={() => document.getElementById('image-upload')?.click()}>
                          <ImageIcon className="w-4 h-4" />
                        </Button>
                        <input type="file" id="image-upload" className="hidden" accept="image/*" onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0], 'notice_image')} />
                      </div>
                    </div>
                  )}

                  {newNotice.content_type === 'video' && (
                    <div className="space-y-2">
                      <Label>URL do Vídeo</Label>
                      <Input 
                        placeholder="https://youtube.com/..." 
                        value={newNotice.content} 
                        onChange={(e) => setNewNotice({...newNotice, content: e.target.value})}
                      />
                    </div>
                  )}

                  {newNotice.content_type === 'button' && (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label className="text-[10px]">Texto Botão</Label>
                        <Input 
                          placeholder="Comprar Agora" 
                          onChange={(e) => {
                            const prev = newNotice.content ? JSON.parse(newNotice.content) : { text: '', url: '' };
                            setNewNotice({...newNotice, content: JSON.stringify({ ...prev, text: e.target.value })});
                          }}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-[10px]">URL Destino</Label>
                        <Input 
                          placeholder="https://..." 
                          onChange={(e) => {
                            const prev = newNotice.content ? JSON.parse(newNotice.content) : { text: '', url: '' };
                            setNewNotice({...newNotice, content: JSON.stringify({ ...prev, url: e.target.value })});
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              <div className="pt-4 border-t flex justify-end">
                <Button 
                  className="bg-[#1A1B1A] text-white rounded-xl px-8"
                  disabled={!newNotice.content || addNoticeMutation.isPending}
                  onClick={() => addNoticeMutation.mutate(newNotice)}
                >
                  {addNoticeMutation.isPending ? "Criando..." : "Criar Aviso para Extensão"}
                </Button>
              </div>
            </TabsContent>

            <TabsContent value="docs_list" className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-bold flex items-center gap-2"><FileText className="w-5 h-5" /> Documentação da {extId}</h3>
                <Dialog 
                  open={!!editingDocId || (newDoc.title !== '' || newDoc.content !== '')} 
                  onOpenChange={(open) => {
                    if (!open) {
                      setEditingDocId(null);
                      setNewDoc({ title: '', content: '' });
                    }
                  }}
                >
                  <DialogTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2" onClick={() => {
                      setEditingDocId(null);
                      setNewDoc({ title: '', content: '' });
                    }}>
                      <Plus className="w-4 h-4" /> Nova Seção
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-[600px]">
                    <DialogHeader>
                      <DialogTitle>{editingDocId ? 'Editar Seção' : 'Nova Seção de Documentação'}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                      <div className="space-y-2">
                        <Label>Título da Seção</Label>
                        <Input 
                          placeholder="Ex: Como configurar a extensão" 
                          value={newDoc.title}
                          onChange={(e) => setNewDoc({ ...newDoc, title: e.target.value })}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Conteúdo (Markdown/Texto)</Label>
                        <Textarea 
                          className="min-h-[200px]"
                          placeholder="Digite o conteúdo da documentação..." 
                          value={newDoc.content}
                          onChange={(e) => setNewDoc({ ...newDoc, content: e.target.value })}
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button 
                        className="bg-[#1A1B1A]" 
                        disabled={!newDoc.title || !newDoc.content || saveDocMutation.isPending}
                        onClick={() => saveDocMutation.mutate({ id: editingDocId, ...newDoc })}
                      >
                        {saveDocMutation.isPending ? 'Salvando...' : 'Salvar Documentação'}
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
              
              <div className="grid grid-cols-1 gap-4">
                {loadingDocs ? (
                  <div className="flex items-center justify-center py-8"><RefreshCw className="w-5 h-5 animate-spin text-neutral-400" /></div>
                ) : (docs?.length === 0) ? (
                  <div className="text-center py-8 bg-neutral-50 rounded-xl border border-dashed text-neutral-400 text-sm">
                    Nenhuma documentação específica cadastrada ainda.
                  </div>
                ) : (
                  docs?.map((doc) => (
                    <Card key={doc.id} className="group">
                      <CardHeader className="p-4 flex flex-row items-center justify-between space-y-0">
                        <CardTitle className="text-sm font-bold flex items-center gap-2">
                          <FileText className="w-4 h-4 text-neutral-400" /> {doc.title}
                        </CardTitle>
                        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8"
                            onClick={() => {
                              setEditingDocId(doc.id);
                              setNewDoc({ title: doc.title, content: doc.content });
                            }}
                          >
                            <Settings className="w-3.5 h-3.5" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-red-400 hover:text-red-600 hover:bg-red-50"
                            onClick={() => { if(confirm("Remover esta seção de documentação?")) deleteDocMutation.mutate(doc.id) }}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="px-4 pb-4">
                        <div className="text-xs text-neutral-600 line-clamp-3 whitespace-pre-wrap">
                          {doc.content}
                        </div>
                      </CardContent>
                    </Card>
                  ))
                )}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

interface LangTagProps {

  lang?: string | null;
  withCurrency?: boolean;
}

function LangTag({ lang, withCurrency = false }: LangTagProps) {
  const isEn = lang === 'en';
  return (
    <Badge
      className={
        isEn
          ? 'bg-blue-100 text-blue-800 border border-blue-200 font-bold'
          : 'bg-green-100 text-green-800 border border-green-200 font-bold'
      }
    >
      {isEn ? '🇺🇸 EN' : '🇧🇷 PT'}
      {withCurrency ? (isEn ? ' · US$' : ' · R$') : ''}
    </Badge>
  );
}
