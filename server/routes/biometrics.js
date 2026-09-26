const express = require('express');
const router = express.Router();
const { db } = require('../db/database');
const config = require('../config');
const { ingestPunch } = require('../services/attendanceEngine');
const { requireAuth } = require('../middleware/authGuard');
const { accessGuard, requirePerm } = require('../middleware/accessGuard');

// Server-Sent Events (SSE) Client Connections Registry
const sseClients = new Set();

function broadcastSSE(eventType, data) {
  const payload = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.res.write(payload);
    } catch (err) {
      sseClients.delete(client);
    }
  }
}

// 1. Live SSE Biometric Stream for real-time dashboard ticker
router.get('/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  const client = { id: Date.now(), res };
  sseClients.add(client);

  // Send initial ping
  res.write(`event: connected\ndata: ${JSON.stringify({ message: 'Live Biometric Stream Active', activeClients: sseClients.size })}\n\n`);

  req.on('close', () => {
    sseClients.delete(client);
  });
});

// 2. Hardware Gateway Webhook
// Direct endpoint called by biometric machines or local edge daemon
router.post('/punch', async (req, res) => {
  try {
    // Partner API key is required unless explicitly opened for legacy devices.
    const authHeader = req.headers['x-api-key'] || req.query.apiKey;
    if (process.env.ALLOW_OPEN_PUNCH !== '1') {
      if (!authHeader || authHeader !== config.ANUBHAV_PARTNER_API_KEY) {
        return res.status(401).json({ error: 'Unauthorized: Invalid or missing Partner API Key' });
      }
    } else if (authHeader && authHeader !== config.ANUBHAV_PARTNER_API_KEY) {
      return res.status(401).json({ error: 'Unauthorized: Invalid Partner API Key' });
    }

    const { deviceId, biometricUserId, punchTime, verificationMode, inOutMode } = req.body;

    if (!biometricUserId) {
      return res.status(400).json({ error: 'Missing required field: biometricUserId' });
    }

    const effectiveDeviceId = deviceId || 'dev_01';

    const result = await ingestPunch({
      deviceId: effectiveDeviceId,
      biometricUserId: String(biometricUserId),
      punchTime: punchTime || new Date().toISOString(),
      verificationMode: verificationMode || 'FINGERPRINT',
      inOutMode: inOutMode || 'AUTO'
    });

    // Broadcast live event to all connected dashboard browsers
    broadcastSSE('PUNCH_EVENT', {
      timestamp: new Date().toISOString(),
      result
    });

    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Biometric punch error:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 3. Hardware Simulator Endpoint (Used for presentation & demo) — admin-only
router.post('/simulate', requireAuth, accessGuard, requirePerm('DEMO_LAB'), async (req, res) => {
  try {
    const { employeeId, deviceId, punchType = 'IN', verificationMode = 'FACE' } = req.body;

    let employee;
    if (employeeId) {
      employee = await db.get('SELECT * FROM employees WHERE id = ? OR employee_code = ?', employeeId, employeeId);
    } else {
      // No employee picked: simulate as the first enrolled staff member
      employee = await db.get("SELECT * FROM employees WHERE biometric_user_id IS NOT NULL ORDER BY biometric_user_id LIMIT 1");
    }

    if (!employee) {
      return res.status(404).json({ error: 'Employee not found' });
    }

    let effectiveDeviceId = deviceId;
    if (!effectiveDeviceId) {
      const dev = await db.get('SELECT id FROM devices ORDER BY created_at ASC LIMIT 1');
      effectiveDeviceId = dev ? dev.id : 'dev_simulator';
    }
    const now = new Date().toISOString();

    const result = await ingestPunch({
      deviceId: effectiveDeviceId,
      biometricUserId: employee.biometric_user_id,
      punchTime: now,
      verificationMode,
      inOutMode: punchType
    });

    // Broadcast SSE
    broadcastSSE('PUNCH_EVENT', {
      timestamp: now,
      simulatorTriggered: true,
      result
    });

    return res.status(200).json({
      success: true,
      simulated: true,
      data: result
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 4. Biometric Device Status & Health (Hardware Inventory)
router.get('/devices', async (req, res) => {
  try {
    const devices = await db.all('SELECT * FROM devices');
    const totalPunches = await db.get('SELECT count(*) as count FROM biometric_punches');

    return res.json({
      success: true,
      partner: 'Anubhav Infotech',
      customer: config.ORGANIZATION.NAME,
      totalPunchesRecorded: totalPunches.count,
      devices
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

module.exports = {
  router,
  broadcastSSE
};
