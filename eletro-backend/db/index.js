const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'electro.db');

// Ensure the db directory exists
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) fs.mkdirSync(dbDir, { recursive: true });

const db = new Database(DB_PATH);

// Enable WAL mode for better performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Schema ──────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    email       TEXT    NOT NULL UNIQUE,
    password    TEXT    NOT NULL,
    phone       TEXT,
    address     TEXT,
    city        TEXT,
    country     TEXT,
    role        TEXT    NOT NULL DEFAULT 'customer',
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS categories (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL UNIQUE,
    slug        TEXT    NOT NULL UNIQUE,
    image_url   TEXT,
    parent_id   INTEGER REFERENCES categories(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS products (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT    NOT NULL,
    slug          TEXT    NOT NULL UNIQUE,
    description   TEXT,
    price         REAL    NOT NULL,
    compare_price REAL,
    stock         INTEGER NOT NULL DEFAULT 0,
    sku           TEXT    UNIQUE,
    brand         TEXT,
    category_id   INTEGER REFERENCES categories(id) ON DELETE SET NULL,
    image_url     TEXT,
    images        TEXT    DEFAULT '[]',
    tags          TEXT    DEFAULT '[]',
    rating        REAL    DEFAULT 0,
    review_count  INTEGER DEFAULT 0,
    is_featured   INTEGER DEFAULT 0,
    is_bestseller INTEGER DEFAULT 0,
    is_new        INTEGER DEFAULT 0,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS reviews (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating      INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
    title       TEXT,
    body        TEXT,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(product_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS carts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id  TEXT,
    user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS cart_items (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    cart_id     INTEGER NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
    product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity    INTEGER NOT NULL DEFAULT 1,
    UNIQUE(cart_id, product_id)
  );

  CREATE TABLE IF NOT EXISTS wishlists (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    added_at    TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(user_id, product_id)
  );

  CREATE TABLE IF NOT EXISTS orders (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    order_number    TEXT    NOT NULL UNIQUE,
    user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
    guest_email     TEXT,
    status          TEXT    NOT NULL DEFAULT 'pending',
    subtotal        REAL    NOT NULL,
    shipping_cost   REAL    NOT NULL DEFAULT 0,
    discount        REAL    NOT NULL DEFAULT 0,
    total           REAL    NOT NULL,
    coupon_code     TEXT,
    shipping_name   TEXT,
    shipping_email  TEXT,
    shipping_phone  TEXT,
    shipping_address TEXT,
    shipping_city   TEXT,
    shipping_country TEXT,
    shipping_zip    TEXT,
    payment_method  TEXT    DEFAULT 'cod',
    payment_status  TEXT    DEFAULT 'pending',
    notes           TEXT,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id    INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id  INTEGER REFERENCES products(id) ON DELETE SET NULL,
    name        TEXT    NOT NULL,
    price       REAL    NOT NULL,
    quantity    INTEGER NOT NULL,
    image_url   TEXT
  );

  CREATE TABLE IF NOT EXISTS coupons (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    code            TEXT    NOT NULL UNIQUE,
    type            TEXT    NOT NULL DEFAULT 'percent',
    value           REAL    NOT NULL,
    min_order       REAL    DEFAULT 0,
    max_uses        INTEGER DEFAULT NULL,
    used_count      INTEGER DEFAULT 0,
    expires_at      TEXT,
    is_active       INTEGER DEFAULT 1
  );

  CREATE TABLE IF NOT EXISTS contacts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    email       TEXT    NOT NULL,
    subject     TEXT,
    message     TEXT    NOT NULL,
    is_read     INTEGER DEFAULT 0,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS newsletters (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    email       TEXT    NOT NULL UNIQUE,
    subscribed_at TEXT  NOT NULL DEFAULT (datetime('now'))
  );
`);

module.exports = db;
