require('dotenv').config();
const axios = require("axios");
const cheerio = require("cheerio");
const { Telegraf } = require("telegraf");
const cron = require("node-cron");
const moment = require('moment-timezone');

const botToken = process.env.BOT_TOKEN;
const siteLink = process.env.SITE_LINK;
const USER_EMAIL = process.env.USER_EMAIL;
const USER_PASSWORD = process.env.USER_PASSWORD;

const bot = new Telegraf(botToken);

let sessionCookies = "";
let activeSubscriptions = new Set();

async function login() {
  try {
    const { data: loginPage } = await axios.get(`${siteLink}/login.php`);
    const $ = cheerio.load(loginPage);
    const csrfToken = $("input[name='_csrf']").val();

    if (!csrfToken) throw new Error("❌ Не вдалося отримати CSRF-токен!");

    const response = await axios.post(
      `${siteLink}/login.php?action=process`,
      new URLSearchParams({
        _csrf: csrfToken,
        email_address: USER_EMAIL,
        password: USER_PASSWORD,
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "Mozilla/5.0",
          Referer: `${siteLink}/login.php`,
        },
        maxRedirects: 0,
        validateStatus: (status) => status === 302,
      }
    );

    sessionCookies = response.headers["set-cookie"]
      .map((cookie) => cookie.split(";")[0])
      .join("; ");

    console.log("✅ Логін успішний!");
  } catch (error) {
    console.error("❌ Помилка логіну:", error.message);
  }
}

async function addToCart(coinId) {
  try {
    const response = await axios.post(
      `${siteLink}/?action=add_product&cid=176736`,
      new URLSearchParams({
        products_id: coinId,
        cart_quantity: 1,
      }),
      {
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "User-Agent": "Mozilla/5.0",
          Accept: "application/json",
          "X-Requested-With": "XMLHttpRequest",
          Referer: `${siteLink}/catalog.html`,
          Origin: `${siteLink}`,
          Cookie: sessionCookies,
        },
      }
    );

    if (response.data.message === 'Даного товару вже немає у наявності.') {
      return;
    }

    if (response.data.redirect === "422.php") {
      return;
    }

    if (response.data.success) {
      await bot.telegram.sendMessage(Number(process.env.USER_ID), `✅ Товар ${coinId} додано у кошик!`);
      activeSubscriptions.delete(coinId);
    } else if (response.data.redirect === "login.php") {
      console.log("⏳ Сесія прострочена, виконуємо повторний логін...");
      await login();
      await addToCart(coinId);
    }
  } catch (error) {
    console.error(`❌ Помилка додавання ${coinId}:`, error.message);
  }
}

bot.command("list", async (ctx) => {
  try {
    const url = `${siteLink}/catalog.html`;
    const { data } = await axios.get(url);
    const $ = cheerio.load(data);

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
  const coinId = ctx.match[1];
  if (!activeSubscriptions.has(coinId)) {
    activeSubscriptions.add(coinId);
    ctx.reply(`✅ Ви підписалися на монету ID: ${coinId}`);
  } else {
    ctx.reply(`❗ Ви вже підписані на монету ID: ${coinId}`);
  }
});

bot.hears(/\/unsubscribe_(\d+)/, async (ctx) => {
  const coinId = ctx.match[1];
  if (activeSubscriptions.delete(coinId)) {
    ctx.reply(`❌ Ви відписались від монети ${coinId}.`);
  } else {
    ctx.reply(`❌ Ви не були підписані на монету ${coinId}.`);
  }
});

cron.schedule("3,33 * * * *", async () => {
  console.log("🔄 Виконую логін...");
  await login();
});

cron.schedule("* * * * *", async () => {
  const kyivTime = moment().tz("Europe/Kiev");
  const hour = kyivTime.hour();
  if (hour < 8 || hour >= 16) {
    return;
  }
  if (activeSubscriptions.size === 0) return;
  console.log("🛒 Виконую спробу додати товари у кошик...");
  for (const coinId of activeSubscriptions) {
    await addToCart(coinId);
  }
});

bot.launch();
