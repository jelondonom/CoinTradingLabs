import { z } from 'zod';

export const healthCheckStatusSchema = z.enum(['up', 'down']);

/** Respuesta de `GET /health` en todos los servicios. */
export const healthResponseSchema = z.object({
  status: z.enum(['ok', 'degraded']),
  service: z.string(),
  uptimeSeconds: z.number().nonnegative(),
  checks: z.record(z.string(), healthCheckStatusSchema),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;
