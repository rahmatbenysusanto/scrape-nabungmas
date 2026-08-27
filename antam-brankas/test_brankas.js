const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');

puppeteer.use(StealthPlugin());

(async () => {
    const browser = await puppeteer.launch({
        executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        headless: 'new',
        args: ['--no-sandbox']
    });
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    console.log("Mengakses brankaslm.com/dashboard...");
    await page.goto('https://brankaslm.com/dashboard', { waitUntil: 'networkidle2', timeout: 30000 });
    
    const html = await page.content();
    const title = await page.title();
    console.log("Title:", title);
    
    fs.writeFileSync('/tmp/brankas_dump.html', html);
    console.log("HTML disimpan ke /tmp/brankas_dump.html");
    
    // Coba cari teks harga
    const text = await page.evaluate(() => document.body.innerText);
    console.log("=== TEKS HALAMAN (500 char pertama) ===");
    console.log(text.substring(0, 500));

    await browser.close();
})().catch(e => console.error(e));
