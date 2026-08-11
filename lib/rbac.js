function isAllowed(userRole, required) {
  const allowed = Array.isArray(required) ? required : [required];
  if (!userRole) return false;
  if (allowed.includes(userRole)) return true;
  if (userRole === 'ADMIN') return true;
  return false;
}

function requireRole(required) {
  return (req, res, next) => {
    if (!req.session || !req.session.role) return res.status(401).json({ ok: false, error: 'unauthenticated' });
    if (isAllowed(req.session.role, required)) return next();
    return res.status(403).json({ ok: false, error: 'forbidden' });
  };
}

// dynamic permission check middleware (per-resource/action)
function requirePermission(resource, action) {
  const helpers = require('../server_helpers');
  return async (req, res, next) => {
    try {
      const userId = req.session && req.session.userId;
      const role = req.session && req.session.role;
      const allowed = await helpers.isAllowedFor(userId, role, resource, action);
      if (allowed) return next();
      return res.status(403).json({ ok: false, error: 'forbidden' });
    } catch (err) {
      return res.status(500).json({ ok: false, error: 'permission_check_failed' });
    }
  };
}

module.exports = { isAllowed, requireRole, requirePermission };
