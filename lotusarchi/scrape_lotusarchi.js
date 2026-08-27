const xlsx = require('xlsx');
const axios = require('axios');

function parseWeight(produk) {
    const match = produk.match(/([\d,\.]+)\s*gr/i);
    if (!match) return 0;
    return parseFloat(match[1].replace(',', '.'));
}

(async () => {
    try {
        // Ambil semua data dari API secara paralel
        console.log("Mengambil data dari API Lotus Archi...");
        const [displayRes, goldRes, silverRes] = await Promise.all([
            axios.get('https://api.lotusarchi.com/harga-display'),
            axios.get('https://lotusarchi.com/wp-json/la/v1/harga-gold'),
            axios.get('https://api.lotusarchi.com/harga-silver'),
        ]);

        const products = displayRes.data.data;
        const goldBuybackRate = goldRes.data.data[0].buyback_emas;
        const silverBuybackRate = silverRes.data.data[0].buyback_silver;

        console.log(`Gold Buyback Rate  : Rp ${goldBuybackRate.toLocaleString()} / gram`);
        console.log(`Silver Buyback Rate: Rp ${silverBuybackRate.toLocaleString()} / gram`);

        const webPrices = [];
        const apiPayload = [];

        for (const { produk, type, harga } of products) {
            if (produk.includes('WB')) continue;

            const weight = parseWeight(produk);
            if (!weight || !harga) continue;

            let category;
            let buybackRate;

            if (type === 'silver') {
                category = 'Perak';
                buybackRate = silverBuybackRate;
            } else if (produk.toLowerCase().includes('paper gold')) {
                category = 'Paper Gold';
                buybackRate = goldBuybackRate;
            } else {
                category = 'Emas';
                buybackRate = goldBuybackRate;
            }

            const price_buy_back = buybackRate * weight;

            webPrices.push({
                Brand: 'Lotus Archi',
                Category: category,
                Berat: weight,
                Harga: harga,
                Buyback: price_buy_back
            });
            apiPayload.push({
                brand_name: 'Lotus Archi',
                category_name: category,
                weight,
                price_buy: harga,
                price_buy_back,
                parent: weight === 1
            });
        }

        // Simpan ke Excel
        console.log("Menyimpan data ke lotusarchi.xlsx...");
        const wb = xlsx.utils.book_new();
        const ws = xlsx.utils.json_to_sheet(webPrices);
        xlsx.utils.book_append_sheet(wb, ws, 'Harga');
        xlsx.writeFile(wb, 'lotusarchi.xlsx');

        // Push ke Backend API
        console.log("Mengirim data ke Backend API...");
        try {
            const response = await axios.post('https://api.nabungmas.my.id/api/gold-prices/sync', {
                prices: apiPayload
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
        console.error(e);
    }
})();
