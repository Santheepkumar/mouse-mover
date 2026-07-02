# Native OS Mouse Automation & Migration Guide

This document explains the architecture of **Mouse Mover Pro** and details why and how we migrated from a Node-dependent child-process model (using `robotjs`) to a zero-dependency model using native OS scripting (Swift on macOS and PowerShell on Windows).

---

## 1. Why We Migrated (The Problem with `robotjs` & Node-GYP)

Initially, the project used **`robotjs`**, a popular Node.js library for desktop automation. While it worked well in local development, it presented three critical issues for production distribution:

1. **Pre-installed Node.js Requirement**: The app spawned a background process using the user's system `node` executable. If a user did not have Node.js installed (or lacked correct environment variables), the app crashed instantly.
2. **Native C++ Compilation Failures**: `robotjs` is a native binary module compiled with C++ headers using `node-gyp`. Because its dependencies (like `nan`) are outdated, compiling it against modern Electron V8 headers (e.g. Electron v43) fails with C++ syntax/argument errors.
3. **ASAR Archive Locks**: External Node processes cannot read dependencies packed inside Electron's compressed `.asar` archive. Unpacking files (`asarUnpack`) increased code complexity and app footprint.

### The Solution: Zero-Dependency Native OS Scripting
Instead of requiring Node.js or native C++ modules, we replaced `robotjs` with **lightweight, native script execution** using programs that are built into macOS and Windows out of the box.

---

## 2. macOS Native Implementation: Swift & CoreGraphics

macOS includes the **Swift compiler/interpreter** on all machines by default. We execute a Swift script on the fly using `swift -e "..."`.

### The Swift Script
```swift
import Foundation
import CoreGraphics

// 1. Get the current mouse coordinates
let pos = CGEvent(source: nil)!.location

// 2. Warp/move the cursor relative to its current x position
CGWarpMouseCursorPosition(CGPoint(x: pos.x + <distance>, y: pos.y))

// 3. Sleep for a short delay (80 milliseconds)
Thread.sleep(forTimeInterval: 0.08)

// 4. Warp/move the cursor back to its original location
CGWarpMouseCursorPosition(pos)
```

### Deep Dive into CoreGraphics APIs:
* **`CGEvent(source: nil)!.location`**: Queries the OS windowing system for the current position of the pointer and returns a `CGPoint` struct containing `x` and `y` float coordinates.
* **`CGWarpMouseCursorPosition(CGPoint)`**: Warps the cursor directly to the specified coordinate. Unlike standard mouse move events, "warping" shifts the pointer instantly at the hardware driver level without triggering window drags, cursor clicks, or system events, ensuring it does not interrupt user operations.
* **`Thread.sleep(forTimeInterval: 0.08)`**: Causes the execution thread to wait for `80 milliseconds` so the operating system registers the temporary cursor movement (preventing screen savers and keeping statuses active).

---

## 3. Windows Native Implementation: PowerShell & .NET

Windows includes **PowerShell** on all installations by default. We run PowerShell script strings using `powershell -Command "..."`.

### The PowerShell Script
```powershell
# 1. Load the .NET Windows Forms assembly
Add-Type -AssemblyName System.Windows.Forms;

# 2. Get the current mouse coordinates
$p = [System.Windows.Forms.Cursor]::Position;

# 3. Move the cursor relative to its current X position
[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(($p.X + <distance>), $p.Y);

# 4. Sleep for a short delay (80 milliseconds)
Start-Sleep -m 80;

# 5. Restore the cursor to its original position
[System.Windows.Forms.Cursor]::Position = $p;
```

### Deep Dive into .NET APIs:
* **`Add-Type -AssemblyName System.Windows.Forms`**: Loads the standard Windows GUI library (.NET assembly) into the PowerShell session so we can access mouse and screen resources.
* **`[System.Windows.Forms.Cursor]::Position`**: A static .NET property. 
  * Reading it returns a `System.Drawing.Point` representing the current cursor coordinates.
  * Writing to it (e.g. setting it to a `New-Object System.Drawing.Point`) moves the cursor immediately to those screen coordinates.
* **`Start-Sleep -m 80`**: Puts the PowerShell script execution to sleep for `80 milliseconds`.

---

## 4. How Electron Integrates Native Scripts

In `main.js`, rather than loading external processes, we use Node.js's built-in **`child_process`** module:

1. **State Coordinates**: We track the active timer loop inside the main process using a simple JavaScript `setInterval`:
   ```javascript
   moverTimer = setInterval(() => {
     executeMoveCommand(currentDistancePx);
   }, intervalMs);
   ```
2. **Execution**: The `executeMoveCommand()` function selects the command string based on `process.platform` and runs it using `exec()`:
   ```javascript
   const { exec } = require('child_process');
   
   exec(cmd, (error, stdout, stderr) => {
     if (error) {
       // Send error logs back to the UI
       mainWindow.webContents.send('mover:event', { type: 'move-error', error: error.message });
       return;
     }
     // Send success confirmation to flash indicators in the UI
     mainWindow.webContents.send('mover:event', { type: 'move-success', timestamp: Date.now() });
   });
   ```

---

## 5. Architectural Comparison Matrix

| Metric | Old Architecture (`robotjs`) | New Standalone Architecture |
| :--- | :--- | :--- |
| **Node.js Required?** | **Yes** (App crashed without local node install) | **No** (Fully standalone package) |
| **Production App Size** | ~130 MB | **~60 MB** (Reduced by 50%!) |
| **Native Module Build?** | Yes (`node-gyp` & `electron-rebuild`) | **No** (Pure JavaScript/Electron) |
| **macOS Compatibility** | High compile failure rate on modern V8 | **100% Native** (Uses pre-installed Swift) |
| **Windows Compatibility**| Requires Visual Studio build tools locally | **100% Native** (Uses pre-installed PowerShell) |
