/**
 * receiptLogic.js
 * ---------------
 * Port of the Python core's pure-logic layer. No OpenCV, no OCR — this takes
 * word boxes (from tesseract.js) and produces a structured receipt and a split.
 *
 * Kept dependency-free on purpose so it can be unit tested in node without a
 * browser or a WASM runtime. The image preprocessing lives separately in
 * preprocess.js, which does need opencv.js.
 */

// ---------------------------------------------------------------------------
// Parsing primitives
// ---------------------------------------------------------------------------

// 12.50, 1,234.56, $8.00, 8.00- (trailing minus appears on some POS systems)
const PRICE_RE = /^\$?(\d{1,3}(?:,\d{3})*|\d+)[.,](\d{2})-?$/;

const NON_ITEM_RE = new RegExp(
  '\\b(subtotal|sub total|total|tax|tip|gratuity|balance|amount due|' +
  'service charge|svc chg|change|cash|visa|mastercard|amex|debit|credit|' +
  'card|auth|approval|server|table|guests?|order|check|receipt|thank you)\\b',
  'i'
);

/** Parse a price token to a number, or null if it isn't price-shaped. */
export function parsePrice(token) {
  const m = PRICE_RE.exec(String(token).trim());
  if (!m) return null;
  return parseFloat(`${m[1].replace(/,/g, '')}.${m[2]}`);
}

// ---------------------------------------------------------------------------
// Word boxes -> lines
// ---------------------------------------------------------------------------
// A "word" here is { text, left, top, width, height, conf } — the shape
// tesseract.js gives back, deliberately matching the Python dataclass so the
// two implementations stay comparable.

const centerY = (w) => w.top + w.height / 2;
const right = (w) => w.left + w.width;

function median(values) {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Cluster words into horizontal lines by vertical position, then repair the
 * lines that clustering wrongly split.
 *
 * Tolerance is a fraction of median character height rather than a fixed pixel
 * count, so it scales with how close the photo was taken. A hardcoded pixel
 * value works on your own test images and fails on everyone else's.
 */
export function groupIntoLines(words, toleranceRatio = 0.6) {
  if (!words.length) return [];

  const medianH = median(words.map((w) => w.height));
  const tol = medianH * toleranceRatio;

  const ordered = [...words].sort((a, b) => centerY(a) - centerY(b));
  const lines = [[ordered[0]]];

  for (const w of ordered.slice(1)) {
    const lastLine = lines[lines.length - 1];
    const last = lastLine[lastLine.length - 1];
    if (Math.abs(centerY(w) - centerY(last)) <= tol) lastLine.push(w);
    else lines.push([w]);
  }

  const sorted = lines.map((ln) => [...ln].sort((a, b) => a.left - b.left));
  return mergeSplitLines(sorted, medianH);
}

/**
 * Rejoin lines that vertical clustering wrongly split apart.
 *
 * Deskew never fully removes rotation. On a line where the label sits far left
 * and the price far right, even half a degree of residual tilt pushes their
 * vertical centres beyond the clustering tolerance — so 'SUBTOTAL' and '34.00'
 * land in separate lines. Item lines survive because their words run
 * continuously across the width. It is specifically the label-gap-price layout
 * of the totals section that breaks, which means the naive version fails on
 * exactly the numbers that matter most.
 *
 * Merge rule: vertically close AND horizontally non-overlapping. The
 * non-overlap test is what keeps this safe — genuinely separate lines of a
 * single-column receipt share a horizontal band, so they overlap and are left
 * alone.
 */
function mergeSplitLines(lines, medianH) {
  if (lines.length < 2) return lines;

  const merged = [lines[0]];

  for (const current of lines.slice(1)) {
    const prev = merged[merged.length - 1];

    const prevY = prev.reduce((s, w) => s + centerY(w), 0) / prev.length;
    const curY = current.reduce((s, w) => s + centerY(w), 0) / current.length;

    const prevSpan = [Math.min(...prev.map((w) => w.left)), Math.max(...prev.map(right))];
    const curSpan = [Math.min(...current.map((w) => w.left)), Math.max(...current.map(right))];
    const overlaps = prevSpan[0] < curSpan[1] && curSpan[0] < prevSpan[1];

    if (Math.abs(curY - prevY) < medianH * 1.1 && !overlaps) {
      merged[merged.length - 1] = [...prev, ...current].sort((a, b) => a.left - b.left);
    } else {
      merged.push(current);
    }
  }

  return merged;
}

// ---------------------------------------------------------------------------
// Line -> item
// ---------------------------------------------------------------------------

/**
 * Extract { name, price, quantity } from one OCR'd line, or null.
 *
 * Core rule: the price is the RIGHTMOST price-shaped token.
 *
 *     2  CARNITAS TACOS   4.50    9.00
 *     ^qty                ^unit   ^extended
 *
 * Leftmost gives the unit price and silently undercharges every multi-quantity
 * line. Rightmost gives the extended total, which is what actually gets split.
 * Most consequential rule in the file.
 */
export function parseLine(line) {
  if (!line.length) return null;

  const tokens = line.map((w) => w.text);

  let priceIdx = null;
  let priceVal = null;
  for (let i = tokens.length - 1; i >= 0; i--) {
    const val = parsePrice(tokens[i]);
    if (val !== null) {
      priceIdx = i;
      priceVal = val;
      break;
    }
  }
  if (priceIdx === null) return null;

  let nameTokens = tokens.slice(0, priceIdx);

  let quantity = 1;
  if (nameTokens.length && /^\d{1,2}$/.test(nameTokens[0])) {
    quantity = parseInt(nameTokens[0], 10);
    nameTokens = nameTokens.slice(1);
  }

  // Drop interior unit-price tokens so they don't pollute the name.
  nameTokens = nameTokens.filter((t) => parsePrice(t) === null);

  const name = nameTokens.join(' ').replace(/^[\s.\-*]+|[\s.\-*]+$/g, '');
  if (name.length < 2) return null;

  return { name, price: priceVal, quantity };
}

/** Build a structured receipt from grouped lines. */
export function extractReceipt(lines) {
  const receipt = { items: [], subtotal: null, tax: 0, tip: 0, total: null };

  for (const line of lines) {
    const raw = line.map((w) => w.text).join(' ');
    const parsed = parseLine(line);

    if (NON_ITEM_RE.test(raw)) {
      if (parsed) {
        const low = raw.toLowerCase();
        const v = parsed.price;
        if (low.includes('subtotal') || low.includes('sub total')) receipt.subtotal = v;
        else if (low.includes('tax')) receipt.tax = v;
        else if (low.includes('tip') || low.includes('gratuity')) receipt.tip = v;
        else if (low.includes('total') && receipt.total === null) receipt.total = v;
      }
      continue;
    }

    if (parsed) {
      receipt.items.push({ ...parsed, shares: {} });
    }
  }

  if (receipt.subtotal === null && receipt.items.length) {
    receipt.subtotal = round2(receipt.items.reduce((s, i) => s + i.price, 0));
  }

  return receipt;
}

// ---------------------------------------------------------------------------
// The split
// ---------------------------------------------------------------------------

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * Normalize friendly share input into the relative-weight form the splitter
 * expects. Accepts numbers, or fraction strings like "3/4".
 *
 * Weights are RELATIVE and get normalized by their sum, so { a: 3, b: 1 } is
 * three-quarters / one-quarter and { a: 7, b: 1 } is seven-eighths. Callers
 * never have to make anything add up to 1.
 */
export function setShares(item, input) {
  const weights = {};
  for (const [person, value] of Object.entries(input)) {
    if (typeof value === 'string' && value.includes('/')) {
      const [num, den] = value.split('/').map(Number);
      weights[person] = den ? num / den : 0;
    } else {
      weights[person] = Number(value);
    }
  }
  item.shares = weights;
  return item;
}

/**
 * Compute what each person owes.
 *
 * Tax and tip are apportioned PROPORTIONALLY to each person's share of the
 * assigned subtotal, not divided evenly. Split evenly, a $12 salad subsidises
 * a $40 steak — proportional is what people mean by "fair" but never do by
 * hand, and it's the actual reason to use this over dividing by four.
 *
 * Rounding happens ONCE, at the end. Per-item portions stay as unrounded
 * floats. Rounding each item as you go loses a cent on every three-way split
 * of an odd amount, and those compound across a large table.
 *
 * Any residual from the final rounding goes to the largest share, so the parts
 * sum exactly to the total. Without that, someone is a penny short — small,
 * but it's the kind of bug that makes a user stop trusting the app.
 */
export function splitBill(receipt) {
  const owedPreTax = {};

  for (const item of receipt.items) {
    const totalShare = Object.values(item.shares).reduce((a, b) => a + b, 0);
    if (totalShare <= 0) continue;
    for (const [person, share] of Object.entries(item.shares)) {
      owedPreTax[person] = (owedPreTax[person] || 0) + item.price * (share / totalShare);
    }
  }

  const assigned = Object.values(owedPreTax).reduce((a, b) => a + b, 0);
  if (assigned <= 0) return {};

  const extras = (receipt.tax || 0) + (receipt.tip || 0);

  const final = {};
  for (const [person, amount] of Object.entries(owedPreTax)) {
    final[person] = round2(amount + extras * (amount / assigned));
  }

  const target = round2(assigned + extras);
  const drift = round2(target - Object.values(final).reduce((a, b) => a + b, 0));
  if (drift !== 0) {
    const biggest = Object.keys(final).reduce((a, b) => (final[a] >= final[b] ? a : b));
    final[biggest] = round2(final[biggest] + drift);
  }

  return final;
}

/** Total assigned so far — drives the "unassigned items" warning in the UI. */
export function assignmentProgress(receipt) {
  const total = receipt.items.length;
  const assigned = receipt.items.filter(
    (i) => Object.values(i.shares).reduce((a, b) => a + b, 0) > 0
  ).length;
  return { assigned, total, complete: assigned === total && total > 0 };
}
