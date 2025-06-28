const puppeteer = require('puppeteer');
const fs = require('fs');

async function scrapeWithRetries(url, retries = 3, delay = 5000) {
  for (let i = 0; i < retries; i++) {
    try {
      const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      const page = await browser.newPage();

      const response = await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

      if (!response || !response.ok()) {
        throw new Error(`HTTP error! status: ${response.status()}`);
      }

      await page.waitForSelector('li.item', { timeout: 15000 });

      const duyurular = await page.evaluate(() => {
        const items = Array.from(document.querySelectorAll('li.item'));
        return items.map(item => {
          const content = item.querySelector('.content a');
          const dateDiv = item.querySelector('.date');
          if (!content || !dateDiv) return null;
          const gun = dateDiv.childNodes[0]?.textContent?.trim() ?? '';
          const aylar = dateDiv.querySelectorAll('span');
          const ay = aylar?.[0]?.textContent?.trim() ?? '';
          const yil = aylar?.[1]?.textContent?.trim() ?? '';
          return {
            title: content.textContent.trim(),
            url: content.href.startsWith('http') ? content.href : `https://www.ogm.gov.tr${content.getAttribute('href')}`,
            date: `${gun} ${ay} ${yil}`.trim(),
          };
        }).filter(Boolean);
      });

      await browser.close();
      return duyurular;

    } catch (error) {
      console.log(`Deneme ${i + 1} başarısız oldu: ${error.message}`);
      if (i < retries - 1) {
        console.log(`Tekrar denenecek (${delay / 1000} saniye bekliyor...)`);
        await new Promise(res => setTimeout(res, delay));
      } else {
        throw new Error('Tüm denemeler başarısız oldu.');
      }
    }
  }
}

(async () => {
  const url = 'https://www.ogm.gov.tr/tr/duyurular';
  const duyurular = await scrapeWithRetries(url, 3, 5000);
  fs.writeFileSync('duyurular.json', JSON.stringify(duyurular, null, 2), 'utf8');
  console.log("JSON dosyası başarıyla oluşturuldu!");
})();
