# bjj-notes

Dictate BJJ notes on your phone after training, keep them in a Google Sheet, search them instantly
and ask questions that get answered from your own notes. The Run tab is a running coach: send
Strava screenshots after a run and get a reply and an adjusted plan.

- **App:** static files on GitHub Pages (`index.html`, `src/`). No build, no dependencies.
- **Data:** a Google Sheet, reached only through the Apps Script in `apps-script/Code.gs`. The
  notes tab is append-only through it.
- **Brains:** a Claude Code routine that runs twice a day. It files dictated notes into the sheet,
  answers questions, coaches runs (`COACH.md`), and works through `BACKLOG.md` one item per run.
  Its instructions are in `CLAUDE.md`.

Why it's built like this: `DECISIONS.md`.

## Setup

1. Paste `apps-script/Code.gs` into the sheet's Extensions > Apps Script, run `setup`, deploy as a
   web app (execute as you, access anyone), and put the web app URL in `App · Setup!B3`.
2. Open the phone link from `App · Setup!B4` on your phone and add it to the home screen.
3. Give the routine `BJJ_API_URL` and `BJJ_AGENT_TOKEN` (from `App · Setup!B5`) in its cloud
   environment, with network access to `script.google.com` and `script.googleusercontent.com`.

## Tests

```
node --test test/*.test.mjs
```

Fixtures are synthetic. Real notes never go in this repo.
