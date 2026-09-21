// Legacy entry point retained for compatibility.
// All data access now flows through the PostgreSQL layer (server/db/db.js).
const { db, pool, migrate } = require('./db');

module.exports = { db, pool, migrate };