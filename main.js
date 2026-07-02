const {
  app,
  BrowserWindow,
  ipcMain,
  Tray,
  Menu,
  nativeImage,
} = require('electron');
const path = require('path');
const fs = require('fs');
const { exec } = require('child_process');

let mainWindow = null;
let moverTimer = null;
let tray = null;

// Default configuration settings
let currentIntervalMs = 180000;
let currentDistancePx = 200;


function createWindow() {
  if (mainWindow) {
    mainWindow.show();
    return;
  }

  mainWindow = new BrowserWindow({
    width: 380,
    height: 560,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    title: 'Mouse Mover',
    icon: path.join(__dirname, 'icon.png'),
    titleBarStyle: 'hiddenInset', // beautiful native window control overlay on macOS
    backgroundColor: '#0c0d12',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile('index.html');

  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// System Tray Setup
function createTray() {
  const iconPath = path.join(__dirname, 'iconTemplate.png');
  const icon = nativeImage.createFromPath(iconPath);
  icon.setTemplateImage(true); // Supports dark/light menu bars automatically on macOS

  tray = new Tray(icon);
  tray.setToolTip('Mouse Mover');

  updateTrayMenu();

  // Double click tray icon to restore window (primarily Windows)
  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show();
    } else {
      createWindow();
    }
  });
}

function updateTrayMenu() {
  if (!tray) return;

  const isRunning = moverTimer !== null;

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Mouse Mover',
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Active',
      type: 'checkbox',
      checked: isRunning,
      click: () => {
        if (isRunning) {
          stopMover();
          if (mainWindow) {
            mainWindow.webContents.send('mover:event', {
              type: 'move-stopped',
            });
          }
        } else {
          startMover(currentIntervalMs, currentDistancePx);
          if (mainWindow) {
            mainWindow.webContents.send('mover:event', {
              type: 'move-started',
              intervalMs: currentIntervalMs,
              distancePx: currentDistancePx,
            });
          }
        }
      },
    },
    {
      label: 'Move Cursor Now',
      enabled: isRunning,
      click: () => {
        triggerManualMove();
      },
    },
    { type: 'separator' },
    {
      label: 'Open Settings Panel',
      click: () => {
        if (mainWindow) {
          mainWindow.show();
        } else {
          createWindow();
        }
      },
    },
    {
      label: 'Quit',
      click: () => {
        stopMover();
        app.isQuitting = true;
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
}

function executeMoveCommand(distancePx) {
  let cmd = '';
  if (process.platform === 'darwin') {
    cmd = `swift -e "import Foundation; import CoreGraphics; let pos = CGEvent(source: nil)!.location; CGWarpMouseCursorPosition(CGPoint(x: pos.x + ${distancePx}, y: pos.y)); Thread.sleep(forTimeInterval: 0.08); CGWarpMouseCursorPosition(pos)"`;
  } else if (process.platform === 'win32') {
    cmd = `powershell -Command "Add-Type -AssemblyName System.Windows.Forms; $p = [System.Windows.Forms.Cursor]::Position; [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(($p.X + ${distancePx}), $p.Y); Start-Sleep -m 80; [System.Windows.Forms.Cursor]::Position = $p"`;
  } else {
    console.warn(`[Main] Cursor moving not supported on platform: ${process.platform}`);
    return;
  }

  exec(cmd, (error, stdout, stderr) => {
    if (error) {
      console.error('[Main] Move command execution failed:', error);
      if (mainWindow) {
        mainWindow.webContents.send('mover:event', {
          type: 'move-error',
          error: error.message
        });
      }
      return;
    }

    if (mainWindow) {
      mainWindow.webContents.send('mover:event', {
        type: 'move-success',
        timestamp: Date.now()
      });
    }
  });
}

function startMover(intervalMs, distancePx) {
  currentIntervalMs = intervalMs;
  currentDistancePx = distancePx;

  if (moverTimer) {
    clearInterval(moverTimer);
  }

  console.log(`[Main] Starting Mover timer. Interval: ${intervalMs}ms, Distance: ${distancePx}px`);

  moverTimer = setInterval(() => {
    executeMoveCommand(currentDistancePx);
  }, intervalMs);

  updateTrayMenu();
}

function stopMover() {
  if (moverTimer) {
    console.log('[Main] Stopping Mover timer...');
    clearInterval(moverTimer);
    moverTimer = null;
    updateTrayMenu();
  }
}

function updateMover(intervalMs, distancePx) {
  const needsRestart = (intervalMs !== currentIntervalMs);

  currentIntervalMs = intervalMs;
  currentDistancePx = distancePx;

  console.log(`[Main] Updating Mover settings. Interval: ${intervalMs}ms, Distance: ${distancePx}px`);

  if (moverTimer && needsRestart) {
    startMover(intervalMs, distancePx);
  }
}

function triggerManualMove() {
  console.log('[Main] Triggering manual cursor move');
  executeMoveCommand(currentDistancePx);
}

// IPC Handlers
ipcMain.handle('mover:start', (event, { intervalMs, distancePx }) => {
  startMover(intervalMs, distancePx);
  return { success: true };
});

ipcMain.handle('mover:stop', () => {
  stopMover();
  return { success: true };
});

ipcMain.handle('mover:update', (event, { intervalMs, distancePx }) => {
  updateMover(intervalMs, distancePx);
  return { success: true };
});

ipcMain.handle('mover:trigger', () => {
  triggerManualMove();
  return { success: true };
});

// App lifecycle hooks
app.whenReady().then(() => {
  if (process.platform === 'darwin') {
    try {
      const iconPath = path.join(__dirname, 'icon.png');
      if (fs.existsSync(iconPath)) {
        app.dock.setIcon(iconPath);
      }
    } catch (e) {
      console.warn('[Main] Failed to set dock icon:', e);
    }
  }
  createTray();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    } else if (mainWindow) {
      mainWindow.show();
    }
  });
});

app.on('window-all-closed', () => {
  // Overridden: keep app running in the system tray
});

app.on('before-quit', () => {
  app.isQuitting = true;
  stopMover();
});

