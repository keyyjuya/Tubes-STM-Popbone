/**
 * Modul video_fx: menggambar video kamera, rangka neon tangan, gelembung,
 * partikel, efek layar, dan HUD ke canvas.
 */
import { PALETTE, rgba, mix } from "./palette.js";

export const HAND_CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

const TAU = Math.PI * 2;
const FONT_ORBIT = '"Orbitron", sans-serif';
const FONT_TEXT = '"Space Grotesk", sans-serif';
const TIP_INDICES = [4, 8, 12, 16, 20];
const TIP_SET = new Set(TIP_INDICES);

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  if (typeof ctx.roundRect === "function") {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, rr);
    return;
  }
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
}

/** Hitung geometri "cover" agar video mengisi canvas tanpa distorsi. */
export function getCoverGeometry(video, W, H) {
  const vw = (video && video.videoWidth) || 16;
  const vh = (video && video.videoHeight) || 9;
  const scale = Math.max(W / vw, H / vh);
  const dw = vw * scale;
  const dh = vh * scale;
  return {
    dx: (W - dw) / 2,
    dy: (H - dh) / 2,
    dw,
    dh,
    scale,
    W,
    H,
    vw,
    vh,
  };
}

/** Proyeksikan landmark MediaPipe (0..1) ke koordinat canvas yang sudah dicerminkan. */
export function projectLandmarks(landmarks, geom) {
  return landmarks.map((lm) => ({
    x: geom.dx + (1 - lm.x) * geom.dw,
    y: geom.dy + lm.y * geom.dh,
    z: lm.z,
  }));
}

function drawStar(ctx, x, y, r, points, color) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const rad = i % 2 === 0 ? r : r * 0.42;
    const a = (i / (points * 2)) * TAU - Math.PI / 2;
    const px = x + Math.cos(a) * rad;
    const py = y + Math.sin(a) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

const BUBBLE_SPRITE_SIZE = 256;
const BUBBLE_SPRITE_R = 64;
const bubbleSpriteCache = new Map();

function getBubbleSprite(color, gold) {
  const key = `${color}|${gold ? 1 : 0}`;
  const cached = bubbleSpriteCache.get(key);
  if (cached) return cached;

  const c = document.createElement("canvas");
  c.width = BUBBLE_SPRITE_SIZE;
  c.height = BUBBLE_SPRITE_SIZE;
  const g = c.getContext("2d");
  const rr = BUBBLE_SPRITE_R;
  g.translate(BUBBLE_SPRITE_SIZE / 2, BUBBLE_SPRITE_SIZE / 2);

  // halo
  g.globalCompositeOperation = "lighter";
  const glow = g.createRadialGradient(0, 0, rr * 0.2, 0, 0, rr * 1.7);
  glow.addColorStop(0, rgba(color, gold ? 0.5 : 0.32));
  glow.addColorStop(1, rgba(color, 0));
  g.fillStyle = glow;
  g.beginPath();
  g.arc(0, 0, rr * 1.7, 0, TAU);
  g.fill();
  g.globalCompositeOperation = "source-over";

  // badan gelembung
  const body = g.createRadialGradient(-rr * 0.35, -rr * 0.4, rr * 0.1, 0, 0, rr);
  if (gold) {
    body.addColorStop(0, rgba(PALETTE.cream, 0.98));
    body.addColorStop(0.45, rgba(PALETTE.sage, 0.58));
    body.addColorStop(1, rgba(PALETTE.rose, 0.18));
  } else {
    body.addColorStop(0, rgba(PALETTE.cream, 0.95));
    body.addColorStop(0.5, rgba(color, 0.42));
    body.addColorStop(1, rgba(color, 0.1));
  }
  g.fillStyle = body;
  g.beginPath();
  g.arc(0, 0, rr, 0, TAU);
  g.fill();

  // rim neon
  g.lineWidth = Math.max(1.5, rr * 0.06);
  g.strokeStyle = gold ? rgba(PALETTE.cream, 0.95) : rgba(color, 0.9);
  g.shadowBlur = 18;
  g.shadowColor = gold ? rgba(PALETTE.sage, 0.9) : rgba(color, 0.9);
  g.beginPath();
  g.arc(0, 0, rr - 1, 0, TAU);
  g.stroke();
  g.shadowBlur = 0;

  // kilau
  g.beginPath();
  g.ellipse(-rr * 0.32, -rr * 0.38, rr * 0.22, rr * 0.14, -0.7, 0, TAU);
  g.fillStyle = rgba(PALETTE.cream, 0.85);
  g.fill();

  if (gold) {
    drawStar(g, rr * 0.42, -rr * 0.42, rr * 0.24, 4, rgba(PALETTE.cream, 0.95));
  }

  bubbleSpriteCache.set(key, c);
  return c;
}

function drawVideo(ctx, state) {
  const W = state.width;
  const H = state.height;
  ctx.fillStyle = PALETTE.slate;
  ctx.fillRect(0, 0, W, H);

  const { video, geom } = state;
  if (video && geom && video.readyState >= 2 && video.videoWidth) {
    ctx.save();
    ctx.translate(W, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, geom.dx, geom.dy, geom.dw, geom.dh);
    ctx.restore();

    const vignette = ctx.createRadialGradient(
      W * 0.5, H * 0.5, Math.min(W, H) * 0.2,
      W * 0.5, H * 0.5, Math.max(W, H) * 0.78
    );
    vignette.addColorStop(0, rgba(PALETTE.slate, 0));
    vignette.addColorStop(1, rgba(PALETTE.slate, 0.74));
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = rgba(PALETTE.slate, 0.1);
    ctx.fillRect(0, 0, W, H);
  }
}

function drawBubbles(ctx, state) {
  const t = state.time;
  const scale = BUBBLE_SPRITE_SIZE / BUBBLE_SPRITE_R;

  for (const b of state.bubbles) {
    const pulse = 1 + Math.sin(t * 3 + b.phase) * 0.03;
    const rr = b.r * pulse;
    const color = b.color || PALETTE.pink;
    const sprite = getBubbleSprite(color, b.gold);
    const size = rr * scale;
    ctx.drawImage(sprite, b.x - size / 2, b.y - size / 2, size, size);
  }
}

function drawRipples(ctx, state) {
  for (const rp of state.ripples) {
    const k = Math.min(1, rp.life / rp.dur);
    const eased = 1 - Math.pow(1 - k, 3);
    const radius = rp.r + (rp.max - rp.r) * eased;
    ctx.beginPath();
    ctx.arc(rp.x, rp.y, radius, 0, TAU);
    ctx.strokeStyle = rgba(rp.color || PALETTE.steel, (1 - k) * 0.8);
    ctx.lineWidth = 4 * (1 - k) + 1;
    ctx.stroke();
  }
}

function drawParticles(ctx, state) {
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  for (const p of state.particles) {
    const a = Math.max(0, 1 - p.life / p.dur);
    ctx.globalAlpha = a;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size * (0.35 + 0.65 * a), 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function strokeConnections(ctx, pts, width, style, shadowBlur, shadowColor) {
  ctx.beginPath();
  for (const [a, b] of HAND_CONNECTIONS) {
    const p = pts[a];
    const q = pts[b];
    if (!p || !q) continue;
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(q.x, q.y);
  }
  ctx.lineWidth = width;
  ctx.strokeStyle = style;
  ctx.shadowBlur = shadowBlur;
  ctx.shadowColor = shadowColor || "transparent";
  ctx.stroke();
}

function drawHands(ctx, state) {
  const t = state.time;

  state.hands.forEach((hand, i) => {
    const pts = hand.landmarks;
    if (!pts || pts.length < 21) return;

    const color = hand.color || (i === 0 ? PALETTE.steel : PALETTE.pink);
    const color2 = mix(color, PALETTE.cream, 0.55);

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // cincin bidik di telapak
    ctx.setLineDash([8, 10]);
    ctx.lineDashOffset = -t * 40;
    ctx.strokeStyle = rgba(color, 0.55);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(hand.center.x, hand.center.y, hand.radius, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);

    // outline gelap agar rangka tetap terbaca di latar terang
    ctx.globalCompositeOperation = "source-over";
    strokeConnections(ctx, pts, 13, rgba(PALETTE.slate, 0.62), 0, "transparent");

    // tulang bercahaya
    ctx.globalCompositeOperation = "lighter";
    strokeConnections(ctx, pts, 9, color, 18, color);

    // inti putih
    strokeConnections(ctx, pts, 2.4, rgba(PALETTE.cream, 0.92), 4, color2);

    // sendi (digambar batch supaya lebih ringan)
    ctx.shadowBlur = 12;
    ctx.shadowColor = color;

    ctx.beginPath();
    for (let k = 0; k < pts.length; k++) {
      if (TIP_SET.has(k)) continue;
      const p = pts[k];
      ctx.moveTo(p.x + 4.5, p.y);
      ctx.arc(p.x, p.y, 4.5, 0, TAU);
    }
    ctx.fillStyle = rgba(PALETTE.cream, 0.95);
    ctx.fill();

    ctx.beginPath();
    for (const k of TIP_INDICES) {
      const p = pts[k];
      if (!p) continue;
      ctx.moveTo(p.x + 7, p.y);
      ctx.arc(p.x, p.y, 7, 0, TAU);
    }
    ctx.fillStyle = color2;
    ctx.fill();

    ctx.restore();
  });
}

function drawFloaters(ctx, state) {
  for (const f of state.floaters) {
    const k = Math.min(1, f.life / f.dur);
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - k);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = `900 ${f.size || 28}px ${FONT_ORBIT}`;
    ctx.fillStyle = f.color || rgba(PALETTE.cream, 0.95);
    ctx.shadowBlur = 22;
    ctx.shadowColor = f.color || rgba(PALETTE.steel, 0.9);
    ctx.fillText(f.text, f.x, f.y - k * 64);
    ctx.restore();
  }
}

function drawHud(ctx, state) {
  const W = state.width;
  const H = state.height;

  ctx.save();
  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  // skor
  ctx.font = `900 58px ${FONT_ORBIT}`;
  ctx.fillStyle = rgba(PALETTE.cream, 0.96);
  ctx.shadowBlur = 24;
  ctx.shadowColor = rgba(PALETTE.steel, 0.8);
  ctx.fillText(String(Math.round(state.score)).padStart(4, "0"), 36, 28);
  ctx.shadowBlur = 0;

  ctx.font = `700 17px ${FONT_TEXT}`;
  ctx.fillStyle = rgba(PALETTE.steel, 0.9);
  ctx.fillText("SKOR", 39, 94);

  ctx.fillStyle = rgba(PALETTE.sage, 0.95);
  ctx.fillText(`LEVEL ${state.level}`, 120, 94);

  // combo (hanya dari tepuk tangan)
  if (state.combo > 0) {
    const comboColor = state.combo % 2 === 0 ? PALETTE.pink : PALETTE.sage;
    ctx.font = `800 26px ${FONT_ORBIT}`;
    ctx.fillStyle = comboColor;
    ctx.shadowBlur = 20;
    ctx.shadowColor = rgba(PALETTE.rose, 0.8);
    ctx.fillText(`COMBO TEPUK ×${state.combo}`, 38, 124);
    ctx.shadowBlur = 0;
  }

  // bar pengali ×2
  if (state.multiplierActive) {
    const remain = Math.max(0, (state.multiplierUntil - performance.now()) / 1000);
    const w = 230;
    ctx.fillStyle = rgba(PALETTE.slate, 0.42);
    roundRect(ctx, 38, 178, w, 14, 7);
    ctx.fill();
    ctx.fillStyle = rgba(PALETTE.pink, 0.9);
    roundRect(ctx, 38, 178, w * Math.min(1, remain / 5), 14, 7);
    ctx.fill();
    ctx.font = `800 18px ${FONT_ORBIT}`;
    ctx.fillStyle = rgba(PALETTE.pink, 0.95);
    ctx.fillText("×2", 278, 174);
  }

  // status tangan
  ctx.textAlign = "right";
  ctx.font = `700 17px ${FONT_TEXT}`;
  ctx.fillStyle = state.hands.length
    ? rgba(PALETTE.sage, 0.9)
    : rgba(PALETTE.rose, 0.9);
  ctx.fillText(
    state.hands.length ? `${state.hands.length} TANGAN TERDETEKSI` : "TANGAN TIDAK TERDETEKSI",
    W - 36,
    32
  );

  // indikator rekam
  if (state.recording) {
    const blink = Math.sin(state.time * 6) > 0;
    ctx.beginPath();
    ctx.arc(W - 116, 82, 9, 0, TAU);
    ctx.fillStyle = blink ? rgba(PALETTE.rose, 0.95) : rgba(PALETTE.rose, 0.3);
    ctx.fill();
    ctx.textAlign = "right";
    ctx.font = `800 18px ${FONT_ORBIT}`;
    ctx.fillStyle = rgba(PALETTE.pink, 0.95);
    ctx.fillText("REC", W - 36, 72);
  }

  // banner gelombang bonus
  if (state.waveText > 0) {
    const a = Math.min(1, state.waveText);
    ctx.textAlign = "center";
    ctx.font = `900 52px ${FONT_ORBIT}`;
    ctx.fillStyle = rgba(PALETTE.cream, a);
    ctx.shadowBlur = 30;
    ctx.shadowColor = rgba(PALETTE.sage, 0.9);
    ctx.fillText("BONUS TEPUK!", W / 2, H * 0.22);
    ctx.shadowBlur = 0;
  }

  // petunjuk saat tangan belum terdeteksi
  if (!state.hands.length && state.running) {
    ctx.textAlign = "center";
    ctx.font = `700 26px ${FONT_TEXT}`;
    ctx.fillStyle = rgba(PALETTE.cream, 0.8);
    ctx.fillText("Angkat telapak tangan ke kamera", W / 2, H * 0.82);
  }

  // petunjuk saat telapak terbuka tapi jari belum direntangkan lebar
  if (state.running && state.palmAlmost && !state.openPalm) {
    ctx.textAlign = "center";
    ctx.font = `700 24px ${FONT_TEXT}`;
    ctx.fillStyle = rgba(PALETTE.pink, 0.95);
    ctx.shadowBlur = 16;
    ctx.shadowColor = rgba(PALETTE.rose, 0.8);
    ctx.fillText("Rentangkan & tahan jari untuk BOM", W / 2, H * 0.88);
    ctx.shadowBlur = 0;
  }

  // status combo tepuk: jelas saat siap / cooldown
  if (state.running) {
    const remain = Math.max(0, (state.clapReadyAt - performance.now()) / 1000);
    const ready = remain <= 0;
    const panelX = 28;
    const panelY = H - 98;
    const panelW = 312;
    const panelH = 70;
    const barX = 44;
    const barY = H - 54;
    const barW = 280;
    const barH = 14;

    ctx.fillStyle = rgba(PALETTE.slate, 0.58);
    roundRect(ctx, panelX, panelY, panelW, panelH, 14);
    ctx.fill();

    ctx.textAlign = "left";
    ctx.font = `700 16px ${FONT_TEXT}`;
    if (ready) {
      const pulse = 0.72 + Math.sin(state.time * 6) * 0.28;
      ctx.fillStyle = rgba(PALETTE.sage, pulse);
      ctx.shadowBlur = 14;
      ctx.shadowColor = rgba(PALETTE.sage, 0.75);
      ctx.fillText("COMBO SIAP - TEPUK TANGAN", barX, H - 88);
      ctx.shadowBlur = 0;
    } else {
      ctx.fillStyle = rgba(PALETTE.pink, 0.95);
      ctx.fillText(`COMBO COOLDOWN ${Math.ceil(remain)}s`, barX, H - 88);
    }

    ctx.fillStyle = rgba(PALETTE.slate, 0.85);
    roundRect(ctx, barX, barY, barW, barH, barH / 2);
    ctx.fill();

    const total = state.clapCooldownMs > 0 ? state.clapCooldownMs / 1000 : 1;
    const progress = ready ? 1 : Math.max(0, Math.min(1, 1 - remain / total));
    ctx.fillStyle = ready ? rgba(PALETTE.sage, 0.95) : rgba(PALETTE.pink, 0.85);
    if (ready) {
      ctx.shadowBlur = 14;
      ctx.shadowColor = rgba(PALETTE.sage, 0.8);
    }
    roundRect(ctx, barX, barY, Math.max(0, barW * progress), barH, barH / 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }

  ctx.restore();
}

export function drawFrame(ctx, state) {
  const W = state.width;
  const H = state.height;

  ctx.save();
  if (state.shake > 0.01) {
    const s = state.shake;
    ctx.translate((Math.random() * 2 - 1) * s * 16, (Math.random() * 2 - 1) * s * 16);
  }

  drawVideo(ctx, state);
  drawRipples(ctx, state);
  drawBubbles(ctx, state);
  drawParticles(ctx, state);
  drawHands(ctx, state);

  if (state.flash > 0.01) {
    const alpha = Math.min(0.72, state.flash);
    ctx.fillStyle = `rgba(${state.flashColor || "255,247,230"}, ${alpha})`;
    ctx.fillRect(-40, -40, W + 80, H + 80);
  }

  drawFloaters(ctx, state);

  ctx.restore();

  // HUD digambar tanpa getaran supaya angka tetap stabil.
  drawHud(ctx, state);
}
