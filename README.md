# Brother Print Bot

Telegram bot to print PDFs on a Brother HL-L2440DW printer.

## Features

- Send PDF → print (email mode) or configure options → print (CUPS mode)
- Two print modes: email-to-print via SMTP, or local CUPS
- Inline buttons for: copies, duplex, page range, paper size, orientation (CUPS mode)
- Private bot (whitelist your Telegram ID)

## Deployment Options

### Option 1: Email-to-Print (Recommended)

Works anywhere — no local network access to the printer needed. Uses SMTP to email PDFs to Brother Cloud Print.

```bash
# Install deps
bun install

# Configure
cp .env.example .env
# Edit .env with BOT_TOKEN, ALLOWED_USER_ID, SMTP credentials, and printer email

# Run
bun run start
```

### Option 2: Local CUPS (Mac/Linux)

Run the bot on a machine connected to your printer's network.

```bash
# Install deps
bun install

# Configure
cp .env.example .env
# Edit .env: set PRINT_MODE=cups, BOT_TOKEN, ALLOWED_USER_ID

# Add printer to CUPS
lpadmin -p Brother_HL_L2440DW -E -v ipp://<printer-ip>/ipp/print -m everywhere

# Run
bun run start
```

### Option 3: ESP32 + Cloudflare Worker

Run the bot on Cloudflare's edge, with a $5 ESP32 bridging to your printer.

```
Telegram → Cloudflare Worker → ESP32 → Printer
```

See:
- `worker/README.md` - Deploy the Cloudflare Worker
- `esp32/README.md` - Flash the ESP32 firmware

## Configuration

| Variable | Description | Required |
|----------|-------------|----------|
| `BOT_TOKEN` | Telegram bot token from @BotFather | Yes |
| `ALLOWED_USER_ID` | Your Telegram user ID from @userinfobot | Yes |
| `PRINT_MODE` | `email` (default) or `cups` | No |
| `PRINTER_EMAIL` | Brother Cloud Print email address | Email mode |
| `SMTP_HOST` | SMTP server hostname | Email mode |
| `SMTP_PORT` | SMTP server port (465 for TLS) | Email mode |
| `SMTP_USER` | SMTP username/email | Email mode |
| `SMTP_PASS` | SMTP password or app password | Email mode |
| `PRINTER_NAME` | CUPS printer name | CUPS mode |

## Project Structure

```
brother/
├── src/                  # Local bot (Grammy.js + Bun)
│   ├── index.ts
│   ├── handlers/
│   ├── services/
│   │   ├── printer.ts    # SMTP + CUPS print backends
│   │   ├── printer.test.ts
│   │   └── pdf.ts
│   └── keyboards/
├── worker/               # Cloudflare Worker
│   └── src/index.ts
├── esp32/                # ESP32 firmware (C, ESP-IDF)
│   └── main/main.c
└── .env.example
```

## Commands

| Command | Description |
|---------|-------------|
| `/start` | Welcome message |
| `/status` | Check printer status |

## Print Options (CUPS mode)

| Option | Values |
|--------|--------|
| Copies | 1, 2, 3, 5, 10 |
| Duplex | Off, Long edge, Short edge |
| Pages | All, Range (1-5, etc.) |
| Paper | A4, Letter |
| Orientation | Portrait, Landscape |

## Testing

```bash
# Run tests (no actual printing)
bun test

# Run tests with real print job
TEST_PRINT=1 bun test
```

## Requirements

- Brother HL-L2440DW (or similar IPP/CUPS compatible printer)
- Telegram bot token from @BotFather
- Your Telegram user ID from @userinfobot
- Bun runtime
- For email mode: SMTP account (Gmail with app password, etc.)
- For CUPS mode: CUPS (comes with macOS/Linux)
