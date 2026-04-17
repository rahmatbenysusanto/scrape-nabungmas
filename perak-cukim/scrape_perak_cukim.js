const xlsx = require('xlsx');
const fs = require('fs');
const axios = require('axios');
const path = require('path');

const brandName = 'Perak Cukim';
const excelFile = 'perak_cukim.xlsx';
const antamExcelPath = path.join(__dirname, '../antam/antam.xlsx');

(async () => {
    try {
        console.log(`[${brandName}] Mengambil referensi harga Perak Antam dari file lokal...`);
        
        if (!fs.existsSync(antamExcelPath)) {
            throw new Error(`File referensi Antam tidak ditemukan di: ${antamExcelPath}. Jalankan scraper Antam terlebih dahulu.`);
        }

        const workbookAntam = xlsx.readFile(antamExcelPath);
        const sheetAntam = workbookAntam.Sheets[workbookAntam.SheetNames[0]];
        const dataAntam = xlsx.utils.sheet_to_json(sheetAntam);

        // Cari perak murni 250 sebagai basis (karena biasanya itu yang paling kecil di Antam)
        const perak250g = dataAntam.find(row => 
            row['Category'] === 'Perak Murni' && (row['Berat'] === 250 || row['Berat'] === '250')
        );

        if (!perak250g) {
            throw new Error("Data Antam Perak Murni 250g tidak ditemukan di file antam.xlsx.");
        }

        const pricePerGramBuy = Math.round(perak250g['Harga'] / 250);
        const pricePerGramBuyback = Math.round(perak250g['Buyback'] / 250);

        // Kalkulasi Cukim (Kurangi 10% untuk margin cukim/scrap)
        const cukimBuy = Math.round(pricePerGramBuy * 0.9);
        const cukimBuyback = Math.round(pricePerGramBuyback * 0.9);

        console.log(`[${brandName}] Referensi Antam Perak (per gr): Beli=${pricePerGramBuy}, Buyback=${pricePerGramBuyback}`);
        console.log(`[${brandName}] Perak Cukim (-10%): Beli=${cukimBuy}, Buyback=${cukimBuyback}`);

        const finalData = [{ Brand: brandName, Category: 'Perak', Berat: 1, Harga: cukimBuy, Buyback: cukimBuyback }];
        
        // Simpan ke Excel
        const wb = xlsx.utils.book_new();
        const ws = xlsx.utils.json_to_sheet(finalData);
        xlsx.utils.book_append_sheet(wb, ws, 'Sheet1');
        xlsx.writeFile(wb, excelFile);

        // Sinkronisasi ke Backend API
        console.log(`[${brandName}] Mengirim data ke Backend API...`);
        const apiPayload = [{
            brand_name: brandName,
            category_name: 'Perak',
            weight: 1,
            price_buy: cukimBuy,
            price_buy_back: cukimBuyback,
            type: 'silver',
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
