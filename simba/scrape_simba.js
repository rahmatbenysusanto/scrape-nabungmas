const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const xlsx = require('xlsx');
const cheerio = require('cheerio');
const axios = require('axios');
const fs = require('fs');

puppeteer.use(StealthPlugin());

const brandName = 'Simba Gold';
const excelFile = 'simba.xlsx';
const homeUrl = 'https://simbarefinery.com/id';
const catalogUrl = 'https://simbarefinery.com/id/customer';

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

        // 1. Ambil Harga Dasarnya
        console.log(`[${brandName}] Mengambil harga acuan per gram...`);
        await page.goto(homeUrl, { waitUntil: 'networkidle2', timeout: 60000 });
        const prices = await page.evaluate(() => {
            const bodyText = document.body.innerText;
            const jualMatch = bodyText.match(/Harga Jual\/Gram\s?Rp\s?([0-9.]+)/i);
            const bbMatch = bodyText.match(/Harga Buyback\/Gram\s?Rp\s?([0-9.]+)/i);
            return {
                jual: jualMatch ? parseInt(jualMatch[1].replace(/\./g, ''), 10) : 2785000,
                buyback: bbMatch ? parseInt(bbMatch[1].replace(/\./g, ''), 10) : 2510000
            };
        });
        console.log(`[${brandName}] Harga Master: Jual=${prices.jual}, Buyback=${prices.buyback}`);

        const results = [];
        const seriesToClick = ['Fortune Cat', 'Salahudin', 'Idul Fitri', 'Classic', 'Nusantara', 'Christmas', 'Lunar'];

        for (const series of seriesToClick) {
            console.log(`[${brandName}] Memproses Seri: ${series}...`);
            await page.goto(catalogUrl, { waitUntil: 'networkidle2', timeout: 60000 });
            
            // Buka Sidebar Filter
            await page.waitForSelector('button', { timeout: 10000 });
            await page.evaluate(() => {
                const buttons = Array.from(document.querySelectorAll('button'));
                const filterBtn = buttons.find(b => b.innerText.includes('Filter'));
                if (filterBtn) filterBtn.click();
            });

            // Klik Seri yang diinginkan
            await new Promise(r => setTimeout(r, 1000));
            const clicked = await page.evaluate((targetSeries) => {
                const labels = Array.from(document.querySelectorAll('label'));
                const target = labels.find(l => l.innerText.toLowerCase().includes(targetSeries.toLowerCase()));
                if (target) {
                    target.click();
                    return true;
                }
                return false;
            }, series);

            if (!clicked) {
                console.log(`[${brandName}] Seri ${series} tidak ditemukan di filter.`);
                continue;
            }

            // Tunggu produk update
            await new Promise(r => setTimeout(r, 2000));

            // Scrape produk di halaman ini (dan pagination jika ada)
            let hasMorePages = true;
            let currentPage = 1;

            while (hasMorePages && currentPage <= 5) {
                const productsOnPage = await page.evaluate((brand, cat, jual, bb) => {
                    const items = [];
                    const cards = document.querySelectorAll('h3'); // Selector judul
                    cards.forEach(h3 => {
                        const card = h3.closest('div.bg-white') || h3.parentElement.parentElement;
                        const title = h3.innerText.trim();
                        const text = card.innerText;
                        const weightMatch = text.match(/([0-9.]+)\s?Gram/i) || title.match(/([0-9.]+)\s?gr/i);
                        
                        if (weightMatch) {
                            const weight = parseFloat(weightMatch[1].replace(',', '.'));
                            items.push({
                                Brand: brand,
                                Category: cat,
                                Berat: weight,
                                Harga: Math.round(weight * jual),
                                Buyback: Math.round(weight * bb),
                                Title: title
                            });
                        }
                    });
                    return items;
                }, brandName, series, prices.jual, prices.buyback);

                results.push(...productsOnPage);

                // Cek apakah ada halaman berikutnya (Pagination)
                hasMorePages = await page.evaluate(() => {
                    const nextBtn = Array.from(document.querySelectorAll('button')).find(b => b.innerText === '>' || b.ariaLabel?.includes('Next'));
                    if (nextBtn && !nextBtn.disabled) {
                        nextBtn.click();
                        return true;
                    }
                    return false;
                });

                if (hasMorePages) {
                    await new Promise(r => setTimeout(r, 2000));
                    currentPage++;
                }
            }
        }

        await browser.close();
        
        // Simpan ke Excel (Unique)
        const uniqueEntries = [];
        const seen = new Set();
        results.forEach(r => {
            const key = `${r.Category}_${r.Berat}`;
            if (!seen.has(key)) {
                uniqueEntries.push(r);
                seen.add(key);
            }
        });

        console.log(`[${brandName}] Selesai! Berhasil mengambil ${uniqueEntries.length} data kategori.`);
        const wb = xlsx.utils.book_new();
        const ws = xlsx.utils.json_to_sheet(uniqueEntries);
        xlsx.utils.book_append_sheet(wb, ws, 'Sheet1');
        xlsx.writeFile(wb, excelFile);

        // Sinkronisasi Backend
        const apiPayload = uniqueEntries.map(p => ({
            brand_name: brandName,
            category_name: p.Category,
            weight: p.Berat,
            price_buy: p.Harga,
            price_buy_back: p.Buyback,
            parent: p.Berat === 1
        }));

        await axios.post('https://api.nabungmas.my.id/api/gold-prices/sync', { prices: apiPayload });
        console.log(`[${brandName}] Sinkronisasi Backend Berhasil.`);

    } catch (err) {
        console.error(`[${brandName}] ERROR:`, err.message);
    }
})();
