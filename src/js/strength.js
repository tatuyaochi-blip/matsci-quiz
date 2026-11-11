// 強化機構の計算ラボ。次を計算して、式に値を代入した形とグラフを見せる。
//   1. 結晶粒の微細化(ホール・ペッチ): σy = σ₀ + k·d^(−1/2)。d と k の単位を換算してから代入する
//   2. 転位強化(テイラーの式): Δσ = M·α·G·b·√ρ(Δτ = α·G·b·√ρ に テイラー因子 M を掛ける)
//   3. 析出・分散強化: オロワンの基本形 Δτ = Gb/L(L の定義を選ぶ)と、オロワン・アシュビーの式
//      Δτ = 0.4·G·b·ln(2r̄/b)/(π·λ·√(1 − ν))(λ はすべり面の上の面と面の間隔、r̄ = πr/4 は切り口の平均の半径)。
//      切断は規則相の粒子の形(Brown・Ham の弱く結合した転位の対)を1つだけ: Δτ = (γ/2b)[√(3π²γfr/(32T)) − f]、T = Gb²/2。
//      切断とオロワンの交点(臨界半径)を二分法で求める
//   4. 固溶強化: Δσ = k·cⁿ(n = 1/2 または 2/3。k は利用者が入れる)
//   5. 重ね合わせ: 線形 σ₀ + ΣΔσᵢ、二乗和 σ₀ + √(ΣΔσᵢ²)、混ぜ方 σ₀ + Δσ_ss + Δσ_gb + √(Δσ_dis² + Δσ_ppt²)、
//      べき σ₀ + (ΣΔσᵢ^q)^(1/q)
// 応力は MPa(内部の計算も MPa。G は GPa で入れて MPa に直す)、長さは m に直してから代入する。
// 式の出典は data/tools/strength.json の text.{言語}.js.ui の src_* と、review の check/sources.md。
// 計算の関数(toM・kToSI・rhoToSI・gpaToMpa・hallPetch・taylor・spacing・orowan・ashbyOrowan・brownHam・crossover・
// solid・combine・burgers)は DOM なしで import できる(検算: review の check/calc_strength.py と check/js_results.mjs)。
import { lineChart } from './chart.js';

const ok = (...v) => v.every(Number.isFinite);

// =====================================================================
// 単位の換算
// =====================================================================
export const LEN = { m: 1, mm: 1e-3, um: 1e-6, nm: 1e-9 };
// 長さを m に
export const toM = (v, u = 'm') => (Number.isFinite(v) && LEN[u] ? v * LEN[u] : NaN);
// ホール・ペッチ係数を MPa·m^(1/2) に。MPa·mm^(1/2) は ×√10⁻³、MPa·µm^(1/2) は ×10⁻³
export const kToSI = (k, u = 'm') => (Number.isFinite(k) && LEN[u] ? k * Math.sqrt(LEN[u]) : NaN);
// 転位密度を m⁻² に(cm⁻² は ×10⁴)
export const RHO = { m2: 1, cm2: 1e4 };
export const rhoToSI = (r, u = 'm2') => (Number.isFinite(r) && RHO[u] ? r * RHO[u] : NaN);
export const gpaToMpa = g => (Number.isFinite(g) ? g * 1e3 : NaN);
export const nmToM = v => toM(v, 'nm');

// バーガースベクトルの大きさ(完全転位): FCC a/√2(a/2⟨110⟩)、BCC √3a/2(a/2⟨111⟩)
export const burgers = (a, st) => (a > 0 ? (st === 'bcc' ? (Math.sqrt(3) * a) / 2 : st === 'fcc' ? a / Math.SQRT2 : NaN) : NaN);

// 材料の値。G は WebElements の剛性率(Wikipedia「Elastic properties of the elements」の WEL の行)、ν は data/materials.json、
// a は data/materials.json の格子定数(ASM、25 ℃)、M は Stoller・Zinkle(2000)の 3.06(FCC と {110} すべりの BCC)
export const MATS = {
  fe: { G: 82, a: 0.28665, st: 'bcc', nu: 0.29, M: 3.06 },
  al: { G: 26, a: 0.40496, st: 'fcc', nu: 0.35, M: 3.06 },
  cu: { G: 48, a: 0.36146, st: 'fcc', nu: 0.34, M: 3.06 },
  ni: { G: 76, a: 0.3524, st: 'fcc', nu: 0.31, M: 3.06 },
};
export const matB = id => Number(burgers(MATS[id].a, MATS[id].st).toFixed(4)); // nm、4 桁に丸めて欄に入れる
// ホール・ペッチの σ₀(MPa)と k(MPa·m^(1/2))。Cordero・Knight・Schuh(2016)の表 1 の純金属の当てはめ(k は MPa·µm^(1/2) の表を換算)
export const HPM = { fe: { s0: 130, k: 0.31 }, ni: { s0: 80, k: 0.23 }, cu: { s0: 40, k: 0.11 }, al: { s0: 10, k: 0.09 } };

// =====================================================================
// 1. ホール・ペッチ(σ₀ は MPa、k は MPa·m^(1/2)、d は m)。d → ∞ で粒界の項は 0
// =====================================================================
export function hallPetch(s0, k, d) {
  if (!ok(k) || !(d > 0)) return null;
  const gb = d === Infinity ? 0 : k / Math.sqrt(d);
  return { gb, sy: Number.isFinite(s0) ? s0 + gb : NaN };
}

// =====================================================================
// 2. テイラーの式(G は MPa、b は m、ρ は m⁻²)。ρ = 0 で 0
// =====================================================================
export function taylor(M, alpha, G, b, rho) {
  if (!ok(alpha, G, b, rho) || rho < 0 || !(G > 0) || !(b > 0)) return null;
  const tau = alpha * G * b * Math.sqrt(rho);
  return { tau, sig: Number.isFinite(M) ? M * tau : NaN };
}

// =====================================================================
// 3. 析出・分散強化(r・L は m、f は 0〜1、G は MPa)
// =====================================================================
// 粒子の間隔。def: 'c3'(粒子1個が一辺 L の立方体を占めるとした中心の間隔 L = [4πr³/(3f)]^(1/3))、
// 'e3'(その面と面の間隔 L − 2r)、'e2'(すべり面の上の正方形の並びの面と面の間隔 λ = (√(π/f) − 2)·r̄、r̄ = πr/4)。
// f = 0 なら ∞。間隔が 0 以下になる f(粒子どうしが重なる)では NaN
export const RBAR = Math.PI / 4; // 同じ大きさの球を勝手な面で切ったときの切り口の平均の半径 r̄ = (π/4)r
export function spacing(def, r, f) {
  if (!(r > 0) || !Number.isFinite(f) || f < 0 || f >= 1) return NaN;
  if (f === 0) return Infinity;
  const c3 = Math.cbrt((4 * Math.PI) / (3 * f)) * r;
  const v = def === 'c3' ? c3 : def === 'e3' ? c3 - 2 * r : def === 'e2' ? (Math.sqrt(Math.PI / f) - 2) * RBAR * r : NaN;
  return v > 0 ? v : NaN;
}
// オロワンの基本形 Δτ = Gb/L
export const orowan = (G, b, L) => (ok(G, b) && G > 0 && b > 0 && L > 0 ? (L === Infinity ? 0 : (G * b) / L) : NaN);
// オロワン・アシュビーの式 Δτ = 0.4·G·b·ln(2r̄/b)/(π·λ·√(1 − ν))、λ = (√(π/f) − 2)r̄、r̄ = πr/4。2r̄ ≤ b では NaN
export function ashbyOrowan(G, b, nu, r, f) {
  if (!ok(G, b, nu, r, f) || !(G > 0) || !(b > 0) || !(nu >= 0 && nu < 0.5) || !(r > 0)) return NaN;
  if (f === 0) return 0;
  const rb = RBAR * r, lam = spacing('e2', r, f);
  if (!(lam > 0) || !(2 * rb > b)) return NaN;
  return (0.4 * G * b * Math.log((2 * rb) / b)) / (Math.PI * lam * Math.sqrt(1 - nu));
}
// 規則相の切断(Brown・Ham、弱く結合した転位の対): Δτ = (γ/2b)[√(3π²γfr/(32T)) − f]、T = Gb²/2。
// γ は逆位相境界のエネルギー(J/m²)、r は球の半径(m)。負になる小さな r では 0
export function brownHam(gam, G, b, r, f) {
  if (!ok(gam, G, b, r, f) || !(gam > 0) || !(G > 0) || !(b > 0) || !(r > 0) || f < 0 || f >= 1) return NaN;
  const T = (G * 1e6 * b * b) / 2; // N(G を Pa に)
  const v = ((gam / (2 * b)) * (Math.sqrt((3 * Math.PI ** 2 * gam * f * r) / (32 * T)) - f)) / 1e6; // MPa
  return Math.max(v, 0);
}
// 切断(r とともに増える)とオロワン(r とともに減る)の交点。fa(r) − fb(r) の符号が変わる r を ln r の二分法で。
// 区間 [lo, hi](m)で交わらなければ null
export function crossover(fa, fb, lo = 0.3e-9, hi = 2e-6) {
  const g = r => fa(r) - fb(r);
  const grid = Array.from({ length: 241 }, (_, i) => lo * (hi / lo) ** (i / 240));
  for (let i = 1; i < grid.length; i++) {
    const a = grid[i - 1], c = grid[i], ga = g(a), gc = g(c);
    if (!ok(ga, gc)) continue;
    if (ga === 0) return { r: a, tau: fa(a) };
    if (ga < 0 && gc >= 0 || ga > 0 && gc <= 0) {
      let x = Math.log(a), y = Math.log(c);
      for (let k = 0; k < 100; k++) { const m = (x + y) / 2, gm = g(Math.exp(m)); if ((gm < 0) === (ga < 0)) x = m; else y = m; }
      const r = Math.exp((x + y) / 2);
      return { r, tau: fa(r) };
    }
  }
  return null;
}

// =====================================================================
// 4. 固溶強化 Δσ = k·cⁿ(c ≥ 0。c = 0 で 0)
// =====================================================================
export const SSN = { h: 1 / 2, t: 2 / 3 };
export const solid = (k, c, n) => (ok(k, c, n) && c >= 0 ? k * c ** n : NaN);

// =====================================================================
// 5. 重ね合わせ(MPa)。p: { ss, gb, dis, ppt }(空は 0)。method: 'lin'・'rss'・'mix'・'pow'(q は 1〜2 ほど)
// 返り値の segs は図の積み上げの内訳: 二乗和・べきの部分は Δσᵢ² や Δσᵢ^q の比で分けて描く(図のための分け方)
// =====================================================================
export const PARTS = ['ss', 'gb', 'dis', 'ppt'];
export function combine(s0, p, method, q = 2) {
  if (!Number.isFinite(s0)) return null;
  const v = Object.fromEntries(PARTS.map(k => [k, Number.isFinite(p[k]) ? p[k] : 0]));
  if (PARTS.some(k => v[k] < 0)) return null;
  const pw = (keys, e) => {
    const s = keys.reduce((a, k) => a + v[k] ** e, 0);
    const tot = s > 0 ? s ** (1 / e) : 0;
    return { tot, segs: Object.fromEntries(keys.map(k => [k, s > 0 ? (tot * v[k] ** e) / s : 0])) };
  };
  let add, segs;
  if (method === 'lin') { add = PARTS.reduce((a, k) => a + v[k], 0); segs = { ...v }; }
  else if (method === 'rss') { const x = pw(PARTS, 2); add = x.tot; segs = x.segs; }
  else if (method === 'mix') { const x = pw(['dis', 'ppt'], 2); add = v.ss + v.gb + x.tot; segs = { ss: v.ss, gb: v.gb, ...x.segs }; }
  else if (method === 'pow') { if (!(q > 0)) return null; const x = pw(PARTS, q); add = x.tot; segs = x.segs; }
  else return null;
  return { total: s0 + add, add, segs };
}

// 例(値は計算のしかたを示すために作ったもの。実在の材料の測定データではない)
const matVals = id => ({ mat: id, G: MATS[id].G, b: matB(id), nu: MATS[id].nu, M: MATS[id].M });
export const EXAMPLES = [
  { mode: 'hp', hmat: 'custom', hs0: 70, hk: 0.74, hku: 'm', hd1: 50, hd2: 5, hdu: 'um' },
  { mode: 'dis', ...matVals('cu'), dal: 0.3, dr1: '1e12', dr2: '1e15', dru: 'm2' },
  { mode: 'ppt', ...matVals('al'), pform: 'ashby', pdef: 'e2', pr: 10, pf: 3, pl: '', pg: '' },
  { mode: 'ss', sk: 30, sn: 'h', sc: 1, sc2: 4, scu: 'at' },
  { mode: 'sum', s0: 50, xss: 40, xgb: 150, xdis: 120, xppt: 180, comb: 'lin', sq: 1.5 },
  { mode: 'ppt', ...matVals('ni'), pform: 'basic', pdef: 'c3', pr: 20, pf: 10, pl: '', pg: 0.1 },
];

// =====================================================================
// 画面(ブラウザのときだけ)
// =====================================================================
const form = typeof document !== 'undefined' ? document.getElementById('strength-form') : null;
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
  const nfmax = d => new Intl.NumberFormat(lang, { maximumFractionDigits: d, useGrouping: false });
  const nfsigmax = sig => new Intl.NumberFormat(lang, { maximumSignificantDigits: sig, useGrouping: false });
  const minus = t => t.replace(/^-/, '−');
  // a×10ⁿ(仮数は有効数字 sig 桁まで、末尾の 0 は省く。1×10¹⁴ の形)
  const expo = (v, sig = 3) => {
    const [m, e] = v.toExponential(sig - 1).split('e');
    const mm = Number(m);
    return `${mm === 1 ? '1' : minus(nfsigmax(sig).format(mm))}×10${String(Number(e)).replace(/./g, ch => SUP[ch])}`;
  };
  // 有効数字 sig 桁。0.001 未満と 10⁶ 以上は a×10ⁿ
  const sci = (v, sig = 3) => {
    if (v === Infinity) return '∞';
    if (v == null || !Number.isFinite(v)) return '–';
    if (v === 0) return '0';
    const a = Math.abs(v);
    if (a >= 1e-3 && a < 1e6) return minus(nfsig(sig).format(v));
    return minus(expo(v, sig));
  };
  const fix = (v, d) => (v === Infinity ? '∞' : v == null || !Number.isFinite(v) ? '–' : minus(nfmax(d).format(Object.is(Number(v.toFixed(d)), -0) ? 0 : v)));
  const inp = v => (v === Infinity ? '∞' : Number.isFinite(v) ? (v !== 0 && (Math.abs(v) >= 1e6 || Math.abs(v) < 1e-3) ? expo(v, 6) : minus(nfmax(6).format(v))) : '–');
  const numOf = name => {
    const s = String(E[name]?.value ?? '').trim().replace(',', '.');
    return s === '' ? NaN : Number(s);
  };
  const decFix = t => (lang === 'de' ? t.replace(/(\d)\.(\d)/g, '$1,$2') : t);
  const mpa = (v, d = 1) => `${fix(v, d)} MPa`;
  const rhoTxt = v => `${sci(v, 3)} m⁻²`;

  // ---- 見た目(このツールだけ) ----
  const css = document.createElement('style');
  css.textContent = `
#strength-form .sg-wide { grid-column: 1 / -1; margin: 0; }
#strength-form .dy-field[hidden], #strength-form .sg-wide[hidden] { display: none !important; }
#strength-form .dy-field:has(select[name=hmat]), #strength-form .dy-field:has(select[name=pform]), #strength-form .dy-field:has(select[name=pdef]) { grid-column: 1 / -1; }
#strength-form .dy-field:has(select[name=mat]), #strength-form .dy-field:has(select[name=comb]), #strength-form .dy-field:has(select[name=sn]) { grid-column: span 2; }
@media (max-width: 480px) { #strength-form .dy-field:has(select) { grid-column: 1 / -1; } }
.sg-tabs { display: flex; flex-wrap: wrap; gap: 6px; }
.sg-tabs .btn { min-height: 40px; padding: 0 12px; }
.sg-tabs .btn[aria-pressed="true"] { background: var(--accent); color: var(--surface); border-color: var(--accent); }
.sg-ex { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.sg-ex .btn { min-height: 36px; padding: 0 12px; font-size: .85rem; }
.sg-sub { font-size: .85rem; font-weight: 700; color: var(--text); }
.sg-help { font-size: .85rem; color: var(--muted); }
.sg-box { margin: 12px 0; padding: 10px 12px; border-radius: 8px; background: var(--bg); }
.sg-box h3 { margin: 0 0 6px; font-size: 1rem; }
.sg-box ul { margin: 4px 0; padding-left: 1.3em; line-height: 1.7; }
.sg-box p { margin: 4px 0; line-height: 1.7; }
.sg-main { font-size: 1.05rem; line-height: 1.7; margin: 0 0 10px; padding: 10px 12px; border-radius: 8px; background: var(--accent-soft); }
.sg-eq { font-family: var(--mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace); font-size: .88rem; line-height: 1.8; white-space: pre-wrap; overflow-wrap: anywhere; margin: 4px 0; }
.dy-stats .sg-subv { display: block; font-size: .72rem; font-weight: 500; color: var(--muted); }
.sg-warn { color: var(--text); border-left: 3px solid var(--accent-2); padding-left: 8px; }
.sg-tbl-wrap { overflow-x: auto; }
.sg-tbl { width: 100%; border-collapse: collapse; font-size: .86rem; }
.sg-tbl th, .sg-tbl td { text-align: left; padding: 5px 6px; border-bottom: 1px solid var(--border); vertical-align: top; }
.sg-tbl td.sg-num { white-space: nowrap; font-variant-numeric: tabular-nums; }
.sg-tbl thead th { font-size: .78rem; color: var(--muted); font-weight: 600; }
.sg-tbl tr.sg-on { background: var(--accent-soft); }
@media (max-width: 480px) { .sg-tbl th, .sg-tbl td { padding: 4px 3px; font-size: .78rem; } }
.sg-links { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0 0; }
.sg-cap { font-size: .82rem; color: var(--muted); margin: 0 0 4px; }
.sg-key { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: .8rem; color: var(--muted); margin: 2px 0 0; }
.sg-key span::before { content: ""; display: inline-block; width: 18px; height: 0; border-top: 3px solid var(--c); vertical-align: middle; margin-right: 5px; }
.sg-key span.sg-dash::before { border-top-style: dashed; }
.sg-key span.sg-dot::before { width: 9px; height: 9px; border: 0; border-radius: 50%; background: var(--c); }
.sg-key span.sg-sq::before { width: 12px; height: 12px; border: 0; border-radius: 2px; background: var(--c); }
.sg-bars { width: 100%; height: auto; display: block; }
#sg-chart[hidden], .sg-bars[hidden] { display: none !important; }
`;
  document.head.append(css);

  const lab = n => E[n]?.closest('label');

  // ---- タブ ----
  const MODES = ['hp', 'dis', 'ppt', 'ss', 'sum'];
  lab('mode').hidden = true;
  const tabs = el('div', { class: 'sg-tabs sg-wide', role: 'group', 'aria-label': U.tabs_label },
    ...MODES.map(m => el('button', { type: 'button', class: 'btn btn-ghost', 'data-mode': m, 'aria-pressed': 'false' }, U[`tab_${m}`])));
  form.querySelector('h2').after(tabs);
  tabs.addEventListener('click', e => {
    const b = e.target.closest('[data-mode]');
    if (!b) return;
    E.mode.value = b.dataset.mode;
    form.dispatchEvent(new Event('change', { bubbles: true }));
  });

  // ---- 例 ----
  const ex = el('div', { class: 'sg-ex sg-wide' }, el('span', { class: 'muted' }, U.examples),
    ...EXAMPLES.map((x, i) => el('button', { type: 'button', class: 'btn btn-ghost', 'data-ex': String(i) }, U.ex[i])));
  tabs.after(ex);
  ex.after(el('p', { class: 'muted sg-wide', style: 'font-size:.85rem' }, U.ex_note));
  ex.addEventListener('click', e => {
    const b = e.target.closest('[data-ex]');
    if (!b) return;
    const x = EXAMPLES[Number(b.dataset.ex)];
    for (const [k, v] of Object.entries(x)) if (E[k]) E[k].value = String(v);
    form.dispatchEvent(new Event('change', { bubbles: true }));
  });

  // ---- 小見出しと説明 ----
  const sub = (key, before) => { const p = el('p', { class: 'sg-sub sg-wide' }, U[key]); lab(before).before(p); return p; };
  const help = (key, after) => { const p = el('p', { class: 'sg-help sg-wide' }, U[key]); lab(after).after(p); return p; };
  const subMat = sub('sub_mat', 'mat'), helpMat = help('help_mat', 'M');
  const helpHp = help('help_hp', 'hdu');
  const helpDis = help('help_dis', 'dru');
  const helpPpt = help('help_ppt', 'pg');
  const helpSs = help('help_ss', 'scu');
  const helpSum = help('help_sum', 'sq');
  const fromBtn = el('button', { type: 'button', class: 'btn btn-ghost' }, U.from_tabs);
  const fromP = el('p', { class: 'sg-wide' }, fromBtn);
  helpSum.after(fromP);
  const extra = { dis: [subMat, helpMat, helpDis], ppt: [subMat, helpMat, helpPpt], hp: [helpHp], ss: [helpSs], sum: [helpSum, fromP] };
  const allExtra = [...new Set(Object.values(extra).flat())];

  // ---- 材料の選択で G・b・ν・M を入れる。欄を手で変えたら「自分で入れる」に ----
  const MATF = ['G', 'b', 'nu', 'M'];
  const matVal = id => ({ G: MATS[id].G, b: matB(id), nu: MATS[id].nu, M: MATS[id].M });
  E.mat.addEventListener('change', () => {
    const id = E.mat.value;
    if (!MATS[id]) return;
    const v = matVal(id);
    for (const k of MATF) E[k].value = String(v[k]);
  });
  for (const k of MATF) E[k].addEventListener('input', () => {
    const id = E.mat.value;
    if (MATS[id] && numOf(k) !== matVal(id)[k]) E.mat.value = 'custom';
  });
  E.hmat.addEventListener('change', () => {
    const p = HPM[E.hmat.value];
    if (!p) return;
    E.hs0.value = String(p.s0); E.hk.value = String(p.k); E.hku.value = 'm';
  });
  for (const k of ['hs0', 'hk']) E[k].addEventListener('input', () => { if (HPM[E.hmat.value]) E.hmat.value = 'custom'; });
  E.hku.addEventListener('change', () => { if (HPM[E.hmat.value] && E.hku.value !== 'm') E.hmat.value = 'custom'; });

  // ---- 表示の切り替え ----
  const SHOW = {
    hp: ['hmat', 'hs0', 'hk', 'hku', 'hd1', 'hd2', 'hdu'],
    dis: ['mat', 'G', 'b', 'nu', 'M', 'dal', 'dr1', 'dr2', 'dru'],
    ppt: ['mat', 'G', 'b', 'nu', 'M', 'pform', 'pdef', 'pr', 'pf', 'pl', 'pg'],
    ss: ['sk', 'sn', 'sc', 'sc2', 'scu'],
    sum: ['s0', 'xss', 'xgb', 'xdis', 'xppt', 'comb', 'sq'],
  };
  const mode = () => (MODES.includes(E.mode.value) ? E.mode.value : 'hp');
  function layout() {
    const m = mode();
    for (const b of tabs.querySelectorAll('[data-mode]')) b.setAttribute('aria-pressed', String(b.dataset.mode === m));
    const on = new Set(SHOW[m]);
    if (m === 'ppt') {
      if (E.pform.value === 'ashby') { on.delete('pdef'); on.delete('pl'); } else if (E.pdef.value !== 'in') on.delete('pl');
    }
    if (m === 'sum' && E.comb.value !== 'pow') on.delete('sq');
    if (m === 'dis') on.delete('nu');
    for (const f of form.querySelectorAll('.dy-field')) {
      const n = f.querySelector('[name]')?.name;
      if (!n || n === 'mode') continue;
      f.hidden = !on.has(n);
    }
    for (const x of allExtra) x.hidden = !extra[m].includes(x);
  }

  // ---- 部品 ----
  const stats = rows => el('dl', { class: 'dy-stats' }, ...rows.map(([k, v]) => el('div', {}, el('dt', {}, k), el('dd', {}, v))));
  const eq = (...lines) => el('p', { class: 'sg-eq' }, decFix(lines.filter(x => x != null && x !== false).join('\n')));
  const box = (h, ...kids) => el('div', { class: 'sg-box' }, h ? el('h3', {}, h) : null, ...kids);
  const warn = t => el('p', { class: 'sg-warn' }, t);
  const ul = list => el('ul', {}, ...list.map(s => el('li', {}, s)));
  const link = (href, text) => el('a', { href, target: '_blank', rel: 'noopener' }, text);
  const main = t => el('p', { class: 'sg-main' }, t);
  const twoLine = (a, b) => el('span', {}, a, el('small', { class: 'sg-subv' }, b));
  const table = (cols, rows, on = -1) => el('div', { class: 'sg-tbl-wrap' }, el('table', { class: 'sg-tbl' },
    el('thead', {}, el('tr', {}, ...cols.map(c => el('th', { scope: 'col' }, c)))),
    el('tbody', {}, ...rows.map((r, i) => el('tr', { class: i === on ? 'sg-on' : null }, ...r.map((c, j) => (j === 0 ? el('th', { scope: 'row' }, c) : el('td', { class: 'sg-num' }, c))))))));
  const svg = document.getElementById('sg-chart');
  const cap = el('p', { class: 'sg-cap' });
  const key = el('div', { class: 'sg-key' });
  const NS = 'http://www.w3.org/2000/svg';
  const bars = document.createElementNS(NS, 'svg');
  bars.setAttribute('class', 'sg-bars');
  bars.setAttribute('role', 'img');
  bars.setAttribute('aria-label', U.bars_label);
  // SVG の要素には hidden のプロパティがないので、属性で出し入れする
  const vis = (e, on) => (on ? e.removeAttribute('hidden') : e.setAttribute('hidden', ''));
  vis(bars, false);
  out('res').before(cap, svg, bars, key); // 図を結果の上に置く
  const COL = { ac: 'var(--accent)', ac2: 'var(--ok)', dash: 'var(--muted)', ng: 'var(--ng)' };
  const keyOf = keys => key.replaceChildren(...keys.map(([c, t, k]) => el('span', { class: k === 'dash' ? 'sg-dash' : k === 'dot' ? 'sg-dot' : k === 'sq' ? 'sg-sq' : null, style: `--c:${COL[c] ?? c}` }, t)));
  const chart = (opts, caption, keys = []) => {
    vis(svg, true); vis(bars, false);
    lineChart(svg, opts);
    cap.textContent = caption;
    keyOf(keys);
  };
  const noChart = () => { vis(svg, false); svg.innerHTML = ''; vis(bars, false); bars.innerHTML = ''; cap.textContent = ''; key.replaceChildren(); };
  const logRange = (a, b, n = 80) => Array.from({ length: n + 1 }, (_, i) => a * (b / a) ** (i / n));
  const range = (a, b, n = 80) => Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);
  const unitName = (g, u) => U[`${g}_${u}`];

  // 材料の値(G は MPa、b は m)
  const matIn = () => ({ G: gpaToMpa(numOf('G')), Ggpa: numOf('G'), bnm: numOf('b'), b: nmToM(numOf('b')), nu: numOf('nu'), M: numOf('M') });

  // ---- 1. ホール・ペッチ ----
  function hpCalc() {
    const s0 = numOf('hs0'), k = kToSI(numOf('hk'), E.hku.value), du = E.hdu.value;
    const d1 = toM(numOf('hd1'), du), d2 = toM(numOf('hd2'), du);
    return { s0, k, du, d1, d2, a: hallPetch(s0, k, d1), b: hallPetch(s0, k, d2) };
  }
  function renderHp(res) {
    const { s0, k, du, d1, d2, a, b } = hpCalc();
    if (!a) { noChart(); return res.append(warn(U.hp_need)); }
    const dTxt = d => `${inp(d / LEN[du])} ${unitName('hdu', du)}`;
    res.append(main(b
      ? fill(d2 <= d1 ? U.hp_main2 : U.hp_main2b, { d1: dTxt(d1), d2: dTxt(d2), s1: Number.isFinite(a.sy) ? mpa(a.sy) : mpa(a.gb), s2: Number.isFinite(b.sy) ? mpa(b.sy) : mpa(b.gb), ds: mpa(Math.abs(b.gb - a.gb)), r: fix(Math.sqrt(d1 / d2), 3) })
      : fill(Number.isFinite(a.sy) ? U.hp_main : U.hp_main_gb, { d: dTxt(d1), s: mpa(a.sy), g: mpa(a.gb) })));
    const dmin = Math.min(d1, Number.isFinite(d2) ? d2 : Infinity);
    if (dmin <= 20e-9) res.append(warn(U.hp_nano20)); else if (dmin <= 100e-9) res.append(warn(U.hp_nano));
    if (!Number.isFinite(s0)) res.append(warn(U.hp_no_s0));
    const kU = U[`hku_${E.hku.value}`];
    res.append(stats([[U.s_k_si, `${sci(k, 4)} MPa·m^(1/2)`], [U.s_d1m, `${sci(d1, 4)} m`], [U.s_gb1, mpa(a.gb)], [U.s_sy1, Number.isFinite(a.sy) ? mpa(a.sy) : '–'],
      ...(b ? [[U.s_gb2, mpa(b.gb)], [U.s_sy2, Number.isFinite(b.sy) ? mpa(b.sy) : '–'], [U.s_dsy, mpa(b.gb - a.gb)]] : [])]));
    const kLine = E.hku.value === 'm' ? `k = ${inp(numOf('hk'))} ${kU}` : `k = ${inp(numOf('hk'))} ${kU} = ${inp(numOf('hk'))} × √(${sci(LEN[E.hku.value], 1)}) = ${sci(k, 4)} MPa·m^(1/2)`;
    const dLine = (n, d) => `d${n} = ${inp(d / LEN[du])} ${unitName('hdu', du)} = ${sci(d, 4)} m   → d${n}^(−1/2) = 1/√(${sci(d, 4)}) = ${sci(1 / Math.sqrt(d), 4)} m^(−1/2)`;
    const syLine = (n, x, d) => `σy${n} = σ₀ + k·d${n}^(−1/2) = ${inp(s0)} + ${sci(k, 4)} × ${sci(1 / Math.sqrt(d), 4)} = ${inp(s0)} + ${fix(x.gb, 2)} = ${fix(x.sy, 2)} MPa`;
    res.append(box(U.h_eq, el('p', {}, U.hp_eq_lead), eq(kLine, dLine('₁', d1), Number.isFinite(s0) ? syLine('₁', a, d1) : `k·d₁^(−1/2) = ${fix(a.gb, 2)} MPa`,
      ...(b ? [dLine('₂', d2), Number.isFinite(s0) ? syLine('₂', b, d2) : `k·d₂^(−1/2) = ${fix(b.gb, 2)} MPa`,
        `Δσy = k(d₂^(−1/2) − d₁^(−1/2)) = ${fix(b.gb - a.gb, 2)} MPa   (√(d₁/d₂) = ${fix(Math.sqrt(d1 / d2), 4)})`] : [])),
    el('p', { class: 'muted' }, U.hp_eq_note)));
    // よくある誤り: d を µm(や mm)の数のまま入れたとき
    const raw = numOf('hd1');
    if (du !== 'm' && raw > 0) {
      const wrong = k / Math.sqrt(raw);
      res.append(box(U.h_miss, el('p', {}, fill(U.hp_miss_d, { d: inp(raw), u: unitName('hdu', du), w: mpa(wrong, 3), c: mpa(a.gb, 2), r: sci(a.gb / wrong, 3) }))));
    }
    res.append(box(U.h_kvals, table(U.kv_cols, ['fe', 'ni', 'cu', 'al'].map(id => [U[`hmat_${id}`], fix(HPM[id].s0, 0), fix(HPM[id].k, 2), fix(HPM[id].k * 1000, 0)])), el('p', { class: 'muted' }, U.kv_note)));
    res.append(box(U.h_caution, ul(U.hp_cautions)));
    // σy と d(d は対数軸)
    const ds = [d1, d2].filter(x => x > 0 && Number.isFinite(x));
    const lo = Math.max(Math.min(...ds) / 5, 5e-9), hi = Math.max(...ds) * 5;
    const yOf = d => (Number.isFinite(s0) ? s0 : 0) + k / Math.sqrt(d);
    const um = d => d / 1e-6;
    chart({ series: [{ points: logRange(lo, hi, 120).map(d => [um(d), yOf(d)]), cls: 'ac' }, ...(lo < 20e-9 ? [{ points: [[0.02, 0], [0.02, yOf(lo)]], cls: 'dash' }] : [])],
      xlabel: U.x_d, ylabel: Number.isFinite(s0) ? U.y_sy : U.y_gb, xlog: true, ymin: 0, marks: ds.map(d => [um(d), yOf(d), mpa(yOf(d), 0)]) },
    U.cap_hp, [['ac', Number.isFinite(s0) ? U.key_hp : U.key_hp_gb], ['ng', U.key_pts, 'dot'], ...(lo < 20e-9 ? [['dash', U.key_20nm, 'dash']] : [])]);
  }

  // ---- 2. テイラーの式 ----
  function disCalc() {
    const m = matIn(), al = numOf('dal'), ru = E.dru.value;
    const r1 = rhoToSI(numOf('dr1'), ru), r2 = rhoToSI(numOf('dr2'), ru);
    return { m, al, ru, r1, r2, a: taylor(m.M, al, m.G, m.b, r1), b: taylor(m.M, al, m.G, m.b, r2) };
  }
  function renderDis(res) {
    const { m, al, ru, r1, r2, a, b } = disCalc();
    if (!a || !(m.M > 0)) { noChart(); return res.append(warn(U.dis_need)); }
    res.append(main(b
      ? fill(r2 >= r1 ? U.dis_main2 : U.dis_main2b, { r1: rhoTxt(r1), r2: rhoTxt(r2), s1: mpa(a.sig), s2: mpa(b.sig), ds: mpa(Math.abs(b.sig - a.sig)), x: r1 > 0 ? fix(Math.sqrt(r2 / r1), 3) : '∞' })
      : fill(U.dis_main, { r: rhoTxt(r1), s: mpa(a.sig), t: mpa(a.tau) })));
    if (!(al >= 0.1 && al <= 1)) res.append(warn(U.dis_alpha));
    const rs = [r1, r2].filter(Number.isFinite);
    if (rs.some(r => r > 0 && (r < 1e9 || r > 1e17))) res.append(warn(U.dis_rho_odd));
    res.append(stats([[U.s_rho1, rhoTxt(r1)], [U.s_tau1, mpa(a.tau)], [U.s_sig1, mpa(a.sig)],
      ...(b ? [[U.s_rho2, rhoTxt(r2)], [U.s_sig2, mpa(b.sig)], [U.s_dsig, mpa(b.sig - a.sig)]] : [])]));
    const rLine = (n, r) => `${ru === 'cm2' ? `ρ${n} = ${inp(r / 1e4)} cm⁻² × 10⁴ = ${rhoTxt(r)}` : `ρ${n} = ${rhoTxt(r)}`}   → √ρ${n} = ${sci(Math.sqrt(r), 4)} m⁻¹`;
    const tLine = (n, x, r) => `Δτ${n} = αGb√ρ${n} = ${inp(al)} × ${sci(m.G, 4)} MPa × ${sci(m.b, 4)} m × ${sci(Math.sqrt(r), 4)} m⁻¹ = ${fix(x.tau, 2)} MPa\nΔσ${n} = MΔτ${n} = ${inp(m.M)} × ${fix(x.tau, 2)} = ${fix(x.sig, 2)} MPa`;
    res.append(box(U.h_eq, el('p', {}, U.dis_eq_lead), eq(`G = ${inp(m.Ggpa)} GPa = ${sci(m.G, 4)} MPa,  b = ${inp(m.bnm)} nm = ${sci(m.b, 4)} m`,
      rLine('₁', r1), tLine('₁', a, r1), ...(b ? [rLine('₂', r2), tLine('₂', b, r2), `Δσ₂ − Δσ₁ = MαGb(√ρ₂ − √ρ₁) = ${fix(b.sig - a.sig, 2)} MPa`] : [])),
    el('p', { class: 'muted' }, U.dis_eq_note)));
    res.append(box(U.h_miss, ul([fill(U.dis_miss_m, { t: mpa(a.tau, 2), s: mpa(a.sig, 2) }), fill(U.dis_miss_sqrt, { w: sci(m.M * al * m.G * m.b * r1, 3) }), U.dis_miss_b])));
    res.append(box(U.h_rho, ul(U.rho_list)));
    res.append(box(U.h_caution, ul(U.dis_cautions)));
    // Δσ と ρ(ρ は対数軸)
    const lo = Math.min(1e10, ...rs.filter(r => r > 0).map(r => r / 3)), hi = Math.max(1e16, ...rs.map(r => r * 3));
    chart({ series: [{ points: logRange(lo, hi, 120).map(r => [r, m.M * al * m.G * m.b * Math.sqrt(r)]), cls: 'ac' }],
      xlabel: U.x_rho, ylabel: U.y_dsig, xlog: true, ymin: 0, marks: rs.filter(r => r > 0).map(r => [r, m.M * al * m.G * m.b * Math.sqrt(r), mpa(m.M * al * m.G * m.b * Math.sqrt(r), 0)]) },
    U.cap_dis, [['ac', fill(U.key_dis, { a: inp(al), m: inp(m.M) })], ['ng', U.key_pts, 'dot']]);
  }

  // ---- 3. 析出・分散強化 ----
  function pptCalc() {
    const m = matIn(), form_ = E.pform.value === 'ashby' ? 'ashby' : 'basic', def = E.pdef.value;
    const r = nmToM(numOf('pr')), fp = numOf('pf'), f = fp / 100, Lin = nmToM(numOf('pl')), g = numOf('pg');
    const Lof = (dd, rr = r) => (dd === 'in' ? Lin : spacing(dd, rr, f));
    const tauO = rr => (form_ === 'ashby' ? ashbyOrowan(m.G, m.b, m.nu, rr, f) : orowan(m.G, m.b, Lof(def, rr)));
    return { m, form_, def, r, fp, f, Lin, g, Lof, tauO };
  }
  function renderPpt(res) {
    const P = pptCalc(), { m, form_, def, r, fp, f, g, Lof, tauO } = P;
    if (!(m.G > 0) || !(m.b > 0) || !(m.M > 0) || !(m.nu >= 0 && m.nu < 0.5)) { noChart(); return res.append(warn(U.ppt_need_mat)); }
    if (!(r > 0) || !(fp >= 0 && fp < 100) || (form_ === 'basic' && def === 'in' && !(P.Lin > 0))) { noChart(); return res.append(warn(U.ppt_need)); }
    const L = form_ === 'ashby' ? spacing('e2', r, f) : Lof(def);
    const tau = tauO(r);
    if (!Number.isFinite(tau)) { noChart(); return res.append(warn(form_ === 'ashby' ? U.ppt_bad_ashby : U.ppt_bad_l)); }
    const sig = m.M * tau;
    const cut = g > 0 ? brownHam(g, m.G, m.b, r, f) : NaN;
    const ctl = Number.isFinite(cut) && cut < tau ? 'cut' : 'oro';
    const fname = U[`fn_${form_}`];
    res.append(main(fp === 0 ? U.ppt_main0 : fill(U.ppt_main, { f: fname, L: `${sci(L / 1e-9, 4)} nm`, t: mpa(tau), s: mpa(sig), m: inp(m.M) })));
    if (Number.isFinite(cut)) res.append(main(fill(ctl === 'cut' ? U.ppt_cut_low : U.ppt_cut_high, { c: mpa(cut), cs: mpa(m.M * cut), o: mpa(tau) })));
    if (fp > 0 && r < 1e-9) res.append(warn(U.ppt_small));
    res.append(stats([[U.s_f, `${inp(fp)} % = ${inp(f)}`], [form_ === 'ashby' ? U.s_lam : U.s_L, `${sci(L / 1e-9, 4)} nm`], [U.s_dtau, mpa(tau)], [U.s_dsigp, mpa(sig)],
      ...(Number.isFinite(cut) ? [[U.s_cut, twoLine(mpa(cut), fill(U.s_cut_sig, { s: mpa(m.M * cut) }))]] : [])]));
    // 式
    const rb = RBAR * r;
    const sLine = dd => {
      const c3 = spacing('c3', r, f);
      if (dd === 'in') return `L = ${inp(numOf('pl'))} nm (${U.eq_given})`;
      if (dd === 'c3') return `L = [4πr³/(3f)]^(1/3) = r·(4π/(3f))^(1/3) = ${inp(r / 1e-9)} nm × ${fix(c3 / r, 4)} = ${sci(c3 / 1e-9, 4)} nm`;
      if (dd === 'e3') return `L = [4πr³/(3f)]^(1/3) − 2r = ${sci(c3 / 1e-9, 4)} − ${inp((2 * r) / 1e-9)} = ${sci(spacing('e3', r, f) / 1e-9, 4)} nm`;
      return `r̄ = πr/4 = ${sci(rb / 1e-9, 4)} nm,  λ = (√(π/f) − 2)·r̄ = (${fix(Math.sqrt(Math.PI / f), 4)} − 2) × ${sci(rb / 1e-9, 4)} = ${sci(spacing('e2', r, f) / 1e-9, 4)} nm`;
    };
    const lines = [`f = ${inp(fp)} % = ${inp(f)},  r = ${inp(r / 1e-9)} nm,  G = ${inp(m.Ggpa)} GPa = ${sci(m.G, 4)} MPa,  b = ${inp(m.bnm)} nm`];
    if (fp > 0) {
      lines.push(sLine(form_ === 'ashby' ? 'e2' : def));
      if (form_ === 'ashby') lines.push(`Δτ = 0.4·G·b·ln(2r̄/b)/(π·λ·√(1 − ν)) = 0.4 × ${sci(m.G, 4)} × ${inp(m.bnm)} × ln(${fix((2 * rb) / m.b, 3)})/(π × ${sci(L / 1e-9, 4)} × √(1 − ${inp(m.nu)})) = ${fix(tau, 2)} MPa`);
      else lines.push(`Δτ = Gb/L = ${sci(m.G, 4)} MPa × ${inp(m.bnm)} nm/${sci(L / 1e-9, 4)} nm = ${fix(tau, 2)} MPa`);
      lines.push(`Δσ = MΔτ = ${inp(m.M)} × ${fix(tau, 2)} = ${fix(sig, 2)} MPa`);
      if (Number.isFinite(cut)) {
        const Tn = (m.G * 1e6 * m.b * m.b) / 2;
        lines.push('', U.eq_cut, `T = Gb²/2 = ${sci(Tn, 4)} N,  Δτ_cut = (γ/2b)[√(3π²γfr/(32T)) − f] = (${inp(g)}/(2 × ${sci(m.b, 4)}))[√(3π² × ${inp(g)} × ${inp(f)} × ${sci(r, 4)}/(32 × ${sci(Tn, 4)})) − ${inp(f)}] = ${fix(cut, 2)} MPa`);
      }
    }
    res.append(box(U.h_eq, el('p', {}, form_ === 'ashby' ? U.ppt_eq_lead_a : U.ppt_eq_lead_b), eq(...lines), el('p', { class: 'muted' }, U.ppt_eq_note)));
    // 間隔の定義と式による違い
    if (fp > 0) {
      const rows = ['c3', 'e3', 'e2'].map(dd => { const LL = spacing(dd, r, f), t = orowan(m.G, m.b, LL); return [fill(U.row_basic, { d: U[`pdef_${dd}`] }), Number.isFinite(LL) ? `${sci(LL / 1e-9, 4)} nm` : '–', mpa(t), mpa(m.M * t)]; });
      const ta = ashbyOrowan(m.G, m.b, m.nu, r, f);
      rows.push([U.row_ashby, `${sci(spacing('e2', r, f) / 1e-9, 4)} nm`, mpa(ta), mpa(m.M * ta)]);
      const on = form_ === 'ashby' ? 3 : ['c3', 'e3', 'e2'].indexOf(def);
      res.append(box(U.h_cmp, table(U.cmp_cols, rows, on), el('p', { class: 'muted' }, U.cmp_note)));
    }
    // 交点(臨界半径)
    let X = null;
    if (g > 0 && fp > 0) {
      X = crossover(rr => brownHam(g, m.G, m.b, rr, f), tauO);
      res.append(box(U.h_cross, el('p', {}, X ? fill(U.cross_main, { r: `${sci(X.r / 1e-9, 3)} nm`, t: mpa(X.tau), s: mpa(m.M * X.tau) }) : U.cross_none), el('p', { class: 'muted' }, U.cross_note)));
    } else if (fp > 0) res.append(box(U.h_cross, el('p', {}, U.cross_hint)));
    res.append(box(U.h_caution, ul(U.ppt_cautions)));
    if (fp === 0) { noChart(); return; }
    // Δσ と r(r は対数軸)
    const lo = Math.max(0.5e-9, Math.min(r, X?.r ?? r) / 10), hi = Math.max(r, X?.r ?? r) * 10;
    const rr = logRange(lo, hi, 140);
    const nm = x => x / 1e-9;
    const oro = rr.map(x => [nm(x), m.M * tauO(x)]);
    const series = [{ points: oro, cls: 'ac' }];
    const keys = [['ac', fill(U.key_oro, { f: fname })]];
    if (g > 0) { series.push({ points: rr.map(x => [nm(x), m.M * brownHam(g, m.G, m.b, x, f)]), cls: 'ac2' }); keys.push(['ac2', U.key_cut]); }
    const marks = [[nm(r), m.M * (Number.isFinite(cut) ? Math.min(cut, tau) : tau), fill(U.mark_r, { r: inp(r / 1e-9) })]];
    if (X) marks.push([nm(X.r), m.M * X.tau, fill(U.mark_x, { r: sci(X.r / 1e-9, 3) })]);
    const ys = series.flatMap(s => s.points.map(p => p[1])).filter(Number.isFinite);
    const ycap = Math.max(...marks.map(k => k[1]).filter(Number.isFinite), 1) * 3;
    for (const s of series) s.points = s.points.filter(p => Number.isFinite(p[1]) && p[1] <= Math.max(ycap, Math.min(...ys) * 1.01));
    keys.push(['ng', U.key_pts, 'dot']);
    chart({ series, xlabel: U.x_r, ylabel: U.y_dsigp, xlog: true, ymin: 0, marks }, fill(U.cap_ppt, { f: inp(fp), m: inp(m.M) }), keys);
  }

  // ---- 4. 固溶強化 ----
  function ssCalc() {
    const k = numOf('sk'), n = SSN[E.sn.value] ?? SSN.h, c = numOf('sc'), c2 = numOf('sc2');
    return { k, n, c, c2, a: solid(k, c, n), b: solid(k, c2, n) };
  }
  function renderSs(res) {
    const { k, n, c, c2, a, b } = ssCalc();
    if (!Number.isFinite(a)) { noChart(); return res.append(warn(U.ss_need)); }
    const cu = U[`scu_${E.scu.value}`] ?? U.scu_at, nT = E.sn.value === 't' ? '2/3' : '1/2';
    res.append(main(Number.isFinite(b)
      ? fill(U.ss_main2, { c: inp(c), c2: inp(c2), u: cu, s: mpa(a), s2: mpa(b), n: nT, r: c > 0 ? fix(b / a, 3) : '–' })
      : fill(U.ss_main, { c: inp(c), u: cu, s: mpa(a), n: nT })));
    const other = E.sn.value === 't' ? SSN.h : SSN.t, oT = E.sn.value === 't' ? '1/2' : '2/3';
    res.append(stats([[U.s_ss1, mpa(a)], ...(Number.isFinite(b) ? [[U.s_ss2, mpa(b)]] : []), [fill(U.s_ss_other, { n: oT }), mpa(solid(k, Number.isFinite(b) ? c2 : c, other))]]));
    const line = (cc, v) => `Δσ = k·cⁿ = ${inp(k)} × ${inp(cc)}^(${nT}) = ${inp(k)} × ${fix(cc ** n, 4)} = ${fix(v, 2)} MPa`;
    res.append(box(U.h_eq, el('p', {}, U.ss_eq_lead), eq(line(c, a), Number.isFinite(b) ? line(c2, b) : null,
      Number.isFinite(b) && c > 0 ? `Δσ₂/Δσ₁ = (c₂/c₁)ⁿ = (${inp(c2)}/${inp(c)})^(${nT}) = ${fix(b / a, 4)}` : null), el('p', { class: 'muted' }, U.ss_eq_note)));
    res.append(box(U.h_caution, ul(U.ss_cautions)));
    const cmax = Math.max(c, Number.isFinite(c2) ? c2 : 0) * 1.5 || 1;
    const cs = range(0, cmax, 120);
    chart({ series: [{ points: cs.map(x => [x, solid(k, x, SSN.h)]), cls: E.sn.value === 'h' ? 'ac' : 'dash' }, { points: cs.map(x => [x, solid(k, x, SSN.t)]), cls: E.sn.value === 't' ? 'ac' : 'ac2' }],
      xlabel: fill(U.x_c, { u: cu }), ylabel: U.y_dss, ymin: 0, marks: [[c, a, mpa(a, 0)], ...(Number.isFinite(b) ? [[c2, b, mpa(b, 0)]] : [])] },
    U.cap_ss, [[E.sn.value === 'h' ? 'ac' : 'dash', 'n = 1/2', E.sn.value === 'h' ? null : 'dash'], [E.sn.value === 't' ? 'ac' : 'ac2', 'n = 2/3'], ['ng', U.key_pts, 'dot']]);
  }

  // ---- 5. 重ね合わせ ----
  const METHODS = ['lin', 'rss', 'mix', 'pow'];
  const PCOL = { s0: 'var(--muted)', ss: 'var(--accent)', gb: 'var(--ok)', dis: 'var(--accent-2)', ppt: 'var(--ng)' };
  function barSvg(rows) {
    const narrow = (cap.getBoundingClientRect?.().width || 600) < 480; // bars は隠れていると幅 0 なので、上の説明の幅で見る
    const W = narrow ? 340 : 600, rowH = 46, top = 6, H = top + rows.length * rowH + 22, L = 8, R = W - 46;
    const max = Math.max(...rows.map(r => r.total), 1);
    const X = v => L + (v / max) * (R - L);
    let g = '';
    rows.forEach((r, i) => {
      const y = top + i * rowH;
      g += `<text x="${L}" y="${y + 13}" font-size="14" fill="var(--text)"${r.on ? ' font-weight="700"' : ''}>${r.label}</text>`;
      let x0 = r.s0;
      g += `<rect x="${X(0).toFixed(1)}" y="${y + 18}" width="${Math.max(X(r.s0) - X(0), 0).toFixed(1)}" height="20" fill="${PCOL.s0}"/>`;
      for (const k of PARTS) {
        const w = r.segs[k] ?? 0;
        if (w > 0) g += `<rect x="${X(x0).toFixed(1)}" y="${y + 18}" width="${(X(x0 + w) - X(x0)).toFixed(1)}" height="20" fill="${PCOL[k]}" stroke="var(--bg)" stroke-width="1"/>`;
        x0 += w;
      }
      g += `<text x="${(X(r.total) + 6).toFixed(1)}" y="${y + 33}" font-size="14" fill="var(--text)">${fix(r.total, 0)}</text>`;
    });
    g += `<line x1="${X(0)}" y1="${top}" x2="${X(0)}" y2="${H - 20}" stroke="var(--border)"/>`;
    g += `<text x="${R}" y="${H - 4}" font-size="13" fill="var(--muted)" text-anchor="end">MPa</text>`;
    bars.setAttribute('viewBox', `0 0 ${W} ${H}`);
    bars.innerHTML = g;
  }
  function renderSum(res) {
    const s0 = numOf('s0'), p = { ss: numOf('xss'), gb: numOf('xgb'), dis: numOf('xdis'), ppt: numOf('xppt') }, q = numOf('sq');
    const meth = METHODS.includes(E.comb.value) ? E.comb.value : 'lin';
    const R = combine(s0, p, meth, q);
    if (!R) { noChart(); return res.append(warn(meth === 'pow' && !(q > 0) ? U.sum_need_q : U.sum_need)); }
    const all = Object.fromEntries(METHODS.map(k => [k, combine(s0, p, k, k === 'pow' ? (q > 0 ? q : 1.5) : 2)]));
    res.append(main(fill(U.sum_main, { m: U[`cn_${meth}`], s: mpa(R.total), l: mpa(all.lin.total), r: mpa(all.rss.total), d: fix(((all.lin.total - all.rss.total) / all.lin.total) * 100, 1) })));
    if (meth === 'pow' && !(q >= 1 && q <= 2)) res.append(warn(U.sum_q_odd));
    const v = k => (Number.isFinite(p[k]) ? p[k] : 0);
    res.append(stats(METHODS.map(k => [U[`comb_${k}`], k === 'pow' && !(q > 0) ? '–' : mpa(all[k].total)])));
    const n0 = x => inp(v(x));
    const qq = q > 0 ? q : 1.5;
    res.append(box(U.h_eq, el('p', {}, U.sum_eq_lead), eq(
      `${U.comb_lin}: σy = σ₀ + Δσ_ss + Δσ_gb + Δσ_dis + Δσ_ppt = ${inp(s0)} + ${n0('ss')} + ${n0('gb')} + ${n0('dis')} + ${n0('ppt')} = ${fix(all.lin.total, 1)} MPa`,
      `${U.comb_rss}: σy = σ₀ + √(ΣΔσᵢ²) = ${inp(s0)} + √(${n0('ss')}² + ${n0('gb')}² + ${n0('dis')}² + ${n0('ppt')}²) = ${inp(s0)} + ${fix(all.rss.add, 1)} = ${fix(all.rss.total, 1)} MPa`,
      `${U.comb_mix}: σy = σ₀ + Δσ_ss + Δσ_gb + √(Δσ_dis² + Δσ_ppt²) = ${inp(s0)} + ${n0('ss')} + ${n0('gb')} + √(${n0('dis')}² + ${n0('ppt')}²) = ${fix(all.mix.total, 1)} MPa`,
      `${U.comb_pow}: σy = σ₀ + (ΣΔσᵢ^q)^(1/q) = ${inp(s0)} + (${PARTS.map(n0).join(`^${inp(qq)} + `)}^${inp(qq)})^(1/${inp(qq)}) = ${fix(all.pow.total, 1)} MPa`),
    el('p', { class: 'muted' }, U.sum_eq_note)));
    res.append(box(U.h_which, ul(U.which_list)));
    res.append(box(U.h_caution, ul(U.sum_cautions)));
    // 積み上げの棒
    vis(svg, false); svg.innerHTML = '';
    vis(bars, true);
    barSvg(METHODS.map(k => ({ label: k === 'pow' ? `${U[`comb_${k}`]} (q = ${inp(qq)})` : U[`comb_${k}`], on: k === meth, total: all[k].total, s0: s0, segs: all[k].segs })));
    cap.textContent = U.cap_sum;
    keyOf([[PCOL.s0, 'σ₀', 'sq'], [PCOL.ss, U.key_ss, 'sq'], [PCOL.gb, U.key_gb, 'sq'], [PCOL.dis, U.key_disl, 'sq'], [PCOL.ppt, U.key_ppt, 'sq']]);
  }
  // 各タブの結果を重ね合わせの欄へ(今の欄の値で計算し直す)
  fromBtn.addEventListener('click', () => {
    const h = hpCalc(), d = disCalc(), s = ssCalc();
    const P = pptCalc();
    let ppt = NaN;
    if (P.r > 0 && P.fp >= 0) { const t = P.tauO(P.r), c = P.g > 0 ? brownHam(P.g, P.m.G, P.m.b, P.r, P.f) : NaN; ppt = P.m.M * (Number.isFinite(c) ? Math.min(c, t) : t); }
    const put = (k, x) => { if (Number.isFinite(x)) E[k].value = String(Number(x.toFixed(1))); };
    // 比べる値(d₂・ρ₂・c₂)が入っていればその値、なければ1つ目の値(①・②・④でそろえる)
    put('s0', h.s0); put('xgb', h.b ? h.b.gb : h.a?.gb); put('xdis', d.b ? d.b.sig : d.a?.sig); put('xppt', ppt); put('xss', Number.isFinite(s.b) ? s.b : s.a);
    form.dispatchEvent(new Event('change', { bubbles: true }));
  });

  // ---- 出典 ----
  const SRCS = {
    cks: ['https://dspace.mit.edu/handle/1721.1/112642', 'Cordero, Knight & Schuh, Int. Mater. Rev. 61 (2016) 495'],
    sz: ['https://doi.org/10.1016/S0022-3115(00)00178-9', 'Stoller & Zinkle, J. Nucl. Mater. 283–287 (2000) 349'],
    kas: ['https://doi.org/10.1016/j.actamat.2003.08.021', 'Kassner, Acta Mater. 52 (2004) 1'],
    byu: ['https://www.et.byu.edu/~mjm82/che378/Fall2023/LectureNotes/Lecture_15_notes.pdf', U.src_byu],
    krug: ['https://doi.org/10.1016/j.actamat.2014.07.034', 'Krug et al., Acta Mater. 79 (2014) 382'],
    kis: ['https://arxiv.org/abs/0705.0052', 'Karnesky, Isheim & Seidman (2007)'],
    vaid: ['https://arxiv.org/abs/2104.05906', U.src_vaid],
    sg: ['https://arxiv.org/abs/2201.09252', 'Santos-Güemes, Segurado & LLorca (arXiv:2201.09252)'],
    lb: ['https://arxiv.org/abs/1412.3044', 'Leibner et al. (arXiv:1412.3044)'],
    pan: ['https://computherm.com/Pandat_OnlineHelp/Content/5-PanEvolution/2_KineticModels/3.3_Precipitation%20Strengthening%20Model.htm', U.src_pan],
    wel: ['https://en.wikipedia.org/wiki/Elastic_properties_of_the_elements_(data_page)', U.src_wel],
  };
  const SRC_OF = { hp: ['cks'], dis: ['kas', 'sz', 'byu', 'wel'], ppt: ['sg', 'krug', 'kis', 'vaid', 'sz', 'wel'], ss: ['lb'], sum: ['pan', 'krug'] };
  const srcList = m => el('p', { class: 'muted' }, U.src_h, ' ', ...SRC_OF[m].flatMap((k, i) => [i ? ' · ' : '', link(...SRCS[k])]));

  const LINKS = {
    hp: [['term/hall-petch-relationship/', U.l_hp], ['measure/#conv', U.l_measure], ['formulas/#f-hall-petch', U.l_formula], ['learn/why-steel-breaks-in-the-cold/', U.l_learn_cold]],
    dis: [['term/dislocation/', U.l_dis], ['term/work-hardening/', U.l_wh], ['term/taylor-factor/', U.l_taylor], ['term/burgers-vector/', U.l_burgers], ['learn/why-metals-bend-and-glass-breaks/', U.l_learn_bend]],
    ppt: [['term/orowan-mechanism/', U.l_orowan], ['term/precipitation-hardening/', U.l_ppt], ['term/dispersion-strengthening/', U.l_disp], ['term/taylor-factor/', U.l_taylor]],
    ss: [['term/solid-solution-strengthening/', U.l_ss], ['learn/why-quenching-hardens-steel/', U.l_learn_quench]],
    sum: [['term/critical-resolved-shear-stress/', U.l_crss], ['term/schmid-factor/', U.l_schmid], ['term/0-2-offset-yield-strength/', U.l_proof]],
  };

  function render() {
    layout();
    const res = out('res');
    res.replaceChildren();
    const m = mode();
    noChart();
    ({ hp: renderHp, dis: renderDis, ppt: renderPpt, ss: renderSs, sum: renderSum })[m](res);
    res.append(srcList(m));
    res.append(el('div', { class: 'sg-links' },
      ...LINKS[m].filter(([, t]) => t).map(([h, t]) => el('a', { class: 'btn btn-ghost', href: `${home}${h}` }, t)),
      el('a', { class: 'btn btn-ghost', href: `${home}tools/${U.tensile_slug}/` }, U.l_tensile),
      el('a', { class: 'btn btn-ghost', href: `${home}c/strengthening/` }, U.l_cat)));
  }
  // 空にした欄を戻す。tool-share.js は空の値を読まずに既定値を残し、先に URL を書き換えるので、
  // 開いたときの URL(navigation の name)から読む(weibull.js・stress.js と同じ)
  try {
    const url0 = performance.getEntriesByType?.('navigation')?.[0]?.name || location.href;
    let n0 = 0;
    for (const [k, v] of new URL(url0).searchParams) if (v.trim() === '' && E[k]?.tagName === 'INPUT' && E[k].value !== '') { E[k].value = ''; n0++; }
    if (n0) setTimeout(() => form.dispatchEvent(new Event('change', { bubbles: true })));
  } catch { /* 読めなくても続ける */ }
  form.addEventListener('submit', e => e.preventDefault());
  form.addEventListener('input', () => setTimeout(render));
  form.addEventListener('change', () => setTimeout(render));
  render();
}
