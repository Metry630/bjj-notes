# Decisions

Why it's built this way, short enough to defend in a room.

**The sheet stays the source of truth.** Two years of notes already live there, and he still types
into it by hand sometimes. The app adds tabs and appends rows; it never moves the notes elsewhere.

**Apps Script is the only door, and Sheet1 is append-only by construction.** An agent runs
unattended twice a day. Rather than trusting it not to damage the notes, the API it talks to has no
action that edits or deletes a Sheet1 row (tested in `test/code-gs.test.mjs`). `@OnlyCurrentDoc`
limits the script to this one spreadsheet. No Google Cloud project or service-account key needed.

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

**Decisions are buttons, not conversations.** The routine decides anything free and reversible
itself. Only money, new credentials, data rewrites or an Apps Script redeploy become a question,
always with options and a recommendation, answered with one tap on Home.

