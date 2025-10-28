const cheerio = require('cheerio');
const fs = require('fs');

const html = fs.readFileSync('debug-page.html', 'utf8');
const $ = cheerio.load(html);

console.log('🧪 Testing FINAL parsing logic...\n');

let foundWithRating = 0;
let foundWithoutRating = 0;

$('li.griditem').slice(0, 10).each((i, elem) => {
  const $griditem = $(elem);
  const $reactComponent = $griditem.find('.react-component');
  
  const filmSlug = $reactComponent.attr('data-item-slug');
  const filmName = $reactComponent.attr('data-item-name');
  
  let rating = 0;
  const ratingSpan = $griditem.find('span.rating[class*="rated-"]');
  if (ratingSpan.length > 0) {
    const ratingClass = ratingSpan.attr('class');
    const match = ratingClass.match(/rated-(\d+)/);
    if (match) {
      rating = parseInt(match[1]) / 2;
      foundWithRating++;
    }
  } else {
    foundWithoutRating++;
  }
  
  console.log(`\n━━━ Film ${i + 1} ━━━`);
  console.log('Name:', filmName);
  console.log('Slug:', filmSlug);
  console.log('Rating:', rating > 0 ? `${rating}★` : 'NO RATING');
});

console.log('\n\n📊 SUMMARY:');
console.log(`Total griditem found: ${$('li.griditem').length}`);
console.log(`With rating: ${foundWithRating}`);
console.log(`Without rating: ${foundWithoutRating}`);