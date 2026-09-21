// MySQL / SQL Server ".sql" text-dump adapter.
//
// Many biometric vendor tools export a plain-text SQL dump (CREATE TABLE + INSERT
// statements) rather than a binary SQLite file. The importer only understands
// SQLite, so this module parses the text dump and materialises it into a temporary
// SQLite database that the existing detect/map/read pipeline can open unchanged.
//
// It intentionally supports the common, well-formed subset of dumps (mysqldump /
// SSMS "Generate Scripts"): single-quoted strings with '' and backslash escapes,
// backtick / double-quote / square-bracket identifiers, multi-row VALUES (...),(...).

const fs = require('fs');
const os = require('os');
const path = require('path');

let DatabaseSync = null;
function getDatabaseSync() {
  if (!DatabaseSync) ({ DatabaseSync } = require('node:sqlite'));
  return DatabaseSync;
}

const CONSTRAINT_STARTS = [
  'primary', 'unique', 'key', 'index', 'constraint', 'foreign', 'check',
  'fulltext', 'spatial', 'period', 'exclude'
];

function looksLikeSqlText(buf) {
  if (!buf || buf.length === 0) return false;
  const head = buf.subarray(0, 4096).toString('utf8').trimStart();
  return /(create|insert)\s+(table|into)/i.test(head) || /^\/\*|^--\s/m.test(head);
}

// --- low-level scanner ---------------------------------------------------
// Advance past a quoted literal that starts at `i` (the opening quote char).
// Returns the index AFTER the closing quote. Handles doubled quotes and
// backslash escapes. Caller appends the raw slice (unescape happens later).
function skipQuoted(sql, i) {
  const q = sql[i];
  const close = q === '`' ? '`' : q === '[' ? ']' : q;
  i++;
  while (i < sql.length) {
    const c = sql[i];
    if (c === '\\' && close === "'") { i += 2; continue; }        // backslash escape (MySQL)
    if (c === close) {
      if (i + 1 < sql.length && sql[i + 1] === close && close === "'") { i += 2; continue; } // '' escape
      return i + 1;
    }
    i++;
  }
  return i;
}

// Split a string on top-level commas (ignores commas inside quotes / (),[],{}).
function splitTopLevel(str) {
  const parts = [];
  let depth = 0, cur = '', i = 0;
  while (i < str.length) {
    const c = str[i];
    if (c === "'" || c === '"' || c === '`' || c === '[') {
      const end = skipQuoted(str, i);
      cur += str.slice(i, end);
      i = end;
      continue;
    }
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    if (c === ',' && depth === 0) { parts.push(cur); cur = ''; i++; continue; }
    cur += c;
    i++;
  }
  parts.push(cur);
  return parts;
}

// Strip comments and split into statements at top-level semicolons.
function splitStatements(sql) {
  const stmts = [];
  let cur = '', i = 0;
  while (i < sql.length) {
    const c = sql[i], c2 = sql[i + 1];
    if (c === '-' && c2 === '-' && (sql[i + 2] === ' ' || sql[i + 2] === '-' || sql[i + 2] === undefined || sql[i + 2] === '\t' || sql[i + 2] === '\n')) {
      while (i < sql.length && sql[i] !== '\n') i++;
      continue;
    }
    if (c === '#') { while (i < sql.length && sql[i] !== '\n') i++; continue; }
    if (c === '/' && c2 === '*') { i += 2; while (i < sql.length && !(sql[i] === '*' && sql[i + 1] === '/')) i++; i += 2; continue; }
    if (c === "'" || c === '"' || c === '`' || c === '[') {
      const end = skipQuoted(sql, i);
      cur += sql.slice(i, end);
      i = end;
      continue;
    }
    if (c === ';') { stmts.push(cur); cur = ''; i++; continue; }
    cur += c;
    i++;
  }
  if (cur.trim()) stmts.push(cur);
  return stmts.map(s => s.trim()).filter(Boolean);
}

function unquoteIdent(id) {
  if (!id) return id;
  let s = id.trim();
  if ((s.startsWith('`') && s.endsWith('`')) || (s.startsWith('"') && s.endsWith('"'))) return s.slice(1, -1);
  if (s.startsWith('[') && s.endsWith(']')) return s.slice(1, -1);
  return s.replace(/\s+/g, ' ');
}

// Parse a value literal token into a JS value.
function parseValueToken(tok) {
  const t = tok.trim();
  if (!t) return null;
  if (/^null$/i.test(t)) return null;
  if (t[0] === "'" || t[0] === '"') return unescapeString(t);
  if (/^-?\d+$/.test(t)) return Number(t);
  if (/^-?\d*\.\d+(e[+-]?\d+)?$/i.test(t)) return Number(t);
  if (/^0x[0-9a-f]+$/i.test(t)) return parseInt(t.slice(2), 16);
  return t;
}

function unescapeString(raw) {
  const quote = raw[0];
  let body = raw.slice(1, -1);
  if (quote === '"') return body.replace(/""/g, '"');
  // single-quoted: handle '' and MySQL backslash escapes
  let out = '';
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (c === "'" && body[i + 1] === "'") { out += "'"; i++; continue; }
    if (c === '\\') {
      const nx = body[i + 1];
      const map = { n: '\n', r: '\r', t: '\t', '0': '\0', '\\': '\\', "'": "'", '"': '"', 'b': '\b' };
      if (nx in map) { out += map[nx]; i++; continue; }
      out += nx ?? ''; i++; continue;
    }
    out += c;
  }
  return out;
}

// Extract the "(col, col, ...)" that starts at `i` (must be '('), or null.
function readParenGroup(str, i) {
  while (i < str.length && str[i] !== '(' ) { if (str[i] === ';') return null; i++; }
  if (str[i] !== '(') return null;
  let depth = 0, j = i, start = i;
  while (j < str.length) {
    const c = str[j];
    if (c === "'" || c === '"' || c === '`' || c === '[') { j = skipQuoted(str, j); continue; }
    if (c === '(') depth++;
    else if (c === ')') { depth--; if (depth === 0) { return { inner: str.slice(start + 1, j), end: j + 1 }; } }
    j++;
  }
  return null;
}

// --- statement handlers --------------------------------------------------
function parseCreateTable(stmt, tables) {
  const m = /create\s+table\s+(?:if\s+not\s+exists\s+)?([`"\[]?[\w$.]+[`"\]]?)/i.exec(stmt);
  if (!m) return;
  const name = unquoteIdent(m[1]).replace(/^[^.]*\./, ''); // drop db. prefix
  const grp = readParenGroupAfter(stmt, m.index + m[0].length);
  const cols = [];
  if (grp) {
    for (const def of splitTopLevel(grp)) {
      const trimmed = def.trim();
      if (!trimmed) continue;
      const first = trimmed.split(/\s+/)[0].toLowerCase();
      if (CONSTRAINT_STARTS.includes(first)) continue;
      cols.push(unquoteIdent(trimmed.split(/\s+/)[0]));
    }
  }
  tables[name] = tables[name] || { columns: [], rows: [] };
  if (cols.length) tables[name].columns = cols;
}

function readParenGroupAfter(str, from) {
  const g = readParenGroup(str, from);
  return g ? g.inner : null;
}

function parseInsert(stmt, tables) {
  const m = /insert\s+(?:ignore\s+)?into\s+([`"\[]?[\w$.]+[`"\]]?)/i.exec(stmt);
  if (!m) return;
  const name = unquoteIdent(m[1]).replace(/^[^.]*\./, '');
  let idx = m.index + m[0].length;

  // optional explicit column list immediately before VALUES
  let cols = null;
  const vw = /\bvalues\b/i;
  const valuesMatch = vw.exec(stmt.slice(idx));
  if (!valuesMatch) return;
  const valuesPos = idx + valuesMatch.index;
  const pre = stmt.slice(idx, valuesPos).trim();
  if (pre.startsWith('(')) {
    const g = readParenGroup(pre, 0);
    if (g) cols = splitTopLevel(g.inner).map(unquoteIdent);
  }

  const table = tables[name] || (tables[name] = { columns: [], rows: [] });
  if (cols && !table.columns.length) table.columns = cols;

  // scan tuples from valuesPos + len('values')
  let p = valuesPos + valuesMatch[0].length;
  while (p < stmt.length) {
    while (p < stmt.length && /\s/.test(stmt[p])) p++;
    if (p >= stmt.length || stmt[p] !== '(') break;
    const g = readParenGroup(stmt, p);
    if (!g) break;
    const row = splitTopLevel(g.inner).map(parseValueToken);
    table.rows.push(row);
    p = g.end;
    // skip a trailing comma between tuples
    while (p < stmt.length && /[\s,]/.test(stmt[p])) p++;
    // stop at ON DUPLICATE / ON CONFLICT tail
    if (/^\s*(on\s+duplicate|on\s+conflict)/i.test(stmt.slice(p))) break;
  }
}

// --- main ----------------------------------------------------------------
function parseDump(sqlText) {
  const tables = {};
  for (const stmt of splitStatements(sqlText)) {
    if (/^\s*create\s+table/i.test(stmt)) parseCreateTable(stmt, tables);
    else if (/^\s*insert\s+/i.test(stmt)) parseInsert(stmt, tables);
  }
  return tables;
}

function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

/**
 * materializeToSqlite(buffer) -> tempFilePath
 * Parses a SQL text dump and writes a real SQLite DB to a temp file so the
 * existing importer can open it read-only. Caller is responsible for unlinking.
 */
function materializeToSqlite(buffer) {
  const text = buffer.toString('utf8');
  const tables = parseDump(text);
  const names = Object.keys(tables).filter(n => tables[n].rows.length || tables[n].columns.length);
  if (!names.length) throw new Error('SQL text dump contained no readable CREATE/INSERT statements.');

  const tmpPath = path.join(os.tmpdir(), `biometric_textdump_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.sqlite`);
  const Sqlite = getDatabaseSync();
  const dbx = new Sqlite(tmpPath);
  try {
    for (const name of names) {
      const { columns, rows } = tables[name];
      // Fall back to positional names when a dump had no CREATE TABLE.
      const cols = columns.length
        ? columns
        : Array.from({ length: rows.reduce((m, r) => Math.max(m, r.length), 0) }, (_, i) => `col_${i + 1}`);
      const defs = cols.map(c => quoteIdent(c)).join(', ');
      // Columns are declared with NO type (BLOB affinity) so bound numbers stay
      // numbers and strings stay strings — a TEXT affinity would render 101 as
      // "101.0", corrupting biometric user IDs.
      dbx.exec(`CREATE TABLE IF NOT EXISTS ${quoteIdent(name)} (${defs || 'col_1'});`);

      if (rows.length && cols.length) {
        const placeholders = cols.map(() => '?').join(', ');
        const stmt = dbx.prepare(`INSERT INTO ${quoteIdent(name)} (${cols.map(quoteIdent).join(', ')}) VALUES (${placeholders})`);
        for (const row of rows) {
          const vals = cols.map((_, i) => {
            const v = row[i];
            if (v === undefined || v === null) return null;
            // SQLite binds null/number/string only
            return typeof v === 'number' ? v : String(v);
          });
          stmt.run(...vals);
        }
      }
    }
  } finally {
    dbx.close();
  }
  return tmpPath;
}

module.exports = { looksLikeSqlText, parseDump, materializeToSqlite };
