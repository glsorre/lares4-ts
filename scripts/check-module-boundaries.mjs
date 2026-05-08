import { readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';

const { console, process } = globalThis;
const root = process.cwd();
const violations = [];
const allowedPublicToInternalImports = new Set([
  'src/lib/public/lares4.ts',
  'src/lib/public/lares4-socket.ts',
]);

function walk(dir, visitor) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, visitor);
      continue;
    }
    visitor(fullPath);
  }
}

function normalize(pathValue) {
  return pathValue.replaceAll('\\', '/');
}

function collectPublicLayerViolations() {
  const publicDir = join(root, 'src', 'lib', 'public');
  walk(publicDir, (fullPath) => {
    if (extname(fullPath) !== '.ts') {
      return;
    }
    const source = readFileSync(fullPath, 'utf8');
    const relPath = normalize(fullPath.replace(`${root}/`, ''));
    const forbidden = /from\s+['"]\.\.\/internal\/[^'"]+['"]/g;
    if (forbidden.test(source) && !allowedPublicToInternalImports.has(relPath)) {
      violations.push(`${relPath} imports from src/lib/internal`);
    }
  });
}

function collectEntrypointViolations() {
  const indexPath = join(root, 'src', 'index.ts');
  const source = readFileSync(indexPath, 'utf8');
  const forbidden = /from\s+['"]\.\/lib\/internal\/[^'"]+['"]/g;
  if (forbidden.test(source)) {
    violations.push('src/index.ts imports from src/lib/internal');
  }
}

collectPublicLayerViolations();
collectEntrypointViolations();

if (violations.length > 0) {
  console.error('Module boundary violations detected:');
  for (const violation of violations) {
    console.error(` - ${violation}`);
  }
  process.exit(1);
}

console.log('Module boundary check passed.');
