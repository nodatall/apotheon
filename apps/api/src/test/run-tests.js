import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const srcRoot = path.resolve(__dirname, '..');

async function findTestFiles(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const absolutePath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return findTestFiles(absolutePath);
      }
      if (entry.isFile() && entry.name.endsWith('.test.js')) {
        return [absolutePath];
      }
      return [];
    })
  );

  return files.flat();
}

function normalizeForMatch(filePath) {
  return filePath.toLowerCase().replaceAll(path.sep, '/');
}

async function main() {
  const filters = process.argv.slice(2).map((value) => value.toLowerCase());
  let testFiles = await findTestFiles(srcRoot);

  if (filters.length > 0) {
    testFiles = testFiles.filter((filePath) =>
      filters.some((filter) => normalizeForMatch(filePath).includes(filter))
    );
  }

  if (testFiles.length === 0) {
    console.error(`No tests matched filters: ${filters.join(', ') || '(none)'}`);
    process.exit(1);
  }

  testFiles.sort();

  const child = spawn(process.execPath, ['--test', ...testFiles], {
    stdio: 'inherit'
  });

  child.on('exit', (code) => {
    process.exit(code ?? 1);
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
