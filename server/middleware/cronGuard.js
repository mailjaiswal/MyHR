// server/middleware/cronGuard.js
// Protects Vercel Cron endpoints. Vercel sends "Authorization: Bearer $CRON_SECRET"
// automatically for cron requests when CRON_SECRET is set on the project.
function cronGuard(req, res, next) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return res.status(503).json({ error: 'CRON_NOT_CONFIGURED', message: 'Set CRON_SECRET env var to enable cron endpoints.' });
  }
  const header = req.headers.authorization || '';
  if (header !== `Bearer ${secret}`) {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Invalid cron token' });
  }
  next();
}

module.exports = { cronGuard };
