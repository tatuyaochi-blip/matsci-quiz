// 高分子の計算。4つの計算を1つのページで行い、使った式と、値を代入した形を見せる(実験レポートに写せるように)。
//   1. 分子量の平均: 分子量 Mᵢ と本数 nᵢ(または質量 wᵢ)の表から Mn・Mw・Mz・分散度 Đ = Mw/Mn
//   2. 逐次重合の重合度: カロザースの式 Xn = 1/(1 − p)、当量比 r のとき Xn = (1 + r)/(1 + r − 2rp)、
//      最も確からしい分布(r = 1)で Xw = (1 + p)/(1 − p)、Đ = 1 + p。Mn = Xn·M₀(M₀ は構造単位(モノマー単位)の平均の質量)
//   3. 結晶化度: 密度法 Xc = ρc(ρ − ρa)/(ρ(ρc − ρa))(質量分率)・φc = (ρ − ρa)/(ρc − ρa)(体積分率)、
//      DSC 法 Xc = (ΔHm − ΔHc)/(w·ΔHm°)(w は樹脂の質量分率)
//   4. ガラス転移: フローリー・フォックスの式 Tg = Tg∞ − K/Mn、Fox の式 1/Tg = w₁/Tg₁ + w₂/Tg₂(K で)、
//      WLF の式 log aT = −C₁(T − Tr)/(C₂ + T − Tr)
// 値と出典は review の check/data.md。文言は data/tools/polymercalc.json の text.{言語}.js
// 計算の関数(averages・parsePairs・carothers・xcDensity・xcDsc・floryFox・fox・wlf など)は DOM なしで import できる
// (検算: review の check/check_polymercalc.py と check/js_results.mjs)。
import { lineChart } from './chart.js';

// =====================================================================
// 定数とプリセット
// =====================================================================
export const K0 = 273.15; // ℃ → K
// WLF の「普遍的な値」(Tr = Tg のとき)。TA Instruments APN001、Shangguan ほか Polymers 9 (2017) 567 で確かめた
export const WLF_UNIVERSAL = { c1: 17.44, c2: 51.6 };
// 原子量(CIAAW の abridged standard atomic weights)。繰り返し単位の式量に使う
export const AW = { C: 12.011, H: 1.008, N: 14.007, O: 15.999 };
const fw = f => Object.entries(f).reduce((s, [e, n]) => s + AW[e] * n, 0);
// 結晶化度のプリセット。
//   rc・ra: 完全結晶・完全非晶の密度(g/cm³)。出典で確かめた値だけ(PEEK は ρa を確かめられなかったので置かない)
//   h0: 完全結晶の融解熱 ΔHm°(J/g)と h0kj(kJ/mol)は Blaine, TA Instruments TN048 の表 1
//   ru: 繰り返し単位の組成(式量 mru は上の原子量から計算)
export const PRESETS = [
  { id: 'pe', ru: { C: 1, H: 2 }, rc: 1.003, ra: 0.852, ds: 'gw2', h0: 293, h0kj: 4.11 },
  { id: 'pp', ru: { C: 3, H: 6 }, rc: 0.946, ra: 0.8554, ds: 'gw4', h0: 207, h0kj: 8.70 },
  { id: 'pet', ru: { C: 10, H: 8, O: 4 }, rc: 1.455, ra: 1.335, ds: 'dl24', h0: 140, h0kj: 26.9 },
  { id: 'pa6', ru: { C: 6, H: 11, N: 1, O: 1 }, rc: null, ra: null, ds: null, h0: 230, h0kj: 26.0 },
  { id: 'pom', ru: { C: 1, H: 2, O: 1 }, rc: 1.491, ra: 1.25, ds: 'gw3', h0: 326, h0kj: 9.79 },
  { id: 'peek', ru: { C: 19, H: 12, O: 3 }, rc: null, ra: null, ds: null, h0: 130, h0kj: 37.4 },
].map(p => ({ ...p, mru: fw(p.ru) }));
export const presetById = Object.fromEntries(PRESETS.map(p => [p.id, p]));
export const SRC = {
  tn048: 'https://www.tainstruments.com/pdf/literature/TN048.pdf',
  gw2: 'https://srd.nist.gov/jpcrdreprint/1.555636.pdf',
  gw3: 'https://srd.nist.gov/jpcrdreprint/1.555649.pdf',
  gw4: 'https://srd.nist.gov/jpcrdreprint/1.555650.pdf',
  gw8: 'https://srd.nist.gov/jpcrdreprint/1.555678.pdf',
  dl24: 'https://www.mdpi.com/2073-4360/16/14/1975',
  pp25: 'https://www.mdpi.com/2073-4360/17/14/1889',
  apn001: 'https://www.tainstruments.com/pdf/literature/APN001_Guidelines_for_using_TTS.pdf',
  wlf17: 'https://www.mdpi.com/2073-4360/9/11/567',
  psu: 'https://zeus.plmsc.psu.edu/~manias/MatSE443/chapter4.pdf',
  iupac_dp: 'https://goldbook.iupac.org/terms/view/D01569/plain',
  iupac_d: 'https://publications.iupac.org/pac/81/2/0351/index.html',
  fox: 'https://nvlpubs.nist.gov/nistpubs/jres/102/2/j22sch.pdf',
};
export const ROWS = 8; // 手入力の行の数(URL に残るのはこの行だけ。貼り付けた表は URL に入れない)

// =====================================================================
// 1. 分子量の平均
// =====================================================================
// basis 'n': x は本数(モル数・モル分率でもよい)、'w': x は質量(質量分率・ピークの高さでもよい)
// n 基準: Mn = ΣnM/Σn、Mw = ΣnM²/ΣnM、Mz = ΣnM³/ΣnM²。w = nM なので w 基準は Mn = Σw/Σ(w/M)、Mw = ΣwM/Σw、Mz = ΣwM²/ΣwM
export function averages(M, x, basis = 'n') {
  const rows = [];
  for (let i = 0; i < M.length; i++) if (Number.isFinite(M[i]) && Number.isFinite(x[i])) rows.push([M[i], x[i]]);
  if (!rows.length || rows.some(([m, v]) => !(m > 0) || v < 0)) return null;
  const n = rows.map(([m, v]) => (basis === 'w' ? v / m : v));
  const Ms = rows.map(r => r[0]);
  const s = k => n.reduce((a, ni, i) => a + ni * Ms[i] ** k, 0);
  const S0 = s(0), S1 = s(1), S2 = s(2), S3 = s(3);
  if (!(S0 > 0)) return null;
  const Mn = S1 / S0, Mw = S2 / S1, Mz = S3 / S2;
  const W = S1;
  return { Mn, Mw, Mz, D: Mw / Mn, count: rows.length, M: Ms, n, nf: n.map(v => v / S0), wf: n.map((v, i) => (v * Ms[i]) / W), S0, S1, S2, S3 };
}

// 貼り付けの読み取り(tensile.js と同じ規則): タブ・セミコロンがあればそれで分け(欄の中の「,」は小数点)、
// 空白で分けて全部が数ならそれで、そうでなければコンマで分ける。最初のデータ行より前の読めない行は見出し
const NUM_DOT = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
const NUM_COMMA = /^[+-]?(?:\d+,\d*|,\d+)(?:[eE][+-]?\d+)?$/;
const unq = t => t.trim().replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1').trim();
const asNum = (t, comma) => {
  const s = unq(t);
  if (NUM_DOT.test(s)) return Number(s);
  if (comma && NUM_COMMA.test(s)) return Number(s.replace(',', '.'));
  return NaN;
};
export function splitLine(line) {
  const s = String(line ?? '').replace(/^﻿/, '').trim();
  if (!s) return null;
  if (/[\t;]/.test(s)) return s.split(/[\t;]/).map(t => asNum(t, true));
  const ws = s.split(/\s+/);
  if (ws.length >= 2 && ws.every(t => !Number.isNaN(asNum(t, true)))) return ws.map(t => asNum(t, true));
  if (s.includes(',')) return s.split(',').map(t => asNum(t, false));
  return ws.map(t => asNum(t, false));
}
export function parsePairs(text) {
  const M = [], x = [], bad = [];
  let header = 0;
  String(text ?? '').split(/\r\n|\r|\n/).forEach((ln, i) => {
    const t = splitLine(ln);
    if (!t) return;
    if (Number.isFinite(t[0]) && Number.isFinite(t[1])) { M.push(t[0]); x.push(t[1]); }
    else if (!M.length) header++;
    else bad.push(i + 1);
  });
  return { M, x, header, bad };
}

// =====================================================================
// 2. 逐次重合(カロザースの式)
// =====================================================================
// r = N_A/N_B ≤ 1(少ない方の官能基 A の数 / 多い方 B の数)、p は A の反応率。r = 1 で Xn = 1/(1 − p)
export function carothers(p, r = 1) {
  if (!(p >= 0 && p <= 1) || !(r > 0 && r <= 1)) return null;
  const den = 1 + r - 2 * r * p;
  return den > 0 ? (1 + r) / den : Infinity;
}
// 最も確からしい分布(フローリー)。r = 1 のときだけ使う
export const xwFlory = p => (p >= 0 && p < 1 ? (1 + p) / (1 - p) : p === 1 ? Infinity : null);
export const dispersityFlory = p => (p >= 0 && p <= 1 ? 1 + p : null);
// 目標の Xn に要る p: Xn = (1 + r)/(1 + r − 2rp) を p について解く。p > 1 なら届かない(上限は (1 + r)/(1 − r))
export function pFor(Xn, r = 1) {
  if (!(Xn >= 1) || !(r > 0 && r <= 1)) return null;
  return (1 + r - (1 + r) / Xn) / (2 * r);
}
export const xnLimit = r => (r > 0 && r < 1 ? (1 + r) / (1 - r) : r === 1 ? Infinity : null);

// =====================================================================
// 3. 結晶化度
// =====================================================================
// 比容の加成性 1/ρ = wc/ρc + (1 − wc)/ρa → wc。体積の加成性 ρ = φρc + (1 − φ)ρa → φ
export function xcDensity(rho, rc, ra) {
  if (!(rho > 0) || !(rc > 0) || !(ra > 0) || !(rc > ra)) return null;
  return { wc: (rc * (rho - ra)) / (rho * (rc - ra)), phi: (rho - ra) / (rc - ra) };
}
// DSC: Xc = (ΔHm − ΔHc)/(w·ΔHm°)。ΔHm・ΔHc は試料 1 g あたり(J/g)、w は樹脂の質量分率(0〜1)
export function xcDsc(hm, hc, h0, w = 1) {
  if (!(hm >= 0) || !(hc >= 0) || !(h0 > 0) || !(w > 0 && w <= 1)) return null;
  return (hm - hc) / (w * h0);
}
// kJ/mol(繰り返し単位 1 mol あたり)→ J/g: × 1000 / 式量
export const kjmolToJg = (kj, mru) => (mru > 0 ? (kj * 1000) / mru : null);

// =====================================================================
// 4. ガラス転移
// =====================================================================
export const floryFox = (tginf, K, Mn) => (Number.isFinite(tginf) && K >= 0 && Mn > 0 ? tginf - K / Mn : null);
// Fox の式。温度は K で(0 以下は不可)、w1 は成分 1 の質量分率(0〜1)
export function fox(t1, t2, w1) {
  if (!(t1 > 0) || !(t2 > 0) || !(w1 >= 0 && w1 <= 1)) return null;
  return 1 / (w1 / t1 + (1 - w1) / t2);
}
// WLF: log10 aT。C₂ + T − Tr ≤ 0 では式が使えない
export function wlf(T, Tr, c1 = WLF_UNIVERSAL.c1, c2 = WLF_UNIVERSAL.c2) {
  if (![T, Tr, c1, c2].every(Number.isFinite)) return null;
  const d = c2 + T - Tr;
  if (!(d > 0)) return null;
  return (-c1 * (T - Tr)) / d;
}

// 例のボタン(計算の例として作った値。実測のデータではない)
export const EXAMPLES = [
  { mode: 'mw', msrc: 'rows', basis: 'n', mu: 'gmol', m1: 10000, x1: 5, m2: 20000, x2: 12, m3: 40000, x3: 20, m4: 60000, x4: 15, m5: 80000, x5: 8, m6: 120000, x6: 3, m7: '', x7: '', m8: '', x8: '' },
  { mode: 'step', p: 0.99, r: 1, mrep: 226.32, nsu: '2', xt: 200 },
  { mode: 'xc', xm: 'dens', pm: 'pe', rho: 0.95 },
  { mode: 'xc', xm: 'dsc', pm: 'pet', h0u: 'jg', hm: 45, hc: 20, wf: 100 },
  { mode: 'tg', tm: 'fox', tu: 'C', tg1: 105, tg2: -10, w1: 60 },
];

// =====================================================================
// 画面(ブラウザのときだけ)
// =====================================================================
const form = typeof document !== 'undefined' ? document.getElementById('polymercalc-form') : null;
if (form) setup();

function setup() {
  const T = JSON.parse(form.dataset.text);
  const U = T.ui;
  const home = document.documentElement.dataset.home ?? '/';
  const lang = document.documentElement.lang;
  const isCJK = /^(ja|zh)/.test(lang);
  const out = k => document.querySelector(`[data-out="${k}"]`);
  const fill = (s, v = {}) => String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m));
  const el = (tag, attrs = {}, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) if (v != null && v !== false) e.setAttribute(k, v);
    e.append(...kids.flat().filter(k => k != null && k !== false));
    return e;
  };
  const E = form.elements;
  const DEG = U.degc ?? '°C'; // 温度の記号(ja は ℃、en は °C)

  // ---- 数の書式(言語で小数点が変わる。de はあとでコンマになる) ----
  const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
  const nfsig = sig => new Intl.NumberFormat(lang, { minimumSignificantDigits: sig, maximumSignificantDigits: sig, useGrouping: false });
  const nfd = d => new Intl.NumberFormat(lang, { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: false });
  const nfmax = d => new Intl.NumberFormat(lang, { maximumFractionDigits: d, useGrouping: false });
  const minus = t => t.replace(/^-/, '−');
  // 有効数字 sig 桁。0.001 未満と 10⁶ 以上は a×10ⁿ の形
  const sci = (v, sig = 3) => {
    if (v === Infinity) return '∞';
    if (v == null || !Number.isFinite(v)) return '–';
    if (v === 0) return '0';
    const a = Math.abs(v);
    if (a >= 1e-3 && a < 1e6) return minus(nfsig(sig).format(v));
    const [m, e] = v.toExponential(sig - 1).split('e');
    return `${minus(nfd(sig - 1).format(Number(m)))}×10${String(Number(e)).replace(/./g, ch => SUP[ch])}`;
  };
  const fix = (v, d) => (v == null || !Number.isFinite(v) ? '–' : minus(nfd(d).format(v)));
  const inp = v => (Number.isFinite(v) ? minus(nfmax(6).format(v)) : '–');
  const pct = (v, d = 1) => (v == null || !Number.isFinite(v) ? '–' : `${fix(v * 100, d)} %`);
  const numOf = name => {
    const s = String(E[name]?.value ?? '').trim().replace(',', '.');
    return s === '' ? NaN : Number(s);
  };
  // 式の中に直接書いた定数(17.44 など)も、ドイツ語では小数点をコンマにする(差し込んだ値は Intl でコンマになっている)
  const decFix = t => (lang === 'de' ? t.replace(/(\d)\.(\d)/g, '$1,$2') : t);

  // ---- 見た目(このツールだけ) ----
  const css = document.createElement('style');
  css.textContent = `
#polymercalc-form .pc-wide { grid-column: 1 / -1; margin: 0; }
#polymercalc-form .pc-full { grid-column: span 2; }
@media (max-width: 480px) { #polymercalc-form .pc-full { grid-column: 1 / -1; } }
#polymercalc-form .dy-field[hidden], #polymercalc-form .pc-group[hidden], #polymercalc-form .pc-paste[hidden] { display: none !important; }
#polymercalc-form .pc-group { grid-column: 1 / -1; border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; margin: 0; min-width: 0; }
#polymercalc-form .pc-group legend { font-size: .88rem; color: var(--muted); padding: 0 4px; }
#polymercalc-form .pc-rows { display: grid; grid-template-columns: auto minmax(0, 1fr) minmax(0, 1fr); gap: 6px 8px; align-items: center; }
#polymercalc-form .pc-rows .dy-field { margin: 0; }
#polymercalc-form .pc-rows .dy-field > span { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
#polymercalc-form .pc-rows .pc-rh { font-size: .8rem; color: var(--muted); }
#polymercalc-form .pc-rows .pc-ri { font-size: .8rem; color: var(--muted); text-align: right; min-width: 1.2em; }
.pc-paste { grid-column: 1 / -1; display: flex; flex-direction: column; gap: 6px; font-size: .88rem; color: var(--muted); }
.pc-paste textarea { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: .85rem; line-height: 1.45; color: var(--text); background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; width: 100%; min-height: 9em; resize: vertical; box-sizing: border-box; }
.pc-tabs { display: flex; flex-wrap: wrap; gap: 6px; }
.pc-tabs .btn { min-height: 40px; padding: 0 14px; }
.pc-tabs .btn[aria-pressed="true"] { background: var(--accent); color: #fff; border-color: var(--accent); }
.pc-ex { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.pc-ex .btn { min-height: 36px; padding: 0 12px; font-size: .85rem; }
.pc-read { font-size: .85rem; color: var(--muted); margin: 0; }
.pc-box { margin: 12px 0; padding: 10px 12px; border-radius: 8px; background: var(--bg); }
.pc-box h3 { margin: 0 0 6px; font-size: 1rem; }
.pc-box ul { margin: 4px 0; padding-left: 1.3em; line-height: 1.7; }
.pc-box p { margin: 4px 0; line-height: 1.7; }
.pc-main { font-size: 1.05rem; line-height: 1.7; margin: 0 0 10px; padding: 10px 12px; border-radius: 8px; background: var(--accent-soft); }
.pc-eq { font-family: var(--mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace); font-size: .88rem; line-height: 1.8; white-space: pre-wrap; overflow-wrap: anywhere; margin: 4px 0; }
.pc-warn { color: var(--text); border-left: 3px solid var(--accent-2); padding-left: 8px; }
.pc-tbl-wrap { overflow-x: auto; }
.pc-tbl { width: 100%; border-collapse: collapse; font-size: .86rem; }
.pc-tbl th, .pc-tbl td { text-align: left; padding: 5px 6px; border-bottom: 1px solid var(--border); vertical-align: top; }
.pc-tbl td.pc-num { white-space: nowrap; font-variant-numeric: tabular-nums; }
.pc-tbl thead th { font-size: .78rem; color: var(--muted); font-weight: 600; }
.pc-tbl tr.pc-on { background: var(--accent-soft); }
.pc-tbl.pc-preset { min-width: 600px; }
.pc-tbl.pc-preset th[scope=row] { white-space: nowrap; }
@media (max-width: 480px) { .pc-tbl th, .pc-tbl td { padding: 4px 3px; font-size: .78rem; } }
.pc-links { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0 0; }
.pc-legend { font-size: .82rem; color: var(--muted); margin: 0 0 4px; }
.pc-key { display: inline-block; width: 18px; height: 3px; vertical-align: middle; margin: 0 4px 0 8px; }
`;
  document.head.append(css);

  const lab = n => E[n]?.closest('label');
  for (const n of ['msrc', 'basis', 'pm', 'xm', 'tm', 'h0u']) lab(n)?.classList.add('pc-full');

  // ---- 計算の切り替え(タブ)。選んだ計算は mode の選択欄に入れる(URL に残る) ----
  const MODES = ['mw', 'step', 'xc', 'tg'];
  lab('mode').hidden = true;
  const tabs = el('div', { class: 'pc-tabs pc-wide', role: 'group', 'aria-label': U.tabs_label },
    ...MODES.map(m => el('button', { type: 'button', class: 'btn btn-ghost', 'data-mode': m, 'aria-pressed': 'false' }, U[`tab_${m}`])));
  form.querySelector('h2').after(tabs);
  tabs.addEventListener('click', e => {
    const b = e.target.closest('[data-mode]');
    if (!b) return;
    E.mode.value = b.dataset.mode;
    form.dispatchEvent(new Event('change', { bubbles: true }));
  });

  // ---- 例のボタン ----
  const ex = el('div', { class: 'pc-ex pc-wide' }, el('span', { class: 'muted' }, U.examples),
    ...EXAMPLES.map((x, i) => el('button', { type: 'button', class: 'btn btn-ghost', 'data-ex': String(i) }, U.ex[i])));
  tabs.after(ex);
  const exNote = el('p', { class: 'muted pc-wide', style: 'font-size:.85rem' }, U.ex_note);
  ex.after(exNote);
  ex.addEventListener('click', e => {
    const b = e.target.closest('[data-ex]');
    if (!b) return;
    const x = EXAMPLES[Number(b.dataset.ex)];
    if (x.pm) applyPreset(x.pm);
    for (const [k, v] of Object.entries(x)) if (k !== 'pm' && E[k]) E[k].value = String(v);
    if (x.mode === 'mw') ta.value = '';
    form.dispatchEvent(new Event('change', { bubbles: true }));
  });

  // ---- 分子量の表: 手入力の行(m1..m8・x1..x8)を2列の表にまとめ、貼り付けの欄を足す ----
  const rowSet = el('fieldset', { class: 'pc-group' }, el('legend', {}, U.rows_legend));
  const rgrid = el('div', { class: 'pc-rows' });
  const hM = el('span', { class: 'pc-rh' }), hX = el('span', { class: 'pc-rh' });
  rgrid.append(el('span', {}), hM, hX);
  for (let i = 1; i <= ROWS; i++) {
    rgrid.append(el('span', { class: 'pc-ri' }, String(i)), lab(`m${i}`), lab(`x${i}`));
  }
  rowSet.append(rgrid, el('p', { class: 'muted', style: 'margin:6px 0 0;font-size:.82rem' }, U.rows_help));
  lab('mu').after(rowSet);
  const paste = el('label', { class: 'pc-paste' }, el('span', {}, U.paste));
  const ta = el('textarea', { name: 'data', rows: '7', spellcheck: 'false', autocomplete: 'off', placeholder: U.paste_ph });
  paste.append(ta, el('span', { style: 'font-size:.82rem' }, U.paste_help));
  rowSet.after(paste);
  const readP = el('p', { class: 'pc-read pc-wide', 'aria-live': 'polite' });
  paste.after(readP);
  ta.addEventListener('input', () => { if (ta.value.trim()) E.msrc.value = 'paste'; });

  // ---- 結晶化度のプリセット: 選ぶと ρc・ρa・ΔHm°・式量を入れる。書き換えたら「自分で入れる」にする ----
  function applyPreset(id) {
    const p = presetById[id];
    if (!p) return;
    E.pm.value = id;
    E.rc.value = p.rc == null ? '' : String(p.rc);
    E.ra.value = p.ra == null ? '' : String(p.ra);
    E.mru.value = fix(p.mru, 2).replace(',', '.');
    E.h0.value = String(E.h0u.value === 'kjmol' ? p.h0kj : p.h0);
  }
  form.addEventListener('change', e => {
    if (e.target === E.pm && E.pm.value !== 'custom') applyPreset(E.pm.value);
    if (e.target === E.h0u) {
      const p = presetById[E.pm.value];
      if (p) E.h0.value = String(E.h0u.value === 'kjmol' ? p.h0kj : p.h0);
      else {
        // 自分で入れた ΔHm° は、単位を切り替えたら式量で直す(数をそのまま別の単位として読まない)
        const h = numOf('h0'), m = numOf('mru');
        if (h > 0 && m > 0) E.h0.value = String(Number((E.h0u.value === 'kjmol' ? (h * m) / 1000 : (h * 1000) / m).toPrecision(6)));
      }
    }
  });
  form.addEventListener('input', e => {
    if (['rc', 'ra', 'h0', 'mru'].includes(e.target.name)) E.pm.value = 'custom';
  });

  // ---- 表示の切り替え ----
  const SHOW = {
    mw: ['msrc', 'basis', 'mu'],
    step: ['p', 'r', 'mrep', 'nsu', 'xt'],
    xc: ['xm', 'pm'],
    tg: ['tm', 'tu'],
  };
  const XC = { dens: ['rho', 'rc', 'ra'], dsc: ['h0u', 'h0', 'hm', 'hc', 'wf'] };
  const TG = { ff: ['tginf', 'kff', 'mn'], fox: ['tg1', 'tg2', 'w1'], wlf: ['tr', 't', 'c1', 'c2'] };
  const mode = () => (MODES.includes(E.mode.value) ? E.mode.value : 'mw');
  function layout() {
    const m = mode();
    for (const b of tabs.querySelectorAll('[data-mode]')) b.setAttribute('aria-pressed', String(b.dataset.mode === m));
    const on = new Set(SHOW[m]);
    if (m === 'xc') { for (const n of XC[E.xm.value] ?? []) on.add(n); if (E.xm.value === 'dsc' && E.h0u.value === 'kjmol') on.add('mru'); }
    if (m === 'tg') for (const n of TG[E.tm.value] ?? []) on.add(n);
    for (const f of form.querySelectorAll('.dy-field')) {
      const n = f.querySelector('[name]')?.name;
      if (!n || n === 'mode' || /^[mx]\d$/.test(n) || n === 'data') continue;
      f.hidden = !on.has(n);
    }
    const rows = m === 'mw' && E.msrc.value === 'rows';
    rowSet.hidden = !rows;
    paste.hidden = !(m === 'mw' && E.msrc.value === 'paste');
    readP.hidden = m !== 'mw';
    const mu = E.mu.value === 'kgmol' ? 'kg/mol' : 'g/mol';
    hM.textContent = `Mᵢ (${mu})`;
    hX.textContent = E.basis.value === 'w' ? U.col_w : U.col_n;
    for (let i = 1; i <= ROWS; i++) {
      lab(`m${i}`).querySelector('span').textContent = `M${i} (${mu})`;
      lab(`x${i}`).querySelector('span').textContent = `${E.basis.value === 'w' ? 'w' : 'n'}${i}`;
    }
  }

  // ---- 結果の部品 ----
  const stats = rows => el('dl', { class: 'dy-stats' }, ...rows.map(([k, v]) => el('div', {}, el('dt', {}, k), el('dd', {}, v))));
  const eq = (...lines) => el('p', { class: 'pc-eq' }, decFix(lines.filter(Boolean).join('\n')));
  const box = (h, ...kids) => el('div', { class: 'pc-box' }, h ? el('h3', {}, h) : null, ...kids);
  const warn = t => el('p', { class: 'pc-warn' }, t);
  const ul = list => el('ul', {}, ...list.map(s => el('li', {}, s)));
  const link = (href, text) => el('a', { href, target: '_blank', rel: 'noopener' }, text);
  const svg = document.getElementById('pc-chart');
  const legend = el('p', { class: 'pc-legend' });
  svg.before(legend);
  const showChart = on => { svg.style.display = on ? '' : 'none'; legend.hidden = !on; if (!on) svg.innerHTML = ''; };
  const legendOf = items => legend.replaceChildren(...items.flatMap(([c, t]) => [el('span', { class: 'pc-key', style: `background:${c}` }), t]));
  const tK = v => (E.tu.value === 'K' ? v : v + K0); // 入れた温度 → K
  const both = k => `${fix(k, 1)} K = ${fix(k - K0, 1)} ${DEG}`;
  const tUnit = () => (E.tu.value === 'K' ? 'K' : DEG);

  // 1. 分子量の平均
  function renderMw(res) {
    const k = E.mu.value === 'kgmol' ? 1000 : 1;
    let M = [], x = [];
    if (E.msrc.value === 'paste') {
      const P = parsePairs(ta.value);
      M = P.M.map(v => v * k); x = P.x;
      const msg = [];
      if (P.M.length) msg.push(fill(U.read_ok, { n: P.M.length }));
      if (P.header) msg.push(fill(U.read_header, { n: P.header }));
      if (P.bad.length) msg.push(fill(U.read_bad, { n: P.bad.length, lines: P.bad.slice(0, 5).join(', ') + (P.bad.length > 5 ? '…' : '') }));
      readP.textContent = msg.length ? msg.join(isCJK ? '。' : '. ') + (isCJK ? '。' : '.') : U.read_none;
    } else {
      readP.textContent = '';
      for (let i = 1; i <= ROWS; i++) {
        const m = numOf(`m${i}`), v = numOf(`x${i}`);
        if (Number.isFinite(m) || Number.isFinite(v)) { M.push(m * k); x.push(v); }
      }
    }
    const incomplete = M.some((m, i) => Number.isFinite(m) !== Number.isFinite(x[i]));
    const r = averages(M, x, E.basis.value);
    if (!r) { showChart(false); res.append(warn(U.need_mw)); return; }
    const kg = v => `${sci(v / 1000, 4)} kg/mol`;
    res.append(el('p', { class: 'pc-main' }, fill(U.mw_main, { mn: sci(r.Mn, 4), mw: sci(r.Mw, 4), d: fix(r.D, 2), n: r.count })));
    res.append(stats([['Mn (g/mol)', sci(r.Mn, 4)], ['Mw (g/mol)', sci(r.Mw, 4)], ['Mz (g/mol)', sci(r.Mz, 4)], [`Đ = Mw/Mn`, fix(r.D, 3)], ['Mz/Mw', fix(r.Mz / r.Mw, 3)], [U.rows_used, String(r.count)]]));
    if (incomplete) res.append(warn(U.row_incomplete));
    if (r.count === 1) res.append(warn(U.one_row));
    // 式と代入
    const w = E.basis.value === 'w';
    const show = r.count <= 8;
    const terms = (f, sep = ' + ') => r.M.map((m, i) => f(m, i)).join(sep);
    const raw = [];
    for (let i = 0; i < M.length; i++) if (Number.isFinite(M[i]) && Number.isFinite(x[i])) raw.push(x[i]);
    const lines = [];
    if (k !== 1) lines.push(U.kg_note);
    if (!w) {
      lines.push('Mn = Σnᵢ·Mᵢ / Σnᵢ   Mw = Σnᵢ·Mᵢ² / Σnᵢ·Mᵢ   Mz = Σnᵢ·Mᵢ³ / Σnᵢ·Mᵢ²');
      if (show) {
        lines.push(`Σnᵢ = ${terms((m, i) => inp(raw[i]))} = ${sci(r.S0, 4)}`);
        lines.push(`Σnᵢ·Mᵢ = ${terms((m, i) => `${inp(raw[i])}×${inp(m)}`)} = ${sci(r.S1, 4)}`);
      }
      lines.push(`Mn = ${sci(r.S1, 4)} / ${sci(r.S0, 4)} = ${sci(r.Mn, 4)} g/mol`);
      lines.push(`Mw = ${sci(r.S2, 4)} / ${sci(r.S1, 4)} = ${sci(r.Mw, 4)} g/mol`);
      lines.push(`Mz = ${sci(r.S3, 4)} / ${sci(r.S2, 4)} = ${sci(r.Mz, 4)} g/mol`);
    } else {
      const sw = raw.reduce((a, b) => a + b, 0);
      const swm = r.S0; // Σ wᵢ/Mᵢ
      const swM = r.S2; // Σ wᵢ·Mᵢ
      lines.push('Mn = Σwᵢ / Σ(wᵢ/Mᵢ)   Mw = Σwᵢ·Mᵢ / Σwᵢ   Mz = Σwᵢ·Mᵢ² / Σwᵢ·Mᵢ   (nᵢ = wᵢ/Mᵢ)');
      if (show) lines.push(`Σ(wᵢ/Mᵢ) = ${terms((m, i) => `${inp(raw[i])}/${inp(m)}`)} = ${sci(swm, 4)}`);
      lines.push(`Mn = ${sci(sw, 4)} / ${sci(swm, 4)} = ${sci(r.Mn, 4)} g/mol`);
      lines.push(`Mw = ${sci(swM, 4)} / ${sci(sw, 4)} = ${sci(r.Mw, 4)} g/mol`);
      lines.push(`Mz = ${sci(r.S3, 4)} / ${sci(swM, 4)} = ${sci(r.Mz, 4)} g/mol`);
    }
    lines.push(`Đ = Mw / Mn = ${sci(r.Mw, 4)} / ${sci(r.Mn, 4)} = ${fix(r.D, 3)}`);
    lines.push(`Mn = ${kg(r.Mn)}   Mw = ${kg(r.Mw)}   Mz = ${kg(r.Mz)}`);
    res.append(box(U.h_eq, el('p', {}, w ? U.mw_eq_lead_w : U.mw_eq_lead_n), eq(...lines), el('p', { class: 'muted' }, U.mw_eq_note)));
    // 行ごとの表(数の分率と質量の分率)
    if (r.count <= 40) {
      res.append(box(U.h_frac, el('div', { class: 'pc-tbl-wrap' }, el('table', { class: 'pc-tbl' },
        el('thead', {}, el('tr', {}, ...U.frac_cols.map(c => el('th', { scope: 'col' }, c)))),
        el('tbody', {}, ...r.M.map((m, i) => el('tr', {}, el('td', { class: 'pc-num' }, String(i + 1)), el('td', { class: 'pc-num' }, sci(m, 4)),
          el('td', { class: 'pc-num' }, fix(r.nf[i], 4)), el('td', { class: 'pc-num' }, fix(r.wf[i], 4)))))))));
    }
    // グラフ: 数の分率と質量の分率(Mᵢ の順に並べる)
    const order = r.M.map((m, i) => i).sort((a, b) => r.M[a] - r.M[b]);
    const ymax = Math.max(...r.nf, ...r.wf);
    const xlog = Math.max(...r.M) / Math.min(...r.M) > 20;
    showChart(r.count >= 2);
    if (r.count >= 2) {
      legendOf([['var(--accent)', U.lg_w], ['var(--ok)', U.lg_n], ['var(--muted)', U.lg_avg]]);
      lineChart(svg, {
        series: [
          { points: order.map(i => [r.M[i], r.wf[i]]), cls: 'ac' },
          { points: order.map(i => [r.M[i], r.nf[i]]), cls: 'ac2' },
          { points: [[r.Mn, 0], [r.Mn, ymax]], cls: 'dash' },
          { points: [[r.Mw, 0], [r.Mw, ymax]], cls: 'dash' },
        ],
        marks: [[r.Mn, ymax, 'Mn'], [r.Mw, ymax * 0.85, 'Mw']],
        xlabel: `M (g/mol)${xlog ? ` · ${U.log_axis}` : ''}`, ylabel: U.y_frac, xlog, ymin: 0,
      });
    }
    res.append(box(U.h_caution, ul(U.mw_cautions)));
  }

  // 2. 逐次重合
  function renderStep(res) {
    showChart(false);
    const p = numOf('p'), r = numOf('r'), mrep = numOf('mrep'), nsu = Number(E.nsu.value), xt = numOf('xt');
    if (!(p >= 0 && p <= 1)) { res.append(warn(U.need_p)); return; }
    if (!(r > 0 && r <= 1)) { res.append(warn(r > 1 ? U.r_over : U.need_r)); return; }
    const Xn = carothers(p, r);
    const M0 = mrep > 0 ? mrep / nsu : NaN;
    const Mn = Number.isFinite(M0) ? Xn * M0 : null;
    const one = r === 1;
    const Xw = one ? xwFlory(p) : null, D = one ? dispersityFlory(p) : null;
    res.append(el('p', { class: 'pc-main' }, Xn === Infinity ? U.step_inf
      : fill(Mn != null ? U.step_main : U.step_main_nom, { xn: sci(Xn, 4), mn: sci(Mn, 4), p: inp(p) })));
    const rows = [['Xn', sci(Xn, 4)]];
    if (Mn != null) rows.push(['Mn (g/mol)', sci(Mn, 4)]);
    rows.push(['Xw', one ? sci(Xw, 4) : '–'], ['Đ', one ? fix(D, 3) : '–']);
    if (one && Mn != null && Number.isFinite(Xw)) rows.push(['Mw (g/mol)', sci(Xw * M0, 4)]);
    rows.push([U.xn_lim, sci(xnLimit(r), 4)]);
    res.append(stats(rows));
    const lines = [];
    if (one) lines.push(`Xn = 1 / (1 − p) = 1 / (1 − ${inp(p)}) = ${sci(Xn, 4)}`);
    else lines.push(`Xn = (1 + r) / (1 + r − 2rp) = (1 + ${inp(r)}) / (1 + ${inp(r)} − 2 × ${inp(r)} × ${inp(p)}) = ${sci(Xn, 4)}`);
    if (!one) lines.push(`p → 1: Xn → (1 + r) / (1 − r) = (1 + ${inp(r)}) / (1 − ${inp(r)}) = ${sci(xnLimit(r), 4)}`);
    if (one) lines.push(`Xw = (1 + p) / (1 − p) = ${sci(Xw, 4)}   Đ = Xw / Xn = 1 + p = ${fix(D, 3)}`);
    if (Number.isFinite(M0)) {
      lines.push(`M₀ = ${inp(mrep)} / ${nsu} = ${sci(M0, 5)} g/mol`);
      if (Mn != null && Number.isFinite(Mn)) lines.push(`Mn = Xn × M₀ = ${sci(Xn, 4)} × ${sci(M0, 5)} = ${sci(Mn, 4)} g/mol`);
    }
    if (xt >= 1) {
      const pn = pFor(xt, r);
      lines.push(one ? `p = 1 − 1/Xn = 1 − 1/${inp(xt)} = ${fix(pn, 5)}`
        : `p = (1 + r − (1 + r)/Xn) / (2r) = ${pn > 1 ? '> 1' : fix(pn, 5)}`);
    }
    res.append(box(U.h_eq, el('p', {}, U.step_eq_lead), eq(...lines), el('p', { class: 'muted' }, one ? U.step_note_r1 : U.step_note_r)));
    if (xt >= 1) {
      const pn = pFor(xt, r);
      res.append(box(U.h_target, el('p', {}, pn > 1 ? fill(U.target_no, { xt: inp(xt), lim: sci(xnLimit(r), 4) }) : fill(U.target_p, { xt: inp(xt), p: fix(pn, 5), pc: fix(pn * 100, 3) }))));
    }
    res.append(box(U.h_units, el('p', {}, U.units_p), el('p', { class: 'muted' }, U.units_p2)));
    // 表: p と Xn
    const ps = [0.5, 0.9, 0.95, 0.98, 0.99, 0.995, 0.999];
    res.append(box(U.h_ptable, el('div', { class: 'pc-tbl-wrap' }, el('table', { class: 'pc-tbl' },
      el('thead', {}, el('tr', {}, el('th', { scope: 'col' }, 'p'), el('th', { scope: 'col' }, `Xn (r = 1)`), el('th', { scope: 'col' }, `Xn (r = ${inp(r)})`), el('th', { scope: 'col' }, 'Đ (r = 1)'))),
      el('tbody', {}, ...ps.map(v => el('tr', { class: v === p ? 'pc-on' : null }, el('td', { class: 'pc-num' }, inp(v)),
        el('td', { class: 'pc-num' }, sci(carothers(v, 1), 4)), el('td', { class: 'pc-num' }, sci(carothers(v, r), 4)), el('td', { class: 'pc-num' }, fix(1 + v, 3)))))))));
    res.append(box(U.h_caution, ul(U.step_cautions)));
  }

  // 3. 結晶化度
  function presetNote() {
    const p = presetById[E.pm.value];
    return p ? el('p', { class: 'muted' }, fill(U.preset_used, { m: T.mats[p.id] })) : null;
  }
  function renderXc(res) {
    showChart(false);
    if (E.xm.value === 'dens') {
      const rho = numOf('rho'), rc = numOf('rc'), ra = numOf('ra');
      if (E.pm.value === 'peek' && !(rc > 0 && ra > 0)) { res.append(warn(U.peek_nodens)); return; }
      const r = xcDensity(rho, rc, ra);
      if (!r) { res.append(warn(rc > 0 && ra > 0 && !(rc > ra) ? U.need_rcra : U.need_dens)); return; }
      res.append(el('p', { class: 'pc-main' }, fill(U.dens_main, { w: pct(r.wc), v: pct(r.phi) })));
      res.append(stats([[U.xc_mass, pct(r.wc)], [U.xc_vol, pct(r.phi)], ['ρ (g/cm³)', inp(rho)]]));
      if (rho < ra || rho > rc) res.append(warn(fill(U.dens_out, { rho: inp(rho), ra: inp(ra), rc: inp(rc) })));
      res.append(box(U.h_eq, el('p', {}, U.dens_eq_lead), eq(
        `Xc = ρc(ρ − ρa) / (ρ(ρc − ρa)) = ${inp(rc)} × (${inp(rho)} − ${inp(ra)}) / (${inp(rho)} × (${inp(rc)} − ${inp(ra)})) = ${fix(r.wc, 4)}`,
        `φc = (ρ − ρa) / (ρc − ρa) = (${inp(rho)} − ${inp(ra)}) / (${inp(rc)} − ${inp(ra)}) = ${fix(r.phi, 4)}`,
        `Xc = φc × ρc / ρ = ${fix(r.phi, 4)} × ${inp(rc)} / ${inp(rho)} = ${fix(r.wc, 4)}`), presetNote(), el('p', { class: 'muted' }, U.dens_eq_note)));
      res.append(box(U.h_caution, ul(U.dens_cautions)));
    } else {
      const kj = E.h0u.value === 'kjmol';
      const h0in = numOf('h0'), mru = numOf('mru'), hm = numOf('hm'), hc0 = numOf('hc'), wf = numOf('wf');
      const hc = Number.isFinite(hc0) ? hc0 : 0;
      const h0 = kj ? kjmolToJg(h0in, mru) : h0in;
      if (kj && !(mru > 0)) { res.append(warn(U.need_mru)); return; }
      const w = Number.isFinite(wf) ? wf / 100 : 1;
      const x = xcDsc(hm, hc, h0, w);
      if (x == null) { res.append(warn(U.need_dsc)); return; }
      res.append(el('p', { class: 'pc-main' }, fill(U.dsc_main, { x: pct(x) })));
      res.append(stats([[U.xc_mass, pct(x)], ['ΔHm° (J/g)', sci(h0, 4)], [`ΔHm − ΔHc (J/g)`, sci(hm - hc, 4)]]));
      if (x < 0) res.append(warn(U.dsc_neg));
      if (x > 1) res.append(warn(U.dsc_over));
      const lines = [];
      if (kj) lines.push(`ΔHm° = ${inp(h0in)} kJ/mol × 1000 / ${inp(mru)} g/mol = ${sci(h0, 4)} J/g`);
      lines.push(w === 1 ? `Xc = (ΔHm − ΔHc) / ΔHm° = (${inp(hm)} − ${inp(hc)}) / ${sci(h0, 4)} = ${fix(x, 4)}`
        : `Xc = (ΔHm − ΔHc) / (w × ΔHm°) = (${inp(hm)} − ${inp(hc)}) / (${inp(w)} × ${sci(h0, 4)}) = ${fix(x, 4)}`);
      res.append(box(U.h_eq, el('p', {}, U.dsc_eq_lead), eq(...lines), presetNote(), el('p', { class: 'muted' }, U.dsc_eq_note)));
      res.append(box(U.h_caution, ul(U.dsc_cautions)));
    }
  }

  // 4. ガラス転移
  function renderTg(res) {
    const tm = E.tm.value;
    const u = tUnit();
    if (tm === 'ff') {
      const ti = numOf('tginf'), K = numOf('kff'), Mn = numOf('mn');
      const t = floryFox(ti, K, Mn);
      if (t == null) { showChart(false); res.append(warn(U.need_ff)); return; }
      const tk = tK(t);
      res.append(el('p', { class: 'pc-main' }, fill(U.ff_main, { t: both(tk), mn: sci(Mn, 4) })));
      res.append(stats([['Tg (K)', fix(tk, 1)], [`Tg (${DEG})`, fix(tk - K0, 1)], ['Tg∞ − Tg (K)', fix(K / Mn, 2)]]));
      if (tk <= 0) res.append(warn(U.ff_neg));
      res.append(box(U.h_eq, el('p', {}, U.ff_eq_lead), eq(
        `Tg = Tg∞ − K / Mn = ${inp(ti)} ${u} − ${sci(K, 4)} / ${sci(Mn, 4)} = ${fix(t, 1)} ${u}`,
        `Tg = ${both(tk)}`), el('p', { class: 'muted' }, U.ff_eq_note)));
      // グラフ: Tg と Mn
      const mns = []; for (let e = Math.log10(Math.max(K / Math.abs(tK(ti)) * 2, 500)); e <= 6.01; e += 0.05) mns.push(10 ** e);
      showChart(true);
      legendOf([['var(--accent)', 'Tg = Tg∞ − K/Mn'], ['var(--muted)', 'Tg∞']]);
      lineChart(svg, {
        series: [{ points: mns.map(m => [m, tK(ti) - K / m - K0]), cls: 'ac' }, { points: [[mns[0], tK(ti) - K0], [1e6, tK(ti) - K0]], cls: 'dash' }],
        marks: [[Mn, tk - K0, `Mn = ${sci(Mn, 3)}`]], xlabel: `Mn (g/mol) · ${U.log_axis}`, ylabel: `Tg (${DEG})`, xlog: true, ymin: Math.min(tk - K0, tK(ti) - K0 - K / mns[0]),
      });
      res.append(box(U.h_caution, ul(U.ff_cautions)));
    } else if (tm === 'fox') {
      const a = numOf('tg1'), b = numOf('tg2'), w1p = numOf('w1');
      const t1 = tK(a), t2 = tK(b), w1 = w1p / 100;
      const t = fox(t1, t2, w1);
      if (t == null) { showChart(false); res.append(warn(t1 > 0 && t2 > 0 ? U.need_w1 : U.need_fox)); return; }
      res.append(el('p', { class: 'pc-main' }, fill(U.fox_main, { t: both(t), w: inp(w1p) })));
      const lin = w1 * t1 + (1 - w1) * t2;
      const rows = [['Tg (K)', fix(t, 1)], [`Tg (${DEG})`, fix(t - K0, 1)], [U.fox_lin, `${fix(lin - K0, 1)} ${DEG}`]];
      // ℃ のまま入れたときの(誤った)値。参考に出す
      let wrongC = null;
      if (u === DEG && a !== 0 && b !== 0) {
        const den = w1 / a + (1 - w1) / b;
        wrongC = den !== 0 ? 1 / den : null;
      }
      res.append(stats(rows));
      res.append(box(U.h_eq, el('p', {}, U.fox_eq_lead), eq(
        u === DEG ? `Tg₁ = ${inp(a)} + 273.15 = ${fix(t1, 2)} K   Tg₂ = ${inp(b)} + 273.15 = ${fix(t2, 2)} K` : null,
        `1/Tg = w₁/Tg₁ + w₂/Tg₂ = ${inp(w1)}/${fix(t1, 2)} + ${inp(1 - w1)}/${fix(t2, 2)} = ${sci(1 / t, 5)} K⁻¹`,
        `Tg = ${both(t)}`), el('p', { class: 'muted' }, U.fox_eq_note)));
      if (wrongC != null) res.append(box(U.h_wrong, el('p', {}, fill(U.fox_wrong, { v: Number.isFinite(wrongC) ? fix(wrongC, 1) : '–', t: fix(t - K0, 1) }))));
      const ws = []; for (let i = 0; i <= 50; i++) ws.push(i / 50);
      showChart(true);
      legendOf([['var(--accent)', U.lg_fox], ['var(--muted)', U.lg_lin]]);
      lineChart(svg, {
        series: [{ points: ws.map(v => [v * 100, fox(t1, t2, v) - K0]), cls: 'ac' }, { points: [[0, t2 - K0], [100, t1 - K0]], cls: 'dash' }],
        marks: [[w1p, t - K0, `${fix(t - K0, 1)} ${DEG}`]], xlabel: U.x_w1, ylabel: `Tg (${DEG})`, ymin: Math.min(t1, t2) - K0,
      });
      res.append(box(U.h_caution, ul(U.fox_cautions)));
    } else {
      const tr = numOf('tr'), t = numOf('t'), c1 = numOf('c1'), c2 = numOf('c2');
      const L = wlf(t, tr, c1, c2);
      if (L == null) { showChart(false); res.append(warn(Number.isFinite(c2 + t - tr) && c2 + t - tr <= 0 ? U.wlf_div : U.need_wlf)); return; }
      const aT = 10 ** L;
      const uni = c1 === WLF_UNIVERSAL.c1 && c2 === WLF_UNIVERSAL.c2;
      res.append(el('p', { class: 'pc-main' }, fill(L <= 0 ? U.wlf_main_fast : U.wlf_main_slow, { a: sci(aT, 3), f: sci(L <= 0 ? 1 / aT : aT, 3), dt: fix(t - tr, 1) })));
      res.append(stats([['log aT', fix(L, 3)], ['aT', sci(aT, 3)], ['T − Tr (K)', fix(t - tr, 1)], ['T', `${fix(tK(t), 1)} K = ${fix(tK(t) - K0, 1)} ${DEG}`]]));
      if (uni && t - tr < 0) res.append(warn(U.wlf_below));
      if (uni && t - tr > 100) res.append(warn(U.wlf_above));
      res.append(box(U.h_eq, el('p', {}, U.wlf_eq_lead), eq(
        `log aT = −C₁(T − Tr) / (C₂ + T − Tr) = −${inp(c1)} × (${inp(t)} − ${inp(tr)}) / (${inp(c2)} + ${inp(t)} − ${inp(tr)}) = ${fix(L, 3)}`,
        `aT = 10^(${fix(L, 3)}) = ${sci(aT, 3)}`), el('p', { class: 'muted' }, uni ? U.wlf_eq_note_uni : U.wlf_eq_note_own)));
      const xs = []; for (let d = Math.max(-c2 + 5, -20); d <= 120; d += 1) xs.push(d);
      showChart(true);
      legendOf([['var(--accent)', 'log aT'], ['var(--muted)', U.lg_range]]);
      const ys = xs.map(d => wlf(tr + d, tr, c1, c2));
      const ylo = Math.min(...ys.filter(Number.isFinite)), yhi = Math.max(...ys.filter(Number.isFinite));
      lineChart(svg, {
        series: [{ points: xs.map((d, i) => [d, ys[i]]), cls: 'ac' }, { points: [[0, ylo], [0, yhi]], cls: 'dash' }, { points: [[100, ylo], [100, yhi]], cls: 'dash' }],
        marks: [[t - tr, L, `${fix(L, 2)}`]], xlabel: 'T − Tr (K)', ylabel: 'log aT', ymin: ylo,
      });
      res.append(box(U.h_caution, ul(U.wlf_cautions)));
    }
  }

  // プリセットの表(ρc・ρa・ΔHm°・式量・出典)
  function presetTable() {
    const rows = PRESETS.map(p => el('tr', { class: p.id === E.pm.value ? 'pc-on' : null },
      el('th', { scope: 'row' }, T.mats[p.id]),
      el('td', { class: 'pc-num' }, p.rc == null ? '–' : link(SRC[p.ds], inp(p.rc))),
      el('td', { class: 'pc-num' }, p.ra == null ? '–' : link(SRC[p.ds], inp(p.ra))),
      el('td', { class: 'pc-num' }, link(SRC.tn048, inp(p.h0))),
      el('td', { class: 'pc-num' }, inp(p.h0kj)),
      el('td', { class: 'pc-num' }, fix(p.mru, 2)),
      el('td', { class: 'pc-num' }, fix(kjmolToJg(p.h0kj, p.mru), 1))));
    return el('div', {},
      el('p', { class: 'muted' }, U.preset_lead),
      el('div', { class: 'pc-tbl-wrap' }, el('table', { class: 'pc-tbl pc-preset' },
        el('thead', {}, el('tr', {}, ...U.preset_cols.map(c => el('th', { scope: 'col' }, c)))),
        el('tbody', {}, ...rows))),
      el('ul', { style: 'font-size:.82rem;line-height:1.7;padding-left:1.3em' }, ...U.preset_notes.map(s => el('li', {}, s))),
      el('p', { class: 'muted' }, U.src_h, ' ',
        link(SRC.tn048, 'TA TN048'), ' · ', link(SRC.gw2, 'Gaur & Wunderlich II (PE)'), ' · ', link(SRC.gw3, 'III (POM)'), ' · ',
        link(SRC.gw4, 'IV (PP)'), ' · ', link(SRC.dl24, 'Di Lorenzo 2024 (PET)'), ' · ', link(SRC.pp25, 'Polymers 17 (2025) 1889')));
  }
  function srcList() {
    return el('p', { class: 'muted' }, U.src_h, ' ',
      link(SRC.iupac_dp, 'IUPAC (DP)'), ' · ', link(SRC.iupac_d, 'IUPAC 2009 (Đ)'), ' · ', link(SRC.psu, 'Carothers / Flory (PSU MatSE 443)'), ' · ',
      link(SRC.fox, 'Fox eq. (J. Res. NIST 102, 1997)'), ' · ', link(SRC.apn001, 'WLF (TA APN001)'), ' · ', link(SRC.wlf17, 'WLF (Polymers 9, 2017)'));
  }

  function render() {
    layout();
    const res = out('res');
    res.replaceChildren();
    const m = mode();
    if (m === 'mw') renderMw(res); else if (m === 'step') renderStep(res); else if (m === 'xc') renderXc(res); else renderTg(res);
    res.append(srcList());
    res.append(el('div', { class: 'pc-links' },
      el('a', { class: 'btn btn-ghost', href: `${home}term/crystallinity/` }, U.l_xc),
      el('a', { class: 'btn btn-ghost', href: `${home}term/glass-transition-temperature/` }, U.l_tg),
      el('a', { class: 'btn btn-ghost', href: `${home}methods/#m-dsc` }, U.l_dsc),
      el('a', { class: 'btn btn-ghost', href: `${home}tools/xrd-bragg-calculator/` }, U.l_xrd),
      el('a', { class: 'btn btn-ghost', href: `${home}materials/` }, U.l_mat)));
    const pbox = out('presets');
    pbox.replaceChildren(presetTable());
    pbox.closest('section')?.querySelectorAll('h3').forEach(h => { if (h.nextElementSibling === pbox) h.hidden = m !== 'xc'; });
    pbox.hidden = m !== 'xc';
  }
  form.addEventListener('submit', e => e.preventDefault());
  form.addEventListener('input', () => setTimeout(render));
  form.addEventListener('change', () => setTimeout(render));
  render();
}
