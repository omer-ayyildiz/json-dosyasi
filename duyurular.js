const puppeteer = require("puppeteer");
const fs = require("fs");

(async () => {
  const browser = await puppeteer.launch({
    headless: "new",
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();
  await page.goto("https://www.ogm.gov.tr/tr/duyurular", {
    waitUntil: "networkidle2",
    timeout: 60000, // 60 saniye
  });
  await page.waitForSelector("li.item", { timeout: 5000 });

  const duyurular = await page.evaluate(() => {
    const items = Array.from(document.querySelectorAll("li.item"));
    return items
      .map((item) => {
        const content = item.querySelector(".content a");
        const dateDiv = item.querySelector(".date");
        if (!content || !dateDiv) return null;
        const gun = dateDiv.childNodes[0]?.textContent?.trim() ?? "";
        const aylar = dateDiv.querySelectorAll("span");
        const ay = aylar?.[0]?.textContent?.trim() ?? "";
        const yil = aylar?.[1]?.textContent?.trim() ?? "";
        return {
          title: content.textContent.trim(),
          url: content.href.startsWith("http")
            ? content.href
            : `https://www.ogm.gov.tr${content.getAttribute("href")}`,
          date: `${gun} ${ay} ${yil}`.trim(),
        };
      })
      .filter(Boolean);
  });

  await browser.close();
  fs.writeFileSync(
    "duyurular.json",
    JSON.stringify(duyurular, null, 2),
    "utf8"
  );
  console.log("JSON dosyası oluşturuldu!");
})();
