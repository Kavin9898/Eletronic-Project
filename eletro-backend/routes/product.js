const express = require('express');
const { body, query, validationResult } = require('express-validator');
const db      = require('../db');
const { protect, restrictTo } = require('../middleware/auth');

const router = express.Router();

const buildProduct = (row) => ({
  ...row,
  images: JSON.parse(row.images || '[]'),
  tags:   JSON.parse(row.tags   || '[]'),
  is_featured:   !!row.is_featured,
  is_bestseller: !!row.is_bestseller,
  is_new:        !!row.is_new,
  on_sale: row.compare_price && row.compare_price > row.price,
});

// GET /api/products
router.get('/', (req, res) => {
  const {
    page = 1, limit = 12,
    category, brand, search,
    minPrice, maxPrice,
    sort = 'newest',
    featured, bestseller, newArrival,
    tag,
  } = req.query;

  const offset = (parseInt(page) - 1) * parseInt(limit);
  const conditions = ['1=1'];
  const params = [];

  if (category) {
    conditions.push('c.slug = ?');
    params.push(category);
  }
  if (brand) {
    conditions.push('p.brand = ?');
    params.push(brand);
  }
  if (search) {
    conditions.push(`(p.name LIKE ? OR p.description LIKE ? OR p.brand LIKE ?)`);
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (minPrice) { conditions.push('p.price >= ?'); params.push(parseFloat(minPrice)); }
  if (maxPrice) { conditions.push('p.price <= ?'); params.push(parseFloat(maxPrice)); }
  if (featured === '1') { conditions.push('p.is_featured = 1'); }
  if (bestseller === '1') { conditions.push('p.is_bestseller = 1'); }
  if (newArrival === '1') { conditions.push('p.is_new = 1'); }
  if (tag) { conditions.push(`p.tags LIKE ?`); params.push(`%${tag}%`); }

  const orderMap = {
    newest:    'p.created_at DESC',
    oldest:    'p.created_at ASC',
    price_asc: 'p.price ASC',
    price_desc:'p.price DESC',
    rating:    'p.rating DESC',
    name:      'p.name ASC',
  };
  const orderBy = orderMap[sort] || orderMap.newest;
  const where = conditions.join(' AND ');

  const baseQuery = `
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE ${where}
  `;

  const total = db.prepare(`SELECT COUNT(*) as cnt ${baseQuery}`).get(...params).cnt;
  const rows  = db.prepare(`
    SELECT p.*, c.name AS category_name, c.slug AS category_slug
    ${baseQuery}
    ORDER BY ${orderBy}
    LIMIT ? OFFSET ?
  `).all(...params, parseInt(limit), offset);

  res.json({
    success: true,
    data: rows.map(buildProduct),
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / parseInt(limit)),
    },
  });
});

// GET /api/products/filters — distinct brands & price range for sidebar
router.get('/filters', (req, res) => {
  const brands    = db.prepare('SELECT DISTINCT brand FROM products WHERE brand IS NOT NULL ORDER BY brand').all().map(r => r.brand);
  const priceRange = db.prepare('SELECT MIN(price) as min, MAX(price) as max FROM products').get();
  const categories = db.prepare('SELECT id, name, slug FROM categories ORDER BY name').all();
  res.json({ success: true, data: { brands, priceRange, categories } });
});

// GET /api/products/:slug
router.get('/:slug', (req, res) => {
  const product = db.prepare(`
    SELECT p.*, c.name AS category_name, c.slug AS category_slug
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE p.slug = ?
  `).get(req.params.slug);

  if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

  // Related products (same category, exclude self)
  const related = db.prepare(`
    SELECT p.*, c.name AS category_name, c.slug AS category_slug
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE p.category_id = ? AND p.id != ?
    ORDER BY p.rating DESC
    LIMIT 6
  `).all(product.category_id, product.id).map(buildProduct);

  // Reviews
  const reviews = db.prepare(`
    SELECT r.*, u.name AS user_name
    FROM reviews r
    JOIN users u ON u.id = r.user_id
    WHERE r.product_id = ?
    ORDER BY r.created_at DESC
  `).all(product.id);

  res.json({ success: true, data: { ...buildProduct(product), related, reviews } });
});

// POST /api/products/:id/reviews
router.post('/:id/reviews', protect,
  body('rating').isInt({ min: 1, max: 5 }).withMessage('Rating must be 1-5'),
  body('title').optional().trim(),
  body('body').trim().notEmpty().withMessage('Review body required'),
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ success: false, errors: errors.array() });

    const product = db.prepare('SELECT id FROM products WHERE id = ?').get(req.params.id);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    try {
      db.prepare(`
        INSERT INTO reviews (product_id, user_id, rating, title, body)
        VALUES (?, ?, ?, ?, ?)
      `).run(product.id, req.user.id, req.body.rating, req.body.title || null, req.body.body);

      // Recalculate average rating
      const stats = db.prepare('SELECT AVG(rating) as avg, COUNT(*) as cnt FROM reviews WHERE product_id = ?').get(product.id);
      db.prepare('UPDATE products SET rating = ?, review_count = ? WHERE id = ?')
        .run(Math.round(stats.avg * 10) / 10, stats.cnt, product.id);

      res.status(201).json({ success: true, message: 'Review submitted' });
    } catch (e) {
      if (e.message.includes('UNIQUE')) {
        return res.status(409).json({ success: false, message: 'You already reviewed this product' });
      }
      throw e;
    }
  }
);

// ── Admin product CRUD ──────────────────────────────────────────────────────

// POST /api/products (admin)
router.post('/', protect, restrictTo('admin'),
  body('name').trim().notEmpty(),
  body('price').isFloat({ gt: 0 }),
  body('stock').isInt({ min: 0 }),
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ success: false, errors: errors.array() });

    const { name, slug, description, price, compare_price, stock, brand, category_id, sku, tags, image_url, is_featured, is_bestseller, is_new } = req.body;
    const autoSlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    const result = db.prepare(`
      INSERT INTO products (name, slug, description, price, compare_price, stock, brand, category_id, sku, tags, image_url, is_featured, is_bestseller, is_new)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(name, autoSlug, description || null, price, compare_price || null, stock, brand || null, category_id || null, sku || null, JSON.stringify(tags || []), image_url || null, is_featured ? 1 : 0, is_bestseller ? 1 : 0, is_new ? 1 : 0);

    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ success: true, data: buildProduct(product) });
  }
);

// PUT /api/products/:id (admin)
router.put('/:id', protect, restrictTo('admin'), (req, res) => {
  const product = db.prepare('SELECT id FROM products WHERE id = ?').get(req.params.id);
  if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

  const fields = ['name','description','price','compare_price','stock','brand','category_id','sku','image_url','tags','is_featured','is_bestseller','is_new'];
  const updates = [];
  const values  = [];
  fields.forEach(f => {
    if (req.body[f] !== undefined) {
      updates.push(`${f} = ?`);
      values.push(Array.isArray(req.body[f]) ? JSON.stringify(req.body[f]) : req.body[f]);
    }
  });
  if (!updates.length) return res.status(400).json({ success: false, message: 'No fields to update' });
  values.push(req.params.id);
  db.prepare(`UPDATE products SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  res.json({ success: true, data: buildProduct(db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id)) });
});

// DELETE /api/products/:id (admin)
router.delete('/:id', protect, restrictTo('admin'), (req, res) => {
  const r = db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  if (!r.changes) return res.status(404).json({ success: false, message: 'Product not found' });
  res.json({ success: true, message: 'Product deleted' });
});

module.exports = router;
