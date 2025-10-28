const puppeteer = require('puppeteer');
const cheerio = require('cheerio');
const axios = require('axios');

const LETTERBOXD_USER = 'f_frusciante';
const LETTERBOXD_URL = `https://letterboxd.com/${LETTERBOXD_USER}/films/by/rated-date/`;
const TMDB_API_KEY = process.env.TMDB_API_KEY;
const MIN_RATING = 3.0;
const MAX_FILMS = 10;

// Funzione per estrarre dati film da HTML
function parseFilms(html) {
  const $ = cheerio.load(html);
  const films = [];
  
  // Cerca tutti i grandparent <li class="griditem">
  $('li.griditem').each((i, elem) => {
    try {
      const $griditem = $(elem);
      
      // Estrai dati dal react-component
      const $reactComponent = $griditem.find('.react-component');
      const filmSlug = $reactComponent.attr('data-item-slug');
      const filmName = $reactComponent.attr('data-item-name');
      const filmId = $reactComponent.attr('data-film-id');
      
      // Estrai rating dal griditem stesso
      let rating = 0;
      const ratingSpan = $griditem.find('span.rating[class*="rated-"]');
      if (ratingSpan.length > 0) {
        const ratingClass = ratingSpan.attr('class');
        const match = ratingClass.match(/rated-(\d+)/);
        if (match) {
          rating = parseInt(match[1]) / 2; // Converti 1-10 in 0.5-5
        }
      }
      
      if (filmSlug && filmName) {
        films.push({
          slug: `/film/${filmSlug}/`,
          name: filmName,
          rating: rating,
          letterboxdUrl: `https://letterboxd.com/film/${filmSlug}/`,
          letterboxdId: filmId
        });
      }
    } catch (err) {
      console.error('Error parsing film element:', err.message);
    }
  });
  
  return films;
}

// Funzione per cercare film su TMDB e ottenere metadati
async function enrichWithTMDB(film) {
  if (!TMDB_API_KEY) {
    console.warn('⚠️  TMDB API Key not configured');
    return {
      id: `unknown_${film.slug.replace(/\//g, '_')}`,
      type: 'movie',
      name: film.name,
      year: 'Unknown',
      poster: undefined
    };
  }

  try {
    // Estrai anno dal nome se possibile (es: "Dune (2021)")
    const yearMatch = film.name.match(/\((\d{4})\)/);
    const nameYear = yearMatch ? yearMatch[1] : null;
    const cleanName = film.name.replace(/\s*\(\d{4}\)\s*$/, ''); // Rimuovi anno dal nome
    
    // Cerca su TMDB per nome
    const searchUrl = `https://api.themoviedb.org/3/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(cleanName)}${nameYear ? `&year=${nameYear}` : ''}`;
    const searchResponse = await axios.get(searchUrl);
    
    if (searchResponse.data.results && searchResponse.data.results.length > 0) {
      const movie = searchResponse.data.results[0];
      
      // Fetch dettagli completi per ottenere IMDb ID e runtime
      const detailsUrl = `https://api.themoviedb.org/3/movie/${movie.id}?api_key=${TMDB_API_KEY}&append_to_response=external_ids`;
      const detailsResponse = await axios.get(detailsUrl);
      const details = detailsResponse.data;
      
      return {
        id: details.external_ids?.imdb_id || `tmdb_${movie.id}`,
        type: 'movie',
        name: movie.title || cleanName,
        year: movie.release_date ? movie.release_date.split('-')[0] : (nameYear || 'Unknown'),
        poster: movie.poster_path ? `https://image.tmdb.org/t/p/w500${movie.poster_path}` : undefined,
        runtime: details.runtime || 0,
        tmdbId: movie.id
      };
    }
    
    // Se non trovato su TMDB, ritorna dati base
    console.warn(`⚠️  Film not found on TMDB: ${film.name}`);
    return {
      id: `unknown_${film.slug.replace(/\//g, '_')}`,
      type: 'movie',
      name: cleanName,
      year: nameYear || 'Unknown',
      poster: undefined,
      runtime: 0
    };
    
  } catch (error) {
    console.error(`❌ TMDB API error for ${film.name}:`, error.message);
    return {
      id: `unknown_${film.slug.replace(/\//g, '_')}`,
      type: 'movie',
      name: film.name,
      year: 'Unknown',
      poster: undefined,
      runtime: 0
    };
  }
}

// Funzione principale di scraping
async function scrapeLetterboxd() {
  let browser;
  
  try {
    console.log('🚀 Starting Letterboxd scraper...\n');
    console.log(`📡 URL: ${LETTERBOXD_URL}`);
    console.log(`⭐ Min rating: ${MIN_RATING} stars`);
    console.log(`🎬 Max films: ${MAX_FILMS}\n`);
    
    // Lancia browser headless
    console.log('🌐 Launching browser...');
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu'
      ]
    });
    
    const page = await browser.newPage();
    
    // User agent per evitare blocchi
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    console.log('📄 Loading page...');
    await page.goto(LETTERBOXD_URL, { 
      waitUntil: 'networkidle2',
      timeout: 30000 
    });
    
    // Chiudi popup cookies/termini
    console.log('🍪 Checking for cookie popup...');
    try {
      const acceptButton = await page.waitForSelector('button[class*="accept"], button[class*="agree"], .fc-cta-consent', { timeout: 3000 });
      if (acceptButton) {
        await acceptButton.click();
        console.log('✅ Cookie popup closed');
        await page.waitForTimeout(1000);
      }
    } catch (err) {
      console.log('ℹ️  No cookie popup found (or already accepted)');
    }
    
    // Aspetta che i film si caricano
    console.log('⏳ Waiting for films to load...');
    await page.waitForSelector('li.griditem', { timeout: 15000 });
    
    // Aspetta un po' per sicurezza
    await page.waitForTimeout(2000);
    
    // Estrai HTML completo
    console.log('🔍 Extracting HTML...');
    const html = await page.content();
    
    await browser.close();
    console.log('✅ Browser closed\n');
    
    // Parse films
    console.log('📊 Parsing films...');
    const allFilms = parseFilms(html);
    console.log(`Found ${allFilms.length} total films\n`);
    
    // Filtra per rating >= 3
    const filmsWithGoodRating = allFilms.filter(f => f.rating >= MIN_RATING);
    console.log(`Films with rating >= ${MIN_RATING}★: ${filmsWithGoodRating.length}\n`);
    
    if (filmsWithGoodRating.length === 0) {
      throw new Error(`No films found with rating >= ${MIN_RATING} stars!`);
    }
    
    // Prendi primi 10
    const top10 = filmsWithGoodRating.slice(0, MAX_FILMS);
    console.log(`🎯 Taking top ${top10.length} films\n`);
    
    // Arricchisci con TMDB
    console.log('🎨 Enriching with TMDB data...\n');
    const enrichedFilms = [];
    
    for (let i = 0; i < top10.length; i++) {
      const film = top10[i];
      console.log(`[${i + 1}/${top10.length}] ${film.name} (${film.rating}★)`);
      
      const enriched = await enrichWithTMDB(film);
      enrichedFilms.push(enriched);
      
      console.log(`   → ${enriched.id} | ${enriched.year} | ${enriched.runtime}min\n`);
      
      // Pausa per non sovraccaricare TMDB API
      if (i < top10.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }
    
    console.log('✅ Scraping completed!\n');
    
    return {
      meta: enrichedFilms,
      _metadata: {
        lastUpdate: new Date().toISOString(),
        source: LETTERBOXD_URL,
        totalFilms: enrichedFilms.length
      }
    };
    
  } catch (error) {
    console.error('\n❌ Scraping failed:', error.message);
    if (browser) {
      await browser.close();
    }
    throw error;
  }
}

// Esporta per uso in altri script
module.exports = { scrapeLetterboxd };

// Esegui se chiamato direttamente
if (require.main === module) {
  scrapeLetterboxd()
    .then(data => {
      const fs = require('fs');
      
      // Rimuovi metadata prima di salvare
      const output = { meta: data.meta };
      
      fs.writeFileSync('current_10.json', JSON.stringify(output, null, 2));
      console.log('💾 Saved to current_10.json');
      console.log(`\n📊 Summary:`);
      console.log(`   Films: ${data.meta.length}`);
      console.log(`   With IMDb ID: ${data.meta.filter(f => f.id.startsWith('tt')).length}`);
      console.log(`   With posters: ${data.meta.filter(f => f.poster).length}`);
    })
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}