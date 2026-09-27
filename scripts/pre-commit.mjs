import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { extname } from 'node:path';

const stagedFiles = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR'], { encoding: 'utf8' })
  .split('\n')
  .map((file) => file.trim())
  .filter(Boolean);

const forbiddenPath = /(^|\/)(\.env(?!\.example(?:\/|$))(?:\..*)?|node_modules|dist|build)(\/|$)|(?:^|\/)[^/]+\.(?:sqlite|db)$/;
const forbiddenNames = /(^|\/)(?:\.env(?!\.example(?:\/|$))(?:\..*)?|node_modules|dist|build)(\/|$)|(?:^|\/)[^/]+\.(?:sqlite|db)$/;
const testFile = /(^|\/)(?:tests|__tests__)(\/|$)|\.test\.ts$/;
const secretAssignment = /(?:api[_-]?key|password|secret|token)[ \t]*=[ \t]*(?:"[^"]+"|'[^']+'|`[^`]+`)/i;
const binaryExtensions = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.pdf', '.woff', '.woff2', '.ttf', '.ico']);
const errors = [];

for (const file of stagedFiles) {
  if (forbiddenPath.test(file) || forbiddenNames.test(file)) errors.push(`${file}: forbidden file or directory`);
  let stats;
  try {
    stats = statSync(file);
  } catch {
    continue;
  }
  if (stats.size > 1024 * 1024) errors.push(`${file}: exceeds 1 MB`);
  if (binaryExtensions.has(extname(file).toLowerCase())) continue;
  let content;
  try {
    content = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  if (!testFile.test(file) && secretAssignment.test(content)) errors.push(`${file}: looks like a non-empty key, password, secret, or token`);
}

if (errors.length > 0) {
  console.error('Pre-commit checks failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
