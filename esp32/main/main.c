/**
 * ESP32 Print Bridge
 * Polls Cloudflare Worker for print jobs and streams PDFs to Brother printer
 *
 * Build: idf.py build
 * Flash: idf.py -p /dev/ttyUSB0 flash monitor
 */

#include <string.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_system.h"
#include "esp_wifi.h"
#include "esp_event.h"
#include "esp_log.h"
#include "nvs_flash.h"
#include "esp_http_client.h"
#include "esp_netif.h"
#include "lwip/sockets.h"
#include "cJSON.h"

static const char *TAG = "print_bridge";

// Configuration - EDIT THESE
#define WIFI_SSID      "YOUR_WIFI_SSID"
#define WIFI_PASS      "YOUR_WIFI_PASS"
#define WORKER_URL     "https://your-worker.workers.dev"
#define PRINTER_IP     "192.168.1.9"
#define PRINTER_PORT   9100
#define POLL_INTERVAL  5000  // ms

// Buffer for HTTP responses
#define HTTP_BUF_SIZE  4096
static char http_buf[HTTP_BUF_SIZE];
static int http_buf_len = 0;

// Current job info
static char job_id[64] = {0};
static char pdf_url[256] = {0};
static int job_copies = 1;

// WiFi event handler
static void wifi_event_handler(void *arg, esp_event_base_t event_base,
                               int32_t event_id, void *event_data) {
    if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_START) {
        esp_wifi_connect();
    } else if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_DISCONNECTED) {
        ESP_LOGI(TAG, "Reconnecting to WiFi...");
        esp_wifi_connect();
    } else if (event_base == IP_EVENT && event_id == IP_EVENT_STA_GOT_IP) {
        ip_event_got_ip_t *event = (ip_event_got_ip_t *)event_data;
        ESP_LOGI(TAG, "Connected! IP: " IPSTR, IP2STR(&event->ip_info.ip));
    }
}

static void wifi_init(void) {
    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());
    esp_netif_create_default_wifi_sta();

    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&cfg));

    esp_event_handler_instance_t instance_any_id;
    esp_event_handler_instance_t instance_got_ip;
    ESP_ERROR_CHECK(esp_event_handler_instance_register(WIFI_EVENT, ESP_EVENT_ANY_ID,
                    &wifi_event_handler, NULL, &instance_any_id));
    ESP_ERROR_CHECK(esp_event_handler_instance_register(IP_EVENT, IP_EVENT_STA_GOT_IP,
                    &wifi_event_handler, NULL, &instance_got_ip));

    wifi_config_t wifi_config = {
        .sta = {
            .ssid = WIFI_SSID,
            .password = WIFI_PASS,
        },
    };
    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &wifi_config));
    ESP_ERROR_CHECK(esp_wifi_start());
}

// HTTP event handler for fetching job info
static esp_err_t http_event_handler(esp_http_client_event_t *evt) {
    switch (evt->event_id) {
        case HTTP_EVENT_ON_DATA:
            if (http_buf_len + evt->data_len < HTTP_BUF_SIZE) {
                memcpy(http_buf + http_buf_len, evt->data, evt->data_len);
                http_buf_len += evt->data_len;
            }
            break;
        default:
            break;
    }
    return ESP_OK;
}

// Connect to printer and return socket
static int printer_connect(void) {
    struct sockaddr_in dest_addr;
    dest_addr.sin_addr.s_addr = inet_addr(PRINTER_IP);
    dest_addr.sin_family = AF_INET;
    dest_addr.sin_port = htons(PRINTER_PORT);

    int sock = socket(AF_INET, SOCK_STREAM, IPPROTO_IP);
    if (sock < 0) {
        ESP_LOGE(TAG, "Failed to create socket");
        return -1;
    }

    if (connect(sock, (struct sockaddr *)&dest_addr, sizeof(dest_addr)) != 0) {
        ESP_LOGE(TAG, "Failed to connect to printer");
        close(sock);
        return -1;
    }

    ESP_LOGI(TAG, "Connected to printer at %s:%d", PRINTER_IP, PRINTER_PORT);
    return sock;
}

// Send PJL header
static void printer_send_header(int sock, int copies) {
    char header[128];
    snprintf(header, sizeof(header),
             "\x1b%%-12345X@PJL SET COPIES=%d\r\n"
             "@PJL ENTER LANGUAGE=PDF\r\n", copies);
    send(sock, header, strlen(header), 0);
}

// Send PJL footer
static void printer_send_footer(int sock) {
    const char *footer = "\x1b%-12345X@PJL EOJ\r\n";
    send(sock, footer, strlen(footer), 0);
}

// Fetch and check for pending job
static bool fetch_job(void) {
    char url[256];
    snprintf(url, sizeof(url), "%s/api/job", WORKER_URL);

    http_buf_len = 0;
    memset(http_buf, 0, HTTP_BUF_SIZE);

    esp_http_client_config_t config = {
        .url = url,
        .event_handler = http_event_handler,
    };

    esp_http_client_handle_t client = esp_http_client_init(&config);
    esp_err_t err = esp_http_client_perform(client);

    if (err != ESP_OK) {
        esp_http_client_cleanup(client);
        return false;
    }

    int status = esp_http_client_get_status_code(client);
    esp_http_client_cleanup(client);

    if (status != 200) {
        return false;
    }

    // Parse JSON
    cJSON *json = cJSON_Parse(http_buf);
    if (!json) return false;

    cJSON *id = cJSON_GetObjectItem(json, "id");
    cJSON *purl = cJSON_GetObjectItem(json, "url");
    cJSON *copies = cJSON_GetObjectItem(json, "copies");

    if (id && purl) {
        strncpy(job_id, id->valuestring, sizeof(job_id) - 1);
        strncpy(pdf_url, purl->valuestring, sizeof(pdf_url) - 1);
        job_copies = copies ? copies->valueint : 1;
        cJSON_Delete(json);
        return true;
    }

    cJSON_Delete(json);
    return false;
}

// Stream PDF to printer
static bool stream_pdf_to_printer(int sock) {
    ESP_LOGI(TAG, "Fetching PDF: %s", pdf_url);

    esp_http_client_config_t config = {
        .url = pdf_url,
        .buffer_size = 4096,
    };

    esp_http_client_handle_t client = esp_http_client_init(&config);
    esp_err_t err = esp_http_client_open(client, 0);

    if (err != ESP_OK) {
        ESP_LOGE(TAG, "Failed to open HTTP connection");
        esp_http_client_cleanup(client);
        return false;
    }

    esp_http_client_fetch_headers(client);

    char buf[4096];
    int total = 0;
    int len;

    while ((len = esp_http_client_read(client, buf, sizeof(buf))) > 0) {
        send(sock, buf, len, 0);
        total += len;
    }

    ESP_LOGI(TAG, "Sent %d bytes to printer", total);
    esp_http_client_cleanup(client);
    return true;
}

// Mark job as complete
static void complete_job(void) {
    char url[256];
    snprintf(url, sizeof(url), "%s/api/job/%s", WORKER_URL, job_id);

    esp_http_client_config_t config = {
        .url = url,
        .method = HTTP_METHOD_DELETE,
    };

    esp_http_client_handle_t client = esp_http_client_init(&config);
    esp_http_client_perform(client);
    esp_http_client_cleanup(client);

    ESP_LOGI(TAG, "Job completed: %s", job_id);
}

// Main print task
static void print_task(void *pvParameters) {
    // Wait for WiFi
    vTaskDelay(pdMS_TO_TICKS(3000));

    ESP_LOGI(TAG, "Print bridge started");
    ESP_LOGI(TAG, "Polling %s", WORKER_URL);

    while (1) {
        if (fetch_job()) {
            ESP_LOGI(TAG, "Got job: %s (copies: %d)", job_id, job_copies);

            int sock = printer_connect();
            if (sock >= 0) {
                printer_send_header(sock, job_copies);

                if (stream_pdf_to_printer(sock)) {
                    printer_send_footer(sock);
                    complete_job();
                }

                close(sock);
            }

            // Clear job
            memset(job_id, 0, sizeof(job_id));
            memset(pdf_url, 0, sizeof(pdf_url));
        }

        vTaskDelay(pdMS_TO_TICKS(POLL_INTERVAL));
    }
}

void app_main(void) {
    ESP_LOGI(TAG, "ESP32 Print Bridge");

    // Init NVS
    esp_err_t ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        ret = nvs_flash_init();
    }
    ESP_ERROR_CHECK(ret);

    // Init WiFi
    wifi_init();

    // Start print task
    xTaskCreate(print_task, "print_task", 8192, NULL, 5, NULL);
}
