# crossly-sdk-gen

Generates, compile-checks and publishes the Crossly SDKs for twelve languages from
the public OpenAPI specs. Everything here runs on GitHub Actions.

| path | what |
|---|---|
| `specs/seller.openapi.json`, `specs/buyer.openapi.json` | the two OpenAPI 3.0.3 specs (seller API, buyer API) |
| `specs/SOURCE` | the Crossly commit the specs were emitted from |
| `scripts/generate-sdks.mjs` | runs openapi-generator 5.4.0 per language + post-steps |
| `scripts/sdk-shard.mjs`, `scripts/sdk-layout.mjs` | model folders per product area, README tidy-up |
| `integrations/webhooks/` | hand-written webhook verifiers, copied into every SDK |
| `ci/check.sh` | per-language compile check |
| `ci/assemble-mirror.mjs` | builds a mirror tree + README, scans it for secrets |
| `.github/workflows/regen.yml` | the pipeline |

## The pipeline

On every push to `main` that changes the specs or the generator (and on manual
dispatch), one job per language × API (24):

1. generates the client with openapi-generator 5.4.0 on Java 8;
2. compiles it with that language's own toolchain: `go build`, `mvn compile`,
   `gradle compileKotlin`, `dotnet build`, `cargo check`, `swift build` (macOS),
   `dart analyze`, `tsc --noEmit`, `mix compile`, a full import (Python), a
   `require` (Ruby), `php -l` + autoload (PHP);
3. uploads the generated tree (packed before the check, so no build output ships).

Only when **all 24 are green**, and only on `main`, a second job pushes each
language to its mirror as one squashed commit:

| language | mirror | language | mirror |
|---|---|---|---|
| python | [crossly-python](https://github.com/crossly-dev/crossly-python) | kotlin | [crossly-kotlin](https://github.com/crossly-dev/crossly-kotlin) |
| php | [crossly-php](https://github.com/crossly-dev/crossly-php) | swift | [crossly-swift](https://github.com/crossly-dev/crossly-swift) |
| go | [crossly-go](https://github.com/crossly-dev/crossly-go) | dart | [crossly-dart](https://github.com/crossly-dev/crossly-dart) |
| ruby | [crossly-ruby](https://github.com/crossly-dev/crossly-ruby) | typescript-fetch | [crossly-typescript-fetch](https://github.com/crossly-dev/crossly-typescript-fetch) |
| java | [crossly-java](https://github.com/crossly-dev/crossly-java) | elixir | [crossly-elixir](https://github.com/crossly-dev/crossly-elixir) |
| csharp | [crossly-csharp](https://github.com/crossly-dev/crossly-csharp) | rust | [crossly-rust](https://github.com/crossly-dev/crossly-rust) |

Each push uses a per-mirror deploy key (secret `MIRROR_KEY_<LANG>`, e.g.
`MIRROR_KEY_TYPESCRIPT_FETCH`) with write access to that one repo. A manual run
can pass `tag` to tag every mirror commit, and `publish: false` to check only.

## Contributing

Files here are copied from the Crossly monorepo; edits made directly in this
repo are overwritten on the next spec publish. If a generated client is wrong,
please open an issue: the fix belongs in the spec or the generator options.

## Run it locally

```bash
CROSSLY_SPEC_DIR=specs OPENAPI_GENERATOR_VERSION=5.4.0 \
  node scripts/generate-sdks.mjs --lang go --api seller     # needs Java 8+
bash ci/check.sh go sdks/go/seller
```

MIT
