const temperatureValue = document.querySelector('#temperatureValue');
const targetValue = document.querySelector('#targetValue');
const stateValue = document.querySelector('#stateValue');
const heaterBadge = document.querySelector('#heaterBadge');
const targetInput = document.querySelector('#targetInput');
const applyTargetBtn = document.querySelector('#applyTargetBtn');
const systemToggleBtn = document.querySelector('#systemToggleBtn');
const stopBtn = document.querySelector('#stopBtn');
const sensorErrorBtn = document.querySelector('#sensorErrorBtn');
const requestQrBtn = document.querySelector('#requestQrBtn');
const verifyQrBtn = document.querySelector('#verifyQrBtn');
const qrCodeInput = document.querySelector('#qrCodeInput');
const qrStatus = document.querySelector('#qrStatus');
const resetBtn = document.querySelector('#resetBtn');
const chart = document.querySelector('#chart');
const safetyMessage = document.querySelector('#safetyMessage');
const qrVideo = document.querySelector('#qrVideo');
const qrCanvas = document.querySelector('#qrCanvas');
const authorityGate = document.querySelector('#authorityGate');
const authorityBadge = document.querySelector('#authorityBadge');
const logoutBtn = document.querySelector('#logoutBtn');
const startScanBtn = document.querySelector('#startScanBtn');

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
  const authorized = Boolean(data.authorized);
  authorityGate.hidden = authorized;
  authorityBadge.textContent = authorized ? 'Authority approved' : 'Authority locked';
  authorityBadge.classList.toggle('locked', !authorized);
  authorityBadge.classList.toggle('approved', authorized);
  logoutBtn.hidden = !authorized;

  [applyTargetBtn, systemToggleBtn, stopBtn, sensorErrorBtn, resetBtn].forEach((button) => {
    button.disabled = !authorized;
  });

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
        ? 'The heating system will operate within the set target range and stop safely at the upper limit.'
        : 'The system is currently disabled for safety.';

  renderChart(data.history);
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
  if (Number.isNaN(target) || target < 32.5 || target > 40) {
    qrStatus.textContent = 'Target must stay between 32.5 °C and 40.0 °C.';
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

requestQrBtn.addEventListener('click', async () => {
  try {
    const data = await fetchJson('/api/qr/challenge');
    qrStatus.textContent = `Device: ${data.deviceId}. Use the QR access code to unlock the system.`;
    qrCodeInput.value = data.qrCode;
  } catch (error) {
    qrStatus.textContent = `QR generation failed: ${error.message}`;
  }
});

verifyQrBtn.addEventListener('click', async () => {
  const code = qrCodeInput.value.trim();
  if (!code) {
    qrStatus.textContent = 'Paste or scan a valid QR code to continue.';
    return;
  }

  try {
    const data = await fetchJson('/api/qr/validate', {
      method: 'POST',
      body: JSON.stringify({ qrCode: code })
    });
    qrStatus.textContent = data.message;
    if (data.valid) {
      await refreshStatus();
    }
    if (!data.valid) {
      qrCodeInput.style.borderColor = '#ff5f73';
      return;
    }
    qrCodeInput.style.borderColor = '#3ee7a5';
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
    const barcodeDetector = 'BarcodeDetector' in window
      ? new window.BarcodeDetector({ formats: ['qr_code', 'code_128', 'ean_13', 'ean_8', 'code_39', 'upc_a', 'upc_e'] })
      : null;

    const scanInterval = setInterval(async () => {
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
        } else if (barcodeDetector) {
          try {
            const barcodes = await barcodeDetector.detect(canvas);
            if (barcodes.length > 0) {
              qrCodeInput.value = barcodes[0].rawValue;
              qrStatus.textContent = 'Barcode detected. Verifying integrity...';
              clearInterval(scanInterval);
              stream.getTracks().forEach((track) => track.stop());
              verifyQrBtn.click();
            }
          } catch (error) {
            console.error('Barcode detection error:', error);
          }
        }
      }
    }, 500);
  } catch (error) {
    qrStatus.textContent = 'Camera access was denied. You can still paste a QR code manually.';
  }
}

qrVideo.addEventListener('click', startQrScanner);
startScanBtn.addEventListener('click', () => {
  document.querySelector('.qr-panel').scrollIntoView({ behavior: 'smooth' });
  startQrScanner();
});
logoutBtn.addEventListener('click', async () => {
  try {
    await fetchJson('/api/authority/logout', { method: 'POST' });
    await refreshStatus();
    qrCodeInput.value = '';
    qrStatus.textContent = 'Authority session ended. Controls are locked.';
  } catch (error) {
    qrStatus.textContent = error.message;
  }
});
refreshStatus();
setInterval(refreshStatus, 1500);

window.addEventListener('load', () => {
  qrCodeInput.value = '';
  qrStatus.textContent = 'Ready for secure bottle authentication.';
});
