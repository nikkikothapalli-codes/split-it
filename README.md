# Split it

Photograph a restaurant receipt, tap who had what, get an exact split. Tax and
tip are apportioned by what each person actually ordered.

Runs entirely in the browser. The photo never leaves the device — no upload,
no server, nothing stored.

## Running it

```bash
npm install
npm run dev
```

Open http://localhost:5173.

opencv.js loads from a CDN in `index.html`; it isn't installable as a module.

## How it works

```
photo
  ↓  scan.js          deskew, adaptive threshold, denoise (opencv.js)
  ↓  scan.js          word boxes with coordinates (tesseract.js)
  ↓  receiptLogic.js  group boxes into lines, repair split lines
  ↓  receiptLogic.js  parse name / price / quantity, detect totals
  ↓  receiptLogic.js  assign shares, split proportionally
per-person totals
```

| File | Does |
|---|---|
| `src/scan.js` | Image → word boxes. The only file touching WASM. |
| `src/receiptLogic.js` | Word boxes → receipt → split. Pure logic, runs under node. |
| `src/SplitApp.jsx` | UI. |

## Decisions

**Everything client-side.** A server would have meant uploading photos of
people's receipts and deciding how long to keep them. Moving the pipeline into
WASM removes the question. OCR takes a few seconds on a phone instead of
milliseconds on a server, so the UI reports progress in stages.

**The price is the rightmost price-shaped token on a line.**

```
2  CARNITAS TACOS   4.50    9.00
^qty                ^unit   ^extended
```

Taking the leftmost number gives the unit price and silently undercharges every
multi-quantity line.

**Lines are rebuilt from coordinates, then repaired.** Words are clustered into
lines by vertical position, but deskew never fully removes rotation. Where a
label sits far left and its price far right, half a degree of residual tilt
pushes their centres past the clustering tolerance, so `SUBTOTAL` and `34.00`
land in separate lines. Item lines survive because their words run continuously
across the width — meaning the naive version looks fine on items and fails on
the totals. A second pass merges groups that are vertically close and
horizontally non-overlapping.

**Tax and tip are proportional, not even.** Split evenly, a $12 salad
subsidises a $40 steak.

**Rounding happens once, at the end.** Per-item portions stay unrounded.
Rounding each item as you go loses a cent on every three-way split of an odd
amount. Residual from the final rounding goes to the largest share so the parts
sum exactly.

**Shares are relative weights.** `{ alex: 3, sam: 1 }` is three-quarters and
one-quarter. Callers never have to make anything add up to 1.

## Known limits

- Curled receipts. Skew correction assumes one rotation angle.
- Modifiers indented under a parent item (`+ add avocado  2.00`) parse as
  separate items.
- Multi-column receipts.
- The totals regex covers common labels but every POS words them differently.
- No test suite yet.
