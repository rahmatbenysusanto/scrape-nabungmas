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

        console.log("Mengakses web Semar Nusantara...");
        await page.goto('https://semar.co.id/harga-emas-hari-ini/', { waitUntil: 'networkidle2' });
        const html = await page.content();
        await browser.close();

        console.log("Mem-parsing data...");
        const $ = cheerio.load(html);

        let webPrices = [];
        let apiPayload = [];

        $('#goldPriceTable .goldPriceTableRow').each((i, row) => {
            // Skip header and subheader
            if ($(row).attr('id') === 'goldPriceRowHeader' || $(row).attr('id') === 'goldPriceRowSubHeader') {
                return;
            }

            const cells = $(row).find('.goldPriceTableCell');
            if (cells.length >= 5) {
                let weightStr = $(cells[0]).text().trim().replace('gr', '').trim();
                let weightNum = parseFloat(weightStr);
                if (isNaN(weightNum)) return;

                let buybackLama = $(cells[1]).text().trim().replace(/\./g, '');
                let buybackNonPress = $(cells[2]).text().trim().replace(/\./g, '');
                let hargaPress24k = $(cells[3]).text().trim().replace(/\./g, '');
                let buybackPress24k = $(cells[4]).text().trim().replace(/\./g, '');

                if (buybackLama) {
                    let bb = parseInt(buybackLama) || 0;
                    webPrices.push({
                        Brand: "Semar Nusantara",
                        Category: "SMG PRESS LAMA",
                        Berat: weightNum,
                        Harga: 0,
                        Buyback: bb
                    });
                    apiPayload.push({
                        brand_name: "Semar Nusantara",
                        category_name: "SMG PRESS LAMA",
                        weight: weightNum,
                        price_buy: 0,
                        price_buy_back: bb,
                        parent: weightNum === 1
                    });
                }

                if (buybackNonPress) {
                    let bb = parseInt(buybackNonPress) || 0;
                    webPrices.push({
                        Brand: "Semar Nusantara",
                        Category: "SMG NON PRESS",
                        Berat: weightNum,
                        Harga: 0,
                        Buyback: bb
                    });
                    apiPayload.push({
                        brand_name: "Semar Nusantara",
                        category_name: "SMG NON PRESS",
                        weight: weightNum,
                        price_buy: 0,
                        price_buy_back: bb,
                        parent: weightNum === 1
                    });
                }

                if (hargaPress24k || buybackPress24k) {
                    let harga = parseInt(hargaPress24k) || 0;
                    let bb = parseInt(buybackPress24k) || 0;
                    webPrices.push({
                        Brand: "Semar Nusantara",
                        Category: "SMG PRESS 24K",
                        Berat: weightNum,
                        Harga: harga,
                        Buyback: bb
                    });
                    apiPayload.push({
                        brand_name: "Semar Nusantara",
                        category_name: "SMG PRESS 24K",
                        weight: weightNum,
                        price_buy: harga,
                        price_buy_back: bb,
                        parent: weightNum === 1
                    });
                }
            }
        });

        // Simpan langsung ke Excel sebagai file Master/Update
        console.log("Menyimpan semua data ke semar.xlsx...");
        const wb = xlsx.utils.book_new();
        const ws = xlsx.utils.json_to_sheet(webPrices);
        xlsx.utils.book_append_sheet(wb, ws, "Harga");
        xlsx.writeFile(wb, 'semar.xlsx');

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
