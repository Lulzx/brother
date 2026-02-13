import { $ } from "bun";
import type { PrintConfig } from "../types";

const PRINTER_NAME = process.env.PRINTER_NAME || "Brother_HL_L2440DW";
const PRINTER_EMAIL = process.env.PRINTER_EMAIL || "printr@print.brother.com";
const SMTP_HOST = process.env.SMTP_HOST || "smtp.gmail.com";
const SMTP_PORT = parseInt(process.env.SMTP_PORT || "465");
const SMTP_USER = process.env.SMTP_USER || "";
const SMTP_PASS = process.env.SMTP_PASS || "";

export function buildLpArgs(
  filePath: string,
  config: PrintConfig
): string[] {
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

  args.push(filePath);
  return args;
}

async function smtpSend(filePath: string, fileName: string): Promise<string> {
  const fileBytes = await Bun.file(filePath).arrayBuffer();
  const base64 = Buffer.from(fileBytes).toString("base64").replace(/(.{76})/g, "$1\r\n");

  const boundary = `----boundary${Date.now()}`;
  const message = [
    `From: ${SMTP_USER}`,
    `To: ${PRINTER_EMAIL}`,
    `Subject: Print: ${fileName}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    ``,
    `--${boundary}`,
    `Content-Type: text/plain; charset="utf-8"`,
    ``,
    `Print job`,
    `--${boundary}`,
    `Content-Type: application/pdf; name="${fileName}"`,
    `Content-Disposition: attachment; filename="${fileName}"`,
    `Content-Transfer-Encoding: base64`,
    ``,
    base64,
    `--${boundary}--`,
  ].join("\r\n");

  const authPlain = Buffer.from(`\0${SMTP_USER}\0${SMTP_PASS}`).toString("base64");

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("SMTP timeout")), 30000);

    Bun.connect({
      hostname: SMTP_HOST,
      port: SMTP_PORT,
      tls: true,
      socket: {
        data(socket, data) {
          const response = Buffer.from(data).toString();
          const code = response.substring(0, 3);

          if (response.includes("220") && !socket.data.greeted) {
            socket.data.greeted = true;
            socket.write(`EHLO localhost\r\n`);
          } else if (response.startsWith("250") && !socket.data.authed) {
            socket.data.authed = true;
            socket.write(`AUTH PLAIN ${authPlain}\r\n`);
          } else if (response.startsWith("235") && !socket.data.mailFrom) {
            socket.data.mailFrom = true;
            socket.write(`MAIL FROM:<${SMTP_USER}>\r\n`);
          } else if (response.startsWith("250") && socket.data.mailFrom && !socket.data.rcptTo) {
            socket.data.rcptTo = true;
            socket.write(`RCPT TO:<${PRINTER_EMAIL}>\r\n`);
          } else if (response.startsWith("250") && socket.data.rcptTo && !socket.data.data) {
            socket.data.data = true;
            socket.write(`DATA\r\n`);
          } else if (response.startsWith("354")) {
            socket.write(message + "\r\n.\r\n");
          } else if (response.startsWith("250") && socket.data.data) {
            socket.write(`QUIT\r\n`);
            clearTimeout(timeout);
            resolve(`Email sent to ${PRINTER_EMAIL} via ${SMTP_HOST}`);
          } else if (code.startsWith("4") || code.startsWith("5")) {
            socket.write(`QUIT\r\n`);
            clearTimeout(timeout);
            reject(new Error(`SMTP error: ${response.trim()}`));
          }
        },
        open(socket) {
          socket.data = {
            greeted: false,
            authed: false,
            mailFrom: false,
            rcptTo: false,
            data: false,
          };
        },
        error(_socket, error) {
          clearTimeout(timeout);
          reject(new Error(`SMTP connection error: ${error.message}`));
        },
        close() {},
      },
    });
  });
}

export async function print(
  filePath: string,
  config: PrintConfig,
  fileName?: string
): Promise<string> {
  const name = fileName || filePath.split("/").pop() || "document.pdf";
  return smtpSend(filePath, name);
}

export async function printViaCups(
  filePath: string,
  config: PrintConfig
): Promise<string> {
  const args = buildLpArgs(filePath, config);
  const proc = Bun.spawn(["/usr/bin/lp", ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const exitCode = await proc.exited;
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  if (exitCode !== 0) {
    throw new Error(`lp failed (exit ${exitCode}): ${stderr}`);
  }
  return stdout.trim();
}

export async function getPrinterStatus(): Promise<string> {
  try {
    const result = await $`/usr/bin/lpstat -p ${PRINTER_NAME}`.text();
    return result.trim();
  } catch {
    return "Printer status unknown";
  }
}
