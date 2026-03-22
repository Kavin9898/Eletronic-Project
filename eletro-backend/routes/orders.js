const express = require('express');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const db      = require('../db');
const { protect, softProtect, restrictTo } = require('../middleware/auth');

const router = express.Router();

const ORDER_STATUSES = ['pending','processing','shipped','delivered','cancelled','refunded'];

function generateOrderNumber() {
  const now = new Date();
  const date = now.toISOString().slice(0,10).replace(/-/g,'');
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `ELC-${date}-${rand}`;
}

// POST /api/orders/validate-coupon
router.post('/validate-coupon', (req, res) => {
  const { code, subtotal } = req.body;
  if (!code) return res.status(422).json({ success: false, message: 'Coupon code required' });

  const coupon = db.prepare(`
    SELECT * FROM coupons
    WHERE code = ? AND is_active = 1
      AND (expires_at IS NULL OR expires_at > datetime('now'))
      AND (max_uses IS NULL OR used_count < max_uses)
  `).get(code.toUpperCase());

  if (!coupon) return res.status(404).json({ success: false, message: 'Invalid or expired coupon' });
  if (subtotal < coupon.min_order) {
    return res.status(400).json({ success: false, message: `Minimum order of $${coupon.min_order} required` });
  }

  const discount = coupon.type === 'percent'
    ? Math.round(subtotal * coupon.value / 100 * 100) / 100
    : Math.min(coupon.value, subtotal);

  res.json({ success: true, data: { coupon, discount } });
});

// POST /api/orders — place order (checkout)
router.post('/',
  softProtect,
  body('shipping_name').trim().notEmpty().withMessage('Name required'),
  body('shipping_email').isEmail().withMessage('Valid email required'),
  body('shipping_address').trim().notEmpty().withMessage('Address required'),
  body('shipping_city').trim().notEmpty().withMessage('City required'),
  body('shipping_country').trim().notEmpty().withMessage('Country required'),
  body('payment_method').isIn(['cod','card','paypal']).withMessage('Invalid payment method'),
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ success: false, errors: errors.array() });

    const {
      shipping_name, shipping_email, shipping_phone, shipping_address,
      shipping_city, shipping_country, shipping_zip,
      payment_method, notes, coupon_code, items,
    } = req.body;

    // Accept items from body (checkout from cart data sent by frontend) or from DB cart
    let orderItems = [];

    if (items && Array.isArray(items) && items.length > 0) {
      // Items sent directly from frontend cart
      orderItems = items.map(i => {
        const product = db.prepare('SELECT * FROM products WHERE id = ?').get(i.product_id);
        if (!product) throw { status: 404, message: `Product ${i.product_id} not found` };
        if (product.stock < i.quantity) throw { status: 400, message: `Insufficient stock for ${product.name}` };
        return { product, quantity: parseInt(i.quantity) };
      });
    } else if (req.user) {
      // Pull from DB cart
      const cart = db.prepare('SELECT * FROM carts WHERE user_id = ?').get(req.user.id);
      if (!cart) return res.status(400).json({ success: false, message: 'Cart is empty' });
      const dbItems = db.prepare('SELECT ci.*, p.id AS pid, p.name, p.price, p.stock, p.image_url FROM cart_items ci JOIN products p ON p.id = ci.product_id WHERE ci.cart_id = ?').all(cart.id);
      if (!dbItems.length) return res.status(400).json({ success: false, message: 'Cart is empty' });
      orderItems = dbItems.map(i => ({ product: { id: i.pid, name: i.name, price: i.price, stock: i.stock, image_url: i.image_url }, quantity: i.quantity }));
    } else {
      return res.status(400).json({ success: false, message: 'No items provided' });
    }

    const subtotal = orderItems.reduce((s, i) => s + i.product.price * i.quantity, 0);
    const shipping_cost = subtotal >= 50 ? 0 : 9.99;

    let discount = 0;
    let validCoupon = null;
    if (coupon_code) {
      validCoupon = db.prepare("SELECT * FROM coupons WHERE code = ? AND is_active = 1 AND (expires_at IS NULL OR expires_at > datetime('now'))").get(coupon_code.toUpperCase());
      if (validCoupon) {
        discount = validCoupon.type === 'percent'
          ? Math.round(subtotal * validCoupon.value / 100 * 100) / 100
          : Math.min(validCoupon.value, subtotal);
      }
    }

    const total = Math.max(0, subtotal + shipping_cost - discount);
    const order_number = generateOrderNumber();

    const placeOrder = db.transaction(() => {
      const result = db.prepare(`
        INSERT INTO orders
          (order_number, user_id, guest_email, status, subtotal, shipping_cost, discount, total,
           coupon_code, shipping_name, shipping_email, shipping_phone, shipping_address,
           shipping_city, shipping_country, shipping_zip, payment_method, notes)
        VALUES (?, ?, ?, 'pending', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        order_number, req.user?.id || null, req.user ? null : shipping_email,
        Math.round(subtotal * 100) / 100, shipping_cost, discount,
        Math.round(total * 100) / 100, coupon_code ? coupon_code.toUpperCase() : null,
        shipping_name, shipping_email, shipping_phone || null, shipping_address,
        shipping_city, shipping_country, shipping_zip || null, payment_method, notes || null
      );

      const orderId = result.lastInsertRowid;

      const insertItem = db.prepare(`
        INSERT INTO order_items (order_id, product_id, name, price, quantity, image_url)
        VALUES (?, ?, ?, ?, ?, ?)
      `);
      const updateStock = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?');

      orderItems.forEach(({ product, quantity }) => {
        insertItem.run(orderId, product.id, product.name, product.price, quantity, product.image_url || null);
        updateStock.run(quantity, product.id);
      });

      // Consume coupon
      if (validCoupon) {
        db.prepare('UPDATE coupons SET used_count = used_count + 1 WHERE id = ?').run(validCoupon.id);
      }

      // Clear user cart
      if (req.user) {
        const cart = db.prepare('SELECT id FROM carts WHERE user_id = ?').get(req.user.id);
        if (cart) db.prepare('DELETE FROM cart_items WHERE cart_id = ?').run(cart.id);
      }

      return db.prepare(`
        SELECT o.*, GROUP_CONCAT(oi.name) AS item_names
        FROM orders o
        LEFT JOIN order_items oi ON oi.order_id = o.id
        WHERE o.id = ?
        GROUP BY o.id
      `).get(orderId);
    });

    try {
      const order = placeOrder();
      res.status(201).json({ success: true, message: 'Order placed successfully', data: order });
    } catch (e) {
      if (e.status) return res.status(e.status).json({ success: false, message: e.message });
      throw e;
    }
  }
);

// GET /api/orders/my — current user orders
router.get('/my', protect, (req, res) => {
  const { page = 1, limit = 10 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  const total = db.prepare('SELECT COUNT(*) as cnt FROM orders WHERE user_id = ?').get(req.user.id).cnt;
  const orders = db.prepare(`
    SELECT o.*,
           (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS item_count
    FROM orders o
    WHERE o.user_id = ?
    ORDER BY o.created_at DESC
    LIMIT ? OFFSET ?
  `).all(req.user.id, parseInt(limit), offset);

  res.json({ success: true, data: orders, pagination: { page: parseInt(page), limit: parseInt(limit), total, pages: Math.ceil(total / parseInt(limit)) } });
});

// GET /api/orders/:orderNumber — order detail
router.get('/:orderNumber', softProtect, (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE order_number = ?').get(req.params.orderNumber);
  if (!order) return res.status(404).json({ success: false, message: 'Order not found' });

  // Allow access to owner or admin
  if (req.user?.role !== 'admin' && order.user_id !== req.user?.id && order.guest_email !== req.body?.email) {
    return res.status(403).json({ success: false, message: 'Access denied' });
  }

  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
  res.json({ success: true, data: { ...order, items } });
});

// ── Admin ────────────────────────────────────────────────────────────────────

// GET /api/orders (admin)
router.get('/', protect, restrictTo('admin'), (req, res) => {
  const { page = 1, limit = 20, status } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const where = status ? 'WHERE o.status = ?' : '';
  const params = status ? [status] : [];

  const total  = db.prepare(`SELECT COUNT(*) as cnt FROM orders o ${where}`).get(...params).cnt;
  const orders = db.prepare(`
    SELECT o.*, u.name AS customer_name,
           (SELECT COUNT(*) FROM order_items oi WHERE oi.order_id = o.id) AS item_count
    FROM orders o
    LEFT JOIN users u ON u.id = o.user_id
    ${where}
    ORDER BY o.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, parseInt(limit), offset);

  res.json({ success: true, data: orders, pagination: { total, pages: Math.ceil(total / parseInt(limit)) } });
});

// PUT /api/orders/:id/status (admin)
router.put('/:id/status', protect, restrictTo('admin'),
  body('status').isIn(ORDER_STATUSES).withMessage('Invalid status'),
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ success: false, errors: errors.array() });

    const r = db.prepare("UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?").run(req.body.status, req.params.id);
    if (!r.changes) return res.status(404).json({ success: false, message: 'Order not found' });
    res.json({ success: true, message: `Order status updated to ${req.body.status}` });
  }
);

module.exports = router;
