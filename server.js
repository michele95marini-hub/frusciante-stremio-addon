// server_tizen_compatible.js
// Version: 1.0.1
// Modifiche: Rimosso app.use(compression()) e aggiunto poster/logo per compatibilità TV.

const express = require('express');
const cors = require('cors');
// const compression = require('compression'); // 🛑 RIMOSSO PER COMPATIBILITÀ CON SMART TV
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
// Imposta BASE_URL esplicito per evitare problemi di rilevamento host da WebView TV
const BASE_URL = process.env.BASE_URL || 'https://frusciante-stremio-addon.onrender.com';

// Dipendenze e middleware
app.use(cors());
app.use(express.json());
// app.use(compression()); // 🛑 RIMOSSO

// Header espliciti (Tizen richiede Content-Type preciso e CORS permissivo)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  // Tizen richiede spesso esattamente application/json (senza charset)
  res.setHeader('Content-Type', 'application/json');
  next();
});

app.options('*', (req, res) => {
  res.sendStatus(200);
});

// Carica i JSON (assicurati che i file siano nella stessa cartella)
let filmsCorti = require('./films-corti.json');
let filmsLunghi = require('./films-lunghi.json');

// Config paginazione
const PAGE_SIZE = 100; // numero di metas per pagina

// Cache per shuffle con timestamp
let cache = {
  corti: { films: [], lastShuffle: 0 },
  lunghi: { films: [], lastShuffle: 0 }
};

function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function shouldShuffle(lastShuffleTime) {
  const now = Date.now();
  const twelveHours = 12 * 60 * 60 * 1000;
  return (now - lastShuffleTime) > twelveHours;
}

function ensureShuffled(type) {
  const key = type === 'corti' ? 'corti' : 'lunghi';
  if (!cache[key].films || cache[key].films.length === 0 || shouldShuffle(cache[key].lastShuffle)) {
    const source = type === 'corti' ? filmsCorti.meta : filmsLunghi.meta;
    cache[key].films = shuffleArray(source);
    cache[key].lastShuffle = Date.now();
    console.log(`🔀 Shuffled ${type}: ${cache[key].films.length} items. Next shuffle at ${new Date(cache[key].lastShuffle + 12*60*60*1000).toISOString()}`);
  }
}

function getPage(array, skip) {
  const s = Math.max(0, parseInt(skip) || 0);
  const page = array.slice(s, s + PAGE_SIZE);

  // 🎯 MODIFICA CHIAVE: FORZA L'INCLUSIONE DI POSTER E LOGO
  // Questo bypassa il problema del caricamento dei metadati sulla TV.
  return page.map(film => ({
    ...film,
    // Usiamo l'endpoint metahub per risolvere l'immagine da ID IMDb
    poster: film.id ? `https://images.metahub.space/poster/medium/${film.id}` : undefined,
    logo: film.id ? `https://images.metahub.space/logo/medium/${film.id}` : undefined,
  }));
}

// Helper per inviare json forzando Content-Type preciso
function sendJson(res, obj) {
  // si sovrascrive l'header per essere sicuri
  res.setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(obj));
}

// ----------------- MANIFESTS -----------------
app.get('/corti/manifest.json', (req, res) => {
  const manifest = {
    id: 'com.frusciante.corti',
    version: '1.0.1',
    name: 'Frusciante -120 min',
    description: 'Film collection under 120 minutes (3+ stars) - Shuffled every 12 hours',
    logo: 'https://via.placeholder.com/256x256/00e054/ffffff?text=F-120',
    resources: ['catalog'],
    types: ['movie'],
    catalogs: [
      { type: 'movie', id: 'frusciante_corti', name: 'Frusciante -120 min', extra: [{ name: 'skip', isRequired: false }] }
    ]
  };
  sendJson(res, manifest);
});

app.get('/lunghi/manifest.json', (req, res) => {
  const manifest = {
    id: 'com.frusciante.lunghi',
    version: '1.0.1',
    name: 'Frusciante +120 min',
    description: 'Film collection 120+ minutes (3+ stars) - Shuffled every 12 hours',
    logo: 'https://via.placeholder.com/256x256/00e054/ffffff?text=F%2B120',
    resources: ['catalog'],
    types: ['movie'],
    catalogs: [
      { type: 'movie', id: 'frusciante_lunghi', name: 'Frusciante +120 min', extra: [{ name: 'skip', isRequired: false }] }
    ]
  };
  sendJson(res, manifest);
});

// ----------------- CATALOGS (paginati) -----------------
// Route compatibile sia con path param skip=... sia con query ?skip=...

app.get('/corti/catalog/movie/frusciante_corti.json', (req, res) => {
  ensureShuffled('corti');
  const page = getPage(cache.corti.films, 0);
  sendJson(res, { metas: page });
});

app.get('/corti/catalog/movie/frusciante_corti/skip=:skip.json', (req, res) => {
  ensureShuffled('corti');
  const skip = req.params.skip || 0;
  const page = getPage(cache.corti.films, skip);
  sendJson(res, { metas: page });
});

// Supporto query param: /corti/catalog/movie/frusciante_corti.json?skip=100
app.get('/corti/catalog/movie/frusciante_corti', (req, res) => {
  ensureShuffled('corti');
  const skip = req.query.skip || 0;
  const page = getPage(cache.corti.films, skip);
  sendJson(res, { metas: page });
});

// Lunghi
app.get('/lunghi/catalog/movie/frusciante_lunghi.json', (req, res) => {
  ensureShuffled('lunghi');
  const page = getPage(cache.lunghi.films, 0);
  sendJson(res, { metas: page });
});

app.get('/lunghi/catalog/movie/frusciante_lunghi/skip=:skip.json', (req, res) => {
  ensureShuffled('lunghi');
  const skip = req.params.skip || 0;
  const page = getPage(cache.lunghi.films, skip);
  sendJson(res, { metas: page });
});

app.get('/lunghi/catalog/movie/frusciante_lunghi', (req, res) => {
  ensureShuffled('lunghi');
  const skip = req.query.skip || 0;
  const page = getPage(cache.lunghi.films, skip);
  sendJson(res, { metas: page });
});

// ----------------- INFO & HEALTH -----------------
app.get('/', (req, res) => {
  const info = {
    name: 'Frusciante Stremio Addons',
    version: '1.0.1',
    description: 'Two addons for film collections (3+ stars) with 12h random shuffle (Tizen optimized)',
    addons: [
      { name: 'Frusciante -120 min', manifest: `${BASE_URL}/corti/manifest.json`, films: filmsCorti.meta.length },
      { name: 'Frusciante +120 min', manifest: `${BASE_URL}/lunghi/manifest.json`, films: filmsLunghi.meta.length }
    ],
    status: 'online',
    lastShuffleCorti: new Date(cache.corti.lastShuffle).toISOString(),
    lastShuffleLunghi: new Date(cache.lunghi.lastShuffle).toISOString()
  };
  sendJson(res, info);
});

app.get('/health', (req, res) => {
  sendJson(res, { status: 'ok', timestamp: new Date().toISOString() });
});

// Start server
app.listen(PORT, () => {
  console.log('🎬 Frusciante Stremio Addons Server (Tizen-optimized - v1.0.1)');
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📦 Films corti: ${filmsCorti.meta.length}`);
  console.log(`📦 Films lunghi: ${filmsLunghi.meta.length}`);
  console.log(`🔗 Base URL: ${BASE_URL}`);
  console.log('🔀 Random shuffle every 12 hours');
});
