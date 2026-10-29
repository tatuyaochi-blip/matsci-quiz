// 熱膨張・熱応力ラボ。1ページに7つのモード(タブ)を持つ:
//   free  熱膨張: ΔL = ∫α dT(温度依存のある材料は表・式から)、面積・体積・密度の変化、ε(T) の図
//   con   拘束と熱応力: 両端固定の棒(一軸)、2軸に拘束された板、3軸、ばねで部分的に拘束、すき間のある壁。σ–T の図
//   grad  温度差による内部の応力: 厚さ方向に線形の温度分布をもつ板(自由・平らに保持・完全拘束)、
//         定常の熱伝導(対数分布)の中空円筒(Timoshenko & Goodier)
//   bond  2つの材料の接合: バイメタル(Timoshenko 1925)、基板上の薄膜の熱応力と Stoney の式、
//         測った曲率から膜の応力(Stoney)、はんだ接合のせん断ひずみと Engelmaier の寿命の目安
//   shock 熱衝撃: R = σf(1−ν)/(Eα)、R′ = Rκ、ビオ数 β = ah/κ と Manson の式で割れる温度差、材料の比べ
//   fit   熱膨張の合わせ込み: 焼きばめ・冷やしばめ(Lamé の式)、すき間の変化、ガラスと金属の封着の膨張差
//   lib   材料のデータ集(値と出典、温度依存の曲線)
// 値と出典は review の sources.md、検算は scripts/check_thermal.py(python で独立に計算して突き合わせる)。
// 純粋な計算の関数は export し、DOM の部分は form があるときだけ動かす(node から関数を呼んで検算するため)
// 符号: 応力は引張が正、温度差 ΔT = T2 − T1、熱ひずみ ε = ΔL/L(微小ひずみ。ε の差をそのまま使う)
import { num, sci } from './eng.js';
import { EL } from './ptable.js';
import { MATS as ASHBY } from './ashby.js';

// =====================================================================
// 出典
// =====================================================================
const SRC_JA = {
  WPa: 'Wikipedia「Thermal expansion coefficients of the elements (data page)」(CRC Handbook・Lange・WebElements の値, 25 °C 付近)',
  WPe: 'Wikipedia「Elastic properties of the elements (data page)」(WebElements のポアソン比)',
  WPk: 'Wikipedia「Thermal conductivities of the elements (data page)」(300 K 付近)',
  PT: '材料科学教室の周期表(ptable.js: 密度 CRC Handbook, ヤング率 WebElements)',
  A: 'M. F. Ashby, Material property data for engineering materials, 5th ed. (Ansys Granta, 2021)(材料選びチャートと同じ範囲。代表値は範囲の相乗平均)',
  HID: 'P. Hidnert, Thermal expansion of aluminum and various important aluminum alloys, Sci. Pap. Bur. Stand. 19 (1924)(99.95 % Al: Lt = L0[1 + (22.58t + 0.00989t²)×10⁻⁶], 室温–約 610 °C)',
  NMIJ_CU: 'NMIJ CRM 5805-a 高純度銅(産業技術総合研究所, 20–300 K の熱膨張率の認証値)',
  SW: 'C. A. Swenson, J. Phys. Chem. Ref. Data 12 (1983) 179(Si の推奨値, 100–800 K)',
  NMIJ_AL2O3: 'NMIJ CRM 5801-a アルミナ(293.15–1100 K の熱膨張率の認証値)',
  NMIJ_SIO2: 'NMIJ CRM 5802-a シリカガラス(293.15–800 K の熱膨張率の認証値)',
  EC3: 'EN 1993-1-1(E = 210 GPa, ν = 0.3, α = 12×10⁻⁶ K⁻¹)・EN 1993-1-2(構造用鋼の熱ひずみと熱伝導率の式, 20–1200 °C)',
  RA: 'Rolled Alloys, Invar 36 data sheet(70 °F からの平均の線膨張係数, 0.2 % 耐力)',
  HTI: 'High Temp Metals, Invar 36 technical data(焼なまし材の E, 密度, 熱伝導率, キュリー温度)',
  HTK: 'High Temp Metals, Kovar technical data(25 °C からの平均の線膨張係数, E, 密度, 熱伝導率, 降伏強さ)',
  F15: 'ASTM F15(Fe-29Ni-17Co 封着合金。平均の線膨張係数 30–400 °C: 4.60–5.20, 30–450 °C: 5.10–5.50 ×10⁻⁶ K⁻¹)',
  KY: '京セラ ファインセラミックスの材料特性(データシート。曲げ強度は3点曲げ JIS R 1601, 熱衝撃は水中投下 JIS R 1648)',
  ISO: 'ISO 16293-1:2008(建築用ソーダ石灰ガラスの一般的な物性値)',
  SCH: 'SCHOTT BOROFLOAT 33 の技術資料(α 20–300 °C, E, ν, 曲げ強度, ひずみ点)',
  COR: 'Corning HPFS 7980 溶融シリカのデータ(E, ν, 密度, 熱伝導率, 平均 CTE, ひずみ点, 傷をつけた試料の曲げ強度)',
  WSL: 'Wikipedia「Soda–lime glass」の表(板ガラスの Tg 564 °C)',
  ISOLA: 'Isola 370HR データシート(FR-4 系積層板。CTE x/y, E, ν, 熱伝導率, 曲げ強度, Tg)',
  H10: 'M. A. Hopcroft, W. D. Nix, T. W. Kenny, J. Microelectromech. Syst. 19 (2010) 229(Si の E・ν, (100) の二軸弾性率 180 GPa, C11 = 165.7, C12 = 63.9, C44 = 79.6 GPa)',
};
const SRC_EN = {
  WPa: 'Wikipedia, "Thermal expansion coefficients of the elements (data page)" (values from the CRC Handbook, Lange and WebElements, near 25 °C)',
  WPe: 'Wikipedia, "Elastic properties of the elements (data page)" (Poisson ratios from WebElements)',
  WPk: 'Wikipedia, "Thermal conductivities of the elements (data page)" (near 300 K)',
  PT: 'This site\'s periodic table for materials (ptable.js: density from the CRC Handbook, Young\'s modulus from WebElements)',
  A: 'M. F. Ashby, Material property data for engineering materials, 5th ed. (Ansys Granta, 2021) (same ranges as the material selection chart; representative value = geometric mean of the range)',
  HID: 'P. Hidnert, Thermal expansion of aluminum and various important aluminum alloys, Sci. Pap. Bur. Stand. 19 (1924) (99.95 % Al: Lt = L0[1 + (22.58t + 0.00989t²)×10⁻⁶], room temperature to about 610 °C)',
  NMIJ_CU: 'NMIJ CRM 5805-a high-purity copper (AIST; certified thermal expansivity, 20–300 K)',
  SW: 'C. A. Swenson, J. Phys. Chem. Ref. Data 12 (1983) 179 (recommended values for Si, 100–800 K)',
  NMIJ_AL2O3: 'NMIJ CRM 5801-a alumina (certified thermal expansivity, 293.15–1100 K)',
  NMIJ_SIO2: 'NMIJ CRM 5802-a silica glass (certified thermal expansivity, 293.15–800 K)',
  EC3: 'EN 1993-1-1 (E = 210 GPa, ν = 0.3, α = 12×10⁻⁶ K⁻¹) and EN 1993-1-2 (thermal strain and conductivity equations for structural steel, 20–1200 °C)',
  RA: 'Rolled Alloys, Invar 36 data sheet (mean CTE from 70 °F, 0.2 % proof stress)',
  HTI: 'High Temp Metals, Invar 36 technical data (annealed E, density, thermal conductivity, Curie temperature)',
  HTK: 'High Temp Metals, Kovar technical data (mean CTE from 25 °C, E, density, thermal conductivity, yield strength)',
  F15: 'ASTM F15 (Fe-29Ni-17Co sealing alloy; mean CTE 30–400 °C: 4.60–5.20, 30–450 °C: 5.10–5.50 ×10⁻⁶ K⁻¹)',
  KY: 'Kyocera fine ceramics material properties (data sheets; flexural strength by three-point bending JIS R 1601, thermal shock by water quench JIS R 1648)',
  ISO: 'ISO 16293-1:2008 (general physical properties of soda-lime silicate glass for building)',
  SCH: 'SCHOTT BOROFLOAT 33 technical data (α 20–300 °C, E, ν, flexural strength, strain point)',
  COR: 'Corning HPFS 7980 fused silica data (E, ν, density, thermal conductivity, mean CTE, strain point, flexural strength of abraded samples)',
  WSL: 'Wikipedia, "Soda–lime glass" (table: Tg of float glass 564 °C)',
  ISOLA: 'Isola 370HR data sheet (FR-4 class laminate: CTE x/y, E, ν, thermal conductivity, flexural strength, Tg)',
  H10: 'M. A. Hopcroft, W. D. Nix, T. W. Kenny, J. Microelectromech. Syst. 19 (2010) 229 (E and ν of Si, biaxial modulus of (100) 180 GPa, C11 = 165.7, C12 = 63.9, C44 = 79.6 GPa)',
};
// 出典の文は ja だけ日本語、ほかの言語は英語
export const SRC = typeof document !== 'undefined' && document.documentElement?.lang === 'ja' ? SRC_JA : SRC_EN;

// =====================================================================
// 温度依存の熱ひずみ(曲線)
// =====================================================================
// kind: inst は温度ごとの瞬間の α(10⁻⁶ K⁻¹)を台形で積分、mean は基準温度 tref からの平均の α(ε = ᾱ(T − tref))を
// 点ごとの ε にして直線でつなぐ、fn は熱ひずみの式。T は °C。lo・hi が使える範囲(°C)
const K0 = 273.15;
const fromK = arr => arr.map(t => Number((t - K0).toFixed(2)));
function makeInst(T, A) {
  const E = [0];
  for (let i = 1; i < T.length; i++) E.push(E[i - 1] + ((A[i - 1] + A[i]) / 2) * (T[i] - T[i - 1]) * 1e-6);
  return { T, A, E };
}
function makeMean(T, A, tref) {
  const pts = T.map((t, i) => [t, A[i] * (t - tref) * 1e-6]);
  pts.push([tref, 0]);
  pts.sort((p, q) => p[0] - q[0]);
  return { T: pts.map(p => p[0]), E: pts.map(p => p[1]), Am: A, Tm: T, tref };
}
// 区分線形の補間(範囲外は NaN)
function interp(xs, ys, x) {
  if (!(x >= xs[0] - 1e-9 && x <= xs[xs.length - 1] + 1e-9)) return NaN;
  let i = 1;
  while (i < xs.length - 1 && x > xs[i]) i++;
  const t = (x - xs[i - 1]) / (xs[i] - xs[i - 1]);
  return ys[i - 1] + t * (ys[i] - ys[i - 1]);
}
// inst の ε: 区間の中では α が直線なので、ε は2次(台形の続き)
function instEps(c, x) {
  const { T, A, E } = c;
  if (!(x >= T[0] - 1e-9 && x <= T[T.length - 1] + 1e-9)) return NaN;
  let i = 1;
  while (i < T.length - 1 && x > T[i]) i++;
  const dx = x - T[i - 1], a0 = A[i - 1], a1 = A[i], slope = (a1 - a0) / (T[i] - T[i - 1]);
  return E[i - 1] + (a0 * dx + (slope * dx * dx) / 2) * 1e-6;
}
export const CURVES = {
  al: { kind: 'fn', lo: 20, hi: 600, src: 'HID', eps: t => (22.58 * t + 0.00989 * t * t) * 1e-6 },
  steel: {
    kind: 'fn', lo: 20, hi: 1200, src: 'EC3',
    eps: t => (t <= 750 ? 1.2e-5 * t + 0.4e-8 * t * t - 2.416e-4 : t <= 860 ? 1.1e-2 : 2e-5 * t - 6.2e-3),
  },
  cu: { kind: 'inst', src: 'NMIJ_CU', ...makeInst(fromK([20, 40, 60, 80, 100, 120, 140, 160, 180, 200, 220, 240, 260, 280, 300]),
    [0.279, 2.26, 5.457, 8.328, 10.486, 12.044, 13.182, 14.024, 14.665, 15.174, 15.585, 15.927, 16.22, 16.479, 16.713]) },
  si: { kind: 'inst', src: 'SW', ...makeInst(fromK([100, 140, 160, 200, 240, 260, 293.15, 300, 400, 500, 600, 700, 800]),
    [-0.339, 0.306, 0.689, 1.406, 1.986, 2.223, 2.555, 2.618, 3.251, 3.61, 3.844, 4.017, 4.159]) },
  al2o3: { kind: 'inst', src: 'NMIJ_AL2O3', ...makeInst(fromK([293.15, 300, 350, 400, 450, 500, 550, 600, 650, 700, 750, 800, 850, 900, 950, 1000, 1050, 1100]),
    [5.365, 5.467, 6.124, 6.647, 7.068, 7.41, 7.693, 7.933, 8.142, 8.327, 8.495, 8.649, 8.792, 8.925, 9.046, 9.158, 9.26, 9.353]) },
  silica: { kind: 'inst', src: 'NMIJ_SIO2', ...makeInst(fromK([293.15, 300, 350, 400, 450, 500, 550, 600, 650, 700, 750, 800]),
    [0.524, 0.531, 0.572, 0.592, 0.595, 0.585, 0.564, 0.537, 0.508, 0.479, 0.454, 0.438]) },
  // Rolled Alloys の表は °F と 10⁻⁶/°F。°C と 10⁻⁶/°C に直した値(× 1.8)。基準は 70 °F = 21.1 °C
  invar: { kind: 'mean', src: 'RA', ...makeMean([-200, -100, 100, 150, 200, 250, 300, 350, 400, 450, 500],
    [0.8, 0.7, 0.8, 1.1, 1.4, 1.9, 3.1, 4.0, 4.7, 5.2, 5.6].map(v => Number((v * 1.8).toFixed(3))), (70 - 32) / 1.8) },
  kovar: { kind: 'mean', src: 'HTK', ...makeMean([100, 200, 300, 350, 400, 450, 500, 600, 700, 800, 900],
    [5.86, 5.2, 5.13, 4.89, 5.06, 5.25, 6.15, 7.8, 9.12, 10.31, 11.26], 25) },
};
for (const c of Object.values(CURVES)) if (c.kind !== 'fn') { c.lo = c.T[0]; c.hi = c.T[c.T.length - 1]; }
// 曲線の熱ひずみ(基準は曲線ごと。差だけを使う)
export function curveEps(c, t) {
  if (!c || !(t >= c.lo - 1e-9 && t <= c.hi + 1e-9)) return NaN;
  if (c.kind === 'fn') return c.eps(t);
  if (c.kind === 'inst') return instEps(c, t);
  return interp(c.T, c.E, t);
}
// 曲線の瞬間の α(10⁻⁶ K⁻¹)。mean は区間の傾き
export function curveAlpha(c, t) {
  if (!c || !(t >= c.lo - 1e-9 && t <= c.hi + 1e-9)) return NaN;
  if (c.kind === 'inst') return interp(c.T, c.A, t);
  const h = 0.05;
  const a = Math.max(c.lo, t - h), b = Math.min(c.hi, t + h);
  return ((curveEps(c, b) - curveEps(c, a)) / (b - a)) * 1e6;
}

// =====================================================================
// 材料のデータ集
// =====================================================================
// 単位: a 線膨張係数 10⁻⁶ K⁻¹(ar はその値の温度範囲 °C。null は 25 °C 付近の値)、E GPa、nu ポアソン比、k 熱伝導率 W/(m·K)、
// s 強さ MPa(sk: y 降伏・耐力、f 曲げ強度、t 引張、A Ashby の降伏強さの欄)、rho g/cm³、dT メーカーの水中投下の熱衝撃温度差 °C、
// sp ガラスのひずみ点 °C(なければ Tg)、src 性質ごとの出典の略号、curve CURVES の鍵、ash ashby.js の材料
const gm = r => (r ? Number(Math.sqrt(r[0] * r[1]).toPrecision(3)) : null);
const ashRow = id => ASHBY.find(m => m[0] === id);
const ashVal = (id, i) => gm(ashRow(id)?.[i]);
const el = s => EL.find(e => e.s === s);
// 元素: α・ν・κ は Wikipedia の data page、E・密度は周期表(ptable.js)の値をそのまま使う
const ELEM = [
  ['al', 'Al', 23.1, 0.35, 237, 'al', 'al'], ['cu', 'Cu', 16.5, 0.34, 401, 'cu', 'cu'], ['fe', 'Fe', 11.8, 0.29, 80.4, null, null],
  ['ni', 'Ni', 13.4, 0.31, 90.9, null, 'ni'], ['ti', 'Ti', 8.6, 0.32, 21.9, null, 'ti'], ['w', 'W', 4.5, 0.28, 173, null, 'w'],
  ['mo', 'Mo', 4.8, 0.31, 138, null, null], ['ag', 'Ag', 18.9, 0.37, 429, null, null], ['au', 'Au', 14.2, 0.44, 318, null, null],
  ['pb', 'Pb', 28.9, 0.44, 35.3, null, 'pb'], ['sn', 'Sn', 22.0, 0.36, 66.8, null, null], ['mg', 'Mg', 24.8, 0.29, 156, null, 'mg'],
  ['zn', 'Zn', 30.2, 0.25, 116, null, null], ['cr', 'Cr', 4.9, 0.21, 93.9, null, null], ['ta', 'Ta', 6.3, 0.34, 57.5, null, null],
  ['pt', 'Pt', 8.8, 0.38, 71.6, null, null],
];
const LIB0 = [
  ...ELEM.map(([id, s, a, nu, k, curve, ash]) => ({ id, g: 'metal', sym: s, a, ar: null, E: el(s).E, nu, k, s: null, rho: el(s).d, curve, ash,
    src: { a: 'WPa', E: 'PT', nu: 'WPe', k: 'WPk', rho: 'PT' } })),
  { id: 'steel', g: 'alloy', a: 12, ar: [20, 100], E: 210, nu: 0.3, k: 53.3, s: 235, sk: 'y', rho: 7.85, curve: 'steel', ash: 'lcs',
    src: { a: 'EC3', E: 'EC3', nu: 'EC3', k: 'EC3', s: 'EC3', rho: 'A' } },
  { id: 'invar', g: 'alloy', a: 1.44, ar: [21, 100], E: 141, nu: null, k: 10.5, s: 241, sk: 'y', rho: 8.05, curve: 'invar', curie: 279,
    src: { a: 'RA', E: 'HTI', k: 'HTI', s: 'RA', rho: 'HTI' } },
  { id: 'kovar', g: 'alloy', a: 5.86, ar: [25, 100], E: 138, nu: null, k: 17.3, s: 345, sk: 'y', rho: 8.36, curve: 'kovar', curie: 435,
    src: { a: 'HTK', E: 'HTK', k: 'HTK', s: 'HTK', rho: 'HTK' } },
  { id: 'al2o3', g: 'ceramic', a: 7.2, ar: [40, 400], E: 360, nu: 0.23, k: 29, s: 310, sk: 'f', rho: 3.8, dT: 200, curve: 'al2o3', ash: 'al2o3',
    src: { a: 'KY', E: 'KY', nu: 'KY', k: 'KY', s: 'KY', rho: 'KY' } },
  { id: 'si3n4', g: 'ceramic', a: 2.8, ar: [40, 400], E: 300, nu: 0.28, k: 27, s: 1020, sk: 'f', rho: 3.3, dT: 800,
    src: { a: 'KY', E: 'KY', nu: 'KY', k: 'KY', s: 'KY', rho: 'KY' } },
  { id: 'sic', g: 'ceramic', a: 3.7, ar: [40, 400], E: 440, nu: 0.17, k: 200, s: 450, sk: 'f', rho: 3.16, ash: 'sic',
    src: { a: 'KY', E: 'KY', nu: 'KY', k: 'KY', s: 'KY', rho: 'KY' } },
  { id: 'zro2', g: 'ceramic', a: 10.5, ar: [40, 400], E: 200, nu: 0.31, k: 3, s: 1000, sk: 'f', rho: 6.0, dT: 450,
    src: { a: 'KY', E: 'KY', nu: 'KY', k: 'KY', s: 'KY', rho: 'KY' } },
  { id: 'aln', g: 'ceramic', a: 4.6, ar: [40, 400], E: 320, nu: 0.24, k: 150, s: 310, sk: 'f', rho: ashVal('aln', 2), dT: 250, ash: 'aln',
    src: { a: 'KY', E: 'KY', nu: 'KY', k: 'KY', s: 'KY', rho: 'A' } },
  { id: 'cord', g: 'ceramic', a: 1.5, ar: [40, 400], E: 140, nu: 0.31, k: 4, s: 190, sk: 'f', rho: 2.5,
    src: { a: 'KY', E: 'KY', nu: 'KY', k: 'KY', s: 'KY', rho: 'KY' } },
  { id: 'soda', g: 'glass', a: 9, ar: [20, 300], E: 70, nu: 0.2, k: 1, s: ashVal('sodalime', 4), sk: 'A', rho: 2.5, sp: 564, ash: 'sodalime',
    src: { a: 'ISO', E: 'ISO', nu: 'ISO', k: 'ISO', s: 'A', rho: 'ISO', sp: 'WSL' } },
  { id: 'boro', g: 'glass', a: 3.25, ar: [20, 300], E: 64, nu: 0.2, k: 1.2, s: 25, sk: 'f', rho: 2.23, sp: 518, ash: 'boro',
    src: { a: 'SCH', E: 'SCH', nu: 'SCH', k: 'SCH', s: 'SCH', rho: 'SCH', sp: 'SCH' } },
  { id: 'silica', g: 'glass', a: 0.52, ar: [5, 35], E: 72.7, nu: 0.16, k: 1.3, s: 52.4, sk: 'f', rho: 2.201, sp: 893, curve: 'silica', ash: 'silica',
    src: { a: 'COR', E: 'COR', nu: 'COR', k: 'COR', s: 'COR', rho: 'COR', sp: 'COR' } },
  ...['epoxy', 'pc', 'pmma', 'pa', 'pe', 'pp', 'ptfe', 'peek'].map(id => ({ id, g: 'polymer', a: ashVal(id, 7), ar: null, E: ashVal(id, 3), nu: null,
    k: ashVal(id, 6), s: ashVal(id, 4), sk: 'A', rho: ashVal(id, 2), ash: id, src: { a: 'A', E: 'A', k: 'A', s: 'A', rho: 'A' } })),
  ...['cfrp', 'gfrp'].map(id => ({ id, g: 'composite', a: ashVal(id, 7), ar: null, E: ashVal(id, 3), nu: null,
    k: ashVal(id, 6), s: ashVal(id, 4), sk: 'A', rho: ashVal(id, 2), ash: id, src: { a: 'A', E: 'A', k: 'A', s: 'A', rho: 'A' } })),
  { id: 'fr4', g: 'composite', a: 13, ar: [25, 180], E: 25.8, nu: 0.177, k: 0.4, s: 621, sk: 'f', rho: null, tg: 180,
    src: { a: 'ISOLA', E: 'ISOLA', nu: 'ISOLA', k: 'ISOLA', s: 'ISOLA' } },
  // Si: 等方の平均(多結晶の値 E = 160 GPa、ν = 0.22)、(100) ウェーハ(E[100] = 130 GPa、ν = 0.28 → 二軸弾性率 180 GPa)、
  // (111) ウェーハ(面内は等方で E = 169 GPa。二軸弾性率 M111 = 6C44(C11 + 2C12)/(C11 + 2C12 + 4C44) から ν = 1 − E/M)
  { id: 'si', g: 'semi', sym: 'Si', a: 2.6, ar: null, E: 160, nu: 0.22, k: 149, s: null, rho: el('Si').d, curve: 'si',
    src: { a: 'WPa', E: 'H10', nu: 'H10', k: 'WPk', rho: 'PT' } },
  { id: 'si100', g: 'semi', sym: 'Si', a: 2.6, ar: null, E: 130, nu: 0.28, k: 149, s: null, rho: el('Si').d, curve: 'si',
    src: { a: 'WPa', E: 'H10', nu: 'H10', k: 'WPk', rho: 'PT' } },
  { id: 'si111', g: 'semi', sym: 'Si', a: 2.6, ar: null, E: 169, nu: null, k: 149, s: null, rho: el('Si').d, curve: 'si',
    src: { a: 'WPa', E: 'H10', nu: 'H10', k: 'WPk', rho: 'PT' } },
];
// Si の弾性定数(Hall、Hopcroft 2010 の表)から (111) 面の二軸弾性率と ν
export const SI_C = { C11: 165.7, C12: 63.9, C44: 79.6 };
export const M100 = SI_C.C11 + SI_C.C12 - (2 * SI_C.C12 ** 2) / SI_C.C11;
export const M111 = (6 * SI_C.C44 * (SI_C.C11 + 2 * SI_C.C12)) / (SI_C.C11 + 2 * SI_C.C12 + 4 * SI_C.C44);
LIB0.find(m => m.id === 'si111').nu = Number((1 - 169 / M111).toFixed(3));
export const LIB = LIB0;
export const GROUPS = ['metal', 'alloy', 'ceramic', 'glass', 'polymer', 'composite', 'semi'];
export const matById = id => LIB.find(m => m.id === id);
export const ashbyRange = (m, i) => (m.ash ? ashRow(m.ash)?.[i] ?? null : null);
// 熱衝撃の比べに使う材料と、封着で比べる金属
export const SHOCK_IDS = ['soda', 'boro', 'silica', 'al2o3', 'si3n4', 'sic', 'zro2', 'aln', 'cord'];
export const SEAL_METALS = ['w', 'mo', 'kovar', 'invar', 'pt', 'ni', 'fe', 'cu'];

// =====================================================================
// 計算
// =====================================================================
// 材料 m(null は自分で入れた値)の T1→T2 の熱ひずみ。useCurve で曲線があり範囲内なら曲線、それ以外は一定の α(10⁻⁶ K⁻¹)
export function thStrain(m, a, t1, t2, useCurve) {
  const c = useCurve && m?.curve ? CURVES[m.curve] : null;
  if (c) {
    const e1 = curveEps(c, t1), e2 = curveEps(c, t2);
    if (Number.isFinite(e1) && Number.isFinite(e2)) {
      const eps = e2 - e1;
      return { eps, by: 'curve', c, mean: t2 !== t1 ? (eps / (t2 - t1)) * 1e6 : curveAlpha(c, t1) };
    }
    return { eps: a * 1e-6 * (t2 - t1), by: 'const', out: true, c, mean: a };
  }
  return { eps: a * 1e-6 * (t2 - t1), by: 'const', mean: a };
}
// 自由な膨張: 長さ・面積・体積(等方)、密度
export function freeExp(eps, L) {
  return { dL: eps * L, L2: L * (1 + eps), dA: (1 + eps) ** 2 - 1, dV: (1 + eps) ** 3 - 1, rhoRatio: 1 / (1 + eps) ** 3 };
}
// 拘束: 熱ひずみの差 de(材料 − 拘束する側)から応力(Pa)。E は Pa
//   rod 一軸 σ = −E·de、plate 等二軸 σ = −E·de/(1 − ν)、tri 静水圧 σ = −E·de/(1 − 2ν)
//   spring 棒(長さ L、断面 A)の一端がばね(k N/m)に当たる: σ = −E·de / (1 + EA/(kL))
//   gap すき間 g の剛い壁: de·L > g なら σ = −E(de − g/L)、それまでは 0(加熱で伸びる向きだけ)
export function conStress({ type, E, nu, de, L = 1, A = 1, k = Infinity, g = 0 }) {
  if (type === 'rod') return { s: -E * de, eta: 1 };
  if (type === 'plate') return { s: (-E * de) / (1 - nu), eta: 1 };
  if (type === 'tri') return { s: (-E * de) / (1 - 2 * nu), eta: 1 };
  if (type === 'spring') { const eta = 1 / (1 + (E * A) / (k * L)); return { s: -E * de * eta, eta, F: E * de * eta * A }; }
  if (type === 'gap') { const over = de * L - g; return { s: over > 0 ? (-E * over) / L : 0, eta: over > 0 ? over / (de * L) : 0, contact: over > 0 }; }
  return { s: NaN };
}
// 厚さ h の板。温度は中央面で Tm(応力のない温度からの上昇)、厚さ方向に直線で、上の面(z = +h/2)が下の面より dT 高い
//   free  縁が自由: 応力なし、曲率 κ = α·dT/h(上の面が伸びて凸)
//   flat  平らに保持(曲げを止め、面内は自由): σ(z) = −Eα·dT·(z/h)/(1 − ν)
//   clamp 面内も曲げも拘束: σ(z) = −Eα(Tm + dT·z/h)/(1 − ν)
export function plateGrad({ bc, E, nu, a, dT, Tm, h, z }) {
  const al = a * 1e-6;
  if (bc === 'free') return 0;
  if (bc === 'flat') return (-E * al * dT * (z / h)) / (1 - nu);
  return (-E * al * (Tm + dT * (z / h))) / (1 - nu);
}
// 中空円筒(内半径 ra、外半径 rb)、定常の熱伝導で T(r) = To + dT·ln(rb/r)/ln(rb/ra)(dT = Ti − To)。両端は自由(軸力 0、平面ひずみ + 一様な軸ひずみ)
// Timoshenko & Goodier の積分の式。I(r) = ∫_ra^r θ r dr(θ = T − To)
export function cylStress({ E, nu, a, dT, ra, rb, r }) {
  const Kc = (a * 1e-6 * E) / (1 - nu), L = Math.log(rb / ra);
  const th = x => (dT * Math.log(rb / x)) / L;
  const F = x => (x * x / 2) * Math.log(rb / x) + (x * x) / 4;
  const I = x => (dT / L) * (F(x) - F(ra));
  const Ib = I(rb), d2 = rb * rb - ra * ra;
  return {
    T: th(r),
    sr: (Kc / (r * r)) * (((r * r - ra * ra) / d2) * Ib - I(r)),
    st: (Kc / (r * r)) * (((r * r + ra * ra) / d2) * Ib + I(r) - th(r) * r * r),
    sz: Kc * ((2 * Ib) / d2 - th(r)),
  };
}
// バイメタル(Timoshenko 1925): 層1(厚さ t1、E1)・層2(t2、E2)、熱ひずみの差 de = ε2 − ε1。曲率 1/ρ(1/m)、層2 が凸の側
export function bimetal({ E1, E2, t1, t2, de }) {
  const m = t1 / t2, n = E1 / E2, h = t1 + t2;
  return (6 * de * (1 + m) ** 2) / (h * (3 * (1 + m) ** 2 + (1 + m * n) * (m * m + 1 / (m * n))));
}
// 薄膜: 二軸弾性率 Mf = Ef/(1 − νf)、熱ひずみ εf・εs(T1→T2)から σf = Mf(εs − εf)
export const filmStress = (Mf, es, ef) => Mf * (es - ef);
// Stoney: 曲率 κ = 6σf·tf/(Ms·ts²)(Ms = Es/(1 − νs))、逆に σf = Ms·ts²·κ/(6tf)
export const stoneyK = (sf, tf, Ms, ts) => (6 * sf * tf) / (Ms * ts * ts);
export const stoneyS = (kap, tf, Ms, ts) => (Ms * ts * ts * kap) / (6 * tf);
// はんだ接合(Engelmaier): Δγ = F·LD·|Δα|·ΔT/h、c = −0.442 − 6×10⁻⁴·Ts + 1.74×10⁻²·ln(1 + f)(Ts °C、f 回/日)、Nf = ½(Δγ/(2εf′))^(1/c)
export const EF = 0.325;
export const solder = ({ F, LD, h, da, dT, Ts, f }) => {
  const g = (F * LD * Math.abs(da) * 1e-6 * dT) / h;
  const c = -0.442 - 6e-4 * Ts + 1.74e-2 * Math.log(1 + f);
  return { g, c, N: 0.5 * (g / (2 * EF)) ** (1 / c) };
};
// 熱衝撃: R = σf(1 − ν)/(Eα)(K)、R′ = Rκ(W/m)、Manson の式 σ*/σmax = 1/(1.5 + 3.25/β − 0.5·e^(−16/β))(β = ah/κ、a は板の厚さの半分)
export const shockR = (s, nu, E, a) => (s * (1 - nu)) / (E * a * 1e-6);
export const manson = b => (b > 0 ? 1 / (1.5 + 3.25 / b - 0.5 * Math.exp(-16 / b)) : 0);
// 焼きばめ(厚肉円筒、Lamé): 直径のしめしろ δ、はめあい径 d、外側の外径 D、内側の穴径 di。外側 o、内側 i。E は Pa、長さは m
export function lame({ dl, d, D, di, Eo, nuo, Ei, nui }) {
  const p = dl / (d * ((1 / Eo) * ((D * D + d * d) / (D * D - d * d) + nuo) + (1 / Ei) * ((d * d + di * di) / (d * d - di * di) - nui)));
  return { p, sto: (p * (D * D + d * d)) / (D * D - d * d), sti: (-p * (d * d + di * di)) / (d * d - di * di) };
}
// f(T) = 0 となる T を、from から to の向きに探して最初に符号が変わる所で求める(from > to なら温度を下げる向き)。
// α の温度依存(コバールなど)で f が単調でないときや、曲線の範囲の端で α 一定に切り替わる所の段差を拾わないように、
// 先に 2000 等分で最初の符号の変化を探し、その区間を二分法で詰める
export function solveT(f, from, to) {
  const N = 2000;
  let xa = from, fa = f(xa);
  if (!Number.isFinite(fa)) return NaN;
  if (fa === 0) return xa;
  for (let k = 1; k <= N; k++) {
    const xb = from + ((to - from) * k) / N, fb = f(xb);
    if (!Number.isFinite(fb)) return NaN;
    if (fb === 0) return xb;
    if (fa * fb < 0) {
      let a = xa, b = xb;
      for (let i = 0; i < 100 && Math.abs(b - a) > 1e-7; i++) { const m = (a + b) / 2, fm = f(m); if (fa * fm <= 0) b = m; else { a = m; fa = fm; } }
      return (a + b) / 2;
    }
    xa = xb; fa = fb;
  }
  return NaN;
}

// =====================================================================
// 画面
// =====================================================================
const form = document.getElementById('thermal-form');
if (form) {
  const T = JSON.parse(form.dataset.text || '{}');
  const el = form.elements;
  const box = document.querySelector('[data-out="main"]');
  const home = document.documentElement.dataset.home ?? '/';
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const fmt = (s, o = {}) => String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (k in o ? o[k] : m));
  const optText = (name, v) => [...el[name].options].find(o => o.value === v)?.textContent ?? v;
  const val = (k, min = -Infinity, max = Infinity) => { const s = String(el[k].value).trim(), v = s === '' ? NaN : Number(s); return Number.isFinite(v) && v >= min && v <= max ? v : Number(el[k].defaultValue); };
  const n4 = (v, d = 4) => num(v, d);
  const MPa = s => `${num(s / 1e6, 4)} MPa`;
  const csvNum = v => (typeof v === 'number' ? (Number.isFinite(v) ? Number(v.toPrecision(6)).toString() : '') : `"${String(v).replace(/"/g, '""')}"`);
  // 熱ひずみの丸め残り(基準温度での曲線の値 2.7 × 10⁻²⁰ など)は 0 として出す(10⁻¹² より小さいひずみは意味を持たない)
  const ppm = e => `${num(Math.abs(e) < 1e-12 ? 0 : e * 1e6, 4)} × 10⁻⁶`;
  // 小数点がコンマの言語(de)では、式の中の区切りを「; 」にする(「n = 0,5385, h = 1 mm」のように紛れないように。ja・en は「, 」のまま)
  const SEP = num(1.5, 2).includes(',') ? '; ' : ', ';
  // 出典の文は ja・en 以外では英語なので、途中の式の1行目(曲線の出典)は短い書誌名にする
  const LANG = document.documentElement.lang || 'en';
  const curveShort = c => (c.src === 'EC3' ? 'EN 1993-1-2' : c.src === 'HID' ? 'Hidnert 1924' : c.src === 'SW' ? 'Swenson 1983' : c.src.startsWith('NMIJ') ? 'NMIJ CRM' : c.src === 'RA' ? 'Rolled Alloys' : 'High Temp Metals');
  // Engelmaier・Manson の式の定数も、ほかの数と同じ書き方(de は 0,442)で出す
  const C442 = num(-0.442, 3), C174 = num(1.74, 3);
  const MANSON = `(${num(1.5, 2)} + ${num(3.25, 3)}/β − ${num(0.5, 2)}·e^(−16/β))`;
  const CURVE_REF = { HID: 'Hidnert 1924', EC3: 'EN 1993-1-2', SW: 'Swenson 1983', NMIJ_CU: 'NMIJ CRM 5805-a', NMIJ_AL2O3: 'NMIJ CRM 5801-a', NMIJ_SIO2: 'NMIJ CRM 5802-a', RA: 'Rolled Alloys, Invar 36', HTK: 'High Temp Metals, Kovar' };
  const curveSrcTxt = c => (LANG === 'ja' || LANG === 'en' ? SRC[c.src] : CURVE_REF[c.src] ?? SRC[c.src]);

  // ---- 見た目(このツールだけの小さな CSS) ----
  const css = document.createElement('style');
  css.textContent = `
#thermal-form .dy-field[hidden], #thermal-form .tx-sub[hidden] { display: none !important; }
#thermal-form .tx-wide { grid-column: 1 / -1; }
.tx-root .dy-stats { grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px; }
.tx-root .dy-stats dd { font-size: 1.1rem; overflow-wrap: anywhere; }
.tx-tabs { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 6px; margin: 0; }
.tx-tabs button { font: inherit; font-size: .88rem; font-weight: 600; padding: 8px 12px; border-radius: 999px; border: 1px solid var(--border); background: var(--bg); color: var(--text); cursor: pointer; min-height: 40px; }
.tx-tabs button[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); color: var(--surface); }
.tx-sub { grid-column: 1 / -1; margin: 6px 0 -4px; font-size: .85rem; font-weight: 700; color: var(--text); border-top: 1px solid var(--border); padding-top: 10px; }
.tx-root { --tx-1: #2a78d6; --tx-2: #eb6834; --tx-3: #1baf7a; --tx-4: #eda100; --tx-5: #e87ba4; --tx-6: #008300; --tx-7: #6250d6; --tx-8: #e34948; --tx-9: #6b7f99; }
@media (prefers-color-scheme: dark) { .tx-root { --tx-1: #3987e5; --tx-2: #d95926; --tx-3: #199e70; --tx-4: #c98500; --tx-5: #d55181; --tx-6: #2f9a2f; --tx-7: #9085e9; --tx-8: #e66767; --tx-9: #8fa3bd; } }
.tx-root h3 { margin: 18px 0 8px; font-size: 1.02rem; }
.tx-root .fig { padding: 8px; }
.tx-root .fig svg { max-width: 640px; touch-action: pan-y; }
.tx-root .fig svg text { font-size: 13px; }
.tx-warn { margin: 8px 0; padding: 8px 12px; border-radius: 8px; font-size: .88rem; line-height: 1.6; background: var(--ng-bg); color: var(--text); border-left: 4px solid var(--ng); }
.tx-warn.soft { background: var(--accent-soft); border-left-color: var(--accent); }
.tx-legend { display: flex; flex-wrap: wrap; justify-content: center; gap: 4px 14px; margin: 6px 0 0; font-size: .82rem; color: var(--text); }
.tx-legend span { display: inline-flex; align-items: center; gap: 5px; }
.tx-legend svg { width: 26px; height: 10px; display: inline-block; margin: 0; }
.tx-read { margin: 6px 0 0; font-size: .82rem; color: var(--muted); text-align: center; min-height: 1.4em; font-variant-numeric: tabular-nums; }
.tx-steps { margin: 6px 0 0; padding-left: 1.3em; font-size: .88rem; line-height: 1.7; }
.tx-steps li { margin: 4px 0; }
.tx-steps code { display: block; white-space: pre-wrap; overflow-wrap: anywhere; font-size: .86rem; background: var(--bg); padding: 4px 8px; border-radius: 6px; color: var(--text); }
.tx-root .table-wrap { margin: .5rem 0; }
.tx-root .dy-table { font-size: .86rem; }
.tx-root .dy-table td.l, .tx-root .dy-table th.l { text-align: left; white-space: normal; }
.tx-root .dy-table th.l { min-width: 9.5em; }
.tx-root .dy-table td.l { min-width: 7em; }
.tx-root .dy-table tr.cur { background: var(--accent-soft); }
.tx-btns { display: flex; flex-wrap: wrap; gap: 8px; margin: 6px 0; }
.tx-ex { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin: 0 0 8px; font-size: .85rem; color: var(--muted); }
.tx-links { display: flex; flex-wrap: wrap; gap: 8px; margin: 10px 0 0; }
.tx-src { font-size: .8rem; color: var(--muted); margin: 4px 0 0; }
.tx-src li { margin: 2px 0; }
.tx-assume { font-size: .84rem; color: var(--muted); margin: 6px 0; line-height: 1.6; }
`;
  document.head.append(css);
  box.classList.add('tx-root');

  // ---- フォームの整え: タブ、副見出し、モードごとに見せる欄 ----
  const modeSel = el.mode;
  const modes = [...modeSel.options].map(o => o.value);
  const lab = n => el[n]?.closest('label');
  lab('mode').hidden = true;
  const tabs = document.createElement('div');
  tabs.className = 'tx-tabs';
  tabs.setAttribute('role', 'group');
  tabs.setAttribute('aria-label', lab('mode').querySelector('span').textContent);
  tabs.innerHTML = modes.map(m => `<button type="button" data-mode="${m}" aria-pressed="false">${esc(optText('mode', m))}</button>`).join('');
  form.querySelector('h2').after(tabs);
  const subs = {};
  for (const [before, key] of [['mat', 'sub_mat'], ['mat2', 'sub_mat2'], ['t1', 'sub_temp'], ['l', 'sub_geom'], ['tf', 'sub_film'], ['ld', 'sub_solder'], ['ha', 'sub_shock'], ['d', 'sub_fit']]) {
    const p = document.createElement('p');
    p.className = 'tx-sub';
    lab(before).before(p);
    subs[key] = p;
  }
  for (const n of ['con', 'geo', 'pbc', 'sub', 'fsub', 'grp', 'mat', 'mat2']) lab(n).classList.add('tx-wide');
  const MATF = ['mat', 'tdep', 'alpha', 'e', 'nu', 'sy'];
  const MAT2F = ['mat2', 'alpha2', 'e2', 'nu2'];
  const VIS = {
    free: ['sub_mat', 'mat', 'tdep', 'alpha', 'sub_temp', 't1', 't2', 'sub_geom', 'l'],
    con: ['con', 'sub_mat', ...MATF, 'sub_temp', 't1', 't2', 'as', 'sub_geom', 'l', 'k', 'area', 'gap'],
    grad: ['geo', 'pbc', 'sub_mat', 'mat', 'alpha', 'e', 'nu', 'sy', 'sub_temp', 'dtg', 'tm', 'sub_geom', 'hp', 'ri', 'ro'],
    bond: ['sub', 'sub_mat', ...MATF, 'sub_mat2', ...MAT2F, 'sub_temp', 't1', 't2', 'sub_geom', 'ta', 'tb', 'span', 'wide', 'sub_film', 'tf', 'ts', 'wd', 'r0', 'r1', 'sub_solder', 'ld', 'hs', 'ff', 'cpd'],
    shock: ['sub_mat', 'mat', 'alpha', 'e', 'nu', 'sy', 'kappa', 'sub_shock', 'ha', 'hc'],
    fit: ['fsub', 'sub_mat', ...MATF, 'sub_mat2', ...MAT2F, 'sub_temp', 'tset', 't1', 't2', 'sub_fit', 'd', 'dout', 'din', 'dlt', 'cl', 'c0'],
    lib: ['grp'],
  };
  const LABEL0 = {};
  for (const f of el) if (f.name) LABEL0[f.name] = f.closest('label')?.querySelector('span')?.textContent;
  const SUB0 = {};
  const relabel = mode => {
    const sub = el.sub.value, fsub = el.fsub.value;
    let over = {};
    if (mode === 'bond' && sub === 'bimetal') over = { mat: T.l_layer_a, mat2: T.l_layer_b, t1: T.l_t1_flat, sub_mat: T.sub_layer_a, sub_mat2: T.sub_layer_b };
    if (mode === 'bond' && sub === 'film') over = { mat: T.l_film, mat2: T.l_subst, t1: T.l_t1_dep, sy: T.l_sy_film, sub_mat: T.sub_film_mat, sub_mat2: T.sub_subst, sub_film: T.sub_film };
    if (mode === 'bond' && sub === 'stoney') over = { mat2: T.l_subst, sub_mat2: T.sub_subst, sub_film: T.sub_stoney };
    if (mode === 'bond' && sub === 'solder') over = { mat: T.l_comp, mat2: T.l_board, t1: T.l_tmin, t2: T.l_tmax, sub_mat: T.sub_comp, sub_mat2: T.sub_board };
    if (mode === 'shock') over = { sy: T.l_sy_shock };
    if (mode === 'grad') over = { sy: T.l_sy_grad };
    if (mode === 'fit' && fsub === 'shrink') over = { mat: T.l_hub, mat2: T.l_shaft, t1: T.l_t1_room, t2: T.l_t2_op, sy: T.l_sy_hub, sub_mat: T.sub_hub, sub_mat2: T.sub_shaft };
    if (mode === 'fit' && fsub === 'gap') over = { mat: T.l_outer, mat2: T.l_inner, t1: T.l_t1_gap, d: T.l_d_gap, sub_mat: T.sub_outer, sub_mat2: T.sub_inner };
    if (mode === 'fit' && fsub === 'seal') over = { mat: T.l_glass, mat2: T.l_metal, t2: T.l_t2_room, sy: T.l_sy_glass, sub_mat: T.sub_glass, sub_mat2: T.sub_metal };
    if (mode === 'con') over = { t1: T.l_t1_free };
    for (const n in LABEL0) { const sp = lab(n)?.querySelector('span'); if (sp) sp.textContent = over[n] ?? LABEL0[n]; }
    for (const k in subs) subs[k].textContent = over[k] ?? T[k] ?? '';
  };
  const visible = () => {
    const mode = modeSel.value, show = new Set(VIS[mode]);
    const drop = (...ns) => ns.forEach(n => show.delete(n));
    if (mode === 'con') {
      const c = el.con.value;
      if (c !== 'spring') drop('k', 'area');
      if (c !== 'spring' && c !== 'gap') drop('sub_geom', 'l');
      if (c !== 'gap') drop('gap');
      if (c === 'rod' || c === 'spring' || c === 'gap') drop('nu');
    }
    if (mode === 'grad') {
      if (el.geo.value === 'plate') drop('ri', 'ro'); else drop('pbc', 'hp', 'tm');
    }
    if (mode === 'bond') {
      const s = el.sub.value;
      if (s !== 'bimetal') drop('ta', 'tb', 'span', 'wide');
      if (s !== 'film' && s !== 'stoney') drop('sub_film', 'tf', 'ts', 'wd');
      if (s !== 'stoney') drop('r0', 'r1');
      if (s !== 'solder') drop('sub_solder', 'ld', 'hs', 'ff', 'cpd');
      if (s === 'bimetal') drop('sy', 'sub_film');
      if (s === 'stoney') drop('sub_mat', ...MATF, 'alpha2', 'sub_temp', 't1', 't2', 'sub_geom');
      if (s === 'solder') drop('tdep', 'e', 'nu', 'sy', 'e2', 'nu2', 'sub_geom');
      if (s === 'film') drop('sub_geom');
    }
    if (mode === 'fit') {
      const s = el.fsub.value;
      if (s !== 'seal') drop('tset'); else drop('t1');
      if (s !== 'shrink') drop('dout', 'din', 'dlt', 'cl', 'sy');
      if (s !== 'gap') drop('c0');
      if (s === 'gap') drop('e', 'nu', 'e2', 'nu2', 'sy');
      if (s === 'seal') drop('e2', 'nu2', 'sub_fit', 'd');
      if (s === 'seal') show.add('sy');
    }
    for (const f of el) if (f.name && f.name !== 'mode') lab(f.name).hidden = !show.has(f.name);
    for (const k in subs) subs[k].hidden = !show.has(k);
    tabs.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
    relabel(mode);
  };
  tabs.addEventListener('click', e => {
    const b = e.target.closest('button[data-mode]');
    if (!b || b.dataset.mode === modeSel.value) return;
    modeSel.value = b.dataset.mode;
    fitDefaults();
    form.dispatchEvent(new Event('change', { bubbles: true }));
    form.dispatchEvent(new Event('input', { bubbles: true }));
  });

  // ---- 材料の選択と物性値の欄を合わせる ----
  const near = (a, b) => Math.abs(a - b) <= Math.abs(b) * 1e-6 + 1e-12;
  const PAIRS = { mat: [['alpha', 'a'], ['e', 'E'], ['nu', 'nu'], ['sy', 's'], ['kappa', 'k']], mat2: [['alpha2', 'a'], ['e2', 'E'], ['nu2', 'nu']] };
  const fillMat = which => {
    const m = matById(el[which].value);
    if (!m) return;
    for (const [f, p] of PAIRS[which]) if (m[p] != null) el[f].value = String(m[p]);
    if (which === 'mat' && m.sp != null) el.tset.value = String(m.sp);
  };
  const syncMat = which => { // 入力した値が選んだ材料と違えば「自分で入れた値」にする(データ集に値がない性質は比べない)
    const m = matById(el[which].value);
    if (m && PAIRS[which].some(([f, p]) => m[p] != null && !near(val(f), m[p]))) el[which].value = 'custom';
  };
  // 古い URL(mode=uniaxial / biaxial)を今の形に読み替える
  try {
    const nav = performance.getEntriesByType?.('navigation')?.[0]?.name ?? location.href;
    const q = new URL(nav).searchParams.get('mode');
    // 読み替えたあと change を送って、共有の URL(tool-share.js)にも今の条件を書き直させる
    if (q === 'uniaxial' || q === 'biaxial') { modeSel.value = 'con'; el.con.value = q === 'biaxial' ? 'plate' : 'rod'; setTimeout(() => form.dispatchEvent(new Event('change', { bubbles: true }))); }
  } catch {}
  syncMat('mat'); syncMat('mat2');
  form.addEventListener('input', e => {
    const t = e.target;
    if (t === el.mat) fillMat('mat'); else if (t === el.mat2) fillMat('mat2');
    else if (PAIRS.mat.some(([f]) => el[f] === t)) syncMat('mat');
    else if (PAIRS.mat2.some(([f]) => el[f] === t)) syncMat('mat2');
  });
  form.addEventListener('change', e => { if (e.target === el.mat) fillMat('mat'); if (e.target === el.mat2) fillMat('mat2'); });
  // 熱衝撃のタブやガラスの封着に切り替えたとき、データ集の材料が合わない群(既定の鋼など)なら、合う材料に替える
  // (自分で入れた値はそのまま。共有の URL から開いたときは切り替えの操作がないので、URL の材料のまま)
  function fitDefaults() {
    const m = curMat(), m2 = curMat2(), mode = modeSel.value;
    if (mode === 'shock' && m && !['ceramic', 'glass', 'semi'].includes(m.g)) { el.mat.value = 'al2o3'; fillMat('mat'); }
    if (mode === 'fit' && el.fsub.value === 'seal') {
      if (m && m.g !== 'glass') { el.mat.value = 'boro'; fillMat('mat'); }
      if (m2 && !['metal', 'alloy'].includes(m2.g)) { el.mat2.value = 'kovar'; fillMat('mat2'); }
    }
    // 焼きばめ・すき間: 内側(2つめ)は接合のタブと共有で、既定は Si ウェーハになっている。金属・合金でなければ鋼の軸に、
    // 外側(1つめ)がガラス・高分子・半導体なら鋼のボスにする(例題「鋼の焼きばめ」と同じ組み合わせ。強さの欄も鋼の値が入る)
    if (mode === 'fit' && el.fsub.value !== 'seal') {
      if (m2 && !['metal', 'alloy'].includes(m2.g)) { el.mat2.value = 'steel'; fillMat('mat2'); }
      if (m && ['glass', 'polymer', 'semi'].includes(m.g)) { el.mat.value = 'steel'; fillMat('mat'); }
    }
  }
  form.addEventListener('input', e => { if (e.target === el.fsub) fitDefaults(); });
  const matName = id => optText('mat', id);
  const curMat = () => matById(el.mat.value) ?? null;
  const curMat2 = () => matById(el.mat2.value) ?? null;
  const useCurve = () => el.tdep.value === 'curve';

  // ---- 図(SVG)----
  const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
  const pow10 = e => `10${String(e).replace(/./g, c => SUP[c])}`;
  const niceTicks = (a, b, n = 5) => {
    const span = b - a;
    if (!(span > 0)) return [a];
    const step0 = 10 ** Math.floor(Math.log10(span / n)), m = [1, 2, 2.5, 5, 10].find(k => span / (step0 * k) <= n + 0.5) * step0;
    const out = [];
    for (let v = Math.ceil(a / m - 1e-9) * m; v <= b + m * 1e-9; v += m) out.push(Number(v.toPrecision(12)));
    return out;
  };
  const logTicks = (a, b) => { const out = [], k = Math.max(1, Math.ceil((b - a) / 7)); for (let e = Math.ceil(a - 1e-9); e <= Math.floor(b + 1e-9); e += k) out.push([10 ** e, pow10(e)]); return out; };
  const sz = () => (box.clientWidth < 520 ? { W: 360, H: 270, l: 54, r: 10, t: 12, b: 40 } : { W: 640, H: 360, l: 66, r: 14, t: 14, b: 46 });
  // o: { xr, yr(対数なら log10 の範囲), xlog, ylog, xlabel, ylabel, lines [{pts, slot, dash, w}], dots [{x, y, slot}], hl [{y, label}], vl [{x, label}] }
  const bounds = (vals, pad = 0.06, zero = false) => {
    const v = vals.filter(Number.isFinite);
    if (!v.length) return [0, 1];
    let lo = Math.min(...v, ...(zero ? [0] : [])), hi = Math.max(...v, ...(zero ? [0] : []));
    if (hi - lo < 1e-12 * (Math.abs(hi) + 1)) { lo -= Math.abs(lo) * 0.1 + 1; hi += Math.abs(hi) * 0.1 + 1; }
    const p = (hi - lo) * pad;
    return [lo - p, hi + p];
  };
  function plot(svg, o) {
    const g = sz();
    const [x0, x1] = o.xr, [y0, y1] = o.yr;
    const yt = o.yt ?? (o.ylog ? logTicks(y0, y1) : niceTicks(y0, y1, 5).map(v => [v, num(v, 4)]));
    // 縦の目盛りの文字が長いときは左の余白を広げ、縦軸の名前(x = 13 を中心に回した文字)と重ならないようにする
    const chw = t => [...String(t)].reduce((w, c) => w + (/[,.]/.test(c) ? 3.8 : /[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]/.test(c) ? 5 : 8.2), 0);
    const L = Math.max(g.l, Math.ceil(Math.max(0, ...yt.map(([, t]) => chw(t))) + 5 + 23)), Rr = g.W - g.r, Tt = g.t, B = g.H - g.b;
    const fx = v => (o.xlog ? Math.log10(v) : v), fy = v => (o.ylog ? Math.log10(v) : v);
    const X = v => L + ((fx(v) - x0) / (x1 - x0)) * (Rr - L), Y = v => B - ((fy(v) - y0) / (y1 - y0)) * (B - Tt);
    const color = s => (s === 'ac' ? 'var(--text)' : s === 'mu' ? 'var(--muted)' : `var(--tx-${s})`);
    const id = svg.dataset.clip ?? (svg.dataset.clip = `txc${Math.random().toString(36).slice(2, 8)}`);
    const path = pts => {
      let d = '', pen = false;
      for (const [x, y] of pts) {
        const xx = (o.xlog && !(x > 0)) ? NaN : X(x), yy = (o.ylog && !(y > 0)) ? NaN : Y(y);
        if (!Number.isFinite(yy) || !Number.isFinite(xx)) { pen = false; continue; }
        d += `${pen ? 'L' : 'M'}${xx.toFixed(1)},${Math.max(Tt - 400, Math.min(B + 400, yy)).toFixed(1)}`;
        pen = true;
      }
      return d;
    };
    const xt = o.xt ?? (o.xlog ? logTicks(x0, x1) : niceTicks(x0, x1, g.W < 400 ? 4 : 6).map(v => [v, num(v, 4)]));
    // 横の目盛りの文字は図の外に出ないように寄せる(端の目盛りが枠の線の上にあるとき)
    const xl = (v, t) => Math.min(g.W - chw(t) / 2 - 1, Math.max(chw(t) / 2 + 1, X(v)));
    let s = `<defs><clipPath id="${id}"><rect x="${L}" y="${Tt}" width="${Rr - L}" height="${B - Tt}"/></clipPath></defs>`;
    s += `<rect x="${L}" y="${Tt}" width="${Rr - L}" height="${B - Tt}" fill="var(--bg)"/>`;
    // 原点の角に横と縦の目盛りが両方あるとき(対数軸の 10¹ と 10¹ など)、横の目盛りの文字を右に寄せて縦の目盛りの文字と重ねない
    const corner = yt.some(([v]) => Math.abs(Y(v) - B) < 1);
    const xtx = (v, t) => (corner && Math.abs(X(v) - L) < 1 ? `x="${L - 1}" text-anchor="start"` : `x="${xl(v, t)}" text-anchor="middle"`);
    s += xt.map(([v, t]) => `<line x1="${X(v)}" y1="${Tt}" x2="${X(v)}" y2="${B}" stroke="var(--border)"/><text ${xtx(v, t)} y="${B + 16}" fill="var(--muted)">${esc(t)}</text>`).join('');
    s += yt.map(([v, t]) => `<line x1="${L}" y1="${Y(v)}" x2="${Rr}" y2="${Y(v)}" stroke="var(--border)"/><text x="${L - 5}" y="${Y(v) + 4}" fill="var(--muted)" text-anchor="end">${esc(t)}</text>`).join('');
    s += `<rect x="${L}" y="${Tt}" width="${Rr - L}" height="${B - Tt}" fill="none" stroke="var(--muted)" stroke-width="1"/>`;
    s += `<g clip-path="url(#${id})">`;
    // 横線・縦線の文字は、線が図の範囲の中にあるときだけ描く(範囲の外の線の文字が図の外に出ないように)。
    // 横線の文字は上の枠に近ければ線の下に、縦線の文字は右に入りきらなければ線の左に置く(描いたあとに幅を測って直す)
    for (const h of o.hl ?? []) {
      const yy = Y(h.y), inside = yy >= Tt - 0.5 && yy <= B + 0.5;
      s += `<line x1="${L}" x2="${Rr}" y1="${yy}" y2="${yy}" stroke="var(--muted)" stroke-dasharray="${h.dash ?? '3 3'}"/>`;
      if (h.label && inside) s += `<text x="${Rr - 4}" y="${yy - 17 < Tt ? yy + 14 : yy - 4}" fill="var(--muted)" text-anchor="end">${esc(h.label)}</text>`;
    }
    const tw = t => [...String(t)].reduce((w, c) => w + (/[\u2e80-\u9fff\uac00-\ud7af\uff00-\uffef]/.test(c) ? 13 : /[,.:;il| ]/.test(c) ? 4 : 7.6), 0);
    for (const v of o.vl ?? []) {
      const xx = X(v.x);
      s += `<line y1="${Tt}" y2="${B}" x1="${xx}" x2="${xx}" stroke="var(--muted)" stroke-dasharray="3 3"/>`;
      if (v.label && xx >= L - 0.5 && xx <= Rr + 0.5) {
        const right = xx + 4 + tw(v.label) <= Rr - 2 || Rr - xx >= xx - L;
        s += `<text data-vl="${xx}" x="${right ? xx + 4 : xx - 4}" y="${Tt + 14}" fill="var(--muted)" text-anchor="${right ? 'start' : 'end'}">${esc(v.label)}</text>`;
      }
    }
    for (const ln of o.lines ?? []) s += `<path d="${path(ln.pts)}" fill="none" stroke="${color(ln.slot)}" stroke-width="${ln.w ?? 2}"${ln.dash ? ` stroke-dasharray="${ln.dash}"` : ''} stroke-linejoin="round" stroke-linecap="round"/>`;
    for (const d of o.dots ?? []) { const xx = X(d.x), yy = Y(d.y); if (Number.isFinite(xx) && Number.isFinite(yy)) s += `<circle cx="${xx}" cy="${yy}" r="${d.r ?? 4.5}" fill="${color(d.slot)}" stroke="var(--surface)" stroke-width="2"/>`; }
    s += `<line data-tx="cross" x1="0" x2="0" y1="${Tt}" y2="${B}" stroke="var(--text)" stroke-width="1" visibility="hidden"/>`;
    s += '</g>';
    s += `<text x="${(L + Rr) / 2}" y="${g.H - 6}" fill="var(--text)" text-anchor="middle">${esc(o.xlabel)}</text>`;
    s += `<text x="13" y="${(Tt + B) / 2}" fill="var(--text)" text-anchor="middle" transform="rotate(-90 13 ${(Tt + B) / 2})">${esc(o.ylabel)}</text>`;
    svg.setAttribute('viewBox', `0 0 ${g.W} ${g.H}`);
    svg.innerHTML = s;
    for (const t of svg.querySelectorAll('text[data-vl]')) {
      let w = 0;
      try { w = t.getComputedTextLength(); } catch {}
      if (!(w > 0)) continue;
      const xx = Number(t.dataset.vl), fitsR = xx + 4 + w <= Rr - 2, fitsL = xx - 4 - w >= L + 2;
      const right = fitsR || (!fitsL && Rr - xx >= xx - L);
      t.setAttribute('x', right ? xx + 4 : xx - 4);
      t.setAttribute('text-anchor', right ? 'start' : 'end');
    }
    return { X, Y, inv: px => { const v = x0 + ((px - L) / (Rr - L)) * (x1 - x0); return o.xlog ? 10 ** v : v; }, L, Rr };
  }
  const legend = items => items.map(it => `<span><svg viewBox="0 0 26 10" aria-hidden="true">${it.dot ? `<circle cx="13" cy="5" r="4" fill="var(--tx-${it.slot})"/>` : `<line x1="1" y1="5" x2="25" y2="5" stroke="${it.slot === 'ac' ? 'var(--text)' : it.slot === 'mu' ? 'var(--muted)' : `var(--tx-${it.slot})`}" stroke-width="${it.w ?? 2.5}"${it.dash ? ` stroke-dasharray="${it.dash}"` : ''}/>`}</svg>${esc(it.label)}</span>`).join('');
  // 図の上で指を動かす・カーソルを置くと、その位置の値を読む。縦のスクロールは止めない
  function hover(svg, geo, readOut, onX) {
    const cross = svg.querySelector('[data-tx="cross"]');
    const move = e => {
      const r = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal;
      const px = ((e.clientX - r.left) / r.width) * vb.width;
      if (px < geo.L || px > geo.Rr) return;
      cross.setAttribute('x1', px); cross.setAttribute('x2', px); cross.setAttribute('visibility', 'visible');
      readOut.textContent = onX(geo.inv(px));
    };
    svg.onpointermove = move;
    svg.onpointerdown = move;
    svg.onpointerleave = () => { cross.setAttribute('visibility', 'hidden'); readOut.textContent = readOut.dataset.def ?? ''; };
  }
  const figHTML = (key, label) => `<figure class="fig"><svg data-tx="${key}" role="img" aria-label="${esc(label)}"></svg><div class="tx-legend" data-tx="lg-${key}"></div><p class="tx-read" data-tx="rd-${key}"></p></figure>`;
  const q = s => box.querySelector(`[data-tx="${s}"]`);
  const setRead = (key, text) => { const r = q(`rd-${key}`); r.dataset.def = text; r.textContent = text; return r; };

  // ---- 表・コピー ----
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch {}
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.append(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch {}
    ta.remove();
    return ok;
  }
  const flash = (btn, text) => { const old = btn.textContent; btn.textContent = text; setTimeout(() => { btn.textContent = old; }, 1600); };
  const tables = {};
  const tableHTML = (name, head, rows, opts = {}) => {
    tables[name] = { head, rows: rows.map(r => r.map(c => (c && typeof c === 'object' ? c.v : c))) };
    return `<div class="table-wrap"><table class="dy-table"><thead><tr>${head.map((h, i) => `<th scope="col"${i === 0 ? ' class="l"' : ''}>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r, ri) => `<tr${opts.cur === ri ? ' class="cur"' : ''}>${r.map((c, i) => {
      const t = c && typeof c === 'object' ? c.t : typeof c === 'number' ? n4(c) : c ?? '—';
      return i === 0 ? `<th scope="row" class="l">${esc(t)}</th>` : `<td data-out="${name}-${ri}-${i}"${opts.left?.includes(i) ? ' class="l"' : ''}>${esc(t)}</td>`;
    }).join('')}</tr>`).join('')}</tbody></table></div><div class="tx-btns"><button type="button" class="btn btn-ghost btn-small" data-csv="${name}">${esc(T.csv)}</button></div>`;
  };
  box.addEventListener('click', async e => {
    const b = e.target.closest('[data-csv]');
    if (b) {
      const t = tables[b.dataset.csv];
      if (t && await copyText([t.head, ...t.rows].map(r => r.map(csvNum).join(',')).join('\n'))) flash(b, T.copied);
      return;
    }
    const x = e.target.closest('[data-ex]');
    if (x) loadExample(x.dataset.ex);
  });
  const stats = items => `<dl class="dy-stats">${items.filter(Boolean).map(([k, l, v]) => `<div><dt>${esc(l)}</dt><dd data-out="${k}">${esc(v)}</dd></div>`).join('')}</dl>`;
  let stepsOpen = false;
  const steps = items => `<details class="tx-stepbox"${stepsOpen ? ' open' : ''}><summary>${esc(T.steps)}</summary><ol class="tx-steps">${items.filter(Boolean).map(([l, f]) => `<li>${esc(l)}${f ? `<code>${esc(f)}</code>` : ''}</li>`).join('')}</ol></details>`;
  box.addEventListener('toggle', e => { if (e.target.classList?.contains('tx-stepbox')) stepsOpen = e.target.open; }, true);
  const warnHTML = list => list.filter(Boolean).map(w => `<p class="tx-warn${w.soft ? ' soft' : ''}" data-tx-warn>${esc(w.text)}</p>`).join('');
  const link = (path, text) => `<a class="btn btn-ghost btn-small" href="${home}${path}">${esc(text)} →</a>`;
  const assume = text => `<p class="tx-assume">${esc(text)}</p>`;
  const srcList = keys => { const ks = [...new Set(keys.filter(Boolean))]; return ks.length ? `<ul class="tx-src">${ks.map(k => `<li>${esc(SRC[k])}</li>`).join('')}</ul>` : ''; };
  const matSrc = m => (m ? [...Object.values(m.src ?? {}), m.curve ? CURVES[m.curve].src : null] : []);
  // 例題のボタン
  const EX = {
    con: ['ex_callister', 'ex_rail'],
    free: ['ex_invar'],
    grad: ['ex_tube', 'ex_glass'],
    bond: ['ex_tf007', 'ex_timo', 'ex_stoney', 'ex_bga'],
    shock: ['ex_ce008', 'ex_silica'],
    fit: ['ex_shrink', 'ex_kovar'],
    lib: [],
  };
  const exHTML = mode => (EX[mode].length ? `<div class="tx-ex"><span>${esc(T.examples)}</span>${EX[mode].map(k => `<button type="button" class="btn btn-ghost btn-small" data-ex="${k}">${esc(T[k])}</button>`).join('')}</div>` : '');
  const EXSET = {
    ex_callister: { con: 'rod', mat: 'custom', alpha: 20, e: 100, sy: 172, as: 0, t1: 20, t2: 106, tdep: 'const' },
    ex_rail: { con: 'gap', mat: 'steel', t1: 20, t2: 60, l: 25000, gap: 6, as: 0, tdep: 'curve' },
    ex_invar: { mat: 'invar', t1: 20, t2: 400, l: 100, tdep: 'curve' },
    ex_tube: { geo: 'cyl', mat: 'steel', ri: 40, ro: 50, dtg: 50 },
    ex_glass: { geo: 'plate', pbc: 'flat', mat: 'soda', hp: 6, dtg: 20, tm: 0 },
    ex_tf007: { sub: 'film', mat: 'custom', alpha: 23, e: 70, nu: 0.35, sy: 100, mat2: 'custom', alpha2: 2.6, e2: 130, nu2: 0.28, t1: 125, t2: 25, tf: 1, ts: 525, wd: 150, tdep: 'const' },
    ex_timo: { sub: 'bimetal', mat: 'custom', alpha: 1.5, e: 150, nu: 0.3, mat2: 'custom', alpha2: 16.5, e2: 150, nu2: 0.3, ta: 0.5, tb: 0.5, span: 50, t1: 20, t2: 120, wide: 'beam', tdep: 'const' },
    ex_stoney: { sub: 'stoney', mat2: 'si100', ts: 525, tf: 1, r0: 0, r1: 50, wd: 150 },
    ex_bga: { sub: 'solder', mat: 'al2o3', mat2: 'fr4', t1: 0, t2: 100, ld: 10, hs: 0.15, ff: 1, cpd: 24 },
    ex_ce008: { mat: 'custom', alpha: 8, e: 380, nu: 0.22, sy: 300, ha: 5, hc: 10000 },
    ex_silica: { mat: 'silica', ha: 2, hc: 10000 },
    ex_shrink: { fsub: 'shrink', mat: 'steel', mat2: 'steel', d: 50, dout: 100, din: 0, dlt: 50, cl: 20, t1: 20, t2: 100, tdep: 'curve' },
    ex_kovar: { fsub: 'seal', mat: 'boro', mat2: 'kovar', tset: 518, t2: 25, tdep: 'curve' },
  };
  function loadExample(k) {
    const set = EXSET[k];
    if (!set) return;
    for (const [n, v] of Object.entries(set)) {
      el[n].value = String(v);
      if (n === 'mat' && v !== 'custom') fillMat('mat');
      if (n === 'mat2' && v !== 'custom') fillMat('mat2');
    }
    // 材料を選んだあとに上書きした値があれば「自分で入れた値」に
    for (const [n, v] of Object.entries(set)) if (n !== 'mat' && n !== 'mat2' && n !== 'tset') el[n].value = String(v);
    syncMat('mat'); syncMat('mat2');
    form.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // ---- 共通の値と注意 ----
  const temps = () => ({ t1: val('t1', -273.15), t2: val('t2', -273.15) });
  const P1 = () => ({ m: curMat(), a: val('alpha'), E: val('e', 1e-6) * 1e9, nu: val('nu', 0, 0.499), s: val('sy', 0) * 1e6, k: val('kappa', 1e-6), name: matName(el.mat.value) });
  const P2 = () => ({ m: curMat2(), a: val('alpha2'), E: val('e2', 1e-6) * 1e9, nu: val('nu2', 0, 0.499), name: optText('mat2', el.mat2.value) });
  const rangeTxt = ar => (ar ? `${ar[0]}–${ar[1]} °C` : T.r_rt);
  function strainWarn(p, t1, t2, r) {
    const out = [], m = p.m, hi = Math.max(t1, t2), lo = Math.min(t1, t2);
    if (r.out) out.push({ text: fmt(T.w_curve_out, { mat: p.name, lo: n4(r.c.lo, 5), hi: n4(r.c.hi, 5) }) });
    if (r.by === 'const' && m) {
      if (m.ar && (lo < m.ar[0] - 30 || hi > m.ar[1] + 30)) out.push({ soft: true, text: fmt(T.w_ar, { mat: p.name, r: rangeTxt(m.ar) }) });
      if (!m.ar && (lo < 0 || hi > 100)) out.push({ soft: true, text: fmt(T.w_rt, { mat: p.name }) });
      if (m.curve && !useCurve()) out.push({ soft: true, text: fmt(T.w_has_curve, { mat: p.name }) });
    }
    if (m?.g === 'polymer' && hi > 60) out.push({ soft: true, text: fmt(T.w_poly, { mat: p.name }) });
    if (m?.tg && hi > m.tg) out.push({ text: fmt(T.w_tg, { mat: p.name, tg: m.tg }) });
    if (r.by === 'curve' && m?.curie && lo < m.curie && hi > m.curie) out.push({ soft: true, text: fmt(T.w_curie, { mat: p.name, t: m.curie }) });
    if (m?.id === 'steel' && r.by === 'curve' && hi > 735) out.push({ soft: true, text: T.w_steel_tr });
    return out;
  }
  const missWarn = (p, keys) => (p.m ? keys.filter(([k]) => p.m[k] == null).map(([, l]) => ({ soft: true, text: fmt(T.w_missing, { mat: p.name, p: l }) })) : []);
  const strainStep = (p, t1, t2, r) => (r.by === 'curve'
    ? [fmt(T.s_eps_curve, { mat: p.name, src: curveSrcTxt(r.c) }), `ε = ε(${n4(t2, 5)} °C) − ε(${n4(t1, 5)} °C) = ${ppm(curveEps(r.c, t2))} − (${ppm(curveEps(r.c, t1))}) = ${ppm(r.eps)} (ᾱ = ${n4(r.mean, 4)} × 10⁻⁶ K⁻¹)`]
    : [fmt(T.s_eps_const, { mat: p.name }), `ε = αΔT = ${n4(p.a, 5)} × 10⁻⁶ K⁻¹ × ${n4(t2 - t1, 5)} K = ${ppm(r.eps)}`]);
  const stateTxt = s => (Math.abs(s) < 1e-3 ? T.none : s > 0 ? T.tension : T.compression);
  const MODEL = { rod: 'w_m_rod', plate: 'w_m_plate', tri: 'w_m_tri', spring: 'w_m_spring', gap: 'w_m_gap' };

  // =========== free: 熱膨張 ===========
  function renderFree() {
    const p = P1(), { t1, t2 } = temps(), L = val('l', 0);
    const r = thStrain(p.m, p.a, t1, t2, useCurve()), f = freeExp(r.eps, L);
    const dT = t2 - t1;
    let h = exHTML('free');
    h += warnHTML(strainWarn(p, t1, t2, r));
    h += stats([
      ['dt', T.o_dt, `${n4(dT, 5)} K`], ['eps', T.o_eps, ppm(r.eps)], ['dl', T.o_dl, `${n4(f.dL, 4)} mm`], ['l2', T.o_l2, `${n4(f.L2, 7)} mm`],
      ['mean', T.o_mean, `${n4(r.mean, 4)} × 10⁻⁶ K⁻¹`], ['da', T.o_da, `${n4(f.dA * 100, 4)} %`], ['dv', T.o_dv, `${n4(f.dV * 100, 4)} %`],
      ['rho', T.o_rho, p.m?.rho ? `${n4(p.m.rho * f.rhoRatio, 5)} g/cm³` : `${n4((f.rhoRatio - 1) * 100, 4)} %`],
    ]);
    h += steps([
      [T.s_dt, `ΔT = ${n4(t2, 5)} − (${n4(t1, 5)}) = ${n4(dT, 5)} K`],
      strainStep(p, t1, t2, r),
      [T.s_dl, `ΔL = εL = ${ppm(r.eps)} × ${n4(L, 6)} mm = ${n4(f.dL, 4)} mm`],
      [T.s_dv, `ΔA/A = (1 + ε)² − 1 = ${n4(f.dA * 100, 4)} %${SEP}ΔV/V = (1 + ε)³ − 1 = ${n4(f.dV * 100, 4)} % (≈ 3ε = ${n4(3 * r.eps * 100, 4)} %)`],
    ]);
    h += `<h3>${esc(T.h_eps)}</h3>${figHTML('eps', T.h_eps)}`;
    const c = p.m?.curve ? CURVES[p.m.curve] : null;
    if (c) h += `<h3>${esc(T.h_alpha)}</h3>${figHTML('alpha', T.h_alpha)}`;
    // 表: T1 から T2 までを 10 等分
    const rows = [];
    for (let i = 0; i <= 10; i++) {
      const t = t1 + (dT * i) / 10, ri = thStrain(p.m, p.a, t1, t, useCurve());
      rows.push([n4(t, 5), ri.eps * 1e6, ri.eps * L, c ? curveAlpha(c, t) : p.a]);
    }
    h += `<h3>${esc(T.h_free_table)}</h3>` + tableHTML('free', [T.c_t, T.c_eps, T.c_dl, T.c_alpha], rows);
    h += assume(T.a_free);
    h += srcList(matSrc(p.m));
    h += `<div class="tx-links">${link('tools/materials-periodic-table/', T.ln_ptable)}${link('tools/ashby-material-selection-chart/', T.ln_ashby)}${link('term/coefficient-of-linear-thermal-expansion/', T.ln_term_cte)}</div>`;
    box.innerHTML = h;
    // 図: ε(T) − ε(T1)
    const lo0 = Math.min(t1, t2), hi0 = Math.max(t1, t2), pad = Math.max(20, (hi0 - lo0) * 0.25);
    let xa = lo0 - pad, xb = hi0 + pad;
    if (c) { xa = Math.max(xa, c.lo); xb = Math.min(xb, c.hi); if (xb - xa < 1) { xa = c.lo; xb = c.hi; } }
    xa = Math.max(xa, -273.15);
    const N = 120, pc = [], pk = [];
    for (let i = 0; i <= N; i++) {
      const t = xa + ((xb - xa) * i) / N;
      pk.push([t, p.a * (t - t1)]);
      if (c) { const e1 = curveEps(c, t1); pc.push([t, Number.isFinite(e1) ? (curveEps(c, t) - e1) * 1e6 : NaN]); }
    }
    const yv = [...pk, ...pc].map(q => q[1]);
    const geo = plot(q('eps'), { xr: [xa, xb], yr: bounds(yv, 0.06, true), xlabel: T.ax_t, ylabel: T.ax_eps, hl: [{ y: 0 }],
      lines: [...(c ? [{ pts: pc, slot: 1, w: 2.5 }] : []), { pts: pk, slot: 2, dash: '6 4' }],
      dots: [{ x: t2, y: r.eps * 1e6, slot: r.by === 'curve' ? 1 : 2 }, { x: t1, y: 0, slot: 'mu', r: 3.5 }] });
    q('lg-eps').innerHTML = legend([...(c ? [{ slot: 1, label: fmt(T.lg_curve, { src: curveShort(c) }) }] : []), { slot: 2, dash: '6 4', label: fmt(T.lg_const, { a: n4(p.a, 4) }) }]);
    hover(q('eps'), geo, setRead('eps', T.read_hint), x => `${n4(x, 4)} °C: ${c ? `${T.lg_curve_s} ${n4((curveEps(c, x) - curveEps(c, t1)) * 1e6, 4)}${SEP}` : ''}${T.lg_const_s} ${n4(p.a * (x - t1), 4)} (× 10⁻⁶)`);
    if (c) {
      const pa = [];
      for (let i = 0; i <= 200; i++) { const t = c.lo + ((c.hi - c.lo) * i) / 200; pa.push([t, curveAlpha(c, t)]); }
      const g2 = plot(q('alpha'), { xr: [c.lo, c.hi], yr: bounds(pa.map(v => v[1]), 0.08, true), xlabel: T.ax_t, ylabel: T.ax_alpha,
        lines: [{ pts: pa, slot: 1, w: 2.5 }], vl: [{ x: t1 }, { x: t2 }], dots: c.kind === 'inst' ? c.T.map((t, i) => ({ x: t, y: c.A[i], slot: 1, r: 3 })) : [] });
      q('lg-alpha').innerHTML = legend([{ slot: 1, label: c.kind === 'mean' ? T.lg_alpha_mean : T.lg_alpha_inst }]);
      hover(q('alpha'), g2, setRead('alpha', T.read_hint), x => `${n4(x, 4)} °C: α = ${n4(curveAlpha(c, x), 4)} × 10⁻⁶ K⁻¹`);
    }
  }

  // =========== con: 拘束と熱応力 ===========
  function renderCon() {
    const p = P1(), { t1, t2 } = temps(), type = el.con.value, as = val('as');
    const L = val('l', 1e-9) * 1e-3, A = val('area', 1e-9) * 1e-6, k = val('k', 1e-12) * 1e6, g = val('gap', 0) * 1e-3;
    const nu = type === 'tri' ? Math.min(p.nu, 0.49) : p.nu;
    // T2 が曲線の範囲の外なら α 一定で計算するので、図・表・温度の探索もすべて α 一定にそろえる(範囲の端の段差を作らない)
    const curveOK = useCurve() && !thStrain(p.m, p.a, t1, t2, true).out;
    const de = Tx => { const r = thStrain(p.m, p.a, t1, Tx, curveOK); return { r, de: r.eps - as * 1e-6 * (Tx - t1) }; };
    const sAt = (Tx, ty = type) => conStress({ type: ty, E: p.E, nu, de: de(Tx).de, L, A, k, g });
    const cur = de(t2), res = sAt(t2), s = res.s;
    const sv = type === 'tri' ? 0 : Math.abs(s); // ミーゼスの相当応力(等二軸は |σ|、静水圧は 0)
    // 強さに達する温度: T1 から T2 の向きに探す
    const dir = t2 >= t1 ? 1 : -1, lim = cur.r.c && curveOK ? (dir > 0 ? cur.r.c.hi : cur.r.c.lo) : t1 + dir * 3000;
    const tcFn = Tx => Math.abs(sAt(Tx).s) - p.s;
    const Tc = p.s > 0 && type !== 'tri' ? solveT(tcFn, t1, Math.max(-273.15, lim)) : NaN;
    const Tw = type === 'gap' ? solveT(Tx => de(Tx).de * L - g, t1, Math.max(-273.15, lim)) : NaN; // 壁に当たる温度(−273.15 ℃より下は探さない)
    const f = type === 'plate' ? 1 / (1 - nu) : type === 'tri' ? 1 / (1 - 2 * nu) : 1;
    let h = exHTML('con');
    const warns = [...strainWarn(p, t1, t2, thStrain(p.m, p.a, t1, t2, useCurve())), ...missWarn(p, type === 'plate' || type === 'tri' ? [['nu', 'ν']] : []), ...missWarn(p, [['s', T.p_strength]])];
    if (type === 'tri') warns.push({ soft: true, text: T.w_tri });
    if (type === 'gap' && dir < 0) warns.push({ soft: true, text: T.w_gap_cool });
    if (p.s > 0 && sv > p.s) warns.push({ text: fmt(T.w_over, { s: MPa(sv), sy: MPa(p.s) }) });
    h += warnHTML(warns);
    h += stats([
      ['dt', T.o_dt, `${n4(t2 - t1, 5)} K`], ['de', T.o_de, ppm(cur.de)], ['sigma', T.o_sigma, MPa(s)], ['state', T.o_state, stateTxt(s)],
      ['ratio', T.o_ratio, p.s > 0 ? n4(sv / p.s, 3) : '—'],
      ['tc', T.o_tc, type === 'tri' ? T.o_tc_none_tri : Number.isFinite(Tc) ? `${n4(Tc, 5)} °C (ΔT = ${n4(Tc - t1, 4)} K)` : T.o_tc_none],
      type === 'plate' && ['ez', T.o_ez, ppm(cur.r.eps + ((2 * nu) / (1 - nu)) * cur.de)],
      type === 'spring' && ['eta', T.o_eta, n4(res.eta, 4)], type === 'spring' && ['force', T.o_force, `${n4(Math.abs(res.F) / 1e3, 4)} kN`],
      type === 'gap' && ['contact', T.o_contact, Number.isFinite(Tw) ? `${n4(Tw, 5)} °C` : T.o_no_contact],
    ]);
    const Eg = n4(p.E / 1e9, 5);
    h += steps([
      strainStep(p, t1, t2, cur.r),
      [T.s_de, `Δε = ε − αs·ΔT = ${ppm(cur.r.eps)} − ${n4(as, 4)} × 10⁻⁶ × ${n4(t2 - t1, 5)} = ${ppm(cur.de)}`],
      type === 'rod' && [T.s_rod, `σ = −E·Δε = −${Eg} GPa × ${ppm(cur.de)} = ${MPa(s)}`],
      type === 'plate' && [T.s_plate, `σ = −E·Δε/(1 − ν) = −${Eg} GPa × ${ppm(cur.de)} / (1 − ${n4(nu, 3)}) = ${MPa(s)}`],
      type === 'tri' && [T.s_tri, `σ = −E·Δε/(1 − 2ν) = −${Eg} GPa × ${ppm(cur.de)} / (1 − 2 × ${n4(nu, 3)}) = ${MPa(s)}`],
      type === 'spring' && [T.s_spring, `η = 1/(1 + EA/(kL)) = 1/(1 + ${Eg} GPa × ${n4(A * 1e6, 5)} mm² / (${n4(k / 1e6, 5)} kN/mm × ${n4(L * 1e3, 6)} mm)) = ${n4(res.eta, 4)}\nσ = −η·E·Δε = ${MPa(s)}${SEP}F = |σ|A = ${n4(Math.abs(res.F) / 1e3, 4)} kN`],
      type === 'gap' && [T.s_gap, `ΔL = Δε·L = ${n4(cur.de * L * 1e3, 4)} mm${SEP}g = ${n4(g * 1e3, 4)} mm\n${res.contact ? `σ = −E(ΔL − g)/L = ${MPa(s)}` : T.s_gap_no}`],
      p.s > 0 && type !== 'tri' && [T.s_tc, `ΔTc ≈ σs/(E·|α − αs|·f) = ${n4(p.s / 1e6, 4)} MPa / (${Eg} GPa × ${n4(Math.abs(p.a - as), 4)} × 10⁻⁶ K⁻¹ × ${n4(f * (type === 'spring' ? res.eta : 1), 4)}) = ${n4(p.s / (p.E * Math.abs(p.a - as) * 1e-6 * f * (type === 'spring' ? res.eta : 1)), 4)} K (${T.s_tc_note})`],
    ]);
    // 比べる表: 同じ材料・温度で拘束の型だけを変える
    const types = ['rod', 'plate', 'tri', 'spring', 'gap'];
    const rows = types.map(ty => { const rs = sAt(t2, ty).s; return [optText('con', ty), { t: MPa(rs), v: rs / 1e6 }, stateTxt(rs)]; });
    h += `<h3>${esc(T.h_sigma_t)}</h3>${figHTML('sig', T.h_sigma_t)}`;
    h += `<h3>${esc(T.h_con_table)}</h3>` + tableHTML('con', [T.c_con, T.c_sigma, T.c_state], rows, { cur: types.indexOf(type) });
    h += assume(T[MODEL[type]]);
    h += assume(T.a_con);
    h += srcList(matSrc(p.m));
    h += `<div class="tx-links">${link('term/thermal-stress/', T.ln_term_ts)}${link('term/youngs-modulus/', T.ln_term_e)}</div>`;
    box.innerHTML = h;
    const span = Math.abs(t2 - t1) || 50, xa = Math.max(-273.15, Math.min(t1, t2) - span * 0.1), xb = Math.max(t1, t2) + span * 0.4;
    const pts = ty => { const o = []; for (let i = 0; i <= 120; i++) { const t = xa + ((xb - xa) * i) / 120; o.push([t, sAt(t, ty).s / 1e6]); } return o; };
    const show = type === 'spring' || type === 'gap' ? ['rod', 'plate', type] : ['rod', 'plate', 'tri'];
    const slot = { rod: 1, plate: 2, tri: 3, spring: 4, gap: 5 };
    const lines = show.map(ty => ({ pts: pts(ty), slot: slot[ty], w: ty === type ? 3 : 1.6, dash: ty === type ? null : '5 4' }));
    const ys = lines.flatMap(l => l.pts.map(v => v[1]));
    const hl = [{ y: 0 }];
    if (p.s > 0) hl.push({ y: p.s / 1e6, label: `+${n4(p.s / 1e6, 4)} MPa` }, { y: -p.s / 1e6, label: `−${n4(p.s / 1e6, 4)} MPa` });
    const yr = bounds([...ys, ...(p.s > 0 && p.s / 1e6 < 3 * Math.max(...ys.map(Math.abs)) ? [p.s / 1e6, -p.s / 1e6] : [])], 0.08, true);
    const geo = plot(q('sig'), { xr: [xa, xb], yr, xlabel: T.ax_t, ylabel: T.ax_sigma, hl, lines, dots: [{ x: t2, y: s / 1e6, slot: slot[type] }], vl: [{ x: t1 }] });
    q('lg-sig').innerHTML = legend(show.map(ty => ({ slot: slot[ty], label: optText('con', ty), dash: ty === type ? null : '5 4' })));
    hover(q('sig'), geo, setRead('sig', T.read_hint), x => `${n4(x, 4)} °C: ${show.map(ty => `${optText('con', ty).replace(/[(（].*$/, '').trim()} ${n4(sAt(x, ty).s / 1e6, 4)}`).join(SEP)} MPa`);
  }

  // =========== grad: 温度差による内部の応力 ===========
  function renderGrad() {
    const p = P1(), geo0 = el.geo.value, dT = val('dtg');
    let h = exHTML('grad');
    const warns = [...missWarn(p, [['nu', 'ν']])];
    if (geo0 === 'plate') {
      const bc = el.pbc.value, hp = val('hp', 1e-9) * 1e-3, Tm = val('tm');
      const sz2 = z => plateGrad({ bc, E: p.E, nu: p.nu, a: p.a, dT, Tm, h: hp, z });
      const top = sz2(hp / 2), bot = sz2(-hp / 2), kap = (p.a * 1e-6 * dT) / hp;
      const smax = Math.max(top, bot);
      if (p.s > 0 && Math.max(Math.abs(top), Math.abs(bot)) > p.s) warns.push({ text: fmt(T.w_over, { s: MPa(Math.max(Math.abs(top), Math.abs(bot))), sy: MPa(p.s) }) });
      h += warnHTML(warns);
      h += stats([
        ['top', T.o_top, MPa(top)], ['bot', T.o_bot, MPa(bot)],
        ['kap', T.o_kap, bc === 'free' ? `${n4(kap, 4)} 1/m` : '0'], ['rad', T.o_rad, bc === 'free' && kap !== 0 ? `${n4(1 / Math.abs(kap), 4)} m` : '—'],
        ['half', T.o_half, MPa((p.E * p.a * 1e-6 * Math.abs(dT)) / (2 * (1 - p.nu)))], ['smax', T.o_smax, MPa(Math.max(smax, 0))],
      ]);
      h += steps([
        [T.s_tz, `T(z) = T0 + ${n4(Tm, 4)} K + ${n4(dT, 4)} K × z/h (−h/2 ≤ z ≤ h/2${SEP}h = ${n4(hp * 1e3, 4)} mm)`],
        bc === 'free' && [T.s_pfree, `σ = 0${SEP}κ = αΔT/h = ${n4(p.a, 4)} × 10⁻⁶ × ${n4(dT, 4)} / ${n4(hp, 4)} m = ${n4(kap, 4)} 1/m`],
        bc === 'flat' && [T.s_pflat, `σ(z) = −Eα·ΔT·(z/h)/(1 − ν)\nσ(±h/2) = ∓${n4(p.E / 1e9, 4)} GPa × ${n4(p.a, 4)} × 10⁻⁶ × ${n4(dT, 4)} / (2 × (1 − ${n4(p.nu, 3)})) = ∓${MPa(Math.abs(top))}`],
        bc === 'clamp' && [T.s_pclamp, `σ(z) = −Eα(Tm + ΔT·z/h)/(1 − ν)\nσ(+h/2) = ${MPa(top)}${SEP}σ(−h/2) = ${MPa(bot)}`],
      ]);
      h += `<h3>${esc(T.h_plate)}</h3>${figHTML('pz', T.h_plate)}`;
      const rows = [-0.5, -0.25, 0, 0.25, 0.5].map(f => [n4(f * hp * 1e3, 4), Tm + dT * f, ...['free', 'flat', 'clamp'].map(b => plateGrad({ bc: b, E: p.E, nu: p.nu, a: p.a, dT, Tm, h: hp, z: f * hp }) / 1e6)]);
      h += tableHTML('plate', [T.c_z, T.c_trise, ...['free', 'flat', 'clamp'].map(b => `${optText('pbc', b)} (MPa)`)], rows);
      h += assume(T.a_plate);
      h += srcList(matSrc(p.m));
      h += `<div class="tx-links">${link('term/tempered-glass/', T.ln_term_tg)}${link('term/thermal-stress/', T.ln_term_ts)}</div>`;
      box.innerHTML = h;
      const zs = Array.from({ length: 41 }, (_, i) => -hp / 2 + (hp * i) / 40);
      const lines = ['free', 'flat', 'clamp'].map((b, i) => ({ pts: zs.map(z => [z * 1e3, plateGrad({ bc: b, E: p.E, nu: p.nu, a: p.a, dT, Tm, h: hp, z }) / 1e6]), slot: i + 1, w: b === bc ? 3 : 1.6, dash: b === bc ? null : '5 4' }));
      const hl = [{ y: 0 }];
      if (p.s > 0) hl.push({ y: p.s / 1e6, label: `σs` }, { y: -p.s / 1e6 });
      const ys = lines.flatMap(l => l.pts.map(v => v[1]));
      const g = plot(q('pz'), { xr: [-hp / 2 * 1e3, hp / 2 * 1e3], yr: bounds([...ys, ...(p.s > 0 && p.s / 1e6 < 3 * Math.max(1e-9, ...ys.map(Math.abs)) ? [p.s / 1e6, -p.s / 1e6] : [])], 0.08, true), xlabel: T.ax_z, ylabel: T.ax_sigma, hl, lines });
      q('lg-pz').innerHTML = legend(['free', 'flat', 'clamp'].map((b, i) => ({ slot: i + 1, label: optText('pbc', b), dash: b === bc ? null : '5 4' })));
      hover(q('pz'), g, setRead('pz', T.read_hint_z), x => `z = ${n4(x, 4)} mm: ${n4(plateGrad({ bc, E: p.E, nu: p.nu, a: p.a, dT, Tm, h: hp, z: x / 1e3 }) / 1e6, 4)} MPa`);
      return;
    }
    // 中空円筒
    let ra = val('ri', 1e-9) * 1e-3, rb = val('ro', 1e-9) * 1e-3;
    if (!(rb > ra)) { warns.push({ text: T.w_rr }); rb = ra * 1.25; }
    const at = r => cylStress({ E: p.E, nu: p.nu, a: p.a, dT, ra, rb, r });
    const si = at(ra), so = at(rb), thin = (p.E * p.a * 1e-6 * dT) / (2 * (1 - p.nu));
    const rs = Array.from({ length: 61 }, (_, i) => ra + ((rb - ra) * i) / 60);
    const all = rs.map(at);
    const smax = Math.max(...all.flatMap(v => [v.st, v.sz, v.sr]));
    if (p.s > 0 && smax > p.s) warns.push({ text: fmt(T.w_over_t, { s: MPa(smax), sy: MPa(p.s) }) });
    h += warnHTML(warns);
    h += stats([
      ['sti', T.o_sti, MPa(si.st)], ['sto', T.o_sto, MPa(so.st)], ['szi', T.o_szi, MPa(si.sz)], ['szo', T.o_szo, MPa(so.sz)],
      ['thin', T.o_thin, `∓${MPa(Math.abs(thin))}`], ['smax', T.o_smax, MPa(Math.max(smax, 0))],
    ]);
    const Lr = Math.log(rb / ra);
    h += steps([
      [T.s_tr, `T(r) − To = ΔT·ln(b/r)/ln(b/a), ΔT = Ti − To = ${n4(dT, 4)} K${SEP}a = ${n4(ra * 1e3, 5)} mm${SEP}b = ${n4(rb * 1e3, 5)} mm${SEP}ln(b/a) = ${n4(Lr, 5)}`],
      [T.s_cyl, `σθ = αE/((1 − ν)r²)·[(r² + a²)/(b² − a²)·∫ₐᵇ θr dr + ∫ₐʳ θr dr − θr²]\nσz = αE/(1 − ν)·[2/(b² − a²)·∫ₐᵇ θr dr − θ]${SEP}σr = αE/((1 − ν)r²)·[(r² − a²)/(b² − a²)·∫ₐᵇ θr dr − ∫ₐʳ θr dr]`],
      [T.s_cyl2, `σθ(a) = ${MPa(si.st)}${SEP}σθ(b) = ${MPa(so.st)}${SEP}σz(a) = ${MPa(si.sz)}${SEP}σz(b) = ${MPa(so.sz)}`],
      [T.s_thin, `EαΔT/(2(1 − ν)) = ${n4(p.E / 1e9, 4)} GPa × ${n4(p.a, 4)} × 10⁻⁶ × ${n4(dT, 4)} / (2 × (1 − ${n4(p.nu, 3)})) = ${MPa(thin)}`],
    ]);
    h += `<h3>${esc(T.h_cyl)}</h3>${figHTML('cyl', T.h_cyl)}`;
    const rows = [0, 0.25, 0.5, 0.75, 1].map(f => { const r = ra + (rb - ra) * f, v = at(r); return [n4(r * 1e3, 5), v.T, v.sr / 1e6, v.st / 1e6, v.sz / 1e6]; });
    h += tableHTML('cyl', [T.c_r, T.c_trise, 'σr (MPa)', 'σθ (MPa)', 'σz (MPa)'], rows);
    h += assume(T.a_cyl);
    h += srcList(matSrc(p.m));
    box.innerHTML = h;
    const lines = [['sr', 1], ['st', 2], ['sz', 3]].map(([k, sl]) => ({ pts: rs.map((r, i) => [r * 1e3, all[i][k] / 1e6]), slot: sl, w: 2.5 }));
    const g = plot(q('cyl'), { xr: [ra * 1e3, rb * 1e3], yr: bounds(lines.flatMap(l => l.pts.map(v => v[1])), 0.08, true), xlabel: T.ax_r, ylabel: T.ax_sigma, hl: [{ y: 0 }], lines });
    q('lg-cyl').innerHTML = legend([{ slot: 1, label: T.lg_sr }, { slot: 2, label: T.lg_st }, { slot: 3, label: T.lg_sz }]);
    hover(q('cyl'), g, setRead('cyl', T.read_hint_r), x => { const v = at(Math.min(rb, Math.max(ra, x / 1e3))); return `r = ${n4(x, 4)} mm: σr ${n4(v.sr / 1e6, 4)}${SEP}σθ ${n4(v.st / 1e6, 4)}${SEP}σz ${n4(v.sz / 1e6, 4)} MPa`; });
  }

  // =========== bond: 2つの材料の接合 ===========
  function renderBond() {
    const sub = el.sub.value;
    if (sub === 'bimetal') return renderBimetal();
    if (sub === 'film') return renderFilm();
    if (sub === 'stoney') return renderStoney();
    return renderSolder();
  }
  const bowOf = (kap, D) => (kap * D * D) / 8; // 直径 D の円板の中央の反り(浅い球面)
  function renderBimetal() {
    const pA = P1(), pB = P2(), { t1, t2 } = temps(), plate = el.wide.value === 'plate';
    const ta = val('ta', 1e-9) * 1e-3, tb = val('tb', 1e-9) * 1e-3, Ls = val('span', 0) * 1e-3;
    const rA = thStrain(pA.m, pA.a, t1, t2, useCurve()), rB = thStrain(pB.m, pB.a, t1, t2, useCurve());
    const EA = plate ? pA.E / (1 - pA.nu) : pA.E, EB = plate ? pB.E / (1 - pB.nu) : pB.E;
    const de = rB.eps - rA.eps, kap = bimetal({ E1: EA, E2: EB, t1: ta, t2: tb, de });
    const m = ta / tb, n = EA / EB, hh = ta + tb, R = 1 / kap;
    const tip = Math.abs(kap) > 0 ? Math.sign(kap) * Math.abs(R) * (1 - Math.cos(Ls / Math.abs(R))) : 0;
    const mid = Math.abs(kap) > 0 ? Math.sign(kap) * Math.abs(R) * (1 - Math.cos(Ls / (2 * Math.abs(R)))) : 0;
    // 全体の厚さを変えずに曲率が最大になる厚さの比(数値で探す)
    const kOf = mm => bimetal({ E1: EA, E2: EB, t1: (hh * mm) / (1 + mm), t2: hh / (1 + mm), de: 1 });
    let mBest = 1, kBest = -Infinity;
    for (let i = 0; i <= 4000; i++) { const mm = 10 ** (-2 + (4 * i) / 4000), kk = kOf(mm); if (kk > kBest) { kBest = kk; mBest = mm; } }
    let h = exHTML('bond');
    const warns = [...strainWarn(pA, t1, t2, rA), ...strainWarn(pB, t1, t2, rB), ...(plate ? [...missWarn(pA, [['nu', 'ν']]), ...missWarn(pB, [['nu', 'ν']])] : [])];
    if (Ls > 0 && Math.abs(Ls * kap) > 0.5) warns.push({ soft: true, text: T.w_big_bend });
    h += warnHTML(warns);
    h += stats([
      ['de', T.o_de_ba, ppm(de)], ['kap', T.o_kap, `${n4(kap, 4)} 1/m`], ['rad', T.o_rad, kap ? `${n4(Math.abs(R) * 1e3, 4)} mm` : '—'],
      ['tip', T.o_tip, `${n4(tip * 1e3, 4)} mm`], ['mid', T.o_mid, `${n4(mid * 1e3, 4)} mm`],
      ['side', T.o_side, kap === 0 ? T.none : kap > 0 ? T.side_b : T.side_a], ['mopt', T.o_mopt, `${n4(mBest, 3)} (1/√n = ${n4(1 / Math.sqrt(n), 3)})`],
    ]);
    h += steps([
      strainStep(pA, t1, t2, rA), strainStep(pB, t1, t2, rB),
      [T.s_bi_mn, `m = tA/tB = ${n4(ta * 1e3, 4)}/${n4(tb * 1e3, 4)} = ${n4(m, 4)}${SEP}n = EA/EB = ${n4(EA / 1e9, 4)}/${n4(EB / 1e9, 4)} = ${n4(n, 4)}${SEP}h = ${n4(hh * 1e3, 4)} mm${plate ? ` (${T.s_bi_plate})` : ''}`],
      [T.s_bi, `1/ρ = 6(εB − εA)(1 + m)² / (h[3(1 + m)² + (1 + mn)(m² + 1/(mn))])\n= 6 × ${ppm(de)} × ${n4((1 + m) ** 2, 5)} / (${n4(hh, 4)} m × [${n4(3 * (1 + m) ** 2, 5)} + ${n4((1 + m * n) * (m * m + 1 / (m * n)), 5)}]) = ${n4(kap, 4)} 1/m`],
      [T.s_bi_eq, `m = n = 1: 1/ρ = 3(εB − εA)/(2h) = ${n4((3 * de) / (2 * hh), 4)} 1/m`],
      [T.s_bi_d, `δ1 = ρ(1 − cos(L/ρ)) ≈ L²/(2ρ) = ${n4((kap * Ls * Ls) / 2 * 1e3, 4)} mm; δ2 ≈ L²/(8ρ) = ${n4((kap * Ls * Ls) / 8 * 1e3, 4)} mm`],
    ]);
    h += `<h3>${esc(T.h_bi)}</h3>${figHTML('bi', T.h_bi)}`;
    const rows = [];
    for (let i = 0; i <= 5; i++) {
      const t = t1 + ((t2 - t1) * i) / 5;
      const d2 = thStrain(pB.m, pB.a, t1, t, useCurve()).eps - thStrain(pA.m, pA.a, t1, t, useCurve()).eps, k2 = bimetal({ E1: EA, E2: EB, t1: ta, t2: tb, de: d2 });
      rows.push([n4(t, 5), d2 * 1e6, k2, (k2 * Ls * Ls) / 2 * 1e3]);
    }
    h += tableHTML('bi', [T.c_t, T.c_de, T.c_kap, T.c_tip], rows);
    h += assume(T.a_bi);
    h += srcList([...matSrc(pA.m), ...matSrc(pB.m)]);
    h += `<div class="tx-links">${link('term/invar/', T.ln_term_invar)}</div>`;
    box.innerHTML = h;
    const ms = Array.from({ length: 121 }, (_, i) => 10 ** (-1.3 + (2.6 * i) / 120));
    const norm = (mm, nn) => { const k1 = bimetal({ E1: nn, E2: 1, t1: mm / (1 + mm), t2: 1 / (1 + mm), de: 1 }); return k1; }; // h = 1、Δε = 1 のときの曲率 = κh/Δε
    const g = plot(q('bi'), { xlog: true, xr: [-1.3, 1.3], yr: [0, 1.6], xlabel: T.ax_m, ylabel: T.ax_kh,
      lines: [{ pts: ms.map(mm => [mm, norm(mm, n)]), slot: 1, w: 2.5 }, { pts: ms.map(mm => [mm, norm(mm, 1)]), slot: 'mu', dash: '5 4' }],
      dots: [{ x: m, y: norm(m, n), slot: 1 }], hl: [{ y: 1.5, label: '3/2' }],
      xt: [0.1, 0.2, 0.5, 1, 2, 5, 10].map(v => [v, num(v, 2)]) });
    q('lg-bi').innerHTML = legend([{ slot: 1, label: fmt(T.lg_n, { n: n4(n, 3) }) }, { slot: 'mu', dash: '5 4', label: fmt(T.lg_n, { n: '1' }) }]);
    hover(q('bi'), g, setRead('bi', T.read_hint_m), x => `m = ${n4(x, 3)}: κh/Δε = ${n4(norm(x, n), 4)}`);
  }
  function renderFilm() {
    const pf = P1(), ps = P2(), { t1, t2 } = temps();
    const tf = val('tf', 1e-9) * 1e-6, ts = val('ts', 1e-9) * 1e-6, D = val('wd', 0) * 1e-3;
    const rf = thStrain(pf.m, pf.a, t1, t2, useCurve()), rs = thStrain(ps.m, ps.a, t1, t2, useCurve());
    const Mf = pf.E / (1 - pf.nu), Ms = ps.E / (1 - ps.nu);
    const sf = filmStress(Mf, rs.eps, rf.eps), kS = stoneyK(sf, tf, Ms, ts);
    const kT = -bimetal({ E1: Ms, E2: Mf, t1: ts, t2: tf, de: rf.eps - rs.eps });
    let h = exHTML('bond');
    const warns = [...strainWarn(pf, t1, t2, rf), ...strainWarn(ps, t1, t2, rs), ...missWarn(pf, [['nu', 'ν']]), ...missWarn(ps, [['nu', 'ν']])];
    if (pf.s > 0 && Math.abs(sf) > pf.s) warns.push({ soft: true, text: fmt(T.w_film_yield, { s: MPa(Math.abs(sf)), sy: MPa(pf.s) }) });
    if (tf / ts > 0.05) warns.push({ soft: true, text: fmt(T.w_thick_film, { r: n4(tf / ts, 3), e: n4((kT / kS - 1) * 100, 3) }) });
    h += warnHTML(warns);
    h += stats([
      ['sf', T.o_sf, MPa(sf)], ['state', T.o_state, stateTxt(sf)], ['mf', T.o_mf, `${n4(Mf / 1e9, 4)} GPa`],
      ['ks', T.o_ks, `${n4(kS, 4)} 1/m`], ['rs', T.o_rs, kS ? `${n4(1 / Math.abs(kS), 4)} m` : '—'], ['bow', T.o_bow, `${n4(bowOf(kS, D) * 1e6, 4)} µm`],
      ['ratio_t', T.o_kt, n4(kT / kS, 4)], ['force', T.o_sft, `${n4(sf * tf, 4)} N/m`],
    ]);
    h += steps([
      strainStep(pf, t1, t2, rf), strainStep(ps, t1, t2, rs),
      [T.s_mf, `Mf = Ef/(1 − νf) = ${n4(pf.E / 1e9, 4)} GPa/(1 − ${n4(pf.nu, 3)}) = ${n4(Mf / 1e9, 4)} GPa`],
      [T.s_sf, `σf = Mf(εs − εf) = ${n4(Mf / 1e9, 4)} GPa × (${ppm(rs.eps)} − (${ppm(rf.eps)})) = ${MPa(sf)}\n(${T.s_sf_const}: Ef/(1 − νf)·(αs − αf)·ΔT = ${MPa(Mf * (ps.a - pf.a) * 1e-6 * (t2 - t1))})`],
      [T.s_st, `κ = 6σf·tf/(Ms·ts²) = 6 × ${MPa(sf)} × ${n4(tf * 1e6, 4)} µm / (${n4(Ms / 1e9, 4)} GPa × (${n4(ts * 1e6, 4)} µm)²) = ${n4(kS, 4)} 1/m`],
      [T.s_bow, `w = κD²/8 = ${n4(kS, 4)} × (${n4(D * 1e3, 4)} mm)² / 8 = ${n4(bowOf(kS, D) * 1e6, 4)} µm`],
    ]);
    h += `<h3>${esc(T.h_film)}</h3>${figHTML('film', T.h_film)}`;
    const rows = [1e-3, 3e-3, 0.01, 0.03, 0.1, 0.3].map(r => {
      const tf2 = r * ts, s2 = sf, k1 = stoneyK(s2, tf2, Ms, ts), k2 = -bimetal({ E1: Ms, E2: Mf, t1: ts, t2: tf2, de: rf.eps - rs.eps });
      return [n4(r, 3), tf2 * 1e6, k1, k2, k2 / k1];
    });
    h += `<h3>${esc(T.h_stoney_err)}</h3>` + tableHTML('film', [T.c_ratio, T.c_tf, T.c_ks, T.c_kt, T.c_kk], rows);
    h += assume(T.a_film);
    h += srcList([...matSrc(pf.m), ...matSrc(ps.m)]);
    h += `<div class="tx-links">${link('term/thermal-stress/', T.ln_term_ts)}${link('c/thin-films/', T.ln_cat_tf)}</div>`;
    box.innerHTML = h;
    const pts = [];
    for (let i = 0; i <= 100; i++) {
      const t = t1 + ((t2 - t1) * i) / 100;
      pts.push([t, filmStress(Mf, thStrain(ps.m, ps.a, t1, t, useCurve()).eps, thStrain(pf.m, pf.a, t1, t, useCurve()).eps) / 1e6]);
    }
    const lo = Math.min(t1, t2), hi = Math.max(t1, t2) || 1;
    const hl = [{ y: 0 }];
    if (pf.s > 0 && pf.s / 1e6 < 3 * Math.max(1e-9, ...pts.map(v => Math.abs(v[1])))) hl.push({ y: pf.s / 1e6 }, { y: -pf.s / 1e6 });
    const padF = ((hi > lo ? hi : lo + 1) - lo) * 0.03;
    const g = plot(q('film'), { xr: [lo - padF, (hi > lo ? hi : lo + 1) + padF], yr: bounds([...pts.map(v => v[1]), ...hl.map(x => x.y)], 0.08, true), xlabel: T.ax_t, ylabel: T.ax_sf, hl, lines: [{ pts, slot: 1, w: 2.5 }], dots: [{ x: t2, y: sf / 1e6, slot: 1 }, { x: t1, y: 0, slot: 'mu', r: 3.5 }] });
    q('lg-film').innerHTML = legend([{ slot: 1, label: T.lg_film }]);
    hover(q('film'), g, setRead('film', T.read_hint), x => `${n4(x, 4)} °C: σf = ${n4(filmStress(Mf, thStrain(ps.m, ps.a, t1, x, useCurve()).eps, thStrain(pf.m, pf.a, t1, x, useCurve()).eps) / 1e6, 4)} MPa`);
  }
  function renderStoney() {
    const ps = P2(), tf = val('tf', 1e-9) * 1e-6, ts = val('ts', 1e-9) * 1e-6, D = val('wd', 0) * 1e-3;
    const R0 = val('r0'), R1 = val('r1');
    const kap = (R1 ? 1 / R1 : 0) - (R0 ? 1 / R0 : 0), Ms = ps.E / (1 - ps.nu), sf = stoneyS(kap, tf, Ms, ts);
    let h = exHTML('bond');
    const warns = [...missWarn(ps, [['nu', 'ν']])];
    if (!R1 && !R0) warns.push({ soft: true, text: T.w_flat });
    if (tf / ts > 0.05) warns.push({ soft: true, text: fmt(T.w_thick_film2, { r: n4(tf / ts, 3) }) });
    if (Math.abs(bowOf(kap, D)) > ts / 2) warns.push({ soft: true, text: T.w_big_bow });
    h += warnHTML(warns);
    h += stats([
      ['kap', T.o_kap_m, `${n4(kap, 4)} 1/m`], ['ms', T.o_ms, `${n4(Ms / 1e9, 4)} GPa`], ['sf', T.o_sf, MPa(sf)], ['state', T.o_state, stateTxt(sf)],
      ['force', T.o_sft, `${n4(sf * tf, 4)} N/m`], ['bow', T.o_bow, `${n4(bowOf(kap, D) * 1e6, 4)} µm`],
    ]);
    h += steps([
      [T.s_kap, `κ = 1/R1 − 1/R0 = ${R1 ? `1/${n4(R1, 5)}` : '0'} − ${R0 ? `1/${n4(R0, 5)}` : '0'} = ${n4(kap, 4)} 1/m`],
      [T.s_ms, `Ms = Es/(1 − νs) = ${n4(ps.E / 1e9, 4)} GPa/(1 − ${n4(ps.nu, 3)}) = ${n4(Ms / 1e9, 4)} GPa`],
      [T.s_stoney, `σf = Ms·ts²·κ/(6tf) = ${n4(Ms / 1e9, 4)} GPa × (${n4(ts * 1e6, 4)} µm)² × ${n4(kap, 4)} 1/m / (6 × ${n4(tf * 1e6, 4)} µm) = ${MPa(sf)}`],
    ]);
    h += `<h3>${esc(T.h_stoney)}</h3>${figHTML('sto', T.h_stoney)}`;
    const rows = [5, 10, 20, 50, 100, 200, 500, 1000].map(R => { const k = 1 / R - (R0 ? 1 / R0 : 0); return [n4(R, 4), k, stoneyS(k, tf, Ms, ts) / 1e6, bowOf(k, D) * 1e6]; });
    h += tableHTML('sto', [T.c_R, T.c_kap, T.c_sigma, T.c_bow], rows);
    h += assume(T.a_stoney);
    h += srcList(matSrc(ps.m));
    box.innerHTML = h;
    const Rs = Array.from({ length: 121 }, (_, i) => 10 ** (0 + (3.5 * i) / 120));
    const pts = Rs.map(R => [R, stoneyS(1 / R - (R0 ? 1 / R0 : 0), tf, Ms, ts) / 1e6]);
    const g = plot(q('sto'), { xlog: true, xr: [0, 3.5], yr: bounds(pts.map(v => v[1]).filter(v => Math.abs(v) < 20 * Math.max(1, Math.abs(sf / 1e6))), 0.08, true), xlabel: T.ax_R, ylabel: T.ax_sf, hl: [{ y: 0 }], lines: [{ pts, slot: 1, w: 2.5 }], dots: R1 > 0 ? [{ x: R1, y: sf / 1e6, slot: 1 }] : [] });
    q('lg-sto').innerHTML = legend([{ slot: 1, label: fmt(T.lg_stoney, { ts: n4(ts * 1e6, 4), tf: n4(tf * 1e6, 4) }) }]);
    hover(q('sto'), g, setRead('sto', T.read_hint_R), x => `R = ${n4(x, 4)} m: σf = ${n4(stoneyS(1 / x - (R0 ? 1 / R0 : 0), tf, Ms, ts) / 1e6, 4)} MPa`);
  }
  function renderSolder() {
    const pc = P1(), pb = P2(), { t1, t2 } = temps();
    const LD = val('ld', 0) * 1e-3, hs = val('hs', 1e-9) * 1e-3, F = val('ff', 0), f = val('cpd', 1e-6);
    const dT = Math.abs(t2 - t1), Ts = (t1 + t2) / 2, da = pb.a - pc.a;
    const r = solder({ F, LD, h: hs, da, dT, Ts, f });
    let h = exHTML('bond');
    const warns = [{ soft: true, text: T.w_snpb }];
    if (!(r.c < 0)) warns.push({ text: T.w_c });
    h += warnHTML(warns);
    h += stats([
      ['da', T.o_da_s, `${n4(Math.abs(da), 4)} × 10⁻⁶ K⁻¹`], ['dxy', T.o_dxy, `${n4(LD * Math.abs(da) * 1e-6 * dT * 1e6, 4)} µm`],
      ['g', T.o_gamma, `${n4(r.g * 100, 4)} %`], ['c', T.o_c, n4(r.c, 4)], ['nf', T.o_nf, Number.isFinite(r.N) ? n4(r.N, 3) : '—'],
      ['years', T.o_years, Number.isFinite(r.N) ? `${n4(r.N / f / 365, 3)}` : '—'],
    ]);
    h += steps([
      [T.s_dxy, `ΔL = LD·|αb − αc|·ΔT = ${n4(LD * 1e3, 4)} mm × ${n4(Math.abs(da), 4)} × 10⁻⁶ K⁻¹ × ${n4(dT, 4)} K = ${n4(LD * Math.abs(da) * 1e-6 * dT * 1e6, 4)} µm`],
      [T.s_gamma, `Δγ = F·ΔL/h = ${n4(F, 3)} × ${n4(LD * Math.abs(da) * 1e-6 * dT * 1e6, 4)} µm / ${n4(hs * 1e6, 4)} µm = ${n4(r.g, 4)}`],
      [T.s_c, `c = ${C442} − 6 × 10⁻⁴ × Ts + ${C174} × 10⁻² × ln(1 + f) = ${C442} − 6 × 10⁻⁴ × ${n4(Ts, 4)} + ${C174} × 10⁻² × ln(1 + ${n4(f, 4)}) = ${n4(r.c, 4)}`],
      [T.s_nf, `Nf = ½(Δγ/(2εf′))^(1/c) = ${num(0.5, 2)} × (${n4(r.g, 4)}/(2 × ${num(EF, 3)}))^(1/${n4(r.c, 4)}) = ${n4(r.N, 4)}`],
    ]);
    h += `<h3>${esc(T.h_solder)}</h3>${figHTML('sol', T.h_solder)}`;
    const rows = [2, 5, 10, 15, 20, 30].map(ld => { const x = solder({ F, LD: ld * 1e-3, h: hs, da, dT, Ts, f }); return [n4(ld, 3), x.g * 100, x.N]; });
    h += tableHTML('sol', [T.c_ld, T.c_gamma, T.c_nf], rows, { cur: [2, 5, 10, 15, 20, 30].indexOf(val('ld', 0)) });
    h += assume(T.a_solder);
    h += srcList([...matSrc(pc.m), ...matSrc(pb.m)]);
    box.innerHTML = h;
    const dts = Array.from({ length: 101 }, (_, i) => 10 ** (1 + (1.6 * i) / 100));
    const nf = d => solder({ F, LD, h: hs, da, dT: d, Ts, f }).N;
    const ys = dts.map(nf).filter(v => v > 0 && Number.isFinite(v)).map(Math.log10);
    const yr = ys.length ? [Math.floor(Math.min(...ys)), Math.ceil(Math.max(...ys))] : [0, 6];
    const g = plot(q('sol'), { xlog: true, ylog: true, xr: [1, 2.6], yr: yr[1] > yr[0] ? yr : [yr[0] - 1, yr[0] + 1], xlabel: T.ax_dt, ylabel: T.ax_nf,
      lines: [{ pts: dts.map(d => [d, nf(d)]), slot: 1, w: 2.5 }], dots: dT > 0 ? [{ x: dT, y: r.N, slot: 1 }] : [], xt: [[10, '10'], [20, '20'], [50, '50'], [100, '100'], [200, '200']] });
    q('lg-sol').innerHTML = legend([{ slot: 1, label: fmt(T.lg_solder, { ld: n4(LD * 1e3, 3), h: n4(hs * 1e3, 3) }) }]);
    hover(q('sol'), g, setRead('sol', T.read_hint_dt), x => `ΔT = ${n4(x, 3)} K: Nf ≈ ${n4(nf(x), 3)}`);
  }

  // =========== shock: 熱衝撃 ===========
  function renderShock() {
    const p = P1(), a = val('ha', 1e-9) * 1e-3, hc = val('hc', 1e-9);
    const R = shockR(p.s, p.nu, p.E, p.a), Rp = R * p.k, beta = (a * hc) / p.k, psi = manson(beta), dTc = R / psi;
    let h = exHTML('shock');
    const warns = [...missWarn(p, [['s', T.p_strength], ['nu', 'ν']])];
    if (!(p.s > 0)) warns.push({ text: T.w_no_strength });
    if (p.m && p.m.g !== 'ceramic' && p.m.g !== 'glass' && p.m.g !== 'semi') warns.push({ soft: true, text: T.w_shock_ductile });
    if (dTc > 1500) warns.push({ soft: true, text: fmt(T.w_dtc_big, { t: n4(dTc, 4) }) });
    h += warnHTML(warns);
    h += stats([
      ['R', T.o_R, `${n4(R, 4)} K`], ['Rp', T.o_Rp, `${n4(Rp, 4)} W/m`], ['beta', T.o_beta, n4(beta, 4)], ['psi', T.o_psi, n4(psi, 4)],
      ['dtc', T.o_dtc, `${n4(dTc, 4)} K`], ['small', T.o_small, beta < 1 ? `${n4((3.25 * Rp) / (a * hc), 4)} K` : '—'],
      ['maker', T.o_maker, p.m?.dT ? `${p.m.dT} K` : '—'],
    ]);
    h += steps([
      [T.s_R, `R = σf(1 − ν)/(Eα) = ${n4(p.s / 1e6, 4)} MPa × (1 − ${n4(p.nu, 3)}) / (${n4(p.E / 1e9, 4)} GPa × ${n4(p.a, 4)} × 10⁻⁶ K⁻¹) = ${n4(R, 4)} K`],
      [T.s_Rp, `R′ = Rκ = ${n4(R, 4)} K × ${n4(p.k, 4)} W/(m·K) = ${n4(Rp, 4)} W/m`],
      [T.s_beta, `β = ah/κ = ${n4(a, 4)} m × ${n4(hc, 4)} W/(m²·K) / ${n4(p.k, 4)} W/(m·K) = ${n4(beta, 4)}`],
      [T.s_psi, `σ/σ(β→∞) = 1/${MANSON} = ${n4(psi, 4)}`],
      [T.s_dtc, `ΔTc = R × ${MANSON} = ${n4(R, 4)} K / ${n4(psi, 4)} = ${n4(dTc, 4)} K`],
    ]);
    h += `<h3>${esc(T.h_shock)}</h3>${figHTML('sh', T.h_shock)}`;
    const ids = [...SHOCK_IDS];
    const rowOf = (name, m, s, E, nu, al, k) => { const r = shockR(s, nu, E, al); return [name, s / 1e6, E / 1e9, nu, al, k, r, r * k, r / manson((a * hc) / k), m?.dT ?? '—']; };
    const rows = ids.map(id => { const m = matById(id); return rowOf(matName(id), m, m.s * 1e6, m.E * 1e9, m.nu, m.a, m.k); });
    let cur = ids.indexOf(el.mat.value);
    if (cur < 0) { rows.unshift(rowOf(p.name, p.m, p.s, p.E, p.nu, p.a, p.k)); cur = 0; }
    h += `<h3>${esc(fmt(T.h_shock_table, { a: n4(a * 1e3, 4), h: n4(hc, 4) }))}</h3>` + tableHTML('shock', [T.c_mat, 'σf (MPa)', 'E (GPa)', 'ν', 'α (10⁻⁶ K⁻¹)', 'κ (W/(m·K))', 'R (K)', 'R′ (W/m)', T.c_dtc, T.c_maker], rows, { cur });
    h += assume(T.a_shock);
    h += srcList(['KY', 'ISO', 'SCH', 'COR', 'A', ...matSrc(p.m)]);
    h += `<div class="tx-links">${link('term/thermal-diffusivity/', T.ln_term_td)}${link('tools/ashby-material-selection-chart/', T.ln_ashby)}</div>`;
    box.innerHTML = h;
    const hs = Array.from({ length: 121 }, (_, i) => 10 ** (1 + (4 * i) / 120));
    const lines = ids.map((id, i) => { const m = matById(id), r = shockR(m.s * 1e6, m.nu, m.E * 1e9, m.a); return { pts: hs.map(x => [x, r / manson((a * x) / m.k)]), slot: (i % 9) + 1, w: id === el.mat.value ? 3.2 : 1.8 }; });
    if (!ids.includes(el.mat.value)) lines.push({ pts: hs.map(x => [x, R / manson((a * x) / p.k)]), slot: 'ac', w: 3, dash: '6 3' });
    const ys = lines.flatMap(l => l.pts.map(v => v[1])).filter(v => v > 0 && Number.isFinite(v)).map(Math.log10);
    const g = plot(q('sh'), { xlog: true, ylog: true, xr: [1, 5], yr: [Math.floor(Math.min(...ys)), Math.ceil(Math.max(...ys))], xlabel: T.ax_h, ylabel: T.ax_dtc, lines, vl: [{ x: hc }] });
    q('lg-sh').innerHTML = legend([...ids.map((id, i) => ({ slot: (i % 9) + 1, label: matName(id).replace(/[(（].*$/, '').trim() })), ...(!ids.includes(el.mat.value) ? [{ slot: 'ac', dash: '6 3', label: p.name }] : [])]);
    hover(q('sh'), g, setRead('sh', T.read_hint_h), x => `h = ${n4(x, 3)} W/(m²·K): ${p.name.replace(/[(（].*$/, '').trim()} ΔTc ≈ ${n4(R / manson((a * x) / p.k), 3)} K`);
  }

  // =========== fit: 熱膨張の合わせ込み ===========
  function renderFit() {
    const s = el.fsub.value;
    if (s === 'shrink') return renderShrink();
    if (s === 'gap') return renderGap();
    return renderSeal();
  }
  const limits = (m, t1, dir) => { const c = useCurve() && m?.curve ? CURVES[m.curve] : null; return c ? (dir > 0 ? c.hi : c.lo) : (dir > 0 ? t1 + 1500 : -273.15); };
  function renderShrink() {
    const po = P1(), pi = P2(), { t1, t2 } = temps();
    let d = val('d', 1e-9) * 1e-3, D = val('dout', 0) * 1e-3, di = val('din', 0) * 1e-3;
    const dl = val('dlt') * 1e-6, cl = val('cl', 0) * 1e-6;
    const warns = [];
    if (!(D > d)) { warns.push({ text: T.w_dd }); D = d * 2; }
    if (!(di < d)) { warns.push({ text: T.w_di }); di = 0; }
    const L = x => lame({ dl: x, d, D, di, Eo: po.E, nuo: po.nu, Ei: pi.E, nui: pi.nu });
    const r0 = L(dl);
    const eo = Tx => thStrain(po.m, po.a, t1, Tx, useCurve()).eps, ei = Tx => thStrain(pi.m, pi.a, t1, Tx, useCurve()).eps;
    const need = (dl + cl) / d;
    const Th = solveT(Tx => eo(Tx) - need, t1, limits(po.m, t1, 1));
    const Tcool = solveT(Tx => -ei(Tx) - need, t1, limits(pi.m, t1, -1));
    const dAt = Tx => dl + d * (ei(Tx) - eo(Tx));
    const d2 = dAt(t2), r2 = d2 > 0 ? L(d2) : { p: 0, sto: 0, sti: 0 };
    const up = (pi.a - po.a) >= 0 ? 1 : -1; // 温度を上げると内側がより伸びるならしめしろは増える
    const Tl = solveT(dAt, t1, up > 0 ? Math.max(limits(pi.m, t1, -1), limits(po.m, t1, -1)) : Math.min(limits(pi.m, t1, 1), limits(po.m, t1, 1)));
    if (!(dl > 0)) warns.push({ text: T.w_no_int });
    if (po.s > 0 && r0.sto > po.s) warns.push({ text: fmt(T.w_hub, { s: MPa(r0.sto), sy: MPa(po.s) }) });
    if (d2 <= 0) warns.push({ text: fmt(T.w_loose, { t: n4(t2, 4) }) });
    if (Number.isFinite(Tcool) && Tcool < -196) warns.push({ soft: true, text: T.w_ln2 });
    if (!Number.isFinite(Tcool)) warns.push({ soft: true, text: fmt(T.w_no_cool, { mat: pi.name }) });
    warns.push(...missWarn(po, [['nu', 'ν']]), ...missWarn(pi, [['nu', 'ν']]));
    const rTh = thStrain(po.m, po.a, t1, Number.isFinite(Th) ? Th : t1 + 1, useCurve());
    if (rTh.out) warns.push({ text: fmt(T.w_curve_out, { mat: po.name, lo: n4(rTh.c.lo, 5), hi: n4(rTh.c.hi, 5) }) });
    let h = exHTML('fit') + warnHTML(warns);
    h += stats([
      ['p', T.o_p, MPa(r0.p)], ['sto', T.o_hoop_o, MPa(r0.sto)], ['sti', T.o_hoop_i, MPa(r0.sti)],
      ['th', T.o_theat, Number.isFinite(Th) ? `${n4(Th, 4)} °C` : '—'], ['tc', T.o_tcool, Number.isFinite(Tcool) ? `${n4(Tcool, 4)} °C` : '—'],
      ['d2', T.o_d2, `${n4(d2 * 1e6, 4)} µm`], ['p2', T.o_p2, MPa(r2.p)], ['tl', T.o_tloose, Number.isFinite(Tl) ? `${n4(Tl, 4)} °C` : '—'],
      ['torque', T.o_hold, `${n4((r0.p * Math.PI * d) / 1e3, 4)} kN/m`],
    ]);
    const Eo = n4(po.E / 1e9, 4), Ei = n4(pi.E / 1e9, 4);
    h += steps([
      [T.s_lame, `p = δ / (d[(1/Eo)((D² + d²)/(D² − d²) + νo) + (1/Ei)((d² + di²)/(d² − di²) − νi)])\n= ${n4(dl * 1e6, 4)} µm / (${n4(d * 1e3, 4)} mm × [(1/${Eo} GPa)(${n4((D * D + d * d) / (D * D - d * d), 4)} + ${n4(po.nu, 3)}) + (1/${Ei} GPa)(${n4((d * d + di * di) / (d * d - di * di), 4)} − ${n4(pi.nu, 3)})]) = ${MPa(r0.p)}`],
      [T.s_hoop, `σθ,o = p(D² + d²)/(D² − d²) = ${MPa(r0.sto)}; σθ,i = −p(d² + di²)/(d² − di²) = ${MPa(r0.sti)}; σr = −p`],
      [T.s_heat, `εo = (δ + c)/d = (${n4(dl * 1e6, 4)} + ${n4(cl * 1e6, 4)}) µm / ${n4(d * 1e3, 4)} mm = ${ppm(need)} → ${Number.isFinite(Th) ? `${n4(Th, 4)} °C` : '—'} (${T.s_heat_c}: ΔT = ${n4(need / (po.a * 1e-6), 4)} K)`],
      [T.s_cool, `${Number.isFinite(Tcool) ? `${n4(Tcool, 4)} °C` : '—'} (${T.s_heat_c}: ΔT = −${n4(need / (pi.a * 1e-6), 4)} K)`],
      [T.s_op, `δ(T2) = δ + d·(εi − εo) = ${n4(dl * 1e6, 4)} µm + ${n4(d * 1e3, 4)} mm × (${ppm(ei(t2))} − ${ppm(eo(t2))}) = ${n4(d2 * 1e6, 4)} µm`],
    ]);
    h += `<h3>${esc(T.h_shrink)}</h3>${figHTML('fit', T.h_shrink)}`;
    const rows = [];
    for (let i = 0; i <= 5; i++) { const t = t1 + ((t2 - t1) * i) / 5, dd = dAt(t), rr = dd > 0 ? L(dd) : { p: 0, sto: 0 }; rows.push([n4(t, 5), dd * 1e6, rr.p / 1e6, rr.sto / 1e6]); }
    h += tableHTML('fit', [T.c_t, T.c_delta, T.c_p, T.c_hoop], rows);
    h += assume(T.a_shrink);
    h += srcList([...matSrc(po.m), ...matSrc(pi.m)]);
    box.innerHTML = h;
    const xa = Math.max(-273.15, Math.min(t1, t2, Number.isFinite(Tcool) ? Tcool : t1) - 20), xb = Math.max(t1, t2, Number.isFinite(Th) ? Th : t1) + 20;
    const pts = [];
    for (let i = 0; i <= 150; i++) { const t = xa + ((xb - xa) * i) / 150; pts.push([t, dAt(t) * 1e6]); }
    const g = plot(q('fit'), { xr: [xa, xb], yr: bounds(pts.map(v => v[1]), 0.08, true), xlabel: T.ax_t, ylabel: T.ax_delta, hl: [{ y: 0 }, { y: -cl * 1e6, label: T.lg_clear, dash: '2 4' }], lines: [{ pts, slot: 1, w: 2.5 }],
      vl: [...(Number.isFinite(Th) ? [{ x: Th, label: T.lg_heat }] : []), { x: t1 }], dots: [{ x: t2, y: d2 * 1e6, slot: 2 }] });
    q('lg-fit').innerHTML = legend([{ slot: 1, label: T.lg_delta }, { slot: 2, dot: true, label: T.lg_op }]);
    hover(q('fit'), g, setRead('fit', T.read_hint), x => `${n4(x, 4)} °C: δ = ${n4(dAt(x) * 1e6, 4)} µm`);
  }
  function renderGap() {
    const po = P1(), pi = P2(), { t1, t2 } = temps(), d = val('d', 0) * 1e-3, c0 = val('c0') * 1e-6;
    const eo = Tx => thStrain(po.m, po.a, t1, Tx, useCurve()), ei = Tx => thStrain(pi.m, pi.a, t1, Tx, useCurve());
    const cAt = Tx => c0 + d * (eo(Tx).eps - ei(Tx).eps);
    const c2 = cAt(t2);
    const lo = Math.max(limits(po.m, t1, -1), limits(pi.m, t1, -1)), hi = Math.min(limits(po.m, t1, 1), limits(pi.m, t1, 1));
    const TsUp = solveT(cAt, t1, hi), Ts = Number.isFinite(TsUp) ? TsUp : solveT(cAt, t1, lo);
    const ro = eo(t2), ri = ei(t2);
    let h = exHTML('fit') + warnHTML([...strainWarn(po, t1, t2, ro), ...strainWarn(pi, t1, t2, ri), c2 < 0 ? { text: fmt(T.w_seize, { t: n4(t2, 4) }) } : null]);
    h += stats([
      ['c2', T.o_c2, `${n4(c2 * 1e6, 4)} µm`], ['dc', T.o_dc, `${n4((c2 - c0) * 1e6, 4)} µm`], ['ts', T.o_tseize, Number.isFinite(Ts) ? `${n4(Ts, 4)} °C` : '—'],
      ['dalpha', T.o_dalpha, `${n4(ro.mean - ri.mean, 4)} × 10⁻⁶ K⁻¹`],
    ]);
    h += steps([strainStep(po, t1, t2, ro), strainStep(pi, t1, t2, ri), [T.s_gapc, `c(T2) = c0 + d·(εo − εi) = ${n4(c0 * 1e6, 4)} µm + ${n4(d * 1e3, 5)} mm × (${ppm(ro.eps)} − ${ppm(ri.eps)}) = ${n4(c2 * 1e6, 4)} µm`]]);
    h += `<h3>${esc(T.h_gap)}</h3>${figHTML('gap', T.h_gap)}`;
    h += assume(T.a_gap);
    h += srcList([...matSrc(po.m), ...matSrc(pi.m)]);
    box.innerHTML = h;
    const span = Math.abs(t2 - t1) || 50, xa = Math.max(lo, Math.min(t1, t2, Number.isFinite(Ts) ? Ts : t1) - span * 0.2), xb = Math.min(hi, Math.max(t1, t2, Number.isFinite(Ts) ? Ts : t1) + span * 0.2);
    const pts = [];
    for (let i = 0; i <= 120; i++) { const t = xa + ((xb - xa) * i) / 120; pts.push([t, cAt(t) * 1e6]); }
    const g = plot(q('gap'), { xr: [xa, xb], yr: bounds(pts.map(v => v[1]), 0.08, true), xlabel: T.ax_t, ylabel: T.ax_c, hl: [{ y: 0 }], lines: [{ pts, slot: 1, w: 2.5 }], dots: [{ x: t2, y: c2 * 1e6, slot: 2 }, { x: t1, y: c0 * 1e6, slot: 'mu', r: 3.5 }] });
    q('lg-gap').innerHTML = legend([{ slot: 1, label: T.lg_gap }]);
    hover(q('gap'), g, setRead('gap', T.read_hint), x => `${n4(x, 4)} °C: c = ${n4(cAt(x) * 1e6, 4)} µm`);
  }
  function renderSeal() {
    const pg = P1(), pm = P2(), tset = val('tset', -273.15), t2 = val('t2', -273.15);
    const Mg = pg.E / (1 - pg.nu);
    const mis = (mm, am, Tx) => thStrain(mm, am, Tx, tset, useCurve()).eps - thStrain(pg.m, pg.a, Tx, tset, useCurve()).eps; // 冷却での縮みの差(金属 − ガラス)
    const rg = thStrain(pg.m, pg.a, t2, tset, useCurve()), rm = thStrain(pm.m, pm.a, t2, tset, useCurve());
    const de = rm.eps - rg.eps, sg = -Mg * de;
    const warns = [...strainWarn(pg, t2, tset, rg), ...strainWarn(pm, t2, tset, rm), ...missWarn(pg, [['nu', 'ν']])];
    if (pg.m && pg.m.g !== 'glass') warns.push({ soft: true, text: T.w_not_glass });
    if (sg > 0 && pg.s > 0 && sg > pg.s) warns.push({ text: fmt(T.w_seal_t, { s: MPa(sg), sy: MPa(pg.s) }) });
    let h = exHTML('fit') + warnHTML(warns);
    h += stats([
      ['ag', T.o_ag, `${n4(rg.mean, 4)} × 10⁻⁶ K⁻¹`], ['am', T.o_am, `${n4(rm.mean, 4)} × 10⁻⁶ K⁻¹`], ['de', T.o_de_seal, ppm(de)],
      ['sg', T.o_sg, MPa(sg)], ['state', T.o_state, stateTxt(sg)], ['ratio', T.o_ratio_g, pg.s > 0 ? n4(Math.abs(sg) / pg.s, 3) : '—'],
    ]);
    h += steps([
      strainStep(pg, t2, tset, rg), strainStep(pm, t2, tset, rm),
      [T.s_seal, `Δε = εm − εg = ${ppm(rm.eps)} − ${ppm(rg.eps)} = ${ppm(de)}`],
      [T.s_seal2, `σg = −Eg/(1 − νg)·Δε = −${n4(pg.E / 1e9, 4)} GPa/(1 − ${n4(pg.nu, 3)}) × ${ppm(de)} = ${MPa(sg)}`],
    ]);
    h += `<h3>${esc(T.h_seal)}</h3>${figHTML('seal', T.h_seal)}`;
    const ids = [...SEAL_METALS];
    const rows = ids.map(id => { const m = matById(id), r = thStrain(m, m.a, t2, tset, useCurve()), dd = r.eps - rg.eps; return [matName(id), r.mean, dd * 1e6, (-Mg * dd) / 1e6, stateTxt(-Mg * dd)]; });
    h += `<h3>${esc(fmt(T.h_seal_table, { g: pg.name }))}</h3>` + tableHTML('seal', [T.c_metal, T.c_mean, T.c_de, T.c_sg, T.c_state], rows, { cur: ids.indexOf(el.mat2.value) });
    h += assume(T.a_seal);
    h += srcList([...matSrc(pg.m), ...matSrc(pm.m), 'F15']);
    h += `<div class="tx-links">${link('term/invar/', T.ln_term_invar)}${link('term/glass-transition-temperature/', T.ln_term_tgl)}</div>`;
    box.innerHTML = h;
    const xa = Math.min(t2, tset), xb = Math.max(t2, tset) || 1;
    const pts = [];
    for (let i = 0; i <= 120; i++) { const t = xa + ((xb - xa) * i) / 120; pts.push([t, mis(pm.m, pm.a, t) * 1e6]); }
    const padS = ((xb > xa ? xb : xa + 1) - xa) * 0.03;
    const g = plot(q('seal'), { xr: [xa - padS, (xb > xa ? xb : xa + 1) + padS], yr: bounds(pts.map(v => v[1]), 0.08, true), xlabel: T.ax_t, ylabel: T.ax_mis, hl: [{ y: 0 }], lines: [{ pts, slot: 1, w: 2.5 }], dots: [{ x: t2, y: de * 1e6, slot: 1 }] });
    q('lg-seal').innerHTML = legend([{ slot: 1, label: fmt(T.lg_seal, { g: pg.name.replace(/[(（].*$/, '').trim(), m: pm.name.replace(/[(（].*$/, '').trim() }) }]);
    hover(q('seal'), g, setRead('seal', T.read_hint), x => `${n4(x, 4)} °C: Δε = ${n4(mis(pm.m, pm.a, x) * 1e6, 4)} × 10⁻⁶`);
  }

  // =========== lib: 材料のデータ集 ===========
  function renderLib() {
    const grp = el.grp.value, list = LIB.filter(m => grp === 'all' || m.g === grp);
    const rng = r => (r ? (r[0] === r[1] ? n4(r[0], 3) : `${n4(r[0], 3)}–${n4(r[1], 3)}`) : '—');
    const sk = m => (m.s == null ? '—' : `${n4(m.s, 4)} (${T[`sk_${m.sk}`]})`);
    const rows = list.map(m => [matName(m.id), optText('grp', m.g), { t: `${n4(m.a, 4)}`, v: m.a }, m.ar ? rangeTxt(m.ar) : T.r_rt, m.E, m.nu ?? '—', m.k, { t: sk(m), v: m.s ?? '' }, m.rho ?? '—',
      m.curve ? `${n4(CURVES[m.curve].lo, 4)}–${n4(CURVES[m.curve].hi, 4)} °C` : '—', { t: m.ash ? `${rng(ashbyRange(m, 7))} / ${rng(ashbyRange(m, 3))}` : '—', v: m.ash ? `${rng(ashbyRange(m, 7))} / ${rng(ashbyRange(m, 3))}` : '' },
      [...new Set(Object.values(m.src))].join(' ')]);
    let h = stats([['n', T.o_nmat, String(list.length)], ['nc', T.o_ncurve, String(list.filter(m => m.curve).length)]]);
    h += tableHTML('lib', [T.c_mat, T.c_grp, 'α (10⁻⁶ K⁻¹)', T.c_ar, 'E (GPa)', 'ν', 'κ (W/(m·K))', T.c_s, 'ρ (g/cm³)', T.c_curve, T.c_ashby, T.c_src], rows, { left: [3, 7, 9, 10, 11] });
    h += assume(T.a_lib);
    h += `<h3>${esc(T.h_curves)}</h3>${figHTML('lib', T.h_curves)}`;
    h += `<h3>${esc(T.h_src)}</h3><ul class="tx-src">${Object.entries(SRC).map(([k, v]) => `<li><b>${esc(k)}</b>: ${esc(v)}</li>`).join('')}</ul>`;
    h += `<div class="tx-links">${link('tools/materials-periodic-table/', T.ln_ptable)}${link('tools/ashby-material-selection-chart/', T.ln_ashby)}${link('tools/composite-rule-of-mixtures-calculator/', T.ln_comp)}</div>`;
    box.innerHTML = h;
    const cs = LIB.filter(m => m.curve && (m.id === 'si' || !m.id.startsWith('si')));
    const lines = cs.map((m, i) => { const c = CURVES[m.curve], pts = []; for (let k = 0; k <= 200; k++) { const t = c.lo + ((c.hi - c.lo) * k) / 200; pts.push([t, curveAlpha(c, t)]); } return { pts, slot: i + 1, w: 2.2 }; });
    const g = plot(q('lib'), { xr: [-273.15, 1200], yr: [-2, 32], xlabel: T.ax_t, ylabel: T.ax_alpha, hl: [{ y: 0 }], lines });
    q('lg-lib').innerHTML = legend(cs.map((m, i) => ({ slot: i + 1, label: matName(m.id).replace(/[(（].*$/, '').trim() })));
    hover(q('lib'), g, setRead('lib', T.read_hint), x => `${n4(x, 4)} °C: ${cs.map(m => { const v = curveAlpha(CURVES[m.curve], x); return Number.isFinite(v) ? `${matName(m.id).replace(/[(（].*$/, '').trim()} ${n4(v, 3)}` : null; }).filter(Boolean).join(SEP)}`);
  }

  // ---- 結果のコピー(今のモードで見えている入力と結果だけ。共通の部品より先に受ける) ----
  const clean = n => n?.textContent.trim().replace(/\s+/g, ' ') ?? '';
  function resultText() {
    const lines = [clean(document.querySelector('h1')), `[${optText('mode', modeSel.value)}]`, ''];
    for (const f of el) if (f.name && f.name !== 'mode' && !lab(f.name).hidden) lines.push(`${clean(lab(f.name).querySelector('span'))}: ${f.tagName === 'SELECT' ? clean(f.selectedOptions[0]) : f.value}`);
    for (const n of box.querySelectorAll('[data-tx-warn]')) lines.push('', `! ${clean(n)}`);
    for (const node of box.querySelectorAll('h3, .dy-stats > div, table')) {
      if (node.tagName === 'H3') lines.push('', `[${clean(node)}]`);
      else if (node.tagName === 'TABLE') for (const row of node.rows) lines.push([...row.cells].map(clean).join('\t'));
      else lines.push(`${clean(node.querySelector('dt'))}: ${clean(node.querySelector('dd'))}`);
    }
    lines.push('', location.href);
    return lines.join('\n');
  }
  const bar = document.querySelector('[data-tool-id]');
  bar?.addEventListener('click', async e => {
    const b = e.target.closest('[data-copy-result]');
    if (!b) return;
    e.stopPropagation();
    if (await copyText(resultText())) flash(b, b.dataset.done);
  }, true);

  // ---- 描き直し ----
  const R_ = { free: renderFree, con: renderCon, grad: renderGrad, bond: renderBond, shock: renderShock, fit: renderFit, lib: renderLib };
  let raf = 0;
  const render = () => { visible(); R_[modeSel.value](); };
  const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(render); };
  form.addEventListener('input', schedule);
  form.addEventListener('change', schedule);
  form.addEventListener('submit', e => e.preventDefault());
  let lastW = box.clientWidth < 520;
  if (window.ResizeObserver) new ResizeObserver(() => { const w = box.clientWidth < 520; if (w !== lastW) { lastW = w; render(); } }).observe(box);
  render();
}
