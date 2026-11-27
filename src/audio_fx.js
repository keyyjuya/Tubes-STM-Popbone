/**
 * Modul audio_fx: SFX pop, beat musik, deteksi tepuk, dan pencampuran
 * audio untuk rekaman (Web Audio API).
 */
export async function createAudioEngine(micStream) {
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) throw new Error("Web Audio API tidak didukung browser ini.");

  const ctx = new AudioCtx();

  const master = ctx.createGain();
  master.gain.value = 0.85;
  master.connect(ctx.destination);

  // Semua audio game juga dialirkan ke sini untuk direkam.
  const recDest = ctx.createMediaStreamDestination();
  master.connect(recDest);

  let micAnalyser = null;
  let timeBuf = null;
  let freqBuf = null;

  if (micStream && micStream.getAudioTracks().length) {
    try {
      const micSrc = ctx.createMediaStreamSource(micStream);
      micAnalyser = ctx.createAnalyser();
      micAnalyser.fftSize = 1024;
      micAnalyser.smoothingTimeConstant = 0.1;
      micSrc.connect(micAnalyser);
      timeBuf = new Uint8Array(micAnalyser.fftSize);
      freqBuf = new Uint8Array(micAnalyser.frequencyBinCount);

      // Mikrofon hanya masuk ke jalur rekaman (bukan ke speaker) agar tidak feedback.
      const micGain = ctx.createGain();
      micGain.gain.value = 0.55;
      micSrc.connect(micGain);
      micGain.connect(recDest);
    } catch (err) {
      console.warn("Graf audio mikrofon gagal:", err);
    }
  }

  // ---- util ----
  const noiseBuffer = (() => {
    const len = Math.floor(ctx.sampleRate * 1.0);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  })();

  function env(gain, t, peak, attack, release) {
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + release);
  }

  // ---- SFX ----
  function playPop(combo = 0, gold = false) {
    if (ctx.state !== "running") return;
    const t = ctx.currentTime;
    const step = Math.min(combo, 24);
    const base = (gold ? 620 : 350) * Math.pow(2, step / 12);

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    osc.type = gold ? "square" : "triangle";
    osc.frequency.setValueAtTime(base * 2.0, t);
    osc.frequency.exponentialRampToValueAtTime(base, t + 0.07);
    filter.type = "lowpass";
    filter.frequency.value = 6500;
    filter.Q.value = 0.8;
    env(gain, t, gold ? 0.34 : 0.44, 0.004, 0.14);
    osc.connect(gain);
    gain.connect(filter);
    filter.connect(master);
    osc.start(t);
    osc.stop(t + 0.2);

    // transient "klik" agar terasa seperti gelembung pecah
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    const nf = ctx.createBiquadFilter();
    nf.type = "highpass";
    nf.frequency.value = 2400;
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.11, t);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
    noise.connect(nf);
    nf.connect(ng);
    ng.connect(master);
    noise.start(t);
    noise.stop(t + 0.04);
  }

  function playMiss() {
    if (ctx.state !== "running") return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(120, t + 0.18);
    env(gain, t, 0.14, 0.01, 0.18);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + 0.22);
  }

  function playBonus() {
    if (ctx.state !== "running") return;
    const t0 = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5];
    notes.forEach((freq, i) => {
      const t = t0 + i * 0.055;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.value = freq;
      env(gain, t, 0.22, 0.005, 0.22);
      osc.connect(gain);
      gain.connect(master);
      osc.start(t);
      osc.stop(t + 0.3);
    });
  }

  function playPower() {
    if (ctx.state !== "running") return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(180, t);
    osc.frequency.exponentialRampToValueAtTime(760, t + 0.35);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(400, t);
    filter.frequency.exponentialRampToValueAtTime(4200, t + 0.35);
    env(gain, t, 0.26, 0.01, 0.36);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + 0.46);
  }

  function playBomb() {
    if (ctx.state !== "running") return;
    const t = ctx.currentTime;

    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    const nf = ctx.createBiquadFilter();
    nf.type = "lowpass";
    nf.frequency.setValueAtTime(4200, t);
    nf.frequency.exponentialRampToValueAtTime(110, t + 0.6);
    const ng = ctx.createGain();
    ng.gain.setValueAtTime(0.0001, t);
    ng.gain.exponentialRampToValueAtTime(0.7, t + 0.01);
    ng.gain.exponentialRampToValueAtTime(0.0001, t + 0.72);
    noise.connect(nf);
    nf.connect(ng);
    ng.connect(master);
    noise.start(t);
    noise.stop(t + 0.75);

    const osc = ctx.createOscillator();
    const og = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.5);
    og.gain.setValueAtTime(0.0001, t);
    og.gain.exponentialRampToValueAtTime(0.5, t + 0.02);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.62);
    osc.connect(og);
    og.connect(master);
    osc.start(t);
    osc.stop(t + 0.66);
  }

  // ---- beat loop (16 langkah) ----
  let beatRunning = false;
  let beatTimer = null;
  let nextTime = 0;
  let beatStep = 0;
  let intensity = 0.4;

  const BPM = 124;
  const stepDur = 60 / BPM / 4;

  function kick(t) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.6, t + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + 0.24);
  }

  function hat(t, inten) {
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "highpass";
    filter.frequency.value = 7200;
    const gain = ctx.createGain();
    const peak = 0.025 + inten * 0.06;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    noise.start(t);
    noise.stop(t + 0.06);
  }

  function snare(t) {
    const noise = ctx.createBufferSource();
    noise.buffer = noiseBuffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.value = 1800;
    filter.Q.value = 0.8;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.2, t + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    noise.start(t);
    noise.stop(t + 0.16);
  }

  function bass(t, semi, inten) {
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();
    osc.type = "sawtooth";
    osc.frequency.value = 55 * Math.pow(2, semi / 12);
    filter.type = "lowpass";
    filter.frequency.value = 300 + inten * 500;
    filter.Q.value = 2;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.1 + inten * 0.05, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + 0.2);
  }

  const bassPattern = [0, 0, 7, 0, 3, 0, 7, 5, 0, 0, 7, 0, 10, 7, 5, 3];
  const bassSteps = [0, 3, 6, 8, 11, 14];

  function scheduleStep(step, t) {
    if (step === 0 || step === 8 || (intensity > 0.7 && step === 10)) kick(t);
    if (step === 4 || step === 12) snare(t);
    if (step % 2 === 0) hat(t, intensity);
    if (bassSteps.includes(step)) bass(t, bassPattern[step], intensity);
  }

  function scheduler() {
    if (!beatRunning) return;
    while (nextTime < ctx.currentTime + 0.12) {
      scheduleStep(beatStep, nextTime);
      nextTime += stepDur;
      beatStep = (beatStep + 1) % 16;
    }
    beatTimer = setTimeout(scheduler, 25);
  }

  function startBeat() {
    if (beatRunning || !ctx) return;
    beatRunning = true;
    beatStep = 0;
    nextTime = ctx.currentTime + 0.06;
    scheduler();
  }

  function stopBeat() {
    beatRunning = false;
    if (beatTimer) clearTimeout(beatTimer);
    beatTimer = null;
  }

  function setIntensity(value) {
    intensity = Math.max(0, Math.min(1, value));
  }

  // ---- deteksi tepuk ----
  let lastClap = performance.now();
  const rmsHistory = [];

  function detectClap() {
    if (!micAnalyser || !timeBuf || !freqBuf) return false;

    micAnalyser.getByteTimeDomainData(timeBuf);
    let sum = 0;
    let peak = 0;
    for (let i = 0; i < timeBuf.length; i++) {
      const v = (timeBuf[i] - 128) / 128;
      sum += v * v;
      const a = Math.abs(v);
      if (a > peak) peak = a;
    }
    const rms = Math.sqrt(sum / timeBuf.length);

    let avg = 0;
    if (rmsHistory.length) {
      for (const r of rmsHistory) avg += r;
      avg /= rmsHistory.length;
    }
    rmsHistory.push(rms);
    if (rmsHistory.length > 24) rmsHistory.shift();

    // Tepuk = transien tajam + banyak energi frekuensi tinggi.
    micAnalyser.getByteFrequencyData(freqBuf);
    const binHz = ctx.sampleRate / micAnalyser.fftSize;
    const startBin = Math.max(0, Math.floor(2000 / binHz));
    let hi = 0;
    let total = 0;
    for (let i = 0; i < freqBuf.length; i++) {
      const e = freqBuf[i] / 255;
      total += e;
      if (i >= startBin) hi += e;
    }
    const hiRatio = total > 0 ? hi / total : 0;

    const now = performance.now();
    const dynamicFloor = avg > 0.004 ? avg * 2.6 : 0.055;
    const threshold = Math.max(0.055, dynamicFloor);
    const isClap =
      rms > threshold &&
      peak > 0.45 &&
      hiRatio > 0.24 &&
      now - lastClap > 300;

    if (isClap) lastClap = now;
    return isClap;
  }

  async function resume() {
    if (ctx.state === "suspended") await ctx.resume();
  }

  function destroy() {
    stopBeat();
    try {
      ctx.close();
    } catch (err) {
      /* noop */
    }
  }

  return {
    ctx,
    master,
    recDest,
    resume,
    playPop,
    playMiss,
    playBonus,
    playPower,
    playBomb,
    startBeat,
    stopBeat,
    setIntensity,
    detectClap,
    destroy,
  };
}
