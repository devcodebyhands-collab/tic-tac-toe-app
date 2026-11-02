# Tic-Tac-Toe API server

Node.js 24 backend for the tic-tac-toe app. It uses only Node built-ins — no
Express or third-party packages.

## Run

```bash
cd server
npm start
```

The API listens on `PORT` (default `3000`) at `/api`. A `GET /api/health`
endpoint (also `/health`) returns `{ "ok": true, "status": "ok" }`.

## Test

```bash
cd server
npm test
```

Tests use `node:test`, `fetch`, and a temporary JSON store, and require no
network access or external services.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `HOST` | `0.0.0.0` | Bind address |
| `STORE_PATH` | `server/data/store.json` | JSON persistence file |
| `ADMIN_EMAILS` | _(empty)_ | Comma-separated emails promoted to the admin role on signup/login |
| `CORS_ORIGIN` | _(reflect request origin)_ | Comma-separated allowed frontend origins |
| `COOKIE_SECURE` | `0` | Set to `1` to add `Secure` to the session cookie (use behind HTTPS) |

Sessions are `HttpOnly`, `SameSite=Lax` cookies and last seven days. Passwords are
hashed with scrypt. No passwords are hardcoded anywhere, including demo seed data
(there is no seed data).

## Endpoints

All routes are under `/api` unless noted.

- `POST /auth/signup` — `{ email, password, displayName? }`
- `POST /auth/login` — `{ email, password }`
- `POST /auth/logout`
- `GET /auth/me`
- `POST /games` — `{ opponent?: "computer" | "human" }`
- `GET /games` — the signed-in player's games, newest first
- `GET /games/:id` — own games only
- `POST /games/:id/moves` — `{ cell: 0-8 }`
- `GET /leaderboard` — public top 50 by wins, ties broken by fewer losses
- `GET /admin/stats` — admin only, 30-day window
- `GET /health` — public liveness check

Games are server-authoritative. The player is `X`; in computer games the server
answers immediately as `O`. In `human` games the signed-in player controls both
symbols for local hot-seat play. Finished games reject further moves with `409
invalid_move`.
