// ═══════════════════════════════════════════════════════════════
//  GovWatch Backend — server.js
//  Run:  npm install  →  node server.js
//  API runs on http://localhost:3000
// ═══════════════════════════════════════════════════════════════

require('dotenv').config();
const express   = require('express');
const Database  = require('better-sqlite3');
const bcrypt    = require('bcryptjs');
const jwt       = require('jsonwebtoken');
const cors      = require('cors');
const path      = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'govwatch-secret-change-in-production';

// ── Middleware ─────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
// Serves govwatch/backend/public/index.html at http://localhost:3000
app.use(express.static(path.join(__dirname, 'public')));

// ── Database setup (creates govwatch.db file automatically) ───
const db = new Database('govwatch.db');

// ── Create all tables ─────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    email      TEXT UNIQUE NOT NULL,
    password   TEXT NOT NULL,
    role       TEXT DEFAULT 'viewer',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS schemes (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    name           TEXT NOT NULL,
    ministry       TEXT NOT NULL,
    category       TEXT NOT NULL,
    description    TEXT,
    budget_cr      REAL DEFAULT 0,
    disbursed_cr   REAL DEFAULT 0,
    beneficiaries  TEXT,
    status         TEXT DEFAULT 'active',
    impl_pct       REAL DEFAULT 0,
    created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS states (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT UNIQUE NOT NULL,
    lat          REAL,
    lng          REAL,
    perf_pct     INTEGER DEFAULT 0,
    budget_label TEXT,
    flagged      INTEGER DEFAULT 0,
    updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS state_schemes (
    state_id  INTEGER,
    scheme_id INTEGER,
    PRIMARY KEY (state_id, scheme_id),
    FOREIGN KEY (state_id)  REFERENCES states(id),
    FOREIGN KEY (scheme_id) REFERENCES schemes(id)
  );

  CREATE TABLE IF NOT EXISTS alerts (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    type       TEXT DEFAULT 'warning',
    message    TEXT NOT NULL,
    state      TEXT,
    scheme     TEXT,
    resolved   INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// ── Seed data (only runs once when DB is empty) ────────────────
function seedData() {
  const schemeCount = db.prepare('SELECT COUNT(*) as c FROM schemes').get().c;
  if (schemeCount > 0) return;

  console.log('🌱 Seeding database...');

  const insertScheme = db.prepare(`
    INSERT INTO schemes (name, ministry, category, description, budget_cr, disbursed_cr, beneficiaries, status, impl_pct)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  [
    ['PM Kisan Samman Nidhi',  'Ministry of Agriculture', 'Agriculture', '₹6,000/year direct income support to small & marginal farmers via DBT across all states.', 280000, 280000, '11.8 Cr', 'active',  98.2],
    ['Ayushman Bharat PM-JAY', 'Ministry of Health',      'Health',      '₹5 lakh/family/year health coverage for secondary and tertiary care hospitalisations.',    50000,  43500,  '24.9 Cr', 'active',  87.1],
    ['PM Awas Yojana Urban',   'Ministry of Housing',     'Housing',     'Affordable housing for urban poor through credit-linked subsidy.',                          480000, 345600, '118 L',   'review',  72.0],
    ['Jal Jeevan Mission',     'Jal Shakti Ministry',     'Rural Dev',   'Functional household tap connections to every rural household. Target: 19.3 Cr by 2024.',   360000, 264600, '14.2 Cr', 'flagged', 73.5],
    ['MGNREGA',                'Ministry of Labour',      'Rural Dev',   'Guaranteed 100 days of wage employment per year to rural households.',                      89000,  83660,  '15.4 Cr', 'active',  94.0],
    ['PM Ujjwala Yojana',      'Ministry of Power',       'Rural Dev',   'Free LPG connections to women from BPL households.',                                        14200,  12922,  '9.6 Cr',  'active',  91.0],
    ['Swachh Bharat Mission',  'Ministry of Housing',     'Housing',     'Open defecation free India and solid waste management across all districts.',               62000,  56420,  '60 Cr',   'active',  91.0],
    ['Digital India',          'MeitY',                   'Technology',  'Transform India into a digitally empowered society and knowledge economy.',                 113000, 87610,  '80 Cr',   'active',  77.5],
    ['Skill India',            'Ministry of Labour',      'Education',   'Skill development and vocational training for Indian youth.',                               12000,  9840,   '1.4 Cr',  'active',  82.0],
  ].forEach(s => insertScheme.run(...s));

  const insertState = db.prepare(`
    INSERT INTO states (name, lat, lng, perf_pct, budget_label, flagged)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  [
    ['Uttar Pradesh',     26.85, 80.91, 71, '₹2.1L Cr', 1],
    ['Maharashtra',       19.75, 75.71, 88, '₹1.8L Cr', 0],
    ['Rajasthan',         27.02, 74.21, 64, '₹98K Cr',  1],
    ['Madhya Pradesh',    22.97, 78.65, 79, '₹1.1L Cr', 0],
    ['Bihar',             25.09, 85.31, 66, '₹74K Cr',  1],
    ['West Bengal',       23.58, 87.85, 82, '₹88K Cr',  0],
    ['Tamil Nadu',        11.12, 78.65, 91, '₹1.2L Cr', 0],
    ['Karnataka',         14.51, 75.71, 89, '₹1.0L Cr', 0],
    ['Gujarat',           22.25, 71.19, 93, '₹1.3L Cr', 0],
    ['Punjab',            31.14, 75.34, 84, '₹54K Cr',  0],
    ['Haryana',           29.05, 76.09, 87, '₹62K Cr',  0],
    ['Odisha',            20.94, 84.80, 76, '₹68K Cr',  0],
    ['Telangana',         17.12, 79.01, 90, '₹72K Cr',  0],
    ['Kerala',            10.84, 76.27, 95, '₹48K Cr',  0],
    ['Assam',             26.20, 92.94, 72, '₹42K Cr',  0],
    ['Jharkhand',         23.61, 85.27, 68, '₹38K Cr',  1],
    ['Chhattisgarh',      21.27, 81.86, 77, '₹44K Cr',  0],
    ['Delhi',             28.61, 77.20, 94, '₹32K Cr',  0],
    ['Himachal Pradesh',  31.90, 77.11, 91, '₹18K Cr',  0],
    ['Uttarakhand',       30.06, 79.01, 85, '₹22K Cr',  0],
    ['Andhra Pradesh',    15.91, 79.74, 86, '₹82K Cr',  0],
    ['Goa',               15.29, 74.12, 96, '₹12K Cr',  0],
    ['Tripura',           23.94, 91.98, 73, '₹14K Cr',  0],
    ['Manipur',           24.66, 93.90, 69, '₹11K Cr',  0],
    ['Meghalaya',         25.46, 91.36, 74, '₹12K Cr',  0],
    ['Nagaland',          26.15, 94.56, 67, '₹9K Cr',   1],
    ['Mizoram',           23.17, 92.94, 78, '₹8K Cr',   0],
    ['Sikkim',            27.53, 88.51, 88, '₹6K Cr',   0],
    ['Arunachal Pradesh', 27.10, 93.62, 71, '₹12K Cr',  0],
  ].forEach(s => insertState.run(...s));

  const insertAlert = db.prepare(`
    INSERT INTO alerts (type, message, state, scheme, resolved) VALUES (?, ?, ?, ?, ?)
  `);
  [
    ['error',   'Fund stagnation: ₹420 Cr unspent',        'Rajasthan',     'Jal Jeevan Mission',   0],
    ['warning', 'Target miss risk — Q4 deadline close',     'Uttar Pradesh', 'PM Awas Yojana Urban', 0],
    ['error',   'DBT failure spike detected this week',     'Bihar',         'PM Kisan',             0],
    ['warning', 'Data reporting gap — 3 weeks missing',     'Jharkhand',     'MGNREGA',              0],
    ['info',    'Q3 compliance reports ready: 52 schemes',  null,            null,                   0],
    ['error',   'Implementation below 60% threshold',       'Nagaland',      'Jal Jeevan Mission',   0],
    ['warning', 'Budget utilisation slow — 48% in Q3',      'Manipur',       'MGNREGA',              0],
  ].forEach(a => insertAlert.run(...a));

  // Default admin user — password: admin123
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare('INSERT OR IGNORE INTO users (name, email, password, role) VALUES (?, ?, ?, ?)')
    .run('Admin', 'admin@govwatch.in', hash, 'admin');

  console.log('✅ Database seeded. Admin: admin@govwatch.in / admin123');
}
seedData();


// ════════════════════════════════════════════════════════════════
//  AUTH MIDDLEWARE
// ════════════════════════════════════════════════════════════════
function authMiddleware(req, res, next) {
  const header = req.headers['authorization'];
  if (!header) return res.status(401).json({ error: 'No token provided' });
  const token = header.split(' ')[1];
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') return res.status(403).json({ error: 'Admin only' });
  next();
}


// ════════════════════════════════════════════════════════════════
//  AUTH ROUTES
// ════════════════════════════════════════════════════════════════
app.post('/api/auth/register', (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password)
    return res.status(400).json({ error: 'name, email and password are required' });
  const hash = bcrypt.hashSync(password, 10);
  try {
    const result = db.prepare(
      'INSERT INTO users (name, email, password) VALUES (?, ?, ?)'
    ).run(name, email, hash);
    const token = jwt.sign({ id: result.lastInsertRowid, email, role: 'viewer' }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ message: 'Registered successfully', token });
  } catch {
    res.status(409).json({ error: 'Email already registered' });
  }
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password))
    return res.status(401).json({ error: 'Invalid email or password' });
  const token = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ message: 'Login successful', token, role: user.role, name: user.name });
});


// ════════════════════════════════════════════════════════════════
//  STATS ROUTE  — GET /api/stats
// ════════════════════════════════════════════════════════════════
app.get('/api/stats', (req, res) => {
  const totalSchemes   = db.prepare('SELECT COUNT(*) as c FROM schemes').get().c;
  const activeSchemes  = db.prepare("SELECT COUNT(*) as c FROM schemes WHERE status='active'").get().c;
  const totalBudget    = db.prepare('SELECT SUM(budget_cr) as t FROM schemes').get().t || 0;
  const totalDisbursed = db.prepare('SELECT SUM(disbursed_cr) as t FROM schemes').get().t || 0;
  const activeAlerts   = db.prepare("SELECT COUNT(*) as c FROM alerts WHERE resolved=0").get().c;
  const onTrack        = db.prepare('SELECT COUNT(*) as c FROM states WHERE perf_pct >= 85').get().c;
  const underReview    = db.prepare('SELECT COUNT(*) as c FROM states WHERE perf_pct >= 60 AND perf_pct < 85').get().c;
  const flaggedStates  = db.prepare('SELECT COUNT(*) as c FROM states WHERE perf_pct < 60').get().c;
  res.json({
    totalSchemes, activeSchemes,
    totalBudgetCr:    Math.round(totalBudget),
    totalDisbursedCr: Math.round(totalDisbursed),
    implRate:         totalBudget > 0 ? +((totalDisbursed / totalBudget) * 100).toFixed(1) : 0,
    activeAlerts,
    states: { onTrack, underReview, flagged: flaggedStates }
  });
});


// ════════════════════════════════════════════════════════════════
//  SCHEMES ROUTES
//  GET    /api/schemes           ?category= ?status=
//  GET    /api/schemes/:id
//  POST   /api/schemes           (admin)
//  PUT    /api/schemes/:id       (admin)
//  DELETE /api/schemes/:id       (admin)
// ════════════════════════════════════════════════════════════════
app.get('/api/schemes', (req, res) => {
  const { category, status } = req.query;
  let query = 'SELECT * FROM schemes';
  const params = [], filters = [];
  if (category) { filters.push('category = ?'); params.push(category); }
  if (status)   { filters.push('status = ?');   params.push(status); }
  if (filters.length) query += ' WHERE ' + filters.join(' AND ');
  query += ' ORDER BY created_at DESC';
  res.json(db.prepare(query).all(...params));
});

app.get('/api/schemes/:id', (req, res) => {
  const scheme = db.prepare('SELECT * FROM schemes WHERE id = ?').get(req.params.id);
  if (!scheme) return res.status(404).json({ error: 'Scheme not found' });
  res.json(scheme);
});

app.post('/api/schemes', authMiddleware, adminOnly, (req, res) => {
  const { name, ministry, category, description, budget_cr, disbursed_cr, beneficiaries, status, impl_pct } = req.body;
  if (!name || !ministry || !category)
    return res.status(400).json({ error: 'name, ministry and category are required' });
  const result = db.prepare(`
    INSERT INTO schemes (name, ministry, category, description, budget_cr, disbursed_cr, beneficiaries, status, impl_pct)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(name, ministry, category, description||'', budget_cr||0, disbursed_cr||0, beneficiaries||'', status||'active', impl_pct||0);
  res.status(201).json({ message: 'Scheme created', id: result.lastInsertRowid });
});

app.put('/api/schemes/:id', authMiddleware, adminOnly, (req, res) => {
  const { name, ministry, category, description, budget_cr, disbursed_cr, beneficiaries, status, impl_pct } = req.body;
  const result = db.prepare(`
    UPDATE schemes SET name=?, ministry=?, category=?, description=?, budget_cr=?,
    disbursed_cr=?, beneficiaries=?, status=?, impl_pct=?, updated_at=CURRENT_TIMESTAMP
    WHERE id=?
  `).run(name, ministry, category, description, budget_cr, disbursed_cr, beneficiaries, status, impl_pct, req.params.id);
  if (!result.changes) return res.status(404).json({ error: 'Scheme not found' });
  res.json({ message: 'Scheme updated' });
});

app.delete('/api/schemes/:id', authMiddleware, adminOnly, (req, res) => {
  const result = db.prepare('DELETE FROM schemes WHERE id = ?').run(req.params.id);
  if (!result.changes) return res.status(404).json({ error: 'Scheme not found' });
  res.json({ message: 'Scheme deleted' });
});


// ════════════════════════════════════════════════════════════════
//  STATES ROUTES
//  GET /api/states
//  GET /api/states/:name
//  PUT /api/states/:id    (admin)
// ════════════════════════════════════════════════════════════════
app.get('/api/states', (req, res) => {
  const states = db.prepare('SELECT * FROM states ORDER BY perf_pct DESC').all();
  const stateSchemes = db.prepare(`
    SELECT ss.state_id, s.name FROM state_schemes ss JOIN schemes s ON s.id = ss.scheme_id
  `).all();
  const schemeMap = {};
  stateSchemes.forEach(r => {
    if (!schemeMap[r.state_id]) schemeMap[r.state_id] = [];
    schemeMap[r.state_id].push(r.name);
  });
  res.json(states.map(s => ({ ...s, schemes: schemeMap[s.id] || [] })));
});

app.get('/api/states/:name', (req, res) => {
  const state = db.prepare('SELECT * FROM states WHERE name = ?').get(req.params.name);
  if (!state) return res.status(404).json({ error: 'State not found' });
  res.json(state);
});

app.put('/api/states/:id', authMiddleware, adminOnly, (req, res) => {
  const { perf_pct, budget_label, flagged } = req.body;
  db.prepare('UPDATE states SET perf_pct=?, budget_label=?, flagged=?, updated_at=CURRENT_TIMESTAMP WHERE id=?')
    .run(perf_pct, budget_label, flagged ? 1 : 0, req.params.id);
  res.json({ message: 'State updated' });
});


// ════════════════════════════════════════════════════════════════
//  ALERTS ROUTES
//  GET   /api/alerts            ?resolved=true/false
//  POST  /api/alerts            (admin)
//  PATCH /api/alerts/:id/resolve (admin)
//  DELETE /api/alerts/:id       (admin)
// ════════════════════════════════════════════════════════════════
app.get('/api/alerts', (req, res) => {
  const val = req.query.resolved === 'true' ? 1 : 0;
  res.json(db.prepare('SELECT * FROM alerts WHERE resolved=? ORDER BY created_at DESC').all(val));
});

app.post('/api/alerts', authMiddleware, adminOnly, (req, res) => {
  const { type, message, state, scheme } = req.body;
  if (!message) return res.status(400).json({ error: 'message is required' });
  const result = db.prepare('INSERT INTO alerts (type, message, state, scheme) VALUES (?, ?, ?, ?)')
    .run(type||'warning', message, state||null, scheme||null);
  res.status(201).json({ message: 'Alert created', id: result.lastInsertRowid });
});

app.post('/api/grievances', (req, res) => {
  const { message, state, scheme } = req.body;
  if (!message) return res.status(400).json({ error: 'message is required' });
  const result = db.prepare('INSERT INTO alerts (type, message, state, scheme) VALUES (?, ?, ?, ?)')
    .run('error', 'User Report: ' + message, state||null, scheme||null);
  res.status(201).json({ message: 'Grievance reported successfully' });
});

app.patch('/api/alerts/:id/resolve', authMiddleware, adminOnly, (req, res) => {
  const result = db.prepare('UPDATE alerts SET resolved=1 WHERE id=?').run(req.params.id);
  if (!result.changes) return res.status(404).json({ error: 'Alert not found' });
  res.json({ message: 'Alert resolved' });
});

app.delete('/api/alerts/:id', authMiddleware, adminOnly, (req, res) => {
  db.prepare('DELETE FROM alerts WHERE id=?').run(req.params.id);
  res.json({ message: 'Alert deleted' });
});


// ════════════════════════════════════════════════════════════════
//  USERS ROUTES (admin only)
//  GET    /api/users
//  DELETE /api/users/:id
// ════════════════════════════════════════════════════════════════
app.get('/api/users', authMiddleware, adminOnly, (req, res) => {
  res.json(db.prepare('SELECT id, name, email, role, created_at FROM users').all());
});

app.delete('/api/users/:id', authMiddleware, adminOnly, (req, res) => {
  db.prepare('DELETE FROM users WHERE id=?').run(req.params.id);
  res.json({ message: 'User deleted' });
});


// ════════════════════════════════════════════════════════════════
//  404
// ════════════════════════════════════════════════════════════════
app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found` });
});


// ════════════════════════════════════════════════════════════════
//  START
// ════════════════════════════════════════════════════════════════
app.listen(PORT, () => {
  console.log(`
  ╔══════════════════════════════════════════╗
  ║   GovWatch API running on :${PORT}          ║
  ║   Open → http://localhost:${PORT}           ║
  ║   Admin → admin@govwatch.in / admin123  ║
  ╚══════════════════════════════════════════╝
  `);
});