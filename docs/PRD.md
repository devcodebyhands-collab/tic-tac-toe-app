# PRD — Tic-Tac-Toe Web App (v1)

## Overview
A web tic-tac-toe game with player accounts, persistent games, a leaderboard,
and a small admin backoffice for usage stats.

## Users
- **Player** — signs in, plays games against another player or the computer, tracks results.
- **Admin** — views aggregate usage and manages reported/abusive accounts.

## User Stories
1. As a player, I can start a new game and be assigned X or O, so I can play immediately.
2. As a player, I can submit a move and see the board update or be told the move is invalid, so the rules are enforced.
3. As a player, I can see the game result (win/loss/draw) and have it saved to my history, so my progress persists.
4. As a player, I can view a leaderboard ranked by wins, so I can compare myself with others.
5. As an admin, I can view stats (games played, active players, win/draw split), so I can monitor adoption.

## In Scope
- Email/password sign-up and sign-in with session cookie.
- Server-authoritative game state, win/draw detection, invalid-move rejection.
- Player game history and global leaderboard (top 50).
- Read-only admin stats page restricted to the admin role.
- Responsive UI usable on mobile and desktop.

## Out of Scope
- Real-time multiplayer matchmaking or websockets.
- Chat, friend lists, notifications, payments.
- OAuth/social login and password reset emails.
- Per-game replay analytics beyond the stored move list.

## Acceptance Criteria
1. A signed-in player can create a game and receives a game ID plus their symbol.
2. A legal move updates the board; an illegal move returns `400` with an error code and no state change.
3. The server detects and reports a win or draw, and rejects further moves on a finished game.
4. Finished games appear in the player's history and count once in the leaderboard.
5. The leaderboard returns the top 50 players by wins, with ties broken by fewer losses.
6. Non-admin users receive `403` from admin stats endpoints; admins see totals for games, players, and results.
