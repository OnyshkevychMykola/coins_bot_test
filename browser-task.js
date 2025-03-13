require("dotenv").config();
const { connect } = require("puppeteer-real-browser");
const axios = require("axios");

async function sendTelegramMessage(message) {
  const url = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;
  try {
    const response = await axios.post(url, {
      chat_id: process.env.USER_ID,
      text: message,
      parse_mode: "Markdown",
    });
    console.log("Повідомлення надіслано в Telegram.", response.data);
  } catch (error) {
    console.error("Помилка надсилання повідомлення:", error.response ? error.response.data : error.message);
  }
}

(async () => {
  const { browser, page } = await connect({
    headless: false,
    turnstile: true,
    args: ["--start-maximized"],
  });

  await page.setViewport({ width: 1920, height: 1080 });

  const loginUrl = "https://coins.bank.gov.ua/login.php";
  const productUrl = `${process.env.SITE_LINK}/catalog.html`;
  await page.goto(loginUrl, { waitUntil: "networkidle2" });

  await page.type('input[name="email_address"]', process.env.USER_EMAIL);
  await page.type('input[name="password"]', process.env.USER_PASSWORD);
  await page.click("button.btn-default");

  console.log(productUrl, 'producturl')
  await page.goto(productUrl, { waitUntil: "networkidle2" });

  console.log("Починаємо моніторинг сторінки...");
  const productId = "1142"; // Захардкоджений ID

  while (true) {
    console.log("Перезавантажуємо сторінку...");
    await page.reload({ waitUntil: "networkidle2" });

    const isButtonVisible = await page.evaluate((id) => {
      const button = document.querySelector(`span.main-basked-icon.add2cart[data-id="${id}"]`);
      if (button) {
        button.click();
        return true;
      }
      return false;
    }, productId);

    if (isButtonVisible) {
      console.log("Кнопка 'Купити' знайдена і натиснута!");

      await sendTelegramMessage(`✅ Купівля виконана! Перевірте акаунт на сайті.\n${productUrl}`);

      console.log("Чекаємо годину...");
      await new Promise((resolve) => setTimeout(resolve, 3600000));

      console.log("Закриваємо браузер...");
      await browser.close();
      break;
    } else {
      console.log("Кнопки ще немає. Перевірка через 1 секунду...");
    }

    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
})();
