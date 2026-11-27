/**
 * Modul landmark: memuat MediaPipe Hand Landmarker dan mendeteksi tangan tiap frame.
 * Model & WASM diambil dari CDN resmi (MediaPipe Tasks Vision).
 */
const VERSION = "1.2.3";
const CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}`;
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

function buildOptions(HandLandmarker, fileset, delegate) {
  return HandLandmarker.createFromOptions(fileset, {
    baseOptions: {
      modelAssetPath: MODEL_URL,
      delegate,
    },
    runningMode: "VIDEO",
    numHands: 2,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
}

export async function createHandLandmarker() {
  const vision = await import(`${CDN}/vision_bundle.mjs`);
  const fileset = await vision.FilesetResolver.forVisionTasks(`${CDN}/wasm`);

  try {
    return await buildOptions(vision.HandLandmarker, fileset, "GPU");
  } catch (err) {
    console.warn("Delegate GPU gagal, mencoba CPU:", err);
    return await buildOptions(vision.HandLandmarker, fileset, "CPU");
  }
}

export function detectHands(landmarker, videoEl, timestampMs) {
  if (!landmarker || !videoEl || videoEl.readyState < 2) return null;
  return landmarker.detectForVideo(videoEl, timestampMs);
}
