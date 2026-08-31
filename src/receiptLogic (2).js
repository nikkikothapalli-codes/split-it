// Word boxes in, split bill out. No DOM, no WASM — runs under node for tests.

// ---------------------------------------------------------------------------
// Parsing primitives
// ---------------------------------------------------------------------------

// 12.50, 1,234.56, $8.00, 8.00- (some POS print a trailing minus)
const PRICE_RE = /^\$?(\d{1,3}(?:,\d{3})*|\d+)[.,](\d{2})-?$/;

const NON_ITEM_RE = new RegExp(
  '\\b(subtotal|sub total|total|tax|tip|gratuity|balance|amount due|' +
  'service charge|svc chg|change|cash|visa|mastercard|amex|debit|credit|' +
  'card|auth|approval|server|table|guests?|order|check|receipt|thank you)\\b',
  'i'
);

// null if not price-shaped
export function parsePrice(token) {
  const m = PRICE_RE.exec(String(token).trim());
  if (!m) return null;
  return parseFloat(`${m[1].replace(/,/g, '')}.${m[2]}`);
}

// word: { text, left, top, width, height, conf } — same shape as the python version

const centerY = (w) => w.top + w.height / 2;
const right = (w) => w.left + w.width;

function median(values) {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// tolerance scales with text height, not fixed px — otherwise it only works at one zoom level
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

// deskew leaves ~0.5deg, enough to split 'SUBTOTAL' from '34.00' across the width.
// item lines survive because their words run continuously. merge if close vertically
// and NOT overlapping horizontally — real separate lines always overlap.
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

// rightmost price wins. '2 TACOS 4.50 9.00' — leftmost is unit price, undercharges qty>1
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

// weights are relative and normalized by their sum — {a:3,b:1} is 3/4 and 1/4
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

// tax+tip proportional to what you ordered. even split means the salad subsidizes the steak.
// round once at the end — rounding per item loses a cent on every 3-way split
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

// drives the unassigned-items warning
export function assignmentProgress(receipt) {
  const total = receipt.items.length;
  const assigned = receipt.items.filter(
    (i) => Object.values(i.shares).reduce((a, b) => a + b, 0) > 0
  ).length;
  return { assigned, total, complete: assigned === total && total > 0 };
}
