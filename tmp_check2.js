const axios = require('axios');
const cheerio = require('cheerio');

async function check() {
  const { data } = await axios.get('https://emasantam.id/harga-emas-antam-harian/');
  const $ = cheerio.load(data);
  const tabs = [];
  $('ul.nav-tabs li a').each((i, el) => {
    tabs.push($(el).text().trim());
  });
  console.log("Nav Tabs:", tabs);
  
  const regions = [];
  $('.tab-content .tab-pane').each((i, el) => {
      const id = $(el).attr('id');
      const textSample = $(el).text().replace(/\s+/g, ' ').substring(0, 100);
      regions.push({id, textSample});
  });
  console.log("Regions:", regions);
}
check();
