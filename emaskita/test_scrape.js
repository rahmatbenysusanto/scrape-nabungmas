const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');

puppeteer.use(StealthPlugin());

(async () => {
    try {
        console.log("Membuka browser...");
        const browser = await puppeteer.launch({
            executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            headless: 'new',
            args: ['--no-sandbox']
        });
        const page = await browser.newPage();

        console.log("Mengakses web Emas Kita...");
        await page.goto('https://www.emaskita.id/Harga_emas', { waitUntil: 'networkidle2' });
        const html = await page.content();
        fs.writeFileSync('emaskita.html', html);
        console.log("Selesai simpan HTML");

        await browser.close();

    } catch (e) {
        console.error(e);
    }
})();
