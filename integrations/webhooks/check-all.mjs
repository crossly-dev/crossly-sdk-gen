#!/usr/bin/env node
/**
 * Run the shared conformance vectors against every language port whose
 * toolchain is installed.
 *
 *   node integrations/webhooks/check-all.mjs
 *
 * ── WHY IT SKIPS RATHER THAN FAILS ───────────────────────────────────
 * No machine has twelve toolchains. If a missing compiler failed the run,
 * everybody would learn to ignore the output, which is worse than a smaller
 * number honestly reported.
 *
 * So: what ran, what passed, and — the part that matters — an explicit list of
 * what did NOT run. A port nobody has ever executed is not a verified port,
 * and the summary says so rather than leaving it to be inferred from silence.
 */
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * `probe` decides whether the toolchain exists; `run` executes the vectors.
 * Both run from the port's own directory.
 */
const PORTS = [
  {
    id: 'typescript',
    dir: join(HERE, '..', '..', 'packages', 'sdk'),
    probe: 'node --version',
    run: 'node ../../integrations/webhooks/ts-check.mjs',
  },
  { id: 'python', dir: join(HERE, 'python'), probe: 'python --version', run: 'python check_vectors.py' },
  {
    id: 'go',
    dir: join(HERE, 'go', 'checkvectors'),
    probe: 'go version',
    run: 'go run .',
    env: { GOFLAGS: '-mod=mod', GOPROXY: 'off' },
  },
  {
    id: 'java',
    dir: join(HERE, 'java'),
    probe: 'javac -version',
    // --release 8 both matches the runtime here and proves the port is
    // Java 8 compatible, which the generated Java client targets.
    // `&&`, not `;`. Chaining with a semicolon runs `java` even when `javac`
    // failed, so a compile error surfaces as a confusing NoClassDefFound
    // instead of as the compile error it is.
    //
    // No leading-slash paths anywhere: Git Bash rewrites those into Windows
    // paths before the JVM sees them, and `-cp /tmp/x` silently becomes
    // something the classloader cannot find.
    run: 'javac --release 8 -nowarn -d _build CrosslyWebhooks.java CheckVectors.java && java -cp _build CheckVectors',
  },
  { id: 'rust', dir: join(HERE, 'rust'), probe: 'cargo --version', run: 'cargo test -- --nocapture' },

  // Ports with no toolchain here. Listed so the summary can name them rather
  // than silently reporting a smaller total.
  { id: 'php', dir: join(HERE, 'php'), probe: 'php --version', run: 'php check_vectors.php' },
  { id: 'ruby', dir: join(HERE, 'ruby'), probe: 'ruby --version', run: 'ruby check_vectors.rb' },
  { id: 'csharp', dir: join(HERE, 'csharp'), probe: 'dotnet --version', run: 'dotnet run' },
  { id: 'kotlin', dir: join(HERE, 'kotlin'), probe: 'kotlinc -version', run: 'kotlinc CrosslyWebhooks.kt -include-runtime -d wh.jar' },
  { id: 'swift', dir: join(HERE, 'swift'), probe: 'swift --version', run: 'swift test' },
  { id: 'dart', dir: join(HERE, 'dart'), probe: 'dart --version', run: 'dart test' },
  { id: 'elixir', dir: join(HERE, 'elixir'), probe: 'elixir --version', run: 'mix test' },
];

const ran = [];
const skipped = [];
const failed = [];

for (const port of PORTS) {
  if (!existsSync(port.dir)) {
    skipped.push({ id: port.id, why: 'no port directory' });
    continue;
  }

  try {
    execSync(port.probe, { stdio: 'ignore', cwd: port.dir });
  } catch {
    skipped.push({ id: port.id, why: 'toolchain not installed' });
    continue;
  }

  try {
    const out = execSync(port.run, {
      cwd: port.dir,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...(port.env ?? {}) },
    });
    const line = out.split('\n').find((l) => /vectors agree/.test(l))?.trim();
    ran.push({ id: port.id, line: line ?? 'passed' });
  } catch (err) {
    const all = `${err.stdout ?? ''}\n${err.stderr ?? ''}`;
    const mismatch = all.split('\n').filter((l) => l.includes('MISMATCH')).slice(0, 3);
    failed.push({ id: port.id, detail: mismatch.join('; ') || String(err.message).split('\n')[0] });
  }
}

console.log('');
for (const r of ran) console.log(`  ok      ${r.id.padEnd(12)} ${r.line}`);
for (const f of failed) console.log(`  FAIL    ${f.id.padEnd(12)} ${f.detail}`);
for (const s of skipped) console.log(`  skip    ${s.id.padEnd(12)} ${s.why}`);

console.log('');
console.log(`  ${ran.length} verified, ${failed.length} failed, ${skipped.length} not run here`);
if (skipped.length) {
  console.log('');
  console.log('  The skipped ports are NOT verified. They implement the same 40 lines against');
  console.log('  the same vectors, but nobody has executed them on this machine — install the');
  console.log('  toolchain, or run this in CI where they are available.');
}
console.log('');

process.exit(failed.length ? 1 : 0);
