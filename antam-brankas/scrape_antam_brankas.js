const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const xlsx = require('xlsx');
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

        // Ambil Harga Beli BRANKAS Korporat dari brankaslm.com
        console.log("Mengakses brankaslm.com/dashboard...");
        await page.goto('https://brankaslm.com/dashboard', { waitUntil: 'networkidle2', timeout: 30000 });

        const priceBuy = await page.evaluate(() => {
            const divs = document.querySelectorAll('div');
            for (const div of divs) {
                if (div.textContent.trim() === 'Harga Beli Emas BRANKAS Korporat') {
                    const priceDiv = div.nextElementSibling;
                    if (priceDiv) {
                        const match = priceDiv.textContent.trim().match(/Rp\s*([\d,\.]+)/);
                        if (match) return parseInt(match[1].replace(/,/g, ''));
                    }
                }
            }
            return null;
        });

        await browser.close();

        if (!priceBuy) throw new Error("Harga Beli BRANKAS Korporat tidak ditemukan.");
        console.log(`Harga Beli BRANKAS Korporat: Rp ${priceBuy.toLocaleString('id-ID')}`);

        // Produk online: harga buyback = harga beli
        const priceBuyBack = priceBuy;
        console.log(`Harga Buyback: Rp ${priceBuyBack.toLocaleString('id-ID')} (sama dengan harga beli)`);

        // 3. Simpan ke Excel
        console.log("Menyimpan ke antam_brankas.xlsx...");
        const rows = [{
            Brand: 'Brankas Antam',
            Category: 'Emas Digital',
            Berat: 1,
            Harga: priceBuy,
            Buyback: priceBuyBack
        }];
        const wb = xlsx.utils.book_new();
        const ws = xlsx.utils.json_to_sheet(rows);
        xlsx.utils.book_append_sheet(wb, ws, 'Harga');
        xlsx.writeFile(wb, 'antam_brankas.xlsx');

        // 4. Push ke Backend API
        console.log("Mengirim data ke Backend API...");
        try {
            const response = await axios.post('https://api.nabungmas.my.id/api/gold-prices/sync', {
                prices: [{
                    brand_name: 'Brankas Antam',
                    category_name: 'Emas Digital',
                    weight: 1,
                    price_buy: priceBuy,
                    price_buy_back: priceBuyBack,
                    parent: true
                }]
            }, {
                headers: { 'Content-Type': 'application/json' }
            });
            console.log("Response dari Backend:", response.data);
        } catch (apiErr) {
            console.error("Gagal mengirim ke backend:", apiErr.message);
            if (apiErr.response) console.error("Response:", apiErr.response.data);
        }

        console.log("Selesai!");

    } catch (e) {
        console.error("CRITICAL ERROR:", e.message);
        process.exit(1);
    }
})();
