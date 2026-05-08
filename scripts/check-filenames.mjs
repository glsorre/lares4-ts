import { readdirSync } from 'node:fs';
import { extname, join, basename } from 'node:path';

const { console, process } = globalThis;
const root = process.cwd();
const targets = ['src', 'tests'];
const allowedBase = /^(index|[a-z0-9]+(?:-[a-z0-9]+)*)$/;
const violations = [];

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }
    if (extname(entry.name) !== '.ts') {
      continue;
    }
    const fileName = basename(entry.name, '.ts');
    if (fileName.endsWith('.test')) {
      const testBase = fileName.slice(0, -'.test'.length);
      if (!allowedBase.test(testBase)) {
        violations.push(fullPath);
      }
      continue;
    }
    if (!allowedBase.test(fileName)) {
      violations.push(fullPath);
    }
  }
}

for (const target of targets) {
  walk(join(root, target));
}

if (violations.length > 0) {
  console.error('Filename convention violations detected (kebab-case required):');
  for (const file of violations) {
    console.error(` - ${file.replace(`${root}/`, '')}`);
  }
  process.exit(1);
}

console.log('Filename convention check passed.');
