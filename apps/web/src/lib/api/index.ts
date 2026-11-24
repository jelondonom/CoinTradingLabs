import { useSessionStore } from '../../stores/session-store.js';
import { createApiClient } from './api-client.js';
import { createCoinApi } from './coin-api.js';

/**
 * Instancia única del cliente de la API. Un 401 en una ruta con sesión (B4) cierra la sesión del
 * cliente; `App` lleva entonces a `/ingreso` con el aviso "tu sesión terminó".
 */
export const api = createCoinApi(
  createApiClient({ onUnauthorized: () => useSessionStore.getState().expire() }),
);
