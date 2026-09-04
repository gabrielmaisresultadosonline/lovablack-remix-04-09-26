import { z } from 'zod';

/** Planos que o admin pode liberar manualmente. */
export const Plan = z.enum(['trial', 'fortnight', 'monthly', 'semiannual', 'annual']);
export type PlanValue = z.infer<typeof Plan>;

const PLAN_DAYS: Record<PlanValue, number> = { fortnight: 15, monthly: 30, semiannual: 180, annual: 365, trial: 0 };

/** Calcula a data de expiração do plano (trial padrão = 30 minutos). */
export function planExpiry(plan: PlanValue, days?: number): string {
  const date = new Date();
  if (plan === 'trial' && !days) date.setMinutes(date.getMinutes() + 30);
  else date.setDate(date.getDate() + (days ?? PLAN_DAYS[plan]));
  return date.toISOString();
}

export const adminCreateUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  fullName: z.string().min(1),
  whatsapp: z.string().optional(),
  language: z.enum(['pt', 'en']).default('pt'),
  plan: Plan,
  days: z.number().int().positive().optional(),
});

export const adminUpdateUserSchema = z.object({
  userId: z.string().uuid(),
  blocked: z.boolean().optional(),
  email: z.string().email().optional(),
  whatsapp: z.string().max(40).optional(),
  customMessage: z.string().optional(),
  resetSession: z.boolean().optional(),
});

export const adminSetPlanSchema = z.object({
  userId: z.string().uuid(),
  plan: Plan,
  days: z.number().int().positive().optional(),
});
