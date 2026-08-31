/* =============================================================================
   Word Complexity Tracker -- standalone PWA, no build step, no server.
   Scoring engine + app logic, plain JS.
============================================================================= */

/* ---------- SCORING ENGINE (port of score_words.py) ---------- */
const STRESS_PRIMARY = "ˈ";
const STRESS_SECONDARY = "ˌ";
const SYLLABIC_MARKS = new Set(["\u0329", "\u030D"]);
const VOWELS = new Set("aeiouɪʊɛɔæʌəɑɒɜɐɨʉɯɤøœɶɵ".split(""));
const RHOTIC_VOWELS = new Set(["ɚ", "ɝ"]);
const VELARS = new Set(["k", "g", "ŋ", "x", "ɣ", "q", "ɢ"]);
const LIQUIDS = new Set(["l", "r", "ɹ", "ɾ", "ɻ", "ʎ", "ʟ", "ʀ", "ʁ"]);
const AFFRICATES = new Set(["tʃ", "dʒ"]); // only true English affricates; ts/dz etc. are clusters
const FRICATIVES = new Set(["f", "v", "θ", "ð", "s", "z", "ʃ", "ʒ", "h", "x", "ɣ", "ç", "ʁ", "ɸ", "β"]);
const VOICED_CONSONANTS = new Set([
  "b", "d", "g", "v", "ð", "z", "ʒ", "dʒ", "m", "n", "ŋ", "l", "r", "ɹ", "ɾ",
  "ɻ", "ʎ", "ʟ", "ʀ", "ʁ", "j", "w", "ɣ", "β",
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
  multisyllabic: "#2F6E6B", nonfirst_stress: "#B8863B", word_final_consonant: "#6B7A8F",
  consonant_clusters: "#8B5A8C", velars: "#3D7A5C", liquids_rhotics: "#C4634A",
  fricatives_affricates: "#4A7FA8", voiced_fric_affricate: "#9B7B3F",
};

/* ---------- helpers ---------- */
function parseKnown(v) {
  if (v === null || v === undefined) return false;
  const s = String(v).trim().toLowerCase();
  return ["y", "yes", "true", "1", "x", "known"].includes(s);
}
function guessColumn(headers, patterns) {
  for (let i = 0; i < headers.length; i++) {
    const h = String(headers[i] || "").toLowerCase();
    if (patterns.some((p) => p.test(h))) return i;
  }
  return -1;
}
function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/* ---------- storage (localStorage -- this is a real standalone page, not a Claude artifact) ---------- */
const STORE_PREFIX = "wc_";
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

/* ---------- RTF export ---------- */
function rtfEscape(s) {
  return String(s ?? "").replace(/\\/g, "\\\\").replace(/{/g, "\\{").replace(/}/g, "\\}")
    .split("").map((ch) => { const c = ch.codePointAt(0); return c > 127 ? `\\u${c}?` : ch; }).join("");
}
function buildRtf(childName, date, rows) {
  const headers = ["Word", "IPA", "Known", ...RULE_KEYS.map((k) => RULE_LABELS[k]), "Total"];
  const colWidths = [1800, 2200, 900, ...RULE_KEYS.map(() => 1300), 900];
  let cellDefs = ""; let acc = 0;
  colWidths.forEach((w) => { acc += w; cellDefs += `\\cellx${acc}`; });
  const headerRow = `\\trowd\\trgaph70${cellDefs}\n` +
    headers.map((h) => `\\intbl\\b ${rtfEscape(h)}\\b0\\cell`).join("") + "\\row\n";
  const bodyRows = rows.map((r) => {
    const vals = [r.word, r.ipa, r.known ? "Yes" : "No",
      ...RULE_KEYS.map((k) => (r.scores?.[k] ?? "-")), r.scores?.total ?? "-"];
    return `\\trowd\\trgaph70${cellDefs}\n` + vals.map((v) => `\\intbl ${rtfEscape(v)}\\cell`).join("") + "\\row\n";
  }).join("");
  return `{\\rtf1\\ansi\\deff0\n{\\fonttbl{\\f0 Calibri;}}\n\\f0\\fs22\n{\\fs32\\b Word Complexity Score Report\\b0\\par}\n{\\fs22 ${rtfEscape(childName)} \\endash ${rtfEscape(date)}\\par}\n\\par\n${headerRow}${bodyRows}\n\\par\n{\\fs18\\i Scoring rules: 1pt for 3+ syllables; 1pt for stress on a non-initial syllable; 1pt for a word-final consonant; 1pt per consonant cluster; 1pt per velar; 1pt per liquid/rhotic; 1pt per fricative or affricate; 1pt per voiced fricative/affricate (in addition to the fricative/affricate point).\\par}\n}`;
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
function barChart(container, data, xKey, yKey, color, yLabel) {
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
  // series: [{key, color, label}]
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

/* ---------- app state ---------- */
const state = {
  screen: "home",
  childrenIndex: loadChildrenIndex(),
  selectedChildId: null,
  rawSheet: null,
  colMap: { word: -1, ipa: -1, known: -1 },
  scoredRows: [],
  targetChildName: "",
  targetChildIsNew: true,
  assessDate: new Date().toISOString().slice(0, 10),
  visibleRules: new Set(RULE_KEYS),
  saveMsg: "",
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
  root.appendChild(main);
}

function renderSidebar() {
  const sb = document.createElement("div"); sb.className = "sidebar";
  sb.innerHTML = `
    <div class="brand">
      <div class="brand-title">Word Complexity</div>
      <div class="brand-sub">Phonological scoring & tracking</div>
    </div>
  `;
  const btn = document.createElement("button");
  btn.className = "btn-primary new-btn";
  btn.textContent = "+ New assessment";
  btn.onclick = () => {
    state.screen = "upload-start"; state.selectedChildId = null; state.rawSheet = null;
    state.scoredRows = []; state.saveMsg = ""; state.targetChildName = ""; state.targetChildIsNew = true;
    render();
  };
  sb.appendChild(btn);

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
    b.onclick = () => { state.selectedChildId = c.id; state.screen = "child"; render(); };
    list.appendChild(b);
  });
  sb.appendChild(list);
  return sb;
}

function renderHome() {
  const d = document.createElement("div"); d.className = "panel center-panel";
  d.innerHTML = `
    <div class="h1">Track sound acquisition over time</div>
    <p class="lead">Upload a word list with IPA transcriptions and mark which words a child produces.
    Each word is scored against eight phonological complexity rules, and every assessment is saved
    on this device so you can see how a child's sound system develops across sessions.</p>
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
    <p class="sub">An .xlsx file with a Word column, an IPA column, and (optionally) a column marking which words the child produced.</p>
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
    state.colMap.word = guessColumn(headers, [/^word$/, /word/]);
    state.colMap.ipa = guessColumn(headers, [/ipa/]);
    state.colMap.known = guessColumn(headers, [/known/, /yes.?no/, /produc/]);
    state.rawSheet = { headers, rows };
    state.screen = "upload";
    render();
  };
  reader.readAsArrayBuffer(file);
}

function renderColumnMap() {
  const d = document.createElement("div"); d.className = "panel wide-panel";
  const wrap = document.createElement("div");
  wrap.innerHTML = `<div class="h2">Match your columns</div>
    <p class="sub">I guessed these from your headers &mdash; check they're right.</p>`;
  const grid = document.createElement("div"); grid.className = "col-grid";
  ["word", "ipa", "known"].forEach((field) => {
    const col = document.createElement("div");
    const lbl = document.createElement("div"); lbl.className = "field-label";
    lbl.textContent = field === "known" ? "Known (optional)" : field;
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
  const btn = document.createElement("button"); btn.className = "btn-primary"; btn.textContent = "Score words →";
  btn.onclick = () => {
    if (state.colMap.word < 0 || state.colMap.ipa < 0) return;
    state.scoredRows = computeScoredRows();
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
    const known = state.colMap.known >= 0 ? parseKnown(r[state.colMap.known]) : false;
    return { word, ipa, known, scores: scoreWord(ipa) };
  }).filter((r) => r.word);
}

function renderReview() {
  const d = document.createElement("div"); d.className = "panel wide-panel";
  const knownCount = state.scoredRows.filter((r) => r.known).length;
  const header = document.createElement("div"); header.className = "review-header";
  header.innerHTML = `
    <div>
      <div class="h2">Review scores</div>
      <div class="sub">${state.scoredRows.length} words &middot; ${knownCount} marked known</div>
    </div>
  `;
  const controls = document.createElement("div"); controls.className = "review-controls";

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

  const dateField = document.createElement("div");
  dateField.innerHTML = `<div class="field-label">Date</div>`;
  const dateInput = document.createElement("input");
  dateInput.type = "date"; dateInput.className = "text-input"; dateInput.value = state.assessDate;
  dateInput.onchange = () => { state.assessDate = dateInput.value; };
  dateField.appendChild(dateInput);

  const saveBtn = document.createElement("button"); saveBtn.className = "btn-primary"; saveBtn.textContent = "Save assessment";
  saveBtn.onclick = () => handleSave(saveBtn);
  const exportBtn = document.createElement("button"); exportBtn.className = "btn-secondary"; exportBtn.textContent = "Export Word doc";
  exportBtn.onclick = () => downloadFile(
    `${state.targetChildName || "word-complexity"}-${state.assessDate}.rtf`,
    buildRtf(state.targetChildName || "Untitled", state.assessDate, state.scoredRows), "application/rtf"
  );

  controls.appendChild(childField); controls.appendChild(dateField); controls.appendChild(saveBtn); controls.appendChild(exportBtn);
  header.appendChild(controls);
  d.appendChild(header);

  const msg = document.createElement("div"); msg.className = "save-msg"; msg.textContent = state.saveMsg;
  d.appendChild(msg);

  const tableWrap = document.createElement("div"); tableWrap.className = "table-wrap";
  let rowsHtml = state.scoredRows.map((r) => `
    <tr>
      <td>${esc(r.word)}</td>
      <td class="muted">${esc(r.ipa)}</td>
      <td>${r.known ? '<span class="chip chip-known">known</span>' : '<span class="chip chip-unknown">not yet</span>'}</td>
      ${RULE_KEYS.map((k) => `<td class="center muted">${r.scores ? (r.scores[k] === null ? "–" : r.scores[k]) : "–"}</td>`).join("")}
      <td class="center bold">${r.scores ? r.scores.total : "–"}</td>
    </tr>
  `).join("");
  tableWrap.innerHTML = `
    <table class="data-table">
      <thead><tr>
        <th>Word</th><th>IPA</th><th>Known</th>
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
  let child = state.targetChildIsNew ? null : loadChild(id);
  if (!child) child = { id, name: state.targetChildName.trim(), assessments: [] };

  const existingIdx = child.assessments.findIndex((a) => a.date === state.assessDate);
  const newAssessment = { date: state.assessDate, words: state.scoredRows };
  if (existingIdx >= 0) child.assessments[existingIdx] = newAssessment;
  else child.assessments.push(newAssessment);
  child.assessments.sort((a, b) => a.date.localeCompare(b.date));

  saveChild(child);
  if (!state.childrenIndex.find((c) => c.id === id)) {
    state.childrenIndex = [...state.childrenIndex, { id, name: child.name }];
    saveChildrenIndex(state.childrenIndex);
  }
  state.saveMsg = `Saved ${state.scoredRows.length} words for ${child.name} (${state.assessDate}).`;
  state.selectedChildId = id;
  render();
}

function renderChild() {
  const child = loadChild(state.selectedChildId);
  const d = document.createElement("div"); d.className = "panel wide-panel";
  if (!child) { d.innerHTML = `<div class="sub">Child not found.</div>`; return d; }

  const trend = child.assessments.map((a) => {
    const known = a.words.filter((w) => w.known && w.scores);
    const avgTotal = known.length ? known.reduce((s, w) => s + w.scores.total, 0) / known.length : 0;
    const point = { date: a.date, knownCount: known.length, avgTotal: Math.round(avgTotal * 100) / 100 };
    RULE_KEYS.forEach((k) => {
      point[k] = known.length ? Math.round((known.reduce((s, w) => s + (w.scores[k] || 0), 0) / known.length) * 100) / 100 : 0;
    });
    return point;
  });
  const latest = child.assessments[child.assessments.length - 1];
  const latestKnown = latest ? latest.words.filter((w) => w.known).length : 0;

  d.innerHTML = `
    <div class="h2">${esc(child.name)}</div>
    <div class="sub" style="margin-bottom:28px">${child.assessments.length} assessment${child.assessments.length !== 1 ? "s" : ""} &middot; latest: ${latest ? latest.date : "–"} (${latestKnown} words known)</div>
  `;
  if (child.assessments.length === 0) {
    const p = document.createElement("div"); p.className = "sub"; p.textContent = "No assessments saved yet.";
    d.appendChild(p); return d;
  }

  const chartsRow = document.createElement("div"); chartsRow.className = "charts-row";
  const card1 = document.createElement("div"); card1.className = "card";
  card1.innerHTML = `<div class="card-title">Words known over time</div><div class="chart-box" id="chart-known"></div>`;
  const card2 = document.createElement("div"); card2.className = "card";
  card2.innerHTML = `<div class="card-title">Average complexity of known words</div><div class="chart-box" id="chart-avg"></div>`;
  chartsRow.appendChild(card1); chartsRow.appendChild(card2);
  d.appendChild(chartsRow);

  const soundCard = document.createElement("div"); soundCard.className = "card full-card";
  soundCard.innerHTML = `
    <div class="card-title">Sound-class breakdown over time</div>
    <div class="card-sub">Average points per known word, by rule. Click a chip to show or hide it.</div>
    <div class="chip-row" id="rule-chips"></div>
    <div class="chart-box" id="chart-rules"></div>
  `;
  d.appendChild(soundCard);

  const chipRow = soundCard.querySelector("#rule-chips");
  RULE_KEYS.forEach((k) => {
    const chip = document.createElement("button");
    chip.className = "rule-chip" + (state.visibleRules.has(k) ? " active" : "");
    chip.textContent = RULE_LABELS[k];
    chip.style.setProperty("--chip-color", RULE_COLORS[k]);
    chip.onclick = () => {
      if (state.visibleRules.has(k)) state.visibleRules.delete(k); else state.visibleRules.add(k);
      drawRuleChart(); chip.classList.toggle("active");
    };
    chipRow.appendChild(chip);
  });

  const histTitle = document.createElement("div"); histTitle.className = "card-title"; histTitle.style.marginTop = "8px";
  histTitle.textContent = "Assessment history";
  d.appendChild(histTitle);
  const histCard = document.createElement("div"); histCard.className = "card";
  child.assessments.slice().reverse().forEach((a) => {
    const known = a.words.filter((w) => w.known);
    const avg = known.length ? (known.reduce((s, w) => s + (w.scores?.total || 0), 0) / known.length).toFixed(2) : "-";
    const row = document.createElement("div"); row.className = "history-row";
    row.innerHTML = `<div class="bold">${a.date}</div><div class="muted">${a.words.length} words &middot; ${known.length} known &middot; avg score ${avg}</div>`;
    histCard.appendChild(row);
  });
  d.appendChild(histCard);

  function drawRuleChart() {
    const series = RULE_KEYS.filter((k) => state.visibleRules.has(k)).map((k) => ({ key: k, color: RULE_COLORS[k] }));
    lineChart(document.getElementById("chart-rules"), trend, "date", series);
  }

  requestAnimationFrame(() => {
    barChart(document.getElementById("chart-known"), trend, "date", "knownCount", "#2F6E6B");
    lineChart(document.getElementById("chart-avg"), trend, "date", [{ key: "avgTotal", color: "#B8863B" }]);
    drawRuleChart();
  });

  return d;
}

render();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
