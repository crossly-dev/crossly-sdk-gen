// Runs the shared vectors against the shipped @crossly/sdk implementation.
import { readFileSync } from 'node:fs';
import { verifyWebhook, WebhookVerificationError } from '../../packages/sdk/dist/webhooks.js';

const { vectors } = JSON.parse(
  readFileSync(new URL('./test-vectors.json', import.meta.url), 'utf8'),
);
let ok = 0, bad = 0;
for (const v of vectors) {
  let got;
  try { await verifyWebhook(v.body, v.header, v.secret, { nowSeconds: v.now }); got = 'ok'; }
  catch (e) { got = e instanceof WebhookVerificationError ? e.reason : 'threw'; }
  if (got === v.expect) ok++;
  else { bad++; console.log(`  MISMATCH ${v.name}: expected ${v.expect}, got ${got}`); }
}
console.log(`  typescript: ${ok}/${vectors.length} vectors agree`);
process.exit(bad ? 1 : 0);
