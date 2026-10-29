// 複合材料デザイナー。1ページに4つのモード(タブ)を持つ:
//   ud    一方向材(UD)のミクロ力学: 体積率・質量率・空隙、E1(複合則)、E2・G12(逆複合則と Halpin–Tsai)、ν12、
//         熱膨張 α1・α2(Schapery)、縦方向の引張強さ(繊維と母材の破断ひずみの関係)。体積率を横軸にした図、メーカー実測との比較
//   lam   積層板の古典積層理論(CLT): 積層の並びから各層の Q̄、ABD 行列、等価な面内・曲げの弾性率、カップリング。
//         単層と積層板の E(θ) の極座標図。荷重(N・M・ΔT)から各層の応力・ひずみ、最大応力則・Tsai–Hill・Tsai–Wu の強度比、
//         最初に壊れる層(FPF)と、層を順に外していく簡単な最終破壊(LPF)の目安
//   short 短繊維: 臨界繊維長 lc = σf d/(2τ)、Cox のシアラグによる長さの効率、Kelly–Tyson の強さ、Krenchel の配向の効率
//   cmp   比べる: 同じ剛性・強さの板(または棒)にしたときの厚さと重さを、鋼・アルミ合金・CFRP 疑似等方材・GFRP で並べる
// 値と出典は review の sources.md、検算は scripts/check_composite.py(python で独立に計算して突き合わせる)。
// 純粋な計算の関数は export し、DOM の部分は form があるときだけ動かす(node から関数を呼んで検算するため)
import { num, sci } from './eng.js';

// =====================================================================
// データのデータ集
// =====================================================================
// 出典の鍵 → 文献(ページには主な出典名を出す。値ごとの出典は sources.md)
export const SRC = {
  TOR_T300: 'Toray Composite Materials America, TORAYCA T300 Technical Data Sheet (No. CFA-001)',
  TOR_T700S: 'Toray Composite Materials America, TORAYCA T700S Technical Data Sheet (No. CFA-005)',
  TOR_T800S: 'Toray Composite Materials America, TORAYCA T800S Technical Data Sheet',
  TOR_M40J: 'Toray Composite Materials America, TORAYCA M40J Technical Data Sheet (No. CFA-014)',
  TOR_M55J: 'Toray Composite Materials America, TORAYCA M55J Technical Data Sheet (No. CFA-017)',
  TEI_HTS40: 'Teijin Tenax HTS40 (12K/24K roving), values as listed by the distributor compositeshop.de',
  WWFE: 'P. D. Soden, M. J. Hinton, A. S. Kaddour, Compos. Sci. Technol. 58 (1998) 1011 (WWFE), as tabulated in NPTEL course 101104010, Lecture 25 (IIT Kanpur), Tables 7.1–7.2',
  AGY: 'AGY, “S-Series High Performance Materials for Automotive Applications” (E-Glass / S-2 Glass property table)',
  OC: 'Owens Corning, “Higher Performance Composites” sell sheet, Pub. 10023976 (2021), Advantex E-CR glass',
  DUP: 'DuPont, Kevlar Aramid Fiber Technical Guide, Tables II-1 and II-4 (Kevlar 49)',
  DUP_TR: 'Kevlar 49 transverse constants from the DuPont Kevlar 49 Data Manual (1986), as listed in Autodesk Helius PFA Material Manager, Appendix A',
  MAFIC: 'Mafic, Basalt Direct Roving 17 µm technical data (impregnated strand, ASTM D2343)',
  ZHU: 'J. Zhu, H. Zhu, J. Njuguna, H. Abhyankar, Materials 6 (2013) 5171, Table 2 (after Sparnins 2009; Symington et al. 2009)',
  MAU: 'R. Maurin, P. Davies, N. Baral, C. Baley, Appl. Compos. Mater. 15 (2008) 61 (transverse modulus of M40J and M46J fibres: 14–15 GPa by nano-indentation, about 8–15 GPa back-calculated from composite data; it decreases as the axial modulus increases)',
  HEX8552: 'Hexcel, HexPly 8552 Product Data Sheet (neat resin)',
  ASHBY: 'M. F. Ashby, Material property data for engineering materials, 5th ed. (Ansys Granta, 2021) – centre of the range, as in this site’s material selection chart',
  DER: 'Ashland, DERAKANE MOMENTUM 411-350 Technical Datasheet (cured casting)',
  VIC: 'Victrex, VICTREX PEEK 450G Typical Properties',
  BASF: 'BASF, Ultramid B3S (PA6) datasheet (ISO 527, ISO 11359)',
  LYB: 'LyondellBasell, Moplen HP500N datasheet (ISO 527)',
  ASM6061: 'ASM Aerospace Specification Metals, Aluminum 6061-T6 data sheet',
  UC3M: 'T300/5208 (Tsai & Hahn), as given in Universidad Carlos III de Madrid, Mecánica de Materiales Compuestos, Ejercicios Tema 5',
  NTNU: 'N. P. Vedvik, TMM4175 Lightweight Design, NTNU, “Material properties”, Table 1 (V_f = 0.55)',
  EC3: 'EN 1993-1-1 §3.2.6 (E = 210 GPa, ν = 0.3) and EN 10025-2 S355 (f_y = 355 MPa, t ≤ 16 mm); ρ = 7.85 g/cm³',
  DONG: 'C. Dong, “Effects of process-induced voids on the properties of fibre reinforced composites”, Curtin University (review): ≈1.5 % loss of transverse modulus and flexural properties per 1 % voids',
  ASM_TR: 'ν, α not in the datasheet: typical value assumed (see the warning)',
};

// 繊維。E1 GPa、E2 GPa(繊維の径方向)、G12 GPa、nu = ν12、a1・a2 10⁻⁶/K、rho g/cm³、s(引張強さ)MPa、d µm。
// src は主な出典、tr は径方向の値(E2・G12・nu・a2)の出典。asm に書いた性質は出典がなく、仮定の値(画面に注意を出す)
const T300TR = { E2: 15, G12: 15, nu: 0.2, a2: 12 }; // WWFE の T300(Soden ら 1998)
const FIB0 = [
  { id: 't300', cls: 'cf', E1: 230, rho: 1.76, s: 3530, d: 7, a1: -0.41, src: 'TOR_T300', ...T300TR, trsrc: 'WWFE', ms: { E1: 140, X: 1820, Xc: 1470, Y: 76, S: 95, resin: '#2500' } },
  { id: 't700s', cls: 'cf', E1: 230, rho: 1.80, s: 4900, d: 7, a1: -0.38, src: 'TOR_T700S', ...T300TR, asm: ['E2', 'G12', 'nu', 'a2'], ms: { E1: 134, X: 2860, Xc: 1450, Y: 81, S: 136, resin: '#2592' } },
  { id: 't800s', cls: 'cf', E1: 294, rho: 1.80, s: 5880, d: 5, a1: -0.4, src: 'TOR_T800S', ...T300TR, asm: ['E2', 'G12', 'nu', 'a2'], ms: { E1: 163, X: 3290, Xc: 1490, Y: 79, S: 135, resin: '#2592' } },
  { id: 'm40j', cls: 'cf', E1: 377, rho: 1.77, s: 4400, d: 5, a1: -0.83, src: 'TOR_M40J', ...T300TR, asm: ['E2', 'G12', 'nu', 'a2'], ms: { E1: 226, X: 2500, Xc: 1270, Y: 63, S: 123, resin: '#2592' } },
  // M55J は径方向の値の出典がなく、繊維方向の弾性率が高い繊維ほど径方向の弾性率は下がる(Maurin ら 2008)ので、T300 の値で代用しない(空欄)
  { id: 'm55j', cls: 'cf', E1: 540, rho: 1.91, s: 4020, d: 5, a1: -1.1, src: 'TOR_M55J', E2: null, G12: null, nu: null, a2: null, hm: true, ms: { E1: 338, X: 2020, Xc: 890, Y: 37, S: 68, resin: '#2500' } },
  { id: 'hts40', cls: 'cf', E1: 240, rho: 1.77, s: 4300, d: 7, a1: null, src: 'TEI_HTS40', ...T300TR, asm: ['E2', 'G12', 'nu', 'a2'] },
  { id: 'eglass', cls: 'gl', E1: 72.3, rho: 2.58, s: 3445, d: null, a1: 5.4, src: 'AGY', iso: true, nu: 0.2, nusrc: 'WWFE' },
  { id: 'ecr', cls: 'gl', E1: 82, rho: 2.63, s: 4050, d: null, a1: null, src: 'OC', iso: true, nu: 0.2, asm: ['nu'] },
  { id: 'sglass', cls: 'gl', E1: 86.9, rho: 2.46, s: 4890, d: null, a1: 1.6, src: 'AGY', iso: true, nu: 0.2, asm: ['nu'] },
  { id: 'k49', cls: 'ar', E1: 124, rho: 1.44, s: 3600, d: 12, a1: -4.9, src: 'DUP', E2: 6.9, G12: 2.8, nu: 0.36, a2: 41, trsrc: 'DUP_TR' },
  { id: 'basalt', cls: 'bs', E1: 88, rho: 2.63, s: 3000, d: 17, a1: null, src: 'MAFIC', iso: true, nu: 0.2, asm: ['nu'] },
  { id: 'flax', cls: 'nf', E1: 58, rho: 1.53, s: 1339, d: null, a1: null, src: 'ZHU', E2: null, G12: null, nu: null, a2: null },
  { id: 'hemp', cls: 'nf', E1: 70, rho: 1.52, s: 920, d: null, a1: null, src: 'ZHU', E2: null, G12: null, nu: null, a2: null },
];
export const FIB = FIB0.map(f => {
  const o = { E2: null, G12: null, nu: null, a2: null, asm: [], ...f };
  if (o.iso) { o.E2 = o.E1; o.G12 = o.E1 / (2 * (1 + o.nu)); o.a2 = o.a1; } // 等方の繊維(ガラス・玄武岩)
  return o;
});
export const fibById = id => FIB.find(f => f.id === id);

// 母材。E GPa、nu、a 10⁻⁶/K、rho g/cm³、s(引張強さ、熱可塑性樹脂・金属は降伏応力)MPa、eu(破断ひずみ %、延性の母材は大きい値)
// asm の性質は出典にない仮定の値: 熱硬化性樹脂の ν 0.35(WWFE のエポキシ 0.34–0.35)、熱可塑性樹脂の ν 0.40(プラスチックは 0.3–0.45)
const MAT0 = [
  { id: 'ep8552', cls: 'ts', E: 4.67, nu: 0.35, a: 45, rho: 1.30, s: 121, eu: 1.7, src: 'HEX8552', asm: ['nu', 'a'] },
  { id: 'ep', cls: 'ts', E: 2.73, nu: 0.35, a: 83.4, rho: 1.24, s: 50.9, eu: null, src: 'ASHBY', asm: ['nu'] },
  { id: 've', cls: 'ts', E: 3.2, nu: 0.35, a: null, rho: 1.14, s: 86, eu: 5.5, src: 'DER', asm: ['nu'] },
  { id: 'peek', cls: 'tp', E: 4.0, nu: 0.40, a: 45, rho: 1.30, s: 98, eu: 45, src: 'VIC', asm: ['nu'] },
  { id: 'pa6', cls: 'tp', E: 3.5, nu: 0.40, a: 85, rho: 1.13, s: 90, eu: 10, src: 'BASF', asm: ['nu'] },
  { id: 'pa6c', cls: 'tp', E: 1.2, nu: 0.40, a: 85, rho: 1.13, s: 45, eu: 50, src: 'BASF', asm: ['nu'] },
  { id: 'pp', cls: 'tp', E: 1.55, nu: 0.40, a: 147, rho: 0.90, s: 35, eu: 50, src: 'LYB', asm: ['nu', 'a'] }, // 破断ひずみ > 50 %(降伏ひずみは 10 %)
  { id: 'al6061', cls: 'mt', E: 68.9, nu: 0.33, a: 23.6, rho: 2.70, s: 276, eu: 12, src: 'ASM6061' },
];
export const MAT = MAT0.map(m => ({ asm: [], ...m }));
export const matById = id => MAT.find(m => m.id === id);

// 単層(一方向材の層)。E GPa、nu = ν12、a 10⁻⁶/K、強さ MPa(X・Xc は繊維方向の引張・圧縮、Y・Yc は垂直方向、S は面内せん断)、rho g/cm³、t mm
export const LAM = [
  { id: 't300_5208', E1: 181, E2: 10.3, G12: 7.17, nu: 0.28, a1: 0.02, a2: 22.5, X: 1500, Xc: 1500, Y: 40, Yc: 246, S: 68, rho: null, vf: null, t: 0.125, src: 'UC3M' },
  { id: 'ntnu_cf_a', E1: 130, E2: 10, G12: 4.5, nu: 0.28, a1: -0.5, a2: 30, X: 1800, Xc: 1200, Y: 40, Yc: 180, S: 70, rho: 1.6, vf: 0.55, t: 0.125, src: 'NTNU' },
  { id: 'ntnu_cf_b', E1: 330, E2: 8, G12: 4.0, nu: 0.28, a1: -0.7, a2: 30, X: 1000, Xc: 800, Y: 40, Yc: 100, S: 70, rho: 1.7, vf: 0.55, t: 0.125, src: 'NTNU' },
  { id: 'ntnu_eg', E1: 40, E2: 10, G12: 3.8, nu: 0.30, a1: 7.0, a2: 22, X: 1000, Xc: 700, Y: 40, Yc: 120, S: 70, rho: 2.0, vf: 0.55, t: 0.125, src: 'NTNU' },
  { id: 'ntnu_sg', E1: 48, E2: 11, G12: 4.2, nu: 0.30, a1: 4.0, a2: 20, X: 1300, Xc: 800, Y: 40, Yc: 140, S: 70, rho: 2.0, vf: 0.55, t: 0.125, src: 'NTNU' },
  { id: 'ntnu_k49', E1: 73, E2: 5, G12: 2.2, nu: 0.35, a1: -1.0, a2: 50, X: 1400, Xc: 300, Y: 20, Yc: 120, S: 40, rho: 1.4, vf: 0.55, t: 0.125, src: 'NTNU' },
];
export const lamById = id => LAM.find(l => l.id === id);

// 比べるための金属(等方)
export const METALS = [
  { id: 'steel', E: 210, rho: 7.85, s: 355, nu: 0.3, src: 'EC3' },
  { id: 'al', E: 68.9, rho: 2.70, s: 276, nu: 0.33, src: 'ASM6061' },
];

// 積層の並びの例
export const LAYUPS = { qi: '[0/±45/90]s', cp: '[0/90]s', pm45: '[±45]s', ud: '[0]8', qi2: '[0/45/90/-45]2s', a30: '[0/±30]s', unsym: '[0/90]', ang: '[30/-30]' };

// =====================================================================
// 一方向材のミクロ力学
// =====================================================================
// 体積率・質量率・空隙。basis 'vol' なら f は繊維の体積率(空隙を含む全体に対して)、'mass' なら繊維の質量率。vv は空隙の体積率。
// 質量率で入れたときは、空隙のない体積率を求めてから空隙のぶんだけ縮める
export function fractions({ basis, f, vv, rf, rm }) {
  vv = Math.min(Math.max(vv, 0), 0.99);
  let vf;
  if (basis === 'mass') {
    const v0 = (f / rf) / (f / rf + (1 - f) / rm);
    vf = v0 * (1 - vv);
  } else vf = Math.min(Math.max(f, 0), 1 - vv);
  const vm = Math.max(1 - vf - vv, 0);
  const rho = vf * rf + vm * rm;
  const wf = (vf * rf) / rho;
  const vf0 = vf + vm > 0 ? vf / (vf + vm) : 0; // 空隙を除いた体積率(E2・G12・ν・α に使う)
  return { vf, vm, vv, rho, wf, wm: 1 - wf, vf0 };
}

export const halpinTsai = (Pf, Pm, xi, v) => { const r = Pf / Pm, eta = (r - 1) / (r + xi); return (Pm * (1 + xi * eta * v)) / (1 - eta * v); };

// 一方向材の性質。fb: 繊維 { E1, E2, G12, nu, a1, a2, s }、mt: 母材 { E, nu, a, s, eu }、fr: fractions の結果、xiE・xiG: Halpin–Tsai の ξ
export function micro(fb, mt, fr, xiE = 2, xiG = 1) {
  const { vf, vm, vf0 } = fr, vm0 = 1 - vf0;
  const Gm = mt.E / (2 * (1 + mt.nu));
  const o = { Gm };
  o.E1 = vf * fb.E1 + vm * mt.E;                         // 等ひずみ(空隙は剛性 0 の相)
  o.share = (vf * fb.E1) / o.E1;
  o.E2r = 1 / (vf0 / fb.E2 + vm0 / mt.E);                // 等応力(逆複合則)
  o.E2h = halpinTsai(fb.E2, mt.E, xiE, vf0);
  o.G12r = 1 / (vf0 / fb.G12 + vm0 / Gm);
  o.G12h = halpinTsai(fb.G12, Gm, xiG, vf0);
  o.nu12 = vf0 * fb.nu + vm0 * mt.nu;
  o.nu21 = (o.nu12 * o.E2h) / o.E1;
  // 熱膨張(Schapery)。α1 は剛性で重みをつけた平均。α2 は径方向に異方性のある繊維へ広げた形(Hyer):
  // α2 = Vf(α2f + ν12f α1f) + Vm(1 + νm)αm − α1 ν12(等方の繊維では (1 + νf)αf Vf + (1 + νm)αm Vm − α1 ν12)
  o.a1 = (fb.E1 * fb.a1 * vf0 + mt.E * mt.a * vm0) / (fb.E1 * vf0 + mt.E * vm0);
  o.a2 = vf0 * (fb.a2 + fb.nu * fb.a1) + vm0 * (1 + mt.nu) * mt.a - o.a1 * o.nu12;
  // 縦方向の引張強さ。繊維の破断ひずみ εf* = σf/Ef、母材の破断ひずみ εm*(延性の母材は降伏で頭打ち)
  o.ef = fb.s / (fb.E1 * 1000);
  o.em = Number.isFinite(mt.eu) ? mt.eu / 100 : mt.s / (mt.E * 1000);
  if (o.ef <= o.em) {
    // 繊維が先に切れる: σ1u = Vf σf + Vm σm'(σm' は繊維が切れるひずみでの母材の応力)。
    // 繊維が少ないと、繊維が切れたあと母材だけで Vm σm まで持つ
    o.case = 'fiber';
    o.smp = Math.min(mt.E * 1000 * o.ef, mt.s);
    o.sFib = vf * fb.s + vm * o.smp;
    o.sMat = vm * mt.s;
    o.X = Math.max(o.sFib, o.sMat);
    o.gov = o.sFib >= o.sMat ? 'fib' : 'mat';
    o.vmin = (mt.s - o.smp) / (fb.s + mt.s - o.smp);
    o.vcrit = (mt.s - o.smp) / (fb.s - o.smp);
  } else {
    // 母材が先に割れる: 割れたあと繊維だけで持つ(Vf σf)か、母材の割れで全体が壊れる(Vf Ef εm* + Vm σm)の大きいほう
    o.case = 'matrix';
    o.sfm = fb.E1 * 1000 * o.em; // 母材が割れるひずみでの繊維の応力
    o.sFib = vf * fb.s;
    o.sMat = vf * o.sfm + vm * mt.s;
    o.X = Math.max(o.sFib, o.sMat);
    o.gov = o.sFib >= o.sMat ? 'fib' : 'mat';
    o.vtr = mt.s / (fb.s - o.sfm + mt.s); // 2つの式が等しくなる体積率
  }
  return o;
}

// =====================================================================
// 古典積層理論
// =====================================================================
// 単層の剛性(平面応力の換算剛性)。E・G は MPa で渡す
export function Qmat(E1, E2, nu12, G12) {
  const nu21 = (nu12 * E2) / E1, d = 1 - nu12 * nu21;
  return [[E1 / d, (nu12 * E2) / d, 0], [(nu12 * E2) / d, E2 / d, 0], [0, 0, G12]];
}
// θ 回した層の Q̄(工学せん断ひずみ γ を使う形)
export function Qbar(Q, deg) {
  const t = (deg * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t);
  const c2 = c * c, s2 = s * s, c4 = c2 * c2, s4 = s2 * s2, cs = c * s;
  const [Q11, Q12, Q22, Q66] = [Q[0][0], Q[0][1], Q[1][1], Q[2][2]];
  const q11 = Q11 * c4 + 2 * (Q12 + 2 * Q66) * s2 * c2 + Q22 * s4;
  const q12 = (Q11 + Q22 - 4 * Q66) * s2 * c2 + Q12 * (s4 + c4);
  const q22 = Q11 * s4 + 2 * (Q12 + 2 * Q66) * s2 * c2 + Q22 * c4;
  const q16 = (Q11 - Q12 - 2 * Q66) * c2 * cs - (Q22 - Q12 - 2 * Q66) * s2 * cs;
  const q26 = (Q11 - Q12 - 2 * Q66) * s2 * cs - (Q22 - Q12 - 2 * Q66) * c2 * cs;
  const q66 = (Q11 + Q22 - 2 * Q12 - 2 * Q66) * s2 * c2 + Q66 * (s4 + c4);
  return [[q11, q12, q16], [q12, q22, q26], [q16, q26, q66]];
}
// 層の座標の熱膨張係数(x, y, γxy)
export const abar = (a1, a2, deg) => { const t = (deg * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t); return [a1 * c * c + a2 * s * s, a1 * s * s + a2 * c * c, 2 * (a1 - a2) * s * c]; };
// 応力・ひずみの座標変換(x-y → 1-2)。ひずみは工学せん断で
export const toLocalStress = ([sx, sy, txy], deg) => { const t = (deg * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t); return [sx * c * c + sy * s * s + 2 * txy * s * c, sx * s * s + sy * c * c - 2 * txy * s * c, -sx * s * c + sy * s * c + txy * (c * c - s * s)]; };
export const toLocalStrain = ([ex, ey, gxy], deg) => { const t = (deg * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t); return [ex * c * c + ey * s * s + gxy * s * c, ex * s * s + ey * c * c - gxy * s * c, -2 * ex * s * c + 2 * ey * s * c + gxy * (c * c - s * s)]; };

// 逆行列(ガウス・ジョルダン、部分ピボット)。特異なら null
export function inv(M) {
  const n = M.length, A = M.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  const scale = Math.max(...M.flat().map(Math.abs)) || 1;
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    if (Math.abs(A[p][c]) < 1e-14 * scale) return null;
    [A[c], A[p]] = [A[p], A[c]];
    const d = A[c][c];
    for (let j = 0; j < 2 * n; j++) A[c][j] /= d;
    for (let r = 0; r < n; r++) if (r !== c) { const f = A[r][c]; if (f) for (let j = 0; j < 2 * n; j++) A[r][j] -= f * A[c][j]; }
  }
  return A.map(r => r.slice(n));
}
const mv = (M, v) => M.map(r => r.reduce((s, x, j) => s + x * v[j], 0));

// 積層の並びを読む。例: [0/±45/90]s、[0/90]2s、[±45]s、[0₂/90]T、0,45,-45,90、[(0/90)2/±45]s
// ±θ は +θ, −θ の組、∓θ は −θ, +θ。数のあとの _n・下付き数字は繰り返し。] のあとの n は繰り返し、s は対称(鏡映)。
// 角度は −90° より大きく 90° 以下にそろえる。返り値 { angles } か { err }
const SUBD = { '₀': '0', '₁': '1', '₂': '2', '₃': '3', '₄': '4', '₅': '5', '₆': '6', '₇': '7', '₈': '8', '₉': '9', 'ₛ': 's' };
export function parseLayup(input, maxPlies = 400) {
  let s = String(input ?? '').replace(/[₀-₉]+/g, m => `_${[...m].map(c => SUBD[c]).join('')}`).replace(/ₛ/g, 's').replace(/\s+/g, '').replace(/[−–]/g, '-').replace(/\+-|\+\/-/g, '±').replace(/-\+/g, '∓');
  // / で区切った並びでは、後ろが1桁のコンマは小数点(22,5)とみる。それ以外のコンマは区切り
  if (s.includes('/')) s = s.replace(/(\d),(\d)(?!\d)/g, '$1.$2');
  s = s.replace(/[,;|]/g, '/');
  if (!s) return { err: 'empty' };
  if (!/^[[(]/.test(s)) s = `[${s}]`;
  let i = 0;
  const peek = () => s[i];
  const count = () => { let m = s.slice(i).match(/^_?(\d+)/); if (m) { i += m[0].length; return Number(m[1]); } return 1; };
  const norm = a => { let x = ((a % 180) + 180) % 180; if (x > 90) x -= 180; return Math.abs(x) < 1e-12 ? 0 : x; };
  function seq(close) {
    const out = [];
    for (;;) {
      if (i >= s.length) throw new Error('close');
      if (peek() === '[' || peek() === '(') {
        const open = peek(); i++;
        const inner = seq(open === '[' ? ']' : ')');
        out.push(...group(inner));
      } else {
        const m = s.slice(i).match(/^([±∓+-]?)(\d+(?:\.\d+)?)/);
        if (!m) throw new Error('token');
        i += m[0].length;
        const a = Number(m[2]), n = count();
        const unit = m[1] === '±' ? [a, -a] : m[1] === '∓' ? [-a, a] : [m[1] === '-' ? -a : a];
        for (let k = 0; k < n; k++) out.push(...unit);
      }
      if (peek() === '/') { i++; continue; }
      if (peek() === close) { i++; return out; }
      throw new Error('sep');
    }
  }
  function group(inner) {
    // 閉じかっこのあと: 繰り返しの数、s(対称)、T(全部の層を書いた)
    let res = inner;
    const n1 = count();
    res = Array.from({ length: n1 }, () => res).flat();
    if (/^[sS]/.test(s.slice(i))) {
      i++;
      const n2 = count();
      res = Array.from({ length: n2 }, () => res).flat(); // [..]s2 も [..]2s と同じに扱う
      res = [...res, ...[...res].reverse()];
    } else if (/^[tT]/.test(s.slice(i))) i++;
    if (res.length > maxPlies) throw new Error('many');
    return res;
  }
  try {
    i = 1;
    const first = s[0] === '[' ? ']' : ')';
    const inner = seq(first);
    const angles = group(inner);
    if (i < s.length) return { err: 'trail' };
    if (!angles.length) return { err: 'empty' };
    if (angles.length > maxPlies) return { err: 'many' };
    return { angles: angles.map(norm) };
  } catch (e) {
    return { err: e.message === 'many' ? 'many' : 'syntax' };
  }
}

// 積層板。plies: [{ th(度), t(mm), Q(MPa), a1, a2(10⁻⁶/K) }]。1枚目が z = −h/2(上の面)、下へ順に積む
// A N/mm、B N、D N·mm。Nt・Mt は ΔT = 1 K あたりの熱の合力(N/mm、N)
export function laminate(plies) {
  const h = plies.reduce((s, p) => s + p.t, 0);
  const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], B = A.map(r => [...r]), D = A.map(r => [...r]);
  const Nt = [0, 0, 0], Mt = [0, 0, 0];
  let z = -h / 2;
  const out = plies.map(p => {
    const z0 = z, z1 = z + p.t;
    const Qb = Qbar(p.Q, p.th), ab = abar(p.a1 ?? 0, p.a2 ?? 0, p.th).map(v => v * 1e-6);
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      A[i][j] += Qb[i][j] * (z1 - z0);
      B[i][j] += (Qb[i][j] * (z1 * z1 - z0 * z0)) / 2;
      D[i][j] += (Qb[i][j] * (z1 ** 3 - z0 ** 3)) / 3;
    }
    const qa = mv(Qb, ab);
    for (let i = 0; i < 3; i++) { Nt[i] += qa[i] * (z1 - z0); Mt[i] += (qa[i] * (z1 * z1 - z0 * z0)) / 2; }
    z = z1;
    return { ...p, z0, z1, Qb, ab };
  });
  const ABD = [0, 1, 2].map(i => [...A[i], ...B[i]]).concat([0, 1, 2].map(i => [...B[i], ...D[i]]));
  const F = inv(ABD), a = inv(A), d = inv(D);
  const res = { h, A, B, D, ABD, F, plies: out, Nt, Mt };
  if (F) {
    // 等価な弾性率(曲げが自由な積層板の面内: ABD の逆行列の左上 a*)と曲げの弾性率(d* = 右下)
    res.Ex = 1 / (h * F[0][0]); res.Ey = 1 / (h * F[1][1]); res.Gxy = 1 / (h * F[2][2]);
    res.nuxy = -F[0][1] / F[0][0]; res.nuyx = -F[0][1] / F[1][1];
    res.etaxs = F[0][2] / F[2][2]; // 面内のせん断と伸びの連成(参考)
    res.Efx = 12 / (h ** 3 * F[3][3]); res.Efy = 12 / (h ** 3 * F[4][4]); res.Gfxy = 12 / (h ** 3 * F[5][5]);
  }
  if (a) { res.ExA = 1 / (h * a[0][0]); res.EyA = 1 / (h * a[1][1]); res.GxyA = 1 / (h * a[2][2]); res.nuxyA = -a[0][1] / a[0][0]; }
  if (d) res.EfxD = 12 / (h ** 3 * d[0][0]);
  const big = Math.max(...A.flat().map(Math.abs)) || 1, bigB = big * h, bigD = big * h * h;
  res.symB = B.flat().every(v => Math.abs(v) <= 1e-9 * bigB);
  res.bal = Math.abs(A[0][2]) <= 1e-9 * big && Math.abs(A[1][2]) <= 1e-9 * big;
  res.d16 = Math.abs(D[0][2]) > 1e-9 * bigD || Math.abs(D[1][2]) > 1e-9 * bigD;
  return res;
}
// 層の角度に回した積層板の x 方向の弾性率 Ex(φ)(面内、ABD の逆行列から)
export function laminateEx(plies, phi) {
  const L = laminate(plies.map(p => ({ ...p, th: p.th - phi })));
  return L.Ex;
}
// 単層の E(θ): 1/Ex = cos⁴θ/E1 + (1/G12 − 2ν12/E1) sin²θ cos²θ + sin⁴θ/E2
export const lamE = (E1, E2, nu12, G12, deg) => { const t = (deg * Math.PI) / 180, c = Math.cos(t), s = Math.sin(t); return 1 / ((c ** 4) / E1 + (1 / G12 - (2 * nu12) / E1) * s * s * c * c + (s ** 4) / E2); };

// 荷重に対する応答。N N/mm、M N(N·mm/mm)、dT K。各層の上・中・下での x-y と 1-2 の応力・ひずみ
export function respond(L, N, M, dT = 0) {
  if (!L.F) return null;
  const load = [...N.map((v, i) => v + L.Nt[i] * dT), ...M.map((v, i) => v + L.Mt[i] * dT)];
  // 丸めの誤差で出る 0 に近い値(1e−20 など)は 0 にそろえる
  const snapV = (v, ref) => v.map(x => (Math.abs(x) <= 1e-11 * ref ? 0 : x));
  const solve = ld => { const e = mv(L.F, ld), ref = Math.max(...e.slice(0, 3).map(Math.abs), ...e.slice(3).map(x => Math.abs(x) * L.h)); return [snapV(e.slice(0, 3), ref), snapV(e.slice(3), ref / L.h)]; };
  const [e0, k] = solve(load);
  // 機械的な荷重だけの応答(強度比を求めるときに熱の応力と分ける)
  const [e0m, km] = solve([...N, ...M]);
  const at = (p, z, e0x, kx, withT) => {
    const eps = [0, 1, 2].map(i => e0x[i] + z * kx[i]);
    const mech = withT ? eps.map((v, i) => v - p.ab[i] * dT) : eps;
    const sig = mv(p.Qb, mech);
    return { z, eps, sig, s12: toLocalStress(sig, p.th), e12: toLocalStrain(eps, p.th) };
  };
  const plies = L.plies.map(p => {
    const pos = [p.z0, (p.z0 + p.z1) / 2, p.z1];
    return { th: p.th, z0: p.z0, z1: p.z1, tot: pos.map(z => at(p, z, e0, k, true)), mech: pos.map(z => at(p, z, e0m, km, false)) };
  });
  for (const kind of ['tot', 'mech']) {
    const pts = plies.flatMap(p => p[kind]);
    const rs = Math.max(...pts.flatMap(q => [...q.sig, ...q.s12].map(Math.abs))) || 1, re = Math.max(...pts.flatMap(q => [...q.eps, ...q.e12].map(Math.abs))) || 1;
    // 基準は最大値か、応力 100 MPa・ひずみ 1e−4 の大きいほう(熱だけで応力が理論上 0 になる一方向材などで 1e−14 MPa が残らないように)
    const rsA = Math.max(rs, 100), reA = Math.max(re, 1e-4);
    for (const q of pts) { q.sig = snapV(q.sig, rsA); q.s12 = snapV(q.s12, rsA); q.eps = snapV(q.eps, reA); q.e12 = snapV(q.e12, reA); }
  }
  return { e0, k, plies };
}

// ---- 破壊則(単層の 1-2 座標の応力 [σ1, σ2, τ12]、MPa)----
// 強度比 R: 熱の応力 st に機械的な応力 sm の R 倍を足したとき、破壊則がちょうど 1 になる R(R > 1 なら安全)
export const tsaiWuF = (L, f12 = -0.5) => {
  const F1 = 1 / L.X - 1 / L.Xc, F2 = 1 / L.Y - 1 / L.Yc, F11 = 1 / (L.X * L.Xc), F22 = 1 / (L.Y * L.Yc), F66 = 1 / (L.S * L.S);
  return { F1, F2, F11, F22, F66, F12: f12 * Math.sqrt(F11 * F22) };
};
export const twIndex = (s, C) => C.F1 * s[0] + C.F2 * s[1] + C.F11 * s[0] ** 2 + C.F22 * s[1] ** 2 + C.F66 * s[2] ** 2 + 2 * C.F12 * s[0] * s[1];
export const hillIndex = (s, L) => { const X = s[0] >= 0 ? L.X : L.Xc, Y = s[1] >= 0 ? L.Y : L.Yc; return (s[0] / X) ** 2 - (s[0] * s[1]) / (X * X) + (s[1] / Y) ** 2 + (s[2] / L.S) ** 2; };
export const maxIndex = (s, L) => {
  const r = [s[0] >= 0 ? s[0] / L.X : -s[0] / L.Xc, s[1] >= 0 ? s[1] / L.Y : -s[1] / L.Yc, Math.abs(s[2]) / L.S];
  const i = r.indexOf(Math.max(...r));
  return { v: r[i], mode: ['1' + (s[0] >= 0 ? 't' : 'c'), '2' + (s[1] >= 0 ? 't' : 'c'), '6'][i] };
};
export function srTsaiWu(st, sm, C) {
  const a = C.F11 * sm[0] ** 2 + C.F22 * sm[1] ** 2 + C.F66 * sm[2] ** 2 + 2 * C.F12 * sm[0] * sm[1];
  const b = C.F1 * sm[0] + C.F2 * sm[1] + 2 * (C.F11 * st[0] * sm[0] + C.F22 * st[1] * sm[1] + C.F66 * st[2] * sm[2] + C.F12 * (st[0] * sm[1] + st[1] * sm[0]));
  const c = twIndex(st, C) - 1;
  if (c >= 0) return 0;
  if (Math.abs(a) < 1e-300) return b > 0 ? -c / b : Infinity;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return Infinity;
  const r1 = (-b + Math.sqrt(disc)) / (2 * a), r2 = (-b - Math.sqrt(disc)) / (2 * a);
  const pos = [r1, r2].filter(r => r > 0);
  return pos.length ? Math.min(...pos) : Infinity;
}
export function srMax(st, sm, L) {
  // 成分ごとに st + R sm が強さ(引張は +、圧縮は −)に届く R の最小
  let best = Infinity, mode = null;
  const lim = [[L.X, -L.Xc], [L.Y, -L.Yc], [L.S, -L.S]];
  for (let i = 0; i < 3; i++) {
    const [hi, lo] = lim[i];
    if (st[i] >= hi || st[i] <= lo) return { r: 0, mode: ['1' + (st[i] > 0 ? 't' : 'c'), '2' + (st[i] > 0 ? 't' : 'c'), '6'][i] };
    if (sm[i] > 0) { const r = (hi - st[i]) / sm[i]; if (r < best) { best = r; mode = i === 2 ? '6' : `${i + 1}t`; } }
    else if (sm[i] < 0) { const r = (lo - st[i]) / sm[i]; if (r < best) { best = r; mode = i === 2 ? '6' : `${i + 1}c`; } }
  }
  return { r: best, mode };
}
export function srHill(st, sm, L) {
  // 符号で強さが変わるので数値で解く: 0 から対数の刻みで 1 を越える最初の区間を探し、二分法で詰める
  const f = R => hillIndex(st.map((v, i) => v + R * sm[i]), L) - 1;
  if (f(0) >= 0) return 0;
  if (sm.every(v => v === 0)) return Infinity;
  let lo = 0, hi = null;
  for (let e = -6; e <= 12; e += 0.05) { const R = 10 ** e; if (f(R) >= 0) { hi = R; break; } lo = R; }
  if (hi == null) return Infinity;
  for (let k = 0; k < 100; k++) { const m = (lo + hi) / 2; if (f(m) >= 0) hi = m; else lo = m; }
  return (lo + hi) / 2;
}
// 各層の強度比(層の上と下の面のうち小さいほう)。lam は単層の性質(強さ)、crit は使う破壊則
export function plyStrength(resp, lam, f12 = -0.5) {
  const C = tsaiWuF(lam, f12);
  return resp.plies.map(p => {
    const rows = [0, 2].map(j => {
      const st = p.tot[j].s12.map((v, i) => v - p.mech[j].s12[i]);
      const sm = p.mech[j].s12;
      const mx = srMax(st, sm, lam);
      return { j, max: mx.r, mode: mx.mode, hill: srHill(st, sm, lam), wu: srTsaiWu(st, sm, C), fiMax: maxIndex(p.tot[j].s12, lam).v, fiHill: hillIndex(p.tot[j].s12, lam), fiWu: twIndex(p.tot[j].s12, C) };
    });
    const pick = k => rows.reduce((a, b) => (b[k] < a[k] ? b : a));
    const m = pick('max');
    return { max: m.max, mode: m.mode, maxAt: m.j, hill: pick('hill').hill, wu: pick('wu').wu, fiMax: Math.max(rows[0].fiMax, rows[1].fiMax), fiHill: Math.max(rows[0].fiHill, rows[1].fiHill), fiWu: Math.max(rows[0].fiWu, rows[1].fiWu) };
  });
}

// 層を順に外していく最終破壊の目安(機械的な荷重だけ、比例して増やす)。壊れた層は、母材の破壊(2 方向・せん断)なら E2・G12・ν12 を、
// 繊維の破壊なら全部の剛性をほぼ 0(元の 1e-6)にする。crit: 'max' | 'hill' | 'wu'。返り値は壊れた順の [{ R, plies, mode }]
// dT を渡すと、熱応力をそのままにして機械的な荷重だけを R 倍する(各層の強度比と同じ考え方。剛性を落とした層では熱応力も下がる)
export function progressive(lam, angles, t, N, M, crit = 'wu', f12 = -0.5, dT = 0) {
  const state = angles.map(() => 0); // 0 健全、1 母材が壊れた、2 繊維が壊れた
  const events = [];
  const tiny = 1e-6;
  let norm0 = 0;
  for (let iter = 0; iter < angles.length * 2 + 2; iter++) {
    const plies = angles.map((th, k) => {
      const s = state[k];
      const E1 = lam.E1 * 1000 * (s === 2 ? tiny : 1), E2 = lam.E2 * 1000 * (s >= 1 ? tiny : 1), G12 = lam.G12 * 1000 * (s >= 1 ? tiny : 1), nu = s >= 1 ? lam.nu * tiny : lam.nu;
      return { th, t, Q: Qmat(E1, E2, nu, G12), a1: dT && Number.isFinite(lam.a1) ? lam.a1 : 0, a2: dT && Number.isFinite(lam.a2) ? lam.a2 : 0 };
    });
    const L = laminate(plies);
    if (!L.F) break;
    const r = respond(L, N, M, dT);
    // 壊れた層を外したあと、同じ荷重でのひずみが健全なときの 1000 倍を超えたら、もう荷重を持てない(崩壊)とみなして終わる(機械的な荷重のひずみで見る)
    const rm = dT ? respond(L, N, M, 0) : r;
    const norm = Math.hypot(...rm.e0, ...rm.k.map(v => v * L.h));
    if (iter === 0) norm0 = norm;
    else if (!(norm < norm0 * 1e3)) { if (events.length) events[events.length - 1].collapse = true; break; }
    const C = tsaiWuF(lam, f12);
    let best = Infinity, who = [];
    r.plies.forEach((p, k) => {
      if (state[k] === 2) return;
      for (const j of [0, 2]) {
        const s = p.mech[j].s12, st = p.tot[j].s12.map((v, i) => v - s[i]);
        // 母材が壊れた層は繊維方向だけを見る
        const R = state[k] === 1 ? srMax([st[0], 0, 0], [s[0], 0, 0], lam).r : crit === 'max' ? srMax(st, s, lam).r : crit === 'hill' ? srHill(st, s, lam) : srTsaiWu(st, s, C);
        if (R < best * (1 - 1e-9)) { best = R; who = [{ k, s, st }]; } else if (Math.abs(R - best) <= best * 1e-9) who.push({ k, s, st });
      }
    });
    if (!Number.isFinite(best)) break;
    const prevR = events.length ? events[events.length - 1].R : 0;
    const R = Math.max(best, prevR); // 剛性を落としたあとは、前の荷重で壊れる層もある(その場合は同じ荷重で続けて壊れる)
    const hit = [...new Set(who.map(w => w.k))];
    let mode = null;
    for (const k of hit) {
      const w = who.find(x => x.k === k), mxm = maxIndex(w.st.map((v, i) => v + best * w.s[i]), lam).mode; // 壊れるときの応力(熱応力 + R × 機械的な応力)で壊れ方を決める
      const fibre = state[k] === 1 || mxm === '1t' || mxm === '1c';
      state[k] = fibre ? 2 : 1;
      mode = mode ?? (fibre ? 'fiber' : 'matrix');
    }
    events.push({ R, plies: hit, mode, failed: state.filter(x => x === 2).length });
    if (state.every(x => x === 2)) { events[events.length - 1].collapse = true; break; }
    // 繊維の壊れていない層が荷重の向きに持てなくなったら終わり(行列が特異になる)
  }
  return events;
}

// =====================================================================
// 短繊維
// =====================================================================
// 臨界繊維長 lc = σf d/(2τ)(d µm、τ MPa → mm)
export const critLen = (sf, dUm, tau) => (sf * dUm * 1e-3) / (2 * tau);
// Cox のシアラグ: ηl = 1 − tanh(βl/2)/(βl/2)、β = √(2Gm/(Ef r² ln(R/r)))。
// ln(R/r): cyl は Vf = (r/R)²(Hull & Clyne の形)、hex は 六方の並び π/(2√3)·(r/R)²、sq は 正方の並び (π/4)(r/R)² …のときの R
export const lnRr = (vf, pack) => (pack === 'hex' ? 0.5 * Math.log(Math.PI / (2 * Math.sqrt(3) * vf)) : pack === 'sq' ? 0.5 * Math.log(Math.PI / (4 * vf)) : 0.5 * Math.log(1 / vf));
export function coxEta(Ef, Gm, dUm, lmm, vf, pack) {
  const r = (dUm * 1e-3) / 2, lr = lnRr(vf, pack);
  if (!(lr > 0)) return { beta: NaN, eta: NaN, lr };
  const beta = Math.sqrt((2 * Gm) / (Ef * r * r * lr)); // 1/mm
  const x = (beta * lmm) / 2;
  return { beta, lr, x, eta: x > 0 ? 1 - Math.tanh(x) / x : 0 };
}
// Kelly–Tyson: l ≥ lc なら σ = Vf σf (1 − lc/(2l)) + Vm σm'、l < lc なら σ = Vf τ l/d + Vm σm'(繊維がそろった短繊維材)
export const kellyTyson = (sf, tau, dUm, lmm, lc, vf, vm, smp) => (lmm >= lc ? vf * sf * (1 - lc / (2 * lmm)) + vm * smp : vf * tau * (lmm / (dUm * 1e-3)) + vm * smp);
export const ktEff = (lmm, lc) => (lmm >= lc ? 1 - lc / (2 * lmm) : lmm / (2 * lc));
// Krenchel の配向の効率 η0 = Σ an cos⁴θn
export const KRENCHEL = { al: 1, bi: 0.5, pm45: 0.25, r2: 3 / 8, r3: 1 / 5 };

// =====================================================================
// 画面
// =====================================================================
const form = document.getElementById('comp-form');
if (form) ui();

function ui() {
  const T = JSON.parse(form.dataset.text || '{}');
  const el = form.elements;
  const box = document.querySelector('[data-out="main"]');
  const home = document.documentElement.dataset.home ?? '/';
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const fmt = (s, o = {}) => String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (k in o ? o[k] : m));
  const optText = (name, v) => [...el[name].options].find(o => o.value === v)?.textContent ?? v;
  const lab = n => el[n]?.closest('label');
  // 入力の数(空欄・数でないときは NaN。既定値に戻さない: データ集にない値を空欄で示すため)
  const raw = k => { const s = String(el[k].value).trim(); return s === '' ? NaN : Number(s); };
  const val = (k, min = -Infinity) => { const v = raw(k); return Number.isFinite(v) && v >= min ? v : NaN; };
  const valD = (k, min = -Infinity) => { const v = val(k, min); return Number.isFinite(v) ? v : Number(el[k].defaultValue); };
  const n4 = (v, d = 4) => num(v, d);
  const pct = (v, d = 3) => `${num(v * 100, d)} %`;
  const csvNum = v => (typeof v === 'number' ? (Number.isFinite(v) ? Number(v.toPrecision(6)).toString() : '') : `"${String(v ?? '').replace(/"/g, '""')}"`);
  const fin = v => Number.isFinite(v);

  // ---- 見た目(このツールだけの小さな CSS) ----
  const css = document.createElement('style');
  css.textContent = `
#comp-form .dy-field[hidden], #comp-form .cm-sub[hidden], #comp-form .cm-note[hidden] { display: none !important; }
#comp-form .cm-wide { grid-column: 1 / -1; }
#comp-form .cm-wide2 { grid-column: span 2; }
#comp-form .dy-field.cm-asm input { border-color: var(--accent); border-style: dashed; }
#comp-form input[name="laytext"] { font-family: ui-monospace, Menlo, Consolas, monospace; }
.cm-tabs { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 6px; margin: 0; }
.cm-tabs button { font: inherit; font-size: .88rem; font-weight: 600; padding: 8px 12px; border-radius: 999px; border: 1px solid var(--border); background: var(--bg); color: var(--text); cursor: pointer; min-height: 40px; }
.cm-tabs button[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); color: var(--surface); }
.cm-sub { grid-column: 1 / -1; margin: 6px 0 -4px; font-size: .85rem; font-weight: 700; color: var(--text); border-top: 1px solid var(--border); padding-top: 10px; }
.cm-note { grid-column: 1 / -1; margin: 0; font-size: .84rem; color: var(--muted); line-height: 1.6; }
.cm-root { --cm-1: #2a78d6; --cm-2: #eb6834; --cm-3: #1baf7a; --cm-4: #eda100; --cm-5: #e87ba4; --cm-6: #008300; --cm-7: #6250d6; --cm-8: #e34948; }
@media (prefers-color-scheme: dark) { .cm-root { --cm-1: #3987e5; --cm-2: #d95926; --cm-3: #199e70; --cm-4: #c98500; --cm-5: #d55181; --cm-6: #2f9a2f; --cm-7: #9085e9; --cm-8: #e66767; } }
.cm-root h3 { margin: 18px 0 8px; font-size: 1.02rem; }
.cm-root .fig { padding: 8px; }
.cm-root .fig svg { max-width: 640px; touch-action: pan-y; }
.cm-root .fig svg.cm-polar { max-width: 420px; }
.cm-root .fig svg text { font-size: 13px; }
.cm-root .dy-stats { grid-template-columns: repeat(auto-fit, minmax(135px, 1fr)); gap: 8px; }
.cm-root .dy-stats dd { font-size: 1.1rem; overflow-wrap: anywhere; }
.cm-root .dy-stats dd small { font-size: .78rem; font-weight: 600; color: var(--muted); }
.cm-warn { margin: 8px 0; padding: 8px 12px; border-radius: 8px; font-size: .88rem; line-height: 1.6; background: var(--ng-bg); color: var(--text); border-left: 4px solid var(--ng); }
.cm-warn.soft { background: var(--accent-soft); border-left-color: var(--accent); }
.cm-ok { color: var(--ok); font-weight: 700; }
.cm-ng { color: var(--ng); font-weight: 700; }
.cm-legend { display: flex; flex-wrap: wrap; justify-content: center; gap: 4px 14px; margin: 6px 0 0; font-size: .82rem; color: var(--text); }
.cm-legend span { display: inline-flex; align-items: center; gap: 5px; }
.cm-legend svg { width: 26px; height: 10px; display: inline-block; margin: 0; }
.cm-read { margin: 6px 0 0; font-size: .82rem; color: var(--muted); text-align: center; min-height: 1.4em; font-variant-numeric: tabular-nums; }
.cm-steps { margin: 6px 0 0; padding-left: 1.3em; font-size: .88rem; line-height: 1.7; }
.cm-steps li { margin: 4px 0; }
.cm-steps code { display: block; white-space: pre-wrap; overflow-wrap: anywhere; font-size: .86rem; background: var(--bg); padding: 4px 8px; border-radius: 6px; color: var(--text); }
.cm-root .table-wrap { margin: .5rem 0; }
.cm-root .dy-table { font-size: .84rem; }
.cm-root .dy-table td, .cm-root .dy-table th { white-space: nowrap; }
.cm-root .dy-table td.l, .cm-root .dy-table th.l { text-align: left; white-space: normal; }
.cm-root .dy-table th.l { min-width: 4.5em; }
.cm-root .dy-table thead th { white-space: nowrap; }
.cm-root .dy-table.cm-wh tbody th.l { min-width: 10em; }
.cm-root .dy-table td.l { min-width: 16em; }
.cm-root .dy-table tr.cur { background: var(--accent-soft); }
.cm-btns { display: flex; flex-wrap: wrap; gap: 8px; margin: 6px 0; }
.cm-links { display: flex; flex-wrap: wrap; gap: 8px; margin: 10px 0 0; }
.cm-src { font-size: .8rem; color: var(--muted); margin: 4px 0 0; line-height: 1.5; }
.cm-plies { font-family: ui-monospace, Menlo, Consolas, monospace; font-size: .84rem; overflow-wrap: anywhere; color: var(--muted); margin: 4px 0; }
.cm-flags { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0; }
.cm-flags span { font-size: .82rem; padding: 3px 10px; border-radius: 999px; border: 1px solid var(--border); background: var(--bg); }
.cm-flags span.y { border-color: var(--ok); color: var(--ok); }
.cm-flags span.n { border-color: var(--ng); color: var(--ng); }
`;
  document.head.append(css);
  box.classList.add('cm-root');

  // ---- フォームの整え: タブ、副見出し、モードごとに見せる欄 ----
  const modeSel = el.mode;
  const modes = [...modeSel.options].map(o => o.value);
  lab('mode').hidden = true;
  const tabs = document.createElement('div');
  tabs.className = 'cm-tabs';
  tabs.setAttribute('role', 'group');
  tabs.setAttribute('aria-label', lab('mode').querySelector('span').textContent);
  tabs.innerHTML = modes.map(m => `<button type="button" data-mode="${m}" aria-pressed="false">${esc(optText('mode', m))}</button>`).join('');
  form.querySelector('h2').after(tabs);
  const subs = {};
  for (const [before, key] of [['fib', 'sub_fm'], ['ef1', 'sub_fp'], ['em', 'sub_mp'], ['xie', 'sub_ht'], ['lam', 'sub_lam'], ['lay', 'sub_lay'], ['nx', 'sub_load'], ['l', 'sub_sf'], ['case', 'sub_cmp']]) {
    const p = document.createElement('p');
    p.className = 'cm-sub';
    lab(before).before(p);
    subs[key] = p;
  }
  const notes = {};
  for (const [after, key] of [['lam', 'note_micro'], ['laytext', 'note_lay']]) {
    const p = document.createElement('p');
    p.className = 'cm-note';
    lab(after).after(p);
    notes[key] = p;
  }
  for (const n of ['fib', 'mat', 'lam', 'laytext']) lab(n).classList.add('cm-wide');
  for (const n of ['lay', 'basis', 'uplot', 'crit', 'orient', 'case', 'cmpcf', 'cmpgf']) lab(n).classList.add('cm-wide2');
  const UDF = ['sub_fm', 'fib', 'mat', 'basis', 'f', 'vv', 'sub_fp', 'ef1', 'ef2', 'gf', 'nuf', 'af1', 'af2', 'rf', 'sf', 'df', 'sub_mp', 'em', 'num', 'am', 'rm', 'sm', 'eum'];
  const VIS = {
    ud: [...UDF, 'sub_ht', 'xie', 'xig', 'uplot'],
    lam: ['sub_lam', 'lam', 'note_micro', 'le1', 'le2', 'lg12', 'lnu', 'la1', 'la2', 'lxt', 'lxc', 'lyt', 'lyc', 'ls', 'lrho', 't', 'sub_lay', 'lay', 'laytext', 'note_lay', 'sub_load', 'nx', 'ny', 'nxy', 'mx', 'my', 'mxy', 'dt', 'crit', 'f12'],
    short: ['sub_fm', 'fib', 'mat', 'basis', 'f', 'vv', 'sub_fp', 'ef1', 'sf', 'df', 'sub_mp', 'em', 'num', 'sm', 'eum', 'sub_sf', 'l', 'tau', 'orient', 'pack'],
    cmp: ['sub_cmp', 'case', 'ts', 'cmpcf', 'cmpgf'],
  };
  const visible = () => {
    const mode = modeSel.value;
    const show = new Set(VIS[mode]);
    if (mode === 'lam' && el.lam.value !== 'micro') show.delete('note_micro');
    for (const f of el) if (f.name && f.name !== 'mode') lab(f.name).hidden = !show.has(f.name);
    for (const k in subs) { subs[k].hidden = !show.has(k); subs[k].textContent = T[k] ?? ''; }
    for (const k in notes) { notes[k].hidden = !show.has(k); notes[k].textContent = T[k] ?? ''; }
    tabs.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
  };
  tabs.addEventListener('click', e => {
    const b = e.target.closest('button[data-mode]');
    if (!b || b.dataset.mode === modeSel.value) return;
    setMode(b.dataset.mode);
  });
  const setMode = m => {
    modeSel.value = m;
    form.dispatchEvent(new Event('change', { bubbles: true }));
    form.dispatchEvent(new Event('input', { bubbles: true }));
  };

  // ---- データ集の選択と入力欄を合わせる ----
  const near = (a, b) => (fin(a) && fin(b) ? Math.abs(a - b) <= Math.abs(b) * 1e-6 + 1e-12 : !fin(a) && b == null);
  const setNum = (name, v) => { el[name].value = v == null || !fin(v) ? '' : String(Number(v.toPrecision(6))); };
  const FMAP = { ef1: 'E1', ef2: 'E2', gf: 'G12', nuf: 'nu', af1: 'a1', af2: 'a2', rf: 'rho', sf: 's', df: 'd' };
  const MMAP = { em: 'E', num: 'nu', am: 'a', rm: 'rho', sm: 's', eum: 'eu' };
  const LMAP = { le1: 'E1', le2: 'E2', lg12: 'G12', lnu: 'nu', la1: 'a1', la2: 'a2', lxt: 'X', lxc: 'Xc', lyt: 'Y', lyc: 'Yc', ls: 'S', lrho: 'rho', t: 't' };
  const fillFrom = (map, o) => { for (const [n, k] of Object.entries(map)) setNum(n, o[k]); };
  const matches = (map, o) => Object.entries(map).every(([n, k]) => near(raw(n), o[k]));
  // データ集の値のうち、出典がなく仮定した値の欄に印をつける
  const markAsm = () => {
    const f = fibById(el.fib.value), m = matById(el.mat.value);
    for (const [n, k] of Object.entries(FMAP)) lab(n).classList.toggle('cm-asm', !!f && f.asm.includes(k));
    for (const [n, k] of Object.entries(MMAP)) lab(n).classList.toggle('cm-asm', !!m && m.asm.includes(k));
  };
  const syncSel = () => {
    const f = fibById(el.fib.value);
    if (f && !matches(FMAP, f)) el.fib.value = 'custom';
    const m = matById(el.mat.value);
    if (m && !matches(MMAP, m)) el.mat.value = 'custom';
    const l = lamById(el.lam.value);
    if (l && !matches(LMAP, l)) el.lam.value = 'custom';
    const p = LAYUPS[el.lay.value];
    if (p && el.laytext.value.trim() !== p) el.lay.value = 'custom';
    markAsm();
  };

  // 積層の並びの文字は URL のハッシュ(#lay=…)に残す(共通の共有の部品は数と選択肢だけを扱うため)
  try {
    const m = location.hash.match(/(?:^#|&)lay=([^&]*)/);
    if (m) { el.laytext.value = decodeURIComponent(m[1]); }
    else if (LAYUPS[el.lay.value]) el.laytext.value = LAYUPS[el.lay.value];
  } catch { /* 読めなければ既定のまま */ }
  const saveHash = () => {
    const p = LAYUPS[el.lay.value], t = el.laytext.value.trim();
    const h = el.lay.value !== 'custom' && t === p ? '' : `#lay=${encodeURIComponent(t)}`;
    try { history.replaceState(history.state, '', location.pathname + location.search + h); } catch { /* 変えられなくても計算は続ける */ }
  };
  // 共有の URL で空欄だった数の欄は空欄に戻す(共通の部品は空の値を読み飛ばすので、データ集にない値が既定値で埋まり、
  // 選んだ繊維・母材が「自分で入れた値」に変わってしまうため)。共通の部品が先に URL を書き換えているので、開いたときの URL を読む
  let blanked = false;
  try {
    const first = new URL(performance.getEntriesByType('navigation')[0]?.name || location.href);
    if (first.pathname === location.pathname) for (const [k, v] of first.searchParams) if (v.trim() === '' && el[k]?.type === 'number' && el[k].value !== '') { el[k].value = ''; blanked = true; }
  } catch { /* 読めなければそのまま */ }
  syncSel();
  form.addEventListener('input', e => {
    const n = e.target.name;
    if (n === 'fib') { const f = fibById(el.fib.value); if (f) fillFrom(FMAP, f); }
    else if (n === 'mat') { const m = matById(el.mat.value); if (m) fillFrom(MMAP, m); }
    else if (n === 'lam') { const l = lamById(el.lam.value); if (l) fillFrom(LMAP, l); else if (el.lam.value === 'micro') fillMicro(); }
    else if (n === 'lay') { const p = LAYUPS[el.lay.value]; if (p) el.laytext.value = p; }
    else if (n in FMAP || n in MMAP || n in LMAP || n === 'laytext') { const keep = el.lam.value; syncSel(); if (n in LMAP && keep === 'micro') el.lam.value = 'custom'; }
    if (n === 'fib' || n === 'mat') markAsm();
    if (n === 'lay' || n === 'laytext') saveHash();
  }, true);

  // ---- 共通の値 ----
  const fiber = () => ({ E1: val('ef1', 1e-9), E2: val('ef2', 1e-9), G12: val('gf', 1e-9), nu: val('nuf', -1), a1: val('af1'), a2: val('af2'), rho: val('rf', 1e-9), s: val('sf', 1e-9), d: val('df', 1e-9) });
  const matrix = () => ({ E: val('em', 1e-9), nu: val('num', -1), a: val('am'), rho: val('rm', 1e-9), s: val('sm', 1e-9), eu: val('eum', 1e-9) });
  const fracs = (fb, mt) => fractions({ basis: el.basis.value, f: Math.min(Math.max(valD('f', 0), 0), 100) / 100, vv: Math.min(Math.max(valD('vv', 0), 0), 50) / 100, rf: fb.rho, rm: mt.rho });
  const xiE = () => valD('xie', 0), xiG = () => valD('xig', 0);
  const microNow = () => { const fb = fiber(), mt = matrix(), fr = fracs(fb, mt); return { fb, mt, fr, r: micro(fb, mt, fr, xiE(), xiG()) }; };
  // 一方向材のタブの結果を単層の欄に入れる(強さは繊維方向の引張だけ。ほかの強さはミクロ力学では出せないので今の値のまま)
  function fillMicro() {
    const { fr, r } = microNow();
    setNum('le1', r.E1); setNum('le2', r.E2h); setNum('lg12', r.G12h); setNum('lnu', r.nu12); setNum('la1', r.a1); setNum('la2', r.a2); setNum('lxt', r.X); setNum('lrho', fr.rho);
  }
  const lamina = () => ({ E1: val('le1', 1e-9), E2: val('le2', 1e-9), G12: val('lg12', 1e-9), nu: val('lnu', -1), a1: val('la1'), a2: val('la2'), X: val('lxt', 1e-9), Xc: val('lxc', 1e-9), Y: val('lyt', 1e-9), Yc: val('lyc', 1e-9), S: val('ls', 1e-9), rho: val('lrho', 1e-9), t: valD('t', 1e-6) });

  // ---- 図(SVG)----
  const niceTicks = (a, b, n = 5) => {
    const span = b - a;
    if (!(span > 0)) return [a];
    const step0 = 10 ** Math.floor(Math.log10(span / n)), m = [1, 2, 2.5, 5, 10].find(k => span / (step0 * k) <= n + 0.5) * step0;
    const out = [];
    for (let v = Math.ceil(a / m - 1e-9) * m; v <= b + m * 1e-9; v += m) out.push(Number(v.toPrecision(12)));
    return out;
  };
  const narrow = () => box.clientWidth < 520;
  const sz = () => (narrow() ? { W: 360, H: 270, l: 60, r: 12, t: 12, b: 40 } : { W: 640, H: 360, l: 64, r: 16, t: 14, b: 46 });
  const color = s => (s === 'ac' ? 'var(--text)' : s === 'mu' ? 'var(--muted)' : `var(--cm-${s})`);
  // o: { xr, yr, xlog, xlabel, ylabel, xt, yt, lines [{pts, slot, dash, w}], dots [{x, y, slot, r, sq}], hl [{y, label}], vl [{x, label}] }
  function plot(svg, o) {
    const g = sz();
    const L = g.l, Rr = g.W - g.r, Tt = g.t, B = g.H - g.b;
    const [x0, x1] = o.xlog ? o.xr.map(Math.log10) : o.xr, [y0, y1] = o.yr;
    const X = v => L + (((o.xlog ? Math.log10(v) : v) - x0) / (x1 - x0)) * (Rr - L), Y = v => B - ((v - y0) / (y1 - y0)) * (B - Tt);
    const id = svg.dataset.clip ?? (svg.dataset.clip = `cmc${Math.random().toString(36).slice(2, 8)}`);
    const path = pts => {
      let d = '', pen = false;
      for (const [x, y] of pts) {
        if (!fin(x) || !fin(y) || (o.xlog && !(x > 0))) { pen = false; continue; }
        const cy = Math.max(Tt - 400, Math.min(B + 400, Y(y)));
        d += `${pen ? 'L' : 'M'}${X(x).toFixed(1)},${cy.toFixed(1)}`;
        pen = true;
      }
      return d;
    };
    const xt = o.xt ?? (o.xlog ? (() => { const out = []; for (let e = Math.ceil(x0 - 1e-9); e <= Math.floor(x1 + 1e-9); e++) out.push([10 ** e, num(10 ** e, 3)]); return out; })() : niceTicks(x0, x1, g.W < 400 ? 4 : 6).map(v => [v, num(v, 4)]));
    const yt = o.yt ?? niceTicks(y0, y1, 5).map(v => [v, num(v, 4)]);
    let s = `<defs><clipPath id="${id}"><rect x="${L}" y="${Tt}" width="${Rr - L}" height="${B - Tt}"/></clipPath></defs>`;
    s += `<rect x="${L}" y="${Tt}" width="${Rr - L}" height="${B - Tt}" fill="var(--bg)"/>`;
    // 両端の目盛りの文字は内側へ寄せる(左は縦軸の 0 と重ならないように、右は図の外へ出ないように)
    const anchor = v => (X(v) - L < 1 ? 'start' : Rr - X(v) < 1 ? 'end' : 'middle');
    s += xt.map(([v, t]) => `<line x1="${X(v)}" y1="${Tt}" x2="${X(v)}" y2="${B}" stroke="var(--border)"/><text x="${X(v)}" y="${B + 16}" fill="var(--muted)" text-anchor="${anchor(v)}">${esc(t)}</text>`).join('');
    s += yt.map(([v, t]) => `<line x1="${L}" y1="${Y(v)}" x2="${Rr}" y2="${Y(v)}" stroke="var(--border)"/><text x="${L - 5}" y="${Y(v) + 4}" fill="var(--muted)" text-anchor="end">${esc(t)}</text>`).join('');
    s += `<rect x="${L}" y="${Tt}" width="${Rr - L}" height="${B - Tt}" fill="none" stroke="var(--muted)" stroke-width="1"/>`;
    s += `<g clip-path="url(#${id})">`;
    for (const h of o.hl ?? []) s += `<line x1="${L}" x2="${Rr}" y1="${Y(h.y)}" y2="${Y(h.y)}" stroke="var(--muted)" stroke-dasharray="3 3"/>${h.label ? `<text x="${Rr - 4}" y="${Y(h.y) - 4}" fill="var(--muted)" text-anchor="end">${esc(h.label)}</text>` : ''}`;
    for (const v of o.vl ?? []) s += `<line y1="${Tt}" y2="${B}" x1="${X(v.x)}" x2="${X(v.x)}" stroke="${v.slot ? color(v.slot) : 'var(--muted)'}" stroke-dasharray="3 3"/>${v.label ? `<text x="${X(v.x) + (v.left ? -4 : 4)}" y="${Tt + 14 + (v.dy ?? 0)}" fill="var(--muted)"${v.left ? ' text-anchor="end"' : ''}>${esc(v.label)}</text>` : ''}`;
    for (const ln of o.lines ?? []) s += `<path d="${path(ln.pts)}" fill="none" stroke="${color(ln.slot)}" stroke-width="${ln.w ?? 2}"${ln.dash ? ` stroke-dasharray="${ln.dash}"` : ''} stroke-linejoin="round" stroke-linecap="round"/>`;
    for (const d of o.dots ?? []) { if (!fin(d.y) || !fin(d.x)) continue; s += d.sq ? `<rect x="${X(d.x) - 5}" y="${Y(d.y) - 5}" width="10" height="10" fill="${color(d.slot)}" stroke="var(--surface)" stroke-width="2"/>` : `<circle cx="${X(d.x)}" cy="${Y(d.y)}" r="${d.r ?? 4.5}" fill="${color(d.slot)}" stroke="var(--surface)" stroke-width="2"/>`; }
    s += `<line data-cm="cross" x1="0" x2="0" y1="${Tt}" y2="${B}" stroke="var(--text)" stroke-width="1" visibility="hidden"/>`;
    s += '</g>';
    s += `<text x="${(L + Rr) / 2}" y="${g.H - 6}" fill="var(--text)" text-anchor="middle">${esc(o.xlabel)}</text>`;
    s += `<text x="13" y="${(Tt + B) / 2}" fill="var(--text)" text-anchor="middle" transform="rotate(-90 13 ${(Tt + B) / 2})">${esc(o.ylabel)}</text>`;
    svg.setAttribute('viewBox', `0 0 ${g.W} ${g.H}`);
    svg.innerHTML = s;
    return { X, Y, inv: px => { const t = x0 + ((px - L) / (Rr - L)) * (x1 - x0); return o.xlog ? 10 ** t : t; }, L, Rr };
  }
  const legend = items => items.map(it => `<span><svg viewBox="0 0 26 10" aria-hidden="true">${it.dot ? `<circle cx="13" cy="5" r="4" fill="${color(it.slot)}"/>` : it.sq ? `<rect x="9" y="1" width="8" height="8" fill="${color(it.slot)}"/>` : `<line x1="1" y1="5" x2="25" y2="5" stroke="${color(it.slot)}" stroke-width="${it.w ?? 2.5}"${it.dash ? ` stroke-dasharray="${it.dash}"` : ''}/>`}</svg>${esc(it.label)}</span>`).join('');
  // 図の上で指を動かす・カーソルを置くと、その位置の値を読む。縦のスクロールは止めない
  function hover(svg, geo, readOut, onX) {
    const cross = svg.querySelector('[data-cm="cross"]');
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
  // 極座標の図: series [{ f(θ度) → 値, slot, dash }]、rmax。0° を右(x 軸)、反時計回り
  function polar(svg, series, rmax, unit) {
    const W = narrow() ? 340 : 420, H = W, cx = W / 2, cy = H / 2, R = W / 2 - 34;
    const rings = niceTicks(0, rmax, 4).filter(v => v > 0);
    let s = `<rect x="0" y="0" width="${W}" height="${H}" fill="none"/>`;
    s += `<circle cx="${cx}" cy="${cy}" r="${R}" fill="var(--bg)" stroke="var(--muted)"/>`;
    for (const v of rings) s += `<circle cx="${cx}" cy="${cy}" r="${(v / rmax) * R}" fill="none" stroke="var(--border)"/>${(v / rmax) * R > R - 14 ? '' : `<text x="${cx + 3}" y="${cy - (v / rmax) * R - 3}" fill="var(--muted)" font-size="11">${esc(num(v, 3))}</text>`}`;
    for (let a = 0; a < 360; a += 30) {
      const t = (a * Math.PI) / 180, x = cx + R * Math.cos(t), y = cy - R * Math.sin(t);
      s += `<line x1="${cx}" y1="${cy}" x2="${x}" y2="${y}" stroke="var(--border)"/>`;
      const lx = cx + (R + 16) * Math.cos(t), ly = cy - (R + 16) * Math.sin(t) + 4;
      s += `<text x="${lx}" y="${ly}" fill="var(--muted)" text-anchor="middle" font-size="11">${a}°</text>`;
    }
    for (const se of series) {
      let d = '';
      for (let a = 0; a <= 360; a += 2) {
        const v = se.f(a), t = (a * Math.PI) / 180;
        if (!fin(v)) continue;
        const rr = (Math.min(v, rmax * 1.05) / rmax) * R;
        d += `${d ? 'L' : 'M'}${(cx + rr * Math.cos(t)).toFixed(1)},${(cy - rr * Math.sin(t)).toFixed(1)}`;
      }
      s += `<path d="${d}Z" fill="none" stroke="${color(se.slot)}" stroke-width="${se.w ?? 2.2}"${se.dash ? ` stroke-dasharray="${se.dash}"` : ''} stroke-linejoin="round"/>`;
    }
    s += `<text x="${W - 4}" y="${H - 4}" fill="var(--muted)" text-anchor="end" font-size="11">${esc(unit)}</text>`;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.innerHTML = s;
  }

  // ---- 表・コピー ----
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch { /* 古いブラウザ */ }
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.append(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* だめでも */ }
    ta.remove();
    return ok;
  }
  const flash = (btn, text) => { const old = btn.textContent; btn.textContent = text; setTimeout(() => { btn.textContent = old; }, 1600); };
  const tables = {};
  const tableHTML = (name, head, rows, opts = {}) => {
    tables[name] = { head, rows: rows.map(r => r.map(c => (c && typeof c === 'object' ? c.v : c))) };
    return `<div class="table-wrap"><table class="dy-table${opts.wh ? ' cm-wh' : ''}"><thead><tr>${head.map((h, i) => `<th scope="col"${i === 0 ? ' class="l"' : ''}>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r, ri) => `<tr${opts.cur?.includes?.(ri) || opts.cur === ri ? ' class="cur"' : ''}>${r.map((c, i) => {
      const t = c && typeof c === 'object' ? c.t : typeof c === 'number' ? n4(c) : c;
      return i === 0 && !opts.noRowHead ? `<th scope="row" class="l">${esc(t)}</th>` : `<td data-out="${name}-${ri}-${i}"${opts.left?.includes(i) ? ' class="l"' : ''}>${c && typeof c === 'object' && c.h ? c.h : esc(t)}</td>`;
    }).join('')}</tr>`).join('')}</tbody></table></div><div class="cm-btns"><button type="button" class="btn btn-ghost btn-small" data-csv="${name}">${esc(T.csv)}</button></div>`;
  };
  box.addEventListener('click', async e => {
    const b = e.target.closest('[data-csv]');
    if (b) {
      const t = tables[b.dataset.csv];
      if (!t) return;
      const csv = [t.head, ...t.rows].map(r => r.map(csvNum).join(',')).join('\n');
      if (await copyText(csv)) flash(b, T.copied);
      return;
    }
    const go = e.target.closest('[data-go]');
    if (go) {
      if (go.dataset.go === 'lam-micro') { setMode('lam'); el.lam.value = 'micro'; fillMicro(); syncSel(); el.lam.value = 'micro'; form.dispatchEvent(new Event('input', { bubbles: true })); }
      window.scrollTo({ top: form.getBoundingClientRect().top + window.scrollY - 10, behavior: 'smooth' });
    }
  });
  const stats = items => `<dl class="dy-stats">${items.filter(Boolean).map(([k, l, v]) => `<div><dt>${esc(l)}</dt><dd data-out="${k}">${v}</dd></div>`).join('')}</dl>`;
  let stepsOpen = false;
  box.addEventListener('toggle', e => { if (e.target.classList?.contains('cm-stepbox')) stepsOpen = e.target.open; }, true);
  const steps = items => `<details class="cm-stepbox"${stepsOpen ? ' open' : ''}><summary>${esc(T.steps)}</summary><ol class="cm-steps">${items.filter(Boolean).map(([l, f]) => `<li>${esc(l)}${f ? `<code>${esc(f)}</code>` : ''}</li>`).join('')}</ol></details>`;
  const warnHTML = list => list.map(w => `<p class="cm-warn${w.soft ? ' soft' : ''}" data-cm-warn>${esc(w.text)}</p>`).join('');
  const link = (path, text) => `<a class="btn btn-ghost btn-small" href="${home}${path}">${esc(text)} →</a>`;
  const srcLine = keys => `<p class="cm-src">${esc(T.source)}: ${[...new Set(keys.filter(Boolean))].map(k => esc(SRC[k])).join(' / ')}</p>`;
  const U = (v, u, d = 4) => (fin(v) ? `${n4(v, d)} <small>${esc(u)}</small>` : '–');
  const Ut = (v, u, d = 4) => (fin(v) ? `${n4(v, d)} ${u}` : '–');

  // =========== ud: 一方向材 ===========
  function renderUD() {
    const fb = fiber(), mt = matrix(), fr = fracs(fb, mt);
    const r = micro(fb, mt, fr, xiE(), xiG());
    const fsel = fibById(el.fib.value), msel = matById(el.mat.value);
    const warns = [];
    const asmF = fsel ? fsel.asm.map(k => T[`p_${k}`]) : [], asmM = msel ? msel.asm.map(k => T[`pm_${k}`]) : [];
    if (asmF.length) warns.push({ soft: true, text: fmt(T.w_asm_f, { list: asmF.join(T.sep), name: optText('fib', fsel.id) }) + (fsel.cls === 'cf' && fsel.id !== 't300' ? ` ${T.w_asm_cf}` : '') });
    if (fsel?.hm) warns.push({ soft: true, text: fmt(T.w_hm_tr, { name: optText('fib', fsel.id) }) });
    if (asmM.length) warns.push({ soft: true, text: fmt(T.w_asm_m, { list: asmM.join(T.sep), name: optText('mat', msel.id) }) + (msel.asm.includes('a') ? ` ${T[`w_asm_a_${msel.id}`] ?? ''}` : '') });
    const miss = [];
    for (const [n, k] of Object.entries(FMAP)) if (n !== 'df' && !fin(raw(n))) miss.push(T[`p_${k}`]);
    for (const [n, k] of Object.entries(MMAP)) if (n !== 'eum' && !fin(raw(n))) miss.push(T[`pm_${k}`]);
    if (miss.length) warns.push({ text: fmt(T.w_missing, { list: miss.join(T.sep) }) });
    if (fr.vf0 > Math.PI / (2 * Math.sqrt(3))) warns.push({ text: fmt(T.w_vf_hex, { v: pct(fr.vf0, 3) }) });
    else if (fr.vf0 > 0.7) warns.push({ soft: true, text: fmt(T.w_vf_hi, { v: pct(fr.vf0, 3) }) });
    if (fr.vv > 0) warns.push({ soft: true, text: fmt(T.w_void, { v: pct(fr.vv, 3), e2: n4(r.E2h * (1 - 1.5 * fr.vv), 3), d: num(1.5 * fr.vv * 100, 3) }) });
    if (msel?.cls === 'mt' || (!msel && mt.E > 20)) warns.push({ soft: true, text: T.w_metal });
    let html = warnHTML(warns);
    html += `<h3>${esc(T.h_frac)}</h3>` + stats([
      ['vf', T.o_vf, pct(fr.vf, 4)], ['vm', T.o_vm, pct(fr.vm, 4)], ['wf', T.o_wf, pct(fr.wf, 4)], ['rho', T.o_rho, U(fr.rho, 'g/cm³')],
      fr.vv > 0 ? ['vf0', T.o_vf0, pct(fr.vf0, 4)] : null,
    ]);
    html += `<h3>${esc(T.h_stiff)}</h3>` + stats([
      ['e1', T.o_e1, U(r.E1, 'GPa')], ['e2r', T.o_e2r, U(r.E2r, 'GPa')], ['e2h', fmt(T.o_e2h, { xi: num(xiE(), 3) }), U(r.E2h, 'GPa')],
      ['g12r', T.o_g12r, U(r.G12r, 'GPa')], ['g12h', fmt(T.o_g12h, { xi: num(xiG(), 3) }), U(r.G12h, 'GPa')],
      ['nu12', 'ν12', n4(r.nu12, 3)], ['nu21', 'ν21', n4(r.nu21, 3)], ['ratio', 'E1/E2', n4(r.E1 / r.E2h, 3)], ['share', T.o_share, pct(r.share, 3)],
      ['s1', T.o_spec, U(r.E1 / fr.rho, T.u_spec)],
    ]);
    html += `<h3>${esc(T.h_cte)}</h3>` + stats([['a1', 'α1', U(r.a1, '10⁻⁶/K', 3)], ['a2', 'α2', U(r.a2, '10⁻⁶/K', 3)]]);
    html += `<h3>${esc(T.h_str)}</h3>` + stats([
      ['efs', T.o_efs, fin(r.ef) ? pct(r.ef, 3) : '–'], ['ems', T.o_ems, fin(r.em) ? pct(r.em, 3) : '–'],
      r.case === 'fiber' ? ['smp', T.o_smp, U(r.smp, 'MPa')] : ['sfm', T.o_sfm, U(r.sfm, 'MPa')],
      ['x', T.o_x, U(r.X, 'MPa')], ['xs', T.o_xs, U(r.X / fr.rho, T.u_sspec)],
      r.case === 'fiber' ? ['vmin', T.o_vmin, fin(r.vmin) ? pct(Math.max(r.vmin, 0), 3) : '–'] : ['vtr', T.o_vtr, fin(r.vtr) ? pct(r.vtr, 3) : '–'],
      r.case === 'fiber' ? ['vcrit', T.o_vcrit, fin(r.vcrit) ? pct(Math.max(r.vcrit, 0), 3) : '–'] : null,
    ]);
    html += `<p class="muted" style="font-size:.85rem">${esc(r.case === 'fiber' ? T.str_fiber : T.str_matrix)} ${esc(T.str_note)}</p>`;
    // 図
    html += `<h3>${esc(fmt(T.h_plot, { q: optText('uplot', el.uplot.value) }))}</h3><div class="fig"><svg data-cm="ud" role="img" aria-label="${esc(T.h_plot_aria)}"></svg><p class="cm-legend" data-cm="lg"></p><p class="cm-read" data-cm="read"></p></div>`;
    // メーカーの実測との比較
    if (fsel?.ms && el.fib.value === fsel.id) {
      const f60 = fractions({ basis: 'vol', f: 0.6, vv: 0, rf: fb.rho, rm: mt.rho }), r60 = micro(fb, mt, f60, xiE(), xiG());
      const ms = fsel.ms;
      html += `<h3>${esc(fmt(T.h_ms, { f: optText('fib', fsel.id), r: ms.resin }))}</h3>`;
      html += tableHTML('ms', [T.c_prop, T.c_pred, T.c_meas, T.c_ratio], [
        [T.o_e1 + ' (GPa)', r60.E1, ms.E1, r60.E1 / ms.E1],
        [T.o_x + ' (MPa)', r60.X, ms.X, r60.X / ms.X],
        [T.c_y90 + ' (MPa)', { t: '–', v: '' }, ms.Y, { t: '–', v: '' }],
        [T.c_xc + ' (MPa)', { t: '–', v: '' }, ms.Xc, { t: '–', v: '' }],
        [T.c_ips + ' (MPa)', { t: '–', v: '' }, ms.S, { t: '–', v: '' }],
      ], { wh: true });
      html += `<p class="muted" style="font-size:.85rem">${esc(fmt(T.ms_note, { m: el.mat.value === 'custom' ? T.custom : optText('mat', el.mat.value) }))}</p>`;
    }
    // 同じ母材・体積率で、データ集の繊維を並べる
    {
      const rows = [], ids = [];
      for (const f of FIB) {
        const fx = { ...f }, ok = [fx.E1, fx.rho].every(fin);
        if (!ok) continue;
        const frx = fractions({ basis: el.basis.value, f: Math.min(Math.max(valD('f', 0), 0), 100) / 100, vv: Math.min(Math.max(valD('vv', 0), 0), 50) / 100, rf: f.rho, rm: mt.rho });
        const rx = micro({ ...f, E2: f.E2 ?? NaN, G12: f.G12 ?? NaN, nu: f.nu ?? NaN, a1: f.a1 ?? NaN, a2: f.a2 ?? NaN }, mt, frx, xiE(), xiG());
        ids.push(f.id);
        rows.push([optText('fib', f.id), { t: pct(frx.vf, 3), v: frx.vf * 100 }, { t: n4(frx.rho, 3), v: frx.rho }, rx.E1, { t: fin(rx.E2h) ? n4(rx.E2h) : '–', v: rx.E2h }, { t: fin(rx.G12h) ? n4(rx.G12h) : '–', v: rx.G12h }, { t: fin(rx.X) ? n4(rx.X) : '–', v: rx.X }, rx.E1 / frx.rho, { t: fin(rx.a1) ? n4(rx.a1, 3) : '–', v: rx.a1 }]);
      }
      html += `<h3>${esc(fmt(T.h_fibs, { m: el.mat.value === 'custom' ? T.custom : optText('mat', el.mat.value), f: num(valD('f', 0), 4), b: optText('basis', el.basis.value) }))}</h3>`;
      html += tableHTML('fibs', [T.c_fiber, 'Vf', 'ρ (g/cm³)', 'E1 (GPa)', 'E2 HT (GPa)', 'G12 HT (GPa)', 'σ1u (MPa)', `E1/ρ (${T.u_spec})`, 'α1 (10⁻⁶/K)'], rows, { cur: ids.indexOf(el.fib.value), wh: true });
    }
    // 途中の式
    const { vf, vm, vf0 } = fr, vm0 = 1 - vf0;
    const Gm = r.Gm;
    const etaE = (fb.E2 / mt.E - 1) / (fb.E2 / mt.E + xiE()), etaG = (fb.G12 / Gm - 1) / (fb.G12 / Gm + xiG());
    html += steps([
      el.basis.value === 'mass' ? [T.s_w2v, `Vf = (Wf/ρf) / (Wf/ρf + Wm/ρm) × (1 − Vv) = (${n4(fr.wf, 4)}/${n4(fb.rho)}) / (${n4(fr.wf, 4)}/${n4(fb.rho)} + ${n4(fr.wm, 4)}/${n4(mt.rho)}) × (1 − ${n4(fr.vv, 3)}) = ${n4(vf, 4)}`] : [T.s_v2w, `Wf = Vf ρf / ρ = ${n4(vf, 4)} × ${n4(fb.rho)} / ${n4(fr.rho, 5)} = ${n4(fr.wf, 4)}`],
      [T.s_rho, `ρ = Vf ρf + Vm ρm = ${n4(vf, 4)} × ${n4(fb.rho)} + ${n4(vm, 4)} × ${n4(mt.rho)} = ${n4(fr.rho, 5)} g/cm³`],
      [T.s_e1, `E1 = Vf Ef1 + Vm Em = ${n4(vf, 4)} × ${n4(fb.E1)} + ${n4(vm, 4)} × ${n4(mt.E)} = ${n4(r.E1, 5)} GPa`],
      fr.vv > 0 ? [T.s_vf0, `Vf′ = Vf/(Vf + Vm) = ${n4(vf0, 4)}`] : null,
      [T.s_e2r, `1/E2 = Vf′/Ef2 + Vm′/Em = ${n4(vf0, 4)}/${n4(fb.E2)} + ${n4(vm0, 4)}/${n4(mt.E)} → E2 = ${n4(r.E2r, 4)} GPa`],
      [T.s_ht, `η = (Ef2/Em − 1)/(Ef2/Em + ξ) = (${n4(fb.E2 / mt.E, 4)} − 1)/(${n4(fb.E2 / mt.E, 4)} + ${n4(xiE(), 3)}) = ${n4(etaE, 4)} ;  E2 = Em (1 + ξηVf′)/(1 − ηVf′) = ${n4(r.E2h, 4)} GPa`],
      [T.s_gm, `Gm = Em / (2(1 + νm)) = ${n4(mt.E)} / (2 × (1 + ${n4(mt.nu, 3)})) = ${n4(Gm, 4)} GPa`],
      [T.s_g12, `1/G12 = Vf′/Gf12 + Vm′/Gm → ${n4(r.G12r, 4)} GPa ;  Halpin–Tsai: η = ${n4(etaG, 4)}, ξ = ${n4(xiG(), 3)} → G12 = ${n4(r.G12h, 4)} GPa`],
      [T.s_nu, `ν12 = Vf′ νf12 + Vm′ νm = ${n4(vf0, 4)} × ${n4(fb.nu, 3)} + ${n4(vm0, 4)} × ${n4(mt.nu, 3)} = ${n4(r.nu12, 4)} ;  ν21 = ν12 E2/E1 = ${n4(r.nu21, 3)}`],
      [T.s_a1, `α1 = (Ef1 αf1 Vf′ + Em αm Vm′)/(Ef1 Vf′ + Em Vm′) = (${n4(fb.E1)} × ${n4(fb.a1, 3)} × ${n4(vf0, 4)} + ${n4(mt.E)} × ${n4(mt.a, 3)} × ${n4(vm0, 4)}) / (${n4(fb.E1)} × ${n4(vf0, 4)} + ${n4(mt.E)} × ${n4(vm0, 4)}) = ${n4(r.a1, 4)} × 10⁻⁶/K`],
      [T.s_a2, `α2 = Vf′(αf2 + νf12 αf1) + Vm′(1 + νm)αm − α1 ν12 = ${n4(vf0, 4)} × (${n4(fb.a2, 3)} + ${n4(fb.nu, 3)} × ${n4(fb.a1, 3)}) + ${n4(vm0, 4)} × ${n4(1 + mt.nu, 3)} × ${n4(mt.a, 3)} − ${n4(r.a1, 4)} × ${n4(r.nu12, 4)} = ${n4(r.a2, 4)} × 10⁻⁶/K`],
      [T.s_eps, `εf* = σf/Ef1 = ${n4(fb.s)} / ${n4(fb.E1 * 1000, 6)} = ${pct(r.ef, 4)} ;  εm* = ${pct(r.em, 4)}${fin(raw('eum')) ? '' : ' (= σm/Em)'}`],
      r.case === 'fiber'
        ? [T.s_x_f, `σm′ = min(Em εf*, σm) = ${n4(r.smp, 4)} MPa ;  σ1u = Vf σf + Vm σm′ = ${n4(vf, 4)} × ${n4(fb.s)} + ${n4(vm, 4)} × ${n4(r.smp, 4)} = ${n4(r.sFib, 5)} MPa ;  Vm σm = ${n4(r.sMat, 4)} MPa ;  Vmin = (σm − σm′)/(σf + σm − σm′) = ${n4(r.vmin, 3)}`]
        : [T.s_x_m, `σf(εm*) = Ef1 εm* = ${n4(r.sfm, 5)} MPa ;  Vf σf = ${n4(r.sFib, 5)} MPa ;  Vf σf(εm*) + Vm σm = ${n4(r.sMat, 5)} MPa → σ1u = ${n4(r.X, 5)} MPa`],
    ]);
    html += srcLine([fsel?.src, fsel?.trsrc, fsel?.nusrc, msel?.src, fsel?.cls === 'cf' && (fsel.asm.length || fsel.hm) ? 'MAU' : null, fr.vv > 0 ? 'DONG' : null]);
    html += `<div class="cm-links"><button type="button" class="btn btn-ghost btn-small" data-go="lam-micro">${esc(T.ln_lam)} →</button>${link(`tools/ashby-material-selection-chart/?y=E&x=rho&idx=e1&mat=${fsel?.cls === 'gl' ? 'gfrp' : 'cfrp'}`, T.ln_ashby)}${fin(r.a2) ? link(`tools/thermal-expansion-stress-calculator/?alpha=${Number(r.a2.toPrecision(3))}&e=${Number(r.E2h.toPrecision(3))}`, T.ln_thermal) : ''}</div>`;
    box.innerHTML = html;
    drawUD(fb, mt, fr, r);
  }
  function drawUD(fb, mt, fr, r0) {
    const svg = box.querySelector('[data-cm="ud"]');
    const q = el.uplot.value;
    const vs = Array.from({ length: 81 }, (_, i) => i / 100);
    const at = v => micro(fb, mt, { vf: v * (1 - fr.vv), vm: (1 - v) * (1 - fr.vv), vv: fr.vv, vf0: v }, xiE(), xiG());
    const R = vs.map(at);
    const cur = fr.vf0;
    let lines = [], lg = [], ylabel = '', dots = [], read, yr;
    const fsel = fibById(el.fib.value);
    if (q === 'e1') {
      lines = [{ pts: vs.map((v, i) => [v, R[i].E1]), slot: 1, w: 2.6 }];
      dots = [{ x: cur, y: r0.E1, slot: 1 }];
      lg = [{ slot: 1, label: T.lg_e1 }];
      if (fsel?.ms && el.fib.value === fsel.id) { dots.push({ x: 0.6, y: fsel.ms.E1, slot: 2, sq: true }); lg.push({ slot: 2, sq: true, label: T.lg_ms }); }
      ylabel = T.ax_e;
      read = v => { const x = at(v); return `Vf = ${pct(v, 3)}: E1 = ${Ut(x.E1, 'GPa')}`; };
    } else if (q === 'trans') {
      lines = [
        { pts: vs.map((v, i) => [v, R[i].E2h]), slot: 1, w: 2.6 }, { pts: vs.map((v, i) => [v, R[i].E2r]), slot: 1, dash: '5 4' },
        { pts: vs.map((v, i) => [v, R[i].G12h]), slot: 2, w: 2.6 }, { pts: vs.map((v, i) => [v, R[i].G12r]), slot: 2, dash: '5 4' },
      ];
      dots = [{ x: cur, y: r0.E2h, slot: 1 }, { x: cur, y: r0.G12h, slot: 2 }];
      lg = [{ slot: 1, label: T.lg_e2h }, { slot: 1, dash: '5 4', label: T.lg_e2r }, { slot: 2, label: T.lg_g12h }, { slot: 2, dash: '5 4', label: T.lg_g12r }];
      ylabel = T.ax_e;
      read = v => { const x = at(v); return `Vf = ${pct(v, 3)}: E2 = ${Ut(x.E2h, 'GPa', 3)} (${Ut(x.E2r, 'GPa', 3)}) · G12 = ${Ut(x.G12h, 'GPa', 3)} (${Ut(x.G12r, 'GPa', 3)})`; };
    } else if (q === 'cte') {
      lines = [{ pts: vs.map((v, i) => [v, R[i].a1]), slot: 1, w: 2.6 }, { pts: vs.map((v, i) => [v, R[i].a2]), slot: 2, w: 2.6 }];
      dots = [{ x: cur, y: r0.a1, slot: 1 }, { x: cur, y: r0.a2, slot: 2 }];
      lg = [{ slot: 1, label: 'α1' }, { slot: 2, label: 'α2' }];
      ylabel = T.ax_a;
      read = v => { const x = at(v); return `Vf = ${pct(v, 3)}: α1 = ${Ut(x.a1, '10⁻⁶/K', 3)} · α2 = ${Ut(x.a2, '10⁻⁶/K', 3)}`; };
    } else {
      lines = [{ pts: vs.map((v, i) => [v, R[i].X]), slot: 1, w: 2.6 }, { pts: vs.map((v, i) => [v, R[i].sFib]), slot: 2, dash: '5 4' }, { pts: vs.map((v, i) => [v, R[i].sMat]), slot: 3, dash: '2 3' }];
      dots = [{ x: cur, y: r0.X, slot: 1 }];
      lg = [{ slot: 1, label: T.lg_x }, { slot: 2, dash: '5 4', label: r0.case === 'fiber' ? T.lg_xf : T.lg_xf2 }, { slot: 3, dash: '2 3', label: r0.case === 'fiber' ? T.lg_xm : T.lg_xm2 }];
      if (fsel?.ms && el.fib.value === fsel.id) { dots.push({ x: 0.6, y: fsel.ms.X, slot: 2, sq: true }); lg.push({ slot: 2, sq: true, label: T.lg_ms }); }
      ylabel = T.ax_s;
      read = v => { const x = at(v); return `Vf = ${pct(v, 3)}: σ1u = ${Ut(x.X, 'MPa')}`; };
    }
    const ys = lines.flatMap(l => l.pts.map(p => p[1])).concat(dots.map(d => d.y)).filter(fin);
    const ymin = Math.min(0, ...ys), ymax = Math.max(...ys, 1e-9);
    // 値がひとつもない(データ集に径方向の値がない繊維など)ときは、目盛りが意味のない小さな数にならないよう 0〜1 にする
    yr = ys.length ? [ymin < 0 ? ymin * 1.1 : 0, ymax * 1.08] : [0, 1];
    const vl = [{ x: cur, slot: 'mu' }];
    if (q === 'str' && r0.case === 'fiber' && r0.vcrit > 0 && r0.vcrit < 0.8) vl.push({ x: r0.vcrit, label: `Vcrit ${pct(r0.vcrit, 2)}` });
    const geo = plot(svg, { xr: [0, 0.8], yr, xlabel: T.ax_vf, ylabel, lines, dots, vl, xt: [0, 0.2, 0.4, 0.6, 0.8].map(v => [v, `${v * 100}%`]) });
    box.querySelector('[data-cm="lg"]').innerHTML = legend(lg);
    const ro = box.querySelector('[data-cm="read"]');
    ro.dataset.def = T.read_hint; ro.textContent = T.read_hint;
    hover(svg, geo, ro, v => read(Math.min(Math.max(v, 0), 0.8)));
  }

  // =========== lam: 積層板 ===========
  function buildPlies(lam, angles) {
    const Q = Qmat(lam.E1 * 1000, lam.E2 * 1000, lam.nu, lam.G12 * 1000);
    return { Q, plies: angles.map(th => ({ th, t: lam.t, Q, a1: fin(lam.a1) ? lam.a1 : 0, a2: fin(lam.a2) ? lam.a2 : 0 })) };
  }
  const M3 = (M, d = 4) => M.map(r => r.map(v => (Math.abs(v) < 1e-9 * Math.max(...M.flat().map(Math.abs)) ? '0' : num(v, d))).join('  ')).join(' ; ');
  function renderLam() {
    const lam = lamina();
    const lsel = lamById(el.lam.value);
    const P = parseLayup(el.laytext.value);
    const warns = [];
    const miss = ['E1', 'E2', 'G12', 'nu'].filter(k => !fin(lam[k]));
    if (P.err) { box.innerHTML = warnHTML([{ text: T[`w_lay_${P.err}`] ?? T.w_lay_syntax }]); return; }
    if (miss.length) { box.innerHTML = warnHTML([{ text: fmt(T.w_lam_missing, { list: miss.map(k => (k === 'nu' ? 'ν12' : k)).join(T.sep) }) }]); return; }
    const nu21 = (lam.nu * lam.E2) / lam.E1;
    if (!(lam.nu * nu21 < 1)) { box.innerHTML = warnHTML([{ text: T.w_lam_nu }]); return; }
    const angles = P.angles;
    const { Q, plies } = buildPlies(lam, angles);
    const L = laminate(plies);
    if (!L.F) { box.innerHTML = warnHTML([{ text: T.w_singular }]); return; }
    const strOK = ['X', 'Xc', 'Y', 'Yc', 'S'].every(k => fin(lam[k]));
    if (!strOK) warns.push({ soft: true, text: T.w_lam_str });
    if (el.lam.value === 'micro') warns.push({ soft: true, text: T.w_micro_str });
    const thOK = fin(lam.a1) && fin(lam.a2);
    const dT = valD('dt');
    if (dT !== 0 && !thOK) warns.push({ text: T.w_lam_cte });
    if (!L.symB) warns.push({ soft: true, text: T.w_unsym });
    let html = warnHTML(warns);
    // 並びと性質
    const n = angles.length;
    html += `<h3>${esc(T.h_stack)}</h3><p class="cm-plies">${esc(fmt(T.stack_line, { n, h: num(L.h, 4), t: num(lam.t, 4) }))}<br>${esc(angles.map(a => num(a, 4)).join(' / '))}</p>`;
    html += `<div class="cm-flags"><span class="${L.symB ? 'y' : 'n'}">${esc(L.symB ? T.f_sym_y : T.f_sym_n)}</span><span class="${L.bal ? 'y' : 'n'}">${esc(L.bal ? T.f_bal_y : T.f_bal_n)}</span><span class="${L.d16 ? 'n' : 'y'}">${esc(L.d16 ? T.f_d16_n : T.f_d16_y)}</span></div>`;
    const rho = lam.rho;
    html += stats([
      ['ex', 'Ex', U(L.Ex / 1000, 'GPa')], ['ey', 'Ey', U(L.Ey / 1000, 'GPa')], ['gxy', 'Gxy', U(L.Gxy / 1000, 'GPa')], ['nuxy', 'νxy', n4(L.nuxy, 3)], ['nuyx', 'νyx', n4(L.nuyx, 3)],
      ['efx', T.o_efx, U(L.Efx / 1000, 'GPa')], ['efy', T.o_efy, U(L.Efy / 1000, 'GPa')],
      ['lrho', T.o_rho, U(rho, 'g/cm³')], ['exs', T.o_specx, fin(rho) ? U(L.Ex / 1000 / rho, T.u_spec) : '–'],
      ['mass', T.o_areal, fin(rho) ? U(rho * L.h, 'kg/m²') : '–'],
    ]);
    if (!L.symB) html += `<p class="muted" style="font-size:.85rem">${esc(fmt(T.unsym_note, { ex: num(L.ExA / 1000, 4) }))}</p>`;
    // ABD
    const abdRows = L.ABD.map((r, i) => [['A', 'A', 'A', 'B', 'B', 'B'][i] + (i % 3 + 1), ...r.map(v => ({ t: Math.abs(v) < 1e-9 * Math.max(...L.ABD.flat().map(Math.abs)) ? '0' : num(v, 5), v }))]);
    html += `<h3>${esc(T.h_abd)}</h3>` + tableHTML('abd', ['', 'εx⁰', 'εy⁰', 'γxy⁰', 'κx', 'κy', 'κxy'], abdRows.map((r, i) => [['Nx', 'Ny', 'Nxy', 'Mx', 'My', 'Mxy'][i], ...r.slice(1)]));
    html += `<p class="muted" style="font-size:.85rem">${esc(T.abd_note)}</p>`;
    // 各層の Q̄(違う角度だけ)
    const uniq = [...new Set(angles)];
    html += `<h3>${esc(T.h_qbar)}</h3>` + tableHTML('qbar', [T.c_angle, 'Q̄11', 'Q̄12', 'Q̄22', 'Q̄16', 'Q̄26', 'Q̄66'], uniq.map(a => { const q = Qbar(Q, a); return [`${num(a, 4)}°`, q[0][0] / 1000, q[0][1] / 1000, q[1][1] / 1000, q[0][2] / 1000, q[1][2] / 1000, q[2][2] / 1000].map((v, i) => (i === 0 ? v : { t: Math.abs(v) < 1e-9 ? '0' : num(v, 4), v })); }));
    html += `<p class="muted" style="font-size:.85rem">${esc(T.qbar_note)}</p>`;
    // 極座標
    html += `<h3>${esc(T.h_polar)}</h3><div class="fig"><svg class="cm-polar" data-cm="polar" role="img" aria-label="${esc(T.h_polar)}"></svg><p class="cm-legend" data-cm="lgp"></p></div><p class="muted" style="font-size:.85rem">${esc(T.polar_note)}</p>`;
    // 荷重
    const N = ['nx', 'ny', 'nxy'].map(k => valD(k)), M = ['mx', 'my', 'mxy'].map(k => valD(k));
    const dTe = thOK ? dT : 0;
    const anyLoad = N.some(v => v !== 0) || M.some(v => v !== 0);
    const resp = respond(L, N, M, dTe);
    html += `<h3>${esc(T.h_resp)}</h3>` + stats([
      ['e0x', 'εx⁰', sci(resp.e0[0], 4)], ['e0y', 'εy⁰', sci(resp.e0[1], 4)], ['g0', 'γxy⁰', sci(resp.e0[2], 4)],
      ['kx', 'κx', `${sci(resp.k[0], 4)} <small>1/mm</small>`], ['ky', 'κy', `${sci(resp.k[1], 4)} <small>1/mm</small>`], ['kxy', 'κxy', `${sci(resp.k[2], 4)} <small>1/mm</small>`],
      ['sxa', T.o_sxavg, U(N[0] / L.h, 'MPa')],
    ]);
    let fpf = null;
    if (strOK && (anyLoad || dTe !== 0)) {
      const f12 = valD('f12');
      const S = plyStrength(resp, lam, f12);
      const crit = el.crit.value;
      const key = crit === 'max' ? 'max' : crit === 'hill' ? 'hill' : 'wu';
      let minR = Infinity, minK = [];
      S.forEach((s, k) => { if (s[key] < minR * (1 - 1e-9)) { minR = s[key]; minK = [k]; } else if (Math.abs(s[key] - minR) <= minR * 1e-9) minK.push(k); });
      fpf = { R: minR, plies: minK };
      const pos = j => (j === 0 ? T.pos_top : T.pos_bot);
      const rows = resp.plies.map((p, k) => {
        const s = S[k], worst = s.maxAt === 0 ? 0 : 2;
        const s12 = p.tot[worst].s12, e12 = p.tot[worst].e12;
        const srT = v => ({ t: fin(v) ? (v === 0 ? '0' : num(v, 4)) : '∞', v: fin(v) ? v : '' });
        const head = [`${k + 1}`, { t: `${num(p.th, 4)}°`, v: p.th }, { t: pos(s.maxAt), v: pos(s.maxAt) }, s12[0], s12[1], s12[2], { t: sci(e12[0], 3), v: e12[0] }, { t: sci(e12[1], 3), v: e12[1] }, { t: sci(e12[2], 3), v: e12[2] }];
        if (!anyLoad) return [...head, s.fiMax, s.fiHill, s.fiWu];
        return [...head, srT(s.max), { t: T[`fm_${s.mode}`] ?? '', v: T[`fm_${s.mode}`] ?? '' }, srT(s.hill), srT(s.wu)];
      });
      const tail = anyLoad ? [`R ${T.cr_max}`, T.c_mode, `R ${T.cr_hill}`, `R ${T.cr_wu}`] : [`FI ${T.cr_max}`, `FI ${T.cr_hill}`, `FI ${T.cr_wu}`];
      if (!anyLoad) { minK = []; let w = -Infinity; S.forEach((x, k) => { const v = x[crit === 'max' ? 'fiMax' : crit === 'hill' ? 'fiHill' : 'fiWu']; if (v > w + 1e-12) { w = v; minK = [k]; } else if (Math.abs(v - w) <= 1e-12) minK.push(k); }); }
      html += `<h3>${esc(T.h_plies)}</h3>` + tableHTML('plies', [T.c_ply, 'θ', T.c_pos, 'σ1 (MPa)', 'σ2 (MPa)', 'τ12 (MPa)', 'ε1', 'ε2', 'γ12', ...tail], rows, { cur: minK });
      html += `<p class="muted" style="font-size:.85rem">${esc(dTe !== 0 ? fmt(T.plies_note_t, { dt: num(dTe, 4) }) : T.plies_note)}</p>`;
      if (anyLoad && fin(minR)) {
        const sc = v => num(v * minR, 4);
        html += stats([
          ['fpf', fmt(T.o_fpf, { c: optText('crit', crit) }), fin(minR) ? `${num(minR, 4)}` : '∞'],
          ['fpfply', T.o_fpfply, minK.map(k => `${k + 1} (${num(angles[k], 4)}°)`).join(', ')],
          ['fpfn', T.o_fpfn, `${sc(N[0])}, ${sc(N[1])}, ${sc(N[2])} <small>N/mm</small>`],
          M.some(v => v !== 0) ? ['fpfm', T.o_fpfm, `${sc(M[0])}, ${sc(M[1])}, ${sc(M[2])} <small>N</small>`] : null,
          N[0] !== 0 && N.slice(1).every(v => v === 0) && M.every(v => v === 0) ? ['fpfs', T.o_fpfs, U((N[0] * minR) / L.h, 'MPa')] : null,
        ]);
        html += `<p class="${minR >= 1 ? 'cm-ok' : 'cm-ng'}">${esc(minR >= 1 ? fmt(T.fpf_ok, { r: num(minR, 3) }) : minR === 0 && dTe !== 0 ? fmt(T.fpf_th, { dt: num(dTe, 4) }) : fmt(T.fpf_ng, { r: num(minR, 3) }))}</p>`;
        // 最終破壊の目安
        {
          const ev = progressive(lam, angles, lam.t, N, M, crit, f12, dTe);
          if (ev.length) {
            const evRows = ev.map((x, i) => [`${i + 1}`, x.R, { t: x.plies.map(k => `${k + 1}\u00a0(${num(angles[k], 3)}°)`).join(', '), v: x.plies.map(k => k + 1).join(' ') }, { t: T[`pm_mode_${x.mode}`], v: T[`pm_mode_${x.mode}`] }, { t: `${x.failed}/${n}`, v: x.failed }]);
            html += `<h3>${esc(T.h_prog)}</h3>` + tableHTML('prog', [T.c_step, T.c_r, T.c_plies, T.c_mode, T.c_fibfail], evRows, { left: [2] });
            const last = ev[ev.length - 1];
            html += `<p class="muted" style="font-size:.85rem">${esc(fmt(T.prog_note, { r: num(last.R, 4), r1: num(ev[0].R, 4) }))}</p>`;
          }
        }
      }
    } else if (!strOK) html += '';
    else html += `<p class="muted">${esc(T.no_load)}</p>`;
    // 途中の式
    const Qb1 = Qbar(Q, angles[0]);
    const C = strOK ? tsaiWuF(lam, valD('f12')) : null;
    html += steps([
      [T.s_q, `ν21 = ν12 E2/E1 = ${num(nu21, 4)} ;  Q11 = E1/(1 − ν12ν21) = ${num(Q[0][0] / 1000, 5)} GPa ;  Q12 = ν12E2/(1 − ν12ν21) = ${num(Q[0][1] / 1000, 5)} GPa ;  Q22 = ${num(Q[1][1] / 1000, 5)} GPa ;  Q66 = G12 = ${num(Q[2][2] / 1000, 5)} GPa`],
      [fmt(T.s_qbar, { a: num(angles[0], 4) }), `Q̄ = [${M3(Qb1.map(r => r.map(v => v / 1000)))}] GPa`],
      [T.s_a, `A_ij = Σ Q̄_ij,k (z_k − z_k−1) ;  A11 = ${num(L.A[0][0], 5)} N/mm ;  D11 = Σ Q̄11,k (z_k³ − z_k−1³)/3 = ${num(L.D[0][0], 5)} N·mm ;  h = ${num(L.h, 4)} mm`],
      [T.s_ex, `[a*] = ([A B; B D])⁻¹ ;  Ex = 1/(h a*11) = 1/(${num(L.h, 4)} × ${sci(L.F[0][0], 4)}) = ${num(L.Ex, 5)} MPa ;  νxy = −a*12/a*11 = ${num(L.nuxy, 4)} ;  Efx = 12/(h³ d*11) = ${num(L.Efx, 5)} MPa`],
      [T.s_resp, `{ε⁰; κ} = [a* b*; b* d*] {N + N_T ΔT; M + M_T ΔT} ;  σ_k = Q̄_k (ε⁰ + zκ − ᾱ_k ΔT) ;  σ1-2 = T σx-y`],
      C ? [T.s_tw, `F1 = 1/X − 1/X′ = ${sci(C.F1, 4)} ;  F2 = 1/Y − 1/Y′ = ${sci(C.F2, 4)} ;  F11 = 1/(XX′) = ${sci(C.F11, 4)} ;  F22 = 1/(YY′) = ${sci(C.F22, 4)} ;  F66 = 1/S² = ${sci(C.F66, 4)} ;  F12 = f* √(F11F22) = ${sci(C.F12, 4)} (MPa⁻¹, MPa⁻²)`] : null,
      [T.s_sr, T.s_sr_f],
    ]);
    html += srcLine([lsel?.src ?? (el.lam.value === 'micro' ? 'NTNU' : null)].filter(Boolean));
    html += `<div class="cm-links"><button type="button" class="btn btn-ghost btn-small" data-go="cmp" data-mode="cmp">${esc(T.ln_cmp)} →</button></div>`;
    box.innerHTML = html;
    // 極座標の図
    const svg = box.querySelector('[data-cm="polar"]');
    const fE = a => lamE(lam.E1, lam.E2, lam.nu, lam.G12, a);
    const fL = a => laminateEx(plies, a) / 1000;
    let rmax = 0;
    for (let a = 0; a <= 180; a += 2) rmax = Math.max(rmax, fE(a), fL(a));
    polar(svg, [{ f: fE, slot: 2, dash: '5 4' }, { f: fL, slot: 1 }], rmax * 1.02, 'GPa');
    box.querySelector('[data-cm="lgp"]').innerHTML = legend([{ slot: 2, dash: '5 4', label: T.lg_lamE }, { slot: 1, label: T.lg_lamEx }]);
    box.querySelector('[data-go="cmp"]')?.addEventListener('click', () => setMode('cmp'));
  }

  // =========== short: 短繊維 ===========
  function renderShort() {
    const fb = fiber(), mt = matrix(), fr = fracs(fb, mt);
    const lmm = valD('l', 1e-6), tau = valD('tau', 1e-6), pack = el.pack.value, ori = el.orient.value;
    const warns = [];
    if (!fin(fb.d)) { box.innerHTML = warnHTML([{ text: T.w_d }]); return; }
    const Gm = mt.E / (2 * (1 + mt.nu));
    const lc = critLen(fb.s, fb.d, tau);
    const cx = coxEta(fb.E1, Gm, fb.d, lmm, fr.vf0, pack);
    const eta0 = KRENCHEL[ori];
    const r = micro({ ...fb, E2: fb.E2 ?? NaN }, mt, fr, xiE(), xiG());
    const smp = r.case === 'fiber' ? r.smp : mt.s;
    const Ec = eta0 * cx.eta * fr.vf * fb.E1 + fr.vm * mt.E, Ecl = fr.vf * fb.E1 + fr.vm * mt.E;
    const sKT = kellyTyson(fb.s, tau, fb.d, lmm, lc, fr.vf, fr.vm, smp);
    if (r.case !== 'fiber') warns.push({ soft: true, text: T.w_short_mat });
    if (!(cx.lr > 0)) warns.push({ text: T.w_pack });
    if (ori !== 'al') warns.push({ soft: true, text: T.w_short_ori });
    let html = warnHTML(warns);
    html += stats([
      ['lc', T.o_lc, U(lc, 'mm')], ['llc', 'l/lc', n4(lmm / lc, 3)], ['ad', T.o_ad, n4(lmm / (fb.d * 1e-3), 3)], ['lcd', 'lc/d', n4(lc / (fb.d * 1e-3), 3)],
      ['beta', 'β', U(cx.beta, '1/mm')], ['etal', T.o_etal, n4(cx.eta, 3)], ['eta0', T.o_eta0, n4(eta0, 3)],
      ['ec', T.o_ec, U(Ec, 'GPa')], ['ecl', T.o_ecl, U(Ecl, 'GPa')],
      ['skt', T.o_skt, U(sKT, 'MPa')], ['ske', T.o_ske, n4(ktEff(lmm, lc), 3)],
    ]);
    html += `<h3>${esc(T.h_short_plot)}</h3><div class="fig"><svg data-cm="short" role="img" aria-label="${esc(T.h_short_plot)}"></svg><p class="cm-legend" data-cm="lg"></p><p class="cm-read" data-cm="read"></p></div>`;
    const Ls = [0.05, 0.1, 0.2, 0.3, 0.5, 1, 2, 3, 5, 10, 25, 50];
    const rows = Ls.map(l => { const c = coxEta(fb.E1, Gm, fb.d, l, fr.vf0, pack); return [{ t: num(l, 3), v: l }, l / lc, c.eta, eta0 * c.eta * fr.vf * fb.E1 + fr.vm * mt.E, ktEff(l, lc), kellyTyson(fb.s, tau, fb.d, l, lc, fr.vf, fr.vm, smp)]; });
    html += `<h3>${esc(T.h_short_table)}</h3>` + tableHTML('short', [T.c_l, 'l/lc', 'ηl (Cox)', `E (GPa, η0 = ${num(eta0, 3)})`, T.c_kte, T.c_skt], rows);
    html += steps([
      [T.s_lc, `lc = σf d/(2τ) = ${n4(fb.s)} MPa × ${n4(fb.d)} µm / (2 × ${n4(tau)} MPa) = ${n4(lc * 1000, 5)} µm = ${n4(lc, 4)} mm`],
      [T.s_cox, `Gm = ${n4(Gm, 4)} GPa ;  ln(R/r) = ${n4(cx.lr, 4)} (${optText('pack', pack)}) ;  β = √(2Gm/(Ef r² ln(R/r))) = √(2 × ${n4(Gm, 4)} / (${n4(fb.E1)} × ${n4(fb.d / 2 / 1000, 4)}² × ${n4(cx.lr, 4)})) = ${n4(cx.beta, 4)} mm⁻¹`],
      [T.s_eta, `βl/2 = ${n4(cx.x, 4)} ;  ηl = 1 − tanh(βl/2)/(βl/2) = ${n4(cx.eta, 4)}`],
      [T.s_ck, `E = η0 ηl Vf Ef + Vm Em = ${n4(eta0, 3)} × ${n4(cx.eta, 4)} × ${n4(fr.vf, 4)} × ${n4(fb.E1)} + ${n4(fr.vm, 4)} × ${n4(mt.E)} = ${n4(Ec, 4)} GPa`],
      [T.s_kt, lmm >= lc ? `σ = Vf σf (1 − lc/(2l)) + Vm σm′ = ${n4(fr.vf, 4)} × ${n4(fb.s)} × (1 − ${n4(lc, 4)}/(2 × ${n4(lmm, 4)})) + ${n4(fr.vm, 4)} × ${n4(smp, 4)} = ${n4(sKT, 4)} MPa` : `σ = Vf τ l/d + Vm σm′ = ${n4(fr.vf, 4)} × ${n4(tau)} × ${n4(lmm / (fb.d * 1e-3), 4)} + ${n4(fr.vm, 4)} × ${n4(smp, 4)} = ${n4(sKT, 4)} MPa`],
    ]);
    html += srcLine([fibById(el.fib.value)?.src, matById(el.mat.value)?.src]);
    box.innerHTML = html;
    const svg = box.querySelector('[data-cm="short"]');
    const xs = Array.from({ length: 121 }, (_, i) => 10 ** (-2 + (i / 120) * 4));
    const lines = [
      { pts: xs.map(l => [l, coxEta(fb.E1, Gm, fb.d, l, fr.vf0, pack).eta]), slot: 1, w: 2.6 },
      { pts: xs.map(l => [l, ktEff(l, lc)]), slot: 2, w: 2.6, dash: '6 4' },
    ];
    const geo = plot(svg, { xr: [0.01, 100], xlog: true, yr: [0, 1.05], xlabel: T.ax_l, ylabel: T.ax_eta, lines, dots: [{ x: lmm, y: cx.eta, slot: 1 }, { x: lmm, y: ktEff(lmm, lc), slot: 2 }], vl: [{ x: lc, label: `lc = ${num(lc, 3)} mm`, slot: 'mu' }], yt: [0, 0.2, 0.4, 0.6, 0.8, 1].map(v => [v, num(v, 2)]) });
    box.querySelector('[data-cm="lg"]').innerHTML = legend([{ slot: 1, label: T.lg_cox }, { slot: 2, dash: '6 4', label: T.lg_kt }]);
    const ro = box.querySelector('[data-cm="read"]');
    ro.dataset.def = T.read_hint; ro.textContent = T.read_hint;
    hover(svg, geo, ro, l => `l = ${num(l, 3)} mm: ηl = ${num(coxEta(fb.E1, Gm, fb.d, l, fr.vf0, pack).eta, 3)} · ${T.c_kte} ${num(ktEff(l, lc), 3)}`);
  }

  // =========== cmp: 比べる ===========
  // 疑似等方 [0/±45/90]s の面内・曲げの弾性率と、x 方向の一軸引張での最初の層の破壊(Tsai–Wu、F12* = −0.5)
  function qiProps(l) {
    const angles = parseLayup(LAYUPS.qi).angles;
    const { plies } = buildPlies(l, angles);
    const L = laminate(plies);
    const resp = respond(L, [1, 0, 0], [0, 0, 0], 0);
    const R = Math.min(...plyStrength(resp, l, -0.5).map(s => s.wu));
    return { E: L.Ex / 1000, Ef: L.Efx / 1000, s: R / L.h, rho: l.rho };
  }
  function renderCmp() {
    const cs = el.case.value, ts = valD('ts', 1e-6);
    const cf = lamById(el.cmpcf.value), gf = lamById(el.cmpgf.value);
    const list = [
      { k: 'steel', name: T.m_steel, ...METALS[0], Ef: METALS[0].E },
      { k: 'al', name: T.m_al, ...METALS[1], Ef: METALS[1].E },
      { k: 'cfqi', name: fmt(T.m_cfqi, { l: optText('cmpcf', cf.id) }), ...qiProps(cf), src: cf.src },
      { k: 'gfqi', name: fmt(T.m_gfqi, { l: optText('cmpgf', gf.id) }), ...qiProps(gf), src: gf.src },
      { k: 'cfud', name: fmt(T.m_cfud, { l: optText('cmpcf', cf.id) }), E: cf.E1, Ef: cf.E1, s: cf.X, rho: cf.rho, src: cf.src },
    ];
    // CLT のタブの積層板(密度と強さがあるとき)
    const lam = lamina(), P = parseLayup(el.laytext.value);
    if (!P.err && ['E1', 'E2', 'G12', 'nu', 'rho'].every(k => fin(lam[k]))) {
      const { plies } = buildPlies(lam, P.angles), L = laminate(plies);
      if (L.F && L.symB) {
        let s = NaN;
        if (['X', 'Xc', 'Y', 'Yc', 'S'].every(k => fin(lam[k]))) s = Math.min(...plyStrength(respond(L, [1, 0, 0], [0, 0, 0], 0), lam, -0.5).map(x => x.wu)) / L.h;
        list.push({ k: 'mine', name: fmt(T.m_mine, { lay: el.laytext.value.trim() }), E: L.Ex / 1000, Ef: L.Efx / 1000, s, rho: lam.rho });
      }
    }
    const st = list[0];
    // 鋼の板(厚さ ts)と同じ剛性・強さにする厚さ
    const thick = m => (cs === 'ten' ? ts * (st.E / m.E) : cs === 'plate' ? ts * Math.cbrt(st.Ef / m.Ef) : ts * (st.s / m.s));
    const rows = list.map(m => { const t = thick(m), w = m.rho * t; return { m, t, w }; });
    const w0 = rows[0].w;
    const idxName = cs === 'ten' ? 'E/ρ' : cs === 'plate' ? '∛E/ρ' : 'σ/ρ';
    const idx = m => (cs === 'ten' ? m.E / m.rho : cs === 'plate' ? Math.cbrt(m.Ef) / m.rho : m.s / m.rho);
    let html = warnHTML([{ soft: true, text: T[`cmp_note_${cs}`] }]);
    const trows = rows.map(({ m, t, w }) => [m.name, m.E, m.Ef, { t: fin(m.s) ? n4(m.s) : '–', v: m.s }, m.rho, { t: fin(idx(m)) ? n4(idx(m)) : '–', v: idx(m) }, { t: fin(t) ? n4(t, 3) : '–', v: t }, { t: fin(w) ? n4(w, 3) : '–', v: w }, { t: fin(w) ? n4(w / w0, 3) : '–', v: w / w0 }]);
    html += tableHTML('cmp', [T.c_mat, 'E (GPa)', T.c_ef, T.c_s, 'ρ (g/cm³)', idxName, T.c_t, T.c_w, T.c_wr], trows, { cur: [0], wh: true });
    html += `<h3>${esc(T.h_cmp_bar)}</h3><div class="fig"><svg data-cm="bar" role="img" aria-label="${esc(T.h_cmp_bar)}"></svg></div>`;
    html += `<p class="muted" style="font-size:.85rem">${esc(T.cmp_note)}</p>`;
    html += steps([
      [T.s_cmp_ten, `t = t_steel × E_steel/E ;  ${T.c_w} = ρ t`],
      [T.s_cmp_plate, `t = t_steel × (Ef_steel/Ef)^(1/3)`],
      [T.s_cmp_str, `t = t_steel × σ_steel/σ ;  σ(CFRP, GFRP) = R_FPF × Nx / h`],
    ]);
    html += srcLine(['EC3', 'ASM6061', cf.src, gf.src]);
    html += `<div class="cm-links">${link(`tools/ashby-material-selection-chart/?y=${cs === 'str' ? 's' : 'E'}&x=rho&idx=${cs === 'ten' ? 'e1' : cs === 'plate' ? 'e3' : 's1'}&mat=cfrp`, T.ln_ashby)}</div>`;
    box.innerHTML = html;
    // 横棒(鋼を 1 とした重さ)
    const svg = box.querySelector('[data-cm="bar"]');
    const W = narrow() ? 360 : 640, rowH = 30, top = 8, Lw = narrow() ? 132 : 230, H = top + rowH * rows.length + 28;
    const vmax = Math.max(...rows.map(r => r.w / w0).filter(fin), 1) * 1.1;
    // 名前を幅(12px の文字で、全角はほぼ 12px、半角は約 7px と見積もる)に収まるように切る。全部の名前は表にある
    const cw = c => (c.codePointAt(0) > 0x2e80 ? 12 : 7);
    const clip = (t, px) => { let w = 0, out = ''; for (const c of t) { w += cw(c); if (w > px - 8) return `${out}…`; out += c; } return out; };
    const X = v => Lw + (v / vmax) * (W - Lw - 46);
    let s = '';
    for (const v of niceTicks(0, vmax, 4)) s += `<line x1="${X(v)}" x2="${X(v)}" y1="${top}" y2="${H - 22}" stroke="var(--border)"/><text x="${X(v)}" y="${H - 6}" fill="var(--muted)" text-anchor="middle" font-size="11">${num(v, 3)}</text>`;
    rows.forEach((r, i) => {
      const y = top + i * rowH, v = r.w / w0;
      const name = clip(r.m.name, Lw - 10);
      s += `<text x="${Lw - 6}" y="${y + rowH / 2 + 4}" fill="var(--text)" text-anchor="end" font-size="12">${esc(name)}</text>`;
      if (fin(v)) s += `<rect x="${Lw}" y="${y + 6}" width="${Math.max(X(v) - Lw, 1)}" height="${rowH - 12}" rx="3" fill="var(--cm-${i + 1})"/><text x="${X(v) + 4}" y="${y + rowH / 2 + 4}" fill="var(--text)" font-size="12">${num(v, 3)}</text>`;
    });
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.innerHTML = s;
  }

  // ---- 結果のコピー(今のモードで見えている入力と結果だけ。共通の部品より先に受ける) ----
  const clean = n => n?.textContent.trim().replace(/\s+/g, ' ') ?? '';
  function resultText() {
    const lines = [clean(document.querySelector('h1')), `[${optText('mode', modeSel.value)}]`, ''];
    for (const f of el) if (f.name && f.name !== 'mode' && !lab(f.name).hidden) lines.push(`${clean(lab(f.name).querySelector('span'))}: ${f.tagName === 'SELECT' ? clean(f.selectedOptions[0]) : f.value}`);
    for (const n of box.querySelectorAll('[data-cm-warn]')) lines.push('', `! ${clean(n)}`);
    for (const node of box.querySelectorAll('h3, .dy-stats > div, table, .cm-plies')) {
      if (node.tagName === 'H3') lines.push('', `[${clean(node)}]`);
      else if (node.tagName === 'TABLE') for (const row of node.rows) lines.push([...row.cells].map(clean).join('\t'));
      else if (node.classList.contains('cm-plies')) lines.push(clean(node));
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
  let raf = 0;
  const render = () => {
    const mode = modeSel.value;
    visible();
    try {
      if (mode === 'ud') renderUD();
      else if (mode === 'lam') renderLam();
      else if (mode === 'short') renderShort();
      else renderCmp();
    } catch (err) {
      box.innerHTML = warnHTML([{ text: T.w_error }]);
      console.error(err);
    }
  };
  const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(render); };
  form.addEventListener('input', schedule);
  form.addEventListener('change', schedule);
  form.addEventListener('submit', e => e.preventDefault());
  let lastW = narrow();
  if (window.ResizeObserver) new ResizeObserver(() => { const w = narrow(); if (w !== lastW) { lastW = w; render(); } }).observe(box);
  if (el.lam.value === 'micro') fillMicro();
  render();
  if (blanked) form.dispatchEvent(new Event('input', { bubbles: true })); // 共有の URL を空欄に合わせて書き直させる
}
