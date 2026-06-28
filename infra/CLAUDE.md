# infra/

Terraform root module for this project. Calls the shared Cloudflare module to provision
Pages + DNS + Zero Trust Access.

## What this provisions

- Cloudflare Pages project (`<project_name>-<hex>.pages.dev`)
- DNS CNAME: `<project_name>.not404.uk` → pages.dev
- Zero Trust Access OTP gate on `<project_name>.not404.uk`

## IMPORTANT — what you may and may not change in main.tf

`main.tf` is a copied template. Only the following four values should ever be changed:

| Variable | What to set |
|---|---|
| `project_name` | Short slug for the project — becomes the subdomain and Pages project prefix |
| `enable_access` | `true` (OTP-gated) or `false` (public site) |
| `allowed_emails` | List of allowed emails/domains — prefix domains with `@`, e.g. `["@adobe.com", "user@example.com"]`. Required when `enable_access = true`. |
| `dist_folder` | `abspath("${path.module}/../dist")` by default. Change `dist` to `out` (Next.js) or `build` (CRA) if needed. |

**Do not change anything else in main.tf.** The provider block, `data "external"`, `source`, and all other arguments are immutable boilerplate — editing them will break the module.

If the project has a `functions/` directory, uncomment the `functions_folder` line:

```hcl
functions_folder = abspath("${path.module}/../functions")
```

## IMPORTANT — what you may and may not change in wrangler.toml

`wrangler.toml` is a copied template. The following values should be changed:

| Field | What to set |
|---|---|
| `name` | Must match `project_name` from `main.tf` |
| `pages_build_output_dir` | `dist` by default. Change to `out` (Next.js) or `build` (CRA) to match `dist_folder` in `main.tf`. |

The commented-out binding blocks (`[[d1_databases]]`, `[[kv_namespaces]]`, `[[r2_buckets]]`)
can be uncommented and filled in if the project uses those Cloudflare resources.

**Do not change anything else in wrangler.toml.** `compatibility_date` and the file location
(`infra/wrangler.toml`) are immutable — do not move the file or rename it.

`install.sh` copies `wrangler.toml` to the project root before deploying and removes it
afterwards. Do not manually place a `wrangler.toml` at the project root — `install.sh` will
refuse to run if one is already there.

## Project structure

```
project/
├── src/                     # application source
├── functions/               # optional — Pages Functions / API routes
│   └── api/
│       └── hello.ts         # → accessible at /api/hello
├── public/                  # static assets
├── package.json
└── infra/                   # this folder
    ├── main.tf
    ├── wrangler.toml        # source of truth — copied to project root during deploy only
    ├── install.sh
    └── terraform.tfstate    # gitignored — do not delete
```

## Required env vars

```bash
CLOUDFLARE_API_TOKEN   # Cloudflare API token
CF_ACCOUNT_ID          # Cloudflare account ID
```

Add both to `~/.zshrc` (or equivalent) before running `install.sh`.

## Workflow

```bash
# First time — build the project, then:
chmod +x infra/install.sh   # first time only
./infra/install.sh          # runs terraform init + apply + wrangler deploy

# Re-deploy after code changes — build first, then:
./infra/install.sh
```

`install.sh` is idempotent. It handles `terraform init`, `terraform apply`, and
`wrangler pages deploy` in one step. Run it from the **project root**.

## Local dev with functions

```bash
# From project root — point wrangler at infra/wrangler.toml explicitly:
npx wrangler pages dev dist --config infra/wrangler.toml
```

## State

`terraform.tfstate` lives in `infra/` and is gitignored. Do not delete it — Terraform needs
it to manage updates and teardown.
