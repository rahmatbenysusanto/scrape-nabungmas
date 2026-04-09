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

        console.log("Mengakses web Gallery 24...");
        await page.goto('https://galeri24.co.id/harga-emas', { waitUntil: 'networkidle2' });

        // Let's print the title to make sure we're on the right page
        const title = await page.title();
        console.log(`Title: ${title}`);

        // Maybe there's a button we need to click or it's just plain HTML
        // Let's get the entire content
        const html = await page.content();
        fs.writeFileSync('gallery24.html', html);
        console.log("Selesai simpan HTML");

        await browser.close();

    } catch (e) {
        console.error(e);
    }
})();
