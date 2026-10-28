# Deployment environments

| Environment | Purpose | Database | Storage | Seed/demo |
|-------------|---------|----------|---------|-----------|
| `local` | Developer machines | Local Postgres | `local` filesystem | Allowed when `ALLOW_DEMO_SEED=true` |
| `staging` | Pre-production validation | Dedicated staging DB | S3-compatible | **Forbidden** |
| `production` | Live communities | Production DB | S3-compatible | **Forbidden** |

Set `APP_ENV=local|staging|production`.

## Rules

1. Staging and production **must not** use seed/demo databases or demo passwords as defaults.
2. `npm run db:seed` refuses to run when `APP_ENV` is `staging` or `production`.
3. Document uploads go through `StorageProvider`; never store public URLs.
4. Auth secrets (`AUTH_SECRET`) and object-storage credentials are environment-injected — never committed.

## Required variables

See `.env.example` for the full list. Minimum for a deploy:

- `APP_ENV`
- `DATABASE_URL`
- `AUTH_SECRET`
- `AUTH_URL`
- `STORAGE_PROVIDER` (`s3` for staging/production)
- S3 variables when using object storage

## Migrations

Local / self-hosted Postgres:

```bash
npm run db:migrate
```

**Netlify Database:** committed SQL under `web/netlify/database/migrations/` is applied automatically on deploy when `@netlify/database` is installed. Do not run `drizzle-kit migrate` against `NETLIFY_DB_URL`.

Do not run seed against shared staging/production. On an empty production database, open `/login` and use **Create first admin** (only available when `users` is empty).

## Netlify

The app lives in `web/`. Root `netlify.toml` sets `base = "web"`, `publish = ".next"`, and explicitly enables `@netlify/plugin-nextjs` (OpenNext adapter).

A healthy deploy summary must show **Netlify Functions** for the Next.js server handler. If the deploy says “No functions deployed” and only uploads `.next` HTML assets, every route will 404 — the adapter did not run.

In the Netlify UI, set at least:

- `APP_ENV=production` (or `staging`)
- `DATABASE_URL`
- `AUTH_SECRET`
- `AUTH_URL=https://<your-site>.netlify.app` (or custom domain)
- `STORAGE_PROVIDER=s3` plus S3 credentials for real uploads

After env vars are set, trigger a clear cache and redeploy. `/` should redirect to `/login` or `/app`, not Netlify’s static “Page not found”.
