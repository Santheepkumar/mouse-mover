const robot = require('robotjs');

// Parse initial arguments (fallback to defaults if not provided)
let intervalMs = parseInt(process.argv[2], 10) || 180000;
let distancePx = parseInt(process.argv[3], 10) || 200;

console.log(`[Mover Child] Started with interval: ${intervalMs}ms, distance: ${distancePx}px`);

let timerId = null;

function performMove() {
  try {
    const pos = robot.getMousePos();
    
    // Move the mouse relative to its current position
    robot.moveMouse(pos.x + distancePx, pos.y);
    
    // Short delay before moving it back to ensure the move is registered by OS/apps
    setTimeout(() => {
      try {
        robot.moveMouse(pos.x, pos.y);
        
        // Notify parent process that a move succeeded
        if (process.send) {
          process.send({ type: 'move-success', timestamp: Date.now() });
        }
      } catch (err) {
        console.error("[Mover Child] Error moving mouse back:", err);
      }
    }, 80);

  } catch (err) {
    console.error("[Mover Child] Error getting or moving mouse:", err);
    if (process.send) {
      process.send({ type: 'move-error', error: err.message });
    }
  }
}

// Start the schedule
function startTimer() {
  if (timerId) {
    clearInterval(timerId);
  }
  timerId = setInterval(performMove, intervalMs);
}

// Handle IPC messages from the parent Electron process
process.on('message', (msg) => {
  if (!msg) return;

  if (msg.type === 'trigger-move') {
    console.log('[Mover Child] Manual trigger requested');
    performMove();
  } else if (msg.type === 'update-settings') {
    const newInterval = parseInt(msg.intervalMs, 10);
    const newDistance = parseInt(msg.distancePx, 10);
    
    console.log(`[Mover Child] Config updated: interval=${newInterval}ms, distance=${newDistance}px`);
    
    let needsRestart = false;
    if (!isNaN(newInterval) && newInterval !== intervalMs) {
      intervalMs = newInterval;
      needsRestart = true;
    }
    if (!isNaN(newDistance)) {
      distancePx = newDistance;
    }
    
    if (needsRestart) {
      startTimer();
    }
  }
});

// Initial startup
startTimer();
