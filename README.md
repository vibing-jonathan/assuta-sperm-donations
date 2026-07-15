# Sperm Donation Candidates

Administrative and client applications for managing and reviewing sperm donor candidates.

## Repository status

The project is being built as a monorepo:

- `apps/admin-web` — Hebrew, RTL administrative web application.
- `apps/mobile` — future React Native client application.
- `services/api` — FastAPI application and protected integrations.
- `supabase` — database migrations and local Supabase configuration.

## Local secrets

Copy future `.env.example` files to `.env` and fill in values locally. Environment files are ignored by Git. Never commit Supabase database credentials, Supabase secret keys, Gemini API keys, or Google API keys.

## Google Stitch MCP

The repository configures Stitch in `.codex/config.toml` without storing its API key. Set a fresh `STITCH_API_KEY` in the environment that launches Codex, then restart Codex so the MCP server is loaded.

The key must be supplied through the `X-Goog-Api-Key` header. Do not put the key directly in `.codex/config.toml`.

## Development

Install dependencies:

```powershell
npm.cmd install
uv sync --directory services/api --all-groups
```

Run the Hebrew admin web app:

```powershell
npm.cmd run dev:admin
```

Run the FastAPI service:

```powershell
uv run --directory services/api uvicorn app.main:app --reload
```

The API health endpoint is `http://localhost:8000/api/health`, and its local OpenAPI UI is available at `http://localhost:8000/api/docs`.
