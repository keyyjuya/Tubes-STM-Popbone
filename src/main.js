/**
 * Titik masuk aplikasi PopBone.
 * Menghubungkan modul capture, landmark, audio_fx, video_fx, dan recorder.
 */
import { startCamera } from "./capture.js";
import { createHandLandmarker, detectHands } from "./landmark.js";
import { createAudioEngine } from "./audio_fx.js";
import { drawFrame, getCoverGeometry, projectLandmarks } from "./video_fx.js";
import { createRecorder } from "./recorder.js";
import { PALETTE, BUBBLE_COLORS, rgba, rgbTriplet } from "./palette.js";

const TAU = Math.PI * 2;

const canvas = document.getElementById("scene");
const ctx = canvas.getContext("2d", { alpha: false });
const video = document.getElementById("cam");

const startScreen = document.getElementById("startScreen");
const startBtn = document.getElementById("startBtn");
const loading = document.getElementById("loading");
const loadingText = document.getElementById("loadingText");
const errorMsg = document.getElementById("errorMsg");
const statusEl = document.getElementById("status");
const fpsEl = document.getElementById("fps");
const recordBtn = document.getElementById("recordBtn");
const stopRecordBtn = document.getElementById("stopRecordBtn");
// Elemen jeda/keluar: kalau index.html belum diperbarui, game tetap bisa jalan.
const optionalEl = (id) =>
  document.getElementById(id) || { addEventListener() {}, hidden: true, disabled: true, textContent: "" };
const pauseBtn = optionalEl("pauseBtn");
const exitBtn = optionalEl("exitBtn");
const pauseScreen = optionalEl("pauseScreen");
const resumeBtn = optionalEl("resumeBtn");
const pauseExitBtn = optionalEl("pauseExitBtn");

const state = {
  video,
  width: canvas.width,
  height: canvas.height,
  geom: getCoverGeometry(video, canvas.width, canvas.height),
  hands: [],
  bubbles: [],
  particles: [],
  ripples: [],
  floaters: [],
  score: 0,
  combo: 0,
  comboWasReady: true,
  level: 1,
  multiplierActive: false,
  multiplierUntil: 0,
  fist: false,
  fistTimer: 0,
  fistLatched: false,
  openPalm: false,
  openPalmTimer: 0,
  openPalmLatched: false,
  openPalmAnchor: null,
  palmAlmost: false,
  bombCooldown: 0,
  clapReadyAt: 0,
  clapCooldownMs: 0,
  clapHintUntil: 0,
  shake: 0,
  flash: 0,
  flashColor: "255,247,230",
  waveText: 0,
  time: 0,
  fps: 60,
  running: false,
  paused: false,
  recording: false,
  spawnTimer: 0,
};

// ---- util ----
const rand = (min, max) => min + Math.random() * (max - min);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// ---- level ----
const LEVEL_SCORE_STEP = 500;
const MAX_LEVEL = 15;
const LEVEL_SPEED_STEP = 0.12;
const CLAP_BONUS_COOLDOWN = 18000;
const BOMB_HOLD_TIME = 0.35;
const STABLE_MOTION = 30;
// Tangan yang bergeser lebih jauh dari ini per frame deteksi (piksel) dianggap menyapu
// terlalu cepat dan TIDAK memecahkan gelembung. Lebih kecil = lebih ketat.
const POP_MAX_MOTION = 45;

function computeLevel() {
  return Math.min(MAX_LEVEL, 1 + Math.floor(state.score / LEVEL_SCORE_STEP));
}

function speedScale(level) {
  return 1 + (level - 1) * LEVEL_SPEED_STEP;
}

// ---- runtime ----
let landmarker = null;
let audio = null;
let audioStream = null;
let recorder = null;
let started = false;
let lastVideoTime = -1;
let lastFrame = performance.now();
let hudAccum = 0;
let rafId = 0;
let pausedAt = 0;
let clapIgnoreUntil = 0;

function setLoading(text) {
  loadingText.textContent = text;
}

function countExtended(lms) {
  const wrist = lms[0];
  const pairs = [
    [4, 3],
    [8, 6],
    [12, 10],
    [16, 14],
    [20, 18],
  ];
  let count = 0;
  for (const [tip, pip] of pairs) {
    if (dist(lms[tip], wrist) > dist(lms[pip], wrist) * 1.06) count++;
  }
  return count;
}

function updateHands(result) {
  const geom = state.geom;
  const prevHands = state.hands;
  state.hands = [];

  if (!result || !result.landmarks || !result.landmarks.length) {
    state.fist = false;
    state.openPalm = false;
    state.palmAlmost = false;
    return;
  }

  for (let i = 0; i < result.landmarks.length; i++) {
    const raw = result.landmarks[i];
    if (!raw || raw.length < 21) continue;

    const lms = projectLandmarks(raw, geom);
    const center = { x: 0, y: 0 };
    for (const idx of [0, 5, 9, 13, 17]) {
      center.x += lms[idx].x;
      center.y += lms[idx].y;
    }
    center.x /= 5;
    center.y /= 5;

    const palmSpan = dist(lms[5], lms[17]);
    const handLen = dist(lms[0], lms[9]);
    const radius = Math.max(24, Math.max(palmSpan, handLen) * 0.62);
    const extended = countExtended(lms);
    const spread = dist(lms[4], lms[20]) / Math.max(1, handLen);
    const prev = prevHands[i];
    const motion = prev ? dist(center, prev.center) : 0;

    state.hands.push({
      landmarks: lms,
      center,
      radius,
      extended,
      spread,
      motion,
      color: i === 0 ? PALETTE.steel : PALETTE.pink,
    });
  }

  // Gestur hanya dianggap sah kalau tangan relatif diam (bukan lambaian).
  state.fist = state.hands.some(
    (h) => h.radius > 30 && h.extended <= 1 && h.motion < STABLE_MOTION
  );
  state.openPalm = state.hands.some(
    (h) =>
      h.radius > 30 &&
      h.extended >= 4 &&
      h.spread > 1.45 &&
      h.motion < STABLE_MOTION
  );
  // Telapak sudah terbuka tetapi jari belum cukup lebar -> tampilkan petunjuk.
  state.palmAlmost = state.hands.some(
    (h) => h.radius > 30 && h.extended >= 4 && h.spread <= 1.45
  );
}

// ---- game logic ----
function spawnBubble() {
  if (state.bubbles.length >= 60) return;
  const W = state.width;
  const r = rand(26, 58);
  const baseX = rand(r + 24, W - r - 24);
  const amp = rand(8, Math.min(70, baseX - r, W - baseX - r));
  state.bubbles.push({
    x: baseX,
    baseX,
    y: -r - rand(0, 120),
    r,
    color: BUBBLE_COLORS[Math.floor(Math.random() * BUBBLE_COLORS.length)],
    gold: false,
    speed: rand(230, 360) * speedScale(state.level),
    phase: rand(0, TAU),
    wobble: rand(0.8, 2.2),
    amp,
    points: Math.round(r * 1.6),
  });
}

function spawnBonusWave() {
  const W = state.width;
  const n = 6;
  for (let i = 0; i < n; i++) {
    const r = rand(26, 40);
    const baseX = (W * (i + 0.5)) / n + rand(-30, 30);
    state.bubbles.push({
      x: baseX,
      baseX,
      y: -r - i * 70 - rand(0, 40),
      r,
      color: PALETTE.cream,
      gold: true,
      speed: rand(250, 330) * speedScale(state.level),
      phase: rand(0, TAU),
      wobble: rand(1.2, 2.4),
      amp: rand(8, 26),
      points: 120,
    });
  }
}

function spawnParticles(x, y, color, count, gold) {
  const room = 420 - state.particles.length;
  if (room <= 0) return;
  const n = Math.min(count, room);
  for (let i = 0; i < n; i++) {
    const angle = rand(0, TAU);
    const speed = rand(80, gold ? 620 : 430);
    const particleColor = gold
      ? Math.random() < 0.5
        ? PALETTE.cream
        : PALETTE.sage
      : Math.random() < 0.3
        ? PALETTE.cream
        : color;
    state.particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: 0,
      dur: rand(0.35, 0.85),
      size: rand(2, gold ? 7 : 5),
      color: rgba(particleColor, rand(0.7, 0.95)),
      gravity: 700,
      drag: 0.92,
    });
  }
}

function collidesWithHands(bubble) {
  for (const hand of state.hands) {
    // gerakan terlalu cepat tidak memecahkan gelembung
    if (hand.motion > POP_MAX_MOTION) continue;
    if (dist(hand.center, bubble) < bubble.r + hand.radius * 0.82) return true;
    for (const idx of [4, 8, 12, 16, 20]) {
      const p = hand.landmarks[idx];
      if (p && dist(p, bubble) < bubble.r + 14) return true;
    }
  }
  return false;
}

function popBubble(index, bubble) {
  state.bubbles.splice(index, 1);

  const mult = state.multiplierActive ? 2 : 1;
  const gain = Math.round(bubble.points * mult);
  state.score += gain;

  spawnParticles(
    bubble.x,
    bubble.y,
    bubble.color,
    bubble.gold ? 26 : 12 + Math.round(bubble.r * 0.18),
    bubble.gold
  );
  state.ripples.push({
    x: bubble.x,
    y: bubble.y,
    r: bubble.r * 0.4,
    max: bubble.r * 2.4,
    life: 0,
    dur: 0.5,
    color: bubble.color,
  });
  state.floaters.push({
    text: `+${gain}`,
    x: bubble.x,
    y: bubble.y,
    size: bubble.gold ? 38 : 28,
    color: bubble.gold ? rgba(PALETTE.cream, 0.98) : rgba(bubble.color, 0.98),
    life: 0,
    dur: 0.85,
  });
  state.shake = Math.max(state.shake, bubble.gold ? 0.5 : 0.16);

  if (audio) {
    audio.playPop(state.combo, bubble.gold);
    if (!state.multiplierActive) {
      audio.setIntensity(0.4 + Math.min(0.5, (state.level - 1) * 0.05));
    }
  }
}

function activateMultiplier(now) {
  state.multiplierActive = true;
  state.multiplierUntil = now + 5000;
  state.flash = 0.22;
  state.flashColor = rgbTriplet(PALETTE.pink);
  state.shake = Math.max(state.shake, 0.3);
  state.floaters.push({
    text: "×2 SKOR!",
    x: state.width / 2,
    y: state.height * 0.4,
    size: 56,
    color: rgba(PALETTE.pink, 0.95),
    life: 0,
    dur: 1.1,
  });
  if (audio) {
    audio.setIntensity(1);
    audio.playPower();
  }
}

function triggerBomb(now) {
  state.bombCooldown = now + 2200;
  if (!state.bubbles.length) return;

  const mult = state.multiplierActive ? 2 : 1;
  let gained = 0;

  for (const bubble of state.bubbles) {
    gained += Math.round(bubble.points * mult);
    spawnParticles(bubble.x, bubble.y, bubble.color, bubble.gold ? 22 : 10, bubble.gold);
    state.ripples.push({
      x: bubble.x,
      y: bubble.y,
      r: bubble.r * 0.4,
      max: bubble.r * 2.2,
      life: 0,
      dur: 0.55,
      color: bubble.color,
    });
  }

  state.score += gained;
  state.bubbles.length = 0;
  state.flash = 0.55;
  state.flashColor = rgbTriplet(PALETTE.cream);
  state.shake = 1;
  state.floaters.push({
    text: `BOM! +${gained}`,
    x: state.width / 2,
    y: state.height * 0.45,
    size: 64,
    color: rgba(PALETTE.cream, 0.95),
    life: 0,
    dur: 1.2,
  });

  if (audio) audio.playBomb();
}

function onClap(now = performance.now()) {
  if (!state.running) return;

  // Jeda antar-bonus tepuk supaya tidak bisa di-spam.
  if (now < state.clapReadyAt) {
    if (now > state.clapHintUntil) {
      state.clapHintUntil = now + 900;
      state.floaters.push({
        text: `COOLDOWN ${Math.ceil((state.clapReadyAt - now) / 1000)}s`,
        x: state.width / 2,
        y: state.height * 0.62,
        size: 28,
        color: rgba(PALETTE.cream, 0.9),
        life: 0,
        dur: 0.6,
      });
    }
    return;
  }

  state.clapReadyAt = now + CLAP_BONUS_COOLDOWN;
  state.clapCooldownMs = CLAP_BONUS_COOLDOWN;
  state.comboWasReady = false;
  state.combo += 1;
  state.floaters.push({
    text: `COMBO TEPUK ×${state.combo}`,
    x: state.width / 2,
    y: state.height * 0.5,
    size: 50,
    color: rgba(PALETTE.pink, 0.95),
    life: 0,
    dur: 1.1,
  });
  spawnBonusWave();
  state.flash = 0.18;
  state.flashColor = rgbTriplet(PALETTE.sage);
  state.waveText = 1.4;
  if (audio) audio.playBonus();
}

function updateEffects(dt) {
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const p = state.particles[i];
    p.life += dt;
    if (p.life >= p.dur) {
      state.particles.splice(i, 1);
      continue;
    }
    const drag = Math.pow(p.drag, dt * 60);
    p.vx *= drag;
    p.vy *= drag;
    p.vy += p.gravity * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }

  for (let i = state.ripples.length - 1; i >= 0; i--) {
    const rp = state.ripples[i];
    rp.life += dt;
    if (rp.life >= rp.dur) state.ripples.splice(i, 1);
  }

  for (let i = state.floaters.length - 1; i >= 0; i--) {
    const f = state.floaters[i];
    f.life += dt;
    if (f.life >= f.dur) state.floaters.splice(i, 1);
  }

  state.shake = Math.max(0, state.shake - dt * 3);
  state.flash = Math.max(0, state.flash - dt * 2.5);
  state.waveText = Math.max(0, state.waveText - dt * 0.7);
}

function updateGame(dt, now) {
  // naik level tiap 500 poin -> gelembung turun makin cepat
  const level = computeLevel();
  if (level > state.level) {
    state.level = level;
    state.flash = Math.max(state.flash, 0.18);
    state.flashColor = rgbTriplet(PALETTE.steel);
    state.floaters.push({
      text: `LEVEL ${level}`,
      x: state.width / 2,
      y: state.height * 0.34,
      size: 58,
      color: rgba(PALETTE.steel, 0.95),
      life: 0,
      dur: 1.2,
    });
  }

  // spawn berkala — lebih rapat supaya layar selalu ramai
  state.spawnTimer += dt;
  const interval = Math.max(
    0.2,
    0.44 - (state.level - 1) * 0.03 - state.score * 0.000006
  );
  if (state.spawnTimer >= interval) {
    state.spawnTimer = 0;
    let burst = 1;
    if (Math.random() < 0.45) burst++;
    if (state.level >= 4 && Math.random() < 0.25) burst++;
    for (let i = 0; i < burst; i++) spawnBubble();
  }

  // info combo tepuk: siap / cooldown
  const comboReady = now >= state.clapReadyAt;
  if (comboReady && !state.comboWasReady) {
    state.comboWasReady = true;
    state.floaters.push({
      text: "COMBO SIAP!",
      x: state.width / 2,
      y: state.height * 0.66,
      size: 50,
      color: rgba(PALETTE.sage, 0.96),
      life: 0,
      dur: 1.2,
    });
    state.flash = Math.max(state.flash, 0.1);
    state.flashColor = rgbTriplet(PALETTE.sage);
  } else if (!comboReady) {
    state.comboWasReady = false;
  }

  // gerak & tabrakan gelembung
  for (let i = state.bubbles.length - 1; i >= 0; i--) {
    const b = state.bubbles[i];
    b.y += b.speed * dt;
    b.x = b.baseX + Math.sin(b.phase + state.time * b.wobble) * b.amp;

    if (collidesWithHands(b)) {
      popBubble(i, b);
      continue;
    }

    if (b.y - b.r > state.height) {
      state.bubbles.splice(i, 1);
      state.floaters.push({
        text: "MISS",
        x: b.x,
        y: state.height - 60,
        size: 26,
        color: rgba(PALETTE.rose, 0.85),
        life: 0,
        dur: 0.7,
      });
      if (audio) {
        audio.playMiss();
        if (!state.multiplierActive) audio.setIntensity(0.35);
      }
    }
  }

  updateEffects(dt);

  // habis masa ×2
  if (state.multiplierActive && now > state.multiplierUntil) {
    state.multiplierActive = false;
    if (audio) audio.setIntensity(0.4 + Math.min(0.5, (state.level - 1) * 0.05));
  }

  // gestur kepalan ditahan
  if (state.fist) {
    state.fistTimer += dt;
    if (state.fistTimer > 0.5 && !state.fistLatched) {
      state.fistLatched = true;
      activateMultiplier(now);
    }
  } else {
    state.fistTimer = 0;
    state.fistLatched = false;
  }

  // gestur telapak dibuka lebar harus DITAHAN sebentar -> bom.
  // Tangan yang berpindah jauh (mis. melambai) akan mereset hitungan,
  // jadi lambaian tidak memicu bom/combo.
  if (state.openPalm) {
    const palmHand = state.hands.find(
      (h) =>
        h.radius > 30 &&
        h.extended >= 4 &&
        h.spread > 1.45 &&
        h.motion < STABLE_MOTION
    );
    if (palmHand) {
      if (!state.openPalmAnchor) {
        state.openPalmAnchor = { x: palmHand.center.x, y: palmHand.center.y };
      } else if (dist(palmHand.center, state.openPalmAnchor) > 80) {
        state.openPalmAnchor = { x: palmHand.center.x, y: palmHand.center.y };
        state.openPalmTimer = 0;
      }
    }
    state.openPalmTimer += dt;
    if (
      state.openPalmTimer > BOMB_HOLD_TIME &&
      !state.openPalmLatched &&
      now > state.bombCooldown &&
      state.bubbles.length > 0
    ) {
      state.openPalmLatched = true;
      triggerBomb(now);
    }
  } else {
    state.openPalmTimer = 0;
    state.openPalmLatched = false;
    state.openPalmAnchor = null;
  }
}

function updateHudDom(dt) {
  hudAccum += dt;
  if (hudAccum < 0.2) return;
  hudAccum = 0;

  let status;
  if (!state.running) status = "Siap";
  else if (!state.hands.length) status = "Cari tangan…";
  else status = `${state.hands.length} tangan`;
  if (statusEl.textContent !== status) statusEl.textContent = status;

  const fps = `${Math.round(state.fps)} FPS`;
  if (fpsEl.textContent !== fps) fpsEl.textContent = fps;
}

// ---- loop utama ----
function loop(now) {
  rafId = requestAnimationFrame(loop);

  // Saat jeda: layar dibiarkan membeku di frame terakhir, tidak ada yang diproses.
  if (state.paused) {
    lastFrame = now;
    return;
  }

  const dt = Math.min(0.05, Math.max(0.001, (now - lastFrame) / 1000));
  lastFrame = now;
  state.time += dt;
  state.fps = state.fps * 0.9 + (1 / dt) * 0.1;

  state.geom = getCoverGeometry(video, state.width, state.height);

  // deteksi tangan hanya saat ada frame video baru
  if (landmarker && video.readyState >= 2) {
    if (video.currentTime !== lastVideoTime) {
      lastVideoTime = video.currentTime;
      let result = null;
      try {
        result = detectHands(landmarker, video, now);
      } catch (err) {
        console.warn("deteksi tangan gagal:", err);
      }
      updateHands(result);
    }
  } else if (!landmarker) {
    state.hands = [];
  }

  if (state.running) {
    updateGame(dt, now);
    // detectClap tetap dipanggil agar ambang suara terus diperbarui,
    // tetapi tepuk diabaikan sesaat setelah lanjut dari jeda.
    if (audio && audio.detectClap() && now > clapIgnoreUntil) onClap(now);
  } else {
    updateEffects(dt);
  }

  drawFrame(ctx, state);
  updateHudDom(dt);
}

// ---- rekaman ----
function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function stamp() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

recordBtn.addEventListener("click", () => {
  if (!state.running) return;
  try {
    recorder = createRecorder(canvas, audioStream);
    recorder.start();
    state.recording = true;
    recordBtn.disabled = true;
    recordBtn.classList.add("recording-flash");
    stopRecordBtn.disabled = false;
  } catch (err) {
    console.error(err);
    statusEl.textContent = "Rekaman gagal";
  }
});

async function finishRecording() {
  if (!recorder) return;
  stopRecordBtn.disabled = true;
  const blob = await recorder.stop();
  recorder = null;
  state.recording = false;
  recordBtn.disabled = false;
  recordBtn.classList.remove("recording-flash");
  if (blob) {
    const ext = blob.type.includes("mp4") ? "mp4" : "webm";
    downloadBlob(blob, `popbone-${stamp()}.${ext}`);
  }
}

stopRecordBtn.addEventListener("click", finishRecording);

// ---- jeda & keluar ----
function pauseGame() {
  if (!state.running || state.paused) return;
  state.paused = true;
  pausedAt = performance.now();
  pauseScreen.hidden = false;
  pauseBtn.textContent = "Lanjut";
  statusEl.textContent = "Jeda";
  if (audio) audio.ctx.suspend().catch(() => {});
  if (recorder && recorder.pause) recorder.pause();
}

async function resumeGame() {
  if (!state.running || !state.paused) return;
  const now = performance.now();
  const gap = now - pausedAt;

  // Hitungan waktu nyata ikut bergeser supaya waktu jeda tidak ikut terhitung.
  for (const key of ["multiplierUntil", "clapReadyAt", "clapHintUntil", "bombCooldown"]) {
    if (state[key] > pausedAt) state[key] += gap;
  }

  state.paused = false;
  pauseScreen.hidden = true;
  pauseBtn.textContent = "Jeda";
  lastFrame = now;
  clapIgnoreUntil = now + 600;
  if (audio) {
    try {
      await audio.ctx.resume();
    } catch (err) {
      /* noop */
    }
  }
  if (recorder && recorder.resume) recorder.resume();
}

function togglePause() {
  if (state.paused) resumeGame();
  else pauseGame();
}

function resetGame() {
  Object.assign(state, {
    hands: [],
    bubbles: [],
    particles: [],
    ripples: [],
    floaters: [],
    score: 0,
    combo: 0,
    comboWasReady: true,
    level: 1,
    multiplierActive: false,
    multiplierUntil: 0,
    fist: false,
    fistTimer: 0,
    fistLatched: false,
    openPalm: false,
    openPalmTimer: 0,
    openPalmLatched: false,
    openPalmAnchor: null,
    palmAlmost: false,
    bombCooldown: 0,
    clapReadyAt: 0,
    clapCooldownMs: 0,
    clapHintUntil: 0,
    shake: 0,
    flash: 0,
    waveText: 0,
    spawnTimer: 0,
    paused: false,
    running: false,
    recording: false,
  });
}

async function exitGame() {
  // rekaman yang sedang berjalan disimpan dulu supaya tidak hilang
  if (recorder) await finishRecording();

  state.running = false;
  state.paused = false;
  started = false;

  if (rafId) cancelAnimationFrame(rafId);
  rafId = 0;

  if (audio) {
    audio.destroy();
    audio = null;
    audioStream = null;
  }

  const camStream = video.srcObject;
  if (camStream && camStream.getTracks) camStream.getTracks().forEach((t) => t.stop());
  video.srcObject = null;
  lastVideoTime = -1;

  resetGame();

  ctx.fillStyle = PALETTE.slate;
  ctx.fillRect(0, 0, state.width, state.height);

  pauseScreen.hidden = true;
  pauseBtn.textContent = "Jeda";
  pauseBtn.disabled = true;
  exitBtn.disabled = true;
  recordBtn.disabled = true;
  stopRecordBtn.disabled = true;
  recordBtn.classList.remove("recording-flash");
  statusEl.textContent = "Siap";
  fpsEl.textContent = "-- FPS";

  startScreen.classList.remove("hidden");
  startBtn.disabled = false;
}

async function requestExit() {
  if (!state.running) return;
  const wasPaused = state.paused;
  pauseGame();
  if (window.confirm("Keluar ke menu awal? Skor dan level akan direset.")) {
    await exitGame();
  } else if (!wasPaused) {
    resumeGame();
  }
}

pauseBtn.addEventListener("click", togglePause);
resumeBtn.addEventListener("click", resumeGame);
exitBtn.addEventListener("click", requestExit);
pauseExitBtn.addEventListener("click", requestExit);

// jeda otomatis kalau tab disembunyikan / pindah jendela
document.addEventListener("visibilitychange", () => {
  if (document.hidden) pauseGame();
});

// fallback pemicu manual (mis. mikrofon tidak tersedia)
window.addEventListener("keydown", (event) => {
  if (!state.running) return;
  if (event.code === "KeyP" || event.code === "Escape") {
    togglePause();
    return;
  }
  if (state.paused) return;
  if (event.code === "KeyB") onClap(performance.now());
  else if (event.code === "KeyX" && state.bubbles.length) triggerBomb(performance.now());
});

// ---- mulai ----
async function start() {
  if (started) return;
  startBtn.disabled = true;
  errorMsg.hidden = true;
  loading.hidden = false;

  try {
    setLoading("Meminta izin kamera…");
    const stream = await startCamera(video);
    const micStream = stream.getAudioTracks().length
      ? new MediaStream(stream.getAudioTracks())
      : null;

    try {
      setLoading("Menyiapkan mesin audio…");
      audio = await createAudioEngine(micStream);
      await audio.resume();
      audioStream = audio.recDest.stream;
    } catch (err) {
      console.warn("Audio engine gagal:", err);
      audio = null;
      audioStream = null;
    }

    setLoading("Memuat model Hand Landmarker…");
    if (!landmarker) landmarker = await createHandLandmarker();

    started = true;
    state.running = true;
    loading.hidden = true;
    startScreen.classList.add("hidden");
    recordBtn.disabled = typeof MediaRecorder === "undefined";
    pauseBtn.disabled = false;
    exitBtn.disabled = false;

    if (audio) {
      audio.startBeat();
      audio.setIntensity(0.4);
    }

    statusEl.textContent = micStream ? "Live" : "Live (mikrofon off)";
    lastFrame = performance.now();
    if (!rafId) rafId = requestAnimationFrame(loop);
  } catch (err) {
    console.error(err);
    loading.hidden = true;
    startBtn.disabled = false;
    errorMsg.hidden = false;
    errorMsg.textContent =
      "Gagal memulai: " +
      (err && err.message ? err.message : err) +
      "\nPastikan kamera diizinkan dan halaman dibuka lewat HTTPS atau localhost.";
  }
}

startBtn.addEventListener("click", start);
