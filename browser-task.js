require("dotenv").config();
const { connect } = require("puppeteer-real-browser");

const siteLink = process.env.SITE_LINK;
let coinId = process.env.SUBSCRIPTION;

async function monitorPage(email, password) {
  const { browser, page } = await connect({
    headless: false,
    turnstile: true,
    args: ["--start-maximized"],
  });

  await page.setViewport({ width: 1920, height: 1080 });
  await page.goto(`${siteLink}/login.php`, { waitUntil: "networkidle2" });
  await page.type('input[name="email_address"]', email);
  await page.type('input[name="password"]', password);
  await page.click("button.btn-default");

  await page.goto(`${siteLink}/catalog.html`, { waitUntil: "networkidle2" });

  while (true) {
    await page.reload({ waitUntil: "networkidle2" });
    const isButtonVisible = await page.evaluate((id) => {
      const button = document.querySelector(`span.main-basked-icon.add2cart[data-id="${id}"]`);
      if (button) {
        button.click();
        return true;
      }
      return false;
    }, coinId);
    if (isButtonVisible) {
      const timestamp = new Date().toLocaleTimeString('uk-UA', { hour12: false });
      console.log(`✅ [${email}] Монета ID ${coinId} додана у кошик о ${timestamp}!`);
      await new Promise((resolve) => setTimeout(resolve, 15 * 60 * 1000));
      await browser.close();
      break;
    }

    await new Promise((resolve) => setTimeout(resolve, 700));
  }
}

async function runMonitoring() {
  await  Promise.all([
      monitorPage(process.env.USER_EMAIL, process.env.USER_PASSWORD),
      monitorPage(process.env.USER_EMAIL1, process.env.USER_PASSWORD1)
    ]);
}

runMonitoring();
