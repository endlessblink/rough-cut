import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = process.cwd();
const artifactRoot = join(root, 'dist', 'rough-cut-mvp-linux-x64');
const appRoot = join(artifactRoot, 'resources', 'app');

await rm(artifactRoot, { recursive: true, force: true });
await mkdir(appRoot, { recursive: true });

await cp(join(root, 'apps/desktop/node_modules/electron/dist'), artifactRoot, { recursive: true, force: true });
await cp(join(root, 'apps/desktop/src/main'), join(appRoot, 'apps/desktop/src/main'), { recursive: true });
await cp(join(root, 'apps/desktop/src/preload'), join(appRoot, 'apps/desktop/src/preload'), { recursive: true });
await cp(join(root, 'apps/desktop/src/shared'), join(appRoot, 'apps/desktop/src/shared'), { recursive: true });
await cp(join(root, 'apps/desktop/dist/renderer'), join(appRoot, 'apps/desktop/dist/renderer'), { recursive: true });
await cp(join(root, 'packages/project-model/dist'), join(appRoot, 'packages/project-model/dist'), { recursive: true });
await cp(join(root, 'packages/project-model/node_modules/zod'), join(appRoot, 'node_modules/zod'), {
  recursive: true,
  dereference: true,
});

await writeFile(
  join(appRoot, 'package.json'),
  `${JSON.stringify(
    {
      name: 'rough-cut-mvp-packaged',
      version: '0.1.0',
      type: 'module',
      main: 'apps/desktop/src/main/index.mjs',
      dependencies: { zod: '^3.24.0' },
    },
    null,
    2,
  )}\n`,
);

await writeFile(
  join(artifactRoot, 'run.sh'),
  '#!/usr/bin/env bash\nset -euo pipefail\nDIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"\nexec "$DIR/electron" "$DIR/resources/app" "$@"\n',
  { mode: 0o755 },
);

console.info(JSON.stringify({ ok: true, artifactRoot, executable: join(artifactRoot, 'electron') }, null, 2));
