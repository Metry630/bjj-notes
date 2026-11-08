# Decisions

Why it's built this way, short enough to defend in a room.

**The sheet stays the source of truth.** Two years of notes already live there, and he still types
into it by hand sometimes. The app adds tabs and appends rows; it never moves the notes elsewhere.

**Apps Script is the only door, and it can't damage a filled cell.** An agent runs unattended twice
a day. Rather than trusting it, the API has no action that changes or deletes a cell that has
something in it (tested in `test/code-gs.test.mjs`). Saves fill empty cells only: a day's notes go
into that day's row, his own included, so one session stays one row. The single delete removes a
row holding nothing but a date. `@OnlyCurrentDoc` limits the script to this one spreadsheet.

**A save is all or nothing.** Sheets checks dropdown rules when changes are flushed, so the first
version wrote a date, had the gym rejected afterwards, and left a date-only row on every retry
(six of them in Nov 2026). Now each save widens the dropdown for that cell, flushes inside the
call, and clears what it wrote if anything fails.

**Two tokens.** The phone token can read and add notes/questions/feedback. The routine's token can
also append session rows and write the app tabs. Either can be rotated alone (`rotateTokens()`).
Tokens go in the request body because Apps Script can't read headers.

**GitHub Pages, plain JS, no build.** Free, no domain or server to maintain, and a push to `main` is
the deploy, so the routine needs no deploy credential. No framework or dependencies means nothing
to upgrade and nothing that breaks while nobody is watching.

**The LLM only runs in the scheduled routine.** Organising dictation and answering questions are
judgment calls, done on the existing Claude subscription twice a day. Lookups that can't wait use
the app's instant keyword search, which costs nothing. Topic summaries precompute the common
answers.

**Dictation is the phone keyboard's mic.** Free, on-device, works in Indonesian or English. The
routine fixes misheard BJJ terms when it files the note, and the raw transcript stays in
`App · Inbox`.

**Cells keep his words.** The routine splits and cleans but doesn't translate or rewrite, so new
rows read like the 200 before them.

**One feature per run, then stop.** Enough to keep the app moving, without spending his weekly
Claude limit on churn. Home has a mode switch (normal / light / paused) if the limit gets tight.

**Public repo, private data.** Code is public like his other side projects. A pre-push check
(`tools/check-public.mjs`) fails if a diff contains note text, the token or the API URL.

**Voice notes are transcribed by Whisper inside the routine.** Apple dictation is poor at his
Indonesian/English mix. Whisper (large-v3-turbo, CPU) handles code-switching better, takes a
vocabulary prompt built from his own notes, and costs nothing per use because it runs in the
scheduled VM. The audio travels as base64 slices in a hidden tab, so no new storage or scope.
The trade-off: a recording is filed at the next run, or within minutes via Run now.

**Run now goes through Apps Script.** The routine's API token can only start this one routine. It
sits in Script Properties, the phone never sees it, and the script allows one fire per 10 minutes
and 8 a day so a stuck button can't eat his plan. A manual run only does chores, never features.

**The running coach lives in this app.** Everything it needs was already here: uploads as slices,
answers that arrive at the next run, Run now, the twice-daily routine and one linked phone. It
also sees his BJJ hours, which matter for running load. A second app would have meant a second
script deploy, token, phone link and routine.

**Screenshots, not the Strava API.** The API needs an OAuth app and a stored secret, and its data
is more than a coach needs. A screenshot has the distance, time, pace and splits, costs nothing,
and is read by the model in the routine. The phone shrinks it to 1600 px (about what the vision
model uses anyway), and the routine clears the image once the numbers are logged.

**Long runs climb in 10% steps, with spare weeks.** A 2025 cohort of 5,205 runners found overuse
injuries rose when one run was more than 10% longer than the longest of the previous 30 days.
Steps of 10% from 5 km reach 14.2 km in 11 steps, and the calendar has 13, so two weeks can be
lost to holidays or illness without touching the taper. Unused, they become the 15.6 and 17.2 km
steps. The arithmetic is in `tools/coach.mjs`, not left to the model.

**Personal training data stays in the sheet.** The method (`COACH.md`) is public and generic. The
race, health notes, paces and plan live in `App · Profile` and `App · Plan`, and the public-repo
check covers those tabs too.

**Decisions are buttons, not conversations.** The routine decides anything free and reversible
itself. Only money, new credentials, data rewrites or an Apps Script redeploy become a question,
always with options and a recommendation, answered with one tap on Home.

