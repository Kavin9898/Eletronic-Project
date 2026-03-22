const jwt = require('jsonwebtoken');
const db  = require('../db');

/**
 * Protect route — requires valid JWT.
 */
const protect = (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Not authorised, no token' });
  }

  const token = auth.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    const user = db.prepare('SELECT id, name, email, role FROM users WHERE id = ?').get(decoded.id);
    if (!user) return res.status(401).json({ success: false, message: 'User not found' });
    req.user = user;
    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
};

/**
 * Soft protect — attaches user if token present, but doesn't block.
 */
const softProtect = (req, _res, next) => {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    try {
      const decoded = jwt.verify(auth.split(' ')[1], process.env.JWT_SECRET || 'secret');
      req.user = db.prepare('SELECT id, name, email, role FROM users WHERE id = ?').get(decoded.id);
    } catch { /* ignore */ }
  }
  next();
};

/**
 * Restrict to specific roles.
 */
const restrictTo = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Forbidden — insufficient role' });
  }
  next();
};

module.exports = { protect, softProtect, restrictTo };
