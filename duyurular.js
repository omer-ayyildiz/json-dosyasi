// duyurular.js
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

// Web scraping fonksiyonu, tekrar deneme mantığı ile
async function scrapeWithRetries(url, retries = 3, delay = 5000) {
    for (let i = 0; i < retries; i++) {
        let browser;
        try {
            // Puppeteer'ı headless (başsız) modda başlat.
            // 'new' yeni headless mod demektir, 'true' da çalışır ama 'new' daha modern.
            // args: GitHub Actions gibi CI/CD ortamları için gereklidir.
            browser = await puppeteer.launch({
                headless: 'new', // Veya true
                args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] // --disable-dev-shm-usage eklendi
            });
            const page = await browser.newPage();

            // Sayfaya git ve ağ isteklerinin durmasını bekle.
            // Timeout süresi 90 saniyeye çıkarıldı.
            const response = await page.goto(url, { waitUntil: 'networkidle2', timeout: 90000 });

            // HTTP yanıtını kontrol et
            if (!response || !response.ok()) {
                throw new Error(`HTTP error! status: ${response ? response.status() : 'No response'}`);
            }

            // Duyuru öğelerinin yüklendiğinden emin olmak için bekle.
            // Seçici OGM sitesinin şu anki yapısına göre güncellendi.
            // Timeout süresi 30 saniyeye çıkarıldı.
            await page.waitForSelector('.news-area .content-wrap .items .item', { timeout: 30000 });

            // Sayfa içeriğinden duyuruları çek
            const duyurular = await page.evaluate(() => {
                const items = Array.from(document.querySelectorAll('.news-area .content-wrap .items .item'));
                return items.map(item => {
                    const contentElement = item.querySelector('h4 a'); // Başlık ve link
                    const dateDivElement = item.querySelector('.date'); // Tarih

                    // Gerekli elementler bulunamazsa bu duyuruyu atla
                    if (!contentElement || !dateDivElement) {
                        console.warn("Uyarı: Eksik duyuru öğesi bulundu, atlanıyor.", item.outerHTML);
                        return null;
                    }

                    const title = contentElement.textContent.trim();
                    let url = contentElement.href;

                    // Göreceli URL'leri tam URL'ye çevir
                    if (url.startsWith('/')) {
                        url = `https://www.ogm.gov.tr${url}`;
                    }

                    // Tarih bilgilerini çek
                    const day = dateDivElement.childNodes[0]?.textContent?.trim() ?? '';
                    const monthsAndYear = dateDivElement.querySelectorAll('span');
                    const month = monthsAndYear[0]?.textContent?.trim() ?? '';
                    const year = monthsAndYear[1]?.textContent?.trim() ?? '';

                    return {
                        title: title,
                        url: url,
                        date: `${day} ${month} ${year}`.trim(),
                    };
                }).filter(Boolean); // null olan öğeleri sonuç dizisinden filtrele
            });

            // Başarılıysa tarayıcıyı kapat ve duyuruları döndür
            await browser.close();
            return duyurular;

        } catch (error) {
            console.log(`Deneme ${i + 1} başarısız oldu: ${error.message}`);
            if (browser) {
                await browser.close(); // Hata durumunda tarayıcıyı kapatmayı dene
            }
            if (i < retries - 1) {
                console.log(`Tekrar denenecek (${delay / 1000} saniye bekliyor...)`);
                await new Promise(res => setTimeout(res, delay));
            } else {
                throw new Error(`Tüm ${retries} deneme başarısız oldu: ${error.message}`);
            }
        }
    }
}

// Ana fonksiyon
(async () => {
    const url = 'https://www.ogm.gov.tr/tr/duyurular';
    const jsonFileName = 'duyurular.json';

    try {
        const duyurular = await scrapeWithRetries(url, 5, 10000); // 5 deneme, her deneme arası 10 saniye bekleme

        if (duyurular && duyurular.length > 0) {
            fs.writeFileSync(jsonFileName, JSON.stringify(duyurular, null, 2), 'utf8');
            console.log(`JSON dosyası '${jsonFileName}' başarıyla oluşturuldu!`);
        } else {
            console.log("Hiç duyuru bulunamadı veya veri çekilirken sorun oluştu. JSON dosyası oluşturulmadı.");
        }
    } catch (error) {
        console.error(`Duyuruları çekerken kritik bir hata oluştu: ${error.message}`);
        // GitHub Actions'ın hatayı yakalaması için bir çıkış kodu ile çıkış yapabiliriz.
        process.exit(1);
    }
})();