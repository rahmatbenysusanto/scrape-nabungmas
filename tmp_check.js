const axios = require('axios');
const cheerio = require('cheerio');

async function check() {
  const { data } = await axios.get('https://emasantam.id/harga-emas-antam-harian/');
  const $ = cheerio.load(data);
  console.log("Nav Tabs:", $('ul.nav-tabs').text().replace(/\s+/g, ' '));
  console.log("Panes:", $('.tab-content').children().length);
  const firstPane = $('.tab-content .tab-pane').first();
  console.log("First Pane ID:", firstPane.attr('id'));
  console.log("First Pane Content Sample:", firstPane.text().replace(/\s+/g, ' ').substring(0, 500));
}
check();
