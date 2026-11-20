import { copyFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const destination = resolve(root, 'dist/api');
await mkdir(destination, { recursive: true });

for (const name of ['api.php', 'services.php', 'gemini.php', 'sync.php']) {
  await copyFile(
    resolve(root, 'php', name),
    resolve(destination, name === 'api.php' ? 'index.php' : name),
  );
}
await copyFile(resolve(root, 'php/.htaccess'), resolve(root, 'dist/.htaccess'));
console.log('Pripravené PHP API a Apache rewrite pravidlo.');
