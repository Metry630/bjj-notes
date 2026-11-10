# Backlog

Top unchecked item first. One per run. Split anything that won't fit in a run.
His requests (from `App · Feedback`) always go above your own items.

## Up next

- [x] **Tidy the nav bar and collapse the coach log** (he asked, 9 Nov). Shipped 0.8.0. Reading chosen: four tabs
      plus a More menu (Stats, Home); the coach log on Run is a collapsible section.
- [x] **Test mode for recordings** (he asked, 8 Nov). Shipped 0.7.3. Reading chosen: a "Test" switch on the record
      screen; a recording saved with it on is marked as a test and never filed to Sheet1. Cancel
      while uploading already exists, so keep it and make it easy to find.
- [x] **Fix Stop and save on the record screen** (he asked, 4 Nov). Shipped 0.4.3. Likely cause:
      the phone ends the recording (lock, call) and stop never finished. Part 2 is the usability item.
- [x] **Voice recording usability** (he asked, 4 Nov). Shipped 0.4.5 (pause, screen stays awake, cancel confirm). Recording is clumsy to use, he would rather
      type in the sheet. Reading chosen: review the whole record flow (start, pause, stop, save,
      feedback on screen, errors) and remove friction, keeping the old way working.
- [x] **Date picker defaults to today** (he asked, 3 Nov). Shipped 0.4.2.
- [x] **File the 3 Nov notes** (he asked, 3 Nov). Done 7 Nov after the v3 script went live: 14
      tips in his own 3/11/26 row, GB SG filled for sessions since October and added to the Location
      dropdown, the four date-only rows removed.
- [x] **Multi-recording sessions** (he asked, 3 Nov). Shipped 0.5.0: record as many clips as you
      like (pause/continue inside a clip too); each day's clips show as one card and `file-session`
      puts them into that day's single row with the hours counted once.
- [x] **Stats: topics, not filler words** (he asked, 3 Nov). Shipped 0.4.1: curated list of guards,
      positions and techniques counted per gym.
- [x] **Analysis page, part 2: fun facts only** (part 1 shipped in 0.4.0; part 2 shipped 0.5.1)
      Original request: (he asked, 2 Nov). New screen: hours per gym, most common keywords per gym,
      fun facts (longest streak, busiest month, most drilled topic, etc.). Reading chosen: every
      session since 1 October of the latest year counts as the gym he named for that period, as a
      display rule in the app only (Sheet1 rows are never edited). Ship as part 1 (hours and
      keywords per gym), then fun facts as part 2.
- [x] **Clean up test items** (he asked, 2 Nov). Done 6 Nov: test notes and test runs hidden.
      Sheet1 had four date-only 3/11/26 rows from the old save bug; removed with `prune-row`
      once the 0.5.0 script is live.
- [x] **Topic browser** (he asked, 1 Nov). Shipped 0.6.0 as topic chips on Search. A Topics list in the app, most tips first; tapping one
      shows the summary and the matching tips with dates. Add a topic filter on Search.
- [x] **Topic index, part 2d.** Shipped 0.6.1: 4 more topics (35 in total). From then on, each run refreshes only
      the topics that newly filed notes touch.
- [x] **Search synonyms from his notes.** Shipped 0.7.4. Grow `ALIASES` in `src/search.js` from the spellings he
      actually uses (e.g. halfguard / half guard, sidecontrol, backtake), with tests.
- [x] **Pull to refresh and a sync indicator** on every screen. Shipped 0.9.0.

## Later

- [ ] "Before class" screen: his last 3 sessions plus one older topic to review. Ask first
      (`App · Decisions`), since it adds a screen he didn't request.
- [ ] Monthly hours and sessions on Home.

## Done

- [x] v0.7.0: Run tab, a running coach (Strava screenshots, replies, plan, ladder, guide).

- [x] v0.3.0: Record button (voice notes transcribed by Whisper in the runs, free per use),
      accuracy rating for typed vs recorded notes, Run now button, decision buttons on Home.
- [x] v0.2.1-0.2.4: Topic index, parts 1-2c (31 topics with summaries, shown first in Search).
- [x] v0.2.0: Offline-safe saving (service worker, queued notes).
- [x] v0.1.0: Log (dictation box, draft kept on the phone), Search (instant keyword search),
      Ask (questions answered at the next run), Home (last run, needs-you, mode, feedback).
