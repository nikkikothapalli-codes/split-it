/**
 * scan.js
 * -------
 * Browser-side image pipeline. Port of the Python preprocessing, plus the
 * tesseract.js bridge that produces the word boxes receiptLogic.js consumes.
 *
 * Nothing here touches the network. The image is read into a canvas, processed
 * in WASM, and discarded — it never leaves the device. That's a deliberate
 * property of the architecture, not a side effect of using Netlify.
 *
 * Deps (both load as WASM):
 *   opencv.js     — loaded via <script>, exposes global `cv`
 *   tesseract.js  — npm: tesseract.js
 *
 * UNTESTED IN NODE. Verify in a real browser before trusting it.
 */

import { createWorker } from 'tesseract.js';

// ---------------------------------------------------------------------------
// OpenCV lifecycle
// ---------------------------------------------------------------------------
// opencv.js allocates in WASM linear memory that the JS garbage collector does
// NOT manage. Every Mat you create must be .delete()'d by hand or the heap
// grows until the tab dies — which on a phone happens fast. Every function
// below deletes in a finally block for that reason.

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

/** Read a File/Blob into a canvas, downscaling very large phone photos. */
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

/**
 * Estimate and correct rotation.
 *
 * Threshold, collect non-white pixel coordinates, fit a minimum-area rectangle
 * around the text mass, and rotate by that rectangle's angle.
 *
 * Chosen over Hough line detection because receipts often have no long
 * straight rules to detect, while the text mass itself is reliably
 * rectangular. Works on borderless receipts.
 *
 * Fails on curled paper where skew varies down the length — the fix there is
 * dewarping along a fitted spline, which is a much larger problem. The UI
 * should ask for a flatter photo instead.
 */
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

    // A large angle means the fit failed, not that the photo is sideways.
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

/**
 * Full preprocessing chain. Returns a canvas ready for OCR.
 *
 * Adaptive threshold rather than global Otsu: restaurant lighting is uneven
 * and half the receipt is usually in shadow, which a single global cutoff
 * blows out. Adaptive computes a local threshold per neighbourhood.
 */
export async function preprocess(sourceCanvas) {
  const cv = await waitForOpenCV();

  const src = cv.imread(sourceCanvas);
  const gray = new cv.Mat();
  let working = null;
  const binary = new cv.Mat();
  const cleaned = new cv.Mat();

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    // Upscale narrow images — tesseract wants roughly 300 DPI equivalent, and
    // phone photos of a narrow receipt land well under that.
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

/**
 * Reuse one tesseract worker across scans.
 *
 * Worker startup downloads and compiles the language model, which is several
 * megabytes and takes seconds. Creating one per scan makes every scan feel
 * broken; creating it once makes only the first one slow.
 */
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

/**
 * OCR a preprocessed canvas into word boxes.
 *
 * Returns { text, left, top, width, height, conf } — deliberately the same
 * shape as the Python dataclass so the two implementations stay comparable.
 *
 * Word-level boxes rather than plain text output: position is the entire
 * signal for telling an item name from its price. A receipt line is "name
 * left, price right", and without coordinates you're guessing from string
 * order, which breaks whenever a name contains a number.
 */
export async function ocrWords(canvas, { onProgress, minConfidence = 30 } = {}) {
  const worker = await getWorker(onProgress);

  // PSM 6 = assume a uniform block of text. Receipts are single-column, so
  // this beats the default page-segmentation search.
  await worker.setParameters({ tessedit_pageseg_mode: '6' });

  const { data } = await worker.recognize(canvas);

  // tesseract.js has moved `words` between versions — sometimes top level,
  // sometimes nested under blocks/paragraphs/lines. Handle both.
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

/** Free the worker. Call on unmount so a backgrounded tab isn't holding it. */
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

/**
 * File -> word boxes, with progress reporting.
 *
 * Progress matters more than it looks: WASM OCR runs several seconds on a
 * phone, and a silent app during that window reads as broken. The stages are
 * reported separately because preprocessing is fast and OCR is not — a single
 * combined bar would sit at 5% and then jump.
 */
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
