#!/usr/bin/env node
// Run before every push: this repo is public, his notes are not.
// Fails if the diff adds the API URL, the token, or any 8-word run that also appears in his notes,
// inbox, questions, feedback or the running coach tabs. Prints file:line only, never the matching text.
//
//   node tools/check-public.mjs [git-range]     default origin/main (diff of everything not yet pushed)
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { call } from './sheet.mjs';

const N = 8;

export function words(text) {
  return String(text)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

export function shingles(text, n = N) {
  const w = words(text);
  const out = new Set();
  for (let i = 0; i + n <= w.length; i++) out.add(w.slice(i, i + n).join(' '));
  return out;
}

// Added lines of a unified diff, with file and new-file line number.
export function addedLines(diff) {
  const out = [];
  let file = '';
  let line = 0;
  for (const l of diff.split('\n')) {
    if (l.startsWith('+++ ')) file = l.slice(6);
    else if (l.startsWith('@@')) line = Number(/\+(\d+)/.exec(l)[1]);
    else if (l.startsWith('+')) out.push({ file, line: line++, text: l.slice(1) });
  }
  return out;
}

export function findLeaks(diff, privateTexts, secrets) {
  const known = new Set();
  for (const t of privateTexts) for (const s of shingles(t)) known.add(s);
  const leaks = [];
  for (const a of addedLines(diff)) {
    if (secrets.some((s) => s && a.text.includes(s))) leaks.push({ ...a, why: 'secret' });
    else if ([...shingles(a.text)].some((s) => known.has(s))) leaks.push({ ...a, why: 'note text' });
  }
  return leaks;
}

function main() {
  const range = process.argv[2] || 'origin/main';
  const diff = execFileSync('git', ['diff', '-U0', range], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  const notes = call('notes');
  const texts = notes.rows.flatMap((r) => r.cells);
  for (const tab of ['App · Inbox', 'App · Questions', 'App · Feedback', 'App · Topics', 'App · Coach', 'App · Runs', 'App · Plan', 'App · Profile']) {
    try {
      for (const row of call('get', { tab }).rows) texts.push(...Object.values(row).map(String));
    } catch {
      // tab not created yet
    }
  }
  const leaks = findLeaks(diff, texts, [process.env.BJJ_AGENT_TOKEN, process.env.BJJ_API_URL]);
  if (leaks.length) {
    for (const l of leaks) process.stderr.write(`${l.file}:${l.line} adds ${l.why}\n`);
    process.stderr.write(`check-public: ${leaks.length} line(s) must not go into the public repo\n`);
    process.exit(1);
  }
  process.stdout.write(`check-public: ok (${addedLines(diff).length} added lines vs ${texts.length} private texts)\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (err) {
    process.stderr.write(`check-public: ${err.message}\n`);
    process.exit(1);
  }
}
