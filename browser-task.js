require("dotenv").config();
const { connect } = require("puppeteer-real-browser");
const { Telegraf } = require("telegraf");
const axios = require("axios");
const moment = require("moment-timezone");
const cron = require('node-cron');

const botToken = process.env.BOT_TOKEN;
const siteLink = process.env.SITE_LINK;
const USER_ID = Number(process.env.USER_ID);
const bot = new Telegraf(botToken);

let activeSubscriptions = new Set();

async function sendTelegramMessage(message) {
  const url = `https://api.telegram.org/bot${botToken}/sendMessage`;
  try {
    await axios.post(url, { chat_id: USER_ID, text: message, parse_mode: "Markdown" });
    console.log("✅ Повідомлення надіслано в Telegram.");
  } catch (error) {
    console.error("❌ Помилка надсилання повідомлення:", error.response ? error.response.data : error.message);
  }
}

bot.command("list", async (ctx) => {
  try {
    const url = `${siteLink}/catalog.html`;
    const { data } = await axios.get(url);
    const $ = require("cheerio").load(data);
    let message = "📜 Список монет:";

    $(".product").each((index, element) => {
      const title = $(element).find(".model_product").text().trim();
      const price = $(element).find(".new_price").text().trim();
      const dataId = $(element).find(".compare_button").attr("data-id") || "N/A";
      message += `\n${index + 1}. ${title} \n🔹 ID: ${dataId}\n💰 Ціна: ${price}\n📩 /subscribe_${dataId}`;
    });

    ctx.reply(message);
  } catch (error) {
    console.error("❌ Помилка отримання списку:", error.message);
    ctx.reply("❌ Виникла помилка при отриманні списку монет.");
  }
});

bot.hears(/\/subscribe_(\d+)/, async (ctx) => {
  if (ctx.from.id !== USER_ID) return;
  const coinId = ctx.match[1];
  if (!activeSubscriptions.has(coinId)) {
    activeSubscriptions.add(coinId);
    ctx.reply(`✅ Ви підписалися на монету ID: ${coinId}`);
  } else {
    ctx.reply(`❗ Ви вже підписані на монету ID: ${coinId}`);
  }
});

bot.hears(/\/unsubscribe_(\d+)/, async (ctx) => {
  if (ctx.from.id !== USER_ID) return;
  const coinId = ctx.match[1];
  if (activeSubscriptions.delete(coinId)) {
    ctx.reply(`❌ Ви відписались від монети ${coinId}.`);
  } else {
    ctx.reply(`❌ Ви не були підписані на монету ${coinId}.`);
  }
});

async function monitorPage() {
  console.log("🔄 Запуск моніторингу сторінки...");
  const { browser, page } = await connect({
    headless: false,
    turnstile: true,
    args: ["--start-maximized"],
  });

  await page.setViewport({ width: 1920, height: 1080 });
  await page.goto("https://coins.bank.gov.ua/login.php", { waitUntil: "networkidle2" });
  await page.type('input[name="email_address"]', process.env.USER_EMAIL);
  await page.type('input[name="password"]', process.env.USER_PASSWORD);
  await page.click("button.btn-default");

  await page.goto(`${siteLink}/catalog.html`, { waitUntil: "networkidle2" });
  console.log("✅ Починаємо перевірку товарів...");

  while (true) {
    console.log("🔄 Оновлення сторінки...");
    await page.reload({ waitUntil: "networkidle2" });

    for (const coinId of activeSubscriptions) {
      const isButtonVisible = await page.evaluate((id) => {
        const button = document.querySelector(`span.main-basked-icon.add2cart[data-id="${id}"]`);
        if (button) {
          button.click();
          return true;
        }
        return false;
      }, coinId);

      if (isButtonVisible) {
        console.log(`✅ Монета ID ${coinId} додана у кошик!`);
        await sendTelegramMessage(`✅ Монета ID ${coinId} додана у кошик!`);
        activeSubscriptions.delete(coinId);
      }
    }

    if (activeSubscriptions.size === 0) {
      console.log("✅ Всі підписки оброблені, закриваємо браузер.");
      await browser.close();
      break;
    }

    console.log("🕐 Перевірка через 1 секунду...");
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

//cron.schedule('0 10 * * *', async () => {
cron.schedule('* * * * *', async () => {
  const kyivTime = moment().tz("Europe/Kiev");
  if (kyivTime.hour() === 10 && kyivTime.minute() >= 0 && kyivTime.minute() <= 1) {
    await monitorPage();
  }
});

bot.launch();
