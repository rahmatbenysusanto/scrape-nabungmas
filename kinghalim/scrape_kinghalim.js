const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const xlsx = require('xlsx');
const cheerio = require('cheerio');
const axios = require('axios');

puppeteer.use(StealthPlugin());

(async () => {
    try {
        console.log("Membuka browser...");
        // Gunakan puppeteer-core dengan path chrome yang sesuai (macOS)
        const browser = require('puppeteer-core').launch({
            executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            headless: 'new',
            args: ['--no-sandbox']
        });
        const browserObj = await browser;
        const page = await browserObj.newPage();

        console.log("Mengakses web King Halim...");
        await page.goto('https://www.kinghalim.com/goldbarwithamala', { waitUntil: 'networkidle2' });

        // Wait sebentar untuk render elements
        await new Promise(r => setTimeout(r, 2000));

        const html = await page.content();
        await browserObj.close();

        console.log("Mem-parsing data King Halim...");
        const $ = cheerio.load(html);

        const $body = $('body');
        $body.find('script, style, noscript, svg, img').remove();
        const text = $body.text().replace(/\s+/g, ' ').trim();

        let webPrices = [];
        let apiPayload = [];

        // 1. Dapatkan Buyback Rate per Gram
        let goldBuybackRate = 0;
        let buybackMatch = text.match(/Harga Buyback\s*:\s*Rp\s*([0-9,\.]+)/i);
        if (buybackMatch) {
            // Hilangkan koma, ambil bagian sebelum koma pecahan (.00)
            let parsedVal = buybackMatch[1].replace(/,/g, '');
            goldBuybackRate = parseFloat(parsedVal);
            console.log(`Gold Buyback Rate: Rp ${goldBuybackRate} / gram`);
        } else {
            console.log("Peringatan: Harga Buyback tidak ditemukan.");
        }

        // 2. Dapatkan daftar produk dan harga jual
        let regex = /([0-9\.]+)\s*Gr\s*Rp\s*([0-9,\.]+)/ig;
        let match;
        const foundWeights = new Set();

        while ((match = regex.exec(text)) !== null) {
            let weightNum = parseFloat(match[1]);
            let priceStr = match[2].replace(/,/g, '');
            let price_buy = parseFloat(priceStr);

            // Mencegah duplikasi jika regex match berulang kali untuk berat yang sama
            if (foundWeights.has(weightNum)) continue;
            foundWeights.add(weightNum);

            let price_buy_back = goldBuybackRate * weightNum;

            webPrices.push({
                Brand: "King Halim",
                Category: "Emas",
                Berat: weightNum,
                Harga: price_buy,
                Buyback: price_buy_back
            });

            apiPayload.push({
                brand_name: "King Halim",
                category_name: "Emas",
                weight: weightNum,
                price_buy: price_buy,
                price_buy_back: price_buy_back,
                parent: weightNum === 1
            });
        }

        if (webPrices.length === 0) {
            console.log("Gagal mendapatkan harga jual King Halim.");
            return;
        }

        // Simpan ke Excel
        console.log("Menyimpan semua data ke kinghalim.xlsx...");
        const wb = xlsx.utils.book_new();
        const ws = xlsx.utils.json_to_sheet(webPrices);
        xlsx.utils.book_append_sheet(wb, ws, "Harga");
        xlsx.writeFile(wb, 'kinghalim.xlsx');

        // Push to API
        console.log("Mengirim data ke Backend API (Upsert & Auto-run)...");
        console.log("PAYLOAD:", JSON.stringify(apiPayload, null, 2));
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
        console.error("Error scraping King Halim:", e);
    }
})();
