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

```bash
npm run db:migrate
```

Apply migrations before starting the app. Do not run seed against shared staging/production.
