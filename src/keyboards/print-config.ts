import { InlineKeyboard } from "grammy";
import type { PrintConfig } from "../types";

function check(isSelected: boolean): string {
  return isSelected ? "✓ " : "";
}

export function buildConfigKeyboard(
  config: PrintConfig,
  pageCount: number
): InlineKeyboard {
  const kb = new InlineKeyboard();

  // Row 1: Copies
  kb.text("📄 Copies:", "noop");
  [1, 2, 3, 5, 10].forEach((n) => {
    kb.text(`${check(config.copies === n)}${n}`, `copies:${n}`);
  });
  kb.row();

  // Row 2: Duplex
  kb.text("📑 Duplex:", "noop");
  kb.text(`${check(config.duplex === "off")}Off`, "duplex:off");
  kb.text(`${check(config.duplex === "long-edge")}Long`, "duplex:long-edge");
  kb.text(`${check(config.duplex === "short-edge")}Short`, "duplex:short-edge");
  kb.row();

  // Row 3: Pages
  kb.text("📃 Pages:", "noop");
  kb.text(`${check(config.pages === "all")}All (${pageCount})`, "pages:all");
  kb.text(
    `${check(config.pages !== "all")}Range`,
    "pages:range"
  );
  kb.row();

  // Row 4: Paper Size
  kb.text("📐 Size:", "noop");
  kb.text(`${check(config.paperSize === "a4")}A4`, "paper:a4");
  kb.text(`${check(config.paperSize === "letter")}Letter`, "paper:letter");
  kb.row();

  // Row 5: Orientation
  kb.text("🔄 Orient:", "noop");
  kb.text(
    `${check(config.orientation === "portrait")}Portrait`,
    "orient:portrait"
  );
  kb.text(
    `${check(config.orientation === "landscape")}Landscape`,
    "orient:landscape"
  );
  kb.row();

  // Row 6: Print button
  kb.text("🖨️ PRINT", "print").text("❌ Cancel", "cancel");

  return kb;
}

export function buildPageRangeKeyboard(pageCount: number): InlineKeyboard {
  const kb = new InlineKeyboard();
  kb.text(`Pages 1-${pageCount}`, "noop").row();
  kb.text("First half", `setpages:1-${Math.ceil(pageCount / 2)}`);
  kb.text("Second half", `setpages:${Math.ceil(pageCount / 2) + 1}-${pageCount}`);
  kb.row();
  kb.text("First page", "setpages:1");
  kb.text("Last page", `setpages:${pageCount}`);
  kb.row();
  kb.text("« Back", "pages:all");
  return kb;
}
