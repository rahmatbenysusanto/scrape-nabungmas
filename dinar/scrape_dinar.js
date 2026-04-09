const xlsx = require('xlsx');
const cheerio = require('cheerio');
const axios = require('axios');
const fs = require('fs');
const path = require('path');

const brandName = 'Dinar Khoirur Rooziqiin';
const excelFile = 'dinar.xlsx';
const url = 'https://dinarkr.com/main/harga-emas.php?action=dkrharga';

(async () => {
    try {
        console.log(`[${brandName}] Mengambil data dari web...`);
        const response = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        const $ = cheerio.load(response.data);
        const webPrices = {};

        $('table.table-dkr tbody tr').each((i, el) => {
            // Kita gunakan alt dari image untuk identifikasi kategori seperti saran sebelumnya
            // Namun user minta urutan yang dia berikan, kita akan sesuaikan
            let category = $(el).find('td img').attr('alt');
            if (!category) {
                // Fallback ke urutan jika alt tidak ada (kasus Row 10 yang typo alt 10 Dinar tapi data 8 Dinar)
                // Kita coba grab text atau gunakan indeks jika perlu. 
                // Untuk amannya kita mapping berdasarkan index baris saja jika struktur web stabil.
            }

            let konsumenStr = $(el).find('td.konsumen span').text().trim().replace(/\./g, '');
            let buybackStr = $(el).find('td.buyback span').text().trim().replace(/\./g, '');

            let priceBuy = parseInt(konsumenStr, 10);
            let priceBuyback = parseInt(buybackStr, 10);

            if (category && !isNaN(priceBuy)) {
                webPrices[category] = {
                    buy: priceBuy,
                    buyback: priceBuyback
                };
            }
        });

        // Mapping manual jika web typonya parah atau tidak konsisten
        // Baris 1: 1/8, 2: 1/4, 3: 1/2, 4: 1, 5: 2, 6: 3, 7: 4, 8: 5, 9: 7, 10: 8, 11: 10
        const rowMapping = [
            '1/8 Dinar', '1/4 Dinar', '1/2 Dinar', '1 Dinar',
            '2 Dinar', '3 Dinar', '4 Dinar', '5 Dinar',
            '7 Dinar', '8 Dinar', '10 Dinar'
        ];

        $('table.table-dkr tbody tr').each((i, el) => {
            if (i < rowMapping.length) {
                let cat = rowMapping[i];
                let konsumenStr = $(el).find('td.konsumen span').text().trim().replace(/\./g, '');
                let buybackStr = $(el).find('td.buyback span').text().trim().replace(/\./g, '');
                
                let priceBuy = parseInt(konsumenStr, 10);
                let priceBuyback = parseInt(buybackStr, 10);

                if (!isNaN(priceBuy)) {
                    webPrices[cat] = {
                        buy: priceBuy,
                        buyback: priceBuyback
                    };
                }
            }
        });

        console.log(`[${brandName}] Data Berhasil di-scrape. Memperbarui Excel...`);

        if (!fs.existsSync(excelFile)) {
            console.log(`[${brandName}] Membuat file ${excelFile} baru...`);
            const initialData = rowMapping.map(cat => {
                let berat = 0;
                if (cat === '1/8 Dinar') berat = 0.53125;
                else if (cat === '1/4 Dinar') berat = 1.0625;
                else if (cat === '1/2 Dinar') berat = 2.125;
                else if (cat === '1 Dinar') berat = 4.25;
                else {
                    berat = parseFloat(cat.split(' ')[0]) * 4.25;
                }
                return {
                    Brand: brandName,
                    Category: cat,
                    Berat: berat,
                    Harga: 0,
                    Buyback: 0
                };
            });
            const wb = xlsx.utils.book_new();
            const ws = xlsx.utils.json_to_sheet(initialData);
            xlsx.utils.book_append_sheet(wb, ws, 'Sheet1');
            xlsx.writeFile(wb, excelFile);
        }

        const workbook = xlsx.readFile(excelFile);
        const sheetName = workbook.SheetNames[0];
        const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

        let apiPayload = [];

        data.forEach(row => {
            const cat = row['Category'];
            if (webPrices[cat]) {
                row['Harga'] = webPrices[cat].buy;
                row['Buyback'] = webPrices[cat].buyback;
            }

            apiPayload.push({
                brand_name: row['Brand'],
                category_name: row['Category'],
                weight: parseFloat(row['Berat']),
                price_buy: row['Harga'],
                price_buy_back: row['Buyback'],
                parent: row['Category'] === '1 Dinar' // 1 Dinar as parent reference
            });
        });

        const newSheet = xlsx.utils.json_to_sheet(data);
        workbook.Sheets[sheetName] = newSheet;
        xlsx.writeFile(workbook, excelFile);

        console.log(`[${brandName}] Mengirim data ke Backend API...`);
        try {
            const responseApi = await axios.post('https://api.nabungmas.my.id/api/gold-prices/sync', {
                prices: apiPayload
            }, {
                headers: { 'Content-Type': 'application/json' }
            });
            console.log(`[${brandName}] Response API:`, responseApi.data);
        } catch (apiErr) {
            console.error(`[${brandName}] Gagal sinkronisasi API:`, apiErr.message);
        }

        console.log(`[${brandName}] Selesai!`);

    } catch (err) {
        console.error(`[${brandName}] ERROR:`, err.message);
    }
})();
