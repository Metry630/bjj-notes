# Backlog

Top unchecked item first. One per run. Split anything that won't fit in a run.
His requests (from `App · Feedback`) always go above your own items.

## Up next

- [x] **One-time check after the rework** (21 Nov). Run `node tools/check-public.mjs f0c1e9f` (the laptop
      session had no sheet token, so its pushes were checked for secrets only) and say in the log whether
      it passed. Result 22 Nov: flagged 1 line (tools/dev/fake.js:59, a synthetic numbers-only ladder fixture, likely a false match on digits). Once `ping` reports version 5, set `acted_at` on decision `dec-multi-activity` (the v5 paste replaces it).
- [ ] **Photos in a note** (from the rework, later). Script v5 already takes images on an Inbox item
      (`inbox_id`, `images`): add "Add a photo" to the capture card (handouts, whiteboards), reusing
      `shrink`/`imageBatches`, and read them when filing.
- [x] **Whole-week rework** (he asked, 21 Nov). Shipped 1.0.0 from a laptop session: six tabs, Today from his
      week, voice notes that can't be lost, the outbox, Lift sets, calmer coach log, Dance and Think, script v5.
- [x] **Lift tab fixes** (he asked, 20 Nov). Add bench press to the lift choices, and fix the lift dropdown
      so it is not too wide and too short (size it to fit its content and make it taller/easier to tap).
- [x] **Multi-activity revamp** (he asked, 19 Nov). Superseded 21 Nov by the whole-week rework above. Reading chosen: add Lifting, Dance (bachata cues) and
      Philosophy (meetup concepts) next to BJJ and Run, bottom bar of at most six tabs, every log list
      collapsible so many entries do not stack. Needs new App tabs and a Code.gs redeploy (decision
      `dec-multi-activity` open). Parts: (1) nav with six tabs and a reusable collapsible log
      component; (2) Lifting: squat, deadlift, chin ups, pull ups, quick log, history, next-session
      suggestion; (3) Dance: cues per move, reminder view; (4) Philosophy: concepts per meetup, with
      added context; (5) Code.gs bundle. Build parts 1 and 2 in the web app first.
      Parts 1 and 2 shipped 0.11.0 (Lift tab, `fold()` collapsible, Code.gs lifting tab in the repo, not yet
      pasted). Part 3 Dance shipped 0.12.0 (Lift | Dance switcher under the Lift tab, `App · Dance` in Code.gs). Next:
      part 4 Philosophy (add a third switcher button "Think"), then the Code.gs paste notice.
- [x] **Usability review** (he asked, 11 Nov). Reading chosen: count taps to each screen and remove the
      slowest. Part 1 shipped 0.9.1: Home in the bottom bar (was 2 taps), Stats from a button on Home.
      Part 2 shipped 0.9.2: Search focuses its box, Log remembers "Type instead". Review done.
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

- [x] "Before class" screen: his last 3 sessions plus one older topic to review. He said yes (11 Nov).
      Shipped 0.10.0, opens from a button on Home.
- [x] Monthly hours and sessions on Home. Shipped 0.10.1.

## Done

- [x] v0.7.0: Run tab, a running coach (Strava screenshots, replies, plan, ladder, guide).

- [x] v0.3.0: Record button (voice notes transcribed by Whisper in the runs, free per use),
      accuracy rating for typed vs recorded notes, Run now button, decision buttons on Home.
- [x] v0.2.1-0.2.4: Topic index, parts 1-2c (31 topics with summaries, shown first in Search).
- [x] v0.2.0: Offline-safe saving (service worker, queued notes).
- [x] v0.1.0: Log (dictation box, draft kept on the phone), Search (instant keyword search),
      Ask (questions answered at the next run), Home (last run, needs-you, mode, feedback).
