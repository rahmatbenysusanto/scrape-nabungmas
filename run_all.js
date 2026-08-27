const cron = require('node-cron');
const { execFile, execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const axios = require('axios');

const scripts = [
    { name: 'Antam', dir: 'antam', file: 'scrape_antam.js' },
    { name: 'Antam Brankas', dir: 'antam-brankas', file: 'scrape_antam_brankas.js' },
    { name: 'EmasKita', dir: 'emaskita', file: 'scrape_emaskita.js' },
    { name: 'Emasku', dir: 'emasku', file: 'scrape_emasku.js' },
    { name: 'Gallery24', dir: 'gallery24', logo: 'gallery24.png', file: 'scrape_gallery24.js' },
    { name: 'King Halim', dir: 'kinghalim', file: 'scrape_kinghalim.js' },
    // { name: 'Lotus Archi', dir: 'lotusarchi', file: 'scrape_lotusarchi.js' },
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

// Fungsi untuk delay antar scraper (mengurangi spike resource)
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Fungsi untuk membersihkan proses chromium zombie sebelum run
function killZombieChrome() {
    try {
        // Kill semua proses chromium yang masih berjalan
        execSync('pkill -f chromium || true', { stdio: 'ignore' });
        execSync('pkill -f chrome || true', { stdio: 'ignore' });
        console.log('[CLEANUP] Proses chromium zombie sudah dibersihkan.');
    } catch (e) {
        // Abaikan error jika tidak ada proses yang perlu di-kill
    }
}

function parseWarnings(output) {
    const warnings = [];
    const lines = output.split('\n');
    for (const line of lines) {
        const match = line.match(/Harga (?:beli|buyback) untuk (.+?) tidak ditemukan/i);
        if (match) warnings.push(match[1].trim());
    }
    return warnings;
}

function runScript(script, retryCount = 0) {
    return new Promise((resolve) => {
        const fullPath = path.join(__dirname, script.dir, script.file);
        const scriptDir = path.join(__dirname, script.dir);

        if (!fs.existsSync(fullPath)) {
            console.warn(`[${script.name}] File tidak ditemukan: ${fullPath}\n`);
            return resolve({ success: false, warnings: [], errorMsg: 'File tidak ditemukan' });
        }

        console.log(`[${script.name}] Menjalankan scrape ${script.file}...${retryCount > 0 ? ` (retry ke-${retryCount})` : ''}`);

        let outputBuffer = '';

        const child = execFile(process.execPath, [script.file], {
            cwd: scriptDir,
            timeout: 8 * 60 * 1000,
            maxBuffer: 10 * 1024 * 1024
        }, async (error, stdout, stderr) => {
            if (error) {
                let errorMsg = error.message;
                if (error.killed) {
                    errorMsg = 'Timeout (8 menit)';
                    console.error(`[${script.name}] GAGAL: Timeout terdeteksi (8 menit)!\n`);
                } else if (error.code === 'EAGAIN' && retryCount < 2) {
                    console.warn(`[${script.name}] EAGAIN terdeteksi, cleanup & retry dalam 10 detik...\n`);
                    killZombieChrome();
                    await delay(10000);
                    return resolve(await runScript(script, retryCount + 1));
                } else {
                    console.error(`[${script.name}] GAGAL: ${error.message}\n`);
                }
                resolve({ success: false, warnings: parseWarnings(outputBuffer), errorMsg });
            } else {
                console.log(`[${script.name}] BERHASIL!\n`);
                resolve({ success: true, warnings: parseWarnings(outputBuffer), errorMsg: null });
            }
        });

        child.stdout.on('data', (data) => {
            process.stdout.write(`[${script.name}] ${data}`);
            outputBuffer += data;
        });
        child.stderr.on('data', (data) => process.stderr.write(`[${script.name}] ERR: ${data}`));
    });
}

async function runAll() {
    if (isRunning) {
        console.warn(`[${new Date().toLocaleString('id-ID')}] Skip: Proses sebelumnya masih berjalan.`);
        return;
    }

    isRunning = true;
    console.log(`[${new Date().toLocaleString('id-ID')}] === MEMULAI UPDATE SEMUA HARGA EMAS ===\n`);

    // Bersihkan proses zombie sebelum mulai
    killZombieChrome();

    let successCount = 0;
    let failCount = 0;
    const brandResults = [];

    for (let i = 0; i < scripts.length; i++) {
        const script = scripts[i];
        const result = await runScript(script);
        brandResults.push({
            name: script.name,
            success: result.success,
            warnings: result.warnings,
            error_msg: result.errorMsg
        });
        if (result.success) successCount++;
        else failCount++;

        // Delay 3 detik antar scraper untuk memberi waktu OS reclaim resource
        if (i < scripts.length - 1) {
            await delay(3000);
        }
    }

    // Kirim notifikasi ringkasan ke backend setelah semua selesai
    try {
        console.log("Mengirim notifikasi ringkasan ke backend...");
        await axios.post('https://api.nabungmas.my.id/api/gold-prices/notify-sync', {
            total_brand: scripts.length,
            success_count: successCount,
            fail_count: failCount,
            brands: brandResults
        });
    } catch (notifErr) {
        console.error("Gagal mengirim notifikasi ringkasan:", notifErr.message);
    }

    console.log(`[${new Date().toLocaleString('id-ID')}] === SEMUA PROSES SELESAI (Berhasil: ${successCount}, Gagal: ${failCount}) ===\n`);
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

