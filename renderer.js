// DOM Elements
const moverToggle = document.getElementById('moverToggle');
const toggleLabel = document.getElementById('toggleLabel');
const statusDot = document.getElementById('statusDot');
const statusText = document.getElementById('statusText');
const timerCountdown = document.getElementById('timerCountdown');
const progressRing = document.getElementById('progressRing');
const intervalSlider = document.getElementById('intervalSlider');
const intervalValue = document.getElementById('intervalValue');
const distanceSlider = document.getElementById('distanceSlider');
const distanceValue = document.getElementById('distanceValue');
const manualMoveBtn = document.getElementById('manualMoveBtn');
const logMessage = document.getElementById('logMessage');

// State
let isActive = false;
let intervalSec = parseInt(intervalSlider.value, 10);
let distancePx = parseInt(distanceSlider.value, 10);
let secondsRemaining = 0;
let countdownTimerId = null;

const RING_CIRCUMFERENCE = 377; // 2 * pi * r (r = 60)

// Helper: Format seconds to readable format
function formatTime(seconds) {
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return secs === 0 ? `${mins} min` : `${mins}m ${secs}s`;
}

// Update Setting Labels
function updateIntervalLabel(seconds) {
  intervalValue.textContent = formatTime(seconds);
}

function updateDistanceLabel(pixels) {
  distanceValue.textContent = `${pixels} px`;
}

// Progress Ring Controller
function setProgress(percent) {
  const offset = RING_CIRCUMFERENCE - (percent / 100) * RING_CIRCUMFERENCE;
  progressRing.style.strokeDashoffset = offset;
}

// Countdown Engine
function startCountdown() {
  stopCountdown();
  secondsRemaining = intervalSec;
  updateCountdownUI();

  countdownTimerId = setInterval(() => {
    secondsRemaining--;
    if (secondsRemaining < 0) {
      // Loop resets once a successful move event returns,
      // but fallback reset to keep ui in sync
      secondsRemaining = intervalSec;
    }
    updateCountdownUI();
  }, 1000);
}

function stopCountdown() {
  if (countdownTimerId) {
    clearInterval(countdownTimerId);
    countdownTimerId = null;
  }
  secondsRemaining = 0;
  timerCountdown.textContent = '--';
  setProgress(0);
}

function updateCountdownUI() {
  timerCountdown.textContent = secondsRemaining.toString();
  const percent = (secondsRemaining / intervalSec) * 100;
  setProgress(percent);
}

// UI State Updater
function setUIActive(active) {
  isActive = active;
  moverToggle.checked = active;
  
  if (active) {
    statusDot.className = 'status-dot active';
    statusText.textContent = 'Mover Active';
    toggleLabel.textContent = 'Mover Enabled';
    manualMoveBtn.disabled = false;
    logMessage.textContent = 'Mover running in background';
    startCountdown();
  } else {
    statusDot.className = 'status-dot idled';
    statusText.textContent = 'System Idle';
    toggleLabel.textContent = 'Activate Mover';
    manualMoveBtn.disabled = true;
    logMessage.textContent = 'Toggle to start auto cursor movement';
    stopCountdown();
  }
}

// Slider Interactions
intervalSlider.addEventListener('input', (e) => {
  const val = parseInt(e.target.value, 10);
  intervalSec = val;
  updateIntervalLabel(val);
  
  if (isActive) {
    // Send updated settings to Electron backend
    window.electronAPI.updateMover({
      intervalMs: intervalSec * 1000,
      distancePx: distancePx
    });
    // Restart countdown with new total time
    startCountdown();
  }
});

distanceSlider.addEventListener('input', (e) => {
  const val = parseInt(e.target.value, 10);
  distancePx = val;
  updateDistanceLabel(val);
  
  if (isActive) {
    window.electronAPI.updateMover({
      intervalMs: intervalSec * 1000,
      distancePx: distancePx
    });
  }
});

// Toggle Action
moverToggle.addEventListener('change', (e) => {
  const checked = e.target.checked;
  if (checked) {
    window.electronAPI.startMover({
      intervalMs: intervalSec * 1000,
      distancePx: distancePx
    }).then(() => {
      setUIActive(true);
    });
  } else {
    window.electronAPI.stopMover().then(() => {
      setUIActive(false);
    });
  }
});

// Manual Move Button
manualMoveBtn.addEventListener('click', () => {
  window.electronAPI.triggerMove();
});

// Listen to backend reports (including Menu Bar Tray activations)
window.electronAPI.onMoverEvent((eventData) => {
  if (!eventData) return;

  if (eventData.type === 'move-success') {
    const now = new Date().toLocaleTimeString();
    logMessage.textContent = `⚡ Moved cursor successfully at ${now}`;
    
    // Pulse animation logic
    statusDot.style.transform = 'scale(1.5)';
    progressRing.style.stroke = '#00ffcc';
    
    setTimeout(() => {
      statusDot.style.transform = 'none';
      progressRing.style.stroke = '#00ff66';
    }, 450);

    // Reset countdown
    secondsRemaining = intervalSec;
    updateCountdownUI();

  } else if (eventData.type === 'move-error') {
    logMessage.textContent = `❌ Error: ${eventData.error}`;
    logMessage.style.color = '#ff4757';
    setTimeout(() => {
      logMessage.style.color = '';
    }, 3000);
  } else if (eventData.type === 'move-stopped') {
    setUIActive(false);
  } else if (eventData.type === 'move-started') {
    // Synced activation from the Menu Bar Tray
    if (eventData.intervalMs) {
      intervalSec = Math.round(eventData.intervalMs / 1000);
      intervalSlider.value = intervalSec;
      updateIntervalLabel(intervalSec);
    }
    if (eventData.distancePx) {
      distancePx = eventData.distancePx;
      distanceSlider.value = distancePx;
      updateDistanceLabel(distancePx);
    }
    setUIActive(true);
  }
});

// Init
updateIntervalLabel(intervalSec);
updateDistanceLabel(distancePx);
setProgress(0);
