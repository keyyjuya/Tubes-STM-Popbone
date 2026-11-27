/**
 * Modul recorder: merekam canvas + audio menjadi video bersuara (MediaRecorder).
 */
const MIME_CANDIDATES = [
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
  "video/mp4",
];

export function createRecorder(canvasEl, audioStream) {
  let mediaRecorder = null;
  let chunks = [];
  let stream = null;
  let mimeType = "";

  function pickMime() {
    if (typeof MediaRecorder === "undefined") return "";
    for (const type of MIME_CANDIDATES) {
      if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return "";
  }

  function start() {
    if (typeof MediaRecorder === "undefined") {
      throw new Error("MediaRecorder tidak didukung browser ini.");
    }
    if (mediaRecorder && mediaRecorder.state === "recording") return false;

    const canvasStream = canvasEl.captureStream(30);
    stream = new MediaStream();
    for (const track of canvasStream.getVideoTracks()) stream.addTrack(track);
    if (audioStream) {
      for (const track of audioStream.getAudioTracks()) stream.addTrack(track);
    }

    mimeType = pickMime();
    const options = { videoBitsPerSecond: 6_000_000 };
    if (mimeType) options.mimeType = mimeType;

    let rec;
    try {
      rec = new MediaRecorder(stream, options);
    } catch (err) {
      rec = new MediaRecorder(stream);
    }

    chunks = [];
    rec.ondataavailable = (event) => {
      if (event.data && event.data.size) chunks.push(event.data);
    };
    rec.start(250);
    mediaRecorder = rec;
    return true;
  }

  function stop() {
    return new Promise((resolve) => {
      if (!mediaRecorder || mediaRecorder.state === "inactive") {
        cleanup();
        resolve(null);
        return;
      }
      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: mimeType || "video/webm" });
        chunks = [];
        cleanup();
        resolve(blob);
      };
      try {
        mediaRecorder.stop();
      } catch (err) {
        cleanup();
        resolve(null);
      }
    });
  }

  function cleanup() {
    // Hentikan hanya track video canvas; track audio milik audio engine dipakai ulang.
    if (stream) {
      stream.getVideoTracks().forEach((track) => {
        try {
          track.stop();
        } catch (err) {
          /* noop */
        }
      });
      stream = null;
    }
    mediaRecorder = null;
  }

  return {
    start,
    stop,
    get active() {
      return !!mediaRecorder && mediaRecorder.state === "recording";
    },
    get supported() {
      return typeof MediaRecorder !== "undefined";
    },
  };
}
