import assert from 'node:assert/strict';
import test from 'node:test';
import type { CaveEntity } from '../types/caves';
import { redactCaveLocations } from './publicCaves';

test('public cave data omits exact location fields', () => {
  const cave: CaveEntity = {
    id: 'hidden-location',
    name: 'Jaskyňa',
    karstRegion: 'Slovenský kras',
    subUnit: '',
    lat: 48.5,
    lon: 20.5,
    elevationM: 320,
    description: '',
    records: [],
  };

  const [publicCave] = redactCaveLocations([cave]);

  assert.equal('lat' in publicCave, false);
  assert.equal('lon' in publicCave, false);
  assert.equal('elevationM' in publicCave, false);
  assert.equal(publicCave.name, cave.name);
});
