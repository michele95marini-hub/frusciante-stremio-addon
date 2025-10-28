const puppeteer = require('puppeteer');
const fs = require('fs');

async function debug() {
  const browser = await puppeteer.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');
  
  console.log('📡 Navigating...');
  await page.goto('https://letterboxd.com/f_frusciante/films/by/rated-date/', {
    waitUntil: 'networkidle2',
    timeout: 30000
  });
  
  // Chiudi popup
  try {
    const acceptButton = await page.waitForSelector('button[class*="accept"], button[class*="agree"], .fc-cta-consent', { timeout: 3000 });
    if (acceptButton) {
      await acceptButton.click();
      console.log('✅ Popup closed');
      await page.waitForTimeout(2000);
    }
  } catch (err) {
    console.log('No popup');
  }
  
  // Scroll per caricare lazy loading
  console.log('📜 Scrolling...');
  await page.evaluate(() => window.scrollTo(0, 500));
  await page.waitForTimeout(2000);
  
  // Cerca vari selettori
  console.log('\n🔍 Testing selectors:\n');
  
  const selectors = [
    'li.poster-container',
    'li.listitem',
    'li[class*="poster"]',
    'div.poster',
    'div[data-film-slug]',
    'ul.poster-list li',
    '.film-poster',
    'li.film-list-item'
  ];
  
  for (const sel of selectors) {
    try {
      const elements = await page.$$(sel);
      console.log(`${sel.padEnd(30)} → Found: ${elements.length}`);
    } catch (e) {
      console.log(`${sel.padEnd(30)} → Error`);
    }
  }
  
  // Screenshot finale
  await page.screenshot({ path: 'debug-selectors.png', fullPage: true });
  console.log('\n📸 Screenshot: debug-selectors.png');
  
  await browser.close();
}

debug();