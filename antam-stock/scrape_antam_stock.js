const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');

const REGIONS = [
    { id: 'nav-pulogadung', name: 'Graha Dipta' },
    { id: 'nav-jabodetabek', name: 'Jabodetabek' },
    { id: 'nav-jawabali', name: 'Jawa & Bali' },
    { id: 'nav-luarjawa', name: 'Luar Pulau Jawa' }
];

function extractPrice(text) {
    const match = text.match(/Rp\s*([\d\.]+)/);
    if (match) {
        return parseFloat(match[1].replace(/\./g, ''));
    }
    return 0;
}

function extractStock(text) {
    const match = text.match(/Stock:\s*(.+)$/i);
    if (match) {
        return match[1].trim();
    }
    return "Unknown";
}

async function scrapeAntamStock() {
    try {
        console.log('[Antam Stock] Fetching data...');
        const { data } = await axios.get('https://emasantam.id/harga-emas-antam-harian/', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });

        const $ = cheerio.load(data);
        const payload = [];

        for (const region of REGIONS) {
            const pane = $(`#${region.id}`);
            if (!pane.length) {
                console.log(`[Antam Stock] Warning: Region pane ${region.id} not found.`);
                continue;
            }

            const table = pane.find('table').first();
            if (!table.length) continue;

            const boutiques = [];
            table.find('thead tr').last().find('th, td').each((i, el) => {
                // Usually the first column header is empty (for grammage)
                boutiques.push($(el).text().trim());
            });

            table.find('tbody tr').each((i, row) => {
                const cols = $(row).find('td');
                if (cols.length < boutiques.length) return;

                const weightText = $(cols[0]).text().trim().replace(/\\n/g, ' ');
                // Skip rows that don't look like valid weights (e.g., '10', '0.5', '1000')
                if (!weightText.match(/^[\d\.]+$/)) return;

                for (let j = 1; j < cols.length; j++) {
                    const colText = $(cols[j]).text().trim().replace(/\\n/g, ' ');
                    const price = extractPrice(colText);
                    const stockText = extractStock(colText);
                    
                    // The boutiques array comes from the last tr of thead, 
                    // which usually skips the 'Gramasi' column due to rowspan.
                    // So boutiques[0] matches cols[1], boutiques[1] matches cols[2], etc.
                    const boutiqueName = boutiques[j - 1];

                    if (!boutiqueName || boutiqueName === '') continue;

                    payload.push({
                        region: region.name,
                        boutique: boutiqueName,
                        weight: weightText,
                        price: price,
                        stock_text: stockText
                    });
                }
            });
        }

        console.log(`[Antam Stock] Parsed ${payload.length} stock items across all regions.`);

        // Sync with API
        const apiUrl = 'https://api.nabungmas.my.id/api';
        console.log(`[Antam Stock] Pushing to ${apiUrl}...`);
        // We'll push to our local /api/antam-stocks/sync or process.env.API_URL
        // Ensure you have auth/token if required. Currently the route is unprotected in our routes.go.
        const res = await axios.post(`${apiUrl}/antam-stocks/sync`, payload);
        console.log('[Antam Stock] Sync complete:', res.data.message);
    } catch (error) {
        console.error('[Antam Stock] Error:', error.message);
        if (error.response && error.response.data) {
            console.error('[Antam Stock] API Error Response:', error.response.data);
        }
    }
}

scrapeAntamStock();
