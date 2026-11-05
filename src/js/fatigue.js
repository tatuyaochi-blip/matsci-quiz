// 疲労寿命とき裂進展の計算。4つの計算を1つのページで行い、使った式と、値を代入した形を見せる(講義の演習・設計の見当に)。
//   1. 応力拡大係数と限界き裂: K = Yσ√(πa)、a_c(K = K_IC になる a)、与えた a で破壊する応力 σ_c = K_IC/(Y√(πa))、
//      線形破壊力学の目安(Irwin の塑性域 r_y = (1/2π)(K/σ_y)²、ASTM E399 の B, a ≥ 2.5(K_IC/σ_y)²)
//   2. パリス則 da/dN = C(ΔK)^m の積分: Y 一定なら閉じた式(m ≠ 2 と m = 2)、Y が a で変わるとき(有限幅)は数値積分
//   3. 平均応力の補正: 修正グッドマン・ゲルバー・ゾーダーバーグ・SWT で等価な両振りの応力振幅 σ_ar
//   4. S–N 曲線(バスキンの式 σ_a = σ_f′(2N_f)^b)とマイナー則 D = Σnᵢ/Nᵢ
// 長さは mm で入れ、式の中では m に直す(K は MPa√m、C は m/cycle と MPa√m の組)。
// 値と出典は review の check/data.md。文言は data/tools/fatigue.json の text.{言語}.js
// 計算の関数(yOf・kOf・critA・lifeClosed・lifeNumeric・meanStress・basquinN・miner など)は DOM なしで import できる
// (検算: review の check/check_fatigue.py と check/js_results.mjs)。
import { lineChart } from './chart.js';

// =====================================================================
// 定数とプリセット
// =====================================================================
// 単位の換算(定義から): 1 in = 0.0254 m、1 ksi = 6.894757 MPa → 1 ksi√in = 6.894757 × √0.0254 MPa√m
export const IN_M = 0.0254;
export const KSI_MPA = 6.894757;
export const KSIIN_MPAM = KSI_MPA * Math.sqrt(IN_M); // ≈ 1.0988
// 形状係数のプリセット。
//   center: 無限板の中央き裂(全長 2a)Y = 1
//   edge:   半無限板の縁き裂(深さ a)Y = 1.12(Gross・Seelig の表 4.1 では 1.1215)
//   finite: 幅 W の板の中央き裂。Y = (1 − 0.025α² + 0.06α⁴)√sec(πα/2)、α = 2a/W(Gross・Seelig の表 4.1、Tada の式)
//   custom: 利用者が入れる Y(a によらない一定の値)
export const Y_EDGE = 1.12;
export const GEOS = ['center', 'edge', 'finite', 'custom'];
// パリス則のプリセット(SI: da/dN は m/cycle、ΔK は MPa√m)。
//   fp・mart・aus: Barsom(Barsom・Rolfe)の鋼の上限の式。Norton, Machine Design 6th ed. の表 6-2(US の値も)と、
//                  Kinser ほか Int. J. Metalcasting (2026) の引用で確かめた。室温付近の腐食性のない環境の長いき裂のデータの上限
//   bs:            BS 7910:2013+A1:2015 の簡易則(鋼・空気中、平均 + 2 標準偏差の上限)。Amirafshari・Stacey (OMAE2019) の表 3 の
//                  ln A = −28.28(N/mm^1.5 と mm/cycle)から、A = 5.2×10⁻¹³ → 1.65×10⁻¹¹ m/cycle(MPa√m)に換算
export const PARIS = {
  fp: { c: 6.9e-12, m: 3.0, us: 3.6e-10, src: 'norton' },
  mart: { c: 1.35e-10, m: 2.25, us: 6.6e-9, src: 'norton' },
  aus: { c: 5.6e-12, m: 3.25, us: 3.0e-10, src: 'norton' },
  bs: { c: 1.65e-11, m: 3.0, us: null, src: 'omae' },
};
export const SRC = {
  norton: 'https://designofmachinery.com/wp-content/uploads/2021/02/Chap-06-MD-6ed-p.360-361.pdf',
  kinser: 'https://link.springer.com/article/10.1007/s40962-026-01882-x',
  omae: 'https://core.ac.uk/download/228138531.pdf',
  gross: 'https://webpages.tuni.fi/rakmek/rak_33060/harj/FMF_02.pdf',
  isu: 'https://www.engineering.iastate.edu/~gkstarns/me325/LEFM.pdf',
  e399: 'https://cdn.standards.iteh.ai/samples/7252/b6e9d6911e3f440b92322c4e64b25d8e/ASTM-E399-90-1997-.pdf',
  irwin: 'https://engineeringlibrary.org/reference/fracture-mechanics-plastic-yielding-at-crack-tip',
  iitm: 'https://home.iitm.ac.in/ratna/course_material/ME2200/fatigue_education_module.html',
  altair: 'https://help.altair.com/2023/hwdesktop/hlife/topics/solvers/os/analysis_fatigue_stress_life_approach_r.htm',
  swt: 'https://www.dlib.si/stream/URN:NBN:SI:DOC-F1XOZ91C/e5ec15e6-af2f-42c1-83c2-5bafdcc9e855/TEXT',
  hardrath: 'https://ntrs.nasa.gov/api/citations/19650024317/downloads/19650024317.pdf',
  roylance: 'https://ocw.mit.edu/courses/3-91-mechanical-behavior-of-plastics-spring-2007/ee889472ac45a2049ccce27f914ca57c_24_fatigue.pdf',
};
export const BLOCKS = 4; // マイナー則のブロックの数(空の行は使わない)

// C の単位の換算: in/cycle と ksi√in の C → m/cycle と MPa√m の C
export const cUsToSi = (c, m) => (c * IN_M) / KSIIN_MPAM ** m;
export const cSiToUs = (c, m) => (c * KSIIN_MPAM ** m) / IN_M;

// =====================================================================
// 1. 応力拡大係数と限界き裂(a は m)
// =====================================================================
// 有限幅の中央き裂の形状係数。α = 2a/W(< 1)
export function yFinite(a, W) {
  const al = (2 * a) / W;
  if (!(al >= 0 && al < 1)) return NaN;
  return (1 - 0.025 * al ** 2 + 0.06 * al ** 4) * Math.sqrt(1 / Math.cos((Math.PI * al) / 2));
}
// Feddersen の √sec(πa/W)(多項式の補正なし)。比べるためだけに使う
export const yFeddersen = (a, W) => ((2 * a) / W < 1 ? Math.sqrt(1 / Math.cos((Math.PI * a) / W)) : NaN);
// 形状 g の Y(a)。g: { geo, y, W }(W は m)
export function yOf(g, a) {
  if (g.geo === 'center') return 1;
  if (g.geo === 'edge') return Y_EDGE;
  if (g.geo === 'finite') return yFinite(a, g.W);
  return g.y;
}
export const yConst = g => g.geo !== 'finite';
export const kOf = (g, s, a) => yOf(g, a) * s * Math.sqrt(Math.PI * a);
// 限界き裂長さ: Y(a)σ√(πa) = K_IC。Y 一定なら a_c = (1/π)(K_IC/(Yσ))²、有限幅は二分法(a < W/2)
export function critA(g, s, kic) {
  if (!(s > 0) || !(kic > 0)) return null;
  if (yConst(g)) { const Y = yOf(g, 0); return Y > 0 ? (kic / (Y * s)) ** 2 / Math.PI : null; }
  if (!(g.W > 0)) return null;
  let lo = 0, hi = (g.W / 2) * (1 - 1e-12);
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (kOf(g, s, mid) < kic) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}
// 与えた a で破壊する応力
export const critS = (g, a, kic) => { const Y = yOf(g, a); return Y > 0 && a > 0 && kic > 0 ? kic / (Y * Math.sqrt(Math.PI * a)) : null; };
// Irwin の塑性域(平面応力の1次の見積もり)と、ASTM E399 の厚さ・き裂長さの条件(どちらも m)
export const plasticZone = (K, sy) => (K > 0 && sy > 0 ? (K / sy) ** 2 / (2 * Math.PI) : null);
export const e399Size = (kic, sy) => (kic > 0 && sy > 0 ? 2.5 * (kic / sy) ** 2 : null);

// =====================================================================
// 2. パリス則の積分(a は m、Δσ は MPa、C は m/cycle·(MPa√m)^−m)
// =====================================================================
// ΔK に使う応力の幅。σ_min < 0 のとき、'pos' は圧縮の側を数えない(ΔK = K_max)、'full' は全幅
export function deltaS(smax, smin, how = 'pos') {
  if (!(smax > 0) || !Number.isFinite(smin) || !(smin < smax)) return null; // Δσ = 0 は進まない(入力の誤りとして止める)
  return how === 'pos' && smin < 0 ? smax : smax - smin;
}
// Y 一定の閉じた式
export function lifeClosed(a0, af, ds, C, m, Y) {
  if (!(a0 > 0) || !(af >= a0) || !(ds > 0) || !(C > 0) || !(m > 0) || !(Y > 0)) return null;
  const B = C * (Y * ds * Math.sqrt(Math.PI)) ** m;
  if (Math.abs(m - 2) < 1e-12) return Math.log(af / a0) / B;
  return (af ** (1 - m / 2) - a0 ** (1 - m / 2)) / (B * (1 - m / 2));
}
// 数値積分: N = ∫ da / (C(Y(a)Δσ√(πa))^m)。u = ln a に置き換えて Simpson 則(n は偶数のきざみの数)
export function lifeNumeric(g, a0, af, ds, C, m, n = 2000) {
  if (!(a0 > 0) || !(af >= a0) || !(ds > 0) || !(C > 0) || !(m > 0)) return null;
  if (af === a0) return 0;
  const u0 = Math.log(a0), h = (Math.log(af) - u0) / n;
  const f = u => { const a = Math.exp(u); return a / (C * kOf(g, ds, a) ** m); };
  let s = f(u0) + f(u0 + n * h);
  for (let i = 1; i < n; i++) s += (i % 2 ? 4 : 2) * f(u0 + i * h);
  return (s * h) / 3;
}
// a–N 曲線の点([N, a])。対数のきざみで台形則の累積(グラフ用)
export function aNCurve(g, a0, af, ds, C, m, k = 300) {
  if (!(a0 > 0) || !(af > a0)) return [];
  const u0 = Math.log(a0), h = (Math.log(af) - u0) / k;
  const f = u => { const a = Math.exp(u); return a / (C * kOf(g, ds, a) ** m); };
  const pts = [[0, a0]];
  let N = 0, prev = f(u0);
  for (let i = 1; i <= k; i++) { const v = f(u0 + i * h); N += ((prev + v) / 2) * h; prev = v; pts.push([N, Math.exp(u0 + i * h)]); }
  return pts;
}

// =====================================================================
// 3. 平均応力の補正(MPa)
// =====================================================================
export const ampMean = (smax, smin) => ({ sa: (smax - smin) / 2, sm: (smax + smin) / 2, R: smax !== 0 ? smin / smax : null, ds: smax - smin });
// 等価な両振りの応力振幅 σ_ar。圧縮の平均応力(σ_m < 0)は、グッドマン・ゾーダーバーグでは効かせない(σ_ar = σ_a)。
// ゲルバーは (σ_m/σ_u)² なので符号によらず同じ式。SWT は σ_max > 0 のときだけ σ_ar = √(σ_max·σ_a)
export function meanStress(sa, sm, su, sy) {
  const r = {};
  if (!(sa >= 0) || !Number.isFinite(sm)) return null;
  const cut = sm > 0 ? sm : 0;
  r.goodman = su > 0 ? (cut < su ? sa / (1 - cut / su) : Infinity) : null;
  r.gerber = su > 0 ? (Math.abs(sm) < su ? sa / (1 - (sm / su) ** 2) : Infinity) : null;
  r.soderberg = sy > 0 ? (cut < sy ? sa / (1 - cut / sy) : Infinity) : null;
  const smax = sm + sa;
  r.swt = smax > 0 ? Math.sqrt(smax * sa) : null;
  r.smax = smax;
  return r;
}
// 修正グッドマン線の上での、原点からの荷重線に沿った安全率 n(σ_a/σ_e + σ_m/σ_u = 1/n)
export const goodmanN = (sa, sm, se, su) => (se > 0 && su > 0 ? 1 / (sa / se + Math.max(sm, 0) / su) : null);

// =====================================================================
// 4. S–N 曲線(バスキンの式)とマイナー則
// =====================================================================
// σ_a = σ_f′(2N_f)^b → N_f = ½(σ_a/σ_f′)^(1/b)(b < 0)
export const basquinN = (sa, sf, b) => (sa > 0 && sf > 0 && b < 0 ? 0.5 * (sa / sf) ** (1 / b) : null);
export const basquinS = (N, sf, b) => (N > 0 && sf > 0 && b < 0 ? sf * (2 * N) ** b : null);
// rows: [{ sa, n }]。se(疲労限度)があり bl = 'skip' なら、σ_a < σ_e のブロックは数えない(Nᵢ = ∞)。
// bl = 'ext' はバスキンの式を疲労限度より下にもそのまま延ばす(修正マイナー則)
export function miner(rows, sf, b, se, bl = 'ext') {
  if (!(sf > 0) || !(b < 0)) return null;
  const out = rows.map(r => {
    const below = se > 0 && r.sa < se;
    const N = below && bl === 'skip' ? Infinity : basquinN(r.sa, sf, b);
    return { ...r, below, N, d: N === Infinity ? 0 : r.n / N };
  });
  if (out.some(r => r.N == null)) return null;
  const D = out.reduce((s, r) => s + r.d, 0);
  return { rows: out, D, repeats: D > 0 ? 1 / D : Infinity };
}

// 例のボタン(計算の例として作った値。実際の部材・材料のデータではない)
export const EXAMPLES = [
  { mode: 'paris', geo: 'finite', w: 300, smax: 120, smin: 0, dsm: 'pos', kic: 60, a0: 5, afm: 'ac', af: 20, pp: 'fp', cu: 'si' },
  { mode: 'k', geo: 'edge', s: 300, a: 5, kic: 60, sy: 600 },
  { mode: 'mean', inm: 'am', sa: 200, sm: 150, su: 800, syy: 600, se: 300 },
  { mode: 'miner', sf: 1000, bb: -0.09, se2: 250, bl: 'ext', s1: 400, n1: 1000, s2: 320, n2: 10000, s3: 240, n3: 200000, s4: '', n4: '' },
];

// =====================================================================
// 画面(ブラウザのときだけ)
// =====================================================================
const form = typeof document !== 'undefined' ? document.getElementById('fatigue-form') : null;
if (form) setup();

function setup() {
  const T = JSON.parse(form.dataset.text);
  const U = T.ui;
  const home = document.documentElement.dataset.home ?? '/';
  const lang = document.documentElement.lang;
  const out = k => document.querySelector(`[data-out="${k}"]`);
  const fill = (s, v = {}) => String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m));
  const el = (tag, attrs = {}, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) if (v != null && v !== false) e.setAttribute(k, v);
    e.append(...kids.flat().filter(k => k != null && k !== false));
    return e;
  };
  const E = form.elements;

  // ---- 数の書式(言語で小数点が変わる。de はあとでコンマになる) ----
  const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
  const nfsig = sig => new Intl.NumberFormat(lang, { minimumSignificantDigits: sig, maximumSignificantDigits: sig, useGrouping: false });
  const nfd = d => new Intl.NumberFormat(lang, { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: false });
  const nfmax = d => new Intl.NumberFormat(lang, { maximumFractionDigits: d, useGrouping: false });
  const minus = t => t.replace(/^-/, '−');
  const expo = (v, sig) => {
    const [m, e] = v.toExponential(sig - 1).split('e');
    return `${minus(nfd(sig - 1).format(Number(m)))}×10${String(Number(e)).replace(/./g, ch => SUP[ch])}`;
  };
  // 有効数字 sig 桁。0.001 未満と 10⁶ 以上は a×10ⁿ の形
  const sci = (v, sig = 3) => {
    if (v === Infinity) return '∞';
    if (v == null || !Number.isFinite(v)) return '–';
    if (v === 0) return '0';
    const a = Math.abs(v);
    if (a >= 1e-3 && a < 1e6) return minus(nfsig(sig).format(v));
    return expo(v, sig);
  };
  // 回数: 1000 回以上は 1.23×10⁶ の形
  const cyc = (v, sig = 3) => (v === Infinity ? '∞' : v == null || !Number.isFinite(v) ? '–' : Math.abs(v) >= 1000 ? expo(v, sig) : minus(nfsig(sig).format(v)));
  const fix = (v, d) => (v == null || !Number.isFinite(v) ? '–' : minus(nfd(d).format(v)));
  const inp = v => (Number.isFinite(v) ? (Math.abs(v) !== 0 && (Math.abs(v) < 1e-3 || Math.abs(v) >= 1e6) ? expo(v, 3) : minus(nfmax(6).format(v))) : '–');
  const numOf = name => {
    const s = String(E[name]?.value ?? '').trim().replace(',', '.');
    return s === '' ? NaN : Number(s);
  };
  // 式の中に直接書いた定数(1.12 など)も、ドイツ語では小数点をコンマにする(差し込んだ値は Intl でコンマになっている)
  const decFix = t => (lang === 'de' ? t.replace(/(\d)\.(\d)/g, '$1,$2') : t);

  // ---- 見た目(このツールだけ) ----
  const css = document.createElement('style');
  css.textContent = `
#fatigue-form .fg-wide { grid-column: 1 / -1; margin: 0; }
#fatigue-form .fg-full { grid-column: span 2; }
@media (max-width: 480px) { #fatigue-form .fg-full { grid-column: 1 / -1; } }
#fatigue-form .dy-field[hidden], #fatigue-form .fg-group[hidden] { display: none !important; }
#fatigue-form .fg-group { grid-column: 1 / -1; border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; margin: 0; min-width: 0; }
#fatigue-form .fg-group legend { font-size: .88rem; color: var(--muted); padding: 0 4px; }
#fatigue-form .fg-rows { display: grid; grid-template-columns: auto minmax(0, 1fr) minmax(0, 1fr); gap: 6px 8px; align-items: center; }
#fatigue-form .fg-rows .dy-field { margin: 0; }
#fatigue-form .fg-rows .dy-field > span { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
#fatigue-form .fg-rows .fg-rh { font-size: .8rem; color: var(--muted); }
#fatigue-form .fg-rows .fg-ri { font-size: .8rem; color: var(--muted); text-align: right; min-width: 1.2em; }
.fg-tabs { display: flex; flex-wrap: wrap; gap: 6px; }
.fg-tabs .btn { min-height: 40px; padding: 0 14px; }
.fg-tabs .btn[aria-pressed="true"] { background: var(--accent); color: #fff; border-color: var(--accent); }
.fg-ex { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.fg-ex .btn { min-height: 36px; padding: 0 12px; font-size: .85rem; }
.fg-box { margin: 12px 0; padding: 10px 12px; border-radius: 8px; background: var(--bg); }
.fg-box h3 { margin: 0 0 6px; font-size: 1rem; }
.fg-box ul { margin: 4px 0; padding-left: 1.3em; line-height: 1.7; }
.fg-box p { margin: 4px 0; line-height: 1.7; }
.fg-main { font-size: 1.05rem; line-height: 1.7; margin: 0 0 10px; padding: 10px 12px; border-radius: 8px; background: var(--accent-soft); }
.fg-eq { font-family: var(--mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace); font-size: .88rem; line-height: 1.8; white-space: pre-wrap; overflow-wrap: anywhere; margin: 4px 0; }
.fg-warn { color: var(--text); border-left: 3px solid var(--accent-2); padding-left: 8px; }
.fg-tbl-wrap { overflow-x: auto; }
.fg-tbl { width: 100%; border-collapse: collapse; font-size: .86rem; }
.fg-tbl th, .fg-tbl td { text-align: left; padding: 5px 6px; border-bottom: 1px solid var(--border); vertical-align: top; }
.fg-tbl td.fg-num { white-space: nowrap; font-variant-numeric: tabular-nums; }
.fg-tbl thead th { font-size: .78rem; color: var(--muted); font-weight: 600; }
.fg-tbl tr.fg-on { background: var(--accent-soft); }
.fg-tbl.fg-preset { min-width: 560px; }
@media (max-width: 480px) { .fg-tbl th, .fg-tbl td { padding: 4px 3px; font-size: .78rem; } }
.fg-links { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0 0; }
.fg-legend { font-size: .82rem; color: var(--muted); margin: 0 0 4px; }
.fg-key { display: inline-block; width: 18px; height: 3px; vertical-align: middle; margin: 0 4px 0 8px; }
`;
  document.head.append(css);

  const lab = n => E[n]?.closest('label');
  for (const n of ['geo', 'pp', 'afm', 'dsm', 'cu', 'inm', 'bl']) lab(n)?.classList.add('fg-full');

  // ---- 計算の切り替え(タブ)。選んだ計算は mode の選択欄に入れる(URL に残る) ----
  const MODES = ['k', 'paris', 'mean', 'miner'];
  lab('mode').hidden = true;
  const tabs = el('div', { class: 'fg-tabs fg-wide', role: 'group', 'aria-label': U.tabs_label },
    ...MODES.map(m => el('button', { type: 'button', class: 'btn btn-ghost', 'data-mode': m, 'aria-pressed': 'false' }, U[`tab_${m}`])));
  form.querySelector('h2').after(tabs);
  tabs.addEventListener('click', e => {
    const b = e.target.closest('[data-mode]');
    if (!b) return;
    E.mode.value = b.dataset.mode;
    form.dispatchEvent(new Event('change', { bubbles: true }));
  });

  // ---- 例のボタン ----
  const ex = el('div', { class: 'fg-ex fg-wide' }, el('span', { class: 'muted' }, U.examples),
    ...EXAMPLES.map((x, i) => el('button', { type: 'button', class: 'btn btn-ghost', 'data-ex': String(i) }, U.ex[i])));
  tabs.after(ex);
  ex.after(el('p', { class: 'muted fg-wide', style: 'font-size:.85rem' }, U.ex_note));
  ex.addEventListener('click', e => {
    const b = e.target.closest('[data-ex]');
    if (!b) return;
    const x = EXAMPLES[Number(b.dataset.ex)];
    for (const [k, v] of Object.entries(x)) if (E[k]) E[k].value = String(v);
    if (x.pp) applyPreset(x.pp);
    form.dispatchEvent(new Event('change', { bubbles: true }));
  });

  // ---- マイナー則のブロックの表(s1..s4・n1..n4) ----
  const rowSet = el('fieldset', { class: 'fg-group' }, el('legend', {}, U.rows_legend));
  const rgrid = el('div', { class: 'fg-rows' });
  rgrid.append(el('span', {}), el('span', { class: 'fg-rh' }, U.col_sa), el('span', { class: 'fg-rh' }, U.col_n));
  for (let i = 1; i <= BLOCKS; i++) rgrid.append(el('span', { class: 'fg-ri' }, String(i)), lab(`s${i}`), lab(`n${i}`));
  rowSet.append(rgrid, el('p', { class: 'muted', style: 'margin:6px 0 0;font-size:.82rem' }, U.rows_help));
  lab('bl').after(rowSet);

  // ---- パリス則のプリセット: 選ぶと C・m を入れる。書き換えたら「自分で入れる」にする ----
  function applyPreset(id) {
    const p = PARIS[id];
    if (!p) return;
    E.pp.value = id;
    E.m.value = String(p.m);
    E.c.value = String(E.cu.value === 'us' ? (p.us ?? Number(cSiToUs(p.c, p.m).toPrecision(3))) : p.c);
  }
  form.addEventListener('change', e => {
    if (e.target === E.pp && E.pp.value !== 'custom') applyPreset(E.pp.value);
    if (e.target === E.cu) {
      const p = PARIS[E.pp.value];
      if (p) applyPreset(E.pp.value);
      else {
        // 自分で入れた C は、単位を切り替えたら m で直す(数をそのまま別の単位として読まない)
        const c = numOf('c'), m = numOf('m');
        if (c > 0 && m > 0) E.c.value = String(Number((E.cu.value === 'us' ? cSiToUs(c, m) : cUsToSi(c, m)).toPrecision(4)));
      }
    }
  });
  form.addEventListener('input', e => { if (['c', 'm'].includes(e.target.name)) E.pp.value = 'custom'; });

  // ---- 表示の切り替え ----
  const SHOW = {
    k: ['geo', 's', 'a', 'kic', 'sy'],
    paris: ['geo', 'smax', 'smin', 'dsm', 'kic', 'a0', 'afm', 'pp', 'cu', 'c', 'm'],
    mean: ['inm', 'su', 'syy', 'se'],
    miner: ['sf', 'bb', 'se2', 'bl'],
  };
  const mode = () => (MODES.includes(E.mode.value) ? E.mode.value : 'k');
  function layout() {
    const m = mode();
    for (const b of tabs.querySelectorAll('[data-mode]')) b.setAttribute('aria-pressed', String(b.dataset.mode === m));
    const on = new Set(SHOW[m]);
    if ((m === 'k' || m === 'paris') && E.geo.value === 'finite') on.add('w');
    if ((m === 'k' || m === 'paris') && E.geo.value === 'custom') on.add('y');
    if (m === 'paris' && E.afm.value === 'set') on.add('af');
    if (m === 'mean') for (const n of E.inm.value === 'am' ? ['sa', 'sm'] : ['mx', 'mn']) on.add(n);
    for (const f of form.querySelectorAll('.dy-field')) {
      const n = f.querySelector('[name]')?.name;
      if (!n || n === 'mode' || /^[sn]\d$/.test(n)) continue;
      f.hidden = !on.has(n);
    }
    rowSet.hidden = m !== 'miner';
    // き裂の長さの欄の名前(中央き裂は半長さ、縁き裂は深さ)
    const half = E.geo.value === 'edge' ? U.a_depth : U.a_half;
    lab('a').querySelector('span').textContent = fill(U.a_lab, { w: half });
    lab('a0').querySelector('span').textContent = fill(U.a0_lab, { w: half });
    lab('c').querySelector('span').textContent = E.cu.value === 'us' ? U.c_us : U.c_si;
  }

  // ---- 結果の部品 ----
  const stats = rows => el('dl', { class: 'dy-stats' }, ...rows.map(([k, v]) => el('div', {}, el('dt', {}, k), el('dd', {}, v))));
  const eq = (...lines) => el('p', { class: 'fg-eq' }, decFix(lines.filter(Boolean).join('\n')));
  const box = (h, ...kids) => el('div', { class: 'fg-box' }, h ? el('h3', {}, h) : null, ...kids);
  const warn = t => el('p', { class: 'fg-warn' }, t);
  const ul = list => el('ul', {}, ...list.map(s => el('li', {}, s)));
  const link = (href, text) => el('a', { href, target: '_blank', rel: 'noopener' }, text);
  const svg = document.getElementById('fg-chart');
  const legend = el('p', { class: 'fg-legend' });
  svg.before(legend);
  const showChart = on => { svg.style.display = on ? '' : 'none'; legend.hidden = !on; if (!on) svg.innerHTML = ''; };
  const legendOf = items => legend.replaceChildren(...items.flatMap(([c, t]) => [el('span', { class: 'fg-key', style: `background:${c}` }), t]));
  const mm = v => (v == null || !Number.isFinite(v) ? '–' : `${sci(v * 1000, 3)} mm`);

  // 形状(W は mm で入れて m に直す)
  function geom() {
    const geo = GEOS.includes(E.geo.value) ? E.geo.value : 'center';
    return { geo, y: numOf('y'), W: numOf('w') / 1000 };
  }
  function geoCheck(g) {
    if (g.geo === 'finite' && !(g.W > 0)) return U.need_w;
    if (g.geo === 'custom' && !(g.y > 0)) return U.need_y;
    return null;
  }
  // Y の式(代入した形)
  function yLine(g, a) {
    if (g.geo === 'center') return 'Y = 1';
    if (g.geo === 'edge') return `Y = ${Y_EDGE}`;
    if (g.geo === 'custom') return `Y = ${inp(g.y)}`;
    const al = (2 * a) / g.W;
    return `α = 2a/W = 2 × ${sci(a * 1000, 4)} / ${inp(g.W * 1000)} = ${fix(al, 4)}\nY = (1 − 0.025α² + 0.06α⁴)·√sec(πα/2) = ${fix(yFinite(a, g.W), 4)}`;
  }

  // 1. 応力拡大係数と限界き裂
  function renderK(res) {
    showChart(false);
    const g = geom(), s = numOf('s'), amm = numOf('a'), kic = numOf('kic'), sy = numOf('sy');
    const gc = geoCheck(g);
    if (gc) { res.append(warn(gc)); return; }
    const a = amm / 1000;
    if (!(s > 0) || !(a > 0)) { res.append(warn(U.need_k)); return; }
    if (g.geo === 'finite' && !(2 * a < g.W)) { res.append(warn(U.a_over_w)); return; }
    const Y = yOf(g, a), K = kOf(g, s, a);
    const hasK = kic > 0;
    const ac = hasK ? critA(g, s, kic) : null, sc = hasK ? critS(g, a, kic) : null;
    res.append(el('p', { class: 'fg-main' }, hasK ? fill(K >= kic ? U.k_main_over : U.k_main, { k: sci(K, 3), r: fix(K / kic, 2), ac: mm(ac), sc: sci(sc, 3) }) : fill(U.k_main_nok, { k: sci(K, 3) })));
    const rows = [['K (MPa√m)', sci(K, 4)], ['Y', fix(Y, 4)]];
    if (hasK) rows.push(['K / K_IC', fix(K / kic, 3)], [U.st_ac, mm(ac)], [U.st_sc, `${sci(sc, 4)} MPa`]);
    res.append(stats(rows));
    const lines = [U.unit_line.replace('{a}', inp(amm)).replace('{am}', sci(a, 4)), yLine(g, a),
      `K = Yσ√(πa) = ${fix(Y, 4)} × ${inp(s)} × √(π × ${sci(a, 4)}) = ${sci(K, 4)} MPa√m`];
    if (hasK) {
      if (yConst(g)) lines.push(`a_c = (1/π)(K_IC/(Yσ))² = (1/π)(${inp(kic)} / (${fix(Y, 4)} × ${inp(s)}))² = ${sci(ac, 4)} m = ${mm(ac)}`);
      else lines.push(`a_c: Y(a_c)·${inp(s)}·√(π·a_c) = ${inp(kic)} → a_c = ${mm(ac)} (Y(a_c) = ${fix(yOf(g, ac), 4)})`);
      lines.push(`σ_c = K_IC / (Y√(πa)) = ${inp(kic)} / (${fix(Y, 4)} × √(π × ${sci(a, 4)})) = ${sci(sc, 4)} MPa`);
    }
    res.append(box(U.h_eq, el('p', {}, U.k_eq_lead), eq(...lines), el('p', { class: 'muted' }, U[`k_note_${g.geo}`])));
    if (g.geo === 'finite') {
      const yf = yFeddersen(a, g.W), net = (s * g.W) / (g.W - 2 * a);
      res.append(box(U.h_finite, eq(`√sec(πa/W) = ${fix(yf, 4)}   (${fill(U.diff, { d: fix(((yf - Y) / Y) * 100, 2) })})`,
        `σ_net = σ·W/(W − 2a) = ${inp(s)} × ${inp(g.W * 1000)} / (${inp(g.W * 1000)} − ${sci(2 * a * 1000, 4)}) = ${sci(net, 4)} MPa`),
        el('p', { class: 'muted' }, U.finite_note), sy > 0 && net >= sy ? warn(fill(U.net_yield, { n: sci(net, 3), sy: inp(sy) })) : null));
    }
    // 線形破壊力学の目安
    if (sy > 0) {
      const ry = plasticZone(K, sy), b399 = hasK ? e399Size(kic, sy) : null;
      const l = [`r_y = (1/2π)(K/σ_y)² = (1/2π)(${sci(K, 4)} / ${inp(sy)})² = ${mm(ry)}   (r_y/a = ${fix(ry / a, 3)})`,
        `2r_y = (1/π)(K/σ_y)² = ${mm(2 * ry)}`];
      if (b399 != null) l.push(`2.5(K_IC/σ_y)² = 2.5 × (${inp(kic)} / ${inp(sy)})² = ${mm(b399)}`);
      res.append(box(U.h_lefm, eq(...l), el('p', { class: 'muted' }, U.lefm_note),
        hasK && sc >= sy ? warn(fill(U.ybf, { sc: sci(sc, 3), sy: inp(sy) })) : null,
        s >= sy ? warn(U.s_over_sy) : null));
    } else res.append(box(U.h_lefm, el('p', { class: 'muted' }, U.lefm_need_sy)));
    res.append(box(U.h_caution, ul(U.k_cautions)));
  }

  // 2. パリス則
  function renderParis(res) {
    const g = geom(), smax = numOf('smax'), smin0 = numOf('smin'), kic = numOf('kic');
    const smin = Number.isFinite(smin0) ? smin0 : 0;
    const gc = geoCheck(g);
    if (gc) { showChart(false); res.append(warn(gc)); return; }
    const ds = deltaS(smax, smin, E.dsm.value);
    if (ds == null) { showChart(false); res.append(warn(U.need_s)); return; }
    const a0 = numOf('a0') / 1000;
    const cin = numOf('c'), m = numOf('m');
    const us = E.cu.value === 'us';
    const C = us ? cUsToSi(cin, m) : cin;
    if (!(a0 > 0)) { showChart(false); res.append(warn(U.need_a0)); return; }
    if (!(C > 0) || !(m > 0)) { showChart(false); res.append(warn(U.need_cm)); return; }
    if (g.geo === 'finite' && !(2 * a0 < g.W)) { showChart(false); res.append(warn(U.a_over_w)); return; }
    const ac = kic > 0 ? critA(g, smax, kic) : null;
    let af, why = null;
    if (E.afm.value === 'set') {
      af = numOf('af') / 1000;
      if (!(af > 0)) { showChart(false); res.append(warn(U.need_af)); return; }
      if (ac != null && af > ac) { why = fill(U.af_capped, { af: mm(af), ac: mm(ac) }); af = ac; }
      if (g.geo === 'finite' && !(2 * af < g.W)) { showChart(false); res.append(warn(U.a_over_w)); return; }
    } else {
      if (ac == null) { showChart(false); res.append(warn(U.need_kic)); return; }
      af = ac;
    }
    const R = smin / smax;
    if (!(af > a0)) {
      showChart(false);
      // 自分で決めた a_f が a₀ 以下(a_c で切り詰めたのでないとき)は、不安定破壊ではなく入力の問題
      const own = E.afm.value === 'set' && !why;
      res.append(el('p', { class: 'fg-main' }, own ? fill(U.paris_none_af, { af: mm(af), a0: mm(a0) }) : fill(U.paris_none, { a0: mm(a0), ac: mm(ac ?? af) })));
      res.append(stats([[U.st_n, '0'], [U.st_ac, mm(ac)], ['R', fix(R, 3)]]));
      res.append(box(U.h_caution, ul(U.paris_cautions)));
      return;
    }
    const Nnum = lifeNumeric(g, a0, af, ds, C, m);
    const Ncl = yConst(g) ? lifeClosed(a0, af, ds, C, m, yOf(g, a0)) : null;
    const N = Ncl ?? Nnum;
    const dK0 = kOf(g, ds, a0), dKf = kOf(g, ds, af);
    res.append(el('p', { class: 'fg-main' }, fill(U.paris_main, { n: cyc(N), a0: mm(a0), af: mm(af) })));
    res.append(stats([[U.st_n, cyc(N)], [U.st_af, mm(af)], ['Δσ (MPa)', sci(ds, 4)], ['R = σ_min/σ_max', fix(R, 3)],
      [U.st_dk0, sci(dK0, 3)], [U.st_dkf, sci(dKf, 3)], ['da/dN (a₀)', `${sci(C * dK0 ** m, 3)} m`]]));
    if (why) res.append(warn(why));
    if (ac != null && E.afm.value === 'set') res.append(el('p', { class: 'muted' }, fill(U.ac_ref, { ac: mm(ac) })));
    // 式と代入
    const Y0 = yOf(g, a0);
    const lines = [fill(U.unit_line2, { a0: inp(a0 * 1000), a0m: sci(a0, 4), af: sci(af * 1000, 4), afm: sci(af, 4) })];
    if (us) lines.push(`C = ${inp(cin)} × 0.0254 / (${fix(KSIIN_MPAM, 4)})^${inp(m)} = ${sci(C, 4)} m/cycle (MPa√m)   m = ${inp(m)}`);
    else lines.push(`C = ${inp(cin)} m/cycle (MPa√m)   m = ${inp(m)}`);
    lines.push(smin < 0 && E.dsm.value === 'pos' ? `σ_min = ${inp(smin)} < 0 → Δσ = σ_max = ${inp(ds)} MPa` : `Δσ = σ_max − σ_min = ${inp(smax)} − ${inp(smin)} = ${inp(ds)} MPa`);
    if (kic > 0) {
      if (yConst(g)) lines.push(`a_c = (1/π)(K_IC/(Yσ_max))² = (1/π)(${inp(kic)} / (${fix(Y0, 4)} × ${inp(smax)}))² = ${mm(ac)}`);
      else lines.push(`a_c: Y(a_c)·σ_max·√(π·a_c) = K_IC → a_c = ${mm(ac)}`);
    }
    lines.push(`ΔK = YΔσ√(πa): a₀ → ${sci(dK0, 4)}, a_f → ${sci(dKf, 4)} MPa√m`);
    if (yConst(g)) {
      if (Math.abs(m - 2) < 1e-12) lines.push(`N = ln(a_f/a₀) / (C(YΔσ)²π) = ln(${sci(af, 4)}/${sci(a0, 4)}) / (${sci(C, 4)} × (${fix(Y0, 4)} × ${inp(ds)})² × π) = ${cyc(Ncl, 4)}`);
      else lines.push(`N = [a_f^(1−m/2) − a₀^(1−m/2)] / [C(YΔσ√π)^m(1 − m/2)]`,
        `  = [${sci(af, 4)}^(${fix(1 - m / 2, 3)}) − ${sci(a0, 4)}^(${fix(1 - m / 2, 3)})] / [${sci(C, 4)} × (${fix(Y0, 4)} × ${inp(ds)} × √π)^${inp(m)} × (${fix(1 - m / 2, 3)})] = ${cyc(Ncl, 4)}`);
      lines.push(fill(U.num_check, { n: cyc(Nnum, 6), c: cyc(Ncl, 6), d: sci(Math.abs(Nnum - Ncl) / Ncl, 2) }));
    } else {
      lines.push(`N = ∫ da / (C(Y(a)Δσ√(πa))^m)  (a₀ → a_f)`, fill(U.num_line, { n: cyc(Nnum, 4) }));
      const Nc = lifeNumeric(g, a0, af, ds, C, m, 500);
      lines.push(fill(U.num_conv, { n1: cyc(Nc, 6), n2: cyc(Nnum, 6) }));
    }
    res.append(box(U.h_eq, el('p', {}, U.paris_eq_lead), eq(...lines), el('p', { class: 'muted' }, U.paris_eq_note)));
    // a₀ の影響
    const tbl = [0.5, 1, 2].map(f => {
      const a = a0 * f;
      const n = a < af ? (yConst(g) ? lifeClosed(a, af, ds, C, m, Y0) : lifeNumeric(g, a, af, ds, C, m)) : 0;
      return [a, n];
    });
    res.append(box(U.h_a0, el('p', {}, U.a0_lead), el('div', { class: 'fg-tbl-wrap' }, el('table', { class: 'fg-tbl' },
      el('thead', {}, el('tr', {}, ...U.a0_cols.map(c => el('th', { scope: 'col' }, c)))),
      el('tbody', {}, ...tbl.map(([a, n], i) => el('tr', { class: i === 1 ? 'fg-on' : null }, el('td', { class: 'fg-num' }, mm(a)), el('td', { class: 'fg-num' }, cyc(n)), el('td', { class: 'fg-num' }, fix(n / N, 2)))))))));
    // a–N 曲線
    const pts = aNCurve(g, a0, af, ds, C, m);
    const k = N / pts[pts.length - 1][0]; // 台形則の累積を、主の結果の N にそろえる(差はわずか)
    showChart(true);
    legendOf([['var(--accent)', U.lg_an], ['var(--muted)', U.lg_ac]]);
    lineChart(svg, {
      series: [{ points: pts.map(([n, a]) => [n * k, a * 1000]), cls: 'ac' }, ...(ac != null ? [{ points: [[0, ac * 1000], [N, ac * 1000]], cls: 'dash' }] : [])],
      marks: [[N, af * 1000, cyc(N)]], xlabel: U.x_n, ylabel: U.y_a, ymin: 0,
    });
    res.append(box(U.h_caution, ul(U.paris_cautions)));
  }

  // 3. 平均応力の補正
  function renderMean(res) {
    let sa, sm, smax, smin;
    if (E.inm.value === 'am') { sa = numOf('sa'); sm = numOf('sm'); smax = sm + sa; smin = sm - sa; }
    else { smax = numOf('mx'); smin = numOf('mn'); if (smin > smax) { showChart(false); res.append(warn(U.min_over_max)); return; } ({ sa, sm } = ampMean(smax, smin)); }
    const su = numOf('su'), sy = numOf('syy'), se = numOf('se');
    if (!(sa >= 0) || !Number.isFinite(sm)) { showChart(false); res.append(warn(U.need_mean)); return; }
    if (!(su > 0)) { showChart(false); res.append(warn(U.need_su)); return; }
    const r = meanStress(sa, sm, su, sy);
    const R = smax !== 0 ? smin / smax : null;
    const hasE = se > 0;
    const ok = v => (hasE && Number.isFinite(v) ? (v <= se ? U.ok_in : U.ok_out) : '');
    res.append(el('p', { class: 'fg-main' }, fill(hasE ? U.mean_main : U.mean_main_noe, { g: sci(r.goodman, 3), se: inp(se), j: r.goodman <= se ? U.ok_in : U.ok_out })));
    res.append(stats([['σ_a (MPa)', sci(sa, 4)], ['σ_m (MPa)', sci(sm, 4)], ['σ_max / σ_min', `${sci(smax, 4)} / ${sci(smin, 4)}`], ['R', R == null ? '–' : fix(R, 3)], ['Δσ (MPa)', sci(2 * sa, 4)]]));
    // 表: 補正ごとの σ_ar
    const meth = [['goodman', r.goodman], ['gerber', r.gerber], ['soderberg', r.soderberg], ['swt', r.swt]];
    res.append(box(U.h_mean_tbl, el('div', { class: 'fg-tbl-wrap' }, el('table', { class: 'fg-tbl' },
      el('thead', {}, el('tr', {}, ...U.mean_cols.map(c => el('th', { scope: 'col' }, c)))),
      el('tbody', {}, ...meth.map(([k, v]) => el('tr', { class: k === 'goodman' ? 'fg-on' : null }, el('th', { scope: 'row' }, U[`m_${k}`]),
        el('td', { class: 'fg-num' }, v == null ? '–' : sci(v, 4)), el('td', { class: 'fg-num' }, hasE && Number.isFinite(v) ? fix(se / v, 2) : '–'), el('td', {}, v == null ? U[`m_${k}_na`] : ok(v))))))),
      hasE ? el('p', { class: 'muted' }, fill(U.goodman_n, { n: fix(goodmanN(sa, sm, se, su), 2) })) : null));
    const cut = sm > 0 ? sm : 0;
    const lines = [`σ_a = (σ_max − σ_min)/2 = ${sci(sa, 4)} MPa   σ_m = (σ_max + σ_min)/2 = ${sci(sm, 4)} MPa`];
    if (sm < 0) lines.push(U.neg_mean_line);
    lines.push(`${U.m_goodman}: σ_ar = σ_a / (1 − σ_m/σ_u) = ${sci(sa, 4)} / (1 − ${sci(cut, 4)}/${inp(su)}) = ${sci(r.goodman, 4)} MPa`);
    lines.push(`${U.m_gerber}: σ_ar = σ_a / (1 − (σ_m/σ_u)²) = ${sci(sa, 4)} / (1 − (${sci(sm, 4)}/${inp(su)})²) = ${sci(r.gerber, 4)} MPa`);
    if (r.soderberg != null) lines.push(`${U.m_soderberg}: σ_ar = σ_a / (1 − σ_m/σ_y) = ${sci(sa, 4)} / (1 − ${sci(cut, 4)}/${inp(sy)}) = ${sci(r.soderberg, 4)} MPa`);
    if (r.swt != null) lines.push(`SWT: σ_ar = √(σ_max·σ_a) = √(${sci(smax, 4)} × ${sci(sa, 4)}) = ${sci(r.swt, 4)} MPa`);
    res.append(box(U.h_eq, el('p', {}, U.mean_eq_lead), eq(...lines), el('p', { class: 'muted' }, U.mean_eq_note)));
    if (sy > 0 && smax > sy) res.append(warn(fill(U.yield_warn, { mx: sci(smax, 3), sy: inp(sy) })));
    if (sm >= su) res.append(warn(U.sm_over_su));
    // 線図(横 σ_m、縦 σ_a)
    if (hasE) {
      const xs = []; for (let i = 0; i <= 60; i++) xs.push((su * i) / 60);
      const ser = [{ points: [[0, se], [su, 0]], cls: 'ac' }, { points: xs.map(x => [x, se * (1 - (x / su) ** 2)]), cls: 'ac2' }];
      if (sy > 0) ser.push({ points: [[0, se], [sy, 0]], cls: 'dash' }, { points: [[0, sy], [sy, 0]], cls: 'ng' });
      showChart(true);
      legendOf([['var(--accent)', U.m_goodman], ['var(--ok)', U.m_gerber], ...(sy > 0 ? [['var(--muted)', U.m_soderberg], ['var(--ng)', U.lg_yield]] : [])]);
      lineChart(svg, { series: ser, marks: [[Math.max(sm, 0), sa, `(${sci(sm, 3)}, ${sci(sa, 3)})`]], xlabel: U.x_sm, ylabel: U.y_sa, ymin: 0 });
      if (sm < 0) res.append(el('p', { class: 'muted' }, U.neg_mean_chart));
    } else showChart(false);
    res.append(box(U.h_caution, ul(U.mean_cautions)));
  }

  // 4. S–N 曲線とマイナー則
  function renderMiner(res) {
    const sf = numOf('sf'), b = numOf('bb'), se = numOf('se2'), bl = E.bl.value;
    if (!(sf > 0) || !(b < 0)) { showChart(false); res.append(warn(U.need_basquin)); return; }
    const rows = [];
    let partial = false;
    for (let i = 1; i <= BLOCKS; i++) {
      const s = numOf(`s${i}`), n = numOf(`n${i}`);
      if (Number.isFinite(s) !== Number.isFinite(n)) partial = true;
      if (s > 0 && n >= 0) rows.push({ i, sa: s, n });
    }
    if (!rows.length) { showChart(false); res.append(warn(U.need_blocks)); return; }
    const r = miner(rows, sf, b, se, bl);
    res.append(el('p', { class: 'fg-main' }, fill(r.D >= 1 ? U.miner_main_over : U.miner_main, { d: fix(r.D, 3), r: r.repeats === Infinity ? '∞' : sci(r.repeats, 3) })));
    res.append(stats([['D = Σnᵢ/Nᵢ', fix(r.D, 4)], [U.st_rep, r.repeats === Infinity ? '∞' : sci(r.repeats, 3)], [U.st_ne, se > 0 ? cyc(basquinN(se, sf, b)) : '–']]));
    if (partial) res.append(warn(U.row_incomplete));
    res.append(box(U.h_blocks, el('div', { class: 'fg-tbl-wrap' }, el('table', { class: 'fg-tbl' },
      el('thead', {}, el('tr', {}, ...U.block_cols.map(c => el('th', { scope: 'col' }, c)))),
      el('tbody', {}, ...r.rows.map(x => el('tr', {}, el('td', { class: 'fg-num' }, String(x.i)), el('td', { class: 'fg-num' }, inp(x.sa)), el('td', { class: 'fg-num' }, cyc(x.n)),
        el('td', { class: 'fg-num' }, cyc(x.N)), el('td', { class: 'fg-num' }, fix(x.d, 4)), el('td', {}, x.below ? (bl === 'skip' ? U.below_skip : U.below_ext) : ''))))))));
    const x0 = r.rows[0];
    const lines = [`N_f = ½(σ_a/σ_f′)^(1/b)`, `${U.block} 1: N₁ = ½ × (${inp(x0.sa)} / ${inp(sf)})^(1/${inp(b)}) = ${cyc(x0.N, 4)}${x0.below && bl === 'skip' ? ` (${U.below_skip})` : ''}`,
      `D = ${r.rows.map(x => (x.N === Infinity ? '0' : `${cyc(x.n)}/${cyc(x.N)}`)).join(' + ')} = ${fix(r.D, 4)}`,
      r.D > 0 ? `1/D = ${sci(r.repeats, 4)}` : null];
    res.append(box(U.h_eq, el('p', {}, U.miner_eq_lead), eq(...lines), el('p', { class: 'muted' }, bl === 'skip' ? U.bl_note_skip : U.bl_note_ext)));
    // S–N 曲線(両対数)
    const Ns = []; for (let e = 2; e <= 8.001; e += 0.1) Ns.push(10 ** e);
    const ser = [{ points: Ns.map(N => [N, basquinS(N, sf, b)]), cls: 'ac' }];
    if (se > 0) {
      const Ne = basquinN(se, sf, b);
      if (bl === 'skip') ser[0].points = Ns.filter(N => N <= Ne).map(N => [N, basquinS(N, sf, b)]).concat([[Ne, se], [1e8, se]]);
      ser.push({ points: [[1e2, se], [1e8, se]], cls: 'dash' });
    }
    showChart(true);
    legendOf([['var(--accent)', U.lg_sn], ['var(--muted)', U.lg_se], ['var(--ng)', U.lg_blocks]]);
    lineChart(svg, {
      series: ser, xlog: true, ylog: true,
      marks: r.rows.filter(x => Number.isFinite(x.N) && x.N >= 1e2 && x.N <= 1e8).map(x => [x.N, x.sa, String(x.i)]),
      xlabel: U.x_nf, ylabel: U.y_sa,
    });
    res.append(box(U.h_caution, ul(U.miner_cautions)));
  }

  // パリス則のプリセットの表
  function presetTable() {
    const rows = Object.entries(PARIS).map(([id, p]) => el('tr', { class: id === E.pp.value ? 'fg-on' : null },
      el('th', { scope: 'row' }, U[`pp_${id}`]),
      el('td', { class: 'fg-num' }, link(SRC[p.src], sci(p.c, 3))),
      el('td', { class: 'fg-num' }, inp(p.m)),
      el('td', { class: 'fg-num' }, p.us != null ? inp(p.us) : '–'),
      el('td', { class: 'fg-num' }, p.us != null ? sci(cUsToSi(p.us, p.m), 3) : '–')));
    return el('div', {},
      el('p', { class: 'muted' }, U.preset_lead),
      el('div', { class: 'fg-tbl-wrap' }, el('table', { class: 'fg-tbl fg-preset' },
        el('thead', {}, el('tr', {}, ...U.preset_cols.map(c => el('th', { scope: 'col' }, c)))),
        el('tbody', {}, ...rows))),
      el('ul', { style: 'font-size:.82rem;line-height:1.7;padding-left:1.3em' }, ...U.preset_notes.map(s => el('li', {}, s))),
      el('p', { class: 'muted' }, U.src_h, ' ', link(SRC.norton, 'Norton, Machine Design 6th ed., Table 6-2 (Barsom)'), ' · ',
        link(SRC.kinser, 'Kinser et al., Int. J. Metalcasting (2026)'), ' · ', link(SRC.omae, 'Amirafshari & Stacey, OMAE2019 (BS 7910)')));
  }
  function srcList(m) {
    const L = {
      k: [['gross', 'Gross & Seelig, Table 4.1 (TUNI RAK-33060)'], ['isu', 'ISU ME 325 LEFM'], ['e399', 'ASTM E399-90 (1997) 7.1'], ['irwin', 'Irwin plastic zone (Wang, DSTO)']],
      paris: [['norton', 'Norton (ΔK, Kmin < 0)'], ['roylance', 'Roylance, MIT (2001)'], ['gross', 'Gross & Seelig, Table 4.1']],
      mean: [['iitm', 'IIT Madras ME2200'], ['altair', 'Altair HyperLife'], ['swt', 'SWT (Mater. Tehnol. 54, 2020)']],
      miner: [['roylance', 'Roylance, MIT (2001)'], ['hardrath', 'Hardrath, NASA (1965)'], ['altair', 'Altair HyperLife']],
    }[m];
    return el('p', { class: 'muted' }, U.src_h, ' ', ...L.flatMap(([k, t], i) => [i ? ' · ' : '', link(SRC[k], t)]));
  }

  function render() {
    layout();
    const res = out('res');
    res.replaceChildren();
    const m = mode();
    if (m === 'k') renderK(res); else if (m === 'paris') renderParis(res); else if (m === 'mean') renderMean(res); else renderMiner(res);
    res.append(srcList(m));
    const F = { k: 'stress-intensity', paris: 'paris', mean: 'goodman', miner: 'miner' }[m];
    res.append(el('div', { class: 'fg-links' },
      el('a', { class: 'btn btn-ghost', href: `${home}formulas/#f-${F}` }, U.l_formula),
      ...(U.l_learn ? [el('a', { class: 'btn btn-ghost', href: `${home}learn/why-metals-fatigue/` }, U.l_learn)] : []),
      el('a', { class: 'btn btn-ghost', href: `${home}failure/` }, U.l_failure),
      el('a', { class: 'btn btn-ghost', href: `${home}tools/tensile-test-analyzer/` }, U.l_tensile),
      ...(m === 'k' ? [el('a', { class: 'btn btn-ghost', href: `${home}drill/?t=kic-crack` }, U.l_drill)] : [])));
    const pbox = out('presets');
    pbox.replaceChildren(presetTable());
    pbox.closest('section')?.querySelectorAll('h3').forEach(h => { if (h.nextElementSibling === pbox) h.hidden = m !== 'paris'; });
    pbox.hidden = m !== 'paris';
  }
  form.addEventListener('submit', e => e.preventDefault());
  form.addEventListener('input', () => setTimeout(render));
  form.addEventListener('change', () => setTimeout(render));
  render();
}
