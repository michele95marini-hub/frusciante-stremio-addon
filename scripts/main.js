const fs = require('fs');
const path = require('path');
const { scrapeLetterboxd } = require('./scraper');
const { migrateFilms } = require('./migrator');

const CURRENT_10_PATH = path.join(__dirname, '../current_10.json');

// Funzione principale che orchestra tutto
async function main() {
  console.log('═══════════════════════════════════════════');
  console.log('🎬 LETTERBOXD TO STREMIO - AUTO UPDATE');
  console.log('═══════════════════════════════════════════\n');
  console.log(`⏰ Started at: ${new Date().toISOString()}\n`);
  
  try {
    // STEP 1: Scraping Letterboxd
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('STEP 1: SCRAPING LETTERBOXD');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    const scrapedData = await scrapeLetterboxd();
    const newFilms = scrapedData.meta;
    
    console.log(`✅ Scraped ${newFilms.length} films\n`);
    
    // STEP 2: Migrazione vecchi film alle liste
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('STEP 2: MIGRATING OLD FILMS');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    const migrationResult = await migrateFilms(newFilms);
    
    console.log(`✅ Migration completed\n`);
    
    // STEP 3: Aggiorna current_10.json
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('STEP 3: UPDATING CURRENT_10.JSON');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    const newCurrent10 = {
      meta: newFilms
    };
    
    fs.writeFileSync(CURRENT_10_PATH, JSON.stringify(newCurrent10, null, 2));
    console.log(`✅ Saved current_10.json with ${newFilms.length} films\n`);
    
    // STEP 4: Summary
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📊 SUMMARY');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    
    console.log(`✅ Update completed successfully!`);
    console.log(`\n📦 Current state:`);
    console.log(`   current_10.json: ${newFilms.length} films`);
    console.log(`   films-corti.json: ${migrationResult.corti} films`);
    console.log(`   films-lunghi.json: ${migrationResult.lunghi} films`);
    console.log(`\n🔄 Changes:`);
    console.log(`   Films migrated: ${migrationResult.migrated}`);
    console.log(`   Duplicates removed: ${migrationResult.duplicatesRemoved || 0}`);
    console.log(`\n⏰ Finished at: ${new Date().toISOString()}`);
    console.log('\n═══════════════════════════════════════════\n');
    
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ UPDATE FAILED!\n');
    console.error('Error:', error.message);
    console.error('\nStack trace:');
    console.error(error.stack);
    console.error('\n═══════════════════════════════════════════\n');
    process.exit(1);
  }
}

// Esegui
main();