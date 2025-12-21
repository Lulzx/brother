import { $ } from "bun";
import type { PrintConfig } from "../types";

const PRINTER_NAME = process.env.PRINTER_NAME || "Brother_HL_L2440DW";

export async function print(
  filePath: string,
  config: PrintConfig
): Promise<string> {
  const args: string[] = ["-d", PRINTER_NAME, "-n", String(config.copies)];

  if (config.duplex !== "off") {
    args.push("-o", `sides=two-sided-${config.duplex}`);
  }

  if (config.pages !== "all") {
    args.push("-o", `page-ranges=${config.pages}`);
  }

  args.push("-o", `media=${config.paperSize}`);

  if (config.orientation === "landscape") {
    args.push("-o", "landscape");
  }

  const result = await $`lp ${args} ${filePath}`.text();
  return result.trim();
}

export async function getPrinterStatus(): Promise<string> {
  try {
    const result = await $`lpstat -p ${PRINTER_NAME}`.text();
    return result.trim();
  } catch {
    return "Printer status unknown";
  }
}
