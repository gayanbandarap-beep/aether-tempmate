const temperatureValue = document.querySelector('#temperatureValue');
const targetValue = document.querySelector('#targetValue');
const stateValue = document.querySelector('#stateValue');
const heaterBadge = document.querySelector('#heaterBadge');
const telemetryBadge = document.querySelector('#telemetryBadge');
const targetInput = document.querySelector('#targetInput');
const applyTargetBtn = document.querySelector('#applyTargetBtn');
const targetMinusBtn = document.querySelector('#targetMinusBtn');
const targetPlusBtn = document.querySelector('#targetPlusBtn');
const targetRangeNote = document.querySelector('#targetRangeNote');
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
    'SENSOR ERROR': { bg: 'rgba(255, 95, 115, 0.14)', text: '#ff5f73' },
    'SIGNAL LOST': { bg: 'rgba(255, 95, 115, 0.14)', text: '#ff5f73' }
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

  [applyTargetBtn, targetMinusBtn, targetPlusBtn, systemToggleBtn, stopBtn, sensorErrorBtn, resetBtn, ...document.querySelectorAll('.target-preset')].forEach((button) => {
    button.disabled = !authorized;
  });

  temperatureValue.textContent = `${data.temperature.toFixed(1)} °C`;
  targetValue.textContent = `${data.target.toFixed(1)} °C`;
  targetInput.value = data.target.toFixed(1);
  targetRangeNote.textContent = `Safe range: 32.5 °C to 40.0 °C · Heater restarts below ${data.lower_threshold.toFixed(1)} °C`;
  document.querySelectorAll('.target-preset').forEach((button) => {
    button.classList.toggle('active', Number(button.dataset.target) === data.target);
  });
  setStatePill(data.state);

  const heaterEnabled = data.heater_on && !data.sensor_error && !data.manual_stop && data.system_enabled;
  heaterBadge.textContent = heaterEnabled ? 'Heater ON' : 'Heater OFF';
  heaterBadge.classList.toggle('on', heaterEnabled);
  heaterBadge.classList.toggle('off', !heaterEnabled);

  telemetryBadge.textContent = data.telemetry_connected ? 'Wokwi live' : 'Simulation data';
  telemetryBadge.classList.toggle('on', Boolean(data.telemetry_connected));
  telemetryBadge.classList.toggle('off', !data.telemetry_connected);

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

  telemetryBadge.textContent = `Telemetry: ${data.telemetryStatus}`;
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

verifyQrBtn.addEventListener('click', async () => {
  const code = qrCodeInput.value.trim();
  if (!code) {
    qrStatus.textContent = 'Scan or enter a valid authority barcode to continue.';
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

async function startBarcodeScanner() {
  if (!('BarcodeDetector' in window)) {
    qrStatus.textContent = 'Camera barcode scanning is unavailable. Use an external barcode scanner or enter the code manually.';
    qrCodeInput.focus();
    return;
  }

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    qrStatus.textContent = 'Camera access is unavailable. Use an external barcode scanner or enter the code manually.';
    qrCodeInput.focus();
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    const video = document.createElement('video');
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;
    video.srcObject = stream;
    await video.play();

    qrStatus.textContent = 'Scanning for an authority barcode...';
    const detector = new BarcodeDetector({
      formats: ['code_128', 'ean_13', 'ean_8', 'code_39', 'upc_a', 'upc_e']
    });

    const scanInterval = setInterval(async () => {
      try {
        const barcodes = await detector.detect(video);
        if (barcodes.length > 0) {
          qrCodeInput.value = barcodes[0].rawValue;
          qrStatus.textContent = 'Barcode detected. Verifying authority...';
          clearInterval(scanInterval);
          stream.getTracks().forEach((track) => track.stop());
          verifyQrBtn.click();
        }
      } catch (error) {
        console.error('Barcode detection error:', error);
      }
    }, 500);
  } catch (error) {
    qrStatus.textContent = 'Camera access was denied. Use an external barcode scanner or enter the code manually.';
    qrCodeInput.focus();
  }
}

startScanBtn.addEventListener('click', () => {
  document.querySelector('.qr-panel').scrollIntoView({ behavior: 'smooth' });
  startBarcodeScanner();
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
  qrStatus.textContent = 'Ready for secure barcode authentication.';
});

targetMinusBtn.addEventListener('click', () => {
  const next = Math.max(32.5, Number(targetInput.value) - 0.5);
  targetInput.value = next.toFixed(1);
});

targetPlusBtn.addEventListener('click', () => {
  const next = Math.min(40, Number(targetInput.value) + 0.5);
  targetInput.value = next.toFixed(1);
});

document.querySelectorAll('.target-preset').forEach((button) => {
  button.addEventListener('click', () => {
    targetInput.value = Number(button.dataset.target).toFixed(1);
    applyTargetBtn.click();
  });
});
