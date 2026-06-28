terraform {
  required_version = ">= 1.5"
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.0"
    }
    null = {
      source  = "hashicorp/null"
      version = "~> 3.0"
    }
    external = {
      source  = "hashicorp/external"
      version = "~> 2.0"
    }
  }
}

provider "cloudflare" {
  # Reads CLOUDFLARE_API_TOKEN from environment
}

# Reads CF_ACCOUNT_ID from the environment — no TF_VAR_* needed
data "external" "cf_env" {
  program = ["bash", "-c", "jq -n --arg id \"$CF_ACCOUNT_ID\" '{account_id: $id}'"]
}

module "site" {
  source = "/Users/dominikforderreuther/work/data/cloudflare/not404-terraform"

  cloudflare_account_id = data.external.cf_env.result.account_id
  project_name = "dwddata"

  # Zero Trust Access OTP gate — remove or set enable_access = false to make the site public
  enable_access  = false
  allowed_emails = ["@example.com"]   # prefix domains with @, or list individual addresses

  # Resolves to the project root's dist/ regardless of where terraform is run from.
  # Change to "../out" for Next.js static export, "../build" for CRA.
  dist_folder = abspath("${path.module}/../dist")
  # Note: /api/* Pages Functions in ../functions are auto-discovered by
  # `wrangler pages deploy` (run from the project root by install.sh).
}
