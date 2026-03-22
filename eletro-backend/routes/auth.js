const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const db       = require('../db');
const { protect } = require('../middleware/auth');

const router = express.Router();

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET || 'secret', {
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  });

// POST /api/auth/register
router.post('/register',
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be ≥ 6 chars'),
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ success: false, errors: errors.array() });

    const { name, email, password, phone } = req.body;

    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
    if (existing) return res.status(409).json({ success: false, message: 'Email already registered' });

    const hashed = bcrypt.hashSync(password, 10);
    const result = db.prepare(
      'INSERT INTO users (name, email, password, phone) VALUES (?, ?, ?, ?)'
    ).run(name, email.toLowerCase(), hashed, phone || null);

    const user = db.prepare('SELECT id, name, email, role FROM users WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ success: true, token: signToken(user.id), user });
  }
);

// POST /api/auth/login
router.post('/login',
  body('email').isEmail().withMessage('Valid email required'),
  body('password').notEmpty().withMessage('Password required'),
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ success: false, errors: errors.array() });

    const { email, password } = req.body;
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase());
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const { password: _pw, ...safeUser } = user;
    res.json({ success: true, token: signToken(user.id), user: safeUser });
  }
);

// GET /api/auth/me
router.get('/me', protect, (req, res) => {
  const user = db.prepare('SELECT id, name, email, phone, address, city, country, role, created_at FROM users WHERE id = ?').get(req.user.id);
  res.json({ success: true, user });
});

// PUT /api/auth/profile
router.put('/profile', protect,
  body('name').optional().trim().notEmpty(),
  body('phone').optional(),
  body('address').optional(),
  body('city').optional(),
  body('country').optional(),
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ success: false, errors: errors.array() });

    const { name, phone, address, city, country } = req.body;
    db.prepare(`
      UPDATE users SET
        name    = COALESCE(?, name),
        phone   = COALESCE(?, phone),
        address = COALESCE(?, address),
        city    = COALESCE(?, city),
        country = COALESCE(?, country),
        updated_at = datetime('now')
      WHERE id = ?
    `).run(name || null, phone || null, address || null, city || null, country || null, req.user.id);

    const updated = db.prepare('SELECT id, name, email, phone, address, city, country, role FROM users WHERE id = ?').get(req.user.id);
    res.json({ success: true, user: updated });
  }
);

// PUT /api/auth/change-password
router.put('/change-password', protect,
  body('currentPassword').notEmpty(),
  body('newPassword').isLength({ min: 6 }),
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ success: false, errors: errors.array() });

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!bcrypt.compareSync(req.body.currentPassword, user.password)) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect' });
    }

    const hash = bcrypt.hashSync(req.body.newPassword, 10);
    db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hash, req.user.id);
    res.json({ success: true, message: 'Password updated successfully' });
  }
);

module.exports = router;
