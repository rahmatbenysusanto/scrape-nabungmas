const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const xlsx = require('xlsx');
const cheerio = require('cheerio');
const axios = require('axios');

puppeteer.use(StealthPlugin());

(async () => {
    try {
        console.log("Membuka browser...");
        const browser = await puppeteer.launch({
            executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            headless: 'new',
            args: ['--no-sandbox']
        });
        const page = await browser.newPage();

        console.log("Mengakses web Gallery 24...");
        await page.goto('https://galeri24.co.id/harga-emas', { waitUntil: 'networkidle2' });
        const html = await page.content();
        await browser.close();

        console.log("Mem-parsing data...");
        const $ = cheerio.load(html);

        let webPrices = [];
        let parsedContainers = new Set();

        // Cari container yang berisi "Harga Jual" dan "Harga Buyback"
        $('div, section').each((i, el) => {
            let t = $(el).text().trim().replace(/\s+/g, ' ');
            if (t.includes('Harga Jual') && t.includes('Harga Buyback') && t.length > 50 && t.length < 5000) {
                // Pastikan ini adalah parent tertinggi dari block harga tersebut
                if (parsedContainers.has(t)) return;
                parsedContainers.add(t);

                // Cari Category / Brand name
                let brandRaw = '';
                $(el).find('h2, h3, h4, h5, h6, .text-xl, .font-bold').each((k, h) => {
                    let ht = $(h).text().trim();
                    if (ht.includes('Harga') && !ht.includes('Jual')) brandRaw = ht.replace('Harga', '').trim();
                });

                if (!brandRaw) {
                    let parts = t.split('Berat Harga')[0].split('Harga');
                    if (parts.length > 1) {
                        brandRaw = parts[parts.length - 1].trim();
                    }
                }

                if (brandRaw) {
                    // Cari daun-daun / leaf elements dari gridnya
                    let leaves = [];
                    const traverse = (node) => {
                        node.children().each((idx, c) => {
                            let $c = $(c);
                            if ($c.children().length === 0) {
                                let tt = $c.text().trim();
                                if (tt) leaves.push(tt);
                            } else {
                                traverse($c);
                            }
                        });
                    }
                    traverse($(el));

                    // daun biasanya: "Diperbarui...", "Harga <X>", "Berat", "Harga Jual", "Harga Buyback", "0.5", "Rp...", "Rp..."
                    let startIndex = leaves.findIndex(l => l === 'Harga Buyback' || l.includes('Buyback'));
                    if (startIndex !== -1) {
                        let vals = leaves.slice(startIndex + 1);
                        // Iterasi per 3
                        for (let i = 0; i < vals.length; i += 3) {
                            if (vals[i] && vals[i + 1] && vals[i + 2]) {
                                let beratStr = vals[i].replace(',', '.');
                                let jualStr = vals[i + 1].replace('Rp', '').replace(/,/g, '').replace(/\./g, '');
                                let buybackStr = vals[i + 2].replace('Rp', '').replace(/,/g, '').replace(/\./g, '');

                                let beratNum = parseFloat(beratStr);
                                let jualNum = parseInt(jualStr, 10);
                                let buybackNum = parseInt(buybackStr, 10);

                                if (!isNaN(beratNum) && !isNaN(jualNum)) {
                                    webPrices.push({
                                        brandCat: brandRaw,
                                        berat: beratNum,
                                        buy: jualNum,
                                        buyback: isNaN(buybackNum) ? 0 : buybackNum
                                    });
                                }
                            }
                        }
                    }
                }
            }
        });

        // 3. Update Excel
        console.log("Membaca gallery24.xlsx...");
        const workbook = xlsx.readFile('gallery24.xlsx');
        const sheetName = workbook.SheetNames[0];
        const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

        let apiPayload = [];

        console.log("Memperbarui harga dari pencocokan data web -> excel...");
        data.forEach(row => {
            let rowBrand = (row['Brand'] || '').toUpperCase();
            let rowCategory = (row['Category'] || '').toUpperCase();
            let rowBerat = parseFloat(row['Berat'].toString().replace(',', '.'));

            let match = webPrices.find(w => {
                let bc = w.brandCat.toUpperCase();
                // Matching logic can be tricky. Try to find if the brandCat includes the Category or Brand
                return w.berat === rowBerat && (bc.includes(rowCategory) || bc.includes(rowBrand) || rowCategory.includes(bc) || rowBrand.includes(bc));
            });

            if (!match) {
                // Fallback to strict weight if it's very unique or just print warning
                match = webPrices.find(w => w.berat === rowBerat);
                // If there's multiple with same weight, this is risky, but it's a fallback
            }

            if (match) {
                row['Harga'] = match.buy;
                row['Buyback'] = match.buyback;
            } else {
                console.log(`Peringatan: Harga untuk ${rowCategory} - ${rowBerat}g tak ditemukan di web.`);
            }

            apiPayload.push({
                brand_name: row['Brand'],
                category_name: row['Category'],
                weight: rowBerat,
                price_buy: row['Harga'] || 0,
                price_buy_back: row['Buyback'] || 0,
                parent: rowBerat === 1 // Set 1 gram as parent for example
            });
        });

        const newSheet = xlsx.utils.json_to_sheet(data);
        workbook.Sheets[sheetName] = newSheet;

        console.log("Menyimpan update ke gallery24_updated.xlsx & gallery24.xlsx...");
        xlsx.writeFile(workbook, 'gallery24_updated.xlsx');
        xlsx.writeFile(workbook, 'gallery24.xlsx');

        // Push to API
        console.log("Mengirim data ke Backend API...");
        try {
            const response = await axios.post('https://api.nabungmas.my.id/api/gold-prices/sync', {
                prices: apiPayload
            }, {
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            console.log("Response dari Backend:", response.data);
        } catch (apiErr) {
            console.error("Gagal mengirim ke backend:", apiErr.message);
            if (apiErr.response) {
                console.error("Response:", apiErr.response.data);
            }
        }

        console.log("Selesai!");

    } catch (e) {
        console.error(e);
    }
})();
