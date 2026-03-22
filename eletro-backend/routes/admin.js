const express = require('express');
const db      = require('../db');
const { protect, restrictTo } = require('../middleware/auth');

const router = express.Router();

// GET /api/admin/dashboard
router.get('/dashboard', protect, restrictTo('admin'), (req, res) => {
  const stats = {
    total_orders:    db.prepare("SELECT COUNT(*) as c FROM orders").get().c,
    pending_orders:  db.prepare("SELECT COUNT(*) as c FROM orders WHERE status = 'pending'").get().c,
    total_revenue:   db.prepare("SELECT COALESCE(SUM(total),0) as s FROM orders WHERE status NOT IN ('cancelled','refunded')").get().s,
    total_products:  db.prepare("SELECT COUNT(*) as c FROM products").get().c,
    low_stock:       db.prepare("SELECT COUNT(*) as c FROM products WHERE stock < 5").get().c,
    out_of_stock:    db.prepare("SELECT COUNT(*) as c FROM products WHERE stock = 0").get().c,
    total_customers: db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'customer'").get().c,
    newsletter_subs: db.prepare("SELECT COUNT(*) as c FROM newsletters").get().c,
    unread_contacts: db.prepare("SELECT COUNT(*) as c FROM contacts WHERE is_read = 0").get().c,
  };

  const recent_orders = db.prepare(`
    SELECT o.id, o.order_number, o.status, o.total, o.created_at,
           COALESCE(u.name, o.shipping_name) AS customer_name
    FROM orders o
    LEFT JOIN users u ON u.id = o.user_id
    ORDER BY o.created_at DESC
    LIMIT 8
  `).all();

  const top_products = db.prepare(`
    SELECT p.id, p.name, p.slug, p.price, p.stock, p.rating,
           COUNT(oi.id) AS order_count,
           COALESCE(SUM(oi.quantity), 0) AS units_sold
    FROM products p
    LEFT JOIN order_items oi ON oi.product_id = p.id
    GROUP BY p.id
    ORDER BY units_sold DESC
    LIMIT 6
  `).all();

  const revenue_by_day = db.prepare(`
    SELECT DATE(created_at) as date, SUM(total) as revenue, COUNT(*) as orders
    FROM orders
    WHERE created_at >= datetime('now', '-30 days')
      AND status NOT IN ('cancelled','refunded')
    GROUP BY DATE(created_at)
    ORDER BY date ASC
  `).all();

  const orders_by_status = db.prepare(`
    SELECT status, COUNT(*) as count
    FROM orders
    GROUP BY status
  `).all();

  res.json({
    success: true,
    data: { stats, recent_orders, top_products, revenue_by_day, orders_by_status },
  });
});

// GET /api/admin/users
router.get('/users', protect, restrictTo('admin'), (req, res) => {
  const { page = 1, limit = 20, search } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const where  = search ? `WHERE name LIKE ? OR email LIKE ?` : '';
  const params = search ? [`%${search}%`, `%${search}%`] : [];

  const total = db.prepare(`SELECT COUNT(*) as c FROM users ${where}`).get(...params).c;
  const users = db.prepare(`
    SELECT id, name, email, phone, role, created_at
    FROM users ${where}
    ORDER BY created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, parseInt(limit), offset);

  res.json({ success: true, data: users, pagination: { total, pages: Math.ceil(total / parseInt(limit)) } });
});

// DELETE /api/admin/users/:id
router.delete('/users/:id', protect, restrictTo('admin'), (req, res) => {
  if (req.user.id == req.params.id) return res.status(400).json({ success: false, message: "Cannot delete yourself" });
  const r = db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  if (!r.changes) return res.status(404).json({ success: false, message: 'User not found' });
  res.json({ success: true, message: 'User deleted' });
});

// GET /api/admin/coupons
router.get('/coupons', protect, restrictTo('admin'), (req, res) => {
  const coupons = db.prepare('SELECT * FROM coupons ORDER BY created_at DESC').all();
  res.json({ success: true, data: coupons });
});

// POST /api/admin/coupons
router.post('/coupons', protect, restrictTo('admin'), (req, res) => {
  const { code, type, value, min_order, max_uses, expires_at } = req.body;
  if (!code || !type || !value) return res.status(422).json({ success: false, message: 'code, type, value required' });

  try {
    const r = db.prepare('INSERT INTO coupons (code, type, value, min_order, max_uses, expires_at) VALUES (?, ?, ?, ?, ?, ?)').run(code.toUpperCase(), type, value, min_order || 0, max_uses || null, expires_at || null);
    res.status(201).json({ success: true, data: db.prepare('SELECT * FROM coupons WHERE id = ?').get(r.lastInsertRowid) });
  } catch {
    res.status(409).json({ success: false, message: 'Coupon code already exists' });
  }
});

// DELETE /api/admin/coupons/:id
router.delete('/coupons/:id', protect, restrictTo('admin'), (req, res) => {
  db.prepare('DELETE FROM coupons WHERE id = ?').run(req.params.id);
  res.json({ success: true, message: 'Coupon deleted' });
});

module.exports = router;
