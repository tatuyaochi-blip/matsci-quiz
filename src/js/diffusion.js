// 拡散・表面処理シミュレーター。1ページに5つのモード(タブ)を持つ:
//   arr  拡散係数とアレニウス図: データ集の系から D = D0·exp(−Q/RT)、√(Dt)、同じ Dt になる時間。log D–1/T に系を重ねて描く
//   prof 濃度分布: 一定表面濃度(erfc)、表面の薄膜(ガウス)、拡散対(erf)、陽的差分法(有限の板、片面・両面、表面濃度の変化)。
//        差分法は、有限の板の厳密解(鏡像法・フーリエ級数)と半無限体の erfc を重ねて違いを見せる
//   carb 浸炭・窒化の設計: 境界の濃度の深さから、温度ごとの必要時間(√t 則)、時間から温度、2段浸炭(差分法)
//   semi 半導体の不純物拡散: プリデポジション(erfc)とドライブイン(ガウス)、接合深さ、シート抵抗の目安(Arora の移動度)
//   fit  実験データから D0 と Q: ln D と 1/T の最小二乗(標準誤差と 95 % 信頼区間)
// 値と出典は review の sources.md、検算は scripts/check_diffusion.py(python で独立に計算して突き合わせる)。
// 純粋な計算の関数は export し、DOM の部分は form があるときだけ動かす(node から関数を呼んで検算するため)
import { num, sci } from './eng.js';
import { EL } from './ptable.js';
import { TG, TS, TE, S as C_EUT, E as C_SAT, line as FE } from './fe-c.js';

// ---- 定数(CODATA 2018) ----
export const R = 8.314462618;       // J/(mol·K)
export const KB = 8.617333262e-5;   // eV/K
export const EV = 96.48533212;      // 1 eV/原子 = 96.485 kJ/mol
export const QE = 1.602176634e-19;  // C
const SQPI = Math.sqrt(Math.PI);
export const FDM_AMAX = 50; // 差分法で計算する Dt/L²(フーリエ数)の上限

// ---- 誤差関数 ----
// |x| ≤ 3 はテイラー級数、それより大きいところは erfc の連分数(後ろから 60 段)。どちらも相対誤差 1e-13 程度
export function erf(x) {
  if (x < 0) return -erf(-x);
  if (x > 3) return 1 - erfc(x);
  const x2 = x * x;
  let term = x, sum = x;
  for (let n = 1; n < 200; n++) {
    term *= -x2 / n;
    const add = term / (2 * n + 1);
    sum += add;
    if (Math.abs(add) < 1e-17 * Math.abs(sum)) break;
  }
  return (2 / SQPI) * sum;
}
export function erfc(x) {
  if (x < 3) return 1 - erf(x);
  if (x > 27) return 0;
  let f = x;
  for (let k = 60; k >= 1; k--) f = x + (k / 2) / f;
  return Math.exp(-x * x) / SQPI / f;
}
// erfc(x) = p となる x(0 < p < 2)。二分法で絞ってからニュートン法で仕上げる
export function ierfc(p) {
  if (!(p > 0)) return Infinity;
  if (!(p < 2)) return -Infinity;
  let lo = -6, hi = 27;
  for (let i = 0; i < 80; i++) { const m = (lo + hi) / 2; if (erfc(m) > p) lo = m; else hi = m; }
  let x = (lo + hi) / 2;
  for (let i = 0; i < 3; i++) {
    const d = (2 / SQPI) * Math.exp(-x * x);
    if (!(d > 0)) break;
    const nx = x + (erfc(x) - p) / d;
    if (!Number.isFinite(nx)) break;
    x = nx;
  }
  return x;
}
export const ierf = y => ierfc(1 - y);

// ---- 拡散係数 ----
export const TK = tc => tc + 273.15;
export const Dof = (d0, qkJ, tc) => d0 * Math.exp(-(qkJ * 1000) / (R * TK(tc)));
// D = d となる温度(℃)。d ≥ d0 のときは解なし
export const TforD = (d0, qkJ, d) => (d > 0 && d < d0 ? (qkJ * 1000) / (R * Math.log(d0 / d)) - 273.15 : NaN);

// ---- データのデータ集 ----
// 単位: d0 m²/s、q kJ/mol(eV/原子で与えられた値は qev)。kind: int 格子間、self 自己拡散、sub 置換型(Callister の表の「相互拡散」)、imp 不純物、dop Si 中のドーパント
// lo・hi は値を使える温度の上下限(℃。相の範囲・融点)、meas は出典に書かれた測定の範囲。置換型は 0.75 Tm より低いと粒界拡散の注意を出す
export const SRC = {
  C9: 'W. D. Callister, D. G. Rethwisch, Materials Science and Engineering: An Introduction, 9th ed. (Wiley, 2014), Table 5.2',
  C7: 'W. D. Callister, Materials Science and Engineering: An Introduction, 7th ed. (Wiley, 2007), Table 5.2',
  ASK: 'D. R. Askeland, The Science and Engineering of Materials, Table 5-1 (C in FCC iron: D0 = 0.23 cm²/s, Q = 32,900 cal/mol)',
  FUJ: 'S. Fujikawa, K. Hirano, Y. Fukushima, Metall. Trans. A 9 (1978) 1811 (753–893 K)',
  FAIR: 'R. B. Fair (1981), intrinsic diffusivity, as tabulated in S. W. Jones, Diffusion in Silicon (IC Knowledge, 2000), Table 1.4',
  CEX: 'Callister & Rethwisch 9th ed., Section 5.6, example of boron diffusion into silicon (D0 = 2.4 × 10⁻³ m²/s, Qd = 3.87 eV/atom)',
};
const meltC = s => EL.find(e => e.s === s)?.mp;
const SYS0 = [
  ['c_a', 'C', 'Fe', 'int', 1.1e-6, 87.4, 'C9', { hi: TG, ph: 'alpha' }],
  ['c_a7', 'C', 'Fe', 'int', 6.2e-7, 80, 'C7', { hi: TG, ph: 'alpha' }],
  ['c_g', 'C', 'Fe', 'int', 2.3e-5, 148, 'C9', { lo: TS, hi: 1394, a3: true, ph: 'gamma' }],
  ['c_gask', 'C', 'Fe', 'int', 2.3e-5, 32.9 * 4.184, 'ASK', { lo: TS, hi: 1394, a3: true, ph: 'gamma' }],
  ['n_a', 'N', 'Fe', 'int', 5.0e-7, 77, 'C9', { hi: TG, ph: 'alpha' }],
  ['n_g', 'N', 'Fe', 'int', 9.1e-5, 168, 'C9', { lo: TG, hi: 1394, ph: 'gamma' }],
  ['fe_a', 'Fe', 'Fe', 'self', 2.8e-4, 251, 'C9', { hi: TG, ph: 'alpha', curie: true }],
  ['fe_g', 'Fe', 'Fe', 'self', 5.0e-5, 284, 'C9', { lo: TG, hi: 1394, ph: 'gamma' }],
  ['cu', 'Cu', 'Cu', 'self', 2.5e-5, 200, 'C9'],
  ['cu7', 'Cu', 'Cu', 'self', 7.8e-5, 211, 'C7'],
  ['al', 'Al', 'Al', 'self', 2.3e-4, 144, 'C9'],
  ['mg', 'Mg', 'Mg', 'self', 1.5e-4, 136, 'C9'],
  ['zn', 'Zn', 'Zn', 'self', 1.5e-5, 94, 'C9'],
  ['mo', 'Mo', 'Mo', 'self', 1.8e-4, 461, 'C9'],
  ['ni', 'Ni', 'Ni', 'self', 1.9e-4, 285, 'C9'],
  ['zn_cu', 'Zn', 'Cu', 'sub', 2.4e-5, 189, 'C9'],
  ['cu_zn', 'Cu', 'Zn', 'sub', 2.1e-4, 124, 'C9'],
  ['cu_al', 'Cu', 'Al', 'sub', 6.5e-5, 136, 'C9'],
  ['mg_al', 'Mg', 'Al', 'sub', 1.2e-4, 130, 'C9'],
  ['cu_ni', 'Cu', 'Ni', 'sub', 2.7e-5, 256, 'C9'],
  ['ni_cu', 'Ni', 'Cu', 'sub', 1.9e-4, 230, 'C9'],
  ['si_al', 'Si', 'Al', 'imp', 2.02e-4, 136, 'FUJ', { meas: [480, 620] }],
  ['b_si', 'B', 'Si', 'dop', 0.76e-4, { ev: 3.46 }, 'FAIR'],
  ['p_si', 'P', 'Si', 'dop', 3.85e-4, { ev: 3.66 }, 'FAIR'],
  ['as_si', 'As', 'Si', 'dop', 22.9e-4, { ev: 4.1 }, 'FAIR'],
  ['sb_si', 'Sb', 'Si', 'dop', 0.214e-4, { ev: 3.65 }, 'FAIR'],
  ['b_si_c', 'B', 'Si', 'dop', 2.4e-3, { ev: 3.87 }, 'CEX'],
];
export const SYS = SYS0.map(([id, el, host, kind, d0, q, src, o = {}]) => {
  const tm = meltC(host);
  const s = { id, el, host, kind, d0, q: typeof q === 'object' ? q.ev * EV : q, qev: typeof q === 'object' ? q.ev : null, src, tm, ...o };
  if (s.hi == null) s.hi = tm;
  if (s.kind === 'self' || s.kind === 'sub') { if (!s.ph) s.gb = 0.75 * TK(tm) - 273.15; }
  return s;
});
export const sysById = id => SYS.find(s => s.id === id);
// 図に重ねる系の組(色は組の中の順で決める)と、描く温度の範囲(℃)
export const GROUPS = {
  fe: { ids: ['c_a', 'c_g', 'n_a', 'n_g', 'fe_a', 'fe_g'], win: [300, 1400] },
  self: { ids: ['fe_g', 'cu', 'al', 'mg', 'zn', 'mo', 'ni'], win: [200, 1500] },
  alloy: { ids: ['zn_cu', 'cu_zn', 'cu_al', 'mg_al', 'si_al', 'cu_ni', 'ni_cu'], win: [200, 1100] },
  si: { ids: ['b_si', 'p_si', 'as_si', 'sb_si', 'b_si_c'], win: [800, 1400] },
  src: { ids: ['c_a', 'c_a7', 'c_g', 'c_gask', 'cu', 'cu7'], win: [300, 1100] },
};

// 温度の範囲の確かめ。hard は使えない(相・融点)、soft は外挿や粒界拡散の注意
export function rangeCheck(s, tc) {
  const out = [];
  if (s.lo != null && tc < s.lo) out.push({ lv: 'hard', k: s.ph === 'gamma' ? 'gamma_lo' : 'lo', v: s.lo });
  if (s.hi != null && tc > s.hi) out.push({ lv: 'hard', k: s.ph === 'alpha' ? 'alpha_hi' : s.ph === 'gamma' ? 'gamma_hi' : 'melt', v: s.hi });
  if (!out.length) {
    if (s.a3 && tc < TG) out.push({ lv: 'soft', k: 'a3', v: TG });
    if (s.meas && (tc < s.meas[0] || tc > s.meas[1])) out.push({ lv: 'soft', k: 'meas', v: s.meas });
    if (s.gb != null && tc < s.gb) out.push({ lv: 'soft', k: 'gb', v: s.gb });
    if (s.curie && tc > 650 && tc < 900) out.push({ lv: 'soft', k: 'curie', v: 770 });
  }
  return out;
}

// ---- 濃度分布の解析解 ----
export const pErf = (x, Dt, c0, cs) => c0 + (cs - c0) * erfc(x / (2 * Math.sqrt(Dt)));
export const pGauss = (x, Dt, M, c0) => c0 + (M / Math.sqrt(Math.PI * Dt)) * Math.exp(-(x * x) / (4 * Dt));
export const pCouple = (x, Dt, ca, cb) => (ca + cb) / 2 - ((ca - cb) / 2) * erf(x / (2 * Math.sqrt(Dt)));
// 有限の板の厳密解。x = 0 の面は濃度 cs、x = Ls の面は流れなし(片面の板、または両面から入る厚さ 2Ls の板の半分)。
// Dt/Ls² が小さいときは鏡像法(erfc の和)、大きいときはフーリエ級数で計算する
export function pSlab(x, Dt, Ls, c0, cs) {
  if (!(Dt > 0)) return x === 0 ? cs : c0;
  const a = Dt / (Ls * Ls);
  let v = 0;
  if (a < 0.5) {
    const s = 2 * Math.sqrt(Dt);
    for (let k = 0; k < 400; k++) {
      const t1 = erfc((2 * k * Ls + x) / s), t2 = erfc((2 * (k + 1) * Ls - x) / s);
      v += (k % 2 ? -1 : 1) * (t1 + t2);
      if (t1 + t2 < 1e-17) break;
    }
  } else {
    let u = 0;
    for (let n = 0; n < 400; n++) {
      const m = (2 * n + 1) * Math.PI / 2, e = Math.exp(-m * m * a);
      u += (2 / m) * Math.sin((m * x) / Ls) * e;
      if (e < 1e-17) break;
    }
    v = 1 - u;
  }
  return c0 + (cs - c0) * v;
}

// ---- 陽的差分法(FTCS) ----
// 0 ≤ x ≤ Ls を N 等分。x = 0 は表面(濃度 csAt(t))、x = Ls は流れなし(鏡像の点で 2r)。
// r = DΔt/Δx² ≤ 0.4(安定条件 0.5 に余裕)。格子は √(Dt)/10 より細かくを目安に、計算量(N × 段数)が 1.6×10⁷ 程度に収まるよう決める
export function fdm({ Ls, c0, csAt, D, tEnd, K = 100, Nfix }) {
  const a = (D * tEnd) / (Ls * Ls);
  let N = Nfix ?? Math.max(40, Math.min(5000, Math.max(100, Math.ceil(10 / Math.sqrt(a))), Math.floor(Math.cbrt(1.6e7 / a))));
  const dx = Ls / N;
  const steps = Math.max(200, Math.ceil((D * tEnd) / (0.4 * dx * dx)));
  const dt = tEnd / steps, r = (D * dt) / (dx * dx);
  let c = new Float64Array(N + 1).fill(c0), n = new Float64Array(N + 1);
  c[0] = csAt(0);
  const snaps = [{ t: 0, c: Float64Array.from(c) }];
  let k = 1;
  for (let s = 1; s <= steps; s++) {
    for (let i = 1; i < N; i++) n[i] = c[i] + r * (c[i - 1] - 2 * c[i] + c[i + 1]);
    n[N] = c[N] + 2 * r * (c[N - 1] - c[N]);
    const t = s * dt;
    n[0] = csAt(t);
    [c, n] = [n, c];
    while (k <= K && t >= tEnd * (k / K) ** 2 * (1 - 1e-12)) { snaps.push({ t, c: Float64Array.from(c) }); k++; }
  }
  return { N, dx, dt, r, steps, a, snaps, c };
}
// 格子の値の線形補間
export const at = (c, dx, x) => {
  const f = x / dx, i = Math.min(c.length - 2, Math.max(0, Math.floor(f)));
  return c[i] + (c[i + 1] - c[i]) * (f - i);
};
// 表面から見て、初めて値が lim を下回る深さ(線形補間)。下回らなければ NaN
export function depthBelow(c, dx, lim) {
  for (let i = 1; i < c.length; i++) if (c[i] < lim && c[i - 1] >= lim) return dx * (i - 1 + (c[i - 1] - lim) / (c[i - 1] - c[i]));
  return c[0] < lim ? 0 : NaN;
}
// 台形則の面積(Σ (C − c0) dx)
export const uptake = (c, dx, c0) => { let s = 0; for (let i = 0; i < c.length - 1; i++) s += ((c[i] + c[i + 1]) / 2 - c0) * dx; return s; };
// 表面濃度の時間変化: const 一定、ramp t_r までに c0 から cs へ直線で、boost t1 まで cs、そのあと cs2
export const surfFn = (kind, { c0, cs, tr, t1, cs2 }) =>
  kind === 'ramp' ? t => (t >= tr ? cs : c0 + ((cs - c0) * t) / tr) : kind === 'boost' ? t => (t <= t1 ? cs : cs2) : () => cs;

// ---- 浸炭の設計 ----
// (Cx − C0)/(Cs − C0) = erfc(z)、z = x/(2√(Dt)) → t = x²/(4z²D)
export const zFor = (c0, cs, cx) => ierfc((cx - c0) / (cs - c0));
export const tFor = (x, z, D) => (x * x) / (4 * z * z * D);
// 2段浸炭(cs で frac の割合の時間、そのあと cs2)で、深さ xd の濃度が cx になる全体の時間。差分法と二分法
export function twoStage({ D, c0, cs, cs2, frac, cx, xd }) {
  if (!(cs2 > cx && cs > cx && cx > c0 && frac > 0 && frac < 1 && D > 0 && xd > 0)) return null;
  const z1 = zFor(c0, cs, cx), z2 = zFor(c0, Math.min(cs, cs2), cx);
  const tA = tFor(xd, z1, D), tB = tFor(xd, z2, D);
  let lo = tA * 0.5, hi = Math.max(tA, tB) * 2;
  const Ls = Math.max(10 * Math.sqrt(D * hi), 3 * xd);
  const run = t => fdm({ Ls, c0, csAt: surfFn('boost', { cs, t1: frac * t, cs2 }), D, tEnd: t, K: 1 });
  const depth = res => depthBelow(res.c, res.dx, cx);
  for (let i = 0; i < 40; i++) {
    const m = Math.sqrt(lo * hi);
    if (depth(run(m)) < xd) lo = m; else hi = m;
    if (hi / lo < 1 + 1e-6) break;
  }
  const t = Math.sqrt(lo * hi), res = run(t);
  let cmax = 0, xmax = 0;
  res.c.forEach((v, i) => { if (v > cmax) { cmax = v; xmax = i * res.dx; } });
  return { t, t1: frac * t, t2: (1 - frac) * t, tA, tB, res, cmax, xmax, Ls };
}
// 状態図(fe-c.js の線)から、炭素量 c の鋼が γ 単相になる下限の温度(A3 または Acm)と、温度 tc での γ の炭素の固溶限(Acm)
export const tGammaLo = c => (c <= C_EUT ? TG - (TG - TS) * (c / C_EUT) ** 0.7 : c <= C_SAT ? TS + ((TE - TS) * (c - C_EUT)) / (C_SAT - C_EUT) : NaN);
export const acmAt = tc => (tc >= TS && tc <= TE ? FE.acm(tc) : NaN);

// ---- 半導体の不純物拡散(cm の単位) ----
// D0 cm²/s、Ea eV。type は多数キャリアの型(B は p 型、P・As・Sb は n 型)
export const DOP = {
  bc: { d0: 24, ea: 3.87, type: 'p', src: 'CEX', sys: 'b_si_c' },
  b: { d0: 0.76, ea: 3.46, type: 'p', src: 'FAIR', sys: 'b_si' },
  p: { d0: 3.85, ea: 3.66, type: 'n', src: 'FAIR', sys: 'p_si' },
  as: { d0: 22.9, ea: 4.1, type: 'n', src: 'FAIR', sys: 'as_si' },
  sb: { d0: 0.214, ea: 3.65, type: 'n', src: 'FAIR', sys: 'sb_si' },
};
export const Dsi = (d0, ea, tc) => d0 * Math.exp(-ea / (KB * TK(tc)));
// 300 K の移動度(cm²/(V·s))。N.D. Arora, J.R. Hauser, D.J. Roulston, IEEE Trans. Electron Devices 29 (1982) 292
export const mobility = (N, type) => (type === 'n' ? 88 + 1252 / (1 + (N / 1.26e17) ** 0.88) : 54.3 + 407 / (1 + (N / 2.35e17) ** 0.88));
// シート抵抗(Ω/□)= 1 / (q ∫₀^xj μ(N + Nb)·(N − Nb) dx)。prof(x) は cm⁻³、x は cm。シンプソン則(2000 区間)
export function sheetR(prof, xj, Nb, type) {
  if (!(xj > 0)) return NaN;
  const n = 2000, h = xj / n;
  let s = 0;
  for (let i = 0; i <= n; i++) {
    const N = prof(i * h), f = mobility(N + Nb, type) * Math.max(N - Nb, 0);
    s += f * (i === 0 || i === n ? 1 : i % 2 ? 4 : 2);
  }
  return 1 / (QE * (s * h) / 3);
}
// ドライブインの厳密な分布: プリデポジションの erfc を初期分布とし、表面で流れなし(鏡像)として拡げる(数値の畳み込み)
export function driveExact(x, Cs, Dtp, Dtd) {
  const sp = Math.sqrt(Dtp), sd = Math.sqrt(Dtd);
  const L = 12 * sp + 0 * sd, h = Math.min(sp, sd) / 6, n = Math.min(6000, Math.max(200, 2 * Math.ceil(L / h / 2)));
  const hh = L / n, g = u => Math.exp(-(u * u) / (4 * Dtd)) / Math.sqrt(4 * Math.PI * Dtd);
  let s = 0;
  for (let i = 0; i <= n; i++) {
    const xi = i * hh, f = Cs * erfc(xi / (2 * sp)) * (g(x - xi) + g(x + xi));
    s += f * (i === 0 || i === n ? 1 : i % 2 ? 4 : 2);
  }
  return (s * hh) / 3;
}
export function semi({ dop, tp, tpm, ns, td, tdm, nb, sum }) {
  const d = DOP[dop];
  const Dp = Dsi(d.d0, d.ea, tp), Dd = Dsi(d.d0, d.ea, td);
  const tps = tpm * 60, tds = tdm * 60, Dtp = Dp * tps, Dtd = Dd * tds + (sum ? Dtp : 0);
  const Q = 2 * ns * Math.sqrt(Dtp / Math.PI);
  const xjp = nb < ns ? 2 * Math.sqrt(Dtp) * ierfc(nb / ns) : NaN;
  const csd = Q / Math.sqrt(Math.PI * Dtd);
  const xjd = csd > nb ? Math.sqrt(4 * Dtd * Math.log(csd / nb)) : NaN;
  const pre = x => ns * erfc(x / (2 * Math.sqrt(Dtp)));
  const drv = x => csd * Math.exp(-(x * x) / (4 * Dtd));
  const rsp = sheetR(pre, xjp, nb, d.type), rsd = sheetR(drv, xjd, nb, d.type);
  return { d, Dp, Dd, tps, tds, Dtp, Dtd, Q, xjp, csd, xjd, pre, drv, rsp, rsd, ratio: (Dd * tds) / Dtp };
}

// ---- 実験データの最小二乗(ln D = ln D0 − Q/(R T)) ----
// t 分布の 97.5 % 点(自由度 1〜30)。31 以上は Cornish-Fisher 展開の近似
const T975 = [12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16, 2.145, 2.131, 2.12, 2.11, 2.101, 2.093, 2.086, 2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045, 2.042];
export const t975 = df => (df <= 30 ? T975[df - 1] : 1.959964 + (1.959964 ** 3 + 1.959964) / (4 * df) + (5 * 1.959964 ** 5 + 16 * 1.959964 ** 3 + 3 * 1.959964) / (96 * df * df));
export function fitArr(pts) {
  const n = pts.length;
  if (n < 2) return null;
  const xs = pts.map(p => 1 / p[0]), ys = pts.map(p => Math.log(p[1]));
  const mx = xs.reduce((a, b) => a + b) / n, my = ys.reduce((a, b) => a + b) / n;
  let sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < n; i++) { sxx += (xs[i] - mx) ** 2; sxy += (xs[i] - mx) * (ys[i] - my); syy += (ys[i] - my) ** 2; }
  if (!(sxx > 0)) return null;
  const b = sxy / sxx, a = my - b * mx;
  const sse = ys.reduce((s, y, i) => s + (y - a - b * xs[i]) ** 2, 0);
  const r2 = syy > 0 ? 1 - sse / syy : 1;
  const out = { n, a, b, Q: (-b * R) / 1000, D0: Math.exp(a), r2, sxx, mx };
  if (n >= 3) {
    const s = Math.sqrt(sse / (n - 2)), tq = t975(n - 2);
    out.seB = s / Math.sqrt(sxx); out.seA = s * Math.sqrt(1 / n + (mx * mx) / sxx); out.tq = tq; out.s = s;
    out.Qci = (tq * out.seB * R) / 1000; out.lnD0ci = tq * out.seA;
  }
  return out;
}
// 貼り付けた文字から [T, D] の組を読む(区切りは空白・タブ・セミコロン、またはコンマ。数でない行は飛ばす)
// 空白・タブ・セミコロンで分けられる行では、コンマは小数点とみる(9,4e-16)。分けられない行だけコンマを区切りとみる
export function parsePairs(text) {
  const ok = [], bad = [];
  const toNum = v => Number(v.replace(/[−–]/g, '-').replace(/×10\^?/, 'e').replace(',', '.'));
  String(text).split(/\r?\n/).forEach((line, i) => {
    const s = line.trim();
    if (!s || s.startsWith('#')) return;
    let parts = s.split(/[\s;]+/).filter(Boolean);
    if (parts.length < 2) parts = s.split(',');
    const p = parts.map(toNum);
    if (p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1])) ok.push([p[0], p[1]]); else bad.push(i + 1);
  });
  return { ok, bad };
}

// =====================================================================
// 画面
// =====================================================================
const form = document.getElementById('diff-form');
if (form) {
  const T = JSON.parse(form.dataset.text || '{}');
  const el = form.elements;
  const box = document.querySelector('[data-out="main"]');
  const home = document.documentElement.dataset.home ?? '/';
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const fmt = (s, o = {}) => String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (k in o ? o[k] : m));
  const optText = (name, v) => [...el[name].options].find(o => o.value === v)?.textContent ?? v;
  const sysName = id => optText('sys', id);
  const hostName = s => sysName(s.id).replace(/\s*[(（][^()（）]*[)）]\s*$/, '');
  const val = (k, min = -Infinity) => { const s = String(el[k].value).trim(), v = s === '' ? NaN : Number(s); return Number.isFinite(v) && v >= min ? v : Number(el[k].defaultValue); };
  const tnum = (v, d = 4) => num(v, d);
  const D3 = v => sci(v, 3);
  const hrs = s => `${num(s / 3600, 3)} h`;
  const mm = m => `${num(m * 1e3, 3)} mm`;
  const csvNum = v => (typeof v === 'number' ? (Number.isFinite(v) ? Number(v.toPrecision(6)).toString() : '') : `"${String(v).replace(/"/g, '""')}"`);

  // ---- 見た目(このツールだけの小さな CSS) ----
  const css = document.createElement('style');
  css.textContent = `
#diff-form .dy-field[hidden], #diff-form .df-sub[hidden] { display: none !important; }
#diff-form .df-wide { grid-column: 1 / -1; }
#diff-form .df-wide2 { grid-column: span 2; }
.df-root .dy-stats { grid-template-columns: repeat(auto-fit, minmax(135px, 1fr)); gap: 8px; }
.df-root .dy-stats dd { font-size: 1.12rem; overflow-wrap: anywhere; }
.df-tabs { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 6px; margin: 0; }
.df-tabs button { font: inherit; font-size: .88rem; font-weight: 600; padding: 8px 12px; border-radius: 999px; border: 1px solid var(--border); background: var(--bg); color: var(--text); cursor: pointer; min-height: 40px; }
.df-tabs button[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); color: var(--surface); }
.df-sub { grid-column: 1 / -1; margin: 6px 0 -4px; font-size: .85rem; font-weight: 700; color: var(--text); border-top: 1px solid var(--border); padding-top: 10px; }
.df-root { --df-1: #2a78d6; --df-2: #eb6834; --df-3: #1baf7a; --df-4: #eda100; --df-5: #e87ba4; --df-6: #008300; --df-7: #6250d6; --df-8: #e34948; }
@media (prefers-color-scheme: dark) { .df-root { --df-1: #3987e5; --df-2: #d95926; --df-3: #199e70; --df-4: #c98500; --df-5: #d55181; --df-6: #2f9a2f; --df-7: #9085e9; --df-8: #e66767; } }
.df-root h3 { margin: 18px 0 8px; font-size: 1.02rem; }
.df-root .fig { padding: 8px; }
.df-root .fig svg { max-width: 640px; touch-action: pan-y; }
.df-root .fig svg text { font-size: 13px; }
.df-warn { margin: 8px 0; padding: 8px 12px; border-radius: 8px; font-size: .88rem; line-height: 1.6; background: var(--ng-bg); color: var(--text); border-left: 4px solid var(--ng); }
.df-warn.soft { background: var(--accent-soft); border-left-color: var(--accent); }
.df-legend { display: flex; flex-wrap: wrap; justify-content: center; gap: 4px 14px; margin: 6px 0 0; font-size: .82rem; color: var(--text); }
.df-legend span { display: inline-flex; align-items: center; gap: 5px; }
.df-legend svg { width: 26px; height: 10px; display: inline-block; margin: 0; }
.df-read { margin: 6px 0 0; font-size: .82rem; color: var(--muted); text-align: center; min-height: 1.4em; font-variant-numeric: tabular-nums; }
.df-slider { display: grid; gap: 4px; margin: 8px 0 0; font-size: .88rem; color: var(--muted); }
.df-slider input { width: 100%; accent-color: var(--accent); min-height: 32px; }
.df-steps { margin: 6px 0 0; padding-left: 1.3em; font-size: .88rem; line-height: 1.7; }
.df-steps li { margin: 4px 0; }
.df-steps code { display: block; white-space: pre-wrap; overflow-wrap: anywhere; font-size: .86rem; background: var(--bg); padding: 4px 8px; border-radius: 6px; color: var(--text); }
.df-root .table-wrap { margin: .5rem 0; }
.df-root .dy-table { font-size: .86rem; }
.df-root .dy-table td.l, .df-root .dy-table th.l { text-align: left; white-space: normal; }
.df-root .dy-table tr.cur { background: var(--accent-soft); }
.df-root .dy-table th.l:first-child { white-space: nowrap; }
.df-root .df-t-grp th.l:first-child { white-space: normal; min-width: 11em; }
.df-root .dy-table td.l { min-width: 7em; }
.df-btns { display: flex; flex-wrap: wrap; gap: 8px; margin: 6px 0; }
.df-root textarea { width: 100%; min-height: 9em; font: inherit; font-size: .9rem; font-family: ui-monospace, Menlo, Consolas, monospace; padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg); color: var(--text); }
.df-links { display: flex; flex-wrap: wrap; gap: 8px; margin: 10px 0 0; }
.df-src { font-size: .8rem; color: var(--muted); margin: 4px 0 0; }
`;
  document.head.append(css);
  box.classList.add('df-root');

  // ---- フォームの整え: タブ、副見出し、モードごとに見せる欄 ----
  const modeSel = el.mode;
  const modes = [...modeSel.options].map(o => o.value);
  const lab = n => el[n]?.closest('label');
  lab('mode').hidden = true;
  const tabs = document.createElement('div');
  tabs.className = 'df-tabs';
  tabs.setAttribute('role', 'group');
  tabs.setAttribute('aria-label', lab('mode').querySelector('span').textContent);
  tabs.innerHTML = modes.map(m => `<button type="button" data-mode="${m}" aria-pressed="false">${esc(optText('mode', m))}</button>`).join('');
  form.querySelector('h2').after(tabs);
  const subs = {};
  for (const [before, key] of [['bc', 'sub_prof'], ['L', 'sub_fdm'], ['c0', 'sub_carb'], ['tlo', 'sub_table'], ['frac', 'sub_two'], ['dop', 'sub_semi'], ['tu', 'sub_fit']]) {
    const p = document.createElement('p');
    p.className = 'df-sub';
    lab(before).before(p);
    subs[key] = p;
  }
  for (const n of ['sys', 'dop']) lab(n).classList.add('df-wide');
  for (const n of ['grp', 'bc', 'side', 'surf', 'sum']) lab(n).classList.add('df-wide2');
  const VIS = {
    arr: ['sys', 'd0', 'q', 't', 'hours', 'grp', 't2'],
    prof: ['sys', 'd0', 'q', 't', 'hours', 'sub_prof', 'bc', 'c0', 'cs', 'm', 'x', 'sub_fdm', 'L', 'side', 'surf', 'tr', 'frac', 'cs2'],
    carb: ['sys', 'd0', 'q', 'sub_carb', 'c0', 'cs', 'cx', 'xd', 't', 'hours', 'sub_table', 'tlo', 'thi', 'tstep', 'sub_two', 'frac', 'cs2'],
    semi: ['sub_semi', 'dop', 'tp', 'tpm', 'ns', 'td', 'tdm', 'nb', 'sum'],
    fit: ['sub_fit', 'tu', 'du', 't'],
  };
  const LABEL0 = {};
  for (const f of el) if (f.name) LABEL0[f.name] = f.closest('label')?.querySelector('span')?.textContent;
  // モードと条件でラベルを書き換える(元の文言は text の入力名の鍵)
  const relabel = (mode, bc) => {
    const over = {
      prof: { hours: T.l_hours_prof, t: T.l_t },
      carb: { t: T.l_t_carb, hours: T.l_hours_carb, c0: T.l_c0_carb, cs: T.l_cs_carb, frac: T.l_frac_carb, cs2: T.l_cs2_carb },
      fit: { t: T.l_t_fit },
    }[mode] ?? {};
    if (mode === 'prof' && bc === 'couple') Object.assign(over, { cs: T.l_ca, c0: T.l_cb, x: T.l_x_couple });
    if (mode === 'prof' && bc === 'gauss') Object.assign(over, { c0: T.l_c0_gauss });
    for (const n in LABEL0) { const sp = lab(n)?.querySelector('span'); if (sp) sp.textContent = over[n] ?? LABEL0[n]; }
  };
  const visible = () => {
    const mode = modeSel.value, bc = el.bc.value, surf = el.surf.value;
    let show = new Set(VIS[mode]);
    if (mode === 'prof') {
      if (bc !== 'gauss') show.delete('m');
      if (bc !== 'fdm') ['sub_fdm', 'L', 'side', 'surf', 'tr', 'frac', 'cs2'].forEach(n => show.delete(n));
      if (surf !== 'ramp') show.delete('tr');
      if (surf !== 'boost') { show.delete('frac'); show.delete('cs2'); }
    }
    for (const f of el) if (f.name && f.name !== 'mode') lab(f.name).hidden = !show.has(f.name);
    for (const k in subs) { subs[k].hidden = !show.has(k); subs[k].textContent = T[k] ?? ''; }
    tabs.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
    relabel(mode, bc);
    lab('t').style.order = mode === 'fit' ? '1' : '';
  };
  tabs.addEventListener('click', e => {
    const b = e.target.closest('button[data-mode]');
    if (!b || b.dataset.mode === modeSel.value) return;
    modeSel.value = b.dataset.mode;
    form.dispatchEvent(new Event('change', { bubbles: true }));
    form.dispatchEvent(new Event('input', { bubbles: true }));
  });

  // ---- 系の選択と D0・Q の欄を合わせる ----
  const near = (a, b) => Math.abs(a - b) <= Math.abs(b) * 1e-6 + 1e-300;
  const fillSys = () => {
    const s = sysById(el.sys.value);
    if (!s) return;
    el.d0.value = String(s.d0);
    el.q.value = String(Number(s.q.toPrecision(6)));
  };
  const syncSys = () => { // 入力した D0・Q が選んだ系と違えば「自分で入れた値」にする
    const s = sysById(el.sys.value);
    if (s && !(near(val('d0', 0), s.d0) && near(val('q', 0), Number(s.q.toPrecision(6))))) el.sys.value = 'custom';
  };
  syncSys();
  form.addEventListener('input', e => {
    if (e.target === el.sys) fillSys();
    else if (e.target === el.d0 || e.target === el.q) syncSys();
  });
  form.addEventListener('change', e => { if (e.target === el.sys) fillSys(); });

  // ---- 図(SVG)----
  const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
  const TOPC = [1600, 1400, 1300, 1200, 1100, 1000, 900, 800, 700, 600, 500, 400, 300, 200, 100, 0, -100];
  const pow10 = e => `10${String(e).replace(/./g, c => SUP[c])}`;
  const niceTicks = (a, b, n = 5) => {
    const span = b - a;
    if (!(span > 0)) return [a];
    const step0 = 10 ** Math.floor(Math.log10(span / n)), m = [1, 2, 2.5, 5, 10].find(k => span / (step0 * k) <= n + 0.5) * step0;
    const out = [];
    for (let v = Math.ceil(a / m - 1e-9) * m; v <= b + m * 1e-9; v += m) out.push(Number(v.toPrecision(12)));
    return out;
  };
  const sz = () => (box.clientWidth < 520 ? { W: 360, H: 270, l: 50, r: 10, t: 12, b: 40 } : { W: 640, H: 360, l: 64, r: 14, t: 14, b: 46 });
  // o: { xr, yr, ylog, xlabel, ylabel, xt (目盛り [値, 文字]), yt, top (上の目盛り [値, 文字]), lines [{pts, slot, dash, w, op}], dots [{x, y, slot, r, ring}], hl [{y, label}], vl [{x, label}] }
  function plot(svg, o) {
    const g = sz(), top = o.top ? 22 : 0;
    let L = g.l;
    const Rr = g.W - g.r, Tt = g.t + top, B = g.H - g.b;
    const [x0, x1] = o.xr, [y0, y1] = o.yr;
    const X = v => L + ((v - x0) / (x1 - x0)) * (Rr - L), Y = v => B - (((o.ylog ? Math.log10(v) : v) - y0) / (y1 - y0)) * (B - Tt);
    const color = s => (s === 'ac' ? 'var(--text)' : s === 'mu' ? 'var(--muted)' : `var(--df-${s})`);
    const id = svg.dataset.clip ?? (svg.dataset.clip = `dfc${Math.random().toString(36).slice(2, 8)}`);
    const path = pts => {
      let d = '', pen = false;
      for (const [x, y] of pts) {
        const yy = o.ylog ? (y > 0 ? Y(y) : NaN) : Y(y);
        if (!Number.isFinite(yy) || !Number.isFinite(x)) { pen = false; continue; }
        const cy = Math.max(Tt - 400, Math.min(B + 400, yy));
        d += `${pen ? 'L' : 'M'}${X(x).toFixed(1)},${cy.toFixed(1)}`;
        pen = true;
      }
      return d;
    };
    const xt = o.xt ?? niceTicks(x0, x1, g.W < 400 ? 4 : 6).map(v => [v, num(v, 4)]);
    const yt = o.yt ?? (o.ylog ? (() => { const out = [], k = Math.max(1, Math.ceil((y1 - y0) / 7)); for (let e = Math.ceil(y0); e <= Math.floor(y1); e += k) out.push([10 ** e, pow10(e)]); return out; })() : niceTicks(y0, y1, 5).map(v => [v, num(v, 4)]));
    // 縦軸の目盛りの字数が多いときは左の余白を広げ、軸の名前と重ならないようにする(上付き文字は細いので半分に数える)
    const tw = t => [...String(t)].reduce((w, c) => w + (/[⁰-⁹⁻¹²³]/.test(c) ? 0.5 : 1), 0) * 13 * 0.6;
    L = Math.max(L, Math.ceil(Math.max(0, ...yt.map(([, t]) => tw(t))) + 26));
    let s = `<defs><clipPath id="${id}"><rect x="${L}" y="${Tt}" width="${Rr - L}" height="${B - Tt}"/></clipPath></defs>`;
    s += `<rect x="${L}" y="${Tt}" width="${Rr - L}" height="${B - Tt}" fill="var(--bg)"/>`;
    s += xt.map(([v, t]) => `<line x1="${X(v)}" y1="${Tt}" x2="${X(v)}" y2="${B}" stroke="var(--border)"/><text x="${X(v)}" y="${B + 16}" fill="var(--muted)" text-anchor="${X(v) - L < tw(t) / 2 + 2 ? 'start' : Rr - X(v) < tw(t) / 2 + 2 ? 'end' : 'middle'}">${esc(t)}</text>`).join('');
    s += yt.map(([v, t]) => `<line x1="${L}" y1="${Y(v)}" x2="${Rr}" y2="${Y(v)}" stroke="var(--border)"/><text x="${L - 5}" y="${Y(v) + 4}" fill="var(--muted)" text-anchor="end">${esc(t)}</text>`).join('');
    if (o.top) s += o.top.filter(([v, t]) => v >= Math.min(x0, x1) && v <= Math.max(x0, x1) && X(v) - L >= t.length * 3.2 && g.W - X(v) >= t.length * 3.4).sort((p, q) => p[0] - q[0]).filter(function ([v]) { const ok = this.last == null || X(v) - this.last >= (g.W < 400 ? 46 : 52); if (ok) this.last = X(v); return ok; }, {}).map(([v, t]) => `<line x1="${X(v)}" y1="${Tt - 4}" x2="${X(v)}" y2="${Tt}" stroke="var(--muted)"/><text x="${X(v)}" y="${Tt - 7}" fill="var(--muted)" text-anchor="middle" class="sm">${esc(t)}</text>`).join('');
    s += `<rect x="${L}" y="${Tt}" width="${Rr - L}" height="${B - Tt}" fill="none" stroke="var(--muted)" stroke-width="1"/>`;
    s += `<g clip-path="url(#${id})">`;
    for (const h of o.hl ?? []) s += `<line x1="${L}" x2="${Rr}" y1="${Y(h.y)}" y2="${Y(h.y)}" stroke="var(--muted)" stroke-dasharray="3 3"/>${h.label ? `<text x="${Rr - 4}" y="${Y(h.y) - 4}" fill="var(--muted)" text-anchor="end">${esc(h.label)}</text>` : ''}`;
    for (const v of (o.vl ?? []).filter(v => Number.isFinite(v.x) && v.x >= Math.min(x0, x1) && v.x <= Math.max(x0, x1))) s += `<line y1="${Tt}" y2="${B}" x1="${X(v.x)}" x2="${X(v.x)}" stroke="var(--muted)" stroke-dasharray="3 3"/>${v.label ? `<text x="${X(v.x) + 4}" y="${Tt + 14}" fill="var(--muted)">${esc(v.label)}</text>` : ''}`;
    for (const ln of o.lines ?? []) s += `<path d="${path(ln.pts)}" fill="none" stroke="${color(ln.slot)}" stroke-width="${ln.w ?? 2}"${ln.dash ? ` stroke-dasharray="${ln.dash}"` : ''}${ln.op ? ` stroke-opacity="${ln.op}"` : ''} stroke-linejoin="round" stroke-linecap="round"/>`;
    for (const d of o.dots ?? []) { const yy = Y(d.y); if (Number.isFinite(yy)) s += `<circle cx="${X(d.x)}" cy="${yy}" r="${d.r ?? 4.5}" fill="${color(d.slot)}" stroke="var(--surface)" stroke-width="2"/>`; }
    s += `<line data-df="cross" x1="0" x2="0" y1="${Tt}" y2="${B}" stroke="var(--text)" stroke-width="1" visibility="hidden"/>`;
    s += '</g>';
    s += `<text x="${(L + Rr) / 2}" y="${g.H - 6}" fill="var(--text)" text-anchor="middle">${esc(o.xlabel)}</text>`;
    s += `<text x="13" y="${(Tt + B) / 2}" fill="var(--text)" text-anchor="middle" transform="rotate(-90 13 ${(Tt + B) / 2})">${esc(o.ylabel)}</text>`;
    svg.setAttribute('viewBox', `0 0 ${g.W} ${g.H}`);
    svg.innerHTML = s;
    return { X, Y, inv: px => x0 + ((px - L) / (Rr - L)) * (x1 - x0), L, Rr, Tt, B };
  }
  const legend = items => items.map(it => `<span><svg viewBox="0 0 26 10" aria-hidden="true">${it.dot ? `<circle cx="13" cy="5" r="4" fill="var(--df-${it.slot})"/>` : `<line x1="1" y1="5" x2="25" y2="5" stroke="${it.slot === 'ac' ? 'var(--text)' : it.slot === 'mu' ? 'var(--muted)' : `var(--df-${it.slot})`}" stroke-width="${it.w ?? 2.5}"${it.dash ? ` stroke-dasharray="${it.dash}"` : ''}/>`}</svg>${esc(it.label)}</span>`).join('');
  // 図の上で指を動かす・カーソルを置くと、その位置の値を読む(縦の線と文字)。縦のスクロールは止めない
  function hover(svg, geo, readOut, onX) {
    const cross = svg.querySelector('[data-df="cross"]');
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
  const tables = {}; // CSV の元: { 名前: { head, rows } }
  const tableHTML = (name, head, rows, opts = {}) => {
    tables[name] = { head, rows: rows.map(r => r.map(c => (c && typeof c === 'object' ? c.v : c))) };
    return `<div class="table-wrap"><table class="dy-table df-t-${name}"><thead><tr>${head.map((h, i) => `<th scope="col"${i === 0 ? ' class="l"' : ''}>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r, ri) => `<tr${opts.cur === ri ? ' class="cur"' : ''}>${r.map((c, i) => {
      const t = c && typeof c === 'object' ? c.t : typeof c === 'number' ? tnum(c) : c;
      return i === 0 ? `<th scope="row" class="l">${esc(t)}</th>` : `<td data-out="${name}-${ri}-${i}"${opts.left?.includes(i) ? ' class="l"' : ''}>${esc(t)}</td>`;
    }).join('')}</tr>`).join('')}</tbody></table></div><div class="df-btns"><button type="button" class="btn btn-ghost btn-small" data-csv="${name}">${esc(T.csv)}</button></div>`;
  };
  box.addEventListener('click', async e => {
    const b = e.target.closest('[data-csv]');
    if (!b) return;
    const t = tables[b.dataset.csv];
    if (!t) return;
    const csv = [t.head, ...t.rows].map(r => r.map(csvNum).join(',')).join('\n');
    if (await copyText(csv)) flash(b, T.copied);
  });
  const stats = items => `<dl class="dy-stats">${items.filter(Boolean).map(([k, l, v]) => `<div><dt>${esc(l)}</dt><dd data-out="${k}">${esc(v)}</dd></div>`).join('')}</dl>`;
  const steps = items => `<details class="df-stepbox"${stepsOpen ? ' open' : ''}><summary>${esc(T.steps)}</summary><ol class="df-steps">${items.filter(Boolean).map(([l, f]) => `<li>${esc(l)}${f ? `<code>${esc(f)}</code>` : ''}</li>`).join('')}</ol></details>`;
  let stepsOpen = false;
  box.addEventListener('toggle', e => { if (e.target.classList?.contains('df-stepbox')) stepsOpen = e.target.open; }, true);
  const warnHTML = list => list.map(w => `<p class="df-warn${w.soft ? ' soft' : ''}" data-df-warn>${esc(w.text)}</p>`).join('');
  const link = (path, text) => `<a class="btn btn-ghost btn-small" href="${home}${path}">${esc(text)} →</a>`;
  const rangeMsgs = (s, tc) => rangeCheck(s, tc).map(w => ({
    soft: w.lv === 'soft', k: w.k,
    text: fmt(T[`w_${w.k}`], { sys: sysName(s.id), t: tnum(tc, 5), v: Array.isArray(w.v) ? `${w.v[0]}–${w.v[1]}` : tnum(w.v, 5), tm: tnum(s.tm, 5) }),
  }));
  const srcLine = s => `<p class="df-src">${esc(T.source)}: ${esc(SRC[s.src])}</p>`;

  // ---- 共通の値 ----
  const cur = () => {
    const s = sysById(el.sys.value);
    const d0 = val('d0', 0), q = val('q', 0), tc = val('t', -273.15 + 1e-9), h = val('hours', 0);
    return { s, d0, q, tc, h, D: Dof(d0, q, tc), ts: h * 3600 };
  };
  const qLine = (d0, q, tc, D) => `D = ${sci(d0, 3)} × exp(−${num(q * 1000, 6)} / (${num(R, 6)} × ${num(TK(tc), 6)})) = ${D3(D)} m²/s`;

  // =========== arr: 拡散係数とアレニウス図 ===========
  function renderArr() {
    const { s, d0, q, tc, h, D, ts } = cur();
    const t2 = val('t2', -273.15 + 1e-9), D2 = Dof(d0, q, t2), grp = el.grp.value;
    const L = Math.sqrt(D * ts);
    const warns = s ? rangeMsgs(s, tc) : [];
    if (s && rangeCheck(s, t2).some(w => w.lv === 'hard')) warns.push({ soft: true, text: fmt(T.w_t2, { t: tnum(t2, 5) }) });
    const g = GROUPS[grp];
    const ids = g ? [...g.ids] : [];
    const extra = s && !ids.includes(s.id);
    let html = warnHTML(warns);
    html += stats([
      ['tk', T.o_tk, `${tnum(TK(tc), 6)} K`],
      ['d', T.o_d, `${D3(D)} m²/s`],
      ['dcm', T.o_dcm, `${D3(D * 1e4)} cm²/s`],
      ['qev', T.o_qev, `${num(q / EV, 4)} eV`],
      ['l', T.o_l, mm(L)],
      ['l2', T.o_l2, mm(2 * L)],
      ['d2', fmt(T.o_d2, { t: tnum(t2, 5) }), `${D3(D2)} m²/s`],
      ['teq', fmt(T.o_teq, { t: tnum(t2, 5), h: num(h, 4) }), hrs((D * ts) / D2)],
    ]);
    html += `<h3>${esc(T.h_arr)}</h3><div class="fig"><svg data-df="arr" role="img" aria-label="${esc(T.h_arr)}"></svg><p class="df-legend" data-df="lg"></p><p class="df-read" data-df="read"></p></div><p class="muted" style="font-size:.85rem">${esc(T.arr_note)}</p>`;
    // 表: 組の系の D(この温度)
    if (g || s) {
      const list = (extra ? [s.id, ...ids] : ids).map(sysById).filter(Boolean);
      const rows = list.map(x => {
        const Dx = Dof(x.d0, x.q, tc), w = rangeCheck(x, tc);
        return [sysName(x.id), { t: sci(x.d0, 2), v: x.d0 }, { t: num(x.q, 4), v: x.q }, { t: D3(Dx), v: Dx }, { t: num(Math.sqrt(Dx * ts) * 1e3, 3), v: Math.sqrt(Dx * ts) * 1e3 }, w.some(y => y.lv === 'hard') ? T.r_out : w.length ? T.r_soft : T.r_ok];
      });
      html += `<h3>${esc(fmt(T.h_grp_table, { t: tnum(tc, 5), h: num(h, 4) }))}</h3>`;
      html += tableHTML('grp', [T.c_sys, 'D0 (m²/s)', 'Q (kJ/mol)', fmt(T.c_d_at, { t: tnum(tc, 5) }), fmt(T.c_l_at, { h: num(h, 4) }), T.c_range], rows, { cur: extra || !s ? (extra ? 0 : -1) : list.findIndex(x => x.id === s.id), left: [5] });
    }
    html += steps([
      [T.s_tk, `T = ${tnum(tc, 6)} + ${num(273.15, 5)} = ${tnum(TK(tc), 6)} K`],
      [T.s_arr, qLine(d0, q, tc, D)],
      [T.s_unit, `D = ${D3(D)} m²/s × 10⁴ = ${D3(D * 1e4)} cm²/s ;  Q = ${num(q, 5)} kJ/mol ÷ ${num(EV, 6)} = ${num(q / EV, 4)} eV`],
      [T.s_l, `t = ${num(h, 4)} h × 3600 = ${num(ts, 6)} s ;  √(Dt) = √(${D3(D)} × ${num(ts, 6)}) = ${sci(L, 3)} m = ${num(L * 1e3, 3)} mm`],
      [T.s_teq, `D(${tnum(t2, 5)} °C) = ${D3(D2)} m²/s ;  t₂ = D₁t₁/D₂ = ${D3(D)} × ${num(ts, 6)} / ${D3(D2)} = ${num((D * ts) / D2, 4)} s`],
      [T.s_ln, `ln D = ln D0 − (Q/R)·(1/T) = ${num(Math.log(d0), 5)} − ${num((q * 1000) / R, 6)} × ${sci(1 / TK(tc), 4)} = ${num(Math.log(D), 5)}`],
    ]);
    if (s) html += srcLine(s);
    html += `<div class="df-links">${s && s.host === 'Fe' && s.el === 'C' ? link(`tools/iron-carbon-phase-diagram/?t=${Math.round(tc)}&view=steel`, T.ln_fec) : ''}${s ? link(`tools/materials-periodic-table/?el=${s.host}`, fmt(T.ln_ptable, { el: s.host })) : ''}${s && s.kind === 'int' ? link(`tools/crystal-structure-viewer/?type=${s.ph === 'alpha' ? 'bcc' : 'fcc'}&void=oct`, T.ln_xtal) : ''}</div>`;
    box.innerHTML = html;
    drawArr(ids, extra ? s : null, s, tc, g?.win);
  }
  function drawArr(ids, extraSys, s, tc, win0) {
    const svg = box.querySelector('[data-df="arr"]');
    const win = win0 ? [...win0] : [Math.max(100, tc - 300), tc + 300];
    if (tc < win[0]) win[0] = tc - 50;
    if (tc > win[1]) win[1] = tc + 50;
    const xr = [1000 / TK(win[1]), 1000 / TK(win[0])];
    const list = ids.map((id, i) => ({ s: sysById(id), slot: (i % 8) + 1 }));
    if (extraSys) list.push({ s: extraSys, slot: 'ac' });
    if (!s) list.push({ s: { id: 'custom', d0: val('d0', 0), q: val('q', 0), lo: null, hi: null }, slot: 'ac', custom: true });
    const curve = (x, a, b) => { const out = []; for (let k = 0; k <= 80; k++) { const ix = a + ((b - a) * k) / 80; out.push([ix, Dof(x.d0, x.q, 1000 / ix - 273.15)]); } return out; };
    let lo = Infinity, hi = -Infinity;
    const lines = [];
    for (const it of list) {
      const x = it.s;
      // 使える範囲は実線、範囲の外(相・融点の外)は描かない、外挿の注意の範囲は点線
      const tlo = Math.max(win[0], x.lo ?? -Infinity), thi = Math.min(win[1], x.hi ?? Infinity);
      if (!(thi > tlo)) continue;
      const a = 1000 / TK(thi), b = 1000 / TK(tlo);
      const softLo = Math.max(x.gb ?? -Infinity, x.a3 ? TG : -Infinity, x.meas ? x.meas[0] : -Infinity);
      const softHi = x.meas ? Math.min(x.meas[1], thi) : thi;
      const sa = 1000 / TK(Math.min(softHi, thi)), sb = 1000 / TK(Math.max(softLo, tlo));
      const pts = curve(x, a, b);
      pts.forEach(p => { const l = Math.log10(p[1]); if (Number.isFinite(l)) { lo = Math.min(lo, l); hi = Math.max(hi, l); } });
      const w = it.slot === 'ac' || x.id === s?.id ? 3.2 : 2;
      if (sb > sa) lines.push({ pts: curve(x, sa, sb), slot: it.slot, w });
      if (b > sb) lines.push({ pts: curve(x, Math.max(sb, a), b), slot: it.slot, w: 1.6, dash: '2 4' });
      if (sa > a) lines.push({ pts: curve(x, a, Math.min(sa, b)), slot: it.slot, w: 1.6, dash: '2 4' });
      it.ok = true;
    }
    if (!Number.isFinite(lo)) { svg.innerHTML = ''; return; }
    let y1 = Math.ceil(hi + 0.2), y0 = Math.floor(lo - 0.2);
    if (y1 - y0 > 18) y0 = y1 - 18;
    const topT = TOPC.filter(v => v >= win[0] && v <= win[1]).map(v => [1000 / TK(v), `${num(v, 4)} °C`]);
    const Dcur = Dof(val('d0', 0), val('q', 0), tc);
    const geo = plot(svg, {
      xr, yr: [y0, y1], ylog: true, xlabel: T.ax_invT, ylabel: T.ax_logD, top: topT,
      lines, dots: [{ x: 1000 / TK(tc), y: Dcur, slot: 'ac', r: 5 }],
    });
    const lg = box.querySelector('[data-df="lg"]');
    lg.innerHTML = legend(list.filter(it => it.ok).map(it => ({ slot: it.slot, label: it.custom ? T.custom : sysName(it.s.id), w: it.slot === 'ac' ? 3.2 : 2.5 }))) + legend([{ slot: 'mu', dash: '2 4', label: T.lg_extrap, w: 1.6 }]);
    const read = box.querySelector('[data-df="read"]');
    read.dataset.def = T.read_hint;
    read.textContent = T.read_hint;
    hover(svg, geo, read, ix => {
      const tt = 1000 / ix - 273.15;
      return `${num(tt, 4)} °C (1000/T = ${num(ix, 4)}): ` + list.filter(it => it.ok).map(it => `${it.custom ? T.custom : sysName(it.s.id).replace(/\s*[(（][^()（）]*[)）]\s*$/, '')} ${D3(Dof(it.s.d0, it.s.q, tt))}`).join(' · ');
    });
  }

  // =========== prof: 濃度分布 ===========
  let profState = null; // 差分法の結果を残し、スライダーでは描き直しだけにする
  let sliderPos = 1000;
  function profCalc() {
    const { s, d0, q, tc, h, D, ts } = cur();
    const bc = el.bc.value, c0 = val('c0'), cs = val('cs'), M = val('m', 0), xmm = bc === 'couple' ? val('x') : val('x', 0), Lmm = val('L', 1e-9); // 拡散対は界面の左(負)も読む
    const side = el.side.value, surf = el.surf.value, tr = val('tr', 0) * 3600, frac = Math.min(0.999, Math.max(0.001, val('frac', 0) / 100)), cs2 = val('cs2');
    const st = { s, d0, q, tc, h, D, ts, bc, c0, cs, M, x: xmm / 1e3, L: Lmm / 1e3, side, surf, tr, frac, cs2 };
    if (bc === 'fdm' && D > 0 && ts > 0) {
      const Ls = side === 'both' ? st.L / 2 : st.L;
      st.Ls = Ls;
      // Dt/L² が大きいと陽解法の段数(∝ Dt/L² × N²)が膨らんで画面が止まるので、FDM_AMAX までに限る(そのころ板の中はほぼ一様)
      if ((D * ts) / (Ls * Ls) > FDM_AMAX) st.big = (D * ts) / (Ls * Ls);
      else st.res = fdm({ Ls, c0, csAt: surfFn(surf, { c0, cs, tr, t1: frac * ts, cs2 }), D, tEnd: ts });
    }
    return st;
  }
  // スライダーの位置 → 時間(√t に比例するように2乗で割り当てる)
  const tAt = (st, p) => st.ts * (p / 1000) ** 2;
  function renderProf(recalc = true) {
    if (recalc || !profState) profState = profCalc();
    const st = profState;
    const { s, tc, D, ts, bc, c0, cs } = st;
    const warns = s ? rangeMsgs(s, tc) : [];
    if (bc === 'fdm' && st.res && st.res.dx > Math.sqrt(D * ts) / 4) warns.push({ soft: true, text: T.w_grid });
    if (bc === 'fdm' && st.res && st.x > st.L) warns.push({ soft: true, text: T.w_x_out });
    if (bc === 'fdm' && st.big) warns.push({ text: fmt(T.w_fdm_big, { a: num(st.big, 3), m: FDM_AMAX }) });
    let html = warnHTML(warns);
    html += `<div data-df="pstats"></div>`;
    html += `<h3${st.big ? ' style="display:none"' : ''}>${esc(T.h_prof)}</h3><div class="fig"${st.big ? ' style="display:none"' : ''}><svg data-df="prof" role="img" aria-label="${esc(T.h_prof)}"></svg><p class="df-legend" data-df="lg"></p><p class="df-read" data-df="read"></p>
<label class="df-slider"><span data-df="slab"></span><input type="range" min="0" max="1000" step="1" value="${sliderPos}" data-df="slider" aria-label="${esc(T.slider)}"></label></div>`;
    html += `<p class="muted" style="font-size:.85rem">${esc(T[`note_${bc}`])}</p>`;
    html += `<div data-df="ptable"></div><div data-df="psteps"></div>`;
    if (s) html += srcLine(s);
    box.innerHTML = html;
    box.querySelector('[data-df="slider"]').addEventListener('input', e => { sliderPos = Number(e.target.value); drawProf(); });
    drawProf();
  }
  function drawProf() {
    const st = profState;
    const { D, ts, bc, c0, cs, M, x } = st;
    const t = tAt(st, sliderPos), Dt = D * t, sq = Math.sqrt(Dt);
    const svg = box.querySelector('[data-df="prof"]');
    box.querySelector('[data-df="slab"]').textContent = fmt(T.slider_at, { t: hrs(t), l: mm(sq) });
    const lgItems = [], lines = [];
    let xr, yr, xs, ylabel = T.ax_c, xlabel = T.ax_x;
    const sqEnd = Math.sqrt(D * ts);
    const conc = v => num(v, 4);
    let statsItems = [], tab = '', stp = [];
    if (bc === 'erf' || bc === 'gauss') {
      const xmax = Math.max(6 * sqEnd, x * 1.25, 1e-9);
      xr = [0, xmax * 1e3];
      xs = Array.from({ length: 241 }, (_, i) => (xmax * i) / 240);
      const f = bc === 'erf' ? xx => pErf(xx, Dt, c0, cs) : xx => pGauss(xx, Dt, M / 1e3, c0);
      const fEnd = bc === 'erf' ? xx => pErf(xx, D * ts, c0, cs) : xx => pGauss(xx, D * ts, M / 1e3, c0);
      if (sliderPos < 1000) { lines.push({ pts: xs.map(xx => [xx * 1e3, fEnd(xx)]), slot: 'mu', dash: '5 4', w: 1.5 }); lgItems.push({ slot: 'mu', dash: '5 4', label: fmt(T.lg_end, { t: hrs(ts) }) }); }
      lines.push({ pts: xs.map(xx => [xx * 1e3, t > 0 ? f(xx) : xx === 0 ? (bc === 'erf' ? cs : c0) : c0]), slot: 1, w: 2.6 });
      lgItems.unshift({ slot: 1, label: fmt(T.lg_at, { t: hrs(t) }) });
      const peak = bc === 'gauss' ? c0 + (M / 1e3) / Math.sqrt(Math.PI * D * ts / 4) : Math.max(c0, cs);
      yr = [Math.min(c0, cs, 0), peak * 1.08 || 1];
      if (bc === 'gauss') yr = [Math.min(0, c0), peak * 1.08];
      const cx = t > 0 ? f(x) : NaN;
      if (bc === 'erf') {
        const z = x / (2 * sq), ratio = erfc(z);
        statsItems = [['d', T.o_d, `${D3(D)} m²/s`], ['l', T.o_l, mm(sq)], ['z', T.o_z, num(z, 4)], ['ratio', T.o_ratio, `${num(ratio * 100, 4)} %`], ['cx', fmt(T.o_cx, { x: mm(x) }), conc(cx)], ['up', T.o_up, `${num((2 * (cs - c0) * Math.sqrt(Dt / Math.PI)) * 1e3, 4)} (${T.u_cmm})`]];
        stp = [[T.s_arr, qLine(st.d0, st.q, st.tc, D)], [T.s_z, `z = x / (2√(Dt)) = ${num(x * 1e3, 4)} mm / (2 × ${num(sq * 1e3, 4)} mm) = ${num(z, 5)}`],
          [T.s_erfc, `(Cx − C0)/(Cs − C0) = erfc(z) = 1 − erf(${num(z, 4)}) = ${num(ratio, 5)}`], [T.s_cx, `Cx = ${conc(c0)} + (${conc(cs)} − ${conc(c0)}) × ${num(ratio, 5)} = ${conc(cx)}`],
          [T.s_up, `M(t) = 2(Cs − C0)√(Dt/π) = ${num((2 * (cs - c0) * Math.sqrt(Dt / Math.PI)) * 1e3, 4)} (${T.u_cmm})`]];
      } else {
        const peakNow = (M / 1e3) / Math.sqrt(Math.PI * Dt);
        statsItems = [['d', T.o_d, `${D3(D)} m²/s`], ['l', T.o_l, mm(sq)], ['cpk', T.o_csurf, conc(c0 + peakNow)], ['cx', fmt(T.o_cx, { x: mm(x) }), conc(cx)], ['half', T.o_half, mm(2 * sq * Math.sqrt(Math.log(2)))]];
        stp = [[T.s_arr, qLine(st.d0, st.q, st.tc, D)], [T.s_gauss, `C(x, t) = C0 + M/√(πDt) · exp(−x²/(4Dt)),  M = ${num(M, 4)} (${T.u_cmm})`],
          [T.s_gsurf, `C(0, t) − C0 = ${num(M, 4)} / √(π × ${num(Dt * 1e6, 4)} mm²) = ${conc(peakNow)}`], [T.s_cx, `C(${num(x * 1e3, 4)} mm) = ${conc(cx)}`],
          [T.s_half, `exp(−x²/4Dt) = 1/2 → x = 2√(Dt·ln 2) = ${num(2 * sq * Math.sqrt(Math.log(2)) * 1e3, 4)} mm`]];
      }
    } else if (bc === 'couple') {
      const xmax = Math.max(6 * sqEnd, x * 1.25, 1e-9);
      xr = [-xmax * 1e3, xmax * 1e3];
      xs = Array.from({ length: 241 }, (_, i) => -xmax + (2 * xmax * i) / 240);
      const ca = cs, cb = c0;
      if (sliderPos < 1000) { lines.push({ pts: xs.map(xx => [xx * 1e3, pCouple(xx, D * ts, ca, cb)]), slot: 'mu', dash: '5 4', w: 1.5 }); lgItems.push({ slot: 'mu', dash: '5 4', label: fmt(T.lg_end, { t: hrs(ts) }) }); }
      lines.push({ pts: xs.map(xx => [xx * 1e3, t > 0 ? pCouple(xx, Dt, ca, cb) : xx < 0 ? ca : cb]), slot: 1, w: 2.6 });
      lgItems.unshift({ slot: 1, label: fmt(T.lg_at, { t: hrs(t) }) });
      yr = [Math.min(ca, cb, 0), Math.max(ca, cb) * 1.08 || 1];
      xlabel = T.ax_x_couple;
      const cx = pCouple(x, Dt, ca, cb);
      // 濃度が両端の差の 10 %〜90 % になる幅(erf(u) = ±0.8 → u = 0.906)
      const w = 4 * sq * ierf(0.8);
      statsItems = [['d', T.o_d, `${D3(D)} m²/s`], ['l', T.o_l, mm(sq)], ['cmid', T.o_cmid, conc((ca + cb) / 2)], ['cx', fmt(T.o_cx, { x: mm(x) }), conc(cx)], ['w', T.o_w1090, mm(w)]];
      stp = [[T.s_arr, qLine(st.d0, st.q, st.tc, D)], [T.s_couple, `C(x, t) = (CA + CB)/2 − (CA − CB)/2 · erf(x/(2√(Dt)))`],
        [T.s_cx, `C(${num(x * 1e3, 4)} mm) = ${conc((ca + cb) / 2)} − ${conc((ca - cb) / 2)} × erf(${num(x / (2 * sq), 4)}) = ${conc(cx)}`],
        [T.s_w, `erf(u) = 0.8 → u = ${num(ierf(0.8), 4)};  Δx(10–90 %) = 4u√(Dt) = ${num(w * 1e3, 4)} mm`]];
    } else {
      // 差分法
      const res = st.res;
      if (!res) { svg.innerHTML = ''; return; }
      const both = st.side === 'both', Ls = st.Ls, Ltot = st.L;
      // スライダーの時間に最も近い記録
      let snap = res.snaps[0];
      for (const sn of res.snaps) if (Math.abs(sn.t - t) < Math.abs(snap.t - t)) snap = sn;
      const tt = snap.t, Dtt = D * tt;
      const step = Math.max(1, Math.ceil(res.N / 400));
      const half = [];
      for (let i = 0; i <= res.N; i += step) half.push([i * res.dx, snap.c[i]]);
      if (half[half.length - 1][0] < Ls) half.push([Ls, snap.c[res.N]]);
      const full = pts => (both ? [...pts, ...pts.slice(0, -1).reverse().map(([xx, v]) => [Ltot - xx, v])] : pts);
      xr = [0, Ltot * 1e3];
      const exact = st.surf === 'const';
      const xsH = Array.from({ length: 201 }, (_, i) => (Ls * i) / 200);
      const csNow = surfFn(st.surf, { c0, cs, tr: st.tr, t1: st.frac * ts, cs2: st.cs2 })(tt);
      const erfPts = full(xsH.map(xx => [xx, tt > 0 ? pErf(xx, Dtt, c0, cs) : xx === 0 ? cs : c0]));
      lines.push({ pts: erfPts.map(([xx, v]) => [xx * 1e3, v]), slot: 2, dash: '6 4', w: 2 });
      lines.push({ pts: full(half).map(([xx, v]) => [xx * 1e3, v]), slot: 1, w: 2.6 });
      if (exact) lines.push({ pts: full(xsH.map(xx => [xx, pSlab(xx, Dtt, Ls, c0, cs)])).map(([xx, v]) => [xx * 1e3, v]), slot: 3, dash: '2 5', w: 2.6 });
      lgItems.push({ slot: 1, label: fmt(T.lg_fdm, { t: hrs(tt) }) });
      if (exact) lgItems.push({ slot: 3, dash: '2 5', label: T.lg_slab });
      lgItems.push({ slot: 2, dash: '6 4', label: T.lg_erf });
      const vals = [c0, cs, st.surf === 'boost' ? st.cs2 : cs];
      yr = [Math.min(0, ...vals), Math.max(...vals) * 1.08 || 1];
      // 誤差(最後の時間で)
      const cEnd = res.c;
      let eSlab = 0, eErf = 0;
      const dC = Math.abs(cs - c0) || 1;
      for (let i = 0; i <= res.N; i++) {
        const xx = i * res.dx;
        if (exact) eSlab = Math.max(eSlab, Math.abs(cEnd[i] - pSlab(xx, D * ts, Ls, c0, cs)));
        eErf = Math.max(eErf, Math.abs(cEnd[i] - pErf(xx, D * ts, c0, cs)));
      }
      const xq = Math.min(both ? Math.min(st.x, Ltot - st.x) : st.x, Ls);
      const cF = at(cEnd, res.dx, Math.max(0, xq)), cS = pSlab(Math.max(0, xq), D * ts, Ls, c0, cs), cE = pErf(Math.max(0, xq), D * ts, c0, cs);
      const upF = uptake(cEnd, res.dx, c0) * (both ? 2 : 1), upE = 2 * (cs - c0) * Math.sqrt((D * ts) / Math.PI) * (both ? 2 : 1);
      statsItems = [['d', T.o_d, `${D3(D)} m²/s`], ['l', T.o_l, mm(Math.sqrt(D * ts))], ['a', T.o_fo, num((D * ts) / (Ls * Ls), 4)],
        ['cx', fmt(T.o_cx_fdm, { x: mm(st.x), t: hrs(ts) }), num(cF, 4)], exact ? ['cxs', T.o_cx_slab, num(cS, 4)] : null, ['cxe', T.o_cx_erf, num(cE, 4)],
        exact ? ['es', T.o_err_slab, `${num((eSlab / dC) * 100, 3)} %`] : null, ['ee', T.o_err_erf, `${num((eErf / dC) * 100, 3)} %`],
        ['upf', T.o_up_fdm, `${num(upF * 1e3, 4)} (${T.u_cmm})`], ['upe', T.o_up_erf, `${num(upE * 1e3, 4)} (${T.u_cmm})`]];
      stp = [[T.s_arr, qLine(st.d0, st.q, st.tc, D)],
        [T.s_grid, `N = ${res.N}, Δx = ${num(res.dx * 1e6, 4)} µm, Δt = ${num(res.dt, 4)} s, ${T.s_steps} = ${res.steps}`],
        [T.s_r, `r = DΔt/Δx² = ${D3(D)} × ${num(res.dt, 4)} / (${sci(res.dx, 3)})² = ${num(res.r, 4)}  (≤ 0.5)`],
        [T.s_ftcs, 'Cᵢⁿ⁺¹ = Cᵢⁿ + r (Cᵢ₋₁ⁿ − 2Cᵢⁿ + Cᵢ₊₁ⁿ) ;  C₀ⁿ⁺¹ = Cs(tⁿ⁺¹) ;  C_Nⁿ⁺¹ = C_Nⁿ + 2r (C_N₋₁ⁿ − C_Nⁿ)'],
        [T.s_fo, `Dt/L² = ${D3(D)} × ${num(ts, 6)} / (${sci(Ls, 3)})² = ${num((D * ts) / (Ls * Ls), 4)}`],
        exact ? [T.s_slab, (D * ts) / (Ls * Ls) < 0.5 ? '(C − C0)/(Cs − C0) = Σₖ (−1)ᵏ [erfc((2kL + x)/(2√(Dt))) + erfc((2(k+1)L − x)/(2√(Dt)))]' : '(Cs − C)/(Cs − C0) = Σₙ (2/λₙ) sin(λₙx/L) exp(−λₙ²Dt/L²),  λₙ = (2n+1)π/2'] : null];
      // 表: 深さごとの値
      const rows = [];
      for (let k = 0; k <= 10; k++) {
        const xx = (Ls * k) / 10;
        const r = [{ t: num(xx * 1e3, 4), v: xx * 1e3 }, { t: num(at(cEnd, res.dx, xx), 4), v: at(cEnd, res.dx, xx) }];
        if (exact) r.push({ t: num(pSlab(xx, D * ts, Ls, c0, cs), 4), v: pSlab(xx, D * ts, Ls, c0, cs) });
        r.push({ t: num(pErf(xx, D * ts, c0, cs), 4), v: pErf(xx, D * ts, c0, cs) });
        rows.push(r);
      }
      tab = `<h3>${esc(fmt(T.h_ptable, { t: hrs(ts) }))}</h3>` + tableHTML('prof', [T.c_x, T.c_fdm, ...(exact ? [T.c_slab] : []), T.c_erf], rows);
      xs = null;
      box.querySelector('[data-df="slab"]').textContent = fmt(T.slider_at, { t: hrs(tt), l: mm(Math.sqrt(Dtt)) }) + (csNow !== cs ? ` · Cs = ${num(csNow, 4)}` : '');
    }
    if (!tab && (bc === 'erf' || bc === 'gauss' || bc === 'couple')) {
      // 表: 深さごとの値(いまの時間)
      const rows = [];
      for (const xmmv of niceTicks(xr[0], xr[1], 10)) {
        const xx = xmmv / 1e3;
        const v = bc === 'erf' ? pErf(xx, D * ts, c0, cs) : bc === 'gauss' ? pGauss(xx, D * ts, M / 1e3, c0) : pCouple(xx, D * ts, cs, c0);
        rows.push([{ t: num(xx * 1e3, 4), v: xx * 1e3 }, { t: num(v, 4), v }]);
      }
      tab = `<h3>${esc(fmt(T.h_ptable, { t: hrs(ts) }))}</h3>` + tableHTML('prof', [bc === 'couple' ? T.ax_x_couple : T.c_x, T.c_c], rows);
    }
    const geo = plot(svg, { xr, yr, xlabel, ylabel, lines, vl: x != null && bc !== 'fdm' ? [{ x: x * 1e3 }] : bc === 'fdm' ? [{ x: st.x * 1e3 }] : [] });
    box.querySelector('[data-df="lg"]').innerHTML = legend(lgItems);
    const read = box.querySelector('[data-df="read"]');
    read.dataset.def = T.read_hint2; read.textContent = T.read_hint2;
    hover(svg, geo, read, xm => {
      const xx = xm / 1e3;
      if (bc === 'erf') return `x = ${num(xm, 4)} mm: C = ${num(pErf(xx, Dt, c0, cs), 4)}`;
      if (bc === 'gauss') return `x = ${num(xm, 4)} mm: C = ${num(pGauss(xx, Dt, M / 1e3, c0), 4)}`;
      if (bc === 'couple') return `x = ${num(xm, 4)} mm: C = ${num(pCouple(xx, Dt, cs, c0), 4)}`;
      const both = st.side === 'both', xh = both && xx > st.L / 2 ? st.L - xx : xx;
      let snap = st.res.snaps[0];
      for (const sn of st.res.snaps) if (Math.abs(sn.t - t) < Math.abs(snap.t - t)) snap = sn;
      return `x = ${num(xm, 4)} mm: ${T.c_fdm} ${num(at(snap.c, st.res.dx, Math.min(xh, st.Ls)), 4)} · ${T.c_erf} ${num(pErf(xh, D * snap.t, c0, cs), 4)}`;
    });
    box.querySelector('[data-df="pstats"]').innerHTML = stats(statsItems);
    box.querySelector('[data-df="ptable"]').innerHTML = tab;
    box.querySelector('[data-df="psteps"]').innerHTML = steps(stp);
  }

  // =========== carb: 浸炭・窒化の設計 ===========
  function renderCarb() {
    const { s, d0, q, tc, h } = cur();
    const c0 = val('c0'), cs = val('cs'), cx = val('cx'), xd = val('xd', 0) / 1e3;
    const tlo = val('tlo'), thi = val('thi'), tstep = Math.max(1, val('tstep', 1));
    const frac = val('frac', 0) / 100, cs2 = val('cs2');
    const warns = [];
    const okC = cs > cx && cx > c0;
    if (!okC) warns.push({ text: T.w_cord });
    if (s && !(s.host === 'Fe' && (s.el === 'C' || s.el === 'N'))) warns.push({ soft: true, text: T.w_notfe });
    if (s?.el === 'N') warns.push({ soft: true, text: T.w_nitride });
    if (s) warns.push(...rangeMsgs(s, tc).filter(w => w.k !== 'a3')); // γ の下限は鋼の炭素量で下のとおり確かめる
    const isC = s ? s.el === 'C' && s.ph === 'gamma' : true;
    if (isC && s) {
      const tg = tGammaLo(c0), ac = acmAt(tc);
      if (tc < tg) warns.push({ text: fmt(T.w_a3c, { t: tnum(tc, 5), c: num(c0, 3), tg: tnum(tg, 4) }) });
      if (Number.isFinite(ac) && cs > ac) warns.push({ soft: true, text: fmt(T.w_acm, { cs: num(cs, 3), ac: num(ac, 3), t: tnum(tc, 5) }) });
    }
    let html = warnHTML(warns);
    if (!okC || !(xd > 0)) { box.innerHTML = html; return; }
    const ratio = (cx - c0) / (cs - c0), z = zFor(c0, cs, cx);
    const D = Dof(d0, q, tc), tNeed = tFor(xd, z, D);
    const Dreq = (xd * xd) / (4 * z * z * h * 3600), Treq = TforD(d0, q, Dreq);
    const K = 2 * z * Math.sqrt(D * 3600); // 深さ = K √t(t は h)
    html += stats([
      ['ratio', T.o_ratio_c, num(ratio, 4)],
      ['z', T.o_zc, num(z, 4)],
      ['dt', T.o_dt, `${sci((xd * xd) / (4 * z * z), 3)} m²`],
      ['d', fmt(T.o_d_at, { t: tnum(tc, 5) }), `${D3(D)} m²/s`],
      ['tneed', fmt(T.o_tneed, { t: tnum(tc, 5) }), hrs(tNeed)],
      ['k', T.o_k, `${num(K * 1e3, 4)} mm/√h`],
      ['treq', fmt(T.o_treq, { h: num(h, 4) }), Number.isFinite(Treq) ? `${tnum(Treq, 4)} °C` : '–'],
    ]);
    // 温度ごとの表
    const rows = [];
    const n = Math.min(60, Math.max(1, Math.floor((thi - tlo) / tstep + 1e-9) + 1));
    let curRow = -1;
    for (let i = 0; i < n; i++) {
      const T1 = tlo + i * tstep, D1 = Dof(d0, q, T1), t1 = tFor(xd, z, D1), w = s ? rangeCheck(s, T1) : [];
      const note = [w.some(y => y.lv === 'hard') ? T.r_out : '', isC && s && T1 < tGammaLo(c0) ? T.r_a3 : '', isC && s && cs > acmAt(T1) ? T.r_acm : ''].filter(Boolean).join(' ');
      if (Math.abs(T1 - tc) < 1e-9) curRow = i;
      rows.push([{ t: tnum(T1, 5), v: T1 }, { t: D3(D1), v: D1 }, { t: num(t1 / 3600, 4), v: t1 / 3600 }, { t: num(t1, 4), v: t1 }, { t: num(2 * z * Math.sqrt(D1 * 3600) * 1e3, 4), v: 2 * z * Math.sqrt(D1 * 3600) * 1e3 }, note || T.r_ok]);
    }
    html += `<h3>${esc(fmt(T.h_ctable, { x: mm(xd), cx: num(cx, 3) }))}</h3>`;
    html += tableHTML('carb', [T.c_t, 'D (m²/s)', T.c_th, T.c_ts, T.c_k, T.c_note], rows, { cur: curRow, left: [5] });
    // √t 則
    const tr = [1, 2, 4, 8, 16, 32].map(hh => [{ t: num(hh, 3), v: hh }, { t: num(K * Math.sqrt(hh) * 1e3, 4), v: K * Math.sqrt(hh) * 1e3 }]);
    html += `<h3>${esc(fmt(T.h_sqrt, { t: tnum(tc, 5), cx: num(cx, 3) }))}</h3>` + tableHTML('sqrt', [T.c_th, T.c_depth], tr);
    // 2段浸炭
    const two = D > 0 ? twoStage({ D, c0, cs, cs2, frac, cx, xd }) : null;
    html += `<h3>${esc(fmt(T.h_two, { t: tnum(tc, 5) }))}</h3>`;
    if (!two) html += warnHTML([{ soft: true, text: T.w_two }]);
    else {
      html += stats([
        ['ttot', T.o_ttot, hrs(two.t)], ['tb', T.o_tboost, hrs(two.t1)], ['tdf', T.o_tdiff, hrs(two.t2)],
        ['t1s', fmt(T.o_t1s, { cs: num(cs, 3) }), hrs(two.tA)], ['t2s', fmt(T.o_t2s, { cs: num(cs2, 3) }), hrs(two.tB)],
        ['cmax', T.o_cmax, `${num(two.cmax, 4)} (${mm(two.xmax)})`],
      ]);
    }
    html += `<div class="fig"><svg data-df="carb" role="img" aria-label="${esc(T.h_cprof)}"></svg><p class="df-legend" data-df="lg"></p><p class="df-read" data-df="read"></p></div>`;
    html += `<p class="muted" style="font-size:.85rem">${esc(T.carb_note)}</p>`;
    html += steps([
      [T.s_ratio, `(Cx − C0)/(Cs − C0) = (${num(cx, 4)} − ${num(c0, 4)}) / (${num(cs, 4)} − ${num(c0, 4)}) = ${num(ratio, 5)} = erfc(z)`],
      [T.s_zinv, `z = erfc⁻¹(${num(ratio, 5)}) = ${num(z, 5)}   (erf(z) = ${num(1 - ratio, 5)})`],
      [T.s_dt, `Dt = x² / (4z²) = (${num(xd * 1e3, 4)} mm)² / (4 × ${num(z, 5)}²) = ${sci((xd * xd) / (4 * z * z), 4)} m²`],
      [T.s_arr, qLine(d0, q, tc, D)],
      [T.s_tneed, `t = Dt / D = ${sci((xd * xd) / (4 * z * z), 4)} / ${D3(D)} = ${num(tNeed, 4)} s = ${num(tNeed / 3600, 4)} h`],
      [T.s_treq, `D = ${sci((xd * xd) / (4 * z * z), 4)} / (${num(h, 4)} × 3600 s) = ${D3(Dreq)} m²/s → T = Q / (R ln(D0/D)) = ${Number.isFinite(Treq) ? num(TK(Treq), 5) : '–'} K`],
      [T.s_k, `x = 2z√(D t) = ${num(K * 1e3, 4)} mm × √(t / h)`],
      two ? [T.s_two, fmt(T.s_two_f, { f: num(frac * 100, 3), cs: num(cs, 3), cs2: num(cs2, 3), n: two.res.N, r: num(two.res.r, 3) })] : null,
    ]);
    if (s) html += srcLine(s);
    html += `<div class="df-links">${link(`tools/iron-carbon-phase-diagram/?c=${encodeURIComponent(cs)}&t=${Math.round(tc)}&view=steel`, T.ln_fec_cs)}${link(`tools/iron-carbon-phase-diagram/?c=${encodeURIComponent(c0)}&t=${Math.round(tc)}&view=steel`, T.ln_fec_c0)}</div>`;
    box.innerHTML = html;
    // 図: 1段(cs)、1段(cs2)、2段
    const svg = box.querySelector('[data-df="carb"]');
    const xmax = Math.max(2.5 * xd, 1e-9), xs = Array.from({ length: 201 }, (_, i) => (xmax * i) / 200);
    const lines = [{ pts: xs.map(xx => [xx * 1e3, pErf(xx, D * tNeed, c0, cs)]), slot: 1, w: 2.6 }];
    const lg = [{ slot: 1, label: fmt(T.lg_single, { cs: num(cs, 3), t: hrs(tNeed) }) }];
    if (two) {
      const r = two.res, pts = [];
      for (let i = 0; i <= r.N; i++) { const xx = i * r.dx; if (xx > xmax) break; pts.push([xx * 1e3, r.c[i]]); }
      lines.push({ pts, slot: 2, w: 2.4, dash: '7 4' });
      lines.push({ pts: xs.map(xx => [xx * 1e3, pErf(xx, D * two.tB, c0, Math.min(cs, cs2))]), slot: 3, w: 2, dash: '2 3' });
      lg.push({ slot: 2, dash: '7 4', label: fmt(T.lg_two, { t: hrs(two.t) }) }, { slot: 3, dash: '2 3', label: fmt(T.lg_single, { cs: num(cs2, 3), t: hrs(two.tB) }) });
    }
    const geo = plot(svg, { xr: [0, xmax * 1e3], yr: [Math.min(0, c0), Math.max(cs, cs2) * 1.1], xlabel: T.ax_x, ylabel: T.ax_cwt, lines, hl: [{ y: cx, label: `Cx = ${num(cx, 3)}` }], vl: [{ x: xd * 1e3, label: mm(xd) }] });
    box.querySelector('[data-df="lg"]').innerHTML = legend(lg);
    const read = box.querySelector('[data-df="read"]');
    read.dataset.def = T.read_hint2; read.textContent = T.read_hint2;
    hover(svg, geo, read, xm => `x = ${num(xm, 4)} mm: ${num(pErf(xm / 1e3, D * tNeed, c0, cs), 4)}${two ? ` · ${num(at(two.res.c, two.res.dx, Math.min(xm / 1e3, two.Ls)), 4)}` : ''}`);
  }

  // =========== semi: 半導体の不純物拡散 ===========
  function renderSemi() {
    const p = { dop: el.dop.value, tp: val('tp'), tpm: val('tpm', 0), ns: val('ns', 0), td: val('td'), tdm: val('tdm', 0), nb: val('nb', 0), sum: el.sum.value === 'yes' };
    const r = semi(p);
    const s = sysById(r.d.sys);
    const warns = [...rangeMsgs(s, p.tp), ...rangeMsgs(s, p.td)];
    // 基板の濃度が表面の濃度以上では接合ができないので、注意だけを出す
    if (!(p.nb < p.ns)) { box.innerHTML = warnHTML([...warns, { text: T.w_nb }]); return; }
    if (r.ratio < 10) warns.push({ soft: true, text: fmt(T.w_ratio, { r: num(r.ratio, 3) }) });
    if (p.ns > 1e20) warns.push({ soft: true, text: T.w_arora });
    // 数値で拡げたドライブインの分布(初期の erfc を畳み込む)と、その接合深さ
    const Dtd0 = r.Dd * r.tds;
    const ex = x => driveExact(x, p.ns, r.Dtp, Dtd0);
    let xje = NaN;
    if (Number.isFinite(r.xjd)) {
      let lo = 0, hi = r.xjd * 2;
      if (ex(hi) < p.nb) { for (let i = 0; i < 60; i++) { const m = (lo + hi) / 2; if (ex(m) > p.nb) lo = m; else hi = m; } xje = (lo + hi) / 2; }
    }
    const um = v => `${num(v * 1e4, 4)} µm`;
    let html = warnHTML(warns);
    html += `<h3>${esc(T.h_pre)}</h3>` + stats([
      ['dp', fmt(T.o_d_at, { t: tnum(p.tp, 5) }), `${D3(r.Dp)} cm²/s`],
      ['q0', T.o_q0, `${sci(r.Q, 3)} cm⁻²`],
      ['xjp', T.o_xj, um(r.xjp)],
      ['rsp', T.o_rs, `${num(r.rsp, 3)} Ω/□`],
    ]);
    html += `<h3>${esc(T.h_drive)}</h3>` + stats([
      ['dd', fmt(T.o_d_at, { t: tnum(p.td, 5) }), `${D3(r.Dd)} cm²/s`],
      ['csd', T.o_csd, `${sci(r.csd, 3)} cm⁻³`],
      ['xjd', T.o_xj, um(r.xjd)],
      ['xje', T.o_xje, um(xje)],
      ['rsd', T.o_rs, `${num(r.rsd, 3)} Ω/□`],
      ['rho', T.o_rho, `${num(r.rsd * r.xjd, 3)} Ω·cm`],
      ['ratio', T.o_dtratio, num(r.ratio, 3)],
    ]);
    html += `<div class="fig"><svg data-df="semi" role="img" aria-label="${esc(T.h_sprof)}"></svg><p class="df-legend" data-df="lg"></p><p class="df-read" data-df="read"></p></div>`;
    html += `<p class="muted" style="font-size:.85rem">${esc(T.semi_note)}</p>`;
    // 表: 深さごとの濃度
    const xmax = Math.max(1.4 * (r.xjd || 0), 1.4 * (r.xjp || 0), 1e-7);
    const rows = [];
    for (const xu of niceTicks(0, xmax * 1e4, 10)) { const xx = xu / 1e4; rows.push([{ t: num(xx * 1e4, 4), v: xx * 1e4 }, { t: sci(r.pre(xx), 3), v: r.pre(xx) }, { t: sci(r.drv(xx), 3), v: r.drv(xx) }, { t: sci(ex(xx), 3), v: ex(xx) }]); }
    html += `<h3>${esc(T.h_stable)}</h3>` + tableHTML('semi', [T.c_xum, T.c_pre, T.c_gauss, T.c_exact], rows);
    const kT = tc => KB * TK(tc);
    html += steps([
      [T.s_dsi, `D = D0 exp(−Ea/kT) = ${num(r.d.d0, 4)} × exp(−${num(r.d.ea, 4)} / (${sci(KB, 5)} × ${num(TK(p.tp), 6)})) = ${D3(r.Dp)} cm²/s  (kT = ${num(kT(p.tp), 4)} eV)`],
      [T.s_q0, `Q = 2Cs√(Dt/π) = 2 × ${sci(p.ns, 3)} × √(${D3(r.Dp)} × ${num(r.tps, 5)} / π) = ${sci(r.Q, 4)} cm⁻²`],
      [T.s_xjp, `erfc(xj/(2√(Dt))) = Nb/Cs = ${sci(p.nb / p.ns, 3)} → xj/(2√(Dt)) = ${num(ierfc(p.nb / p.ns), 4)} → xj = ${um(r.xjp)}`],
      [T.s_dsi2, `D(${tnum(p.td, 5)} °C) = ${D3(r.Dd)} cm²/s ;  Dt = ${D3(r.Dd)} × ${num(r.tds, 5)}${p.sum ? ` + ${D3(r.Dtp)}` : ''} = ${D3(r.Dtd)} cm²`],
      [T.s_gs, `C(x) = Q/√(πDt) · exp(−x²/(4Dt)) ;  C(0) = ${sci(r.Q, 4)} / √(π × ${D3(r.Dtd)}) = ${sci(r.csd, 4)} cm⁻³`],
      [T.s_xjd, `xj = √(4Dt · ln(C(0)/Nb)) = √(4 × ${D3(r.Dtd)} × ln(${sci(r.csd, 3)} / ${sci(p.nb, 3)})) = ${um(r.xjd)}`],
      [T.s_rs, `Rs = 1 / (q ∫₀^xj μ(N + Nb)(N − Nb) dx) ;  μ = ${r.d.type === 'n' ? '88 + 1252/(1 + (N/1.26×10¹⁷)^0.88)' : '54.3 + 407/(1 + (N/2.35×10¹⁷)^0.88)'} cm²/(V·s)`],
    ]);
    html += `<p class="df-src">${esc(T.source)}: ${esc(SRC[r.d.src])}; ${esc(T.src_arora)}</p>`;
    html += `<div class="df-links">${link('tools/materials-periodic-table/?el=Si', fmt(T.ln_ptable, { el: 'Si' }))}${link('tools/crystal-structure-viewer/?type=diamond', T.ln_xtal_si)}</div>`;
    box.innerHTML = html;
    const svg = box.querySelector('[data-df="semi"]');
    const xs = Array.from({ length: 241 }, (_, i) => (xmax * i) / 240);
    const lo = Math.floor(Math.log10(Math.max(p.nb / 10, 1e10))), hi = Math.ceil(Math.log10(Math.max(p.ns, r.csd) * 2));
    const lines = [
      { pts: xs.map(x => [x * 1e4, r.pre(x)]), slot: 1, w: 2.4 },
      { pts: xs.map(x => [x * 1e4, r.drv(x)]), slot: 2, w: 2.6 },
      { pts: xs.filter((_, i) => i % 3 === 0).map(x => [x * 1e4, ex(x)]), slot: 3, w: 2, dash: '2 3' },
    ];
    const geo = plot(svg, { xr: [0, xmax * 1e4], yr: [lo, hi], ylog: true, xlabel: T.ax_xum, ylabel: T.ax_n, lines, hl: [{ y: p.nb, label: `Nb = ${sci(p.nb, 2)}` }], vl: [{ x: r.xjp * 1e4 }, { x: r.xjd * 1e4, label: `xj = ${um(r.xjd)}` }] });
    box.querySelector('[data-df="lg"]').innerHTML = legend([{ slot: 1, label: T.c_pre }, { slot: 2, label: T.c_gauss }, { slot: 3, dash: '2 3', label: T.c_exact }]);
    const read = box.querySelector('[data-df="read"]');
    read.dataset.def = T.read_hint2; read.textContent = T.read_hint2;
    hover(svg, geo, read, xu => `x = ${num(xu, 4)} µm: ${T.c_pre} ${sci(r.pre(xu / 1e4), 3)} · ${T.c_gauss} ${sci(r.drv(xu / 1e4), 3)} · ${T.c_exact} ${sci(ex(xu / 1e4), 3)} cm⁻³`);
  }

  // =========== fit: 実験データから D0 と Q ===========
  const FIT0 = '1273 9.4e-16\n1473 2.4e-14';
  let fitText = (() => { try { const m = location.hash.match(/(?:^#|&)fit=([^&]*)/); return m ? decodeURIComponent(m[1]) : FIT0; } catch { return FIT0; } })();
  const saveHash = () => {
    const h = fitText.trim() === FIT0 ? '' : `#fit=${encodeURIComponent(fitText.trim())}`;
    history.replaceState(history.state, '', location.pathname + location.search + h);
  };
  function renderFit(rebuild = true) {
    if (rebuild || !box.querySelector('[data-df="fitdata"]')) {
      box.innerHTML = `<h3>${esc(T.h_fitdata)}</h3><p class="muted" style="font-size:.85rem">${esc(T.fit_help)}</p>
<textarea data-df="fitdata" spellcheck="false" aria-label="${esc(T.h_fitdata)}"></textarea>
<div class="df-btns"><button type="button" class="btn btn-ghost btn-small" data-df="ex1">${esc(T.fit_ex1)}</button><button type="button" class="btn btn-ghost btn-small" data-df="ex2">${esc(T.fit_ex2)}</button></div>
<div data-df="fitout"></div>`;
      const ta = box.querySelector('[data-df="fitdata"]');
      ta.value = fitText;
      ta.addEventListener('input', () => { fitText = ta.value; saveHash(); fitOut(); });
      box.querySelector('[data-df="ex1"]').addEventListener('click', () => { el.tu.value = 'K'; el.du.value = 'm2'; fitText = FIT0; ta.value = fitText; saveHash(); form.dispatchEvent(new Event('input', { bubbles: true })); });
      box.querySelector('[data-df="ex2"]').addEventListener('click', () => {
        // データ集の系(γ鉄中の C)から 6 点を作り、±10 % のばらつき(決まった値)を乗せる
        const x = sysById('c_g'), wob = [1.08, 0.93, 1.05, 0.9, 1.1, 0.97];
        fitText = [850, 900, 950, 1000, 1050, 1100].map((tt, i) => `${tt} ${(Dof(x.d0, x.q, tt) * wob[i] * 1e4).toExponential(3)}`).join('\n');
        el.tu.value = 'C'; el.du.value = 'cm2';
        ta.value = fitText; saveHash(); form.dispatchEvent(new Event('input', { bubbles: true }));
      });
    }
    fitOut();
  }
  function fitOut() {
    const outEl = box.querySelector('[data-df="fitout"]');
    const { ok, bad } = parsePairs(fitText);
    const tu = el.tu.value, du = el.du.value;
    const pts = ok.map(([a, b]) => [tu === 'C' ? TK(a) : a, du === 'cm2' ? b * 1e-4 : b]).filter(([a, b]) => a > 0 && b > 0);
    const warns = [];
    if (bad.length) warns.push({ soft: true, text: fmt(T.w_badline, { n: bad.join(', ') }) });
    if (pts.length < ok.length) warns.push({ soft: true, text: T.w_neg });
    const f = fitArr(pts);
    let html = warnHTML(warns);
    if (!f) { outEl.innerHTML = html + warnHTML([{ text: T.w_fit2 }]); return; }
    if (f.n === 2) html += warnHTML([{ soft: true, text: T.w_fit_n2 }]);
    const te = val('t', -273.15 + 1e-9), De = Dof(f.D0, f.Q, te);
    html += stats([
      ['n', T.o_n, String(f.n)],
      ['fq', T.o_q, f.Qci != null ? `${num(f.Q, 4)} ± ${num(f.Qci, 2)} kJ/mol` : `${num(f.Q, 4)} kJ/mol`],
      ['fqev', T.o_qev, `${num(f.Q / EV, 4)} eV`],
      ['fd0', 'D0', f.lnD0ci != null ? `${sci(f.D0, 3)} m²/s (${sci(Math.exp(f.a - f.lnD0ci), 2)}–${sci(Math.exp(f.a + f.lnD0ci), 2)})` : `${sci(f.D0, 3)} m²/s`],
      ['r2', 'R²', num(f.r2, 5)],
      ['fde', fmt(T.o_d_at, { t: tnum(te, 5) }), `${D3(De)} m²/s`],
    ]);
    html += `<div class="fig"><svg data-df="fit" role="img" aria-label="${esc(T.h_arr)}"></svg><p class="df-legend" data-df="lg"></p><p class="df-read" data-df="read"></p></div>`;
    const rows = pts.map(([tk, d]) => { const df = Math.exp(f.a + f.b / tk); return [{ t: num(tk, 6), v: tk }, { t: num(tk - 273.15, 5), v: tk - 273.15 }, { t: D3(d), v: d }, { t: D3(df), v: df }, { t: num(d / df, 4), v: d / df }]; });
    html += `<h3>${esc(T.h_resid)}</h3>` + tableHTML('fit', ['T (K)', 'T (°C)', T.c_dmeas, T.c_dfit, T.c_ratio], rows);
    html += steps([
      [T.s_lin, 'y = ln D,  x = 1/T  →  y = a + b x,  b = −Q/R,  a = ln D0'],
      [T.s_ls, `x̄ = ${sci(f.mx, 5)} K⁻¹ ;  Sxx = Σ(x − x̄)² = ${sci(f.sxx, 4)} ;  b = Sxy/Sxx = ${num(f.b, 6)} K ;  a = ȳ − b x̄ = ${num(f.a, 5)}`],
      [T.s_qd0, `Q = −b R = ${num(-f.b, 6)} × ${num(R, 6)} = ${num(f.Q * 1000, 6)} J/mol ;  D0 = e^a = ${sci(f.D0, 4)} m²/s`],
      f.seB != null ? [T.s_ci, `s = √(SSE/(n − 2)) = ${num(f.s, 4)} ;  SE(b) = s/√Sxx = ${num(f.seB, 4)} K ;  t(${num(0.975, 3)}, ${f.n - 2}) = ${num(f.tq, 4)} ;  Q ± ${num(f.Qci, 3)} kJ/mol`] : null,
      [T.s_two_pt, 'Q = R ln(D₂/D₁) / (1/T₁ − 1/T₂)'],
    ]);
    outEl.innerHTML = html;
    const svg = outEl.querySelector('[data-df="fit"]');
    const ixs = pts.map(p => 1000 / p[0]);
    let a0 = Math.min(...ixs), b0 = Math.max(...ixs);
    const pad = (b0 - a0) * 0.15 || 0.05;
    a0 -= pad; b0 += pad;
    const ds = pts.map(p => Math.log10(p[1]));
    const fl = [a0, b0].map(ix => Math.log10(Math.exp(f.a + f.b * (ix / 1000))));
    const y0 = Math.floor(Math.min(...ds, ...fl) - 0.3), y1 = Math.ceil(Math.max(...ds, ...fl) + 0.3);
    const fitLine = Array.from({ length: 41 }, (_, k) => { const ix = a0 + ((b0 - a0) * k) / 40; return [ix, Math.exp(f.a + f.b * (ix / 1000))]; });
    const topT = TOPC.filter(v => v >= 1000 / b0 - 273.15 && v <= 1000 / a0 - 273.15).map(v => [1000 / TK(v), `${num(v, 4)} °C`]);
    const geo = plot(svg, { xr: [a0, b0], yr: [y0, y1], ylog: true, xlabel: T.ax_invT, ylabel: T.ax_logD, top: topT, lines: [{ pts: fitLine, slot: 'ac', w: 2 }], dots: pts.map(p => ({ x: 1000 / p[0], y: p[1], slot: 1 })) });
    outEl.querySelector('[data-df="lg"]').innerHTML = legend([{ slot: 1, dot: true, label: T.lg_data }, { slot: 'ac', label: T.lg_fit }]);
    const read = outEl.querySelector('[data-df="read"]');
    read.dataset.def = T.read_hint; read.textContent = T.read_hint;
    hover(svg, geo, read, ix => `${num(1000 / ix - 273.15, 4)} °C: D = ${D3(Math.exp(f.a + f.b * (ix / 1000)))} m²/s`);
  }

  // ---- 結果のコピー(今のモードで見えている入力と結果だけ。共通の部品より先に受ける) ----
  const clean = n => n?.textContent.trim().replace(/\s+/g, ' ') ?? '';
  function resultText() {
    const lines = [clean(document.querySelector('h1')), `[${optText('mode', modeSel.value)}]`, ''];
    for (const f of el) if (f.name && f.name !== 'mode' && !lab(f.name).hidden) lines.push(`${clean(lab(f.name).querySelector('span'))}: ${f.tagName === 'SELECT' ? clean(f.selectedOptions[0]) : f.value}`);
    if (modeSel.value === 'fit') lines.push('', fitText.trim());
    for (const n of box.querySelectorAll('[data-df-warn]')) lines.push('', `! ${clean(n)}`);
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
  let lastMode = null, raf = 0;
  const render = e => {
    const mode = modeSel.value;
    if (mode === 'prof' && (e?.target === el.hours || lastMode !== 'prof')) sliderPos = 1000;
    visible();
    if (mode === 'arr') renderArr();
    else if (mode === 'prof') renderProf(true);
    else if (mode === 'carb') renderCarb();
    else if (mode === 'semi') renderSemi();
    else renderFit(lastMode !== 'fit');
    lastMode = mode;
  };
  const schedule = e => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => render(e)); };
  form.addEventListener('input', schedule);
  form.addEventListener('change', schedule);
  form.addEventListener('submit', e => e.preventDefault());
  let lastW = box.clientWidth < 520;
  if (window.ResizeObserver) new ResizeObserver(() => { const w = box.clientWidth < 520; if (w !== lastW) { lastW = w; render(); } }).observe(box);
  render();
}
