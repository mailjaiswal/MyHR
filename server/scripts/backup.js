/**
 * Zero-Cost SQLite Snapshot Backup Utility for Dubey Nursing Home
 * Creates timestamped copies of the production database without requiring server downtime.
 */
const fs = require('fs');
const path = require('path');
const config = require('../config');

const backupDir = path.join(__dirname, '..', 'backups');
if (!fs.existsSync(backupDir)) {
  fs.mkdirSync(backupDir, { recursive: true });
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const backupFilename = `dubey_nursing_home_backup_${timestamp}.sqlite`;
const backupFilePath = path.join(backupDir, backupFilename);

console.log(`[BACKUP] Starting SQLite database snapshot...`);
console.log(`[BACKUP] Source: ${config.DB_PATH}`);
console.log(`[BACKUP] Target: ${backupFilePath}`);

if (!fs.existsSync(config.DB_PATH)) {
  console.error(`[BACKUP ERROR] Database file not found at: ${config.DB_PATH}`);
  process.exit(1);
}

try {
  // Safe copy of SQLite database file
  fs.copyFileSync(config.DB_PATH, backupFilePath);
  
  // If WAL / SHM files exist, copy them as well to ensure transactional integrity
  const walPath = `${config.DB_PATH}-wal`;
  const shmPath = `${config.DB_PATH}-shm`;
  if (fs.existsSync(walPath)) {
    fs.copyFileSync(walPath, `${backupFilePath}-wal`);
  }
  if (fs.existsSync(shmPath)) {
    fs.copyFileSync(shmPath, `${backupFilePath}-shm`);
  }

  const stats = fs.statSync(backupFilePath);
  console.log(`[BACKUP SUCCESS] Successfully created snapshot: ${backupFilename} (${(stats.size / (1024 * 1024)).toFixed(2)} MB)`);

  // Retention: prune backups older than 30 days
  const retentionMs = 30 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const files = fs.readdirSync(backupDir);
  let prunedCount = 0;
  for (const file of files) {
    const fullPath = path.join(backupDir, file);
    const fileStats = fs.statSync(fullPath);
    if (now - fileStats.mtimeMs > retentionMs) {
      fs.unlinkSync(fullPath);
      prunedCount++;
    }
  }
  if (prunedCount > 0) {
    console.log(`[BACKUP RETENTION] Pruned ${prunedCount} old snapshot(s) exceeding 30-day retention.`);
  }
} catch (err) {
  console.error(`[BACKUP FAILED]`, err);
  process.exit(1);
}
