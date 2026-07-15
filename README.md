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

## Google Stitch MCP

The repository configures Stitch in `.codex/config.toml` without storing its API key. `STITCH_API_KEY` must be present in the operating-system environment that launches Codex; a project `.env` file is not automatically loaded by the MCP host. Restart Codex after setting it.

## Sensitive local files

The local `.env`, donor PDF sources, uploads, and private files are excluded from Git. The Gemini key must never be exposed through a `VITE_` variable or browser code; the future PDF extraction flow will use a protected Firebase backend and Secret Manager.
