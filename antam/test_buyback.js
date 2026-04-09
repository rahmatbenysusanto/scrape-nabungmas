const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

(async () => {
    try {
        const browser = await puppeteer.launch({ 
            executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            headless: 'new',
            args: ['--no-sandbox']
        });
        const page = await browser.newPage();
        await page.goto('https://logammulia.com/id/sell/gold', { waitUntil: 'networkidle2' });
        const html = await page.content();
        console.log("Got HTML");
        const fs = require('fs');
        fs.writeFileSync('buyback.html', html);
        await browser.close();
    } catch (e) {
        console.error(e);
    }
})();
