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

        console.log("Mengakses web Emas Kita...");
        await page.goto('https://www.emaskita.id/Harga_emas', { waitUntil: 'networkidle2' });
        const html = await page.content();
        await browser.close();

        console.log("Mem-parsing data...");
        const $ = cheerio.load(html);

        let webPrices = [];
        let currentCategory = "";

        $('table').each((i, tbl) => {
            $(tbl).find('tr').each((j, tr) => {
                let th = $(tr).find('th').text().trim().replace(/\s+/g, ' ');
                if (th && !th.includes('WeightBasic')) {
                    currentCategory = th.toUpperCase();
                }

                let tds = $(tr).find('td');
                if (tds.length === 4) {
                    let beratStr = $(tds[0]).text().trim().replace(' gr', '').replace(',', '.').replace(/\s+/g, '');
                    let hargaStr = $(tds[1]).text().trim().replace('Rp.', '').replace(/,/g, '').replace(/\./g, '').trim();
                    let buybackStr = $(tds[3]).text().trim().replace('Rp.', '').replace(/,/g, '').replace(/\./g, '').trim();

                    let beratNum = parseFloat(beratStr);
                    let hargaNum = parseInt(hargaStr, 10);
                    let buybackNum = parseInt(buybackStr, 10);

                    if (!isNaN(beratNum) && !isNaN(hargaNum)) {
                        webPrices.push({
                            cat: currentCategory,
                            berat: beratNum,
                            buy: hargaNum,
                            buyback: buybackNum
                        });
                    }
                }
            });
        });

        // 3. Update Excel dari data yang sudah disiapkan User
        console.log("Membaca emaskita.xlsx...");
        const workbook = xlsx.readFile('emaskita.xlsx');
        const sheetName = workbook.SheetNames[0];
        const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

        let apiPayload = [];

        console.log("Memperbarui harga dari pencocokan data web -> excel...");
        data.forEach(row => {
            let rowCategory = (row['Category'] || '').toUpperCase();
            let rowBerat = parseFloat(row['Berat'].toString().replace(',', '.'));

            // Cari match di webPrices
            let match = webPrices.find(w => w.berat === rowBerat && w.cat.includes(rowCategory));
            if (!match) {
                // fallback kalau misal string pencarian nggak pas banget
                match = webPrices.find(w => w.berat === rowBerat);
            }

            if (match) {
                row['Harga'] = match.buy;
                row['Buyback'] = match.buyback;
            } else {
                console.log(`Peringatan: Harga untuk ${rowCategory} - ${rowBerat}g tak ditemukan di web.`);
            }

            apiPayload.push({
                brand_name: row['Brand'],
                category_name: row['Category'], // use original string exact
                weight: rowBerat,
                price_buy: row['Harga'] || 0,
                price_buy_back: row['Buyback'] || 0,
                parent: rowBerat === 1 // Set 1 gram as parent for example
            });
        });

        const newSheet = xlsx.utils.json_to_sheet(data);
        workbook.Sheets[sheetName] = newSheet;

        console.log("Menyimpan update ke emaskita_updated.xlsx & emaskita.xlsx...");
        xlsx.writeFile(workbook, 'emaskita_updated.xlsx');
        xlsx.writeFile(workbook, 'emaskita.xlsx');

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
