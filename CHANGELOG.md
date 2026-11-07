# Changelog

## 0.6.0 (2026-11-08)

- Search: topic chips (most tips first) filter the tips by topic, with the topic summary on top.

## 0.5.1 (2026-11-07)

- Analysis: fun facts card (longest streak, busiest month, longest session, most drilled topic, totals).

## 0.5.0 (2026-11-06)

- Log screen rebuilt around recording: a big Record button, a timer, Pause/Continue, and Stop that
  saves and starts filing straight away (outside 09:00-18:00; then a File now button). Typing moved
  under "Type instead". Each training day is one card with its clips and the sheet row it landed in.
- Sheet script v3 (needs one redeploy): a save can no longer leave a junk row (it rolls back), a
  dropdown on Location no longer rejects a new gym, a day's clips go into that day's row (including
  a row he started himself), new dates go in date order, and old date-only rows can be pruned.
- Bottom bar fits five tabs.

## 0.4.5 (2026-11-06)

- Recording: Pause and Continue buttons (the timer skips paused time), the screen stays awake while recording, and Cancel recording needs a second tap so a slip does not lose a long recording.

## 0.4.4 (2026-11-05)

- Sheet script fix: adding a session to Sheet1 no longer stops half way when the new row has a dropdown rule. Needs the updated script pasted into Apps Script and redeployed.

## 0.4.3 (2026-11-05)

- Stop and save on the record screen no longer hangs when the phone already ended the recording. It saves what was captured, or says no audio was captured.

## 0.4.2 (2026-11-04)

- The date on the Log screen is always today unless a note is half written. It resets after sending.

## 0.4.1 (2026-11-03)

- Stats screen now lists topics (guards, positions, techniques) per gym instead of common words.

## 0.4.0 (2026-11-03)

- New Stats screen: hours, sessions and most common words per gym. Sessions since 1 October show as GB SG there.

## 0.3.1 (2026-11-02)

- Rows marked hidden (cleanup at his request) no longer show anywhere in the app.

## 0.3.0 (2026-11-02)

- Record button on Log: voice notes upload in slices and are transcribed with Whisper in the next run (free per use).
- Rate each filed note 1-5; Home compares typed and recorded accuracy.
- Run now button on Home (Apps Script calls the routine's API trigger, max once per 10 minutes, 8 a day).
- Decisions show as buttons on Home; the routine decides small things itself.

## 0.2.4 (2026-11-02)

- Topic index, part 2c: 5 more topics (31 in total).

## 0.2.3 (2026-11-02)

- Topic index, part 2b: 5 more topics (26 in total).

## 0.2.2 (2026-11-01)

- Topic index, part 2a: 6 more topics with summaries (21 in total), shown first in Search.

## 0.2.1 (2026-11-01)

- Topic index, part 1: 15 topics with summaries now live in the sheet, and Search shows the matching summary first.

## 0.2.0 (2026-10-31)

- Offline-safe saving: the app opens with no signal, and a note saved offline is queued on the phone and sent when it is back online (no duplicates).

## 0.1.0 (2026-10-31)

- First version: Log, Search, Ask and Home screens on GitHub Pages.
- Apps Script API on the sheet: Sheet1 append-only, separate phone and routine tokens.
- Twice-daily routine files dictated notes, answers questions and builds one backlog item.
