const express = require('express');
const db      = require('../db');
const { protect, restrictTo } = require('../middleware/auth');

const router = express.Router();

// GET /api/categories
router.get('/', (req, res) => {
  const categories = db.prepare(`
    SELECT c.*, COUNT(p.id) as product_count
    FROM categories c
    LEFT JOIN products p ON p.category_id = c.id
    GROUP BY c.id
    ORDER BY c.name
  `).all();
  res.json({ success: true, data: categories });
});

// GET /api/categories/:slug
router.get('/:slug', (req, res) => {
  const cat = db.prepare('SELECT * FROM categories WHERE slug = ?').get(req.params.slug);
  if (!cat) return res.status(404).json({ success: false, message: 'Category not found' });
  res.json({ success: true, data: cat });
});

// POST /api/categories (admin)
router.post('/', protect, restrictTo('admin'), (req, res) => {
  const { name, slug, image_url, parent_id } = req.body;
  if (!name) return res.status(422).json({ success: false, message: 'Name required' });

  const autoSlug = slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const result = db.prepare(
    'INSERT INTO categories (name, slug, image_url, parent_id) VALUES (?, ?, ?, ?)'
  ).run(name, autoSlug, image_url || null, parent_id || null);

  res.status(201).json({ success: true, data: db.prepare('SELECT * FROM categories WHERE id = ?').get(result.lastInsertRowid) });
});

// PUT /api/categories/:id (admin)
router.put('/:id', protect, restrictTo('admin'), (req, res) => {
  const { name, slug, image_url } = req.body;
  db.prepare('UPDATE categories SET name = COALESCE(?, name), slug = COALESCE(?, slug), image_url = COALESCE(?, image_url) WHERE id = ?')
    .run(name || null, slug || null, image_url || null, req.params.id);
  res.json({ success: true, data: db.prepare('SELECT * FROM categories WHERE id = ?').get(req.params.id) });
});

// DELETE /api/categories/:id (admin)
router.delete('/:id', protect, restrictTo('admin'), (req, res) => {
  const r = db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
  if (!r.changes) return res.status(404).json({ success: false, message: 'Category not found' });
  res.json({ success: true, message: 'Category deleted' });
});

module.exports = router;
