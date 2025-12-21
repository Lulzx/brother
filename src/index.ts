import { Bot } from "grammy";
import { handleDocument } from "./handlers/document";
import { handleCallback } from "./handlers/callbacks";
import { mkdir } from "fs/promises";

const BOT_TOKEN = process.env.BOT_TOKEN;
const ALLOWED_USER_ID = process.env.ALLOWED_USER_ID
  ? parseInt(process.env.ALLOWED_USER_ID, 10)
  : null;

if (!BOT_TOKEN) {
  console.error("BOT_TOKEN is required");
  process.exit(1);
}

// Ensure downloads directory exists
await mkdir("./downloads", { recursive: true });

const bot = new Bot(BOT_TOKEN);

// Access control middleware
bot.use(async (ctx, next) => {
  if (ALLOWED_USER_ID && ctx.from?.id !== ALLOWED_USER_ID) {
    await ctx.reply("⛔ Unauthorized. This bot is private.");
    return;
  }
  await next();
});

// Commands
bot.command("start", async (ctx) => {
  await ctx.reply(
    "🖨️ *Print Bot*\n\nSend me a PDF file and I'll print it to your Brother HL-L2440DW.\n\nYou can configure copies, duplex, page range, paper size, and orientation before printing.",
    { parse_mode: "Markdown" }
  );
});

bot.command("status", async (ctx) => {
  const { getPrinterStatus } = await import("./services/printer");
  const status = await getPrinterStatus();
  await ctx.reply(`🖨️ Printer status:\n\`${status}\``, { parse_mode: "Markdown" });
});

// Document handler
bot.on("message:document", handleDocument);

// Callback query handler
bot.on("callback_query:data", handleCallback);

// Error handling
bot.catch((err) => {
  console.error("Bot error:", err);
});

console.log("🖨️ Print bot starting...");
bot.start();
