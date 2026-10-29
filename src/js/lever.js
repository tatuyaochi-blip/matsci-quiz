// 2元系状態図ラボ(id は lever のまま)。代表的な2元系の状態図を、主要な点(融点・共晶/包晶の温度と組成・最大固溶度)を文献値で持って描き、
// 図の点の相・タイライン・てこの規則の割合、冷却の経路(平衡と Scheil)、組織の模式図、ギブスの相律、練習問題を出す。
// 組成はすべて内部では B 成分の wt%(質量%)、温度は ℃。原子%(at%)は原子量で換算して表示する。
// 線の形: 主要点(SYS の pts)を通る区分的な単調3次補間(PCHIP。scipy の PchipInterpolator と同じ式)で、主要点以外は模式。
// Cu–Ni だけは、液相と固相の正則溶液モデル(両端の融点と融解熱、Callister の 1250 ℃のタイラインに合わせた相互作用係数)から計算する。
// 値と出典は review の sources.md、python3 での検算は scripts/check_lever.py。
import { num } from './eng.js';
import { EL } from './ptable.js';
import { TE as FE_TE, TS as FE_TS, TP as FE_TP, C as FE_C, S as FE_S, B as FE_B, H as FE_H, J as FE_J, E as FE_E, P as FE_P, CM as FE_CM } from './fe-c.js';

// ---- 元素の値 ----
// 原子量: IUPAC 2021 の標準原子量(簡略値)。融点・密度: 周期表ツール(ptable.js、CRC Handbook)の値
export const MW = { Cu: 63.546, Ni: 58.693, Pb: 207.2, Sn: 118.71, Al: 26.982, Si: 28.085, Ag: 107.87, Pt: 195.08 };
const elem = s => EL.find(e => e.s === s);
export const MP = Object.fromEntries(Object.keys(MW).map(s => [s, elem(s).mp]));
export const RHO = Object.fromEntries(Object.keys(MW).map(s => [s, elem(s).d]));
// 融解熱 J/mol(Lange's Handbook。CRC は Cu 12.93、Ni 17.04 kJ/mol)
export const HF = { Cu: 13260, Ni: 17480 };
export const RG = 8.314462618;

// ---- 単調3次補間(PCHIP) ----
export function pchip(knots) {
  const k = [...knots].sort((a, b) => a[0] - b[0]);
  const xs = k.map(p => p[0]), ys = k.map(p => p[1]), n = xs.length;
  const h = [], m = [];
  for (let i = 0; i < n - 1; i++) { h[i] = xs[i + 1] - xs[i]; m[i] = (ys[i + 1] - ys[i]) / h[i]; }
  const d = new Array(n).fill(0);
  if (n === 2) d[0] = d[1] = m[0];
  else {
    for (let i = 1; i < n - 1; i++) {
      if (m[i - 1] * m[i] <= 0) d[i] = 0;
      else { const w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1]; d[i] = (w1 + w2) / (w1 / m[i - 1] + w2 / m[i]); }
    }
    const edge = (h0, h1, m0, m1) => {
      let e = ((2 * h0 + h1) * m0 - h0 * m1) / (h0 + h1);
      if (Math.sign(e) !== Math.sign(m0)) e = 0;
      else if (Math.sign(m0) !== Math.sign(m1) && Math.abs(e) > 3 * Math.abs(m0)) e = 3 * m0;
      return e;
    };
    d[0] = edge(h[0], h[1], m[0], m[1]);
    d[n - 1] = edge(h[n - 2], h[n - 3], m[n - 2], m[n - 3]);
  }
  const f = x => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (i < n - 2 && x > xs[i + 1]) i++;
    const t = (x - xs[i]) / h[i], t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h[i] * d[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h[i] * d[i + 1];
  };
  f.knots = k;
  return f;
}
const konst = v => { const f = () => v; f.knots = null; return f; };

// ---- Cu–Ni: 正則溶液モデル ----
// 液相を基準に、純物質の固相のギブスエネルギーは −ΔHf(1 − T/Tm)。各成分の化学ポテンシャルが固相と液相で等しい条件
//   −ΔH_A(1 − T/T_A) + RT ln(1 − x_s) + Ω_s x_s² = RT ln(1 − x_l) + Ω_l x_l²
//   −ΔH_B(1 − T/T_B) + RT ln x_s + Ω_s (1 − x_s)² = RT ln x_l + Ω_l (1 − x_l)²
// を Newton 法で解く(x は B のモル分率)。Ω = 0 が理想溶液
export function solveReg(T, p, OS = 0, OL = 0) {
  const kA = Math.exp(-p.HA / RG * (1 / T - 1 / p.TA)), kB = Math.exp(-p.HB / RG * (1 / T - 1 / p.TB));
  let s = (1 - kA) / (kB - kA), l = kB * s; // 理想溶液の解(Ω = 0 ならこれが答え)
  if (!(s > 0 && s < 1)) return null;
  if (OS === 0 && OL === 0) return [s, l];
  const RT = RG * T;
  for (let it = 0; it < 80; it++) {
    const f1 = -p.HA * (1 - T / p.TA) + RT * Math.log(1 - s) + OS * s * s - RT * Math.log(1 - l) - OL * l * l;
    const f2 = -p.HB * (1 - T / p.TB) + RT * Math.log(s) + OS * (1 - s) ** 2 - RT * Math.log(l) - OL * (1 - l) ** 2;
    const a = -RT / (1 - s) + 2 * OS * s, b = RT / (1 - l) - 2 * OL * l, c = RT / s - 2 * OS * (1 - s), dd = -RT / l + 2 * OL * (1 - l);
    const det = a * dd - b * c;
    const ds = (f1 * dd - f2 * b) / det, dl = (a * f2 - c * f1) / det;
    s = Math.min(Math.max(s - ds, 1e-12), 1 - 1e-12); l = Math.min(Math.max(l - dl, 1e-12), 1 - 1e-12);
    if (Math.abs(ds) + Math.abs(dl) < 1e-13) break;
  }
  return [s, l];
}
// 1点のタイライン(T、x_s、x_l)から Ω_s と Ω_l を決める(上の2式は Ω について1次)
export function fitOmega(T, xs, xl, p) {
  const RT = RG * T;
  const a11 = xs * xs, a12 = -xl * xl, a21 = (1 - xs) ** 2, a22 = -((1 - xl) ** 2);
  const b1 = RT * Math.log((1 - xl) / (1 - xs)) + p.HA * (1 - T / p.TA), b2 = RT * Math.log(xl / xs) + p.HB * (1 - T / p.TB);
  const det = a11 * a22 - a12 * a21;
  return [(b1 * a22 - a12 * b2) / det, (a11 * b2 - a21 * b1) / det];
}

// ---- 換算 ----
export const toAt = (S, w) => { if (w <= 0) return 0; if (w >= 100) return 100; const b = w / MW[S.B], a = (100 - w) / MW[S.A]; return 100 * b / (a + b); };
export const toWt = (S, x) => { if (x <= 0) return 0; if (x >= 100) return 100; const b = x * MW[S.B], a = (100 - x) * MW[S.A]; return 100 * b / (a + b); };
// 相の密度(純物質の比体積が足し合わさるとみなす: 1/ρ = w_A/ρ_A + w_B/ρ_B)
export const rhoOf = (S, w) => 100 / ((100 - w) / RHO[S.A] + w / RHO[S.B]);
// 相の平均のモル質量(g/mol)
export const molarOf = (S, w) => 100 / ((100 - w) / MW[S.A] + w / MW[S.B]);

// ---- 状態図の蔵書 ----
// type: iso(全率固溶)、eut(共晶)、per(包晶)。x: 横軸の範囲(B の wt%)、t: 温度の範囲。ph: 相の記号(a は A 側、b は B 側の固相)
// pts: 図に描く点 [組成 wt%, 温度 ℃, 種類, 出典の鍵]。種類 key は文献の主要点、read は文献の図・例題から読んだ点、fit は Cu–Ni のモデルを合わせた点
// 線の knots は [温度, 組成] の組。主要点と read の点だけを通し、それ以外の形は模式
const SRC = { crc: 'CRC', call: 'Callister', uw: 'UW MSE 170', mc: 'AFS', alt: 'Aluminium-Taschenbuch', prin: 'Princeton MAE 324', zob: 'Zobač 2019', smith: 'Smith (Oviedo)' };
export const SYS = {
  cuni: {
    A: 'Cu', B: 'Ni', type: 'iso', x: [0, 100], t: [1000, 1500], ph: { L: 'L', a: 'α' },
    tie: [1250, 31.5, 42.5], // Callister 例題 9.2: 1250 ℃、35 wt% Ni で C_L = 31.5、Cα = 42.5 wt% Ni
    ex: [[35, 1250], [35, 1320], [35, 1190], [50, 1300]],
  },
  pbsn: {
    A: 'Pb', B: 'Sn', type: 'eut', x: [0, 100], t: [0, 350], ph: { L: 'L', a: 'α', b: 'β' },
    TE: 183, ca: 18.3, ce: 61.9, cb: 97.8,
    liqA: [[220, 46]], solA: [[220, 17]], liqB: [], solB: [],
    solvA: [[150, 11], [20, 2]], solvB: [[150, 99], [20, 99.8]],
    reads: [[46, 220, 'uw'], [17, 220, 'uw'], [11, 150, 'uw'], [99, 150, 'uw'], [2, 20, 'uw']],
    ex: [[40, 150], [40, 220], [40, 183], [30, 183], [61.9, 200], [10, 100]],
  },
  alsi: {
    A: 'Al', B: 'Si', type: 'eut', x: [0, 100], t: [400, 1500], zoom: { x: [0, 25], t: [450, 700] }, ph: { L: 'L', a: 'α', b: 'Si' },
    TE: 577, ca: 1.65, ce: 12.6, cb: 100,
    liqA: [[615, 7]], solA: [], liqB: [[800, 27], [1000, 45], [1200, 68]], solB: null,
    solvA: [[500, 0.8], [400, 0.3]], solvB: null,
    reads: [[7, 615, 'mc'], [0.8, 500, 'alt'], [0.3, 400, 'alt']], // α の固溶限 500 ℃ 0.8・400 ℃ 0.3 wt% Si(Aluminium-Taschenbuch、Wikipedia「Aluminium–silicon alloys」の引用)
    ex: [[7, 600], [7, 577], [12.6, 577], [18, 577], [18, 700], [1, 450]],
  },
  agcu: {
    A: 'Cu', B: 'Ag', type: 'eut', x: [0, 100], t: [400, 1200], ph: { L: 'L', a: 'α', b: 'β' },
    TE: 779, ca: 8.0, ce: 71.9, cb: 91.2,
    liqA: [], solA: [], liqB: [], solB: [],
    solvA: [[600, 3.0], [400, 1.0]], solvB: [[600, 96.5], [400, 98.8]],
    reads: [],
    ex: [[30, 900], [30, 779], [71.9, 779], [92.5, 700], [50, 600]],
  },
  alcu: {
    A: 'Al', B: 'Cu', type: 'eut', x: [0, 52.5], t: [100, 700], zoom: { x: [0, 8], t: [200, 700] }, ph: { L: 'L', a: 'α', b: 'θ' },
    TE: 548.2, ca: 5.65, ce: 33.2, cb: 52.5, TBset: 589,
    liqA: [], solA: [], liqB: [], solB: null, solvB: null,
    solvQ: 4546, // α の固溶限の模式: C = 5.65·exp(−(Q/R)(1/T − 1/T_E))、Q/R = 4546 K(500 ℃で約 4.0 wt%)
    reads: [],
    ex: [[4, 520], [4, 300], [4, 600], [33.2, 548.2], [20, 560]],
  },
  ptag: {
    A: 'Pt', B: 'Ag', type: 'per', x: [0, 100], t: [600, 1800], ph: { L: 'L', a: 'α', b: 'β' },
    TP: 1186, ca: 10.5, cp: 42.4, cl: 66.3,
    liqA: [[1580, 30], [1300, 60]], solA: [], liqB: [[1100, 80]], solB: [[1060, 60], [980, 80]],
    solvA: [[940, 4], [600, 1.5]], solvB: [[710, 80], [600, 84]],
    reads: [[30, 1580, 'smith'], [60, 1300, 'smith'], [80, 1100, 'smith'], [60, 1060, 'smith'], [80, 980, 'smith'], [4, 940, 'smith'], [80, 710, 'smith']],
    ex: [[30, 1300], [30, 1186], [60, 1186], [42.4, 1186], [80, 1050], [20, 800]],
  },
};
export const SYS_IDS = Object.keys(SYS);

// 蔵書の値から線の関数と領域を作る
function setup(id) {
  const S = SYS[id];
  S.id = id;
  S.TA = MP[S.A];
  const X = S.x[1];
  if (S.type === 'iso') {
    S.TB = MP[S.B];
    const p = { TA: S.TA + 273.15, TB: S.TB + 273.15, HA: HF[S.A], HB: HF[S.B] };
    S.p = p;
    const [T0, cl, cs] = S.tie;
    [S.OS, S.OL] = fitOmega(T0 + 273.15, toAt(S, cs) / 100, toAt(S, cl) / 100, p);
    // 0.25 ℃ ごとの表を作り、線形補間で引く
    const table = (OS, OL) => {
      const T = [], L = [], Sx = [];
      const n = Math.round((S.TB - S.TA) * 4);
      for (let i = 0; i <= n; i++) {
        const t = S.TA + (S.TB - S.TA) * i / n;
        let r;
        if (i === 0) r = [0, 0]; else if (i === n) r = [1, 1]; else r = solveReg(t + 273.15, p, OS, OL);
        T.push(t); Sx.push(toWt(S, 100 * r[0])); L.push(toWt(S, 100 * r[1]));
      }
      const look = arr => t => { if (t <= S.TA) return 0; if (t >= S.TB) return X; const u = (t - S.TA) / (S.TB - S.TA) * n, i = Math.min(n - 1, Math.floor(u)); return arr[i] + (arr[i + 1] - arr[i]) * (u - i); };
      return { liq: look(L), sol: look(Sx) };
    };
    S.models = { fit: table(S.OS, S.OL), ideal: table(0, 0) };
    S.useModel = m => { S.f = S.models[m] ?? S.models.fit; S.model = m; };
    S.useModel('fit');
    S.pts = [[0, S.TA, 'mp_a', 'crc'], [100, S.TB, 'mp_b', 'crc'], [S.tie[1], S.tie[0], 'tie_l', 'call'], [S.tie[2], S.tie[0], 'tie_s', 'call']];
    return;
  }
  if (S.type === 'eut') {
    S.TB = S.TBset ?? MP[S.B];
    const { TA, TB, TE, ca, ce, cb } = S;
    const pure = cb >= X; // B 側の固相がほぼ純物質(Si)か化合物(θ)で、幅のない縦の線
    S.f = {
      liqA: pchip([[TA, 0], ...S.liqA.map(([t, c]) => [t, c]), [TE, ce]]),
      solA: pchip([[TA, 0], ...S.solA, [TE, ca]]),
      liqB: pchip([[TB, X], ...S.liqB, [TE, ce]]),
      solB: pure ? konst(X) : pchip([[TB, X], ...S.solB, [TE, cb]]),
      solvA: S.solvQ ? Object.assign(t => ca * Math.exp(-S.solvQ * (1 / (t + 273.15) - 1 / (TE + 273.15))), { knots: null }) : pchip([[TE, ca], ...S.solvA]),
      solvB: pure ? konst(X) : pchip([[TE, cb], ...S.solvB]),
    };
    S.pure = pure;
    S.pts = [[0, TA, 'mp_a', 'crc'], [ce, TE, 'eut', 'lit'], [ca, TE, 'max_a', 'lit'], ...(pure ? [] : [[cb, TE, 'max_b', 'lit']]),
      ...(id === 'alcu' ? [[X, TB, 'theta_m', 'zob']] : [[100, TB, 'mp_b', 'crc']]), ...S.reads.map(([c, t, s]) => [c, t, 'read', s])];
    return;
  }
  // per
  S.TB = MP[S.B];
  const { TA, TB, TP, ca, cp, cl } = S;
  S.f = {
    liqA: pchip([[TA, 0], ...S.liqA, [TP, cl]]),
    solA: pchip([[TA, 0], ...S.solA, [TP, ca]]),
    liqB: pchip([[TP, cl], ...S.liqB, [TB, X]]),
    solB: pchip([[TP, cp], ...S.solB, [TB, X]]),
    solvA: pchip([[TP, ca], ...S.solvA]),
    solvB: pchip([[TP, cp], ...S.solvB]),
  };
  S.pts = [[0, TA, 'mp_a', 'crc'], [100, TB, 'mp_b', 'crc'], [cp, TP, 'per', 'smith'], [ca, TP, 'max_a', 'smith'], [cl, TP, 'per_l', 'smith'],
    ...S.reads.map(([c, t, s]) => [c, t, 'read', s])];
}
SYS_IDS.forEach(setup);

// 領域: lo〜hi の温度で、左の境界 l(T) と右の境界 r(T) のあいだ。ph は左から順の相
export function regions(S) {
  const X = S.x[1], f = S.f;
  if (S.type === 'iso') return {
    L: { lo: S.TA, hi: Infinity, l: () => 0, r: t => (t >= S.TB ? X : f.liq(t)), ph: ['L'] },
    La: { lo: S.TA, hi: S.TB, l: f.liq, r: f.sol, ph: ['L', 'a'] },
    a: { lo: -Infinity, hi: S.TB, l: t => (t <= S.TA ? 0 : f.sol(t)), r: () => X, ph: ['a'] },
  };
  if (S.type === 'eut') return {
    L: { lo: S.TE, hi: Infinity, l: t => (t >= S.TA ? 0 : f.liqA(t)), r: t => (t >= S.TB ? X : f.liqB(t)), ph: ['L'] },
    La: { lo: S.TE, hi: S.TA, l: f.solA, r: f.liqA, ph: ['a', 'L'] },
    Lb: { lo: S.TE, hi: S.TB, l: f.liqB, r: f.solB, ph: ['L', 'b'] },
    ab: { lo: -Infinity, hi: S.TE, l: f.solvA, r: f.solvB, ph: ['a', 'b'] },
    a: { lo: -Infinity, hi: S.TA, l: () => 0, r: t => (t >= S.TE ? f.solA(t) : f.solvA(t)), ph: ['a'] },
    b: { lo: -Infinity, hi: S.TB, l: t => (t >= S.TE ? f.solB(t) : f.solvB(t)), r: () => X, ph: ['b'] },
  };
  return {
    L: { lo: S.TB, hi: Infinity, l: t => (t >= S.TA ? 0 : t >= S.TP ? f.liqA(t) : f.liqB(t)), r: () => X, ph: ['L'] },
    La: { lo: S.TP, hi: S.TA, l: f.solA, r: f.liqA, ph: ['a', 'L'] },
    Lb: { lo: S.TB, hi: S.TP, l: f.solB, r: f.liqB, ph: ['b', 'L'] },
    ab: { lo: -Infinity, hi: S.TP, l: f.solvA, r: f.solvB, ph: ['a', 'b'] },
    a: { lo: -Infinity, hi: S.TA, l: () => 0, r: t => (t >= S.TP ? f.solA(t) : f.solvA(t)), ph: ['a'] },
    b: { lo: -Infinity, hi: S.TP, l: f.solvB, r: t => (t >= S.TB ? f.solB(t) : X), ph: ['b'] },
  };
}
// 3相が共存する水平線
export function invariant(S) {
  if (S.type === 'eut') return { key: 'eut', t: S.TE, lo: S.ca, hi: S.cb, phases: [['a', S.ca], ['L', S.ce], ['b', S.cb]] };
  if (S.type === 'per') return { key: 'per', t: S.TP, lo: S.ca, hi: S.cl, phases: [['a', S.ca], ['b', S.cp], ['L', S.cl]] };
  return null;
}
export const lever = (c0, c1, c2) => (c2 - c0) / (c2 - c1);

// 点 (c wt%, t ℃) の相。{ key, phases: [[相, 組成 wt%, 質量分率]…] }、3相の線の上なら { inv }、範囲外なら null
export function locate(id, c, t) {
  const S = SYS[id], X = S.x[1];
  if (!(c >= 0 && c <= X && t >= S.t[0] - 1e-9 && t <= S.t[1] + 1e-9)) return null;
  const inv = invariant(S);
  if (inv && t === inv.t && c >= inv.lo && c <= inv.hi) return { inv };
  const R = regions(S);
  const order = ['La', 'Lb', 'ab', 'L', 'a', 'b'];
  for (const key of order) {
    const r = R[key];
    if (!r || t < r.lo || t > r.hi) continue;
    const l = r.l(t), rr = r.r(t);
    if (c < l - 1e-9 || c > rr + 1e-9) continue;
    if (r.ph.length === 1) return { key, phases: [[r.ph[0], c, 1]] };
    if (rr - l < 1e-9) continue;
    const w = lever(c, l, rr);
    return { key, phases: [[r.ph[0], l, w], [r.ph[1], rr, 1 - w]] };
  }
  return null;
}

// 合金 c0 を冷やすとき、相の領域が変わる温度(上から順)。{ t, from, to }
export function events(id, c0) {
  const S = SYS[id], [t0, t1] = S.t;
  const key = t => { const l = locate(id, c0, t); return l ? (l.inv ? 'inv' : l.key) : null; };
  const out = [];
  const n = 2400, dt = (t1 - t0) / n;
  let prev = key(t1), tp = t1;
  for (let i = 1; i <= n; i++) {
    const t = t1 - dt * i, k = key(t);
    if (k !== prev && k !== 'inv' && prev !== 'inv') {
      let hi = tp, lo = t;
      for (let j = 0; j < 60; j++) { const mid = (hi + lo) / 2; if (key(mid) === prev) hi = mid; else lo = mid; }
      let te = (hi + lo) / 2;
      const inv = invariant(S);
      if (inv && Math.abs(te - inv.t) < 1e-3) te = inv.t;
      out.push({ t: te, from: prev, to: k, inv: !!inv && te === inv.t });
    }
    if (k !== 'inv') { prev = k; tp = t; }
  }
  return out;
}

// 3相の線の上で、すぐ上とすぐ下の2相の分率(てこの規則の極限)
export function invLevers(id, c0) {
  const S = SYS[id], inv = invariant(S);
  if (!inv || !(c0 >= inv.lo && c0 <= inv.hi)) return null;
  if (S.type === 'eut') {
    const { ca, ce, cb } = S;
    const above = c0 < ce ? [['a', ca, lever(c0, ca, ce)], ['L', ce, 1 - lever(c0, ca, ce)]]
      : c0 > ce ? [['L', ce, lever(c0, ce, cb)], ['b', cb, 1 - lever(c0, ce, cb)]] : [['L', ce, 1]];
    const below = [['a', ca, lever(c0, ca, cb)], ['b', cb, 1 - lever(c0, ca, cb)]];
    return { above, below };
  }
  const { ca, cp, cl } = S;
  const above = [['a', ca, lever(c0, ca, cl)], ['L', cl, 1 - lever(c0, ca, cl)]];
  const below = c0 < cp ? [['a', ca, lever(c0, ca, cp)], ['b', cp, 1 - lever(c0, ca, cp)]]
    : c0 > cp ? [['b', cp, lever(c0, cp, cl)], ['L', cl, 1 - lever(c0, cp, cl)]] : [['b', cp, 1]];
  return { above, below };
}

// 組織(平衡): 初晶・共晶・析出物などの構成と質量分率。parts: [{ k: L|a|b|pa|pb|eut|sec, w }]
export function constituents(id, c0, t) {
  const S = SYS[id], loc = locate(id, c0, t);
  if (!loc) return null;
  if (loc.inv) {
    const iv = invLevers(id, c0);
    return { inv: true, parts: iv.above.map(([p, , w]) => ({ k: p, w })) };
  }
  if (S.type === 'eut' && t < S.TE && c0 > S.ca && c0 < S.cb) {
    const { ca, ce, cb } = S;
    const ea = (cb - ce) / (cb - ca); // 共晶組織の中の α の割合(共晶温度で)
    const sA = S.f.solvA(t), sB = S.f.solvB(t);
    if (c0 < ce) {
      const wp = lever(c0, ca, ce);
      const sec = Math.max(0, (ca - sA) / (sB - sA)); // 初晶α の中から出る β の割合
      return { parts: [{ k: 'pa', w: wp }, { k: 'eut', w: 1 - wp }], ea, sec, prim: 'a' };
    }
    if (c0 > ce) {
      const wp = 1 - lever(c0, ce, cb);
      const sec = S.pure ? 0 : Math.max(0, (sB - cb) / (sB - sA));
      return { parts: [{ k: 'pb', w: wp }, { k: 'eut', w: 1 - wp }], ea, sec, prim: 'b' };
    }
    return { parts: [{ k: 'eut', w: 1 }], ea, sec: 0 };
  }
  return { parts: loc.phases.map(([p, , w]) => ({ k: p, w })) };
}

// Scheil の式(固相の中で拡散が起こらず、液相は均一、界面では平衡)での凝固。
// d(ln f_L) = −dC_L/(C_L − C_s) を液相線に沿って積分する。path: [{ t, cl, cs, fl, cbar }]
export function scheil(id, c0) {
  const S = SYS[id], f = S.f, X = S.x[1];
  if (!(c0 > 0 && c0 < X)) return null;
  let br;
  if (S.type === 'iso') br = [{ hi: S.TB, lo: S.TA, L: f.liq, C: f.sol, ph: 'a' }];
  else if (S.type === 'eut') br = c0 <= S.ce ? [{ hi: S.TA, lo: S.TE, L: f.liqA, C: f.solA, ph: 'a' }] : [{ hi: S.TB, lo: S.TE, L: f.liqB, C: f.solB, ph: 'b' }];
  else br = c0 <= S.cl ? [{ hi: S.TA, lo: S.TP, L: f.liqA, C: f.solA, ph: 'a' }, { hi: S.TP, lo: S.TB, L: f.liqB, C: f.solB, ph: 'b' }]
    : [{ hi: S.TP, lo: S.TB, L: f.liqB, C: f.solB, ph: 'b' }];
  // 液相線の温度(液相線の組成が c0 になる温度)を二分法で
  const b0 = br[0];
  const dir = Math.sign(b0.L(b0.lo) - b0.L(b0.hi));
  let hi = b0.hi, lo = b0.lo;
  if ((b0.L(lo) - c0) * dir < 0) return null; // c0 がこの枝の範囲外(共晶組成ちょうど など)
  for (let j = 0; j < 80; j++) { const mid = (hi + lo) / 2; if ((b0.L(mid) - c0) * dir < 0) hi = mid; else lo = mid; }
  const tl = (hi + lo) / 2;
  const path = [{ t: tl, cl: c0, cs: b0.C(tl), fl: 1, cbar: b0.C(tl), ph: b0.ph }];
  let lnf = 0, cl = c0, t = tl, done = false, tend = null;
  for (let bi = 0; bi < br.length && !done; bi++) {
    const b = br[bi], start = bi === 0 ? tl : b.hi, n = 6000, dt = (start - b.lo) / n;
    let csum = path[path.length - 1].cbar * (1 - Math.exp(lnf)); // 固相に入った溶質の量(全体を1として)
    for (let i = 1; i <= n; i++) {
      const t2 = start - dt * i, tm = t2 + dt / 2;
      const cl2 = b.L(t2), clm = b.L(tm), csm = b.C(tm);
      const dln = -(cl2 - cl) / (clm - csm);
      const fl0 = Math.exp(lnf);
      lnf += dln;
      const fl = Math.exp(lnf);
      csum += (fl0 - fl) * csm;
      cl = cl2; t = t2;
      const cbar = csum / (1 - fl);
      if (i % 30 === 0 || i === n) path.push({ t, cl, cs: b.C(t), fl, cbar, ph: b.ph });
      if (fl < 1e-4) { done = true; tend = t; path.push({ t, cl, cs: b.C(t), fl, cbar, ph: b.ph }); break; }
    }
  }
  const last = path[path.length - 1];
  const fe = S.type === 'eut' && !done ? last.fl : 0; // 共晶温度で残った液相(Scheil の共晶の量)
  return { tl, path, fe, tend: done ? tend : (S.type === 'eut' ? S.TE : last.t), done, cs0: path[0].cs, last };
}

// 平衡での液相線・固相線の温度など(冷却の表の見出し用)と、相の分率の温度変化
export function eqFractions(id, c0, n = 300) {
  const S = SYS[id], [t0, t1] = S.t, rows = [];
  for (let i = 0; i <= n; i++) {
    const t = t1 - (t1 - t0) * i / n, loc = locate(id, c0, t);
    if (!loc || loc.inv) continue;
    const w = { L: 0, a: 0, b: 0 };
    for (const [p, , x] of loc.phases) w[p] += x;
    rows.push({ t, ...w });
  }
  return rows;
}

// ---- 練習問題で使う: 2相領域のなかの点をでたらめに選ぶ ----
export function randomPoint(id, rnd = Math.random, view) {
  const S = SYS[id], R = regions(S), [x0, x1] = view?.x ?? S.x, [t0, t1] = view?.t ?? S.t;
  const keys = Object.keys(R).filter(k => R[k].ph.length === 2);
  for (let tries = 0; tries < 400; tries++) {
    const k = keys[Math.floor(rnd() * keys.length)], r = R[k];
    const lo = Math.max(r.lo, t0), hi = Math.min(r.hi, t1);
    if (!(hi > lo + 4)) continue;
    const t = Math.round(lo + 2 + rnd() * (hi - lo - 4));
    // 拡大表示の問題では、タイラインの両端が図の中にある点だけを出す(図の外の組成は目盛りから読めないので)
    if (view && (r.l(t) < x0 - 1e-9 || r.r(t) > x1 + 1e-9)) continue;
    const l = Math.max(r.l(t), x0), rr = Math.min(r.r(t), x1), w = rr - l;
    if (!(w > (x1 - x0) * 0.12)) continue;
    const c = Math.round(l + w * (0.15 + 0.7 * rnd()));
    const loc = locate(id, c, t);
    if (loc && !loc.inv && loc.phases.length === 2 && loc.key === k) return { c, t, loc };
  }
  return null;
}

// ======================================================================
// ---- ここから画面 ----
const form = document.getElementById('lever-form');
if (form) {
  const T = JSON.parse(form.dataset.text);
  const el = form.elements;
  const out = k => document.querySelector(`[data-out="${k}"]`);
  const home = document.documentElement.dataset.home ?? '/';
  const lang = document.documentElement.lang || 'en';
  const DEG = /^(ja|zh|ko)/.test(lang) ? '℃' : '°C'; // 本文の書き方にそろえる(en・de は °C)
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const tx = (k, v = {}) => String(T[k] ?? k).replace(/\{(\w+)\}/g, (m, n) => (n in v ? v[n] : m));
  const minus = s => (/^-0(?:[.,]0*)?$/.test(s) ? s.slice(1) : s.replace(/^-/, '−'));
  const fx = (x, d) => (Number.isFinite(x) ? minus(x.toLocaleString(lang, { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: false })) : '–');
  const fc = x => fx(x, Math.abs(x) < 10 ? 2 : 1);              // 組成
  const fT = x => fx(x, Math.abs(x - Math.round(x)) < 0.05 ? 0 : 1); // 温度
  const fp = w => `${fx(w * 100, 1)} %`;                          // 割合 %
  const f3 = w => fx(w, 3);
  const csvN = (x, d = 3) => (Number.isFinite(x) ? String(Number(x.toFixed(d))) : '');
  const tw = s => [...String(s)].reduce((w, ch) => w + (/[ᄀ-ᇿ⺀-鿿가-힯豈-￯]/.test(ch) ? 13 : 7.4), 0);

  const css = document.createElement('style');
  css.textContent = `
.lv-tabs { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; }
.lv-tabs button { min-height: 40px; padding: 0 14px; font-size: .9rem; }
.lv-tabs button[aria-selected="true"] { border-color: var(--accent); background: var(--accent-soft); font-weight: 700; }
#lever-form .dy-field[hidden] { display: none; }
#lever-form .lv-mode-field { display: none; }
#lever-form select { font-size: .92rem; padding-left: 6px; padding-right: 6px; }
#lever-form .dy-field:has([name="sys"]), #lever-form .dy-field:has([name="pq"]), #lever-form .dy-field:has([name="model"]) { grid-column: span 2; }
@media (max-width: 330px) { #lever-form .dy-field:has([name="sys"]) { grid-column: 1 / -1; } }
.lv-fig { margin: 0 0 6px; padding: 6px; }
.lv-fig svg { max-width: 600px; cursor: crosshair; touch-action: manipulation; user-select: none; -webkit-user-select: none; }
.lv-fig.lv-small svg { max-width: 360px; cursor: default; }
.lv-read { min-height: 1.5em; font-size: .85rem; margin: 2px 0 6px; text-align: center; }
.lv-legend { display: flex; flex-wrap: wrap; justify-content: center; gap: 4px 14px; margin: 6px 0 0; padding: 0; list-style: none; font-size: .8rem; color: var(--muted); }
.lv-legend li { display: inline-flex; align-items: center; gap: 5px; }
.lv-legend svg { width: 18px; height: 12px; flex: none; }
.lv-chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 4px 0 10px; align-items: center; }
.lv-chips .btn { min-height: 34px; padding: 0 10px; font-size: .82rem; font-variant-numeric: tabular-nums; }
.lv-chips .btn[aria-pressed="true"] { border-color: var(--accent); background: var(--accent-soft); }
.lv-steps { margin: 6px 0 10px; padding-left: 1.2em; font-size: .92rem; line-height: 1.7; }
.lv-steps li { margin: 2px 0; overflow-wrap: anywhere; }
.lv-note { font-size: .85rem; margin: 6px 0; }
.lv-box { margin: 10px 0; padding: 10px 12px; border-radius: 8px; background: var(--bg); }
.lv-box h3, .dy-out h3.lv-h { margin: 0 0 6px; font-size: 1rem; }
.dy-out h3.lv-h { margin-top: 16px; }
.lv-tbl th, .lv-tbl td { white-space: normal; overflow-wrap: normal; padding: 6px 8px; }
.lv-tbl td { text-align: right; }
.lv-tbl.lv-left td { text-align: left; }
.lv-tbl thead th { font-size: .8rem; color: var(--muted); font-weight: 600; }
@media (max-width: 480px) { .lv-tbl th, .lv-tbl td { padding: 5px 4px; font-size: .82rem; } }
.lv-scroll { max-height: 420px; overflow-y: auto; }
.lv-tools { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0; }
.lv-tools .btn { min-height: 36px; padding: 0 12px; font-size: .85rem; }
.lv-micro { display: grid; gap: 10px; grid-template-columns: minmax(0, 1fr); }
@media (min-width: 700px) { .lv-micro { grid-template-columns: 260px minmax(0, 1fr); align-items: start; } }
.lv-micro .fig { margin: 0; }
.lv-micro svg { max-width: 260px; }
.lv-range { display: flex; gap: 10px; align-items: center; margin: 4px 0 8px; flex-wrap: wrap; }
.lv-range input[type="range"] { flex: 1 1 200px; min-height: 32px; accent-color: var(--accent); padding: 0; }
.lv-range output { font-weight: 700; font-variant-numeric: tabular-nums; min-width: 4.5em; }
.lv-q { display: grid; gap: 10px; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); margin: 8px 0; }
.lv-q label { display: flex; flex-direction: column; gap: 4px; font-size: .85rem; color: var(--muted); }
.lv-q input, .lv-q select { font: inherit; font-size: 1rem; color: var(--text); background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; min-height: 42px; width: 100%; }
.lv-ok { color: var(--ok); font-weight: 700; }
.lv-ng { color: var(--ng); font-weight: 700; }
.lv-score { font-size: .9rem; color: var(--muted); }
.lv-types svg { width: 110px; height: 74px; display: block; }
.lv-types th[scope="row"] { width: 118px; }
.lv-cool td { white-space: nowrap; }
.lv-cool td:last-child { white-space: normal; min-width: 9em; }
.lv-left td, .lv-left th { text-align: left; }
.dy-stats.lv-rs { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.dy-stats.lv-rs dd { font-size: 1.15rem; }
`;
  document.head.append(css);

  // ---- 入力欄の整理: モードはタブで選ぶ ----
  const modeField = el.mode.closest('label');
  modeField.classList.add('lv-mode-field');
  const tabs = document.createElement('div');
  tabs.className = 'lv-tabs';
  tabs.setAttribute('role', 'tablist');
  tabs.setAttribute('aria-label', T.mode_label);
  tabs.innerHTML = [...el.mode.options].map(o => `<button type="button" class="btn btn-ghost" role="tab" data-mode="${o.value}">${esc(o.textContent)}</button>`).join('');
  form.closest('.dy').prepend(tabs);
  tabs.addEventListener('click', e => {
    const b = e.target.closest('[data-mode]');
    if (!b || el.mode.value === b.dataset.mode) return;
    el.mode.value = b.dataset.mode;
    form.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const FIELDS = {
    diagram: ['sys', 'unit', 'c', 't', 'm', 'model', 'view'],
    cool: ['sys', 'unit', 'c', 't', 'step', 'cmodel', 'model', 'view'],
    rule: ['sys', 'unit', 'c', 't', 'model', 'view'],
    practice: ['pq'],
  };

  // ---- 値の取り出し ----
  const numv = (k, d) => { const s = String(el[k].value).trim(), v = s === '' ? NaN : Number(s); return Number.isFinite(v) ? v : d; };
  const state = () => {
    const id = el.sys.value, S = SYS[id];
    if (S.type === 'iso') S.useModel(el.model.value);
    const unit = el.unit.value;
    const cin = numv('c', Number(el.c.defaultValue));
    const c = unit === 'at' ? toWt(S, cin) : cin;
    return { id, S, unit, cin, c, t: numv('t', Number(el.t.defaultValue)), m: Math.max(0, numv('m', 100)), mode: el.mode.value,
      zoom: !!S.zoom && el.view.value === 'zoom', step: Math.max(0.5, numv('step', 10)), cmodel: el.cmodel.value };
  };
  const sysName = S => `${S.A}–${S.B}`;
  const U = unit => (unit === 'at' ? 'at%' : 'wt%');
  const disp = (S, unit, w) => (unit === 'at' ? toAt(S, w) : w);
  const PH = (S, p) => S.ph[p];
  const phName = (S, p) => tx(`ph_${p}`, { s: S.ph[p], A: S.A, B: S.B });
  const regLabel = (S, key) => ({ L: 'L', La: `L + ${S.ph.a}`, Lb: `L + ${S.ph.b}`, a: S.ph.a, b: S.ph.b, ab: `${S.ph.a} + ${S.ph.b}` }[key]);

  // ---- 状態図の SVG ----
  let G; // 図の座標(クリックで使う)
  const FILL = { L: 'n', a: 'p', b: 'ox' };
  function diagramSVG(st, o = {}) {
    const { S, unit } = st;
    const small = (o.width ?? out('chart').clientWidth) < 440 || o.small;
    const W = small ? 340 : 520, H = small ? 320 : 400, m = small ? { l: 50, r: 10, t: 22, b: 40 } : { l: 54, r: 16, t: 26, b: 46 };
    const pw = W - m.l - m.r, ph = H - m.t - m.b;
    const vx = st.zoom ? S.zoom.x : S.x, vt = st.zoom ? S.zoom.t : S.t;
    const dx0 = disp(S, unit, vx[0]), dx1 = disp(S, unit, vx[1]);
    const X = w => m.l + (disp(S, unit, w) - dx0) / (dx1 - dx0) * pw, Y = t => m.t + (vt[1] - t) / (vt[1] - vt[0]) * ph;
    G = { m, pw, ph, W, H, dx0, dx1, vt, S, unit };
    const P = list => list.map(([c, t]) => `${X(c).toFixed(1)},${Y(t).toFixed(1)}`).join(' ');
    const temps = (lo, hi, n = 90) => { const a = []; for (let k = 0; k <= n; k++) a.push(lo + (hi - lo) * k / n); return a; };
    const R = regions(S);
    const tmin = vt[0] - 5, tmax = vt[1] + 5;
    const brk = [S.TA, S.TB, S.TE, S.TP].filter(Number.isFinite);
    const poly = r => {
      const lo = Math.max(r.lo, tmin), hi = Math.min(r.hi, tmax);
      if (!(hi > lo)) return '';
      const ts = [...new Set([...temps(lo, hi), ...brk.filter(t => t > lo && t < hi)])].sort((a, b) => a - b);
      return P([...ts.map(t => [r.l(t), t]), ...[...ts].reverse().map(t => [r.r(t), t])]);
    };
    // 単相の領域は色を塗り、2相の領域は白(フィルム面の色)
    let fills = '';
    for (const [k, r] of Object.entries(R)) if (r.ph.length === 1) { const p = poly(r); if (p) fills += `<polygon class="${FILL[r.ph[0]]}" points="${p}" style="stroke: none; fill-opacity: .55"/>`; }
    const hl = o.region && R[o.region] ? `<polygon class="band" points="${poly(R[o.region])}" style="fill-opacity: .9"/>` : '';
    // 線
    const f = S.f, ln = [];
    const cv = (fn, lo, hi) => P(temps(Math.max(lo, tmin), Math.min(hi, tmax), 120).map(t => [fn(t), t]));
    if (S.type === 'iso') { ln.push(cv(f.liq, S.TA, S.TB), cv(f.sol, S.TA, S.TB)); }
    else if (S.type === 'eut') {
      ln.push(cv(f.liqA, S.TE, S.TA), cv(f.solA, S.TE, S.TA), cv(f.liqB, S.TE, S.TB), cv(f.solvA, tmin, S.TE));
      if (!S.pure) ln.push(cv(f.solB, S.TE, S.TB), cv(f.solvB, tmin, S.TE));
      else ln.push(P([[S.x[1], tmin], [S.x[1], S.TB]]));
      ln.push(P([[S.ca, S.TE], [S.cb, S.TE]]));
    } else {
      ln.push(cv(f.liqA, S.TP, S.TA), cv(f.solA, S.TP, S.TA), cv(f.liqB, S.TB, S.TP), cv(f.solB, S.TB, S.TP), cv(f.solvA, tmin, S.TP), cv(f.solvB, tmin, S.TP));
      ln.push(P([[S.ca, S.TP], [S.cl, S.TP]]));
    }
    let lines = ln.map(p => `<polyline class="ln" points="${p}"/>`).join('');
    // Cu–Ni: 選ばなかったほうのモデルを破線で重ねる
    if (S.type === 'iso') {
      const other = S.model === 'ideal' ? 'fit' : 'ideal', g = S.models[other];
      lines += [g.liq, g.sol].map(fn => `<polyline class="dash" points="${cv(fn, S.TA, S.TB)}" style="stroke: var(--accent-2)"/>`).join('');
    }
    // 領域の名前: 幅がいちばん広い温度に置く(入らない領域は名前を出さない)
    let labels = '';
    for (const [k, r] of Object.entries(R)) {
      const lo = Math.max(r.lo, vt[0]), hi = Math.min(r.hi, vt[1]);
      if (!(hi > lo)) continue;
      const name = regLabel(S, k), need = tw(name) * (small ? 0.95 : 1) + 6;
      let best = null;
      for (const t of temps(lo, hi, 60)) {
        const dtp = 9 / ph * (vt[1] - vt[0]);
        if (t - dtp < lo || t + dtp > hi) continue;
        const wpx = Math.min(...[t - dtp, t, t + dtp].map(u => X(Math.min(r.r(u), vx[1])) - X(Math.max(r.l(u), vx[0]))));
        if (!best || wpx > best.w) best = { w: wpx, t, c: (Math.max(r.l(t), vx[0]) + Math.min(r.r(t), vx[1])) / 2 };
      }
      if (best && best.w >= need) labels += `<text class="sm" x="${((X(Math.max(r.l(best.t), vx[0])) + X(Math.min(r.r(best.t), vx[1]))) / 2).toFixed(1)}" y="${(Y(best.t) + 4).toFixed(1)}" text-anchor="middle">${esc(name)}</text>`;
    }
    // 主要点(●)と、文献の図・例題から読んだ点(○)
    const inView = (c, t) => c >= vx[0] - 1e-9 && c <= vx[1] + 1e-9 && t >= vt[0] - 1e-9 && t <= vt[1] + 1e-9;
    let pts = '';
    for (const [c, t, kind] of S.pts) if (inView(c, t)) pts += kind === 'read' ? `<circle class="hole" cx="${X(c).toFixed(1)}" cy="${Y(t).toFixed(1)}" r="3"/>` : `<circle class="ink" cx="${X(c).toFixed(1)}" cy="${Y(t).toFixed(1)}" r="3.6"/>`;
    // 3相の線の温度
    const inv = invariant(S);
    const tl = inv && inv.t >= vt[0] && inv.t <= vt[1] ? `<text class="sm m" x="${W - m.r - 4}" y="${(Y(inv.t) + 14).toFixed(1)}" text-anchor="end">${fT(inv.t)} ${DEG}</text>` : '';
    // 重ねるもの: 合金の縦線、Scheil の平均固相組成、タイライン、点
    let over = '';
    if (o.vline != null && o.vline >= vx[0] && o.vline <= vx[1]) over += `<line class="dash" x1="${X(o.vline).toFixed(1)}" x2="${X(o.vline).toFixed(1)}" y1="${m.t}" y2="${m.t + ph}" style="stroke: var(--accent)"/>`;
    if (o.scheil) over += `<polyline class="ac2" points="${P(o.scheil.path.map(q => [q.cbar, q.t]))}" style="stroke-width: 2; stroke-dasharray: 2 3"/>`;
    if (o.tie) {
      const [c1, c2, t] = o.tie;
      over += `<line class="ac" x1="${X(Math.max(c1, vx[0])).toFixed(1)}" x2="${X(Math.min(c2, vx[1])).toFixed(1)}" y1="${Y(t).toFixed(1)}" y2="${Y(t).toFixed(1)}"/>`
        + [c1, c2].filter(c => c >= vx[0] && c <= vx[1]).map(c => `<circle class="hole" cx="${X(c).toFixed(1)}" cy="${Y(t).toFixed(1)}" r="4.5" style="stroke: var(--accent); stroke-width: 2"/>`).join('');
    }
    if (o.point && inView(o.point[0], o.point[1])) over += `<circle class="fa" cx="${X(o.point[0]).toFixed(1)}" cy="${Y(o.point[1]).toFixed(1)}" r="6" style="stroke: var(--surface); stroke-width: 1.5"/>`;
    // 目盛り
    const tick = (a, b, n) => { const span = b - a, raw = span / n, p10 = 10 ** Math.floor(Math.log10(raw)), st2 = [1, 2, 2.5, 5, 10].map(k => k * p10).find(k => k >= raw); const r2 = []; for (let v = Math.ceil(a / st2 - 1e-9) * st2; v <= b + 1e-9; v += st2) r2.push(+v.toPrecision(10)); return r2; };
    const xt = tick(dx0, dx1, small ? 5 : 10), yt = tick(vt[0], vt[1], small ? 6 : 8);
    const XD = d => m.l + (d - dx0) / (dx1 - dx0) * pw;
    // 上の目盛りは、もう一方の単位(wt% なら at%)
    const otherU = unit === 'at' ? 'wt' : 'at';
    const oth = w => (otherU === 'at' ? toAt(S, w) : w);
    const ow0 = oth(vx[0]), ow1 = oth(vx[1]);
    const xt2 = tick(ow0, ow1, small ? 4 : 8).filter(v => v > ow0 + 1e-9 || v === 0);
    const topTicks = xt2.map(v => { const x = otherU === 'at' ? X(toWt(S, v)) : X(v); return `<line class="thin" x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${m.t - 4}" y2="${m.t}"/><text class="sm m" x="${x.toFixed(1)}" y="${m.t - 7}" text-anchor="middle" style="font-size: 11px">${num(v, 3)}</text>`; }).join('');
    const rightName = st.zoom ? '' : `<text class="sm a" x="${(m.l + pw).toFixed(1)}" y="${H - m.b + (small ? 30 : 33)}" text-anchor="end">${esc(S.B === 'Cu' && S.x[1] < 100 ? 'θ' : S.B)}</text>`;
    const svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(tx('chart_title', { s: sysName(S) }))}">
  <title>${esc(tx('chart_title', { s: sysName(S) }))}</title>
  <defs><clipPath id="lv-clip"><rect x="${m.l}" y="${m.t}" width="${pw}" height="${ph}"/></clipPath></defs>
  <rect class="ok" x="${m.l}" y="${m.t}" width="${pw}" height="${ph}"/>
  <g clip-path="url(#lv-clip)">${fills}${hl}
    ${yt.map(y => `<line class="thin" stroke-dasharray="2 4" x1="${m.l}" x2="${m.l + pw}" y1="${Y(y).toFixed(1)}" y2="${Y(y).toFixed(1)}" style="stroke-width: .7"/>`).join('')}
    ${lines}${labels}${pts}${tl}${over}
  </g>
  <rect x="${m.l}" y="${m.t}" width="${pw}" height="${ph}" fill="none" style="stroke: var(--muted)"/>
  ${xt.map(v => `<text class="sm m" x="${XD(v).toFixed(1)}" y="${H - m.b + 15}" text-anchor="middle">${num(v, 3)}</text>`).join('')}
  ${topTicks}
  ${yt.map(y => `<text class="sm m" x="${m.l - 4}" y="${(Y(y) + 4).toFixed(1)}" text-anchor="end">${fT(y)}</text>`).join('')}
  <text class="sm" x="${m.l + pw / 2}" y="${H - 6}" text-anchor="middle">${esc(tx('axis_c', { u: U(unit), B: S.B }))}</text>
  <text class="sm a" x="${m.l}" y="${H - m.b + (small ? 30 : 33)}" text-anchor="start">${esc(st.zoom ? '' : S.A)}</text>${rightName}
  <text class="sm" transform="translate(${small ? 12 : 14} ${m.t + ph / 2}) rotate(-90)" text-anchor="middle">${esc(T.axis_t)}</text>
</svg>`;
    return svg;
  }
  const legendHTML = st => {
    const sw = s => `<svg viewBox="0 0 18 12" aria-hidden="true">${s}</svg>`;
    const items = [
      sw('<circle cx="9" cy="6" r="3.6" style="fill: var(--text)"/>') + esc(T.lg_key),
      ...(st.S.reads?.length ? [sw('<circle cx="9" cy="6" r="3" style="fill: var(--surface); stroke: var(--text); stroke-width: 1.5"/>') + esc(T.lg_read)] : []),
      sw('<line x1="1" y1="6" x2="17" y2="6" style="stroke: var(--accent); stroke-width: 3"/>') + esc(T.lg_tie),
    ];
    if (st.S.type === 'iso') items.push(sw('<line x1="1" y1="6" x2="17" y2="6" style="stroke: var(--accent-2); stroke-width: 1.5; stroke-dasharray: 4 3"/>') + esc(st.S.model === 'ideal' ? T.lg_fit : T.lg_ideal));
    if (st.mode === 'cool') items.push(sw('<line x1="1" y1="6" x2="17" y2="6" style="stroke: var(--accent-2); stroke-width: 2; stroke-dasharray: 2 3"/>') + esc(T.lg_cbar));
    return `<ul class="lv-legend">${items.map(i => `<li>${i}</li>`).join('')}</ul>`;
  };

  // 図をクリックした点を入力欄へ
  function pick(e) {
    if (el.mode.value === 'practice' || !G) return;
    const svg = e.currentTarget, p = svg.createSVGPoint();
    p.x = e.clientX; p.y = e.clientY;
    const q = p.matrixTransform(svg.getScreenCTM().inverse());
    const { m, pw, ph, dx0, dx1, vt } = G;
    if (q.x < m.l - 2 || q.x > m.l + pw + 2 || q.y < m.t - 2 || q.y > m.t + ph + 2) return;
    let d = dx0 + (q.x - m.l) / pw * (dx1 - dx0);
    d = Math.min(dx1, Math.max(dx0, d));
    const t = Math.min(vt[1], Math.max(vt[0], vt[1] - (q.y - m.t) / ph * (vt[1] - vt[0])));
    const res = dx1 - dx0 <= 30 ? 100 : 10;
    el.c.value = String(Math.round(d * res) / res);
    el.t.value = String(Math.round(t));
    form.dispatchEvent(new Event('input', { bubbles: true }));
  }
  // マウスで図の上を動かしたときの読み取り
  function hover(e) {
    if (e.pointerType !== 'mouse' || !G) return;
    const svg = e.currentTarget, p = svg.createSVGPoint();
    p.x = e.clientX; p.y = e.clientY;
    const q = p.matrixTransform(svg.getScreenCTM().inverse());
    const { m, pw, ph, dx0, dx1, vt, S, unit } = G;
    const rd = out('chart').querySelector('.lv-read');
    if (!rd) return;
    if (q.x < m.l || q.x > m.l + pw || q.y < m.t || q.y > m.t + ph) { rd.textContent = ''; return; }
    const d = dx0 + (q.x - m.l) / pw * (dx1 - dx0), t = vt[1] - (q.y - m.t) / ph * (vt[1] - vt[0]);
    const w = unit === 'at' ? toWt(S, d) : d, loc = locate(S.id, w, t);
    rd.textContent = `${fc(d)} ${U(unit)} ${S.B}, ${fT(t)} ${DEG} → ${loc ? (loc.inv ? '3' : loc.phases.map(x => PH(S, x[0])).join(' + ')) : '–'}`;
  }
  function mountChart(svg, st, cap) {
    out('chart').innerHTML = `<div class="fig lv-fig">${svg}${legendHTML(st)}</div><p class="lv-read muted" aria-hidden="true"></p><p class="muted lv-note">${cap}</p>`;
    const s = out('chart').querySelector('svg');
    s.addEventListener('click', pick);
    s.addEventListener('pointermove', hover);
    s.addEventListener('pointerleave', () => { const rd = out('chart').querySelector('.lv-read'); if (rd) rd.textContent = ''; });
  }

  // ---- 表と CSV ----
  const tableHTML = (head, rows, id, cls = '') => `<div class="table-wrap"><table class="dy-table lv-tbl ${cls}">
<thead><tr>${head.map(h => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead>
<tbody>${rows.map((r, i) => `<tr><th scope="row">${r[0]}</th>${r.slice(1).map((x, j) => `<td data-out="${id}-${i}-${j}">${x}</td>`).join('')}</tr>`).join('')}</tbody>
</table></div>`;
  const csvRegistry = {};
  const csvBtn = (key, head, rows) => { csvRegistry[key] = [head, ...rows].map(r => r.map(v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(',')).join('\n'); return `<button type="button" class="btn btn-ghost" data-csv="${key}" data-done="${esc(T.copied)}">${esc(T.copy_csv)}</button>`; };
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
  out('panel').addEventListener('click', async e => {
    const b = e.target.closest('[data-csv]');
    if (!b) return;
    if (await copyText(csvRegistry[b.dataset.csv] ?? '')) { const old = b.textContent; b.textContent = b.dataset.done; setTimeout(() => { b.textContent = old; }, 1600); }
  });

  // ---- 例の点 ----
  const chips = st => `<div class="lv-chips"><span class="muted" style="font-size: .85rem">${esc(T.ex_label)}</span>${st.S.ex.map(([c, t]) => {
    const on = Math.abs(st.c - c) < 1e-6 && Math.abs(st.t - t) < 1e-6;
    return `<button type="button" class="btn btn-ghost" data-ex="${c},${t}" aria-pressed="${on}">${esc(`${num(c, 3)} wt% ${st.S.B}, ${fT(t)} ${DEG}`)}</button>`;
  }).join('')}</div>`;
  out('panel').addEventListener('click', e => {
    const b = e.target.closest('[data-ex]');
    if (!b) return;
    const [c, t] = b.dataset.ex.split(',').map(Number), S = SYS[el.sys.value];
    el.c.value = String(el.unit.value === 'at' ? Math.round(toAt(S, c) * 100) / 100 : c);
    el.t.value = String(t);
    form.dispatchEvent(new Event('input', { bubbles: true }));
  });

  // ---- 途中の式 ----
  const leverSteps = (st, phases, tt) => {
    const { S, unit, c } = st;
    if (phases.length !== 2) return '';
    const [[p1, c1, w1], [p2, c2]] = phases;
    const s1 = PH(S, p1), s2 = PH(S, p2), u = U(unit);
    const d0 = disp(S, unit, c), d1 = disp(S, unit, c1), d2 = disp(S, unit, c2);
    const x0 = toAt(S, c), x1 = toAt(S, c1), x2 = toAt(S, c2), X1 = lever(x0, x1, x2);
    const items = [
      tx('st_tie', { t: fT(tt), s1, s2, c1: fc(d1), c2: fc(d2), u }),
      `W(${s1}) = (C(${s2}) − C₀)/(C(${s2}) − C(${s1})) = (${fc(c2)} − ${fc(c)})/(${fc(c2)} − ${fc(c1)}) = ${f3(w1)}${unit === 'at' ? ` (${tx('st_in_wt')})` : ''}`,
      `W(${s2}) = 1 − W(${s1}) = ${f3(1 - w1)}`,
      `X(${s1}) = (x(${s2}) − x₀)/(x(${s2}) − x(${s1})) = (${fc(x2)} − ${fc(x0)})/(${fc(x2)} − ${fc(x1)}) = ${f3(X1)} (${tx('st_in_at')})`,
      tx('st_balance', { s1, s2, w1: f3(w1), c1: fc(c1), w2: f3(1 - w1), c2: fc(c2), c0: fc(w1 * c1 + (1 - w1) * c2) }),
    ];
    if (st.m > 0) items.push(tx('st_mass', { s1, s2, m: num(st.m, 4), m1: num(w1 * st.m, 4), m2: num((1 - w1) * st.m, 4) }));
    return `<ol class="lv-steps">${items.map(i => `<li>${esc(i)}</li>`).join('')}</ol>`;
  };
  const convSteps = (S, w) => {
    const a = (100 - w) / MW[S.A], b = w / MW[S.B];
    return esc(tx('st_conv', { A: S.A, B: S.B, w: fc(w), wa: fc(100 - w), MA: num(MW[S.A], 5), MB: num(MW[S.B], 5), x: fc(100 * b / (a + b)) }));
  };

  // ---- 図とタイライン ----
  function viewDiagram(st) {
    const { S, unit, c, t } = st;
    const loc = locate(S.id, c, t);
    let tie = null, region = null;
    if (loc && !loc.inv) { region = loc.key; if (loc.phases.length === 2) tie = [loc.phases[0][1], loc.phases[1][1], t]; }
    if (loc?.inv) tie = [invariant(S).lo, invariant(S).hi, t];
    mountChart(diagramSVG(st, { tie, region, point: [c, t] }), st, esc(tx(st.zoom ? 'cap_zoom' : 'cap', { s: sysName(S) })) + (S.zoom && !st.zoom ? ` ${esc(T.cap_zoom_hint)}` : ''));
    let h = chips(st);
    if (!loc) {
      h += `<p>${esc(tx('out_range', { x0: num(S.x[0], 3), x1: num(S.x[1], 3), t0: fT(S.t[0]), t1: fT(S.t[1]) }))}</p>`;
      out('panel').innerHTML = h + libraryHTML(st);
      return;
    }
    const P_ = loc.inv ? 3 : loc.phases.length, F = 2 - P_ + 1;
    const phaseText = loc.inv ? loc.inv.phases.map(p => PH(S, p[0])).join(' + ') : loc.phases.map(p => PH(S, p[0])).join(' + ');
    h += `<dl class="dy-stats"><div><dt>${esc(T.s_phase)}</dt><dd data-out="lv-phase">${esc(phaseText)}</dd></div><div><dt>${esc(T.s_dof)}</dt><dd data-out="lv-dof">F = ${F}</dd></div><div><dt>${esc(tx('s_c0', { u: 'wt%' }))}</dt><dd data-out="lv-cw">${fc(c)}</dd></div><div><dt>${esc(tx('s_c0', { u: 'at%' }))}</dt><dd data-out="lv-ca">${fc(toAt(S, c))}</dd></div></dl>`;
    const head = [T.col_phase, tx('col_comp', { u: 'wt%' }), tx('col_comp', { u: 'at%' }), T.col_w, T.col_x, tx('col_mass', { m: num(st.m, 4) })];
    const rowOf = (p, cc, w, xf) => [esc(phName(S, p)), fc(cc), fc(toAt(S, cc)), w == null ? '–' : fp(w), xf == null ? '–' : fp(xf), w == null ? '–' : `${num(w * st.m, 4)} g`];
    const csvRow = (p, cc, w, xf) => [PH(S, p), csvN(cc), csvN(toAt(S, cc)), csvN(w, 4), csvN(xf, 4), csvN(w == null ? NaN : w * st.m, 4)];
    const csvHead = ['phase', 'C_wt%', 'C_at%', 'W_mass_fraction', 'X_mole_fraction', 'mass_g'];
    const molFrac = phases => { if (phases.length !== 2) return [1]; const x0 = toAt(S, c), x1 = toAt(S, phases[0][1]), x2 = toAt(S, phases[1][1]); const X1 = lever(x0, x1, x2); return [X1, 1 - X1]; };
    if (loc.inv) {
      const inv = loc.inv, iv = invLevers(S.id, c);
      h += `<h3 class="lv-h">${esc(T.h_inv)}</h3><p>${esc(tx(`inv_${inv.key}`, { t: fT(inv.t), a: S.ph.a, b: S.ph.b }))}</p>`;
      h += tableHTML([T.col_phase, tx('col_comp', { u: 'wt%' }), tx('col_comp', { u: 'at%' })], inv.phases.map(([p, cc]) => [esc(phName(S, p)), fc(cc), fc(toAt(S, cc))]), 'lv-inv');
      for (const [k, list] of [['above', iv.above], ['below', iv.below]]) {
        const X_ = molFrac(list);
        h += `<h3 class="lv-h">${esc(tx(`h_${k}`, { t: fT(inv.t) }))}</h3>` + tableHTML(head, list.map(([p, cc, w], i) => rowOf(p, cc, w, X_[i])), `lv-${k}`) + leverSteps(st, list, inv.t);
      }
      h += `<p class="lv-note muted">${esc(T.inv_note)}</p>`;
      const rows = [...iv.above.map((r, i) => ['above', ...csvRow(r[0], r[1], r[2], molFrac(iv.above)[i])]), ...iv.below.map((r, i) => ['below', ...csvRow(r[0], r[1], r[2], molFrac(iv.below)[i])])];
      h += `<div class="lv-tools">${csvBtn('tie', ['side', ...csvHead], rows)}</div>`;
    } else {
      const X_ = molFrac(loc.phases);
      h += `<h3 class="lv-h">${esc(T.h_tie)}</h3>`;
      h += `<p>${esc(loc.phases.length === 2 ? tx('two', { r: regLabel(S, loc.key) }) : tx('single', { r: regLabel(S, loc.key) }))}</p>`;
      h += tableHTML(head, loc.phases.map(([p, cc, w], i) => rowOf(p, cc, w, X_[i])), 'lv-tie');
      h += leverSteps(st, loc.phases, t);
      // 体積分率(2相とも固体のとき)
      if (loc.phases.length === 2 && !loc.phases.some(p => p[0] === 'L')) {
        const [[p1, c1, w1], [p2, c2, w2]] = loc.phases, r1 = rhoOf(S, c1), r2 = rhoOf(S, c2), v1 = (w1 / r1) / (w1 / r1 + w2 / r2);
        h += `<p class="lv-note">${esc(tx('vol', { s1: PH(S, p1), s2: PH(S, p2), r1: num(r1, 4), r2: num(r2, 4), v1: fp(v1), v2: fp(1 - v1), A: S.A, B: S.B, rA: num(RHO[S.A], 4), rB: num(RHO[S.B], 4) }))}</p>`;
      }
      h += `<div class="lv-tools">${csvBtn('tie', csvHead, loc.phases.map(([p, cc, w], i) => csvRow(p, cc, w, X_[i])))}</div>`;
    }
    h += `<h3 class="lv-h">${esc(T.h_conv)}</h3><p class="lv-note">${convSteps(S, c)}</p>`;
    if (S.type === 'iso') h += modelHTML(st);
    out('panel').innerHTML = h + libraryHTML(st);
  }
  // Cu–Ni: モデルどうしと文献の値の比べ
  function modelHTML(st) {
    const { S, t } = st;
    const rows = [];
    for (const tt of [...new Set([S.tie[0], Math.round(t)])].filter(x => x > S.TA && x < S.TB)) {
      const fit = S.models.fit, id = S.models.ideal;
      rows.push([`${fT(tt)} ${DEG}`, fc(fit.liq(tt)), fc(fit.sol(tt)), fc(id.liq(tt)), fc(id.sol(tt)), tt === S.tie[0] ? `${fc(S.tie[1])} / ${fc(S.tie[2])}` : '–']);
    }
    return `<h3 class="lv-h">${esc(T.h_model)}</h3>${tableHTML([T.col_t, T.col_fit_l, T.col_fit_s, T.col_id_l, T.col_id_s, T.col_lit], rows, 'lv-model')}
<p class="lv-note muted">${esc(tx('model_note', { os: num(S.OS / 1000, 3), ol: num(S.OL / 1000, 3), tc: fT(S.OS / (2 * RG) - 273.15), ha: num(HF.Cu / 1000, 4), hb: num(HF.Ni / 1000, 4) }))}</p>`;
  }
  // 蔵書の値(主要点の表)
  function libraryHTML(st) {
    const { S } = st;
    const name = k => tx(`pt_${k}`, { A: S.A, B: S.B, a: S.ph.a, b: S.ph.b });
    const list = S.pts.filter(p => p[2] !== 'read');
    const rows = list.map(([c, t, k, s]) => [esc(name(k)), `${fT(t)} ${DEG}`, fc(c), fc(toAt(S, c)), esc(SRC[s] ?? tx(`src_short_${S.id}`))]);
    const reads = S.pts.filter(p => p[2] === 'read');
    const csv = [...list, ...reads].map(([c, t, k, s]) => [k === 'read' ? 'read' : name(k), csvN(t, 2), csvN(c), csvN(toAt(S, c)), SRC[s] ?? tx(`src_short_${S.id}`)]);
    return `<h3 class="lv-h">${esc(tx('h_lib', { s: sysName(S) }))}</h3>${tableHTML([T.col_point, T.col_t, tx('col_comp', { u: 'wt%' }), tx('col_comp', { u: 'at%' }), T.col_src], rows, 'lv-lib', '')}
${reads.length ? `<p class="lv-note">${esc(T.reads_lead)} ${reads.map(([c, t]) => `(${fc(c)} wt%, ${fT(t)} ${DEG})`).join(', ')}</p>` : ''}
<p class="lv-note muted">${esc(T[`src_${S.id}`])} ${esc(T.lib_note)}</p>
<div class="lv-tools">${csvBtn('lib', ['point', 'T_C', 'C_wt%', 'C_at%', 'source'], csv)}<a class="btn btn-ghost" href="${home}tools/iron-carbon-phase-diagram/">${esc(T.fec_link)} →</a><a class="btn btn-ghost" href="${home}tools/materials-periodic-table/">${esc(T.ptable_link)} →</a></div>`;
  }

  // ---- 冷却の経路 ----
  let playTimer = null;
  function viewCool(st) {
    const { S, unit, c, t } = st;
    const ev = events(S.id, c), sc = scheil(S.id, c);
    const loc = locate(S.id, c, t);
    let tie = null, region = null;
    if (loc && !loc.inv) { region = loc.key; if (loc.phases.length === 2) tie = [loc.phases[0][1], loc.phases[1][1], t]; }
    mountChart(diagramSVG(st, { tie, region, point: [c, t], vline: c, scheil: sc }), st, esc(T.cap_cool));
    if (!(c >= 0 && c <= S.x[1])) {
      out('panel').innerHTML = `<p>${esc(tx('out_range', { x0: num(S.x[0], 3), x1: num(S.x[1], 3), t0: fT(S.t[0]), t1: fT(S.t[1]) }))}</p>`;
      return;
    }
    let h = `<div class="lv-range"><label for="lv-slider" class="muted" style="font-size: .85rem">${esc(T.slider)}</label><input type="range" id="lv-slider" min="${S.t[0]}" max="${S.t[1]}" step="1" value="${Math.min(S.t[1], Math.max(S.t[0], t))}"><output data-out="lv-tnow">${fT(t)} ${DEG}</output>
<button type="button" class="btn btn-ghost" id="lv-play" style="min-height: 36px">${esc(playTimer ? T.stop : T.play)}</button></div>`;
    // 組織の模式図
    h += `<h3 class="lv-h">${esc(tx('h_micro', { t: fT(t) }))}</h3>${microHTML(st, sc)}`;
    // 起こること(イベント)
    const evRows = ev.map(e => [`${fT(e.t)} ${DEG}`, esc(e.inv ? tx(`ev_${invariant(S).key}`) : tx('ev_cross', { a: regLabel(S, e.from), b: regLabel(S, e.to) }))]);
    h += `<h3 class="lv-h">${esc(T.h_events)}</h3>${tableHTML([T.col_t, T.col_event], evRows, 'lv-ev', 'lv-left')}`;
    // Scheil の結果
    if (sc) h += scheilHTML(st, sc);
    // 温度ごとの表
    const temps = [];
    const lo = S.t[0], hi = S.t[1];
    let step = st.step;
    if ((hi - lo) / step > 160) step = Math.ceil((hi - lo) / 160);
    const top = Math.min(hi, Math.ceil(((ev[0]?.t ?? hi) + 2 * step) / step) * step);
    for (let tt = top; tt >= lo - 1e-9; tt -= step) temps.push({ t: +tt.toFixed(6) });
    for (const e of ev) {
      if (e.inv) temps.push({ t: e.t + 1e-6, tag: 'above' }, { t: e.t - 1e-6, tag: 'below' });
      else temps.push({ t: e.t, tag: 'ev' });
    }
    temps.sort((a, b) => b.t - a.t);
    const rows = [], csv = [];
    for (const r of temps) {
      if (r.t > hi || r.t < lo) continue;
      const lc = locate(S.id, c, r.t);
      if (!lc || lc.inv) continue;
      const ps = lc.phases;
      const cons = constituents(S.id, c, r.t);
      const consTxt = cons && !cons.inv && cons.parts.some(p => p.k === 'eut') ? cons.parts.map(p => `${tx(`m_${p.k}`, { a: S.ph.a, b: S.ph.b })} ${fp(p.w)}`).join(', ') : '';
      const tLabel = r.tag === 'above' ? tx('t_above', { t: fT(Math.round(r.t * 10) / 10) }) : r.tag === 'below' ? tx('t_below', { t: fT(Math.round(r.t * 10) / 10) }) : `${fT(r.t)} ${DEG}${r.tag === 'ev' ? ' *' : ''}`;
      rows.push([esc(tLabel), esc(ps.map(p => PH(S, p[0])).join(' + ')),
        esc(ps.map(p => `${PH(S, p[0])} ${fc(disp(S, unit, p[1]))}`).join(' / ')), esc(ps.map(p => `${PH(S, p[0])} ${fp(p[2])}`).join(' / ')), esc(consTxt)]);
      const W = { L: 0, a: 0, b: 0 }, Cc = { L: '', a: '', b: '' };
      for (const [p, cc, w] of ps) { W[p] += w; Cc[p] = csvN(cc); }
      csv.push([csvN(r.t, 3), r.tag ?? '', ps.map(p => PH(S, p[0])).join('+'), Cc.L, Cc.a, Cc.b, csvN(W.L, 4), csvN(W.a, 4), csvN(W.b, 4), consTxt]);
    }
    h += `<h3 class="lv-h">${esc(T.h_table)}</h3><p class="lv-note muted">${esc(tx('table_note', { u: U(unit) }))}</p><div class="lv-scroll">${tableHTML([T.col_t, T.col_phase, tx('col_comp', { u: U(unit) }), T.col_w, T.col_cons], rows, 'lv-cool', 'lv-cool')}</div>`;
    h += `<div class="lv-tools">${csvBtn('cool', ['T_C', 'note', 'phases', 'C_L_wt%', `C_${S.ph.a}_wt%`, `C_${S.ph.b}_wt%`, 'W_L', `W_${S.ph.a}`, `W_${S.ph.b}`, 'constituents'], csv)}</div>`;
    // 相の割合のグラフ
    h += `<h3 class="lv-h">${esc(T.h_graph)}</h3>${fracChart(st, sc)}`;
    out('panel').innerHTML = h;
    const sl = document.getElementById('lv-slider');
    sl.addEventListener('input', () => { el.t.value = sl.value; form.dispatchEvent(new Event('input', { bubbles: true })); });
    document.getElementById('lv-play').addEventListener('click', () => {
      if (playTimer) { clearInterval(playTimer); playTimer = null; update(true); return; }
      const S2 = SYS[el.sys.value], startT = Math.min(S2.t[1], Math.ceil(((events(S2.id, state().c)[0]?.t ?? S2.t[1]) + 20) / 10) * 10);
      if (numv('t', 0) <= S2.t[0] + 1) el.t.value = String(startT);
      playTimer = setInterval(() => {
        const cur = numv('t', S2.t[1]), stp = Math.max(1, (S2.t[1] - S2.t[0]) / 80);
        const nx = Math.max(S2.t[0], Math.round(cur - stp));
        el.t.value = String(nx);
        form.dispatchEvent(new Event('input', { bubbles: true }));
        if (nx <= S2.t[0]) { clearInterval(playTimer); playTimer = null; update(true); }
      }, 280);
      update(true);
    });
  }
  function scheilHTML(st, sc) {
    const { S, c, unit } = st;
    const eqFE = S.type === 'eut' && c > S.ca && c < S.cb ? (c <= S.ce ? 1 - lever(c, S.ca, S.ce) : lever(c, S.ce, S.cb)) : 0;
    const rows = [
      [esc(T.sc_tl), `${fT(sc.tl)} ${DEG}`, `${fT(sc.tl)} ${DEG}`],
      [esc(T.sc_first), `${fc(disp(S, unit, sc.cs0))} ${U(unit)}`, `${fc(disp(S, unit, sc.cs0))} ${U(unit)}`],
    ];
    const evs = events(S.id, c);
    // 平衡の凝固の終わり: 液相のない領域(α、β、α + β)に入る温度。包晶型で C₀ が β と L のあいだにあると、包晶温度ではまだ L が残る
    const sol = evs.find(e => e.to === 'a' || e.to === 'b' || e.to === 'ab');
    rows.push([esc(T.sc_end), sol ? `${fT(sol.t)} ${DEG}` : '–', sc.done ? `${fT(sc.tend)} ${DEG}` : `${fT(sc.tend)} ${DEG}`]);
    if (S.type === 'eut') rows.push([esc(T.sc_eut), fp(eqFE), fp(sc.fe)]);
    const lastSolid = sc.last;
    rows.push([esc(T.sc_last), '–', `${fc(disp(S, unit, lastSolid.cs))} ${U(unit)}`]);
    let note = T.sc_note;
    if (S.type === 'eut' && eqFE === 0 && sc.fe > 0.0005) note += ' ' + tx('sc_noneq', { f: fp(sc.fe) });
    if (S.type === 'per') note += ' ' + T.sc_per;
    return `<h3 class="lv-h">${esc(T.h_scheil)}</h3>${tableHTML(['', T.col_eq, T.col_scheil], rows, 'lv-sc')}<p class="lv-note">${esc(note)}</p>
<p class="lv-note muted">${esc(T.sc_formula)}</p>`;
  }

  // 相の割合と温度のグラフ(平衡の実線、Scheil の液相の割合は破線)
  function fracChart(st, sc) {
    const { S } = st;
    const rows = eqFractions(S.id, st.c, 360);
    const sm = out('chart').clientWidth < 440;
    const [W, H, L, R, Tp, B] = sm ? [360, 250, 48, 352, 10, 204] : [600, 300, 54, 584, 14, 252];
    const t0 = S.t[0], t1 = S.t[1];
    const X = t => L + (t1 - t) / (t1 - t0) * (R - L), Y = w => B - w * (B - Tp);
    const line = (key, cls, style = '') => `<polyline class="${cls}" points="${rows.map(r => `${X(r.t).toFixed(1)},${Y(r[key]).toFixed(1)}`).join(' ')}"${style ? ` style="${style}"` : ''}/>`;
    const xt = []; const span = t1 - t0, stp = [50, 100, 200, 250].find(s => span / s <= (sm ? 5 : 7)) ?? 500;
    for (let v = Math.ceil(t0 / stp) * stp; v <= t1; v += stp) xt.push(v);
    let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(T.h_graph)}">
<rect class="ok" x="${L}" y="${Tp}" width="${R - L}" height="${B - Tp}"/>
${[0, 0.25, 0.5, 0.75, 1].map(v => `<line class="thin" x1="${L}" x2="${R}" y1="${Y(v)}" y2="${Y(v)}" stroke-dasharray="2 4" style="stroke-width: .7"/><text class="sm m" x="${L - 5}" y="${Y(v) + 4}" text-anchor="end">${num(v * 100, 3)}</text>`).join('')}
${xt.map(v => `<text class="sm m" x="${X(v).toFixed(1)}" y="${B + 16}" text-anchor="${X(v) > R - 12 ? 'end' : X(v) < L + 12 ? 'start' : 'middle'}">${v}</text>`).join('')}
${line('L', 'ac')}${line('a', 'ln')}${S.type !== 'iso' ? line('b', 'ln', 'stroke: var(--ng); stroke-dasharray: 7 3') : ''}`;
    if (sc) s += `<polyline class="ac2" points="${sc.path.map(q => `${X(q.t).toFixed(1)},${Y(q.fl).toFixed(1)}`).join(' ')}" style="stroke-dasharray: 3 3; stroke-width: 2.4"/>`;
    s += `<line class="thin" x1="${X(st.t).toFixed(1)}" x2="${X(st.t).toFixed(1)}" y1="${Tp}" y2="${B}" style="stroke: var(--accent)"/>`;
    s += `<text class="sm" x="${(L + R) / 2}" y="${H - 8}" text-anchor="middle">${esc(T.g_xlabel)}</text><text class="sm" transform="translate(${sm ? 12 : 14} ${(Tp + B) / 2}) rotate(-90)" text-anchor="middle">${esc(T.g_ylabel)}</text></svg>`;
    const sw = st2 => `<svg viewBox="0 0 18 12" aria-hidden="true"><line x1="1" y1="6" x2="17" y2="6" style="${st2}"/></svg>`;
    const lg = [[sw('stroke: var(--accent); stroke-width: 3'), tx('g_L')], [sw('stroke: var(--text); stroke-width: 2'), tx('g_a', { a: S.ph.a })],
      ...(S.type !== 'iso' ? [[sw('stroke: var(--ng); stroke-width: 2; stroke-dasharray: 5 2'), tx('g_b', { b: S.ph.b })]] : []),
      ...(sc ? [[sw('stroke: var(--accent-2); stroke-width: 2.4; stroke-dasharray: 3 3'), T.g_scheil]] : [])];
    return `<div class="fig">${s}<ul class="lv-legend">${lg.map(([a, b]) => `<li>${a}${esc(b)}</li>`).join('')}</ul></div>`;
  }

  // 組織の模式図。少ないほうの組織を円で、多いほうを地で描く(円の面積の割合 = 質量分率)
  const CELLS = (() => {
    const s = 58, dy = s * Math.sqrt(3) / 2, out2 = [];
    let seed = 7;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let r = -1; r < 7; r++) for (let q = -1; q < 7; q++) out2.push([q * s + (r % 2 ? s / 2 : 0) + (rnd() - 0.5) * 10, r * dy + (rnd() - 0.5) * 10, rnd()]);
    return { list: out2, area: s * dy };
  })();
  function microSVG(st, sc, idp) {
    const { S, c, t } = st;
    const cons = constituents(S.id, c, t);
    if (!cons) return '';
    const parts = cons.parts.filter(p => p.w > 1e-4);
    const Wd = 240, C0 = Wd / 2;
    const fillOf = k => (k === 'L' ? 'n' : k === 'a' || k === 'pa' ? 'p' : k === 'b' || k === 'pb' ? 'ox' : 'eut');
    const fillAttr = k => (fillOf(k) === 'eut' ? `fill="url(#${idp}-eut)"` : `class="${fillOf(k)}"`);
    const ea = cons.ea ?? 0.5;
    const pat = `<pattern id="${idp}-eut" patternUnits="userSpaceOnUse" width="7" height="7" patternTransform="rotate(35)"><rect width="7" height="7" class="ox" style="stroke: none"/><rect width="${(7 * ea).toFixed(2)}" height="7" class="p" style="stroke: none"/></pattern>`;
    // 初晶(液相か共晶組織と共存する固相)は粒として円で描き、地を液相・共晶組織にする。初晶が 88 % を超えたら逆にする
    const solidK = ['pa', 'pb', 'a', 'b'];
    const hasL = parts.some(p => p.k === 'L' || p.k === 'eut');
    const prim = hasL ? parts.find(p => solidK.includes(p.k)) : null;
    let bg, grains = null, pockets = null, minor = null;
    if (prim && parts.length === 2) {
      const other = parts.find(p => p !== prim);
      if (prim.w <= 0.88) { bg = other; grains = prim; } else { bg = prim; pockets = other; }
    } else {
      const sorted = [...parts].sort((a, b) => b.w - a.w);
      bg = sorted[0]; minor = sorted[1] ?? null;
    }
    const cored = st.cmodel === 'scheil' && !!sc;
    const R = w => Math.sqrt(w * CELLS.area / Math.PI);
    const ring = (x, y, r, k) => {
      const base = `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" ${fillAttr(k)} style="stroke: var(--muted); stroke-width: .8"/>`;
      if (!cored || !solidK.includes(k)) return base;
      return base + [0.8, 0.6, 0.4, 0.2].map((f, i) => `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(r * f).toFixed(1)}" class="fa" style="fill-opacity: ${(0.07 + i * 0.07).toFixed(2)}; stroke: none"/>`).join('');
    };
    const hexes = () => CELLS.list.map(([x, y]) => `<polygon points="${[0, 1, 2, 3, 4, 5].map(i => { const a = Math.PI / 6 + i * Math.PI / 3; return `${(x + 33.5 * Math.cos(a)).toFixed(1)},${(y + 33.5 * Math.sin(a)).toFixed(1)}`; }).join(' ')}" fill="none" style="stroke: var(--muted); stroke-width: .8"/>`).join('');
    let body = `<rect x="0" y="0" width="${Wd}" height="${Wd}" ${fillAttr(bg.k)} style="stroke: none"/>`;
    // 疑似乱数(図が毎回同じになるように)
    let sd = 11;
    const rnd = () => { sd = (sd * 48271) % 2147483647; return sd / 2147483647; };
    const dotsIn = (frac, cls, r) => { // 円(半径 r)の中に、全体の面積の frac にあたる小さな点を散らす
      if (!(frac > 0.0005)) return '';
      const rd = 1.9, per = Math.min(14, Math.max(1, Math.round(frac * CELLS.area / (Math.PI * rd * rd)))), sz = rd * Math.sqrt(Math.max(1, frac * CELLS.area / (Math.PI * rd * rd)) / per);
      return CELLS.list.map(([x, y]) => { let o = ''; for (let i = 0; i < per; i++) { const a = rnd() * 2 * Math.PI, q = Math.sqrt(rnd()) * r * 0.85; o += `<circle cx="${(x + q * Math.cos(a)).toFixed(1)}" cy="${(y + q * Math.sin(a)).toFixed(1)}" r="${sz.toFixed(2)}" class="${cls}" style="stroke: var(--text); stroke-width: .4"/>`; } return o; }).join('');
    };
    if (grains) {
      const r = R(grains.w);
      body += CELLS.list.map(([x, y]) => ring(x, y, r, grains.k)).join('');
      if (cons.sec > 0.0005) body += dotsIn(cons.sec * grains.w, cons.prim === 'a' ? 'ox' : 'p', r);
    } else if (pockets) {
      body += hexes();
      if (cored) body += CELLS.list.map(([x, y]) => ring(x, y, 26, bg.k)).join('');
      body += CELLS.list.map(([x, y]) => `<circle cx="${(x + 29).toFixed(1)}" cy="${(y + 17).toFixed(1)}" r="${R(pockets.w).toFixed(1)}" ${fillAttr(pockets.k)} style="stroke: var(--muted); stroke-width: .8"/>`).join('');
    } else {
      if (bg.k !== 'L') body += hexes();
      if (cored && bg.k !== 'L' && !minor) body += CELLS.list.map(([x, y]) => ring(x, y, 26, bg.k)).join('');
      if (minor && minor.w >= 0.12) body += CELLS.list.map(([x, y]) => `<circle cx="${(x + 29).toFixed(1)}" cy="${(y + 17).toFixed(1)}" r="${R(minor.w).toFixed(1)}" ${fillAttr(minor.k)} style="stroke: var(--muted); stroke-width: .8"/>`).join('');
      else if (minor) body += dotsIn(minor.w, fillOf(minor.k), 30);
    }
    return `<svg viewBox="0 0 ${Wd} ${Wd}" role="img" aria-label="${esc(T.micro_label)}"><defs>${pat}<clipPath id="${idp}-c"><circle cx="${C0}" cy="${C0}" r="${C0 - 2}"/></clipPath></defs>
<g clip-path="url(#${idp}-c)">${body}</g><circle cx="${C0}" cy="${C0}" r="${C0 - 2}" fill="none" style="stroke: var(--muted); stroke-width: 1.5"/></svg>`;
  }
  function microHTML(st, sc) {
    const { S, c, t } = st;
    const cons = constituents(S.id, c, t);
    if (!cons) return '';
    const sw = k => `<svg viewBox="0 0 18 12" aria-hidden="true"><rect x="1" y="1" width="16" height="10" ${k === 'eut' ? 'fill="url(#lv-m-eut)"' : `class="${k === 'L' ? 'n' : k === 'a' || k === 'pa' ? 'p' : 'ox'}"`} style="stroke: var(--muted)"/></svg>`;
    const items = cons.parts.filter(p => p.w > 1e-4).map(p => `<li>${sw(p.k)}${esc(tx(`m_${p.k}`, { a: S.ph.a, b: S.ph.b }))} ${fp(p.w)}</li>`);
    let txt = '';
    if (cons.inv) txt = T.micro_inv;
    else if (cons.parts.some(p => p.k === 'eut')) {
      const eutA = cons.ea;
      txt = tx('micro_eut', { a: S.ph.a, b: S.ph.b, ea: fp(eutA), eb: fp(1 - eutA) });
      if (cons.sec > 0.0005) txt += ' ' + tx('micro_sec', { p: cons.prim === 'a' ? S.ph.a : S.ph.b, q: cons.prim === 'a' ? S.ph.b : S.ph.a, f: fp(cons.sec) });
    } else if (cons.parts.length === 2 && cons.parts.every(p => p.k !== 'L')) txt = tx('micro_prec', { a: S.ph.a, b: S.ph.b });
    else if (cons.parts.some(p => p.k === 'L') && cons.parts.length === 2) txt = T.micro_sl;
    else if (cons.parts[0].k === 'L') txt = T.micro_l;
    else txt = T.micro_single;
    if (st.cmodel === 'scheil' && sc) txt += ' ' + tx('micro_cored', { c1: fc(sc.cs0), c2: fc(sc.last.cs), B: S.B });
    if (S.type === 'per' && t < S.TP && c > S.ca && c < S.cl) txt += ' ' + T.micro_per;
    return `<div class="lv-micro"><div class="fig">${microSVG(st, sc, 'lv-m')}<ul class="lv-legend">${items.join('')}</ul></div><div><p class="lv-note">${esc(txt)}</p><p class="lv-note muted">${esc(T.micro_note)}</p></div></div>`;
  }

  // ---- 相律と反応の型 ----
  function viewRule(st) {
    const { S, c, t } = st;
    const loc = locate(S.id, c, t);
    let tie = null, region = null;
    if (loc && !loc.inv) { region = loc.key; if (loc.phases.length === 2) tie = [loc.phases[0][1], loc.phases[1][1], t]; }
    mountChart(diagramSVG(st, { tie, region, point: [c, t] }), st, esc(T.cap_rule));
    let h = '';
    if (loc) {
      const P_ = loc.inv ? 3 : loc.phases.length, F = 2 - P_ + 1;
      h += `<dl class="dy-stats lv-rs"><div><dt>${esc(T.r_c)}</dt><dd data-out="lv-rc">C = 2</dd></div><div><dt>${esc(T.r_p)}</dt><dd data-out="lv-rp">P = ${P_}</dd></div><div><dt>${esc(T.r_f)}</dt><dd data-out="lv-rf">F = ${F}</dd></div></dl>`;
      h += `<ol class="lv-steps"><li>${esc(tx('r_step1', { p: P_, f: F }))}</li><li>${esc(T[`r_f${F}`])}</li><li>${esc(tx('r_step3', { f2: F + 1 }))}</li></ol>`;
    } else h += `<p>${esc(tx('out_range', { x0: num(S.x[0], 3), x1: num(S.x[1], 3), t0: fT(S.t[0]), t1: fT(S.t[1]) }))}</p>`;
    // 蔵書の不変反応(Fe–C は鉄–炭素状態図ツールの値)
    const rows = [], csv = [];
    for (const id of SYS_IDS) {
      const S2 = SYS[id], iv = invariant(S2);
      if (!iv) continue;
      const fml = S2.type === 'eut' ? `L(${fc(S2.ce)}) → ${S2.ph.a}(${fc(S2.ca)}) + ${S2.ph.b}(${fc(S2.cb)})` : `L(${fc(S2.cl)}) + ${S2.ph.a}(${fc(S2.ca)}) → ${S2.ph.b}(${fc(S2.cp)})`;
      rows.push([`${esc(sysName(S2))}<br><span class="muted">${esc(T[`type_${iv.key}`])}</span>`, `${fT(iv.t)} ${DEG}`, esc(`${fml} wt% ${S2.B}`)]);
      csv.push([sysName(S2), iv.key, csvN(iv.t, 2), fml]);
    }
    const fe = [['eut', FE_TE, `L(${fc(FE_C)}) → γ(${fc(FE_E)}) + Fe₃C(${fc(FE_CM)})`], ['eutectoid', FE_TS, `γ(${fc(FE_S)}) → α(${fc(FE_P)}) + Fe₃C(${fc(FE_CM)})`], ['per', FE_TP, `δ(${fc(FE_H)}) + L(${fc(FE_B)}) → γ(${fc(FE_J)})`]];
    for (const [k, tt, fml] of fe) { rows.push([`<a href="${home}tools/iron-carbon-phase-diagram/">Fe–C</a><br><span class="muted">${esc(T[`type_${k}`])}</span>`, `${fT(tt)} ${DEG}`, esc(`${fml} wt% C`)]); csv.push(['Fe-C', k, csvN(tt, 2), fml]); }
    h += `<h3 class="lv-h">${esc(T.h_invlist)}</h3>${tableHTML([T.col_sys, T.col_t, T.col_reaction], rows, 'lv-invl', 'lv-left')}<div class="lv-tools">${csvBtn('inv', ['system', 'type', 'T_C', 'reaction_wt%'], csv)}</div>`;
    // 反応の型
    const sk = {
      eut: '<polyline class="ln" points="6,10 55,52 104,14"/><line class="ln" x1="18" y1="52" x2="94" y2="52"/><text class="sm" x="55" y="22" text-anchor="middle">L</text><text class="sm" x="22" y="68">α</text><text class="sm" x="84" y="68">β</text>',
      eutectoid: '<polyline class="ln" points="6,10 55,52 104,14"/><line class="ln" x1="18" y1="52" x2="94" y2="52"/><text class="sm" x="55" y="22" text-anchor="middle">γ</text><text class="sm" x="22" y="68">α</text><text class="sm" x="84" y="68">β</text>',
      per: '<polyline class="ln" points="6,8 92,40"/><polyline class="ln" points="6,8 22,40"/><line class="ln" x1="22" y1="40" x2="92" y2="40"/><polyline class="ln" points="92,40 106,62"/><polyline class="ln" points="50,40 70,70"/><text class="sm" x="80" y="20">L</text><text class="sm" x="8" y="62">α</text><text class="sm" x="64" y="56">β</text>',
      peritectoid: '<polyline class="ln" points="20,40 92,40"/><polyline class="ln" points="50,40 60,70"/><text class="sm" x="22" y="28">α + β</text><text class="sm" x="70" y="60">γ</text><text class="sm" x="12" y="62">α</text>',
      mono: '<path class="ln" d="M20,46 C30,6 80,6 96,46"/><line class="ln" x1="10" y1="46" x2="96" y2="46"/><text class="sm" x="42" y="38">L₁+L₂</text><text class="sm" x="8" y="30">L₁</text><text class="sm" x="30" y="66">α + L₂</text>',
    };
    const types = ['eut', 'eutectoid', 'per', 'peritectoid', 'mono'];
    h += `<h3 class="lv-h">${esc(T.h_types)}</h3>${tableHTML([T.col_shape, T.col_reaction, T.col_example],
      types.map(k => [`<svg viewBox="0 0 110 74" aria-hidden="true">${sk[k]}</svg>`, `<strong>${esc(T[`type_${k}`])}</strong><br>${esc(T[`rx_${k}`])}`, esc(T[`exm_${k}`])]), 'lv-types', 'lv-left lv-types')}
<p class="lv-note muted">${esc(T.types_note)}</p>`;
    out('panel').innerHTML = `<div class="fig" style="padding: 0; border: 0; background: none">${h}</div>`;
  }

  // ---- 練習 ----
  let Q = null, score = { ok: 0, n: 0 };
  const rnd = Math.random;
  const pickOne = a => a[Math.floor(rnd() * a.length)];
  function newQ() {
    SYS.cuni.useModel('fit'); // 練習の Cu–Ni はいつも正則溶液の線(図もこの線で描く)
    let type = el.pq.value === 'mix' ? pickOne(['point', 'point', 'eut', 'conv', 'dof']) : el.pq.value;
    if (type === 'point') {
      const id = pickOne(SYS_IDS), S = SYS[id];
      const zoom = S.zoom && rnd() < 0.6;
      const p = randomPoint(id, rnd, zoom ? S.zoom : null);
      if (!p) return newQ();
      Q = { type, id, zoom, c: p.c, t: p.t, loc: p.loc };
    } else if (type === 'eut') {
      const id = pickOne(['pbsn', 'alsi', 'agcu', 'alcu']), S = SYS[id];
      let c;
      do { c = Math.round(S.ca + 1 + rnd() * (S.cb - S.ca - 2)); } while (Math.abs(c - S.ce) < 2);
      Q = { type, id, c, t: S.TE };
    } else if (type === 'conv') {
      const id = pickOne(SYS_IDS), S = SYS[id];
      const dir = rnd() < 0.5 ? 'w2a' : 'a2w';
      const v = Math.round(5 + rnd() * (S.x[1] - 10));
      Q = { type, id, dir, v, c: dir === 'w2a' ? v : toWt(S, v), t: S.t[0] + (S.t[1] - S.t[0]) * 0.5 };
    } else {
      const id = pickOne(SYS_IDS.filter(i => SYS[i].type !== 'iso').concat(['cuni'])), S = SYS[id];
      const inv = invariant(S);
      if (inv && rnd() < 0.3) { const c = Math.round(inv.lo + 1 + rnd() * (inv.hi - inv.lo - 2)); Q = { type, id, c, t: inv.t }; }
      else if (rnd() < 0.5) { const p = randomPoint(id, rnd); if (!p) return newQ(); Q = { type, id, c: p.c, t: p.t }; }
      else {
        const R = regions(S), keys = Object.keys(R).filter(k => R[k].ph.length === 1 && (k !== 'b' || !S.pure));
        let found = null;
        for (let i = 0; i < 200 && !found; i++) {
          const k = pickOne(keys), r = R[k], lo = Math.max(r.lo, S.t[0]), hi = Math.min(r.hi, S.t[1]), t = Math.round(lo + rnd() * (hi - lo));
          const l = r.l(t), rr = r.r(t);
          if (rr - l < (S.x[1] - S.x[0]) * 0.06) continue;
          const c = Math.round(l + (rr - l) * (0.2 + 0.6 * rnd()));
          const loc = locate(id, c, t);
          if (loc && !loc.inv && loc.key === k) found = { type, id, c, t };
        }
        if (!found) { const p = randomPoint(id, rnd); if (!p) return newQ(); found = { type, id, c: p.c, t: p.t }; }
        Q = found;
      }
    }
    Q.answered = false;
  }
  function viewPractice(st) {
    if (!Q || Q.pqSel !== el.pq.value) { newQ(); Q.pqSel = el.pq.value; }
    const S = SYS[Q.id];
    if (S.type === 'iso') S.useModel('fit');
    const st2 = { ...st, id: Q.id, S, unit: 'wt', c: Q.c, t: Q.t, zoom: !!Q.zoom, mode: 'practice' };
    const loc = locate(Q.id, Q.c, Q.t);
    const showTie = Q.answered && loc && !loc.inv && loc.phases.length === 2;
    const showPt = Q.type !== 'conv';
    mountChart(diagramSVG(st2, { point: showPt ? [Q.c, Q.t] : null, tie: showTie ? [loc.phases[0][1], loc.phases[1][1], Q.t] : null, region: Q.answered && loc && !loc.inv ? loc.key : null }), st2,
      esc(tx('cap_practice', { s: sysName(S) })));
    out('chart').querySelector('.lv-fig')?.classList.add('lv-practice');
    const nm = `${sysName(S)}`;
    let h = `<p class="lv-score" data-out="lv-score">${esc(tx('score', { ok: score.ok, n: score.n }))}</p>`;
    const inp = (name, label, extra = '') => `<label><span>${esc(label)}</span><input name="${name}" type="number" inputmode="decimal" step="any" autocomplete="off" ${extra}></label>`;
    if (Q.type === 'point') {
      const R = regions(S), opts = Object.keys(R).map(k => `<option value="${k}">${esc(regLabel(S, k))}</option>`).join('');
      h += `<p>${esc(tx('q_point', { s: nm, c: num(Q.c, 3), B: S.B, t: fT(Q.t) }))}</p>
<div class="lv-q"><label><span>${esc(T.q_region)}</span><select name="qr"><option value="">–</option>${opts}</select></label>${inp('q1', T.q_c_left)}${inp('q2', T.q_c_right)}${inp('qw', T.q_w_left)}</div>`;
    } else if (Q.type === 'eut') {
      const prim = Q.c < S.ce ? S.ph.a : S.ph.b;
      h += `<p>${esc(tx('q_eut', { s: nm, c: num(Q.c, 3), B: S.B, t: fT(S.TE), ca: fc(S.ca), ce: fc(S.ce), cb: fc(S.cb), a: S.ph.a, b: S.ph.b, p: prim }))}</p>
<div class="lv-q">${inp('q1', tx('q_prim', { p: prim }))}${inp('q2', T.q_eutf)}${inp('qw', tx('q_total_a', { a: S.ph.a }))}</div>`;
    } else if (Q.type === 'conv') {
      h += `<p>${esc(tx(Q.dir === 'w2a' ? 'q_w2a' : 'q_a2w', { s: nm, v: num(Q.v, 3), A: S.A, B: S.B, MA: num(MW[S.A], 5), MB: num(MW[S.B], 5) }))}</p><div class="lv-q">${inp('q1', Q.dir === 'w2a' ? T.q_at : T.q_wt)}</div>`;
    } else {
      h += `<p>${esc(tx('q_dof', { s: nm, c: num(Q.c, 3), B: S.B, t: fT(Q.t) }))}</p><div class="lv-q">${inp('q1', T.q_p, 'min="1" max="3" step="1"')}${inp('q2', T.q_f, 'min="0" max="3" step="1"')}</div>`;
    }
    h += `<div class="lv-tools"><button type="button" class="btn btn-primary" id="lv-check"${Q.answered ? ' disabled' : ''}>${esc(T.check)}</button><button type="button" class="btn btn-ghost" id="lv-next">${esc(T.next)}</button></div><div id="lv-result" aria-live="polite">${Q.resultHTML ?? ''}</div>`;
    out('panel').innerHTML = h;
    // 答えた値を戻す(図を描き直しても消えないように)
    if (Q.inputs) for (const [k, v] of Object.entries(Q.inputs)) { const e = out('panel').querySelector(`[name="${k}"]`); if (e) e.value = v; }
    document.getElementById('lv-next').addEventListener('click', () => { newQ(); Q.pqSel = el.pq.value; update(true); });
    document.getElementById('lv-check').addEventListener('click', checkQ);
  }
  function checkQ() {
    if (!Q) return;
    const S = SYS[Q.id], pnl = out('panel');
    const g = k => { const e = pnl.querySelector(`[name="${k}"]`); if (!e) return NaN; const v = String(e.value).trim().replace(',', '.'); return v === '' ? NaN : Number(v); };
    Q.inputs = Object.fromEntries([...pnl.querySelectorAll('.lv-q [name]')].map(e => [e.name, e.value]));
    const mark = ok => `<span class="${ok ? 'lv-ok' : 'lv-ng'}">${ok ? '✓' : '✗'}</span>`;
    const span = (Q.zoom ? S.zoom.x[1] - S.zoom.x[0] : S.x[1] - S.x[0]);
    let lines = [], allOk = true, steps = '';
    if (Q.type === 'point') {
      const loc = Q.loc, [[p1, c1, w1], [p2, c2]] = loc.phases;
      const reg = pnl.querySelector('[name="qr"]').value;
      const okR = reg === loc.key, tolC = Math.max(0.25, span * 0.03); // 目盛りの幅の 3 %(拡大表示の Al–Cu では ±0.25 wt%)
      const u1 = g('q1'), u2 = g('q2'), uw = g('qw') / 100;
      const okC1 = Math.abs(u1 - c1) <= tolC, okC2 = Math.abs(u2 - c2) <= tolC;
      // 割合: 正しい値に近いか、自分で読んだ組成から正しく計算できていれば正解
      const own = Number.isFinite(u1) && Number.isFinite(u2) && u2 !== u1 ? lever(Q.c, u1, u2) : NaN;
      const okW = Math.abs(uw - w1) <= 0.05 || (okC1 && okC2 && Math.abs(uw - own) <= 0.015);
      allOk = okR && okC1 && okC2 && okW;
      lines = [`${mark(okR)} ${esc(T.q_region)}: ${esc(regLabel(S, loc.key))}`,
        `${mark(okC1)} C(${esc(PH(S, p1))}) = ${fc(c1)} wt% (${esc(tx('tol', { v: num(tolC, 2) }))})`,
        `${mark(okC2)} C(${esc(PH(S, p2))}) = ${fc(c2)} wt%`,
        `${mark(okW)} W(${esc(PH(S, p1))}) = ${fp(w1)}${Number.isFinite(own) ? ` (${esc(tx('own', { w: fp(own) }))})` : ''}`];
      steps = leverSteps({ S, unit: 'wt', c: Q.c, m: 0 }, loc.phases, Q.t);
    } else if (Q.type === 'eut') {
      const { ca, ce, cb } = S;
      const wp = Q.c < ce ? lever(Q.c, ca, ce) : 1 - lever(Q.c, ce, cb), wa = lever(Q.c, ca, cb);
      const ok1 = Math.abs(g('q1') / 100 - wp) <= 0.011, ok2 = Math.abs(g('q2') / 100 - (1 - wp)) <= 0.011, ok3 = Math.abs(g('qw') / 100 - wa) <= 0.011;
      allOk = ok1 && ok2 && ok3;
      const prim = Q.c < ce ? S.ph.a : S.ph.b;
      lines = [`${mark(ok1)} ${esc(tx('q_prim', { p: prim }))}: ${fp(wp)}`, `${mark(ok2)} ${esc(T.q_eutf)}: ${fp(1 - wp)}`, `${mark(ok3)} ${esc(tx('q_total_a', { a: S.ph.a }))}: ${fp(wa)}`];
      const s1 = Q.c < ce ? tx('st_prim_hypo', { a: S.ph.a, c: fc(Q.c), ca: fc(ca), ce: fc(ce), w: f3(wp) }) : tx('st_prim_hyper', { b: S.ph.b, c: fc(Q.c), cb: fc(cb), ce: fc(ce), w: f3(wp) });
      steps = `<ol class="lv-steps"><li>${esc(s1)}</li><li>${esc(tx('st_eut', { w: f3(1 - wp) }))}</li><li>${esc(tx('st_total', { a: S.ph.a, b: S.ph.b, c: fc(Q.c), ca: fc(ca), cb: fc(cb), w: f3(wa) }))}</li></ol>`;
    } else if (Q.type === 'conv') {
      const ans = Q.dir === 'w2a' ? toAt(S, Q.v) : toWt(S, Q.v);
      const ok = Math.abs(g('q1') - ans) <= 0.15;
      allOk = ok;
      lines = [`${mark(ok)} ${fc(ans)} ${Q.dir === 'w2a' ? 'at%' : 'wt%'}`];
      steps = `<p class="lv-note">${Q.dir === 'w2a' ? convSteps(S, Q.v) : esc(tx('st_conv_r', { A: S.A, B: S.B, x: fc(Q.v), xa: fc(100 - Q.v), MA: num(MW[S.A], 5), MB: num(MW[S.B], 5), w: fc(ans) }))}</p>`;
    } else {
      const loc = locate(Q.id, Q.c, Q.t), P_ = loc.inv ? 3 : loc.phases.length, F = 3 - P_;
      const ok1 = g('q1') === P_, ok2 = g('q2') === F;
      allOk = ok1 && ok2;
      lines = [`${mark(ok1)} P = ${P_} (${esc(loc.inv ? loc.inv.phases.map(p => PH(S, p[0])).join(' + ') : loc.phases.map(p => PH(S, p[0])).join(' + '))})`, `${mark(ok2)} F = 2 − ${P_} + 1 = ${F}`];
      steps = `<p class="lv-note">${esc(T[`r_f${F}`])}</p>`;
    }
    score.n++; if (allOk) score.ok++;
    Q.answered = true;
    Q.resultHTML = `<div class="lv-box"><p><strong class="${allOk ? 'lv-ok' : 'lv-ng'}">${esc(allOk ? T.correct : T.wrong)}</strong></p><p>${lines.join('<br>')}</p>${steps}</div>`;
    update(true);
  }

  // ---- まとめて描き直す ----
  let last = '';
  function update(force = false) {
    const st = state();
    const key = JSON.stringify([...form.elements].filter(e => e.name).map(e => e.value).concat(out('chart').clientWidth < 440));
    if (!force && key === last) return;
    last = key;
    // モードに合う入力欄だけを出す
    const show = new Set(FIELDS[st.mode] ?? FIELDS.diagram);
    if (st.S.type !== 'iso') show.delete('model');
    if (!st.S.zoom) show.delete('view');
    for (const e of form.elements) if (e.name && e.name !== 'mode') e.closest('label').hidden = !show.has(e.name);
    for (const b of tabs.querySelectorAll('[data-mode]')) b.setAttribute('aria-selected', String(b.dataset.mode === st.mode));
    if (st.mode !== 'cool' && playTimer) { clearInterval(playTimer); playTimer = null; }
    if (st.mode === 'cool') viewCool(st);
    else if (st.mode === 'rule') viewRule(st);
    else if (st.mode === 'practice') viewPractice(st);
    else viewDiagram(st);
  }
  // 系を変えたら、その系の最初の例の点へ。単位を変えたら組成を換算する
  let prevUnit = el.unit.value;
  form.addEventListener('change', e => {
    if (e.target === el.sys) {
      const S = SYS[el.sys.value], [c, t] = S.ex[0];
      el.c.value = String(el.unit.value === 'at' ? Math.round(toAt(S, c) * 100) / 100 : c);
      el.t.value = String(t);
      if (!S.zoom) el.view.value = 'full';
    }
    if (e.target === el.unit && el.unit.value !== prevUnit) {
      const S = SYS[el.sys.value], v = numv('c', 0);
      el.c.value = String(Math.round((el.unit.value === 'at' ? toAt(S, v) : toWt(S, v)) * 100) / 100);
      prevUnit = el.unit.value;
    }
    update();
  });
  form.addEventListener('input', () => update());
  form.addEventListener('submit', e => e.preventDefault());
  if (window.ResizeObserver) new ResizeObserver(() => update()).observe(out('chart'));
  update(true);
}
