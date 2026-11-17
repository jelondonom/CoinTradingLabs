import type { AssetClass, Instrument } from '@coin/shared';

export type AssetFilter = AssetClass | 'all';

function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim();
}

/** Filtra por clase de activo y por texto en el símbolo o el nombre, sin distinguir tildes. */
export function filterInstruments(
  instruments: readonly Instrument[],
  query: string,
  filter: AssetFilter,
): Instrument[] {
  const needle = normalize(query);
  return instruments.filter(
    (instrument) =>
      (filter === 'all' || instrument.assetClass === filter) &&
      (needle === '' ||
        normalize(instrument.symbol).includes(needle) ||
        normalize(instrument.name).includes(needle)),
  );
}
