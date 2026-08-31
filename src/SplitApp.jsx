import React, { useState, useMemo, useRef } from "react";

/**
 * Split it — food-themed variant.
 *
 * Keeps the two-column workspace, detection mode, and inline editing from the
 * spec build. Warmer palette, softer corners, and a food icon per line item.
 *
 * Icons are keyword-matched from the item name, so they carry information —
 * you can scan the list by shape instead of reading every row. When no keyword
 * matches, the icon falls back to a plate rather than guessing.
 */

const C = {
  bg: "#F6F6F4",      // neutral off-white, a touch of warmth so it isn't clinical
  paper: "#FFFFFF",
  text: "#1A1D1F",    // graphite, not pure black
  dim: "#6E7478",
  line: "#E3E4E2",
  accent: "#1F5F5B",  // deep teal — restrained, reads considered rather than casual
};

// Desaturated and roughly equal in weight, so no one person's marker dominates.
const MARKERS = ["#1F5F5B", "#7A4F3E", "#4A5C7A", "#6B6340", "#74445C", "#3F6146"];

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

/* ---------------------------------------------------------------------------
 * Icons — hand-drawn feel via round caps and slightly irregular paths.
 * Each is a 24x24 line drawing that inherits currentColor.
 * ------------------------------------------------------------------------- */
const P = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round" };

const ICONS = {
  pasta: (
    <>
      <path {...P} d="M4 13h16c0 4.4-3.6 7-8 7s-8-2.6-8-7z" />
      <path {...P} d="M7 13c1-2.5 3-3.5 5-3.5s4 1 5 3.5" />
      <circle {...P} cx="10" cy="11.5" r="1.2" />
      <circle {...P} cx="14.5" cy="12" r="1.2" />
      <path {...P} d="M2.5 20h19" />
    </>
  ),
  salad: (
    <>
      <path {...P} d="M4 12h16c0 4.4-3.6 8-8 8s-8-3.6-8-8z" />
      <path {...P} d="M9 12c-1-2 0-4 2-4.5" />
      <path {...P} d="M13.5 12c.5-2.5 2-3.5 3.5-3.5" />
      <path {...P} d="M11 7.5c.5-1.5 1.5-2.5 3-2.5" />
    </>
  ),
  drink: (
    <>
      <path {...P} d="M6.5 7h11l-1.4 12.2a1 1 0 0 1-1 .8H8.9a1 1 0 0 1-1-.8z" />
      <path {...P} d="M6.9 11h10.2" />
      <path {...P} d="M12 7V3.5" />
      <path {...P} d="M12 3.5h3.5" />
    </>
  ),
  dessert: (
    <>
      <path {...P} d="M5.5 10h13l-1.2 9.2a1 1 0 0 1-1 .8H7.7a1 1 0 0 1-1-.8z" />
      <path {...P} d="M5.5 10c0-3 2.9-5 6.5-5s6.5 2 6.5 5" />
      <path {...P} d="M12 5V2.6" />
      <circle {...P} cx="12" cy="2.2" r=".9" />
    </>
  ),
  pizza: (
    <>
      <path {...P} d="M12 3.5 20.5 19c-5.4 2.3-11.6 2.3-17 0z" />
      <circle {...P} cx="12" cy="11" r="1.1" />
      <circle {...P} cx="9.6" cy="15.6" r="1.1" />
      <circle {...P} cx="14.6" cy="15.8" r="1.1" />
    </>
  ),
  taco: (
    <>
      <path {...P} d="M3.5 17.5c0-5.2 3.8-9.5 8.5-9.5s8.5 4.3 8.5 9.5z" />
      <path {...P} d="M3.5 17.5h17" />
      <path {...P} d="M8 12.5c1.2-1 2.6-1.5 4-1.5s2.8.5 4 1.5" />
    </>
  ),
  coffee: (
    <>
      <path {...P} d="M4.5 8h13v7a4 4 0 0 1-4 4h-5a4 4 0 0 1-4-4z" />
      <path {...P} d="M17.5 10h1.6a2.4 2.4 0 0 1 0 4.8h-1.6" />
      <path {...P} d="M8 5c0-1 .8-1.4.8-2.4" />
      <path {...P} d="M12 5c0-1 .8-1.4.8-2.4" />
    </>
  ),
  bread: (
    <>
      <path {...P} d="M4 10c0-2.8 3.6-5 8-5s8 2.2 8 5c0 1.4-1 2.2-2 2.2V19H6v-6.8c-1 0-2-.8-2-2.2z" />
      <path {...P} d="M9 9.5v3M13 9.5v3" />
    </>
  ),
  plate: (
    <>
      <circle {...P} cx="12" cy="12" r="8.2" />
      <circle {...P} cx="12" cy="12" r="4.8" />
    </>
  ),
};

// Keyword table. Order matters — first match wins, so put specific before broad.
const KEYWORDS = [
  [["pasta", "spaghetti", "linguine", "penne", "noodle", "ramen", "carbonara"], "pasta"],
  [["salad", "greens", "caesar", "slaw"], "salad"],
  [["drink", "soda", "juice", "water", "beer", "wine", "horchata", "lemonade", "tea"], "drink"],
  [["coffee", "espresso", "latte", "cappuccino", "americano"], "coffee"],
  [["tiramisu", "dessert", "cake", "gelato", "ice cream", "churro", "pie", "sundae"], "dessert"],
  [["pizza", "margherita", "pepperoni", "calzone"], "pizza"],
  [["taco", "burrito", "quesadilla", "nachos", "queso"], "taco"],
  [["bread", "focaccia", "garlic bread", "roll", "toast", "baguette"], "bread"],
];

function iconFor(name) {
  const n = name.toLowerCase();
  for (const [words, key] of KEYWORDS) {
    if (words.some((w) => n.includes(w))) return ICONS[key];
  }
  return ICONS.plate;
}

const FoodIcon = ({ name, size = 20, color }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" style={{ color, flexShrink: 0 }} aria-hidden="true">
    {iconFor(name)}
  </svg>
);

/* ------------------------------------------------------------------------- */

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
const money = (n) => Number(n || 0).toFixed(2);

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
  const fileRef = useRef(null);

  const markerOf = (p) => MARKERS[Math.max(0, people.indexOf(p)) % MARKERS.length];

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
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Inter:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');
.si, .si * { box-sizing: border-box; }
.si { font-family: Inter, system-ui, sans-serif; color: ${C.text}; background: ${C.bg};
      min-height: 100vh; -webkit-font-smoothing: antialiased; }
.si .mono { font-family: 'IBM Plex Mono', ui-monospace, monospace; font-variant-numeric: tabular-nums; }
.si .disp { font-family: Fraunces, Georgia, serif; font-weight: 600; }
.si .lab { font-size: 10px; letter-spacing: .12em; text-transform: uppercase; color: ${C.dim}; font-weight: 600; }
.si .btn { border: 1px solid ${C.line}; background: ${C.paper}; color: ${C.text};
       padding: 10px 18px; font-size: 12px; font-weight: 500; cursor: pointer;
       border-radius: 10px; transition: border-color .15s, background .15s, transform .1s; }
.si .btn:hover:not(:disabled) { border-color: ${C.accent}; }
.si .btn:active:not(:disabled) { transform: scale(.98); }
.si .btn-primary { background: ${C.accent}; border-color: ${C.accent}; color: #fff; }
.si .btn-primary:hover:not(:disabled) { background: #194E4B; border-color: #194E4B; }
.si .btn:disabled { opacity: .4; cursor: default; }
.si .tag { font-size: 11px; padding: 5px 10px; border-radius: 999px; border: 1px solid ${C.line};
       cursor: pointer; transition: all .13s; display: inline-flex; align-items: center; gap: 6px;
       background: ${C.paper}; }
.si .tag:active { transform: scale(.96); }
.si .inp { border: 1px solid ${C.line}; background: ${C.paper}; padding: 8px 11px; font-size: 13px;
       border-radius: 9px; color: ${C.text}; font-family: inherit; }
.si .inp:focus { outline: none; border-color: ${C.accent}; }
.si .ghost { background: none; border: none; cursor: pointer; padding: 0; font-family: inherit; }
.si .drop { transition: border-color .15s, background .15s; }
.si .drop:hover { border-color: ${C.accent}; background: #FAFBFB; }
.si .grid2 { display: grid; grid-template-columns: 45fr 55fr; align-items: start; }
.si .divider { border-left: 1px solid ${C.line}; min-height: calc(100vh - 58px); }
@media (max-width: 900px) {
  .si .grid2 { grid-template-columns: 1fr; }
  .si .divider { border-left: none; border-top: 1px solid ${C.line}; min-height: 0; }
}
.si :focus-visible { outline: 2px solid ${C.accent}; outline-offset: 2px; }
@media (prefers-reduced-motion: reduce) { .si * { transition: none !important; } }
`;

  const Header = () => (
    <header className="flex items-center justify-between px-6 py-4"
            style={{ borderBottom: `1px solid ${C.line}` }}>
      <span className="disp flex items-center" style={{ fontSize: 19, gap: 8, letterSpacing: "-.01em" }}>
        <svg width="20" height="20" viewBox="0 0 24 24" style={{ color: C.accent }} aria-hidden="true">
          {ICONS.plate}
        </svg>
        Split it
      </span>
      <span className="mono flex items-center gap-2" style={{ fontSize: 10, color: C.dim, letterSpacing: ".08em" }}>
        <span style={{ width: 5, height: 5, background: C.dim, borderRadius: "50%" }} />
        LOCAL / WASM
      </span>
    </header>
  );

  /* ---------------------------- upload ---------------------------- */
  if (stage === "upload") {
    return (
      <div className="si">
        <style>{css}</style>
        <Header />
        <div className="flex flex-col items-center px-6" style={{ paddingTop: 60 }}>
          <h1 className="disp" style={{ fontSize: 30, marginBottom: 6, letterSpacing: "-.02em" }}>
            Who had what?
          </h1>
          <p style={{ fontSize: 13, color: C.dim, marginBottom: 34 }}>
            Snap the receipt and we'll do the math.
          </p>

          <div className="drop" role="button" tabIndex={0}
               onClick={() => fileRef.current?.click()}
               onKeyDown={(e) => e.key === "Enter" && fileRef.current?.click()}
               onDragOver={(e) => e.preventDefault()}
               onDrop={(e) => { e.preventDefault(); beginProcessing(); }}
               style={{ width: 248, height: 320, border: `1.5px dashed ${C.line}`, background: C.paper,
                        borderRadius: 14, display: "flex", flexDirection: "column",
                        alignItems: "center", justifyContent: "center", gap: 14, cursor: "pointer" }}>
            <div className="flex" style={{ gap: 10, color: C.accent, opacity: .85 }}>
              <FoodIcon name="pizza" size={26} />
              <FoodIcon name="drink" size={26} />
              <FoodIcon name="dessert" size={26} />
            </div>
            <span style={{ fontSize: 14, fontWeight: 500 }}>Drop receipt</span>
            <span style={{ fontSize: 12, color: C.dim }}>or choose a photo</span>
          </div>

          <input ref={fileRef} type="file" accept="image/*" hidden onChange={beginProcessing} />

          <div className="mono" style={{ fontSize: 10, color: C.dim, marginTop: 14, letterSpacing: ".1em" }}>
            JPG · PNG · HEIC
          </div>

          <button className="btn btn-primary" style={{ marginTop: 22 }}
                  onClick={() => fileRef.current?.click()}>
            Choose receipt
          </button>

          <p style={{ fontSize: 11.5, color: C.dim, marginTop: 28, textAlign: "center",
                      lineHeight: 1.75, maxWidth: 230 }}>
            Everything happens on your phone. The photo never leaves this browser.
          </p>
        </div>
      </div>
    );
  }

  /* -------------------------- processing -------------------------- */
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
                                                  color: done ? C.dim : active ? C.accent : "transparent" }}>
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

  /* --------------------------- summary ---------------------------- */
  if (stage === "summary") {
    return (
      <div className="si">
        <style>{css}</style>
        <Header />
        <div className="flex flex-col items-center px-6" style={{ paddingTop: 60 }}>
          <div style={{ width: "100%", maxWidth: 340 }}>
            <div className="lab" style={{ marginBottom: 12 }}>Dinner at Mario's</div>
            <div className="disp" style={{ fontSize: 46, letterSpacing: "-.03em", lineHeight: 1 }}>
              ${money(grand)}
            </div>
            <div style={{ fontSize: 12.5, color: C.dim, marginTop: 8 }}>
              split between {Object.keys(totals).length} people
            </div>

            <div style={{ borderTop: `1px solid ${C.line}`, margin: "26px 0 2px" }} />

            {Object.entries(totals).sort((a, b) => b[1] - a[1]).map(([p, v]) => (
              <div key={p} className="flex items-center" style={{ gap: 11, padding: "13px 0" }}>
                <span style={{ width: 9, height: 9, background: markerOf(p), borderRadius: "50%" }} />
                <span style={{ flex: 1, fontSize: 15, fontWeight: 500 }}>{p}</span>
                <span className="mono" style={{ fontSize: 15 }}>${money(v)}</span>
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

  /* -------------------------- workspace --------------------------- */
  return (
    <div className="si">
      <style>{css}</style>
      <Header />

      <div className="grid2">
        {/* ------------------ receipt ------------------ */}
        <section>
          <div className="flex items-center px-6 py-3" style={{ gap: 18, borderBottom: `1px solid ${C.line}` }}>
            {["receipt", "detection"].map((v) => (
              <button key={v} onClick={() => setView(v)} className="lab ghost"
                      style={{ color: view === v ? C.text : C.dim, paddingBottom: 3,
                               borderBottom: `1.5px solid ${view === v ? C.accent : "transparent"}` }}>
                {v}
              </button>
            ))}
            <span className="mono" style={{ marginLeft: "auto", fontSize: 10, color: C.dim, letterSpacing: ".08em" }}>
              {items.length} ITEMS · {elapsed}s
            </span>
          </div>

          <div className="flex justify-center" style={{ padding: "38px 24px" }}>
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
                                border: `1px solid ${active || view === "detection" ? C.accent : "transparent"}`,
                                background: active ? "rgba(31,95,91,.07)" : "transparent",
                                opacity: view === "detection" && !active ? .72 : 1,
                                transition: "border-color .13s, background .13s" }}>
                    <FoodIcon name={it.name} size={13} color={C.dim} />
                    <span style={{ flex: 1 }}>{it.qty} × {it.name.toUpperCase()}</span>
                    <span>${money(it.price)}</span>
                    {view === "detection" && (
                      <span className="mono" style={{ position: "absolute", left: -1, top: -8, fontSize: 7,
                                                      color: C.accent, letterSpacing: ".07em",
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
                              border: `1px solid ${C.accent}`, opacity: .4 }}>
                  <span className="mono" style={{ position: "absolute", top: -7, right: 5, fontSize: 7,
                                                  color: C.accent, background: C.paper, padding: "0 4px",
                                                  letterSpacing: ".08em" }}>
                    PAGE REGION
                  </span>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ------------------- split panel ------------------- */}
        <section className="divider">
          <div style={{ padding: "24px 30px 60px", maxWidth: 540 }}>
            <div className="lab" style={{ marginBottom: 10 }}>Who's paying?</div>
            <div style={{ marginBottom: 26 }}>
              {people.map((p) => (
                <div key={p} className="flex items-center" style={{ gap: 11, padding: "7px 0" }}>
                  <span style={{ width: 9, height: 9, background: markerOf(p), borderRadius: "50%" }} />
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

            {items.map((it) => {
              const holders = Object.keys(it.shares);
              const isEditing = editing === it.id;
              return (
                <div key={it.id}
                     onMouseEnter={() => setHovered(it.id)}
                     onMouseLeave={() => setHovered(null)}
                     style={{ padding: "13px 10px", margin: "0 -10px", borderRadius: 10,
                              borderBottom: `1px solid ${C.line}`,
                              background: hovered === it.id ? "rgba(31,95,91,.045)" : "transparent",
                              transition: "background .13s" }}>
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
                        <FoodIcon name={it.name} size={21} color={C.accent} />
                        <span style={{ fontSize: 14, flex: 1, fontWeight: 500 }}>
                          {it.qty > 1 && (
                            <span className="mono" style={{ color: C.dim, fontSize: 11.5, marginRight: 7, fontWeight: 400 }}>
                              {it.qty}×
                            </span>
                          )}
                          {it.name}
                        </span>
                        {it.conf < 70 && (
                          <span style={{ fontSize: 10, color: C.accent }}>check this one</span>
                        )}
                        <button className="ghost" onClick={() => setEditing(it.id)}
                                style={{ fontSize: 11, color: C.dim }}>
                          Edit
                        </button>
                        <span className="mono" style={{ fontSize: 14, minWidth: 62, textAlign: "right" }}>
                          ${money(it.price)}
                        </span>
                      </div>

                      <div className="flex flex-wrap" style={{ gap: 6, marginTop: 11, paddingLeft: 32 }}>
                        {people.map((p) => {
                          const on = holders.includes(p);
                          return (
                            <button key={p} className="tag" onClick={() => togglePerson(it.id, p)}
                                    style={{ borderColor: on ? markerOf(p) : C.line,
                                             color: on ? C.text : C.dim,
                                             background: on ? `${markerOf(p)}18` : C.paper }}>
                              <span style={{ width: 6, height: 6, borderRadius: "50%",
                                             background: on ? markerOf(p) : "transparent",
                                             border: on ? "none" : `1px solid ${C.line}` }} />
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
            <div className="flex justify-between items-baseline"
                 style={{ borderTop: `1px solid ${C.line}`, marginTop: 10, paddingTop: 13 }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>Total</span>
              <span className="disp" style={{ fontSize: 28, letterSpacing: "-.02em" }}>${money(grand)}</span>
            </div>

            <div style={{ marginTop: 26, paddingTop: 16, borderTop: `1px solid ${C.line}` }}>
              <div className="lab" style={{ marginBottom: 7 }}>Tax + tip</div>
              <p style={{ fontSize: 12, color: C.dim, lineHeight: 1.75, marginBottom: 10 }}>
                Split by what each person ordered, not evenly.
              </p>
              <button className="ghost" onClick={() => setShowCalc(!showCalc)}
                      style={{ fontSize: 12, color: C.accent, fontWeight: 500 }}>
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
                          <span style={{ width: 7, height: 7, background: markerOf(p), borderRadius: "50%" }} />
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
