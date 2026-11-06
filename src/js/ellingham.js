// エリンガム図ラボ。酸化物の標準生成ギブズエネルギー ΔG°(O₂ 1 mol あたり)と温度 T の線を描き、次を計算して、式に値を代入した形を見せる。
//   1. 図と平衡酸素分圧: ΔG° = RT ln p(O₂)(活量1、標準圧力 p° = 0.1 MPa = 1 bar。JANAF の標準状態)
//   2. H₂/H₂O: 還元と酸化の境目 (p(H₂)/p(H₂O))eq = exp[(ΔG°(H₂O) − ΔG°(酸化物))/(2RT)]、露点 ↔ 水蒸気分圧、全圧と H₂ の濃度
//   3. CO/CO₂: 境目 (p(CO)/p(CO₂))eq = exp[(ΔG°(CO₂) − ΔG°(酸化物))/(2RT)](2CO + O₂ → 2CO₂ の線)と、
//      炭素で還元できる温度(2C + O₂ → 2CO の線 + 2RT ln p(CO) との交点。p(CO) = 1 bar が既定)
//   4. 2つの酸化物の比べ: 金属 A が酸化物 B を還元する反応の ΔG° = ΔG°(A の酸化) − ΔG°(B の酸化)
// データ: NIST-JANAF Thermochemical Tables の ΔfG(100 K おき)を O₂ 1 mol あたりに直し、転移(融解・沸騰・変態)の温度を節にした
// 連続な折れ線(区間ごとに ΔG° = A + BT)に当てはめたもの。JANAF の値との差は最大 0.91 kJ/(mol O₂)
// (review の check/fit_data.py・check/fit_report.txt・check/data.md)。
// 飽和水蒸気圧: 水は Wagner・Pruss(IAPWS、J. Phys. Chem. Ref. Data 22 (1993) 783)、氷は IAPWS R14-08(2011) の昇華圧の式。
// 文言は data/tools/ellingham.json の text.{言語}.js。計算の関数(dG・seg・pO2・ratioH2・ratioCO・crossings・psat・dewOf など)は
// DOM なしで import できる(検算: review の check/check_ellingham.py と check/js_results.mjs)。
import { lineChart } from './chart.js';

// =====================================================================
// 定数とデータ
// =====================================================================
export const R = 8.31446261815324; // J/(mol·K)
export const K0 = 273.15;
export const P_STD = 1e5; // Pa。JANAF の標準圧力 0.1 MPa(1 bar)
export const ATM = 101325; // Pa
export const TMIN = 298.15, TMAX = 2000;
export const T_WUSTITE = 843.15; // 570 ℃。これより下でウスタイトは安定でない(Cao ほか ISIJ Int. 63 (2023) 366)
// knots: [T(K), ΔG°(kJ/(mol O₂))] の節。節の間は直線。
// mc・oc: O₂ 1 mol あたりの金属・酸化物の係数 [分子, 分母](比べの反応式に使う)。tr: 転移 [T(K), 'mp' 融解 | 'bp' 沸騰 | 'tr' 固相の変態, 物質]
// janaf: 使った JANAF の表
export const LINES = [
  { id: 'Cu2O', kind: 'ox', eq: '4Cu + O₂ → 2Cu₂O', m: 'Cu', mc: [4, 1], ox: 'Cu₂O', oc: [2, 1], janaf: ['Cu-021'],
    knots: [[298.15, -294.9], [1358, -138.9], [1516.7, -111.8], [2000, -69.7]], tr: [[1358, 'mp', 'Cu'], [1516.7, 'mp', 'Cu₂O']] },
  { id: 'CoO', kind: 'ox', eq: '2Co + O₂ → 2CoO', m: 'Co', mc: [2, 1], ox: 'CoO', oc: [2, 1], janaf: ['Co-013'],
    knots: [[298.15, -427.6], [700.1, -368.3], [1768, -219.1], [2000, -182.6]], tr: [[700.1, 'tr', 'Co'], [1768, 'mp', 'Co']] },
  { id: 'FeO', kind: 'ox', eq: '1.894Fe + O₂ → 2Fe₀.₉₄₇O', m: 'Fe', mc: [1.894, 1], ox: 'Fe₀.₉₄₇O', oc: [2, 1], janaf: ['Fe-001'],
    knots: [[298.15, -489.6], [1184, -374.6], [1600, -321.1]], tr: [[1184, 'tr', 'Fe']] },
  { id: 'Fe3O4', kind: 'ox', eq: '3/2Fe + O₂ → 1/2Fe₃O₄', m: 'Fe', mc: [3, 2], ox: 'Fe₃O₄', oc: [1, 2], janaf: ['Fe-032'],
    knots: [[298.15, -508.6], [600, -457.5], [900, -411.1], [1184, -368.5], [1665, -296], [1800, -276]], tr: [[1184, 'tr', 'Fe'], [1665, 'tr', 'Fe']] },
  { id: 'Cr2O3', kind: 'ox', eq: '4/3Cr + O₂ → 2/3Cr₂O₃', m: 'Cr', mc: [4, 3], ox: 'Cr₂O₃', oc: [2, 3], janaf: ['Cr-016'],
    knots: [[298.15, -701.8], [800, -613.3], [2000, -410.5]], tr: [] },
  { id: 'SiO2', kind: 'ox', eq: 'Si + O₂ → SiO₂', m: 'Si', mc: [1, 1], ox: 'SiO₂', oc: [1, 1], janaf: ['O-039'],
    knots: [[298.15, -856.3], [847, -756.7], [1685, -611.6], [1696, -609.8], [2000, -550.9]], tr: [[847, 'tr', 'SiO₂'], [1685, 'mp', 'Si'], [1696, 'mp', 'SiO₂']] },
  { id: 'TiO2', kind: 'ox', eq: 'Ti + O₂ → TiO₂', m: 'Ti', mc: [1, 1], ox: 'TiO₂', oc: [1, 1], janaf: ['O-045'],
    knots: [[298.15, -888.5], [1166, -732.6], [1939, -596.6], [2000, -585.5]], tr: [[1166, 'tr', 'Ti'], [1939, 'mp', 'Ti']] },
  { id: 'Al2O3', kind: 'ox', eq: '4/3Al + O₂ → 2/3Al₂O₃', m: 'Al', mc: [4, 3], ox: 'Al₂O₃', oc: [2, 3], janaf: ['Al-101'],
    knots: [[298.15, -1054.8], [933.45, -921.9], [2000, -688.9]], tr: [[933.45, 'mp', 'Al']] },
  { id: 'MgO', kind: 'ox', eq: '2Mg + O₂ → 2MgO', m: 'Mg', mc: [2, 1], ox: 'MgO', oc: [2, 1], janaf: ['Mg-010'],
    knots: [[298.15, -1137.7], [923, -1003.6], [1366.104, -900.9], [2000, -639.5]], tr: [[923, 'mp', 'Mg'], [1366.104, 'bp', 'Mg']] },
  { id: 'CaO', kind: 'ox', eq: '2Ca + O₂ → 2CaO', m: 'Ca', mc: [2, 1], ox: 'CaO', oc: [2, 1], janaf: ['Ca-029'],
    knots: [[298.15, -1206.8], [716, -1120], [1115, -1037.4], [1773.658, -890.8], [2000, -803.4]], tr: [[716, 'tr', 'Ca'], [1115, 'mp', 'Ca'], [1773.658, 'bp', 'Ca']] },
  { id: 'H2O', kind: 'gas', eq: '2H₂ + O₂ → 2H₂O(g)', janaf: ['H-064'], knots: [[298.15, -458], [900, -397], [2000, -271.4]], tr: [] },
  { id: 'CO', kind: 'gas', eq: '2C + O₂ → 2CO', janaf: ['C-093'], knots: [[298.15, -274.5], [1100, -418.8], [2000, -572.6]], tr: [] },
  { id: 'CO2', kind: 'gas', eq: 'C + O₂ → CO₂', janaf: ['C-095'], knots: [[298.15, -394.8], [2000, -396.8]], tr: [] },
  { id: 'COCO2', kind: 'gas', eq: '2CO + O₂ → 2CO₂', janaf: ['C-093', 'C-095'], knots: [[298.15, -514.4], [1200, -356.2], [2000, -220.3]], tr: [] },
];
export const byId = Object.fromEntries(LINES.map(x => [x.id, x]));
export const OXIDES = LINES.filter(x => x.kind === 'ox').map(x => x.id);
export const JANAF_URL = t => `https://janaf.nist.gov/tables/${t}.txt`;
export const SRC = {
  janaf: 'https://janaf.nist.gov/',
  wp: 'https://srd.nist.gov/jpcrdreprint/1.555926.pdf',
  iapws: 'https://iapws.org/relguide/MeltSub.html',
  cao: 'https://www.jstage.jst.go.jp/article/isijinternational/63/2/63_ISIJINT-2022-179/_html/-char/en',
};

// =====================================================================
// 線の値
// =====================================================================
const range = id => { const k = byId[id].knots; return [k[0][0], k[k.length - 1][0]]; };
export const inRange = (id, T) => { const [a, b] = range(id); return T >= a - 1e-9 && T <= b + 1e-9; };
// T(K)を含む区間 { t0, t1, A, B }(ΔG° = A + BT、A は kJ、B は kJ/K)
export function seg(id, T) {
  const k = byId[id]?.knots;
  if (!k || !inRange(id, T)) return null;
  let j = 0;
  while (j < k.length - 2 && T > k[j + 1][0]) j++;
  const [t0, g0] = k[j], [t1, g1] = k[j + 1];
  const B = (g1 - g0) / (t1 - t0);
  return { t0, t1, A: g0 - B * t0, B };
}
// ΔG°(kJ/(mol O₂))。範囲の外は null
export function dG(id, T) {
  const s = seg(id, T);
  return s ? s.A + s.B * T : null;
}
// 平衡酸素分圧(bar = p°)。ΔG° = RT ln p(O₂)
export const pO2 = (g, T) => Math.exp((g * 1000) / (R * T));
// 還元が進む境目の比 (p(H₂)/p(H₂O))eq と (p(CO)/p(CO₂))eq。実際の比がこれより大きければ還元側
export function ratioH2(id, T) {
  const a = dG(id, T), w = dG('H2O', T);
  return a == null || w == null ? null : Math.exp(((w - a) * 1000) / (2 * R * T));
}
export function ratioCO(id, T) {
  const a = dG(id, T), c = dG('COCO2', T);
  return a == null || c == null ? null : Math.exp(((c - a) * 1000) / (2 * R * T));
}
// 2C + O₂ → 2CO の線を p(CO)(bar)に合わせたもの: ΔG = ΔG° + 2RT ln p(CO)
export const dGcarbon = (T, pco = 1) => { const g = dG('CO', T); return g == null ? null : g + (2 * R * T * Math.log(pco)) / 1000; };
// f − g の符号が変わる温度(f と g は節の間で T の1次式なので、節で区切れば交点は厳密に求まる)。
// 返す: [{ T, up }](up: その温度より上で f > g になるなら true)
export function crossings(f, g, knotsTs, lo = TMIN, hi = TMAX) {
  const ts = [...new Set([lo, hi, ...knotsTs.filter(t => t > lo && t < hi)])].sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < ts.length - 1; i++) {
    const a = ts[i], b = ts[i + 1];
    const da = f(a) - g(a), db = f(b) - g(b);
    if (!Number.isFinite(da) || !Number.isFinite(db)) continue;
    if (da === 0 && i > 0) continue;
    if ((da < 0 && db > 0) || (da > 0 && db < 0) || (da === 0 && db !== 0)) {
      out.push({ T: da === 0 ? a : a + ((b - a) * da) / (da - db), up: db > da });
    }
  }
  return out;
}
const knotTs = (...ids) => ids.flatMap(id => byId[id].knots.map(k => k[0]));
const lo2 = (...ids) => Math.max(...ids.map(id => range(id)[0]));
const hi2 = (...ids) => Math.min(...ids.map(id => range(id)[1]));
// 2 本の線の交点
export const crossLines = (a, b) => crossings(T => dG(a, T), T => dG(b, T), knotTs(a, b), lo2(a, b), hi2(a, b));
// 炭素で還元できる温度(酸化物の線と 2C + O₂ → 2CO + 2RT ln p(CO) の交点)。up: その温度より上で炭素の線が下(還元できる)
export const carbonT = (id, pco = 1) => crossings(T => dG(id, T), T => dGcarbon(T, pco), knotTs(id, 'CO'), lo2(id, 'CO'), hi2(id, 'CO'));
// ΔG° = 0(p(O₂) = 1 bar)になる温度
export const zeroT = id => crossings(T => dG(id, T), () => 0, knotTs(id), ...range(id));

// =====================================================================
// 飽和水蒸気圧(Pa)。T は K
// =====================================================================
// 水: Wagner・Pruss (1993) ln(p/pc) = (Tc/T)(a₁τ + a₂τ^1.5 + a₃τ³ + a₄τ^3.5 + a₅τ⁴ + a₆τ^7.5)、τ = 1 − T/Tc(273.16〜647.096 K)
export const WP = { Tc: 647.096, pc: 22.064e6, a: [-7.85951783, 1.84408259, -11.7866497, 22.6807411, -15.9618719, 1.80122502] };
// 氷 Ih: IAPWS R14-08(2011) ln(p/pt) = θ⁻¹ Σ aᵢ θ^bᵢ、θ = T/Tt(50〜273.16 K)
export const ICE = { Tt: 273.16, pt: 611.657, a: [-21.2144006, 27.3203819, -6.10598130], b: [0.00333333333, 1.20666667, 1.70333333] };
export function psatWater(T) {
  if (!(T >= ICE.Tt && T <= WP.Tc)) return NaN;
  const t = 1 - T / WP.Tc, a = WP.a;
  return WP.pc * Math.exp((WP.Tc / T) * (a[0] * t + a[1] * t ** 1.5 + a[2] * t ** 3 + a[3] * t ** 3.5 + a[4] * t ** 4 + a[5] * t ** 7.5));
}
export function psatIce(T) {
  if (!(T >= 50 && T <= ICE.Tt)) return NaN;
  const th = T / ICE.Tt;
  return ICE.pt * Math.exp(ICE.a.reduce((s, ai, i) => s + ai * th ** ICE.b[i], 0) / th);
}
// 露点(0.01 ℃ = 273.16 K より下は霜点として氷の式)
export const psat = T => (T >= ICE.Tt ? psatWater(T) : psatIce(T));
export const DEW_MIN = 173.15; // −100 ℃ より下は出さない
// 水蒸気分圧(Pa)→ 露点(K)。−100 ℃ より低ければ -Infinity、臨界圧より高ければ NaN
export function dewOf(p) {
  if (!(p > 0)) return NaN;
  if (p < psat(DEW_MIN)) return -Infinity;
  if (p > WP.pc) return NaN;
  let a = DEW_MIN, b = WP.Tc;
  for (let i = 0; i < 80; i++) { const m = (a + b) / 2; if (psat(m) < p) a = m; else b = m; }
  return (a + b) / 2;
}
// H₂–N₂(乾き)に水蒸気が入った雰囲気。ptot・pw は Pa、x は乾きガスの中の H₂ の割合(0〜1)
export function h2Atmos(ptot, x, pw) {
  if (!(ptot > 0) || !(x > 0 && x <= 1) || !(pw > 0) || pw >= ptot) return null;
  const pH2 = x * (ptot - pw);
  return { pH2, ratio: pH2 / pw, ppm: (pw / ptot) * 1e6 };
}
// 境目の比 r のときの水蒸気分圧: pw = x·ptot/(r + x)
export const pwAtRatio = (ptot, x, r) => (x * ptot) / (r + x);
// 雰囲気の酸素分圧(bar): p(O₂) = (p(H₂O)/p(H₂))² exp(ΔG°(H₂O)/RT)
export const pO2ofH2 = (T, ratio) => { const w = dG('H2O', T); return w == null ? null : pO2(w, T) / ratio ** 2; };
export const pO2ofCO = (T, ratio) => { const c = dG('COCO2', T); return c == null ? null : pO2(c, T) / ratio ** 2; };

// 比べの反応式: 金属 A(線 a)が酸化物 B(線 b)を還元する。O₂ 1 mol あたり mcA·A + ocB·B酸化物 → ocA·A酸化物 + mcB·B
const gcd = (a, b) => (b ? gcd(b, a % b) : a);
export function reduceEq(a, b) {
  const A = byId[a], B = byId[b];
  const dens = [A.mc, A.oc, B.mc, B.oc].map(c => c[1]);
  const L = dens.reduce((l, d) => (l * d) / gcd(l, d), 1);
  const c = q => (q[0] / q[1]) * L;
  return { L, terms: [[c(A.mc), A.m], [c(B.oc), B.ox], [c(A.oc), A.ox], [c(B.mc), B.m]] };
}

// 例(値は計算のしかたを示すために作ったもの)
export const EXAMPLES = [
  { mode: 'h2', ox: 'Cr2O3', t: 1050, tu: 'C', ptot: 1, ptu: 'atm', xh2: 100, dp: -50 },
  { mode: 'h2', ox: 'Cu2O', t: 800, tu: 'C', ptot: 1, ptu: 'atm', xh2: 5, dp: 0 },
  { mode: 'co', ox: 'FeO', t: 800, tu: 'C', pco: 1, co: 50, co2: 50 },
  { mode: 'cmp', oa: 'Al2O3', ox: 'Cr2O3', t: 1000, tu: 'C' },
];

// =====================================================================
// 画面(ブラウザのときだけ)
// =====================================================================
const form = typeof document !== 'undefined' ? document.getElementById('ellingham-form') : null;
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
  const DEG = U.degc ?? '°C';

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
  // 有効数字 sig 桁。0.001 未満と 1000 以上は a×10ⁿ の形(1.2×10⁻²⁰、3.01×10³ など。「3010」のように桁を読み違えないように)
  const sci = (v, sig = 3) => {
    if (v === Infinity) return '∞';
    if (v == null || !Number.isFinite(v)) return '–';
    if (v === 0) return '0';
    const a = Math.abs(v);
    if (a >= 1e-3 && a < 1e3) return minus(nfsig(sig).format(v));
    return expo(v, sig);
  };
  const fix = (v, d) => (v == null || !Number.isFinite(v) ? '–' : minus(nfd(d).format(v)));
  const inp = v => (Number.isFinite(v) ? minus(nfmax(6).format(v)) : '–');
  const numOf = name => {
    const s = String(E[name]?.value ?? '').trim().replace(',', '.');
    return s === '' ? NaN : Number(s);
  };
  const decFix = t => (lang === 'de' ? t.replace(/(\d)\.(\d)/g, '$1,$2') : t);
  const kc = k => `${fix(k, 0)} K (${fix(k - K0, 0)} ${DEG})`; // 温度は K と ℃ の両方
  const kc1 = k => `${fix(k, 1)} K (${fix(k - K0, 1)} ${DEG})`;
  const kj = g => `${fix(g, 1)} kJ/(mol O₂)`;
  const coef = v => (Math.abs(v - 1) < 1e-9 ? '' : Number.isInteger(Math.round(v * 1000) / 1000) && Math.abs(v - Math.round(v)) < 1e-9 ? String(Math.round(v)) : nfmax(3).format(v));

  // ---- 見た目(このツールだけ) ----
  const css = document.createElement('style');
  css.textContent = `
#ellingham-form .el-wide { grid-column: 1 / -1; margin: 0; }
#ellingham-form .dy-field[hidden] { display: none !important; }
.el-tabs { display: flex; flex-wrap: wrap; gap: 6px; }
.el-tabs .btn { min-height: 40px; padding: 0 14px; }
.el-tabs .btn[aria-pressed="true"] { background: var(--accent); color: #fff; border-color: var(--accent); }
.el-ex { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.el-ex .btn { min-height: 36px; padding: 0 12px; font-size: .85rem; }
.el-box { margin: 12px 0; padding: 10px 12px; border-radius: 8px; background: var(--bg); }
.el-box h3 { margin: 0 0 6px; font-size: 1rem; }
.el-box ul { margin: 4px 0; padding-left: 1.3em; line-height: 1.7; }
.el-box p { margin: 4px 0; line-height: 1.7; }
.el-main { font-size: 1.05rem; line-height: 1.7; margin: 0 0 10px; padding: 10px 12px; border-radius: 8px; background: var(--accent-soft); }
.el-eq { font-family: var(--mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace); font-size: .88rem; line-height: 1.8; white-space: pre-wrap; overflow-wrap: anywhere; margin: 4px 0; }
.el-warn { color: var(--text); border-left: 3px solid var(--accent-2); padding-left: 8px; }
.el-tbl-wrap { overflow-x: auto; }
.el-tbl { width: 100%; border-collapse: collapse; font-size: .86rem; }
.el-tbl th, .el-tbl td { text-align: left; padding: 5px 6px; border-bottom: 1px solid var(--border); vertical-align: top; }
.el-tbl td.el-num { white-space: nowrap; font-variant-numeric: tabular-nums; }
.el-tbl thead th { font-size: .78rem; color: var(--muted); font-weight: 600; }
.el-tbl tr.el-on { background: var(--accent-soft); }
@media (max-width: 480px) { .el-tbl th, .el-tbl td { padding: 4px 3px; font-size: .78rem; } }
.el-links { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0 0; }
.el-legend { display: flex; flex-wrap: wrap; gap: 4px 6px; margin: 4px 0 0; font-size: .8rem; }
.el-legend button { display: inline-flex; align-items: center; gap: 5px; min-height: 30px; padding: 0 8px; border: 1px solid var(--border); border-radius: 6px; background: var(--card, transparent); color: var(--muted); font: inherit; cursor: pointer; }
.el-legend button[aria-pressed="true"] { color: var(--text); border-color: var(--accent); font-weight: 600; }
.el-legend button:disabled { cursor: default; }
.el-key { display: inline-block; width: 18px; height: 0; border-top: 3px solid var(--muted); }
.el-key.el-gas { border-top-style: dashed; }
.el-cap { font-size: .82rem; color: var(--muted); margin: 0 0 4px; }
`;
  document.head.append(css);

  const lab = n => E[n]?.closest('label');

  // ---- タブ ----
  const MODES = ['diag', 'h2', 'co', 'cmp'];
  lab('mode').hidden = true;
  const tabs = el('div', { class: 'el-tabs el-wide', role: 'group', 'aria-label': U.tabs_label },
    ...MODES.map(m => el('button', { type: 'button', class: 'btn btn-ghost', 'data-mode': m, 'aria-pressed': 'false' }, U[`tab_${m}`])));
  form.querySelector('h2').after(tabs);
  tabs.addEventListener('click', e => {
    const b = e.target.closest('[data-mode]');
    if (!b) return;
    E.mode.value = b.dataset.mode;
    form.dispatchEvent(new Event('change', { bubbles: true }));
  });

  // ---- 例 ----
  const ex = el('div', { class: 'el-ex el-wide' }, el('span', { class: 'muted' }, U.examples),
    ...EXAMPLES.map((x, i) => el('button', { type: 'button', class: 'btn btn-ghost', 'data-ex': String(i) }, U.ex[i])));
  tabs.after(ex);
  ex.after(el('p', { class: 'muted el-wide', style: 'font-size:.85rem' }, U.ex_note));
  ex.addEventListener('click', e => {
    const b = e.target.closest('[data-ex]');
    if (!b) return;
    for (const [k, v] of Object.entries(EXAMPLES[Number(b.dataset.ex)])) if (E[k]) E[k].value = String(v);
    form.dispatchEvent(new Event('change', { bubbles: true }));
  });

  // ---- 表示の切り替え ----
  const SHOW = { diag: [], h2: ['ptot', 'ptu', 'xh2', 'dp'], co: ['co', 'co2', 'pco'], cmp: ['oa'] };
  const COMMON = ['ox', 't', 'tu', 'lines'];
  const mode = () => (MODES.includes(E.mode.value) ? E.mode.value : 'diag');
  function layout() {
    const m = mode();
    for (const b of tabs.querySelectorAll('[data-mode]')) b.setAttribute('aria-pressed', String(b.dataset.mode === m));
    const on = new Set([...COMMON, ...SHOW[m]]);
    for (const f of form.querySelectorAll('.dy-field')) {
      const n = f.querySelector('[name]')?.name;
      if (!n || n === 'mode') continue;
      f.hidden = !on.has(n);
    }
    lab('ox').querySelector('span').textContent = m === 'cmp' ? U.ox_b : U.ox_label;
  }

  // ---- 部品 ----
  const stats = rows => el('dl', { class: 'dy-stats' }, ...rows.map(([k, v]) => el('div', {}, el('dt', {}, k), el('dd', {}, v))));
  const eq = (...lines) => el('p', { class: 'el-eq' }, decFix(lines.filter(Boolean).join('\n')));
  const box = (h, ...kids) => el('div', { class: 'el-box' }, h ? el('h3', {}, h) : null, ...kids);
  const warn = t => el('p', { class: 'el-warn' }, t);
  const ul = list => el('ul', {}, ...list.map(s => el('li', {}, s)));
  const link = (href, text) => el('a', { href, target: '_blank', rel: 'noopener' }, text);
  const name = id => T.lines[id];
  const svg = document.getElementById('el-chart');
  const cap = el('p', { class: 'el-cap' });
  svg.before(cap);
  const legend = el('div', { class: 'el-legend', role: 'group', 'aria-label': U.legend_label });
  svg.after(legend);
  // 図を結果の上に置く(図を見ながら数を読む)
  out('res').before(cap, svg, legend);
  legend.addEventListener('click', e => {
    const b = e.target.closest('[data-line]');
    if (!b || !OXIDES.includes(b.dataset.line)) return;
    E.ox.value = b.dataset.line;
    form.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const tempK = () => { const v = numOf('t'); return E.tu.value === 'K' ? v : v + K0; };
  const xOf = k => (E.tu.value === 'K' ? k : k - K0);
  const pBar = (p, sig = 3) => `${sci(p, sig)} bar (${sci((p * P_STD) / ATM, sig)} atm, ${sci(p * P_STD, sig)} Pa)`;
  const ptotPa = () => numOf('ptot') * ({ atm: ATM, kPa: 1e3, MPa: 1e6 }[E.ptu.value] ?? ATM);
  const trName = ([t, k, s]) => fill(U[`tr_${k}`], { s, t: kc(t) });

  // ---- グラフ ----
  function drawChart(Tk, hi, marks) {
    const m = mode();
    const which = E.lines.value;
    const strong = new Map(hi); // id → 'a'(選んだ線)| 'b'(比べる線)
    const ids = LINES.filter(x => strong.has(x.id) || which === 'all' || (which === 'ox' && x.kind === 'ox')).map(x => x.id);
    const series = [], meta = [];
    const add = (id, pts, style) => { series.push({ points: pts, cls: 'ac' }); meta.push({ id, style }); };
    // 0 の線(ΔG° = 0、p(O₂) = 1 bar)と、選んだ温度の縦線
    series.push({ points: [[xOf(TMIN), 0], [xOf(TMAX), 0]], cls: 'dash' }); meta.push({ style: 'zero' });
    for (const id of ids.filter(i => !strong.has(i)).concat(ids.filter(i => strong.has(i)))) {
      const L = byId[id];
      const pts = L.knots.map(([t, g]) => [xOf(t), g]);
      const style = strong.get(id) ?? 'dim';
      if (id === 'FeO') {
        // ウスタイトは約 570 ℃ より下で安定でないので、その部分は点線で
        const gw = dG('FeO', T_WUSTITE);
        add(id, [...pts.filter(p => p[0] <= xOf(T_WUSTITE)), [xOf(T_WUSTITE), gw]], `${style}-unstable`);
        add(id, [[xOf(T_WUSTITE), gw], ...pts.filter(p => p[0] > xOf(T_WUSTITE))], style);
      } else add(id, pts, style);
    }
    const ys = LINES.flatMap(x => x.knots.map(k => k[1]));
    series.push({ points: [[xOf(Tk), Math.min(...ys)], [xOf(Tk), 0]], cls: 'dash' }); meta.push({ style: 'now' });
    lineChart(svg, { series, xlabel: `T (${E.tu.value === 'K' ? 'K' : DEG})`, ylabel: U.y_label, marks: marks.map(([t, g, s]) => [xOf(t), g, s]) });
    // 線の見た目を付け直す(chart.js は 4 色だけなので、選んだ線を強調し、ほかは薄く。気体の線は破線)
    const paths = [...svg.querySelectorAll('path')];
    const NS = 'http://www.w3.org/2000/svg';
    const col = { a: 'var(--accent)', b: 'var(--accent-2)', dim: 'var(--muted)' };
    paths.forEach((p, i) => {
      const x = meta[i];
      if (!x) return;
      if (x.style === 'zero') { p.setAttribute('stroke', 'var(--text)'); p.setAttribute('stroke-width', '1'); p.removeAttribute('stroke-dasharray'); return; }
      if (x.style === 'now') return;
      const [st, uns] = x.style.split('-');
      const L = byId[x.id];
      p.setAttribute('stroke', col[st]);
      p.setAttribute('stroke-width', st === 'dim' ? '1.5' : '3');
      if (st === 'dim') p.setAttribute('stroke-opacity', '.45');
      if (uns) p.setAttribute('stroke-dasharray', '2 4');
      else if (L.kind === 'gas') p.setAttribute('stroke-dasharray', '8 4');
      const t = document.createElementNS(NS, 'title');
      t.textContent = `${name(x.id)}: ${decFix(L.eq)}`;
      p.append(t);
    });
    // 強調した線の名前と転移の点: 線の点と描いた座標から、データ → 画面の対応を求める
    const ref = meta.findIndex(x => x.style === 'a' || x.style === 'b');
    if (ref >= 0) {
      const d = paths[ref].getAttribute('d').match(/-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?/g).map(s => s.split(',').map(Number));
      const pts = series[ref].points;
      const i2 = pts.findIndex((p, i) => i > 0 && p[0] !== pts[0][0] && p[1] !== pts[0][1]);
      if (i2 > 0) {
        const ax = (d[i2][0] - d[0][0]) / (pts[i2][0] - pts[0][0]), bx = d[0][0] - ax * pts[0][0];
        const ay = (d[i2][1] - d[0][1]) / (pts[i2][1] - pts[0][1]), by = d[0][1] - ay * pts[0][1];
        const X = v => ax * v + bx, Y = v => ay * v + by;
        let html = '';
        for (const [id, st] of strong) {
          const L = byId[id];
          if (!ids.includes(id)) continue;
          for (const tr of L.tr) {
            const g = dG(id, tr[0]);
            html += `<circle cx="${X(xOf(tr[0])).toFixed(1)}" cy="${Y(g).toFixed(1)}" r="4" fill="var(--bg)" stroke="${col[st]}" stroke-width="2"><title>${trName(tr)}</title></circle>`;
          }
          const [t1, g1] = L.knots[L.knots.length - 1];
          html += `<text x="${Math.min(X(xOf(t1)), 580).toFixed(1)}" y="${(Y(g1) - 8).toFixed(1)}" font-size="13" text-anchor="end" fill="var(--text)" stroke="var(--bg)" stroke-width="3" paint-order="stroke">${L.kind === 'ox' ? L.ox : decFix(L.eq.replace(/ /g, ''))}</text>`;
        }
        svg.insertAdjacentHTML('beforeend', html);
      }
    }
    cap.textContent = fill(U.chart_cap, { a: name(hi[0][0]) });
    legend.replaceChildren(...LINES.map(L => el('button', { type: 'button', 'data-line': L.id, 'aria-pressed': String(strong.has(L.id)), disabled: L.kind === 'gas' ? true : null, title: decFix(L.eq) },
      el('span', { class: `el-key${L.kind === 'gas' ? ' el-gas' : ''}`, style: strong.has(L.id) ? `border-top-color:${col[strong.get(L.id)]}` : 'opacity:.6' }),
      L.kind === 'ox' ? L.ox : decFix(L.eq))));
  }

  // ---- 共通の結果: ΔG° と平衡 p(O₂) ----
  function basics(id, Tk) {
    const L = byId[id], s = seg(id, Tk), g = dG(id, Tk);
    const p = pO2(g, Tk);
    return box(fill(U.h_basic, { a: name(id) }),
      stats([[U.s_dg, kj(g)], [U.s_po2, pBar(p)], ['log₁₀ p(O₂)/bar', fix(Math.log10(p), 2)], [U.s_seg, `${fix(s.t0, 0)}–${fix(s.t1, 0)} K`]]),
      eq(L.eq,
        `ΔG° = A + B·T = ${fix(s.A, 1)} + ${fix(s.B * 1000, 2)}×10⁻³ × ${fix(Tk, 2)} = ${fix(g, 1)} kJ/(mol O₂)`,
        `p(O₂)/p° = exp(ΔG°/RT) = exp(${fix(g * 1000, 0)} / (8.314 × ${fix(Tk, 2)})) = ${sci(p, 3)}`),
      el('p', { class: 'muted' }, U.basic_note));
  }
  const tempWarn = (res, id, Tk) => {
    if (id === 'FeO' && Tk < T_WUSTITE) res.append(warn(U.feo_low));
  };

  // 1. 図と平衡酸素分圧
  function renderDiag(res, id, Tk) {
    const g = dG(id, Tk);
    res.append(el('p', { class: 'el-main' }, fill(U.diag_main, { a: name(id), t: kc1(Tk), g: kj(g), p: sci(pO2(g, Tk), 2) })));
    tempWarn(res, id, Tk);
    res.append(basics(id, Tk));
    const L = byId[id];
    const z = zeroT(id);
    res.append(box(U.h_trans,
      L.tr.length ? ul(L.tr.map(trName)) : el('p', {}, U.no_trans),
      el('p', {}, z.length ? fill(U.zero_at, { t: kc1(z[0].T) }) : fill(U.zero_none, { a: kc(range(id)[0]), b: kc(range(id)[1]) })),
      id === 'FeO' ? el('p', {}, fill(U.feo_cross, { t: kc((crossLines('FeO', 'Fe3O4')[0] ?? {}).T) })) : null));
    // 表: その温度での全部の線(下ほど安定)
    const rows = LINES.map(x => ({ x, g: dG(x.id, Tk) })).filter(r => r.g != null).sort((a, b) => b.g - a.g); // 図と同じく上ほど ΔG° が大きい(下ほど安定)
    res.append(box(fill(U.h_table, { t: kc(Tk) }), el('div', { class: 'el-tbl-wrap' }, el('table', { class: 'el-tbl' },
      el('thead', {}, el('tr', {}, ...U.table_cols.map(c => el('th', { scope: 'col' }, c)))),
      el('tbody', {}, ...rows.map(({ x, g }) => el('tr', { class: x.id === id ? 'el-on' : null },
        el('th', { scope: 'row' }, name(x.id)), el('td', {}, decFix(x.eq)), el('td', { class: 'el-num' }, fix(g, 1)), el('td', { class: 'el-num' }, sci(pO2(g, Tk), 2))))))),
      el('p', { class: 'muted' }, U.table_note)));
    drawChart(Tk, [[id, 'a']], [[Tk, g, `${fix(g, 0)}`]]);
  }

  // 2. H₂/H₂O と露点
  function renderH2(res, id, Tk) {
    const r = ratioH2(id, Tk), gw = dG('H2O', Tk), g = dG(id, Tk);
    const ptot = ptotPa(), x = numOf('xh2') / 100, dp = numOf('dp');
    const dK = dp + K0;
    const pw = Number.isFinite(dp) ? psat(dK) : NaN;
    const A = Number.isFinite(pw) ? h2Atmos(ptot, x, pw) : null;
    if (!(ptot > 0)) { res.append(warn(U.need_ptot)); }
    else if (!(x > 0 && x <= 1)) { res.append(warn(U.need_xh2)); }
    else if (!Number.isFinite(pw)) { res.append(warn(U.need_dp)); }
    else if (!A) { res.append(warn(U.dp_high)); }
    if (A) {
      const red = A.ratio > r;
      res.append(el('p', { class: 'el-main' }, fill(red ? U.h2_red : U.h2_ox, { a: name(id), t: kc1(Tk), r: sci(r, 3), q: sci(A.ratio, 3), d: fix(dp, 1) })));
    }
    tempWarn(res, id, Tk);
    const pwEq = pwAtRatio(ptot, x, r);
    const dEq = dewOf(pwEq);
    res.append(stats([
      [U.s_req, sci(r, 3)],
      [U.s_req_inv, sci(1 / r, 3)],
      ...(A ? [[U.s_ratio, sci(A.ratio, 3)], [U.s_pw, `${sci(pw, 4)} Pa`], [U.s_ppm, `${sci(A.ppm, 3)} ppm`], [U.s_po2_atm, pBar(pO2ofH2(Tk, A.ratio), 2)]] : []),
      [U.s_dew_eq, dEq === -Infinity ? U.dew_below : Number.isFinite(dEq) ? `${fix(dEq - K0, 1)} ${DEG} (${fix(dEq, 1)} K)` : '–'],
    ]));
    const cr = crossLines(id, 'H2O');
    res.append(box(U.h_eq,
      el('p', {}, U.h2_eq_lead),
      eq(`${byId[id].eq}   ΔG°₁ = ${fix(g, 1)} kJ/(mol O₂)`,
        `2H₂ + O₂ → 2H₂O(g)   ΔG°₂ = ${fix(gw, 1)} kJ/(mol O₂)`,
        `(p(H₂)/p(H₂O))eq = exp[(ΔG°₂ − ΔG°₁)/(2RT)] = exp[(${fix(gw * 1000, 0)} − (${fix(g * 1000, 0)})) / (2 × 8.314 × ${fix(Tk, 2)})] = ${sci(r, 3)}`,
        A ? `p(H₂O) = p_sat(${fix(dp, 1)} ${DEG}) = ${sci(pw, 4)} Pa   (${dK < ICE.Tt ? U.ice : U.water})` : '',
        A ? `p(H₂) = x(H₂) × (P − p(H₂O)) = ${inp(x)} × (${sci(ptot, 6)} − ${sci(pw, 4)}) = ${sci(A.pH2, 4)} Pa` : '',
        A ? `p(H₂)/p(H₂O) = ${sci(A.ratio, 3)} ${A.ratio > r ? '>' : '<'} ${sci(r, 3)}` : '',
        A ? `p(O₂) = (p(H₂O)/p(H₂))² × exp(ΔG°₂/RT) = ${sci(pO2ofH2(Tk, A.ratio), 3)} bar` : '',
        `p(H₂O)eq = x(H₂)·P / (r_eq + x(H₂)) = ${sci(pwEq, 3)} Pa → ${U.s_dew_eq} ${dEq === -Infinity ? U.dew_below : `${fix(dEq - K0, 1)} ${DEG}`}`),
      el('p', {}, cr.length ? fill(U.h2_one, { t: kc1(cr[0].T) }) : fill(U.h2_one_none, { a: name(id) })),
      el('p', { class: 'muted' }, U.psat_note)));
    res.append(basics(id, Tk));
    res.append(box(U.h_caution, ul(U.h2_cautions)));
    const marks = [[Tk, g, '']];
    for (const c of cr) marks.push([c.T, dG(id, c.T), fix(c.T - (E.tu.value === 'K' ? 0 : K0), 0)]);
    drawChart(Tk, [[id, 'a'], ['H2O', 'b']], marks);
  }

  // 3. CO/CO₂ と炭素
  function renderCo(res, id, Tk) {
    const r = ratioCO(id, Tk), g = dG(id, Tk), gc = dG('COCO2', Tk);
    const co = numOf('co'), co2 = numOf('co2'), pco = numOf('pco');
    const q = co > 0 && co2 > 0 ? co / co2 : NaN;
    const ok = pco > 0;
    if (Number.isFinite(q)) res.append(el('p', { class: 'el-main' }, fill(q > r ? U.co_red : U.co_ox, { a: name(id), t: kc1(Tk), r: sci(r, 3), q: sci(q, 3) })));
    else res.append(warn(U.need_co));
    tempWarn(res, id, Tk);
    const ct = ok ? carbonT(id, pco) : [];
    const gC = ok ? dGcarbon(Tk, pco) : null;
    const L = byId[id];
    let ctText;
    if (!ok) ctText = U.need_pco;
    else if (ct.length) ctText = ct.map(c => fill(c.up ? U.c_above : U.c_below, { t: kc1(c.T), p: inp(pco) })).join(' ');
    else ctText = fill(gC < g ? U.c_always : U.c_never, { p: inp(pco), a: kc(lo2(id, 'CO')), b: kc(hi2(id, 'CO')) });
    res.append(stats([
      [U.s_rco, sci(r, 3)],
      ...(Number.isFinite(q) ? [[U.s_qco, sci(q, 3)], [U.s_po2_atm, pBar(pO2ofCO(Tk, q), 2)]] : []),
      [U.s_ct, ct.length ? kc1(ct[0].T) : '–'],
    ]));
    // 炭素による還元の反応式: (oc)MOx + 2C → (mc)M + 2CO
    const oc = L.oc[0] / L.oc[1], mc = L.mc[0] / L.mc[1];
    const lcm = [L.mc[1], L.oc[1]].reduce((l, d) => (l * d) / gcd(l, d), 1);
    res.append(box(U.h_eq,
      el('p', {}, U.co_eq_lead),
      eq(`2CO + O₂ → 2CO₂   ΔG°₃ = ${fix(gc, 1)} kJ/(mol O₂)`,
        `(p(CO)/p(CO₂))eq = exp[(ΔG°₃ − ΔG°₁)/(2RT)] = exp[(${fix(gc * 1000, 0)} − (${fix(g * 1000, 0)})) / (2 × 8.314 × ${fix(Tk, 2)})] = ${sci(r, 3)}`,
        Number.isFinite(q) ? `p(CO)/p(CO₂) = ${inp(co)} / ${inp(co2)} = ${sci(q, 3)} ${q > r ? '>' : '<'} ${sci(r, 3)}` : '',
        '',
        ok ? `${coef(oc * lcm)}${L.ox} + ${coef(2 * lcm)}C → ${coef(mc * lcm)}${L.m} + ${coef(2 * lcm)}CO` : '',
        ok ? `ΔG = [ΔG°(2C + O₂ → 2CO) + 2RT ln p(CO)] − ΔG°₁ = (${fix(dG('CO', Tk), 1)} + ${fix(gC - dG('CO', Tk), 1)}) − (${fix(g, 1)}) = ${fix(gC - g, 1)} kJ/(mol O₂)${lcm !== 1 ? ` (×${lcm} = ${fix((gC - g) * lcm, 1)} kJ)` : ''}` : ''),
      el('p', {}, ctText),
      el('p', { class: 'muted' }, U.c_note)));
    res.append(basics(id, Tk));
    res.append(box(U.h_caution, ul(U.co_cautions)));
    const marks = [[Tk, g, '']];
    for (const c of ct) marks.push([c.T, dG(id, c.T), fix(c.T - (E.tu.value === 'K' ? 0 : K0), 0)]);
    drawChart(Tk, [[id, 'a'], ['CO', 'b'], ['COCO2', 'b']], marks);
  }

  // 4. 2つの比べ
  function renderCmp(res, id, Tk) {
    const a = E.oa.value;
    const A = byId[a], B = byId[id];
    if (A.m === B.m) {
      res.append(warn(U.cmp_same));
      res.append(basics(id, Tk));
      drawChart(Tk, [[id, 'a'], [a, 'b']], []);
      return;
    }
    const ga = dG(a, Tk), gb = dG(id, Tk);
    if (ga == null) { res.append(warn(fill(U.out_range_a, { a: name(a), lo: kc(range(a)[0]), hi: kc(range(a)[1]) }))); drawChart(Tk, [[id, 'a'], [a, 'b']], []); return; }
    const d = ga - gb;
    const { L, terms } = reduceEq(a, id);
    const rx = `${coef(terms[0][0])}${terms[0][1]} + ${coef(terms[1][0])}${terms[1][1]} → ${coef(terms[2][0])}${terms[2][1]} + ${coef(terms[3][0])}${terms[3][1]}`;
    res.append(el('p', { class: 'el-main' }, fill(d < 0 ? U.cmp_yes : U.cmp_no, { a: A.m, b: B.ox, t: kc1(Tk), d: kj(d) })));
    tempWarn(res, id, Tk);
    const cr = crossLines(a, id);
    res.append(stats([[U.s_dga, kj(ga)], [U.s_dgb, kj(gb)], [U.s_diff, kj(d)], [U.s_diff_rx, `${fix(d * L, 1)} kJ`]]));
    res.append(box(U.h_eq,
      el('p', {}, U.cmp_eq_lead),
      eq(`(A) ${A.eq}   ΔG°_A = ${fix(ga, 1)} kJ/(mol O₂)`,
        `(B) ${B.eq}   ΔG°_B = ${fix(gb, 1)} kJ/(mol O₂)`,
        `(A) − (B): ${rx}`,
        `ΔG° = ΔG°_A − ΔG°_B = ${fix(ga, 1)} − (${fix(gb, 1)}) = ${fix(d, 1)} kJ/(mol O₂)${L !== 1 ? `   ×${L} → ${fix(d * L, 1)} kJ` : ''}`),
      el('p', {}, cr.length ? cr.map(c => fill(U.cmp_cross, { t: kc1(c.T) })).join(' ') : fill(U.cmp_nocross, { a: kc(lo2(a, id)), b: kc(hi2(a, id)) })),
      el('p', { class: 'muted' }, U.cmp_note)));
    res.append(basics(id, Tk));
    res.append(box(U.h_caution, ul(U.cmp_cautions)));
    const marks = [[Tk, gb, ''], [Tk, ga, '']];
    for (const c of cr) marks.push([c.T, dG(id, c.T), fix(c.T - (E.tu.value === 'K' ? 0 : K0), 0)]);
    drawChart(Tk, [[id, 'a'], [a, 'b']], marks);
  }

  function srcList(id, m) {
    const ids = [id, ...(m === 'h2' ? ['H2O'] : m === 'co' ? ['CO', 'COCO2'] : m === 'cmp' ? [E.oa.value] : [])];
    const tabs = [...new Set(ids.flatMap(i => byId[i].janaf))];
    return el('p', { class: 'muted' }, U.src_h, ' ',
      link(SRC.janaf, 'NIST-JANAF Thermochemical Tables'), ' (', ...tabs.flatMap((t, i) => [i ? ', ' : '', link(JANAF_URL(t), t)]), ')',
      ...(m === 'h2' ? [' · ', link(SRC.wp, 'Wagner & Pruss 1993 (IAPWS)'), ' · ', link(SRC.iapws, 'IAPWS R14-08(2011)')] : []),
      ...(id === 'FeO' ? [' · ', link(SRC.cao, 'Cao et al., ISIJ Int. 63 (2023) 366')] : []));
  }

  function render() {
    layout();
    const res = out('res');
    res.replaceChildren();
    const m = mode();
    const id = OXIDES.includes(E.ox.value) ? E.ox.value : 'Cr2O3';
    const Tk = tempK();
    if (!Number.isFinite(Tk)) { res.append(warn(U.need_t)); return; }
    if (!inRange(id, Tk)) {
      res.append(warn(fill(U.out_range, { a: name(id), lo: kc(range(id)[0]), hi: kc(range(id)[1]) })));
      drawChart(Math.min(Math.max(Tk, TMIN), TMAX), [[id, 'a']], []);
    } else if (m === 'diag') renderDiag(res, id, Tk);
    else if (m === 'h2') renderH2(res, id, Tk);
    else if (m === 'co') renderCo(res, id, Tk);
    else renderCmp(res, id, Tk);
    res.append(box(U.h_assume, ul(U.assume)));
    res.append(srcList(id, m));
    res.append(el('div', { class: 'el-links' },
      el('a', { class: 'btn btn-ghost', href: `${home}term/ellingham-diagram/` }, U.l_term),
      el('a', { class: 'btn btn-ghost', href: `${home}term/equilibrium-oxygen-partial-pressure/` }, U.l_po2),
      ...(U.l_learn ? [el('a', { class: 'btn btn-ghost', href: `${home}learn/why-iron-rusts/` }, U.l_learn)] : []),
      el('a', { class: 'btn btn-ghost', href: `${home}tools/iron-carbon-phase-diagram/` }, U.l_fec),
      el('a', { class: 'btn btn-ghost', href: `${home}tools/diffusion-coefficient-calculator/` }, U.l_diff),
      el('a', { class: 'btn btn-ghost', href: `${home}c/thermodynamics/` }, U.l_cat)));
  }
  form.addEventListener('submit', e => e.preventDefault());
  form.addEventListener('input', () => setTimeout(render));
  form.addEventListener('change', () => setTimeout(render));
  render();
}
