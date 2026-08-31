import React, { useState, useMemo, useRef, useEffect } from "react";
import { scanReceipt } from "./scan";
import { groupIntoLines, extractReceipt } from "./receiptLogic";

// TODO: split math is duplicated below — import from receiptLogic once the OCR is wired

const C = {
  bg: "#FAF9F4",
  paper: "#F3F1EA",
  card: "#FFFFFF",
  text: "#1A1D1A",
  dim: "#6E7370",
  line: "#E4E2D8",
  accent: "#2F7D32",
  accentSoft: "#EBF3E9",
  accentDim: "#4C9A4F",
};

// icons carry the color, so people get neutral initials — two color systems
// competing means you can't tell which one you're reading
const FOOD = {
  pasta: "#E0A33E",
  salad: "#4E9C5C",
  drink: "#3E86C4",
  coffee: "#8A5A3C",
  dessert: "#D4638A",
  pizza: "#D6533E",
  taco: "#E08A3C",
  bread: "#C08A4E",
  plate: "#7A7F85",
};



const PIPELINE = [
  "straightening the photo",
  "cleaning up contrast",
  "reading the text",
  "finding line items",
];

const MERCHANT = ["MARIO'S", "ITALIAN KITCHEN"];

const SAMPLE_ITEMS = [
  { id: 1, name: "PASTA", qty: 2, price: 24.0, conf: 94 },
  { id: 2, name: "GARDEN SALAD", qty: 1, price: 9.0, conf: 91 },
  { id: 3, name: "DRINKS", qty: 4, price: 28.0, conf: 61 },
  { id: 4, name: "TIRAMISU", qty: 2, price: 14.0, conf: 88 },
];

const S = { fill: "none", stroke: "currentColor", strokeWidth: 1.5,
            strokeLinecap: "round", strokeLinejoin: "round",
            vectorEffect: "non-scaling-stroke" };

const ART = {
  pizza: { c: "#D6533E", d: ["M8 62 Q10 30 40 24 Q70 30 72 62 Z","M4 62 Q40 72 76 62","M22 42 a4 4 0 1 0 .1 0","M52 38 a4 4 0 1 0 .1 0","M38 54 a3.5 3.5 0 1 0 .1 0","M76 62 q10 4 6 12 q-3 5 -8 1"] },
  ramen: { c: "#E0A33E", d: ["M10 40 q30 -18 60 0","M6 44 q34 34 68 0","M6 44 q-6 -6 2 -9","M22 34 q6 -12 14 -4","M44 30 q8 -14 16 -2","M34 44 a3 3 0 1 0 .1 0","M50 48 a3 3 0 1 0 .1 0","M74 44 q10 2 8 12 q-2 6 -8 2"] },
  taco: { c: "#4E9C5C", d: ["M12 66 q6 -44 34 -46 q30 2 34 46","M6 66 q40 10 82 0","M28 30 q-10 -14 4 -18 q10 -2 10 8","M52 28 q4 -16 16 -10 q8 6 0 14","M42 46 q8 -6 16 0","M6 66 q-8 6 0 12"] },
  coffee: { c: "#3E86C4", d: ["M22 30 h48 v10 q0 30 -24 30 q-24 0 -24 -30 Z","M70 36 q16 0 16 12 q0 12 -16 12","M46 70 v14","M28 84 h36","M34 20 q6 -8 0 -14","M50 20 q6 -8 0 -14","M86 48 q8 6 2 12"] },
  dessert: { c: "#D4638A", d: ["M18 44 h56 v34 a8 8 0 0 1 -8 8 h-40 a8 8 0 0 1 -8 -8 Z","M18 44 q0 -22 28 -22 q28 0 28 22","M12 44 h68","M46 22 v-10","M46 8 a4 4 0 1 0 .1 0","M80 44 q10 4 4 12"] },
  bao: { c: "#8A5A3C", d: ["M14 40 q0 -16 16 -16 h34 q16 0 16 16 v6 h-66 Z","M10 48 h74 q-4 34 -37 34 q-33 0 -37 -34","M28 46 v-14","M46 46 v-16","M64 46 v-14","M84 48 q10 2 6 10"] },
  curry: { c: "#E08A3C", d: ["M14 74 q0 -34 34 -34 q34 0 34 34","M8 74 h80","M26 40 q0 -14 22 -14 q22 0 22 14","M48 26 v-12","M38 18 q10 -10 20 0","M8 74 q-8 8 2 12"] },
  sushi: { c: "#7C6BC4", d: ["M18 46 h30 v34 h-30 Z","M18 46 q15 -12 30 0","M32 54 a7 7 0 1 0 .1 0","M58 50 q18 -4 22 14 q4 18 -14 20 q-16 2 -14 -14","M62 62 a5 5 0 1 0 .1 0","M80 78 q10 4 4 12"] },
  bread: { c: "#C08A4E", d: ["M12 62 q6 -30 34 -30 q28 0 34 30","M6 62 q40 14 82 0","M20 44 q10 -16 22 -6","M48 38 q12 -14 22 -2","M34 54 q12 -6 22 2","M88 62 q8 6 0 12"] },
  boba: { c: "#2FA8A0", d: ["M30 34 h34 l-6 46 a12 12 0 0 1 -22 0 Z","M26 34 h42","M36 48 a3 3 0 1 0 .1 0","M50 56 a3 3 0 1 0 .1 0","M42 68 a3 3 0 1 0 .1 0","M47 34 v-14 q0 -8 12 -8","M68 40 q10 4 4 12"] },
  empanada: { c: "#B85C8A", d: ["M14 56 q34 -30 68 0","M14 56 q34 26 68 0","M14 56 q-8 -4 -2 -10","M32 48 q8 -8 16 0","M54 50 q8 -8 14 0","M82 56 q10 4 4 12"] },
  wrap: { c: "#639922", d: ["M24 78 q-10 -46 22 -52 q32 6 22 52 Z","M18 78 h56","M46 26 v-14","M46 12 q-12 -8 -2 -12 q10 -2 10 6","M36 46 q10 -6 20 0","M74 78 q10 4 4 12"] },
  dumpling: { c: "#E0A33E", d: ["M20 52 q26 -30 52 0","M14 56 q32 28 64 0","M14 56 q-8 -2 -4 -8","M44 40 q0 -14 -12 -16","M78 56 q10 4 4 12"] },
  pho: { c: "#D6533E", d: ["M18 66 q-6 -34 28 -34 q34 0 28 34 Z","M12 66 h68","M28 44 q18 -10 36 0","M46 32 v-10","M80 66 q10 4 4 12"] },
  rice: { c: "#3E86C4", d: ["M26 34 q20 -16 40 0 l-6 44 h-28 Z","M22 38 h48","M38 50 h16","M38 62 h16","M70 44 q10 4 4 12"] },
  bagel: { c: "#8A5A3C", d: ["M16 60 h60 q-4 22 -30 22 q-26 0 -30 -22 Z","M16 60 q0 -26 30 -26 q30 0 30 26","M30 44 q16 -8 32 0","M46 34 v-12","M76 60 q10 4 4 12"] },
  salad: { c: "#4E9C5C", d: ["M12 56 h72 q-6 30 -36 30 q-30 0 -36 -30","M6 56 h84","M24 50 q-8 -18 8 -22 q12 -2 10 10","M46 46 q2 -20 18 -16 q12 4 4 16","M60 52 q10 -12 20 -4","M90 56 q8 6 0 12"] },
  drink: { c: "#3E86C4", d: ["M28 32 h36 l-5 44 a10 10 0 0 1 -26 0 Z","M24 32 h44","M32 46 h28","M46 32 v-16","M46 16 h14","M68 40 q10 4 4 12"] },
};

// receipts abbreviate — match on fragments, not whole words
const KEYWORDS = [
  [["pizza","margherita","pepperoni","calzone"], "pizza"],
  [["ramen","noodle","udon","soba","lo mein"], "ramen"],
  [["taco","burrito","quesadilla","nacho","queso","fajita","carnitas","al pastor"], "taco"],
  [["coffee","espresso","latte","cappuccino","americano","mocha","cortado"], "coffee"],
  [["tiramisu","dessert","cake","gelato","ice cream","churro","pie","sundae","brownie","flan"], "dessert"],
  [["bao","dim sum","pork bun","steamed bun"], "bao"],
  [["curry","tikka","masala","korma","vindaloo","dal","biryani"], "curry"],
  [["sushi","sashimi","nigiri","maki","roll","poke"], "sushi"],
  [["croissant","pastry","danish","scone","muffin"], "bread"],
  [["boba","bubble tea","milk tea","matcha","smoothie"], "boba"],
  [["empanada","arepa","pupusa","samosa","pierogi"], "empanada"],
  [["wrap","falafel","shawarma","gyro","kebab","hummus","pita"], "wrap"],
  [["dumpling","gyoza","potsticker","wonton","mandu"], "dumpling"],
  [["pho","soup","broth","bisque","chowder","stew"], "pho"],
  [["rice","bibimbap","paella","risotto","fried rice","donburi"], "rice"],
  [["bagel","toast","sandwich","panini","sub","burger","melt"], "bagel"],
  [["salad","greens","caesar","slaw","bowl"], "salad"],
  [["drink","soda","juice","water","beer","wine","horchata","lemonade","tea","cola"], "drink"],
  [["pasta","spaghetti","linguine","penne","carbonara","alfredo","lasagna","gnocchi"], "ramen"],
];

function keyFor(name) {
  const n = name.toLowerCase();
  for (const [words, key] of KEYWORDS) {
    if (words.some((w) => n.includes(w))) return key;
  }
  return null;
}

const colorFor = (name) => {
  const k = keyFor(name);
  return k ? ART[k].c : "#9AA0A6";
};

// no icon beats a wrong icon
const FoodIcon = ({ name, size = 24, forceKey }) => {
  const key = forceKey || keyFor(name);
  if (!key) return <span style={{ width: size, height: size, flexShrink: 0 }} />;
  const { c, d } = ART[key];
  return (
    <svg width={size} height={size} viewBox="0 0 96 96"
         style={{ color: c, flexShrink: 0, overflow: "visible" }} aria-hidden="true">
      {d.map((path, i) => <path key={i} d={path} {...S} />)}
    </svg>
  );
};

// too small for linework — dot carries the color instead
const Dot = ({ name, size = 7 }) => (
  <span style={{ width: size, height: size, borderRadius: "50%", flexShrink: 0,
                 background: colorFor(name) }} />
);

// framing art along the viewport edges. top is left clear for the header.
const EDGE = {
  left: [
    { k: "pizza",    t: "9%",  s: 76, r: -12, o: -14 },
    { k: "salad",    t: "27%", s: 68, r: 8,   o: -6 },
    { k: "boba",     t: "45%", s: 60, r: -7,  o: -18 },
    { k: "bao",      t: "62%", s: 70, r: 11,  o: -8 },
    { k: "empanada", t: "80%", s: 62, r: -5,  o: -16 },
  ],
  right: [
    { k: "ramen",   t: "12%", s: 72, r: 10,  o: -12 },
    { k: "sushi",   t: "30%", s: 64, r: -8,  o: -20 },
    { k: "coffee",  t: "48%", s: 58, r: 13,  o: -6 },
    { k: "curry",   t: "65%", s: 70, r: -9,  o: -16 },
    { k: "bagel",   t: "83%", s: 62, r: 7,   o: -10 },
  ],
  bottom: [
    { k: "taco",     l: "9%",  s: 66, r: -10, o: -18 },
    { k: "dumpling", l: "23%", s: 58, r: 9,   o: -10 },
    { k: "bread",    l: "37%", s: 62, r: -6,  o: -20 },
    { k: "pho",      l: "51%", s: 60, r: 12,  o: -12 },
    { k: "rice",     l: "65%", s: 56, r: -8,  o: -18 },
    { k: "wrap",     l: "79%", s: 64, r: 6,   o: -8 },
    { k: "dessert",  l: "91%", s: 58, r: -11, o: -16 },
  ],
};

// interior field — sits behind the content, so it stays fainter and smaller
// than the edge frame or it competes with the text on top of it
const FIELD = [
  { k: "pizza",    t: "16%", l: "22%", s: 52, r: -13 },
  { k: "boba",     t: "12%", l: "68%", s: 44, r: 9 },
  { k: "sushi",    t: "31%", l: "38%", s: 48, r: -7 },
  { k: "coffee",   t: "26%", l: "84%", s: 40, r: 14 },
  { k: "taco",     t: "44%", l: "17%", s: 50, r: 6 },
  { k: "dessert",  t: "40%", l: "76%", s: 46, r: -11 },
  { k: "ramen",    t: "58%", l: "31%", s: 44, r: 10 },
  { k: "curry",    t: "55%", l: "88%", s: 42, r: -6 },
  { k: "bread",    t: "70%", l: "12%", s: 48, r: 12 },
  { k: "wrap",     t: "67%", l: "62%", s: 46, r: -9 },
  { k: "dumpling", t: "82%", l: "44%", s: 42, r: 7 },
  { k: "salad",    t: "86%", l: "78%", s: 50, r: -12 },
  { k: "pho",      t: "36%", l: "6%",  s: 40, r: 8 },
  { k: "rice",     t: "76%", l: "28%", s: 38, r: -5 },
  { k: "bagel",    t: "20%", l: "50%", s: 42, r: 11 },
  { k: "empanada", t: "62%", l: "48%", s: 40, r: -8 },
];

// `o` pushes each drawing partly off-screen so the frame feels cropped, not placed
const EdgeArt = () => (
  <div aria-hidden="true" className="edge-art"
       style={{ position: "fixed", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 0 }}>
    {FIELD.map((f, i) => (
      <div key={`f${i}`} style={{ position: "absolute", top: f.t, left: f.l,
                                  transform: `rotate(${f.r}deg)`, opacity: .17 }}>
        <FoodIcon name="" forceKey={f.k} size={f.s} />
      </div>
    ))}
    {EDGE.left.map((e, i) => (
      <div key={`l${i}`} style={{ position: "absolute", top: e.t, left: e.o,
                                  transform: `rotate(${e.r}deg)`, opacity: .5 }}>
        <FoodIcon name="" forceKey={e.k} size={e.s} />
      </div>
    ))}
    {EDGE.right.map((e, i) => (
      <div key={`r${i}`} style={{ position: "absolute", top: e.t, right: e.o,
                                  transform: `rotate(${e.r}deg)`, opacity: .5 }}>
        <FoodIcon name="" forceKey={e.k} size={e.s} />
      </div>
    ))}
    {EDGE.bottom.map((e, i) => (
      <div key={`b${i}`} style={{ position: "absolute", left: e.l, bottom: e.o,
                                  transform: `translateX(-50%) rotate(${e.r}deg)`, opacity: .5 }}>
        <FoodIcon name="" forceKey={e.k} size={e.s} />
      </div>
    ))}
  </div>
);

const UI = {
  camera: ["M14 34 h12 l6 -8 h20 l6 8 h12 a6 6 0 0 1 6 6 v30 a6 6 0 0 1 -6 6 h-56 a6 6 0 0 1 -6 -6 v-30 a6 6 0 0 1 6 -6 Z",
           "M48 56 a13 13 0 1 0 .1 0", "M66 42 a2.5 2.5 0 1 0 .1 0"],
  lock: ["M28 44 h40 v30 a4 4 0 0 1 -4 4 h-32 a4 4 0 0 1 -4 -4 Z",
         "M36 44 v-10 a12 12 0 0 1 24 0 v10", "M48 58 v8"],
};

const LineIcon = ({ name, size = 20, color }) => (
  <svg width={size} height={size} viewBox="0 0 96 96"
       style={{ color, flexShrink: 0, overflow: "visible" }} aria-hidden="true">
    {UI[name].map((d, i) => <path key={i} d={d} {...S} />)}
  </svg>
);

// eases toward the target so numbers settle instead of snapping
function useCountUp(target, ms = 420) {
  const [v, setV] = React.useState(target);
  const ref = React.useRef(target);
  React.useEffect(() => {
    if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      ref.current = target; setV(target); return;
    }
    const from = ref.current;
    const t0 = performance.now();
    let raf;
    const tick = (now) => {
      const p = Math.min(1, (now - t0) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      const val = from + (target - from) * eased;
      setV(val);
      ref.current = val;
      if (p < 1) raf = requestAnimationFrame(tick);
      else ref.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const money = (n) => Number(n || 0).toFixed(2);

// tax+tip proportional to each person's items, not even. round once at the end.
function splitBill(items, tax, tip) {
  const owed = {};
  for (const it of items) {
    const tw = Object.values(it.shares).reduce((a, b) => a + b, 0);
    if (tw <= 0) continue;
    for (const [p, w] of Object.entries(it.shares)) {
      owed[p] = (owed[p] || 0) + it.price * (w / tw);
    }
  }
  const assigned = Object.values(owed).reduce((a, b) => a + b, 0);
  if (assigned <= 0) return { final: {}, pre: {} };

  const extras = tax + tip;
  const final = {};
  for (const [p, amt] of Object.entries(owed)) {
    final[p] = round2(amt + extras * (amt / assigned));
  }
  const target = round2(assigned + extras);
  const drift = round2(target - Object.values(final).reduce((a, b) => a + b, 0));
  if (drift !== 0) {
    const big = Object.keys(final).reduce((a, b) => (final[a] >= final[b] ? a : b));
    final[big] = round2(final[big] + drift);
  }
  return { final, pre: owed };
}

export default function SplitApp() {
  const [stage, setStage] = useState("upload");
  const [step, setStep] = useState(0);
  const [elapsed, setElapsed] = useState("0.00");
  const [view, setView] = useState("receipt");

  const [people, setPeople] = useState(["Nikki", "Alex"]);
  const [newPerson, setNewPerson] = useState("");
  const [items, setItems] = useState([]);
  const [tax, setTax] = useState(0);
  const [tip, setTip] = useState(0);

  const [hovered, setHovered] = useState(null);
  const [editing, setEditing] = useState(null);
  const [showCalc, setShowCalc] = useState(false);
  const [copied, setCopied] = useState(false);
  const [scanError, setScanError] = useState(null);
  const fileRef = useRef(null);

  const LivePill = ({ name, amount }) => {
    const shown = useCountUp(amount);
    return (
      <span className={`pill${amount > 0 ? " live" : ""}`}>
        <Avatar name={name} size={20} on={amount > 0} />
        <span className="mono" style={{ fontSize: 12, color: amount > 0 ? C.text : C.dim }}>
          ${shown.toFixed(2)}
        </span>
      </span>
    );
  };

  const AnimatedTotal = ({ value, size }) => {
    const shown = useCountUp(value);
    return (
      <span className="disp" style={{ fontSize: size, letterSpacing: "-.025em" }}>
        ${shown.toFixed(2)}
      </span>
    );
  };

  const initials = (p) => p.trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();

  const Avatar = ({ name, size = 26, on = true }) => (
    <span style={{ width: size, height: size, borderRadius: "50%", flexShrink: 0,
                   display: "inline-flex", alignItems: "center", justifyContent: "center",
                   fontSize: size * 0.4, fontWeight: 600, letterSpacing: ".02em",
                   background: on ? C.text : "transparent",
                   color: on ? "#fff" : C.dim,
                   border: on ? "none" : `1px solid ${C.line}` }}>
      {initials(name)}
    </span>
  );

  // real pipeline: opencv.js -> tesseract.js -> line reconstruction
  const handleFile = async (file) => {
    if (!file) return;
    setStage("processing");
    setStep(0);
    const t0 = performance.now();
    try {
      const words = await scanReceipt(file, {
        onStage: () => {},
        onProgress: (p) => setStep(Math.min(PIPELINE.length, Math.floor(p * PIPELINE.length) + 1)),
      });
      const r = extractReceipt(groupIntoLines(words));
      if (!r.items.length) throw new Error("Couldn't find any line items. Try a flatter, brighter photo.");
      setItems(r.items.map((it, i) => ({
        id: i + 1, name: it.name, qty: it.quantity, price: it.price, conf: 100, shares: {},
      })));
      setTax(r.tax || 0);
      setTip(r.tip || 0);
      setElapsed(((performance.now() - t0) / 1000).toFixed(2));
      setStage("workspace");
    } catch (err) {
      setScanError(err.message || "Something went wrong reading that photo.");
      setStage("upload");
    }
  };

  // sample data — remove once the real path is trusted
  const beginProcessing = () => {
    setStage("processing");
    setStep(0);
    const t0 = performance.now();
    PIPELINE.forEach((_, i) => setTimeout(() => setStep(i + 1), 400 * (i + 1)));
    setTimeout(() => {
      setItems(SAMPLE_ITEMS.map((i) => ({ ...i, shares: {} })));
      setTax(5.04);
      setTip(12.2);
      setElapsed(((performance.now() - t0) / 1000).toFixed(2));
      setStage("workspace");
    }, 400 * PIPELINE.length + 280);
  };

  const subtotal = useMemo(() => round2(items.reduce((s, i) => s + i.price, 0)), [items]);
  const { final: totals, pre } = useMemo(() => splitBill(items, tax, tip), [items, tax, tip]);
  const grand = round2(subtotal + tax + tip);
  const unassigned = items.filter(
    (i) => Object.values(i.shares).reduce((a, b) => a + b, 0) === 0
  ).length;

  // shares are relative weights; 1 each = even split
  const togglePerson = (itemId, person) =>
    setItems((prev) =>
      prev.map((it) => {
        if (it.id !== itemId) return it;
        const shares = { ...it.shares };
        if (shares[person]) delete shares[person];
        else shares[person] = 1;
        return { ...it, shares };
      })
    );

  const patchItem = (id, patch) =>
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));

  const addItem = () =>
    setItems((prev) => [
      ...prev,
      { id: Date.now(), name: "New item", qty: 1, price: 0, conf: 100, shares: {} },
    ]);

  const addPerson = () => {
    const n = newPerson.trim();
    if (!n || people.includes(n) || people.length >= 6) return;
    setPeople([...people, n]);
    setNewPerson("");
  };

  const removePerson = (p) => {
    setPeople(people.filter((x) => x !== p));
    setItems((prev) =>
      prev.map((it) => {
        const s = { ...it.shares };
        delete s[p];
        return { ...it, shares: s };
      })
    );
  };

  const copySummary = () => {
    const lines = Object.entries(totals)
      .sort((a, b) => b[1] - a[1])
      .map(([p, v]) => `${p}  $${money(v)}`);
    navigator.clipboard?.writeText(
      `${MERCHANT.join(" ")}\n$${money(grand)} · ${Object.keys(totals).length} people\n\n` +
        lines.join("\n") +
        `\n\nTax + tip split by what everyone ordered.`
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const css = `
@import url('https://api.fontshare.com/v2/css?f[]=general-sans@400,500,600,700&display=swap');
@import url('https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=swap');
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&display=swap');
.si, .si * { box-sizing: border-box; }
.si { font-family: 'General Sans', system-ui, sans-serif; color: ${C.text}; background: ${C.bg};
      min-height: 100vh; -webkit-font-smoothing: antialiased; }
.si .mono { font-family: 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
.si .disp { font-weight: 700; letter-spacing: -.03em; }
.si .lab { font-size: 10px; letter-spacing: .12em; text-transform: uppercase; color: ${C.dim}; font-weight: 600; }
.si .btn { border: 1px solid ${C.line}; background: ${C.card}; color: ${C.text};
       padding: 10px 18px; font-size: 12px; font-weight: 500; cursor: pointer;
       border-radius: 10px; transition: border-color .15s, background .15s, transform .1s; }
.si .btn:hover:not(:disabled) { border-color: ${C.text}; }
.si .btn:active:not(:disabled) { transform: scale(.98); }
.si .btn-primary { background: ${C.accent}; border-color: ${C.accent}; color: #fff; }
.si .btn-primary:hover:not(:disabled) { background: #276C2A; border-color: #276C2A; }
.si .btn:disabled { opacity: .4; cursor: default; }
.si .tag { font-size: 11px; padding: 5px 10px; border-radius: 999px; border: 1px solid ${C.line};
       cursor: pointer; transition: all .13s; display: inline-flex; align-items: center; gap: 6px;
       background: ${C.card}; }
.si .tag:active { transform: scale(.96); }
.si .inp { border: 1px solid ${C.line}; background: ${C.card}; padding: 8px 11px; font-size: 13px;
       border-radius: 9px; color: ${C.text}; font-family: inherit; }
.si .inp:focus { outline: none; border-color: ${C.text}; }
.si .ghost { background: none; border: none; cursor: pointer; padding: 0; font-family: inherit; }
.si .drop { transition: border-color .15s, background .15s; }
.si .drop:hover { border-color: ${C.text}; background: #FFFFFF; }
.si .grid2 { display: grid; grid-template-columns: 45fr 55fr; align-items: start; }
.si .divider { border-left: 1px solid ${C.line}; min-height: calc(100vh - 58px); }
@media (max-width: 900px) {
  .si .grid2 { grid-template-columns: 1fr; }
  .si .stage { min-height: 0 !important; padding: 32px 20px 40px !important; }
  .si .edge-art { display: none; }
  .si .divider { border-left: none; border-top: 1px solid ${C.line}; min-height: 0; }
}
.si :focus-visible { outline: 2px solid ${C.text}; outline-offset: 2px; }
.si .tag:hover { transform: translateY(-1px); }
.si .rise { animation: rise .34s cubic-bezier(.22,.9,.3,1) both; }
@keyframes rise { from { opacity: 0; transform: translateY(9px); } to { opacity: 1; transform: none; } }
.si .bar { height: 3px; background: ${C.line}; border-radius: 99px; overflow: hidden; }
.si .bar > i { display: block; height: 100%; background: ${C.text}; border-radius: 99px;
               transition: width .4s cubic-bezier(.22,.9,.3,1); }
.si .pill { display: inline-flex; align-items: center; gap: 7px; padding: 6px 11px 6px 6px;
            border-radius: 999px; background: ${C.card}; border: 1px solid ${C.line};
            transition: border-color .2s; }
.si .pill.live { border-color: ${C.text}; }
.si .drop:hover .lift { transform: translateY(-2px); }
.si .lift { transition: transform .25s cubic-bezier(.22,.9,.3,1); }
.si .receipt {
  box-shadow: 0 1px 2px rgba(25,27,29,.05), 0 8px 24px -6px rgba(25,27,29,.13);
  -webkit-mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='18' height='11'%3E%3Cpath d='M0 0h18v6l-4.5 5-4.5-5-4.5 5L0 6z' fill='%23000'/%3E%3C/svg%3E"),
                     linear-gradient(#000,#000);
  -webkit-mask-repeat: repeat-x, no-repeat;
  -webkit-mask-position: bottom, top;
  -webkit-mask-size: 18px 11px, 100% calc(100% - 10px);
  mask-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='18' height='11'%3E%3Cpath d='M0 0h18v6l-4.5 5-4.5-5-4.5 5L0 6z' fill='%23000'/%3E%3C/svg%3E"),
              linear-gradient(#000,#000);
  mask-repeat: repeat-x, no-repeat;
  mask-position: bottom, top;
  mask-size: 18px 11px, 100% calc(100% - 10px);
}
.si .stage { background: linear-gradient(180deg, #F1EEE5 0%, #F7F5EF 100%); }

.si .hero { display: grid; grid-template-columns: minmax(0,1fr) minmax(0,.9fr);
            gap: 40px; align-items: center; max-width: 1120px; margin: 0 auto;
            padding: 24px 32px 80px; }
.si .hero-copy { max-width: 470px; }
.si .hero-prop { position: relative; display: flex; justify-content: center; }

.si .drop { width: 100%; max-width: 460px; min-height: 300px; background: ${C.card};
            border: 2px dashed ${C.accentDim}; border-radius: 22px;
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            cursor: pointer; }
.si .drop:hover { border-color: ${C.accent}; background: #FEFFFE; }
.si .camera-badge { width: 74px; height: 74px; border-radius: 50%; background: ${C.accentSoft};
                    display: inline-flex; align-items: center; justify-content: center; }
.si .cta { width: 100%; max-width: 460px; margin-top: 20px; display: inline-flex;
           align-items: center; justify-content: center; gap: 10px;
           padding: 17px 24px; font-size: 16px; font-weight: 600; border-radius: 13px;
           text-transform: none; letter-spacing: 0; }
.si .note { display: flex; align-items: center; gap: 14px; margin-top: 26px;
            padding: 16px 20px; border-radius: 14px; background: ${C.accentSoft};
            max-width: 460px; line-height: 1.45; }

.si .prop-receipt { width: 300px; background: #FBFAF7; border-radius: 3px;
                    padding: 26px 22px 22px; transform: rotate(2.4deg);
                    box-shadow: 0 2px 4px rgba(26,29,26,.06), 0 22px 44px -14px rgba(26,29,26,.22); }
.si .dash { border-top: 1px dashed #C9C6BC; margin: 11px 0; }
.si .sparkle { position: absolute; top: -6px; right: 22px; }

@media (max-width: 940px) {
  .si .hero { grid-template-columns: 1fr; gap: 44px; padding: 16px 22px 64px; }
  .si .hero-copy { max-width: none; }
  .si .hero-copy h1 { font-size: 38px !important; }
  .si .prop-receipt { transform: rotate(1.5deg); }
}
@media (prefers-reduced-motion: reduce) {
  .si * { transition: none !important; animation: none !important; }
  .si .rise { opacity: 1 !important; transform: none !important; }
}
`;

  const Header = () => (
    <header className="flex items-center justify-between"
            style={{ padding: "18px 32px" }}>
      <span className="disp flex items-center" style={{ fontSize: 21, gap: 9, letterSpacing: "-.02em" }}>
        <span style={{ width: 26, height: 26, borderRadius: "50%", background: C.accentSoft,
                       display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
          <FoodIcon name="" forceKey="salad" size={17} />
        </span>
        Split it
      </span>
      <span className="flex items-center" style={{ gap: 7, padding: "7px 14px", borderRadius: 999,
                                                   background: C.accentSoft, color: C.accent }}>
        <LineIcon name="lock" size={14} color={C.accent} />
        <span style={{ fontSize: 12.5, fontWeight: 500 }}>100% on-device</span>
      </span>
    </header>
  );

  // upload
  if (stage === "upload") {
    return (
      <div className="si">
        <style>{css}</style>
        <Header />
        <div className="hero">
          <div className="hero-copy">
            <h1 className="disp" style={{ fontSize: 52, lineHeight: 1.06, letterSpacing: "-.035em",
                                          marginBottom: 16 }}>
              Split the check.<br />
              <span style={{ color: C.accent }}>Not</span> the headache.
            </h1>
            <p style={{ fontSize: 17, color: C.dim, marginBottom: 30 }}>
              Snap a receipt and we'll handle the math.
            </p>

            <div className="drop" role="button" tabIndex={0}
                 onClick={() => fileRef.current?.click()}
                 onKeyDown={(e) => e.key === "Enter" && fileRef.current?.click()}
                 onDragOver={(e) => e.preventDefault()}
                 onDrop={(e) => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}>
              <span className="lift camera-badge">
                <LineIcon name="camera" size={34} color={C.accent} />
              </span>
              <span style={{ fontSize: 17, fontWeight: 600, marginTop: 18 }}>Drop receipt here</span>
              <span style={{ fontSize: 14, color: C.dim, marginTop: 6 }}>or choose a photo</span>
            </div>

            <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => handleFile(e.target.files[0])} />

            <div className="mono" style={{ fontSize: 12, color: C.dim, marginTop: 18,
                                           letterSpacing: ".22em", textAlign: "center" }}>
              JPG · PNG · HEIC
            </div>

            <button className="btn btn-primary cta" onClick={() => fileRef.current?.click()}>
              <LineIcon name="camera" size={20} color="#fff" />
              Scan receipt
            </button>

            {scanError && (
              <div style={{ marginTop: 18, padding: "13px 16px", borderRadius: 12,
                            background: "#FBEDEA", color: "#9B3B2C", fontSize: 13.5,
                            maxWidth: 460, lineHeight: 1.5 }}>
                {scanError}
              </div>
            )}

            <button className="ghost" onClick={beginProcessing}
                    style={{ marginTop: 14, fontSize: 13, color: C.dim,
                             textDecoration: "underline", textUnderlineOffset: 3 }}>
              Try it with a sample receipt
            </button>

            <div className="note">
              <LineIcon name="lock" size={22} color={C.accent} />
              <span>
                <strong style={{ fontWeight: 600, fontSize: 14.5 }}>Your receipt stays on your device.</strong>
                <br />
                <span style={{ fontSize: 13.5, color: C.dim }}>We never upload your data.</span>
              </span>
            </div>
          </div>

          <div className="hero-prop">
            <svg width="46" height="34" viewBox="0 0 46 34" className="sparkle" aria-hidden="true">
              <g fill="none" stroke={C.accentDim} strokeWidth="3" strokeLinecap="round">
                <path d="M9 26 L5 6" /><path d="M23 22 L27 4" /><path d="M36 26 L43 12" />
              </g>
            </svg>
            <div className="prop-receipt mono">
              <div style={{ textAlign: "center", marginBottom: 16 }}>
                <div style={{ fontSize: 14, fontWeight: 500, letterSpacing: ".06em" }}>SUNNYSIDE CAFE</div>
                <div style={{ fontSize: 11, color: C.dim, marginTop: 5 }}>123 Main Street</div>
                <div style={{ fontSize: 11, color: C.dim }}>Austin, TX 78701</div>
              </div>
              <div className="flex justify-between" style={{ fontSize: 11, color: C.dim }}>
                <span>Date: May 18, 2024</span><span>7:42 PM</span>
              </div>
              <div style={{ fontSize: 11, color: C.dim, marginBottom: 12 }}>Table: 12</div>
              <div className="dash" />
              {[["Margherita Pizza", "14.00"], ["Garlic Bread", "6.00"], ["Caesar Salad", "8.50"],
                ["Lemonade", "3.50"], ["Iced Tea", "3.00"], ["Chicken Bowl", "15.50"],
                ["Burger", "13.50"]].map(([n, p]) => (
                <div key={n} className="flex justify-between" style={{ fontSize: 12, padding: "3px 0" }}>
                  <span>{n}</span><span>${p}</span>
                </div>
              ))}
              <div className="dash" />
              {[["Subtotal", "64.00"], ["Tax", "5.28"], ["Tip (18%)", "12.47"]].map(([n, p]) => (
                <div key={n} className="flex justify-between" style={{ fontSize: 12, padding: "3px 0", color: C.dim }}>
                  <span>{n}</span><span>${p}</span>
                </div>
              ))}
              <div className="dash" />
              <div className="flex justify-between" style={{ fontSize: 16, fontWeight: 600, padding: "4px 0" }}>
                <span>Total</span><span>$81.75</span>
              </div>
              <div className="dash" />
              <div style={{ textAlign: "center", fontSize: 12, color: C.dim, marginTop: 8 }}>Thank you!</div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (stage === "processing") {
    return (
      <div className="si">
        <style>{css}</style>
        <Header />
        <div className="flex flex-col items-center px-6" style={{ paddingTop: 110 }}>
          <h2 className="disp" style={{ fontSize: 22, marginBottom: 26 }}>Reading your receipt</h2>
          <div style={{ width: "100%", maxWidth: 350 }}>
            {PIPELINE.map((name, i) => {
              const done = step > i;
              const active = step === i;
              return (
                <div key={name} className="flex items-center"
                     style={{ gap: 14, fontSize: 13, padding: "11px 0",
                              borderBottom: `1px solid ${C.line}`,
                              opacity: done || active ? 1 : .35, transition: "opacity .25s" }}>
                  <span className="mono" style={{ fontSize: 11, color: C.dim }}>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span style={{ flex: 1 }}>{name}</span>
                  <span className="mono" style={{ fontSize: 10, letterSpacing: ".08em",
                                                  color: done ? C.dim : active ? C.text : "transparent" }}>
                    {done ? "DONE" : active ? "WORKING" : "—"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // summary
  if (stage === "summary") {
    return (
      <div className="si">
        <style>{css}</style>
        <Header />
        <EdgeArt />
        <div className="flex flex-col items-center px-6" style={{ paddingTop: 60, position: "relative", zIndex: 1 }}>
          <div style={{ width: "100%", maxWidth: 340 }}>
            <div className="lab" style={{ marginBottom: 12 }}>Dinner at Mario's</div>
            <div style={{ lineHeight: 1 }}><AnimatedTotal value={grand} size={62} /></div>
            <div style={{ fontSize: 12.5, color: C.dim, marginTop: 8 }}>
              split between {Object.keys(totals).length} people
            </div>

            <div className="flex" style={{ gap: 6, margin: "26px 0 20px", flexWrap: "wrap" }}>
              {items.map((it) => (
                <span key={it.id} title={it.name}
                      style={{ height: 5, flex: `1 1 ${Math.max(28, it.price * 3)}px`,
                               background: colorFor(it.name), borderRadius: 99, opacity: .85 }} />
              ))}
            </div>

            {Object.entries(totals).sort((a, b) => b[1] - a[1]).map(([p, v], i) => (
              <div key={p} className="flex items-center rise"
                   style={{ gap: 11, padding: "13px 0", animationDelay: `${140 + i * 80}ms` }}>
                <Avatar name={p} size={34} />
                <span style={{ flex: 1, fontSize: 17, fontWeight: 500, letterSpacing: "-.01em" }}>{p}</span>
                <span className="mono" style={{ fontSize: 19, fontWeight: 500 }}>${money(v)}</span>
              </div>
            ))}

            <div style={{ borderTop: `1px solid ${C.line}`, margin: "2px 0 16px" }} />

            <p style={{ fontSize: 12, color: C.dim, lineHeight: 1.75 }}>
              Tax and tip are split by what each person ordered, not evenly.
            </p>

            <div className="flex" style={{ gap: 10, marginTop: 26 }}>
              <button className="btn btn-primary" onClick={copySummary}>
                {copied ? "Copied" : "Copy summary"}
              </button>
              <button className="btn" onClick={() => { setStage("upload"); setItems([]); setShowCalc(false); }}>
                New split
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // workspace
  return (
    <div className="si">
      <style>{css}</style>
      <Header />

      <div className="grid2">
        {/* receipt */}
        <section>
          <div className="flex items-center px-6 py-3" style={{ gap: 18, borderBottom: `1px solid ${C.line}` }}>
            {["receipt", "detection"].map((v) => (
              <button key={v} onClick={() => setView(v)} className="lab ghost"
                      style={{ color: view === v ? C.text : C.dim, paddingBottom: 3,
                               borderBottom: `1.5px solid ${view === v ? C.text : "transparent"}` }}>
                {v}
              </button>
            ))}
            <span className="mono" style={{ marginLeft: "auto", fontSize: 10, color: C.dim, letterSpacing: ".08em" }}>
              {items.length} ITEMS · {elapsed}s
            </span>
          </div>

          <div className="flex justify-center stage" style={{ padding: "48px 24px 56px",
                                                              minHeight: "calc(100vh - 116px)" }}>
            <div style={{ position: "relative", width: "100%", maxWidth: 282, background: C.paper,
                          border: `1px solid ${C.line}`, borderRadius: 4,
                          boxShadow: "0 2px 6px rgba(26,29,31,.07)", padding: "30px 24px 26px" }}>
              <div className="mono" style={{ fontSize: 11, textAlign: "center", letterSpacing: ".12em", lineHeight: 1.8 }}>
                {MERCHANT.map((l) => <div key={l} style={{ fontWeight: 500 }}>{l}</div>)}
              </div>

              <div style={{ height: 22 }} />

              {items.map((it) => {
                const active = hovered === it.id;
                return (
                  <div key={it.id} className="mono flex items-center"
                       onMouseEnter={() => setHovered(it.id)}
                       onMouseLeave={() => setHovered(null)}
                       style={{ gap: 8, fontSize: 11, padding: "5px 6px", margin: "1px -6px",
                                position: "relative", borderRadius: 5,
                                border: `1px solid ${active || view === "detection" ? "#D6533E" : "transparent"}`,
                                background: active ? "rgba(25,27,29,.05)" : "transparent",
                                opacity: view === "detection" && !active ? .72 : 1,
                                transition: "border-color .13s, background .13s" }}>
                    <Dot name={it.name} />
                    <span style={{ flex: 1 }}>{it.qty} × {it.name.toUpperCase()}</span>
                    <span>${money(it.price)}</span>
                    {view === "detection" && (
                      <span className="mono" style={{ position: "absolute", left: -1, top: -8, fontSize: 7,
                                                      color: "#D6533E", letterSpacing: ".07em",
                                                      background: C.paper, padding: "0 3px" }}>
                        LINE · {it.conf}%
                      </span>
                    )}
                  </div>
                );
              })}

              <div style={{ height: 14 }} />
              <div style={{ borderTop: `1px dashed ${C.line}`, paddingTop: 11 }}>
                {[["SUBTOTAL", subtotal], ["TAX", tax], ["TIP", tip], ["TOTAL", grand]].map(([l, v], i) => (
                  <div key={l} className="mono flex justify-between"
                       style={{ fontSize: 11, padding: "3px 0", fontWeight: i === 3 ? 500 : 400,
                                color: i === 3 ? C.text : C.dim }}>
                    <span>{l}</span><span>${money(v)}</span>
                  </div>
                ))}
              </div>

              {view === "detection" && (
                <div style={{ position: "absolute", inset: 6, pointerEvents: "none", borderRadius: 3,
                              border: `1px solid #D6533E`, opacity: .35 }}>
                  <span className="mono" style={{ position: "absolute", top: -7, right: 5, fontSize: 7,
                                                  color: "#D6533E", background: C.paper, padding: "0 4px",
                                                  letterSpacing: ".08em" }}>
                    PAGE REGION
                  </span>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* split panel */}
        <section className="divider">
          <div style={{ padding: "24px 30px 60px", maxWidth: 540 }}>

            <div style={{ marginBottom: 22 }}>
              <div className="flex items-baseline" style={{ gap: 10, marginBottom: 9 }}>
                <span className="lab">Running total</span>
                <span className="mono" style={{ marginLeft: "auto", fontSize: 11, color: C.dim }}>
                  {items.length - unassigned}/{items.length} claimed
                </span>
              </div>
              <div className="bar"><i style={{ width: `${items.length ? ((items.length - unassigned) / items.length) * 100 : 0}%` }} /></div>
              <div className="flex flex-wrap" style={{ gap: 7, marginTop: 12 }}>
                {people.map((p) => <LivePill key={p} name={p} amount={totals[p] || 0} />)}
              </div>
            </div>

            <div className="lab" style={{ marginBottom: 10 }}>Who's paying?</div>
            <div style={{ marginBottom: 26 }}>
              {people.map((p) => (
                <div key={p} className="flex items-center" style={{ gap: 11, padding: "7px 0" }}>
                  <Avatar name={p} />
                  <span style={{ flex: 1, fontSize: 14, fontWeight: 500 }}>{p}</span>
                  <span className="mono" style={{ fontSize: 11.5, color: C.dim }}>
                    {pre[p] ? `$${money(pre[p])}` : "—"}
                  </span>
                  <button className="ghost" onClick={() => removePerson(p)} aria-label={`Remove ${p}`}
                          style={{ color: C.dim, fontSize: 16, lineHeight: 1 }}>×</button>
                </div>
              ))}

              <div className="flex" style={{ gap: 8, marginTop: 12 }}>
                <input className="inp" style={{ flex: 1 }} placeholder="Add someone"
                       value={newPerson} onChange={(e) => setNewPerson(e.target.value)}
                       onKeyDown={(e) => e.key === "Enter" && addPerson()} />
                <button className="btn" onClick={addPerson}>Add</button>
              </div>
            </div>

            <div className="lab" style={{ marginBottom: 4, paddingTop: 12, borderTop: `1px solid ${C.line}` }}>
              Items
            </div>

            {items.map((it, idx) => {
              const holders = Object.keys(it.shares);
              const isEditing = editing === it.id;
              return (
                <div key={it.id} className="rise"
                     onMouseEnter={() => setHovered(it.id)}
                     onMouseLeave={() => setHovered(null)}
                     style={{ animationDelay: `${idx * 55}ms`,
                              padding: "13px 10px 13px 14px", margin: "0 -10px", borderRadius: 10,
                              borderBottom: `1px solid ${C.line}`,
                              borderLeft: `3px solid ${holders.length ? colorFor(it.name) : "transparent"}`,
                              background: holders.length
                                ? `${colorFor(it.name)}0E`
                                : hovered === it.id ? "rgba(25,27,29,.03)" : "transparent",
                              transition: "background .2s, border-color .2s" }}>
                  {isEditing ? (
                    <div className="flex items-center" style={{ gap: 7 }}>
                      <input className="inp mono" style={{ width: 44 }} value={it.qty}
                             onChange={(e) => patchItem(it.id, { qty: Number(e.target.value) || 1 })} />
                      <input className="inp" style={{ flex: 1 }} value={it.name}
                             onChange={(e) => patchItem(it.id, { name: e.target.value })} />
                      <input className="inp mono" style={{ width: 76 }} value={it.price}
                             onChange={(e) => patchItem(it.id, { price: Number(e.target.value) || 0 })} />
                      <button className="btn" style={{ padding: "8px 12px" }} onClick={() => setEditing(null)}>Done</button>
                      <button className="btn" style={{ padding: "8px 12px" }}
                              onClick={() => { setItems(items.filter((x) => x.id !== it.id)); setEditing(null); }}>
                        Delete
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center" style={{ gap: 11 }}>
                        <FoodIcon name={it.name} size={26} />
                        <span style={{ fontSize: 16, flex: 1, fontWeight: 500, letterSpacing: "-.01em" }}>
                          {it.qty > 1 && (
                            <span className="mono" style={{ color: C.dim, fontSize: 11.5, marginRight: 7, fontWeight: 400 }}>
                              {it.qty}×
                            </span>
                          )}
                          {it.name}
                        </span>
                        {it.conf < 70 && (
                          <span style={{ fontSize: 10, color: "#D6533E", fontWeight: 500 }}>check this one</span>
                        )}
                        <button className="ghost" onClick={() => setEditing(it.id)}
                                style={{ fontSize: 11, color: C.dim }}>
                          Edit
                        </button>
                        <span className="mono" style={{ fontSize: 16, minWidth: 68, textAlign: "right", fontWeight: 500 }}>
                          ${money(it.price)}
                        </span>
                      </div>

                      <div className="flex flex-wrap" style={{ gap: 6, marginTop: 11, paddingLeft: 37 }}>
                        {people.map((p) => {
                          const on = holders.includes(p);
                          return (
                            <button key={p} className="tag" onClick={() => togglePerson(it.id, p)}
                                    style={{ borderColor: on ? colorFor(it.name) : C.line,
                                             color: on ? C.text : C.dim,
                                             background: on ? `${colorFor(it.name)}1A` : C.card,
                                             fontWeight: on ? 500 : 400 }}>
                              <Avatar name={p} size={16} on={on} />
                              {p}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              );
            })}

            <button className="btn" style={{ marginTop: 16 }} onClick={addItem}>+ Add item</button>

            <div className="lab" style={{ margin: "34px 0 12px" }}>Summary</div>
            {[["Subtotal", subtotal], ["Tax", tax], ["Tip", tip]].map(([l, v]) => (
              <div key={l} className="flex justify-between" style={{ fontSize: 13, color: C.dim, padding: "4px 0" }}>
                <span>{l}</span><span className="mono">${money(v)}</span>
              </div>
            ))}
            <div className="flex" style={{ gap: 4, marginTop: 14, marginBottom: 13 }}>
              {items.map((it) => (
                <span key={it.id} style={{ height: 4, flex: `1 1 ${Math.max(20, it.price * 2)}px`,
                                           background: colorFor(it.name), borderRadius: 99,
                                           opacity: Object.keys(it.shares).length ? .9 : .22,
                                           transition: "opacity .25s" }} />
              ))}
            </div>
            <div className="flex justify-between items-baseline">
              <span style={{ fontSize: 14, fontWeight: 600 }}>Total</span>
              <AnimatedTotal value={grand} size={40} />
            </div>

            <div style={{ marginTop: 26, paddingTop: 16, borderTop: `1px solid ${C.line}` }}>
              <div className="lab" style={{ marginBottom: 7 }}>Tax + tip</div>
              <p style={{ fontSize: 12, color: C.dim, lineHeight: 1.75, marginBottom: 10 }}>
                Split by what each person ordered, not evenly.
              </p>
              <button className="ghost" onClick={() => setShowCalc(!showCalc)}
                      style={{ fontSize: 12, color: C.text, fontWeight: 500, textDecoration: "underline", textUnderlineOffset: 3 }}>
                {showCalc ? "Hide the math" : "Show the math →"}
              </button>

              {showCalc && Object.keys(pre).length > 0 && (
                <div style={{ marginTop: 18 }}>
                  {Object.entries(pre).map(([p, amt]) => {
                    const assignedSum = Object.values(pre).reduce((a, b) => a + b, 0);
                    const share = amt / assignedSum;
                    return (
                      <div key={p} style={{ marginBottom: 20 }}>
                        <div className="flex items-center" style={{ gap: 9, marginBottom: 7 }}>
                          <Avatar name={p} size={20} />
                          <span style={{ fontSize: 13, fontWeight: 500 }}>{p}</span>
                        </div>
                        {[["Items", `$${money(amt)}`], ["Share", `${(share * 100).toFixed(1)}%`],
                          ["Tax", `$${money(tax * share)}`], ["Tip", `$${money(tip * share)}`]].map(([l, v]) => (
                          <div key={l} className="flex justify-between"
                               style={{ fontSize: 12, color: C.dim, padding: "2px 0" }}>
                            <span>{l}</span><span className="mono">{v}</span>
                          </div>
                        ))}
                        <div className="flex justify-between"
                             style={{ fontSize: 12.5, borderTop: `1px solid ${C.line}`, marginTop: 6, paddingTop: 6 }}>
                          <span style={{ fontWeight: 600 }}>Owes</span>
                          <span className="mono" style={{ fontWeight: 500 }}>${money(totals[p])}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <button className="btn btn-primary" style={{ marginTop: 30, width: "100%" }}
                    disabled={unassigned > 0} onClick={() => setStage("summary")}>
              {unassigned > 0
                ? `${unassigned} item${unassigned > 1 ? "s" : ""} still unclaimed`
                : "See what everyone owes"}
            </button>

            <div className="mono" style={{ fontSize: 9, color: C.dim, marginTop: 16,
                                           letterSpacing: ".11em", textAlign: "center" }}>
              PROCESSED LOCALLY · NO UPLOAD
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
