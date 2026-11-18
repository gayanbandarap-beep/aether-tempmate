from __future__ import annotations

from dataclasses import dataclass, field
import hashlib
import hmac
import os
import threading
import time
from typing import Any

from flask import Flask, jsonify, render_template, request, session

app = Flask(__name__)
APP_SECRET = os.environ.get("TEMPMATE_APP_SECRET", "AETHER_TEMPMATE_ACCESS_SECRET_2026")
AUTHORITY_CODE = os.environ.get("TEMPMATE_AUTHORITY_CODE", "AETHER-AUTHORITY-2026")
app.secret_key = os.environ.get("TEMPMATE_SESSION_SECRET", "AETHER_TEMPMATE_SESSION_SECRET_2026")
MIN_TARGET = 32.5
MAX_TARGET = 40.0
TELEMETRY_KEY = os.environ.get("TEMPMATE_TELEMETRY_KEY", "AETHER-WOKWI-2026")


def _make_qr_token(device_id: str) -> str:
    payload = f"{device_id}:{int(time.time() // 300)}"
    signature = hmac.new(APP_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()[:12]
    return f"{payload}:{signature}"


def _verify_qr_token(raw_code: str) -> bool:
    if not isinstance(raw_code, str):
        return False
    try:
        payload, signature = raw_code.rsplit(":", 1)
        device_id, window_text = payload.rsplit(":", 1)
        window = int(window_text)
    except (ValueError, AttributeError):
        return False
    expected = hmac.new(APP_SECRET.encode(), payload.encode(), hashlib.sha256).hexdigest()[:12]
    current_window = int(time.time() // 300)
    return (
        device_id == "AETHER-BOTTLE-01"
        and abs(current_window - window) <= 1
        and hmac.compare_digest(signature, expected)
    )


def _verify_authority_code(raw_code: str) -> bool:
    if not isinstance(raw_code, str):
        return False
    code = raw_code.strip()
    return hmac.compare_digest(code, AUTHORITY_CODE) or _verify_qr_token(code)


def _require_authority():
    if not session.get("authority_authorized"):
        return jsonify({"error": "Authority access is required. Scan a valid QR or barcode first."}), 403
    return None


@dataclass
class TempMateController:
    temperature: float = 22.0
    target: float = 36.0
    lower_threshold: float = 34.0
    system_enabled: bool = True
    heater_on: bool = False
    sensor_error: bool = False
    manual_stop: bool = False
    external_temperature: float | None = None
    last_telemetry_at: float | None = None
    history: list[dict[str, Any]] = field(default_factory=list)
    lock: threading.RLock = field(default_factory=threading.RLock)

    def __post_init__(self) -> None:
        self.lower_threshold = max(MIN_TARGET, self.target - 2.0)
        self._record_point()

    def set_target(self, value: float) -> None:
        target = max(MIN_TARGET, min(MAX_TARGET, float(value)))
        self.target = round(target, 1)
        self.lower_threshold = round(max(MIN_TARGET, self.target - 2.0), 1)

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
        self.lower_threshold = 34.0
        self.system_enabled = True
        self.heater_on = False
        self.sensor_error = False
        self.manual_stop = False
        self.external_temperature = None
        self.last_telemetry_at = None
        self.history = []
        self._record_point()

    def receive_telemetry(self, temperature: float, sensor_error: bool = False, heater_on: bool = False) -> dict[str, Any]:
        with self.lock:
            temperature = round(float(temperature), 2)
            if temperature < -20 or temperature > 150:
                raise ValueError("Temperature must be between -20 and 150 °C.")
            self.external_temperature = temperature
            self.temperature = temperature
            self.last_telemetry_at = time.time()
            self.sensor_error = bool(sensor_error)
            self._record_point()
            return self.update()

    def _record_point(self) -> None:
        self.history.append({"time": time.time(), "temperature": round(self.temperature, 2)})
        if len(self.history) > 80:
            self.history = self.history[-80:]

    def update(self) -> dict[str, Any]:
        with self.lock:
            telemetry_stale = (
                self.last_telemetry_at is not None
                and time.time() - self.last_telemetry_at > 15
            )

            if self.sensor_error:
                state = "SENSOR ERROR"
                self.heater_on = False
            elif self.manual_stop or not self.system_enabled:
                state = "OFF"
                self.heater_on = False
            elif telemetry_stale:
                state = "SIGNAL LOST"
                self.heater_on = False
            elif self.external_temperature is not None:
                if self.temperature >= self.target:
                    state = "HOLD"
                    self.heater_on = False
                elif self.temperature <= self.lower_threshold:
                    state = "HEATING"
                    self.heater_on = True
                else:
                    state = "HEATING" if self.heater_on else "HOLD"
            elif self.temperature >= self.target:
                state = "HOLD"
                self.heater_on = False
            elif self.temperature <= self.lower_threshold:
                state = "HEATING"
                self.heater_on = True
            else:
                state = "HOLD" if self.heater_on else "HEATING"
                self.heater_on = self.heater_on or state == "HEATING"

            if self.external_temperature is None:
                if self.heater_on and not self.sensor_error and not self.manual_stop and self.system_enabled:
                    self.temperature = round(min(MAX_TARGET + 5.0, self.temperature + 0.35), 2)
                else:
                    self.temperature = round(max(15.0, self.temperature - 0.12), 2)

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
                "external_temperature": self.external_temperature,
                "telemetry_connected": self.last_telemetry_at is not None and not telemetry_stale,
                "history": list(self.history),
            }


controller = TempMateController()


@app.route("/")
def index() -> str:
    return render_template("index.html")


@app.route("/api/telemetry", methods=["POST", "OPTIONS"])
def api_telemetry():
    if request.method == "OPTIONS":
        return jsonify({"ok": True})
    supplied_key = request.headers.get("X-TempMate-Key")
    if not supplied_key or not hmac.compare_digest(supplied_key, TELEMETRY_KEY):
        return jsonify({"error": "Invalid telemetry key."}), 401
    payload = request.get_json(silent=True) or {}
    temperature = payload.get("temperature")
    if temperature is None:
        return jsonify({"error": "temperature is required."}), 400
    try:
        status = controller.receive_telemetry(
            float(temperature),
            bool(payload.get("sensor_error", False)),
            bool(payload.get("heater_on", False)),
        )
    except (TypeError, ValueError) as error:
        return jsonify({"error": str(error)}), 400
    return jsonify({"ok": True, "status": status})


@app.after_request
def add_cors_headers(response):
    response.headers.setdefault("Access-Control-Allow-Origin", "*")
    response.headers.setdefault("Access-Control-Allow-Headers", "Content-Type, X-TempMate-Key")
    response.headers.setdefault("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    return response


@app.route("/api/status")
def api_status():
    status = controller.update()
    status["authorized"] = bool(session.get("authority_authorized"))
    return jsonify(status)


@app.route("/api/target", methods=["POST"])
def api_target():
    denied = _require_authority()
    if denied:
        return denied
    payload = request.get_json(silent=True) or {}
    target = payload.get("target")
    if target is None:
        return jsonify({"error": "A target temperature is required."}), 400
    if target < MIN_TARGET or target > MAX_TARGET:
        return jsonify({"error": f"The target must be between {MIN_TARGET} °C and {MAX_TARGET} °C."}), 400
    controller.set_target(target)
    return jsonify(controller.update())


@app.route("/api/system-toggle", methods=["POST"])
def api_system_toggle():
    denied = _require_authority()
    if denied:
        return denied
    payload = request.get_json(silent=True) or {}
    controller.toggle_system(payload.get("enabled"))
    return jsonify(controller.update())


@app.route("/api/manual-stop", methods=["POST"])
def api_manual_stop():
    denied = _require_authority()
    if denied:
        return denied
    payload = request.get_json(silent=True) or {}
    controller.toggle_manual_stop(payload.get("enabled"))
    return jsonify(controller.update())


@app.route("/api/sensor-error", methods=["POST"])
def api_sensor_error():
    denied = _require_authority()
    if denied:
        return denied
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
        return jsonify({"valid": False, "message": "An authority barcode is required."}), 400
    valid = _verify_authority_code(qr_code)
    if valid:
        session["authority_authorized"] = True
    return jsonify({"valid": valid, "authorized": valid, "message": "Authority barcode approved." if valid else "Invalid barcode. Access denied."})


@app.route("/api/authority/logout", methods=["POST"])
def api_authority_logout():
    session.pop("authority_authorized", None)
    return jsonify({"authorized": False, "message": "Authority session ended."})


@app.route("/api/reset", methods=["POST"])
def api_reset():
    denied = _require_authority()
    if denied:
        return denied
    controller.reset()
    return jsonify(controller.update())


@app.route("/api/control", methods=["GET"])
def api_control():
    supplied_key = request.headers.get("X-TempMate-Key")
    if not supplied_key or not hmac.compare_digest(supplied_key, TELEMETRY_KEY):
        return jsonify({"error": "Invalid telemetry key."}), 401
    status = controller.update()
    return jsonify({
        "heater_on": status["heater_on"] and not status["sensor_error"],
        "target": status["target"],
        "lower_threshold": status["lower_threshold"],
        "temperature": status["temperature"],
        "state": status["state"],
    })


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 5000)), debug=False)
