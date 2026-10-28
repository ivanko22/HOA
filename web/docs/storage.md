# Document storage

Community OS never persists public file URLs in the database.

## Recorded fields

On `documents` (and future `import_batches`):

| Field | Purpose |
|-------|---------|
| `storage_provider` | `local` or `s3` |
| `storage_key` | Provider-relative object key |
| `original_filename` | User-facing name |
| `mime_type` | Content type |
| `byte_size` | Object size in bytes |

## Access path

1. Client requests `/api/documents/[id]/file` (authenticated + tenant-scoped).
2. Server loads metadata from Postgres.
3. Server reads bytes via `StorageProvider.getObject(storageKey)`.
4. Response streams the file (or, for S3 later, redirects to a short-lived signed URL).

## Providers

### `LocalStorageProvider` (`STORAGE_PROVIDER=local`)

- Root: `DOCUMENT_STORAGE_ROOT` (default `./storage/documents`)
- Suitable for local development only
- `getSignedUrl` returns `null` — always use the authenticated route

### `S3CompatibleStorageProvider` (`STORAGE_PROVIDER=s3`)

- Interface prepared for S3 / R2 / MinIO
- Implementation throws until configured for staging/production
- Required env: `S3_BUCKET`, `S3_REGION`, credentials, optional `S3_ENDPOINT`

## Switching providers

Set `STORAGE_PROVIDER` per environment. Existing rows keep their `storage_provider` + `storage_key`; do not rewrite keys when changing the default provider for new uploads.
