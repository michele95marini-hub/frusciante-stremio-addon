const fs = require('fs');
const path = require('path');

const CURRENT_10_PATH = path.join(__dirname, '../current_10.json');
const FILMS_CORTI_PATH = path.join(__dirname, '../films-corti.json');
const FILMS_LUNGHI_PATH = path.join(__dirname, '../films-lunghi.json');
const RUNTIME_THRESHOLD = 120;

// Funzione per leggere JSON in modo sicuro
function readJSON(filepath) {
  try {
    const content = fs.readFileSync(filepath, 'utf8');
    return JSON.parse(content);
  } catch (error) {
    console.error(`❌ Error reading ${filepath}:`, error.message);
    return { meta: [] };
  }
}

// Funzione per salvare JSON
function writeJSON(filepath, data) {
  try {
    fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
    console.log(`✅ Saved ${filepath}`);
    return true;
  } catch (error) {
    console.error(`❌ Error writing ${filepath}:`, error.message);
    return false;
  }
}

// Funzione per rimuovere duplicati per imdbId
function removeDuplicates(films) {
  const seen = new Set();
  return films.filter(film => {
    if (seen.has(film.id)) {
      return false;
    }
    seen.add(film.id);
    return true;
  });
}

// Funzione principale di migrazione
async function migrateFilms(newFilms) {
  console.log('🔄 Starting migration...\n');
  
  // Leggi file esistenti
  console.log('📂 Reading existing files...');
  const oldCurrent10 = readJSON(CURRENT_10_PATH);
  const filmsCorti = readJSON(FILMS_CORTI_PATH);
  const filmsLunghi = readJSON(FILMS_LUNGHI_PATH);
  
  console.log(`   current_10.json: ${oldCurrent10.meta.length} films`);
  console.log(`   films-corti.json: ${filmsCorti.meta.length} films`);
  console.log(`   films-lunghi.json: ${filmsLunghi.meta.length} films\n`);
  
  // Trova film USCITI dai top 10 (presenti nei vecchi ma non nei nuovi)
  const newIds = new Set(newFilms.map(f => f.id));
  const filmsToMigrate = oldCurrent10.meta.filter(film => !newIds.has(film.id));
  
  console.log(`🎬 Films to migrate: ${filmsToMigrate.length}`);
  
  if (filmsToMigrate.length === 0) {
    console.log('   No changes detected - all films still in top 10\n');
    return {
      migrated: 0,
      corti: filmsCorti.meta.length,
      lunghi: filmsLunghi.meta.length
    };
  }
  
  // Dividi per runtime
  const toCorti = [];
  const toLunghi = [];
  const noRuntime = [];
  
  filmsToMigrate.forEach(film => {
    if (!film.runtime || film.runtime === 0) {
      noRuntime.push(film);
      // Default: se runtime sconosciuto, metti nei corti
      toCorti.push(film);
    } else if (film.runtime < RUNTIME_THRESHOLD) {
      toCorti.push(film);
    } else {
      toLunghi.push(film);
    }
  });
  
  console.log(`   → Corti (<${RUNTIME_THRESHOLD}min): ${toCorti.length}`);
  console.log(`   → Lunghi (≥${RUNTIME_THRESHOLD}min): ${toLunghi.length}`);
  if (noRuntime.length > 0) {
    console.log(`  ⚠️  No runtime data: ${noRuntime.length} (added to corti by default)`);
  }
  console.log('');
  
  // Aggiungi ai rispettivi array
  console.log('➕ Adding films to lists...');
  const updatedCorti = [...filmsCorti.meta, ...toCorti];
  const updatedLunghi = [...filmsLunghi.meta, ...toLunghi];
  
  console.log(`   Corti: ${filmsCorti.meta.length} → ${updatedCorti.length} (+${toCorti.length})`);
  console.log(`   Lunghi: ${filmsLunghi.meta.length} → ${updatedLunghi.length} (+${toLunghi.length})\n`);
  
  // Rimuovi duplicati
  console.log('🔍 Removing duplicates...');
  const dedupedCorti = removeDuplicates(updatedCorti);
  const dedupedLunghi = removeDuplicates(updatedLunghi);
  
  const duplicatesCorti = updatedCorti.length - dedupedCorti.length;
  const duplicatesLunghi = updatedLunghi.length - dedupedLunghi.length;
  
  console.log(`   Corti: ${duplicatesCorti} duplicates removed`);
  console.log(`   Lunghi: ${duplicatesLunghi} duplicates removed\n`);
  
  // Salva file aggiornati
  console.log('💾 Saving updated files...');
  
  const cortiData = { meta: dedupedCorti };
  const lunghiData = { meta: dedupedLunghi };
  
  writeJSON(FILMS_CORTI_PATH, cortiData);
  writeJSON(FILMS_LUNGHI_PATH, lunghiData);
  
  console.log('\n✅ Migration completed!\n');
  
  return {
    migrated: filmsToMigrate.length,
    corti: dedupedCorti.length,
    lunghi: dedupedLunghi.length,
    duplicatesRemoved: duplicatesCorti + duplicatesLunghi
  };
}

// Esporta per uso in altri script
module.exports = { migrateFilms };

// Esegui se chiamato direttamente (per test)
if (require.main === module) {
  // Simula nuovi film (in produzione vengono dallo scraper)
  const testNewFilms = readJSON(CURRENT_10_PATH).meta;
  
  migrateFilms(testNewFilms)
    .then(result => {
      console.log('📊 Migration Summary:');
      console.log(`   Films migrated: ${result.migrated}`);
      console.log(`   Total corti: ${result.corti}`);
      console.log(`   Total lunghi: ${result.lunghi}`);
      console.log(`   Duplicates removed: ${result.duplicatesRemoved || 0}`);
    })
    .catch(err => {
      console.error('Migration failed:', err);
      process.exit(1);
    });
}