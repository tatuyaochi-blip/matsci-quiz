// クリープ寿命ラボ。次を計算して、式に値を代入した形とグラフを見せる。
//   1. ラーソン・ミラー・パラメータ(LMP)P = T(C + log₁₀t_r)(T は K、t_r は h、log は常用対数)。
//      ① T と t_r → P、② P と T → t_r、③ P と t_r → T。同じ P になる温度と時間の組の表と、log t_r–T の線
//   2. パラメータの比べ: 同じ試験点から、LMP・オア・シャービー・ドーン(OSD)P = log t_r − Q/(2.303RT)・
//      マンソン・ハファード(MH)P = (log t_r − log t_a)/(T − T_a) で別の温度の破断時間を外挿する
//   3. ノートン則 ε̇ = Aσⁿ exp(−Q/RT): 2点から n・Q、n・Q・A から ε̇、応力・温度を変えたときの倍率
//   4. モンクマン・グラントの関係 ε̇_min^m · t_r = C_MG
//   5. ロビンソンの寿命消費則 Σ tᵢ/t_r,ᵢ = 1
//   6. 自分の試験点(σ・T・t_r)から LMP–応力の線を引く(P を log σ の 1 次・2 次式で、log t_r の残差の最小二乗)
// 式と定数の出典は data/tools/creep.json の text.{言語}.js.ui の src_* と、review の check/sources.md。
// 計算の関数(lmpP・lmpTr・lmpT・osdTr・mhTr・extrapolate・nortonRate・fitN・fitQ・nortonA・rateRatio・mgTr・mgC・
// lifeFraction・fitCurve・curveP・curveTr)は DOM なしで import できる(検算: review の check/calc_creep.py と check/js_results.mjs)。
import { lineChart } from './chart.js';

// =====================================================================
// 定数
// =====================================================================
export const R = 8.31446261815324; // J/(mol·K)
export const K0 = 273.15;
export const LN10 = Math.LN10; // 2.302585…(教科書の 2.303)
export const HOURS_PER_YEAR = 8760; // 1年 = 365 日 × 24 h
const ok = (...v) => v.every(Number.isFinite);

// =====================================================================
// 1. ラーソン・ミラー(T は K、t_r は h)
// =====================================================================
export const lmpP = (T, tr, C) => (ok(T, tr, C) && T > 0 && tr > 0 ? T * (C + Math.log10(tr)) : NaN);
export const lmpTr = (P, T, C) => (ok(P, T, C) && T > 0 ? 10 ** (P / T - C) : NaN);
export const lmpT = (P, tr, C) => (ok(P, tr, C) && tr > 0 && C + Math.log10(tr) > 0 ? P / (C + Math.log10(tr)) : NaN);
// LMP の線(同じ応力)の log t_r–1/T の傾きは P。OSD の Q/(2.303R) と比べた見かけの活性化エネルギー(J/mol)
export const lmpQ = P => LN10 * R * P;
// 温度を dT(K)上げると破断時間が何分の1になるか
export const lmpPerK = (P, T, C, dT = 10) => lmpTr(P, T, C) / lmpTr(P, T + dT, C);

// =====================================================================
// 2. OSD と MH(Q は J/mol、T・T_a は K)
// =====================================================================
export const osdP = (T, tr, Q) => (ok(T, tr, Q) && T > 0 && tr > 0 ? Math.log10(tr) - Q / (LN10 * R * T) : NaN);
export const osdTr = (P, T, Q) => (ok(P, T, Q) && T > 0 ? 10 ** (P + Q / (LN10 * R * T)) : NaN);
export const mhP = (T, tr, Ta, lta) => (ok(T, tr, Ta, lta) && tr > 0 && T !== Ta ? (Math.log10(tr) - lta) / (T - Ta) : NaN);
export const mhTr = (P, T, Ta, lta) => (ok(P, T, Ta, lta) ? 10 ** (lta + P * (T - Ta)) : NaN);
// 同じ試験点 (T1, t1) から温度 T2 の破断時間を3つのパラメータで
export function extrapolate(T1, t1, T2, { C, Q, Ta, lta }) {
  const P = lmpP(T1, t1, C), Po = osdP(T1, t1, Q), Pm = T1 > Ta && T2 > Ta ? mhP(T1, t1, Ta, lta) : NaN;
  return { lmp: lmpTr(P, T2, C), osd: osdTr(Po, T2, Q), mh: Number.isFinite(Pm) ? mhTr(Pm, T2, Ta, lta) : NaN, P, Po, Pm };
}

// =====================================================================
// 3. ノートン則(σ は MPa、ε̇ は入れた単位のまま、Q は J/mol、T は K)
// =====================================================================
export const nortonRate = (A, s, n, Q, T) => (ok(A, s, n, Q, T) && s > 0 && T > 0 ? A * s ** n * Math.exp(-Q / (R * T)) : NaN);
// 同じ温度の2点から n、同じ応力の2点から Q
export const fitN = (s1, e1, s2, e2) => (ok(s1, e1, s2, e2) && s1 > 0 && s2 > 0 && e1 > 0 && e2 > 0 && s1 !== s2 ? Math.log(e2 / e1) / Math.log(s2 / s1) : NaN);
export const fitQ = (T1, e1, T2, e2) => (ok(T1, e1, T2, e2) && T1 > 0 && T2 > 0 && e1 > 0 && e2 > 0 && T1 !== T2 ? (R * Math.log(e2 / e1)) / (1 / T1 - 1 / T2) : NaN);
export const nortonA = (e, s, n, Q, T) => (ok(e, s, n, Q, T) && e > 0 && s > 0 && T > 0 ? e / (s ** n * Math.exp(-Q / (R * T))) : NaN);
// (σ1, T1) → (σ2, T2) の速さの倍率
export const rateRatio = (s1, T1, s2, T2, n, Q) => (ok(s1, T1, s2, T2, n, Q) && s1 > 0 && s2 > 0 && T1 > 0 && T2 > 0
  ? (s2 / s1) ** n * Math.exp((-Q / R) * (1 / T2 - 1 / T1)) : NaN);

// =====================================================================
// 4. モンクマン・グラント(ε̇ は 1/h、t_r は h)
// =====================================================================
export const mgTr = (e, m, C) => (ok(e, m, C) && e > 0 && C > 0 ? C / e ** m : NaN);
export const mgC = (e, tr, m) => (ok(e, tr, m) && e > 0 && tr > 0 ? tr * e ** m : NaN);

// =====================================================================
// 5. ロビンソンの寿命消費則。rows: [{ t: 運転の時間 h, tr: その条件の破断時間 h }]
// =====================================================================
export function lifeFraction(rows) {
  const use = rows.filter(r => r.t > 0 && r.tr > 0);
  if (!use.length) return null;
  const fr = use.map(r => r.t / r.tr);
  const D = fr.reduce((a, b) => a + b, 0);
  const last = use[use.length - 1];
  return { fr, D, rem: 1 - D, remH: (1 - D) * last.tr, last };
}

// =====================================================================
// 6. 自分の試験点の線。pts: [{ s: MPa, T: K, tr: h }]、deg: 1 か 2、C: 数(固定)か null(C も当てはめる)
// P = b₀ + b₁x + b₂x²(x = log₁₀σ)とし、log t_r = P/T − C の残差の二乗和を最小にする(b と C について線形の最小二乗)
// =====================================================================
function lstsq(M, y) {
  // 正規方程式を部分ピボットのガウス消去で解く(列は高々 4)
  const k = M[0].length;
  const A = Array.from({ length: k }, (_, i) => Array.from({ length: k + 1 }, (_, j) => (j < k ? M.reduce((s, r) => s + r[i] * r[j], 0) : M.reduce((s, r, n) => s + r[i] * y[n], 0))));
  for (let c = 0; c < k; c++) {
    let p = c;
    for (let r = c + 1; r < k; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (Math.abs(A[p][c]) < 1e-300) return null;
    [A[c], A[p]] = [A[p], A[c]];
    for (let r = 0; r < k; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      for (let j = c; j <= k; j++) A[r][j] -= f * A[c][j];
    }
  }
  return A.map((r, i) => r[k] / r[i]);
}
export const curveP = (b, s) => (s > 0 ? b.reduce((a, bk, k) => a + bk * Math.log10(s) ** k, 0) : NaN);
export function fitCurve(pts, deg = 1, C = 20) {
  const use = pts.filter(p => p.s > 0 && p.T > 0 && p.tr > 0);
  const free = C == null;
  const np = deg + 1 + (free ? 1 : 0);
  if (use.length < np) return { error: 'few', need: np, n: use.length };
  if (free && new Set(use.map(p => p.T)).size < 2) return { error: 'temps', n: use.length };
  if (new Set(use.map(p => p.s)).size < deg + 1) return { error: 'stresses', n: use.length };
  // 列のスケールをそろえる(x^k/T は 1e-3 程度、C の列は 1)
  const M = use.map(p => { const x = Math.log10(p.s); return [...Array.from({ length: deg + 1 }, (_, k) => (x ** k / p.T) * 1000), ...(free ? [-1] : [])]; });
  const y = use.map(p => Math.log10(p.tr) + (free ? 0 : C));
  const sol = lstsq(M, y);
  if (!sol || !sol.every(Number.isFinite)) return { error: 'singular', n: use.length };
  const b = sol.slice(0, deg + 1).map(v => v * 1000);
  const Cf = free ? sol[deg + 1] : C;
  const res = use.map(p => Math.log10(p.tr) - (curveP(b, p.s) / p.T - Cf));
  const dof = use.length - np;
  const sd = dof > 0 ? Math.sqrt(res.reduce((a, r) => a + r * r, 0) / dof) : NaN;
  const P = use.map(p => p.T * (Cf + Math.log10(p.tr)));
  return { b, C: Cf, res, sd, dof, P, pts: use, sMin: Math.min(...use.map(p => p.s)), sMax: Math.max(...use.map(p => p.s)),
    pMin: Math.min(...P), pMax: Math.max(...P), tMax: Math.max(...use.map(p => p.tr)) };
}
export const curveTr = (f, s, T) => lmpTr(curveP(f.b, s), T, f.C);

// 例(値は計算のしかたを示すために作ったもの。実在の材料の測定データではない)
export const EXAMPLES = [
  { mode: 'lmp', sv: 'tt', tu: 'C', t: 600, tr: 100000, c: 20, tr2: 1000, t2: 650 },
  { mode: 'norton', nm: 'n', tu: 'C', nt1: 600, s1: 120, e1: '3e-5', s2: 150, e2: '1e-4', eu: 'h', qn: 300 },
  { mode: 'mg', mgm: 'ref', eu: 'h', mre: '1e-3', mrt: 80, mm: 1, me: '2e-5' },
  { mode: 'life', rs: 'lmp', tu: 'C', t: 650, tr: 2000, c: 20, lt1: 570, lh1: 40000, lt2: 590, lh2: 10000, lt3: 610, lh3: 2000, lt4: '', lh4: '' },
  { mode: 'cmp', tu: 'C', t: 700, tr: 1000, t2: 600, c: 20, q: 300, ta: 50, lta: 15 },
  { mode: 'fit', tu: 'C', deg: '2', cf: 'fix', c: 20, qs: 150, qt: 560,
    fs1: 250, ft1: 550, fr1: 3200, fs2: 200, ft2: 575, fr2: 4100, fs3: 160, ft3: 600, fr3: 3500, fs4: 120, ft4: 625, fr4: 3900, fs5: 90, ft5: 650, fr5: 2600, fs6: 200, ft6: 600, fr6: 650 },
];
// 単位を ℃ と K で切り替えるときに換算する温度の欄(T_a も温度)
export const TEMPS = ['t', 't2', 'ta', 'nt1', 'nt2', 'lt1', 'lt2', 'lt3', 'lt4', 'ft1', 'ft2', 'ft3', 'ft4', 'ft5', 'ft6', 'qt'];
export const NROWS = 4, NPTS = 6;

// =====================================================================
// 画面(ブラウザのときだけ)
// =====================================================================
const form = typeof document !== 'undefined' ? document.getElementById('creep-form') : null;
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
  const DEG = U.degc ?? '℃';

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
  // 有効数字 sig 桁。0.001 未満と 10⁵ 以上は a×10ⁿ(時間は 10⁵ h まで桁で読めるように)
  const sci = (v, sig = 3) => {
    if (v === Infinity) return '∞';
    if (v == null || !Number.isFinite(v)) return '–';
    if (v === 0) return '0';
    const a = Math.abs(v);
    if (a >= 1e-3 && a < 1e5) return minus(nfsig(sig).format(v));
    return expo(v, sig);
  };
  const fix = (v, d) => (v == null || !Number.isFinite(v) ? '–' : minus(nfd(d).format(v)));
  const inp = v => (Number.isFinite(v) ? minus(nfmax(6).format(v)) : '–');
  const numOf = name => {
    const s = String(E[name]?.value ?? '').trim().replace(',', '.');
    return s === '' ? NaN : Number(s);
  };
  const decFix = t => (lang === 'de' ? t.replace(/(\d)\.(\d)/g, '$1,$2') : t);
  const isK = () => E.tu.value === 'K';
  const kOf = name => { const v = numOf(name); return isK() ? v : v + K0; }; // 入れた温度を K に
  const tShow = k => (isK() ? k : k - K0); // K を表示の単位に
  const tu = () => (isK() ? 'K' : DEG);
  const kc = (k, d = 1) => `${fix(k - K0, d)} ${DEG} (${fix(k, d)} K)`; // 温度は ℃ と K の両方
  const hy = h => `${sci(h, 3)} h (${sci(h / HOURS_PER_YEAR, 3)} ${U.yr})`; // 時間は h と年
  const eu = () => (E.eu.value === 's' ? 's⁻¹' : 'h⁻¹');
  const kj = q => `${fix(q / 1000, 1)} kJ/mol`;

  // ---- 見た目(このツールだけ) ----
  const css = document.createElement('style');
  css.textContent = `
#creep-form .cr-wide { grid-column: 1 / -1; margin: 0; }
#creep-form .dy-field[hidden], #creep-form .cr-group[hidden] { display: none !important; }
@media (max-width: 480px) { #creep-form .dy-field:has(select:not([name=tu]):not([name=deg])) { grid-column: 1 / -1; } }
.cr-tabs { display: flex; flex-wrap: wrap; gap: 6px; }
.cr-tabs .btn { min-height: 40px; padding: 0 12px; }
.cr-tabs .btn[aria-pressed="true"] { background: var(--accent); color: var(--surface); border-color: var(--accent); }
.cr-ex { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.cr-ex .btn { min-height: 36px; padding: 0 12px; font-size: .85rem; }
.cr-group { grid-column: 1 / -1; border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; margin: 0; min-width: 0; }
.cr-group legend { font-size: .85rem; color: var(--muted); padding: 0 4px; }
.cr-rows { display: grid; gap: 6px; }
.cr-row { display: grid; grid-template-columns: 1.6em repeat(var(--cols), minmax(0, 1fr)); gap: 6px; align-items: end; }
.cr-row > span:first-child { font-size: .8rem; color: var(--muted); padding-bottom: 10px; }
.cr-row label { display: flex; flex-direction: column; gap: 2px; font-size: .78rem; color: var(--muted); min-width: 0; }
.cr-row input { width: 100%; min-width: 0; }
.cr-box { margin: 12px 0; padding: 10px 12px; border-radius: 8px; background: var(--bg); }
.cr-box h3 { margin: 0 0 6px; font-size: 1rem; }
.cr-box ul { margin: 4px 0; padding-left: 1.3em; line-height: 1.7; }
.cr-box p { margin: 4px 0; line-height: 1.7; }
.cr-main { font-size: 1.05rem; line-height: 1.7; margin: 0 0 10px; padding: 10px 12px; border-radius: 8px; background: var(--accent-soft); }
.cr-eq { font-family: var(--mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace); font-size: .88rem; line-height: 1.8; white-space: pre-wrap; overflow-wrap: anywhere; margin: 4px 0; }
.dy-stats .cr-sub { display: block; font-size: .72rem; font-weight: 500; color: var(--muted); }
.cr-warn { color: var(--text); border-left: 3px solid var(--accent-2); padding-left: 8px; }
.cr-tbl-wrap { overflow-x: auto; }
.cr-tbl { width: 100%; border-collapse: collapse; font-size: .86rem; }
.cr-tbl th, .cr-tbl td { text-align: left; padding: 5px 6px; border-bottom: 1px solid var(--border); vertical-align: top; }
.cr-tbl td.cr-num { white-space: nowrap; font-variant-numeric: tabular-nums; }
.cr-tbl thead th { font-size: .78rem; color: var(--muted); font-weight: 600; }
.cr-tbl tr.cr-on { background: var(--accent-soft); }
@media (max-width: 480px) { .cr-tbl th, .cr-tbl td { padding: 4px 3px; font-size: .78rem; } }
.cr-links { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0 0; }
.cr-cap { font-size: .82rem; color: var(--muted); margin: 0 0 4px; }
.cr-key { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: .8rem; color: var(--muted); margin: 2px 0 0; }
.cr-key span::before { content: ""; display: inline-block; width: 18px; height: 0; border-top: 3px solid var(--c); vertical-align: middle; margin-right: 5px; }
.cr-key span.cr-dash::before { border-top-style: dashed; }
`;
  document.head.append(css);

  const lab = n => E[n]?.closest('label');
  const setLab = (n, text) => { const s = lab(n)?.querySelector('span'); if (s) s.textContent = text; };

  // ---- タブ ----
  const MODES = ['lmp', 'cmp', 'norton', 'mg', 'life', 'fit'];
  lab('mode').hidden = true;
  const tabs = el('div', { class: 'cr-tabs cr-wide', role: 'group', 'aria-label': U.tabs_label },
    ...MODES.map(m => el('button', { type: 'button', class: 'btn btn-ghost', 'data-mode': m, 'aria-pressed': 'false' }, U[`tab_${m}`])));
  form.querySelector('h2').after(tabs);
  tabs.addEventListener('click', e => {
    const b = e.target.closest('[data-mode]');
    if (!b) return;
    E.mode.value = b.dataset.mode;
    form.dispatchEvent(new Event('change', { bubbles: true }));
  });

  // ---- 例 ----
  const ex = el('div', { class: 'cr-ex cr-wide' }, el('span', { class: 'muted' }, U.examples),
    ...EXAMPLES.map((x, i) => el('button', { type: 'button', class: 'btn btn-ghost', 'data-ex': String(i) }, U.ex[i])));
  tabs.after(ex);
  ex.after(el('p', { class: 'muted cr-wide', style: 'font-size:.85rem' }, U.ex_note));
  ex.addEventListener('click', e => {
    const b = e.target.closest('[data-ex]');
    if (!b) return;
    for (const [k, v] of Object.entries(EXAMPLES[Number(b.dataset.ex)])) if (E[k]) E[k].value = String(v);
    lastTu = E.tu.value;
    form.dispatchEvent(new Event('change', { bubbles: true }));
  });

  // ---- 行の入力(運転の期間・試験点)を表の形にまとめる ----
  const group = (legend, help, cols, names) => {
    const g = el('fieldset', { class: 'cr-group' }, el('legend', {}, legend));
    const rows = el('div', { class: 'cr-rows' });
    for (const [i, row] of names.entries()) {
      const r = el('div', { class: 'cr-row', style: `--cols:${cols.length}` }, el('span', {}, String(i + 1)));
      row.forEach((n, j) => {
        const input = E[n];
        const l = input.closest('label');
        const nl = el('label', {}, el('span', { 'data-col': String(j) }, cols[j]));
        input.setAttribute('aria-label', `${cols[j]} ${i + 1}`);
        nl.append(input);
        r.append(nl);
        l.remove();
      });
      rows.append(r);
    }
    g.append(rows);
    if (help) g.append(el('p', { class: 'muted', style: 'font-size:.82rem;margin:6px 0 0' }, help));
    return g;
  };
  const lifeRows = Array.from({ length: NROWS }, (_, i) => [`lt${i + 1}`, `lh${i + 1}`, `lr${i + 1}`]);
  const fitRows = Array.from({ length: NPTS }, (_, i) => [`fs${i + 1}`, `ft${i + 1}`, `fr${i + 1}`]);
  const lifeG = group(U.rows_legend, U.rows_help, [U.col_t, U.col_h, U.col_tr], lifeRows);
  const fitG = group(U.pts_legend, U.pts_help, [U.col_s, U.col_t, U.col_tr], fitRows);
  lab('rs').after(lifeG);
  lab('cf').after(fitG);
  const colSpans = g => [...g.querySelectorAll('[data-col]')];

  // ---- ℃ と K の切り替え: 入れてある温度を換算する ----
  let lastTu = E.tu.value;
  E.tu.addEventListener('change', () => {
    if (E.tu.value === lastTu) return;
    const d = E.tu.value === 'K' ? K0 : -K0;
    for (const n of TEMPS) {
      const v = numOf(n);
      if (Number.isFinite(v)) E[n].value = String(Math.round((v + d) * 1000) / 1000);
    }
    lastTu = E.tu.value;
  });

  // ---- 表示の切り替え ----
  const SHOW = {
    lmp: ['sv', 't', 'tr', 'p', 'c', 'tr2', 't2'],
    cmp: ['t', 'tr', 't2', 'c', 'q', 'ta', 'lta'],
    norton: ['nm', 's1', 's2', 'nt1', 'nt2', 'e1', 'e2', 'eu', 'n', 'qn', 'a'],
    mg: ['mgm', 'me', 'mm', 'mc', 'mre', 'mrt', 'eu'],
    life: ['rs', 't', 'tr', 'c'],
    fit: ['deg', 'cf', 'c', 'qs', 'qt'],
  };
  const NM = { n: ['s1', 's2', 'nt1', 'e1', 'e2', 'eu', 'qn'], q: ['s1', 'nt1', 'nt2', 'e1', 'e2', 'eu', 'n'], rate: ['s1', 'nt1', 'n', 'qn', 'a', 'eu'], ratio: ['s1', 's2', 'nt1', 'nt2', 'n', 'qn'] };
  const mode = () => (MODES.includes(E.mode.value) ? E.mode.value : 'lmp');
  function layout() {
    const m = mode();
    for (const b of tabs.querySelectorAll('[data-mode]')) b.setAttribute('aria-pressed', String(b.dataset.mode === m));
    const on = new Set(['tu', ...SHOW[m]]);
    if (m === 'lmp') { on.delete(E.sv.value === 'tt' ? 'p' : E.sv.value === 'pt' ? 'tr' : 't'); }
    if (m === 'norton') { for (const n of SHOW.norton) if (n !== 'nm' && !NM[E.nm.value]?.includes(n)) on.delete(n); }
    if (m === 'mg') { if (E.mgm.value === 'ref') on.delete('mc'); else { on.delete('mre'); on.delete('mrt'); } }
    if (m === 'life' && E.rs.value === 'dir') { on.delete('t'); on.delete('tr'); on.delete('c'); }
    if (m === 'fit' && E.cf.value === 'best') on.delete('c');
    if (m === 'mg' || (m === 'norton' && false)) on.delete('tu');
    for (const f of form.querySelectorAll('.dy-field')) {
      const n = f.querySelector('[name]')?.name;
      if (!n || n === 'mode') continue;
      f.hidden = !on.has(n);
    }
    lifeG.hidden = m !== 'life';
    fitG.hidden = m !== 'fit';
    // 欄の名前(モードと温度の単位で変わる)
    const u = tu();
    setLab('t', fill(m === 'lmp' ? U.t_lab : U.t_test, { u }));
    setLab('tr', m === 'lmp' ? U.tr_lab : U.tr_test);
    setLab('t2', fill(m === 'lmp' ? U.t2_lab : U.t2_cmp, { u }));
    setLab('ta', fill(U.ta_lab, { u }));
    setLab('nt1', fill(E.nm.value === 'n' || E.nm.value === 'rate' ? U.nt_same : U.nt1_lab, { u }));
    setLab('nt2', fill(U.nt2_lab, { u }));
    setLab('s1', E.nm.value === 'q' || E.nm.value === 'rate' ? U.s_same : U.s1_lab);
    setLab('e1', fill(U.e1_lab, { u: eu() }));
    setLab('e2', fill(U.e2_lab, { u: eu() }));
    setLab('a', fill(U.a_lab, { u: eu() }));
    setLab('me', U.me_lab);
    setLab('mre', U.mre_lab);
    setLab('qt', fill(U.qt_lab, { u }));
    const lc = colSpans(lifeG);
    lc.forEach(s => { const j = Number(s.dataset.col); s.textContent = j === 0 ? fill(U.col_t, { u }) : j === 1 ? U.col_h : U.col_tr; });
    for (let i = 1; i <= NROWS; i++) E[`lr${i}`].closest('label').hidden = E.rs.value !== 'dir';
    for (let i = 1; i <= NROWS; i++) E[`lt${i}`].closest('label').hidden = E.rs.value === 'dir';
    for (const r of lifeG.querySelectorAll('.cr-row')) r.style.setProperty('--cols', '2');
    colSpans(fitG).forEach(s => { const j = Number(s.dataset.col); s.textContent = j === 0 ? U.col_s : j === 1 ? fill(U.col_t, { u }) : U.col_tr; });
  }

  // ---- 部品 ----
  const stats = rows => el('dl', { class: 'dy-stats' }, ...rows.map(([k, v]) => el('div', {}, el('dt', {}, k), el('dd', {}, v))));
  const eq = (...lines) => el('p', { class: 'cr-eq' }, decFix(lines.filter(Boolean).join('\n')));
  const box = (h, ...kids) => el('div', { class: 'cr-box' }, h ? el('h3', {}, h) : null, ...kids);
  const warn = t => el('p', { class: 'cr-warn' }, t);
  const ul = list => el('ul', {}, ...list.map(s => el('li', {}, s)));
  const link = (href, text) => el('a', { href, target: '_blank', rel: 'noopener' }, text);
  const main = t => el('p', { class: 'cr-main' }, t);
  const twoLine = (a, b) => el('span', {}, a, el('small', { class: 'cr-sub' }, b));
  const tStat = k => twoLine(`${fix(k - K0, 1)} ${DEG}`, `${fix(k, 1)} K`);
  const hStat = h => twoLine(`${sci(h, 3)} h`, `${sci(h / HOURS_PER_YEAR, 3)} ${U.yr}`);
  const table = (cols, rows, on = -1) => el('div', { class: 'cr-tbl-wrap' }, el('table', { class: 'cr-tbl' },
    el('thead', {}, el('tr', {}, ...cols.map(c => el('th', { scope: 'col' }, c)))),
    el('tbody', {}, ...rows.map((r, i) => el('tr', { class: i === on ? 'cr-on' : null }, ...r.map((c, j) => (j === 0 ? el('th', { scope: 'row' }, c) : el('td', { class: 'cr-num' }, c))))))));
  const svg = document.getElementById('cr-chart');
  const cap = el('p', { class: 'cr-cap' });
  const key = el('div', { class: 'cr-key' });
  out('res').before(cap, svg, key); // 図を結果の上に置く(図を見ながら数を読む)
  const COL = { ac: 'var(--accent)', ac2: 'var(--ok)', dash: 'var(--muted)', ng: 'var(--ng)' };
  const chart = (opts, caption, keys = []) => {
    svg.hidden = false;
    lineChart(svg, opts);
    cap.textContent = caption;
    key.replaceChildren(...keys.map(([cls, t]) => el('span', { class: cls === 'dash' ? 'cr-dash' : null, style: `--c:${COL[cls]}` }, t)));
  };
  const noChart = () => { svg.hidden = true; svg.innerHTML = ''; cap.textContent = ''; key.replaceChildren(); };
  const range = (a, b, n = 60) => Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);
  const lrange = (a, b, n = 60) => range(Math.log10(a), Math.log10(b), n).map(v => 10 ** v);
  const extrapWarn = (res, tTest, tPred) => { if (tPred > tTest * 10) res.append(warn(fill(U.extrap_far, { r: sci(tPred / tTest, 2) }))); };

  // ---- 1. ラーソン・ミラー ----
  function renderLmp(res) {
    const C = numOf('c'), sv = E.sv.value;
    if (!Number.isFinite(C)) return res.append(warn(U.need_c));
    let Tk = kOf('t'), tr = numOf('tr'), P = numOf('p');
    if (sv === 'tt') { if (!(Tk > 0) || !(tr > 0)) return res.append(warn(U.need_ttr)); P = lmpP(Tk, tr, C); }
    else if (sv === 'pt') { if (!(P > 0) || !(Tk > 0)) return res.append(warn(U.need_pt)); tr = lmpTr(P, Tk, C); }
    else { if (!(P > 0) || !(tr > 0)) return res.append(warn(U.need_ptr)); if (!(C + Math.log10(tr) > 0)) return res.append(warn(U.need_ptr)); Tk = lmpT(P, tr, C); }
    const lg = Math.log10(tr);
    res.append(main(fill(sv === 'tt' ? U.lmp_main_p : sv === 'pt' ? U.lmp_main_tr : U.lmp_main_t, { p: fix(P, 0), t: kc(Tk), h: hy(tr), c: inp(C) })));
    if (Tk < K0) res.append(warn(U.cold));
    const tr2 = numOf('tr2'), T2in = kOf('t2');
    const T2 = tr2 > 0 ? lmpT(P, tr2, C) : NaN, tr2b = T2in > 0 ? lmpTr(P, T2in, C) : NaN;
    res.append(stats([[U.s_p, fix(P, 0)], [U.s_t, tStat(Tk)], [U.s_tr, hStat(tr)],
      ...(Number.isFinite(T2) ? [[fill(U.s_t2, { h: sci(tr2, 3) }), tStat(T2)]] : []),
      ...(Number.isFinite(tr2b) ? [[fill(U.s_tr2, { t: `${inp(tShow(T2in))} ${tu()}` }), hStat(tr2b)]] : [])]));
    const lines = [`T = ${sv === 'pr' ? `P/(C + log₁₀t_r) = ${fix(P, 1)}/(${inp(C)} + ${fix(lg, 4)})` : `${inp(tShow(Tk))} ${tu()}`} = ${fix(Tk, 2)} K`,
      `log₁₀t_r = ${sv === 'pt' ? `P/T − C = ${fix(P, 1)}/${fix(Tk, 2)} − ${inp(C)}` : `log₁₀(${sci(tr, 4)})`} = ${fix(lg, 4)}${sv === 'pt' ? `   → t_r = 10^${fix(lg, 4)} = ${sci(tr, 4)} h` : ''}`,
      sv === 'tt' ? `P = T(C + log₁₀t_r) = ${fix(Tk, 2)} × (${inp(C)} + ${fix(lg, 4)}) = ${fix(P, 1)}` : `P = ${fix(P, 1)}`];
    if (Number.isFinite(T2)) lines.push('', fill(U.eq_t2, { h: sci(tr2, 4) }), `T₂ = P/(C + log₁₀t₂) = ${fix(P, 1)}/(${inp(C)} + ${fix(Math.log10(tr2), 4)}) = ${fix(T2, 2)} K = ${fix(T2 - K0, 2)} ${DEG}`);
    if (Number.isFinite(tr2b)) lines.push('', fill(U.eq_tr2, { t: kc(T2in) }), `log₁₀t₂ = P/T₂ − C = ${fix(P, 1)}/${fix(T2in, 2)} − ${inp(C)} = ${fix(P / T2in - C, 4)}   → t₂ = ${sci(tr2b, 4)} h`);
    res.append(box(U.h_eq, el('p', {}, U.lmp_eq_lead), eq(...lines), el('p', { class: 'muted' }, U.k_note)));
    // 同じ P の組
    const times = [10, 100, 1000, 1e4, 3e4, 1e5, 2e5];
    const rows = times.map(h => { const Tq = lmpT(P, h, C); return [`${sci(h, 3)} h`, sci(h / HOURS_PER_YEAR, 3), fix(Tq - K0, 1), fix(Tq, 1)]; });
    const fac = lmpPerK(P, Tk, C, 10);
    res.append(box(fill(U.h_same, { p: fix(P, 0) }), table(U.same_cols, rows),
      el('p', {}, fill(U.per10k, { t: kc(Tk, 0), f: sci(fac, 3) })),
      el('p', {}, fill(U.lmp_q, { q: kj(lmpQ(P)) })),
      el('p', { class: 'muted' }, U.same_note)));
    if (Number.isFinite(T2) && tr2 > tr) extrapWarn(res, tr, tr2);
    if (Number.isFinite(tr2b) && tr2b > tr) extrapWarn(res, tr, tr2b);
    if (C < 10 || C > 35) res.append(warn(U.c_odd));
    res.append(box(U.h_caution, ul(U.lmp_cautions)));
    // log t_r–T の線(t_r が 1〜10⁶ h になる温度の範囲)
    const Ta = P / (C + 6), Tb = P / C;
    const pts = range(Ta, Tb).map(k => [tShow(k), lmpTr(P, k, C)]);
    const marks = [[tShow(Tk), tr, `${fix(tShow(Tk), 0)} ${tu()}`]];
    if (Number.isFinite(T2)) marks.push([tShow(T2), tr2, `${fix(tShow(T2), 0)} ${tu()}`]);
    if (Number.isFinite(tr2b)) marks.push([tShow(T2in), tr2b, '']);
    chart({ series: [{ points: pts, cls: 'ac' }], xlabel: `T (${tu()})`, ylabel: U.y_tr, ylog: true, marks }, fill(U.cap_lmp, { p: fix(P, 0), c: inp(C) }), [['ac', fill(U.key_lmp, { p: fix(P, 0) })]]);
  }

  // ---- 2. パラメータの比べ ----
  function renderCmp(res) {
    const C = numOf('c'), Q = numOf('q') * 1000, Ta = kOf('ta'), lta = numOf('lta');
    const T1 = kOf('t'), t1 = numOf('tr'), T2 = kOf('t2');
    if (!(T1 > 0) || !(t1 > 0) || !(T2 > 0)) return res.append(warn(U.need_cmp));
    if (!ok(C, Q, Ta, lta)) return res.append(warn(U.need_consts));
    const x = extrapolate(T1, t1, T2, { C, Q, Ta, lta });
    const vals = [x.lmp, x.osd, x.mh].filter(Number.isFinite);
    const spread = vals.length > 1 ? Math.max(...vals) / Math.min(...vals) : NaN;
    res.append(main(fill(U.cmp_main, { t1: kc(T1, 0), h1: sci(t1, 3), t2: kc(T2, 0), a: hy(x.lmp), b: hy(x.osd), c: Number.isFinite(x.mh) ? hy(x.mh) : '–', r: sci(spread, 2) })));
    if (!(T1 > Ta && T2 > Ta)) res.append(warn(U.mh_ta));
    res.append(stats([[U.s_lmp, hStat(x.lmp)], [U.s_osd, hStat(x.osd)], [U.s_mh, Number.isFinite(x.mh) ? hStat(x.mh) : '–'], [U.s_spread, `${sci(spread, 3)}×`]]));
    const lg1 = Math.log10(t1);
    res.append(box(U.h_eq, el('p', {}, U.cmp_eq_lead), eq(
      `T₁ = ${fix(T1, 2)} K, log₁₀t₁ = ${fix(lg1, 4)}, T₂ = ${fix(T2, 2)} K`,
      '',
      `LMP: P = T₁(C + log₁₀t₁) = ${fix(T1, 2)} × (${inp(C)} + ${fix(lg1, 4)}) = ${fix(x.P, 1)}`,
      `     log₁₀t₂ = P/T₂ − C = ${fix(x.P / T2 - C, 4)}   → t₂ = ${sci(x.lmp, 4)} h`,
      `OSD: P = log₁₀t₁ − Q/(2.303RT₁) = ${fix(lg1, 4)} − ${fix(Q, 0)}/(2.303 × 8.314 × ${fix(T1, 2)}) = ${fix(x.Po, 4)}`,
      `     log₁₀t₂ = P + Q/(2.303RT₂) = ${fix(Math.log10(x.osd), 4)}   → t₂ = ${sci(x.osd, 4)} h`,
      Number.isFinite(x.mh) ? `MH:  P = (log₁₀t₁ − log₁₀t_a)/(T₁ − T_a) = (${fix(lg1, 4)} − ${inp(lta)})/(${fix(T1, 2)} − ${fix(Ta, 2)}) = ${sci(x.Pm, 4)} K⁻¹` : 'MH:  –',
      Number.isFinite(x.mh) ? `     log₁₀t₂ = log₁₀t_a + P(T₂ − T_a) = ${fix(Math.log10(x.mh), 4)}   → t₂ = ${sci(x.mh, 4)} h` : ''),
      el('p', {}, fill(U.cmp_q, { q: kj(lmpQ(x.P)), q2: kj(Q) })),
      el('p', { class: 'muted' }, U.cmp_note)));
    res.append(box(U.h_lines, ul(U.lines_list)));
    if (Math.max(...vals) > t1) extrapWarn(res, t1, Math.max(...vals));
    res.append(box(U.h_caution, ul(U.cmp_cautions)));
    // 3本の線(試験点を通る)
    const lo = Math.min(T1, T2) - 40, hi = Math.max(T1, T2) + 40;
    const ks = range(lo, hi);
    const s1 = ks.map(k => [tShow(k), lmpTr(x.P, k, C)]);
    const s2 = ks.map(k => [tShow(k), osdTr(x.Po, k, Q)]);
    const s3 = Number.isFinite(x.Pm) ? ks.filter(k => k > Ta).map(k => [tShow(k), mhTr(x.Pm, k, Ta, lta)]) : [];
    chart({ series: [{ points: s1, cls: 'ac' }, { points: s2, cls: 'ac2' }, { points: s3, cls: 'dash' }], xlabel: `T (${tu()})`, ylabel: U.y_tr, ylog: true,
      marks: [[tShow(T1), t1, U.mk_test], [tShow(T2), x.lmp, ''], [tShow(T2), x.osd, ''], ...(Number.isFinite(x.mh) ? [[tShow(T2), x.mh, '']] : [])] },
    U.cap_cmp, [['ac', 'LMP'], ['ac2', 'OSD'], ['dash', 'MH']]);
  }

  // ---- 3. ノートン則 ----
  function renderNorton(res) {
    const m = E.nm.value;
    const k = E.eu.value === 's' ? 's⁻¹' : 'h⁻¹';
    const s1 = numOf('s1'), s2 = numOf('s2'), T1 = kOf('nt1'), T2 = kOf('nt2'), e1 = numOf('e1'), e2 = numOf('e2');
    const n = numOf('n'), Q = numOf('qn') * 1000, A = numOf('a');
    if (m === 'n') {
      if (!(s1 > 0 && s2 > 0 && e1 > 0 && e2 > 0) || s1 === s2) return res.append(warn(U.need_n));
      const nf = fitN(s1, e1, s2, e2);
      const Af = Number.isFinite(Q) && T1 > 0 ? nortonA(e1, s1, nf, Q, T1) : NaN;
      res.append(main(fill(U.n_main, { n: fix(nf, 2), t: T1 > 0 ? kc(T1, 0) : '–' })));
      res.append(stats([[U.s_n, fix(nf, 2)], [fill(U.s_a, { u: k }), sci(Af, 3)]]));
      res.append(box(U.h_eq, el('p', {}, U.n_eq_lead), eq(
        `n = ln(ε̇₂/ε̇₁)/ln(σ₂/σ₁) = ln(${sci(e2, 4)}/${sci(e1, 4)}) / ln(${inp(s2)}/${inp(s1)}) = ${fix(Math.log(e2 / e1), 4)} / ${fix(Math.log(s2 / s1), 4)} = ${fix(nf, 3)}`,
        Number.isFinite(Af) ? `A = ε̇₁/(σ₁ⁿ exp(−Q/RT)) = ${sci(e1, 4)} / (${inp(s1)}^${fix(nf, 3)} × exp(−${fix(Q, 0)}/(8.314 × ${fix(T1, 2)}))) = ${sci(Af, 4)} ${k}·MPa^−n` : ''),
        el('p', { class: 'muted' }, U.n_note)));
      res.append(box(U.h_mech, el('p', {}, fill(U.mech_lead, { n: fix(nf, 1) })), table(U.mech_cols, U.mech_rows), el('p', { class: 'muted' }, U.mech_note)));
      const sa = Math.min(s1, s2) / 1.5, sb = Math.max(s1, s2) * 1.5;
      chart({ series: [{ points: lrange(sa, sb).map(s => [s, e1 * (s / s1) ** nf]), cls: 'ac' }], xlabel: U.x_s, ylabel: fill(U.y_e, { u: k }), xlog: true, ylog: true,
        marks: [[s1, e1, '1'], [s2, e2, '2']] }, fill(U.cap_n, { n: fix(nf, 2) }), [['ac', fill(U.key_n, { n: fix(nf, 2) })]]);
    } else if (m === 'q') {
      if (!(T1 > 0 && T2 > 0 && e1 > 0 && e2 > 0) || T1 === T2) return res.append(warn(U.need_q));
      const Qf = fitQ(T1, e1, T2, e2);
      const Af = Number.isFinite(n) && s1 > 0 ? nortonA(e1, s1, n, Qf, T1) : NaN;
      res.append(main(fill(U.q_main, { q: kj(Qf), s: s1 > 0 ? inp(s1) : '–' })));
      res.append(stats([[U.s_q, kj(Qf)], [U.s_qev, `${fix(Qf / 96485.33212, 2)} eV`], [fill(U.s_a, { u: k }), sci(Af, 3)]]));
      res.append(box(U.h_eq, el('p', {}, U.q_eq_lead), eq(
        `Q = R ln(ε̇₂/ε̇₁)/(1/T₁ − 1/T₂) = 8.314 × ln(${sci(e2, 4)}/${sci(e1, 4)}) / (1/${fix(T1, 2)} − 1/${fix(T2, 2)})`,
        `  = 8.314 × ${fix(Math.log(e2 / e1), 4)} / ${sci(1 / T1 - 1 / T2, 4)} = ${fix(Qf, 0)} J/mol`,
        Number.isFinite(Af) ? `A = ε̇₁/(σⁿ exp(−Q/RT₁)) = ${sci(Af, 4)} ${k}·MPa^−n` : ''),
        el('p', { class: 'muted' }, U.q_note)));
      if (Qf <= 0) res.append(warn(U.q_neg));
      const ia = 1000 / Math.max(T1, T2) * 0.97, ib = 1000 / Math.min(T1, T2) * 1.03;
      chart({ series: [{ points: range(ia, ib).map(i => [i, e1 * Math.exp((-Qf / R) * (i / 1000 - 1 / T1))]), cls: 'ac' }], xlabel: U.x_invt, ylabel: fill(U.y_e, { u: k }), ylog: true,
        marks: [[1000 / T1, e1, '1'], [1000 / T2, e2, '2']] }, fill(U.cap_q, { q: kj(Qf) }), [['ac', U.key_q]]);
    } else if (m === 'rate') {
      if (!(A > 0 && s1 > 0 && T1 > 0) || !ok(n, Q)) return res.append(warn(U.need_rate));
      const e = nortonRate(A, s1, n, Q, T1);
      const eh = E.eu.value === 's' ? e * 3600 : e;
      res.append(main(fill(U.rate_main, { e: sci(e, 3), u: k, s: inp(s1), t: kc(T1, 0) })));
      res.append(stats([[fill(U.s_e, { u: k }), sci(e, 3)], [U.s_eh, `${sci(eh * 100, 3)} %/h`], [U.s_1pct, hy(0.01 / eh)]]));
      res.append(box(U.h_eq, el('p', {}, U.rate_eq_lead), eq(
        `ε̇ = Aσⁿ exp(−Q/RT) = ${sci(A, 4)} × ${inp(s1)}^${inp(n)} × exp(−${fix(Q, 0)}/(8.314 × ${fix(T1, 2)}))`,
        `  = ${sci(A, 4)} × ${sci(s1 ** n, 4)} × ${sci(Math.exp(-Q / (R * T1)), 4)} = ${sci(e, 4)} ${k}`),
        el('p', { class: 'muted' }, U.rate_note)));
      chart({ series: [{ points: lrange(s1 / 3, s1 * 3).map(s => [s, nortonRate(A, s, n, Q, T1)]), cls: 'ac' }], xlabel: U.x_s, ylabel: fill(U.y_e, { u: k }), xlog: true, ylog: true,
        marks: [[s1, e, '']] }, fill(U.cap_rate, { t: kc(T1, 0) }), [['ac', fill(U.key_rate, { n: inp(n) })]]);
    } else {
      if (!(s1 > 0 && s2 > 0 && T1 > 0 && T2 > 0) || !ok(n, Q)) return res.append(warn(U.need_ratio));
      const rs = (s2 / s1) ** n, rt = Math.exp((-Q / R) * (1 / T2 - 1 / T1)), r = rateRatio(s1, T1, s2, T2, n, Q);
      res.append(main(fill(U.ratio_main, { r: sci(r, 3), a: inp(s1), b: inp(s2), t1: kc(T1, 0), t2: kc(T2, 0) })));
      res.append(stats([[U.s_rs, `${sci(rs, 3)}×`], [U.s_rt, `${sci(rt, 3)}×`], [U.s_r, `${sci(r, 3)}×`], [U.s_rlife, `${sci(1 / r, 3)}×`]]));
      res.append(box(U.h_eq, el('p', {}, U.ratio_eq_lead), eq(
        `ε̇₂/ε̇₁ = (σ₂/σ₁)ⁿ × exp[−(Q/R)(1/T₂ − 1/T₁)]`,
        `  = (${inp(s2)}/${inp(s1)})^${inp(n)} × exp[−(${fix(Q, 0)}/8.314)(1/${fix(T2, 2)} − 1/${fix(T1, 2)})]`,
        `  = ${sci(rs, 4)} × ${sci(rt, 4)} = ${sci(r, 4)}`),
        el('p', { class: 'muted' }, U.ratio_note)));
      chart({ series: [{ points: range(0.5, 2).map(f => [f, rateRatio(1, T1, f, T2, n, Q)]), cls: 'ac' }, { points: range(0.5, 2).map(f => [f, rateRatio(1, T1, f, T1, n, Q)]), cls: 'dash' }],
        xlabel: U.x_sr, ylabel: U.y_r, ylog: true, marks: [[s2 / s1, r, '']] }, U.cap_ratio, [['ac', fill(U.key_ratio, { t: kc(T2, 0) })], ['dash', fill(U.key_ratio, { t: kc(T1, 0) })]]);
    }
    res.append(box(U.h_caution, ul(U.norton_cautions)));
  }

  // ---- 4. モンクマン・グラント ----
  function renderMg(res) {
    const toH = v => (E.eu.value === 's' ? v * 3600 : v); // 1/s → 1/h
    const k = eu();
    const m = numOf('mm'), e = toH(numOf('me'));
    if (!(m > 0) || !(e > 0)) return res.append(warn(U.need_mg));
    let C = numOf('mc'), refLine = '';
    if (E.mgm.value === 'ref') {
      const er = toH(numOf('mre')), trr = numOf('mrt');
      if (!(er > 0 && trr > 0)) return res.append(warn(U.need_mgref));
      C = mgC(er, trr, m);
      refLine = `C_MG = ε̇_ref^m · t_ref = (${sci(er, 4)} h⁻¹)^${inp(m)} × ${sci(trr, 4)} h = ${sci(C, 4)}`;
    } else if (!(C > 0)) return res.append(warn(U.need_mgc));
    const tr = mgTr(e, m, C);
    res.append(main(fill(U.mg_main, { e: sci(numOf('me'), 3), u: k, h: hy(tr), c: sci(C, 3), m: inp(m) })));
    res.append(stats([[U.s_tr, hStat(tr)], [U.s_cmg, sci(C, 3)], ...(m === 1 ? [[U.s_strain, `${sci(C * 100, 3)} %`]] : [])]));
    res.append(box(U.h_eq, el('p', {}, U.mg_eq_lead), eq(
      E.eu.value === 's' ? `ε̇_min = ${sci(numOf('me'), 4)} s⁻¹ × 3600 = ${sci(e, 4)} h⁻¹` : '',
      refLine,
      `t_r = C_MG/ε̇_min^m = ${sci(C, 4)} / (${sci(e, 4)})^${inp(m)} = ${sci(tr, 4)} h`),
      el('p', { class: 'muted' }, U.mg_note)));
    if (m !== 1) res.append(warn(U.mg_m));
    res.append(box(U.h_caution, ul(U.mg_cautions)));
    const ea = e / 100, eb = e * 100;
    chart({ series: [{ points: lrange(ea, eb).map(x => [E.eu.value === 's' ? x / 3600 : x, mgTr(x, m, C)]), cls: 'ac' }], xlabel: fill(U.x_e, { u: k }), ylabel: U.y_tr, xlog: true, ylog: true,
      marks: [[numOf('me'), tr, `${sci(tr, 2)} h`], ...(E.mgm.value === 'ref' ? [[numOf('mre'), numOf('mrt'), U.mk_ref]] : [])] }, U.cap_mg, [['ac', fill(U.key_mg, { m: inp(m) })]]);
  }

  // ---- 5. ロビンソン則 ----
  function renderLife(res) {
    const dir = E.rs.value === 'dir';
    const C = numOf('c'), Tt = kOf('t'), tt = numOf('tr');
    const P = dir ? NaN : lmpP(Tt, tt, C);
    if (!dir && !Number.isFinite(P)) return res.append(warn(U.need_life_lmp));
    const rows = [];
    for (let i = 1; i <= NROWS; i++) {
      const h = numOf(`lh${i}`);
      if (!(h > 0)) continue;
      const Ti = kOf(`lt${i}`);
      const tri = dir ? numOf(`lr${i}`) : Ti > 0 ? lmpTr(P, Ti, C) : NaN;
      rows.push({ i, t: h, tr: tri, T: Ti });
    }
    const L = lifeFraction(rows);
    if (!L || L.fr.length !== rows.length) return res.append(warn(dir ? U.need_life_dir : U.need_life));
    const pct = v => `${fix(v * 100, 1)} %`;
    res.append(main(fill(L.D >= 1 ? U.life_over : U.life_main, { d: pct(L.D), r: pct(Math.max(L.rem, 0)), h: hy(Math.max(L.remH, 0)), n: String(L.last.i) })));
    res.append(stats([[U.s_d, pct(L.D)], [U.s_rem, pct(Math.max(L.rem, 0))], [fill(U.s_remh, { n: String(L.last.i) }), L.rem > 0 ? hStat(L.remH) : '0'], [U.s_used, hStat(rows.reduce((a, r) => a + r.t, 0))]]));
    const head = [U.col_no, ...(dir ? [] : [U.col_tc]), U.col_h2, U.col_tr2, U.col_fr];
    const trows = rows.map((r, j) => [String(r.i), ...(dir ? [] : [kc(r.T, 0)]), sci(r.t, 3), sci(r.tr, 3), pct(L.fr[j])]);
    res.append(box(U.h_rows, table(head, trows)));
    res.append(box(U.h_eq, el('p', {}, dir ? U.life_eq_dir : U.life_eq_lmp), eq(
      dir ? '' : `P = T_test(C + log₁₀t_test) = ${fix(Tt, 2)} × (${inp(C)} + ${fix(Math.log10(tt), 4)}) = ${fix(P, 1)}`,
      ...(dir ? [] : rows.map(r => `t_r,${r.i} = 10^(P/T${r.i} − C) = 10^(${fix(P, 1)}/${fix(r.T, 2)} − ${inp(C)}) = ${sci(r.tr, 4)} h`)),
      `D = Σ tᵢ/t_r,ᵢ = ${rows.map((r, j) => `${sci(r.t, 4)}/${sci(r.tr, 4)}`).join(' + ')} = ${fix(L.D, 4)}`,
      `1 − D = ${fix(L.rem, 4)}${L.rem > 0 ? `   → ${fill(U.eq_rem, { n: String(L.last.i) })} (1 − D) × t_r,${L.last.i} = ${sci(L.remH, 4)} h` : ''}`),
      el('p', { class: 'muted' }, U.life_note)));
    if (L.D >= 1) res.append(warn(U.life_d1));
    res.append(box(U.h_caution, ul(U.life_cautions)));
    // 消費の積み上げ(横は運転の時間の合計)
    let ht = 0, d = 0;
    const pts = [[0, 0]];
    rows.forEach((r, j) => { ht += r.t; d += L.fr[j]; pts.push([ht, d]); });
    const xEnd = L.rem > 0 ? ht + L.remH : ht;
    chart({ series: [{ points: pts, cls: 'ac' }, ...(L.rem > 0 ? [{ points: [[ht, d], [xEnd, 1]], cls: 'dash' }] : []), { points: [[0, 1], [xEnd, 1]], cls: 'ng' }],
      xlabel: U.x_hours, ylabel: U.y_d, marks: rows.map((r, j) => [pts[j + 1][0], pts[j + 1][1], String(r.i)]) }, U.cap_life, [['ac', U.key_used], ['dash', fill(U.key_rem, { n: String(L.last.i) })], ['ng', 'D = 1']]);
  }

  // ---- 6. 自分の試験点の線 ----
  function renderFit(res) {
    const deg = E.deg.value === '2' ? 2 : 1, free = E.cf.value === 'best';
    const C = free ? null : numOf('c');
    if (!free && !Number.isFinite(C)) return res.append(warn(U.need_c));
    const pts = [];
    for (let i = 1; i <= NPTS; i++) {
      const s = numOf(`fs${i}`), Tk = kOf(`ft${i}`), tr = numOf(`fr${i}`);
      if (s > 0 && Tk > 0 && tr > 0) pts.push({ s, T: Tk, tr, i });
    }
    const f = fitCurve(pts, deg, C);
    if (f.error) return res.append(warn(fill(U[`fit_${f.error}`], { k: String(f.need ?? ''), n: String(f.n) }))), noChart();
    const qs = numOf('qs'), qT = kOf('qt');
    const Pq = qs > 0 ? curveP(f.b, qs) : NaN, trq = Number.isFinite(Pq) && qT > 0 ? lmpTr(Pq, qT, f.C) : NaN;
    const inS = qs >= f.sMin && qs <= f.sMax, inP = Pq >= f.pMin && Pq <= f.pMax;
    if (Number.isFinite(trq)) res.append(main(fill(U.fit_main, { s: inp(qs), t: kc(qT, 0), h: hy(trq), p: fix(Pq, 0) })));
    if (Number.isFinite(trq) && (!inS || !inP)) res.append(warn(fill(U.fit_out, { s1: inp(f.sMin), s2: inp(f.sMax), p1: fix(f.pMin, 0), p2: fix(f.pMax, 0) })));
    if (Number.isFinite(trq) && trq > f.tMax) extrapWarn(res, f.tMax, trq);
    const bTxt = f.b.map((b, k) => `b${'₀₁₂'[k]} = ${sci(b, 5)}`).join(', ');
    res.append(stats([[U.s_cfit, fix(f.C, 2)], [U.s_sd, Number.isFinite(f.sd) ? fix(f.sd, 3) : '–'], [U.s_scatter, Number.isFinite(f.sd) ? `${sci(10 ** f.sd, 3)}×` : '–'], [U.s_trq, Number.isFinite(trq) ? hStat(trq) : '–']]));
    const poly = deg === 2 ? 'b₀ + b₁x + b₂x²' : 'b₀ + b₁x';
    res.append(box(U.h_eq, el('p', {}, free ? U.fit_eq_free : U.fit_eq_fix), eq(
      `P(σ) = ${poly},  x = log₁₀(σ/MPa)`,
      bTxt + (free ? `, C = ${fix(f.C, 3)}` : ''),
      Number.isFinite(Pq) ? `P(${inp(qs)} MPa) = ${fix(Pq, 1)}   → log₁₀t_r = P/T − C = ${fix(Pq, 1)}/${fix(qT, 2)} − ${fix(f.C, 3)} = ${fix(Math.log10(trq), 4)}   → t_r = ${sci(trq, 4)} h` : ''),
      el('p', { class: 'muted' }, U.fit_note)));
    const trows = f.pts.map((p, j) => [String(p.i), inp(p.s), kc(p.T, 0), sci(p.tr, 3), fix(f.P[j], 0), fix(f.res[j], 3)]);
    res.append(box(U.h_pts, table(U.pts_cols, trows), el('p', { class: 'muted' }, U.pts_note)));
    if (f.dof === 0) res.append(warn(U.fit_dof0));
    res.append(box(U.h_caution, ul(U.fit_cautions)));
    const pa = f.pMin - (f.pMax - f.pMin) * 0.05, pb = f.pMax + (f.pMax - f.pMin) * 0.05;
    // 横軸は P。線は σ の範囲で P(σ) を描く(2次で σ について単調でないところは描かない)
    const line = lrange(f.sMin, f.sMax).map(s => [curveP(f.b, s), s]).filter(([p]) => p >= pa - (pb - pa) && p <= pb + (pb - pa));
    chart({ series: [{ points: line, cls: 'ac' }], xlabel: U.x_p, ylabel: U.x_s, ylog: true,
      marks: [...f.pts.map(p => [p.T * (f.C + Math.log10(p.tr)), p.s, String(p.i)]), ...(Number.isFinite(Pq) ? [[Pq, qs, U.mk_q]] : [])] },
    fill(U.cap_fit, { c: fix(f.C, 2) }), [['ac', fill(U.key_fit, { d: String(deg) })]]);
  }

  // ---- 出典 ----
  const SRCS = {
    lm: ['https://scilit.com/publications/537bad79c4a7fa3be1fa7abd8e2d9ec8', 'Larson & Miller, Trans. ASME 74 (1952) 765'],
    mh: ['https://digital.library.unt.edu/ark:/67531/metadc56933/', 'Manson & Haferd, NACA TN 2890 (1953)'],
    ab: ['https://doi.org/10.5772/intechopen.71826', 'Abdallah et al., Creep Lifing Models and Techniques (IntechOpen 2018)'],
    sa: ['https://doi.org/10.1007/978-3-031-49507-6_2', 'Sandström, Basic Modeling and Theory of Creep of Metallic Materials, ch. 2 (Springer 2024)'],
    wh: ['https://doi.org/10.5772/intechopen.71829', 'Whittaker et al., A Modern Philosophy for Creep Lifing (IntechOpen 2018)'],
    bo: ['https://publikationen.bibliothek.kit.edu/270012594', 'Bocek, KfK 2699 (1978)'],
    e139: ['https://store.astm.org/e0139-24.html', 'ASTM E139-24'],
  };
  const SRC_OF = { lmp: ['lm', 'mh', 'e139'], cmp: ['lm', 'mh', 'ab'], norton: ['sa'], mg: ['sa', 'ab', 'wh'], life: ['bo', 'lm'], fit: ['lm', 'ab'] };
  const srcList = m => el('p', { class: 'muted' }, U.src_h, ' ', ...SRC_OF[m].flatMap((k, i) => [i ? ' · ' : '', link(...SRCS[k])]), ...(U.src_more?.[m] ? [' ', U.src_more[m]] : []));

  function render() {
    layout();
    const res = out('res');
    res.replaceChildren();
    const m = mode();
    noChart();
    ({ lmp: renderLmp, cmp: renderCmp, norton: renderNorton, mg: renderMg, life: renderLife, fit: renderFit })[m](res);
    res.append(srcList(m));
    res.append(el('div', { class: 'cr-links' },
      el('a', { class: 'btn btn-ghost', href: `${home}term/creep/` }, U.l_term),
      el('a', { class: 'btn btn-ghost', href: `${home}term/larson-miller-parameter/` }, U.l_lmp),
      ...(m === 'norton' ? [el('a', { class: 'btn btn-ghost', href: `${home}term/power-law-creep/` }, U.l_plc), el('a', { class: 'btn btn-ghost', href: `${home}term/deformation-mechanism-map/` }, U.l_dmm)] : []),
      el('a', { class: 'btn btn-ghost', href: `${home}formulas/#f-${m === 'norton' ? 'creep' : 'larson-miller'}` }, U.l_formula),
      ...(m === 'lmp' || m === 'cmp' ? [el('a', { class: 'btn btn-ghost', href: `${home}drill/?t=larson-miller` }, U.l_drill)] : []),
      el('a', { class: 'btn btn-ghost', href: `${home}tools/fatigue-life-calculator/` }, U.l_fatigue),
      ...(m === 'norton' ? [el('a', { class: 'btn btn-ghost', href: `${home}tools/diffusion-coefficient-calculator/` }, U.l_diff)] : []),
      el('a', { class: 'btn btn-ghost', href: `${home}c/high-temperature/` }, U.l_cat)));
  }
  // URL で空にした欄(使わない行・使わない欄)は空のまま戻す。tool-share.js は空の値を読まずに既定値を残し、
  // 先に URL を書き換えるので、開いたときの URL(navigation の name)から読む
  try {
    const url0 = performance.getEntriesByType?.('navigation')?.[0]?.name || location.href;
    let n0 = 0;
    for (const [k, v] of new URL(url0).searchParams) if (v.trim() === '' && E[k]?.tagName === 'INPUT' && E[k].value !== '') { E[k].value = ''; n0++; }
    if (n0) setTimeout(() => form.dispatchEvent(new Event('change', { bubbles: true }))); // URL を今の欄に合わせ直す
  } catch { /* 読めなくても続ける */ }
  form.addEventListener('submit', e => e.preventDefault());
  form.addEventListener('input', () => setTimeout(render));
  form.addEventListener('change', () => setTimeout(render));
  render();
}
