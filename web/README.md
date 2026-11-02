# Tic-Tac-Toe — local-first frontend

Static, dependency-free tic-tac-toe for GitHub Pages. Everything runs in the
browser: no build step, no backend, no accounts, and no network calls.

## Run locally

From the repository root:

```sh
cd web
python3 -m http.server 8080
```

Open <http://localhost:8080>. Any static file server works; the files can also
be opened directly, though a local server matches GitHub Pages more closely.

## Deploy to GitHub Pages

The app lives in `web/`. Publish that directory as the site root:

1. Run the checks in `web/` and commit the files.
2. Push to `main` (or merge a reviewed PR).
3. In **Settings → Pages**, choose **GitHub Actions** and use a workflow that
   uploads `web/` as the Pages artifact. Alternatively, copy the contents of
   `web/` to the root of a `gh-pages` branch and deploy that branch.

All asset paths are relative, so the site works at
`https://<owner>.github.io/<repo>/` without configuration.

## Data and scope

- Games, scores, history, and the local leaderboard are stored in
  `localStorage` under `ttt.local.v1`; the theme choice uses `ttt.theme`.
- **Admin** is a demo view computed from local games. It has no server access.
- **Reset all data** in the Admin tab clears local history and scores.
- The online API is **not wired yet**. This phase is local-only; do not expect
  sign-in, shared leaderboards, or server-side games.
