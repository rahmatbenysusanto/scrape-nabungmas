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

        console.log("Mengakses web Emasku...");
        await page.goto('https://www.emasku.co.id/en/gold-price', { waitUntil: 'networkidle2' });

        const title = await page.title();
        console.log(`Title: ${title}`);

        const html = await page.content();
        fs.writeFileSync('emasku.html', html);
        console.log("Selesai simpan HTML");

        await browser.close();

    } catch (e) {
        console.error(e);
    }
})();
