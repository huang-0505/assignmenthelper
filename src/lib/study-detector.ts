// Browser-only Study Mode detection. Camera frames are analyzed on this device; nothing here uploads video.
import { headPose, type Sample } from "./study";

// Keep in step with the installed @mediapipe/tasks-vision (tests check it).
export const MEDIAPIPE_VERSION = "1.0.1";
const WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VERSION}/wasm`;
const MODELS = {
  face: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",
  object:
    "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/int8/1/efficientdet_lite0.tflite",
};
export type Detector = { sample(video: HTMLVideoElement): Sample };

let loading: Promise<Detector> | null = null;
/** Loads the models once per page; they are fetched only when Study Mode starts. */
export function loadDetector() {
  loading ??= create().catch((error) => {
    loading = null;
    throw error;
  });
  return loading;
}
async function create(): Promise<Detector> {
  const { FilesetResolver, FaceLandmarker, ObjectDetector } =
    await import("@mediapipe/tasks-vision");
  const files = await FilesetResolver.forVisionTasks(WASM);
  const build = (delegate: "GPU" | "CPU") =>
    Promise.all([
      FaceLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: MODELS.face, delegate },
        runningMode: "VIDEO",
        numFaces: 1,
        outputFaceBlendshapes: true,
        outputFacialTransformationMatrixes: true,
      }),
      ObjectDetector.createFromOptions(files, {
        baseOptions: { modelAssetPath: MODELS.object, delegate },
        runningMode: "VIDEO",
        scoreThreshold: 0.4,
        maxResults: 5,
        categoryAllowlist: ["person", "cell phone"],
      }),
    ]);
  // Some Safari and GPU setups cannot run the WebGL delegate; one CPU frame every 2 s is still light.
  const [face, objects] = await build("GPU").catch(() => build("CPU"));
  let last = 0;
  return {
    sample(video) {
      const now = Date.now();
      if (video.readyState < 2 || !video.videoWidth)
        return {
          t: now,
          present: false,
          phone: false,
          pose: null,
          blink: null,
        };
      // MediaPipe needs strictly increasing timestamps across both tasks.
      const t = (last = Math.max(performance.now(), last + 1));
      const f = face.detectForVideo(video, t),
        o = objects.detectForVideo(video, t);
      const seen = (name: string, min: number) =>
        o.detections.some((d) =>
          d.categories.some((c) => c.categoryName === name && c.score >= min),
        );
      const hasFace = f.faceLandmarks.length > 0,
        matrix = f.facialTransformationMatrixes?.[0]?.data,
        shapes = f.faceBlendshapes?.[0]?.categories ?? [];
      const blink = (name: string) =>
        shapes.find((c) => c.categoryName === name)?.score;
      const left = blink("eyeBlinkLeft"),
        right = blink("eyeBlinkRight");
      return {
        t: now,
        present: hasFace || seen("person", 0.5),
        phone: seen("cell phone", 0.45),
        pose: hasFace && matrix ? headPose(matrix) : null,
        blink:
          hasFace && left !== undefined && right !== undefined
            ? (left + right) / 2
            : null,
      };
    },
  };
}

/** A downscaled JPEG of the current frame, as base64 without the data: prefix. */
export function captureJpeg(
  video: HTMLVideoElement,
  width: number,
  quality = 0.7,
) {
  if (!video.videoWidth) return undefined;
  const canvas = document.createElement("canvas");
  canvas.width = Math.min(width, video.videoWidth);
  canvas.height = Math.round(
    (canvas.width * video.videoHeight) / video.videoWidth,
  );
  canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality).split(",")[1];
}

/** Resizes an uploaded photo to a JPEG for the coach window. */
export async function photoJpeg(file: File, size = 720) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, size / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL("image/jpeg", 0.85).split(",")[1];
}

/** Repeats `tick` every `ms`. A worker timer keeps firing in a background tab, where page timers slow down. */
export function ticker(ms: number, tick: () => void) {
  try {
    const url = URL.createObjectURL(
      new Blob([`setInterval(() => postMessage(0), ${ms});`], {
        type: "text/javascript",
      }),
    );
    const worker = new Worker(url);
    worker.onmessage = tick;
    return () => {
      worker.terminate();
      URL.revokeObjectURL(url);
    };
  } catch {
    const id = setInterval(tick, ms);
    return () => clearInterval(id);
  }
}
