const cheerio = require('cheerio');
const fs = require('fs');

const html = fs.readFileSync('buyback.html', 'utf-8');
const $ = cheerio.load(html);

// Find Harga Buyback
let buybackPrice = "Not found";
$('.title').each((i, el) => {
    if ($(el).text().includes('Harga Buyback:')) {
        const val = $(el).next('.value').text().trim();
        if (val) {
            buybackPrice = val;
        }
    }
});
if (buybackPrice === "Not found") {
    // maybe it is in a span with text Harga Buyback:
    $('span').each((i, el) => {
        if ($(el).text().includes('Harga Buyback:')) {
            console.log("Found in span, parent text:", $(el).parent().text());
        }
    });
} else {
    console.log("Buyback Price:", buybackPrice);
}
