/**
 * Valor del atributo `data-value` (regla 4 de `docs/qa/data-testid.md`): el número tal cual, escrito
 * con `String(n)`, sin redondeo, sin separador de miles y sin moneda. Las pruebas lo leen con
 * `Number()`. Sin un número finito no hay atributo.
 */
export function dataValue(value: number | null | undefined): string | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? String(value) : undefined;
}
