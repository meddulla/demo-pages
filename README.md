# Pages demo

A demo Cloudflare Pages site covering static assets, Pages Functions and
`_worker.js`. It deploys one Pages project in four variants, each to its own
branch:

| Variant | Command | Build output | What it exercises |
|---|---|---|---|
| `main` | `npm run deploy` | `dist/` | Production environment. Static files, `_headers`, `_redirects`, a 25 MiB file, upload ignore rules, Pages Functions and an `assets:` plugin route |
| `functions` | `npm run deploy:functions` | `dist/` | The same as `main`, in the preview environment |
| `worker-file` | `npm run deploy:worker-file` | `dist-worker-file/` | A `_worker.js` file that must be bundled. `functions/` exists but is skipped |
| `worker-dir` | `npm run deploy:worker-dir` | `dist-worker-dir/` | A `_worker.js/` directory with an extra module and a custom `_routes.json`. `functions/` is built but not deployed |

`wrangler.jsonc` sets `GREETING` to `production` or `preview`, so responses
show which environment config was used.

## Setup

```sh
npm install
export CLOUDFLARE_ACCOUNT_ID=<account id>
export CLOUDFLARE_API_TOKEN=<token with Cloudflare Pages: Edit>
npx wrangler pages project create pages-demo --production-branch main
npm run build
```

`npm run build` regenerates every `dist*/` folder. It writes the 25 MiB file
and the ignore-rule fixtures, which are not committed.
`npm run build:oversize` also writes `dist-oversize/`, which contains a file
one byte over the 25 MiB limit. Every tool must refuse to deploy it.

## Local preview

```sh
npm run build
npx wrangler pages dev dist                 # main/functions variant
npx wrangler pages dev dist-worker-file     # _worker.js file
npx wrangler pages dev dist-worker-dir      # _worker.js/ directory
node scripts/check.mjs --local functions http://localhost:8788
```

`pages dev` serves files from disk, so the upload ignore rules do not apply,
and it reads the top-level config, so `GREETING` is `top-level`. `--local`
skips the ignore-rule checks and expects that greeting.

## Wrangler commands

```sh
# pages project validate: silent on success
npm run validate
npx wrangler pages project validate dist-oversize   # must fail

# pages project upload: authenticated only by an upload JWT
export CF_PAGES_UPLOAD_JWT=$(curl -s \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/pages-demo/upload-token" \
  | node -e 'process.stdin.on("data", d => console.log(JSON.parse(d).result.jwt))')
npm run upload            # writes .wrangler/pages-manifest.json

# pages deploy
npm run deploy
npm run deploy:functions
npm run deploy:worker-file
npm run deploy:worker-dir
```

## Checking a deployment

```sh
node scripts/check.mjs <variant> <deployment-url>
```

With a third argument, the script also compares two deployments of the same
variant, for example the same build deployed by two different tools to two
branches. It reports status, final path, the demo headers, and a body hash.

```sh
npx wrangler pages deploy --branch functions
npx wrangler pages deploy --branch functions-2

node scripts/check.mjs functions \
  https://functions.pages-demo.pages.dev \
  https://functions-2.pages-demo.pages.dev
```

All non-`main` branches use the preview environment, so their greetings match.

## What each check expects

| Path | `main` / `functions` | `worker-file` | `worker-dir` |
|---|---|---|---|
| `/` | static index, `X-Demo-Headers`, `X-Demo-Middleware: root` | static index, no middleware header | static index, no middleware header |
| `/old-about` | 301 to `/about.html` | same | same |
| `/large/25mib.bin` | 25 MiB, SHA-256 matching `/large/25mib.bin.sha256` | same | same |
| `/.wrangler/ignored.txt`, `/nested/node_modules/ignored.txt` | not uploaded | same | same |
| `/nested/.wrangler/kept.txt` | uploaded (only the top-level `.wrangler` is ignored); report only | same | same |
| `/api`, `/api/hello`, `/api/users/42`, `/api/files/a/b/c`, `/api/banner` | Functions JSON or text | not Functions | not Functions |
| `/plugin-assets/hello.txt` | `plugin-asset-hello`, served by the `assets:` plugin | not the plugin | not the plugin |
| `/worker` | not checked | `{"variant":"worker-file"}` | `{"variant":"worker-dir","chunk":"worker-dir-chunk"}` |

Pages serves `index.html` for unknown paths when the site has no `404.html`.
The checks therefore test that a missing file's content is absent, not that
the status is 404.
