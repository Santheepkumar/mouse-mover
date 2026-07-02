// Mockup DOM Elements
const simToggle = document.getElementById('simToggle');
const simToggleLabel = document.getElementById('simToggleLabel');
const simDot = document.getElementById('simDot');
const simStatusText = document.getElementById('simStatusText');
const simTimer = document.getElementById('simTimer');
const simProgressRing = document.getElementById('simProgressRing');
const simMoveBtn = document.getElementById('simMoveBtn');
const mockupCursor = document.getElementById('mockupCursor');

// Simulation State
let isSimActive = false;
let simIntervalSec = 5; // Keep it fast for the web preview (5s vs 3m)
let simSecondsRemaining = 0;
let simTimerId = null;

const SIM_RING_CIRCUMFERENCE = 276.4; // 2 * pi * r (r = 44)

// Progress Ring Controller
function setSimProgress(percent) {
  const offset = SIM_RING_CIRCUMFERENCE - (percent / 100) * SIM_RING_CIRCUMFERENCE;
  simProgressRing.style.strokeDashoffset = offset;
}

// Simulated Cursor Movement Animation
function triggerCursorAnimation() {
  // Move the fake cursor on the page to simulate Mover activity
  mockupCursor.style.transform = 'translate(45px, -15px)';
  
  // Flash mockup success status
  simDot.style.transform = 'scale(1.5)';
  simProgressRing.style.stroke = '#00ffcc';
  
  setTimeout(() => {
    // Return cursor to normal position
    mockupCursor.style.transform = 'translate(0, 0)';
    simDot.style.transform = 'none';
    simProgressRing.style.stroke = '#00ff66';
  }, 120);
}

// Countdown Engine
function startSimCountdown() {
  stopSimCountdown();
  simSecondsRemaining = simIntervalSec;
  updateSimCountdownUI();

  simTimerId = setInterval(() => {
    simSecondsRemaining--;
    if (simSecondsRemaining < 0) {
      triggerCursorAnimation();
      simSecondsRemaining = simIntervalSec;
    }
    updateSimCountdownUI();
  }, 1000);
}

function stopSimCountdown() {
  if (simTimerId) {
    clearInterval(simTimerId);
    simTimerId = null;
  }
  simSecondsRemaining = 0;
  simTimer.textContent = '--';
  setSimProgress(0);
}

function updateSimCountdownUI() {
  simTimer.textContent = simSecondsRemaining.toString();
  const percent = (simSecondsRemaining / simIntervalSec) * 100;
  setSimProgress(percent);
}

// State Updater
function setSimActive(active) {
  isSimActive = active;
  simToggle.checked = active;
  
  if (active) {
    simDot.className = 'status-dot active';
    simStatusText.textContent = 'Mover Active';
    simToggleLabel.textContent = 'Mover Enabled';
    simMoveBtn.disabled = false;
    startSimCountdown();
  } else {
    simDot.className = 'status-dot idled';
    simStatusText.textContent = 'System Idle';
    simToggleLabel.textContent = 'Activate Mover';
    simMoveBtn.disabled = true;
    stopSimCountdown();
  }
}

// Event Listeners
simToggle.addEventListener('change', (e) => {
  setSimActive(e.target.checked);
});

simMoveBtn.addEventListener('click', () => {
  if (isSimActive) {
    triggerCursorAnimation();
    simSecondsRemaining = simIntervalSec;
    updateSimCountdownUI();
  }
});

// Initialization
setSimActive(false);
setSimProgress(0);
