#!/usr/bin/env node
// The routine's door to the sheet. Reads BJJ_API_URL and BJJ_AGENT_TOKEN from the environment and
// never prints either. Goes through curl (stdin body) so the token stays out of argv and the
// cloud proxy settings are honoured.
//
//   node tools/sheet.mjs ping
//   node tools/sheet.mjs notes                 one line per session: row, date, location, hours, cells
//   node tools/sheet.mjs notes --json
//   node tools/sheet.mjs get "App · Inbox" [--status new]
//   node tools/sheet.mjs inbox | questions | feedback    shortcuts for status=new
//   node tools/sheet.mjs settings
//   node tools/sheet.mjs file-session session.json     {"date":"YYYY-MM-DD","location","hours","cells":[...]}
//       fills that date's row if it exists (empty cells only, tips after his), else adds a row in
//       date order. A failed save leaves nothing behind. (append-session is the old name.)
//   node tools/sheet.mjs fill-cells <row> <col> values.json   write into EMPTY cells of one row
//   node tools/sheet.mjs prune-row <row> <shown date>   delete a row holding nothing but that date
//   node tools/sheet.mjs inspect <row>                  shown values, formats, validation rules
//   node tools/sheet.mjs add-option <col> <value>       add a value to a column's dropdown lists
//   node tools/sheet.mjs add "App · Log" rows.json      JSON array of row objects
//   node tools/sheet.mjs update "App · Inbox" <id> fields.json
//   node tools/sheet.mjs audio <inbox_id> <out-file>    joins a recording's slices into a file
//   node tools/sheet.mjs audio-done <inbox_id>          clears its slices once transcribed
//   node tools/sheet.mjs decisions                      open and newly answered decisions
//
// Any *.json argument may be "-" to read from stdin.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function call(action, payload = {}, env = process.env) {
  const url = env.BJJ_API_URL;
  const token = env.BJJ_AGENT_TOKEN;
  if (!url || !token) throw new Error('BJJ_API_URL and BJJ_AGENT_TOKEN must be set');
  const body = JSON.stringify({ ...payload, action, token });
  let raw;
  try {
    raw = execFileSync(
      'curl',
      ['-sS', '-L', '--max-time', '90', '--retry', '2', '-H', 'Content-Type: text/plain;charset=utf-8', '--data-binary', '@-', url],
      { input: body, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
    );
  } catch (err) {
    throw new Error(`curl failed: ${String(err.stderr || err.message).split(token).join('[token]')}`);
  }
  let res;
  try {
    res = JSON.parse(raw);
  } catch {
    throw new Error(`not JSON from the API (first 200 chars): ${raw.slice(0, 200)}`);
  }
  if (!res.ok) throw new Error(`API error: ${res.error}`);
  return res;
}

export function formatNotes(res) {
  return res.rows.map((r) => `${r.row}\t${r.cells.slice(0, 3).join('\t')}\t${r.cells.slice(3).join(' | ')}`).join('\n');
}

// Joins slices 1..total of one recording. Throws if any slice is missing, so a half-uploaded
// recording is left for the next run.
export function assembleAudio(rows, inboxId) {
  const mine = rows.filter((r) => String(r.inbox_id) === String(inboxId) && r.status !== 'done');
  if (!mine.length) throw new Error(`no audio for ${inboxId}`);
  const total = Number(mine[0].total);
  const bySeq = new Map(mine.map((r) => [Number(r.seq), r]));
  const missing = [];
  for (let i = 1; i <= total; i++) if (!bySeq.has(i)) missing.push(i);
  if (missing.length) throw new Error(`incomplete: ${total - missing.length}/${total} slices uploaded`);
  const b64 = Array.from({ length: total }, (_, i) => String(bySeq.get(i + 1).data)).join('');
  return { bytes: Buffer.from(b64, 'base64'), mime: String(mine[0].mime), slices: total, rowIds: mine.map((r) => r.id) };
}

const readJson = (arg) => JSON.parse(arg === '-' ? readFileSync(0, 'utf8') : readFileSync(arg, 'utf8'));

function main(argv) {
  const [cmd, ...rest] = argv;
  const flag = (name) => {
    const i = rest.indexOf(name);
    return i >= 0 ? rest[i + 1] : undefined;
  };
  const print = (x) => process.stdout.write(`${typeof x === 'string' ? x : JSON.stringify(x, null, 2)}\n`);
  const status = (rows, s) => (s ? rows.filter((r) => r.status === s) : rows);
  switch (cmd) {
    case 'ping':
      return print(call('ping'));
    case 'notes': {
      const res = call('notes');
      return print(rest.includes('--json') ? res : `total_hours=${res.total_hours}\n${formatNotes(res)}`);
    }
    case 'get':
      return print(status(call('get', { tab: rest[0] }).rows, flag('--status')));
    case 'inbox':
      return print(status(call('get', { tab: 'App · Inbox' }).rows, 'new'));
    case 'questions':
      return print(status(call('get', { tab: 'App · Questions' }).rows, 'new'));
    case 'feedback':
      return print(status(call('get', { tab: 'App · Feedback' }).rows, 'new'));
    case 'settings':
      return print(call('settings'));
    case 'append-session':
    case 'file-session':
      return print(call('fileSession', readJson(rest[0])));
    case 'fill-cells':
      return print(call('fillCells', { row: Number(rest[0]), col: Number(rest[1]), values: readJson(rest[2]) }));
    case 'prune-row':
      return print(call('pruneRow', { row: Number(rest[0]), expect: rest[1] }));
    case 'inspect':
      return print(call('inspect', { row: Number(rest[0]) }));
    case 'add-option':
      return print(call('addListOption', { col: Number(rest[0]), value: rest[1] }));
    case 'add':
      return print(call('add', { tab: rest[0], rows: readJson(rest[1]) }));
    case 'update':
      return print(call('update', { tab: rest[0], id: rest[1], fields: readJson(rest[2]) }));
    case 'audio': {
      const a = assembleAudio(call('get', { tab: 'App · Audio' }).rows, rest[0]);
      writeFileSync(rest[1], a.bytes);
      return print({ file: rest[1], bytes: a.bytes.length, mime: a.mime, slices: a.slices });
    }
    case 'audio-done': {
      const rows = call('get', { tab: 'App · Audio' }).rows.filter((r) => String(r.inbox_id) === rest[0]);
      for (const r of rows) call('update', { tab: 'App · Audio', id: r.id, fields: { data: '', status: 'done' } });
      return print({ cleared: rows.length });
    }
    case 'decisions':
      return print(call('get', { tab: 'App · Decisions' }).rows.filter((r) => r.status === 'open' || (r.status === 'answered' && !r.acted_at)));
    default:
      process.stderr.write('usage: see the header of tools/sheet.mjs\n');
      process.exit(2);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`${err.message}\n`);
    process.exit(1);
  }
}
