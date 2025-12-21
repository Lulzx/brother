import type { Context } from "grammy";
import { getPageCount } from "../services/pdf";
import { buildConfigKeyboard } from "../keyboards/print-config";
import { defaultConfig, type UserSession } from "../types";

const DOWNLOADS_DIR = "./downloads";

export const sessions = new Map<number, UserSession>();

export async function handleDocument(ctx: Context): Promise<void> {
  const doc = ctx.message?.document;
  if (!doc) return;

  // Check if it's a PDF
  if (doc.mime_type !== "application/pdf") {
    await ctx.reply("Please send a PDF file.");
    return;
  }

  const statusMsg = await ctx.reply("📥 Downloading...");

  try {
    // Download the file
    const file = await ctx.api.getFile(doc.file_id);
    const filePath = `${DOWNLOADS_DIR}/${doc.file_id}.pdf`;

    // Ensure downloads directory exists
    await Bun.write(filePath, ""); // Create empty file first
    const response = await fetch(
      `https://api.telegram.org/file/bot${process.env.BOT_TOKEN}/${file.file_path}`
    );
    const buffer = await response.arrayBuffer();
    await Bun.write(filePath, buffer);

    // Get page count
    const pageCount = await getPageCount(filePath);

    // Store session
    const userId = ctx.from!.id;
    sessions.set(userId, {
      filePath,
      fileName: doc.file_name || "document.pdf",
      pageCount,
      config: { ...defaultConfig },
    });

    // Show config keyboard
    await ctx.api.editMessageText(
      ctx.chat!.id,
      statusMsg.message_id,
      `📄 *${doc.file_name}*\n📃 ${pageCount} page${pageCount > 1 ? "s" : ""}\n\nConfigure print options:`,
      {
        parse_mode: "Markdown",
        reply_markup: buildConfigKeyboard(defaultConfig, pageCount),
      }
    );
  } catch (error) {
    console.error("Error processing document:", error);
    await ctx.api.editMessageText(
      ctx.chat!.id,
      statusMsg.message_id,
      "❌ Failed to process the PDF. Please try again."
    );
  }
}
