const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const xlsx = require('xlsx');
const cheerio = require('cheerio');
const axios = require('axios');
const fs = require('fs');

puppeteer.use(StealthPlugin());

const brandName = 'Tring Pegadaian';
const excelFile = 'tring.xlsx';
const url = 'https://sahabat.pegadaian.co.id/harga-emas';

(async () => {
    try {
        console.log(`[${brandName}] Membuka browser...`);
        const browser = await puppeteer.launch({
            executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            headless: 'new',
            args: ['--no-sandbox']
        });
        const page = await browser.newPage();

        console.log(`[${brandName}] Mengakses web Pegadaian...`);
        await page.goto(url, { waitUntil: 'networkidle2' });
        const html = await page.content();
        await browser.close();

        const $ = cheerio.load(html);
        let priceBuyRaw = 0;
        let priceBuybackRaw = 0;

        // Mencari elemen berdasarkan teks "Beli Emas" dan "Jual Emas"
        // Pegadaian pakai grid, kita cari tag yang mengandung harga disekitar teks tersebut
        $('div, span, p').each((i, el) => {
           const text = $(el).text().trim();
           if (text === 'Beli Emas') {
               // Biasanya harga ada di elemen berikutnya atau di dalam parent yang sama
               const parentValue = $(el).closest('div').parent().find('span, p').filter((i, e) => $(e).text().includes('Rp')).first().text();
               const cleaned = parentValue.replace('Rp', '').replace(/\./g, '').split('/')[0].trim();
               if (cleaned && !isNaN(parseInt(cleaned))) priceBuyRaw = parseInt(cleaned, 10);
           }
           if (text === 'Jual Emas') {
               const parentValue = $(el).closest('div').parent().find('span, p').filter((i, e) => $(e).text().includes('Rp')).first().text();
               const cleaned = parentValue.replace('Rp', '').replace(/\./g, '').split('/')[0].trim();
               if (cleaned && !isNaN(parseInt(cleaned))) priceBuybackRaw = parseInt(cleaned, 10);
           }
        });

        // Fallback jika pencarian cerdas di atas gagal
        if (priceBuyRaw === 0) {
            console.log(`[${brandName}] Mencoba fallback selector...`);
            // Berdasarkan screenshot, harga ada di elemen span besar
            // Kita coba grab semua angka Rp dan asumsikan urutannya (Beli dulu baru Jual)
            const prices = [];
            $('span, p, div').each((i, el) => {
                const text = $(el).text().trim();
                // Regex untuk mencocokkan Rp 27.720
                if (/^Rp\s?[0-9.]+$/.test(text)) {
                    prices.push(parseInt(text.replace('Rp', '').replace(/\./g, ''), 10));
                }
            });
            if (prices.length >= 2) {
                priceBuyRaw = prices[0];
                priceBuybackRaw = prices[1];
            }
        }

        const priceBuy = priceBuyRaw * 100;
        const priceBuyback = priceBuybackRaw * 100;

        console.log(`[${brandName}] Harga Web (0.01g): Beli=${priceBuyRaw}, Jual=${priceBuybackRaw}`);
        console.log(`[${brandName}] Harga Hasil (1g): Beli=${priceBuy}, Jual=${priceBuyback}`);

        if (priceBuy === 0 || priceBuyback === 0) {
            throw new Error("Gagal mengambil harga dari web Pegadaian.");
        }

        console.log(`[${brandName}] Memperbarui Excel...`);
        if (!fs.existsSync(excelFile)) {
            const initialData = [{ Brand: brandName, Category: 'Emas Digital', Berat: 1, Harga: priceBuy, Buyback: priceBuyback }];
            const wb = xlsx.utils.book_new();
            const ws = xlsx.utils.json_to_sheet(initialData);
            xlsx.utils.book_append_sheet(wb, ws, 'Sheet1');
            xlsx.writeFile(wb, excelFile);
        } else {
            const workbook = xlsx.readFile(excelFile);
            const sheetName = workbook.SheetNames[0];
            const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
            data.forEach(row => {
                if (row['Category'] === 'Emas Digital' && parseFloat(row['Berat']) === 1) {
                    row['Harga'] = priceBuy;
                    row['Buyback'] = priceBuyback;
                }
            });
            const newSheet = xlsx.utils.json_to_sheet(data);
            workbook.Sheets[sheetName] = newSheet;
            xlsx.writeFile(workbook, excelFile);
        }

        const apiPayload = [{
            brand_name: brandName,
            category_name: 'Emas Digital',
            weight: 1,
            price_buy: priceBuy,
            price_buy_back: priceBuyback,
            parent: true
        }];

        console.log(`[${brandName}] Mengirim ke Backend API...`);
        try {
            await axios.post('https://api.nabungmas.my.id/api/gold-prices/sync', { prices: apiPayload });
        } catch (apiErr) {
            console.error(`[${brandName}] API Sync Error:`, apiErr.message);
        }

        console.log(`[${brandName}] Selesai!`);

    } catch (err) {
        console.error(`[${brandName}] ERROR:`, err.message);
    }
})();
