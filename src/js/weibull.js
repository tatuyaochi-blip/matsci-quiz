// ワイブル解析ラボ。次を計算して、式に値を代入した形とグラフを見せる。
//   1. データから m と σ₀: 強さを小さい順に並べ、破壊確率 F の推定((i − 0.3)/(n + 0.4)・i/(n + 1)・(i − 0.5)/n)から
//      ワイブルプロット(x = ln σ、y = ln ln(1/(1 − F)))の回帰直線(y を x に回帰)と、最尤法(MLE)の m・σ₀ を出して比べる
//   2. 破壊確率と強さ: F(σ) = 1 − exp[−(σ/σ₀)^m]、ある F での強さ σ = σ₀[−ln(1 − F)]^(1/m)、平均 σ₀Γ(1 + 1/m)、中央値 σ₀(ln 2)^(1/m)
//   3. 寸法効果: 有効体積 V_E(単軸引張 V、3点曲げ bdL/[2(m + 1)²]、4点曲げ bdL(mL_i/L + 1)/[2(m + 1)²])と σ₁/σ₂ = (V_E2/V_E1)^(1/m)
// 2母数(しきい値なし)のワイブル分布。応力は MPa、寸法は mm。
// 式の出典は data/tools/weibull.json の text.{言語}.js.ui の src_* と、review の check/sources.md。
// 計算の関数(parseData・estF・regress・mle・gamma・failProb・strengthAt・meanStrength・medianStrength・cov・
// effVolume・sizeScale)は DOM なしで import できる(検算: review の check/calc_weibull.py と check/js_results.mjs)。
import { lineChart } from './chart.js';

const ok = (...v) => v.every(Number.isFinite);

// =====================================================================
// データの読み取り。dec: 'dot'(小数点は「.」、区切りはコンマ・空白・改行・セミコロン・タブ)か
// 'comma'(小数点は「,」、区切りは空白・改行・セミコロン・タブ。「.」を含む語は読まない)
// =====================================================================
const NUM_DOT = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
const NUM_COMMA = /^[+-]?(?:\d+(?:,\d*)?|,\d+)(?:[eE][+-]?\d+)?$/;
export function parseData(text, dec = 'dot') {
  const s = String(text ?? '').replace(/^﻿/, '').replace(/[−–]/g, '-');
  const toks = s.split(dec === 'comma' ? /[\s;]+/ : /[\s,;]+/).filter(Boolean);
  const values = [], bad = [];
  for (const t of toks) {
    if (dec === 'comma' ? NUM_COMMA.test(t) : NUM_DOT.test(t)) values.push(Number(dec === 'comma' ? t.replace(',', '.') : t));
    else bad.push(t);
  }
  return { values, bad };
}

// =====================================================================
// 破壊確率の推定(i は 1 から、小さい順)
// =====================================================================
export const EST = {
  med: (i, n) => (i - 0.3) / (n + 0.4), // メジアンランク(ベナードの近似)
  mean: (i, n) => i / (n + 1), // 平均ランク
  hazen: (i, n) => (i - 0.5) / n, // (i − 0.5)/n
};
export const estF = (i, n, est = 'med') => (EST[est] ?? EST.med)(i, n);
export const wy = F => Math.log(-Math.log1p(-F)); // ln ln(1/(1 − F))

// データの検査。返り値の error: 'few'(5 個未満)・'neg'(0 以下の値)・'same'(全部同じ)
export const MIN_N = 5;
function check(values) {
  const v = values.filter(Number.isFinite);
  if (v.some(x => x <= 0)) return { error: 'neg', n: v.length, bad: v.filter(x => x <= 0) };
  if (v.length < MIN_N) return { error: 'few', n: v.length };
  if (Math.max(...v) === Math.min(...v)) return { error: 'same', n: v.length };
  return null;
}

// 回帰: y = ln ln(1/(1 − F)) を x = ln σ に回帰(縦の偏差の二乗和を最小)。m = 傾き、σ₀ = exp(−切片/m)
// rev は参考: x を y に回帰(横の偏差を最小)したときの m
export function regress(values, est = 'med') {
  const e = check(values);
  if (e) return e;
  const s = values.filter(Number.isFinite).slice().sort((a, b) => a - b), n = s.length;
  const x = s.map(Math.log), F = s.map((_, k) => estF(k + 1, n, est)), y = F.map(wy);
  const mx = x.reduce((a, b) => a + b, 0) / n, my = y.reduce((a, b) => a + b, 0) / n;
  let sxx = 0, sxy = 0, syy = 0;
  for (let k = 0; k < n; k++) { sxx += (x[k] - mx) ** 2; sxy += (x[k] - mx) * (y[k] - my); syy += (y[k] - my) ** 2; }
  const m = sxy / sxx, b = my - m * mx;
  return { n, sorted: s, x, y, F, mx, my, sxx, sxy, syy, m, b, s0: Math.exp(-b / m), r2: (sxy * sxy) / (sxx * syy), mRev: syy / sxy };
}

// 最尤法: g(m) = Σσᵢ^m ln σᵢ / Σσᵢ^m − 1/m − (1/n)Σ ln σᵢ = 0 を解き、σ₀ = (Σσᵢ^m / n)^(1/m)
// σ を最大値で割って桁あふれを防ぐ(g は割っても変わらない)。g は m について増える関数なので、
// ln m で区間 [10⁻³, 10⁴] を二分法で絞り、最後はニュートン法で仕上げる。m が 10⁴ を超えるなら 'big'
export const M_LO = 1e-3, M_HI = 1e4;
export function mle(values) {
  const e = check(values);
  if (e) return e;
  const v = values.filter(Number.isFinite), n = v.length, mx = Math.max(...v);
  const u = v.map(x => Math.log(x / mx)); // ≤ 0
  const ubar = u.reduce((a, b) => a + b, 0) / n;
  const parts = m => { let s0 = 0, s1 = 0, s2 = 0; for (const t of u) { const w = Math.exp(m * t); s0 += w; s1 += w * t; s2 += w * t * t; } return { s0, s1, s2 }; };
  const g = m => { const { s0, s1 } = parts(m); return s1 / s0 - 1 / m - ubar; };
  const dg = m => { const { s0, s1, s2 } = parts(m); return s2 / s0 - (s1 / s0) ** 2 + 1 / (m * m); };
  if (g(M_HI) < 0) return { error: 'big', n };
  if (g(M_LO) > 0) return { error: 'small', n };
  let lo = Math.log(M_LO), hi = Math.log(M_HI), it = 0;
  while (hi - lo > 1e-6 && it < 200) { const mid = (lo + hi) / 2; if (g(Math.exp(mid)) < 0) lo = mid; else hi = mid; it++; }
  let m = Math.exp((lo + hi) / 2), conv = false;
  for (let k = 0; k < 50; k++) {
    const d = g(m) / dg(m);
    const m2 = m - d;
    it++;
    if (!(m2 > 0) || !Number.isFinite(m2)) break;
    m = m2;
    if (Math.abs(d) <= 1e-13 * m) { conv = true; break; }
  }
  if (!conv && Math.abs(g(m)) > 1e-10) return { error: 'noconv', n };
  const { s0 } = parts(m);
  return { n, m, s0: mx * (s0 / n) ** (1 / m), it, g: g(m) };
}

// =====================================================================
// ガンマ関数(ランチョスの近似、g = 7・9 項。z > 0 で相対誤差はおよそ 10⁻¹⁵。check/calc_weibull.py で math.gamma と比べた)
// =====================================================================
const LZ = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
  12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
export function gamma(z) {
  if (!Number.isFinite(z)) return NaN;
  if (z < 0.5) return Math.PI / (Math.sin(Math.PI * z) * gamma(1 - z));
  z -= 1;
  let x = LZ[0];
  for (let i = 1; i < 9; i++) x += LZ[i] / (z + i);
  const t = z + 7.5;
  return Math.sqrt(2 * Math.PI) * x * Math.exp((z + 0.5) * Math.log(t) - t); // 冪と exp を1つにまとめて z ≈ 171 まで桁あふれしない
}

// =====================================================================
// 2. 破壊確率と強さ(σ・σ₀ は MPa、F は 0〜1)
// =====================================================================
const good = (m, s0) => ok(m, s0) && m > 0 && s0 > 0;
export const failProb = (s, m, s0) => (good(m, s0) && Number.isFinite(s) && s >= 0 ? -Math.expm1(-((s / s0) ** m)) : NaN);
export const strengthAt = (F, m, s0) => (good(m, s0) && F > 0 && F < 1 ? s0 * (-Math.log1p(-F)) ** (1 / m) : NaN);
export const meanStrength = (m, s0) => (good(m, s0) ? s0 * gamma(1 + 1 / m) : NaN);
export const medianStrength = (m, s0) => (good(m, s0) ? s0 * Math.LN2 ** (1 / m) : NaN);
// 変動係数(標準偏差/平均)= √[Γ(1 + 2/m) − Γ(1 + 1/m)²] / Γ(1 + 1/m)
export const cov = m => { if (!(m > 0)) return NaN; const g1 = gamma(1 + 1 / m), g2 = gamma(1 + 2 / m); return Math.sqrt(Math.max(g2 - g1 * g1, 0)) / g1; };

// =====================================================================
// 3. 寸法効果。geo: 't3'(3点曲げ)・'q4'(4点曲げ 1/4 点、L_i = L/2)・'h4'(4点曲げ 1/3 点、L_i = L/3)・
// 'ten'(単軸引張。b × d の断面で長さ L のゲージ部)・'v'(V_E を直接)。b・d・L は mm、L は曲げでは外側の支点間距離
// =====================================================================
export const LI = { q4: 1 / 2, h4: 1 / 3 };
export function effVolume(geo, m, { b, d, L, v } = {}) {
  if (geo === 'v') return v > 0 ? { ve: v, vol: NaN, k: NaN } : null;
  if (!(m > 0) || !(b > 0) || !(d > 0) || !(L > 0)) return null;
  const vol = b * d * L;
  const k = geo === 'ten' ? 1 : geo === 't3' ? 1 / (2 * (m + 1) ** 2) : LI[geo] ? (m * LI[geo] + 1) / (2 * (m + 1) ** 2) : NaN;
  return Number.isFinite(k) ? { ve: k * vol, vol, k } : null;
}
// σ₂ = σ₁(V_E1/V_E2)^(1/m)
export const sizeScale = (s1, ve1, ve2, m) => (ok(s1, ve1, ve2, m) && ve1 > 0 && ve2 > 0 && m > 0 ? s1 * (ve1 / ve2) ** (1 / m) : NaN);

// 例(値は計算のしかたを示すために作ったもの。実在の材料の測定データではない)
export const SAMPLE = [384, 300, 298, 371, 313, 372, 318, 334, 301, 347, 385, 429, 372, 393, 390, 331, 398, 369, 378, 371];
export const EXAMPLES = [
  { mode: 'fit', est: 'med', data: SAMPLE },
  { mode: 'fit', est: 'hazen', data: SAMPLE, focus: 'cmp' },
  { mode: 'prob', pm: 11.3, ps0: 374, psig: 300, pf: 0.1, pm2: '' },
  { mode: 'size', sm: 11.3, ss1: 374, g1: 't3', b1: 4, d1: 3, l1: 30, v1: '', g2: 'ten', b2: 10, d2: 10, l2: 50, v2: '' },
  { mode: 'size', sm: 11.3, ss1: 374, g1: 't3', b1: 4, d1: 3, l1: 40, v1: '', g2: 'q4', b2: 4, d2: 3, l2: 40, v2: '' },
  { mode: 'prob', pm: 5, ps0: 400, psig: 300, pf: 0.1, pm2: 20 },
];
// URL に入れるデータの長さの上限(文字数)
export const URL_MAX = 1800;
export const encodeData = values => values.map(v => String(v)).join('_');
export const decodeData = s => String(s ?? '').split('_').filter(Boolean).map(Number).filter(Number.isFinite);

// =====================================================================
// 画面(ブラウザのときだけ)
// =====================================================================
const form = typeof document !== 'undefined' ? document.getElementById('weibull-form') : null;
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
  // 有効数字 sig 桁。0.001 未満と 10⁶ 以上は a×10ⁿ
  const sci = (v, sig = 3) => {
    if (v === Infinity) return '∞';
    if (v == null || !Number.isFinite(v)) return '–';
    if (v === 0) return '0';
    const a = Math.abs(v);
    if (a >= 1e-3 && a < 1e6) return minus(nfsig(sig).format(v));
    return expo(v, sig);
  };
  const fix = (v, d) => (v == null || !Number.isFinite(v) ? '–' : minus(nfd(d).format(v)));
  const inp = v => (Number.isFinite(v) ? minus(nfmax(6).format(v)) : '–');
  // 百分率: 0.01 % 未満は a×10ⁿ %
  const nfsigmax = sig => new Intl.NumberFormat(lang, { maximumSignificantDigits: sig, useGrouping: false });
  const pct = (F, sig = 3) => (Number.isFinite(F) ? `${F > 0 && F < 1e-4 ? expo(F * 100, sig) : minus(nfsigmax(sig).format(F * 100))} %` : '–');
  const numOf = name => {
    const s = String(E[name]?.value ?? '').trim().replace(',', '.');
    return s === '' ? NaN : Number(s);
  };
  const decFix = t => (lang === 'de' ? t.replace(/(\d)\.(\d)/g, '$1,$2') : t);
  const mpa = v => `${sci(v, 4)} MPa`;

  // ---- 見た目(このツールだけ) ----
  const css = document.createElement('style');
  css.textContent = `
#weibull-form .wb-wide { grid-column: 1 / -1; margin: 0; }
#weibull-form .dy-field[hidden], #weibull-form .wb-wide[hidden] { display: none !important; }
#weibull-form .dy-field:has(select[name=est]) { grid-column: 1 / -1; }
#weibull-form .dy-field:has(select[name=dec]), #weibull-form .dy-field:has(select[name=g1]), #weibull-form .dy-field:has(select[name=g2]) { grid-column: span 2; }
@media (max-width: 480px) { #weibull-form .dy-field:has(select) { grid-column: 1 / -1; } }
.wb-tabs { display: flex; flex-wrap: wrap; gap: 6px; }
.wb-tabs .btn { min-height: 40px; padding: 0 12px; }
.wb-tabs .btn[aria-pressed="true"] { background: var(--accent); color: #fff; border-color: var(--accent); }
.wb-ex { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.wb-ex .btn { min-height: 36px; padding: 0 12px; font-size: .85rem; }
.wb-paste { display: flex; flex-direction: column; gap: 4px; font-size: .88rem; color: var(--muted); }
.wb-paste textarea { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: .9rem; line-height: 1.5; color: var(--text); background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; width: 100%; min-height: 7em; resize: vertical; box-sizing: border-box; }
.wb-read { font-size: .85rem; color: var(--muted); }
.wb-sub { font-size: .85rem; font-weight: 700; color: var(--text); }
.wb-box { margin: 12px 0; padding: 10px 12px; border-radius: 8px; background: var(--bg); }
.wb-box h3 { margin: 0 0 6px; font-size: 1rem; }
.wb-box ul { margin: 4px 0; padding-left: 1.3em; line-height: 1.7; }
.wb-box p { margin: 4px 0; line-height: 1.7; }
.wb-main { font-size: 1.05rem; line-height: 1.7; margin: 0 0 10px; padding: 10px 12px; border-radius: 8px; background: var(--accent-soft); }
.wb-eq { font-family: var(--mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace); font-size: .88rem; line-height: 1.8; white-space: pre-wrap; overflow-wrap: anywhere; margin: 4px 0; }
.dy-stats .wb-subv { display: block; font-size: .72rem; font-weight: 500; color: var(--muted); }
.wb-warn { color: var(--text); border-left: 3px solid var(--accent-2); padding-left: 8px; }
.wb-tbl-wrap { overflow-x: auto; }
.wb-tbl { width: 100%; border-collapse: collapse; font-size: .86rem; }
.wb-tbl th, .wb-tbl td { text-align: left; padding: 5px 6px; border-bottom: 1px solid var(--border); vertical-align: top; }
.wb-tbl td.wb-num { white-space: nowrap; font-variant-numeric: tabular-nums; }
.wb-tbl thead th { font-size: .78rem; color: var(--muted); font-weight: 600; }
.wb-tbl tr.wb-on { background: var(--accent-soft); }
@media (max-width: 480px) { .wb-tbl th, .wb-tbl td { padding: 4px 3px; font-size: .78rem; } }
.wb-links { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0 0; }
.wb-cap { font-size: .82rem; color: var(--muted); margin: 0 0 4px; }
.wb-key { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: .8rem; color: var(--muted); margin: 2px 0 0; }
.wb-key span::before { content: ""; display: inline-block; width: 18px; height: 0; border-top: 3px solid var(--c); vertical-align: middle; margin-right: 5px; }
.wb-key span.wb-dash::before { border-top-style: dashed; }
.wb-key span.wb-dot::before { width: 9px; height: 9px; border: 0; border-radius: 50%; background: var(--c); }
.wb-scroll { max-height: 22em; overflow-y: auto; }
`;
  document.head.append(css);

  const lab = n => E[n]?.closest('label');
  const setLab = (n, text) => { const s = lab(n)?.querySelector('span'); if (s) s.textContent = text; };

  // ---- タブ ----
  const MODES = ['fit', 'prob', 'size'];
  lab('mode').hidden = true;
  const tabs = el('div', { class: 'wb-tabs wb-wide', role: 'group', 'aria-label': U.tabs_label },
    ...MODES.map(m => el('button', { type: 'button', class: 'btn btn-ghost', 'data-mode': m, 'aria-pressed': 'false' }, U[`tab_${m}`])));
  form.querySelector('h2').after(tabs);
  tabs.addEventListener('click', e => {
    const b = e.target.closest('[data-mode]');
    if (!b) return;
    E.mode.value = b.dataset.mode;
    form.dispatchEvent(new Event('change', { bubbles: true }));
  });

  // ---- データの貼り付け欄 ----
  // de では貼り付けの小数点の既定をコンマにする(ドイツ語の表計算から貼った 412,5 を 412 と 5 に分けて読まないため)。
  // tool-share.js が既定と比べられるよう defaultSelected も移す。URL に dec があればそちらに従う
  if (lang === 'de') {
    let urlDec = null;
    try { urlDec = new URL(performance.getEntriesByType?.('navigation')?.[0]?.name || location.href).searchParams.get('dec'); } catch { /* 読めなくても続ける */ }
    for (const o of E.dec.options) o.defaultSelected = o.value === 'comma';
    E.dec.value = urlDec === 'dot' || urlDec === 'comma' ? urlDec : 'comma';
  }
  const fmtIn = v => (E.dec.value === 'comma' ? String(v).replace('.', ',') : String(v));
  const joinIn = vs => vs.map(fmtIn).join(E.dec.value === 'comma' ? ' ' : ', ');
  const ta = el('textarea', { name: 'data', rows: '5', spellcheck: 'false', autocomplete: 'off', autocapitalize: 'off', placeholder: U.paste_ph });
  ta.value = joinIn(SAMPLE);
  const DEFAULT_TEXT = ta.value;
  const paste = el('label', { class: 'wb-paste wb-wide' }, el('span', {}, U.paste), ta);
  const readP = el('p', { class: 'wb-read wb-wide', 'aria-live': 'polite' });
  const pasteHelp = el('p', { class: 'wb-read wb-wide' }, U.paste_help);
  lab('dec').after(paste, readP, pasteHelp);
  const fitOnly = [paste, readP, pasteHelp];
  // 小数点の記号を切り替えたら、欄の数を書き直す(読めた数だけ)
  let lastDec = E.dec.value;
  E.dec.addEventListener('change', () => {
    if (E.dec.value === lastDec) return;
    // 新しい記号でそのまま読めるなら書き換えない(読み方を直すために切り替えた)。読めない語が出るときだけ、前の記号で読んだ数を書き直す
    const P = parseData(ta.value, lastDec), Q = parseData(ta.value, E.dec.value);
    lastDec = E.dec.value;
    if (Q.bad.length && P.values.length && !P.bad.length) ta.value = joinIn(P.values);
  });

  // ---- 寸法効果の見出し ----
  const sub1 = el('p', { class: 'wb-sub wb-wide' }, U.sub_1), sub2 = el('p', { class: 'wb-sub wb-wide' }, U.sub_2);
  lab('g1').before(sub1);
  lab('g2').before(sub2);

  // ---- 例 ----
  const ex = el('div', { class: 'wb-ex wb-wide' }, el('span', { class: 'muted' }, U.examples),
    ...EXAMPLES.map((x, i) => el('button', { type: 'button', class: 'btn btn-ghost', 'data-ex': String(i) }, U.ex[i])));
  tabs.after(ex);
  ex.after(el('p', { class: 'muted wb-wide', style: 'font-size:.85rem' }, U.ex_note));
  let focus = null;
  ex.addEventListener('click', e => {
    const b = e.target.closest('[data-ex]');
    if (!b) return;
    const x = EXAMPLES[Number(b.dataset.ex)];
    for (const [k, v] of Object.entries(x)) if (E[k] && k !== 'data') E[k].value = String(v);
    lastDec = E.dec.value;
    if (x.data) ta.value = joinIn(x.data);
    focus = x.focus ?? null;
    form.dispatchEvent(new Event('change', { bubbles: true }));
  });

  // ---- 表示の切り替え ----
  const SHOW = { fit: ['est', 'dec'], prob: ['pm', 'ps0', 'psig', 'pf', 'pm2'], size: ['sm', 'ss1', 'g1', 'b1', 'd1', 'l1', 'v1', 'g2', 'b2', 'd2', 'l2', 'v2'] };
  const mode = () => (MODES.includes(E.mode.value) ? E.mode.value : 'fit');
  function layout() {
    const m = mode();
    for (const b of tabs.querySelectorAll('[data-mode]')) b.setAttribute('aria-pressed', String(b.dataset.mode === m));
    const on = new Set(SHOW[m]);
    if (m === 'size') for (const k of ['1', '2']) {
      if (E[`g${k}`].value === 'v') { on.delete(`b${k}`); on.delete(`d${k}`); on.delete(`l${k}`); } else on.delete(`v${k}`);
    }
    for (const f of form.querySelectorAll('.dy-field')) {
      const n = f.querySelector('[name]')?.name;
      if (!n || n === 'mode' || n === 'data') continue;
      f.hidden = !on.has(n);
    }
    for (const x of fitOnly) x.hidden = m !== 'fit';
    sub1.hidden = sub2.hidden = m !== 'size';
    for (const k of ['1', '2']) {
      const ten = E[`g${k}`].value === 'ten';
      setLab(`b${k}`, ten ? U.b_ten : U.b_bend);
      setLab(`d${k}`, ten ? U.d_ten : U.d_bend);
      setLab(`l${k}`, ten ? U.l_ten : U.l_bend);
    }
  }

  // ---- URL での共有: データは d=値_値_… として足す(tool-share.js は数の欄と選択肢だけを URL に入れる) ----
  let shareNote = '';
  function syncData() {
    const P = parseData(ta.value, E.dec.value);
    const same = ta.value.trim() === DEFAULT_TEXT.trim();
    const enc = encodeData(P.values);
    const u = new URL(location.href);
    u.searchParams.delete('d');
    shareNote = '';
    if (!same) {
      if (enc.length <= URL_MAX) u.searchParams.set('d', enc);
      else shareNote = fill(U.share_long, { n: String(P.values.length) });
    }
    const q = u.searchParams.toString();
    history.replaceState(history.state, '', u.pathname + (q ? `?${q}` : '') + u.hash);
    document.querySelectorAll('.lang-switch a').forEach(a => { a.search = q ? `?${q}` : ''; });
  }

  // ---- 部品 ----
  const stats = rows => el('dl', { class: 'dy-stats' }, ...rows.map(([k, v]) => el('div', {}, el('dt', {}, k), el('dd', {}, v))));
  const eq = (...lines) => el('p', { class: 'wb-eq' }, decFix(lines.filter(x => x != null && x !== false).join('\n')));
  const box = (h, ...kids) => el('div', { class: 'wb-box' }, h ? el('h3', {}, h) : null, ...kids);
  const warn = t => el('p', { class: 'wb-warn' }, t);
  const ul = list => el('ul', {}, ...list.map(s => el('li', {}, s)));
  const link = (href, text) => el('a', { href, target: '_blank', rel: 'noopener' }, text);
  const main = t => el('p', { class: 'wb-main' }, t);
  const twoLine = (a, b) => el('span', {}, a, el('small', { class: 'wb-subv' }, b));
  const table = (cols, rows, on = -1, cls = '') => el('div', { class: `wb-tbl-wrap ${cls}` }, el('table', { class: 'wb-tbl' },
    el('thead', {}, el('tr', {}, ...cols.map(c => el('th', { scope: 'col' }, c)))),
    el('tbody', {}, ...rows.map((r, i) => el('tr', { class: i === on ? 'wb-on' : null }, ...r.map((c, j) => (j === 0 ? el('th', { scope: 'row' }, c) : el('td', { class: 'wb-num' }, c))))))));
  const svg = document.getElementById('wb-chart');
  const cap = el('p', { class: 'wb-cap' });
  const key = el('div', { class: 'wb-key' });
  out('res').before(cap, svg, key); // 図を結果の上に置く
  const COL = { ac: 'var(--accent)', ac2: 'var(--ok)', dash: 'var(--muted)', ng: 'var(--ng)' };
  const chart = (opts, caption, keys = []) => {
    svg.hidden = false;
    lineChart(svg, opts);
    cap.textContent = caption;
    key.replaceChildren(...keys.map(([cls, t, k]) => el('span', { class: k === 'dash' ? 'wb-dash' : k === 'dot' ? 'wb-dot' : null, style: `--c:${COL[cls]}` }, t)));
  };
  const noChart = () => { svg.hidden = true; svg.innerHTML = ''; cap.textContent = ''; key.replaceChildren(); };
  const range = (a, b, n = 80) => Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);
  const estName = k => U[`est_${k}`];

  // ---- 1. データから m と σ₀ ----
  function renderFit(res) {
    const est = EST[E.est.value] ? E.est.value : 'med';
    const P = parseData(ta.value, E.dec.value);
    readP.textContent = P.values.length
      ? fill(U.read, { n: String(P.values.length), a: inp(Math.min(...P.values)), b: inp(Math.max(...P.values)) })
      : U.read_none;
    if (P.bad.length) res.append(warn(fill(U.bad_tok, { t: P.bad.slice(0, 5).join('  '), n: String(P.bad.length) })));
    // 小数点の記号の取り違えの疑い: 「.」のときに、コンマがすべて数字に挟まれていて(「412,5」の形)、空白・改行の区切りもあり、
    // 空白・改行で分けた語のどれもコンマを2つ以上含まない(「384,300,298」の行は、コンマ区切りの表とみて注意を出さない)
    const nc = (ta.value.match(/,/g) ?? []).length, tight = (ta.value.match(/\d,\d/g) ?? []).length;
    const oneComma = ta.value.split(/[\s;]+/).every(w => (w.match(/,/g) ?? []).length <= 1);
    if (E.dec.value === 'dot' && nc > 0 && nc === tight && oneComma && /\d[\s;]+[-+.]?\d/.test(ta.value)) res.append(warn(U.maybe_comma));
    const r = regress(P.values, est), q = mle(P.values);
    if (r.error) { noChart(); return res.append(warn(fill(U[`err_${r.error}`], { n: String(r.n), k: String(MIN_N), v: (r.bad ?? []).slice(0, 5).map(inp).join(', ') }))); }
    if (shareNote) res.append(warn(shareNote));
    const mOk = !q.error;
    res.append(main(mOk
      ? fill(U.fit_main, { n: String(r.n), m: fix(q.m, 2), s: fix(q.s0, 1), mr: fix(r.m, 2), sr: fix(r.s0, 1), e: estName(est), r2: fix(r.r2, 4) })
      : fill(U.fit_main_reg, { n: String(r.n), mr: fix(r.m, 2), sr: fix(r.s0, 1), e: estName(est), r2: fix(r.r2, 4) })));
    if (!mOk) res.append(warn(U[`mle_${q.error}`]));
    if (r.n < 10) res.append(warn(fill(U.few_n, { n: String(r.n) })));
    const v = r.sorted, mean = v.reduce((a, b) => a + b, 0) / r.n, sd = Math.sqrt(v.reduce((a, b) => a + (b - mean) ** 2, 0) / (r.n - 1));
    res.append(stats([[U.s_n, String(r.n)], [U.s_m_mle, mOk ? fix(q.m, 2) : '–'], [U.s_s0_mle, mOk ? `${fix(q.s0, 1)} MPa` : '–'],
      [fill(U.s_m_reg, { e: estName(est) }), fix(r.m, 2)], [U.s_s0_reg, `${fix(r.s0, 1)} MPa`], [U.s_r2, fix(r.r2, 4)],
      [U.s_mean, twoLine(`${fix(mean, 1)} MPa`, fill(U.s_sd, { s: fix(sd, 1), c: fix((sd / mean) * 100, 1) }))]]));
    // 比べの表: 3つの推定の回帰・参考の逆向きの回帰・最尤法
    const rows = Object.keys(EST).map(k => { const x = regress(P.values, k); return [fill(U.row_reg, { e: estName(k) }), fix(x.m, 2), fix(x.s0, 1), fix(x.r2, 4)]; });
    rows.push([fill(U.row_rev, { e: estName(est) }), fix(r.mRev, 2), fix(Math.exp(r.mx - r.my / r.mRev), 1), fix(r.r2, 4)]);
    rows.push([U.row_mle, mOk ? fix(q.m, 2) : '–', mOk ? fix(q.s0, 1) : '–', '–']);
    const cmpBox = box(U.h_cmp, table(U.cmp_cols, rows, Object.keys(EST).indexOf(est)),
      mOk ? el('p', {}, fill(U.cmp_diff, { d: fix(((r.m - q.m) / q.m) * 100, 1), s: fix(((r.s0 - q.s0) / q.s0) * 100, 2) })) : null,
      el('p', { class: 'muted' }, U.cmp_note));
    // 式
    const k1 = 0, kn = r.n - 1;
    const mleLines = mOk ? [
      '', U.eq_mle,
      `Σσᵢ^m ln σᵢ / Σσᵢ^m − 1/m − (1/n)Σ ln σᵢ = 0   → m = ${fix(q.m, 4)}${fill(U.eq_it, { k: String(q.it) })}`,
      `σ₀ = (Σσᵢ^m / n)^(1/m) = ${fix(q.s0, 3)} MPa`] : [];
    res.append(box(U.h_eq, el('p', {}, U.fit_eq_lead), eq(
      fill(U.eq_sort, { a: inp(v[0]), b: inp(v[kn]) }),
      `F₁ = ${fill(U[`eqf_${est}`], { i: '1', n: String(r.n) })} = ${fix(r.F[k1], 5)}   → y₁ = ln ln(1/(1 − F₁)) = ${fix(r.y[k1], 4)},  x₁ = ln ${inp(v[0])} = ${fix(r.x[k1], 4)}`,
      `F${r.n} = ${fill(U[`eqf_${est}`], { i: String(r.n), n: String(r.n) })} = ${fix(r.F[kn], 5)}   → y${r.n} = ${fix(r.y[kn], 4)},  x${r.n} = ${fix(r.x[kn], 4)}`,
      `x̄ = ${fix(r.mx, 5)},  ȳ = ${fix(r.my, 5)},  Sxx = ${fix(r.sxx, 6)},  Sxy = ${fix(r.sxy, 6)},  Syy = ${fix(r.syy, 5)}`,
      `m = Sxy/Sxx = ${fix(r.m, 4)},  ${U.eq_icpt} b = ȳ − m x̄ = ${fix(r.b, 4)}`,
      `σ₀ = exp(−b/m) = exp(${fix(-r.b / r.m, 5)}) = ${fix(r.s0, 3)} MPa,  R² = Sxy²/(Sxx·Syy) = ${fix(r.r2, 4)}`,
      ...mleLines), el('p', { class: 'muted' }, U.fit_eq_note)));
    if (focus === 'cmp') res.prepend(cmpBox); else res.append(cmpBox);
    if (r.r2 < 0.9) res.append(warn(U.low_r2));
    // データの表
    const drows = v.map((s, k) => [String(k + 1), inp(s), fix(r.F[k], 4), fix(r.x[k], 4), fix(r.y[k], 4)]);
    res.append(box(U.h_data, table(U.data_cols, drows, -1, r.n > 25 ? 'wb-scroll' : ''), el('p', { class: 'muted' }, fill(U.data_note, { e: estName(est) }))));
    if (mOk) {
      const go = el('button', { type: 'button', class: 'btn btn-ghost' }, U.to_prob);
      go.addEventListener('click', () => {
        E.mode.value = 'prob'; E.pm.value = String(Number(q.m.toFixed(2))); E.ps0.value = String(Number(q.s0.toFixed(1)));
        form.dispatchEvent(new Event('change', { bubbles: true }));
        window.scrollTo({ top: form.getBoundingClientRect().top + window.scrollY - 8 });
      });
      res.append(el('p', {}, go));
    }
    res.append(box(U.h_caution, ul(U.fit_cautions)));
    // ワイブルプロット
    const xa = r.x[0], xb = r.x[kn], pad = (xb - xa) * 0.08;
    const xs = [xa - pad, xb + pad];
    const ys = r.y.concat(xs.map(x => r.m * x + r.b), mOk ? xs.map(x => q.m * (x - Math.log(q.s0))) : []);
    chart({ series: [{ points: xs.map(x => [x, r.m * x + r.b]), cls: 'ac' }, ...(mOk ? [{ points: xs.map(x => [x, q.m * (x - Math.log(q.s0))]), cls: 'dash' }] : [])],
      xlabel: U.x_ln, ylabel: U.y_ln, ymin: Math.min(...ys) - 0.1, marks: r.x.map((x, k) => [x, r.y[k], '']) },
    fill(U.cap_fit, { a: inp(v[0]), b: inp(v[kn]) }), [['ng', fill(U.key_pts, { e: estName(est) }), 'dot'], ['ac', U.key_reg], ...(mOk ? [['dash', U.key_mle, 'dash']] : [])]);
  }

  // ---- 2. 破壊確率と強さ ----
  const FS = [0.5, 0.1, 0.01, 0.001, 1e-4, 1e-6];
  function renderProb(res) {
    const m = numOf('pm'), s0 = numOf('ps0'), sg = numOf('psig'), Fp = numOf('pf'), m2 = numOf('pm2');
    if (!(m > 0) || !(s0 > 0)) { noChart(); return res.append(warn(U.need_ms)); }
    const F = failProb(sg, m, s0), Ft = Fp / 100, sF = strengthAt(Ft, m, s0);
    const g1 = gamma(1 + 1 / m), mean = meanStrength(m, s0), med = medianStrength(m, s0), c = cov(m);
    const parts = [];
    if (Number.isFinite(F)) parts.push(fill(U.prob_main_f, { s: inp(sg), f: pct(F) }));
    if (Number.isFinite(sF)) parts.push(fill(U.prob_main_s, { f: pct(Ft), s: mpa(sF), r: fix(sF / s0, 3) }));
    res.append(main(parts.length ? parts.join(' ') : fill(U.prob_main_none, { m: inp(m), s: inp(s0) })));
    if (Number.isFinite(Fp) && !(Ft > 0 && Ft < 1)) res.append(warn(U.need_f));
    if (m > 60 || m < 1) res.append(warn(U.m_odd));
    res.append(stats([[U.s_f, Number.isFinite(F) ? pct(F) : '–'], [fill(U.s_sf, { f: Number.isFinite(sF) ? pct(Ft) : 'F' }), Number.isFinite(sF) ? mpa(sF) : '–'],
      [U.s_meanw, mpa(mean)], [U.s_med, mpa(med)], [U.s_cov, `${fix(c * 100, 1)} %`], [U.s_g, fix(g1, 5)]]));
    const lines = [
      Number.isFinite(F) ? `F(${inp(sg)}) = 1 − exp[−(${inp(sg)}/${inp(s0)})^${inp(m)}] = 1 − exp(−${sci((sg / s0) ** m, 5)}) = ${sci(F, 5)}` : null,
      Number.isFinite(sF) ? `σ(F = ${sci(Ft, 4)}) = σ₀[−ln(1 − F)]^(1/m) = ${inp(s0)} × (${sci(-Math.log1p(-Ft), 5)})^(1/${inp(m)}) = ${fix(sF, 2)} MPa` : null,
      `${U.eq_mean} σ₀Γ(1 + 1/m) = ${inp(s0)} × Γ(${fix(1 + 1 / m, 5)}) = ${inp(s0)} × ${fix(g1, 6)} = ${fix(mean, 2)} MPa`,
      `${U.eq_med} σ₀(ln 2)^(1/m) = ${inp(s0)} × ${fix(Math.LN2 ** (1 / m), 6)} = ${fix(med, 2)} MPa`,
      `${U.eq_cov} √[Γ(1 + 2/m) − Γ(1 + 1/m)²]/Γ(1 + 1/m) = √(${fix(gamma(1 + 2 / m), 6)} − ${fix(g1, 6)}²)/${fix(g1, 6)} = ${fix(c, 4)}`];
    res.append(box(U.h_eq, el('p', {}, U.prob_eq_lead), eq(...lines), el('p', { class: 'muted' }, U.prob_eq_note)));
    const two = m2 > 0;
    const cols = two ? [U.col_f, fill(U.col_sm, { m: inp(m) }), fill(U.col_sm, { m: inp(m2) })] : [U.col_f, U.col_s, U.col_r];
    const rows = FS.map(f => (two ? [pct(f), mpa(strengthAt(f, m, s0)), mpa(strengthAt(f, m2, s0))] : [pct(f), mpa(strengthAt(f, m, s0)), fix(strengthAt(f, m, s0) / s0, 3)]));
    if (two) rows.push([U.row_mean, mpa(mean), mpa(meanStrength(m2, s0))], [U.row_cov, `${fix(c * 100, 1)} %`, `${fix(cov(m2) * 100, 1)} %`]);
    res.append(box(two ? fill(U.h_two, { a: inp(m), b: inp(m2), s: inp(s0) }) : U.h_table, table(cols, rows),
      two ? el('p', {}, fill(U.two_note, { a: inp(m), b: inp(m2), f: pct(1e-3), ra: fix(strengthAt(1e-3, m, s0) / s0, 3), rb: fix(strengthAt(1e-3, m2, s0) / s0, 3) })) : null,
      el('p', { class: 'muted' }, U.table_note)));
    res.append(box(U.h_read, ul(U.read_m)));
    res.append(box(U.h_caution, ul(U.prob_cautions)));
    // F–σ の曲線
    const smax = Math.max(s0 * 1.4, Number.isFinite(sg) ? sg * 1.1 : 0);
    const curve = mm => range(0, smax, 160).map(s => [s, failProb(s, mm, s0) * 100]);
    chart({ series: [{ points: curve(m), cls: 'ac' }, ...(two ? [{ points: curve(m2), cls: 'ac2' }] : []), { points: [[s0, 0], [s0, 100]], cls: 'dash' }],
      xlabel: U.x_s, ylabel: U.y_f, ymin: 0, marks: Number.isFinite(F) ? [[sg, F * 100, pct(F, 2)]] : [] },
    fill(U.cap_prob, { s: inp(s0) }), [['ac', `m = ${inp(m)}`], ...(two ? [['ac2', `m = ${inp(m2)}`]] : []), ['dash', 'σ = σ₀', 'dash']]);
  }

  // ---- 3. 寸法効果 ----
  function renderSize(res) {
    const m = numOf('sm'), s1 = numOf('ss1');
    if (!(m > 0)) { noChart(); return res.append(warn(U.need_m)); }
    const geo = k => ({ g: E[`g${k}`].value, dims: { b: numOf(`b${k}`), d: numOf(`d${k}`), L: numOf(`l${k}`), v: numOf(`v${k}`) } });
    const A = geo('1'), B = geo('2');
    const va = effVolume(A.g, m, A.dims), vb = effVolume(B.g, m, B.dims);
    if (!va || !vb) { noChart(); return res.append(warn(U.need_dims)); }
    const ratio = (va.ve / vb.ve) ** (1 / m), s2 = sizeScale(s1, va.ve, vb.ve, m);
    const gname = g => U[`g1_${g}`];
    res.append(main(Number.isFinite(s2)
      ? fill(U.size_main, { a: gname(A.g), b: gname(B.g), s1: inp(s1), s2: mpa(s2), r: fix(ratio, 3), m: inp(m) })
      : fill(U.size_main_r, { a: gname(A.g), b: gname(B.g), r: fix(ratio, 3), m: inp(m) })));
    if (m > 60 || m < 1) res.append(warn(U.m_odd));
    res.append(stats([[U.s_ve1, `${sci(va.ve, 4)} mm³`], [U.s_ve2, `${sci(vb.ve, 4)} mm³`], [U.s_vr, sci(vb.ve / va.ve, 4)],
      [U.s_ratio, fix(ratio, 4)], [U.s_s2, Number.isFinite(s2) ? mpa(s2) : '–']]));
    const veLine = (k, x, v) => {
      const { b, d, L } = x.dims;
      if (x.g === 'v') return `V_E${k} = ${sci(v.ve, 5)} mm³ (${U.eq_given})`;
      const base = `V${k} = b·d·L = ${inp(b)} × ${inp(d)} × ${inp(L)} = ${sci(v.vol, 5)} mm³`;
      const f = x.g === 'ten' ? 'V_E = V' : x.g === 't3' ? `V_E = V/[2(m + 1)²] = ${sci(v.vol, 5)}/[2 × ${fix(m + 1, 3)}²]`
        : `V_E = V(m·L_i/L + 1)/[2(m + 1)²] = ${sci(v.vol, 5)} × (${inp(m)} × ${x.g === 'q4' ? '1/2' : '1/3'} + 1)/[2 × ${fix(m + 1, 3)}²]`;
      return `${base}\n${f} = ${sci(v.ve, 5)} mm³   (V_E/V = ${sci(v.k, 4)})`;
    };
    res.append(box(U.h_eq, el('p', {}, U.size_eq_lead), eq(veLine('1', A, va), veLine('2', B, vb),
      `σ₂/σ₁ = (V_E1/V_E2)^(1/m) = (${sci(va.ve, 5)}/${sci(vb.ve, 5)})^(1/${inp(m)}) = ${fix(ratio, 4)}`,
      Number.isFinite(s2) ? `σ₂ = ${inp(s1)} × ${fix(ratio, 4)} = ${fix(s2, 2)} MPa` : null), el('p', { class: 'muted' }, U.size_eq_note)));
    if (A.g !== 'v' && B.g !== 'v' && A.g !== B.g && ['t3', 'q4', 'h4'].includes(A.g) && ['t3', 'q4', 'h4'].includes(B.g)
      && A.dims.b === B.dims.b && A.dims.d === B.dims.d && A.dims.L === B.dims.L) res.append(box(U.h_bend, el('p', {}, fill(U.bend_note, { a: gname(A.g), b: gname(B.g), r: fix(1 / ratio, 3) }))));
    res.append(box(U.h_caution, ul(U.size_cautions)));
    // σ₂/σ₁ と m(V_E も m で変わる)
    const ms = range(2, 40, 76).filter(x => effVolume(A.g, x, A.dims) && effVolume(B.g, x, B.dims));
    chart({ series: [{ points: ms.map(x => [x, (effVolume(A.g, x, A.dims).ve / effVolume(B.g, x, B.dims).ve) ** (1 / x)]), cls: 'ac' }, { points: [[2, 1], [40, 1]], cls: 'dash' }],
      xlabel: U.x_m, ylabel: U.y_ratio, ymin: Math.min(0.9, ...ms.map(x => (effVolume(A.g, x, A.dims).ve / effVolume(B.g, x, B.dims).ve) ** (1 / x))) * 0.98,
      marks: [[m, ratio, `m = ${inp(m)}`]].filter(([x]) => x >= 2 && x <= 40) },
    fill(U.cap_size, { a: gname(A.g), b: gname(B.g) }), [['ac', U.key_ratio], ['dash', U.key_one, 'dash']]);
  }

  // ---- 出典 ----
  const SRCS = {
    qq: ['https://pmc.ncbi.nlm.nih.gov/articles/PMC3086645/', 'Quinn & Quinn, Dent. Mater. 26 (2010) 135'],
    q03: ['https://www.nist.gov/publications/weibull-strength-scaling-standardized-rectangular-flexure-specimens', 'Quinn, J. Am. Ceram. Soc. 86 (2003)'],
    c1239: ['https://store.astm.org/c1239-26.html', 'ASTM C1239'],
    iso: ['https://www.iso.org/standard/69875.html', 'ISO 20501:2019'],
    c1683: ['https://standards.iteh.ai/catalog/standards/astm/0ae0062d-af5a-4fcc-86e6-cae43ea696b3/astm-c1683-10-2019', 'ASTM C1683'],
    nist: ['https://www.itl.nist.gov/div898/handbook/eda/section3/weibplot.htm', 'NIST/SEMATECH e-Handbook 1.3.3.30'],
    pp: ['https://reliability.readthedocs.io/en/latest/How%20are%20the%20plotting%20positions%20calculated.html', U.src_pp],
    ms: ['https://arxiv.org/abs/2209.14567', 'Makalic & Schmidt (arXiv:2209.14567)'],
    nasa: ['https://ntrs.nasa.gov/api/citations/20200002758/downloads/20200002758.pdf', 'Arndt et al. (NASA NTRS 20200002758)'],
    guo: ['https://doi.org/10.3390/ma10111271', 'Guo et al., Materials 10 (2017) 1271'],
    w51: ['https://doi.org/10.1115/1.4010337', 'Weibull, J. Appl. Mech. 18 (1951) 293'],
  };
  const SRC_OF = { fit: ['w51', 'qq', 'nist', 'pp', 'ms', 'c1239', 'iso'], prob: ['w51', 'qq', 'guo'], size: ['qq', 'nasa', 'c1683', 'q03'] };
  const srcList = m => el('p', { class: 'muted' }, U.src_h, ' ', ...SRC_OF[m].flatMap((k, i) => [i ? ' · ' : '', link(...SRCS[k])]));

  function render() {
    layout();
    const res = out('res');
    res.replaceChildren();
    const m = mode();
    noChart();
    syncData();
    ({ fit: renderFit, prob: renderProb, size: renderSize })[m](res);
    res.append(srcList(m));
    res.append(el('div', { class: 'wb-links' },
      el('a', { class: 'btn btn-ghost', href: `${home}term/weibull-modulus/` }, U.l_term),
      ...(m === 'size' ? [] : [el('a', { class: 'btn btn-ghost', href: `${home}term/griffith-theory/` }, U.l_griffith)]),
      el('a', { class: 'btn btn-ghost', href: `${home}term/fracture-toughness/` }, U.l_kic),
      el('a', { class: 'btn btn-ghost', href: `${home}formulas/#f-weibull` }, U.l_formula),
      ...(U.l_learn ? [el('a', { class: 'btn btn-ghost', href: `${home}learn/why-metals-bend-and-glass-breaks/` }, U.l_learn)] : []),
      el('a', { class: 'btn btn-ghost', href: `${home}tools/${U.thermal_slug}/` }, U.l_thermal),
      el('a', { class: 'btn btn-ghost', href: `${home}c/ceramics/` }, U.l_cat)));
  }
  // URL のデータ(d)と、空にした欄を戻す。tool-share.js は空の値を読まずに既定値を残し、
  // 先に URL を書き換えるので、開いたときの URL(navigation の name)から読む
  try {
    const url0 = performance.getEntriesByType?.('navigation')?.[0]?.name || location.href;
    const sp = new URL(url0).searchParams;
    let n0 = 0;
    for (const [k, v] of sp) if (v.trim() === '' && E[k]?.tagName === 'INPUT' && E[k].value !== '') { E[k].value = ''; n0++; }
    if (sp.has('d')) { lastDec = E.dec.value; ta.value = joinIn(decodeData(sp.get('d'))); }
    // 空にした欄を戻したら、tool-share.js が書いた URL(空の欄に既定値が入っている)を今の欄に合わせ直す(creep.js と同じ)
    if (n0) setTimeout(() => form.dispatchEvent(new Event('change', { bubbles: true })));
  } catch { /* 読めなくても続ける */ }
  form.addEventListener('submit', e => e.preventDefault());
  form.addEventListener('input', () => { focus = null; setTimeout(render); });
  form.addEventListener('change', () => setTimeout(render));
  render();
}
