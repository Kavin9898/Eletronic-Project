require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const db = require('./index');
const bcrypt = require('bcryptjs');

console.log('🌱 Seeding database...');

// ── Categories ───────────────────────────────────────────────────────────────
const categories = [
  { name: 'Smartphones',    slug: 'smartphones',    image_url: '/uploads/cat-smartphones.jpg' },
  { name: 'Laptops',        slug: 'laptops',         image_url: '/uploads/cat-laptops.jpg' },
  { name: 'Cameras',        slug: 'cameras',         image_url: '/uploads/cat-cameras.jpg' },
  { name: 'Smart Watches',  slug: 'smart-watches',   image_url: '/uploads/cat-watches.jpg' },
  { name: 'Headphones',     slug: 'headphones',      image_url: '/uploads/cat-headphones.jpg' },
  { name: 'Tablets',        slug: 'tablets',         image_url: '/uploads/cat-tablets.jpg' },
  { name: 'Accessories',    slug: 'accessories',     image_url: '/uploads/cat-accessories.jpg' },
  { name: 'Gaming',         slug: 'gaming',          image_url: '/uploads/cat-gaming.jpg' },
];

const insertCat = db.prepare(
  `INSERT OR IGNORE INTO categories (name, slug, image_url) VALUES (@name, @slug, @image_url)`
);
categories.forEach(c => insertCat.run(c));

const getCatId = db.prepare(`SELECT id FROM categories WHERE slug = ?`);

// ── Products ─────────────────────────────────────────────────────────────────
const products = [
  // Smartphones
  { name: 'Apple iPad Mini G2356',  slug: 'apple-ipad-mini-g2356',  price: 799.00,  compare_price: 999.00,  stock: 45, brand: 'Apple',    category: 'smartphones',  is_featured: 1, is_bestseller: 1, is_new: 0, rating: 4.8, review_count: 124, sku: 'APL-IPM-G2356', description: 'The Apple iPad Mini G2356 features a stunning Liquid Retina display, powerful A15 Bionic chip, and all-day battery life. Perfect for work and entertainment on the go.', tags: '["apple","ipad","tablet","featured"]' },
  { name: 'Samsung Galaxy S24 Ultra', slug: 'samsung-galaxy-s24-ultra', price: 1199.99, compare_price: null, stock: 30, brand: 'Samsung',  category: 'smartphones',  is_featured: 1, is_bestseller: 0, is_new: 1, rating: 4.9, review_count: 87,  sku: 'SAM-S24U', description: 'The Samsung Galaxy S24 Ultra with titanium frame, 200MP camera, and built-in S Pen. The ultimate Android flagship.', tags: '["samsung","galaxy","android","new"]' },
  { name: 'iPhone 15 Pro Max',       slug: 'iphone-15-pro-max',       price: 1099.00, compare_price: 1299.00, stock: 20, brand: 'Apple',  category: 'smartphones',  is_featured: 0, is_bestseller: 1, is_new: 1, rating: 4.7, review_count: 256, sku: 'APL-IP15PM', description: 'iPhone 15 Pro Max with titanium design, A17 Pro chip, and ProRAW camera system.', tags: '["apple","iphone","ios","new"]' },
  { name: 'Google Pixel 8 Pro',      slug: 'google-pixel-8-pro',      price: 899.00,  compare_price: null,    stock: 18, brand: 'Google', category: 'smartphones',  is_featured: 0, is_bestseller: 0, is_new: 1, rating: 4.6, review_count: 43,  sku: 'GGL-PX8P', description: 'Google Pixel 8 Pro with Tensor G3 chip, 50MP triple camera, and 7 years of OS updates.', tags: '["google","pixel","android"]' },

  // Laptops
  { name: 'MacBook Pro 14" M3',    slug: 'macbook-pro-14-m3',    price: 1999.00, compare_price: 2399.00, stock: 12, brand: 'Apple',  category: 'laptops', is_featured: 1, is_bestseller: 1, is_new: 1, rating: 4.9, review_count: 78,  sku: 'APL-MBP14M3', description: 'MacBook Pro with M3 chip delivers incredible performance, stunning Liquid Retina XDR display, and up to 22 hours battery life.', tags: '["apple","macbook","laptop","m3"]' },
  { name: 'Dell XPS 15 OLED',      slug: 'dell-xps-15-oled',     price: 1749.00, compare_price: null,    stock: 8,  brand: 'Dell',   category: 'laptops', is_featured: 0, is_bestseller: 1, is_new: 0, rating: 4.5, review_count: 92,  sku: 'DLL-XPS15', description: 'Dell XPS 15 with 3.5K OLED display, 13th Gen Intel Core i7, and NVIDIA RTX 4060.', tags: '["dell","xps","oled","laptop"]' },
  { name: 'ASUS ROG Zephyrus G14', slug: 'asus-rog-zephyrus-g14', price: 1399.00, compare_price: 1599.00, stock: 15, brand: 'ASUS',  category: 'laptops', is_featured: 0, is_bestseller: 0, is_new: 0, rating: 4.7, review_count: 61,  sku: 'ASS-ROG-G14', description: 'ASUS ROG Zephyrus G14 gaming laptop with AMD Ryzen 9 and RTX 4070 in a compact 14-inch form.', tags: '["asus","rog","gaming","laptop"]' },

  // Cameras
  { name: 'Smart Camera 40% Off',  slug: 'smart-camera-pro',       price: 549.00,  compare_price: 899.00,  stock: 22, brand: 'Canon',  category: 'cameras', is_featured: 1, is_bestseller: 1, is_new: 0, rating: 4.6, review_count: 115, sku: 'CAN-SC-PRO', description: 'Canon Smart Camera with AI autofocus, 4K video, and wireless connectivity. Now 40% off — limited time offer.', tags: '["canon","camera","sale","featured"]' },
  { name: 'Sony Alpha A7 IV',      slug: 'sony-alpha-a7-iv',       price: 2499.00, compare_price: null,    stock: 7,  brand: 'Sony',   category: 'cameras', is_featured: 0, is_bestseller: 0, is_new: 0, rating: 4.9, review_count: 34,  sku: 'SNY-A7IV', description: 'Sony Alpha A7 IV full-frame mirrorless camera with 33MP sensor and advanced video capabilities.', tags: '["sony","mirrorless","camera","fullframe"]' },
  { name: 'Nikon Z50 II',          slug: 'nikon-z50-ii',           price: 849.00,  compare_price: 999.00,  stock: 14, brand: 'Nikon',  category: 'cameras', is_featured: 0, is_bestseller: 0, is_new: 1, rating: 4.4, review_count: 28,  sku: 'NKN-Z50II', description: 'Nikon Z50 II APS-C mirrorless with 21MP sensor, vlogging-friendly flip screen and 4K video.', tags: '["nikon","z50","camera","vlog"]' },
  { name: 'EOS Rebel T7i Kit',     slug: 'eos-rebel-t7i-kit',      price: 699.00,  compare_price: 899.00,  stock: 19, brand: 'Canon',  category: 'cameras', is_featured: 0, is_bestseller: 1, is_new: 0, rating: 4.5, review_count: 67,  sku: 'CAN-T7I', description: 'Canon EOS Rebel T7i DSLR kit with 18-55mm lens. Great entry-level camera for beginners.', tags: '["canon","eos","dslr","sale"]' },

  // Smart Watches
  { name: 'Smart Watch 20% Off',   slug: 'smart-watch-pro',        price: 239.00,  compare_price: 299.00,  stock: 35, brand: 'Samsung', category: 'smart-watches', is_featured: 1, is_bestseller: 1, is_new: 0, rating: 4.5, review_count: 198, sku: 'SAM-SWP', description: 'Samsung Smart Watch Pro with health tracking, GPS, 5-day battery, and always-on display.', tags: '["samsung","smartwatch","sale","featured"]' },
  { name: 'Apple Watch Series 9',  slug: 'apple-watch-series-9',   price: 399.00,  compare_price: null,    stock: 28, brand: 'Apple',   category: 'smart-watches', is_featured: 0, is_bestseller: 1, is_new: 1, rating: 4.8, review_count: 203, sku: 'APL-AWS9', description: 'Apple Watch Series 9 with S9 SiP, double tap gesture, and carbon neutral option.', tags: '["apple","watch","wearable","new"]' },
  { name: 'Garmin Fenix 7 Pro',   slug: 'garmin-fenix-7-pro',     price: 749.00,  compare_price: null,    stock: 9,  brand: 'Garmin', category: 'smart-watches', is_featured: 0, is_bestseller: 0, is_new: 0, rating: 4.7, review_count: 55,  sku: 'GRM-F7P', description: 'Garmin Fenix 7 Pro rugged multisport GPS watch with solar charging and advanced training metrics.', tags: '["garmin","fenix","gps","outdoor"]' },

  // Headphones
  { name: 'Sony WH-1000XM5',       slug: 'sony-wh-1000xm5',        price: 349.00,  compare_price: 399.00,  stock: 40, brand: 'Sony',   category: 'headphones', is_featured: 1, is_bestseller: 1, is_new: 0, rating: 4.9, review_count: 342, sku: 'SNY-XM5', description: 'Industry-leading noise cancelling with 30-hour battery and ultra-comfortable lightweight design.', tags: '["sony","headphones","anc","wireless"]' },
  { name: 'Apple AirPods Pro 2',   slug: 'apple-airpods-pro-2',    price: 249.00,  compare_price: null,    stock: 55, brand: 'Apple',  category: 'headphones', is_featured: 0, is_bestseller: 1, is_new: 1, rating: 4.8, review_count: 415, sku: 'APL-APP2', description: 'AirPods Pro 2 with H2 chip, Adaptive Audio, and Personalized Spatial Audio.', tags: '["apple","airpods","earbuds","new"]' },
  { name: 'Bose QuietComfort 45',  slug: 'bose-quietcomfort-45',   price: 279.00,  compare_price: 329.00,  stock: 22, brand: 'Bose',   category: 'headphones', is_featured: 0, is_bestseller: 0, is_new: 0, rating: 4.7, review_count: 189, sku: 'BSE-QC45', description: 'Bose QC45 headphones with world-class noise cancellation and 24-hour battery.', tags: '["bose","headphones","anc"]' },

  // Tablets
  { name: 'Samsung Galaxy Tab S9',  slug: 'samsung-galaxy-tab-s9',  price: 799.00, compare_price: null,    stock: 17, brand: 'Samsung', category: 'tablets', is_featured: 0, is_bestseller: 1, is_new: 1, rating: 4.6, review_count: 78,  sku: 'SAM-TS9', description: 'Samsung Galaxy Tab S9 with Dynamic AMOLED 2X display, Snapdragon 8 Gen 2, and IP68 rating.', tags: '["samsung","tablet","android","new"]' },
  { name: 'iPad Air 5th Gen',       slug: 'ipad-air-5th-gen',       price: 599.00, compare_price: 749.00,  stock: 24, brand: 'Apple',   category: 'tablets', is_featured: 0, is_bestseller: 1, is_new: 0, rating: 4.7, review_count: 134, sku: 'APL-IPA5', description: 'iPad Air with M1 chip, 10.9-inch Liquid Retina display and USB-C connectivity.', tags: '["apple","ipad","tablet","sale"]' },

  // Accessories
  { name: 'Anker 65W GaN Charger', slug: 'anker-65w-gan-charger',  price: 39.99,  compare_price: 59.99,  stock: 100, brand: 'Anker', category: 'accessories', is_featured: 0, is_bestseller: 1, is_new: 0, rating: 4.8, review_count: 521, sku: 'ANK-65W', description: 'Anker Nano II 65W GaN compact charger with 3 ports (2 USB-C + 1 USB-A). Charges laptop, phone, tablet simultaneously.', tags: '["anker","charger","usbc","accessories"]' },
  { name: 'Logitech MX Master 3S', slug: 'logitech-mx-master-3s',  price: 99.99,  compare_price: null,   stock: 45,  brand: 'Logitech', category: 'accessories', is_featured: 0, is_bestseller: 1, is_new: 1, rating: 4.9, review_count: 287, sku: 'LGT-MXM3S', description: 'Logitech MX Master 3S with ultra-fast MagSpeed scroll, 8K DPI sensor, and quiet clicks.', tags: '["logitech","mouse","wireless","new"]' },

  // Gaming
  { name: 'PS5 DualSense Controller', slug: 'ps5-dualsense-controller', price: 69.99, compare_price: null, stock: 60, brand: 'Sony', category: 'gaming', is_featured: 0, is_bestseller: 1, is_new: 0, rating: 4.7, review_count: 612, sku: 'SNY-DS5', description: 'PS5 DualSense wireless controller with haptic feedback, adaptive triggers, and built-in microphone.', tags: '["sony","playstation","controller","gaming"]' },
  { name: 'Xbox Series X Console',    slug: 'xbox-series-x',           price: 499.00, compare_price: null, stock: 11, brand: 'Microsoft', category: 'gaming', is_featured: 1, is_bestseller: 0, is_new: 0, rating: 4.8, review_count: 234, sku: 'MSF-XSX', description: 'Xbox Series X — the fastest, most powerful Xbox ever. 12 teraflops, ray tracing, and 120FPS gaming.', tags: '["microsoft","xbox","gaming","console"]' },
];

const insertProduct = db.prepare(`
  INSERT OR IGNORE INTO products
    (name, slug, description, price, compare_price, stock, brand, category_id,
     sku, tags, rating, review_count, is_featured, is_bestseller, is_new,
     image_url, images)
  VALUES
    (@name, @slug, @description, @price, @compare_price, @stock, @brand, @category_id,
     @sku, @tags, @rating, @review_count, @is_featured, @is_bestseller, @is_new,
     @image_url, @images)
`);

products.forEach(p => {
  const cat = getCatId.get(p.category);
  insertProduct.run({
    ...p,
    category_id: cat ? cat.id : null,
    image_url: `/uploads/products/${p.slug}.jpg`,
    images: JSON.stringify([`/uploads/products/${p.slug}.jpg`, `/uploads/products/${p.slug}-2.jpg`]),
  });
});

// ── Admin & Test User ────────────────────────────────────────────────────────
const hash = bcrypt.hashSync('Admin@123', 10);
const customerHash = bcrypt.hashSync('Customer@123', 10);

db.prepare(`INSERT OR IGNORE INTO users (name, email, password, role) VALUES (?, ?, ?, ?)`).run('Admin User', 'admin@electro.com', hash, 'admin');
db.prepare(`INSERT OR IGNORE INTO users (name, email, password, role, phone) VALUES (?, ?, ?, ?, ?)`).run('John Doe', 'john@example.com', customerHash, 'customer', '+1 555 0100');

// ── Coupons ──────────────────────────────────────────────────────────────────
const insertCoupon = db.prepare(`INSERT OR IGNORE INTO coupons (code, type, value, min_order) VALUES (?, ?, ?, ?)`);
insertCoupon.run('ELECTRO10', 'percent', 10, 50);
insertCoupon.run('SAVE20',    'percent', 20, 100);
insertCoupon.run('FLAT50',    'fixed',   50, 200);
insertCoupon.run('WELCOME',   'percent', 15, 0);

console.log(`✅ Seeded ${categories.length} categories, ${products.length} products, 4 coupons`);
console.log('👤 Admin: admin@electro.com / Admin@123');
console.log('👤 Customer: john@example.com / Customer@123');
