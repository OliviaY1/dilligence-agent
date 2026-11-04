# Diligence Agent

AI platform that tests investment thesis claims through AI-run voice interviews.

The repo has two parts:
- **Backend** (repo root): Express server on port 3000. Holds all API keys and talks to Boson AI, OpenAI and Anthropic.
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
| `BOSON_API_KEY` | Live voice interviews | Only to test a real call |
| `OPENAI_API_KEY` | Opening questions, findings, next-round planning | Only for real AI output |
| `ANTHROPIC_API_KEY` | Live question updates during a call | Only to test a real call |
| `LIVEKIT_*` | Optional avatar | No |

Ask the team for keys. Never commit `.env`.

## Working on the UI only

You can change most of the UI without any keys:
- Projects are stored in the browser (localStorage), so no database is needed
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
