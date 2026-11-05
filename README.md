# Diligence Agent

AI platform that tests investment thesis claims through AI-run voice interviews.

The repo has two parts:
- **Backend** (repo root): Express server on port 3000. Holds all API keys and talks to Boson AI and Anthropic.
- **Frontend** (`frontend/`): React app (Vite + TanStack). Sends `/api/*` requests to the backend through the Vite proxy.

## Requirements

- Node 22+ and npm
- [Bun](https://bun.sh) (for the frontend)

## Run locally

**1. Backend**

```sh
npm install
cp .env.example .env    # then fill in your keys
npm run dev             # http://localhost:3000
```

**2. Frontend** (in a second terminal)

```sh
cd frontend
bun install
bun run dev             # open the local URL Vite prints
```

Keep both running. The frontend forwards `/api/*` to `localhost:3000`.

## API keys (`.env`)

| Key | Used for | Needed for UI work? |
|---|---|---|
| `DATABASE_URL` | Supabase Postgres: projects, interviews, transcripts, claims, evidence | Yes: projects load from it |
| `BOSON_API_KEY` | Live voice interviews | Only to test a real call |
| `ANTHROPIC_API_KEY` | Opening questions, findings, next-round planning, live question updates | Only for real AI output |
| `LIVEKIT_*` | Optional avatar | No |

Ask the team for keys. Never commit `.env`.

## Working on the UI only

You can change most of the UI with only `DATABASE_URL` set:
- Projects are stored in Supabase (schema in `supabase/migrations/`). Run the SQL once per Supabase project: paste it into the SQL editor, or `supabase db push`
- Click **Load sample projects** on the home page (or in Settings) to get demo data
- Pages live in `frontend/src/routes/`, shared components in `frontend/src/components/`

## Tests and checks

```sh
# backend (repo root)
npm test
npm run typecheck

# frontend
cd frontend
bun run test
bun run build
```

CI runs the same checks on every push and pull request.

## Deployed setup

The two parts deploy separately: the backend as a Node web service (`npm ci`, then `npm start`; it reads `PORT`), the frontend as a Cloudflare Worker named `diligence-frontend` (`bun run build`, then `npx wrangler deploy` in `frontend/`). Two settings connect them:

| Setting | Where | Value |
|---|---|---|
| `VITE_API_URL` | Frontend build environment | The backend's address, e.g. `https://diligence-api.onrender.com`. Built into the pages, so changing it needs a rebuild |
| `FRONTEND_ORIGIN` | Backend environment | The frontend's address, e.g. `https://diligence-frontend.<subdomain>.workers.dev`, without a trailing slash. Only this site may call the API from a browser |

Leave both unset locally: the Vite proxy keeps everything on one address.

Every push to `main` deploys both once the checks pass (the `deploy` job in `.github/workflows/ci.yml`). It needs three repository secrets: `RENDER_DEPLOY_HOOK_URL`, `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. To redeploy without a new commit, run the CI workflow on `main` from the Actions tab.
