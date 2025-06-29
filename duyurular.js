// duyurular.js
const puppeteer = require("puppeteer");
const fs = require("fs");
const path = require("path");

// Web scraping fonksiyonu, gelişmiş tekrar deneme mantığı ve tarayıcı ayarları ile
async function scrapeWithRetries(url, retries = 5, delay = 15000) { // Daha fazla deneme ve daha uzun gecikme
    for (let i = 0; i < retries; i++) {
        let browser;
        try {
            // Puppeteer'ı daha optimize edilmiş ve kararlı bir şekilde başlat
            browser = await puppeteer.launch({
                headless: "new", // Yeni headless mod
                args: [
                    "--no-sandbox", // Linux'ta yetkilendirme sorunlarını önler
                    "--disable-setuid-sandbox", // Linux'ta yetkilendirme sorunlarını önler
                    "--disable-dev-shm-usage", // Docker/CI ortamlarında bellek sorunlarını önler
                    "--disable-gpu", // GPU hızlandırmasını devre dışı bırak (CI/CD'de genellikle yok)
                    "--no-zygote", // Zygote sürecini devre dışı bırak (bazı ortamlarda kararlılığı artırır)
                    "--single-process", // Tek süreçte çalışmasını sağla (daha az bellek kullanır)
                    "--disable-features=site-per-process", // Bazı izolasyon özelliklerini devre dışı bırak
                    "--disable-accelerated-2d-canvas", // 2D canvas hızlandırmasını kapat
                    "--disable-web-security", // Web güvenliğini devre dışı bırak (nadiren gerekli, dikkatli kullanın)
                    "--no-first-run", // İlk çalıştırma ekranlarını engelle
                    "--no-default-browser-check", // Varsayılan tarayıcı kontrolünü engelle
                    "--allow-running-insecure-content" // Güvensiz içeriğin çalışmasına izin ver (HTTPS dışı kaynaklar için)
                ],
                // executablePath: '/usr/bin/chromium-browser' // GitHub Actions YAML dosyasında ayarlanıyor.
                timeout: 120000 // Tarayıcı başlatma zaman aşımı (2 dakika)
            });

            const page = await browser.newPage();

            // Sayfaya gitmeden önce varsayılan navigasyon zaman aşımını artır
            page.setDefaultNavigationTimeout(120000); // 2 dakika
            page.setDefaultTimeout(60000); // Varsayılan genel işlem zaman aşımı (1 dakika)

            // Kullanıcı aracısını güncel ve gerçekçi bir tarayıcı User-Agent'ı ile değiştir
            await page.setUserAgent(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36" // Chrome sürümü güncellendi
            );

            // Görüntüleri ve CSS'i devre dışı bırakarak yükleme süresini hızlandır (isteğe bağlı ama etkili olabilir)
            await page.setRequestInterception(true);
            page.on('request', (req) => {
                if (req.resourceType() === 'image' || req.resourceType() === 'stylesheet' || req.resourceType() === 'font') {
                    req.abort();
                } else {
                    req.continue();
                }
            });

            // Sayfaya gitme işlemi. 'domcontentloaded' veya 'load' deneyelim.
            // 'networkidle2' bazen arka plan istekleri hiç bitmediği için zaman aşımına neden olabilir.
            // 'load' daha kapsamlıdır ve tüm kaynakların yüklenmesini bekler.
            // 'domcontentloaded' daha hızlıdır ve sadece DOM'un yüklenmesini bekler.
            // İkisi de denenmeli. Burada 'load' ile başlıyoruz, sorun olursa 'domcontentloaded' deneyebilirsiniz.
            const response = await page.goto(url, {
                waitUntil: "load", // 'networkidle2' yerine 'load' veya 'domcontentloaded' deneyin
                timeout: 120000, // Sayfa yükleme zaman aşımı (2 dakika)
            });

            // HTTP yanıtını kontrol et
            if (!response || !response.ok()) {
                throw new Error(
                    `HTTP error! status: ${response ? response.status() : "No response"} for ${url}`
                );
            }

            // Sayfanın tamamen yüklendiğinden emin olmak için ek bir bekleme süresi
            await page.waitForTimeout(5000); // Sayfa yüklendikten sonra 5 saniye daha bekle

            // Duyuru öğelerinin yüklendiğinden emin olmak için bekle.
            // CSS seçicisi OGM sitesinin şu anki yapısına göre.
            // Timeout süresi 45 saniyeye çıkarıldı.
            await page.waitForSelector(".news-area .content-wrap .items .item", {
                timeout: 45000, // Elementin görünür olma zaman aşımı (45 saniye)
            });

            // Sayfa içeriğinden duyuruları çek
            const duyurular = await page.evaluate(() => {
                const items = Array.from(
                    document.querySelectorAll(".news-area .content-wrap .items .item")
                );
                return items
                    .map((item) => {
                        const contentElement = item.querySelector("h4 a"); // Başlık ve link
                        const dateDivElement = item.querySelector(".date"); // Tarih

                        // Gerekli elementler bulunamazsa bu duyuruyu atla
                        if (!contentElement || !dateDivElement) {
                            console.warn(
                                "Uyarı: Eksik duyuru öğesi bulundu, atlanıyor.",
                                item.outerHTML
                            );
                            return null;
                        }

                        const title = contentElement.textContent.trim();
                        let url = contentElement.href;

                        // Göreceli URL'leri tam URL'ye çevir
                        if (url.startsWith("/")) {
                            url = `https://www.ogm.gov.tr${url}`;
                        }

                        // Tarih bilgilerini çek
                        const day = dateDivElement.childNodes[0]?.textContent?.trim() ?? "";
                        const monthsAndYear = dateDivElement.querySelectorAll("span");
                        const month = monthsAndYear[0]?.textContent?.trim() ?? "";
                        const year = monthsAndYear[1]?.textContent?.trim() ?? "";

                        return {
                            title: title,
                            url: url,
                            date: `${day} ${month} ${year}`.trim(),
                        };
                    })
                    .filter(Boolean); // null olan öğeleri sonuç dizisinden filtrele
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
                await new Promise((res) => setTimeout(res, delay));
            } else {
                throw new Error(
                    `Tüm ${retries} deneme başarısız oldu: ${error.message}`
                );
            }
        }
    }
}

// Ana fonksiyon
(async () => {
    const url = "https://www.ogm.gov.tr/tr/duyurular";
    const jsonFileName = "duyurular.json";

    try {
        const duyurular = await scrapeWithRetries(url, 5, 15000); // 5 deneme, her deneme arası 15 saniye bekleme (artırıldı)

        if (duyurular && duyurular.length > 0) {
            fs.writeFileSync(
                jsonFileName,
                JSON.stringify(duyurular, null, 2),
                "utf8"
            );
            console.log(`JSON dosyası '${jsonFileName}' başarıyla oluşturuldu!`);
        } else {
            console.log(
                "Hiç duyuru bulunamadı veya veri çekilirken sorun oluştu. JSON dosyası oluşturulmadı."
            );
        }
    } catch (error) {
        console.error(
            `Duyuruları çekerken kritik bir hata oluştu: ${error.message}`
        );
        // GitHub Actions'ın hatayı yakalaması için bir çıkış kodu ile çıkış yapabiliriz.
        process.exit(1);
    }
})();