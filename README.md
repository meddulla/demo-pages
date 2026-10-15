# Pages demo

Five independent Cloudflare Pages sites. Each directory under `sites/` is a
complete project with its own `wrangler.jsonc` and project name. Nothing is
shared. Four sites commit their output directory (`public/`) and have no build
step; `sites/vite` is built with Vite.

| Site | Project | What it exercises |
|---|---|---|
| `sites/static` | `demo-static` | Static files, `_headers`, `_redirects` and a 25 MiB file, the largest Pages accepts |
| `sites/functions` | `demo-functions` | Pages Functions: middleware, index, `[param]` and `[[catchall]]` routes, an env var, a text module import and an `assets:` plugin route |
| `sites/worker-file` | `demo-worker-file` | A `_worker.js` file that imports a module outside `public/`, so it must be bundled. Its `functions/` is skipped |
| `sites/worker-dir` | `demo-worker-dir` | A `_worker.js/` directory with an extra module and a custom `_routes.json`. Its `functions/` is built but not deployed |
| `sites/vite` | `demo-vite` | A build step: `npm ci` and `npm run build` (Vite 8.2.2) write `dist/`, which includes `public/` (`_headers`, `robots.txt`). The app uses dynamic `import()` with a shared chunk, CSS imported from several modules (one loaded lazily), a CSS `url()`, imported images (one small enough to be inlined), a JSON import and `import.meta.env` from `.env.production`. Stylesheets from npm packages: `@fontsource/inter` imported from JavaScript (its fonts are emitted as assets) and `modern-normalize` through a bare `@import`; a nested `@import` whose `url()` is resolved against its own file; a Google Fonts `@import url(https://…)`, which must end up at the top of the stylesheet; and an image imported through a `resolve.alias` (`@/mark.svg`). One Pages Function |

Each `wrangler.jsonc` with vars sets `GREETING` to `production` or `preview`,
so responses show which environment config was used.

`sites/static/public/large/25mib.bin` is the numbers 1, 2, 3, … one per line,
cut at 25 MiB. No chunk of it repeats, so a skipped, repeated or reordered
chunk in an upload changes its hash. Its SHA-256 is in `25mib.bin.sha256`.

## Setup

```sh
npm install
export CLOUDFLARE_ACCOUNT_ID=<account id>
export CLOUDFLARE_API_TOKEN=<token with Cloudflare Pages: Edit>
for site in static functions worker-file worker-dir vite; do
  npx wrangler pages project create demo-$site --production-branch main
done
```

## Deploying a site

The build sequence, from an empty directory:

```sh
git init
git remote add origin https://github.com/meddulla/demo-pages.git
git fetch origin <build-ref> --depth=1
git checkout <build-ref>
cd sites/<site>
wrangler pages project validate public
CF_PAGES_UPLOAD_JWT=<upload token> wrangler pages project upload public
wrangler pages deploy --branch <branch>
```

For `sites/vite`, build first and use `dist` as the directory:

```sh
cd sites/vite
npm ci
npm run build
wrangler pages project validate dist
CF_PAGES_UPLOAD_JWT=<upload token> wrangler pages project upload dist
wrangler pages deploy --branch <branch>
```

- `<build-ref>` can be a branch name or a full commit SHA. Checking out a SHA
  leaves no branch name, so pass `--branch` to choose the deployment branch.
- `pages project validate` and `pages project upload` require the directory
  argument. Only `pages deploy` reads `pages_build_output_dir`.
- `pages deploy` needs `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.
  `pages project upload` sends its requests with the project's upload token,
  but Wrangler still refuses to run without credentials (an API token or
  `wrangler login`). Fetch the upload token with:

  ```sh
  curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
    "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/demo-<site>/upload-token" \
    | node -e 'process.stdin.on("data", d => console.log(JSON.parse(d).result.jwt))'
  ```

## Local preview

```sh
cd sites/<site>
npx wrangler pages dev
```

`pages dev` reads the top-level config, so `GREETING` is `top-level`.

## Checking a deployment

```sh
node scripts/check.mjs <site> <deployment-url> [<compare-url>]
```

The checks expect a preview deployment. With a third argument, the script also
compares two deployments of the same site, for example the same commit
deployed by two different tools to two branches. It compares status, final
path, the demo headers and a body hash for every request. For files a build
tool generated (the Vite site's page and assets) it compares only status, path
and headers, and checks that every referenced asset is served.

```sh
node scripts/check.mjs functions \
  https://wrangler.demo-functions.pages.dev \
  https://other.demo-functions.pages.dev
```
