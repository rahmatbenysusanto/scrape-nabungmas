const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const scripts = [
    { name: 'Antam', dir: 'antam', file: 'scrape_antam.js' },
    { name: 'EmasKita', dir: 'emaskita', file: 'scrape_emaskita.js' },
    { name: 'Emasku', dir: 'emasku', file: 'scrape_emasku.js' },
    { name: 'Gallery24', dir: 'gallery24', file: 'scrape_gallery24.js' },
    { name: 'King Halim', dir: 'kinghalim', file: 'scrape_kinghalim.js' },
    { name: 'Lotus Archi', dir: 'lotusarchi', file: 'scrape_lotusarchi.js' },
    { name: 'Sampoerna Gold', dir: 'sampoerna', file: 'scrape_sampoerna.js' },
    { name: 'Semar Nusantara', dir: 'semar', file: 'scrape_semar.js' },
    { name: 'Stargold', dir: 'stargold', file: 'scrape_stargold.js' },
    { name: 'Dinar Khoirur Rooziqiin', dir: 'dinar', file: 'scrape_dinar.js' },
    { name: 'Tring Pegadaian', dir: 'tring', file: 'scrape_tring.js' },
    { name: 'Emas Cukim', dir: 'cukim', file: 'scrape_cukim.js' },
    { name: 'UBS Gold', dir: 'ubs', file: 'scrape_ubs.js' },
    { name: 'Simba Gold', dir: 'simba', file: 'scrape_simba.js' }
];

async function runAll() {
    console.log("=== MEMULAI UPDATE SEMUA HARGA EMAS ===\n");

    for (const script of scripts) {
        const fullPath = path.join(__dirname, script.dir, script.file);
        const scriptDir = path.join(__dirname, script.dir);

        if (fs.existsSync(fullPath)) {
            console.log(`[${script.name}] Menjalankan scrape ${script.file}...`);
            try {
                // Menjalankan script dengan cwd di folder masing-masing
                // supaya file .xlsx tersimpan di folder yang benar
                execSync(`node ${script.file}`, {
                    cwd: scriptDir,
                    stdio: 'inherit'
                });
                console.log(`[${script.name}] BERHASIL!\n`);
            } catch (error) {
                console.error(`[${script.name}] GAGAL: ${error.message}\n`);
            }
        } else {
            console.warn(`[${script.name}] File tidak ditemukan: ${fullPath}\n`);
        }
    }

    console.log("=== SEMUA PROSES SELESAI ===");
}

runAll();
