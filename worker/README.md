# Cloudflare Worker - Print Bot

Telegram bot that queues PDFs for ESP32 print bridge.

## Setup

### 1. Install dependencies

```bash
cd worker
bun install
```

### 2. Create Cloudflare resources

```bash
# Login to Cloudflare
bunx wrangler login

# Create KV namespace
bunx wrangler kv:namespace create PRINT_JOBS
# Copy the id to wrangler.toml

# Create R2 bucket
bunx wrangler r2 bucket create print-pdfs
```

### 3. Update wrangler.toml

Replace `YOUR_KV_NAMESPACE_ID` with the ID from step 2.

### 4. Set secrets

```bash
bunx wrangler secret put BOT_TOKEN
bunx wrangler secret put ALLOWED_USER_ID
```

### 5. Deploy

```bash
bun run deploy
```

### 6. Set Telegram webhook

```bash
curl "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook?url=https://print-bot.<your-subdomain>.workers.dev/webhook"
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/webhook` | POST | Telegram webhook |
| `/api/job` | GET | Get pending job (ESP32) |
| `/api/pdf/:id` | GET | Download PDF (ESP32) |
| `/api/job/:id` | DELETE | Mark job complete (ESP32) |
| `/api/health` | GET | Health check |
