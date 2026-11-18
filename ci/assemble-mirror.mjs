#!/usr/bin/env node
/**
 * Build one language's mirror tree from the generated clients and scan it.
 *
 *   node ci/assemble-mirror.mjs <lang> <dir>
 *
 * <dir> already holds `seller/`, `buyer/` and `webhooks/` (unpacked from the
 * workflow's artifacts). Writes the root README, then runs the same
 * forbidden-pattern scan the monorepo's mirror sync uses and exits 1 on any
 * hit — generated code is still code, and a spec that ever carried a token
 * would bake it into every client at once.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { auditFiles } from '../scripts/mirror-forbidden.mjs';
import { mirrorReadme } from '../scripts/sdk-layout.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [lang, dirArg] = process.argv.slice(2);
if (!lang || !dirArg) {
  console.error('usage: node ci/assemble-mirror.mjs <lang> <dir>');
  process.exit(2);
}
const dir = resolve(dirArg);
let source = 'unknown';
try {
  source = readFileSync(join(ROOT, 'specs', 'SOURCE'), 'utf8').trim().slice(0, 9) || source;
} catch {
  // specs/SOURCE is written by the monorepo's publish script; absent on a hand edit.
}

for (const need of ['seller', 'buyer']) {
  if (!statSync(join(dir, need), { throwIfNoEntry: false })?.isDirectory()) {
    console.error(`${dir}/${need} is missing — refusing to assemble a half mirror`);
    process.exit(1);
  }
}

writeFileSync(join(dir, 'README.md'), mirrorReadme(lang, source));

const walk = (d) =>
  readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.name === '.git' ? [] : e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)],
  );
const files = walk(dir).map((f) => relative(dir, f));
const hits = auditFiles(dir, files);
console.log(`${lang}: ${files.length} files, ${hits.length} finding(s)`);
for (const h of hits) console.log(`  !! ${h.file}: ${h.name} (${h.sample})`);
process.exit(hits.length ? 1 : 0);
