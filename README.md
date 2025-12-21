# Brother Print Bot

Telegram bot to print PDFs on a Brother HL-L2440DW printer.

## Features

- Send PDF → configure options → print
- Inline buttons for: copies, duplex, page range, paper size, orientation
- Private bot (whitelist your Telegram ID)

## Deployment Options

### Option 1: Local (Mac/Linux)

Run the bot on a machine connected to your network.

```bash
# Install deps
bun install

# Configure
cp .env.example .env
# Edit .env with BOT_TOKEN, ALLOWED_USER_ID

# Add printer to CUPS
lpadmin -p Brother_HL_L2440DW -E -v ipp://192.168.1.9/ipp/print -m everywhere

# Run
bun run start
```

### Option 2: ESP32 + Cloudflare Worker

Run the bot on Cloudflare's edge, with a $5 ESP32 bridging to your printer.

```
Telegram → Cloudflare Worker → ESP32 → Printer
```

See:
- `worker/README.md` - Deploy the Cloudflare Worker
- `esp32/README.md` - Flash the ESP32 firmware

## Project Structure

```
brother/
├── src/                  # Local bot (Grammy.js + Bun)
│   ├── index.ts
│   ├── handlers/
│   ├── services/
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

## Print Options

| Option | Values |
|--------|--------|
| Copies | 1, 2, 3, 5, 10 |
| Duplex | Off, Long edge, Short edge |
| Pages | All, Range (1-5, etc.) |
| Paper | A4, Letter |
| Orientation | Portrait, Landscape |

## Requirements

- Brother HL-L2440DW (or similar IPP/CUPS compatible printer)
- Telegram bot token from @BotFather
- Your Telegram user ID from @userinfobot

### Local deployment
- Bun runtime
- CUPS (comes with macOS/Linux)

### ESP32 deployment
- ESP32-C3 board (~$5)
- ESP-IDF toolchain
- Cloudflare account (free tier works)
