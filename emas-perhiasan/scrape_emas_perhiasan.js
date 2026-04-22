const xlsx = require('xlsx');
const fs = require('fs');
const axios = require('axios');
const path = require('path');

const brandName = 'Emas Perhiasan';
const excelFile = 'emas_perhiasan.xlsx';
const antamExcelPath = path.join(__dirname, '../antam/antam.xlsx');

const kadarList = [
    { name: 'Kadar 10K', purity: 0.416 },
    { name: 'Kadar 11K', purity: 0.458 },
    { name: 'Kadar 12K', purity: 0.500 },
    { name: 'Kadar 13K', purity: 0.541 },
    { name: 'Kadar 14K', purity: 0.583 },
    { name: 'Kadar 15K', purity: 0.625 },
    { name: 'Kadar 16K', purity: 0.666 },
    { name: 'Kadar 17K', purity: 0.708 },
    { name: 'Kadar 18K', purity: 0.750 },
    { name: 'Kadar 19K', purity: 0.791 },
    { name: 'Kadar 20K', purity: 0.833 },
    { name: 'Kadar 21K', purity: 0.875 },
    { name: 'Kadar 22K', purity: 0.916 },
    { name: 'Kadar 23K', purity: 0.958 },
    { name: 'Kadar 24K', purity: 1.000 }
];

(async () => {
    try {
        console.log(`[${brandName}] Mengambil referensi harga Emas Antam dari file lokal...`);

        if (!fs.existsSync(antamExcelPath)) {
            throw new Error(`File referensi Antam tidak ditemukan di: ${antamExcelPath}. Jalankan scraper Antam terlebih dahulu.`);
        }

        const workbookAntam = xlsx.readFile(antamExcelPath);
        const sheetAntam = workbookAntam.Sheets[workbookAntam.SheetNames[0]];
        const dataAntam = xlsx.utils.sheet_to_json(sheetAntam);

        const antam1g = dataAntam.find(row =>
            row['Category'] === 'Emas Batangan' && (row['Berat'] === 1 || row['Berat'] === '1')
        );

        if (!antam1g) {
            throw new Error("Data Antam 1 Gram tidak ditemukan di file antam.xlsx.");
        }

        const baseBuy = antam1g['Harga'];
        const baseBuyback = antam1g['Buyback'];

        console.log(`[${brandName}] Referensi Antam 24K: Beli=${baseBuy}, Buyback=${baseBuyback}`);

        const finalData = kadarList.map(kadar => {
            return {
                Brand: brandName,
                Category: kadar.name,
                Berat: 1,
                // Harga beli perhiasan biasanya ada tambahan ongkos, tapi untuk estimasi kita pakai harga emas murni x kadar
                Harga: Math.round(baseBuy * kadar.purity),
                // Harga jual kembali (buyback) mengikuti kadar
                Buyback: Math.round(baseBuyback * kadar.purity)
            };
        });

        // Simpan ke Excel
        const wb = xlsx.utils.book_new();
        const ws = xlsx.utils.json_to_sheet(finalData);
        xlsx.utils.book_append_sheet(wb, ws, 'Sheet1');
        xlsx.writeFile(wb, excelFile);

        // Sinkronisasi ke Backend API
        console.log(`[${brandName}] Mengirim data ke Backend API...`);
        const apiPayload = finalData.map(item => ({
            brand_name: item.Brand,
            category_name: item.Category,
            weight: 1,
            price_buy: item.Harga,
            price_buy_back: item.Buyback,
            type: 'gold',
            parent: item.Category.includes('24K') // Set 24K as parent reference
        }));

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
