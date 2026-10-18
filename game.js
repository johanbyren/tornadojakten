/**
 * Tornadojakten
 * Local two-player game. Open index.html in a browser.
 *
 * Human: WASD and Left Shift or F to dash, or arrow keys and Space to dash. Collect every coin to win.
 * Tornado: arrow keys, Right Shift to hop, Space to shoot a small whirlwind.
 * If the human uses a gamepad, tornado hop is Space and shoot is Command or Alt.
 * The shot flies until it hits something. A hit human is pulled into the tornado.
 * A hit tree or house is sucked in, then flung off the board.
 * Three catches and the tornado wins. There is no clock.
 */
(function () {
  "use strict";

  const CONFIG = {
    tile: 16,
    cols: 32,
    rows: 18,
    humanSpeed: 96,
    humanRadius: 5,
    tornadoRadius: 10,
    catchDistance: 15,
    dashSpeed: 290,
    dashTime: 0.16,
    dashCharges: 2,
    dashRecharge: 2.8,
    smashTime: 0.48,
    respawnTime: 5,
    invulnTime: 1.6,
    hopTime: 0.95,
    hopMax: 1.75,
    hopCooldown: 2.6,
    hopSpeed: 0.62,
    shotSpeed: 168,
    shotRadius: 6,
    coinTarget: 16,
  };

  const TILE = CONFIG.tile;
  const COLS = CONFIG.cols;
  const ROWS = CONFIG.rows;
  const WORLD_W = COLS * TILE;
  const WORLD_H = ROWS * TILE;
  const SKY = 48;
  const MAP_IDS = ["dalen", "korsningen", "fickorna", "broarna"];

  const params = new URLSearchParams(location.search);
  const DEBUG = params.has("debug");
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const PAL = {
    h: "#5c3a22",
    k: "#e0a15a",
    s: "#ffd2b5",
    e: "#2b241c",
    w: "#ffffff",
    r: "#ff9eb0",
    b: "#1f8eab",
    c: "#5ad4ef",
    u: "#ffd34a",
    d: "#e6ae22",
    n: "#3e2c22",
  };

  const TORSO = art([
    "...hhhhhh.....",
    "..hhkkkkhh....",
    ".hhkssssskhh..",
    ".hksewwewwskh.",
    ".hksssssssskh.",
    ".hhkssrrsskhh.",
    "..hhsssssshh..",
    "....ssss......",
    "...cccccc.....",
    "..ssccccss....",
    "..bbccccbb....",
    "...uuuuuu.....",
  ]);
  const LEGS = [
    art(["..uu....uu....", "..nn....nn....", ".nnn....nnn..."]),
    art([".uu......uu...", ".nn......nn...", "nnn......nnn.."]),
  ];

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  canvas.width = WORLD_W;
  canvas.height = WORLD_H + SKY;

  const el = {
    hearts: document.getElementById("hearts"),
    timer: document.getElementById("timer"),
    score: document.getElementById("score"),
    coins: document.getElementById("coins"),
    modeNote: document.getElementById("mode-note"),
    hud: document.getElementById("hud"),
    help: document.getElementById("help"),
    menu: document.getElementById("menu"),
    end: document.getElementById("end"),
    endTitle: document.getElementById("end-title"),
    endBody: document.getElementById("end-body"),
    countdown: document.getElementById("countdown"),
    pause: document.getElementById("pause"),
    ret: document.getElementById("return-banner"),
    shout: document.getElementById("shout"),
    plus: document.getElementById("plus"),
    tagH: document.getElementById("tag-h"),
    tagT: document.getElementById("tag-t"),
    sound: document.getElementById("sound-btn"),
    ruleLives: null,
    livesVal: document.getElementById("lives-val"),
    mapHint: document.getElementById("map-hint"),
    padNote: document.getElementById("pad-note"),
    padBanner: document.getElementById("pad-banner"),
    helpHuman: document.getElementById("help-human"),
    helpTornado: document.getElementById("help-tornado"),
  };

  const keys = new Set();
  let mode = "menu";
  let vsAI = false;
  let lives = 3;
  let score = 0;
  let timeLeft = 60;
  let animT = 0;
  let playT = 0;
  let shake = 0;
  let freeze = 0;
  let result = null;
  let human = null;
  let tornado = null;
  let props = [];
  let particles = [];
  let decals = [];
  let ghosts = [];
  let swirls = [];
  let wake = [];
  let tornadoFit = [];
  let aiPath = [];
  let aiTimer = 0;
  let dashHeld = false;
  let jumpHeld = false;
  let coins = [];
  let coinsGot = 0;
  let shots = [];
  let shotHeld = false;
  const padBind = { human: null, tornado: null };
  const padHeld = { dash: false, hop: false, shot: false, start: false };
  const padCache = new Map();
  let padsThisFrame = [];
  let padBindFrame = false;
  let countN = 3;
  let countBeatAt = 0;
  let shoutT = 0;
  let shoutText = "";
  let plusT = 0;
  let settings = loadSettings();
  let audioCtx = null;
  let last = performance.now();

  function art(lines) {
    const w = Math.max(...lines.map((line) => line.length));
    return lines.map((line) => line.padEnd(w, "."));
  }

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  function hash(c, r) {
    let n = Math.imul(c | 0, 374761393) + Math.imul(r | 0, 668265263);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  }

  function loadSettings() {
    const fallback = {
      lives: 3, wind: "lagom", sound: true, map: "dalen",
      humanControl: "keys", tornadoControl: "keys",
      humanKeys: "wasd", tornadoKeys: "arrows",
    };
    try {
      const raw = localStorage.getItem("tornadojakten");
      if (!raw) return fallback;
      const saved = JSON.parse(raw);
      const humanControl = saved.humanControl === "pad" ? "pad" : "keys";
      const tornadoControl = saved.tornadoControl === "pad" ? "pad" : "keys";
      let humanKeys = saved.humanKeys === "arrows" ? "arrows" : "wasd";
      let tornadoKeys = saved.tornadoKeys === "wasd" ? "wasd" : "arrows";
      if (humanControl === "keys" && tornadoControl === "keys" && humanKeys === tornadoKeys) {
        tornadoKeys = humanKeys === "wasd" ? "arrows" : "wasd";
      }
      return {
        lives: clamp(saved.lives | 0, 1, 5) || 3,
        wind: ["lugn", "lagom", "vild"].includes(saved.wind) ? saved.wind : "lagom",
        sound: saved.sound !== false,
        map: MAP_IDS.includes(saved.map) ? saved.map : "dalen",
        humanControl,
        tornadoControl,
        humanKeys,
        tornadoKeys,
      };
    } catch (err) {
      return fallback;
    }
  }

  function saveSettings() {
    localStorage.setItem("tornadojakten", JSON.stringify(settings));
  }

  function windMult() {
    if (settings.wind === "lugn") return 0.98;
    if (settings.wind === "vild") return 1.22;
    return 1.09;
  }

  function tornadoSpeed() {
    const base = CONFIG.humanSpeed * windMult();
    if (vsAI) return base * (settings.wind === "vild" ? 0.94 : 0.9);
    return base;
  }

  function currentMap() {
    return MAPS.find((map) => map.id === settings.map) || MAPS[0];
  }

  function mapTheme() {
    return currentMap().theme || "meadow";
  }

  function isMountain(c, r) {
    if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return true;
    if (c === 0 || r === 0 || c === COLS - 1 || r === ROWS - 1) return true;
    return currentMap().solid(c, r);
  }

  function inEllipse(c, r, cx, cy, rx, ry) {
    const dx = (c + 0.5 - cx) / rx;
    const dy = (r + 0.5 - cy) / ry;
    return dx * dx + dy * dy <= 1;
  }

  const MAPS = [
    {
      id: "dalen",
      name: "Dalen",
      hint: "En ås med smala springor, och en gömma längst ner.",
      solid(c, r) {
        if (r === 7 && c >= 1 && c <= 22 && c !== 8 && c !== 15) return true;
        if (c >= 1 && c <= 8 && r >= 11 && r <= 15) {
          const interior = c >= 2 && c <= 7 && r >= 12 && r <= 14;
          const door = r === 11 && c >= 5 && c <= 7;
          const crack = r === 15 && c === 3;
          if (!interior && !door && !crack) return true;
        }
        if (inEllipse(c, r, 26.5, 3.2, 2.4, 1.55)) return true;
        if (inEllipse(c, r, 20, 13.2, 2.5, 1.7)) return true;
        if (inEllipse(c, r, 12.6, 4.1, 1.25, 1.05)) return true;
        return false;
      },
      path(c, r) {
        if (r === 8 || r === 16) return true;
        if (c === 29 && r >= 1 && r <= 16) return true;
        if (c === 9 && r >= 8 && r <= 16) return true;
        if (r === 11 && c >= 5 && c <= 7) return true;
        return false;
      },
      houses: [[2, 2], [16, 2], [3, 9], [23, 9], [14, 14], [26, 12]],
      trees: [
        [6, 2], [7, 4], [10, 3], [11, 5], [19, 2], [21, 5], [4, 5],
        [9, 10], [18, 8], [29, 8], [10, 13], [6, 16], [16, 11],
        [24, 15], [29, 14], [22, 10], [8, 3], [15, 16], [12, 12], [27, 6],
      ],
      coins: [[4, 13], [5, 3], [18, 5], [28, 6]],
      spawns: [[3, 3], [18, 3], [29, 5], [4, 13], [11, 16], [24, 16], [29, 14], [10, 9], [6, 5]],
      humanStart: [11, 16],
      tornadoStart: [22, 4],
      cracks: [[8, 7], [15, 7], [3, 15]],
      doors: [[6, 11]],
    },
    {
      id: "korsningen",
      name: "Korsningen",
      hint: "Ett kors av berg. Springorna är genvägar, portarna är breda.",
      solid(c, r) {
        const horiz = r === 8 && c >= 1 && c <= 30 && c !== 5 && c !== 27 && !(c >= 11 && c <= 13);
        const vert = c === 16 && r >= 1 && r <= 16 && r !== 3 && r !== 8 && !(r >= 13 && r <= 15);
        if (inEllipse(c, r, 5.2, 4.2, 2.1, 1.45)) return true;
        if (inEllipse(c, r, 26.2, 13.6, 2.2, 1.5)) return true;
        return horiz || vert;
      },
      path(c, r) {
        if (r === 3 || r === 12) return true;
        if ((c === 8 || c === 24) && r !== 8) return true;
        if (r === 8 && c >= 11 && c <= 13) return true;
        if (c === 16 && r >= 13 && r <= 15) return true;
        return false;
      },
      houses: [[2, 2], [20, 2], [3, 10], [22, 10], [8, 14], [26, 5]],
      trees: [
        [8, 2], [12, 4], [22, 5], [28, 3], [4, 6], [10, 6],
        [2, 12], [8, 11], [12, 14], [20, 13], [24, 15], [28, 10],
        [14, 2], [18, 5], [6, 15], [18, 11],
      ],
      coins: [[4, 3], [24, 3], [4, 14], [24, 12]],
      spawns: [[3, 3], [27, 3], [4, 5], [27, 6], [3, 14], [10, 14], [22, 14], [28, 11], [20, 5]],
      humanStart: [27, 3],
      tornadoStart: [4, 13],
      cracks: [[5, 8], [27, 8], [16, 3]],
      doors: [[12, 8], [16, 14]],
    },
    {
      id: "fickorna",
      name: "Fickorna",
      hint: "Två gömmor med smala dörrar. Tornadon får gå runt.",
      solid(c, r) {
        const inLeft = c >= 1 && c <= 7 && r >= 2 && r <= 8;
        const leftInside = c >= 2 && c <= 6 && r >= 3 && r <= 7;
        const leftDoor = c === 7 && r === 5;
        const inRight = c >= 23 && c <= 30 && r >= 9 && r <= 16;
        const rightInside = c >= 24 && c <= 29 && r >= 10 && r <= 15;
        const rightDoor = c === 23 && r === 12;
        if (leftDoor || rightDoor) return false;
        if (inLeft && !leftInside) return true;
        if (inRight && !rightInside) return true;
        if (inEllipse(c, r, 16, 6.2, 2.3, 1.6)) return true;
        if (inEllipse(c, r, 11.5, 14.2, 1.6, 1.15)) return true;
        return false;
      },
      path(c, r) {
        if (r === 9 || r === 16) return true;
        if (c === 15 && r >= 1 && r <= 16) return true;
        if (c === 7 && r === 5) return true;
        if (c === 23 && r === 12) return true;
        return false;
      },
      houses: [[3, 3], [25, 11], [10, 2], [19, 10], [18, 14]],
      trees: [
        [4, 6], [5, 4], [26, 12], [28, 14], [9, 4], [12, 8],
        [20, 3], [14, 11], [8, 12], [21, 7], [28, 5], [6, 15],
        [11, 16], [17, 12], [9, 7],
      ],
      coins: [[4, 5], [3, 6], [26, 12], [27, 14]],
      spawns: [[4, 5], [26, 12], [14, 15], [18, 3], [10, 10], [20, 8], [8, 14], [28, 4], [12, 3]],
      humanStart: [14, 15],
      tornadoStart: [18, 3],
      cracks: [[7, 5], [23, 12]],
      doors: [],
    },
    {
      id: "broarna",
      name: "Broarna",
      hint: "Två bergsväggar. Broarna är breda, springorna är smala.",
      solid(c, r) {
        const upperCrack = c === 9 && (r === 5 || r === 6);
        const upperDoor = c >= 20 && c <= 22 && (r === 5 || r === 6);
        const lowerCrack = c === 23 && (r === 11 || r === 12);
        const lowerDoor = c >= 5 && c <= 7 && (r === 11 || r === 12);
        if (upperCrack || upperDoor || lowerCrack || lowerDoor) return false;
        if ((r === 5 || r === 6) && c >= 1 && c <= 30) return true;
        if ((r === 11 || r === 12) && c >= 1 && c <= 30) return true;
        if (inEllipse(c, r, 15.5, 2.6, 2, 1.15)) return true;
        if (inEllipse(c, r, 8, 15.2, 2.1, 1.2)) return true;
        if (inEllipse(c, r, 27.2, 8.6, 1.7, 1.25)) return true;
        return false;
      },
      path(c, r) {
        if (r === 3 || r === 9 || r === 15) return true;
        if (c === 14) return true;
        if ((r === 5 || r === 6) && c >= 20 && c <= 22) return true;
        if ((r === 11 || r === 12) && c >= 5 && c <= 7) return true;
        return false;
      },
      houses: [[2, 2], [24, 2], [14, 8], [26, 14], [3, 14], [20, 8]],
      trees: [
        [6, 2], [10, 3], [18, 2], [28, 3], [4, 8], [8, 9],
        [12, 8], [18, 9], [24, 9], [29, 8], [10, 14], [16, 15],
        [22, 14], [28, 15], [7, 4], [25, 4],
      ],
      coins: [[4, 3], [16, 9], [20, 15], [28, 3]],
      spawns: [[4, 3], [28, 3], [4, 9], [16, 9], [28, 9], [4, 15], [16, 15], [27, 15], [12, 3]],
      humanStart: [27, 15],
      tornadoStart: [4, 3],
      cracks: [[9, 5], [9, 6], [23, 11], [23, 12]],
      doors: [[21, 5], [21, 6], [6, 11], [6, 12]],
    },
    {
      id: "oknen",
      name: "Öknen",
      hint: "Sanddyner, kaktusar, kameler och tält. En oas med vatten.",
      theme: "desert",
      solid(c, r) {
        if (r === 8 && c >= 1 && c <= 30 && c !== 6 && c !== 24 && !(c >= 14 && c <= 16)) return true;
        if (inEllipse(c, r, 5.2, 3.4, 2.2, 1.4)) return true;
        if (inEllipse(c, r, 26.5, 12.8, 2.3, 1.5)) return true;
        if (inEllipse(c, r, 18.5, 4.2, 1.3, 1.05)) return true;
        return false;
      },
      path(c, r) {
        if (r === 4 || r === 12 || r === 16) return true;
        if (c === 10 && r !== 8) return true;
        if (r === 8 && c >= 14 && c <= 16) return true;
        return false;
      },
      oasis(c, r) {
        return c >= 3 && c <= 7 && r >= 13 && r <= 15;
      },
      houses: [],
      trees: [],
      cacti: [
        [3, 6], [7, 3], [11, 5], [15, 2], [19, 6], [25, 2], [29, 3],
        [1, 5], [6, 11], [10, 10], [14, 12], [19, 14], [25, 9], [29, 11],
        [13, 6], [16, 15], [30, 10], [8, 6], [20, 10], [1, 13], [27, 6],
      ],
      camels: [[12, 3], [21, 6], [4, 12], [17, 11], [8, 14], [23, 15]],
      tents: [[9, 1], [22, 1], [2, 10], [11, 13], [28, 5]],
      monsters: [],
      coins: [[4, 14], [6, 14], [12, 2], [26, 6], [20, 15], [9, 6]],
      spawns: [[29, 15], [2, 6], [12, 5], [28, 3], [4, 11], [16, 12], [22, 10], [8, 2], [26, 16]],
      humanStart: [29, 15],
      tornadoStart: [2, 6],
      cracks: [[6, 8], [24, 8]],
      doors: [[15, 8]],
    },
    {
      id: "vulkanen",
      name: "Vulkanen",
      hint: "Vulkaner och lava. Springan är smal, stenbron är bred.",
      theme: "volcano",
      solid(c, r) {
        if (inEllipse(c, r, 8, 3.2, 2.6, 1.7)) return true;
        if (inEllipse(c, r, 24, 3.4, 2.4, 1.6)) return true;
        if (inEllipse(c, r, 16, 10.2, 2.2, 1.5)) return true;
        if (inEllipse(c, r, 6.5, 14.5, 2, 1.3)) return true;
        if (inEllipse(c, r, 26.5, 14.2, 2.2, 1.4)) return true;
        return false;
      },
      lava(c, r) {
        const upperBridge = c >= 13 && c <= 15 && (r === 6 || r === 7);
        const upperCrack = c === 4 && (r === 6 || r === 7);
        const lowerBridge = c >= 20 && c <= 22 && r === 12;
        const lowerCrack = c === 9 && r === 12;
        if (upperBridge || upperCrack || lowerBridge || lowerCrack) return false;
        if ((r === 6 || r === 7) && c >= 1 && c <= 30) return true;
        if (r === 12 && c >= 1 && c <= 30) return true;
        return false;
      },
      path(c, r) {
        if (r === 4 || r === 9 || r === 15) return true;
        if (c === 18 && r !== 6 && r !== 7 && r !== 12) return true;
        if ((r === 6 || r === 7) && c >= 13 && c <= 15) return true;
        if (r === 12 && c >= 20 && c <= 22) return true;
        return false;
      },
      houses: [],
      trees: [],
      cacti: [],
      camels: [],
      tents: [],
      monsters: [
        [1, 2], [12, 3], [28, 2], [18, 4],
        [1, 9], [10, 9], [20, 9], [27, 9],
        [1, 15], [11, 15], [22, 14],
      ],
      coins: [[8, 9], [12, 4], [28, 4], [10, 10], [22, 10], [2, 15], [14, 15], [22, 15]],
      spawns: [[2, 4], [29, 10], [12, 4], [28, 9], [2, 10], [11, 14], [22, 15], [18, 2], [10, 15]],
      humanStart: [2, 4],
      tornadoStart: [29, 10],
      cracks: [[4, 6], [4, 7], [9, 12]],
      doors: [[14, 6], [14, 7], [21, 12]],
    },
  ];

  function isLava(c, r) {
    const map = currentMap();
    if (!map.lava) return false;
    if (c < 0 || r < 0 || c >= COLS || r >= ROWS) return false;
    return map.lava(c, r);
  }

  function isPath(c, r) {
    if (isMountain(c, r) || isLava(c, r)) return false;
    return currentMap().path(c, r);
  }

  function circleHitsRect(cx, cy, radius, x, y, w, h) {
    const nx = clamp(cx, x, x + w);
    const ny = clamp(cy, y, y + h);
    const dx = cx - nx;
    const dy = cy - ny;
    return dx * dx + dy * dy < radius * radius;
  }

  function circleHitsMountain(x, y, radius) {
    const c0 = Math.floor((x - radius) / TILE);
    const c1 = Math.floor((x + radius) / TILE);
    const r0 = Math.floor((y - radius) / TILE);
    const r1 = Math.floor((y + radius) / TILE);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        if (!isMountain(c, r) && !isLava(c, r)) continue;
        if (circleHitsRect(x, y, radius, c * TILE, r * TILE, TILE, TILE)) return true;
      }
    }
    return false;
  }

  function propRect(p) {
    return { x: p.c * TILE, y: p.r * TILE, w: p.w * TILE, h: p.h * TILE };
  }

  function circleHitsProps(x, y, radius, pad, solidOnly) {
    const extra = pad || 0;
    const hit = [];
    for (const p of props) {
      if (!p.alive || p.pulling) continue;
      if (solidOnly && p.kind === "monster") continue;
      const rect = propRect(p);
      if (circleHitsRect(x, y, radius + extra, rect.x, rect.y, rect.w, rect.h)) hit.push(p);
    }
    return hit;
  }

  function blocked(x, y, radius) {
    return circleHitsMountain(x, y, radius) || circleHitsProps(x, y, radius, 0, true).length > 0;
  }

  function moveCircle(x, y, dx, dy, radius) {
    let nx = x;
    let ny = y;
    const dist = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(dist / 2));
    for (let i = 0; i < steps; i++) {
      const tx = nx + dx / steps;
      if (!blocked(tx, ny, radius)) nx = tx;
      const ty = ny + dy / steps;
      if (!blocked(nx, ty, radius)) ny = ty;
    }
    return { x: nx, y: ny };
  }

  function computeTornadoFit() {
    tornadoFit = [];
    for (let r = 0; r < ROWS; r++) {
      tornadoFit[r] = [];
      for (let c = 0; c < COLS; c++) {
        const x = (c + 0.5) * TILE;
        const y = (r + 0.5) * TILE;
        tornadoFit[r][c] = !circleHitsMountain(x, y, CONFIG.tornadoRadius);
      }
    }
  }

  function findClearNear(c, r, radius) {
    const body = radius || CONFIG.humanRadius;
    for (let rad = 0; rad < 10; rad++) {
      for (let y = r - rad; y <= r + rad; y++) {
        for (let x = c - rad; x <= c + rad; x++) {
          if (Math.abs(x - c) !== rad && Math.abs(y - r) !== rad && rad !== 0) continue;
          const px = (x + 0.5) * TILE;
          const py = (y + 0.5) * TILE;
          if (!blocked(px, py, body)) return { x: px, y: py };
        }
      }
    }
    return { x: (c + 0.5) * TILE, y: (r + 0.5) * TILE };
  }

  function footprintFree(c, r, w, h) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (isMountain(c + x, r + y) || isLava(c + x, r + y)) return false;
      }
    }
    for (const p of props) {
      if (!p.alive) continue;
      const overlap = c < p.c + p.w && c + w > p.c && r < p.r + p.h && r + h > p.r;
      if (overlap) return false;
    }
    return true;
  }

  function propSize(kind) {
    if (kind === "house") return [2, 2];
    if (kind === "tent") return [2, 1];
    return [1, 1];
  }

  function addProp(kind, c, r) {
    const [w, h] = propSize(kind);
    if (!footprintFree(c, r, w, h)) return;
    props.push({
      kind, c, r, w, h, wind: 0, alive: true, bitAcc: 0,
      pulling: false, px: 0, py: 0, spin: 0,
      variant: (c * 5 + r * 3) % 3,
    });
  }

  function buildProps() {
    props = [];
    const map = currentMap();
    for (const [c, r] of map.houses) addProp("house", c, r);
    for (const [c, r] of map.trees) addProp("tree", c, r);
    for (const [c, r] of map.cacti || []) addProp("cactus", c, r);
    for (const [c, r] of map.camels || []) addProp("camel", c, r);
    for (const [c, r] of map.tents || []) addProp("tent", c, r);
    for (const [c, r] of map.monsters || []) addProp("monster", c, r);
  }

  function placeCoin(c, r, gap) {
    if (isMountain(c, r) || isLava(c, r)) return false;
    const x = (c + 0.5) * TILE;
    const y = (r + 0.5) * TILE;
    if (circleHitsMountain(x, y, CONFIG.humanRadius)) return false;
    if (circleHitsProps(x, y, 3).length) return false;
    for (const coin of coins) {
      if (Math.hypot(coin.x - x, coin.y - y) < gap) return false;
    }
    coins.push({ x, y, phase: hash(c, r) * 6, taken: false });
    return true;
  }

  function buildCoins() {
    coins = [];
    const map = currentMap();
    const target = CONFIG.coinTarget;
    for (const [c, r] of map.coins) placeCoin(c, r, 22);
    const candidates = [];
    for (let r = 1; r < ROWS - 1; r++) {
      for (let c = 1; c < COLS - 1; c++) candidates.push([c, r]);
    }
    candidates.sort((a, b) => hash(a[0] + 3, a[1] + 5) - hash(b[0] + 3, b[1] + 5));
    for (const gap of [32, 20]) {
      if (coins.length >= target) break;
      for (const [c, r] of candidates) {
        if (coins.length >= target) break;
        placeCoin(c, r, gap);
      }
    }
  }

  function farthestSpawn() {
    let best = null;
    let bestD = -1;
    for (const [c, r] of currentMap().spawns) {
      const spot = findClearNear(c, r);
      const d = Math.hypot(spot.x - tornado.x, spot.y - tornado.y);
      if (d > bestD) {
        bestD = d;
        best = spot;
      }
    }
    return best || findClearNear(11, 16);
  }

  function makeHuman(x, y) {
    return {
      x, y, vx: 0, vy: 0, rot: 0, flip: false, frame: 0, step: 0,
      state: "run", charges: CONFIG.dashCharges, chargeT: 0,
      dashing: false, dashT: 0, dx: 1, dy: 0, invuln: 0, returnIn: 0, flyT: 0,
      flyPhase: "yeet", orbit: 0, orbitR: 8, stingProp: null,
    };
  }

  function makeTornado(x, y) {
    return {
      x, y, vx: 0, vy: 0, dx: -1, dy: 0,
      hopping: false, hopT: 0, hopCool: 0.4, shotCool: 1.1,
    };
  }

  function resetMatch() {
    computeTornadoFit();
    buildProps();
    decals = [];
    particles = [];
    ghosts = [];
    swirls = [];
    wake = [];
    shots = [];
    aiPath = [];
    aiTimer = 0;
    lives = settings.lives;
    score = 0;
    coinsGot = 0;
    buildCoins();
    playT = 0;
    shoutT = 0;
    plusT = 0;
    freeze = 0;
    shake = 0;
    result = null;
    const map = currentMap();
    const startH = findClearNear(map.humanStart[0], map.humanStart[1]);
    const startT = findClearNear(map.tornadoStart[0], map.tornadoStart[1], CONFIG.tornadoRadius);
    human = makeHuman(startH.x, startH.y);
    tornado = makeTornado(startT.x, startT.y);
    dashHeld = dashDown();
    jumpHeld = jumpDown();
    shotHeld = shootDown();
    primePadHeld();
  }

  function tileStandable(c, r, radius) {
    if (c < 1 || r < 1 || c >= COLS - 1 || r >= ROWS - 1) return false;
    if (isMountain(c, r) || isLava(c, r)) return false;
    const x = (c + 0.5) * TILE;
    const y = (r + 0.5) * TILE;
    return !circleHitsMountain(x, y, radius);
  }

  function selfCheck() {
    const prev = settings.map;
    for (const map of MAPS) {
      settings.map = map.id;
      for (const [c, r] of map.cracks) {
        const x = (c + 0.5) * TILE;
        const y = (r + 0.5) * TILE;
        const humanOk = !circleHitsMountain(x, y, CONFIG.humanRadius);
        const tornadoBlocked = circleHitsMountain(x, y, CONFIG.tornadoRadius);
        if (!humanOk || !tornadoBlocked) {
          console.warn("Sprickan fungerar inte som tänkt", map.id, c, r, { humanOk, tornadoBlocked });
        }
      }
      for (const [c, r] of map.doors) {
        const x = (c + 0.5) * TILE;
        const y = (r + 0.5) * TILE;
        if (circleHitsMountain(x, y, CONFIG.tornadoRadius)) {
          console.warn("Dörren är för trång", map.id, c, r);
        }
      }
      const seen = new Uint8Array(COLS * ROWS);
      const queue = [[map.humanStart[0], map.humanStart[1]]];
      seen[map.humanStart[1] * COLS + map.humanStart[0]] = 1;
      let qi = 0;
      while (qi < queue.length) {
        const [c, r] = queue[qi++];
        const steps = [[1, 0], [-1, 0], [0, 1], [0, -1]];
        for (const [dc, dr] of steps) {
          const nc = c + dc;
          const nr = r + dr;
          const key = nr * COLS + nc;
          if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS || seen[key]) continue;
          if (!tileStandable(nc, nr, CONFIG.humanRadius)) continue;
          seen[key] = 1;
          queue.push([nc, nr]);
        }
      }
      buildProps();
      buildCoins();
      if (coins.length < CONFIG.coinTarget) console.warn("För få mynt", map.id, coins.length);
      for (const coin of coins) {
        const c = Math.floor(coin.x / TILE);
        const r = Math.floor(coin.y / TILE);
        if (!seen[r * COLS + c]) console.warn("Myntet går inte att nå", map.id, c, r);
      }
      if (!tileStandable(map.humanStart[0], map.humanStart[1], CONFIG.humanRadius)) {
        console.warn("Människan fastnar vid start", map.id);
      }
      if (!tileStandable(map.tornadoStart[0], map.tornadoStart[1], CONFIG.tornadoRadius)) {
        console.warn("Tornadon fastnar vid start", map.id);
      }
    }
    settings.map = prev;
  }

  const PAD_DASH = [0];
  const PAD_HOP = [0];
  const PAD_SHOOT = [2];

  function keyboardMove(layout) {
    if (layout === "arrows") return normalize(axis("ArrowLeft", "ArrowRight"), axis("ArrowUp", "ArrowDown"));
    return normalize(axis("KeyA", "KeyD"), axis("KeyW", "KeyS"));
  }

  function dashDown() {
    if (settings.humanKeys === "arrows") return keys.has("Space");
    return keys.has("ShiftLeft") || keys.has("KeyF");
  }

  function tornadoEasyKeys() {
    return !vsAI && settings.tornadoControl === "keys" && settings.humanControl === "pad";
  }

  function jumpDown() {
    if (tornadoEasyKeys()) return keys.has("Space");
    if (settings.tornadoKeys === "wasd") return keys.has("ShiftLeft") || keys.has("KeyF");
    return keys.has("ShiftRight") || keys.has("Numpad0") || keys.has("Enter");
  }

  function pollJump() {
    const down = jumpDown();
    const edge = down && !jumpHeld;
    jumpHeld = down;
    return edge;
  }

  function pollDash() {
    const down = dashDown();
    const edge = down && !dashHeld;
    dashHeld = down;
    return edge;
  }

  function shootDown() {
    if (tornadoEasyKeys()) {
      return keys.has("AltLeft") || keys.has("AltRight") || keys.has("MetaLeft") || keys.has("MetaRight");
    }
    if (settings.humanControl === "keys" && settings.humanKeys === "arrows") {
      return keys.has("AltLeft") || keys.has("AltRight") || keys.has("MetaLeft") || keys.has("MetaRight") || keys.has("KeyK") || keys.has("Numpad1");
    }
    return keys.has("Space") || keys.has("KeyK") || keys.has("Numpad1");
  }

  function pollShot() {
    const down = shootDown();
    const edge = down && !shotHeld;
    shotHeld = down;
    return edge;
  }

  function primePadHeld() {
    padHeld.dash = settings.humanControl === "pad" && padBind.human != null && padPressed(gamepadAt(padBind.human), PAD_DASH);
    padHeld.hop = settings.tornadoControl === "pad" && padBind.tornado != null && padPressed(gamepadAt(padBind.tornado), PAD_HOP);
    padHeld.shot = settings.tornadoControl === "pad" && padBind.tornado != null && padPressed(gamepadAt(padBind.tornado), PAD_SHOOT);
  }

  function buttonDown(pad, index) {
    const button = pad && pad.buttons && pad.buttons[index];
    if (!button) return false;
    return button.pressed === true || button.value > 0.45;
  }

  function anyButton(pad) {
    const buttons = pad && pad.buttons;
    if (!buttons) return false;
    for (let i = 0; i < buttons.length; i++) {
      if (buttonDown(pad, i)) return true;
    }
    return false;
  }

  function stickActive(pad) {
    const axes = pad && pad.axes;
    if (!axes) return false;
    for (let i = 0; i < axes.length; i++) {
      if (Math.abs(axes[i] || 0) > 0.4) return true;
    }
    return false;
  }

  function snapshotPads() {
    let raw = [];
    try {
      if (navigator.getGamepads) raw = navigator.getGamepads() || [];
    } catch (err) {
      raw = [];
    }
    const pads = [];
    for (let i = 0; i < raw.length; i++) {
      const pad = raw[i];
      if (pad && pad.connected) pads.push(pad);
    }
    return pads;
  }

  function rememberPad(pad) {
    const pressed = [];
    const buttons = pad.buttons || [];
    for (let i = 0; i < buttons.length; i++) pressed[i] = buttonDown(pad, i);
    const axes = [];
    const source = pad.axes || [];
    for (let i = 0; i < source.length; i++) axes[i] = source[i] || 0;
    padCache.set(pad.index, { pressed, axes, age: 0 });
  }

  function cachedPad(index) {
    const cached = padCache.get(index);
    if (!cached || cached.age > 0.5) return null;
    return {
      index,
      connected: true,
      axes: cached.axes,
      buttons: cached.pressed.map((pressed) => ({ pressed, value: pressed ? 1 : 0 })),
    };
  }

  function gamepadAt(index) {
    if (index == null) return null;
    for (const pad of padsThisFrame) {
      if (pad.index === index) return pad;
    }
    return cachedPad(index);
  }

  function padPressed(pad, indexes) {
    if (!pad) return false;
    for (const index of indexes) {
      if (buttonDown(pad, index)) return true;
    }
    return false;
  }

  function risingPad(name, down) {
    const edge = down && !padHeld[name];
    padHeld[name] = !!down;
    return edge;
  }

  function refreshPads(dt) {
    padBindFrame = false;
    padsThisFrame = snapshotPads();
    for (const cached of padCache.values()) cached.age += dt;
    for (const pad of padsThisFrame) rememberPad(pad);
    const wantHuman = settings.humanControl === "pad";
    const wantTornado = settings.tornadoControl === "pad" && !vsAI;
    if (!wantHuman) padBind.human = null;
    if (!wantTornado) padBind.tornado = null;
    if (padBind.human != null && !gamepadAt(padBind.human)) padBind.human = null;
    if (padBind.tornado != null && !gamepadAt(padBind.tornado)) padBind.tornado = null;
    const loose = padsThisFrame.filter((pad) => pad.index !== padBind.human && pad.index !== padBind.tornado);
    const active = loose.filter((pad) => anyButton(pad) || stickActive(pad));
    const waiting = [];
    if (wantHuman && padBind.human == null) waiting.push("human");
    if (wantTornado && padBind.tornado == null) waiting.push("tornado");
    const picks = active.length ? active : (waiting.length === 1 && loose.length === 1 ? loose : []);
    for (const pad of picks) {
      const slot = waiting.shift();
      if (!slot) break;
      padBind[slot] = pad.index;
      if (anyButton(pad)) padBindFrame = true;
    }
  }

  function padMove(index) {
    const pad = gamepadAt(index);
    if (!pad) return { x: 0, y: 0 };
    const axes = pad.axes || [];
    let x = axes[0] || 0;
    let y = axes[1] || 0;
    if (Math.abs(x) < 0.28) x = 0;
    if (Math.abs(y) < 0.28) y = 0;
    if (buttonDown(pad, 14)) x = -1;
    if (buttonDown(pad, 15)) x = 1;
    if (buttonDown(pad, 12)) y = -1;
    if (buttonDown(pad, 13)) y = 1;
    return normalize(x, y);
  }

  function readDash() {
    if (settings.humanControl !== "pad") return pollDash();
    const down = padBind.human != null && padPressed(gamepadAt(padBind.human), PAD_DASH);
    if (padBindFrame) {
      padHeld.dash = down;
      return false;
    }
    return risingPad("dash", down);
  }

  function readHop() {
    if (vsAI || settings.tornadoControl !== "pad") return pollJump();
    const down = padBind.tornado != null && padPressed(gamepadAt(padBind.tornado), PAD_HOP);
    if (padBindFrame) {
      padHeld.hop = down;
      return false;
    }
    return risingPad("hop", down);
  }

  function readShot() {
    if (vsAI || settings.tornadoControl !== "pad") return pollShot();
    const down = padBind.tornado != null && padPressed(gamepadAt(padBind.tornado), PAD_SHOOT);
    if (padBindFrame) {
      padHeld.shot = down;
      return false;
    }
    return risingPad("shot", down);
  }

  function pollPadStart() {
    let down = false;
    for (const pad of padsThisFrame) {
      if (buttonDown(pad, 9)) down = true;
    }
    const edge = down && !padHeld.start;
    padHeld.start = down;
    return edge;
  }

  function padWaitingText() {
    const lines = [];
    if (settings.humanControl === "pad" && padBind.human == null) {
      lines.push("Människan: tryck en knapp på handkontrollen");
    }
    if (!vsAI && settings.tornadoControl === "pad" && padBind.tornado == null) {
      lines.push(padBind.human == null
        ? "Tornadon: tryck sen en knapp på den andra"
        : "Tornadon: tryck en knapp på den andra handkontrollen");
    }
    return lines.join(". ");
  }

  function shotCooldown() {
    if (settings.wind === "lugn") return 4.1;
    if (settings.wind === "vild") return 2.45;
    return 3.25;
  }

  function axis(neg, pos) {
    return (keys.has(pos) ? 1 : 0) - (keys.has(neg) ? 1 : 0);
  }

  function normalize(x, y) {
    const len = Math.hypot(x, y);
    if (len === 0) return { x: 0, y: 0 };
    return { x: x / len, y: y / len };
  }

  function burst(x, y, n, colors, speed) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.35 + Math.random());
      particles.push({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - speed * 0.25,
        life: 0.35 + Math.random() * 0.45,
        age: 0,
        color: colors[i % colors.length],
        size: 1 + (Math.random() * 2 | 0),
        g: 90,
      });
    }
    if (particles.length > 280) particles.splice(0, particles.length - 280);
  }

  function updateParticles(dt) {
    for (const p of particles) {
      p.age += dt;
      p.vy += p.g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
    particles = particles.filter((p) => p.age < p.life);
    ghosts = ghosts.filter((g) => {
      g.life -= dt;
      return g.life > 0;
    });
  }

  const butterflies = [
    { x: 90, y: 48, a: 0.4, c: "#ff8fb8" },
    { x: 220, y: 64, a: 2.1, c: "#ffe56a" },
    { x: 340, y: 200, a: 4.2, c: "#c7b6ff" },
  ];

  function updateButterflies(dt) {
    if (!tornado) return;
    for (const b of butterflies) {
      b.a += dt * 1.5;
      b.x += Math.cos(b.a) * 20 * dt;
      b.y += Math.sin(b.a * 0.8) * 14 * dt;
      const dx = b.x - tornado.x;
      const dy = b.y - tornado.y;
      const dist = Math.hypot(dx, dy);
      if (dist < 54 && dist > 0) {
        b.x += (dx / dist) * 46 * dt;
        b.y += (dy / dist) * 46 * dt;
      }
      b.x = clamp(b.x, 18, WORLD_W - 18);
      b.y = clamp(b.y, 18, WORLD_H - 18);
    }
  }

  function tileKey(c, r) {
    return r * COLS + c;
  }

  function nearestFit(x, y) {
    const c0 = clamp(Math.floor(x / TILE), 0, COLS - 1);
    const r0 = clamp(Math.floor(y / TILE), 0, ROWS - 1);
    let best = [c0, r0];
    let bestD = Infinity;
    for (let r = r0 - 3; r <= r0 + 3; r++) {
      for (let c = c0 - 3; c <= c0 + 3; c++) {
        if (c < 0 || r < 0 || c >= COLS || r >= ROWS) continue;
        if (!tornadoFit[r][c]) continue;
        const dx = x - (c + 0.5) * TILE;
        const dy = y - (r + 0.5) * TILE;
        const d = dx * dx + dy * dy;
        if (d < bestD) {
          bestD = d;
          best = [c, r];
        }
      }
    }
    return best;
  }

  function buildAiPath() {
    const [sc, sr] = nearestFit(tornado.x, tornado.y);
    const gc = clamp(Math.floor(human.x / TILE), 0, COLS - 1);
    const gr = clamp(Math.floor(human.y / TILE), 0, ROWS - 1);
    const prev = new Int16Array(COLS * ROWS);
    prev.fill(-1);
    const seen = new Uint8Array(COLS * ROWS);
    const start = tileKey(sc, sr);
    seen[start] = 1;
    const queue = [[sc, sr]];
    let found = null;
    let closest = [sc, sr];
    let closestD = Infinity;
    let qi = 0;
    while (qi < queue.length) {
      const [c, r] = queue[qi++];
      const goalD = (c - gc) * (c - gc) + (r - gr) * (r - gr);
      if (goalD < closestD) {
        closestD = goalD;
        closest = [c, r];
      }
      if (c === gc && r === gr) {
        found = [c, r];
        break;
      }
      const steps = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (const [dc, dr] of steps) {
        const nc = c + dc;
        const nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= COLS || nr >= ROWS) continue;
        const key = tileKey(nc, nr);
        if (seen[key] || !tornadoFit[nr][nc]) continue;
        seen[key] = 1;
        prev[key] = tileKey(c, r);
        queue.push([nc, nr]);
      }
    }
    const end = found || closest;
    const path = [];
    let key = tileKey(end[0], end[1]);
    let guard = 0;
    while (key !== -1 && guard++ < 800) {
      path.push({ c: key % COLS, r: Math.floor(key / COLS) });
      if (key === start) break;
      key = prev[key];
    }
    path.reverse();
    if (path.length && path[0].c === sc && path[0].r === sr) path.shift();
    aiPath = path;
  }

  function aiWish(dt) {
    aiTimer -= dt;
    const stuck = Math.hypot(tornado.vx, tornado.vy) < 8;
    if (aiTimer <= 0 || (stuck && aiTimer < 0.2)) {
      buildAiPath();
      aiTimer = 0.35 + Math.random() * 0.15;
    }
    if (!aiPath.length) return { x: 0, y: 0 };
    const point = aiPath[0];
    const tx = (point.c + 0.5) * TILE;
    const ty = (point.r + 0.5) * TILE;
    if (Math.hypot(tornado.x - tx, tornado.y - ty) < 7) {
      aiPath.shift();
      if (!aiPath.length) return { x: 0, y: 0 };
    }
    const next = aiPath[0];
    return normalize((next.c + 0.5) * TILE - tornado.x, (next.r + 0.5) * TILE - tornado.y);
  }

  function aiShouldHop(dir) {
    if (tornado.hopping || tornado.hopCool > 0) return false;
    const toward = normalize(human.x - tornado.x, human.y - tornado.y);
    const use = dir.x || dir.y ? dir : toward;
    const aheadX = tornado.x + use.x * 22;
    const aheadY = tornado.y + use.y * 22;
    if (circleHitsMountain(aheadX, aheadY, CONFIG.tornadoRadius)) return true;
    const midX = tornado.x + toward.x * 36;
    const midY = tornado.y + toward.y * 36;
    return circleHitsMountain(midX, midY, 6);
  }

  function startHop() {
    if (tornado.hopping || tornado.hopCool > 0) return;
    if (tornado.dx === 0 && tornado.dy === 0) {
      const to = normalize(human.x - tornado.x, human.y - tornado.y);
      tornado.dx = to.x || 1;
      tornado.dy = to.y || 0;
    }
    tornado.hopping = true;
    tornado.hopT = 0;
    sfxHop();
  }

  function nearestOpen(x, y, radius) {
    if (!circleHitsMountain(x, y, radius)) return { x, y };
    for (let rad = 2; rad <= 56; rad += 2) {
      const steps = Math.ceil((Math.PI * 2 * rad) / 4);
      for (let i = 0; i < steps; i++) {
        const angle = (i / steps) * Math.PI * 2;
        const px = x + Math.cos(angle) * rad;
        const py = y + Math.sin(angle) * rad;
        if (px < 14 || py < 14 || px > WORLD_W - 14 || py > WORLD_H - 14) continue;
        if (!circleHitsMountain(px, py, radius)) return { x: px, y: py };
      }
    }
    return { x, y };
  }

  function landTornado() {
    tornado.hopping = false;
    tornado.hopCool = CONFIG.hopCooldown;
    const crushed = circleHitsProps(tornado.x, tornado.y, CONFIG.tornadoRadius, 0.5);
    for (const prop of crushed) destroyProp(prop);
    if (circleHitsMountain(tornado.x, tornado.y, CONFIG.tornadoRadius)) {
      const spot = nearestOpen(tornado.x, tornado.y, CONFIG.tornadoRadius);
      tornado.x = spot.x;
      tornado.y = spot.y;
    }
    burst(tornado.x, tornado.y - 4, 10, ["#ffffff", "#d7e4ff", "#efe7ff"], 50);
  }

  function cloudAnchor() {
    const lift = tornado && tornado.hopping
      ? Math.sin(Math.min(tornado.hopT / CONFIG.hopTime, 1) * Math.PI) * 18
      : 0;
    return { x: tornado.x, y: tornado.y - lift };
  }

  function bitColors(kind) {
    if (kind === "tree" || kind === "cactus") return ["#3e9b49", "#67c86a", "#8a5a32", "#dff6c4", "#ff8fb8"];
    if (kind === "camel") return ["#e6b15a", "#f0c57a", "#c48a3a", "#fff6e0", "#8a5a32"];
    if (kind === "tent") return ["#f4e4c4", "#e7d3a8", "#c4a574", "#6b5344", "#f7f1e4"];
    if (kind === "monster") return ["#ff7a1a", "#ffb703", "#ffe566", "#e85d04", "#fff6e0"];
    return ["#ff6f68", "#ffe3c2", "#c4814a", "#9ee7ff", "#e07b6c"];
  }

  function spawnSwirlBits(x, y, kind, count, chunk) {
    const colors = bitColors(kind);
    for (let i = 0; i < count; i++) {
      swirls.push({
        x, y,
        ang: Math.random() * Math.PI * 2,
        radius: 8 + Math.random() * 16,
        height: Math.random() * 0.12,
        spin: (Math.random() < 0.5 ? -1 : 1) * (11 + Math.random() * 7),
        phase: "suck",
        age: 0,
        delay: i * 0.028,
        color: colors[i % colors.length],
        w: 2 + (Math.random() * 4 | 0),
        h: 2 + (Math.random() * 3 | 0),
        rot: Math.random() * 6,
        kind: null,
        vx: 0,
        vy: 0,
      });
    }
    if (chunk) {
      swirls.push({
        x, y,
        ang: 0.6,
        radius: 12,
        height: 0,
        spin: 8,
        phase: "suck",
        age: 0,
        delay: 0.04,
        color: "#ffffff",
        w: 10,
        h: 10,
        rot: 0,
        kind,
        vx: 0,
        vy: 0,
      });
    }
    if (swirls.length > 90) swirls.splice(0, swirls.length - 90);
  }

  function flingVelocity() {
    const speed = 240 + Math.random() * 70;
    const side = (tornado.dx || tornado.vx || 0.35) + (Math.random() - 0.5) * 0.8;
    const dir = normalize(side, -1.35);
    return { vx: dir.x * speed, vy: dir.y * speed };
  }

  function updateSwirls(dt) {
    if (!tornado) return;
    const anchor = cloudAnchor();
    for (const s of swirls) {
      s.age += dt;
      if (s.age < s.delay) continue;
      if (s.phase === "suck") {
        s.ang += s.spin * dt;
        s.radius += (14 - s.radius) * Math.min(1, dt * 1.35);
        s.height = Math.min(1, s.height + dt * 1.15);
        const rise = s.height * 36;
        const ring = Math.max(7, s.radius * (1.65 - s.height * 0.45));
        s.x = anchor.x + Math.cos(s.ang) * ring;
        s.y = anchor.y - 8 - rise + Math.sin(s.ang) * ring * 0.42;
        s.rot += dt * 9;
        if (s.height >= 0.98 && s.age > 0.72 + s.delay) {
          s.phase = "yeet";
          const flung = flingVelocity();
          s.vx = flung.vx;
          s.vy = flung.vy;
        }
      } else {
        s.x += s.vx * dt;
        s.y += s.vy * dt;
        s.rot += dt * 11;
      }
    }
    swirls = swirls.filter((s) => {
      if (s.phase !== "yeet") return s.age < 2.4;
      return s.y > -70 && s.x > -60 && s.x < WORLD_W + 60 && s.y < WORLD_H + 20;
    });
  }

  function leaveDecal(p) {
    const rect = propRect(p);
    const cx = rect.x + rect.w / 2;
    const foot = rect.y + rect.h - 3;
    if (p.kind === "tree" || p.kind === "cactus") decals.push({ kind: "stump", x: cx, y: foot });
    else if (p.kind === "camel") decals.push({ kind: "saddle", x: cx, y: foot });
    else if (p.kind === "tent") decals.push({ kind: "cloth", x: cx, y: foot });
    else if (p.kind === "monster") decals.push({ kind: "ember", x: cx, y: foot });
    else decals.push({ kind: "rubble", x: cx, y: foot });
  }

  function destroyProp(p) {
    if (!p || !p.alive || p.pulling) return;
    p.alive = false;
    const rect = propRect(p);
    const cx = rect.x + rect.w / 2;
    const cy = rect.y + rect.h / 2;
    leaveDecal(p);
    spawnSwirlBits(cx, cy - 6, p.kind, p.kind === "house" || p.kind === "tent" || p.kind === "monster" ? 12 : 9, true);
    sfxWhoosh();
    if (!reducedMotion) shake = Math.max(shake, 1.4);
  }

  function scatterCoins() {
    const taken = coins.filter((coin) => coin.taken && !coin.flying);
    if (!taken.length) return;
    for (let i = 0; i < taken.length; i++) {
      const coin = taken[i];
      coin.taken = false;
      coin.x = human.x;
      coin.y = human.y - 10;
      coin.phase = Math.random() * 6;
      launchCoin(coin, true);
      coin.flyT = -i * 0.07;
    }
    coinsGot = coins.filter((coin) => coin.taken).length;
    sfxWhoosh();
  }

  function openCoinSpots(minTornadoDist, minCoinDist, ignoreCoin, minHumanDist) {
    const spots = [];
    for (let r = 1; r < ROWS - 1; r++) {
      for (let c = 1; c < COLS - 1; c++) {
        const x = (c + 0.5) * TILE;
        const y = (r + 0.5) * TILE;
        if (circleHitsMountain(x, y, CONFIG.humanRadius)) continue;
        if (circleHitsProps(x, y, 3).length) continue;
        if (tornado && Math.hypot(x - tornado.x, y - tornado.y) < minTornadoDist) continue;
        if (human && minHumanDist && Math.hypot(x - human.x, y - human.y) < minHumanDist) continue;
        let crowded = false;
        for (const coin of coins) {
          if (coin === ignoreCoin || coin.taken) continue;
          const ox = coin.flying && coin.toX != null ? coin.toX : coin.x;
          const oy = coin.flying && coin.toY != null ? coin.toY : coin.y;
          if (Math.hypot(ox - x, oy - y) < minCoinDist) crowded = true;
        }
        if (!crowded) spots.push({ x, y });
      }
    }
    return spots;
  }

  function launchCoin(coin, swirl) {
    const fromHuman = human ? Math.hypot(coin.x - human.x, coin.y - human.y) : 0;
    let spots = [];
    if (swirl && human) {
      const minAway = Math.max(fromHuman + 20, 64);
      spots = openCoinSpots(70, 32, coin, minAway);
      if (spots.length < 8) spots = openCoinSpots(28, 22, coin, minAway);
      if (spots.length < 4) spots = openCoinSpots(12, 16, coin, fromHuman);
    }
    if (!spots.length) spots = openCoinSpots(70, 18, coin, 0);
    if (!spots.length) spots = openCoinSpots(28, 8, coin, 0);
    if (!spots.length) return;
    const spot = spots[Math.floor(Math.random() * spots.length)];
    coin.flying = true;
    coin.flyT = 0;
    coin.flyPhase = swirl ? "suck" : "arc";
    coin.ang = Math.random() * Math.PI * 2;
    coin.spin = (Math.random() < 0.5 ? -1 : 1) * (10 + Math.random() * 4);
    coin.orbitR = 6 + Math.random() * 8;
    coin.rot = 0;
    coin.fromX = coin.x;
    coin.fromY = coin.y;
    coin.toX = spot.x;
    coin.toY = spot.y;
    if (!swirl) sfxPop();
  }

  function updateFlyingCoins(dt) {
    const anchor = tornado ? cloudAnchor() : null;
    for (const coin of coins) {
      if (!coin.flying) continue;
      coin.flyT += dt;
      if (coin.flyT < 0) {
        if (anchor) {
          coin.ang = (coin.ang || 0) + (coin.spin || 8) * dt;
          const ring = 12;
          coin.x = anchor.x + Math.cos(coin.ang) * ring;
          coin.y = anchor.y - 8 + Math.sin(coin.ang) * ring * 0.35;
        }
        continue;
      }
      coin.rot = (coin.rot || 0) + dt * 9;
      if (coin.flyPhase === "suck" && anchor) {
        coin.ang += coin.spin * dt;
        coin.orbitR += (15 - coin.orbitR) * Math.min(1, dt * 1.5);
        const lift = Math.min(1, coin.flyT / 0.62);
        const ring = Math.max(6, coin.orbitR * (1.55 - lift * 0.45));
        coin.x = anchor.x + Math.cos(coin.ang) * ring;
        coin.y = anchor.y - 12 - lift * 30 + Math.sin(coin.ang) * ring * 0.4;
        if (lift >= 1) {
          coin.flyPhase = "arc";
          coin.flyT = 0;
          coin.fromX = coin.x;
          coin.fromY = coin.y;
        }
      } else {
        const t = Math.min(1, coin.flyT / 0.4);
        const arc = Math.sin(t * Math.PI) * 20;
        coin.x = coin.fromX + (coin.toX - coin.fromX) * t;
        coin.y = coin.fromY + (coin.toY - coin.fromY) * t - arc;
        if (t >= 1) {
          coin.flying = false;
          coin.rot = 0;
          coin.x = coin.toX;
          coin.y = coin.toY;
          burst(coin.x, coin.y - 2, 4, ["#ffe56a", "#fff6c2", "#f0b429"], 36);
        }
      }
    }
  }

  function tossTornadoCoins() {
    if (!tornado || tornado.hopping) return;
    for (const coin of coins) {
      if (coin.taken || coin.flying) continue;
      if (Math.hypot(tornado.x - coin.x, tornado.y - coin.y) < CONFIG.tornadoRadius + 2) {
        launchCoin(coin, true);
        sfxWhoosh();
      }
    }
  }

  function stirGround() {
    if (!tornado || tornado.hopping) return;
    if (Math.hypot(tornado.vx || 0, tornado.vy || 0) < 18) return;
    if (circleHitsMountain(tornado.x, tornado.y, 3)) return;
    const last = wake[wake.length - 1];
    if (last && Math.hypot(last.x - tornado.x, last.y - tornado.y) < 8) return;
    wake.push({
      x: tornado.x,
      y: tornado.y + 3,
      dx: tornado.dx || 0,
      dy: tornado.dy || 0,
      life: 0.65,
      max: 0.65,
      theme: mapTheme(),
    });
    if (wake.length > 18) wake.shift();
  }

  function updateWake(dt) {
    for (const mark of wake) mark.life -= dt;
    wake = wake.filter((mark) => mark.life > 0);
  }

  function stingMonsters() {
    if (!human || human.state !== "run") return;
    let hit = null;
    for (const p of props) {
      if (!p.alive || p.pulling || p.kind !== "monster") continue;
      const rect = propRect(p);
      if (circleHitsRect(human.x, human.y, 4, rect.x, rect.y, rect.w, rect.h)) {
        hit = p;
        break;
      }
    }
    if (!hit) {
      human.stingProp = null;
      return;
    }
    if (hit === human.stingProp) return;
    human.stingProp = hit;
    const taken = coins.filter((coin) => coin.taken && !coin.flying);
    if (!taken.length) {
      sfxPop();
      burst(human.x, human.y - 8, 4, ["#ff7a1a", "#ffb703"], 30);
      return;
    }
    const coin = taken[Math.floor(Math.random() * taken.length)];
    coin.taken = false;
    coin.x = human.x;
    coin.y = human.y - 6;
    coinsGot = coins.filter((c) => c.taken).length;
    launchCoin(coin);
    burst(human.x, human.y - 10, 6, ["#ff7a1a", "#ffe566", "#fff6e0"], 40);
  }

  function beginPull(p) {
    if (!p.alive || p.pulling) return;
    const rect = propRect(p);
    const cx = rect.x + rect.w / 2;
    const foot = rect.y + rect.h - 2;
    leaveDecal(p);
    p.pulling = true;
    p.px = cx;
    p.py = foot;
    p.spin = Math.random() * 6;
    sfxWhoosh();
  }

  function finishPull(p) {
    p.alive = false;
    p.pulling = false;
    spawnSwirlBits(p.px, p.py - 10, p.kind, p.kind === "house" ? 12 : 9, true);
    sfxWhoosh();
    if (!reducedMotion) shake = Math.max(shake, 1.2);
  }

  function updatePulledProps(dt) {
    for (const p of props) {
      if (!p.alive || !p.pulling) continue;
      p.spin += dt * 9;
      const tx = tornado.x;
      const ty = tornado.y - 8;
      const dx = tx - p.px;
      const dy = ty - p.py;
      const dist = Math.hypot(dx, dy) || 1;
      const speed = clamp(110 + dist * 0.25, 120, 210);
      p.px += (dx / dist) * speed * dt + Math.cos(p.spin) * 16 * dt;
      p.py += (dy / dist) * speed * dt + Math.sin(p.spin) * 10 * dt;
      if (dist < 18) finishPull(p);
    }
  }

  function aimVector() {
    if (human && (human.state === "run" || human.state === "pull")) {
      const aimed = normalize(human.x - tornado.x, human.y - tornado.y);
      if (aimed.x || aimed.y) return aimed;
    }
    const facing = normalize(tornado.dx, tornado.dy);
    if (facing.x || facing.y) return facing;
    return { x: 1, y: 0 };
  }

  function closestProp(x, y) {
    let best = null;
    let bestD = Infinity;
    for (const p of props) {
      if (!p.alive || p.pulling) continue;
      const rect = propRect(p);
      if (!circleHitsRect(x, y, CONFIG.shotRadius, rect.x, rect.y, rect.w, rect.h)) continue;
      const dist = Math.hypot(x - (rect.x + rect.w / 2), y - (rect.y + rect.h / 2));
      if (dist < bestD) {
        bestD = dist;
        best = p;
      }
    }
    return best;
  }

  function resolveShot(x, y) {
    if (circleHitsMountain(x, y, CONFIG.shotRadius) || x < 4 || y < 4 || x > WORLD_W - 4 || y > WORLD_H - 4) {
      burst(x, y, 6, ["#ffffff", "#d7e4ff", "#efe7ff"], 40);
      return true;
    }
    const prop = closestProp(x, y);
    if (prop) {
      beginPull(prop);
      return true;
    }
    if (human && human.state === "run" && human.invuln <= 0) {
      if (Math.hypot(human.x - x, human.y - y) < CONFIG.shotRadius + CONFIG.humanRadius) {
        startPull();
        return true;
      }
    }
    return false;
  }

  function fireShot() {
    if (!tornado || tornado.shotCool > 0 || tornado.hopping) return;
    const aim = aimVector();
    tornado.shotCool = shotCooldown();
    shots.push({
      x: tornado.x + aim.x * 18,
      y: tornado.y - 6 + aim.y * 14,
      vx: aim.x * CONFIG.shotSpeed,
      vy: aim.y * CONFIG.shotSpeed,
      spin: 0,
      age: 0,
      dead: false,
    });
    sfxShot();
  }

  function aiShouldShoot() {
    if (!human || human.state !== "run" || human.invuln > 0) return false;
    const dist = Math.hypot(human.x - tornado.x, human.y - tornado.y);
    if (dist < 52 || dist > 270) return false;
    const aim = normalize(human.x - tornado.x, human.y - tornado.y);
    const steps = Math.ceil(dist / 8);
    for (let i = 1; i < steps; i++) {
      const x = tornado.x + aim.x * i * 8;
      const y = tornado.y + aim.y * i * 8;
      if (circleHitsMountain(x, y, CONFIG.shotRadius)) return false;
      if (closestProp(x, y)) return false;
    }
    return true;
  }

  function updateShots(dt) {
    for (const shot of shots) {
      if (shot.dead) continue;
      shot.age += dt;
      shot.spin += dt * 16;
      if (resolveShot(shot.x, shot.y)) {
        shot.dead = true;
        continue;
      }
      const steps = Math.max(1, Math.ceil((CONFIG.shotSpeed * dt) / 3));
      for (let i = 0; i < steps; i++) {
        shot.x += shot.vx * (dt / steps);
        shot.y += shot.vy * (dt / steps);
        if (resolveShot(shot.x, shot.y)) {
          shot.dead = true;
          break;
        }
      }
      if (shot.age > 3.6) shot.dead = true;
    }
    shots = shots.filter((shot) => !shot.dead);
  }

  function startPull() {
    if (!human || human.state !== "run" || human.invuln > 0) return;
    human.state = "pull";
    human.dashing = false;
    human.orbit = Math.atan2(human.y - tornado.y, human.x - tornado.x);
    human.rot = 0;
    human.vx = 0;
    human.vy = 0;
    shoutText = "Sug!";
    shoutT = 0.7;
    sfxWhoosh();
    if (!reducedMotion) shake = Math.max(shake, 1.2);
  }

  function updatePull(dt) {
    const dx = tornado.x - human.x;
    const dy = tornado.y - human.y;
    const dist = Math.hypot(dx, dy) || 1;
    if (dist < 22) {
      catchHuman();
      return;
    }
    human.orbit += dt * 11;
    const speed = clamp(100 + dist * 0.28, 120, 220);
    const wobble = Math.min(16, dist * 0.18);
    human.x += (dx / dist) * speed * dt + Math.cos(human.orbit) * wobble * dt * 2.4;
    human.y += (dy / dist) * speed * dt + Math.sin(human.orbit) * wobble * dt * 1.4;
    human.rot += dt * 10;
    human.flip = dx < 0;
  }

  function catchHuman() {
    if (human.state === "fly") return;
    scatterCoins();
    lives -= 1;
    score += 1;
    human.state = "fly";
    human.flyT = 0;
    human.flyPhase = "suck";
    human.orbit = Math.atan2(human.y - tornado.y, human.x - tornado.x);
    human.orbitR = Math.max(10, Math.hypot(human.x - tornado.x, human.y - tornado.y));
    human.returnIn = CONFIG.respawnTime;
    human.dashing = false;
    human.vx = 0;
    human.vy = 0;
    human.rot = 0;
    shoutText = "Wiiii!";
    shoutT = 0.9;
    plusT = 0.8;
    sfxCatch();
    burst(human.x, human.y - 8, 14, ["#fff", "#ffe56a", "#ffb7c8", "#c9ecff"], 90, );
    if (!reducedMotion) shake = 3;
    freeze = 0.07;
  }

  function respawnHuman() {
    const spot = farthestSpawn();
    human.x = spot.x;
    human.y = spot.y;
    human.vx = 0;
    human.vy = 0;
    human.rot = 0;
    human.state = "run";
    human.invuln = CONFIG.invulnTime;
    human.dashing = false;
    human.flyPhase = "yeet";
    burst(human.x, human.y - 6, 12, ["#fff", "#c9ecff", "#ffe56a"], 60);
    shoutText = "Poff!";
    shoutT = 0.6;
    sfxPop();
  }

  function parkHuman() {
    const onMap = human.x > 12 && human.x < WORLD_W - 12 && human.y > 12 && human.y < WORLD_H - 8;
    if (human.state === "run" && onMap && !blocked(human.x, human.y, CONFIG.humanRadius)) return;
    const spot = findClearNear(16, 10);
    human.x = spot.x;
    human.y = spot.y;
    human.state = "run";
    human.rot = 0;
    human.dashing = false;
  }

  function endGame(winner) {
    if (mode === "ended") return;
    mode = "ended";
    result = winner;
    parkHuman();
    burst(WORLD_W / 2, 40, 36, ["#ff8fb8", "#ffe56a", "#9ee7ff", "#b7ec9a", "#fff"], 120);
    sfxWin();
    if (winner === "human") {
      el.endTitle.textContent = "Alla mynt är samlade!";
      el.endBody.textContent = "Människan tog alla " + coins.length + " mynt. Tornadon hann få " + score + " poäng.";
    } else {
      el.endTitle.textContent = "Tornadon vann leken!";
      el.endBody.textContent = "Människan blåstes ut " + settings.lives + " gånger. " + coinsGot + " mynt var kvar i fickan.";
    }
  }

  function updatePlay(dt) {
    playT += dt;
    updateSwirls(dt);
    if (human.invuln > 0) human.invuln -= dt;
    if (human.charges < CONFIG.dashCharges) {
      human.chargeT += dt;
      if (human.chargeT >= CONFIG.dashRecharge) {
        human.charges += 1;
        human.chargeT = 0;
        sfxReady();
      }
    }

    if (human.state === "run") {
      const wish = settings.humanControl === "pad"
        ? padMove(padBind.human)
        : keyboardMove(settings.humanKeys);
      if (wish.x !== 0 || wish.y !== 0) {
        human.dx = wish.x;
        human.dy = wish.y;
        human.flip = wish.x < 0;
      }
      if (readDash() && human.charges > 0 && !human.dashing) {
        human.dashing = true;
        human.dashT = CONFIG.dashTime;
        human.charges -= 1;
        if (human.charges < CONFIG.dashCharges) human.chargeT = 0;
        sfxDash();
      } else if (!human.dashing) {
        readDash();
      }

      const speed = human.dashing ? CONFIG.dashSpeed : CONFIG.humanSpeed;
      const dirx = human.dashing ? human.dx : wish.x;
      const diry = human.dashing ? human.dy : wish.y;
      const beforeX = human.x;
      const beforeY = human.y;
      const moved = moveCircle(human.x, human.y, dirx * speed * dt, diry * speed * dt, CONFIG.humanRadius);
      human.x = moved.x;
      human.y = moved.y;
      human.vx = (human.x - beforeX) / dt;
      human.vy = (human.y - beforeY) / dt;
      const stepped = Math.hypot(human.x - beforeX, human.y - beforeY);
      if (stepped > 0.2) {
        human.step += stepped;
        human.frame = Math.floor(human.step / 6) % 2;
      } else {
        human.frame = 0;
      }
      if (human.dashing) {
        human.dashT -= dt;
        ghosts.push({
          x: human.x, y: human.y, life: 0.16, flip: human.flip, frame: human.frame,
        });
        if (human.dashT <= 0) human.dashing = false;
      }
      for (const coin of coins) {
        if (coin.taken || coin.flying) continue;
        if (Math.hypot(human.x - coin.x, human.y - coin.y) < 12) {
          coin.taken = true;
          coinsGot += 1;
          sfxCoin();
          burst(coin.x, coin.y - 2, 8, ["#ffe56a", "#fff6c2", "#f0b429"], 55);
        }
      }
      stingMonsters();
      if (coins.length && coins.every((coin) => coin.taken)) {
        endGame("human");
        return;
      }
    } else if (human.state === "pull") {
      readDash();
      updatePull(dt);
      if (mode !== "play") return;
    } else {
      readDash();
      human.flyT += dt;
      if (human.flyPhase === "suck") {
        human.orbit += dt * 13;
        human.orbitR = Math.max(5, human.orbitR - dt * 26);
        const lift = Math.min(1, human.flyT / 0.75);
        const anchor = cloudAnchor();
        const ring = human.orbitR * (1.25 - lift * 0.55);
        human.x = anchor.x + Math.cos(human.orbit) * ring;
        human.y = anchor.y - 8 - lift * 32 + Math.sin(human.orbit) * ring * 0.4;
        human.rot += dt * 16;
        if (human.flyT > 0.88) {
          human.flyPhase = "yeet";
          const flung = flingVelocity();
          human.vx = flung.vx;
          human.vy = Math.min(flung.vy, -180);
          sfxWhoosh();
        }
      } else {
        human.x += human.vx * dt;
        human.y += human.vy * dt;
        human.rot += dt * 12;
      }
      if (lives > 0) {
        human.returnIn -= dt;
        if (human.returnIn <= 0) respawnHuman();
      } else if (human.flyT > 1.7) {
        endGame("tornado");
        return;
      }
    }

    let tx = 0;
    let ty = 0;
    if (vsAI && human.state === "run") {
      const wish = aiWish(dt);
      tx = wish.x;
      ty = wish.y;
    } else if (!vsAI) {
      const wish = settings.tornadoControl === "pad"
        ? padMove(padBind.tornado)
        : keyboardMove(settings.tornadoKeys);
      tx = wish.x;
      ty = wish.y;
    }
    if (tx !== 0 || ty !== 0) {
      tornado.dx = tx;
      tornado.dy = ty;
    }
    const hopEdge = readHop();
    const shotEdge = readShot();
    if (tornado.shotCool > 0) tornado.shotCool -= dt;
    if (!tornado.hopping && tornado.hopCool <= 0) {
      if (vsAI && human.state === "run" && aiShouldHop({ x: tx, y: ty })) startHop();
      else if (!vsAI && hopEdge && !shotEdge) startHop();
    }
    if (!tornado.hopping && tornado.shotCool <= 0) {
      if (vsAI && aiShouldShoot()) fireShot();
      else if (!vsAI && shotEdge) fireShot();
    }

    if (tornado.hopping) {
      tornado.hopT += dt;
      const glide = normalize(tornado.dx, tornado.dy);
      const hopSpeed = tornadoSpeed() * CONFIG.hopSpeed;
      const nextX = clamp(tornado.x + glide.x * hopSpeed * dt, 18, WORLD_W - 18);
      const nextY = clamp(tornado.y + glide.y * hopSpeed * dt, 18, WORLD_H - 18);
      tornado.vx = (nextX - tornado.x) / dt;
      tornado.vy = (nextY - tornado.y) / dt;
      tornado.x = nextX;
      tornado.y = nextY;
      const overMountain = circleHitsMountain(tornado.x, tornado.y, CONFIG.tornadoRadius * 0.65);
        if ((tornado.hopT >= CONFIG.hopTime && !overMountain) || tornado.hopT >= CONFIG.hopMax) {
        landTornado();
      }
    } else {
      if (tornado.hopCool > 0) tornado.hopCool -= dt;
      const touching = circleHitsProps(tornado.x, tornado.y, CONFIG.tornadoRadius, 1.25);
      const speed = tornadoSpeed() * (touching.length ? 0.48 : 1);
      const beforeTX = tornado.x;
      const beforeTY = tornado.y;
      const movedT = moveCircle(tornado.x, tornado.y, tx * speed * dt, ty * speed * dt, CONFIG.tornadoRadius);
      tornado.x = movedT.x;
      tornado.y = movedT.y;
      tornado.vx = (tornado.x - beforeTX) / dt;
      tornado.vy = (tornado.y - beforeTY) / dt;
      for (const prop of touching) {
        if (!prop.alive) continue;
        prop.wind += dt;
        prop.bitAcc += dt;
        if (prop.bitAcc > 0.09) {
          prop.bitAcc = 0;
          const rect = propRect(prop);
          spawnSwirlBits(rect.x + rect.w / 2, rect.y + 8, prop.kind, 1, false);
        }
        if (prop.wind >= CONFIG.smashTime) destroyProp(prop);
      }
      tossTornadoCoins();
      stirGround();
    }

    updateWake(dt);
    updateFlyingCoins(dt);
    updateShots(dt);
    updatePulledProps(dt);

    if (human.state === "run" && human.invuln <= 0 && !human.dashing && !tornado.hopping) {
      const dist = Math.hypot(human.x - tornado.x, human.y - tornado.y);
      if (dist < CONFIG.catchDistance + CONFIG.humanRadius + CONFIG.tornadoRadius * 0.15) catchHuman();
    }
  }

  function update(dt) {
    if (freeze > 0) {
      freeze -= dt;
      animT += dt;
      return;
    }
    animT += dt;
    updateButterflies(dt);
    updateParticles(dt);
    refreshPads(dt);
    const startEdge = pollPadStart();
    if (shoutT > 0) shoutT -= dt;
    if (plusT > 0) plusT -= dt;
    if (shake > 0) shake = Math.max(0, shake - dt * 4);

    if (mode === "pause") {
      readDash();
      readHop();
      readShot();
      return;
    }
    if (mode === "menu" || mode === "ended") {
      if (startEdge) startMatch(mode === "ended" ? vsAI : false);
      return;
    }

    if (mode === "countdown") {
      const beat = countN > 0 ? 1000 : 600;
      if (!document.hidden && performance.now() - countBeatAt >= beat) {
        countBeatAt = performance.now();
        countN -= 1;
        if (countN > 0) sfxTick();
        else if (countN === 0) sfxGo();
        else {
          mode = "play";
          playT = 0;
          dashHeld = dashDown();
          jumpHeld = jumpDown();
          shotHeld = shootDown();
          primePadHeld();
        }
      }
      return;
    }

    updatePlay(dt);
  }

  function px(x, y, w, h, color) {
    ctx.fillStyle = color;
    ctx.fillRect(Math.round(x), Math.round(y), w, h);
  }

  function blit(rows, ox, oy, flip, override) {
    const h = rows.length;
    const w = rows[0].length;
    const left = Math.round(ox);
    const top = Math.round(oy);
    for (let y = 0; y < h; y++) {
      const row = rows[y];
      for (let x = 0; x < w; x++) {
        const ch = row[flip ? w - 1 - x : x];
        if (!ch || ch === "." || ch === " ") continue;
        ctx.fillStyle = override || PAL[ch] || "#ff00ff";
        ctx.fillRect(left + x, top + y, 1, 1);
      }
    }
  }

  function blitOutlined(rows, ox, oy, flip, outline) {
    blit(rows, ox + 1, oy, flip, outline);
    blit(rows, ox - 1, oy, flip, outline);
    blit(rows, ox, oy + 1, flip, outline);
    blit(rows, ox, oy - 1, flip, outline);
    blit(rows, ox, oy, flip, null);
  }

  function humanRows() {
    return TORSO.concat(LEGS[human.frame] || LEGS[0]);
  }

  function fillEllipse(cx, cy, rx, ry, color) {
    ctx.fillStyle = color;
    const x0 = Math.floor(cx - rx - 1);
    const y0 = Math.floor(cy - ry - 1);
    const x1 = Math.ceil(cx + rx + 1);
    const y1 = Math.ceil(cy + ry + 1);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy <= 1) ctx.fillRect(x, y, 1, 1);
      }
    }
  }

  function drawShadow(x, y, rx) {
    ctx.fillStyle = "rgba(48, 78, 32, 0.28)";
    ctx.beginPath();
    ctx.ellipse(Math.round(x), Math.round(y), rx, Math.max(3, rx * 0.38), 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawMountain(c, r) {
    const theme = mapTheme();
    if (theme === "desert") drawDune(c, r);
    else if (theme === "volcano") drawVolcanoRock(c, r);
    else drawSnowPeak(c, r);
  }

  function drawSnowPeak(c, r) {
    const x = c * TILE;
    const y = r * TILE;
    const peak = 8 + Math.floor(hash(c, r) * 5);
    px(x, y, 16, 16, "#8d97aa");
    px(x, y + 12, 16, 4, "#697386");
    px(x, y, 5, 12, "#c5cedf");
    px(x + 13, y + 2, 3, 12, "#5c6576");
    px(x, y + 15, 16, 1, "#4a5364");
    for (let i = 0; i < peak; i++) {
      const w = Math.max(2, 14 - Math.floor((i / peak) * 12));
      const left = x + ((16 - w) >> 1);
      const snow = i > peak - 4;
      px(left, y - i, w, 1, snow ? "#f7fbff" : (i % 2 ? "#9aa6ba" : "#848ea2"));
    }
  }

  function drawDune(c, r) {
    const x = c * TILE;
    const y = r * TILE;
    px(x, y, 16, 16, "#c4843a");
    px(x, y, 16, 3, "#e2b56a");
    px(x, y + 13, 16, 3, "#a56b2e");
    const peak = hash(c, r) > 0.5 ? 3 : 2;
    for (let i = 0; i < peak; i++) {
      const w = 16 - i * 4;
      px(x + ((16 - w) >> 1), y - i, w, 1, "#d7a15a");
    }
  }

  function drawVolcanoRock(c, r) {
    const x = c * TILE;
    const y = r * TILE;
    const n = hash(c, r);
    px(x, y, 16, 16, "#3a332f");
    px(x, y + 12, 16, 4, "#2a2421");
    px(x, y, 16, 3, "#6b625c");
    const peak = 6 + Math.floor(n * 4);
    for (let i = 0; i < peak; i++) {
      const w = Math.max(2, 14 - Math.floor((i / peak) * 12));
      const left = x + ((16 - w) >> 1);
      const crater = i > peak - 2;
      px(left, y - i, w, 1, crater ? "#ff5a1f" : "#4e4642");
    }
  }

  function drawLavaTile(c, r) {
    const x = c * TILE;
    const y = r * TILE;
    px(x, y, 16, 16, "#ff5a1f");
    px(x, y, 16, 2, "#c2410c");
    px(x, y + 14, 16, 2, "#c2410c");
    const n = hash(c, r);
    if (n < 0.35) return;
    const cycle = (animT * 0.65 + n * 4) % 1;
    const by = y + 12 - Math.floor(cycle * 9);
    if (by <= y + 2 || by >= y + 13) return;
    const size = cycle > 0.82 ? 3 : 2;
    px(x + 3 + Math.floor(n * 8), by, size, size, cycle > 0.82 ? "#fff1a8" : "#ffb703");
  }

  function drawPathTile(c, r, theme) {
    const x = c * TILE;
    const y = r * TILE;
    if (theme === "volcano") {
      px(x, y, 16, 16, "#453e3a");
      return;
    }
    if (theme === "desert") {
      px(x, y, 16, 16, "#f3d7a2");
      return;
    }
    px(x, y, 16, 16, (c + r) % 2 ? "#f0d7a4" : "#e7c78a");
    px(x, y + 14, 16, 2, "#d7b274");
    if (hash(c, r) > 0.72) px(x + 4, y + 5, 2, 1, "#f8e6c0");
  }

  function drawOasisTile(c, r) {
    const x = c * TILE;
    const y = r * TILE;
    px(x, y, 16, 16, "#2eb8c4");
    px(x, y, 16, 2, "#7ed468");
    px(x, y + 14, 16, 2, "#5cb864");
    px(x + 6, y + 6, 3, 2, "#dff6ff");
  }

  function drawPlainTile(c, r, theme) {
    const x = c * TILE;
    const y = r * TILE;
    const n = hash(c, r);
    if (theme === "desert") {
      px(x, y, 16, 16, "#f3d7a2");
      return;
    }
    if (theme === "volcano") {
      px(x, y, 16, 16, "#453e3a");
      return;
    }
    const green = n > 0.66 ? "#7ed468" : n > 0.33 ? "#68be54" : "#8cdc78";
    px(x, y, 16, 16, green);
    if (n > 0.8) px(x + 3, y + 11, 2, 2, "#59a84a");
    if (n > 0.93) {
      const flower = n > 0.975 ? "#ff8fb8" : n > 0.95 ? "#ffe56a" : "#fffaf0";
      px(x + 8, y + 6, 2, 2, flower);
      px(x + 8, y + 8, 1, 2, "#3f8f45");
    }
  }

  function drawHouse(p) {
    const x = p.pulling ? p.px - (p.w * TILE) / 2 : p.c * TILE;
    const y = p.pulling ? p.py - p.h * TILE + 2 : p.r * TILE;
    const o = Math.round(Math.sin(animT * 38) * Math.min(2, p.wind * 6));
    px(x + 4 + o, y + 16, 24, 16, "#ffe3c2");
    px(x + 4 + o, y + 16, 4, 16, "#f3d0a4");
    px(x + 4 + o, y + 28, 24, 4, "#e7c091");
    for (let i = 0; i < 10; i++) {
      const w = 28 - i * 2;
      const left = x + ((32 - w) >> 1) + o;
      px(left, y + 16 - i, w, 2, i > 6 ? "#ffb0a4" : "#ff6f68");
    }
    px(x + 22 + o, y + 2, 4, 7, "#e07b6c");
    px(x + 21 + o, y + 1, 6, 2, "#c45d55");
    px(x + 13 + o, y + 22, 6, 10, "#c4814a");
    px(x + 17 + o, y + 26, 1, 1, "#ffe08a");
    px(x + 7 + o, y + 20, 5, 5, "#9ee7ff");
    px(x + 20 + o, y + 20, 5, 5, "#9ee7ff");
    px(x + 8 + o, y + 21, 2, 2, "#ffffff");
    px(x + 21 + o, y + 21, 2, 2, "#ffffff");
    px(x + 5, y + 30, 7, 2, "#5cb864");
    px(x + 6, y + 29, 2, 2, "#ff8fb8");
    px(x + 9, y + 29, 2, 2, "#ffe56a");
    if (p.wind > 0.12) px(x + 10 + o, y + 20, 1, 7, "#8d6244");
    if (p.wind > 0.28) px(x + 18 + o, y + 23, 6, 1, "#8d6244");
  }

  function drawTree(p) {
    const x = p.pulling ? p.px : p.c * TILE + 8;
    const base = p.pulling ? p.py : p.r * TILE + 15;
    const sway = p.pulling
      ? 0
      : Math.round(Math.sin(animT * 2.2 + p.c) + Math.min(3, p.wind * 10) * Math.sin(animT * 32));
    px(x - 2, base - 8, 4, 8, "#8a5a32");
    px(x - 1, base - 8, 1, 8, "#d29a62");
    fillEllipse(x + sway, base - 15, 7, 6, "#3e9b49");
    fillEllipse(x - 4 + sway, base - 13, 5, 4, "#57b85c");
    fillEllipse(x + 4 + sway, base - 12, 4, 4, "#8ed56f");
    fillEllipse(x - 1 + sway, base - 18, 3, 2, "#dff6c4");
  }

  function drawCactus(p) {
    const x = p.pulling ? p.px : p.c * TILE + 8;
    const base = p.pulling ? p.py : p.r * TILE + 15;
    const sway = p.pulling ? 0 : Math.round(Math.sin(animT * 2 + p.c) + Math.min(2, p.wind * 8));
    px(x - 3 + sway, base - 16, 6, 14, "#2f8a3e");
    px(x - 2 + sway, base - 15, 2, 12, "#8ed56f");
    px(x - 8 + sway, base - 12, 5, 4, "#2f8a3e");
    px(x - 8 + sway, base - 16, 4, 5, "#3e9b49");
    px(x + 3 + sway, base - 9, 5, 4, "#3e9b49");
    px(x + 4 + sway, base - 13, 4, 5, "#57b85c");
    px(x - 2 + sway, base - 18, 4, 3, "#ff8fb8");
    px(x - 1 + sway, base - 19, 2, 2, "#ffe56a");
    px(x - 2 + sway, base - 10, 1, 2, "#214c28");
    px(x + 1 + sway, base - 10, 1, 2, "#214c28");
    px(x - 1 + sway, base - 7, 2, 1, "#214c28");
  }

  function drawCamel(p) {
    const x = p.pulling ? p.px : p.c * TILE + 8;
    const base = p.pulling ? p.py : p.r * TILE + 15;
    const bob = p.pulling ? 0 : Math.round(Math.sin(animT * 2.2 + p.c));
    const lean = p.pulling ? 0 : Math.round(Math.min(2, p.wind * 5));
    ctx.save();
    ctx.translate(Math.round(x), Math.round(base + bob));
    if ((p.c + p.r) % 2 === 0) ctx.scale(-1, 1);
    px(-6, -4, 2, 4, "#a87432");
    px(-2, -4, 2, 4, "#c48a3a");
    px(2, -4, 2, 4, "#a87432");
    px(5, -4, 2, 4, "#c48a3a");
    px(-7 + lean, -9, 14, 5, "#e6b15a");
    px(-5 + lean, -10, 8, 2, "#f0c57a");
    px(-5 + lean, -14, 4, 5, "#e6b15a");
    px(lean, -15, 4, 6, "#f0c57a");
    px(6 + lean, -17, 3, 9, "#e6b15a");
    px(5 + lean, -20, 8, 4, "#f0c57a");
    px(12 + lean, -19, 3, 2, "#c48a3a");
    px(8 + lean, -19, 2, 2, "#3a2f2a");
    px(8 + lean, -19, 1, 1, "#ffffff");
    px(6 + lean, -22, 2, 2, "#e6b15a");
    px(-9 + lean, -8, 3, 2, "#c48a3a");
    px(-9 + lean, -6, 1, 3, "#a87432");
    ctx.restore();
  }

  function drawTent(p) {
    const x = p.pulling ? p.px - 14 : p.c * TILE + 2;
    const ground = p.pulling ? p.py : (p.r + p.h) * TILE - 1;
    const o = p.pulling ? 0 : Math.round(Math.sin(animT * 14) * Math.min(1, p.wind * 2));
    px(x + o, ground - 3, 28, 3, "#a67c45");
    px(x + 2 + o, ground - 9, 24, 7, "#f4e4c4");
    px(x + 6 + o, ground - 13, 16, 5, "#e7d3a8");
    px(x + 11 + o, ground - 15, 6, 3, "#f7f1e4");
    px(x + 11 + o, ground - 11, 6, 8, "#6b5344");
    px(x + 12 + o, ground - 10, 4, 7, "#2c241c");
    px(x + 3 + o, ground - 8, 4, 5, "#c4a574");
    px(x + 21 + o, ground - 8, 4, 5, "#c4a574");
    px(x - 1, ground - 2, 2, 2, "#6b4a32");
    px(x + 27, ground - 2, 2, 2, "#6b4a32");
  }

  function drawMonster(p) {
    const x = p.pulling ? p.px : p.c * TILE + 8;
    const base = p.pulling ? p.py : p.r * TILE + 13;
    const bob = p.pulling ? 0 : Math.round(Math.sin(animT * 3 + p.c));
    const y = base + bob;
    const v = p.variant || 0;
    if (v === 1) {
      fillEllipse(x, y - 5, 5, 7, "#ff7a1a");
      fillEllipse(x, y - 8, 3, 3, "#ffb703");
      px(x - 1, y - 13, 2, 3, "#ffd166");
      px(x - 3, y - 7, 2, 2, "#fff6e0");
      px(x + 1, y - 7, 2, 2, "#fff6e0");
      px(x - 3, y - 7, 1, 1, "#3a2f2a");
      px(x + 2, y - 7, 1, 1, "#3a2f2a");
      px(x - 2, y - 3, 4, 1, "#7c2d12");
    } else if (v === 2) {
      fillEllipse(x, y - 3, 8, 4, "#e85d04");
      fillEllipse(x, y - 5, 5, 3, "#ffb703");
      px(x - 5, y - 6, 3, 3, "#fff6e0");
      px(x + 2, y - 8, 2, 2, "#fff6e0");
      px(x - 4, y - 5, 2, 2, "#3a2f2a");
      px(x + 2, y - 8, 1, 1, "#3a2f2a");
      px(x - 2, y - 2, 4, 1, "#7c2d12");
      px(x - 6, y, 2, 2, "#ff7a1a");
      px(x + 4, y, 2, 2, "#ff7a1a");
    } else {
      fillEllipse(x, y - 4, 6, 5, "#ff7a1a");
      fillEllipse(x, y - 6, 4, 3, "#ffb703");
      px(x - 4, y - 6, 2, 2, "#fff6e0");
      px(x + 2, y - 6, 2, 2, "#fff6e0");
      px(x - 4, y - 6, 1, 1, "#3a2f2a");
      px(x + 2, y - 6, 1, 1, "#3a2f2a");
      px(x - 2, y - 3, 4, 1, "#7c2d12");
      px(x - 1, y - 2, 2, 1, "#ffe566");
    }
  }

  function drawTornado(x, y) {
    const hopping = tornado.hopping;
    const spin = animT * (hopping ? 14 : 7);
    if (!hopping) {
      const sway = Math.sin(spin) * 0.6;
      px(x - 1, y - 7, 2, 7, "#b7c4e6");
      px(x + sway, y - 11, 2, 5, "#d5def5");
    }
    const layers = hopping
      ? [
          { dy: -10, rx: 8, ry: 3.5, c: "#dce6ff", o: 2 },
          { dy: -16, rx: 13, ry: 5, c: "#f7f8ff", o: -1 },
          { dy: -23, rx: 17, ry: 7, c: "#ffffff", o: 1.4 },
        ]
      : [
          { dy: -12, rx: 3.2, ry: 2.2, c: "#e7eeff", o: 0.4 },
          { dy: -16, rx: 5.5, ry: 3, c: "#f4f7ff", o: -0.7 },
          { dy: -21, rx: 8.5, ry: 4, c: "#ffffff", o: 1 },
          { dy: -27, rx: 12, ry: 5, c: "#e7eeff", o: -1.2 },
          { dy: -34, rx: 15, ry: 6.5, c: "#ffffff", o: 1.5 },
        ];
    for (const layer of layers) {
      const ox = Math.sin(spin + layer.dy) * layer.o;
      fillEllipse(x + ox, y + layer.dy, layer.rx + 1, layer.ry + 0.7, "#7f8cae");
      fillEllipse(x + ox, y + layer.dy, layer.rx, layer.ry, layer.c);
    }
    const faceY = y + (hopping ? -20 : -30);
    const ang = Math.atan2(human.y - y, human.x - x);
    const lx = Math.round(Math.cos(ang));
    const ly = Math.round(Math.sin(ang) * 0.7);
    px(x - 4, faceY - 1, 3, 3, "#ffffff");
    px(x + 2, faceY - 1, 3, 3, "#ffffff");
    px(x - 3 + lx, faceY + ly, 2, 2, "#2c3148");
    px(x + 3 + lx, faceY + ly, 2, 2, "#2c3148");
    px(x - 3 + lx, faceY + ly, 1, 1, "#ffffff");
    px(x - 3, faceY + 3, 1, 1, "#ffb4c4");
    px(x + 3, faceY + 3, 1, 1, "#ffb4c4");
    px(x - 2, faceY + 4, 1, 1, "#3a4258");
    px(x - 1, faceY + 5, 1, 1, "#3a4258");
    px(x, faceY + 5, 1, 1, "#3a4258");
    px(x + 1, faceY + 5, 1, 1, "#3a4258");
    px(x + 2, faceY + 4, 1, 1, "#3a4258");
  }

  function drawHumanAt(x, y, frame, flip, outline, rot) {
    const rows = TORSO.concat(LEGS[frame] || LEGS[0]);
    const w = rows[0].length;
    const h = rows.length;
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    if (rot) ctx.rotate(rot);
    blitOutlined(rows, -Math.floor(w / 2), -h + 2, flip, outline);
    ctx.restore();
  }

  function drawCoin(coin) {
    const bob = coin.flying ? 0 : Math.round(Math.sin(animT * 4 + (coin.phase || 0)));
    const wide = !coin.flying && Math.sin(animT * 6 + (coin.phase || 0)) > 0;
    const rw = wide ? 3 : 1;
    const x = Math.round(coin.x);
    const y = Math.round(coin.y + bob);
    ctx.save();
    if (coin.flying) {
      ctx.translate(x, y - 2);
      ctx.rotate(coin.rot || 0);
      ctx.translate(-x, -(y - 2));
    }
    px(x - rw - 1, y - 5, rw * 2 + 3, 9, "#8a5a12");
    px(x - rw, y - 4, rw * 2 + 1, 7, "#f0b429");
    px(x - Math.max(0, rw - 1), y - 3, Math.max(1, rw * 2 - 1), 5, "#ffe56a");
    if (wide) px(x, y - 2, 1, 3, "#fff6c8");
    ctx.restore();
  }

  function drawCoins(flying) {
    for (const coin of coins) {
      if (coin.taken) continue;
      if (!!coin.flying !== flying) continue;
      drawCoin(coin);
    }
  }

  function drawAbilityPip(x, y, ready, cool, max, color) {
    px(x - 1, y - 1, 6, 6, "#3a2f2a");
    if (ready) {
      px(x, y, 4, 4, color);
      return;
    }
    px(x, y, 4, 4, "#f4efe4");
    const fill = Math.max(0, Math.min(4, Math.floor(4 * (1 - cool / max))));
    if (fill > 0) px(x, y + (4 - fill), 4, fill, color);
  }

  function drawHopPip() {
    if (!tornado) return;
    const y = Math.round(tornado.y) - 48;
    const hopX = Math.round(tornado.x) - 10;
    const shotX = Math.round(tornado.x) + 4;
    drawAbilityPip(hopX, y, !tornado.hopping && tornado.hopCool <= 0, tornado.hopCool, CONFIG.hopCooldown, "#d7c6ff");
    drawAbilityPip(
      shotX,
      y,
      !tornado.hopping && tornado.shotCool <= 0,
      Math.max(0, tornado.shotCool),
      shotCooldown(),
      "#7ec8ff"
    );
  }

  function drawMiniTwister(shot) {
    drawShadow(shot.x, shot.y + 4, 3);
    const layers = [
      { dy: -2, rx: 2.2, ry: 1.5 },
      { dy: -6, rx: 3.6, ry: 2 },
      { dy: -10, rx: 5, ry: 2.4 },
      { dy: -14, rx: 6.6, ry: 2.9 },
    ];
    for (const layer of layers) {
      const ox = Math.sin(shot.spin + layer.dy) * 1.6;
      fillEllipse(shot.x + ox, shot.y + layer.dy, layer.rx + 0.8, layer.ry + 0.45, "#7f8cae");
      fillEllipse(shot.x + ox, shot.y + layer.dy, layer.rx, layer.ry, layer.dy < -8 ? "#ffffff" : "#e4ecff");
    }
    px(shot.x + Math.cos(shot.spin) * 6 - 1, shot.y - 13 + Math.sin(shot.spin) * 2, 2, 2, "#ffffff");
  }

  function drawSwirls() {
    for (const s of swirls) {
      if (s.age < s.delay) continue;
      const shrink = s.phase === "suck" ? 1 - s.height * 0.4 : 1;
      ctx.save();
      ctx.translate(Math.round(s.x), Math.round(s.y));
      ctx.rotate(s.rot);
      ctx.scale(shrink, shrink);
      if (s.kind === "tree") {
        px(-1, -1, 3, 6, "#8a5a32");
        fillEllipse(0, -7, 6, 5, "#3e9b49");
        fillEllipse(-3, -6, 4, 3, "#67c86a");
      } else if (s.kind === "cactus") {
        px(-2, -2, 4, 10, "#2f8a3e");
        px(-6, -4, 4, 3, "#3e9b49");
        px(2, -2, 4, 3, "#57b85c");
        px(-2, -6, 4, 3, "#ff8fb8");
      } else if (s.kind === "camel") {
        px(-6, 0, 10, 4, "#e6b15a");
        px(-3, -4, 3, 4, "#f0c57a");
        px(1, -5, 3, 5, "#e6b15a");
        px(5, -6, 2, 7, "#e6b15a");
        px(4, -8, 5, 3, "#f0c57a");
        px(7, -7, 1, 1, "#3a2f2a");
      } else if (s.kind === "tent") {
        px(-8, -1, 16, 6, "#e7d3a8");
        px(-6, -4, 12, 3, "#c4a574");
        px(-2, -6, 4, 2, "#f4efe4");
        px(-2, -2, 3, 4, "#3a2f2a");
      } else if (s.kind === "monster") {
        fillEllipse(0, 0, 8, 6, "#ff7a1a");
        px(-4, -3, 3, 3, "#fff6e0");
        px(2, -3, 3, 3, "#fff6e0");
        px(-3, -2, 1, 1, "#3a2f2a");
        px(3, -2, 1, 1, "#3a2f2a");
      } else if (s.kind === "house") {
        px(-7, -2, 14, 9, "#ffe3c2");
        px(-8, -7, 16, 6, "#ff6f68");
        px(-2, 1, 4, 6, "#c4814a");
        px(3, 0, 3, 3, "#9ee7ff");
      } else {
        px(-Math.floor(s.w / 2), -Math.floor(s.h / 2), s.w, s.h, s.color);
      }
      ctx.restore();
    }
  }

  function drawDashPips() {
    if (!human || human.state !== "run") return;
    const y = Math.round(human.y) - 22;
    for (let i = 0; i < CONFIG.dashCharges; i++) {
      const x = Math.round(human.x) - 7 + i * 7;
      px(x - 1, y - 1, 6, 6, "#3a2f2a");
      if (i < human.charges) {
        px(x, y, 4, 4, "#ffe56a");
      } else if (i === human.charges) {
        px(x, y, 4, 4, "#f4efe4");
        const fill = Math.floor(4 * (human.chargeT / CONFIG.dashRecharge));
        if (fill > 0) px(x, y, fill, 4, "#ffe56a");
      } else {
        px(x, y, 4, 4, "#f4efe4");
      }
    }
  }

  function drawWake() {
    for (const mark of wake) {
      const fade = Math.max(0, mark.life / mark.max);
      const color = mark.theme === "desert" ? "#c9964e" : mark.theme === "volcano" ? "#2c2623" : "#4f9d43";
      const bx = mark.x - (mark.dx || 0) * 5;
      const by = mark.y - (mark.dy || 0) * 3;
      ctx.globalAlpha = fade * 0.8;
      px(bx - 5, by - 1, 4, 2, color);
      px(bx + 1, by + 1, 3, 2, color);
      ctx.globalAlpha = 1;
    }
  }

  function drawButterfly(b) {
    const flap = Math.sin(animT * 14 + b.a) > 0 ? 3 : 1;
    const x = Math.round(b.x);
    const y = Math.round(b.y);
    px(x - flap, y, flap, 2, b.c);
    px(x + 1, y, flap, 2, b.c);
    px(x, y, 1, 2, "#3a2f2a");
  }

  function drawGround() {
    const theme = mapTheme();
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (isMountain(c, r)) continue;
        if (isLava(c, r)) {
          drawLavaTile(c, r);
          continue;
        }
        if (isPath(c, r)) drawPathTile(c, r, theme);
        else if (theme === "desert" && currentMap().oasis && currentMap().oasis(c, r)) drawOasisTile(c, r);
        else drawPlainTile(c, r, theme);
      }
    }
    drawWake();
    if ((mode === "play" || mode === "countdown" || mode === "pause") && theme === "meadow") {
      for (let r = 0; r < ROWS; r++) {
        for (let c = 0; c < COLS; c++) {
          if (isMountain(c, r) || isLava(c, r) || isPath(c, r)) continue;
          if (theme === "desert" && currentMap().oasis && currentMap().oasis(c, r)) continue;
          const cx = (c + 0.5) * TILE;
          const cy = (r + 0.5) * TILE;
          const dx = cx - tornado.x;
          const dy = cy - tornado.y;
          const dist = Math.hypot(dx, dy);
          if (dist > 70 || dist === 0) continue;
          const bend = Math.round((dx / dist) * (1 - dist / 70) * 3);
          const blade = theme === "desert" ? "#c9964e" : "#4f9d43";
          const blade2 = theme === "desert" ? "#a67c45" : "#3e8a38";
          px(c * TILE + 5 + bend, r * TILE + 8, 1, 3, blade);
          px(c * TILE + 10 + bend, r * TILE + 10, 1, 2, blade2);
        }
      }
    }
    for (const d of decals) {
      if (d.kind === "stump") {
        px(d.x - 3, d.y - 3, 6, 4, "#8a5a32");
        px(d.x - 2, d.y - 3, 4, 2, "#e4c59a");
      } else if (d.kind === "saddle") {
        px(d.x - 5, d.y - 2, 8, 3, "#c48a3a");
        px(d.x - 2, d.y - 3, 3, 2, "#e25b4a");
      } else if (d.kind === "cloth") {
        px(d.x - 5, d.y - 2, 7, 3, "#f7f1e4");
        px(d.x + 1, d.y - 1, 4, 2, "#e25b4a");
      } else if (d.kind === "ember") {
        px(d.x - 3, d.y - 2, 6, 3, "#5c534e");
        px(d.x - 1, d.y - 2, 2, 2, "#ff7a1a");
      } else {
        px(d.x - 6, d.y, 5, 3, "#e7c091");
        px(d.x + 1, d.y - 2, 4, 3, "#ff8d84");
        px(d.x - 2, d.y + 2, 3, 2, "#c4814a");
      }
    }
  }

  function drawPropSprite(p) {
    const sx = p.pulling ? p.px : p.c * TILE + (p.w * TILE) / 2;
    const sy = p.pulling ? p.py : (p.r + p.h) * TILE - 2;
    const wide = p.kind === "house" || p.kind === "tent";
    drawShadow(sx, sy, wide ? 12 : 7);
    ctx.save();
    if (p.pulling) {
      ctx.translate(p.px, p.py - 8);
      ctx.rotate(p.spin);
      ctx.translate(-p.px, -(p.py - 8));
    }
    if (p.kind === "house") drawHouse(p);
    else if (p.kind === "cactus") drawCactus(p);
    else if (p.kind === "camel") drawCamel(p);
    else if (p.kind === "tent") drawTent(p);
    else if (p.kind === "monster") drawMonster(p);
    else drawTree(p);
    ctx.restore();
  }

  function render() {
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (shake > 0 && !reducedMotion) {
      ctx.translate((Math.random() - 0.5) * shake * 2, (Math.random() - 0.5) * shake * 2);
    }
    ctx.fillStyle = "#8ec8f8";
    ctx.fillRect(0, 0, WORLD_W, WORLD_H + SKY);
    ctx.translate(0, SKY);
    const theme = mapTheme();
    ctx.fillStyle = theme === "desert" ? "#f3d7a2" : theme === "volcano" ? "#453e3a" : "#6fc45c";
    ctx.fillRect(0, 0, WORLD_W, WORLD_H);
    drawGround();
    drawCoins(false);

    const drawables = [];
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (!isMountain(c, r)) continue;
        drawables.push({ y: (r + 1) * TILE, draw: () => drawMountain(c, r) });
      }
    }
    for (const p of props) {
      if (!p.alive || p.pulling) continue;
      drawables.push({
        y: (p.r + p.h) * TILE,
        draw: () => drawPropSprite(p),
      });
    }
    const humanVisible = human.state === "run" || (
      human.x > -40 && human.x < WORLD_W + 40 && human.y > -48 && human.y < WORLD_H + 24
    );
    if (humanVisible) {
    drawables.push({
      y: human.state === "fly" && human.flyPhase === "suck" ? human.y + 36 : human.y,
        draw: () => {
          for (const g of ghosts) {
            ctx.save();
            ctx.globalAlpha = Math.max(0, g.life * 3);
            drawHumanAt(g.x, g.y, g.frame, g.flip, "#fff4b0", 0);
            ctx.restore();
          }
          const hop = mode === "ended" && result === "human" ? Math.abs(Math.sin(animT * 7)) * 4 : 0;
          const outline = human.state === "pull"
            ? "#9ee7ff"
            : human.dashing ? "#fff4b0" : human.invuln > 0 ? "#ffe56a" : "#3a2f2a";
          if (human.state === "run" || human.state === "pull") drawShadow(human.x, human.y, human.state === "pull" ? 4 : 6);
          const alpha = human.invuln > 0 ? 0.55 + Math.sin(animT * 10) * 0.2 : 1;
          ctx.save();
          ctx.globalAlpha = alpha;
          drawHumanAt(
            human.x,
            human.y - hop,
            human.frame,
            human.flip,
            outline,
            human.state === "fly" || human.state === "pull" ? human.rot : 0
          );
          ctx.restore();
        },
      });
    }
    for (const b of butterflies) {
      drawables.push({ y: b.y, draw: () => drawButterfly(b) });
    }
    drawables.sort((a, b) => a.y - b.y);
    for (const item of drawables) item.draw();

    for (const p of props) {
      if (p.alive && p.pulling) drawPropSprite(p);
    }
    for (const shot of shots) drawMiniTwister(shot);
    if (tornado) {
      const lift = tornado.hopping
        ? Math.sin(Math.min(tornado.hopT / CONFIG.hopTime, 1) * Math.PI) * 18
        : 0;
      drawShadow(tornado.x, tornado.y, tornado.hopping ? 4 : 3);
      drawTornado(tornado.x, tornado.y - lift);
    }
    drawCoins(true);

    for (const p of particles) {
      const t = 1 - p.age / p.life;
      ctx.globalAlpha = Math.max(0, t);
      px(p.x, p.y, p.size, p.size, p.color);
      ctx.globalAlpha = 1;
    }
    drawSwirls();
    drawDashPips();
    drawHopPip();

    if (DEBUG) {
      ctx.strokeStyle = "rgba(20, 80, 160, 0.9)";
      ctx.beginPath();
      ctx.arc(human.x, human.y, CONFIG.humanRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = "rgba(120, 60, 180, 0.9)";
      ctx.beginPath();
      ctx.arc(tornado.x, tornado.y, CONFIG.tornadoRadius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function place(node, x, y) {
    node.style.left = (x / WORLD_W) * 100 + "%";
    node.style.top = ((y + SKY) / (WORLD_H + SKY)) * 100 + "%";
  }

  function syncUI() {
    el.hearts.innerHTML = "";
    const total = mode === "menu" ? settings.lives : Math.max(settings.lives, lives);
    const shownLives = mode === "menu" ? settings.lives : lives;
    for (let i = 0; i < (mode === "menu" ? settings.lives : settings.lives); i++) {
      const span = document.createElement("span");
      span.textContent = "♥";
      span.className = i < shownLives ? "full" : "empty";
      el.hearts.appendChild(span);
    }
    el.timer.textContent = coinsGot + "/" + coins.length;
    el.timer.classList.remove("urgent");
    el.score.textContent = score + " poäng";
    if (el.coins) el.coins.textContent = coinsGot + " mynt";
    el.modeNote.hidden = !vsAI || mode === "menu" || mode === "ended";
    el.menu.hidden = mode !== "menu";
    el.end.hidden = mode !== "ended";
    el.pause.hidden = mode !== "pause";
    el.countdown.hidden = mode !== "countdown";
    el.countdown.textContent = countN > 0 ? String(countN) : "Kör!";
    const showReturn = mode === "play" && human && human.state === "fly" && lives > 0;
    el.ret.hidden = !showReturn;
    if (showReturn) el.ret.textContent = "Tillbaka om " + Math.max(1, Math.ceil(human.returnIn));
    const showTags = mode === "countdown" || (mode === "play" && playT < 4);
    el.tagH.hidden = !showTags || !human || human.state !== "run";
    el.tagT.hidden = !showTags;
    if (human && !el.tagH.hidden) place(el.tagH, human.x, human.y - 20);
    if (tornado && !el.tagT.hidden) place(el.tagT, tornado.x, tornado.y - 28);
    el.shout.hidden = shoutT <= 0 || !human;
    if (!el.shout.hidden) {
      el.shout.textContent = shoutText;
      place(el.shout, human.x, human.y - 28);
    }
    el.plus.hidden = plusT <= 0 || !tornado;
    if (!el.plus.hidden) place(el.plus, tornado.x, tornado.y - 36);
    el.sound.textContent = settings.sound ? "Ljud på" : "Ljud av";
    el.livesVal.textContent = String(settings.lives);
    if (el.mapHint) el.mapHint.textContent = currentMap().hint;
    const waiting = padWaitingText();
    if (el.padNote) {
      el.padNote.hidden = waiting === "";
      el.padNote.textContent = waiting;
    }
    if (el.padBanner) {
      const showBanner = waiting !== "" && mode !== "menu" && mode !== "ended";
      el.padBanner.hidden = !showBanner;
      el.padBanner.textContent = waiting;
    }
    if (el.helpHuman) {
      el.helpHuman.innerHTML = settings.humanControl === "pad"
        ? "<b>Människan</b> spak eller styrkors · rusa <kbd>A</kbd>"
        : keysMarkup(settings.humanKeys, "human");
    }
    if (el.helpTornado) {
      el.helpTornado.innerHTML = vsAI
        ? "<b>Tornadon</b> datorn"
        : settings.tornadoControl === "pad"
          ? "<b>Tornadon</b> spak eller styrkors · hoppa <kbd>A</kbd> · skjut <kbd>X</kbd>"
          : keysMarkup(settings.tornadoKeys, "tornado");
    }
    const humanKeysRow = document.getElementById("human-keys-row");
    const tornadoKeysRow = document.getElementById("tornado-keys-row");
    if (humanKeysRow) humanKeysRow.hidden = settings.humanControl !== "keys";
    if (tornadoKeysRow) tornadoKeysRow.hidden = settings.tornadoControl !== "keys";
    for (const button of document.querySelectorAll("#human-keys button")) {
      button.setAttribute("aria-pressed", button.dataset.keys === settings.humanKeys ? "true" : "false");
    }
    for (const button of document.querySelectorAll("#tornado-keys button")) {
      button.setAttribute("aria-pressed", button.dataset.keys === settings.tornadoKeys ? "true" : "false");
    }
    syncTouch();
    for (const button of document.querySelectorAll(".winds button[data-wind]")) {
      button.setAttribute("aria-pressed", button.dataset.wind === settings.wind ? "true" : "false");
    }
    for (const button of document.querySelectorAll("#human-control button")) {
      button.setAttribute("aria-pressed", button.dataset.control === settings.humanControl ? "true" : "false");
    }
    for (const button of document.querySelectorAll("#tornado-control button")) {
      button.setAttribute("aria-pressed", button.dataset.control === settings.tornadoControl ? "true" : "false");
    }
    for (const button of document.querySelectorAll("#map-picks button")) {
      button.setAttribute("aria-pressed", button.dataset.map === settings.map ? "true" : "false");
    }
    void total;
  }

  function fit() {
    const maxW = window.innerWidth - 28;
    const maxH = window.innerHeight - 168;
    let scale = Math.floor(Math.min(maxW / canvas.width, maxH / canvas.height));
    if (scale < 1) scale = 1;
    if (scale > 4) scale = 4;
    canvas.style.width = canvas.width * scale + "px";
    canvas.style.height = canvas.height * scale + "px";
    const width = canvas.style.width;
    el.hud.style.width = width;
    el.help.style.width = width;
  }

  function keysMarkup(layout, role) {
    const arrows = layout === "arrows";
    const move = arrows
      ? "<kbd>↑</kbd><kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd>"
      : "<kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>";
    const shift = arrows ? "<kbd>Shift</kbd> höger" : "<kbd>Shift</kbd> vänster eller <kbd>F</kbd>";
    if (role === "human") {
      const dash = arrows ? "<kbd>mellanslag</kbd>" : shift;
      return "<b>Människan</b> " + move + " · rusa " + dash;
    }
    if (tornadoEasyKeys()) {
      return "<b>Tornadon</b> " + move + " · hoppa <kbd>mellanslag</kbd> · skjut <kbd>command</kbd> eller <kbd>alt</kbd>";
    }
    if (settings.humanControl === "keys" && settings.humanKeys === "arrows" && settings.tornadoControl === "keys") {
      return "<b>Tornadon</b> " + move + " · hoppa " + shift + " · skjut <kbd>command</kbd> eller <kbd>alt</kbd>";
    }
    return "<b>Tornadon</b> " + move + " · hoppa " + shift + " · skjut <kbd>mellanslag</kbd>";
  }

  function syncTouch() {
    const clusters = [
      ["left", settings.humanKeys, settings.humanKeys === "arrows" ? "Space" : "KeyF"],
      ["right", settings.tornadoKeys, tornadoEasyKeys() ? "Space" : (settings.tornadoKeys === "wasd" ? "KeyF" : "ShiftRight")],
    ];
    for (const [side, layout, action] of clusters) {
      const root = document.querySelector("#touch ." + side);
      if (!root) continue;
      const codes = layout === "arrows"
        ? { u: "ArrowUp", l: "ArrowLeft", d: "ArrowDown", r: "ArrowRight" }
        : { u: "KeyW", l: "KeyA", d: "KeyS", r: "KeyD" };
      for (const [cls, code] of Object.entries(codes)) {
        const button = root.querySelector("." + cls);
        if (button) button.dataset.k = code;
      }
      const dash = root.querySelector(".dash");
      if (dash) dash.dataset.k = action;
      const shoot = root.querySelector(".shoot");
      if (shoot) {
        const spaceTaken = tornadoEasyKeys() || (settings.humanControl === "keys" && settings.humanKeys === "arrows");
        shoot.dataset.k = spaceTaken ? "AltLeft" : "Space";
      }
    }
  }
  function startMatch(ai) {
    vsAI = ai;
    resetMatch();
    mode = "countdown";
    countN = 3;
    countBeatAt = performance.now();
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    sfxTick();
  }

  function goMenu() {
    mode = "menu";
    vsAI = false;
    resetMatch();
  }

  function ac() {
    if (!settings.sound) return null;
    if (!audioCtx) audioCtx = new AudioContext();
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }

  function tone(freq, dur, type, vol, delay) {
    const ctxA = ac();
    if (!ctxA) return;
    const t = ctxA.currentTime + (delay || 0);
    const osc = ctxA.createOscillator();
    const gain = ctxA.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(ctxA.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function noise(dur, freq, vol) {
    const ctxA = ac();
    if (!ctxA) return;
    const count = Math.floor(ctxA.sampleRate * dur);
    const buffer = ctxA.createBuffer(1, count, ctxA.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < count; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / count);
    const src = ctxA.createBufferSource();
    src.buffer = buffer;
    const filter = ctxA.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = freq;
    const gain = ctxA.createGain();
    gain.gain.value = vol;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(ctxA.destination);
    src.start();
  }

  function sfxTick() { tone(620, 0.07, "square", 0.035); }
  function sfxGo() {
    tone(523, 0.1, "square", 0.04);
    tone(659, 0.1, "square", 0.04, 0.09);
    tone(784, 0.16, "square", 0.045, 0.18);
  }
  function sfxDash() { noise(0.12, 900, 0.05); }
  function sfxCatch() {
    tone(392, 0.08, "square", 0.04);
    tone(587, 0.1, "square", 0.045, 0.07);
    tone(784, 0.16, "triangle", 0.05, 0.14);
  }
  function sfxPop() {
    tone(220, 0.07, "square", 0.04);
    noise(0.08, 500, 0.04);
  }
  function sfxReady() { tone(880, 0.05, "square", 0.025); }
  function sfxCoin() {
    tone(880, 0.05, "square", 0.03);
    tone(1320, 0.08, "square", 0.03, 0.05);
  }
  function sfxHop() {
    noise(0.12, 520, 0.045);
    tone(392, 0.1, "triangle", 0.03);
  }
  function sfxShot() {
    noise(0.09, 980, 0.045);
    tone(620, 0.05, "triangle", 0.03);
    tone(980, 0.08, "triangle", 0.035, 0.05);
  }
  function sfxWhoosh() {
    noise(0.18, 740, 0.05);
    tone(520, 0.08, "triangle", 0.03);
    tone(780, 0.12, "triangle", 0.03, 0.06);
  }
  function sfxWin() {
    tone(523, 0.1, "triangle", 0.05);
    tone(659, 0.1, "triangle", 0.05, 0.1);
    tone(784, 0.1, "triangle", 0.05, 0.2);
    tone(1046, 0.2, "triangle", 0.05, 0.3);
  }

  function onKeyDown(e) {
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "AltLeft", "AltRight", "MetaLeft", "MetaRight"].includes(e.code)) {
      e.preventDefault();
    }
    if (e.repeat) return;
    keys.add(e.code);
    if (e.code === "KeyM") {
      settings.sound = !settings.sound;
      saveSettings();
    }
    if (e.code === "Escape") {
      if (mode === "play") {
        mode = "pause";
        if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
      }
      else if (mode === "pause") mode = "play";
      else if (mode === "ended") goMenu();
    }
    if ((e.code === "Space" || e.code === "Enter") && mode === "menu" && e.target.tagName !== "BUTTON" && e.target.tagName !== "SUMMARY") {
      startMatch(false);
    } else if ((e.code === "Space" || e.code === "Enter") && mode === "ended" && e.target.tagName !== "BUTTON") {
      startMatch(vsAI);
    }
  }

  function onKeyUp(e) {
    keys.delete(e.code);
  }

  function changeLives(delta) {
    settings.lives = clamp(settings.lives + delta, 1, 5);
    if (mode === "menu") {
      lives = settings.lives;
      score = 0;
    }
    saveSettings();
  }

  function renderMapPicks() {
    const host = document.getElementById("map-picks");
    host.replaceChildren();
    for (const map of MAPS) {
      const button = document.createElement("button");
      button.type = "button";
      button.dataset.map = map.id;
      button.textContent = map.name;
      button.addEventListener("click", () => {
        settings.map = map.id;
        saveSettings();
        if (mode === "menu" || mode === "ended") resetMatch();
      });
      host.appendChild(button);
    }
  }

  function chooseKeys(role, value) {
    const otherRole = role === "humanKeys" ? "tornadoKeys" : "humanKeys";
    const otherControl = role === "humanKeys" ? "tornadoControl" : "humanControl";
    settings[role] = value === "arrows" ? "arrows" : "wasd";
    if (settings[otherControl] === "keys" && settings[otherRole] === settings[role]) {
      settings[otherRole] = settings[role] === "wasd" ? "arrows" : "wasd";
    }
    saveSettings();
  }

  function chooseControl(role, value) {
    settings[role] = value;
    if (role === "humanControl") padBind.human = null;
    if (role === "tornadoControl") padBind.tornado = null;
    saveSettings();
  }

  function bindHold(button) {
    const down = (e) => {
      e.preventDefault();
      button.setPointerCapture(e.pointerId);
      keys.add(button.dataset.k);
    };
    const up = (e) => {
      e.preventDefault();
      keys.delete(button.dataset.k);
    };
    button.addEventListener("pointerdown", down);
    button.addEventListener("pointerup", up);
    button.addEventListener("pointercancel", up);
  }

  document.getElementById("btn-together").addEventListener("click", () => startMatch(false));
  document.getElementById("btn-practice").addEventListener("click", () => startMatch(true));
  document.getElementById("btn-again").addEventListener("click", () => startMatch(vsAI));
  document.getElementById("btn-menu").addEventListener("click", goMenu);
  document.getElementById("btn-pause-menu").addEventListener("click", goMenu);
  document.getElementById("lives-minus").addEventListener("click", () => changeLives(-1));
  document.getElementById("lives-plus").addEventListener("click", () => changeLives(1));
  renderMapPicks();
  for (const button of document.querySelectorAll("#human-control button")) {
    button.addEventListener("click", () => chooseControl("humanControl", button.dataset.control));
  }
  for (const button of document.querySelectorAll("#tornado-control button")) {
    button.addEventListener("click", () => chooseControl("tornadoControl", button.dataset.control));
  }
  for (const button of document.querySelectorAll("#human-keys button")) {
    button.addEventListener("click", () => chooseKeys("humanKeys", button.dataset.keys));
  }
  for (const button of document.querySelectorAll("#tornado-keys button")) {
    button.addEventListener("click", () => chooseKeys("tornadoKeys", button.dataset.keys));
  }
  for (const button of document.querySelectorAll(".winds button[data-wind]")) {
    button.addEventListener("click", () => {
      settings.wind = button.dataset.wind;
      saveSettings();
    });
  }
  el.sound.addEventListener("click", () => {
    settings.sound = !settings.sound;
    saveSettings();
  });
  for (const button of document.querySelectorAll("#touch button")) bindHold(button);

  window.addEventListener("keydown", (e) => {
    if (mode === "menu" || mode === "ended") return;
    if (e.altKey || e.metaKey) e.preventDefault();
  }, true);
  window.addEventListener("keyup", (e) => {
    if (e.code === "AltLeft" || e.code === "AltRight" || e.code === "MetaLeft" || e.code === "MetaRight") e.preventDefault();
  }, true);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", () => keys.clear());
  window.addEventListener("resize", fit);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && mode === "countdown") countBeatAt = performance.now();
  });
  if (matchMedia("(pointer: coarse)").matches) document.body.classList.add("touch");

  computeTornadoFit();
  selfCheck();
  resetMatch();
  fit();

  if (DEBUG) {
    window.__game = {
      get mode() { return mode; },
      get lives() { return lives; },
      get score() { return score; },
      get timeLeft() { return timeLeft; },
      set timeLeft(v) { timeLeft = v; },
      get human() { return human; },
      get tornado() { return tornado; },
      get props() { return props; },
      get coins() { return coins; },
      get coinsGot() { return coinsGot; },
      get shots() { return shots; },
      get vsAI() { return vsAI; },
      get map() { return settings.map; },
      set map(id) { settings.map = id; resetMatch(); },
      blocked,
      isMountain,
      fit: () => tornadoFit,
      catchHuman,
      fireShot,
      scatterCoins,
    };
  }

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    render();
    syncUI();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
