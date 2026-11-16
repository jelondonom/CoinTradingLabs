import { healthResponseSchema, type HealthResponse } from '@coin/shared';
import { useEffect, useState } from 'react';

const POLL_MS = 10_000;

/** Consulta `/health` de la API. `null` significa que la API no responde. */
export function useApiHealth(): HealthResponse | null {
  const [health, setHealth] = useState<HealthResponse | null>(null);

  useEffect(() => {
    let disposed = false;

    async function check(): Promise<void> {
      try {
        // La API responde 503 con el mismo cuerpo cuando está degradada.
        const response = await fetch('/api/health');
        const parsed = healthResponseSchema.safeParse(await response.json());
        if (!disposed) setHealth(parsed.success ? parsed.data : null);
      } catch {
        if (!disposed) setHealth(null);
      }
    }

    void check();
    const timer = window.setInterval(() => void check(), POLL_MS);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, []);

  return health;
}
