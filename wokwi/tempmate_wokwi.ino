// Morph Mug - Wokwi ESP32 direct telemetry and I2C LCD display
// Add DHT22: DATA -> GPIO 15
// Add I2C LCD 16x2: SDA -> GPIO 21, SCL -> GPIO 22
#include <WiFi.h>
#include <HTTPClient.h>
#include <DHT.h>
#include <Wire.h>
#include <LiquidCrystal_I2C.h>

#define DHTPIN 15
#define DHTTYPE DHT22
#define HEATER_PIN 2
#define TARGET_MINUS_PIN 25
#define TARGET_PLUS_PIN 26

DHT dht(DHTPIN, DHTTYPE);

const char* WIFI_SSID = "Wokwi-GUEST";
const char* WIFI_PASSWORD = "";
const char* SERVER_URL = "https://aether-tempmate.vercel.app/api/telemetry";
const char* CONTROL_URL = "https://aether-tempmate.vercel.app/api/control";
#define TELEMETRY_KEY "AETHER-MORPH-MUG-2026"

LiquidCrystal_I2C lcd(0x27, 16, 2);

float currentTarget = 36.0;
String systemState = "START";
unsigned long lastTargetButtonMs = 0;

void sendTelemetry(float temperature, bool sensorError);
float readJsonNumber(const String& json, const char* key);
String readJsonString(const String& json, const char* key);
void displayTemperature(float temperature, bool sensorError);
void setServerTarget(float target);

void setup() {
  Serial.begin(115200);
  dht.begin();
  pinMode(HEATER_PIN, OUTPUT);
  pinMode(TARGET_MINUS_PIN, INPUT_PULLUP);
  pinMode(TARGET_PLUS_PIN, INPUT_PULLUP);
  digitalWrite(HEATER_PIN, LOW);

  lcd.begin();
  lcd.backlight();
  lcd.print("Connecting to WiFi");

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting");
  while (WiFi.status() != WL_CONNECTED) {
    delay(300);
    Serial.print(".");
  }
  Serial.println("\nConnected");
  lcd.clear();
  lcd.print("WiFi Connected");
  delay(1000);
  lcd.clear();
}

void sendTelemetry(float temperature, bool sensorError) {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  http.begin(SERVER_URL);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Morph-Mug-Key", TELEMETRY_KEY);

  String payload = "{\"temperature\":" + String(temperature, 2) +
                   ",\"sensor_error\":" + String(sensorError ? "true" : "false") +
                   ",\"heater_on\":" + String(digitalRead(HEATER_PIN) == HIGH ? "true" : "false") + "}";

  int code = http.POST(payload);
  String response = http.getString();
  Serial.printf("Telemetry HTTP %d: %s\n", code, response.c_str());
  if (code == 200) {
    float serverTarget = readJsonNumber(response, "target");
    if (!isnan(serverTarget)) currentTarget = serverTarget;
    String serverState = readJsonString(response, "state");
    if (serverState.length() > 0) systemState = serverState;
  }
  http.end();

  HTTPClient control;
  control.begin(CONTROL_URL);
  control.addHeader("X-Morph-Mug-Key", TELEMETRY_KEY);
  int controlCode = control.GET();

  if (controlCode == 200) {
    String controlResponse = control.getString();
    bool heaterCommand = controlResponse.indexOf("\"heater_on\":true") >= 0;
    float serverTarget = readJsonNumber(controlResponse, "target");
    if (!isnan(serverTarget)) currentTarget = serverTarget;
    String serverState = readJsonString(controlResponse, "state");
    if (serverState.length() > 0) systemState = serverState;

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

float readJsonNumber(const String& json, const char* key) {
  String pattern = String("\"") + key + "\":";
  int start = json.indexOf(pattern);
  if (start < 0) return NAN;
  start += pattern.length();
  int end = json.indexOf(',', start);
  if (end < 0) end = json.indexOf('}', start);
  if (end < 0) return NAN;
  return json.substring(start, end).toFloat();
}

String readJsonString(const String& json, const char* key) {
  String pattern = String("\"") + key + "\":\"";
  int start = json.indexOf(pattern);
  if (start < 0) return "";
  start += pattern.length();
  int end = json.indexOf('"', start);
  if (end < 0) return "";
  return json.substring(start, end);
}

void displayTemperature(float temperature, bool sensorError) {
  lcd.clear();
  lcd.setCursor(0, 0);
  if (sensorError || isnan(temperature)) {
    lcd.print("SENSOR ERROR");
  } else {
    lcd.printf("Cur: %.1f C", temperature);
  }

  lcd.setCursor(0, 1);
  if (sensorError || isnan(temperature)) {
    lcd.print("HEATER OFF");
  } else {
    String heater = digitalRead(HEATER_PIN) == HIGH ? "ON " : "OFF";
    lcd.printf("Tgt:%.1f %s", currentTarget, heater.c_str());
  }
}

void setServerTarget(float target) {
  if (target < 32.5) target = 32.5;
  if (target > 40.0) target = 40.0;

  currentTarget = target;

  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  http.begin("https://aether-tempmate.vercel.app/api/control/target");
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Morph-Mug-Key", TELEMETRY_KEY);

  String payload = "{\"target\":" + String(target, 1) + "}";
  int code = http.POST(payload);
  String response = http.getString();

  if (code == 200) {
    float serverTarget = readJsonNumber(response, "target");
    if (!isnan(serverTarget)) currentTarget = serverTarget;
  }

  Serial.printf("Target button -> %.1f C (HTTP %d)\n", currentTarget, code);
  http.end();
}

void setup() {
  Serial.begin(115200);
  dht.begin();
  pinMode(HEATER_PIN, OUTPUT);
  pinMode(TARGET_MINUS_PIN, INPUT_PULLUP);
  pinMode(TARGET_PLUS_PIN, INPUT_PULLUP);
  digitalWrite(HEATER_PIN, LOW);

  lcd.begin();
  lcd.backlight();
  lcd.print("Connecting to WiFi");

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting");
  while (WiFi.status() != WL_CONNECTED) {
    delay(300);
    Serial.print(".");
  }
  Serial.println("\nConnected");
  lcd.clear();
  lcd.print("WiFi Connected");
  delay(1000);
  lcd.clear();
}

void loop() {
  unsigned long now = millis();
  if (now - lastTargetButtonMs >= 250) {
    if (digitalRead(TARGET_MINUS_PIN) == LOW) {
      setServerTarget(currentTarget - 0.5);
      displayTemperature(dht.readTemperature(), false);
      lastTargetButtonMs = now;
    } else if (digitalRead(TARGET_PLUS_PIN) == LOW) {
      setServerTarget(currentTarget + 0.5);
      displayTemperature(dht.readTemperature(), false);
      lastTargetButtonMs = now;
    }
  }

  float temperature = dht.readTemperature();
  bool sensorError = isnan(temperature);

  if (sensorError) {
    Serial.println("Sensor error");
    digitalWrite(HEATER_PIN, LOW);
  } else {
    Serial.printf("Temperature: %.2f C\n", temperature);
  }

  sendTelemetry(temperature, sensorError);

  displayTemperature(temperature, sensorError);

  delay(3000);
}
