# ESP32 Print Bridge

Bridges Cloudflare Worker to your local Brother printer via ESP32.

## Architecture

```
Telegram → Cloudflare Worker (stores PDF in R2) → ESP32 → Printer:9100
```

## Hardware

- ESP32-C3 (recommended, ~$5) or any ESP32 variant
- USB cable for flashing

## Setup

### 1. Install ESP-IDF

```bash
# macOS
brew install cmake ninja dfu-util
git clone --recursive https://github.com/espressif/esp-idf.git ~/esp/esp-idf
cd ~/esp/esp-idf && ./install.sh esp32c3
source ~/esp/esp-idf/export.sh
```

### 2. Configure

Edit `main/main.c`:

```c
#define WIFI_SSID      "your_wifi"
#define WIFI_PASS      "your_password"
#define WORKER_URL     "https://your-worker.workers.dev"
#define PRINTER_IP     "192.168.1.9"
```

### 3. Build & Flash

```bash
cd esp32
idf.py set-target esp32c3
idf.py build
idf.py -p /dev/tty.usbserial-* flash monitor
```

### 4. Deploy Worker

See `../worker/README.md`
