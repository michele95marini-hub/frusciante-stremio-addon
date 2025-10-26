const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const TMDB_API_KEY = process.env.TMDB_API_KEY || ''; // API Key da environment variable

// Abilita CORS per Stremio
app.use(cors());

// Carica i JSON dei film
let filmsCorti = require('./films-corti.json');
let filmsLunghi = require('./films-lunghi.json');

// Cache per poster TMDB (evita troppe richieste)
const posterCache = new Map();

// Cache per l'ordine shuffled con timestamp
let cache = {
  corti: {
    films: [],
    lastShuffle: 0
  },
  lunghi: {
    films: [],
    lastShuffle: 0
  }
};

// Funzione per shuffle array (Fisher-Yates)
function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// Funzione per verificare se sono passate 12 ore
function shouldShuffle(lastShuffleTime) {
  const now = Date.now();
  const twelveHours = 12 * 60 * 60 * 1000; // 12 ore in millisecondi
  return (now - lastShuffleTime) > twelveHours;
}

// Funzione per ottenere poster da TMDB usando IMDb ID
async function getPosterFromTMDB(imdbId) {
  // Controlla cache
  if (posterCache.has(imdbId)) {
    return posterCache.get(imdbId);
  }

  if (!TMDB_API_KEY) {
    return null; // Nessuna API key configurata
  }

  try {
    // Rimuovi "tt" dall'inizio se presente
    const cleanId = imdbId.replace(/^tt/, '');
    
    // Chiama API TMDB per trovare il film tramite IMDb ID
    const findUrl = `https://api.themoviedb.org/3/find/tt${cleanId}?api_key=${TMDB_API_KEY}&external_source=imdb_id`;
    const findResponse = await fetch(findUrl);
    const findData = await findResponse.json();

    if (findData.movie_results && findData.movie_results.length > 0) {
      const movie = findData.movie_results[0];
      const posterPath = movie.poster_path;
      
      if (posterPath) {
        const posterUrl = `https://image.tmdb.org/t/p/w500${posterPath}`;
        posterCache.set(imdbId, posterUrl);
        return posterUrl;
      }
    }

    posterCache.set(imdbId, null);
    return null;
  } catch (error) {
    console.error(`Error fetching poster for ${imdbId}:`, error.message);
    return null;
  }
}

// Funzione per arricchire film con poster
async function enrichFilmsWithPosters(films) {
  const enriched = [];
  
  for (const film of films) {
    const poster = await getPosterFromTMDB(film.id);
    enriched.push({
      ...film,
      poster: poster || undefined // undefined = Stremio usa default
    });
  }
  
  return enriched;
}

// Funzione per ottenere film con shuffle ogni 12h
function getShuffledFilms(type) {
  const cacheKey = type === 'corti' ? 'corti' : 'lunghi';
  
  // Verifica se serve un nuovo shuffle
  if (cache[cacheKey].films.length === 0 || shouldShuffle(cache[cacheKey].lastShuffle)) {
    console.log(`🔀 Shuffling ${type} films...`);
    const sourceFilms = type === 'corti' ? filmsCorti.meta : filmsLunghi.meta;
    cache[cacheKey].films = shuffleArray(sourceFilms);
    cache[cacheKey].lastShuffle = Date.now();
    
    const nextShuffle = new Date(cache[cacheKey].lastShuffle + 12 * 60 * 60 * 1000);
    console.log(`✅ ${type}: ${cache[cacheKey].films.length} films shuffled`);
    console.log(`⏰ Next shuffle: ${nextShuffle.toISOString()}`);
  }
  
  return cache[cacheKey].films;
}

// ========== ADDON CORTI (< 120 min) ==========

// Manifest per addon corti
app.get('/corti/manifest.json', (req, res) => {
  res.json({
    id: 'com.frusciante.corti',
    version: '1.0.0',
    name: 'Frusciante -120 min',
    description: 'Film collection under 120 minutes (3+ stars) - Shuffled every 12 hours',
    logo: 'https://via.placeholder.com/256x256/00e054/ffffff?text=F-120',
    resources: ['catalog'],
    types: ['movie'],
    catalogs: [
      {
        type: 'movie',
        id: 'frusciante_corti',
        name: 'Frusciante -120 min',
        extra: [{ name: 'skip', isRequired: false }]
      }
    ]
  });
});

// Catalog per addon corti
app.get('/corti/catalog/movie/frusciante_corti.json', async (req, res) => {
  try {
    const shuffledFilms = getShuffledFilms('corti');
    const filmsWithPosters = await enrichFilmsWithPosters(shuffledFilms.slice(0, 100));
    res.json({
      metas: filmsWithPosters
    });
  } catch (error) {
    console.error('Error in corti catalog:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/corti/catalog/movie/frusciante_corti/skip=:skip.json', async (req, res) => {
  try {
    const shuffledFilms = getShuffledFilms('corti');
    const skip = parseInt(req.params.skip) || 0;
    const slicedFilms = shuffledFilms.slice(skip, skip + 100);
    const filmsWithPosters = await enrichFilmsWithPosters(slicedFilms);
    
    res.json({
      metas: filmsWithPosters
    });
  } catch (error) {
    console.error('Error in corti catalog with skip:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ========== ADDON LUNGHI (≥ 120 min) ==========

// Manifest per addon lunghi
app.get('/lunghi/manifest.json', (req, res) => {
  res.json({
    id: 'com.frusciante.lunghi',
    version: '1.0.0',
    name: 'Frusciante +120 min',
    description: 'Film collection 120+ minutes (3+ stars) - Shuffled every 12 hours',
    logo: 'https://via.placeholder.com/256x256/00e054/ffffff?text=F%2B120',
    resources: ['catalog'],
    types: ['movie'],
    catalogs: [
      {
        type: 'movie',
        id: 'frusciante_lunghi',
        name: 'Frusciante +120 min',
        extra: [{ name: 'skip', isRequired: false }]
      }
    ]
  });
});

// Catalog per addon lunghi
app.get('/lunghi/catalog/movie/frusciante_lunghi.json', async (req, res) => {
  try {
    const shuffledFilms = getShuffledFilms('lunghi');
    const filmsWithPosters = await enrichFilmsWithPosters(shuffledFilms.slice(0, 100));
    res.json({
      metas: filmsWithPosters
    });
  } catch (error) {
    console.error('Error in lunghi catalog:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/lunghi/catalog/movie/frusciante_lunghi/skip=:skip.json', async (req, res) => {
  try {
    const shuffledFilms = getShuffledFilms('lunghi');
    const skip = parseInt(req.params.skip) || 0;
    const slicedFilms = shuffledFilms.slice(skip, skip + 100);
    const filmsWithPosters = await enrichFilmsWithPosters(slicedFilms);
    
    res.json({
      metas: filmsWithPosters
    });
  } catch (error) {
    console.error('Error in lunghi catalog with skip:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ========== INFO & HEALTH CHECK ==========

app.get('/', (req, res) => {
  res.json({
    name: 'Frusciante Stremio Addons',
    version: '1.0.0',
    description: 'Two addons for film collections (3+ stars) with 12h random shuffle and TMDB posters',
    addons: [
      {
        name: 'Frusciante -120 min',
        manifest: `${req.protocol}://${req.get('host')}/corti/manifest.json`,
        films: filmsCorti.meta.length
      },
      {
        name: 'Frusciante +120 min',
        manifest: `${req.protocol}://${req.get('host')}/lunghi/manifest.json`,
        films: filmsLunghi.meta.length
      }
    ],
    status: 'online',
    tmdbEnabled: !!TMDB_API_KEY,
    postersCached: posterCache.size,
    lastShuffleCorti: new Date(cache.corti.lastShuffle).toISOString(),
    lastShuffleLunghi: new Date(cache.lunghi.lastShuffle).toISOString()
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    tmdbConfigured: !!TMDB_API_KEY
  });
});

// ========== START SERVER ==========

app.listen(PORT, () => {
  console.log('🎬 Frusciante Stremio Addons Server');
  console.log('=====================================');
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📦 Films corti: ${filmsCorti.meta.length}`);
  console.log(`📦 Films lunghi: ${filmsLunghi.meta.length}`);
  console.log(`🎨 TMDB API: ${TMDB_API_KEY ? 'Configured ✅' : 'Not configured ⚠️'}`);
  console.log('');
  console.log('📡 Addon URLs:');
  console.log(`   Corti:  http://localhost:${PORT}/corti/manifest.json`);
  console.log(`   Lunghi: http://localhost:${PORT}/lunghi/manifest.json`);
  console.log('');
  console.log('🔀 Random shuffle: Every 12 hours');
  console.log('🎨 Posters: TMDB API with cache');
  console.log('=====================================\n');
});
