# Backlog

Top unchecked item first. One per run. Split anything that won't fit in a run.
His requests (from `App · Feedback`) always go above your own items.

## Up next

- [ ] **Topic browser** (he asked, 1 Nov). A Topics list in the app, most tips first; tapping one
      shows the summary and the matching tips with dates. Add a topic filter on Search.
- [ ] **Topic index, part 2d.** Cover the remaining topics. From then on, each run refreshes only
      the topics that newly filed notes touch.
- [ ] **Search synonyms from his notes.** Grow `ALIASES` in `src/search.js` from the spellings he
      actually uses (e.g. halfguard / half guard, sidecontrol, backtake), with tests.
- [ ] **Pull to refresh and a sync indicator** on every screen.

## Later

- [ ] "Before class" screen: his last 3 sessions plus one older topic to review. Ask first
      (`App · Decisions`), since it adds a screen he didn't request.
- [ ] Monthly hours and sessions on Home.

## Done

- [x] v0.3.0: Record button (voice notes transcribed by Whisper in the runs, free per use),
      accuracy rating for typed vs recorded notes, Run now button, decision buttons on Home.
- [x] v0.2.1-0.2.4: Topic index, parts 1-2c (31 topics with summaries, shown first in Search).
- [x] v0.2.0: Offline-safe saving (service worker, queued notes).
- [x] v0.1.0: Log (dictation box, draft kept on the phone), Search (instant keyword search),
      Ask (questions answered at the next run), Home (last run, needs-you, mode, feedback).
