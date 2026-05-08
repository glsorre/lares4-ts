import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const { console, process } = globalThis;
const root = process.cwd();
const distDtsPath = resolve(root, 'dist/index.d.ts');
const snapshotPath = resolve(root, 'api/public-api.snapshot.txt');
const update = process.argv.includes('--update');

const extractExportedSymbols = (dtsSource) => {
  const symbols = new Set();
  const explicitDecl = /export\s+(?:declare\s+)?(?:class|interface|type|enum|const|function)\s+([A-Za-z0-9_]+)/g;
  const exportList = /export\s*\{([^}]+)\};/g;

  for (const match of dtsSource.matchAll(explicitDecl)) {
    symbols.add(match[1]);
  }

  for (const match of dtsSource.matchAll(exportList)) {
    const entries = match[1]
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean);

    for (const entry of entries) {
      const [name, alias] = entry.split(/\s+as\s+/);
      symbols.add((alias ?? name).trim());
    }
  }

  return [...symbols].sort((a, b) => a.localeCompare(b));
};

const toSnapshotText = (symbols) => `${symbols.join('\n')}\n`;
const normalize = (value) => value.replace(/\r\n/g, '\n').trim();

let dtsContent;
try {
  dtsContent = readFileSync(distDtsPath, 'utf8');
} catch (error) {
  console.error(`Missing declaration file: ${distDtsPath}. Run npm run build first.`);
  process.exit(1);
}

const currentSymbols = extractExportedSymbols(dtsContent);
const currentSnapshot = toSnapshotText(currentSymbols);

if (update) {
  writeFileSync(snapshotPath, currentSnapshot, 'utf8');
  console.log(`Updated API snapshot at ${snapshotPath}`);
  process.exit(0);
}

let expectedSnapshot;
try {
  expectedSnapshot = readFileSync(snapshotPath, 'utf8');
} catch (error) {
  console.error(`Missing snapshot: ${snapshotPath}. Run npm run api:update.`);
  process.exit(1);
}

if (normalize(currentSnapshot) !== normalize(expectedSnapshot)) {
  console.error('Public API surface changed.');
  console.error('Run npm run api:update to refresh snapshot if this change is intentional.');
  process.exit(1);
}

console.log('Public API surface matches snapshot.');
