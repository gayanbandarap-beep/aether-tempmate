// Morph Mug - Wokwi ESP32 direct telemetry
// Add DHT22 to Wokwi and connect DATA to GPIO 15.
#include <WiFi.h>
#include <HTTPClient.h>
#include <DHT.h>

#define DHTPIN 15
#define DHTTYPE DHT22
#define HEATER_PIN 2

DHT dht(DHTPIN, DHTTYPE);

const char* WIFI_SSID = "Wokwi-GUEST";
const char* WIFI_PASSWORD = "";
const char* SERVER_URL = "https://aether-tempmate.vercel.app/api/telemetry";
const char* CONTROL_URL = "https://aether-tempmate.vercel.app/api/control";
#define TELEMETRY_KEY "AETHER-WOKWI-2026"

void setup() {
  Serial.begin(115200);
  dht.begin();
  pinMode(HEATER_PIN, OUTPUT);
  digitalWrite(HEATER_PIN, LOW);

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting");
  while (WiFi.status() != WL_CONNECTED) {
    delay(300);
    Serial.print(".");
  }
  Serial.println("\nConnected");
}

void sendTelemetry(float temperature, bool sensorError) {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  http.begin(SERVER_URL);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-TempMate-Key", TELEMETRY_KEY);

  String payload = "{\"temperature\":" + String(temperature, 2) +
                   ",\"sensor_error\":" + String(sensorError ? "true" : "false") +
                   ",\"heater_on\":" + String(digitalRead(HEATER_PIN) == HIGH ? "true" : "false") + "}";

  int code = http.POST(payload);
  String response = http.getString();
  Serial.printf("Telemetry HTTP %d: %s\n", code, response.c_str());
  http.end();

  HTTPClient control;
  control.begin(CONTROL_URL);
  control.addHeader("X-TempMate-Key", TELEMETRY_KEY);
  int controlCode = control.GET();

  if (controlCode == 200) {
    String controlResponse = control.getString();
    bool heaterCommand = controlResponse.indexOf("\"heater_on\":true") >= 0;

    if (!sensorError) {
      digitalWrite(HEATER_PIN, heaterCommand ? HIGH : LOW);
    } else {
      digitalWrite(HEATER_PIN, LOW);
    }

    Serial.printf("Heater command: %s, Control: %s\n",
                  heaterCommand ? "ON" : "OFF",
                  controlResponse.c_str());
  } else {
    digitalWrite(HEATER_PIN, LOW);
    Serial.printf("Control HTTP %d - heater forced OFF\n", controlCode);
  }
  control.end();
}

void loop() {
  float temperature = dht.readTemperature();
  bool sensorError = isnan(temperature);

  if (sensorError) {
    Serial.println("Sensor error");
    digitalWrite(HEATER_PIN, LOW);
  } else {
    Serial.printf("Temperature: %.2f C\n", temperature);
  }

  sendTelemetry(temperature, sensorError);
  delay(3000);
}
