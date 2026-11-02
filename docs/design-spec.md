# Design Spec — Tic-Tac-Toe Web App (v1)

Sources: `docs/PRD.md`, `docs/api-contract.md`, `README.md`. Scope: UX/UI only; no application code.
Principles: server-authoritative state, one primary action per screen, mobile-first, legible at a glance.

## 1. UX flows

1. **Sign up/in** — Land on auth → enter email/password → validate inline → submit → success goes to Game (or History if a return path exists); errors show a form alert, not a toast only.
2. **New game** — Game screen `New game` → choose Computer (default) or Human → `POST /games` → loading skeleton → board with your symbol and whose turn it is.
3. **Play** — Tap/click an empty cell → optimistically mark it “pending” → send `{cell}` → success replaces board; `invalid_move` reverts and shows the error; finished game disables all cells.
4. **Result** — On `status: won|draw`, show inline result panel (You win / You lose / Draw), confetti-free, score updates, primary `Play again`, secondary `View history`.
5. **History** — `History` → list finished games newest first (opponent, result, date, final board thumbnail) → row opens read-only game detail; empty state links to `New game`.
6. **Leaderboard** — Public `Leaderboard` → ranked table (rank, player, W-L-D) → your row highlighted and pinned if outside top 50; unauthenticated users see a `Sign in to play` CTA.
7. **Admin stats** — Admin-only `Admin` nav → `GET /admin/stats` → totals, result split, 30-day window and updated time; `403` redirects to Game with an error toast; never expose admin nav to players.
8. **Local mode** — If `?mode=local` or `__API_BASE__` is unset, show the persistent local-mode banner, hide admin, and label leaderboard data as “on this device”.

## 2. Wireframes

### Auth (desktop and mobile)
```
Desktop (≥768)                             Mobile (<768)
┌───────────────────────────────┐          ┌───────────────────┐
│ Tic-Tac-Toe          Sign in  │          │ Tic-Tac-Toe    🌙 │
│    ┌───────────────────────┐  │          │ ┌───────────────┐ │
│    │ Sign in               │  │          │ │ Sign in       │ │
│    │ Email    [_________]  │  │          │ │ Email         │ │
│    │ Password [_________]  │  │          │ │ [___________] │ │
│    │ [ Sign in           ] │  │          │ │ Password      │ │
│    │ New? Create account   │  │          │ │ [___________] │ │
│    └───────────────────────┘  │          │ │ [ Sign in   ] │ │
└───────────────────────────────┘          │ │ Create account│ │
                                           │ └───────────────┘ │
                                           └───────────────────┘
```

### Game (desktop and mobile)
```
Desktop (≥768)                                  Mobile (<768)
┌─────────────────────────────────────────┐     ┌───────────────────┐
│ Tic-Tac-Toe  Play  History  Leaderboard │     │ ☰ Tic-Tac-Toe  🌙 │
│                                         │     │ You: X  Turn: X   │
│ You are X · Your turn        Score 2–1  │     │ Score        2–1  │
│       ┌─────┬─────┬─────┐               │     │ ┌─────┬─────┬───┐ │
│       │  X  │     │  O  │               │     │ │  X  │     │ O │ │
│       ├─────┼─────┼─────┤   Game g_7f3a │     │ ├─────┼─────┼───┤ │
│       │     │  X  │     │   [New game]  │     │ │     │  X  │   │ │
│       ├─────┼─────┼─────┤   [History]   │     │ ├─────┼─────┼───┤ │
│       │  O  │     │     │               │     │ │  O  │     │   │ │
│       └─────┴─────┴─────┘               │     │ └─────┴─────┴───┘ │
│ Status: X wins!   [Play again]          │     │ X wins! [Again]   │
└─────────────────────────────────────────┘     └───────────────────┘
```

### Admin stats (desktop and mobile)
```
Desktop (≥768)                                  Mobile (<768)
┌─────────────────────────────────────────┐     ┌───────────────────┐
│ Tic-Tac-Toe  Admin stats       Sign out │     │ ☰ Admin stats  🌙 │
│ Last 30 days          Updated 10:00 UTC │     │ Last 30 days      │
│ ┌─────────┬─────────┬──────────┐        │     │ ┌───────┬───────┐ │
│ │ Games   │ Players │ Finished │        │     │ │ Games │Players│ │
│ │ 1,280   │ 214     │ 1,102    │        │     │ │ 1,280 │ 214   │ │
│ └─────────┴─────────┴──────────┘        │     │ └───────┴───────┘ │
│ Results  X 540 · O 502 · Draws 60       │     │ Finished: 1,102   │
│ X ██████████ 49%  O ████████ 45%  D 6%  │     │ X 540 O 502 D 60  │
└─────────────────────────────────────────┘     └───────────────────┘
```

## 3. Design tokens (CSS variables)

**Color — light:** `--bg #F8FAFC`, `--surface #FFFFFF`, `--surface-2 #F1F5F9`, `--text #0F172A`, `--muted #64748B`, `--border #CBD5E1`, `--brand #2563EB`, `--brand-hover #1D4ED8`, `--x #2563EB`, `--o #B45309`, `--success #15803D`, `--warning #B45309`, `--danger #B91C1C`, `--focus #1D4ED8`.
**Color — dark:** `--bg #0B1220`, `--surface #111C2E`, `--surface-2 #172337`, `--text #E2E8F0`, `--muted #94A3B8`, `--border #334155`, `--brand #60A5FA`, `--brand-hover #93C5FD`, `--x #7DD3FC`, `--o #FBBF24`, `--success #4ADE80`, `--warning #FBBF24`, `--danger #F87171`, `--focus #93C5FD`.
Dark theme follows `prefers-color-scheme` by default and the header toggle overrides it (persisted in `localStorage`).
**Typography:** `Inter, ui-sans-serif, system-ui, sans-serif`; scale 12/16, 14/20, 16/24, 20/28, 28/36, 40/48 (size/line-height). Weights 400/600/700; scores use `font-variant-numeric: tabular-nums`.
**Spacing:** 4px base — 4, 8, 12, 16, 24, 32, 48, 64. Page gutters 16 mobile / 24 tablet / 32 desktop.
**Radii:** 6 (inputs, small), 10 (buttons, cards), 16 (panels), 999 (pills/avatars).
**Shadows:** `sm 0 1px 2px rgb(15 23 42 / .08)`, `md 0 8px 24px rgb(15 23 42 / .12)`, `focus 0 0 0 3px color-mix(in srgb, var(--focus) 35%, transparent)`.

## 4. Components and states

- **Buttons** — primary (brand fill), secondary (surface + border), ghost (nav), danger (destructive). States: default, hover, active, `:focus-visible`, disabled, loading (spinner + label, `aria-busy`); min height 44px.
- **Inputs** — visible label, 44px min height, helper text, error text + `aria-invalid` + `aria-describedby`; password reveal control with accessible name.
- **Board cells** — 1:1, 44px min touch target, large X/O glyph; empty, hover/focus preview, pending (50% opacity), disabled, winning (2px accent outline + subtle fill). Never rely on color alone.
- **Status/score** — “You are X”, turn indicator, score W–L–D; result panel uses heading + icon + text.
- **Empty** — icon, one-line explanation, primary CTA (e.g. “No games yet — start one”).
- **Loading** — skeletons matching final layout; text `Loading…` with `aria-busy`; no full-page spinner.
- **Error** — inline alert with stable API `code`, human message, retry where safe; 401 redirects to auth, 404 offers Game.
- **Toast** — bottom center mobile / bottom right desktop, max 1 line + action, auto-dismiss 5s, pause on hover/focus, `role="status"`.
- **Local-mode banner** — sticky under header, neutral info style: “Local mode — progress saved on this device.”

## 5. Accessibility

- WCAG 2.2 AA: text contrast ≥ 4.5:1, large text/UI ≥ 3:1; verify tokens in both themes.
- Visible focus on every interactive element: 2px solid `--focus` + 3px soft ring; never `outline: none` without replacement.
- Board keyboard play: cells in a `grid` with roving tabindex; arrow keys move, Home/End jump, Enter/Space play; focus returns to board after a move.
- `aria-live="polite"` status region announces turn changes, results, and computer moves; errors use `role="alert"`.
- Use `X`/`O` text plus shape/outline, not color alone; label cells “Row 1, column 1, empty”.
- `prefers-reduced-motion`: remove slide/scale/confetti; keep ≤150ms opacity changes; no flashing.

## 6. Responsive behavior

- **<480px** — single column, 16px gutters, hamburger nav, board fills width (max 420px), sticky status above board.
- **480–767px** — single column with 24px gutters; board centered; admin cards 2-up.
- **768–1023px** — app shell with left nav rail, game board + side panel, admin 3-up metrics.
- **≥1024px** — max-width 1120px centered, 12-column grid, game board 420–480px, history/leaderboard tables full width.
- Tables scroll horizontally below 640px; no horizontal page scroll; text reflows at 320px / 200% zoom.

## 7. Handoff checklist for Kai

- [ ] Create `tokens.css` with the variables above; wire light/dark toggle and persistence.
- [ ] Build primitives: Button, Input, Alert, Toast, Skeleton, Modal; document variants/states.
- [ ] Build Board/Cell with keyboard model, pending/winning states, and live status.
- [ ] Build app shell: header, responsive nav, local-mode banner, auth guard, admin guard.
- [ ] Build screens: Auth, Game, Result panel, History, Leaderboard, Admin stats, error/empty/loading variants.
- [ ] Map API errors (`invalid_request`, `unauthenticated`, `forbidden`, `not_found`, `invalid_move`, `rate_limited`) to UI copy.
- [ ] Verify at 320, 768, 1280px; keyboard-only; 200% zoom; light/dark; reduced motion.
- [ ] Confirm no admin entry point in local mode or for non-admin sessions.
- [ ] Review copy and spacing against this spec before PR; flag deviations, do not silently redesign.
