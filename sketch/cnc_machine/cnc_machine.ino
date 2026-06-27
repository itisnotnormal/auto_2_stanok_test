#include <ESP8266WiFi.h>
#include <ESP8266HTTPClient.h>
#include <WiFiClient.h>

// ───── Настройки ─────
const char* WIFI_SSID     = "Beeline_2.4G_1DD7";
const char* WIFI_PASSWORD = "k87058616517";
const char* SERVER_URL    = "http://192.168.0.13:8080/api/machine-status";
const int   MACHINE_ID    = 1;
const int   SEND_INTERVAL = 5000; // мс

// ───── Статусы ───────
// Меняй эту функцию под реальный датчик.
// Сейчас — заглушка: чередует статусы по таймеру.
String readMachineStatus() {
  // TODO: подключи реальный датчик сюда
  // Пока заглушка: running пока нет сигнала ошибки
  return "running";
}

void connectWiFi() {
  Serial.printf("Подключение к %s", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.printf("\nПодключено. IP: %s\n", WiFi.localIP().toString().c_str());
}

bool sendStatus(const String& status) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("WiFi отвалился, переподключаюсь...");
    connectWiFi();
  }

  WiFiClient client;
  HTTPClient http;

  http.begin(client, SERVER_URL);
  http.addHeader("Content-Type", "application/json");

  String body = "{\"machine_id\":" + String(MACHINE_ID) +
                ",\"status\":\"" + status + "\"}";

  int code = http.POST(body);
  bool ok = (code == 200);

  Serial.printf("[HTTP] POST %s → %d\n", body.c_str(), code);
  http.end();
  return ok;
}

void setup() {
  Serial.begin(115200);
  Serial.println("\n=== CNC Monitor v1.0 ===");
  connectWiFi();
}

unsigned long lastSend = 0;

void loop() {
  if (millis() - lastSend >= SEND_INTERVAL) {
    String status = readMachineStatus();
    sendStatus(status);
    lastSend = millis();
  }
}
