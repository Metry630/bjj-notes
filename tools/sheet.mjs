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
//   node tools/sheet.mjs append-session session.json   {"date":"YYYY-MM-DD","location","hours","cells":[...]}
//   node tools/sheet.mjs add "App · Log" rows.json      JSON array of row objects
//   node tools/sheet.mjs update "App · Inbox" <id> fields.json
//
// Any *.json argument may be "-" to read from stdin.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
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
      return print(call('appendSession', readJson(rest[0])));
    case 'add':
      return print(call('add', { tab: rest[0], rows: readJson(rest[1]) }));
    case 'update':
      return print(call('update', { tab: rest[0], id: rest[1], fields: readJson(rest[2]) }));
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
