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

  type Step = "greeting" | "ehlo" | "auth" | "mail" | "rcpt" | "data" | "body" | "done";

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("SMTP timeout")), 30000);
    let step: Step = "greeting";
    let buffer = "";

    function fail(msg: string) {
      clearTimeout(timeout);
      reject(new Error(msg));
    }

    Bun.connect({
      hostname: SMTP_HOST,
      port: SMTP_PORT,
      tls: true,
      socket: {
        data(socket, data) {
          buffer += Buffer.from(data).toString();

          // Wait for complete response (ends with \r\n)
          if (!buffer.endsWith("\r\n")) return;

          const response = buffer;
          buffer = "";
          const code = response.substring(0, 3);

          // Check for errors
          if (code.startsWith("4") || code.startsWith("5")) {
            socket.write(`QUIT\r\n`);
            return fail(`SMTP error: ${response.trim()}`);
          }

          switch (step) {
            case "greeting":
              if (response.includes("220")) {
                step = "ehlo";
                socket.write(`EHLO localhost\r\n`);
              }
              break;
            case "ehlo":
              // EHLO multiline: wait for final "250 " (space, not dash)
              if (/^250 /m.test(response)) {
                step = "auth";
                socket.write(`AUTH PLAIN ${authPlain}\r\n`);
              }
              break;
            case "auth":
              if (response.startsWith("235")) {
                step = "mail";
                socket.write(`MAIL FROM:<${SMTP_USER}>\r\n`);
              }
              break;
            case "mail":
              if (response.startsWith("250")) {
                step = "rcpt";
                socket.write(`RCPT TO:<${PRINTER_EMAIL}>\r\n`);
              }
              break;
            case "rcpt":
              if (response.startsWith("250")) {
                step = "data";
                socket.write(`DATA\r\n`);
              }
              break;
            case "data":
              if (response.startsWith("354")) {
                step = "body";
                socket.write(message + "\r\n.\r\n");
              }
              break;
            case "body":
              if (response.startsWith("250")) {
                step = "done";
                socket.write(`QUIT\r\n`);
                clearTimeout(timeout);
                resolve(`Email sent to ${PRINTER_EMAIL} via ${SMTP_HOST}`);
              }
              break;
          }
        },
        open() {},
        error(_socket, error) {
          fail(`SMTP connection error: ${error.message}`);
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
