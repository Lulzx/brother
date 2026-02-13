import type { Context } from "grammy";
import { sessions } from "./document";
import { buildConfigKeyboard, buildPageRangeKeyboard } from "../keyboards/print-config";
import { print } from "../services/printer";
import { unlink } from "fs/promises";

export async function handleCallback(ctx: Context): Promise<void> {
  const data = ctx.callbackQuery?.data;
  if (!data) return;

  const userId = ctx.from!.id;
  const session = sessions.get(userId);

  // Handle noop (label buttons)
  if (data === "noop") {
    await ctx.answerCallbackQuery();
    return;
  }

  // Handle cancel
  if (data === "cancel") {
    if (session) {
      try {
        await unlink(session.filePath);
      } catch {}
      sessions.delete(userId);
    }
    await ctx.editMessageText("❌ Print cancelled.");
    await ctx.answerCallbackQuery();
    return;
  }

  if (!session) {
    await ctx.answerCallbackQuery({ text: "Session expired. Send the PDF again." });
    return;
  }

  const [action, value] = data.split(":");

  // Handle print
  if (action === "print") {
    await ctx.answerCallbackQuery({ text: "🖨️ Sending to printer..." });
    try {
      const result = await print(session.filePath, session.config, session.fileName);
      await ctx.editMessageText(
        `✅ Print job sent!\n\n📄 ${session.fileName}\n📃 Pages: ${session.config.pages}\n📑 Copies: ${session.config.copies}\n\n${result}`
      );
      // Clean up
      try {
        await unlink(session.filePath);
      } catch {}
      sessions.delete(userId);
    } catch (error) {
      console.error("Print error:", error);
      await ctx.editMessageText(
        `❌ Print failed: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    }
    return;
  }

  // Handle page range selection screen
  if (action === "pages" && value === "range") {
    await ctx.editMessageReplyMarkup({
      reply_markup: buildPageRangeKeyboard(session.pageCount),
    });
    await ctx.answerCallbackQuery();
    return;
  }

  // Handle setting a specific page range
  if (action === "setpages") {
    session.config.pages = value;
    await ctx.editMessageReplyMarkup({
      reply_markup: buildConfigKeyboard(session.config, session.pageCount),
    });
    await ctx.answerCallbackQuery({ text: `Pages: ${value}` });
    return;
  }

  // Handle config updates
  switch (action) {
    case "copies":
      session.config.copies = parseInt(value, 10);
      break;
    case "duplex":
      session.config.duplex = value as "off" | "long-edge" | "short-edge";
      break;
    case "pages":
      session.config.pages = value;
      break;
    case "paper":
      session.config.paperSize = value as "a4" | "letter";
      break;
    case "orient":
      session.config.orientation = value as "portrait" | "landscape";
      break;
  }

  // Update keyboard to reflect new selection
  await ctx.editMessageReplyMarkup({
    reply_markup: buildConfigKeyboard(session.config, session.pageCount),
  });
  await ctx.answerCallbackQuery();
}
