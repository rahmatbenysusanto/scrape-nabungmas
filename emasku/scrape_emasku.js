const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const xlsx = require('xlsx');
const cheerio = require('cheerio');
const axios = require('axios');
const fs = require('fs');

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

        console.log("Mengakses web Emasku...");
        await page.goto('https://www.emasku.co.id/en/gold-price', { waitUntil: 'networkidle2' });
        const html = await page.content();
        await browser.close();

        console.log("Mem-parsing data...");
        const $ = cheerio.load(html);

        let webPrices = [];
        let apiPayload = [];
        let currentCategory = "";

        $('table').each((i, tbl) => {
            $(tbl).find('tr').each((j, tr) => {
                // Emasku often puts the category name in a single full-width TD
                let th = $(tr).find('td').length === 1 ? $(tr).find('td').text().trim() : '';
                if (th && !th.includes('Berat')) {
                    currentCategory = th.toUpperCase();
                }

                let tds = $(tr).find('td');
                if (tds.length === 3) {
                    let beratStr = $(tds[0]).text().trim().replace('gr', '').replace(',', '.').replace(/\s+/g, '');
                    let hargaStr = $(tds[1]).text().trim().replace('Rp', '').replace(/\./g, '').trim();
                    let buybackStr = $(tds[2]).text().trim().replace('Rp', '').replace(/\./g, '').trim();

                    let beratNum = parseFloat(beratStr);
                    let hargaNum = parseInt(hargaStr, 10);
                    let buybackNum = parseInt(buybackStr, 10);

                    if (!isNaN(beratNum) && !isNaN(hargaNum)) {
                        webPrices.push({
                            Brand: "Emasku",
                            Category: currentCategory,
                            Berat: beratNum,
                            Harga: hargaNum,
                            Buyback: buybackNum
                        });

                        apiPayload.push({
                            brand_name: "Emasku",
                            category_name: currentCategory,
                            weight: beratNum,
                            price_buy: hargaNum,
                            price_buy_back: buybackNum,
                            parent: beratNum === 1 // Set 1 gram as parent for example
                        });
                    }
                }
            });
        });

        // Simpan langsung ke Excel sebagai file Master/Update
        console.log("Menyimpan semua data ke emasku.xlsx...");
        const wb = xlsx.utils.book_new();
        const ws = xlsx.utils.json_to_sheet(webPrices);
        xlsx.utils.book_append_sheet(wb, ws, "Harga");
        xlsx.writeFile(wb, 'emasku.xlsx');

        // Push to API (Auto Create all new categories & weights to Database)
        console.log("Mengirim data ke Backend API (Upsert & Auto-run)...");
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
