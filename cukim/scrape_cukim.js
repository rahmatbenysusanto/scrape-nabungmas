const xlsx = require('xlsx');
const fs = require('fs');
const axios = require('axios');
const path = require('path');

const brandName = 'Emas Cukim';
const excelFile = 'cukim.xlsx';
const antamExcelPath = path.join(__dirname, '../antam/antam.xlsx');

(async () => {
    try {
        console.log(`[${brandName}] Mengambil referensi harga Antam dari file lokal...`);
        
        // 1. Cek apakah file Antam ada
        if (!fs.existsSync(antamExcelPath)) {
            throw new Error(`File referensi Antam tidak ditemukan di: ${antamExcelPath}. Jalankan scraper Antam terlebih dahulu.`);
        }

        // 2. Baca file Antam dan cari harga 1 Gram
        const workbookAntam = xlsx.readFile(antamExcelPath);
        const sheetAntam = workbookAntam.Sheets[workbookAntam.SheetNames[0]];
        const dataAntam = xlsx.utils.sheet_to_json(sheetAntam);

        const antam1g = dataAntam.find(row => 
            row['Berat'] === 1 || row['Berat'] === '1'
        );

        if (!antam1g) {
            throw new Error("Data Antam 1 Gram tidak ditemukan di file antam.xlsx.");
        }

        const antamBuy = antam1g['Harga'];
        const antamBuyback = antam1g['Buyback'];

        // 3. Kalkulasi Cukim (Kurangi 10%)
        const cukimBuy = Math.round(antamBuy * 0.9);
        const cukimBuyback = Math.round(antamBuyback * 0.9);

        console.log(`[${brandName}] Referensi Antam: Beli=${antamBuy}, Buyback=${antamBuyback}`);
        console.log(`[${brandName}] Emas Cukim (-10%): Beli=${cukimBuy}, Buyback=${cukimBuyback}`);

        // 4. Perbarui Excel Cukim
        if (!fs.existsSync(excelFile)) {
            console.log(`[${brandName}] Membuat file ${excelFile} baru...`);
            const initialData = [{ Brand: brandName, Category: 'Cukim', Berat: 1, Harga: cukimBuy, Buyback: cukimBuyback }];
            const wb = xlsx.utils.book_new();
            const ws = xlsx.utils.json_to_sheet(initialData);
            xlsx.utils.book_append_sheet(wb, ws, 'Sheet1');
            xlsx.writeFile(wb, excelFile);
        } else {
            const workbook = xlsx.readFile(excelFile);
            const sheetName = workbook.SheetNames[0];
            const data = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);
            data.forEach(row => {
                if (row['Category'] === 'Cukim' && (row['Berat'] === 1 || row['Berat'] === '1')) {
                    row['Harga'] = cukimBuy;
                    row['Buyback'] = cukimBuyback;
                }
            });
            const newSheet = xlsx.utils.json_to_sheet(data);
            workbook.Sheets[sheetName] = newSheet;
            xlsx.writeFile(workbook, excelFile);
        }

        // 5. Sinkronisasi ke Backend API
        console.log(`[${brandName}] Mengirim data ke Backend API...`);
        const apiPayload = [{
            brand_name: brandName,
            category_name: 'Cukim',
            weight: 1,
            price_buy: cukimBuy,
            price_buy_back: cukimBuyback,
            parent: true
        }];

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
