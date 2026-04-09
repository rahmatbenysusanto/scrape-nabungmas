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

        console.log("Mengakses web Lotus Archi...");
        await page.goto('https://lotusarchi.com/pricing/', { waitUntil: 'networkidle2' });
        const html = await page.content();
        await browser.close();

        console.log("Mem-parsing data Lotus Archi...");
        const $ = cheerio.load(html);

        let webPrices = [];
        let apiPayload = [];

        // 1. Ekstrak Buyback Price untuk Emas/Paper Gold
        let goldBuybackRate = 0;
        const pageText = $('body').text();
        const buybackMatch = pageText.match(/Buyback Price\s*:\s*Rp\s*([\d\.]+)/i);
        if (buybackMatch) {
            goldBuybackRate = parseInt(buybackMatch[1].replace(/\./g, ''));
            console.log("Gold Buyback Rate: Rp", goldBuybackRate, "/ gram");
        } else {
            console.log("Peringatan: Gold Buyback Rate tidak ditemukan.");
        }

        // 2. Ekstrak Buyback Price untuk Perak
        let perakBuybackRate = 0;
        let perakBuybackFound = false;
        $('table').each((i, table) => {
            $(table).find('tr').each((j, tr) => {
                const text = $(tr).text().toLowerCase();
                if (text.includes('buyback') && text.includes('perak')) {
                    // Cari baris yg isinya "Perak Lotus Archi | Rp 57.000 / gram"
                }
                const cols = $(tr).find('td, th').map((k, td) => $(td).text().trim()).get();
                if (cols.length >= 2) {
                    if (cols[0].toLowerCase().includes('perak') && cols[1].includes('/ gram')) {
                        if (cols[0].toLowerCase().includes('buyback') || $(table).text().toLowerCase().includes('buyback')) {
                            const val = cols[1].replace(/[^\d]/g, '');
                            perakBuybackRate = parseInt(val);
                            perakBuybackFound = true;
                        }
                    }
                }
            });
        });

        // Backup parsing jika tidak ketemu (berdasarkan dump table 1)
        if (!perakBuybackFound) {
            $('table').eq(1).find('tr').each((j, tr) => {
                const cols = $(tr).find('td, th').map((k, td) => $(td).text().trim()).get();
                if (cols.length >= 2 && cols[0].toLowerCase().includes('perak')) {
                    const val = cols[1].replace(/[^\d]/g, '');
                    perakBuybackRate = parseInt(val);
                }
            });
        }
        console.log("Perak Buyback Rate: Rp", perakBuybackRate, "/ gram");

        // 3. Ekstrak data Perak (Table 0)
        $('table').eq(0).find('tr').each((j, tr) => {
            if (j === 0) return; // Header
            const cols = $(tr).find('td, th').map((k, td) => $(td).text().trim()).get();
            if (cols.length >= 2) {
                let name = cols[0].toLowerCase();
                let priceStr = cols[1];

                let weightNum = 0;
                if (name.includes('1 kg')) weightNum = 1000;
                else if (name.includes('50 gr')) weightNum = 50;
                else if (name.includes('100 gr')) weightNum = 100;

                let pricePerGram = parseInt(priceStr.replace(/[^\d]/g, ''));

                if (weightNum > 0 && pricePerGram > 0) {
                    let price_buy = pricePerGram * weightNum;
                    let price_buy_back = perakBuybackRate * weightNum;

                    webPrices.push({
                        Brand: "Lotus Archi",
                        Category: "Perak",
                        Berat: weightNum,
                        Harga: price_buy,
                        Buyback: price_buy_back
                    });
                    apiPayload.push({
                        brand_name: "Lotus Archi",
                        category_name: "Perak",
                        weight: weightNum,
                        price_buy: price_buy,
                        price_buy_back: price_buy_back,
                        parent: weightNum === 1
                    });
                }
            }
        });

        // 4. Ekstrak Emas & Paper Gold (Table 2)
        $('table').eq(2).find('tr').each((j, tr) => {
            if (j === 0) return; // Header
            const cols = $(tr).find('td, th').map((k, td) => $(td).text().trim()).get();
            if (cols.length >= 2) {
                let name = cols[0];
                let priceStr = cols[1];
                let price_buy = parseInt(priceStr.replace(/[^\d]/g, ''));

                if (!price_buy) return;

                // Skip WB edition
                if (name.includes('(WB)')) return;

                let category = name.toLowerCase().includes('paper gold') ? "Paper Gold" : "Emas";

                // Get weight
                let weightMatch = name.match(/([\d\.]+)\s*gr/i);
                if (weightMatch) {
                    let weightNum = parseFloat(weightMatch[1]);
                    let price_buy_back = goldBuybackRate * weightNum;

                    webPrices.push({
                        Brand: "Lotus Archi",
                        Category: category,
                        Berat: weightNum,
                        Harga: price_buy,
                        Buyback: price_buy_back
                    });
                    apiPayload.push({
                        brand_name: "Lotus Archi",
                        category_name: category,
                        weight: weightNum,
                        price_buy: price_buy,
                        price_buy_back: price_buy_back,
                        parent: weightNum === 1
                    });
                }
            }
        });

        // Simpan ke Excel
        console.log("Menyimpan semua data ke lotusarchi.xlsx...");
        const wb = xlsx.utils.book_new();
        const ws = xlsx.utils.json_to_sheet(webPrices);
        xlsx.utils.book_append_sheet(wb, ws, "Harga");
        xlsx.writeFile(wb, 'lotusarchi.xlsx');

        // Push to API
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
