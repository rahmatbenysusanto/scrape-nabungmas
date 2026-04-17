const axios = require('axios');
const cheerio = require('cheerio');

async function check() {
  const { data } = await axios.get('https://emasantam.id/harga-emas-antam-harian/');
  const $ = cheerio.load(data);
  
  const pane = $('#nav-jabodetabek');
  const table = pane.find('table').first();
  const headers = [];
  table.find('thead tr').last().find('th, td').each((i, el) => {
      headers.push($(el).text().trim());
  });
  console.log("Headers Jabodetabek:", headers);
  
  const rows = [];
  table.find('tbody tr').slice(0, 2).each((i, el) => {
      const cols = [];
      $(el).find('td').each((j, td) => {
          cols.push($(td).text().trim().replace(/\\n/g, ' '));
      });
      rows.push(cols);
  });
  console.log("Sample Rows:", rows);
}
check();
