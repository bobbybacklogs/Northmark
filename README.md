# Northmark

<p align="center">
  <img src="./assets/lockup.png" alt="Northmark Logo" width="400"/>
</p>

![Static Badge](https://img.shields.io/badge/Northmark-Because_every_product_needs_direction-purple)
![Static Badge](https://img.shields.io/badge/NPM-Available-brightgreen) ![Static Badge](https://img.shields.io/badge/License-MIT-blue) ![Static Badge](https://img.shields.io/badge/Version-1.0.0-blue)

---

**Northmark — Give every product a clear direction.**

Northmark is a source-aware CLI that uses ModelHitch to turn the codebase in the current directory into structured product documentation. It drafts a docs overview, a product brief, a design direction grounded in the source, and an architecture note, so product, design, and engineering can share one direction.

The package name on npm is `northmark`. This repository is ready to publish; publishing is a separate step and is not done from CI.

## Docs it writes

Everything lands in `./docs/` inside the project you point it at. The repository README at the project root is left alone.

| File | What it is |
| --- | --- |
| `docs/README.md` | Overview and where to start |
| `docs/product_brief.md` | Problem, audience, principles, open questions |
| `docs/design_direction.md` | UI frameworks, tokens, colors, fonts, and components found in the source |
| `docs/architecture.md` | Runtime, entry points, and how the system is shaped |

Claims are supposed to be grounded in the files Northmark actually read. Inferences are labeled. Existing docs are not overwritten unless you pass `--force` or accept the prompt.

## Install

Node.js 18.17 or newer. There are no native addons.

From a packed tarball:

```bash
npm pack
npm install -g ./northmark-1.0.0.tgz
northmark --help
```

After the package is published:

```bash
npm install -g northmark
```

### `npm link` on macOS (Apple Silicon)

Clone the repo on the machine that should get the command (an Apple Silicon Mac mini is fine), then:

```bash
npm install
npm run build
npm link
```

`npm link` puts `northmark` on your PATH. The published bin is `dist/cli.js`, and the runtime dependencies are plain JavaScript (`commander`, `picocolors`, `@clack/prompts`, `ignore`), so the link does not need a native build.

Check it from any project:

```bash
cd /path/to/your/product
northmark --dry-run
```

After you pull or edit Northmark, run `npm run build` again. The link points at `dist/`. Remove it with `npm unlink -g northmark`.

## Usage

```bash
northmark                         # menu on a TTY: pick which docs to draft
northmark generate                # draft all four docs
northmark generate --dry-run      # crawl summary and planned files, no model call
northmark --dry-run               # same thing
northmark generate --docs readme,product-brief --force
northmark crawl                   # show what would be read
northmark help generate
northmark --version
```

On a TTY, `northmark` with no arguments opens a menu (which docs, and whether this is a dry run). In CI, or when stdout is not a TTY, the same invocation prints help and exits 0. Pass `generate` or flags when you want a run.

### `generate`

```text
-d, --docs <list>     readme, product-brief, design, architecture (default: all)
-n, --dry-run         show the crawl and the files that would be written
-f, --force           overwrite docs that already exist
--out <dir>           directory inside the project (default: docs)
--cwd <dir>           project directory (default: the current directory)
--base-url <url>      OpenAI-compatible API base
--api-key <key>       API key (prefer the env var)
--model <id>          model id
--timeout <ms>        request timeout (default: 120000)
--max-bytes <n>       context budget in bytes (default: 100000)
```

`--dry-run` never calls the model and never writes. If a file already exists, the plan says `needs --force` instead of pretending it would be replaced.

Without `--force`, an existing file stops a real run before any model call. On a TTY menu, Northmark asks first. `--out` must stay inside the project.

### `crawl`

Walks the project and prints the same safety and context summary. No model call, nothing written.

## Model

ModelHitch is an OpenAI-compatible chat completions API. Set `NORTHMARK_API_KEY` to a valid ModelHitch access key. Bring another key or another server with flags or env vars. Flags win over env vars. On macOS, Northmark then checks Keychain for service `com.cuvola.northmark.modelhitch`, account `northmark`. The saved key is used only with the default `https://mh.bycuvola.com/v1` endpoint; custom endpoints require their own key.

| Variable | Default |
| --- | --- |
| `NORTHMARK_BASE_URL` | `https://mh.bycuvola.com/v1` |
| `NORTHMARK_API_KEY` | `MHK-123` |
| `NORTHMARK_MODEL` | `modelhitch/auto` |
| `NORTHMARK_TIMEOUT_MS` | `120000` |
| `NORTHMARK_MAX_BYTES` | `100000` |

Requests go to `{base}/chat/completions`. A down endpoint, a non-JSON body, an empty completion, or a timeout exits non-zero with a short reason and does not pretend the docs were written.

## What gets read

Northmark walks the current directory only. It does not go to parent folders, and it does not follow a symlink whose target resolves outside that directory. Cycles are cut.

It respects `.gitignore`, and it always skips `node_modules`, `.git`, build output (`dist`, `build`, `coverage`, `.next`, and similar), lockfiles, binaries, minified bundles, and files larger than 128KB (files over about 1.5MB are not even listed).

Secret-like files are never sent. That includes `.env` and `.env.*`, private keys (`*.pem`, `*.key`, `*.p12`, `id_rsa`, and similar), credential files, `.npmrc`, `.netrc`, and paths under `.ssh`, `.aws`, `.gnupg`, or `secrets/`. A file whose contents look like a private key is dropped even if the name is ordinary. The model prompt uses relative paths and a basename for the project, not your home directory. The terminal summary can list skipped secret paths so you can see what was held back. Those paths are not part of the prompt.

The prompt is a file tree, detected signals (frameworks, colors, fonts, CSS variables), and excerpts from manifests, config, styles, and source, capped by `--max-bytes`.

## Develop

```bash
npm install
npm run check
```

`npm run check` typechecks, lints, runs the tests, and builds `dist/`. Tests cover the crawler (directory boundary, gitignore, secret exclusion, symlinks) and doc writing with a fake model. They do not call the network.

```bash
npm test
npm run typecheck
npm run lint
npm run build
npm pack
```

`npm pack` runs the build first. The tarball contains `dist/`, `assets/`, the license, and this README.

## License

MIT. See [LICENSE](./LICENSE).
