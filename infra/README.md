# infra/

Provisions Cloudflare Pages + DNS + Zero Trust Access for this project.
Full docs: [not404-terraform README](../README.md) *(or wherever the shared module lives)*.

---

## Setup

### 1. Set fields in `main.tf`

| Field | What to set |
|---|---|
| `project_name` | URL slug — becomes `<name>.not404.uk` |
| `enable_access` | `true` to require OTP login, `false` for a public site |
| `allowed_emails` | Who can access it — only needed when `enable_access = true`, e.g. `["@adobe.com"]` |
| `dist_folder` | Build output path — `../dist` (Vite), `../out` (Next.js), `../build` (CRA) |
| `functions_folder` | Uncomment if project has a `functions/` directory |

### 2. Build the project

```bash
# from the project root
npm run build
```

### 3. Run install.sh

```bash
chmod +x infra/install.sh   # first time only
./infra/install.sh
```

**What it does:**
1. Runs `terraform init` if not yet initialised
2. Runs `terraform apply` — provisions/updates Pages project, DNS, and Access policy
3. Runs `wrangler pages deploy` — uploads the build output (and functions if configured)

Re-run after every build to redeploy.
