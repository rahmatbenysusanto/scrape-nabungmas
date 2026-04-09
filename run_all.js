const cron = require('node-cron');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const axios = require('axios');

const scripts = [
    { name: 'Antam', dir: 'antam', file: 'scrape_antam.js' },
    { name: 'EmasKita', dir: 'emaskita', file: 'scrape_emaskita.js' },
    { name: 'Emasku', dir: 'emasku', file: 'scrape_emasku.js' },
    { name: 'Gallery24', dir: 'gallery24', logo: 'gallery24.png', file: 'scrape_gallery24.js' },
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
    console.log(`[${new Date().toLocaleString('id-ID')}] === MEMULAI UPDATE SEMUA HARGA EMAS ===\n`);

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
    
    // Kirim notifikasi ringkasan ke backend setelah semua selesai
    try {
        console.log("Mengirim notifikasi ringkasan ke backend...");
        await axios.post('https://api.nabungmas.my.id/api/gold-prices/notify-sync', {
            total_brand: scripts.length
        });
    } catch (notifErr) {
        console.error("Gagal mengirim notifikasi ringkasan:", notifErr.message);
    }

    console.log(`[${new Date().toLocaleString('id-ID')}] === SEMUA PROSES SELESAI ===\n`);
}

// Logic untuk menentukan apakah jalan sekali atau terjadwal
if (process.argv.includes('--cron')) {
    console.log("MODE: Terjadwal (CRON) - Setiap jam 09:00 sampai 15:00 WIB");
    // Jalankan sekali saat startup supaya data terbaru langsung ada
    runAll();
    
    // Jadwalkan untuk setiap jam menit 0 dari jam 9-15
    cron.schedule('0 9-15 * * *', () => {
        runAll();
    }, {
        timezone: "Asia/Jakarta"
    });
} else {
    console.log("MODE: Sekali jalan (One-time)");
    runAll();
}
