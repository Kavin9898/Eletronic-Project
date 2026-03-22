const express = require('express');
const { body, validationResult } = require('express-validator');
const db      = require('../db');
const { protect, restrictTo } = require('../middleware/auth');

const router = express.Router();

// ── WISHLIST ─────────────────────────────────────────────────────────────────

// GET /api/wishlist
router.get('/wishlist', protect, (req, res) => {
  const items = db.prepare(`
    SELECT w.id, w.added_at,
           p.id AS product_id, p.name, p.slug, p.price, p.compare_price,
           p.image_url, p.rating, p.brand, p.stock
    FROM wishlists w
    JOIN products p ON p.id = w.product_id
    WHERE w.user_id = ?
    ORDER BY w.added_at DESC
  `).all(req.user.id);
  res.json({ success: true, data: items });
});

// POST /api/wishlist
router.post('/wishlist', protect, (req, res) => {
  const { product_id } = req.body;
  if (!product_id) return res.status(422).json({ success: false, message: 'product_id required' });

  const product = db.prepare('SELECT id FROM products WHERE id = ?').get(product_id);
  if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

  try {
    db.prepare('INSERT INTO wishlists (user_id, product_id) VALUES (?, ?)').run(req.user.id, product_id);
    res.status(201).json({ success: true, message: 'Added to wishlist' });
  } catch {
    // already in wishlist — remove it (toggle)
    db.prepare('DELETE FROM wishlists WHERE user_id = ? AND product_id = ?').run(req.user.id, product_id);
    res.json({ success: true, message: 'Removed from wishlist' });
  }
});

// DELETE /api/wishlist/:productId
router.delete('/wishlist/:productId', protect, (req, res) => {
  db.prepare('DELETE FROM wishlists WHERE user_id = ? AND product_id = ?').run(req.user.id, req.params.productId);
  res.json({ success: true, message: 'Removed from wishlist' });
});

// ── CONTACT ──────────────────────────────────────────────────────────────────

// POST /api/contact
router.post('/contact',
  body('name').trim().notEmpty().withMessage('Name required'),
  body('email').isEmail().withMessage('Valid email required'),
  body('message').trim().isLength({ min: 10 }).withMessage('Message must be at least 10 characters'),
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ success: false, errors: errors.array() });

    const { name, email, subject, message } = req.body;
    db.prepare('INSERT INTO contacts (name, email, subject, message) VALUES (?, ?, ?, ?)').run(name, email, subject || null, message);
    res.status(201).json({ success: true, message: 'Message sent! We will get back to you within 24 hours.' });
  }
);

// GET /api/contact (admin)
router.get('/contact', protect, restrictTo('admin'), (req, res) => {
  const { page = 1, limit = 20, unread } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const where = unread === '1' ? 'WHERE is_read = 0' : '';

  const total    = db.prepare(`SELECT COUNT(*) as cnt FROM contacts ${where}`).get().cnt;
  const contacts = db.prepare(`SELECT * FROM contacts ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(parseInt(limit), offset);

  res.json({ success: true, data: contacts, pagination: { total, pages: Math.ceil(total / parseInt(limit)) } });
});

// PUT /api/contact/:id/read (admin)
router.put('/contact/:id/read', protect, restrictTo('admin'), (req, res) => {
  db.prepare('UPDATE contacts SET is_read = 1 WHERE id = ?').run(req.params.id);
  res.json({ success: true, message: 'Marked as read' });
});

// ── NEWSLETTER ───────────────────────────────────────────────────────────────

// POST /api/newsletter
router.post('/newsletter',
  body('email').isEmail().withMessage('Valid email required'),
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ success: false, errors: errors.array() });

    try {
      db.prepare('INSERT INTO newsletters (email) VALUES (?)').run(req.body.email.toLowerCase());
      res.status(201).json({ success: true, message: 'Subscribed successfully! Thank you.' });
    } catch {
      res.status(409).json({ success: false, message: 'You are already subscribed.' });
    }
  }
);

// GET /api/newsletter (admin)
router.get('/newsletter', protect, restrictTo('admin'), (req, res) => {
  const subs = db.prepare('SELECT * FROM newsletters ORDER BY subscribed_at DESC').all();
  res.json({ success: true, data: subs, total: subs.length });
});

module.exports = router;
