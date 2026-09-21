// ZKTeco BioTime 8.0 (ETP) REST API Client
// Implements the endpoints from "ETP API User Manual 3 - Sample.pdf":
//   - Auth:   POST /jwt-api-token-auth/  |  POST /api-token-auth/
//   - Punches:GET /iclock/api/transactions/?start_time&end_time&emp_code
//   - Devices:GET /iclock/api/terminals/
//   - Emps:   GET /personnel/api/employees/
//   - Depts:  GET /personnel/api/departments/
// Uses Node 18+ global fetch (no extra dependency).

const DEFAULT_PAGE_SIZE = 100;

function normalizeBaseUrl(baseUrl) {
  let url = String(baseUrl || '').trim().replace(/\/+$/, '');
  if (!url) throw new Error('Vendor API base URL is required (e.g. http://192.168.1.50:8090)');
  if (!/^https?:\/\//i.test(url)) url = `http://${url}`;
  return url;
}

function authHeader(tokenType, token) {
  const prefix = tokenType === 'GENERAL' ? 'Token' : 'JWT';
  return { Authorization: `${prefix} ${token}` };
}

async function parseJson(res, ctx) {
  let data;
  try {
    data = await res.json();
  } catch (e) {
    throw new Error(`${ctx} failed: HTTP ${res.status} with non-JSON response`);
  }
  if (!res.ok) {
    const detail = data && (data.message || data.msg || data.detail || data.code);
    throw new Error(`${ctx} failed: HTTP ${res.status} ${detail || ''}`.trim());
  }
  return data;
}

// 1. System / Staff Auth Token
async function getAuthToken({ baseUrl, username, password, tokenType = 'JWT' }) {
  const root = normalizeBaseUrl(baseUrl);
  const endpoint = tokenType === 'GENERAL' ? '/api-token-auth/' : '/jwt-api-token-auth/';
  const res = await fetch(`${root}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username, password })
  });
  const data = await parseJson(res, `Auth token (${tokenType})`);
  const token = data && (data.token || data.key);
  if (!token) {
    throw new Error(`BioTime auth returned no token. Response: ${JSON.stringify(data || {}).slice(0, 200)}`);
  }
  if (typeof token !== 'string') {
    return JSON.stringify(token);
  }
  return token;
}

// Generic paginated GET helper for BioTime list endpoints.
// Response envelope: { count, next, previous, msg, code, results, data }
async function paginate({ root, token, tokenType, path, query = {}, maxPages = 50 }) {
  const headers = { 'Content-Type': 'application/json', ...authHeader(tokenType, token) };
  const all = [];
  let page = 1;
  while (page <= maxPages) {
    const params = new URLSearchParams({ page, limit: DEFAULT_PAGE_SIZE, ...query });
    const res = await fetch(`${root}${path}?${params.toString()}`, { headers });
    const body = await parseJson(res, path);
    const items = Array.isArray(body.data) ? body.data : Array.isArray(body.results) ? body.results : [];
    all.push(...items);
    const hasMore = (items.length > 0) && (body.next != null) && (typeof body.next === 'string' ? body.next.length > 0 : body.next);
    if (!hasMore) break;
    page += 1;
  }
  return all;
}

// 2. Transactions / Punch Logs — the core attendance extraction endpoint
async function getTransactions({ baseUrl, token, tokenType = 'JWT', startTime, endTime, empCode, maxPages = 50 }) {
  const root = normalizeBaseUrl(baseUrl);
  const query = {};
  if (startTime) query.start_time = startTime;
  if (endTime) query.end_time = endTime;
  if (empCode) query.emp_code = empCode;
  return paginate({ root, token, tokenType, path: '/iclock/api/transactions/', query, maxPages });
}

// 3. Devices / Terminals
async function getDevices({ baseUrl, token, tokenType = 'JWT', serial, maxPages = 20 }) {
  const root = normalizeBaseUrl(baseUrl);
  const query = {};
  if (serial) query.sn = serial;
  return paginate({ root, token, tokenType, path: '/iclock/api/terminals/', query, maxPages });
}

// 4. Employees
async function getEmployees({ baseUrl, token, tokenType = 'JWT', empCode, department, firstName, maxPages = 20 }) {
  const root = normalizeBaseUrl(baseUrl);
  const query = {};
  if (empCode) query.emp_code = empCode;
  if (department) query.department = department;
  if (firstName) query.first_name = firstName;
  return paginate({ root, token, tokenType, path: '/personnel/api/employees/', query, maxPages });
}

// 5. Departments / Areas / Positions (read-only for source validation)
async function getDepartments({ baseUrl, token, tokenType = 'JWT', maxPages = 10 }) {
  const root = normalizeBaseUrl(baseUrl);
  return paginate({ root, token, tokenType, path: '/personnel/api/departments/', query: {}, maxPages });
}

// Test a connection: obtain token + confirm device reachability
async function testConnection({ baseUrl, username, password, tokenType = 'JWT' }) {
  const token = await getAuthToken({ baseUrl, username, password, tokenType });
  const devices = await getDevices({ baseUrl, token, tokenType });
  return {
    ok: true,
    token: `${token.slice(0, 12)}...`,
    tokenType,
    devicesFound: devices.length
  };
}

// Normalize a BioTime transaction (punch) into our internal punch shape
const VERIFY_MAP = {
  0: 'FINGERPRINT', 1: 'FINGERPRINT', 2: 'FACE', 3: 'RFID',
  4: 'FACE', 11: 'FINGERPRINT', 15: 'RFID', 16: 'PALM', 17: 'PALM'
};
const STATE_MAP = { 0: 'IN', 1: 'OUT', '0': 'IN', '1': 'OUT', 'I': 'IN', 'O': 'OUT' };

function normalizeTransaction(txn) {
  return {
    biometricUserId: String(txn.emp_code != null ? txn.emp_code : txn.emp ? txn.emp.emp_code : txn.badgenumber || ''),
    punchTime: txn.punch_time || txn.checktime || txn.datetime || null,
    verificationMode: VERIFY_MAP[txn.verify_type] || 'FINGERPRINT',
    inOutMode: STATE_MAP[txn.punch_state] || STATE_MAP[txn.checktype] || 'AUTO',
    deviceSerial: txn.terminal_sn || txn.sn || null
  };
}

module.exports = {
  getAuthToken,
  getTransactions,
  getDevices,
  getEmployees,
  getDepartments,
  testConnection,
  normalizeTransaction,
  VERIFY_MAP,
  STATE_MAP,
  paginate
};