const axios = require('axios');
const cheerio = require('cheerio');
const xlsx = require('xlsx');

(async () => {
    try {
        console.log("Membuka web Sampoerna Gold...");

        const response = await axios.get('https://sampoernagold.com/', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
            }
        });

        console.log("Mem-parsing data WARIS Sampoerna...");
        const $ = cheerio.load(response.data);

        let webPrices = [];
        let apiPayload = [];

        // Mencari tabel harga emas
        $('table.table-emas tr').each((i, row) => {
            // Abaikan header
            if ($(row).find('th').length > 0) return;

            const tds = $(row).find('td');
            if (tds.length >= 3) {
                let weightText = $(tds[0]).text().trim(); // "0,5"
                let priceBuyText = $(tds[1]).text().trim(); // "Rp 1.563.000"
                let priceBuybackText = $(tds[2]).text().trim(); // "Rp 1.405.000"

                // Parsing nilai
                weightText = weightText.replace(/,/g, '.').replace(/[^\d.]/g, ''); // 0.5
                let weightNum = parseFloat(weightText);

                let priceBuyNum = parseFloat(priceBuyText.replace(/[^\d]/g, ''));
                let priceBuybackNum = parseFloat(priceBuybackText.replace(/[^\d]/g, ''));

                if (!isNaN(weightNum) && !isNaN(priceBuyNum) && !isNaN(priceBuybackNum)) {
                    webPrices.push({
                        Brand: "Waris Sampoerna",
                        Category: "Emas",
                        Berat: weightNum,
                        Harga: priceBuyNum,
                        Buyback: priceBuybackNum
                    });

                    apiPayload.push({
                        brand_name: "Waris Sampoerna",
                        category_name: "Emas",
                        weight: weightNum,
                        price_buy: priceBuyNum,
                        price_buy_back: priceBuybackNum,
                        parent: weightNum === 1
                    });
                }
            }
        });

        if (webPrices.length === 0) {
            console.log("Gagal mendapatkan harga jual Sampoerna Gold.");
            return;
        }

        // Simpan ke Excel
        console.log("Menyimpan semua data ke sampoerna.xlsx...");
        const wb = xlsx.utils.book_new();
        const ws = xlsx.utils.json_to_sheet(webPrices);
        xlsx.utils.book_append_sheet(wb, ws, "Harga");
        xlsx.writeFile(wb, 'sampoerna.xlsx');

        // Push to API
        console.log("Mengirim data ke Backend API (Upsert & Auto-run)...");
        console.log("PAYLOAD:", JSON.stringify(apiPayload, null, 2));
        try {
            const apiResponse = await axios.post('https://api.nabungmas.my.id/api/gold-prices/sync', {
                prices: apiPayload
            }, {
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            console.log("Response dari Backend:", apiResponse.data);
        } catch (apiErr) {
            console.error("Gagal mengirim ke backend:", apiErr.message);
            if (apiErr.response) {
                console.error("Response:", apiErr.response.data);
            }
        }

        console.log("Selesai!");

    } catch (e) {
        console.error("Error scraping Sampoerna Gold:", e);
    }
})();
