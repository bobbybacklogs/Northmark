import { chmodSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
chmodSync(path.join(root, '../dist/cli.js'), 0o755);
