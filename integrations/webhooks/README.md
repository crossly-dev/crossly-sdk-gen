# Webhook verification — every language

Verifying a Crossly webhook in twelve languages, all agreeing on the same conformance vectors.

## The scheme

```
Crossly-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256>
```

signed over `"{t}.{rawBody}"` with the endpoint's signing secret. Also sent: `Crossly-Event` (the event name) and `Crossly-Delivery-Id` (stable across retries — use it to deduplicate, because at-least-once delivery means you **will** see the same event twice).

The timestamp is **inside** the signed message. It cannot be edited to defeat the freshness check without invalidating the signature.

## The three ways to get this wrong

All silent, all common, all guarded against here:

**1. Verifying a re-serialised body.** `parse` → `stringify` does not round-trip byte for byte — key order and number formatting drift — so genuine payloads fail. The usual fix somebody reaches for is to stop verifying. Pass the raw bytes.

This is worst in Phoenix, where the default `Plug.Parsers` consumes the body and you cannot get it back; the Elixir port's docs include the caching body reader you need.

**2. Comparing with `==`.** A string compare returns early on the first differing byte, and the timing leak is enough to forge a signature given enough attempts. Every port uses its language's constant-time compare, or a hand-rolled one where the stdlib has none.

In PHP this is not merely slow — `"0e123" == "0e456"` is **true**, because both look like scientific notation and PHP compares them as floats. Hex digests hit that.

**3. Ignoring the timestamp.** Without it a captured request replays forever and "the signature was valid" is true every time. Default tolerance is 300s — five minutes, not five seconds, because retried deliveries sit in queues and other people's clocks are not yours.

## Conformance

16 vectors, in `test-vectors.json` and `test-vectors.tsv`. Every port must agree on all of them, **including the ten that must fail**: tampered bodies, wrong secrets, edited timestamps, uppercase hex, truncated signatures, replays, and five kinds of malformed header.

```bash
node integrations/webhooks/check-all.mjs
```

Runs whichever toolchains are installed and names the ones that were skipped. A port nobody has executed is not a verified port, and the output says so rather than leaving it to be inferred from a smaller number.

| port | status |
|---|---|
| typescript | **16/16 verified** |
| python | **16/16 verified** |
| go | **16/16 verified** |
| java | **16/16 verified** (on Java 8) |
| rust | **16/16 verified** |
| php, ruby, csharp, kotlin, swift, dart, elixir | written, **not executed here** — no toolchain |

The TSV exists because half these languages have no JSON parser in their standard library, and requiring one to run a conformance test would either add a dependency the library does not need or mean hand-rolling a parser — a second thing that can be wrong in a test whose whole job is to be trustworthy.

## Errors carry a stable reason

`malformed_header` · `bad_signature` · `timestamp_out_of_tolerance` · `missing_secret`

Identical across every port, so one alerting rule can tell a forged request from a clock problem. Those want different responses.

Every port **raises or throws** rather than returning a boolean, so a caller who forgets to check a return value cannot silently accept forged events.

## Where these live

Source of truth is here. `scripts/generate-sdks.mjs` copies each into `sdks/<lang>/webhooks/` on every run — a sibling of `seller/` and `buyer/`, which are **wiped** on regeneration. A hand-written file in either would vanish and nobody would know why.

Webhook verification is not in the OpenAPI spec and cannot be: it is a signing scheme, not an endpoint. Without this, every generated client could call the API and verify nothing it sends back.

## License

MIT
