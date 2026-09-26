// Shared helper for persisting data-source sync run history.
const { db } = require('../db/database');

async function writeSyncLog({ id, sourceId, sourceName, syncType, startedAt, message = 'Started' }) {
  await db.run(`
    INSERT INTO sync_logs (id, source_id, source_name, sync_type, status, started_at, message)
    VALUES (?, ?, ?, ?, 'RUNNING', ?, ?)
  `, id, sourceId || null, sourceName || 'Unknown', syncType, startedAt || new Date().toISOString(), message);
}

async function finishSyncLog(id, status, counters, message) {
  await db.run(`
    UPDATE sync_logs
    SET status = ?, finished_at = ?, records_found = ?, records_imported = ?, records_skipped = ?, employees_created = ?, devices_created = ?, message = ?, created_employee_ids = ?, created_device_ids = ?
    WHERE id = ?
  `,
    status,
    new Date().toISOString(),
    counters.recordsFound || 0,
    counters.recordsImported || 0,
    counters.recordsSkipped || 0,
    counters.employeesCreated || 0,
    counters.devicesCreated || 0,
    String(message || '').slice(0, 1000),
    JSON.stringify(counters.createdEmployeeIds || []),
    JSON.stringify(counters.createdDeviceIds || []),
    id
  );
}

module.exports = { writeSyncLog, finishSyncLog };