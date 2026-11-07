// Just enough of SpreadsheetApp & co. to run apps-script/Code.gs under node:vm.
// Like real Sheets, data-validation rules are enforced when changes are flushed (explicitly, or
// when the script ends), not when setValue is called. That deferred rejection is what used to leave
// date-only rows behind, so the fake models it.
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import vm from 'node:vm';

const CODE = readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8');
const empty = () => ({ v: '', f: '', fmt: '', rule: null });

class Rule {
  constructor({ type, values, allowInvalid }) { Object.assign(this, { type, values, allowInvalid }); }
  getCriteriaType() { return this.type; }
  getCriteriaValues() { return this.values; }
  getAllowInvalid() { return this.allowInvalid; }
  copy() { return new RuleBuilder({ type: this.type, values: this.values, allowInvalid: this.allowInvalid }); }
  rejects(v) {
    if (this.allowInvalid || v === '' || v == null) return false;
    if (this.type === 'VALUE_IN_LIST') return !this.values[0].includes(String(v));
    return false;
  }
}

class RuleBuilder {
  constructor(spec = { type: null, values: [], allowInvalid: true }) { this.spec = { ...spec }; }
  requireValueInList(list, show = true) { this.spec.type = 'VALUE_IN_LIST'; this.spec.values = [list, show]; return this; }
  setAllowInvalid(b) { this.spec.allowInvalid = b; return this; }
  build() { return new Rule(this.spec); }
}

class FakeSheet {
  constructor(name, grid = []) {
    this.name = name;
    this.cells = new Map(); // "r,c" -> { v, f, fmt, rule }
    this.maxCols = 26;
    this.hidden = false;
    this.frozen = 0;
    this.dirty = new Set();
    grid.forEach((row, i) => row.forEach((v, j) => {
      if (v !== '' && v != null) this.cell(i + 1, j + 1).v = v;
    }));
  }
  cell(r, c) {
    const k = `${r},${c}`;
    if (!this.cells.has(k)) this.cells.set(k, empty());
    return this.cells.get(k);
  }
  peek(r, c) { return this.cells.get(`${r},${c}`) || empty(); }
  used() { return [...this.cells.entries()].filter(([, x]) => x.v !== '' || x.f).map(([k]) => k.split(',').map(Number)); }
  getName() { return this.name; }
  getLastRow() { return Math.max(0, ...this.used().map(([r]) => r)); }
  getLastColumn() { return Math.max(0, ...this.used().map(([, c]) => c)); }
  getMaxColumns() { return this.maxCols; }
  getMaxRows() { return 1000; }
  insertColumnsAfter(_after, n) { this.maxCols += n; }
  setFrozenRows(n) { this.frozen = n; }
  hideSheet() { this.hidden = true; }
  shiftRows(from, by) {
    const moved = new Map();
    for (const [k, x] of this.cells) {
      const [r, c] = k.split(',').map(Number);
      moved.set(r >= from ? `${r + by},${c}` : k, x);
    }
    this.cells = moved;
  }
  insertRowAfter(r) {
    this.shiftRows(r + 1, 1);
    // Sheets gives the new row the formatting of the row above.
    for (let c = 1; c <= this.maxCols; c++) {
      const above = this.peek(r, c);
      if (above.fmt || above.rule) Object.assign(this.cell(r + 1, c), { fmt: above.fmt, rule: above.rule });
    }
  }
  deleteRow(r) {
    for (const k of [...this.cells.keys()]) if (Number(k.split(',')[0]) === r) this.cells.delete(k);
    this.shiftRows(r + 1, -1);
  }
  getDataRange() { return new FakeRange(this, 1, 1, Math.max(1, this.getLastRow()), Math.max(1, this.getLastColumn())); }
  getRange(a, b, c = 1, d = 1) {
    if (typeof a === 'string') {
      const m = /^([A-Z]+)(\d+)$/.exec(a);
      const col = [...m[1]].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);
      return new FakeRange(this, Number(m[2]), col, 1, 1);
    }
    if (b > this.maxCols || b + d - 1 > this.maxCols) throw new Error(`range past max columns (${this.maxCols})`);
    return new FakeRange(this, a, b, c, d);
  }
  // Applies pending writes the way Sheets does: in order, and a rejected one throws, with it and
  // everything after it lost (what came before stays, which is how a date-only row was born).
  flush() {
    const pending = [...this.dirty];
    this.dirty.clear();
    for (let i = 0; i < pending.length; i++) {
      const x = this.cells.get(pending[i]);
      if (x && x.rule && x.rule.rejects(x.v)) {
        for (const k of pending.slice(i)) if (this.cells.get(k)) this.cells.get(k).v = '';
        const [r, c] = pending[i].split(',').map(Number);
        throw new Error(`The data you entered in cell ${String.fromCharCode(64 + c)}${r} violates the data validation rules set on this cell.`);
      }
    }
  }
}

class FakeRange {
  constructor(sheet, r, c, nr, nc) { Object.assign(this, { sheet, r, c, nr, nc }); }
  each(fn) {
    for (let i = 0; i < this.nr; i++) for (let j = 0; j < this.nc; j++) fn(this.r + i, this.c + j, i, j);
  }
  grid(map) {
    const out = Array.from({ length: this.nr }, () => Array(this.nc).fill(''));
    this.each((r, c, i, j) => { out[i][j] = map(this.sheet.peek(r, c)); });
    return out;
  }
  getValues() { return this.grid((x) => x.v); }
  getDisplayValues() {
    return this.grid((x) => {
      if (x.v instanceof Date) return `${x.v.getDate()}/${x.v.getMonth() + 1}/${String(x.v.getFullYear()).slice(-2)}`;
      if (typeof x.v === 'number' && /d/.test(x.fmt)) {
        const d = new Date(Date.UTC(1899, 11, 30) + x.v * 86400000);
        return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCFullYear()).slice(-2)}`;
      }
      return String(x.v ?? '');
    });
  }
  getFormulas() { return this.grid((x) => x.f); }
  getNumberFormats() { return this.grid((x) => x.fmt); }
  getDataValidations() { return this.grid((x) => x.rule); }
  getDataValidation() { return this.sheet.peek(this.r, this.c).rule; }
  setDataValidation(rule) { this.each((r, c) => { this.sheet.cell(r, c).rule = rule; }); return this; }
  setDataValidations(rules) { this.each((r, c, i, j) => { this.sheet.cell(r, c).rule = rules[i][j]; }); return this; }
  clearDataValidations() { this.each((r, c) => { this.sheet.cell(r, c).rule = null; }); return this; }
  getValue() { return this.sheet.peek(this.r, this.c).v; }
  getFormula() { return this.sheet.peek(this.r, this.c).f; }
  setFormula(f) { this.sheet.cell(this.r, this.c).f = f; return this; }
  write(r, c, v) {
    const x = this.sheet.cell(r, c);
    x.v = v;
    x.f = '';
    this.sheet.dirty.add(`${r},${c}`);
  }
  setValue(v) { this.write(this.r, this.c, v); return this; }
  setValues(vals) {
    if (vals.length !== this.nr || vals.some((row) => row.length !== this.nc)) throw new Error('setValues shape mismatch');
    this.each((r, c, i, j) => this.write(r, c, vals[i][j]));
    return this;
  }
  clearContent() { this.each((r, c) => { const x = this.sheet.cell(r, c); x.v = ''; x.f = ''; }); return this; }
  setNumberFormat(fmt) { this.each((r, c) => { this.sheet.cell(r, c).fmt = fmt; }); return this; }
  copyTo(dest, type) {
    if (type !== 'PASTE_FORMAT') throw new Error('only PASTE_FORMAT is faked');
    this.each((r, c, i, j) => {
      const from = this.sheet.peek(r, c);
      Object.assign(dest.sheet.cell(dest.r + i, dest.c + j), { fmt: from.fmt, rule: from.rule });
    });
  }
}

class FakeSpreadsheet {
  constructor(sheets) { this.sheets = sheets; }
  getSheetByName(n) { return this.sheets.find((s) => s.name === n) || null; }
  insertSheet(n) { const s = new FakeSheet(n); this.sheets.push(s); return s; }
}

export const listRule = (list, allowInvalid = false) => new Rule({ type: 'VALUE_IN_LIST', values: [list, true], allowInvalid });

// A small Sheet1 shaped like the real one: notes rows, header on row 3, Total on row 4.
export function sampleSheet1({ dates = 'text' } = {}) {
  const d = (s) => {
    if (dates === 'text') return s;
    const [dd, mm, yy] = s.split('/').map(Number);
    return new Date(2000 + yy, mm - 1, dd);
  };
  const sh = new FakeSheet('Sheet1', [
    ['NOTES', '', '', 'membership note'],
    ['', '', '', 'another note'],
    ['Date', 'Location', 'Hours', 'Techniques/Tips'],
    ['Total:', '', 3, 'stripe note'],
    [d('27/10/24'), 'Gym A', 1, 'tip one about guard', 'tip two about mount'],
    [d('1/11/24'), 'Gym A', 2, 'tip three about armbar'],
  ]);
  sh.cell(4, 3).f = '=SUM(C5:C208)';
  sh.cell(5, 1).fmt = dates === 'text' ? '' : 'd/m/yy';
  return sh;
}

export function loadCodeGs({ sheet1 = sampleSheet1(), fireStatus = 200 } = {}) {
  const props = new Map();
  const ss = new FakeSpreadsheet([sheet1]);
  const fired = [];
  const flushHooks = { failNext: false };
  const flushAll = () => {
    if (flushHooks.failNext) {
      flushHooks.failNext = false;
      throw new Error('Service error: Spreadsheets');
    }
    for (const sh of ss.sheets) sh.flush();
  };
  const context = {
    SpreadsheetApp: {
      getActiveSpreadsheet: () => ss,
      flush: flushAll,
      newDataValidation: () => new RuleBuilder(),
      CopyPasteType: { PASTE_FORMAT: 'PASTE_FORMAT' },
      DataValidationCriteria: { VALUE_IN_LIST: 'VALUE_IN_LIST' },
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (props.has(k) ? props.get(k) : null),
        setProperty: (k, v) => { props.set(k, String(v)); },
      }),
    },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: (s) => ({ s, setMimeType() { return this; }, getContent() { return this.s; } }),
    },
    Utilities: {
      getUuid: () => randomUUID(),
      formatDate: (d, tz) => new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(d),
    },
    UrlFetchApp: {
      fetch: (url, opts) => {
        fired.push({ url, opts });
        return { getResponseCode: () => fireStatus };
      },
    },
  };
  vm.createContext(context);
  vm.runInContext(`${CODE}\n;this.__api = { doPost, doGet, setup, rotateTokens };`, context);
  const api = context.__api;
  // Like the web app: whatever is still pending is flushed when the script ends, and a rejection
  // there turns the whole response into Google's HTML error page.
  const post = (body) => {
    const out = api.doPost({ postData: { contents: JSON.stringify(body) }, parameter: {} }).getContent();
    try {
      flushAll();
    } catch (err) {
      return { html_error: err.message };
    }
    return JSON.parse(out);
  };
  return { api, post, props, ss, sheet1, fired, flushHooks };
}
