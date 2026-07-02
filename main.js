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
const { spawn } = require('child_process');

let mainWindow = null;
let childProcess = null;
let tray = null;

// Default configuration settings
let currentIntervalMs = 180000;
let currentDistancePx = 200;

// Dynamically locate the system Node.js binary
function getNodePath() {
  if (process.platform === 'win32') {
    try {
      const whereOutput = require('child_process')
        .execSync('where node', { encoding: 'utf8' })
        .trim()
        .split('\r\n');
      if (whereOutput[0] && fs.existsSync(whereOutput[0])) {
        return whereOutput[0];
      }
    } catch (e) {
      console.warn("[Main] 'where node' failed, falling back to 'node'");
    }
    return 'node';
  } else {
    // macOS / Linux
    try {
      const whichOutput = require('child_process')
        .execSync('which node', { encoding: 'utf8' })
        .trim();
      if (whichOutput && fs.existsSync(whichOutput)) {
        return whichOutput;
      }
    } catch (e) {
      console.warn("[Main] 'which node' failed, scanning common paths");
    }

    const commonPaths = [
      '/opt/homebrew/bin/node',
      '/usr/local/bin/node',
      '/usr/bin/node',
    ];
    for (const p of commonPaths) {
      if (fs.existsSync(p)) return p;
    }
    return 'node';
  }
}

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

  const isRunning = childProcess !== null;

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

function startMover(intervalMs, distancePx) {
  currentIntervalMs = intervalMs;
  currentDistancePx = distancePx;

  if (childProcess) {
    console.log(
      '[Main] Mover child process already running, updating settings instead',
    );
    updateMover(intervalMs, distancePx);
    return;
  }

  const nodePath = getNodePath();
  let childPath = path.join(__dirname, 'mover-child.js');
  let cwdPath = __dirname;

  // Resolve to unpacked directory if running inside an ASAR package
  if (childPath.includes('app.asar')) {
    childPath = childPath.replace('app.asar', 'app.asar.unpacked');
    cwdPath = cwdPath.replace('app.asar', 'app.asar.unpacked');
  }

  console.log(
    `[Main] Spawning child: ${nodePath} ${childPath} ${intervalMs} ${distancePx}`,
  );

  try {
    childProcess = spawn(
      nodePath,
      [childPath, intervalMs.toString(), distancePx.toString()],
      {
        cwd: cwdPath,
        stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
      },
    );

    childProcess.on('message', (msg) => {
      if (!msg) return;

      // Forward child messages to UI
      if (mainWindow) {
        mainWindow.webContents.send('mover:event', msg);
      }
    });

    childProcess.stdout.on('data', (data) => {
      console.log(`[Child STDOUT] ${data.toString().trim()}`);
    });

    childProcess.stderr.on('data', (data) => {
      console.error(`[Child STDERR] ${data.toString().trim()}`);
    });

    childProcess.on('error', (err) => {
      console.error('[Main] Error spawning child process:', err);
      if (mainWindow) {
        mainWindow.webContents.send('mover:event', {
          type: 'move-error',
          error: `Spawn failed: ${err.message}`,
        });
      }
      childProcess = null;
      updateTrayMenu();
    });

    childProcess.on('exit', (code, signal) => {
      console.log(
        `[Main] Child process exited: code=${code}, signal=${signal}`,
      );
      childProcess = null;
      updateTrayMenu();
      if (mainWindow) {
        mainWindow.webContents.send('mover:event', { type: 'move-stopped' });
      }
    });

    updateTrayMenu();
  } catch (err) {
    console.error('[Main] Exception spawning child process:', err);
    if (mainWindow) {
      mainWindow.webContents.send('mover:event', {
        type: 'move-error',
        error: err.message,
      });
    }
  }
}

function stopMover() {
  if (childProcess) {
    console.log('[Main] Stopping child process...');
    childProcess.kill('SIGTERM');
    childProcess = null;
    updateTrayMenu();
  }
}

function updateMover(intervalMs, distancePx) {
  currentIntervalMs = intervalMs;
  currentDistancePx = distancePx;

  if (childProcess && childProcess.connected) {
    childProcess.send({
      type: 'update-settings',
      intervalMs,
      distancePx,
    });
  }
}

function triggerManualMove() {
  if (childProcess && childProcess.connected) {
    childProcess.send({ type: 'trigger-move' });
  }
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

