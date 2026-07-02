const robot = require('robotjs');

const JIGGLE_PX = 200; // pixels to move (visible on any display)
const INTERVAL_MS = 180000; // jiggle every 1 minute (240000 = 4 min)

setInterval(() => {
  const pos = robot.getMousePos();
  robot.moveMouse(pos.x + JIGGLE_PX, pos.y);
  setTimeout(() => robot.moveMouse(pos.x, pos.y), 80);
}, INTERVAL_MS);

