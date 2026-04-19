/**
 * XIAO ESP32S3 Sense — Camera Web Server
 *
 * WiFi接続後、以下のエンドポイントを提供します:
 *   GET /         → シンプルなHTMLページ (ストリーム表示)
 *   GET /capture  → 1枚のJPEG画像
 *   GET /stream   → MJPEGストリーム
 *   GET /status   → JSON {"status":"ok"}
 *
 * 書き込み手順:
 *   1. ボード: "XIAO_ESP32S3" を選択
 *   2. ssid / password を編集
 *   3. 書き込み後、シリアルモニター(115200bps)でIPアドレスを確認
 */

#include "esp_camera.h"
#include <WiFi.h>
#include <WebServer.h>

// ===== WiFi設定 (ここを編集) =====
const char* ssid     = "kougaku-lab-G";
const char* password = "GISEDGISED";
// ==================================

// XIAO ESP32S3 Sense のカメラピン定義
#define PWDN_GPIO_NUM  -1
#define RESET_GPIO_NUM -1
#define XCLK_GPIO_NUM  10
#define SIOD_GPIO_NUM  40
#define SIOC_GPIO_NUM  39
#define Y9_GPIO_NUM    48
#define Y8_GPIO_NUM    11
#define Y7_GPIO_NUM    12
#define Y6_GPIO_NUM    14
#define Y5_GPIO_NUM    16
#define Y4_GPIO_NUM    18
#define Y3_GPIO_NUM    17
#define Y2_GPIO_NUM    15
#define VSYNC_GPIO_NUM 38
#define HREF_GPIO_NUM  47
#define PCLK_GPIO_NUM  13

WebServer server(80);

// ブラウザからのクロスオリジン(CORS)アクセスを許可
void addCorsHeaders() {
    server.sendHeader("Access-Control-Allow-Origin", "*");
    server.sendHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    server.sendHeader("Access-Control-Allow-Headers", "Content-Type");
    server.sendHeader("Cache-Control", "no-cache");
}

void handleCapture() {
    camera_fb_t* fb = esp_camera_fb_get();
    if (!fb) {
        server.send(500, "text/plain", "Camera capture failed");
        return;
    }
    addCorsHeaders();
    server.send_P(200, "image/jpeg", (const char*)fb->buf, fb->len);
    esp_camera_fb_return(fb);
}

void handleStatus() {
    addCorsHeaders();
    server.send(200, "application/json",
        "{\"status\":\"ok\",\"camera\":\"OV2640\",\"ip\":\"" + WiFi.localIP().toString() + "\"}");
}

void handleOptions() {
    addCorsHeaders();
    server.send(204, "text/plain", "");
}

void handleStream() {
    WiFiClient client = server.client();

    client.print(
        "HTTP/1.1 200 OK\r\n"
        "Content-Type: multipart/x-mixed-replace; boundary=frame\r\n"
        "Access-Control-Allow-Origin: *\r\n"
        "Cache-Control: no-cache\r\n"
        "\r\n"
    );

    while (client.connected()) {
        camera_fb_t* fb = esp_camera_fb_get();
        if (!fb) { delay(10); continue; }

        client.printf(
            "--frame\r\n"
            "Content-Type: image/jpeg\r\n"
            "Content-Length: %u\r\n"
            "\r\n",
            fb->len
        );
        client.write(fb->buf, fb->len);
        client.print("\r\n");
        esp_camera_fb_return(fb);
        delay(100); // ~10fps
    }
}

void handleRoot() {
    String ip = WiFi.localIP().toString();
    server.send(200, "text/html", String(
        "<!DOCTYPE html><html><head>"
        "<meta charset='UTF-8'><title>XIAO ESP32S3 Camera</title>"
        "<style>body{font-family:sans-serif;background:#111;color:#eee;padding:20px;}"
        "img{max-width:100%;border-radius:8px;}"
        "code{background:#333;padding:2px 6px;border-radius:4px;}</style>"
        "</head><body>"
        "<h2>XIAO ESP32S3 Sense Camera</h2>"
        "<img src='/stream'><br><br>"
        "<p>Capture URL: <code>http://") + ip + "/capture</code></p>"
        "<p>Stream URL: <code>http://" + ip + "/stream</code></p>"
        "</body></html>"
    );
}

void setup() {
    Serial.begin(115200);
    Serial.println("\n=== XIAO ESP32S3 Camera ===");

    // カメラ初期化
    camera_config_t config;
    config.ledc_channel = LEDC_CHANNEL_0;
    config.ledc_timer   = LEDC_TIMER_0;
    config.pin_d0       = Y2_GPIO_NUM;
    config.pin_d1       = Y3_GPIO_NUM;
    config.pin_d2       = Y4_GPIO_NUM;
    config.pin_d3       = Y5_GPIO_NUM;
    config.pin_d4       = Y6_GPIO_NUM;
    config.pin_d5       = Y7_GPIO_NUM;
    config.pin_d6       = Y8_GPIO_NUM;
    config.pin_d7       = Y9_GPIO_NUM;
    config.pin_xclk     = XCLK_GPIO_NUM;
    config.pin_pclk     = PCLK_GPIO_NUM;
    config.pin_vsync    = VSYNC_GPIO_NUM;
    config.pin_href     = HREF_GPIO_NUM;
    config.pin_sccb_sda = SIOD_GPIO_NUM;
    config.pin_sccb_scl = SIOC_GPIO_NUM;
    config.pin_pwdn     = PWDN_GPIO_NUM;
    config.pin_reset    = RESET_GPIO_NUM;
    config.xclk_freq_hz = 20000000;
    config.pixel_format = PIXFORMAT_JPEG;
    config.frame_size   = FRAMESIZE_QVGA; // 320x240 (VGAにしたい場合: FRAMESIZE_VGA)
    config.jpeg_quality = 10;             // 0-63, 低いほど高品質
    config.fb_count     = 2;
    config.fb_location  = CAMERA_FB_IN_PSRAM; // XIAO ESP32S3 Sense はPSRAM搭載
    config.grab_mode    = CAMERA_GRAB_WHEN_EMPTY;

    esp_err_t err = esp_camera_init(&config);
    if (err != ESP_OK) {
        Serial.printf("Camera init failed: 0x%x\n", err);
        Serial.println("カメラの初期化に失敗しました。配線とボード選択を確認してください。");
        return;
    }
    Serial.println("Camera OK");

    // WiFi接続
    WiFi.begin(ssid, password);
    Serial.print("WiFi接続中");
    int tries = 0;
    while (WiFi.status() != WL_CONNECTED && tries < 30) {
        delay(500);
        Serial.print(".");
        tries++;
    }
    if (WiFi.status() != WL_CONNECTED) {
        Serial.println("\nWiFi接続失敗。SSIDとパスワードを確認してください。");
        return;
    }
    Serial.println();
    Serial.print("接続完了! IPアドレス: ");
    Serial.println(WiFi.localIP());

    // HTTPサーバー設定
    server.on("/",        HTTP_GET,     handleRoot);
    server.on("/capture", HTTP_GET,     handleCapture);
    server.on("/capture", HTTP_OPTIONS, handleOptions);
    server.on("/stream",  HTTP_GET,     handleStream);
    server.on("/status",  HTTP_GET,     handleStatus);
    server.on("/status",  HTTP_OPTIONS, handleOptions);
    server.begin();

    Serial.println("HTTPサーバー起動");
    Serial.printf("\n>>> ブラウザで開く: http://%s/\n", WiFi.localIP().toString().c_str());
    Serial.printf(">>> WebアプリのカメラURL: http://%s\n\n", WiFi.localIP().toString().c_str());
}

void loop() {
    server.handleClient();
}
