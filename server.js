const express = require('express');
const fs      = require('fs');
const path    = require('path');

const app      = express();
const PORT     = process.env.PORT || 3000;
// On Render, use the persistent disk at /data — otherwise store next to server.js
const DATA_FILE = fs.existsSync('/data') ? '/data/data.json' : path.join(__dirname, 'data.json');

const DEFAULT_DATA = {
    users: [
        { id: 'u1', username: 'mamda006.310', password: 'HelloAbbas2023!', name: 'Abbas M',  role: 'admin' },
        { id: 'u2', username: 'zjets988',     password: 'ZahraJets2024!',  name: 'Zahra J',  role: 'staff' },
    ],
    inventory: [
        { id: 'p1', name: 'Shia Deal Standard Pack',      sku: 'SD-001', price: 12.99, qty: 48, threshold: 10, notes: '' },
        { id: 'p2', name: 'Shia Deal Deluxe Pack',        sku: 'SD-002', price: 19.99, qty: 22, threshold:  8, notes: '' },
        { id: 'p3', name: 'Shia Deal Expansion Pack',     sku: 'SD-EXP', price:  8.99, qty:  7, threshold: 10, notes: 'Running low — reorder soon' },
        { id: 'p4', name: 'Shia Deal Bundle (Std + Exp)', sku: 'SD-BUN', price: 19.99, qty:  3, threshold:  5, notes: '' },
    ],
    orders: [],
};

if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(DEFAULT_DATA, null, 2));
    console.log('Created data.json with default data');
}

function readData()   { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')); }
function writeData(d) { fs.writeFileSync(DATA_FILE, JSON.stringify(d, null, 2)); }

app.use(express.json());
app.use(express.static(__dirname));

// Allow Cloudflare Pages (and any other origin) to call the API
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, PUT, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    next();
});

app.get('/api/health',    (req, res) => res.json({ ok: true }));
app.get('/api/orders',    (req, res) => res.json(readData().orders));
app.get('/api/inventory', (req, res) => res.json(readData().inventory));
app.get('/api/users',     (req, res) => res.json(readData().users));

app.put('/api/orders',    (req, res) => { const d = readData(); d.orders    = req.body; writeData(d); res.json(d.orders);    });
app.put('/api/inventory', (req, res) => { const d = readData(); d.inventory = req.body; writeData(d); res.json(d.inventory); });
app.put('/api/users',     (req, res) => { const d = readData(); d.users     = req.body; writeData(d); res.json(d.users);     });

app.post('/api/reset', (req, res) => { writeData(DEFAULT_DATA); res.json({ ok: true }); });

app.listen(PORT, () => console.log('QD Admin running -> http://localhost:' + PORT));
