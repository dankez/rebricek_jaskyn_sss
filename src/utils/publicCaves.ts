import type { CaveEntity } from '../types/caves';

export type PublicCave = Omit<CaveEntity, 'lat' | 'lon' | 'elevationM'>;

export function redactCaveLocations(caves: CaveEntity[]): PublicCave[] {
  return caves.map(
    ({ lat: _lat, lon: _lon, elevationM: _elevationM, ...publicCave }) => publicCave,
  );
}
