require('dotenv').config();

const express     = require('express');
const cors        = require('cors');
const helmet      = require('helmet');
const morgan      = require('morgan');
const path        = require('path');
const rateLimit   = require('express-rate-limit');
const fs          = require('fs');

// Init DB (runs schema on first load)
require('./db');

const app  = express();
const PORT = process.env.PORT || 5000;

// ── Uploads directory ────────────────────────────────────────────────────────
const uploadsDir = path.join(__dirname, 'uploads', 'products');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

// ── Middleware ───────────────────────────────────────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({
  origin: process.env.FRONTEND_URL || '*',
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

// Static uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Serve the Electro frontend HTML files from the same server
app.use(express.static(path.join(__dirname, 'public')));

// ── Rate limiting ────────────────────────────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  message: { success: false, message: 'Too many requests, please slow down.' },
});
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many auth attempts.' },
});

// ── Routes ───────────────────────────────────────────────────────────────────
app.use('/api', apiLimiter);
app.use('/api/auth',        authLimiter, require('./routes/auth'));
app.use('/api/products',    require('./routes/products'));
app.use('/api/categories',  require('./routes/categories'));
app.use('/api/cart',        require('./routes/cart'));
app.use('/api/orders',      require('./routes/orders'));
app.use('/api/admin',       require('./routes/admin'));
app.use('/api',             require('./routes/misc'));  // wishlist, contact, newsletter

// ── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  res.json({
    success: true,
    message: 'Electro API is running',
    version: '1.0.0',
    env: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
  });
});

// ── API docs summary ─────────────────────────────────────────────────────────
app.get('/api', (_req, res) => {
  res.json({
    name: 'Electro E-Commerce API',
    version: '1.0.0',
    endpoints: {
      auth: {
        'POST /api/auth/register':        'Register new account',
        'POST /api/auth/login':           'Login & get JWT token',
        'GET  /api/auth/me':              'Get own profile (auth)',
        'PUT  /api/auth/profile':         'Update profile (auth)',
        'PUT  /api/auth/change-password': 'Change password (auth)',
      },
      products: {
        'GET  /api/products':                    'List products (filter, search, paginate)',
        'GET  /api/products/filters':            'Get brands, categories, price range',
        'GET  /api/products/:slug':              'Single product + related + reviews',
        'POST /api/products/:id/reviews':        'Post review (auth)',
        'POST /api/products':                    'Create product (admin)',
        'PUT  /api/products/:id':                'Update product (admin)',
        'DELETE /api/products/:id':              'Delete product (admin)',
      },
      categories: {
        'GET  /api/categories':     'List all categories with product count',
        'GET  /api/categories/:slug': 'Single category',
      },
      cart: {
        'GET    /api/cart':              'Get cart (pass X-Session-Id header)',
        'POST   /api/cart/items':        'Add item to cart',
        'PUT    /api/cart/items/:id':    'Update quantity',
        'DELETE /api/cart/items/:id':    'Remove item',
        'DELETE /api/cart':              'Clear cart',
        'POST   /api/cart/merge':        'Merge guest cart on login (auth)',
      },
      orders: {
        'POST /api/orders':                      'Place order (checkout)',
        'POST /api/orders/validate-coupon':      'Validate coupon code',
        'GET  /api/orders/my':                   'My orders (auth)',
        'GET  /api/orders/:orderNumber':         'Order detail',
        'GET  /api/orders':                      'All orders (admin)',
        'PUT  /api/orders/:id/status':           'Update order status (admin)',
      },
      wishlist: {
        'GET    /api/wishlist':           'My wishlist (auth)',
        'POST   /api/wishlist':           'Toggle product in wishlist (auth)',
        'DELETE /api/wishlist/:productId':'Remove from wishlist (auth)',
      },
      misc: {
        'POST /api/contact':             'Submit contact form',
        'POST /api/newsletter':          'Subscribe to newsletter',
      },
      admin: {
        'GET /api/admin/dashboard': 'Dashboard stats (admin)',
        'GET /api/admin/users':     'List users (admin)',
        'GET /api/admin/coupons':   'List coupons (admin)',
        'POST /api/admin/coupons':  'Create coupon (admin)',
      },
    },
  });
});

// ── 404 ───────────────────────────────────────────────────────────────────────
app.use('/api/*', (req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
});

// ── Error handler ─────────────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  console.error('[ERROR]', err.message);
  const status = err.status || 500;
  res.status(status).json({
    success: false,
    message: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n⚡  Electro API running on http://localhost:${PORT}`);
  console.log(`📖  API docs at  http://localhost:${PORT}/api`);
  console.log(`🏥  Health check http://localhost:${PORT}/api/health\n`);
});

module.exports = app;
