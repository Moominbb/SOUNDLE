/* =============================================================================
   SoundLE -- standalone PWA, no build step, no server.
   Scoring engine + app logic, plain JS.
============================================================================= */

/* ---------- SCORING ENGINE (port of score_words.py) ---------- */
const STRESS_PRIMARY = "\u02c8";
const STRESS_SECONDARY = "\u02cc";
const SYLLABIC_MARKS = new Set(["\u0329", "\u030D"]);
const VOWELS = new Set("aeiou\u026a\u028a\u025b\u0254\u00e6\u028c\u0259\u0251\u0252\u025c\u0250\u0268\u0289\u026f\u0264\u00f8\u0153\u0276\u0275".split(""));
const RHOTIC_VOWELS = new Set(["\u025a", "\u025d"]);
const VELARS = new Set(["k", "g", "\u014b", "x", "\u0263", "q", "\u0262"]);
const LIQUIDS = new Set(["l", "r", "\u0279", "\u027e", "\u027b", "\u028e", "\u029f", "\u0280", "\u0281"]);
const AFFRICATES = new Set(["t\u0283", "d\u0292"]);
const FRICATIVES = new Set(["f", "v", "\u03b8", "\u00f0", "s", "z", "\u0283", "\u0292", "h", "x", "\u0263", "\u00e7", "\u0281", "\u0278", "\u03b2"]);
const VOICED_CONSONANTS = new Set([
  "b", "d", "g", "v", "\u00f0", "z", "\u0292", "d\u0292", "m", "n", "\u014b", "l", "r", "\u0279", "\u027e",
  "\u027b", "\u028e", "\u029f", "\u0280", "\u0281", "j", "w", "\u0263", "\u03b2",
]);
const MULTI_CHAR_TOKENS = [...AFFRICATES].sort((a, b) => b.length - a.length);

function tokenizeSyllable(syll) {
  const tokens = [];
  let i = 0;
  while (i < syll.length) {
    let matched = false;
    for (const tok of MULTI_CHAR_TOKENS) {
      if (syll.slice(i, i + tok.length) === tok) {
        tokens.push(tok); i += tok.length; matched = true; break;
      }
    }
    if (matched) continue;
    const ch = syll[i];
    if (i + 1 < syll.length && SYLLABIC_MARKS.has(syll[i + 1])) {
      tokens.push(ch + syll[i + 1]); i += 2; continue;
    }
    tokens.push(ch); i += 1;
  }
  return tokens;
}

function parseWord(ipa) {
  const rawSyllables = ipa.trim().split(".");
  const syllables = []; const stressedIndices = []; let anyStress = false;
  rawSyllables.forEach((raw, idx) => {
    raw = raw.trim();
    if (raw.includes(STRESS_PRIMARY)) { stressedIndices.push(idx); anyStress = true; }
    raw = raw.split(STRESS_PRIMARY).join("").split(STRESS_SECONDARY).join("");
    syllables.push(tokenizeSyllable(raw));
  });
  return { syllables, stressedIndices, anyStress };
}

function baseSymbol(tok) {
  if (tok.length > 1 && SYLLABIC_MARKS.has(tok[tok.length - 1])) return tok[0];
  return tok;
}
const isSyllabic = (tok) => tok.length > 1 && SYLLABIC_MARKS.has(tok[tok.length - 1]);
const isVowel = (tok) => RHOTIC_VOWELS.has(tok) || VOWELS.has(baseSymbol(tok));
const isConsonant = (tok) => !isVowel(tok);
const isVelar = (tok) => VELARS.has(baseSymbol(tok));
const isLiquidOrRhotic = (tok) => RHOTIC_VOWELS.has(tok) || LIQUIDS.has(baseSymbol(tok));
const isFricAffr = (tok) => { const b = baseSymbol(tok); return FRICATIVES.has(b) || AFFRICATES.has(b); };
const isVoicedFricAffr = (tok) => isFricAffr(tok) && VOICED_CONSONANTS.has(baseSymbol(tok));

function scoreWord(ipaRaw) {
  if (!ipaRaw || !ipaRaw.trim()) return null;
  const ipa = ipaRaw.trim();
  const { syllables, stressedIndices, anyStress } = parseWord(ipa);
  const nSyll = syllables.length;
  const multisyllabic = nSyll > 2 ? 1 : 0;
  const nonfirstStress = anyStress ? (stressedIndices.some((i) => i !== 0) ? 1 : 0) : null;
  const lastSyll = syllables[syllables.length - 1] || [];
  const wordFinalConsonant = lastSyll.length && isConsonant(lastSyll[lastSyll.length - 1]) ? 1 : 0;

  let consonantClusters = 0;
  for (const syll of syllables) {
    let run = 0;
    for (const tok of syll) {
      if (isConsonant(tok) && !isSyllabic(tok)) run += 1;
      else { if (run >= 2) consonantClusters += 1; run = 0; }
    }
    if (run >= 2) consonantClusters += 1;
  }

  let velars = 0, liquidsRhotics = 0, fricativesAffricates = 0, voicedFricAffr = 0;
  for (const syll of syllables) {
    for (const tok of syll) {
      if (isVelar(tok)) velars += 1;
      if (isLiquidOrRhotic(tok)) liquidsRhotics += 1;
      if (isFricAffr(tok)) fricativesAffricates += 1;
      if (isVoicedFricAffr(tok)) voicedFricAffr += 1;
    }
  }
  const total = multisyllabic + (nonfirstStress || 0) + wordFinalConsonant + consonantClusters +
    velars + liquidsRhotics + fricativesAffricates + voicedFricAffr;
  return {
    syllable_count: nSyll, multisyllabic, nonfirst_stress: nonfirstStress,
    word_final_consonant: wordFinalConsonant, consonant_clusters: consonantClusters,
    velars, liquids_rhotics: liquidsRhotics, fricatives_affricates: fricativesAffricates,
    voiced_fric_affricate: voicedFricAffr, total,
  };
}

const RULE_KEYS = ["multisyllabic", "nonfirst_stress", "word_final_consonant", "consonant_clusters",
  "velars", "liquids_rhotics", "fricatives_affricates", "voiced_fric_affricate"];
const RULE_LABELS = {
  multisyllabic: "3+ syllables", nonfirst_stress: "Non-initial stress",
  word_final_consonant: "Final consonant", consonant_clusters: "Clusters",
  velars: "Velars", liquids_rhotics: "Liquids/rhotics",
  fricatives_affricates: "Fricatives/affricates", voiced_fric_affricate: "Voiced fric/affr",
};
const RULE_COLORS = {
  multisyllabic: "#3FA83B", nonfirst_stress: "#B8863B", word_final_consonant: "#6B7A8F",
  consonant_clusters: "#8B5A8C", velars: "#3D7A5C", liquids_rhotics: "#C4634A",
  fricatives_affricates: "#4A7FA8", voiced_fric_affricate: "#9B7B3F",
};
const TIMEPOINT_LABELS = { known1: "Timepoint 1", known2: "Timepoint 2" };
const ACQUIRED_COLOR = "#5A6E3A";
const NOT_ACQUIRED_COLOR = "#9B5B3F";

/* ---------- helpers ---------- */
function parseKnown(v) {
  if (v === null || v === undefined) return false;
  const s = String(v).trim().toLowerCase();
  return ["y", "yes", "true", "1", "x", "known"].includes(s);
}
function guessColumn(headers, patterns) {
  // try each pattern in priority order across all headers, so an earlier
  // (more specific) pattern always wins over a later, looser one -- e.g.
  // an exact "word" match should win over "word category" containing "word".
  for (const p of patterns) {
    for (let i = 0; i < headers.length; i++) {
      const h = String(headers[i] || "").toLowerCase().trim();
      if (p.test(h)) return i;
    }
  }
  return -1;
}
function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100; }

/* ---------- storage (localStorage -- this is a real standalone page, not a Claude artifact) ---------- */
const STORE_PREFIX = "sle_";
function loadChildrenIndex() {
  try { return JSON.parse(localStorage.getItem(STORE_PREFIX + "children_index") || "[]"); }
  catch { return []; }
}
function saveChildrenIndex(list) {
  localStorage.setItem(STORE_PREFIX + "children_index", JSON.stringify(list));
}
function loadChild(id) {
  try { return JSON.parse(localStorage.getItem(STORE_PREFIX + "child_" + id) || "null"); }
  catch { return null; }
}
function saveChild(child) {
  localStorage.setItem(STORE_PREFIX + "child_" + child.id, JSON.stringify(child));
}
function deleteChildStorage(id) {
  localStorage.removeItem(STORE_PREFIX + "child_" + id);
}

/* ---------- per-child metrics (shared by single-child view and compare view) ---------- */
function computeChildMetrics(child) {
  const words = child.words || [];
  const total = words.length;
  const t1Known = words.filter((w) => w.known1);
  const t2Known = words.filter((w) => w.known2);
  const t2Unknown = words.filter((w) => !w.known2);
  const avgTotal = (list) => {
    const scored = list.filter((w) => w.scores);
    return scored.length ? round2(scored.reduce((s, w) => s + w.scores.total, 0) / scored.length) : 0;
  };
  const ruleAvg = (list) => {
    const scored = list.filter((w) => w.scores);
    const out = {};
    RULE_KEYS.forEach((k) => {
      out[k] = scored.length ? round2(scored.reduce((s, w) => s + (w.scores[k] || 0), 0) / scored.length) : 0;
    });
    return out;
  };
  return {
    total,
    t1KnownCount: t1Known.length,
    t2KnownCount: t2Known.length,
    t1KnownPct: total ? round2((t1Known.length / total) * 100) : 0,
    t2KnownPct: total ? round2((t2Known.length / total) * 100) : 0,
    avgScoreT1Known: avgTotal(t1Known),
    avgScoreT2Known: avgTotal(t2Known),
    ruleAvgT2Known: ruleAvg(t2Known),
    ruleAvgT2Unknown: ruleAvg(t2Unknown),
    ruleAvgT1Known: ruleAvg(t1Known),
    ruleAvgT1Unknown: ruleAvg(words.filter((w) => !w.known1)),
    categories: [...new Set(words.map((w) => w.category || "Uncategorized"))].sort(),
  };
}

/* ---------- RTF export ---------- */
function rtfEscape(s) {
  return String(s ?? "").replace(/\\/g, "\\\\").replace(/{/g, "\\{").replace(/}/g, "\\}")
    .split("").map((ch) => { const c = ch.codePointAt(0); return c > 127 ? `\\u${c}?` : ch; }).join("");
}
function buildRtf(childName, rows) {
  const headers = ["Category", "Word", "IPA", "Known (T1)", "Known (T2)", ...RULE_KEYS.map((k) => RULE_LABELS[k]), "Total"];
  const colWidths = [1400, 1600, 1900, 900, 900, ...RULE_KEYS.map(() => 1200), 800];
  let cellDefs = ""; let acc = 0;
  colWidths.forEach((w) => { acc += w; cellDefs += `\\cellx${acc}`; });
  const headerRow = `\\trowd\\trgaph70${cellDefs}\n` +
    headers.map((h) => `\\intbl\\b ${rtfEscape(h)}\\b0\\cell`).join("") + "\\row\n";
  const bodyRows = rows.map((r) => {
    const vals = [r.category || "-", r.word, r.ipa, r.known1 ? "Yes" : "No", r.known2 ? "Yes" : "No",
      ...RULE_KEYS.map((k) => (r.scores?.[k] ?? "-")), r.scores?.total ?? "-"];
    return `\\trowd\\trgaph70${cellDefs}\n` + vals.map((v) => `\\intbl ${rtfEscape(v)}\\cell`).join("") + "\\row\n";
  }).join("");
  return `{\\rtf1\\ansi\\deff0\n{\\fonttbl{\\f0 Calibri;}}\n\\f0\\fs22\n{\\fs32\\b SoundLE Score Report\\b0\\par}\n{\\fs22 ${rtfEscape(childName)}\\par}\n\\par\n${headerRow}${bodyRows}\n\\par\n{\\fs18\\i Scoring rules: 1pt for 3+ syllables; 1pt for stress on a non-initial syllable; 1pt for a word-final consonant; 1pt per consonant cluster; 1pt per velar; 1pt per liquid/rhotic; 1pt per fricative or affricate; 1pt per voiced fricative/affricate (in addition to the fricative/affricate point).\\par}\n}`;
}
function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ---------- tiny SVG chart helpers ---------- */
function svgEl(tag, attrs) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const k in attrs) el.setAttribute(k, attrs[k]);
  return el;
}
function barChart(container, data, xKey, yKey, color) {
  container.innerHTML = "";
  const W = container.clientWidth || 480, H = 240, padL = 36, padB = 34, padT = 14, padR = 12;
  const svg = svgEl("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}` });
  const maxY = Math.max(1, ...data.map((d) => d[yKey]));
  const bw = (W - padL - padR) / data.length;
  data.forEach((d, i) => {
    const h = ((H - padT - padB) * d[yKey]) / maxY;
    const x = padL + i * bw + bw * 0.15;
    const y = H - padB - h;
    svg.appendChild(svgEl("rect", { x, y, width: bw * 0.7, height: h, fill: color, rx: 3 }));
    const lbl = svgEl("text", { x: x + bw * 0.35, y: H - padB + 14, "font-size": 10, "text-anchor": "middle", fill: "#8A8478" });
    lbl.textContent = d[xKey]; svg.appendChild(lbl);
    const vlbl = svgEl("text", { x: x + bw * 0.35, y: y - 4, "font-size": 10, "text-anchor": "middle", fill: "#5C574C" });
    vlbl.textContent = d[yKey]; svg.appendChild(vlbl);
  });
  svg.appendChild(svgEl("line", { x1: padL, y1: H - padB, x2: W - padR, y2: H - padB, stroke: "#E4DFD5" }));
  container.appendChild(svg);
}
function lineChart(container, data, xKey, series) {
  container.innerHTML = "";
  const W = container.clientWidth || 480, H = 260, padL = 36, padB = 34, padT = 14, padR = 12;
  const svg = svgEl("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}` });
  let maxY = 1;
  series.forEach((s) => data.forEach((d) => { if (d[s.key] > maxY) maxY = d[s.key]; }));
  const stepX = data.length > 1 ? (W - padL - padR) / (data.length - 1) : 0;
  series.forEach((s) => {
    let points = data.map((d, i) => {
      const x = padL + i * stepX;
      const y = H - padB - ((H - padT - padB) * d[s.key]) / maxY;
      return `${x},${y}`;
    });
    svg.appendChild(svgEl("polyline", { points: points.join(" "), fill: "none", stroke: s.color, "stroke-width": 2 }));
    data.forEach((d, i) => {
      const x = padL + i * stepX;
      const y = H - padB - ((H - padT - padB) * d[s.key]) / maxY;
      svg.appendChild(svgEl("circle", { cx: x, cy: y, r: 3, fill: s.color }));
    });
  });
  data.forEach((d, i) => {
    const x = padL + i * stepX;
    const lbl = svgEl("text", { x, y: H - padB + 14, "font-size": 10, "text-anchor": "middle", fill: "#8A8478" });
    lbl.textContent = d[xKey]; svg.appendChild(lbl);
  });
  svg.appendChild(svgEl("line", { x1: padL, y1: H - padB, x2: W - padR, y2: H - padB, stroke: "#E4DFD5" }));
  svg.appendChild(svgEl("line", { x1: padL, y1: padT, x2: padL, y2: H - padB, stroke: "#E4DFD5" }));
  container.appendChild(svg);
}
/* grouped bar chart: labels = x categories, series = [{name, color, values}] aligned to labels */
function groupedBarChart(container, labels, series) {
  container.innerHTML = "";
  const W = container.clientWidth || 480, H = 260, padL = 36, padB = 46, padT = 14, padR = 12;
  const svg = svgEl("svg", { width: W, height: H, viewBox: `0 0 ${W} ${H}` });
  let maxY = 1;
  series.forEach((s) => s.values.forEach((v) => { if (v > maxY) maxY = v; }));
  const groupW = (W - padL - padR) / labels.length;
  const barW = (groupW * 0.72) / series.length;
  labels.forEach((label, i) => {
    series.forEach((s, si) => {
      const v = s.values[i] || 0;
      const h = ((H - padT - padB) * v) / maxY;
      const x = padL + i * groupW + groupW * 0.14 + si * barW;
      const y = H - padB - h;
      svg.appendChild(svgEl("rect", { x, y, width: barW * 0.86, height: h, fill: s.color, rx: 2 }));
    });
    const lbl = svgEl("text", {
      x: padL + i * groupW + groupW / 2, y: H - padB + 14, "font-size": 9.5,
      "text-anchor": "middle", fill: "#8A8478",
    });
    lbl.textContent = label;
    svg.appendChild(lbl);
  });
  svg.appendChild(svgEl("line", { x1: padL, y1: H - padB, x2: W - padR, y2: H - padB, stroke: "#E4DFD5" }));
  container.appendChild(svg);
}
function renderLegend(container, items) {
  const row = document.createElement("div"); row.className = "legend-row";
  items.forEach((it) => {
    const chip = document.createElement("div"); chip.className = "legend-chip";
    chip.innerHTML = `<span class="legend-dot" style="background:${it.color}"></span>${esc(it.name)}`;
    row.appendChild(chip);
  });
  container.appendChild(row);
}

/* ---------- app state ---------- */
const state = {
  screen: "home",
  childrenIndex: loadChildrenIndex(),
  selectedChildId: null,
  rawSheet: null,
  colMap: { category: -1, word: -1, ipa: -1, known1: -1, known2: -1 },
  scoredRows: [],
  targetChildName: "",
  targetChildIsNew: true,
  saveMsg: "",
  reviewCategoryFilter: "__all__",
  childCategoryFilter: "__all__",
  childFeatureTimepoint: "known2",
  visibleRules: new Set(RULE_KEYS),
  compareSelected: new Set(),
  compareFeatureTimepoint: "known2",
};

const root = document.getElementById("app");

function setScreen(s) { state.screen = s; render(); }

function render() {
  root.innerHTML = "";
  root.appendChild(renderSidebar());
  const main = document.createElement("div");
  main.className = "main";
  if (state.screen === "home") main.appendChild(renderHome());
  else if (state.screen === "upload-start") main.appendChild(renderUploadStart());
  else if (state.screen === "upload") main.appendChild(renderColumnMap());
  else if (state.screen === "review") main.appendChild(renderReview());
  else if (state.screen === "child") main.appendChild(renderChild());
  else if (state.screen === "compare") main.appendChild(renderCompare());
  root.appendChild(main);
}

function renderSidebar() {
  const sb = document.createElement("div"); sb.className = "sidebar";
  sb.innerHTML = `
    <div class="brand">
      <div class="brand-title">SoundLE</div>
      <div class="brand-ipa">/\u02c8sa\u028ad\u0259l/</div>
      <div class="brand-sub">CDI Inventory Tracking & Scoring</div>
    </div>
  `;
  const btn = document.createElement("button");
  btn.className = "btn-primary new-btn";
  btn.textContent = "+ New assessment";
  btn.onclick = () => {
    state.screen = "upload-start"; state.selectedChildId = null; state.rawSheet = null;
    state.scoredRows = []; state.saveMsg = ""; state.targetChildName = ""; state.targetChildIsNew = true;
    state.reviewCategoryFilter = "__all__";
    render();
  };
  sb.appendChild(btn);

  if (state.childrenIndex.length > 0) {
    const compareBtn = document.createElement("button");
    compareBtn.className = "btn-secondary new-btn";
    compareBtn.style.margin = "0 16px 12px";
    compareBtn.textContent = "Compare children";
    compareBtn.onclick = () => {
      if (state.compareSelected.size === 0) state.childrenIndex.forEach((c) => state.compareSelected.add(c.id));
      state.screen = "compare"; render();
    };
    sb.appendChild(compareBtn);
  }

  const label = document.createElement("div"); label.className = "sidebar-label"; label.textContent = "Children";
  sb.appendChild(label);
  const list = document.createElement("div"); list.className = "child-list";
  if (state.childrenIndex.length === 0) {
    const empty = document.createElement("div"); empty.className = "empty-note";
    empty.textContent = "No children yet. Run an assessment to get started.";
    list.appendChild(empty);
  }
  state.childrenIndex.forEach((c) => {
    const b = document.createElement("button");
    b.className = "child-item" + (state.selectedChildId === c.id && state.screen === "child" ? " active" : "");
    b.textContent = c.name;
    b.onclick = () => {
      state.selectedChildId = c.id; state.screen = "child";
      state.childCategoryFilter = "__all__"; state.childFeatureTimepoint = "known2";
      render();
    };
    list.appendChild(b);
  });
  sb.appendChild(list);
  return sb;
}

function renderHome() {
  const d = document.createElement("div"); d.className = "panel center-panel";
  d.innerHTML = `
    <div class="h1">Track sound acquisition over time</div>
    <p class="lead">Upload a word list with categories and IPA transcriptions, and mark which words a
    child produces at each of two timepoints. Each word is scored against eight phonological complexity
    rules, so you can see which sound features drive what a child has and hasn't acquired yet &mdash;
    for one child, or compared across several.</p>
  `;
  const btn = document.createElement("button");
  btn.className = "btn-primary"; btn.textContent = "Start a new assessment";
  btn.onclick = () => setScreen("upload-start");
  d.appendChild(btn);
  return d;
}

function renderUploadStart() {
  const d = document.createElement("div"); d.className = "panel narrow-panel";
  d.innerHTML = `
    <div class="h2">Upload a word list</div>
    <p class="sub">An .xlsx file with columns for Word Category, Word, IPA, Known (timepoint_1), and
    Known (timepoint_2).</p>
    <label class="dropzone">
      <input type="file" accept=".xlsx,.xls" id="fileInput" class="hidden" />
      <div class="dz-title">Choose a spreadsheet</div>
      <div class="dz-sub">.xlsx or .xls</div>
    </label>
  `;
  d.querySelector("#fileInput").addEventListener("change", handleFile);
  return d;
}

function handleFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (evt) => {
    const wb = XLSX.read(evt.target.result, { type: "array" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
    const headers = data[0] || [];
    const rows = data.slice(1).filter((r) => r.some((c) => String(c).trim() !== ""));
    state.colMap.category = guessColumn(headers, [/categ/]);
    state.colMap.word = guessColumn(headers, [/^word$/, /word/]);
    state.colMap.ipa = guessColumn(headers, [/ipa/]);
    state.colMap.known1 = guessColumn(headers, [/timepoint.?1/, /tp.?1/, /t1\b/, /known.*1/]);
    state.colMap.known2 = guessColumn(headers, [/timepoint.?2/, /tp.?2/, /t2\b/, /known.*2/]);
    state.rawSheet = { headers, rows };
    state.screen = "upload";
    render();
  };
  reader.readAsArrayBuffer(file);
}

const COLMAP_FIELDS = [
  { key: "category", label: "Word category (optional)" },
  { key: "word", label: "Word" },
  { key: "ipa", label: "IPA" },
  { key: "known1", label: "Known (timepoint 1)" },
  { key: "known2", label: "Known (timepoint 2, optional)" },
];

function renderColumnMap() {
  const d = document.createElement("div"); d.className = "panel wide-panel";
  const wrap = document.createElement("div");
  wrap.innerHTML = `<div class="h2">Match your columns</div>
    <p class="sub">I guessed these from your headers &mdash; check they're right.</p>`;
  const grid = document.createElement("div"); grid.className = "col-grid";
  COLMAP_FIELDS.forEach(({ key: field, label }) => {
    const col = document.createElement("div");
    const lbl = document.createElement("div"); lbl.className = "field-label";
    lbl.textContent = label;
    const sel = document.createElement("select"); sel.className = "select";
    const noneOpt = document.createElement("option"); noneOpt.value = -1; noneOpt.textContent = "-- none --";
    sel.appendChild(noneOpt);
    state.rawSheet.headers.forEach((h, i) => {
      const opt = document.createElement("option"); opt.value = i; opt.textContent = String(h) || `Column ${i + 1}`;
      if (state.colMap[field] === i) opt.selected = true;
      sel.appendChild(opt);
    });
    sel.onchange = () => { state.colMap[field] = Number(sel.value); };
    col.appendChild(lbl); col.appendChild(sel); grid.appendChild(col);
  });
  wrap.appendChild(grid);
  const count = document.createElement("div"); count.className = "muted-note";
  count.textContent = `${state.rawSheet.rows.length} rows found.`;
  wrap.appendChild(count);
  const btn = document.createElement("button"); btn.className = "btn-primary"; btn.textContent = "Score words \u2192";
  btn.onclick = () => {
    if (state.colMap.word < 0 || state.colMap.ipa < 0) return;
    state.scoredRows = computeScoredRows();
    state.reviewCategoryFilter = "__all__";
    state.screen = "review"; render();
  };
  wrap.appendChild(btn);
  d.appendChild(wrap);
  return d;
}

function computeScoredRows() {
  if (!state.rawSheet || state.colMap.word < 0 || state.colMap.ipa < 0) return [];
  return state.rawSheet.rows.map((r) => {
    const word = String(r[state.colMap.word] ?? "").trim();
    const ipa = String(r[state.colMap.ipa] ?? "").trim();
    const category = state.colMap.category >= 0 ? String(r[state.colMap.category] ?? "").trim() : "";
    const known1 = state.colMap.known1 >= 0 ? parseKnown(r[state.colMap.known1]) : false;
    const known2 = state.colMap.known2 >= 0 ? parseKnown(r[state.colMap.known2]) : false;
    return { category: category || "Uncategorized", word, ipa, known1, known2, scores: scoreWord(ipa) };
  }).filter((r) => r.word);
}

function reviewCategories() {
  return [...new Set(state.scoredRows.map((r) => r.category || "Uncategorized"))].sort();
}

function renderReview() {
  const d = document.createElement("div"); d.className = "panel wide-panel";
  const known1Count = state.scoredRows.filter((r) => r.known1).length;
  const known2Count = state.scoredRows.filter((r) => r.known2).length;
  const header = document.createElement("div"); header.className = "review-header";
  header.innerHTML = `
    <div>
      <div class="h2">Review scores</div>
      <div class="sub">${state.scoredRows.length} words &middot; ${known1Count} known at T1 &middot; ${known2Count} known at T2</div>
    </div>
  `;
  const controls = document.createElement("div"); controls.className = "review-controls";

  const catField = document.createElement("div");
  catField.innerHTML = `<div class="field-label">Category</div>`;
  const catSel = document.createElement("select"); catSel.className = "select";
  const allOpt = document.createElement("option"); allOpt.value = "__all__"; allOpt.textContent = "All categories";
  catSel.appendChild(allOpt);
  reviewCategories().forEach((c) => {
    const o = document.createElement("option"); o.value = c; o.textContent = c;
    if (state.reviewCategoryFilter === c) o.selected = true;
    catSel.appendChild(o);
  });
  catSel.value = state.reviewCategoryFilter;
  catSel.onchange = () => { state.reviewCategoryFilter = catSel.value; render(); };
  catField.appendChild(catSel);

  const childField = document.createElement("div");
  childField.innerHTML = `<div class="field-label">Child</div>`;
  const childRow = document.createElement("div"); childRow.className = "row-inline";
  const childSel = document.createElement("select"); childSel.className = "select";
  const newOpt = document.createElement("option"); newOpt.value = "__new__"; newOpt.textContent = "+ New child";
  childSel.appendChild(newOpt);
  state.childrenIndex.forEach((c) => {
    const o = document.createElement("option"); o.value = c.id; o.textContent = c.name;
    if (!state.targetChildIsNew && state.selectedChildId === c.id) o.selected = true;
    childSel.appendChild(o);
  });
  const nameInput = document.createElement("input");
  nameInput.className = "text-input"; nameInput.placeholder = "Child name / ID";
  nameInput.value = state.targetChildName;
  nameInput.style.display = state.targetChildIsNew ? "block" : "none";
  nameInput.oninput = () => { state.targetChildName = nameInput.value; };
  childSel.onchange = () => {
    if (childSel.value === "__new__") {
      state.targetChildIsNew = true; state.targetChildName = ""; state.selectedChildId = null;
      nameInput.value = ""; nameInput.style.display = "block";
    } else {
      state.targetChildIsNew = false; state.selectedChildId = childSel.value;
      const c = state.childrenIndex.find((c) => c.id === childSel.value);
      state.targetChildName = c ? c.name : "";
      nameInput.style.display = "none";
    }
  };
  childRow.appendChild(childSel); childRow.appendChild(nameInput);
  childField.appendChild(childRow);

  const saveBtn = document.createElement("button"); saveBtn.className = "btn-primary"; saveBtn.textContent = "Save assessment";
  saveBtn.onclick = () => handleSave(saveBtn);
  const exportBtn = document.createElement("button"); exportBtn.className = "btn-secondary"; exportBtn.textContent = "Export Word doc";
  exportBtn.onclick = () => downloadFile(
    `${state.targetChildName || "soundle"}.rtf`,
    buildRtf(state.targetChildName || "Untitled", state.scoredRows), "application/rtf"
  );

  controls.appendChild(catField); controls.appendChild(childField); controls.appendChild(saveBtn); controls.appendChild(exportBtn);
  header.appendChild(controls);
  d.appendChild(header);

  const msg = document.createElement("div"); msg.className = "save-msg"; msg.textContent = state.saveMsg;
  d.appendChild(msg);

  const visibleRows = state.reviewCategoryFilter === "__all__"
    ? state.scoredRows
    : state.scoredRows.filter((r) => (r.category || "Uncategorized") === state.reviewCategoryFilter);

  const tableWrap = document.createElement("div"); tableWrap.className = "table-wrap";
  let rowsHtml = visibleRows.map((r) => `
    <tr>
      <td class="muted">${esc(r.category || "-")}</td>
      <td>${esc(r.word)}</td>
      <td class="muted">${esc(r.ipa)}</td>
      <td>${r.known1 ? '<span class="chip chip-known">T1</span>' : '<span class="chip chip-unknown">T1</span>'}</td>
      <td>${r.known2 ? '<span class="chip chip-known">T2</span>' : '<span class="chip chip-unknown">T2</span>'}</td>
      ${RULE_KEYS.map((k) => `<td class="center muted">${r.scores ? (r.scores[k] === null ? "\u2013" : r.scores[k]) : "\u2013"}</td>`).join("")}
      <td class="center bold">${r.scores ? r.scores.total : "\u2013"}</td>
    </tr>
  `).join("");
  tableWrap.innerHTML = `
    <table class="data-table">
      <thead><tr>
        <th>Category</th><th>Word</th><th>IPA</th><th class="center">Known T1</th><th class="center">Known T2</th>
        ${RULE_KEYS.map((k) => `<th class="center">${RULE_LABELS[k]}</th>`).join("")}
        <th class="center">Total</th>
      </tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  `;
  d.appendChild(tableWrap);
  return d;
}

function handleSave(btn) {
  if (!state.targetChildName.trim()) { state.saveMsg = "Enter a child name or ID first."; render(); return; }
  btn.disabled = true; btn.textContent = "Saving...";
  const id = state.targetChildIsNew
    ? state.targetChildName.trim().toLowerCase().replace(/\s+/g, "-") + "-" + Date.now().toString(36)
    : state.selectedChildId;
  const child = { id, name: state.targetChildName.trim(), words: state.scoredRows, updatedAt: new Date().toISOString() };

  saveChild(child);
  if (!state.childrenIndex.find((c) => c.id === id)) {
    state.childrenIndex = [...state.childrenIndex, { id, name: child.name }];
  } else {
    state.childrenIndex = state.childrenIndex.map((c) => (c.id === id ? { id, name: child.name } : c));
  }
  saveChildrenIndex(state.childrenIndex);
  state.saveMsg = `Saved ${state.scoredRows.length} words for ${child.name}.`;
  state.selectedChildId = id;
  render();
}

function renameChild(id) {
  const child = loadChild(id);
  if (!child) return;
  const next = window.prompt("Rename child", child.name);
  if (next === null) return;
  const trimmed = next.trim();
  if (!trimmed) return;
  child.name = trimmed;
  saveChild(child);
  state.childrenIndex = state.childrenIndex.map((c) => (c.id === id ? { id, name: trimmed } : c));
  saveChildrenIndex(state.childrenIndex);
  render();
}

function deleteChild(id) {
  const child = loadChild(id);
  const name = child ? child.name : "this child";
  if (!window.confirm(`Delete ${name} and all their saved data? This cannot be undone.`)) return;
  deleteChildStorage(id);
  state.childrenIndex = state.childrenIndex.filter((c) => c.id !== id);
  saveChildrenIndex(state.childrenIndex);
  state.compareSelected.delete(id);
  state.selectedChildId = null;
  state.screen = "home";
  render();
}

function downloadChildJson(child) {
  downloadFile(
    `${child.name.toLowerCase().replace(/\s+/g, "-")}-soundle-data.json`,
    JSON.stringify(child, null, 2), "application/json"
  );
}

function renderChild() {
  const child = loadChild(state.selectedChildId);
  const d = document.createElement("div"); d.className = "panel wide-panel";
  if (!child) { d.innerHTML = `<div class="sub">Child not found.</div>`; return d; }

  const header = document.createElement("div"); header.className = "review-header";
  const titleWrap = document.createElement("div");
  titleWrap.innerHTML = `<div class="h2">${esc(child.name)}</div>
    <div class="sub">${(child.words || []).length} words${child.updatedAt ? " &middot; updated " + esc(child.updatedAt.slice(0, 10)) : ""}</div>`;
  const actions = document.createElement("div"); actions.className = "review-controls";
  const renameBtn = document.createElement("button"); renameBtn.className = "btn-secondary"; renameBtn.textContent = "Rename";
  renameBtn.onclick = () => renameChild(child.id);
  const downloadBtn = document.createElement("button"); downloadBtn.className = "btn-secondary"; downloadBtn.textContent = "Download data";
  downloadBtn.onclick = () => downloadChildJson(child);
  const exportBtn = document.createElement("button"); exportBtn.className = "btn-secondary"; exportBtn.textContent = "Export Word doc";
  exportBtn.onclick = () => downloadFile(`${child.name}.rtf`, buildRtf(child.name, child.words || []), "application/rtf");
  const deleteBtn = document.createElement("button"); deleteBtn.className = "btn-secondary"; deleteBtn.textContent = "Delete";
  deleteBtn.onclick = () => deleteChild(child.id);
  actions.appendChild(renameBtn); actions.appendChild(downloadBtn); actions.appendChild(exportBtn); actions.appendChild(deleteBtn);
  header.appendChild(titleWrap); header.appendChild(actions);
  d.appendChild(header);

  if (!child.words || child.words.length === 0) {
    const p = document.createElement("div"); p.className = "sub"; p.textContent = "No words saved yet.";
    d.appendChild(p); return d;
  }

  const m = computeChildMetrics(child);

  const statsGrid = document.createElement("div"); statsGrid.className = "col-grid"; statsGrid.style.marginBottom = "24px";
  const stat = (label, value) => `<div class="card"><div class="card-sub" style="margin-bottom:4px">${esc(label)}</div><div class="h2" style="margin:0">${value}</div></div>`;
  statsGrid.innerHTML =
    stat("Known at timepoint 1", `${m.t1KnownCount} <span class="muted" style="font-size:14px">(${m.t1KnownPct}%)</span>`) +
    stat("Known at timepoint 2", `${m.t2KnownCount} <span class="muted" style="font-size:14px">(${m.t2KnownPct}%)</span>`) +
    stat("Avg complexity, known words (T2)", m.avgScoreT2Known);
  d.appendChild(statsGrid);

  const chartsRow = document.createElement("div"); chartsRow.className = "charts-row";
  const card1 = document.createElement("div"); card1.className = "card";
  card1.innerHTML = `<div class="card-title">Words known: timepoint 1 vs 2</div><div class="chart-box" id="chart-known"></div>`;
  const card2 = document.createElement("div"); card2.className = "card";
  card2.innerHTML = `<div class="card-title">Avg complexity of known words</div><div class="chart-box" id="chart-avg"></div>`;
  chartsRow.appendChild(card1); chartsRow.appendChild(card2);
  d.appendChild(chartsRow);

  const featureCard = document.createElement("div"); featureCard.className = "card full-card";
  featureCard.innerHTML = `
    <div class="card-title">Sound features: acquired vs not yet acquired</div>
    <div class="card-sub">Average points per word, by rule, split by whether the word is known.</div>
    <div class="chip-row" id="tp-toggle"></div>
    <div class="chart-box" id="chart-features"></div>
    <div id="feature-legend"></div>
  `;
  d.appendChild(featureCard);
  const tpToggle = featureCard.querySelector("#tp-toggle");
  ["known1", "known2"].forEach((tp) => {
    const chip = document.createElement("button");
    chip.className = "rule-chip" + (state.childFeatureTimepoint === tp ? " active" : "");
    chip.textContent = TIMEPOINT_LABELS[tp];
    chip.style.setProperty("--chip-color", "#5C3A21");
    chip.onclick = () => { state.childFeatureTimepoint = tp; render(); };
    tpToggle.appendChild(chip);
  });

  const catCard = document.createElement("div"); catCard.className = "full-card";
  const catHeader = document.createElement("div"); catHeader.className = "row-inline"; catHeader.style.marginBottom = "12px";
  const catLbl = document.createElement("div"); catLbl.className = "field-label"; catLbl.style.marginRight = "8px"; catLbl.textContent = "Category";
  const catSel = document.createElement("select"); catSel.className = "select"; catSel.style.width = "220px";
  const allOpt = document.createElement("option"); allOpt.value = "__all__"; allOpt.textContent = "All categories";
  catSel.appendChild(allOpt);
  m.categories.forEach((c) => {
    const o = document.createElement("option"); o.value = c; o.textContent = c;
    if (state.childCategoryFilter === c) o.selected = true;
    catSel.appendChild(o);
  });
  catSel.value = state.childCategoryFilter;
  catSel.onchange = () => { state.childCategoryFilter = catSel.value; render(); };
  catHeader.appendChild(catLbl); catHeader.appendChild(catSel);
  catCard.appendChild(catHeader);

  const visibleWords = state.childCategoryFilter === "__all__"
    ? child.words
    : child.words.filter((w) => (w.category || "Uncategorized") === state.childCategoryFilter);

  const tableWrap = document.createElement("div"); tableWrap.className = "table-wrap";
  const rowsHtml = visibleWords.map((r) => `
    <tr>
      <td class="muted">${esc(r.category || "-")}</td>
      <td>${esc(r.word)}</td>
      <td class="muted">${esc(r.ipa)}</td>
      <td class="center">${r.known1 ? '<span class="chip chip-known">yes</span>' : '<span class="chip chip-unknown">no</span>'}</td>
      <td class="center">${r.known2 ? '<span class="chip chip-known">yes</span>' : '<span class="chip chip-unknown">no</span>'}</td>
      <td class="center bold">${r.scores ? r.scores.total : "\u2013"}</td>
    </tr>
  `).join("");
  tableWrap.innerHTML = `
    <table class="data-table">
      <thead><tr><th>Category</th><th>Word</th><th>IPA</th><th class="center">Known T1</th><th class="center">Known T2</th><th class="center">Total</th></tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  `;
  catCard.appendChild(tableWrap);
  d.appendChild(catCard);

  requestAnimationFrame(() => {
    barChart(document.getElementById("chart-known"),
      [{ tp: "Timepoint 1", count: m.t1KnownCount }, { tp: "Timepoint 2", count: m.t2KnownCount }],
      "tp", "count", ACQUIRED_COLOR);
    barChart(document.getElementById("chart-avg"),
      [{ tp: "Timepoint 1", avg: m.avgScoreT1Known }, { tp: "Timepoint 2", avg: m.avgScoreT2Known }],
      "tp", "avg", "#B8863B");
    const known = state.childFeatureTimepoint === "known1" ? m.ruleAvgT1Known : m.ruleAvgT2Known;
    const unknown = state.childFeatureTimepoint === "known1" ? m.ruleAvgT1Unknown : m.ruleAvgT2Unknown;
    groupedBarChart(document.getElementById("chart-features"), RULE_KEYS.map((k) => RULE_LABELS[k]), [
      { name: "Acquired", color: ACQUIRED_COLOR, values: RULE_KEYS.map((k) => known[k]) },
      { name: "Not yet", color: NOT_ACQUIRED_COLOR, values: RULE_KEYS.map((k) => unknown[k]) },
    ]);
    renderLegend(document.getElementById("feature-legend"), [
      { name: "Acquired", color: ACQUIRED_COLOR }, { name: "Not yet acquired", color: NOT_ACQUIRED_COLOR },
    ]);
  });

  return d;
}

function renderCompare() {
  const d = document.createElement("div"); d.className = "panel wide-panel";
  d.innerHTML = `<div class="h2">Compare children</div>
    <p class="sub">Toggle children in or out to compile averages, acquisition trends, and feature breakdowns across the group.</p>`;

  const toggleRow = document.createElement("div"); toggleRow.className = "chip-row";
  const selectAllBtn = document.createElement("button"); selectAllBtn.className = "rule-chip";
  const allSelected = state.compareSelected.size === state.childrenIndex.length;
  selectAllBtn.textContent = allSelected ? "Deselect all" : "Select all";
  selectAllBtn.style.setProperty("--chip-color", "#5C3A21");
  selectAllBtn.onclick = () => {
    if (allSelected) state.compareSelected.clear();
    else state.childrenIndex.forEach((c) => state.compareSelected.add(c.id));
    render();
  };
  toggleRow.appendChild(selectAllBtn);
  state.childrenIndex.forEach((c) => {
    const chip = document.createElement("button");
    chip.className = "rule-chip" + (state.compareSelected.has(c.id) ? " active" : "");
    chip.textContent = c.name;
    chip.style.setProperty("--chip-color", "#5C3A21");
    chip.onclick = () => {
      if (state.compareSelected.has(c.id)) state.compareSelected.delete(c.id); else state.compareSelected.add(c.id);
      render();
    };
    toggleRow.appendChild(chip);
  });
  d.appendChild(toggleRow);

  const selectedChildren = state.childrenIndex
    .filter((c) => state.compareSelected.has(c.id))
    .map((c) => loadChild(c.id))
    .filter((c) => c && c.words && c.words.length);

  if (selectedChildren.length === 0) {
    const p = document.createElement("div"); p.className = "sub"; p.textContent = "Select at least one child with saved data.";
    d.appendChild(p); return d;
  }

  const metrics = selectedChildren.map(computeChildMetrics);
  const avg = (arr) => round2(arr.reduce((s, v) => s + v, 0) / arr.length);
  const combined = {
    t1KnownPct: avg(metrics.map((m) => m.t1KnownPct)),
    t2KnownPct: avg(metrics.map((m) => m.t2KnownPct)),
    avgScoreT1Known: avg(metrics.map((m) => m.avgScoreT1Known)),
    avgScoreT2Known: avg(metrics.map((m) => m.avgScoreT2Known)),
  };

  const statsGrid = document.createElement("div"); statsGrid.className = "col-grid"; statsGrid.style.marginBottom = "24px";
  const stat = (label, value) => `<div class="card"><div class="card-sub" style="margin-bottom:4px">${esc(label)}</div><div class="h2" style="margin:0">${value}</div></div>`;
  statsGrid.innerHTML =
    stat("Children compared", selectedChildren.length) +
    stat("Avg % known, T1 \u2192 T2", `${combined.t1KnownPct}% \u2192 ${combined.t2KnownPct}%`) +
    stat("Avg complexity, known (T2)", combined.avgScoreT2Known);
  d.appendChild(statsGrid);

  const chartsRow = document.createElement("div"); chartsRow.className = "charts-row";
  const card1 = document.createElement("div"); card1.className = "card";
  card1.innerHTML = `<div class="card-title">Avg % words known: T1 vs T2</div><div class="chart-box" id="cmp-chart-known"></div>`;
  const card2 = document.createElement("div"); card2.className = "card";
  card2.innerHTML = `<div class="card-title">Avg complexity of known words</div><div class="chart-box" id="cmp-chart-avg"></div>`;
  chartsRow.appendChild(card1); chartsRow.appendChild(card2);
  d.appendChild(chartsRow);

  const featureCard = document.createElement("div"); featureCard.className = "card full-card";
  featureCard.innerHTML = `
    <div class="card-title">Sound features: acquired vs not yet acquired, averaged across children</div>
    <div class="chip-row" id="cmp-tp-toggle"></div>
    <div class="chart-box" id="cmp-chart-features"></div>
    <div id="cmp-feature-legend"></div>
  `;
  d.appendChild(featureCard);
  const tpToggle = featureCard.querySelector("#cmp-tp-toggle");
  ["known1", "known2"].forEach((tp) => {
    const chip = document.createElement("button");
    chip.className = "rule-chip" + (state.compareFeatureTimepoint === tp ? " active" : "");
    chip.textContent = TIMEPOINT_LABELS[tp];
    chip.style.setProperty("--chip-color", "#5C3A21");
    chip.onclick = () => { state.compareFeatureTimepoint = tp; render(); };
    tpToggle.appendChild(chip);
  });

  const perChildCard = document.createElement("div"); perChildCard.className = "table-wrap full-card";
  const rowsHtml = metrics.map((m, i) => `
    <tr>
      <td>${esc(selectedChildren[i].name)}</td>
      <td class="center">${m.t1KnownPct}%</td>
      <td class="center">${m.t2KnownPct}%</td>
      <td class="center">${m.avgScoreT1Known}</td>
      <td class="center">${m.avgScoreT2Known}</td>
    </tr>
  `).join("");
  perChildCard.innerHTML = `
    <table class="data-table">
      <thead><tr><th>Child</th><th class="center">% known T1</th><th class="center">% known T2</th><th class="center">Avg score T1</th><th class="center">Avg score T2</th></tr></thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  `;
  d.appendChild(perChildCard);

  requestAnimationFrame(() => {
    barChart(document.getElementById("cmp-chart-known"),
      [{ tp: "Timepoint 1", pct: combined.t1KnownPct }, { tp: "Timepoint 2", pct: combined.t2KnownPct }],
      "tp", "pct", ACQUIRED_COLOR);
    barChart(document.getElementById("cmp-chart-avg"),
      [{ tp: "Timepoint 1", avg: combined.avgScoreT1Known }, { tp: "Timepoint 2", avg: combined.avgScoreT2Known }],
      "tp", "avg", "#B8863B");
    const knownKey = state.compareFeatureTimepoint === "known1" ? "ruleAvgT1Known" : "ruleAvgT2Known";
    const unknownKey = state.compareFeatureTimepoint === "known1" ? "ruleAvgT1Unknown" : "ruleAvgT2Unknown";
    const knownAvgs = RULE_KEYS.map((k) => avg(metrics.map((m) => m[knownKey][k])));
    const unknownAvgs = RULE_KEYS.map((k) => avg(metrics.map((m) => m[unknownKey][k])));
    groupedBarChart(document.getElementById("cmp-chart-features"), RULE_KEYS.map((k) => RULE_LABELS[k]), [
      { name: "Acquired", color: ACQUIRED_COLOR, values: knownAvgs },
      { name: "Not yet", color: NOT_ACQUIRED_COLOR, values: unknownAvgs },
    ]);
    renderLegend(document.getElementById("cmp-feature-legend"), [
      { name: "Acquired", color: ACQUIRED_COLOR }, { name: "Not yet acquired", color: NOT_ACQUIRED_COLOR },
    ]);
  });

  return d;
}

render();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
