# Morph Mug App

This project creates a small local web dashboard for the Morph Mug concept described in the student prototype report.

## Features

- Live liquid temperature display
- Adjustable target temperature
- Heating logic based on hysteresis
- Manual stop and sensor-fault simulation
- Safety reminder panel
- Temperature history chart

## Run the app

1. Open a terminal in this folder.
2. Start the server:
   ```bash
   python app.py
   ```
3. Open the app in a browser:
   ```text
   http://127.0.0.1:5000
   ```

## Files

- [app.py](app.py)
- [templates/index.html](templates/index.html)
- [static/style.css](static/style.css)
- [static/app.js](static/app.js)

## Wokwi hardware connection

Open the files in `wokwi/` in a Wokwi ESP32 project:

- `tempmate_wokwi.ino` — ESP32 control and live app API code
- `diagram.json` — DHT22, I2C LCD, heater LED, and target +/- buttons
- `wokwi.toml` — local Wokwi configuration

GPIO mapping:

- DHT22 data: GPIO 15
- I2C LCD SDA: GPIO 21
- I2C LCD SCL: GPIO 22
- Heater indicator/output: GPIO 2
- Target decrease button: GPIO 25
- Target increase button: GPIO 26

The Wokwi project must be public before it can be opened by an external project URL.
