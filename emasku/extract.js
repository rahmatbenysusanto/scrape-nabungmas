const cheerio = require('cheerio');
const fs = require('fs');

const html = fs.readFileSync('emasku.html', 'utf-8');
const $ = cheerio.load(html);

console.log("Semua Data Emasku:");

$('table').each((i, tbl) => {
    let currentCategory = "";
    $(tbl).find('tr').each((j, tr) => {
        let th = $(tr).find('td').length === 1 ? $(tr).find('td').text().trim() : '';
        if (th && !th.includes('Berat')) {
            currentCategory = th.toUpperCase();
        }

        let tds = $(tr).find('td');
        if (tds.length === 3) {
            let berat = $(tds[0]).text().trim().replace('gr', '').replace(',', '.').replace(/\s+/g, '');
            let harga = $(tds[1]).text().trim().replace('Rp', '').replace(/\./g, '').trim();
            let buyback = $(tds[2]).text().trim().replace('Rp', '').replace(/\./g, '').trim();
            console.log(`Cat: ${currentCategory} | Berat: ${berat} | Harga: ${harga} | Buyback: ${buyback}`);
        }
    });
});
