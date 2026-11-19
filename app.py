from __future__ import annotations

from dataclasses import dataclass, field
import hashlib
import hmac
import os
import threading
import time
from typing import Any

from flask import Flask, jsonify, render_template, request

app = Flask(__name__)
APP_SECRET = "AETHER_MORPH_MUG_ACCESS_SECRET_2026"
MIN_TARGET = 32.5
MAX_TARGET = 60.0
TELEMETRY_KEY = "AETHER-MORPH-MUG-2026"


def _make_qr_token(device_id: str) -> str:
    payload = f"{device_id}:{int(time.time() // 300)}"
    signature = hmac.new(APP_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()[:12]
    return f"{payload}:{signature}"


def _verify_qr_token(raw_code: str) -> bool:
    if not isinstance(raw_code, str):
        return False
    try:
        payload, signature = raw_code.rsplit(":", 1)
    except ValueError:
        return False
    expected = hmac.new(APP_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()[:12]
    return hmac.compare_digest(signature, expected)


@dataclass
class MorphMugController:
    temperature: float = 22.0
    target: float = 36.0
    lower_threshold: float = 35.8
    system_enabled: bool = True
    heater_on: bool = False
    sensor_error: bool = False
    manual_stop: bool = False
    holding_at_target: bool = False
    history: list[dict[str, Any]] = field(default_factory=list)
    lock: threading.Lock = field(default_factory=threading.Lock)
    wokwi_connected: bool = False
    target_source: str = "APP"

    def __post_init__(self) -> None:
        self.lower_threshold = max(MIN_TARGET, self.target - 2.0)
        self._record_point()

    def set_target(self, value: float, source: str = "APP") -> None:
        target = max(MIN_TARGET, min(MAX_TARGET, float(value)))
        self.target = round(target, 1)
        self.target_source = source
        self.lower_threshold = round(max(MIN_TARGET, self.target - 0.2), 1)
        self.holding_at_target = abs(self.temperature - self.target) <= 0.2
        if self.holding_at_target:
            self.temperature = self.target
            self.heater_on = False

    def toggle_system(self, enabled: bool | None = None) -> None:
        if enabled is None:
            self.system_enabled = not self.system_enabled
        else:
            self.system_enabled = bool(enabled)

        if not self.system_enabled:
            self.heater_on = False
            self.manual_stop = True

    def toggle_manual_stop(self, enabled: bool | None = None) -> None:
        if enabled is None:
            self.manual_stop = not self.manual_stop
        else:
            self.manual_stop = bool(enabled)
        if self.manual_stop:
            self.heater_on = False

    def set_sensor_error(self, enabled: bool | None = None) -> None:
        if enabled is None:
            self.sensor_error = not self.sensor_error
        else:
            self.sensor_error = bool(enabled)
        if self.sensor_error:
            self.heater_on = False

    def reset(self) -> None:
        self.temperature = 22.0
        self.target = 36.0
        self.lower_threshold = 35.8
        self.system_enabled = True
        self.heater_on = False
        self.sensor_error = False
        self.manual_stop = False
        self.history = []
        self.holding_at_target = False
        self.target_source = "APP"
        self._record_point()

    def _record_point(self) -> None:
        self.history.append({"time": time.time(), "temperature": round(self.temperature, 2)})
        if len(self.history) > 80:
            self.history = self.history[-80:]

    def update(self) -> dict[str, Any]:
        with self.lock:
            if self.sensor_error:
                state = "SENSOR ERROR"
                self.heater_on = False
                self.holding_at_target = False
            elif self.manual_stop or not self.system_enabled:
                state = "OFF"
                self.heater_on = False
                self.holding_at_target = False
            elif abs(self.temperature - self.target) <= 0.05:
                self.temperature = self.target
                state = "HOLD"
                self.heater_on = False
                self.holding_at_target = True
            elif self.temperature < self.target:
                state = "HEATING"
                self.heater_on = True
                self.holding_at_target = False
            else:
                state = "HOLD"
                self.heater_on = False
                self.holding_at_target = True

            if self.wokwi_connected:
                if abs(self.temperature - self.target) <= 0.05:
                    self.temperature = self.target
                    self.heater_on = False
                    self.holding_at_target = True
            elif self.heater_on and not self.sensor_error and not self.manual_stop and self.system_enabled:
                self.temperature = round(min(self.target, self.temperature + 0.35), 2)
                if abs(self.temperature - self.target) <= 0.05:
                    self.temperature = self.target
                    self.heater_on = False
                    self.holding_at_target = True
            elif self.holding_at_target:
                self.temperature = self.target

            self._record_point()

            return {
                "temperature": self.temperature,
                "target": self.target,
                "lower_threshold": self.lower_threshold,
                "state": state,
                "heater_on": self.heater_on,
                "sensor_error": self.sensor_error,
                "manual_stop": self.manual_stop,
                "system_enabled": self.system_enabled,
                "holding_at_target": self.holding_at_target,
                "wokwi_connected": self.wokwi_connected,
                "target_source": self.target_source,
                "history": list(self.history),
            }


controller = MorphMugController()


@app.route("/")
def index() -> str:
    return render_template("index.html")


@app.route("/download")
def download() -> str:
    return render_template("download.html")


@app.route("/official")
def official() -> str:
    return render_template("official.html")


@app.route("/api/status")
def api_status():
    return jsonify(controller.update())


@app.route("/api/target", methods=["POST"])
def api_target():
    payload = request.get_json(silent=True) or {}
    target = payload.get("target")
    if target is None:
        return jsonify({"error": "A target temperature is required."}), 400
    try:
        target = float(target)
    except (TypeError, ValueError):
        return jsonify({"error": "A numeric target temperature is required."}), 400
    if target < MIN_TARGET or target > MAX_TARGET:
        return jsonify({"error": f"The target must be between {MIN_TARGET} °C and {MAX_TARGET} °C."}), 400
    controller.set_target(target)
    return jsonify(controller.update())


@app.route("/api/system-toggle", methods=["POST"])
def api_system_toggle():
    payload = request.get_json(silent=True) or {}
    controller.toggle_system(payload.get("enabled"))
    return jsonify(controller.update())


@app.route("/api/manual-stop", methods=["POST"])
def api_manual_stop():
    payload = request.get_json(silent=True) or {}
    controller.toggle_manual_stop(payload.get("enabled"))
    return jsonify(controller.update())


@app.route("/api/sensor-error", methods=["POST"])
def api_sensor_error():
    payload = request.get_json(silent=True) or {}
    controller.set_sensor_error(payload.get("enabled"))
    return jsonify(controller.update())


@app.route("/api/qr/challenge")
def api_qr_challenge():
    return jsonify({"deviceId": "AETHER-BOTTLE-01", "qrCode": _make_qr_token("AETHER-BOTTLE-01")})


@app.route("/api/qr/validate", methods=["POST"])
def api_qr_validate():
    payload = request.get_json(silent=True) or {}
    qr_code = payload.get("qrCode")
    if not qr_code:
        return jsonify({"valid": False, "message": "A QR code is required."}), 400
    if isinstance(qr_code, str) and "|TOKEN:" in qr_code:
        qr_code = qr_code.split("|TOKEN:", 1)[1].strip()
    valid = _verify_qr_token(qr_code)
    return jsonify({"valid": valid, "message": "Access approved." if valid else "Invalid QR signature. Access denied."})


@app.route("/api/reset", methods=["POST"])
def api_reset():
    controller.reset()
    return jsonify(controller.update())


def telemetry_authorized() -> bool:
    return hmac.compare_digest(request.headers.get("X-Morph-Mug-Key", ""), TELEMETRY_KEY)


@app.route("/api/telemetry", methods=["POST"])
def api_telemetry():
    if not telemetry_authorized():
        return jsonify({"error": "Unauthorized Wokwi device"}), 401

    payload = request.get_json(silent=True) or {}
    try:
        temperature = float(payload.get("temperature"))
    except (TypeError, ValueError):
        return jsonify({"error": "Valid temperature data is required"}), 400

    if temperature < -40 or temperature > 125:
        controller.set_sensor_error(True)
    else:
        controller.wokwi_connected = True
        controller.temperature = round(temperature, 2)
        controller.set_sensor_error(bool(payload.get("sensor_error", False)))

    return jsonify(controller.update())


@app.route("/api/control", methods=["GET"])
def api_control():
    if not telemetry_authorized():
        return jsonify({"error": "Unauthorized Wokwi device"}), 401
    return jsonify(controller.update())


@app.route("/api/control/target", methods=["POST"])
def api_control_target():
    if not telemetry_authorized():
        return jsonify({"error": "Unauthorized Wokwi device"}), 401

    payload = request.get_json(silent=True) or {}
    try:
        target = float(payload.get("target"))
    except (TypeError, ValueError):
        return jsonify({"error": "A numeric target temperature is required"}), 400

    if target < MIN_TARGET or target > MAX_TARGET:
        return jsonify({"error": f"Target must be between {MIN_TARGET} and {MAX_TARGET} C"}), 400

    controller.wokwi_connected = True
    controller.set_target(target, source="WOKWI")
    return jsonify(controller.update())


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), debug=False)
