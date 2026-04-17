const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

(async () => {
    const browser = await puppeteer.launch({
        executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        headless: 'new',
        args: ['--no-sandbox']
    });
    const page = await browser.newPage();
    await page.goto('https://www.logammulia.com/id/sell/gold', { waitUntil: 'networkidle2' });
    
    // Wait for the price element to be visible if it's dynamic
    try {
        await page.waitForSelector('.title', { timeout: 5000 });
    } catch (e) {
        console.log("Timeout waiting for .title");
    }

    const priceInfo = await page.evaluate(() => {
        const results = [];
        document.querySelectorAll('div, span, p, h1, h2, h3, h4').forEach(el => {
            if (el.innerText && el.innerText.includes('Buyback')) {
                results.push({
                    tag: el.tagName,
                    class: el.className,
                    text: el.innerText.substring(0, 100)
                });
            }
        });
        return results;
    });

    console.log(JSON.stringify(priceInfo, null, 2));

    const html = await page.content();
    const fs = require('fs');
    fs.writeFileSync('buyback_debug.html', html);

    await browser.close();
})();
