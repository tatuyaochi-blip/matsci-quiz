// 鋼の熱処理ラボ(id は fe-c のまま)。1ページに6つのモード(タブ)を持つ:
//   diagram 状態図: Fe–Fe₃C(準安定系)の点の相・タイライン・てこの規則、冷やしていく道筋(各温度の相の質量分率と、相の境界を通る温度)、
//           平衡のときの室温の組織分率(途中の式つき)、主な点の値と出典
//   trans   変態点: 成分から Ac1(Andrews 1965・Trzaska 2016)、Ac3(Andrews 1965)、Ms(Andrews の1次式・積の項つきの式、Steven–Haynes 1956)、
//           Mf の目安(Ms − 215 ℃)、Koistinen–Marburger の式によるマルテンサイトの分率
//   harden  焼入れ性: Grossmann の方法(炭素と粒度番号の基準の理想臨界直径 × 合金元素の倍数)で D_I、冷却の強さ H から実際の臨界直径 D
//           (中心が半分の温度まで冷える時間が等しい、という熱伝導の計算。H = ∞ で Asimow らの D_I = 4.458√(a·t½) になる)
//   temper  焼入れ硬さと焼戻し: 100 % マルテンサイトの硬さ(Yurioka らの式)、Hollomon–Jaffe の焼戻しパラメータで等しい条件への換算
//   weld    溶接: CE(IIW)・CE(WES)・Pcm・CEN と、使える炭素量の目安、HAZ が全部マルテンサイトになったときの硬さ
//   grade   鋼種: 代表的な鋼種の成分(規格の範囲の中央)と、それぞれの計算結果の表。選ぶとすべてのモードに入る
// 値と出典は review の sources.md、検算は scripts/check_fe_c.py(python で独立に計算して突き合わせる)。
// 状態図の点と線の値(P・S・E・C・CM・TS など)と line は、拡散(diffusion.js)・2元系状態図(lever.js)・計算ドリル(drill.js)も読むので、名前と値を変えない。
// 純粋な計算の関数は export し、DOM の部分は form があるときだけ動かす(node から関数を呼んで検算するため)
import { num } from './eng.js';

// =====================================================================
// 鉄–炭素(Fe–Fe₃C、準安定系)状態図。主な点は教科書の定番の値で、線はその点を通る近似:
// A3(GS)は 912 ℃ から共析点まで T = 912 − 185·(C/0.76)^0.7 の滑らかな曲線、そのほかの線は直線。
// 727 ℃より下のαの固溶限(PQ)は 0.022 wt%(727 ℃)から 0.002 wt%(20 ℃)へ指数関数で下がる形の模式
// =====================================================================
// 主な点(wt% C、℃)
// Fe₃C の炭素量は資料によって 6.67〜6.70 wt%(化学量論では約 6.69)。サイトの説明・問題(lever.json、phase-diagram-007、用語集)にそろえて 6.70 とする
export const P = 0.022, S = 0.76, E = 2.14, C = 4.30, CM = 6.70, H = 0.09, J = 0.17, B = 0.53;
export const TA = 1538, TP = 1495, TN = 1394, TE = 1147, TG = 912, TS = 727, TD = 1250; // TD はFe₃C側の液相線の目安(資料で大きく違う)
const lerp = (t, t0, t1, c0, c1) => c0 + (c1 - c0) * (t - t0) / (t1 - t0);

// 境界線: 温度 t での組成(wt% C)
export const line = {
  liqL: t => lerp(t, TA, TP, 0, B),        // AB 液相線(δ側)
  solD: t => lerp(t, TA, TP, 0, H),        // AH δの固相線
  liqM: t => lerp(t, TP, TE, B, C),        // BC 液相線(γ側)
  solG: t => lerp(t, TP, TE, J, E),        // JE γの固相線
  liqR: t => lerp(t, TE, TD, C, CM),       // CD 液相線(Fe₃C側、目安)
  dG: t => lerp(t, TN, TP, 0, H),          // NH δ/(δ+γ)
  gD: t => lerp(t, TN, TP, 0, J),          // NJ γ/(δ+γ)
  a3: t => S * Math.max(0, (TG - t) / (TG - TS)) ** (1 / 0.7), // GS(A3)
  acm: t => lerp(t, TS, TE, S, E),         // SE(Acm)
  gp: t => lerp(t, TG, TS, 0, P),          // GP α/(α+γ)
  pq: t => P * Math.exp(-Math.log(P / 0.002) * (TS - t) / (TS - 20)), // PQ αの固溶限(模式)
};

// 相の領域。lo〜hi の温度で、左の境界 l(t) と右の境界 r(t) のあいだ。phases は左から順、ends は両端の組成
const L = line;
export const regions = {
  L: { lo: TE, hi: 1600, l: t => (t >= TA ? 0 : t >= TP ? L.liqL(t) : L.liqM(t)), r: t => (t <= TD ? L.liqR(t) : CM), at: [1.8, 1460], phases: ['L'] },
  Ld: { lo: TP, hi: TA, l: L.solD, r: L.liqL, at: [0.2, 1525], phases: ['delta', 'L'], ends: [L.solD, L.liqL] },
  d: { lo: TN, hi: TA, l: () => 0, r: t => (t >= TP ? L.solD(t) : L.dG(t)), at: [0.035, 1470], phases: ['delta'] },
  dg: { lo: TN, hi: TP, l: L.dG, r: L.gD, at: [0.11, 1420], phases: ['delta', 'gamma'], ends: [L.dG, L.gD] },
  Lg: { lo: TE, hi: TP, l: L.solG, r: L.liqM, at: [1.95, 1300], phases: ['gamma', 'L'], ends: [L.solG, L.liqM] },
  g: { lo: TS, hi: TP, l: t => (t >= TN ? L.gD(t) : t >= TG ? 0 : L.a3(t)), r: t => (t >= TE ? L.solG(t) : L.acm(t)), at: [0.85, 1080], phases: ['gamma'] },
  Lc: { lo: TE, hi: TD, l: L.liqR, r: () => CM, at: [6.15, 1155], phases: ['L', 'cem'], ends: [L.liqR, () => CM] },
  gc: { lo: TS, hi: TE, l: L.acm, r: () => CM, at: [3.6, 950], phases: ['gamma', 'cem'], ends: [L.acm, () => CM] },
  ag: { lo: TS, hi: TG, l: L.gp, r: L.a3, at: [0.28, 770], phases: ['alpha', 'gamma'], ends: [L.gp, L.a3] },
  a: { lo: 400, hi: TG, l: () => 0, r: t => (t >= TS ? L.gp(t) : L.pq(t)), at: [0.006, 600], phases: ['alpha'] },
  ac: { lo: 400, hi: TS, l: L.pq, r: () => CM, at: [3.6, 560], phases: ['alpha', 'cem'], ends: [L.pq, () => CM] },
};
// 3相が共存する水平線(温度ちょうど)
export const invariants = [
  { t: TP, lo: H, hi: B, key: 'peritectic', phases: [['delta', H], ['gamma', J], ['L', B]] },
  { t: TE, lo: E, hi: CM, key: 'eutectic', phases: [['gamma', E], ['L', C], ['cem', CM]] },
  { t: TS, lo: P, hi: CM, key: 'eutectoid', phases: [['alpha', P], ['gamma', S], ['cem', CM]] },
];

// 点 (c, t) の相。{ key, phases: [[相, 組成, 質量分率]…] } か、三相線上なら { inv }、範囲外なら null
export function locate(c, t) {
  if (!(c >= 0 && c <= CM && t >= 400 && t <= 1600)) return null;
  const inv = invariants.find(x => t === x.t && c >= x.lo && c <= x.hi);
  if (inv) return { inv };
  if (c === CM && t <= TD) return { key: 'cem', phases: [['cem', CM, 1]] };
  let key;
  if (t >= TP) key = t >= TA || c >= L.liqL(t) ? 'L' : c > L.solD(t) ? 'Ld' : 'd';
  else if (t >= TE) {
    if (t >= TN && c <= L.dG(t)) key = 'd';
    else if (t >= TN && c < L.gD(t)) key = 'dg';
    else if (c <= L.solG(t)) key = 'g';
    else if (c < L.liqM(t)) key = 'Lg';
    else key = t <= TD && c > L.liqR(t) ? 'Lc' : 'L';
  } else if (t >= TS) {
    if (t < TG && c <= L.gp(t)) key = 'a';
    else if (t < TG && c < L.a3(t)) key = 'ag';
    else key = c <= L.acm(t) ? 'g' : 'gc';
  } else key = c <= L.pq(t) ? 'a' : 'ac';
  const r = regions[key];
  if (!r.ends) return { key, phases: [[r.phases[0], c, 1]] };
  const ca = r.ends[0](t), cb = r.ends[1](t), wa = (cb - c) / (cb - ca);
  return { key, phases: [[r.phases[0], ca, wa], [r.phases[1], cb, 1 - wa]] };
}

// 液相からゆっくり冷やしたときの室温の組織(準安定系。727 ℃直下でのてこの規則の値で近似)
// kind は炭素量での分類、parts は [組織, 質量分率]、total は727 ℃直下の α と Fe₃C の相の分率
export function micro(c) {
  if (!(c >= 0 && c <= CM)) return null;
  const total = c <= P ? [1, 0] : [(CM - c) / (CM - P), (c - P) / (CM - P)];
  let kind, parts;
  if (c <= P) { kind = 'iron'; parts = [['ferrite', 1]]; }
  else if (c < S) { kind = 'hypo'; const w = (S - c) / (S - P); parts = [['pro_a', w], ['pearlite', 1 - w]]; }
  else if (c === S) { kind = 'eut'; parts = [['pearlite', 1]]; }
  else if (c <= E) { kind = 'hyper'; const w = (c - S) / (CM - S); parts = [['pro_c', w], ['pearlite', 1 - w]]; }
  else if (c < C) {
    kind = 'ci_hypo';
    const wg = (C - c) / (C - E), sec = (E - S) / (CM - S); // 初晶γの分率と、そのうち二次セメンタイトになる割合
    parts = [['pearlite_g', wg * (1 - sec)], ['sec_c', wg * sec], ['led', 1 - wg]];
  } else if (c === C) { kind = 'ci_eut'; parts = [['led', 1]]; }
  else if (c < CM) { kind = 'ci_hyper'; const w = (c - C) / (CM - C); parts = [['pri_c', w], ['led', 1 - w]]; }
  else { kind = 'cem'; parts = [['cem', 1]]; }
  return { kind, parts, total };
}

// 炭素量 c の鋼が γ 単相になる下限の温度(c ≤ 0.76 なら A3、0.76〜2.14 なら Acm)。図の線(近似)から逆に求める
export function upperCrit(c) {
  if (!(c >= 0)) return NaN;
  if (c <= S) return TG - (TG - TS) * (c / S) ** 0.7;
  if (c <= E) return TS + (c - S) / (E - S) * (TE - TS);
  return NaN;
}

// 冷やしていく道筋: 炭素量 c で 1600 ℃から 400 ℃まで、温度ごとの相の質量分率(三相線の温度ちょうどは避ける)
export const PHASES = ['L', 'delta', 'gamma', 'alpha', 'cem'];
export function coolPath(c, step = 2) {
  const rows = [];
  for (let t = 1600; t >= 400 - 1e-9; t -= step) {
    const tt = invariants.some(x => x.t === t) ? t + 0.01 : t;
    const loc = locate(c, tt);
    const f = Object.fromEntries(PHASES.map(p => [p, 0]));
    if (loc?.phases) for (const [ph, , w] of loc.phases) f[ph] += w;
    rows.push({ t: tt, key: loc?.key ?? null, f });
  }
  return rows;
}
// 冷やしていく道筋で相の領域が変わる温度(隣りあう格子点の間を二分法で詰める。三相線は温度ちょうどの値に置く)
export function coolEvents(c) {
  const keyAt = t => locate(c, t)?.key ?? null;
  const out = [];
  let t0 = 1600, k0 = keyAt(t0);
  for (let t = 1599; t >= 400; t -= 1) {
    const tt = invariants.some(x => x.t === t) ? t + 0.01 : t;
    const k = keyAt(tt);
    if (k !== k0) {
      let hi = t0, lo = tt;
      const inv = invariants.find(x => x.t < hi && x.t > lo && c >= x.lo && c <= x.hi);
      let at;
      if (inv) at = inv.t;
      else {
        for (let i = 0; i < 50; i++) { const m = (hi + lo) / 2; if (keyAt(m) === k0) hi = m; else lo = m; }
        at = (hi + lo) / 2;
      }
      out.push({ t: at, from: k0, to: k, inv: inv?.key ?? null });
      k0 = k;
    }
    t0 = tt;
  }
  return out;
}

// =====================================================================
// 成分(質量%)。x = { C, Si, Mn, Ni, Cr, Mo, V, W, Cu, B }
// =====================================================================
export const ELS = ['C', 'Si', 'Mn', 'Ni', 'Cr', 'Mo', 'V', 'W', 'Cu', 'B'];
export const comp = (o = {}) => Object.fromEntries(ELS.map(e => [e, Number(o[e]) || 0]));

// ---- 変態点の経験式(℃、成分は質量%)と、式を作ったデータの成分の範囲 ----
// Andrews(1965): Ac1・Ac3(J. Iron Steel Inst. 203, 721。Gorni の Handbook で式を確認。COMSOL の説明では C < 0.6 % で使える)
// Trzaska(2016): Ac1(Arch. Metall. Mater. 61, 981 の表4の係数と表1・表2の範囲。Ac3 の式は炭素の項の形が資料で食い違うので載せない)
// Ms: Andrews(1965)の1次式と積の項つきの式、Steven–Haynes(1956)。範囲は EAH Jena(Kunert)の Ms の式の一覧の値
export const TRANS = {
  ac1_and: { f: x => 723 - 10.7 * x.Mn - 16.9 * x.Ni + 29.1 * x.Si + 16.9 * x.Cr + 6.38 * x.W, uses: ['Mn', 'Ni', 'Si', 'Cr', 'W'], range: { C: [0, 0.6] }, src: 'AND' },
  ac1_trz: { f: x => 741.9 - 29.1 * x.C - 14.0 * x.Mn + 12.6 * x.Si + 15.9 * x.Cr - 16.8 * x.Ni - 16.2 * x.Mo + 45.2 * x.V + 36.3 * x.Cu, uses: ['C', 'Mn', 'Si', 'Cr', 'Ni', 'Mo', 'V', 'Cu'],
    range: { C: [0.06, 0.68], Mn: [0.13, 2.04], Si: [0.12, 1.75], Cr: [0, 2.30], Ni: [0, 3.85], Mo: [0, 1.05], V: [0, 0.38], Cu: [0, 0.38] },
    sums: [[['Mn', 'Cr'], 3.6], [['Mn', 'Cr', 'Ni'], 5.6], [['Cr', 'Ni'], 5.3], [['Mn', 'Ni'], 4.5]], src: 'TRZ' },
  ac3_and: { f: x => 910 - 203 * Math.sqrt(x.C) - 15.2 * x.Ni + 44.7 * x.Si + 104 * x.V + 31.5 * x.Mo + 13.1 * x.W, uses: ['C', 'Ni', 'Si', 'V', 'Mo', 'W'], range: { C: [0, 0.6] }, src: 'AND' },
  ms_and: { f: x => 539 - 423 * x.C - 30.4 * x.Mn - 17.7 * x.Ni - 12.1 * x.Cr - 7.5 * x.Mo, uses: ['C', 'Mn', 'Ni', 'Cr', 'Mo'],
    range: { C: [0.1, 0.6], Mn: [0, 5], Cr: [0, 5], Ni: [0, 5], Si: [0, 2], Mo: [0, 5.4] }, src: 'AND' },
  ms_andp: { f: x => 512 - 453 * x.C - 16.9 * x.Ni + 15 * x.Cr - 9.5 * x.Mo + 217 * x.C ** 2 - 71.5 * x.C * x.Mn - 67.6 * x.C * x.Cr, uses: ['C', 'Mn', 'Ni', 'Cr', 'Mo'],
    range: { C: [0.1, 0.6], Mn: [0, 5], Cr: [0, 5], Ni: [0, 5], Si: [0, 2], Mo: [0, 5.4] }, src: 'AND' },
  ms_sh: { f: x => 561 - 474 * x.C - 33 * x.Mn - 17 * x.Ni - 17 * x.Cr - 21 * x.Mo, uses: ['C', 'Mn', 'Ni', 'Cr', 'Mo'],
    range: { C: [0.1, 0.55], Mn: [0.2, 1.67], Si: [0.1, 1.7], Ni: [0, 5], Cr: [0, 3.3], Mo: [0, 1] }, src: 'SH' },
};
// 成分が式の範囲から外れている元素(と、合計の上限を超えた組)。式に入っていない元素で 0 でないもの
export function rangeOut(id, x) {
  const d = TRANS[id] ?? id, out = [];
  for (const [e, [lo, hi]] of Object.entries(d.range ?? {})) if (x[e] < lo - 1e-9 || x[e] > hi + 1e-9) out.push(e);
  for (const [els, max] of d.sums ?? []) if (els.reduce((s, e) => s + x[e], 0) > max + 1e-9) out.push(els.join('+'));
  return out;
}
export const unused = (uses, x, skip = ['C']) => ELS.filter(e => !uses.includes(e) && !skip.includes(e) && x[e] > 0);
export function transTemps(x0) {
  const x = comp(x0), r = {};
  for (const [id, d] of Object.entries(TRANS)) r[id] = { v: d.f(x), out: rangeOut(id, x), unused: unused(d.uses, x) };
  return r;
}
// Mf の目安: Ms − 215 ℃(MacKenzie, Thermal Processing 2025 が Grange–Stewart 1946 を引いて示す関係)
export const MF_DROP = 215;
// Koistinen–Marburger(1959): 温度 T まで冷やしたときのマルテンサイトの体積分率 f = 1 − exp(−0.011·(Ms − T))(T < Ms)
export const KM = 0.011;
export const kmFrac = (ms, t) => (t >= ms ? 0 : 1 - Math.exp(-KM * (ms - t)));
export const kmTemp = (ms, f) => ms + Math.log(1 - f) / KM; // 分率 f になる温度

// ---- 焼入れ性: Grossmann の方法 ----
// 炭素量と粒度番号による基準の理想臨界直径(インチ)。D. H. Herring, Industrial Heating 2005-09「Ideal Diameter」の表1の値(0.05〜0.90 % C、粒度番号 6・7・8)
// 粒度 8・0.65 % C の 0.2551 は前後の差から見て誤植かもしれない(0.250 前後なら滑らか)が、確かめられないので表のとおりにする
export const DI_C = [0.05, 0.10, 0.15, 0.20, 0.25, 0.30, 0.35, 0.40, 0.45, 0.50, 0.55, 0.60, 0.65, 0.70, 0.75, 0.80, 0.85, 0.90];
export const DI_BASE = {
  6: [0.0814, 0.1153, 0.1413, 0.1623, 0.1820, 0.1991, 0.2154, 0.2300, 0.2440, 0.2580, 0.2730, 0.2840, 0.2950, 0.3060, 0.3160, 0.3260, 0.3360, 0.3460],
  7: [0.0750, 0.1065, 0.1315, 0.1509, 0.1678, 0.1849, 0.2000, 0.2130, 0.2259, 0.2380, 0.2510, 0.2620, 0.2730, 0.2830, 0.2930, 0.3030, 0.3120, 0.3210],
  8: [0.0697, 0.0995, 0.1212, 0.1400, 0.1560, 0.1700, 0.1842, 0.1976, 0.2090, 0.2200, 0.2310, 0.2410, 0.2551, 0.2600, 0.2700, 0.2780, 0.2870, 0.2960],
};
// 表の間は直線で補間。範囲外は端の値にとどめ、out を立てる
export function diBase(c, gs = 7) {
  const ys = DI_BASE[gs];
  if (!ys) return { v: NaN, out: true };
  const lo = DI_C[0], hi = DI_C[DI_C.length - 1];
  const cc = Math.min(hi, Math.max(lo, c));
  let i = 0;
  while (i < DI_C.length - 2 && cc > DI_C[i + 1]) i++;
  const v = ys[i] + (ys[i + 1] - ys[i]) * (cc - DI_C[i]) / (DI_C[i + 1] - DI_C[i]);
  return { v, out: c < lo - 1e-9 || c > hi + 1e-9 };
}
// 合金元素の倍数 f = 1 + k·(質量%)。同じ表1の値(Mn 0.30 % → 2.000、Cr 0.95 % → 3.052 など)はこの1次式に合う。
// 表にある範囲: Mn・Si・Ni・Cr は 1.00 % まで、Mo は 0.90 % まで(それより多いときは1次式のまま延ばし、注意を出す)
export const DIF = { Mn: { k: 10 / 3, max: 1.00 }, Si: { k: 0.70, max: 1.00 }, Ni: { k: 0.363, max: 1.00 }, Cr: { k: 2.16, max: 1.00 }, Mo: { k: 3.00, max: 0.90 } };
export function idealDiameter(x0, gs = 7) {
  const x = comp(x0), base = diBase(x.C, gs);
  const factors = Object.entries(DIF).map(([e, d]) => ({ e, f: 1 + d.k * x[e], out: x[e] > d.max + 1e-9 }));
  const di = factors.reduce((p, f) => p * f.f, base.v);
  return { base, factors, di, diMm: di * 25.4, unused: ['V', 'W', 'Cu', 'B'].filter(e => x[e] > 0) };
}
// 冷却の強さ H(Grossmann の値、1/インチ。Bi = H·D が無次元になるよう D はインチ)。
// Comprehensive Materials Processing(2014)表3・Smithells 8版 表29.7 の値(資料に値のない組み合わせは入れない)
export const HQ = {
  oil: { none: [0.25, 0.30], mild: [0.30, 0.35], moderate: [0.35, 0.40], good: [0.40, 0.50], strong: [0.50, 0.80], violent: [0.80, 1.10] },
  water: { none: [0.9, 1.0], mild: [1.0, 1.1], moderate: [1.2, 1.3], good: [1.4, 1.5], strong: [1.6, 2.0], violent: [4, 4] },
  brine: { none: [2, 2], mild: [2, 2.2], violent: [5, 5] },
};
// ---- 丸棒の中心の冷え方(無限長の円柱、表面で熱伝達、物性は一定) ----
// θ(中心) = Σ Cn·exp(−λn²·Fo)、Cn = 2J1(λn)/(λn(J0(λn)² + J1(λn)²))、λn·J1(λn) = Bi·J0(λn)、Bi = hR/k = H·D、Fo = a·t/R²
// Bessel 関数は積分表示 Jn(x) = (1/π)∫₀^π cos(nτ − x sin τ)dτ を台形則で(周期関数なので x ≲ 40 で倍精度まで合う)
const NB = 64;
const COS = [], SIN = [];
for (let k = 0; k < NB; k++) { const tau = Math.PI * (k + 0.5) / NB; COS.push(tau); SIN.push(Math.sin(tau)); }
export function besselJ(n, x) {
  let s = 0;
  for (let k = 0; k < NB; k++) s += Math.cos(n * COS[k] - x * SIN[k]);
  return s / NB;
}
// 固有値 λn(n = 1…m)。Bi が非常に大きい(表面がすぐに冷却剤の温度になる)ときは J0 の零点
function eigen(bi, m = 6) {
  const f = bi === Infinity ? l => besselJ(0, l) : l => l * besselJ(1, l) - bi * besselJ(0, l);
  const roots = [];
  let a = 1e-9, fa = f(a);
  for (let l = 0.1; roots.length < m && l < 60; l += 0.1) {
    const fl = f(l);
    if (fa === 0 || fa * fl < 0) {
      let lo = a, hi = l, flo = fa;
      for (let i = 0; i < 52; i++) { const mid = (lo + hi) / 2, fm = f(mid); if (flo * fm <= 0) hi = mid; else { lo = mid; flo = fm; } }
      roots.push((lo + hi) / 2);
    }
    a = l; fa = fl;
  }
  return roots;
}
export function centerTheta(fo, bi) {
  return eigen(bi).reduce((s, l) => { const j0 = besselJ(0, l), j1 = besselJ(1, l); return s + 2 * j1 / (l * (j0 * j0 + j1 * j1)) * Math.exp(-l * l * fo); }, 0);
}
// 中心が半分の温度(θ = 0.5)になる Fo
export function foHalf(bi) {
  const ls = eigen(bi), cs = ls.map(l => { const j0 = besselJ(0, l), j1 = besselJ(1, l); return 2 * j1 / (l * (j0 * j0 + j1 * j1)); });
  const th = fo => ls.reduce((s, l, i) => s + cs[i] * Math.exp(-l * l * fo), 0);
  let lo = 1e-4, hi = 1;
  while (th(hi) > 0.5) hi *= 2;
  for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (th(m) > 0.5) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
// Fo½(Bi) の表を一度だけ作り、log–log の直線で補間する(Bi < 1e−4 は集中定数 ln2/(2Bi)、Bi > 1e4 は Bi = ∞ の値)
let FOT = null;
const BI_LO = -4, BI_HI = 4, BI_N = 161;
function foTable() {
  if (FOT) return FOT;
  const lb = [], lf = [];
  for (let i = 0; i < BI_N; i++) { const e = BI_LO + (BI_HI - BI_LO) * i / (BI_N - 1); lb.push(e); lf.push(Math.log10(foHalf(10 ** e))); }
  FOT = { lb, lf, inf: foHalf(Infinity) };
  return FOT;
}
export function foHalfI(bi) {
  const t = foTable();
  if (bi === Infinity || bi >= 10 ** BI_HI) return t.inf;
  if (bi <= 10 ** BI_LO) return Math.LN2 / (2 * bi);
  const e = Math.log10(bi), p = (e - BI_LO) / (BI_HI - BI_LO) * (BI_N - 1), i = Math.min(BI_N - 2, Math.floor(p)), u = p - i;
  return 10 ** (t.lf[i] + (t.lf[i + 1] - t.lf[i]) * u);
}
export const foInf = () => foTable().inf;
// 理想臨界直径 D_I(インチ)の鋼を、冷却の強さ H(1/インチ)で焼入れしたときの臨界直径 D(インチ):
// 中心が半分の温度になるまでの時間 t½ = Fo½(H·D)·(D/2)²/a が、理想焼入れ(H = ∞)の D_I の棒の t½ と等しくなる D。
// D²·Fo½(H·D) = D_I²·Fo½(∞) を二分法で解く(左辺は D について単調に増える)
export function critD(di, h) {
  if (!(di > 0)) return NaN;
  if (h === Infinity) return di;
  if (!(h > 0)) return NaN;
  const target = di * di * foInf();
  let lo = 0, hi = di;
  for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (m * m * foHalfI(h * m) < target) lo = m; else hi = m; }
  return (lo + hi) / 2;
}
// 逆: 直径 D(インチ)の棒の中心を、冷却の強さ H で 50 % マルテンサイトにするのに要る D_I
export const needDI = (d, h) => (h === Infinity ? d : d * Math.sqrt(foHalfI(h * d) / foInf()));
// Asimow ら(1941)の D_I = 4.458·√(a·t½) の係数(H = ∞ の円柱の中心で θ = 0.5)。2/√Fo½(∞) がこれに当たる
export const asimowCoef = () => 2 / Math.sqrt(foInf());

// ---- 焼入れ硬さ・焼戻し ----
// 100 % マルテンサイトの硬さ HV = 884C(1 − 0.3C²) + 294(Yurioka ら 1987。Kasuya・Hashiba, 新日鐵技報 95(2007)の式28)
export const hvMart = c => 884 * c * (1 - 0.3 * c * c) + 294;
// Hollomon–Jaffe の焼戻しパラメータ P = T(K)·(Cc + log10 t(h))
export const K0 = 273.15;
export const hjP = (tc, th, cc) => (tc + K0) * (cc + Math.log10(th));
export const hjTime = (p, tc, cc) => 10 ** (p / (tc + K0) - cc);   // 温度 tc(℃)で同じ P になる時間(h)
export const hjTemp = (p, th, cc) => p / (cc + Math.log10(th)) - K0; // 時間 th(h)で同じ P になる温度(℃)

// ---- 溶接: 炭素当量 ----
// CE(IIW) = C + Mn/6 + (Cr+Mo+V)/5 + (Ni+Cu)/15、CE(WES) = C + Si/24 + Mn/6 + Ni/40 + Cr/5 + Mo/4 + V/14、
// Pcm(Ito–Bessyo 1968)= C + Si/30 + (Mn+Cu+Cr)/20 + Ni/60 + Mo/15 + V/10 + 5B、
// CEN(Yurioka ら 1983)= C + A(C)·{Si/24 + Mn/6 + Cu/15 + Ni/20 + (Cr+Mo+Nb+V)/5 + 5B}、A(C) = 0.75 + 0.25·tanh{20(C − 0.12)}(Nb は入力にないので 0)
export const aC = c => 0.75 + 0.25 * Math.tanh(20 * (c - 0.12));
export const CE = {
  iiw: x => x.C + x.Mn / 6 + (x.Cr + x.Mo + x.V) / 5 + (x.Ni + x.Cu) / 15,
  wes: x => x.C + x.Si / 24 + x.Mn / 6 + x.Ni / 40 + x.Cr / 5 + x.Mo / 4 + x.V / 14,
  pcm: x => x.C + x.Si / 30 + (x.Mn + x.Cu + x.Cr) / 20 + x.Ni / 60 + x.Mo / 15 + x.V / 10 + 5 * x.B,
  cen: x => x.C + aC(x.C) * (x.Si / 24 + x.Mn / 6 + x.Cu / 15 + x.Ni / 20 + (x.Cr + x.Mo + x.V) / 5 + 5 * x.B),
};
export const ceAll = x0 => { const x = comp(x0); return Object.fromEntries(Object.entries(CE).map(([k, f]) => [k, f(x)])); };
// CE(IIW) の目安の区切り(welding.org.au の計算機の説明: 0.40 未満、0.40〜0.45、0.45〜0.60、0.60 超)
export const IIW_BANDS = [0.40, 0.45, 0.60];
export const iiwBand = v => (v < 0.40 ? 0 : v < 0.45 ? 1 : v <= 0.60 ? 2 : 3);

// ---- 代表的な鋼種(規格の範囲の中央。上限だけの主な元素は上限の半分を仮に入れ、half に名前を残す。不純物の上限は 0)----
// 出典の略号は sources.md(U006 = 日本製鉄 特殊鋼薄板カタログ、JISF = 日本鉄鋼連盟 JIS G 4053 改正原案、JT = ジェイテクト、JSSA = ステンレス協会)
export const GRADES = {
  s20c: { name: 'S20C', std: 'JIS G 4051', src: 'U006', x: { C: 0.205, Si: 0.25, Mn: 0.45 }, r: 'C 0.18–0.23, Si 0.15–0.35, Mn 0.30–0.60' },
  s35c: { name: 'S35C', std: 'JIS G 4051', src: 'U006', x: { C: 0.35, Si: 0.25, Mn: 0.75 }, r: 'C 0.32–0.38, Si 0.15–0.35, Mn 0.60–0.90' },
  s45c: { name: 'S45C', std: 'JIS G 4051', src: 'U006', x: { C: 0.45, Si: 0.25, Mn: 0.75 }, r: 'C 0.42–0.48, Si 0.15–0.35, Mn 0.60–0.90' },
  s55c: { name: 'S55C', std: 'JIS G 4051', src: 'U006', x: { C: 0.55, Si: 0.25, Mn: 0.75 }, r: 'C 0.52–0.58, Si 0.15–0.35, Mn 0.60–0.90' },
  scr420: { name: 'SCr420', std: 'JIS G 4053', src: 'U006', x: { C: 0.205, Si: 0.25, Mn: 0.75, Cr: 1.05 }, r: 'C 0.18–0.23, Si 0.15–0.35, Mn 0.60–0.90, Cr 0.90–1.20' },
  scm415: { name: 'SCM415', std: 'JIS G 4053', src: 'U006', x: { C: 0.155, Si: 0.25, Mn: 0.75, Cr: 1.05, Mo: 0.20 }, r: 'C 0.13–0.18, Si 0.15–0.35, Mn 0.60–0.90, Cr 0.90–1.20, Mo 0.15–0.25' },
  scm435: { name: 'SCM435', std: 'JIS G 4053', src: 'U006', x: { C: 0.355, Si: 0.25, Mn: 0.75, Cr: 1.05, Mo: 0.225 }, r: 'C 0.33–0.38, Si 0.15–0.35, Mn 0.60–0.90, Cr 0.90–1.20, Mo 0.15–0.30' },
  scm440: { name: 'SCM440', std: 'JIS G 4053', src: 'U006', x: { C: 0.405, Si: 0.25, Mn: 0.75, Cr: 1.05, Mo: 0.225 }, r: 'C 0.38–0.43, Si 0.15–0.35, Mn 0.60–0.90, Cr 0.90–1.20, Mo 0.15–0.30' },
  sncm439: { name: 'SNCM439', std: 'JIS G 4053', src: 'JISF', x: { C: 0.395, Si: 0.25, Mn: 0.75, Ni: 1.80, Cr: 0.80, Mo: 0.225 }, r: 'C 0.36–0.43, Si 0.15–0.35, Mn 0.60–0.90, Ni 1.60–2.00, Cr 0.60–1.00, Mo 0.15–0.30' },
  suj2: { name: 'SUJ2', std: 'JIS G 4805', src: 'JT', x: { C: 1.025, Si: 0.25, Mn: 0.25, Cr: 1.45 }, half: ['Mn'], r: 'C 0.95–1.10, Si 0.15–0.35, Mn ≤ 0.50, Cr 1.30–1.60' },
  sk85: { name: 'SK85', std: 'JIS G 4401', src: 'U006', x: { C: 0.85, Si: 0.225, Mn: 0.30 }, r: 'C 0.80–0.90, Si 0.10–0.35, Mn 0.10–0.50' },
  sus420j2: { name: 'SUS420J2', std: 'JIS', src: 'JSSA', x: { C: 0.33, Si: 0.50, Mn: 0.50, Cr: 13.0 }, half: ['Si', 'Mn'], r: 'C 0.26–0.40, Si ≤ 1.00, Mn ≤ 1.00, Cr 12.00–14.00' },
  sus304: { name: 'SUS304', std: 'JIS', src: 'JSSA', x: { C: 0.04, Si: 0.50, Mn: 1.00, Ni: 9.25, Cr: 19.0 }, half: ['C', 'Si', 'Mn'], r: 'C ≤ 0.08, Si ≤ 1.00, Mn ≤ 2.00, Ni 8.00–10.50, Cr 18.00–20.00' },
};
export const GRADE_IDS = Object.keys(GRADES);
// 比べるための文献値: 成分の近い海外規格の鋼のデータシートの変態点(℃。同一の鋼ではない)
export const LIT = {
  s45c: { name: 'C45E (1.1191)', ac1: 725, ac3: 785, ms: 300, src: 'SWS' },
  scm440: { name: '42CrMo4 (1.7225)', ac1: 745, ac3: 790, ms: 335, mf: 80, src: 'LUC' },
};

// =====================================================================
// ここから画面
// =====================================================================
const form = document.getElementById('fe-c-form');
if (form) {
  const T = JSON.parse(form.dataset.text || '{}');
  const el = form.elements;
  const box = document.querySelector('[data-out="main"]');
  const home = document.documentElement.dataset.home ?? '/';
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const fmt = (s, o = {}) => String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (k in o ? o[k] : m));
  const optText = (name, v) => [...el[name].options].find(o => o.value === v)?.textContent ?? v;
  // 欄の値。数でないときは既定値、範囲の外は範囲の端に寄せ、どちらも adj に残して注意を出す(黙って別の値で計算しない)
  const adj = new Map();
  const val = (k, min = -Infinity, max = Infinity) => {
    const s = String(el[k].value).trim(), v = s === '' ? NaN : Number(s);
    if (!Number.isFinite(v)) { const d = Number(el[k].defaultValue); adj.set(k, d); return d; }
    if (v < min || v > max) { const cl = Math.min(max, Math.max(min, v)); adj.set(k, cl); return cl; }
    return v;
  };
  const COMMA = num(1.5, 2).includes(','); // de など小数点がコンマの言語
  const SEP = COMMA ? '; ' : ', ';
  // コードに直接書いた数値の小数点を言語に合わせる(dn)。並びの「, 」は「; 」にして小数のコンマと紛れないようにする(dl)。
  // de の num() は桁区切りを使わないので、計算値を含む文字列にかけても数を壊さない
  const dn = v => (COMMA ? String(v).replace(/(\d)\.(\d)/g, '$1,$2') : String(v));
  const dl = v => (COMMA ? dn(String(v).replace(/, /g, '; ')) : String(v));
  const DEG = /^(ja|zh|ko)/.test(document.documentElement.lang) ? '℃' : '°C'; // ja・zh・ko は ℃、en・de は °C(lever.js と同じ)
  const deg = v => (Number.isFinite(v) ? `${num(Math.round(v), 5)} ${DEG}` : '–');
  const pct = w => `${num(w * 100, 3)} %`;
  const wt = x => `${num(x, x < 0.1 ? 2 : 3)} wt%`;
  const n3 = (v, d = 3) => num(v, d);
  const mm = v => `${num(v, 3)} mm`;
  const csvNum = v => (typeof v === 'number' ? (Number.isFinite(v) ? Number(v.toPrecision(6)).toString() : '') : `"${String(v).replace(/"/g, '""')}"`);
  const SYM = { alpha: 'α', gamma: 'γ', delta: 'δ', L: 'L', cem: 'Fe₃C' };
  const LABEL = { L: 'L', Ld: 'L+δ', d: 'δ', dg: 'δ+γ', Lg: 'L+γ', g: 'γ', Lc: 'L+Fe₃C', gc: 'γ+Fe₃C', ag: 'α+γ', a: 'α', ac: 'α+Fe₃C', cem: 'Fe₃C' };

  // ---- 見た目(このツールだけの小さな CSS) ----
  const css = document.createElement('style');
  css.textContent = `
#fe-c-form .dy-field[hidden], #fe-c-form .fc-sub[hidden] { display: none !important; }
#fe-c-form .fc-wide { grid-column: 1 / -1; }
.fc-root .dy-stats { grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px; }
.fc-root .dy-stats dd { font-size: 1.1rem; overflow-wrap: anywhere; }
.fc-tabs { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 6px; margin: 0; }
.fc-tabs button { font: inherit; font-size: .88rem; font-weight: 600; padding: 8px 12px; border-radius: 999px; border: 1px solid var(--border); background: var(--bg); color: var(--text); cursor: pointer; min-height: 40px; }
.fc-tabs button[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); color: var(--surface); }
.fc-sub { grid-column: 1 / -1; margin: 6px 0 -4px; font-size: .85rem; font-weight: 700; color: var(--text); border-top: 1px solid var(--border); padding-top: 10px; }
.fc-root { --fc-1: #2a78d6; --fc-2: #eb6834; --fc-3: #1baf7a; --fc-4: #eda100; --fc-5: #e87ba4; --fc-6: #6250d6; }
@media (prefers-color-scheme: dark) { .fc-root { --fc-1: #3987e5; --fc-2: #d95926; --fc-3: #199e70; --fc-4: #c98500; --fc-5: #d55181; --fc-6: #9085e9; } }
.fc-root h3 { margin: 18px 0 8px; font-size: 1.02rem; }
.fc-root .fig { padding: 8px; }
.fc-root .fig svg { max-width: 640px; touch-action: pan-y; }
.fc-root .fig svg text { font-size: 13px; }
.fc-warn { margin: 8px 0; padding: 8px 12px; border-radius: 8px; font-size: .88rem; line-height: 1.6; background: var(--ng-bg); color: var(--text); border-left: 4px solid var(--ng); }
.fc-warn.soft { background: var(--accent-soft); border-left-color: var(--accent); }
.fc-legend { display: flex; flex-wrap: wrap; justify-content: center; gap: 4px 14px; margin: 6px 0 0; font-size: .82rem; color: var(--text); }
.fc-legend span { display: inline-flex; align-items: center; gap: 5px; }
.fc-legend svg { width: 26px; height: 10px; display: inline-block; margin: 0; }
.fc-read { margin: 6px 0 0; font-size: .82rem; color: var(--muted); text-align: center; min-height: 1.4em; font-variant-numeric: tabular-nums; }
.fc-steps { margin: 6px 0 0; padding-left: 1.3em; font-size: .88rem; line-height: 1.7; }
.fc-steps li { margin: 4px 0; }
.fc-steps code { display: block; white-space: pre-wrap; overflow-wrap: anywhere; font-size: .86rem; background: var(--bg); padding: 4px 8px; border-radius: 6px; color: var(--text); }
.fc-root .table-wrap { margin: .5rem 0; }
.fc-root .dy-table { font-size: .86rem; }
.fc-root .dy-table td.l, .fc-root .dy-table th.l { text-align: left; white-space: normal; }
.fc-root .dy-table th.l { min-width: 8em; }
.fc-root .dy-table td.l { min-width: 7em; }
.fc-root .dy-table tr.cur { background: var(--accent-soft); }
.fc-pick { margin-top: 4px; }
.fc-btns { display: flex; flex-wrap: wrap; gap: 8px; margin: 6px 0; }
.fc-ex { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin: 0 0 8px; font-size: .85rem; color: var(--muted); }
.fc-links { display: flex; flex-wrap: wrap; gap: 8px; margin: 10px 0 0; }
.fc-src { font-size: .8rem; color: var(--muted); margin: 4px 0 0; padding-left: 1.2em; }
.fc-src li { margin: 2px 0; }
.fc-assume { font-size: .84rem; color: var(--muted); margin: 6px 0; line-height: 1.6; }
.fc-ctl { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; margin: 4px 0 8px; font-size: .88rem; }
.fc-ctl label { display: flex; align-items: center; gap: 8px; flex: 1 1 220px; min-width: 0; }
.fc-ctl label > span { flex: none; white-space: nowrap; }
.fc-ctl input[type=range] { flex: 1 1 auto; min-width: 0; width: 100%; }
.fc-ctl output { font-variant-numeric: tabular-nums; min-width: 4.5em; }
.fc-safety { margin: 10px 0 0; padding: 8px 12px; border-radius: 8px; font-size: .84rem; line-height: 1.6; background: var(--accent-soft); color: var(--text); }
`;
  document.head.append(css);
  box.classList.add('fc-root');

  // ---- フォームの整え: タブ、副見出し、モードごとに見せる欄 ----
  const modeSel = el.mode;
  const modes = [...modeSel.options].map(o => o.value);
  const lab = n => el[n]?.closest('label');
  lab('mode').hidden = true;
  const tabs = document.createElement('div');
  tabs.className = 'fc-tabs';
  tabs.setAttribute('role', 'group');
  tabs.setAttribute('aria-label', lab('mode').querySelector('span').textContent);
  tabs.innerHTML = modes.map(m => `<button type="button" data-mode="${m}" aria-pressed="false">${esc(optText('mode', m))}</button>`).join('');
  form.querySelector('h2').after(tabs);
  const subs = {};
  for (const [before, key] of [['si', 'sub_alloy'], ['gs', 'sub_quench'], ['tt', 'sub_temper']]) {
    const p = document.createElement('p');
    p.className = 'fc-sub';
    p.textContent = T[key] ?? '';
    lab(before).before(p);
    subs[key] = p;
  }
  lab('grade').classList.add('fc-wide');
  lab('view').classList.add('fc-wide'); // 選択肢の文字が切れないように
  const ALLOY = ['si', 'mn', 'ni', 'cr', 'mo', 'v', 'w', 'cu', 'b'];
  const EKEY = { c: 'C', si: 'Si', mn: 'Mn', ni: 'Ni', cr: 'Cr', mo: 'Mo', v: 'V', w: 'W', cu: 'Cu', b: 'B' };
  const VIS = {
    diagram: ['grade', 'c', 't', 'view'],
    trans: ['grade', 'c', 'sub_alloy', 'si', 'mn', 'ni', 'cr', 'mo', 'v', 'w', 'cu'],
    harden: ['grade', 'c', 'sub_alloy', 'si', 'mn', 'ni', 'cr', 'mo', 'sub_quench', 'gs', 'qm', 'ag', 'hq', 'dbar'],
    temper: ['grade', 'c', 'sub_temper', 'tt', 'th', 'tt2', 'hjc'],
    weld: ['grade', 'c', 'sub_alloy', 'si', 'mn', 'ni', 'cr', 'mo', 'v', 'cu', 'b'],
    grade: ['grade'],
  };
  const visible = () => {
    const mode = modeSel.value, show = new Set(VIS[mode]);
    if (mode === 'harden') { if (el.qm.value === 'custom') show.delete('ag'); else show.delete('hq'); }
    for (const f of el) if (f.name && f.name !== 'mode' && lab(f.name)) lab(f.name).hidden = !show.has(f.name);
    for (const k in subs) subs[k].hidden = !show.has(k);
    tabs.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
  };
  tabs.addEventListener('click', e => {
    const b = e.target.closest('button[data-mode]');
    if (!b || b.dataset.mode === modeSel.value) return;
    modeSel.value = b.dataset.mode;
    form.dispatchEvent(new Event('change', { bubbles: true }));
    form.dispatchEvent(new Event('input', { bubbles: true }));
  });

  // ---- 鋼種の選択と成分の欄を合わせる ----
  const near = (a, b) => Math.abs(a - b) <= 1e-9 + Math.abs(b) * 1e-9;
  const fillGrade = id => {
    const g = GRADES[id];
    if (!g) return;
    el.c.value = String(g.x.C);
    for (const k of ALLOY) el[k].value = String(g.x[EKEY[k]] ?? 0);
  };
  const syncGrade = () => {
    const g = GRADES[el.grade.value];
    if (g && (!near(val('c', 0), g.x.C) || ALLOY.some(k => !near(val(k, 0), g.x[EKEY[k]] ?? 0)))) el.grade.value = 'custom';
  };
  // URL に鋼種だけがあって成分がない(?grade=scm440 など)ときは、その鋼種の成分を入れる。
  // tool-share.js が先に URL を全部の欄の値で書き換えるので、URL ではなく「成分の欄がすべて既定値のまま」で見分ける
  if (GRADES[el.grade.value] && ['c', ...ALLOY].every(k => String(el[k].value) === String(el[k].defaultValue))) { fillGrade(el.grade.value); setTimeout(() => form.dispatchEvent(new Event('change', { bubbles: true }))); }
  else syncGrade();
  form.addEventListener('input', e => {
    const t = e.target;
    if (t === el.grade) fillGrade(el.grade.value);
    else if (t === el.c || ALLOY.includes(t.name)) syncGrade();
  });
  form.addEventListener('change', e => { if (e.target === el.grade) fillGrade(el.grade.value); });
  const x = () => comp({ C: val('c', 0, CM), ...Object.fromEntries(ALLOY.map(k => [EKEY[k], val(k, 0, 100)])) });
  const gradeName = () => (GRADES[el.grade.value]?.name ?? null);

  // ---- 図(SVG。数値の軸の図)----
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
  const logTicks = (a, b) => { const out = []; for (let e = Math.ceil(a - 1e-9); e <= Math.floor(b + 1e-9); e++) out.push([10 ** e, Math.abs(e) <= 2 ? num(10 ** e, 3) : pow10(e)]); return out; };
  const sz = () => (box.clientWidth < 520 ? { W: 360, H: 270, l: 54, r: 10, t: 12, b: 40 } : { W: 640, H: 360, l: 66, r: 14, t: 14, b: 46 });
  const color = s => (s === 'ac' ? 'var(--text)' : s === 'mu' ? 'var(--muted)' : `var(--fc-${s})`);
  // o: { xr, yr(対数なら log10 の範囲), xlog, ylog, xlabel, ylabel, lines [{pts, slot, dash, w}], dots [{x, y, slot}], hl [{y, label}], vl [{x, label}], bands [{y0, y1}] }
  function plot(svg, o) {
    const g = sz();
    const [x0, x1] = o.xr, [y0, y1] = o.yr;
    const yt = o.yt ?? (o.ylog ? logTicks(y0, y1) : niceTicks(y0, y1, 5).map(v => [v, num(v, 4)]));
    const chw = t => [...String(t)].reduce((w, c) => w + (/[,.]/.test(c) ? 3.8 : /[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]/.test(c) ? 5 : 8.2), 0);
    const Lx = Math.max(g.l, Math.ceil(Math.max(0, ...yt.map(([, t]) => chw(t))) + 5 + 23)), Rr = g.W - g.r, Tt = g.t, Bb = g.H - g.b;
    const fx = v => (o.xlog ? Math.log10(v) : v), fy = v => (o.ylog ? Math.log10(v) : v);
    const X = v => Lx + ((fx(v) - x0) / (x1 - x0)) * (Rr - Lx), Y = v => Bb - ((fy(v) - y0) / (y1 - y0)) * (Bb - Tt);
    const id = svg.dataset.clip ?? (svg.dataset.clip = `fcc${Math.random().toString(36).slice(2, 8)}`);
    const path = pts => {
      let d = '', pen = false;
      for (const [px, py] of pts) {
        const xx = (o.xlog && !(px > 0)) ? NaN : X(px), yy = (o.ylog && !(py > 0)) ? NaN : Y(py);
        if (!Number.isFinite(yy) || !Number.isFinite(xx)) { pen = false; continue; }
        d += `${pen ? 'L' : 'M'}${xx.toFixed(1)},${Math.max(Tt - 400, Math.min(Bb + 400, yy)).toFixed(1)}`;
        pen = true;
      }
      return d;
    };
    const xt = o.xt ?? (o.xlog ? logTicks(x0, x1) : niceTicks(x0, x1, g.W < 400 ? 4 : 6).map(v => [v, num(v, 4)]));
    const xl = (v, t) => Math.min(g.W - chw(t) / 2 - 1, Math.max(Lx - 2 + chw(t) / 2, X(v))); // 左端の目盛りは縦軸の数字にかからないよう右へ
    let s = `<defs><clipPath id="${id}"><rect x="${Lx}" y="${Tt}" width="${Rr - Lx}" height="${Bb - Tt}"/></clipPath></defs>`;
    s += `<rect x="${Lx}" y="${Tt}" width="${Rr - Lx}" height="${Bb - Tt}" fill="var(--bg)"/>`;
    s += xt.map(([v, t]) => `<line x1="${X(v)}" y1="${Tt}" x2="${X(v)}" y2="${Bb}" stroke="var(--border)"/><text x="${xl(v, t)}" text-anchor="middle" y="${Bb + 16}" fill="var(--muted)">${esc(t)}</text>`).join('');
    s += yt.map(([v, t]) => `<line x1="${Lx}" y1="${Y(v)}" x2="${Rr}" y2="${Y(v)}" stroke="var(--border)"/><text x="${Lx - 5}" y="${Y(v) + 4}" fill="var(--muted)" text-anchor="end">${esc(t)}</text>`).join('');
    s += `<g clip-path="url(#${id})">`;
    for (const b of o.bands ?? []) { const ya = Y(b.y1), yb = Y(b.y0); s += `<rect x="${Lx}" y="${Math.min(ya, yb)}" width="${Rr - Lx}" height="${Math.abs(yb - ya)}" fill="var(--accent-soft)"/>`; }
    for (const b of o.vbands ?? []) { const xa = X(b.x0), xb = X(b.x1); s += `<rect x="${Math.min(xa, xb)}" y="${Tt}" width="${Math.abs(xb - xa)}" height="${Bb - Tt}" fill="var(--accent-soft)"/>`; }
    const placed = { l: [], r: [] }; // 同じ側のラベルが重ならないように、近ければ線の下に回す
    for (const h of o.hl ?? []) {
      const yy = Y(h.y), inside = yy >= Tt - 0.5 && yy <= Bb + 0.5, side = h.left ? 'l' : 'r';
      s += `<line x1="${Lx}" x2="${Rr}" y1="${yy}" y2="${yy}" stroke="${h.slot ? color(h.slot) : 'var(--muted)'}" stroke-dasharray="${h.dash ?? '3 3'}"/>`;
      if (!h.label || !inside) continue;
      const free = ty => ty - 11 >= Tt && ty <= Bb - 2 && placed[side].every(p => Math.abs(p - ty) >= 14);
      const ty = [yy - 4, yy + 14, yy - 18, yy + 28].find(free) ?? (yy - 17 < Tt ? yy + 14 : yy - 4);
      placed[side].push(ty);
      s += `<text x="${h.left ? Lx + 4 : Rr - 4}" y="${ty}" fill="var(--muted)" text-anchor="${h.left ? 'start' : 'end'}">${esc(h.label)}</text>`;
    }
    for (const v of o.vl ?? []) {
      const xx = X(v.x);
      s += `<line y1="${Tt}" y2="${Bb}" x1="${xx}" x2="${xx}" stroke="var(--muted)" stroke-dasharray="3 3"/>`;
      if (v.label && xx >= Lx - 0.5 && xx <= Rr + 0.5) { const right = Rr - xx >= xx - Lx; s += `<text x="${right ? xx + 4 : xx - 4}" y="${Tt + 14}" fill="var(--muted)" text-anchor="${right ? 'start' : 'end'}">${esc(v.label)}</text>`; }
    }
    for (const ln of o.lines ?? []) s += `<path d="${path(ln.pts)}" fill="none" stroke="${color(ln.slot)}" stroke-width="${ln.w ?? 2}"${ln.dash ? ` stroke-dasharray="${ln.dash}"` : ''} stroke-linejoin="round" stroke-linecap="round"/>`;
    for (const d of o.dots ?? []) { const xx = X(d.x), yy = Y(d.y); if (Number.isFinite(xx) && Number.isFinite(yy)) s += `<circle cx="${xx}" cy="${yy}" r="${d.r ?? 4.5}" fill="${color(d.slot)}" stroke="var(--surface)" stroke-width="2"/>`; }
    s += `<line data-fc="cross" x1="0" x2="0" y1="${Tt}" y2="${Bb}" stroke="var(--text)" stroke-width="1" visibility="hidden"/>`;
    s += '</g>';
    s += `<rect x="${Lx}" y="${Tt}" width="${Rr - Lx}" height="${Bb - Tt}" fill="none" stroke="var(--muted)" stroke-width="1"/>`;
    s += `<text x="${(Lx + Rr) / 2}" y="${g.H - 6}" fill="var(--text)" text-anchor="middle">${esc(o.xlabel)}</text>`;
    s += `<text x="13" y="${(Tt + Bb) / 2}" fill="var(--text)" text-anchor="middle" transform="rotate(-90 13 ${(Tt + Bb) / 2})">${esc(o.ylabel)}</text>`;
    svg.setAttribute('viewBox', `0 0 ${g.W} ${g.H}`);
    svg.innerHTML = s;
    return { X, Y, inv: px => { const v = x0 + ((px - Lx) / (Rr - Lx)) * (x1 - x0); return o.xlog ? 10 ** v : v; }, L: Lx, Rr };
  }
  const legend = items => items.map(it => `<span><svg viewBox="0 0 26 10" aria-hidden="true">${it.dot ? `<circle cx="13" cy="5" r="4" fill="${color(it.slot)}"/>` : `<line x1="1" y1="5" x2="25" y2="5" stroke="${color(it.slot)}" stroke-width="${it.w ?? 2.5}"${it.dash ? ` stroke-dasharray="${it.dash}"` : ''}/>`}</svg>${esc(it.label)}</span>`).join('');
  // 図の上で指を動かす・カーソルを置くと、その位置の値を読む。縦のスクロールは止めない
  function hover(svg, geo, readOut, onX) {
    const cross = svg.querySelector('[data-fc="cross"]');
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
  const figHTML = (key, label) => `<figure class="fig"><svg data-fc="${key}" role="img" aria-label="${esc(label)}"></svg><div class="fc-legend" data-fc="lg-${key}"></div><p class="fc-read" data-fc="rd-${key}"></p></figure>`;
  const q = s => box.querySelector(`[data-fc="${s}"]`);
  const setRead = (key, text) => { const r = q(`rd-${key}`); r.dataset.def = text; r.textContent = text; return r; };

  // ---- 表・コピー・式 ----
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
    return `<div class="table-wrap"><table class="dy-table"><thead><tr>${head.map((h, i) => `<th scope="col"${i === 0 || opts.left?.includes(i) ? ' class="l"' : ''}>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r, ri) => `<tr${opts.cur === ri ? ' class="cur"' : ''}>${r.map((c, i) => {
      const t = c && typeof c === 'object' ? c.t : typeof c === 'number' ? n3(c, 4) : c ?? '—';
      const html = c && typeof c === 'object' && c.html ? c.html : esc(t);
      return i === 0 ? `<th scope="row" class="l">${html}</th>` : `<td data-out="${name}-${ri}-${i}"${opts.left?.includes(i) ? ' class="l"' : ''}>${html}</td>`;
    }).join('')}</tr>`).join('')}</tbody></table></div>${opts.nocsv ? '' : `<div class="fc-btns"><button type="button" class="btn btn-ghost btn-small" data-csv="${name}">${esc(T.csv)}</button></div>`}`;
  };
  const stats = items => `<dl class="dy-stats">${items.filter(Boolean).map(([k, l, v]) => `<div><dt>${esc(l)}</dt><dd data-out="${k}">${esc(v)}</dd></div>`).join('')}</dl>`;
  let stepsOpen = false;
  const steps = items => `<details class="fc-stepbox"${stepsOpen ? ' open' : ''}><summary>${esc(T.steps)}</summary><ol class="fc-steps">${items.filter(Boolean).map(([l, f]) => `<li>${esc(l)}${f ? `<code>${esc(dl(f))}</code>` : ''}</li>`).join('')}</ol></details>`;
  box.addEventListener('toggle', e => { if (e.target.classList?.contains('fc-stepbox')) stepsOpen = e.target.open; }, true);
  const warnHTML = list => list.filter(Boolean).map(w => `<p class="fc-warn${w.soft ? ' soft' : ''}" data-fc-warn>${esc(w.text)}</p>`).join('');
  const link = (path, text) => `<a class="btn btn-ghost btn-small" href="${home}${path}">${esc(text)} →</a>`;
  const assume = text => `<p class="fc-assume">${esc(text)}</p>`;
  const SRC = T.src ?? {};
  const srcList = keys => { const ks = [...new Set(keys.filter(Boolean))]; return ks.length ? `<ul class="fc-src">${ks.map(k => `<li>${esc(SRC[k] ?? k)}</li>`).join('')}</ul>` : ''; };
  const safety = () => `<p class="fc-safety">${esc(T.safety)}</p>`;
  const compLine = c0 => ELS.filter(e => c0[e] > 0).map(e => `${e} ${num(c0[e], 4)}`).join(SEP) || '—';
  // 例題(鋼種)のボタン
  const exHTML = () => `<div class="fc-ex"><span>${esc(T.examples)}</span>${['s45c', 'scm440', 'sncm439', 'suj2'].map(k => `<button type="button" class="btn btn-ghost btn-small" data-grade="${k}">${esc(GRADES[k].name)}</button>`).join('')}</div>`;
  const loadGrade = (id, mode) => {
    if (!GRADES[id]) return;
    el.grade.value = id; fillGrade(id);
    if (mode) modeSel.value = mode;
    form.dispatchEvent(new Event('change', { bubbles: true }));
    form.dispatchEvent(new Event('input', { bubbles: true }));
  };
  box.addEventListener('click', async e => {
    const b = e.target.closest('[data-csv]');
    if (b) {
      const t = tables[b.dataset.csv];
      if (t && await copyText([t.head, ...t.rows].map(r => r.map(csvNum).join(',')).join('\n'))) flash(b, T.copied);
      return;
    }
    const g = e.target.closest('[data-grade]');
    if (g) { loadGrade(g.dataset.grade, g.dataset.go || null); return; }
    const p = e.target.closest('[data-play]');
    if (p) play();
  });

  // =========== diagram: 状態図 ===========
  let W, Hh, m, pw, ph;
  const dsize = () => {
    const small = box.clientWidth < 440;
    [W, Hh, m] = small ? [340, 300, { l: 54, r: 10, t: 12, b: 40 }] : [480, 400, { l: 58, r: 14, t: 14, b: 46 }]; // 縦軸の名前と目盛りが重ならない幅
    pw = W - m.l - m.r; ph = Hh - m.t - m.b;
    return small;
  };
  const view = () => (el.view.value === 'steel' ? 2.2 : CM);
  const DX = c => m.l + c / view() * pw, DY = t => m.t + (1600 - t) / 1200 * ph;
  const dpts = list => list.map(([c, t]) => `${DX(c).toFixed(1)},${DY(t).toFixed(1)}`).join(' ');
  const temps = (lo, hi) => { const a = []; for (let k = 0; k <= 60; k++) a.push(lo + (hi - lo) * k / 60); return a; };
  const curve = (f, lo, hi) => temps(lo, hi).map(t => [f(t), t]);
  const seg = (c0, t0, c1, t1) => [[c0, t0], [c1, t1]];
  const dlines = [
    curve(L.liqL, TP, TA), curve(L.solD, TP, TA), curve(L.dG, TN, TP), curve(L.gD, TN, TP), seg(H, TP, B, TP),
    curve(L.liqM, TE, TP), curve(L.solG, TE, TP), seg(E, TE, CM, TE), curve(L.a3, TS, TG), curve(L.gp, TS, TG),
    curve(L.acm, TS, TE), seg(P, TS, CM, TS), curve(L.pq, 400, TS), seg(CM, 400, CM, TD),
  ];
  const regionPoly = r => {
    const ts = [...new Set([...temps(r.lo, r.hi), TN, TG, TE, TP, TA, TD].filter(t => t >= r.lo && t <= r.hi))].sort((a, b) => a - b);
    return dpts([...ts.map(t => [r.l(t), t]), ...ts.reverse().map(t => [r.r(t), t])]);
  };
  // 拡大表示では、小さい領域にも名前を出す(細い領域は引き出し線つき: [文字の c, t, 指す点の c, t])
  const steelAt = { L: [1.6, 1560], Ld: [1.0, 1572, 0.24, 1503], d: [0.35, 1568, 0.02, 1460], dg: [0.5, 1430, 0.06, 1440], Lg: [1.38, 1370], g: [1.0, 1100],
    gc: [1.8, 880], ag: [0.24, 780], a: [0.3, 640, 0.006, 640], ac: [1.2, 560] };
  const fullShow = ['L', 'Lg', 'g', 'Lc', 'gc', 'ac'];
  function diagramSVG(c, t, loc) {
    const steel = view() === 2.2;
    const small = W < 400;
    const xt = steel ? [0, 0.4, 0.8, 1.2, 1.6, 2.0] : small ? [0, 1, 2, 3, 4, 5] : [0, 1, 2, 3, 4, 5, 6];
    const yt = [400, 600, 800, 1000, 1200, 1400, 1600];
    const hl = loc?.key && regions[loc.key] ? `<polygon class="band" points="${regionPoly(regions[loc.key])}"/>` : '';
    const labels = (steel ? Object.keys(steelAt) : fullShow).map(k => {
      const [lc, lt, ac, at] = steel ? steelAt[k] : regions[k].at;
      const lead = ac == null ? '' : `<line class="thin" x1="${DX(ac).toFixed(1)}" y1="${DY(at).toFixed(1)}" x2="${(DX(lc) - 12).toFixed(1)}" y2="${(DY(lt) - 4).toFixed(1)}"/>`;
      return `${lead}<text class="sm" x="${DX(lc).toFixed(1)}" y="${DY(lt).toFixed(1)}" text-anchor="middle">${LABEL[k]}</text>`;
    }).join('');
    const keys = [[S, TS, T.pt_eutectoid, 6, 15], [C, TE, T.pt_eutectic, 6, 15], [J, TP, T.pt_peritectic, (B - J) / view() * pw + 6, -5]].filter(([kc], i) => kc <= view() && (i < 2 || (steel && !small)))
      .map(([kc, kt, name, dx, dy]) => `<circle class="ink" cx="${DX(kc).toFixed(1)}" cy="${DY(kt).toFixed(1)}" r="3.5"/><text class="sm a" x="${(DX(kc) + dx).toFixed(1)}" y="${(DY(kt) + dy).toFixed(1)}">${esc(name)}</text>`).join('');
    const temps0 = [[TG, '912'], [TE, `1147 ${DEG}`], [TN, '1394'], [TA, '1538']].map(([tt, s]) => `<text class="sm m" x="${m.l + 4}" y="${(DY(tt) - 4).toFixed(1)}">${s}</text>`).join('');
    const tl = `<text class="sm m" x="${W - m.r - 4}" y="${(DY(TS) - 4).toFixed(1)}" text-anchor="end">727 ${DEG}</text>`;
    let mark = '';
    if (c <= view()) {
      // 冷やしていく道筋(この炭素量の縦の線)
      mark += `<line class="dash" x1="${DX(c).toFixed(1)}" y1="${DY(1600).toFixed(1)}" x2="${DX(c).toFixed(1)}" y2="${DY(400).toFixed(1)}"/>`;
      if (loc?.phases?.length === 2) {
        const [ca, cb] = [loc.phases[0][1], loc.phases[1][1]];
        mark += `<line class="ac" x1="${DX(ca).toFixed(1)}" y1="${DY(t).toFixed(1)}" x2="${DX(Math.min(cb, view())).toFixed(1)}" y2="${DY(t).toFixed(1)}"/>`
          + [ca, cb].filter(v => v <= view()).map(v => `<circle class="hole" cx="${DX(v).toFixed(1)}" cy="${DY(t).toFixed(1)}" r="4"/>`).join('');
      }
      if (loc) mark += `<circle class="fa" cx="${DX(c).toFixed(1)}" cy="${DY(t).toFixed(1)}" r="6"/>`;
    }
    return `<svg viewBox="0 0 ${W} ${Hh}" data-plot="${m.l} ${m.t} ${pw} ${ph}" role="img" aria-labelledby="fec-title" style="touch-action: manipulation; cursor: crosshair">
  <title id="fec-title">${esc(T.chart_title)}</title>
  <defs><clipPath id="fec-clip"><rect x="${m.l}" y="${m.t}" width="${pw}" height="${ph}"/></clipPath></defs>
  <rect class="ok" x="${m.l}" y="${m.t}" width="${pw}" height="${ph}"/>
  <g clip-path="url(#fec-clip)">${hl}
    ${yt.slice(1, -1).map(y => `<line class="thin" stroke-dasharray="2 4" x1="${m.l}" x2="${m.l + pw}" y1="${DY(y)}" y2="${DY(y)}"/>`).join('')}
    ${dlines.map(l => `<polyline class="ln" points="${dpts(l)}"/>`).join('')}
    <polyline class="dash" points="${dpts(curve(L.liqR, TE, TD))}"/>
    ${labels}${keys}${temps0}${tl}${mark}
  </g>
  ${xt.map(v => `<text class="sm m" x="${DX(v).toFixed(1)}" y="${Hh - m.b + 16}" text-anchor="middle">${num(v)}</text>`).join('')}
  ${steel ? '' : `<text class="sm a" x="${DX(CM).toFixed(1)}" y="${Hh - m.b + 16}" text-anchor="end">Fe₃C</text>`}
  ${yt.map(y => `<text class="sm m" x="${m.l - 4}" y="${DY(y) + 4}" text-anchor="end">${y}</text>`).join('')}
  <text class="sm" x="${m.l + pw / 2}" y="${Hh - 8}" text-anchor="middle">${esc(T.axis_c)}</text>
  <text class="sm" transform="translate(${small ? 14 : 16} ${m.t + ph / 2}) rotate(-90)" text-anchor="middle">${esc(T.axis_t)}</text>
</svg>`;
  }
  // 図をクリック・タップした点を入力欄へ
  function pick(e) {
    const svg = e.currentTarget, p = svg.createSVGPoint();
    p.x = e.clientX; p.y = e.clientY;
    const qq = p.matrixTransform(svg.getScreenCTM().inverse());
    if (qq.x < m.l || qq.x > m.l + pw || qq.y < m.t || qq.y > m.t + ph) return;
    const c = Math.min(CM, Math.max(0, (qq.x - m.l) / pw * view())), t = 1600 - (qq.y - m.t) / ph * 1200;
    stopPlay();
    el.c.value = String(Math.round(c * 100) / 100);
    el.t.value = String(Math.round(t));
    syncGrade();
    form.dispatchEvent(new Event('input', { bubbles: true }));
  }
  // 温度のつまみ(図の下。描き直しで消えないよう、本体とは別に持つ)と、1600 ℃から 400 ℃まで冷やして見せるボタン
  let ctl = null, timer = 0;
  const ensureCtl = () => {
    if (!ctl || !box.contains(ctl)) {
      box.innerHTML = '';
      ctl = document.createElement('div');
      ctl.innerHTML = `<div data-fc="dtop"></div><div class="fc-ctl"><label><span>${esc(T.slider)}</span><input type="range" data-fc="slide" min="400" max="1600" step="1" aria-label="${esc(T.slider)}"><output data-fc="slideout"></output></label><button type="button" class="btn btn-ghost btn-small" data-play>${esc(T.play)}</button></div>`;
      const body = document.createElement('div');
      body.dataset.fc = 'dbody';
      box.append(ctl, body);
      ctl.querySelector('[data-fc="slide"]').addEventListener('input', ev => { stopPlay(); el.t.value = ev.target.value; form.dispatchEvent(new Event('input', { bubbles: true })); });
    }
    return { top: ctl.querySelector('[data-fc="dtop"]'), body: q('dbody'), slide: ctl.querySelector('[data-fc="slide"]'), out: ctl.querySelector('[data-fc="slideout"]'), btn: ctl.querySelector('[data-play]') };
  };
  function stopPlay() { if (timer) { clearInterval(timer); timer = 0; const b = ctl?.querySelector('[data-play]'); if (b) b.textContent = T.play; } }
  function play() {
    if (timer) { stopPlay(); return; }
    let t = val('t', 400, 1600);
    if (t <= 405) t = 1600;
    el.t.value = String(t);
    const b = ctl?.querySelector('[data-play]');
    if (b) b.textContent = T.stop;
    timer = setInterval(() => {
      t -= 10;
      if (t < 400 || modeSel.value !== 'diagram') { stopPlay(); return; }
      el.t.value = String(t);
      form.dispatchEvent(new Event('input', { bubbles: true }));
    }, 120);
  }
  function renderDiagram() {
    const raw = k => { const v = Number(String(el[k].value).trim() || NaN); return Number.isFinite(v) ? v : Number(el[k].defaultValue); };
    const c = raw('c'), t = raw('t'); // 範囲外は locate が null を返し、T.out_range を出す(HEAD と同じ)
    dsize();
    const parts = ensureCtl();
    parts.slide.value = String(t);
    parts.out.textContent = deg(t);
    const loc = locate(c, t), mc = micro(c);
    // 図と、その点の結果
    let top = '';
    if (gradeName() && x().Cr + x().Ni + x().Mn + x().Mo > 0.01) top += warnHTML([{ soft: true, text: fmt(T.w_alloy_diagram, { g: gradeName() }) }]);
    top += `<div class="fig">${diagramSVG(c, t, loc)}</div><p class="muted">${esc(!loc ? T.out_range : c > view() ? T.hidden : T.tap)}</p>`;
    parts.top.innerHTML = top;
    parts.top.querySelector('svg').addEventListener('click', pick);
    const crit = upperCrit(c);
    let h = stats([
      ['phase', T.phase, !loc ? '–' : loc.inv ? loc.inv.phases.map(p => SYM[p[0]]).join(' + ') : loc.phases.map(p => SYM[p[0]]).join(' + ')],
      ['kind', T.kind, mc ? T[`kind_${mc.kind}`] : '–'],
      ['crit', c <= S ? T.o_a3 : T.o_acm, c <= E && c > P ? deg(crit) : '–'],
      ['a1', T.o_a1, c > P && c <= CM ? deg(TS) : '–'],
    ]);
    // その点のタイラインとてこの規則
    h += `<h3>${esc(T.tie_heading)}</h3>`;
    if (!loc) h += `<p>${esc(T.out_range)}</p>`;
    else if (loc.inv) h += `<p>${esc(T[`inv_${loc.inv.key}`])}</p>` + tableHTML('tie', [T.col_phase, T.col_comp, T.col_frac], loc.inv.phases.map(([p, xx]) => [T[`ph_${p}`], wt(xx), '–']));
    else {
      let note = T.single;
      if (loc.phases.length === 2) {
        const [[pa, ca], [pb, cb]] = loc.phases, f = v => num(v, v < 0.1 ? 2 : 3);
        note = `${T.two} W(${SYM[pa]}) = (C${SYM[pb]} − C₀)/(C${SYM[pb]} − C${SYM[pa]}) = (${f(cb)} − ${f(c)})/(${f(cb)} − ${f(ca)}) = ${num(loc.phases[0][2], 3)}`;
      }
      h += `<p>${esc(note)}</p>` + tableHTML('tie', [T.col_phase, T.col_comp, T.col_frac], loc.phases.map(([p, xx, w]) => [T[`ph_${p}`], { t: wt(xx), v: xx }, { t: pct(w), v: w }]));
    }
    // 冷やしていく道筋
    h += `<h3>${esc(T.h_cool)}</h3>${figHTML('cool', T.h_cool)}`;
    const ev = coolEvents(c);
    h += tableHTML('events', [T.c_temp, T.c_change], ev.map(e => [{ t: deg(e.t), v: Math.round(e.t * 10) / 10 }, e.inv ? `${T[`inv_short_${e.inv}`]}: ${LABEL[e.from] ?? '–'} → ${LABEL[e.to] ?? '–'}` : `${LABEL[e.from] ?? '–'} → ${LABEL[e.to] ?? '–'}`]), { left: [1] });
    h += assume(T.a_cool);
    // 平衡のときの室温の組織(途中の式つき)
    h += `<h3>${esc(T.micro_heading)}</h3>`;
    if (mc) {
      const rows = mc.parts.map(([k, w]) => [T[`m_${k}`], { t: pct(w), v: w }]);
      rows.push([T.m_total_a, { t: pct(mc.total[0]), v: mc.total[0] }], [T.m_total_c, { t: pct(mc.total[1]), v: mc.total[1] }]);
      h += tableHTML('micro', [T.col_micro, T.col_frac], rows) + `<p class="muted">${esc(T[`mnote_${mc.kind}`] ?? '')} ${esc(T.mnote)}</p>`;
      const f = v => num(v, 4);
      const st = [];
      if (mc.kind === 'hypo') st.push([T.s_pro_a, `W(${T.m_pro_a}) = (C_S − C₀)/(C_S − C_P) = (${f(S)} − ${f(c)})/(${f(S)} − ${f(P)}) = ${f(mc.parts[0][1])}`], [T.s_pearl, `W(${T.m_pearlite}) = 1 − ${f(mc.parts[0][1])} = ${f(mc.parts[1][1])}`]);
      if (mc.kind === 'hyper') st.push([T.s_pro_c, `W(${T.m_pro_c}) = (C₀ − C_S)/(C_Fe₃C − C_S) = (${f(c)} − ${f(S)})/(${f(CM)} − ${f(S)}) = ${f(mc.parts[0][1])}`], [T.s_pearl, `W(${T.m_pearlite}) = 1 − ${f(mc.parts[0][1])} = ${f(mc.parts[1][1])}`]);
      if (c > P) st.push([T.s_total, `W(α) = (C_Fe₃C − C₀)/(C_Fe₃C − C_P) = (${f(CM)} − ${f(c)})/(${f(CM)} − ${f(P)}) = ${f(mc.total[0])}`]);
      if (st.length) h += steps(st);
    } else h += `<p>${esc(T.out_range)}</p>`;
    // 主な点の値と出典
    h += `<h3>${esc(T.h_points)}</h3>`;
    const PTS = [
      [T.pt_a, '0', '1538', 'Raabe, NJIT', '1536–1538'], [T.pt_n, '0', '1394', 'Raabe, NJIT', '1392–1394'], [T.pt_g, '0', '912', 'Raabe, NJIT', '911–912'],
      [T.pt_peri, 'δ 0.09 / γ 0.17 / L 0.53', '1495', 'Raabe, ULL', '1493–1495'], [T.pt_e, '2.14', '1147', 'Raabe, UW MSE 170', '2.06–2.14 wt%'],
      [T.pt_c, '4.30', '1147', 'Raabe, UW MSE 170', `1147–1148 ${DEG}`], [T.pt_p, '0.022', '727', 'UW MSE 170, Raabe', '—'], [T.pt_s, '0.76', '727', 'UW MSE 170, Raabe', '0.76–0.80 wt%'],
      [T.pt_q, '0.002', '20', 'chemie.de', T.r_schem], [T.pt_cm, '6.70', '—', 'UW MSE 170 (Callister)', '6.67–6.70 wt%'],
    ];
    h += tableHTML('points', [T.c_point, T.c_wtc, T.c_tc, T.c_src, T.c_lit], PTS.map(r => [r[0], dn(r[1]), r[2], r[3], dn(r[4])]), { left: [1, 3, 4] });
    h += assume(T.a_points);
    h += `<div class="fc-links">${link('tools/lever-rule-calculator/', T.ln_lever)}${link('tools/diffusion-coefficient-calculator/', T.ln_diff)}${link('materials/?m=fe#md-card', T.ln_mat_fe)}</div>`;
    parts.body.innerHTML = h;
    // 冷やしていく道筋の図: 温度(横軸、左が高温)と各相の質量分率
    const path = coolPath(c, 2);
    const slots = { L: 1, delta: 5, gamma: 2, alpha: 3, cem: 4 };
    const present = PHASES.filter(p => path.some(r => r.f[p] > 1e-6));
    const lines = present.map(p => ({ pts: path.map(r => [r.t, r.f[p] * 100]), slot: slots[p], w: 2.2 }));
    const pearl = c > P && c <= E ? [{ pts: path.filter(r => r.t < TS).map(r => [r.t, micro(c).parts.find(z => z[0] === 'pearlite')?.[1] * 100 || 0]), slot: 6, dash: '6 4', w: 2 }] : [];
    const g = plot(q('cool'), { xr: [1600, 400], yr: [0, 100], xlabel: T.axis_t, ylabel: T.ax_frac, lines: [...lines, ...pearl], vl: [{ x: t, label: deg(t) }], xt: [1600, 1400, 1200, 1000, 800, 600, 400].map(v => [v, String(v)]) });
    q('lg-cool').innerHTML = legend([...present.map(p => ({ slot: slots[p], label: T[`ph_${p}`] })), ...(pearl.length ? [{ slot: 6, dash: '6 4', label: T.m_pearlite }] : [])]);
    hover(q('cool'), g, setRead('cool', T.read_hint), tt => { const r = path.reduce((a, b) => (Math.abs(b.t - tt) < Math.abs(a.t - tt) ? b : a)); return `${deg(r.t)}: ${present.map(p => `${SYM[p]} ${num(r.f[p] * 100, 3)} %`).join(SEP)}`; });
  }

  // =========== trans: 変態点 ===========
  const outTxt = list => (list.length ? fmt(T.r_out, { e: list.join(', ') }) : T.r_ok);
  function renderTrans() {
    const xx = x(), r = transTemps(xx);
    const crit = upperCrit(xx.C);
    const msMain = r.ms_and.v, mf = msMain - MF_DROP;
    const ws = [];
    const anyOut = Object.values(r).some(v => v.out.length);
    if (anyOut) ws.push({ text: T.w_trans_out });
    if (xx.Cr > 5 || xx.Ni > 5) ws.push({ text: T.w_high_alloy });
    if (xx.C > E) ws.push({ text: T.w_cast });
    let h = exHTML() + warnHTML(ws);
    h += stats([
      ['ac1', T.o_ac1, deg(r.ac1_and.v)], ['ac3', T.o_ac3, xx.C < S ? deg(r.ac3_and.v) : '–'],
      ['ms', T.o_ms, deg(msMain)], ['mf', T.o_mf, deg(mf)],
    ]);
    const rows = [
      [T.f_ac1_and, { t: deg(r.ac1_and.v), v: r.ac1_and.v }, outTxt(r.ac1_and.out), r.ac1_and.unused.join(', ') || '—', 'Andrews 1965'],
      [T.f_ac1_trz, { t: deg(r.ac1_trz.v), v: r.ac1_trz.v }, outTxt(r.ac1_trz.out), r.ac1_trz.unused.join(', ') || '—', 'Trzaska 2016'],
      [T.f_ac3_and, { t: deg(r.ac3_and.v), v: r.ac3_and.v }, outTxt(r.ac3_and.out), r.ac3_and.unused.join(', ') || '—', 'Andrews 1965'],
      [T.f_ms_and, { t: deg(r.ms_and.v), v: r.ms_and.v }, outTxt(r.ms_and.out), r.ms_and.unused.join(', ') || '—', 'Andrews 1965'],
      [T.f_ms_andp, { t: deg(r.ms_andp.v), v: r.ms_andp.v }, outTxt(r.ms_andp.out), r.ms_andp.unused.join(', ') || '—', 'Andrews 1965'],
      [T.f_ms_sh, { t: deg(r.ms_sh.v), v: r.ms_sh.v }, outTxt(r.ms_sh.out), r.ms_sh.unused.join(', ') || '—', 'Steven & Haynes 1956'],
      [T.f_mf, { t: deg(mf), v: mf }, '—', '—', 'MacKenzie 2025 (Grange & Stewart 1946)'],
      [T.f_fe_a1, { t: deg(TS), v: TS }, T.r_binary, '—', T.this_diagram],
      [xx.C <= S ? T.f_fe_a3 : T.f_fe_acm, { t: deg(crit), v: crit }, T.r_binary, '—', T.this_diagram],
    ];
    const lit = LIT[el.grade.value];
    if (lit) h += `<h3>${esc(fmt(T.h_lit, { g: GRADES[el.grade.value].name, n: lit.name }))}</h3>` + tableHTML('lit', [T.c_point, T.c_this, T.c_datasheet], [
      ['Ac1', deg(r.ac1_and.v), deg(lit.ac1)], ['Ac3', deg(r.ac3_and.v), deg(lit.ac3)], ['Ms', deg(msMain), deg(lit.ms)], ...(lit.mf ? [['Mf', deg(mf), deg(lit.mf)]] : []),
    ], { nocsv: true }) + assume(T.a_lit);
    h += `<h3>${esc(T.h_trans)}</h3>` + tableHTML('trans', [T.c_formula, T.c_value, T.c_range, T.c_unused, T.c_src], rows, { left: [2, 3, 4] });
    const mss = [r.ms_and.v, r.ms_andp.v, r.ms_sh.v], spread = Math.max(...mss) - Math.min(...mss);
    const acs = [r.ac1_and.v, r.ac1_trz.v];
    h += `<p>${esc(fmt(T.t_spread, { ms: num(Math.round(spread * 10) / 10, 4), ac1: num(Math.round(Math.abs(acs[0] - acs[1]) * 10) / 10, 4) }))}</p>`;
    // マルテンサイトの分率(Koistinen–Marburger)
    h += `<h3>${esc(T.h_km)}</h3>${figHTML('km', T.h_km)}`;
    const kmRows = [0.1, 0.5, 0.9, 0.99].map(f => [`${num(f * 100, 3)} %`, { t: deg(kmTemp(msMain, f)), v: kmTemp(msMain, f) }]);
    const f20 = kmFrac(msMain, 20), f0 = kmFrac(msMain, 0), fm = kmFrac(msMain, -80);
    h += stats([['f20', T.o_f20, msMain > 20 ? pct(f20) : '0 %'], ['ra20', T.o_ra20, msMain > 20 ? pct(1 - f20) : '100 %'], ['fm80', T.o_fm80, pct(fm)]]);
    h += tableHTML('km', [T.c_frac_m, T.c_temp], kmRows);
    h += assume(T.a_km);
    const f = v => num(v, 4);
    h += steps([
      [T.s_ac1_and, `Ac1 = 723 − 10.7·Mn − 16.9·Ni + 29.1·Si + 16.9·Cr + 6.38·W = 723 − 10.7×${f(xx.Mn)} − 16.9×${f(xx.Ni)} + 29.1×${f(xx.Si)} + 16.9×${f(xx.Cr)} + 6.38×${f(xx.W)} = ${f(r.ac1_and.v)} ${DEG}`],
      [T.s_ac1_trz, `Ac1 = 741.9 − 29.1·C − 14.0·Mn + 12.6·Si + 15.9·Cr − 16.8·Ni − 16.2·Mo + 45.2·V + 36.3·Cu = ${f(r.ac1_trz.v)} ${DEG}`],
      [T.s_ac3_and, `Ac3 = 910 − 203·√C − 15.2·Ni + 44.7·Si + 104·V + 31.5·Mo + 13.1·W = 910 − 203×√${f(xx.C)} − 15.2×${f(xx.Ni)} + 44.7×${f(xx.Si)} + 104×${f(xx.V)} + 31.5×${f(xx.Mo)} + 13.1×${f(xx.W)} = ${f(r.ac3_and.v)} ${DEG}`],
      [T.s_ms_and, `Ms = 539 − 423·C − 30.4·Mn − 17.7·Ni − 12.1·Cr − 7.5·Mo = 539 − 423×${f(xx.C)} − 30.4×${f(xx.Mn)} − 17.7×${f(xx.Ni)} − 12.1×${f(xx.Cr)} − 7.5×${f(xx.Mo)} = ${f(r.ms_and.v)} ${DEG}`],
      [T.s_ms_andp, `Ms = 512 − 453·C − 16.9·Ni + 15·Cr − 9.5·Mo + 217·C² − 71.5·C·Mn − 67.6·C·Cr = ${f(r.ms_andp.v)} ${DEG}`],
      [T.s_ms_sh, `Ms = 561 − 474·C − 33·Mn − 17·Ni − 17·Cr − 21·Mo = ${f(r.ms_sh.v)} ${DEG}`],
      [T.s_mf, `Mf ≈ Ms − 215 = ${f(msMain)} − 215 = ${f(mf)} ${DEG}`],
      [T.s_km, `f = 1 − exp(−0.011 × (Ms − T)) → T(50 %) = Ms − ln2/0.011 = ${f(msMain)} − ${f(Math.LN2 / KM)} = ${f(kmTemp(msMain, 0.5))} ${DEG}`],
    ]);
    h += `<h3>${esc(T.h_range)}</h3>` + tableHTML('ranges', [T.c_formula, T.c_range_def], [
      [T.f_ac1_and + ' / ' + T.f_ac3_and, dl('C < 0.6')],
      [T.f_ac1_trz, dl('C 0.06–0.68, Mn 0.13–2.04, Si 0.12–1.75, Cr ≤ 2.30, Ni ≤ 3.85, Mo ≤ 1.05, V ≤ 0.38, Cu ≤ 0.38 / Mn+Cr ≤ 3.6, Mn+Cr+Ni ≤ 5.6, Cr+Ni ≤ 5.3, Mn+Ni ≤ 4.5')],
      [T.f_ms_and + ' / ' + T.f_ms_andp, dl('C 0.1–0.6, Mn < 5, Cr < 5, Ni < 5, Si < 2, Mo < 5.4')],
      [T.f_ms_sh, dl('C 0.1–0.55, Mn 0.2–1.67, Si 0.1–1.7, Ni < 5, Cr < 3.3, Mo < 1')],
    ], { left: [1], nocsv: true });
    h += assume(T.a_ac3_extra);
    h += assume(T.a_trans);
    h += srcList(['AND', 'GORNI', 'COMSOL', 'TRZ', 'SH', 'KR', 'EAH', 'MCK', 'KMB', ...(LIT[el.grade.value] ? [LIT[el.grade.value].src] : [])]);
    h += safety();
    box.innerHTML = h;
    // 図: 縦軸 温度、横軸 マルテンサイトの分率(Koistinen–Marburger)。Ac3・Ac1・Ms・Mf・室温の線
    const tlo = Math.min(-100, Math.floor((msMain - 450) / 100) * 100), pts = [];
    for (let k = 0; k <= 200; k++) { const tt = msMain - (msMain - tlo) * k / 200; pts.push([kmFrac(msMain, tt) * 100, tt]); }
    const top = Math.max(1000, Math.ceil((r.ac3_and.v + 50) / 100) * 100);
    const g = plot(q('km'), { xr: [0, 100], yr: [tlo, top], xlabel: T.ax_mfrac, ylabel: T.axis_t,
      lines: [{ pts: [[0, top], [0, msMain]], slot: 'mu', w: 1.5 }, { pts, slot: 1, w: 2.5 }],
      hl: [...(xx.C < S ? [{ y: r.ac3_and.v, label: `Ac3 ${deg(r.ac3_and.v)}`, slot: 2, dash: '6 3' }] : []), { y: r.ac1_and.v, label: `Ac1 ${deg(r.ac1_and.v)}`, slot: 3, dash: '6 3' },
        { y: msMain, label: `Ms ${deg(msMain)}`, slot: 1, dash: '2 2', left: true }, { y: mf, label: `Mf ≈ ${deg(mf)}`, slot: 'mu', left: true }, { y: 20, label: `20 ${DEG}`, slot: 'mu' }],
      dots: [{ x: f20 * 100, y: 20, slot: 1 }] });
    q('lg-km').innerHTML = legend([{ slot: 1, label: T.lg_km }, ...(xx.C < S ? [{ slot: 2, dash: '6 3', label: 'Ac3 (Andrews)' }] : []), { slot: 3, dash: '6 3', label: 'Ac1 (Andrews)' }]);
    hover(q('km'), g, setRead('km', T.read_hint_km), fx => { const ff = Math.min(0.9999, Math.max(0, fx / 100)); return `${num(fx, 3)} % → ${deg(kmTemp(msMain, ff))}`; });
  }

  // =========== harden: 焼入れ性 ===========
  const qH = () => {
    const qm = el.qm.value;
    if (qm === 'custom') { const hh = val('hq', 0.01, 1000); return { lo: hh, hi: hh, label: `H = ${num(hh, 3)} in⁻¹` }; }
    const r = HQ[qm]?.[el.ag.value];
    return r ? { lo: r[0], hi: r[1], label: `${optText('qm', qm)} · ${optText('ag', el.ag.value)}` } : null;
  };
  function renderHarden() {
    const xx = x(), gs = Number(el.gs.value), r = idealDiameter(xx, gs), dbar = val('dbar', 0.1, 2000);
    const hq = qH();
    const ws = [];
    if (r.base.out) ws.push({ text: fmt(T.w_di_c, { c: num(xx.C, 3) }) });
    const fo = r.factors.filter(f => f.out).map(f => f.e);
    if (fo.length) ws.push({ text: fmt(T.w_di_f, { e: fo.join(', ') }) });
    if (r.unused.length) ws.push({ soft: true, text: fmt(T.w_di_unused, { e: r.unused.join(', ') }) });
    if (!hq) ws.push({ text: T.w_no_h });
    if (xx.Cr > 5 || xx.Ni > 5) ws.push({ text: T.w_high_alloy });
    const dLo = hq ? critD(r.di, hq.lo) * 25.4 : NaN, dHi = hq ? critD(r.di, hq.hi) * 25.4 : NaN;
    const needLo = hq ? needDI(dbar / 25.4, hq.hi) * 25.4 : NaN, needHi = hq ? needDI(dbar / 25.4, hq.lo) * 25.4 : NaN;
    const okBar = hq ? (dbar <= dLo ? 'yes' : dbar <= dHi ? 'maybe' : 'no') : null;
    let h = exHTML() + warnHTML(ws);
    h += stats([
      ['di', T.o_di, `${mm(r.diMm)} (${num(r.di, 3)} in)`],
      ['d', T.o_d, hq ? (Math.abs(dHi - dLo) < 0.05 ? mm(dLo) : `${num(dLo, 3)}–${mm(dHi)}`) : '–'],
      ['need', fmt(T.o_need, { d: num(dbar, 4) }), hq ? (Math.abs(needHi - needLo) < 0.05 ? mm(needLo) : `${num(needLo, 3)}–${mm(needHi)}`) : '–'],
      ['bar', fmt(T.o_bar, { d: num(dbar, 4) }), okBar ? T[`bar_${okBar}`] : '–'],
    ]);
    // 合金元素の倍数
    h += `<h3>${esc(T.h_factors)}</h3>`;
    h += tableHTML('factors', [T.c_el, T.c_pct, T.c_factor, T.c_range], [
      [fmt(T.r_base, { gs }), num(xx.C, 3), { t: `${num(r.base.v, 4)} in`, v: r.base.v }, r.base.out ? T.r_out_table : dn('0.05–0.90')],
      ...r.factors.map(f => [f.e, num(xx[f.e], 3), { t: num(f.f, 4), v: f.f }, f.out ? T.r_out_table : `0–${num(DIF[f.e].max, 3)}`]),
      [T.r_di, '—', { t: `${num(r.di, 4)} in = ${mm(r.diMm)}`, v: r.diMm }, '—'],
    ], { left: [3] });
    // 冷却剤ごとの臨界直径(比べる)
    h += `<h3>${esc(T.h_quench)}</h3>`;
    const qrows = [];
    for (const [qm, ags] of Object.entries(HQ)) for (const [ag, [lo, hi]] of Object.entries(ags)) {
      const a = critD(r.di, lo) * 25.4, b = critD(r.di, hi) * 25.4;
      qrows.push([`${optText('qm', qm)} · ${optText('ag', ag)}`, lo === hi ? num(lo, 3) : `${num(lo, 3)}–${num(hi, 3)}`, { t: Math.abs(b - a) < 0.05 ? mm(a) : `${num(a, 3)}–${mm(b)}`, v: Math.round(a * 10) / 10 }]);
    }
    qrows.push([T.r_ideal, '∞', { t: mm(r.diMm), v: Math.round(r.diMm * 10) / 10 }]);
    const curIdx = el.qm.value === 'custom' ? -1 : Object.entries(HQ).flatMap(([qm, ags]) => Object.keys(ags).map(ag => `${qm}.${ag}`)).indexOf(`${el.qm.value}.${el.ag.value}`);
    h += tableHTML('quench', [T.c_quench, T.c_h, T.c_d], qrows, { cur: curIdx });
    h += `${figHTML('dh', T.h_dh)}`;
    h += assume(T.a_harden);
    const f = v => num(v, 4);
    h += steps([
      [fmt(T.s_base, { gs }), `D_I,base(C = ${f(xx.C)}) = ${f(r.base.v)} in`],
      [T.s_factor, r.factors.map(z => `f(${z.e}) = 1 + ${f(DIF[z.e].k)} × ${f(xx[z.e])} = ${f(z.f)}`).join('\n')],
      [T.s_di, `D_I = ${f(r.base.v)} × ${r.factors.map(z => f(z.f)).join(' × ')} = ${f(r.di)} in × 25.4 = ${f(r.diMm)} mm`],
      hq && [T.s_d, `D²·Fo½(H·D) = D_I²·Fo½(∞), Fo½(∞) = ${f(foInf())} (2/√Fo½(∞) = ${f(asimowCoef())})\nH = ${f(hq.lo)} in⁻¹ → D = ${f(dLo / 25.4)} in = ${f(dLo)} mm`],
      hq && [fmt(T.s_need, { d: f(dbar) }), `D_I = D·√(Fo½(H·D)/Fo½(∞)) = ${f(dbar / 25.4)} × √(${f(foHalfI(hq.hi * dbar / 25.4))}/${f(foInf())}) = ${f(needLo / 25.4)} in = ${f(needLo)} mm`],
    ]);
    h += srcList(['HER', 'CMP', 'SMI', 'ASI']);
    h += safety();
    box.innerHTML = h;
    // 図: 冷却の強さ H(対数)と臨界直径 D
    const pts = [];
    for (let k = 0; k <= 120; k++) { const hh = 10 ** (-2 + 3 * k / 120); pts.push([hh, critD(r.di, hh) * 25.4]); }
    const ymax = Math.max(r.diMm * 1.1, dbar * 1.1, 1);
    const g = plot(q('dh'), { xr: [-2, 1], xlog: true, yr: [0, ymax], xlabel: T.ax_h, ylabel: T.ax_d,
      lines: [{ pts, slot: 1, w: 2.5 }], hl: [{ y: r.diMm, label: `D_I ${mm(r.diMm)}`, slot: 'mu' }, { y: dbar, label: fmt(T.lg_bar, { d: num(dbar, 4) }), slot: 2, dash: '6 3', left: true }],
      vbands: hq ? [{ x0: hq.lo / 1.03, x1: hq.hi * 1.03 }] : [],
      dots: hq ? [{ x: hq.lo, y: dLo, slot: 1 }, { x: hq.hi, y: dHi, slot: 1 }] : [] });
    q('lg-dh').innerHTML = legend([{ slot: 1, label: T.lg_dh }, { slot: 2, dash: '6 3', label: fmt(T.lg_bar, { d: num(dbar, 4) }) }]);
    hover(q('dh'), g, setRead('dh', T.read_hint), hh => `H = ${num(hh, 3)} in⁻¹ → D = ${mm(critD(r.di, hh) * 25.4)}`);
  }

  // =========== temper: 焼入れ硬さ・焼戻し ===========
  function renderTemper() {
    const xx = x(), tc = val('tt', 100, 750), th = val('th', 0.001, 1e5), t2 = val('tt2', 100, 750), cc = val('hjc', 10, 25);
    const p = hjP(tc, th, cc), tEq = hjTime(p, t2, cc), hv = hvMart(xx.C);
    const ws = [];
    if (tc > TS || t2 > TS) ws.push({ text: T.w_temper_a1 });
    if (xx.C > 0.8) ws.push({ soft: true, text: T.w_hv_c });
    let h = exHTML() + warnHTML(ws);
    h += stats([
      ['hv', T.o_hv, `${num(hv, 3)} HV`],
      ['p', T.o_p, `${num(p, 5)} (${num(p / 1000, 4)} × 10³)`],
      ['teq', fmt(T.o_teq, { t: num(t2, 4) }), tEq < 1 / 60 ? `${num(tEq * 3600, 3)} s` : tEq < 1 ? `${num(tEq * 60, 3)} min` : `${num(tEq, 3)} h`],
    ]);
    const times = [0.25, 0.5, 1, 2, 4, 8, 16, 24, 48];
    const rows = times.map(tt => { const T2 = hjTemp(p, tt, cc); return [`${num(tt, 3)} h`, { t: deg(T2), v: Math.round(T2 * 10) / 10 }]; });
    h += `<h3>${esc(T.h_equiv)}</h3>` + tableHTML('equiv', [T.c_time, T.c_temp_eq], rows, { cur: times.indexOf(th) });
    h += `${figHTML('hj', T.h_hj)}`;
    h += assume(T.a_temper);
    // 100 % マルテンサイトの硬さの炭素量による変化
    h += `<h3>${esc(T.h_hv)}</h3>${figHTML('hvc', T.h_hv)}`;
    h += assume(T.a_hv);
    const f = v => num(v, 5);
    h += steps([
      [T.s_hv, `HV = 884·C·(1 − 0.3·C²) + 294 = 884 × ${f(xx.C)} × (1 − 0.3 × ${f(xx.C)}²) + 294 = ${f(hv)}`],
      [T.s_p, `P = (T + 273.15)·(C + log₁₀ t) = (${f(tc)} + 273.15) × (${f(cc)} + log₁₀ ${f(th)}) = ${f(p)}`],
      [fmt(T.s_teq, { t: f(t2) }), `t = 10^(P/(T₂ + 273.15) − C) = 10^(${f(p)}/${f(t2 + K0)} − ${f(cc)}) = ${f(tEq)} h`],
    ]);
    h += srcList(['HJ', 'WIKIHJ', 'TWIHJ', 'YUR']);
    h += safety();
    box.innerHTML = h;
    const pts = [];
    for (let k = 0; k <= 100; k++) { const tt = 10 ** (-2 + 4 * k / 100); pts.push([tt, hjTemp(p, tt, cc)]); }
    const ys = pts.map(z => z[1]).filter(v => v > -50 && v < 1200);
    const g = plot(q('hj'), { xr: [-2, 2], xlog: true, yr: [Math.max(0, Math.floor((Math.min(...ys) - 20) / 50) * 50), Math.min(1000, Math.ceil((Math.max(...ys) + 20) / 50) * 50)], xlabel: T.ax_time, ylabel: T.axis_t,
      lines: [{ pts, slot: 1, w: 2.5 }], hl: [{ y: TS, label: `A1 727 ${DEG}`, slot: 'mu' }], dots: [{ x: th, y: tc, slot: 2 }, { x: tEq, y: t2, slot: 3 }] });
    q('lg-hj').innerHTML = legend([{ slot: 1, label: fmt(T.lg_hj, { p: num(p, 5) }) }, { slot: 2, dot: true, label: T.lg_given }, { slot: 3, dot: true, label: T.lg_eq }]);
    hover(q('hj'), g, setRead('hj', T.read_hint), tt => `${tt < 1 ? `${num(tt * 60, 3)} min` : `${num(tt, 3)} h`} → ${deg(hjTemp(p, tt, cc))}`);
    const cp = [];
    for (let k = 0; k <= 100; k++) { const c = 1.0 * k / 100; cp.push([c, hvMart(c)]); }
    const g2 = plot(q('hvc'), { xr: [0, 1], yr: [200, 1000], xlabel: T.axis_c, ylabel: T.ax_hv, lines: [{ pts: cp, slot: 1, w: 2.5 }], dots: [{ x: Math.min(1, xx.C), y: hvMart(Math.min(1, xx.C)), slot: 2 }] });
    q('lg-hvc').innerHTML = legend([{ slot: 1, label: T.lg_hv }]);
    hover(q('hvc'), g2, setRead('hvc', T.read_hint), c => `C ${num(c, 3)} % → ${num(hvMart(c), 3)} HV`);
  }

  // =========== weld: 溶接 ===========
  function renderWeld() {
    const xx = x(), ce = ceAll(xx), band = iiwBand(ce.iiw), hv = hvMart(xx.C);
    const ws = [];
    if (xx.C > 0.30) ws.push({ soft: true, text: T.w_weld_c });
    if (xx.Cr + xx.Ni + xx.Mo > 5) ws.push({ text: T.w_weld_alloy });
    let h = exHTML() + warnHTML(ws);
    h += stats([
      ['iiw', 'CE(IIW)', num(ce.iiw, 3)], ['pcm', 'Pcm', num(ce.pcm, 3)], ['cen', 'CEN', num(ce.cen, 3)], ['wes', 'CE(WES)', num(ce.wes, 3)],
    ]);
    h += `<p>${esc(fmt(T.t_band, { v: num(ce.iiw, 3), b: T[`band_${band}`] }))}</p>`;
    const fit = { iiw: xx.C > 0.16 ? T.fit_yes : T.fit_low, pcm: xx.C <= 0.16 ? T.fit_yes : T.fit_high, cen: xx.C >= 0.01 && xx.C <= 0.30 ? T.fit_yes : T.fit_out, wes: '—' }; // CE(WES) の向く炭素量は確かめられる出典がないので判定しない
    h += `<h3>${esc(T.h_ce)}</h3>` + tableHTML('ce', [T.c_index, T.c_value, T.c_formula_t, T.c_fit], [
      ['CE(IIW)', { t: num(ce.iiw, 4), v: ce.iiw }, 'C + Mn/6 + (Cr+Mo+V)/5 + (Ni+Cu)/15', fit.iiw],
      ['CE(WES)', { t: num(ce.wes, 4), v: ce.wes }, 'C + Si/24 + Mn/6 + Ni/40 + Cr/5 + Mo/4 + V/14', fit.wes],
      ['Pcm', { t: num(ce.pcm, 4), v: ce.pcm }, 'C + Si/30 + (Mn+Cu+Cr)/20 + Ni/60 + Mo/15 + V/10 + 5B', fit.pcm],
      ['CEN', { t: num(ce.cen, 4), v: ce.cen }, 'C + A(C)·{Si/24 + Mn/6 + Cu/15 + Ni/20 + (Cr+Mo+Nb+V)/5 + 5B}', fit.cen],
    ], { left: [2, 3] });
    h += `${figHTML('ce', T.h_cechart)}`;
    h += `<h3>${esc(T.h_haz)}</h3>` + stats([['hvm', T.o_hvm, `${num(hv, 3)} HV`], ['hv350', T.o_350, hv > 350 ? T.haz_over : T.haz_under]]);
    h += assume(T.a_haz);
    h += assume(T.a_preheat);
    const f = v => num(v, 4);
    h += steps([
      [T.s_iiw, `CE = ${f(xx.C)} + ${f(xx.Mn)}/6 + (${f(xx.Cr)} + ${f(xx.Mo)} + ${f(xx.V)})/5 + (${f(xx.Ni)} + ${f(xx.Cu)})/15 = ${f(ce.iiw)}`],
      [T.s_pcm, `Pcm = ${f(xx.C)} + ${f(xx.Si)}/30 + (${f(xx.Mn)} + ${f(xx.Cu)} + ${f(xx.Cr)})/20 + ${f(xx.Ni)}/60 + ${f(xx.Mo)}/15 + ${f(xx.V)}/10 + 5 × ${f(xx.B)} = ${f(ce.pcm)}`],
      [T.s_cen, `A(C) = 0.75 + 0.25·tanh{20 × (${f(xx.C)} − 0.12)} = ${f(aC(xx.C))}\nCEN = ${f(xx.C)} + ${f(aC(xx.C))} × {${f(xx.Si)}/24 + ${f(xx.Mn)}/6 + ${f(xx.Cu)}/15 + ${f(xx.Ni)}/20 + (${f(xx.Cr)} + ${f(xx.Mo)} + ${f(xx.V)})/5 + 5 × ${f(xx.B)}} = ${f(ce.cen)}`],
      [T.s_wes, `CE(WES) = ${f(xx.C)} + ${f(xx.Si)}/24 + ${f(xx.Mn)}/6 + ${f(xx.Ni)}/40 + ${f(xx.Cr)}/5 + ${f(xx.Mo)}/4 + ${f(xx.V)}/14 = ${f(ce.wes)}`],
    ]);
    h += srcList(['IIW', 'EWI', 'JWES', 'TWI', 'WTIA', 'WIKICE', 'YUR']);
    h += safety();
    box.innerHTML = h;
    const cmax = Math.max(0.5, Math.ceil((xx.C + 0.05) * 10) / 10), ymax = Math.max(1, Math.ceil((ce.iiw + 0.1) * 10) / 10);
    plot(q('ce'), { xr: [0, cmax], yr: [0, ymax], xlabel: T.axis_c, ylabel: 'CE(IIW)',
      hl: IIW_BANDS.map((v, i) => ({ y: v, label: num(v, 2), slot: 'mu', dash: i === 2 ? '6 3' : '3 3', left: i === 0 })), vl: [{ x: 0.16, label: dn('C 0.16') }],
      dots: [{ x: Math.min(xx.C, cmax), y: Math.min(ce.iiw, ymax), slot: 2, r: 6 }] });
    q('lg-ce').innerHTML = legend([{ slot: 2, dot: true, label: gradeName() ?? T.lg_this }]);
    setRead('ce', T.read_ce);
  }

  // =========== grade: 鋼種 ===========
  function renderGrade() {
    const rows = GRADE_IDS.map(id => {
      const g = GRADES[id], xx = comp(g.x), tr = transTemps(xx), di = idealDiameter(xx, 7), ce = ceAll(xx);
      const half = (g.half ?? []).length ? ` *${g.half.join(',')}` : '';
      const dag = o => (o ? ' †' : ''), diOut = di.base.out || di.factors.some(f => f.out);
      const cv = (v, o) => (o ? `${v} †` : v); // CSV にも範囲外の印を残す
      return [{ t: g.name, v: g.name, html: `${esc(g.name)}<br><button type="button" class="btn btn-ghost btn-small fc-pick" data-grade="${id}" data-go="trans">${esc(T.pick)}</button>` }, { t: compLine(xx) + half, v: compLine(xx) + half },
        { t: deg(tr.ac1_and.v) + dag(tr.ac1_and.out.length), v: cv(Math.round(tr.ac1_and.v), tr.ac1_and.out.length) }, { t: xx.C < S ? deg(tr.ac3_and.v) + dag(tr.ac3_and.out.length) : '–', v: xx.C < S ? cv(Math.round(tr.ac3_and.v), tr.ac3_and.out.length) : '' },
        { t: deg(tr.ms_and.v) + dag(tr.ms_and.out.length), v: cv(Math.round(tr.ms_and.v), tr.ms_and.out.length) }, { t: mm(di.diMm) + dag(diOut), v: cv(Math.round(di.diMm * 10) / 10, diOut) }, { t: num(ce.iiw, 3), v: Number(ce.iiw.toFixed(3)) },
      ];
    });
    let h = `<p>${esc(T.t_grade)}</p>`;
    h += tableHTML('grades', [T.c_grade, T.c_comp_mid, 'Ac1', 'Ac3', 'Ms', 'D_I', 'CE(IIW)'], rows, { left: [1], cur: GRADE_IDS.indexOf(el.grade.value) });
    h += assume(T.a_grade);
    h += `<h3>${esc(T.h_grade_src)}</h3>` + tableHTML('gsrc', [T.c_grade, T.c_std, T.c_range_std, T.c_src], GRADE_IDS.map(id => [GRADES[id].name, GRADES[id].std, dl(GRADES[id].r), SRC[GRADES[id].src] ?? GRADES[id].src]), { left: [1, 2, 3], nocsv: true });
    h += `<div class="fc-links">${['S45C', 'SCM440', 'SUJ2'].map(c => link(`tools/material-designation-decoder/?code=${c}`, fmt(T.ln_desig, { g: c }))).join('')}${link('materials/?m=low-alloy-steel#md-card', T.ln_mat_las)}${link('materials/?m=stainless-steel#md-card', T.ln_mat_ss)}</div>`;
    h += safety();
    box.innerHTML = h;
  }

  // ---- 結果のコピー(今のモードで見えている入力と結果だけ。共通の部品より先に受ける) ----
  const clean = n => n?.textContent.trim().replace(/\s+/g, ' ') ?? '';
  function resultText() {
    const lines = [clean(document.querySelector('h1')), `[${optText('mode', modeSel.value)}]`, ''];
    for (const f of el) if (f.name && f.name !== 'mode' && lab(f.name) && !lab(f.name).hidden) lines.push(`${clean(lab(f.name).querySelector('span'))}: ${f.tagName === 'SELECT' ? clean(f.selectedOptions[0]) : f.value}`);
    for (const n of box.querySelectorAll('[data-fc-warn]')) lines.push('', `! ${clean(n)}`);
    for (const node of box.querySelectorAll('h3, .dy-stats > div, table')) {
      if (node.tagName === 'H3') lines.push('', `[${clean(node)}]`);
      else if (node.tagName === 'TABLE') for (const row of node.rows) lines.push([...row.cells].map(c => { const k = c.cloneNode(true); k.querySelectorAll('button').forEach(b => b.remove()); return clean(k); }).join('\t'));
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

  // ---- 描き直し(値が同じなら描き直さない: 図をクリックした瞬間の change で図を作り直すと、そのクリックが失われるため)----
  const R_ = { diagram: renderDiagram, trans: renderTrans, harden: renderHarden, temper: renderTemper, weld: renderWeld, grade: renderGrade };
  let raf = 0, lastKey = '';
  const stateKey = () => [...el].filter(f => f.name).map(f => `${f.name}=${f.value}`).join('&') + `|${box.clientWidth < 440}|${box.clientWidth < 520}`;
  const render = (force = false) => {
    const k = stateKey();
    if (!force && k === lastKey) return;
    lastKey = k;
    visible();
    if (modeSel.value !== 'diagram') { stopPlay(); ctl = null; }
    for (const key in tables) delete tables[key];
    adj.clear();
    R_[modeSel.value]();
    // 範囲の外・数でない入力を寄せた値で計算したときの注意(状態図は範囲外の案内を図の下に出すので除く)
    if (modeSel.value !== 'diagram' && adj.size) {
      const list = [...adj].map(([k, v]) => `${lab(k)?.querySelector('span')?.textContent.trim() ?? k} → ${num(v, 4)}`).join(SEP);
      box.insertAdjacentHTML('afterbegin', warnHTML([{ text: fmt(T.w_clamp, { f: list }) }]));
    }
  };
  const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => render()); };
  form.addEventListener('input', schedule);
  form.addEventListener('change', schedule);
  form.addEventListener('submit', e => e.preventDefault());
  if (window.ResizeObserver) new ResizeObserver(() => schedule()).observe(box);
  render(true);
}
