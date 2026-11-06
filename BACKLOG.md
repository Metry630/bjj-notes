# Backlog

Top unchecked item first. One per run. Split anything that won't fit in a run.
His requests (from `App · Feedback`) always go above your own items.

## Up next

- [x] **Fix Stop and save on the record screen** (he asked, 4 Nov). Shipped 0.4.3. Likely cause:
      the phone ends the recording (lock, call) and stop never finished. Part 2 is the usability item.
- [x] **Voice recording usability** (he asked, 4 Nov). Shipped 0.4.5 (pause, screen stays awake, cancel confirm). Recording is clumsy to use, he would rather
      type in the sheet. Reading chosen: review the whole record flow (start, pause, stop, save,
      feedback on screen, errors) and remove friction, keeping the old way working.
- [x] **Date picker defaults to today** (he asked, 3 Nov). Shipped 0.4.2.
- [ ] **File the 3 Nov notes** (he asked, 3 Nov). Waiting for him to redeploy the 0.4.4 sheet script. Two recordings and one typed note are in the Inbox
      (transcribed, dated 3 Nov). Combine them into one Sheet1 row once the sheet's append works
      again (it errored on 4 Nov and left two empty 3/11/26 rows in Sheet1).
- [ ] **Multi-recording sessions** (he asked, 3 Nov). Let him record several voice notes in a row
      (pause, continue later) and send them as one session: record, keep, record, keep, then send.
      The kept parts are filed together as one Sheet1 row with the hours counted once. Reading
      chosen: a local "kept parts" list in the record screen, uploaded as inbox items with the same
      session date and location, hours only on the first. Until it ships, recordings with the same
      session date and location are already combined into one row by the run protocol.
- [x] **Stats: topics, not filler words** (he asked, 3 Nov). Shipped 0.4.1: curated list of guards,
      positions and techniques counted per gym.
- [ ] **Analysis page, part 2: fun facts only** (part 1 shipped in 0.4.0)
      Original request: (he asked, 2 Nov). New screen: hours per gym, most common keywords per gym,
      fun facts (longest streak, busiest month, most drilled topic, etc.). Reading chosen: every
      session since 1 October of the latest year counts as the gym he named for that period, as a
      display rule in the app only (Sheet1 rows are never edited). Ship as part 1 (hours and
      keywords per gym), then fun facts as part 2.
- [ ] **Clean up test items** (he asked, 2 Nov). Wait until the TEST recording (inbox id starting
      `4c23bbcf`) has been transcribed and its preview has been visible since at least the
      previous run. Then set `hidden: "yes"` on: every `App · Inbox` row with status `test`, the
      `App · Log` rows `run-20261031T1346` and every row with mode `manual` started on 2026-11-02,
      and make sure that recording's audio slices are cleared (`audio-done`). Check Sheet1 for
      rows that aren't real sessions (none known as of 2 Nov) and report, don't touch. Reply in
      the log when done.
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
