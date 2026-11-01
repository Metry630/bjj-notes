# Backlog

Top unchecked item first. One per run. Split anything that won't fit in a run.
Items marked (proposal) need a yes from him in `App · Feedback` before they're built.

## Up next

- [x] **Offline-safe saving.** (v0.2.0) A service worker caches the app shell so it opens with no signal.
      A note saved offline goes into a local queue (keep the client id, so retries never
      duplicate) and is sent when the phone is back online; the Log screen shows "queued" items.
- [x] **Topic index, part 1.** (v0.2.1) Create `App · Topics` (`id`, `topic`, `aliases`, `summary`,
      `sources`, `updated_at`). Tag every Sheet1 tip with one or more topics (positions, techniques,
      principles) and write a short summary per topic of what his notes say, in his language, with
      session dates. Start with the 15 topics with the most tips. Search already shows matching
      topic summaries first.
- [x] **Topic index, part 2a.** (v0.2.2) Six more topics (21 in total).
- [ ] **Topic index, part 2b.** Cover the remaining topics. From then on, each run refreshes only
      the topics that newly filed notes touch.
- [ ] **Topic browser.** A Topics list in the app (most tips first); tapping one shows the summary
      and the matching tips with dates. Add a topic filter on the notes list.
- [ ] **Search synonyms from his notes.** Grow `ALIASES` in `src/search.js` from the spellings he
      actually uses (e.g. halfguard / half guard, sidecontrol, backtake), with tests.
- [ ] **Pull to refresh and a sync indicator** on every screen.

## Later

- [ ] (proposal) Better voice dictation than the built-in phone keyboard (for example a speech-to-text service with a BJJ vocabulary). Adds a service and changes capture, so it needs a yes.
- [ ] (proposal) "Before class" screen: his last 3 sessions plus one older topic to review.
- [ ] (proposal) Monthly hours and sessions on Home.

## Done

- [x] v0.1.0: Log (dictation box, draft kept on the phone), Search (instant keyword search),
      Ask (questions answered at the next run), Home (last run, needs-you, mode, feedback).
