/**
 * Modul video_fx: menggambar video kamera, rangka neon tangan, gelembung,
 * partikel, efek layar, dan HUD ke canvas.
 */
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

function hsl(h, s, l, a = 1) {
  return `hsla(${h}, ${s}%, ${l}%, ${a})`;
}

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

function drawVideo(ctx, state) {
  const W = state.width;
  const H = state.height;
  ctx.fillStyle = "#05010c";
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
    vignette.addColorStop(0, "rgba(10, 4, 24, 0)");
    vignette.addColorStop(1, "rgba(6, 2, 16, 0.74)");
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = "rgba(46, 0, 88, 0.10)";
    ctx.fillRect(0, 0, W, H);
  }
}

function drawBubbles(ctx, state) {
  const t = state.time;

  for (const b of state.bubbles) {
    const pulse = 1 + Math.sin(t * 3 + b.phase) * 0.03;
    const rr = b.r * pulse;
    const hue = b.hue;

    ctx.save();
    ctx.translate(b.x, b.y);

    // halo
    ctx.globalCompositeOperation = "lighter";
    const glow = ctx.createRadialGradient(0, 0, rr * 0.2, 0, 0, rr * 1.7);
    glow.addColorStop(0, hsl(hue, 100, 70, b.gold ? 0.5 : 0.32));
    glow.addColorStop(1, hsl(hue, 100, 60, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, rr * 1.7, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = "source-over";

    // badan gelembung
    const body = ctx.createRadialGradient(-rr * 0.35, -rr * 0.4, rr * 0.1, 0, 0, rr);
    if (b.gold) {
      body.addColorStop(0, "rgba(255, 252, 220, 0.98)");
      body.addColorStop(0.45, "rgba(255, 214, 90, 0.58)");
      body.addColorStop(1, "rgba(190, 120, 10, 0.18)");
    } else {
      body.addColorStop(0, hsl(hue, 100, 88, 0.98));
      body.addColorStop(0.5, hsl(hue, 95, 62, 0.42));
      body.addColorStop(1, hsl(hue, 100, 55, 0.1));
    }
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.arc(0, 0, rr, 0, TAU);
    ctx.fill();

    // rim neon
    ctx.lineWidth = Math.max(1.5, rr * 0.06);
    ctx.strokeStyle = b.gold ? "rgba(255, 236, 160, 0.95)" : hsl(hue, 100, 80, 0.9);
    ctx.shadowBlur = 18;
    ctx.shadowColor = b.gold ? "rgba(255, 200, 70, 0.9)" : hsl(hue, 100, 65, 0.9);
    ctx.beginPath();
    ctx.arc(0, 0, rr - 1, 0, TAU);
    ctx.stroke();
    ctx.shadowBlur = 0;

    // kilau
    ctx.beginPath();
    ctx.ellipse(-rr * 0.32, -rr * 0.38, rr * 0.22, rr * 0.14, -0.7, 0, TAU);
    ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
    ctx.fill();

    if (b.gold) {
      drawStar(ctx, rr * 0.42, -rr * 0.42, rr * 0.24, 4, "rgba(255, 255, 255, 0.95)");
    }

    ctx.restore();
  }
}

function drawRipples(ctx, state) {
  for (const rp of state.ripples) {
    const k = Math.min(1, rp.life / rp.dur);
    const eased = 1 - Math.pow(1 - k, 3);
    const radius = rp.r + (rp.max - rp.r) * eased;
    ctx.beginPath();
    ctx.arc(rp.x, rp.y, radius, 0, TAU);
    ctx.strokeStyle = hsl(rp.hue, 100, 78, (1 - k) * 0.8);
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

function drawHands(ctx, state) {
  const t = state.time;

  state.hands.forEach((hand, i) => {
    const pts = hand.landmarks;
    if (!pts || pts.length < 21) return;

    const hue = hand.hue != null ? hand.hue : i === 0 ? 185 : 305;
    const color = `hsl(${hue}, 100%, 62%)`;
    const color2 = `hsl(${hue}, 100%, 82%)`;

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // cincin bidik di telapak
    ctx.setLineDash([8, 10]);
    ctx.lineDashOffset = -t * 40;
    ctx.strokeStyle = hsl(hue, 100, 72, 0.55);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(hand.center.x, hand.center.y, hand.radius, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);

    // tulang bercahaya
    ctx.shadowBlur = 26;
    ctx.shadowColor = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 9;
    for (const [a, b] of HAND_CONNECTIONS) {
      const p = pts[a];
      const q = pts[b];
      if (!p || !q) continue;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(q.x, q.y);
      ctx.stroke();
    }

    // inti putih
    ctx.shadowBlur = 8;
    ctx.shadowColor = color2;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.92)";
    ctx.lineWidth = 2.4;
    for (const [a, b] of HAND_CONNECTIONS) {
      const p = pts[a];
      const q = pts[b];
      if (!p || !q) continue;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(q.x, q.y);
      ctx.stroke();
    }

    // sendi
    ctx.shadowBlur = 18;
    ctx.shadowColor = color;
    for (let k = 0; k < pts.length; k++) {
      const p = pts[k];
      const isTip = k === 4 || k === 8 || k === 12 || k === 16 || k === 20;
      ctx.beginPath();
      ctx.arc(p.x, p.y, isTip ? 7 : 4.5, 0, TAU);
      ctx.fillStyle = isTip ? color2 : "rgba(255, 255, 255, 0.95)";
      ctx.fill();
    }

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
    ctx.fillStyle = f.color || "rgba(255,255,255,0.95)";
    ctx.shadowBlur = 22;
    ctx.shadowColor = f.color || "rgba(120,220,255,0.9)";
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
  ctx.fillStyle = "rgba(255, 255, 255, 0.96)";
  ctx.shadowBlur = 24;
  ctx.shadowColor = "rgba(0, 240, 255, 0.8)";
  ctx.fillText(String(Math.round(state.score)).padStart(4, "0"), 36, 28);
  ctx.shadowBlur = 0;

  ctx.font = `700 17px ${FONT_TEXT}`;
  ctx.fillStyle = "rgba(150, 240, 255, 0.85)";
  ctx.fillText("SKOR", 39, 94);

  // combo
  if (state.combo > 1) {
    const hue = (state.time * 120) % 360;
    ctx.font = `800 30px ${FONT_ORBIT}`;
    ctx.fillStyle = hsl(hue, 100, 70);
    ctx.shadowBlur = 20;
    ctx.shadowColor = hsl(hue, 100, 60);
    ctx.fillText(`COMBO ×${state.combo}`, 38, 124);
    ctx.shadowBlur = 0;
  }

  // bar pengali ×2
  if (state.multiplierActive) {
    const remain = Math.max(0, (state.multiplierUntil - performance.now()) / 1000);
    const w = 230;
    ctx.fillStyle = "rgba(0, 0, 0, 0.42)";
    roundRect(ctx, 38, 178, w, 14, 7);
    ctx.fill();
    ctx.fillStyle = "rgba(255, 80, 200, 0.9)";
    roundRect(ctx, 38, 178, w * Math.min(1, remain / 5), 14, 7);
    ctx.fill();
    ctx.font = `800 18px ${FONT_ORBIT}`;
    ctx.fillStyle = "rgba(255, 150, 230, 0.95)";
    ctx.fillText("×2", 278, 174);
  }

  // status tangan
  ctx.textAlign = "right";
  ctx.font = `700 17px ${FONT_TEXT}`;
  ctx.fillStyle = state.hands.length
    ? "rgba(120, 255, 200, 0.9)"
    : "rgba(255, 170, 120, 0.9)";
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
    ctx.fillStyle = blink ? "rgba(255, 60, 90, 0.95)" : "rgba(255, 60, 90, 0.3)";
    ctx.fill();
    ctx.textAlign = "right";
    ctx.font = `800 18px ${FONT_ORBIT}`;
    ctx.fillStyle = "rgba(255, 120, 140, 0.95)";
    ctx.fillText("REC", W - 36, 72);
  }

  // banner gelombang bonus
  if (state.waveText > 0) {
    const a = Math.min(1, state.waveText);
    ctx.textAlign = "center";
    ctx.font = `900 52px ${FONT_ORBIT}`;
    ctx.fillStyle = `rgba(255, 215, 90, ${a})`;
    ctx.shadowBlur = 30;
    ctx.shadowColor = "rgba(255, 180, 40, 0.9)";
    ctx.fillText("GELOMBANG BONUS!", W / 2, H * 0.22);
    ctx.shadowBlur = 0;
  }

  // petunjuk saat tangan belum terdeteksi
  if (!state.hands.length && state.running) {
    ctx.textAlign = "center";
    ctx.font = `700 26px ${FONT_TEXT}`;
    ctx.fillStyle = "rgba(255, 255, 255, 0.75)";
    ctx.fillText("Angkat telapak tangan ke kamera", W / 2, H * 0.82);
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
    ctx.fillStyle = `rgba(${state.flashColor || "255,255,255"}, ${alpha})`;
    ctx.fillRect(-40, -40, W + 80, H + 80);
  }

  drawFloaters(ctx, state);

  ctx.restore();

  // HUD digambar tanpa getaran supaya angka tetap stabil.
  drawHud(ctx, state);
}
