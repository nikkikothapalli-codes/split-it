// Image -> word boxes. opencv.js + tesseract.js, both WASM.
// Nothing leaves the device.

import { createWorker } from 'tesseract.js';

// every Mat needs .delete() — WASM memory isn't GC'd. leak these and the tab dies.

export function waitForOpenCV() {
  return new Promise((resolve, reject) => {
    if (window.cv && window.cv.Mat) return resolve(window.cv);
    const timeout = setTimeout(() => reject(new Error('opencv.js failed to load')), 30000);
    const check = setInterval(() => {
      if (window.cv && window.cv.Mat) {
        clearInterval(check);
        clearTimeout(timeout);
        resolve(window.cv);
      }
    }, 100);
  });
}

// downscale huge phone photos first
export async function fileToCanvas(file, maxDimension = 2000) {
  const bitmap = await createImageBitmap(file);

  let { width, height } = bitmap;
  const longest = Math.max(width, height);
  if (longest > maxDimension) {
    const scale = maxDimension / longest;
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return canvas;
}

// ---------------------------------------------------------------------------
// Preprocessing
// ---------------------------------------------------------------------------

// fit a minAreaRect around the text mass and rotate by its angle.
// beats Hough here — receipts often have no straight rules to detect.
// gives up on curled paper; that needs dewarping, not rotation.
function deskew(cv, gray) {
  const thresh = new cv.Mat();
  const points = new cv.Mat();
  try {
    cv.threshold(gray, thresh, 0, 255, cv.THRESH_BINARY_INV + cv.THRESH_OTSU);
    cv.findNonZero(thresh, points);
    if (points.rows < 10) return gray.clone();

    const rect = cv.minAreaRect(points);
    let angle = rect.angle;
    if (angle > 45) angle -= 90;
    if (angle < -45) angle += 90;

    // big angle = the fit failed, not a sideways photo
    if (Math.abs(angle) > 20 || Math.abs(angle) < 0.1) return gray.clone();

    const center = new cv.Point(gray.cols / 2, gray.rows / 2);
    const m = cv.getRotationMatrix2D(center, angle, 1);
    const rotated = new cv.Mat();
    try {
      cv.warpAffine(gray, rotated, m, new cv.Size(gray.cols, gray.rows),
        cv.INTER_CUBIC, cv.BORDER_REPLICATE, new cv.Scalar());
      return rotated.clone();
    } finally {
      m.delete();
      rotated.delete();
    }
  } finally {
    thresh.delete();
    points.delete();
  }
}

// adaptive threshold, not Otsu — restaurant lighting puts half the receipt in shadow
export async function preprocess(sourceCanvas) {
  const cv = await waitForOpenCV();

  const src = cv.imread(sourceCanvas);
  const gray = new cv.Mat();
  let working = null;
  const binary = new cv.Mat();
  const cleaned = new cv.Mat();

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    // upscale narrow photos toward ~300dpi equivalent
    let scaled = gray;
    let didScale = false;
    if (gray.cols < 1000) {
      scaled = new cv.Mat();
      const f = 1000 / gray.cols;
      cv.resize(gray, scaled, new cv.Size(0, 0), f, f, cv.INTER_CUBIC);
      didScale = true;
    }

    working = deskew(cv, scaled);
    if (didScale) scaled.delete();

    cv.adaptiveThreshold(working, binary, 255,
      cv.ADAPTIVE_THRESH_GAUSSIAN_C, cv.THRESH_BINARY, 31, 15);

    cv.medianBlur(binary, cleaned, 3);

    const out = document.createElement('canvas');
    cv.imshow(out, cleaned);
    return out;
  } finally {
    src.delete();
    gray.delete();
    if (working) working.delete();
    binary.delete();
    cleaned.delete();
  }
}

// ---------------------------------------------------------------------------
// OCR
// ---------------------------------------------------------------------------

let workerPromise = null;

// one worker for all scans. startup downloads a few MB of model, so per-scan is unusable.
function getWorker(onProgress) {
  if (!workerPromise) {
    workerPromise = createWorker('eng', 1, {
      logger: (m) => {
        if (onProgress && m.status === 'recognizing text') onProgress(m.progress);
      },
    });
  }
  return workerPromise;
}

// word boxes, not plain text — position is what separates an item name from its price
export async function ocrWords(canvas, { onProgress, minConfidence = 30 } = {}) {
  const worker = await getWorker(onProgress);

  // psm 6 = uniform text block. receipts are single-column.
  await worker.setParameters({ tessedit_pageseg_mode: '6' });

  const { data } = await worker.recognize(canvas);

  // `words` moved between tesseract.js versions — handle both shapes
  let words = data.words;
  if (!words || !words.length) {
    words = [];
    for (const block of data.blocks || []) {
      for (const para of block.paragraphs || []) {
        for (const line of para.lines || []) {
          words.push(...(line.words || []));
        }
      }
    }
  }

  return words
    .filter((w) => w.text && w.text.trim() && w.confidence >= minConfidence)
    .map((w) => ({
      text: w.text.trim(),
      left: w.bbox.x0,
      top: w.bbox.y0,
      width: w.bbox.x1 - w.bbox.x0,
      height: w.bbox.y1 - w.bbox.y0,
      conf: w.confidence,
    }));
}

// call on unmount
export async function releaseWorker() {
  if (workerPromise) {
    const worker = await workerPromise;
    await worker.terminate();
    workerPromise = null;
  }
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

// stages reported separately — preprocessing is instant, OCR is seconds.
// one combined bar would sit at 5% then jump.
export async function scanReceipt(file, { onStage, onProgress } = {}) {
  onStage?.('reading');
  const canvas = await fileToCanvas(file);

  onStage?.('cleaning up the image');
  const processed = await preprocess(canvas);

  onStage?.('reading the text');
  const words = await ocrWords(processed, { onProgress });

  if (!words.length) {
    throw new Error('No text found. Try a flatter photo with more light.');
  }

  return words;
}
