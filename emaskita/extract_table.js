const cheerio = require('cheerio');
const fs = require('fs');

const html = fs.readFileSync('emaskita.html', 'utf-8');
const $ = cheerio.load(html);

console.log("Semua Data EmasKita:");

$('table').each((i, tbl) => {
    let currentCategory = "";
    $(tbl).find('tr').each((j, tr) => {
        let th = $(tr).find('th').text().trim().replace(/\s+/g, ' ');
        if (th && !th.includes('WeightBasic')) {
            currentCategory = th;
        }

        let tds = $(tr).find('td');
        if (tds.length === 4) {
            let berat = $(tds[0]).text().trim().replace(/\s+/g, ' ');
            let harga = $(tds[1]).text().trim().replace(/\s+/g, ' ');
            let buyback = $(tds[3]).text().trim().replace(/\s+/g, ' ');
            console.log(`Cat: ${currentCategory} | Berat: ${berat} | Harga: ${harga} | Buyback: ${buyback}`);
        }
    });
});
