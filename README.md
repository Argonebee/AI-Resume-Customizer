# AI Resume Customizer

## Development

- Use Supabase CLI to serve Edge Functions locally.
- For frontend, open `home.html` directly or serve statically; set `window.SUPABASE_EDGE_URL` in `config.js` to the local functions URL.

## Production: Static site + Supabase (no server)

For production (e.g., GitHub Pages), this app is fully static and calls Supabase Edge Functions directly. No Node server is required in production.

- Configure `config.js` with your public Supabase values:
  - `window.SUPABASE_EDGE_URL = "https://<project-ref>.functions.supabase.co";`
  - `window.SUPABASE_ANON_KEY = "<your-public-anon-key>";`
  - Do not put private keys in the frontend.
- Or let GitHub Actions inject `config.js` from repo secrets `SUPABASE_EDGE_URL` and `SUPABASE_ANON_KEY`.

## Supabase Edge Functions

Endpoints mirrored as functions:
- POST `/api/customize` -> `supabase/functions/customize`
- POST `/api/keywords` -> `supabase/functions/keywords`
- POST `/api/suggestions` -> `supabase/functions/suggestions`
- GET `/api/diag` -> `supabase/functions/diag`

Environment variables (server and functions):
- `GEMINI_API_KEY` — required for all routes
- `GEMINI_MODEL` — optional, defaults to `gemini-2.0-flash`
- `SUPABASE_EDGE_URL` — optional; if set in the Node server, `/api/*` requests are proxied to Edge Functions

### Local development with Supabase CLI

1) Install Supabase CLI (Windows):
  - Follow: https://supabase.com/docs/guides/cli

2) Login and link your project:
  - `supabase login`
  - `supabase link --project-ref <your-project-ref>`

3) Set function secrets (Edge runtime):
  - `supabase functions secrets set GEMINI_API_KEY="<your-key>" GEMINI_MODEL="gemini-2.0-flash"`

4) Serve functions locally:
  - `supabase functions serve --env-file .env --no-verify-jwt`
  - By default functions are available at `http://localhost:54321/functions/v1/<name>`

5) Frontend local use:
   - Serve `home.html` with a simple static server or open directly in the browser.
   - Set `window.SUPABASE_EDGE_URL = "http://localhost:54321/functions/v1";` in `config.js` for local function calls.

### Deploy functions

- Deploy a function (example):
  - `supabase functions deploy customize`
  - `supabase functions deploy keywords`
  - `supabase functions deploy suggestions`
  - `supabase functions deploy diag`

- After deploy, configure the frontend via `config.js` or GitHub secrets. No server is required.

## GitHub Pages deployment

1) Add repository secrets (Settings > Secrets and variables > Actions):
   - `SUPABASE_EDGE_URL` = `https://<project-ref>.functions.supabase.co`
   - `SUPABASE_ANON_KEY` = your Supabase anon key
2) Enable Pages (Settings > Pages): set Source to “GitHub Actions”.
3) Push to `main`. Workflow `.github/workflows/pages.yml` publishes the static site and overwrites `site/config.js` from secrets if available.

## Troubleshooting

If you see "Upstream LLM error":

1) Verify your API key is loaded
- Ensure a `.env` file exists with:
  - `GEMINI_API_KEY=your-key-here`
- Restart the server after changing `.env`.

2) Diagnostics
- Call the `diag` function via: `${SUPABASE_EDGE_URL}/diag` (GET). If it returns non-OK, verify secrets and model access.

3) Common fixes
- Make sure the Generative Language API (Gemini) is enabled for your project.
- Confirm the model `gemini-2.0-flash` is available and your key has access.
- Ensure the server has outbound internet access.
- Double-check you aren't including huge payloads; trim input and retry.

## Note

- Node server is dev-only. In production (Pages), the app is static and uses Supabase directly via `config.js`.
- Edge Functions include CORS handling and mirror the existing request/response shapes, so no frontend changes are needed.
