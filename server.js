const express = require('express');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcrypt');
const session = require('express-session');

const app = express();
const PORT = 3000;
const DATA_DIR = path.join(__dirname, 'public', 'data');

const dataFiles = {
  users: path.join(DATA_DIR, 'users.json'),
  games: path.join(DATA_DIR, 'games.json'),
  assets: path.join(DATA_DIR, 'assets.json'),
  groups: path.join(DATA_DIR, 'groups.json'),
  sessions: path.join(DATA_DIR, 'sessions.json')
};

function ensureDataFiles() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const defaults = { users: [], games: [], assets: [], groups: [], sessions: [] };
  Object.entries(dataFiles).forEach(([key, file]) => {
    if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(defaults[key], null, 2));
  });
}
const readJson = (f) => JSON.parse(fs.readFileSync(f, 'utf8'));
const writeJson = (f, d) => fs.writeFileSync(f, JSON.stringify(d, null, 2));
const escapeHtml = (s = '') => String(s).replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));

const usernameValid = (u) => /^[a-zA-Z0-9_]{3,20}$/.test(u);
const passwordValid = (p) => typeof p === 'string' && p.length >= 6;
const requireAuth = (req, res, next) => req.session.user ? next() : res.status(401).json({ error: 'Login required.' });

ensureDataFiles();
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(session({ secret: 'playsculpt-mvp-secret', resave: false, saveUninitialized: false, cookie: { maxAge: 7 * 24 * 3600 * 1000 } }));
app.use(express.static(path.join(__dirname, 'public')));

const pages = ['landing.html','creatorslanding.html','signup.html','login.html','dashboard.html','games.html','createonplaysculpt.html','editor.html','marketplace.html','groups.html','upload.html','about.html'];
app.get('/', (req, res) => res.redirect('/landing.html'));
pages.forEach((p) => app.get(`/${p}`, (req, res) => res.sendFile(path.join(__dirname, 'public', 'pages', p))));

app.get('/game/:id', (req, res) => res.sendFile(path.join(__dirname, 'public', 'pages', 'game.html')));
app.get('/group/:id', (req, res) => res.sendFile(path.join(__dirname, 'public', 'pages', 'group.html')));
app.get('/profile/:username', (req, res) => res.sendFile(path.join(__dirname, 'public', 'pages', 'profile.html')));

app.post('/api/signup', async (req, res) => {
  const { username, displayName, password, confirmPassword } = req.body;
  if (!usernameValid(username)) return res.status(400).json({ error: 'Username must be 3-20 characters and letters/numbers/_ only.' });
  if (!passwordValid(password)) return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  if (password !== confirmPassword) return res.status(400).json({ error: 'Passwords do not match.' });
  const users = readJson(dataFiles.users);
  if (users.some((u) => u.username.toLowerCase() === username.toLowerCase())) return res.status(409).json({ error: 'Username already taken.' });
  const passwordHash = await bcrypt.hash(password, 10);
  const user = { username, passwordHash, displayName: escapeHtml(displayName || username), bio: '', avatarColors: { head: '#ffd59e', body: '#5577ff' }, sculptCoins: 200, ownedGames: [], ownedAssets: [], joinedGroups: [], createdAt: new Date().toISOString() };
  users.push(user); writeJson(dataFiles.users, users);
  req.session.user = { username: user.username };
  res.json({ ok: true });
});
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const users = readJson(dataFiles.users);
  const user = users.find((u) => u.username === username);
  if (!user || !(await bcrypt.compare(password || '', user.passwordHash))) return res.status(401).json({ error: 'Invalid login.' });
  req.session.user = { username: user.username };
  res.json({ ok: true });
});
app.post('/api/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));
app.get('/api/me', (req, res) => {
  if (!req.session.user) return res.json({ user: null });
  const user = readJson(dataFiles.users).find((u) => u.username === req.session.user.username);
  if (!user) return res.json({ user: null });
  const { passwordHash, ...safe } = user;
  res.json({ user: safe });
});

app.get('/api/games', (req, res) => res.json(readJson(dataFiles.games).filter((g) => g.published || (req.session.user && g.creator === req.session.user.username))));
app.get('/api/games/:id', (req, res) => {
  const game = readJson(dataFiles.games).find((g) => g.id === req.params.id);
  if (!game) return res.status(404).json({ error: 'Game not found.' });
  if (!game.published && (!req.session.user || req.session.user.username !== game.creator)) return res.status(403).json({ error: 'Not available.' });
  res.json(game);
});
app.post('/api/games/create', requireAuth, (req, res) => {
  const games = readJson(dataFiles.games); const users = readJson(dataFiles.users);
  const id = `game_${Date.now()}`;
  const game = { id, name: 'My New Game', description: 'Start small. Build bigger.', creator: req.session.user.username, published: false, visits: 0, likes: 0, objects: [{ id: 'spawn_1', type: 'spawn', position: { x: 0, y: 1, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, color: '#ffff66', behavior: 'spawn' }] };
  games.push(game); writeJson(dataFiles.games, games);
  const u = users.find((x) => x.username === req.session.user.username); if (u) { u.ownedGames.push(id); writeJson(dataFiles.users, users); }
  res.json(game);
});
app.post('/api/games/:id/save', requireAuth, (req, res) => {
  const games = readJson(dataFiles.games); const game = games.find((g) => g.id === req.params.id);
  if (!game) return res.status(404).json({ error: 'Game not found.' });
  if (game.creator !== req.session.user.username) return res.status(403).json({ error: 'Only owner can save.' });
  game.name = escapeHtml(req.body.name || game.name); game.description = escapeHtml(req.body.description || game.description);
  if (Array.isArray(req.body.objects)) game.objects = req.body.objects;
  writeJson(dataFiles.games, games); res.json({ ok: true, game });
});
app.post('/api/games/:id/publish', requireAuth, (req, res) => {
  const games = readJson(dataFiles.games); const game = games.find((g) => g.id === req.params.id);
  if (!game) return res.status(404).json({ error: 'Game not found.' });
  if (game.creator !== req.session.user.username) return res.status(403).json({ error: 'Only owner can publish.' });
  game.published = true; writeJson(dataFiles.games, games); res.json({ ok: true });
});

app.get('/api/assets', (req, res) => res.json(readJson(dataFiles.assets)));
app.post('/api/assets/upload', requireAuth, (req, res) => {
  const assets = readJson(dataFiles.assets);
  const item = { id: `asset_${Date.now()}`, name: escapeHtml(req.body.name || 'Untitled Asset'), creator: req.session.user.username, price: Number(req.body.price || 0), type: escapeHtml(req.body.type || 'model') };
  assets.push(item); writeJson(dataFiles.assets, assets); res.json({ ok: true, asset: item });
});
app.get('/api/groups', (req, res) => res.json(readJson(dataFiles.groups)));
app.post('/api/groups/create', requireAuth, (req, res) => {
  const groups = readJson(dataFiles.groups);
  const group = { id: `group_${Date.now()}`, name: escapeHtml(req.body.name || 'New Group'), description: escapeHtml(req.body.description || ''), owner: req.session.user.username, members: [req.session.user.username], groupGames: [] };
  groups.push(group); writeJson(dataFiles.groups, groups); res.json({ ok: true, group });
});
app.post('/api/groups/:id/join', requireAuth, (req, res) => {
  const groups = readJson(dataFiles.groups); const g = groups.find((x) => x.id === req.params.id);
  if (!g) return res.status(404).json({ error: 'Group not found.' });
  if (!g.members.includes(req.session.user.username)) g.members.push(req.session.user.username);
  writeJson(dataFiles.groups, groups); res.json({ ok: true });
});
app.post('/api/marketplace/list', requireAuth, (req, res) => app._router.handle({ ...req, body: req.body }, res, () => {}));
app.post('/api/marketplace/buy', requireAuth, (req, res) => res.json({ ok: true, message: 'Purchase placeholder complete.' }));

app.listen(PORT, () => console.log(`Playsculpt server running on http://localhost:${PORT}`));
