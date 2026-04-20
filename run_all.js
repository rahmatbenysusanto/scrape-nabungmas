const cron = require('node-cron');
const { exec } = require('child_process');
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
    { name: 'Perak Cukim', dir: 'perak-cukim', file: 'scrape_perak_cukim.js' },
    { name: 'Emas Perhiasan', dir: 'emas-perhiasan', file: 'scrape_emas_perhiasan.js' },
    { name: 'Perak Perhiasan', dir: 'perak-perhiasan', file: 'scrape_perak_perhiasan.js' },
    { name: 'UBS Gold', dir: 'ubs', file: 'scrape_ubs.js' },
    { name: 'Simba Gold', dir: 'simba', file: 'scrape_simba.js' },
    { name: 'Antam Stock', dir: 'antam-stock', file: 'scrape_antam_stock.js' }
];

// Mutex sederhana agar tidak ada dua proses runAll yang jalan bersamaan
let isRunning = false;

function runScript(script) {
    return new Promise((resolve) => {
        const fullPath = path.join(__dirname, script.dir, script.file);
        const scriptDir = path.join(__dirname, script.dir);

        if (!fs.existsSync(fullPath)) {
            console.warn(`[${script.name}] File tidak ditemukan: ${fullPath}\n`);
            return resolve();
        }

        console.log(`[${script.name}] Menjalankan scrape ${script.file}...`);
        
        // Jalankan script secara async agar tidak memblock event loop utama
        const child = exec(`"${process.execPath}" ${script.file}`, {
            cwd: scriptDir,
            timeout: 8 * 60 * 1000, // Timeout 8 menit per script
            maxBuffer: 10 * 1024 * 1024 // Buffer 10MB
        }, (error, stdout, stderr) => {
            if (error) {
                if (error.killed) {
                    console.error(`[${script.name}] GAGAL: Timeout terdeteksi (8 menit)!\n`);
                } else {
                    console.error(`[${script.name}] GAGAL: ${error.message}\n`);
                }
            } else {
                console.log(`[${script.name}] BERHASIL!\n`);
            }
            resolve();
        });

        // Optional: Jika ingin log live dari sub-process muncul di log Docker
        // child.stdout.on('data', (data) => process.stdout.write(`[${script.name}] ${data}`));
    });
}

async function runAll() {
    if (isRunning) {
        console.warn(`[${new Date().toLocaleString('id-ID')}] Skip: Proses sebelumnya masih berjalan.`);
        return;
    }

    isRunning = true;
    console.log(`[${new Date().toLocaleString('id-ID')}] === MEMULAI UPDATE SEMUA HARGA EMAS ===\n`);

    for (const script of scripts) {
        await runScript(script);
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
    isRunning = false;
}

// Logic untuk menentukan apakah jalan sekali atau terjadwal
if (process.argv.includes('--cron')) {
    const loc = "Asia/Jakarta";
    console.log(`MODE: Terjadwal (CRON) - Jam 07:00 sampai 21:00 ${loc}`);
    
    const now = new Date();
    console.log(`Server Time (UTC): ${now.toISOString()}`);
    console.log(`Target Time (${loc}): ${now.toLocaleString('id-ID', { timeZone: loc })}`);

    // Jalankan sekali saat startup
    runAll().catch(err => {
        console.error("Initial run failed:", err);
        isRunning = false;
    });
    
    // Heartbeat setiap 30 menit
    setInterval(() => {
        const timeStr = new Date().toLocaleString('id-ID', { timeZone: loc });
        console.log(`[HEARTBEAT] Scraper aktif. Waktu Jakarta: ${timeStr} | Running: ${isRunning}`);
    }, 30 * 60 * 1000);

    // Jadwalkan pengecekan setiap jam di menit 0
    cron.schedule('0 * * * *', () => {
        const jakartaHour = parseInt(new Date().toLocaleString('en-US', { 
            timeZone: loc, 
            hour: 'numeric', 
            hour12: false 
        }), 10);

        console.log(`[CRON] Menit 0 terdeteksi. Jam Jakarta: ${jakartaHour}`);

        // Rentang jam operasional diperluas ke 07:00 - 21:00
        if (jakartaHour >= 7 && jakartaHour <= 21) {
            runAll().catch(err => {
                console.error("Scheduled run failed:", err);
                isRunning = false;
            });
        } else {
            console.log(`[CRON] Di luar jam operasional (7-21). Lewati scrape.`);
        }
    }, {
        timezone: loc
    });
} else {
    console.log("MODE: Sekali jalan (One-time)");
    runAll().catch(err => {
        console.error("One-time run failed:", err);
        isRunning = false;
    });
}

