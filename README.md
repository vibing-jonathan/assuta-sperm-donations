# Sperm Donation Candidates

Hebrew administrative and client applications for managing and reviewing sperm donor candidates.

## Architecture

- `apps/admin-web` — React and TypeScript administrative web application with Hebrew RTL support.
- Firebase Authentication — administrator email/password sign-in.
- Cloud Firestore — donor records and future import metadata.
- Firestore Security Rules — server-enforced access for approved administrator accounts.
- `apps/mobile` — future React Native client application.

## Development

Install dependencies:

```powershell
npm.cmd install
```

Firebase CLI is installed with the project. Verify it with:

```powershell
npm.cmd run firebase:version
```

Run the admin web app:

```powershell
npm.cmd run dev:admin
```

Verify the project:

```powershell
npm.cmd run lint:admin
npm.cmd run test:admin
npm.cmd run build:admin
```

## Firebase

The public Firebase web configuration is stored in `apps/admin-web/src/lib/firebase.ts`. Firebase web API keys identify the application; authorization is enforced by Firebase Authentication and `firestore.rules`.

The allowed administrators are:

- `jgabbayj@gmail.com`
- `robieis153@gmail.com`

Both accounts must exist in Firebase Authentication. Email verification is not required; access is restricted by the exact email allowlist. Deploy `firestore.rules` before storing donor information.

Deploy Firestore rules and indexes:

```powershell
npm.cmd run firebase:deploy:firestore
```

### PDF imports and donor-number uniqueness

Approved PDF rows are committed in one Firestore transaction. Each imported donor writes a
`donorNumberClaims` document keyed by the normalized donor number, and the same claim mechanism is
used by manual donor creation. This prevents concurrent imports or manual additions from creating a
second donor with the same number. Deleting a donor also removes its matching claim.

The importer first parses the stable catalog table locally from PDF text coordinates. If its strict
header, column, or row confidence checks fail, it automatically falls back to the protected Gemini
Function. Both paths run through local, field-specific normalization before review: PDF line-aware
list reconstruction, canonical Hebrew punctuation and comma spacing, approved aliases, empty-token
removal, and duplicate removal. Remaining malformed list fields are reported as row-specific review
errors instead of being guessed by AI. Every approval writes an admin-only `donorImports` audit document with the source file
name, detected page range, extraction method, parser version, duration, fallback reason and Gemini
model when used, administrator, timestamp, counts, warnings, duplicate numbers, status, and outcome.
Failed transactions make a best-effort `failed/import_failed` audit
write without exposing diagnostic details. Imported donor documents reference a successful audit through `importId`.
The UI limits each approval to 249 new donors so donor documents, uniqueness claims, and the audit
record remain below Firestore's 500-write transaction limit.

## Google Stitch MCP

The repository configures Stitch in `.codex/config.toml` without storing its API key. `STITCH_API_KEY` must be present in the operating-system environment that launches Codex; a project `.env` file is not automatically loaded by the MCP host. Restart Codex after setting it.

## Sensitive local files

The local `.env`, donor PDF sources, uploads, and private files are excluded from Git. The Gemini key must never be exposed through a `VITE_` variable or browser code; the future PDF extraction flow will use a protected Firebase backend and Secret Manager.
