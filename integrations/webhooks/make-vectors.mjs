#!/usr/bin/env node
/**
 * Generate the canonical webhook test vectors.
 *
 *   node integrations/webhooks/make-vectors.mjs
 *
 * ── WHY SHARED VECTORS AT ALL ────────────────────────────────────────
 * Twelve implementations of the same HMAC is twelve chances to disagree, and
 * the disagreements are silent: an implementation that hashes `t + "." + body`
 * with the wrong concatenation, or hex-encodes uppercase, or trims the body,
 * verifies its own signatures perfectly and rejects every real one.
 *
 * A fixture every language checks against turns that from "works on my
 * machine" into a single number. Each port runs the same vectors and must
 * agree on all of them — including, importantly, the ones that must FAIL.
 *
 * ── THE SIGNATURES ARE COMPUTED, NOT COPIED ──────────────────────────
 * Generated here with Node's crypto against the same scheme
 * `workers/webhook-delivery.ts` sends, so the fixture cannot drift from the
 * sender by being hand-typed.
 */
import { createHmac } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

const SECRET = 'whsec_canonical_test_secret_do_not_use';
/** Fixed so the vectors are reproducible; verifiers are given `now` explicitly. */
const NOW = 1_700_000_000;

const BODY = JSON.stringify({
  id: 'evt_01HQ8',
  type: 'listing.sold',
  created: '2026-01-15T09:30:00.000Z',
  data: { listingId: 'lst_abc123', platform: 'ebay', priceCents: 4599 },
});

const sign = (body, t, secret = SECRET) =>
  createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');

const valid = sign(BODY, NOW);

const vectors = [
  {
    name: 'valid signature at exactly now',
    body: BODY,
    header: `t=${NOW},v1=${valid}`,
    secret: SECRET,
    now: NOW,
    expect: 'ok',
  },
  {
    name: 'valid, two minutes old — inside the default tolerance',
    body: BODY,
    header: `t=${NOW - 120},v1=${sign(BODY, NOW - 120)}`,
    secret: SECRET,
    now: NOW,
    expect: 'ok',
  },
  {
    name: 'unknown v2 field alongside v1 is ignored, not fatal',
    body: BODY,
    header: `t=${NOW},v1=${valid},v2=futurescheme`,
    secret: SECRET,
    now: NOW,
    expect: 'ok',
  },
  {
    name: 'whitespace around fields is tolerated',
    body: BODY,
    header: `t=${NOW}, v1=${valid}`,
    secret: SECRET,
    now: NOW,
    expect: 'ok',
  },
  {
    name: 'body tampered after signing',
    body: BODY.replace('4599', '1'),
    header: `t=${NOW},v1=${valid}`,
    secret: SECRET,
    now: NOW,
    expect: 'bad_signature',
  },
  {
    name: 'signed with a different secret',
    body: BODY,
    header: `t=${NOW},v1=${sign(BODY, NOW, 'whsec_someone_elses_secret')}`,
    secret: SECRET,
    now: NOW,
    expect: 'bad_signature',
  },
  {
    name: 'timestamp edited to look fresh — it is inside the signed message',
    body: BODY,
    header: `t=${NOW},v1=${sign(BODY, NOW - 10_000)}`,
    secret: SECRET,
    now: NOW,
    expect: 'bad_signature',
  },
  {
    name: 'uppercase hex must NOT be accepted by a case-insensitive compare',
    body: BODY,
    header: `t=${NOW},v1=${valid.toUpperCase()}`,
    secret: SECRET,
    now: NOW,
    expect: 'bad_signature',
  },
  {
    name: 'replay: genuinely signed but an hour old',
    body: BODY,
    header: `t=${NOW - 3600},v1=${sign(BODY, NOW - 3600)}`,
    secret: SECRET,
    now: NOW,
    expect: 'timestamp_out_of_tolerance',
  },
  {
    name: 'an hour in the future — a broken clock or a widened replay window',
    body: BODY,
    header: `t=${NOW + 3600},v1=${sign(BODY, NOW + 3600)}`,
    secret: SECRET,
    now: NOW,
    expect: 'timestamp_out_of_tolerance',
  },
  {
    name: 'no v1 field',
    body: BODY,
    header: `t=${NOW}`,
    secret: SECRET,
    now: NOW,
    expect: 'malformed_header',
  },
  {
    name: 'no t field',
    body: BODY,
    header: `v1=${valid}`,
    secret: SECRET,
    now: NOW,
    expect: 'malformed_header',
  },
  {
    name: 'not a signature header at all',
    body: BODY,
    header: 'garbage',
    secret: SECRET,
    now: NOW,
    expect: 'malformed_header',
  },
  {
    name: 'empty header',
    body: BODY,
    header: '',
    secret: SECRET,
    now: NOW,
    expect: 'malformed_header',
  },
  {
    name: 'non-numeric timestamp',
    body: BODY,
    header: `t=notanumber,v1=${valid}`,
    secret: SECRET,
    now: NOW,
    expect: 'malformed_header',
  },
  {
    name: 'truncated signature — must not crash a length-sensitive compare',
    body: BODY,
    header: `t=${NOW},v1=${valid.slice(0, 10)}`,
    secret: SECRET,
    now: NOW,
    expect: 'bad_signature',
  },
];

// ── Bodies of the Crossly Worlds / open platform events ──────────────
// The scheme does not depend on the event, but these bodies are what the
// newest integrations receive: non-ASCII text (a player's display name, an
// experience called "Café Ünïcode 🎮"), nested arrays, and payloads several
// KB long. A port that re-encodes the body (normalising Unicode, re-serialising
// JSON, decoding as Latin-1) breaks on exactly these.
const EVENT_BODIES = {
  'world.purchase': { experienceId: '0b9c8d7e-6f5a-4b3c-2d1e-0f9a8b7c6d5e', receiptId: '7f6e5d4c-3b2a-1908-7f6e-5d4c3b2a1908', orderId: 'pi_3Q0example', productId: 'p1', productKind: 'pass', sub: 'k3Jx9Qm2Lp8Vt4Rw7Yz1Ab', priceCents: 499, state: 'paid', drop: null, periodEnd: null },
  'world.subscription_renewed': { experienceId: '0b9c8d7e-6f5a-4b3c-2d1e-0f9a8b7c6d5e', receiptId: 'r2', orderId: 'sub_cycle_2', productKind: 'subscription', sub: 'k3Jx9Qm2Lp8Vt4Rw7Yz1Ab', priceCents: 999, state: 'paid', periodEnd: '2026-12-01T00:00:00.000Z' },
  'experience.reported': { experienceId: '0b9c8d7e-6f5a-4b3c-2d1e-0f9a8b7c6d5e', experience: 'Café Ünïcode 🎮', reportId: 'rep_1', targetKind: 'chat_line', reason: 'harassment' },
  'world.rewards_credited': { month: '2026-08', totalCents: 4210, experiences: Array.from({ length: 60 }, (_, i) => ({ experienceId: `exp-${i}`, countedMinutes: 1000 + i, countedPlayers: 5 + i, cents: 70 })) },
  'app.certification_decided': { appId: '5e6f7a8b-9c0d-4e1f-2a3b-4c5d6e7f8a9b', decision: 'approved', clientVersion: '1.4.0', notes: 'Rapport vérifié — 報告メニュー OK' },
};
for (const [type, data] of Object.entries(EVENT_BODIES)) {
  const body = JSON.stringify({ id: `evt_${type.replace(/[^a-z]/g, '').slice(0, 10)}`, type, created: '2026-10-13T12:00:00.000Z', data });
  vectors.push({ name: `${type} body (valid)`, body, header: `t=${NOW},v1=${sign(body, NOW)}`, secret: SECRET, now: NOW, expect: 'ok' });
}
{
  // One character changed inside the non-ASCII part of a signed body must fail.
  const body = JSON.stringify({ id: 'evt_unicode', type: 'experience.reported', created: '2026-10-13T12:00:00.000Z', data: EVENT_BODIES['experience.reported'] });
  vectors.push({ name: 'experience.reported body with its Unicode altered after signing', body: body.replace('Ünïcode', 'Unicode'), header: `t=${NOW},v1=${sign(body, NOW)}`, secret: SECRET, now: NOW, expect: 'bad_signature' });
}

mkdirSync(HERE, { recursive: true });
writeFileSync(
  join(HERE, 'test-vectors.json'),
  JSON.stringify(
    {
      $comment:
        'Generated by make-vectors.mjs. Every language port must agree on all of these, ' +
        'including the ones that must fail. toleranceSeconds is 300 unless stated.',
      toleranceSeconds: 300,
      vectors,
    },
    null,
    2,
  ) + '\n',
);

/**
 * The same vectors as a tab-separated file, with the body base64-encoded.
 *
 * ── WHY A SECOND FORMAT ──────────────────────────────────────────────
 * Half the language ports have no JSON parser in their standard library, and
 * requiring one to RUN THE CONFORMANCE TEST means the test either pulls in a
 * dependency the library itself does not need, or gets hand-rolled — and a
 * hand-rolled JSON parser in a test is a second thing that can be wrong.
 *
 * Base64 for the body because it contains quotes and braces; a TSV of raw JSON
 * would need escaping rules, which is the problem we just removed.
 */
const tsv = vectors
  .map((v) =>
    [
      v.name.replace(/\t/g, ' '),
      Buffer.from(v.body, 'utf8').toString('base64'),
      v.header.replace(/\t/g, ' '),
      v.secret,
      String(v.now),
      v.expect,
    ].join('\t'),
  )
  .join('\n');

writeFileSync(
  join(HERE, 'test-vectors.tsv'),
  `# name\tbody_base64\theader\tsecret\tnow\texpect  (tolerance ${300}s)\n${tsv}\n`,
);

const counts = vectors.reduce((acc, v) => ({ ...acc, [v.expect]: (acc[v.expect] ?? 0) + 1 }), {});
console.log(`\n  ${vectors.length} vectors written (.json and .tsv)`);
for (const [k, n] of Object.entries(counts)) console.log(`    ${String(n).padStart(3)}  ${k}`);
console.log('');
