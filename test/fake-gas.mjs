// Just enough of SpreadsheetApp & co. to run apps-script/Code.gs under node:vm.
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import vm from 'node:vm';

const CODE = readFileSync(new URL('../apps-script/Code.gs', import.meta.url), 'utf8');

class FakeSheet {
  constructor(name, grid = []) {
    this.name = name;
    this.cells = new Map(); // "r,c" -> { v, f, fmt }
    this.maxCols = 26;
    this.hidden = false;
    this.frozen = 0;
    grid.forEach((row, i) => row.forEach((v, j) => {
      if (v !== '' && v != null) this.cell(i + 1, j + 1).v = v;
    }));
  }
  cell(r, c) {
    const k = `${r},${c}`;
    if (!this.cells.has(k)) this.cells.set(k, { v: '', f: '', fmt: '' });
    return this.cells.get(k);
  }
  peek(r, c) { return this.cells.get(`${r},${c}`) || { v: '', f: '', fmt: '' }; }
  used() { return [...this.cells.entries()].filter(([, x]) => x.v !== '' || x.f).map(([k]) => k.split(',').map(Number)); }
  getName() { return this.name; }
  getLastRow() { return Math.max(0, ...this.used().map(([r]) => r)); }
  getLastColumn() { return Math.max(0, ...this.used().map(([, c]) => c)); }
  getMaxColumns() { return this.maxCols; }
  insertColumnsAfter(_after, n) { this.maxCols += n; }
  setFrozenRows(n) { this.frozen = n; }
  hideSheet() { this.hidden = true; }
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
      return String(x.v ?? '');
    });
  }
  getValue() { return this.sheet.peek(this.r, this.c).v; }
  getFormula() { return this.sheet.peek(this.r, this.c).f; }
  setFormula(f) { this.sheet.cell(this.r, this.c).f = f; return this; }
  setValue(v) { const x = this.sheet.cell(this.r, this.c); x.v = v; x.f = ''; return this; }
  setValues(vals) {
    if (vals.length !== this.nr || vals.some((row) => row.length !== this.nc)) throw new Error('setValues shape mismatch');
    this.each((r, c, i, j) => { const x = this.sheet.cell(r, c); x.v = vals[i][j]; x.f = ''; });
    return this;
  }
  setNumberFormat(fmt) { this.each((r, c) => { this.sheet.cell(r, c).fmt = fmt; }); return this; }
  copyTo(dest, type) {
    if (type !== 'PASTE_FORMAT') throw new Error('only PASTE_FORMAT is faked');
    this.each((r, c, i, j) => { dest.sheet.cell(dest.r + i, dest.c + j).fmt = this.sheet.peek(r, c).fmt; });
  }
}

class FakeSpreadsheet {
  constructor(sheets) { this.sheets = sheets; }
  getSheetByName(n) { return this.sheets.find((s) => s.name === n) || null; }
  insertSheet(n) { const s = new FakeSheet(n); this.sheets.push(s); return s; }
}

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

export function loadCodeGs({ sheet1 = sampleSheet1() } = {}) {
  const props = new Map();
  const ss = new FakeSpreadsheet([sheet1]);
  const context = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ss, CopyPasteType: { PASTE_FORMAT: 'PASTE_FORMAT' } },
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
    Utilities: { getUuid: () => randomUUID() },
  };
  vm.createContext(context);
  vm.runInContext(`${CODE}\n;this.__api = { doPost, doGet, setup, rotateTokens };`, context);
  const api = context.__api;
  const post = (body) => JSON.parse(api.doPost({ postData: { contents: JSON.stringify(body) }, parameter: {} }).getContent());
  return { api, post, props, ss, sheet1 };
}
