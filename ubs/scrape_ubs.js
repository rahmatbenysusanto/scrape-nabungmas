const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const xlsx = require('xlsx');
const cheerio = require('cheerio');
const axios = require('axios');
const fs = require('fs');

puppeteer.use(StealthPlugin());

const brandName = 'UBS Gold';
const excelFile = 'ubs.xlsx';
const buyLink = 'https://ubslifestyle.com/fine-gold/?pagesize=500';
const buybackLink = 'https://ubslifestyle.com/harga-buyback-hari-ini/';

(async () => {
    try {
        console.log(`[${brandName}] Membuka browser...`);
        const browser = await puppeteer.launch({
            executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            headless: 'new',
            args: ['--no-sandbox']
        });
        const page = await browser.newPage();
        await page.setViewport({ width: 1200, height: 1000 });

        // 1. Scraping Buyback Prices
        console.log(`[${brandName}] Mengambil harga buyback...`);
        await page.goto(buybackLink, { waitUntil: 'networkidle2', timeout: 60000 });
        const buybackHtml = await page.content();
        const $bb = cheerio.load(buybackHtml);
        
        const buybackRates = {}; 
        $bb('table tr').each((i, el) => {
            const tds = $bb(el).find('td');
            if (tds.length >= 2) {
                const weightText = $bb(tds[0]).text().trim().toLowerCase().replace(' gr', '').replace(' gram', '').replace(',', '.');
                const priceText = $bb(tds[1]).text().trim().replace(/Rp/g, '').replace(/\./g, '').replace(/,/g, '').trim();
                const weightNum = parseFloat(weightText);
                const priceNum = parseInt(priceText, 10);
                if (!isNaN(weightNum) && !isNaN(priceNum)) {
                    buybackRates[weightNum] = priceNum;
                }
            }
        });
        console.log(`[${brandName}] Berhasil memetakan data buyback.`);

        // 2. Scraping Product List (Selling Prices)
        console.log(`[${brandName}] Mengakses katalog produk Fine Gold (Halaman Berat)...`);
        await page.goto(buyLink, { waitUntil: 'networkidle2', timeout: 120000 });
        
        // Tunggu sampai produk muncul (Class baru: .as-producttile)
        console.log(`[${brandName}] Menunggu produk dimuat...`);
        try {
            await page.waitForSelector('.as-producttile', { timeout: 30000 });
        } catch (e) {
            console.log(`[${brandName}] Warning: Selector tidak muncul, mencoba ambil HTML langsung.`);
        }

        const buyHtml = await page.content();
        const $buy = cheerio.load(buyHtml);
        
        const products = [];
        $buy('.as-producttile').each((i, el) => {
            const title = $buy(el).find('.as-producttile-tilelink').text().trim();
            // Harga biasanya ada di dalam .as-producttile-info atau elemen sibling
            const priceText = $buy(el).text().match(/Rp\s?([0-9.]+)/);
            let priceBuy = 0;
            if (priceText && priceText[1]) {
                priceBuy = parseInt(priceText[1].replace(/\./g, ''), 10);
            }
            
            if (title && priceBuy > 0) {
                // Extract Weight
                const weightMatch = title.match(/([0-9.,]+)\s?(Gr|Gram)/i);
                let weight = 0;
                if (weightMatch) {
                    weight = parseFloat(weightMatch[1].replace(',', '.'));
                }

                // Mapping Category secara spesifik sesuai permintaan user
                let category = 'Classic';
                const keywords = [
                    { name: 'Mickey Mouse', key: 'Mickey' },
                    { name: 'Donald Duck', key: 'Donald' },
                    { name: 'Frozen Elsa', key: 'Elsa' },
                    { name: 'Frozen', key: 'Frozen' },
                    { name: 'Disney Princess', key: 'Princess' },
                    { name: 'Disney', key: 'Disney' },
                    { name: 'Hello Kitty', key: 'Hello Kitty' },
                    { name: 'Sanrio', key: 'Sanrio' },
                    { name: 'Marvel', key: 'Marvel' },
                    { name: 'Mobile Legends', key: 'Mobile Legends' },
                    { name: 'Mobile Legends', key: 'MLBB' },
                    { name: 'Kartu Ucapan', key: 'Greeting' },
                    { name: 'Kartu Ucapan', key: 'Kartu' },
                    { name: 'Logam Mulia Indonesia', key: 'Indonesia' }
                ];
                
                for (let k of keywords) {
                    if (title.toLowerCase().includes(k.key.toLowerCase())) {
                        category = k.name;
                        break;
                    }
                }

                products.push({
                    Brand: brandName,
                    Category: category,
                    Berat: weight,
                    Harga: priceBuy,
                    Buyback: buybackRates[weight] || 0,
                    Title: title
                });
            }
        });
        
        await browser.close();
        console.log(`[${brandName}] Berhasil mengambil ${products.length} data produk.`);

        if (products.length === 0) {
            throw new Error("Gagal mengambil produk. Website mungkin sedang diproteksi atau selector berubah.");
        }

        // 3. Update Excel (Unique Category + Weight)
        const uniqueProducts = [];
        const seen = new Set();
        products.forEach(p => {
           const key = `${p.Category}_${p.Berat}`;
           if (!seen.has(key)) {
               uniqueProducts.push(p);
               seen.add(key);
           }
        });

        console.log(`[${brandName}] Menyimpan ${uniqueProducts.length} data kategori unik ke Excel...`);
        const wb = xlsx.utils.book_new();
        const ws = xlsx.utils.json_to_sheet(uniqueProducts);
        xlsx.utils.book_append_sheet(wb, ws, 'Sheet1');
        xlsx.writeFile(wb, excelFile);

        // 4. Sinkronisasi Backend API
        const apiPayload = uniqueProducts
            .filter(p => p.Berat > 0 && p.Harga > 0)
            .map(p => ({
                brand_name: brandName,
                category_name: p.Category,
                weight: p.Berat,
                price_buy: p.Harga,
                price_buy_back: p.Buyback
            }));

        console.log(`[${brandName}] Sinkronisasi ke Backend API...`);
        try {
            const syncRes = await axios.post('https://api.nabungmas.my.id/api/gold-prices/sync', { prices: apiPayload });
            console.log(`[${brandName}] Sync Sukses:`, syncRes.data.message);
        } catch (apiErr) {
            console.error(`[${brandName}] API Sync Error:`, apiErr.message);
        }

        console.log(`[${brandName}] Selesai!`);

    } catch (err) {
        console.error(`[${brandName}] ERROR:`, err.message);
    }
})();
