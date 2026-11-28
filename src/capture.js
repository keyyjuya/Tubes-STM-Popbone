/**
 * Modul capture: mengambil stream webcam (dan mikrofon bila tersedia)
 * lalu menampilkannya ke elemen video.
 */
export async function startCamera(videoEl) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw new Error("Browser ini tidak mendukung akses kamera (getUserMedia).");
  }

  const videoConstraints = {
    facingMode: "user",
    // Resolusi lebih kecil + 30 fps membuat deteksi tangan jauh lebih ringan.
    width: { ideal: 960 },
    height: { ideal: 540 },
    frameRate: { ideal: 30, max: 30 },
  };

  let stream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: videoConstraints,
      audio: {
        echoCancellation: true,
        noiseSuppression: false,
        autoGainControl: false,
      },
    });
  } catch (err) {
    // Mikrofon bisa ditolak / tidak ada — tetap jalankan kamera saja.
    stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints });
  }

  videoEl.srcObject = stream;
  videoEl.muted = true;
  try {
    await videoEl.play();
  } catch (err) {
    // Autoplay bisa ditolak; video tetap akan tampil setelah interaksi.
    console.warn("video.play() ditolak:", err);
  }

  if (!videoEl.videoWidth) {
    await new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        videoEl.removeEventListener("loadedmetadata", finish);
        resolve();
      };
      videoEl.addEventListener("loadedmetadata", finish);
      setTimeout(finish, 2000);
    });
  }

  return stream;
}
