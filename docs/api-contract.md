# API Contract — Tic-Tac-Toe v1

Base URL: `/api`. All requests/responses are JSON; auth via `session` cookie.
Times are ISO 8601 UTC. Board is a 9-cell array: `null` | `"X"` | `"O"`.

## Endpoints
| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/games` | player | Create a game; returns game state and your symbol |
| GET | `/games/:id` | player | Get game state (own games only) |
| POST | `/games/:id/moves` | player | Submit a move `{ "cell": 0-8 }` |
| GET | `/leaderboard` | public | Top 50 players by wins |
| GET | `/admin/stats` | admin | Aggregate usage statistics |

## Create game — `POST /games`
Request: `{ "opponent": "computer" }` (`"human"` optional; default `"computer"`)
```json
201
{ "id": "g_7f3a", "board": [null,null,null,null,null,null,null,null,null],
  "turn": "X", "you": "X", "status": "active", "winner": null,
  "createdAt": "2026-11-02T10:00:00Z" }
```

## Get game — `GET /games/:id`
```json
200
{ "id": "g_7f3a", "board": ["X",null,"O",null,"X",null,null,null,null],
  "turn": "O", "status": "active", "winner": null,
  "players": { "X": "u_1", "O": "computer" },
  "moves": [{ "cell": 0, "symbol": "X", "at": "2026-11-02T10:00:05Z" }] }
```
`404 not_found` if the game does not exist or belongs to another player.

## Submit move — `POST /games/:id/moves`
Request: `{ "cell": 4 }`
```json
200
{ "id": "g_7f3a", "board": ["X",null,"O",null,"X",null,null,null,null],
  "turn": "X", "status": "won", "winner": "X" }
```
`409 invalid_move` when the cell is occupied, out of range, or the game is finished.

## Leaderboard — `GET /leaderboard`
```json
200
{ "updatedAt": "2026-11-02T10:00:00Z",
  "entries": [
    { "rank": 1, "playerId": "u_1", "displayName": "ada", "wins": 42, "losses": 7, "draws": 3 },
    { "rank": 2, "playerId": "u_9", "displayName": "linus", "wins": 39, "losses": 9, "draws": 1 }
  ] }
```

## Admin stats — `GET /admin/stats`
```json
200
{ "totals": { "games": 1280, "players": 214, "finished": 1102 },
  "results": { "xWins": 540, "oWins": 502, "draws": 60 },
  "windowDays": 30 }
```
`403 forbidden` for non-admin sessions.

## Error shape
All errors use the same envelope; `code` is stable and machine-readable.
```json
{ "error": { "code": "invalid_move", "message": "Cell 4 is already occupied.",
  "field": "cell" } }
```
| Status | Code | Meaning |
|---|---|---|
| 400 | `invalid_request` | Malformed body or missing field |
| 401 | `unauthenticated` | No valid session |
| 403 | `forbidden` | Authenticated but not allowed |
| 404 | `not_found` | Unknown game or resource |
| 409 | `invalid_move` | Move violates game rules |
| 429 | `rate_limited` | Too many requests |

## Local-mode fallback (GitHub Pages)
Static hosting has no backend. When `window.__API_BASE__` is unset (or
`?mode=local` is present), the client uses a bundled `LocalAdapter` instead of
`fetch`, with the same shapes:
- Game state is persisted in `localStorage` under `ttt:games`; IDs are `local_<n>`.
- Move validation, win/draw detection, and the computer opponent run in the browser.
- `GET /leaderboard` returns entries derived from local games only; `GET /admin/stats`
  returns `{ "error": { "code": "forbidden", ... } }` because local mode has no admin.
- The UI shows a "Local mode — progress saved on this device" banner.
