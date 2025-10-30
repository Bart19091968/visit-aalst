/* eslint-disable */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const multer = require('multer');
const { customAlphabet } = require('nanoid');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'storage');
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(DATA_DIR, 'uploads');
const BASE_URL = process.env.BASE_URL || ''; // e.g. "https://example.com" (optional, for returned URLs)

const nanoid = customAlphabet('123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz', 10);

app.use(cors());
app.use(express.json({ limit: '2mb' })); // answers payload
app.use('/uploads', express.static(UPLOAD_DIR));

// ensure directories exist
for (const dir of [DATA_DIR, UPLOAD_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// Multer setup for uploads per participant
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const pid = req.params.participantId;
    const dest = path.join(UPLOAD_DIR, pid);
    fs.mkdirSync(dest, { recursive: true });
    cb(null, dest);
  },
  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname) || '.bin';
    const id = nanoid();
    cb(null, `${Date.now()}_${id}${ext}`);
  }
});
const upload = multer({ storage });

// Helper to get path for a participant JSON
function jsonPathFor(pid) {
  return path.join(DATA_DIR, `${pid}.json`);
}

// Create participant
app.post('/api/participants', async (req, res) => {
  try {
    const { name } = req.body || {};
    const id = nanoid();
    const now = new Date().toISOString();
    const record = {
      id, name: name || null,
      created_at: now,
      answers: [], roles: null, photoMap: {},
    };
    await fsp.writeFile(jsonPathFor(id), JSON.stringify(record, null, 2), 'utf-8');
    return res.json({ id, name: record.name, created_at: now });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to create participant' });
  }
});

// Get participant answers
app.get('/api/answers/:participantId', async (req, res) => {
  try {
    const pid = req.params.participantId;
    const file = jsonPathFor(pid);
    if (!fs.existsSync(file)) return res.status(404).json({ error: 'Not found' });
    const raw = await fsp.readFile(file, 'utf-8');
    return res.type('json').send(raw);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to read data' });
  }
});

// Save participant answers
app.post('/api/answers/:participantId', async (req, res) => {
  try {
    const pid = req.params.participantId;
    const file = jsonPathFor(pid);
    const payload = req.body || {};
    const current = fs.existsSync(file) ? JSON.parse(await fsp.readFile(file, 'utf-8')) : { id: pid };
    const merged = {
      id: pid,
      name: payload.name || current.name || null,
      created_at: current.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
      answers: Array.isArray(payload.answers) ? payload.answers : current.answers || [],
      roles: payload.roles || current.roles || null,
      photoMap: payload.photoMap || current.photoMap || {},
    };
    await fsp.writeFile(file, JSON.stringify(merged, null, 2), 'utf-8');
    return res.json({ ok: true, updated_at: merged.updated_at });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Failed to save data' });
  }
});

// Upload photos for a participant (multiple files)
app.post('/api/upload/:participantId', upload.array('photos', 20), async (req, res) => {
  try {
    const pid = req.params.participantId;
    const files = req.files || [];
    const urls = files.map(f => {
      const rel = `/uploads/${pid}/${path.basename(f.path)}`;
      return (BASE_URL ? `${BASE_URL}${rel}` : rel);
    });
    return res.json({ uploaded: urls });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Upload failed' });
  }
});

// Serve client (optional: if you copy client to server/public)
app.use(express.static(path.join(__dirname, '../client')));

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
