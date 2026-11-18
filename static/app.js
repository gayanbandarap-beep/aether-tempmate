const temperatureValue = document.querySelector('#temperatureValue');
const targetValue = document.querySelector('#targetValue');
const stateValue = document.querySelector('#stateValue');
const heaterBadge = document.querySelector('#heaterBadge');
const targetInput = document.querySelector('#targetInput');
const applyTargetBtn = document.querySelector('#applyTargetBtn');
const systemToggleBtn = document.querySelector('#systemToggleBtn');
const stopBtn = document.querySelector('#stopBtn');
const sensorErrorBtn = document.querySelector('#sensorErrorBtn');
const qrCodeInput = document.querySelector('#qrCodeInput');
const qrStatus = document.querySelector('#qrStatus');
const resetBtn = document.querySelector('#resetBtn');
const chart = document.querySelector('#chart');
const safetyMessage = document.querySelector('#safetyMessage');
const qrVideo = document.querySelector('#qrVideo');
const qrCanvas = document.querySelector('#qrCanvas');
const startQrScanBtn = document.querySelector('#startQrScanBtn');
const verifyQrBtn = document.querySelector('#verifyQrBtn');
const targetRange = document.querySelector('#targetRange');
const targetReadout = document.querySelector('#targetReadout');
const targetMinusBtn = document.querySelector('#targetMinusBtn');
const targetPlusBtn = document.querySelector('#targetPlusBtn');
const qrImageInput = document.querySelector('#qrImageInput');
const installAppBtn = document.querySelector('#installAppBtn');
const telemetryBadge = document.querySelector('#telemetryBadge');
const targetSourceBadge = document.querySelector('#targetSourceBadge');
const lcdStatusText = document.querySelector('#lcdStatusText');

let installPrompt = null;

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Request failed: ${response.status}`);
  }
  return response.json();
}

function setStatePill(state) {
  stateValue.textContent = state;
  const palette = {
    HEATING: { bg: 'rgba(62, 231, 165, 0.18)', text: '#3ee7a5' },
    HOLD: { bg: 'rgba(255, 200, 87, 0.18)', text: '#ffc857' },
    OFF: { bg: 'rgba(149, 195, 229, 0.12)', text: '#a9c0d6' },
    'SENSOR ERROR': { bg: 'rgba(255, 95, 115, 0.14)', text: '#ff5f73' }
  };

  const colors = palette[state] || palette.OFF;
  stateValue.style.background = colors.bg;
  stateValue.style.color = colors.text;
}

function renderChart(history) {
  if (!history || history.length === 0) {
    chart.innerHTML = '';
    return;
  }

  const width = 500;
  const height = 220;
  const pad = 16;
  const values = history.map((point) => point.temperature);
  const min = Math.min(...values) - 2;
  const max = Math.max(...values) + 2;
  const yRange = max - min || 1;

  const points = history.map((point, index) => {
    const x = pad + (index / Math.max(history.length - 1, 1)) * (width - pad * 2);
    const y = height - pad - ((point.temperature - min) / yRange) * (height - pad * 2);
    return `${x},${y}`;
  }).join(' ');

  chart.innerHTML = `
    <polyline points="${points}" fill="none" stroke="#4dd0ff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></polyline>
  `;
}

function updateUi(data) {
  temperatureValue.textContent = `${data.temperature.toFixed(1)} °C`;
  targetValue.textContent = `${data.target.toFixed(1)} °C`;
  targetInput.value = data.target.toFixed(1);
  setStatePill(data.state);

  const heaterEnabled = data.heater_on && !data.sensor_error && !data.manual_stop && data.system_enabled;
  heaterBadge.textContent = heaterEnabled ? 'Heater ON' : 'Heater OFF';
  heaterBadge.classList.toggle('on', heaterEnabled);
  heaterBadge.classList.toggle('off', !heaterEnabled);

  systemToggleBtn.textContent = data.system_enabled ? 'System ON' : 'System OFF';
  systemToggleBtn.classList.toggle('primary-button', data.system_enabled);
  systemToggleBtn.classList.toggle('ghost-button', !data.system_enabled);

  stopBtn.textContent = data.manual_stop ? 'Manual stop active' : 'Manual stop';
  stopBtn.classList.toggle('warning-button', !data.manual_stop);
  stopBtn.classList.toggle('ghost-button', data.manual_stop);

  sensorErrorBtn.textContent = data.sensor_error ? 'Clear sensor fault' : 'Sensor fault';
  safetyMessage.textContent = data.sensor_error
    ? 'Sensor fault detected: the heater is disabled and the system entered a safe-state error condition.'
    : data.manual_stop
      ? 'Manual power disconnect is active. The heating circuit is safely off.'
      : data.system_enabled
        ? 'Morph Mug is holding the selected target exactly with no temperature rise or fall above the set value.'
        : 'The system is currently disabled for safety.';

  renderChart(data.history);
  syncTargetControls(data.target);

  if (telemetryBadge) {
    telemetryBadge.textContent = data.wokwi_connected ? 'Live: Wokwi' : 'Live: Simulation';
    telemetryBadge.classList.toggle('on', data.wokwi_connected);
    telemetryBadge.classList.toggle('off', !data.wokwi_connected);
  }

  if (targetSourceBadge) {
    targetSourceBadge.textContent = `Target: ${data.target_source || 'APP'}`;
  }

  if (lcdStatusText) {
    const heaterText = data.heater_on ? 'ON' : 'OFF';
    lcdStatusText.textContent = `Cur ${data.temperature.toFixed(1)}°C · Target ${data.target.toFixed(1)}°C · Heater ${heaterText}`;
  }
}

async function refreshStatus() {
  try {
    const data = await fetchJson('/api/status');
    updateUi(data);
  } catch (error) {
    console.error('Unable to refresh status', error);
  }
}

applyTargetBtn.addEventListener('click', async () => {
  const target = Number(targetInput.value);
  if (Number.isNaN(target) || target < 32.5 || target > 60) {
    qrStatus.textContent = 'Target must stay between 32.5 °C and 60.0 °C.';
    return;
  }

  try {
    const data = await fetchJson('/api/target', {
      method: 'POST',
      body: JSON.stringify({ target })
    });
    updateUi(data);
  } catch (error) {
    qrStatus.textContent = error.message;
  }
});

systemToggleBtn.addEventListener('click', async () => {
  try {
    const current = await fetchJson('/api/status');
    const data = await fetchJson('/api/system-toggle', {
      method: 'POST',
      body: JSON.stringify({ enabled: !current.system_enabled })
    });
    updateUi(data);
  } catch (error) {
    qrStatus.textContent = error.message;
  }
});

stopBtn.addEventListener('click', async () => {
  try {
    const current = await fetchJson('/api/status');
    const data = await fetchJson('/api/manual-stop', {
      method: 'POST',
      body: JSON.stringify({ enabled: !current.manual_stop })
    });
    updateUi(data);
  } catch (error) {
    qrStatus.textContent = error.message;
  }
});

sensorErrorBtn.addEventListener('click', async () => {
  try {
    const current = await fetchJson('/api/status');
    const data = await fetchJson('/api/sensor-error', {
      method: 'POST',
      body: JSON.stringify({ enabled: !current.sensor_error })
    });
    updateUi(data);
  } catch (error) {
    qrStatus.textContent = error.message;
  }
});

resetBtn.addEventListener('click', async () => {
  try {
    const data = await fetchJson('/api/reset', { method: 'POST' });
    updateUi(data);
    qrStatus.textContent = 'System reset complete. Ready for secure authentication.';
    qrCodeInput.value = '';
  } catch (error) {
    qrStatus.textContent = error.message;
  }
});

async function startQrScanner() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    qrStatus.textContent = 'This browser does not support camera QR scanning.';
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    qrVideo.srcObject = stream;
    qrVideo.play();
    qrStatus.textContent = 'Scanning for a valid Aether QR code...';

    const canvas = qrCanvas;
    const context = canvas.getContext('2d');

    const scanInterval = setInterval(() => {
      if (qrVideo.readyState === qrVideo.HAVE_CURRENT_DATA) {
        context.drawImage(qrVideo, 0, 0, canvas.width, canvas.height);
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, canvas.width, canvas.height, {
          inversionAttempts: 'dontInvert'
        });

        if (code) {
          qrCodeInput.value = code.data;
          qrStatus.textContent = 'QR code detected. Verifying integrity...';
          clearInterval(scanInterval);
          stream.getTracks().forEach((track) => track.stop());
          verifyQrBtn.click();
        }
      }
    }, 500);
  } catch (error) {
    qrStatus.textContent = 'Camera access was denied. You can still paste a QR code manually.';
  }
}

verifyQrBtn.addEventListener('click', async () => {
  const code = qrCodeInput.value.trim();
  if (!code) {
    qrStatus.textContent = 'Paste or scan a valid QR code to continue.';
    return;
  }

  let token = code;
  const marker = '|TOKEN:';
  if (code.includes(marker)) {
    token = code.split(marker)[1].trim();
  }

  try {
    const data = await fetchJson('/api/qr/validate', {
      method: 'POST',
      body: JSON.stringify({ qrCode: token })
    });
    qrStatus.textContent = data.message;
    qrCodeInput.style.borderColor = data.valid ? '#3ee7a5' : '#ff5f73';
  } catch (error) {
    qrStatus.textContent = error.message;
  }
});

function syncTargetControls(value) {
  const target = Math.max(32.5, Math.min(60, Number(value)));
  const normalized = Math.round(target * 10) / 10;
  targetInput.value = normalized.toFixed(1);
  targetRange.value = normalized;
  targetReadout.textContent = `${normalized.toFixed(1)} °C`;
}

targetRange.addEventListener('input', () => syncTargetControls(targetRange.value));
targetInput.addEventListener('input', () => {
  const value = Number(targetInput.value);
  if (!Number.isNaN(value) && value >= 32.5 && value <= 60) {
    syncTargetControls(value);
  }
});
targetMinusBtn.addEventListener('click', () => syncTargetControls(Number(targetInput.value || 36) - 0.1));
targetPlusBtn.addEventListener('click', () => syncTargetControls(Number(targetInput.value || 36) + 0.1));

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  installPrompt = event;
  if (installAppBtn) installAppBtn.hidden = false;
});

if (installAppBtn) {
  installAppBtn.addEventListener('click', async () => {
    if (!installPrompt) return;
    installPrompt.prompt();
    await installPrompt.userChoice;
    installPrompt = null;
    installAppBtn.hidden = true;
  });
}

window.addEventListener('appinstalled', () => {
  if (installAppBtn) installAppBtn.hidden = true;
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/static/sw.js').catch(console.error);
  });
}

startQrScanBtn.addEventListener('click', startQrScanner);
refreshStatus();
setInterval(refreshStatus, 1500);

window.addEventListener('load', () => {
  qrCodeInput.value = '';
  qrStatus.textContent = 'Ready for secure bottle authentication.';
});

qrImageInput.addEventListener('change', async () => {
  const file = qrImageInput.files && qrImageInput.files[0];
  if (!file) return;

  qrStatus.textContent = 'Reading QR code from the selected image...';

  try {
    const imageUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext('2d');
      context.drawImage(image, 0, 0);

      let qrResult = null;
      if (typeof jsQR === 'function') {
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        const result = jsQR(imageData.data, canvas.width, canvas.height, { inversionAttempts: 'attemptBoth' });
        qrResult = result ? result.data : null;
      }

      URL.revokeObjectURL(imageUrl);
      if (!qrResult) {
        qrStatus.textContent = 'A QR code could not be read from that image. Try a clearer photo.';
        return;
      }

      qrCodeInput.value = qrResult;
      qrStatus.textContent = 'QR code detected from image. Verifying...';
      verifyQrBtn.click();
    };
    image.src = imageUrl;
  } catch (error) {
    qrStatus.textContent = 'Unable to read the selected image.';
  }
});
