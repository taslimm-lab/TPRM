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

module.exports = { isAllowed, requireRole };
