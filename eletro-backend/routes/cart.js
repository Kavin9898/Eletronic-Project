const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db      = require('../db');
const { softProtect } = require('../middleware/auth');

const router = express.Router();

// Helper: get or create cart for user/session
function getOrCreateCart(userId, sessionId) {
  let cart;
  if (userId) {
    cart = db.prepare('SELECT * FROM carts WHERE user_id = ?').get(userId);
    if (!cart) {
      const r = db.prepare("INSERT INTO carts (user_id) VALUES (?)").run(userId);
      cart = db.prepare('SELECT * FROM carts WHERE id = ?').get(r.lastInsertRowid);
    }
  } else {
    cart = db.prepare('SELECT * FROM carts WHERE session_id = ?').get(sessionId);
    if (!cart) {
      const r = db.prepare("INSERT INTO carts (session_id) VALUES (?)").run(sessionId);
      cart = db.prepare('SELECT * FROM carts WHERE id = ?').get(r.lastInsertRowid);
    }
  }
  return cart;
}

// Helper: build cart response
function buildCartResponse(cartId) {
  const items = db.prepare(`
    SELECT ci.id, ci.quantity,
           p.id AS product_id, p.name, p.slug, p.price, p.compare_price,
           p.image_url, p.stock, p.brand
    FROM cart_items ci
    JOIN products p ON p.id = ci.product_id
    WHERE ci.cart_id = ?
  `).all(cartId);

  const subtotal = items.reduce((s, i) => s + i.price * i.quantity, 0);
  const count    = items.reduce((s, i) => s + i.quantity, 0);
  return { items, subtotal: Math.round(subtotal * 100) / 100, count };
}

// GET /api/cart
router.get('/', softProtect, (req, res) => {
  const sessionId = req.headers['x-session-id'] || req.query.sessionId || uuidv4();
  const cart = getOrCreateCart(req.user?.id, sessionId);
  res.json({ success: true, data: buildCartResponse(cart.id), sessionId });
});

// POST /api/cart/items — add item
router.post('/items', softProtect, (req, res) => {
  const { product_id, quantity = 1 } = req.body;
  if (!product_id) return res.status(422).json({ success: false, message: 'product_id required' });

  const sessionId = req.headers['x-session-id'] || uuidv4();
  const product = db.prepare('SELECT id, stock FROM products WHERE id = ?').get(product_id);
  if (!product) return res.status(404).json({ success: false, message: 'Product not found' });
  if (product.stock < 1) return res.status(400).json({ success: false, message: 'Out of stock' });

  const cart = getOrCreateCart(req.user?.id, sessionId);

  const existing = db.prepare('SELECT * FROM cart_items WHERE cart_id = ? AND product_id = ?').get(cart.id, product_id);
  const newQty   = Math.min((existing?.quantity || 0) + parseInt(quantity), product.stock);

  if (existing) {
    db.prepare('UPDATE cart_items SET quantity = ? WHERE id = ?').run(newQty, existing.id);
  } else {
    db.prepare('INSERT INTO cart_items (cart_id, product_id, quantity) VALUES (?, ?, ?)').run(cart.id, product_id, newQty);
  }

  db.prepare("UPDATE carts SET updated_at = datetime('now') WHERE id = ?").run(cart.id);
  res.json({ success: true, data: buildCartResponse(cart.id), sessionId });
});

// PUT /api/cart/items/:itemId — update quantity
router.put('/items/:itemId', softProtect, (req, res) => {
  const { quantity } = req.body;
  const sessionId = req.headers['x-session-id'];
  const cart = getOrCreateCart(req.user?.id, sessionId);

  const item = db.prepare('SELECT ci.*, p.stock FROM cart_items ci JOIN products p ON p.id = ci.product_id WHERE ci.id = ? AND ci.cart_id = ?').get(req.params.itemId, cart.id);
  if (!item) return res.status(404).json({ success: false, message: 'Cart item not found' });

  if (parseInt(quantity) <= 0) {
    db.prepare('DELETE FROM cart_items WHERE id = ?').run(item.id);
  } else {
    const capped = Math.min(parseInt(quantity), item.stock);
    db.prepare('UPDATE cart_items SET quantity = ? WHERE id = ?').run(capped, item.id);
  }

  db.prepare("UPDATE carts SET updated_at = datetime('now') WHERE id = ?").run(cart.id);
  res.json({ success: true, data: buildCartResponse(cart.id) });
});

// DELETE /api/cart/items/:itemId — remove item
router.delete('/items/:itemId', softProtect, (req, res) => {
  const sessionId = req.headers['x-session-id'];
  const cart = getOrCreateCart(req.user?.id, sessionId);
  db.prepare('DELETE FROM cart_items WHERE id = ? AND cart_id = ?').run(req.params.itemId, cart.id);
  db.prepare("UPDATE carts SET updated_at = datetime('now') WHERE id = ?").run(cart.id);
  res.json({ success: true, data: buildCartResponse(cart.id) });
});

// DELETE /api/cart — clear cart
router.delete('/', softProtect, (req, res) => {
  const sessionId = req.headers['x-session-id'];
  const cart = getOrCreateCart(req.user?.id, sessionId);
  db.prepare('DELETE FROM cart_items WHERE cart_id = ?').run(cart.id);
  res.json({ success: true, data: buildCartResponse(cart.id) });
});

// POST /api/cart/merge — merge guest cart into user cart on login
router.post('/merge', softProtect, (req, res) => {
  if (!req.user) return res.status(401).json({ success: false, message: 'Login required' });
  const { sessionId } = req.body;
  if (!sessionId) return res.json({ success: true, message: 'Nothing to merge' });

  const guestCart = db.prepare('SELECT * FROM carts WHERE session_id = ?').get(sessionId);
  if (!guestCart) return res.json({ success: true, message: 'Guest cart not found' });

  const userCart = getOrCreateCart(req.user.id, null);
  const guestItems = db.prepare('SELECT * FROM cart_items WHERE cart_id = ?').all(guestCart.id);

  guestItems.forEach(gi => {
    const existing = db.prepare('SELECT * FROM cart_items WHERE cart_id = ? AND product_id = ?').get(userCart.id, gi.product_id);
    if (existing) {
      db.prepare('UPDATE cart_items SET quantity = quantity + ? WHERE id = ?').run(gi.quantity, existing.id);
    } else {
      db.prepare('INSERT INTO cart_items (cart_id, product_id, quantity) VALUES (?, ?, ?)').run(userCart.id, gi.product_id, gi.quantity);
    }
  });

  db.prepare('DELETE FROM carts WHERE id = ?').run(guestCart.id);
  res.json({ success: true, data: buildCartResponse(userCart.id) });
});

module.exports = router;
