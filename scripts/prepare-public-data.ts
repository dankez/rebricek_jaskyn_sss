import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { CaveEntity } from '../src/types/caves';
import { redactCaveLocations } from '../src/utils/publicCaves';

const projectRoot = process.cwd();
const sourcePath = resolve(projectRoot, 'data/caves-db.json');
const outputPath = resolve(projectRoot, 'public/data/caves.json');
const parsed: unknown = JSON.parse(await readFile(sourcePath, 'utf8'));

if (!Array.isArray(parsed) || parsed.length === 0) {
  throw new Error('Databáza jaskýň je prázdna alebo nemá správny formát.');
}

const publicCaves = redactCaveLocations(parsed as CaveEntity[]);
const updatedAt = (await stat(sourcePath)).mtime.toISOString();
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, JSON.stringify({ caves: publicCaves, updatedAt }), 'utf8');
console.log(`Pripravený verejný archív bez súradníc (${publicCaves.length} jaskýň).`);
