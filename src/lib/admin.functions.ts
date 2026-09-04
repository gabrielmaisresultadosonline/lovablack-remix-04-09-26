import { createServerFn } from '@tanstack/react-start';
import { getRequest } from '@tanstack/react-start/server';
import { adminCreateUserSchema, adminSetPlanSchema, adminUpdateUserSchema, planExpiry } from './admin-plan';

export interface AdminUserDto { id:string;email:string;full_name:string|null;whatsapp:string|null;language:string;blocked:boolean;custom_message:string|null;last_login_at:string|null;last_heartbeat_at:string|null;session_id:string|null;access_password:string|null;registration_ip:string|null;created_at:string;plan:string|null;expires_at:string|null;is_active:boolean }

export const adminListUsers = createServerFn({ method: 'GET' }).handler(async () => {
  const { requireAdmin } = await import('./session.server'); const { query } = await import('./db.server'); await requireAdmin(getRequest());
  return query<AdminUserDto>(`SELECT u.id,u.email,u.full_name,u.whatsapp,u.language,u.blocked,u.custom_message,u.last_login_at,u.last_heartbeat_at,u.session_id,u.access_password,host(u.registration_ip) registration_ip,u.created_at,s.type plan,s.expires_at,
    (s.status='active' AND (s.expires_at IS NULL OR s.expires_at + interval '5 minutes'>now())) is_active
    FROM users u LEFT JOIN subscriptions s ON s.user_id=u.id ORDER BY u.created_at DESC`);
});

export const adminCreateUser = createServerFn({ method: 'POST' })
  .inputValidator((input) => adminCreateUserSchema.parse(input))
  .handler(async ({ data }) => {
    const { requireAdmin, hashPassword } = await import('./session.server');
    const { transaction } = await import('./db.server');
    await requireAdmin(getRequest());
    const hash = await hashPassword(data.password);
    const code = crypto.randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase();
    const userId = await transaction(async (client) => {
      const row = await client.query<{ id: string }>(
        `INSERT INTO users(email,password_hash,full_name,whatsapp,language,access_password) VALUES(lower($1),$2,$3,$4,$5,$6) RETURNING id`,
        [data.email, hash, data.fullName, data.whatsapp ?? null, data.language, code],
      );
      const id = row.rows[0]?.id;
      if (!id) throw new Error('Falha ao criar usuário');
      await client.query("INSERT INTO user_roles(user_id,role) VALUES($1,'user')", [id]);
      await client.query("INSERT INTO subscriptions(user_id,type,status,expires_at) VALUES($1,$2,'active',$3)", [id, data.plan, planExpiry(data.plan, data.days)]);
      return id;
    });
    return { userId };
  });

export const adminUpdateUser = createServerFn({ method: 'POST' })
  .inputValidator((input) => adminUpdateUserSchema.parse(input))
  .handler(async ({ data }) => {
    const { requireAdmin } = await import('./session.server');
    const { query } = await import('./db.server');
    await requireAdmin(getRequest());
    await query(
      `UPDATE users SET blocked=coalesce($2,blocked),custom_message=coalesce($3,custom_message),session_id=CASE WHEN $4 THEN NULL ELSE session_id END,
         email=coalesce(lower($5),email),whatsapp=coalesce($6,whatsapp),updated_at=now() WHERE id=$1`,
      [data.userId, data.blocked ?? null, data.customMessage ?? null, data.resetSession ?? false, data.email ?? null, data.whatsapp ?? null],
    );
    return { ok: true };
  });

export const adminSetPlan = createServerFn({ method: 'POST' })
  .inputValidator((input) => adminSetPlanSchema.parse(input))
  .handler(async ({ data }) => {
    const { requireAdmin } = await import('./session.server');
    const { query } = await import('./db.server');
    await requireAdmin(getRequest());
    await query(
      `INSERT INTO subscriptions(user_id,type,status,expires_at) VALUES($1,$2,'active',$3)
       ON CONFLICT(user_id) DO UPDATE SET type=excluded.type,status='active',expires_at=excluded.expires_at,updated_at=now()`,
      [data.userId, data.plan, planExpiry(data.plan, data.days)],
    );
    return { ok: true };
  });
