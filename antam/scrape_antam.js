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

        console.log("Mengakses web antam (Harga Beli)...");
        await page.goto('https://logammulia.com/id/harga-emas-hari-ini', { waitUntil: 'networkidle2' });
        const htmlBuy = await page.content();

        console.log("Mengakses web antam (Harga Buyback)...");
        await page.goto('https://logammulia.com/id/sell/gold', { waitUntil: 'networkidle2' });
        const htmlSell = await page.content();

        await browser.close();

        // 1. Parse Harga Beli
        console.log("Mem-parsing data Harga Beli...");
        const $buy = cheerio.load(htmlBuy);
        let pricesBuy = {};
        let currentCategory = "";

        $buy('.table-bordered tbody tr').each((i, el) => {
            const thCenter = $buy(el).find('th[style*="text-align:center"]');
            if (thCenter.length > 0) {
                let catText = thCenter.text().trim();
                if (catText.toLowerCase().includes('emas batangan gift series')) currentCategory = 'Gift Series';
                else if (catText.toLowerCase().includes('emas batangan selamat idul fitri')) currentCategory = 'Idul Fitri';
                else if (catText.toLowerCase().includes('emas batangan imlek')) currentCategory = 'Imlek';
                else if (catText.toLowerCase().includes('emas batangan batik seri iii')) currentCategory = 'Batik Seri III';
                else if (catText.toLowerCase().includes('emas batangan')) currentCategory = 'Emas Batangan';
                else if (catText.toLowerCase().includes('perak murni')) currentCategory = 'Perak Murni';
                else if (catText.toLowerCase().includes('perak heritage')) currentCategory = 'Perak Heritage';
                else if (catText.toLowerCase().includes('liontin batik seri iii')) currentCategory = 'Liontin Batik Seri III';
                return;
            }

            const tds = $buy(el).find('td');
            if (tds.length >= 2 && currentCategory) {
                let beratStr = $buy(tds[0]).text().trim().replace(' gr', '').replace(',', '.');
                let hargaStr = $buy(tds[1]).text().trim().replace(/,/g, '').replace(/\./g, '');

                let beratNum = parseFloat(beratStr);
                let hargaNum = parseInt(hargaStr, 10);

                if (!isNaN(beratNum) && !isNaN(hargaNum)) {
                    if (!pricesBuy[currentCategory]) pricesBuy[currentCategory] = {};
                    pricesBuy[currentCategory][beratNum] = hargaNum;
                }
            }
        });

        // 2. Parse Harga Buyback Dasar
        console.log("Mem-parsing data Harga Buyback...");
        const $sell = cheerio.load(htmlSell);
        let baseBuybackPrice = 0;
        const baseBuybackInput = $sell('#valBasePrice');
        if (baseBuybackInput.length > 0) {
            baseBuybackPrice = Math.floor(parseFloat(baseBuybackInput.val()));
        } else {
            // Fallback to text matching if input not found
            $sell('.title').each((i, el) => {
                if ($sell(el).text().includes('Harga Buyback:')) {
                    const valueEl = $sell(el).next('.value');
                    const val = valueEl.find('.text').text().trim() || valueEl.text().trim();
                    if (val) {
                        let cleaned = val.replace('Rp', '').replace(/,/g, '').replace(/\./g, '').trim();
                        baseBuybackPrice = parseInt(cleaned, 10);
                    }
                }
            });
        }

        console.log("Harga Dasar Buyback:", baseBuybackPrice);

        // 3. Update Excel
        console.log("Membaca antam.xlsx...");
        const workbook = xlsx.readFile('antam.xlsx');
        const sheetName = workbook.SheetNames[0];
        const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

        let apiPayload = [];

        console.log("Memperbarui harga...");
        data.forEach(row => {
            const category = row['Category'];
            let rowBerat = row['Berat'].toString().replace(',', '.');
            const beratNum = parseFloat(rowBerat);

            // Update Harga Beli
            let priceBuyItem = 0;
            if (pricesBuy[category] && pricesBuy[category][beratNum]) {
                priceBuyItem = pricesBuy[category][beratNum];
                row['Harga'] = priceBuyItem;
            } else {
                console.log(`Harga beli untuk ${category} - ${rowBerat}g tidak ditemukan di web.`);
                priceBuyItem = row['Harga'] || 0; // fallback to existing or 0
            }

            // Update Harga Buyback
            let priceBuyBackItem = baseBuybackPrice * beratNum;
            if (category.toLowerCase().includes('perak')) {
                priceBuyBackItem = priceBuyItem; // Untuk perak, harga buyback disamakan dengan harga beli
            }
            row['Buyback'] = priceBuyBackItem;

            apiPayload.push({
                brand_name: row['Brand'],
                category_name: category,
                weight: beratNum,
                price_buy: priceBuyItem,
                price_buy_back: priceBuyBackItem,
                type: category.toLowerCase().includes('perak') ? 'silver' : 'gold',
                parent: beratNum === 1 // Set 1 gram as parent for example, standard convention
            });
        });

        const newSheet = xlsx.utils.json_to_sheet(data);
        workbook.Sheets[sheetName] = newSheet;

        console.log("Menyimpan ke antam_updated.xlsx...");
        xlsx.writeFile(workbook, 'antam_updated.xlsx');
        xlsx.writeFile(workbook, 'antam.xlsx'); // Overwrite original as well per request

        // 4. Send to Backend API
        console.log("Mengirim data ke Backend API...");
        try {
            // Kita belum ada bearer token yg spesifik, asumsi API route auth atau bisa ditembak.
            // Kita akan implement backend supaya sync route ini bisa / open dulu atau internal.
            // Untuk sementara kita send POST request ke http://localhost:3000/api/gold-prices/sync
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
