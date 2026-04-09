const cheerio = require('cheerio');
const fs = require('fs');

const html = fs.readFileSync('gallery24.html', 'utf-8');
const $ = cheerio.load(html);

// We saw the block has text like "Berat Harga Jual Harga Buyback ..."
let results = [];
$('div, span, p, h1, h2, h3, h4, h5, h6, table, tr, td').each((i, el) => {
    let t = $(el).text().trim().replace(/\s+/g, ' ');
    if (t.includes('Harga Jual') && t.includes('Harga Buyback') && t.length < 500) {
        let brandRaw = t.split('Berat Harga Jual')[0].replace('Diperbarui', '').split('2026')[1] || t.split('Berat Harga')[0];
        let brand = brandRaw.replace('Harga', '').trim();

        let kids = [];
        $(el).children().each((j, kid) => {
            let kt = $(kid).text().trim().replace(/\s+/g, ' ');
            if (kt) kids.push(kt);
        });

        // Find where the values start. It seems to be grid rows or list items.
        // Let's print tag name of the elements that hold the values.
        console.log(`\nFound list for: ${brand}`);
        let values = [];
        $(el).find('div, span, p').each((k, cel) => {
            // Let's filter direct children that have the texts
            let txt = $(cel).text().trim().replace(/\s+/g, ' ');
            // We can find matching Rp...
            if (txt.includes('Rp') && !$(cel).children().length) {
                // It's a leaf node. Actually, print the parent's text to see if they're grouped.
                // console.log($(cel).parent().text());
                values.push(txt);
            }
        });

        // Since we know the layout is grid: Weight, Harga Jual, Harga Buyback
        // They are just divs.
        // So we can find all leaf nodes inside this container
        let leaves = [];
        const traverse = (node) => {
            node.children().each((idx, c) => {
                let $c = $(c);
                if ($c.children().length === 0) {
                    let tt = $c.text().trim();
                    if (tt && tt !== 'O') leaves.push(tt);
                } else {
                    traverse($c);
                }
            });
        }
        traverse($(el));

        console.log(leaves.slice(0, 20));
        results.push(t);
    }
});
