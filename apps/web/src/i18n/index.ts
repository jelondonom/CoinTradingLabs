import { es } from './es.js';

export type MessageKey = keyof typeof es;

/** Devuelve el texto de `key` y reemplaza las variables escritas como `{nombre}`. */
export function t(key: MessageKey, vars?: Record<string, string | number>): string {
  const template: string = es[key];
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => String(vars[name] ?? match));
}
