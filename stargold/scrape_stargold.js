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

        console.log("Mengakses web Stargold...");
        await page.goto('https://stargold.id/price/', { waitUntil: 'networkidle2' });
        const html = await page.content();
        await browser.close();

        console.log("Mem-parsing data...");
        const $ = cheerio.load(html);

        let webPrices = [];
        let apiPayload = [];

        $('.compare-page-content-wrap').each((i, wrap) => {
            let title = $(wrap).find('h2.title').text().trim().toUpperCase();
            if (title === 'STARGOLD') {
                $(wrap).find('table tbody tr').each((j, tr) => {
                    let tds = $(tr).find('td');
                    if (tds.length === 3) {
                        let weightStr = $(tds[0]).text().trim();
                        let sellStr = $(tds[1]).text().trim();
                        let buybackStr = $(tds[2]).text().trim();

                        if (weightStr.toLowerCase().includes('berat')) return; // skip header tr

                        let weightNum = parseFloat(weightStr.replace(/,/g, ''));
                        let sellNum = parseInt(sellStr.replace('Rp', '').replace(/,/g, '').trim()) || 0;
                        let buybackNum = parseInt(buybackStr.replace('Rp', '').replace(/,/g, '').trim()) || 0;

                        if (!isNaN(weightNum)) {
                            webPrices.push({
                                Brand: "Stargold",
                                Category: "STARGOLD",
                                Berat: weightNum,
                                Harga: sellNum,
                                Buyback: buybackNum
                            });

                            apiPayload.push({
                                brand_name: "Stargold",
                                category_name: "STARGOLD",
                                weight: weightNum,
                                price_buy: sellNum,
                                price_buy_back: buybackNum,
                                parent: weightNum === 1
                            });
                        }
                    }
                });
            }
        });

        // Simpan langsung ke Excel sebagai file Master/Update
        console.log("Menyimpan semua data ke stargold.xlsx...");
        const wb = xlsx.utils.book_new();
        const ws = xlsx.utils.json_to_sheet(webPrices);
        xlsx.utils.book_append_sheet(wb, ws, "Harga");
        xlsx.writeFile(wb, 'stargold.xlsx');

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
