// 結晶構造ビューア。単位格子を立体の図(SVG、正射影)で描き、ドラッグ・スワイプ・ボタンで回す。
// 構造: 単純立方(sc)・体心立方(bcc)・面心立方(fcc)・六方最密(hcp、六角柱)・ダイヤモンド構造(diamond)。
// 長さは a = 1 の単位で計算する(六方最密は c = c/a)。立方晶の原子とすき間の位置は 4 倍した整数で持ち、
// 面の上にあるか・辺や角にあるかの判定に丸めの誤差が入らないようにする。
// 値の検算は review の scripts/check_xtal.py(python で別に計算し、教科書の値と、この JS の値と突き合わせる)
import { num } from './eng.js';

const S3 = Math.sqrt(3);
export const IDEAL_CA = Math.sqrt(8 / 3);
export const CUBIC = ['sc', 'bcc', 'fcc', 'diamond'];

// ---- 立方晶の原子の位置(4 倍した整数) ----
const FCC4 = [[0, 0, 0], [2, 2, 0], [2, 0, 2], [0, 2, 2]];
export const BASIS4 = { sc: [[0, 0, 0]], bcc: [[0, 0, 0], [2, 2, 2]], fcc: FCC4, diamond: [...FCC4, ...FCC4.map(p => p.map(x => x + 1))] };
// ブラベー格子の基本並進ベクトル(4 倍)と基本の単位胞の体積(a³ の単位)。ダイヤモンドは FCC の格子に2個の原子の組
const PRIM4 = { sc: [[[4, 0, 0], [0, 4, 0], [0, 0, 4]], 1], bcc: [[[4, 0, 0], [0, 4, 0], [2, 2, 2]], 1 / 2], fcc: [[[2, 2, 0], [2, 0, 2], [0, 2, 2]], 1 / 4] };
PRIM4.diamond = PRIM4.fcc;
const LATT4 = { sc: BASIS4.sc, bcc: BASIS4.bcc, fcc: FCC4, diamond: FCC4 };
const MOTIF4 = { sc: [[0, 0, 0]], bcc: [[0, 0, 0]], fcc: [[0, 0, 0]], diamond: [[0, 0, 0], [1, 1, 1]] };
const mod = (x, m) => ((x % m) + m) % m;
const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
const dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
const sub = (p, q) => [p[0] - q[0], p[1] - q[1], p[2] - q[2]];
const add = (p, q) => [p[0] + q[0], p[1] + q[1], p[2] + q[2]];
const mul = (p, s) => [p[0] * s, p[1] * s, p[2] * s];
const len = p => Math.hypot(p[0], p[1], p[2]);
const cross = (p, q) => [p[1] * q[2] - p[2] * q[1], p[2] * q[0] - p[0] * q[2], p[0] * q[1] - p[1] * q[0]];
// 境界にある座標の数から、位置の種類と単位格子に属する割合: 角 1/8、辺 1/4、面 1/2、内部 1
const SITE = ['in', 'face', 'edge', 'corner'];
const site4 = P => P.filter(x => x === 0 || x === 4).length;

// -1〜2 の範囲の単位胞の原子(4 倍の整数)。すき間のまわりの原子や配位数を数えるのに使う
function near4(st, lo = -1, hi = 2) {
  const out = [];
  for (let i = lo; i < hi; i++) for (let j = lo; j < hi; j++) for (let k = lo; k < hi; k++)
    for (const b of BASIS4[st]) out.push([b[0] + 4 * i, b[1] + 4 * j, b[2] + 4 * k]);
  return out;
}
const inCell4 = P => P.every(x => x >= 0 && x <= 4);

// 単位格子の中(境界を含む)の原子
export function cellAtoms(st, ca = IDEAL_CA) {
  if (st === 'hcp') return hcpAtoms(ca);
  return near4(st, 0, 2).filter(inCell4).map(P => ({ P, p: P.map(x => x / 4), site: SITE[site4(P)], w: 1 / 2 ** site4(P) }));
}
// 六方最密の六角柱: 上下の面の頂点 12 × 1/6、面の中心 2 × 1/2、中ほどの層の 3 個
function hcpAtoms(ca) {
  const out = [];
  for (const z of [0, ca]) {
    out.push({ p: [0, 0, z], site: 'face', w: 1 / 2 });
    for (let k = 0; k < 6; k++) out.push({ p: [Math.cos(k * Math.PI / 3), Math.sin(k * Math.PI / 3), z], site: 'corner', w: 1 / 6 });
  }
  for (const t of [30, 150, 270]) out.push({ p: [Math.cos(t * Math.PI / 180) / S3, Math.sin(t * Math.PI / 180) / S3, ca / 2], site: 'in', w: 1 });
  return out;
}
// 六方最密の原子(六角柱のまわりまで広げたもの)
function hcpNear(ca) {
  const out = [], b = [Math.cos(Math.PI / 6) / S3, Math.sin(Math.PI / 6) / S3];
  for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) for (let k = -1; k <= 2; k++) {
    const x = i - j / 2, y = j * S3 / 2;
    out.push([x, y, k * ca], [x + b[0], y + b[1], k * ca + ca / 2]);
  }
  return out;
}

// 単位格子の値: 原子数・配位数・充填率・原子半径(a の単位)・最近接距離
export function cellInfo(st, ca = IDEAL_CA) {
  const atoms = cellAtoms(st, ca);
  const n = atoms.reduce((s, x) => s + x.w, 0);
  const groups = {};
  for (const x of atoms) (groups[x.site] ??= { count: 0, w: x.w }).count++;
  if (st === 'hcp') {
    const d1 = 1, d2 = Math.sqrt(1 / 3 + ca * ca / 4), d = Math.min(d1, d2), r = d / 2;
    const V = 3 * S3 / 2 * ca;
    return { n, groups, cn: 12, r, nn: d, d1, d2, apf: n * 4 / 3 * Math.PI * r ** 3 / V, V };
  }
  const ds = near4(st, -2, 3).filter(P => P.some(x => x)).map(P => len(P) / 4).sort((a, b) => a - b);
  const d = ds[0], cn = ds.filter(x => Math.abs(x - d) < 1e-9).length, r = d / 2;
  return { n, groups, cn, r, nn: d, apf: n * 4 / 3 * Math.PI * r ** 3, V: 1 };
}

// ---- すき間 ----
// 立方晶: 位置は 4 倍の整数の格子 0〜4 から条件で選ぶ。SC は体心の立方体のすき間(8配位)だけ。
// ダイヤモンド構造は FCC の八面体位置(体心と稜の中点)と、FCC の四面体位置のうち原子のない4つ。どちらも4個の原子に囲まれる
function cubicVoid4(st, kind) {
  const pts = [];
  for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) for (let k = 0; k <= 4; k++) pts.push([i, j, k]);
  const cnt = (P, f) => P.filter(f).length;
  const bd = x => x === 0 || x === 4, half = x => x === 2, qtr = x => x === 1 || x === 3;
  if (st === 'sc') return kind === 'cube' ? [[2, 2, 2]] : [];
  if (st === 'fcc' || st === 'diamond') {
    if (kind === 'oct') return pts.filter(P => cnt(P, half) === 3 || (cnt(P, half) === 1 && cnt(P, bd) === 2));
    if (kind === 'tet') {
      const occ = new Set(BASIS4[st].map(String));
      return pts.filter(P => P.every(qtr) && !occ.has(String(P)));
    }
  }
  if (st === 'bcc') {
    if (kind === 'oct') return pts.filter(P => (cnt(P, half) === 2 && cnt(P, bd) === 1) || (cnt(P, half) === 1 && cnt(P, bd) === 2));
    if (kind === 'tet') return pts.filter(P => cnt(P, bd) === 1 && cnt(P, half) === 1 && cnt(P, qtr) === 1);
  }
  return [];
}
// 六方最密: 八面体位置は C の位置(z = c/4, 3c/4)、四面体位置は A の位置の z = 3c/8, 5c/8 と B の位置の z = c/8, 7c/8
function hcpVoids(ca, kind) {
  const out = [], at = (t, rr, z, w) => out.push({ p: [rr * Math.cos(t * Math.PI / 180), rr * Math.sin(t * Math.PI / 180), z], w });
  if (kind === 'oct') for (const z of [ca / 4, 3 * ca / 4]) for (const t of [90, 210, 330]) at(t, 1 / S3, z, 1);
  if (kind === 'tet') {
    for (const z of [3 * ca / 8, 5 * ca / 8]) { at(0, 0, z, 1); for (let k = 0; k < 6; k++) at(60 * k, 1, z, 1 / 3); }
    for (const z of [ca / 8, 7 * ca / 8]) for (const t of [30, 150, 270]) at(t, 1 / S3, z, 1);
  }
  return out;
}
export const voidKinds = st => (st === 'sc' ? ['cube'] : ['oct', 'tet']);
// すき間の位置・数・入る球の半径比(すき間の中心から最も近い原子までの距離 − r)/r
export function voidInfo(st, kind, ca = IDEAL_CA) {
  const { r } = cellInfo(st, ca);
  const list = st === 'hcp' ? hcpVoids(ca, kind) : cubicVoid4(st, kind).map(P => ({ p: P.map(x => x / 4), w: 1 / 2 ** site4(P) }));
  const atoms = st === 'hcp' ? hcpNear(ca) : near4(st).map(P => P.map(x => x / 4));
  const dists = p => atoms.map(q => len(sub(q, p))).sort((a, b) => a - b);
  let ratio = Infinity;
  for (const v of list) ratio = Math.min(ratio, dists(v.p)[0] / r - 1);
  const n = list.reduce((s, v) => s + v.w, 0);
  const info = { list, n, ratio, perAtom: n / cellInfo(st, ca).n };
  if (st === 'bcc' && kind === 'oct') { const ds = dists(list[0].p); info.short = ds[0]; info.long = ds[2]; info.ratioLong = ds[2] / r - 1; }
  return info;
}
// 図で囲む原子を示す代表のすき間と、そのまわりの原子(単位格子の外のものも含む)
const REP = { 'fcc-oct': [2, 2, 2], 'fcc-tet': [1, 1, 1], 'bcc-oct': [2, 2, 4], 'bcc-tet': [2, 1, 4], 'sc-cube': [2, 2, 2], 'diamond-oct': [2, 2, 2], 'diamond-tet': [3, 3, 3] };
export function voidRep(st, kind, ca = IDEAL_CA) {
  let p, atoms;
  if (st === 'hcp') {
    p = kind === 'oct' ? [Math.cos(-Math.PI / 6) / S3, Math.sin(-Math.PI / 6) / S3, 3 * ca / 4] : [0, 0, 5 * ca / 8];
    atoms = hcpNear(ca);
  } else {
    p = REP[`${st}-${kind}`].map(x => x / 4);
    atoms = near4(st).map(P => P.map(x => x / 4));
  }
  const k = kind === 'cube' ? 8 : kind === 'tet' || st === 'diamond' ? 4 : 6;
  const ds = atoms.map(q => ({ q, d: len(sub(q, p)) })).sort((a, b) => a.d - b.d).slice(0, k);
  return { p, nb: ds.map(x => ({ q: x.q, d: x.d, short: x.d < ds[0].d * (1 + 1e-6) })) };
}

// ---- 面(立方晶) ----
// 切片の取り方: 負の指数の軸では原点を 1 へ移す(O′)。面は h·x = c(c = 1 + Σ 負の指数)
export function planeValue(hkl) {
  const O = hkl.map(x => (x < 0 ? 1 : 0));
  return { c: 1 + dot(hkl, O), O };
}
// 立方体 [0,1]³ と面 h·x = c の切り口(凸多角形の頂点を面の中の向きで並べたもの)
export function section(hkl, c) {
  const vs = [];
  for (let ax = 0; ax < 3; ax++) {
    if (!hkl[ax]) continue;
    const o = [0, 1, 2].filter(i => i !== ax);
    for (const a of [0, 1]) for (const b of [0, 1]) {
      const t = (c - hkl[o[0]] * a - hkl[o[1]] * b) / hkl[ax];
      if (t < -1e-12 || t > 1 + 1e-12) continue;
      const p = [0, 0, 0]; p[o[0]] = a; p[o[1]] = b; p[ax] = Math.min(1, Math.max(0, t));
      if (!vs.some(v => len(sub(v, p)) < 1e-9)) vs.push(p);
    }
  }
  if (vs.length < 3) return [];
  const cx = mul(vs.reduce(add, [0, 0, 0]), 1 / vs.length), n = mul(hkl, 1 / len(hkl));
  const u = mul(sub(vs[0], cx), 1 / len(sub(vs[0], cx))), w = cross(n, u);
  return vs.sort((p, q) => Math.atan2(dot(sub(p, cx), w), dot(sub(p, cx), u)) - Math.atan2(dot(sub(q, cx), w), dot(sub(q, cx), u)));
}
const polyArea = vs => len(vs.reduce((s, p, i) => add(s, cross(p, vs[(i + 1) % vs.length])), [0, 0, 0])) / 2;
// 切り口に対する点の位置: 角(内角/360°の割合)、辺(1/2)、内側(1)、外(null)
function classify(p, vs) {
  const k = vs.length;
  for (let i = 0; i < k; i++) {
    if (len(sub(p, vs[i])) < 1e-9) {
      const a = sub(vs[(i + k - 1) % k], p), b = sub(vs[(i + 1) % k], p);
      return { kind: 'corner', f: Math.acos(Math.max(-1, Math.min(1, dot(a, b) / (len(a) * len(b))))) / (2 * Math.PI) };
    }
  }
  let ref = null;
  for (let i = 0; i < k; i++) {
    const A = vs[i], B = vs[(i + 1) % k], cr = cross(sub(B, A), sub(p, A));
    if (len(cr) < 1e-9) {
      const t = dot(sub(p, A), sub(B, A)) / dot(sub(B, A), sub(B, A));
      return t >= -1e-9 && t <= 1 + 1e-9 ? { kind: 'edge', f: 1 / 2 } : null;
    }
    if (ref && dot(ref, cr) < 0) return null;
    ref ??= cr;
  }
  return { kind: 'in', f: 1 };
}
// 面の値: 切り口の多角形と面積、切り口の中の原子(角・辺・内側に分けて)、面全体での平均の面密度(a⁻²)
export function planeInfo(st, hkl) {
  if (!hkl.some(x => x)) return null;
  const { c, O } = planeValue(hkl);
  const vs = section(hkl, c), area = polyArea(vs);
  const on = [], parts = { corner: [], edge: 0, in: 0 };
  for (const a of cellAtoms(st)) {
    if (dot(hkl, a.P) !== 4 * c) continue;
    const k = classify(a.p, vs);
    if (!k) continue;
    on.push(a.p);
    if (k.kind === 'corner') parts.corner.push(k.f); else parts[k.kind]++;
  }
  const nCell = parts.corner.reduce((s, x) => s + x, 0) + parts.edge / 2 + parts.in;
  // 面全体の平均: 格子の面 h·x = (整数)×s の上に、基本の単位胞 V_p·|h|/s の面積ごとに、条件に合う原子の組の数 N_c 個
  const [vecs, Vp] = PRIM4[st];
  const s4 = vecs.map(v => dot(hkl, v)).reduce((g, x) => gcd(g, x), 0);
  const Nc = MOTIF4[st].filter(b => mod(dot(hkl, b) - 4 * c, s4) === 0).length;
  const pd = Nc * (s4 / 4) / (Vp * len(hkl));
  const n2 = dot(hkl, hkl);
  return { c, O, verts: vs, area, on, parts, nCell, pdCell: nCell / area, pd, n2, same: Math.abs(nCell / area - pd) < 1e-9 };
}
// 隣の面(h·x = c ± 1)の切り口。面間隔 d の目安として破線で描く
export const neighborSections = (hkl, c) => [c - 1, c + 1].map(v => section(hkl, v)).filter(v => v.length >= 3);

// ---- 方向(立方晶) ----
// 線密度: 原点を通る [uvw] の線の上にある原子。最短の格子の並進 p の長さの中の原子の数 / |p|(a⁻¹)
export function lineInfo(st, uvw) {
  if (!uvw.some(x => x)) return null;
  const g = uvw.reduce((s, x) => gcd(s, x), 0), n = uvw.map(x => x / g);
  const inL = (P, list) => list.some(b => P.every((x, i) => mod(x - b[i], 4) === 0));
  let m = 1;
  while (m < 4 && !inL(n.map(x => m * x), LATT4[st])) m++;
  // 線の上の点 (k/4)·n(k = 0 … m−1)が原子か(原子の位置は格子 + 原子の組)
  const atoms = LATT4[st].flatMap(L => MOTIF4[st].map(M => add(L, M)));
  let cnt = 0;
  for (let k = 0; k < m; k++) if (inL(n.map(x => k * x), atoms)) cnt++;
  const L = m / 4 * len(n);
  return { n, cnt, L, ld: cnt / L };
}
// 方向の矢印: 負の成分の軸では始点を 1 にし、いちばん大きい成分が 1 になるまで進む
export function dirArrow(uvw) {
  const O = uvw.map(x => (x < 0 ? 1 : 0)), m = Math.max(...uvw.map(Math.abs));
  return [O, add(O, mul(uvw, 1 / m))];
}
// 面の中にある方向の矢印: 面の上の原子を通り、方向に平行な線のうち原子の多いもの(同じなら切り口の中心に近いもの)を、
// 単位格子の中で切り取った線分
export function arrowInPlane(pl, uvw) {
  const n = mul(uvw, 1 / len(uvw));
  const cx = mul(pl.verts.reduce(add, [0, 0, 0]), 1 / pl.verts.length);
  const groups = new Map();
  for (const p of pl.on) {
    const perp = sub(p, mul(n, dot(p, n)));
    const key = perp.map(x => x.toFixed(6)).join();
    if (!groups.has(key)) groups.set(key, { p, k: 0 });
    groups.get(key).k++;
  }
  const dist = p => len(sub(sub(p, cx), mul(n, dot(sub(p, cx), n))));
  const best = [...groups.values()].sort((a, b) => b.k - a.k || dist(a.p) - dist(b.p))[0];
  // 立方体の中にある範囲 t(p0 + t·n)。原子の列が切り口の角をかすめるだけのときは、切り口の中心を通る線にする
  const clip = p0 => {
    let lo = -Infinity, hi = Infinity;
    for (let i = 0; i < 3; i++) {
      if (Math.abs(n[i]) < 1e-12) continue;
      const a = (0 - p0[i]) / n[i], b = (1 - p0[i]) / n[i];
      lo = Math.max(lo, Math.min(a, b)); hi = Math.min(hi, Math.max(a, b));
    }
    return hi - lo > 0.05 ? [add(p0, mul(n, lo)), add(p0, mul(n, hi))] : null;
  };
  return (best && clip(best.p)) || clip(cx);
}

// ---- すべり系 ----
const FCC_P = [[1, 1, 1], [-1, 1, 1], [1, -1, 1], [1, 1, -1]];
const FCC_D = [[1, -1, 0], [1, 0, -1], [0, 1, -1], [1, 1, 0], [1, 0, 1], [0, 1, 1]];
const BCC_P = [[1, 1, 0], [1, -1, 0], [1, 0, 1], [1, 0, -1], [0, 1, 1], [0, 1, -1]];
const BCC_D = [[1, 1, 1], [-1, 1, 1], [1, -1, 1], [1, 1, -1]];
const pairs = (P, D) => P.flatMap(p => D.filter(d => dot(p, d) === 0).map(d => [p, d]));
export const SLIP = {
  fcc: pairs(FCC_P, FCC_D), diamond: pairs(FCC_P, FCC_D), bcc: pairs(BCC_P, BCC_D),
  bccExtra: [[[1, 1, 2], [1, 1, -1]], [[1, 2, 3], [1, 1, -1]]],
};
const famKey = v => v.map(Math.abs).sort((a, b) => a - b).join('');
// この面と方向が、構造の主なすべり系の1つか
export function slipFamily(st, hkl, uvw) {
  if (dot(hkl, uvw) !== 0) return null;
  const g1 = hkl.reduce((s, x) => gcd(s, x), 0), g2 = uvw.reduce((s, x) => gcd(s, x), 0);
  const P = famKey(hkl.map(x => x / g1)), D = famKey(uvw.map(x => x / g2));
  if ((st === 'fcc' || st === 'diamond') && P === '111' && D === '011') return 'fcc';
  if (st === 'bcc' && D === '111' && (P === '011' || P === '112' || P === '123')) return `bcc${P}`;
  return null;
}

// ---- 六方最密の面と方向 ----
// 底面(0001)は上の面、柱面(10-10)は頂点 0° と 60° の間の側面。方向 a₁ [2-1-10]・a₂ [-12-10]・a₃ [-1-120]
export function hcpPlane(kind, ca) {
  if (kind === 'basal') return { verts: Array.from({ length: 6 }, (_, k) => [Math.cos(k * Math.PI / 3), Math.sin(k * Math.PI / 3), ca]), n: [0, 0, 1], c: ca };
  const v0 = [1, 0], v1 = [0.5, S3 / 2];
  return { verts: [[...v0, 0], [...v1, 0], [...v1, ca], [...v0, ca]], n: [S3 / 2, 0.5, 0], c: S3 / 2 };
}
export function hcpPlaneInfo(kind, ca) {
  const { r } = cellInfo('hcp', ca);
  // 底面: 正六角形の面積 3√3/2 a² に、中心 1 + 頂点 6 × 1/3 = 3 個。柱面: a × c の長方形に、角 4 × 1/4 = 1 個
  const pd = kind === 'basal' ? 3 / (3 * S3 / 2) : 1 / ca;
  return { pd, ppf: pd * Math.PI * r * r, d: kind === 'basal' ? ca / 2 : S3 / 2 };
}
const A_DIR = { slip1: 0, slip2: 120, slip3: 240 };
export function hcpArrow(hp, ca) {
  if (hp in A_DIR) {
    const t = A_DIR[hp] * Math.PI / 180, e = [Math.cos(t), Math.sin(t), 0];
    return [[-e[0], -e[1], ca], [e[0], e[1], ca]];
  }
  if (hp === 'pslip') return [[1, 0, ca], [0.5, S3 / 2, ca]];
  return null;
}

// ---- 表示の書き方 ----
// 指数の文字。html なら負の数は数字の上に横棒(線で描く)、文字だけのとき(選択肢・コピー)は用語集と同じく (1-10) のようにマイナスで
// 上線の数字には見えないマイナスを添え、コピー(textContent)や読み上げでは -1 になるようにする
export const idxText = (v, html = false) => v.map(x => (x < 0 ? (html ? `<span class="xt-bar"><span class="xt-cp">-</span>${-x}</span>` : `-${-x}`) : String(x))).join('');
// 割合を分数で(1/6 など。分母 24 まで)、合わなければ小数で
const frac = (x, d = 3) => {
  for (let q = 1; q <= 24; q++) { const p = Math.round(x * q); if (p && Math.abs(p / q - x) < 1e-9) return q === 1 ? String(p) : `${p}/${q}`; }
  return num(x, d);
};
// √ の形: a/√3、a/2 など
const sqrtForm = n2 => { const s = Math.round(Math.sqrt(n2)); return s * s === n2 ? (s === 1 ? 'a' : `a/${s}`) : `a/√${n2}`; };

// ---- 画面 ----
const form = typeof document !== 'undefined' ? document.getElementById('xtal-form') : null;
if (form) {
  const T = JSON.parse(form.dataset.text);
  const el = form.elements;
  const out = k => document.querySelector(`[data-out="${k}"]`);
  // 中身が同じなら書き換えない(入力欄から離れたときの change で作り直すと、押しかけのボタンが消えてクリックが届かないため)
  const put = (k, html) => { const e = out(k); if (e.dataset.html !== html) { e.innerHTML = html; e.dataset.html = html; } };
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const fill = (s, v = {}) => String(s).replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m));
  const home = document.documentElement.dataset.home ?? '/';
  const isCJK = /^(ja|zh|ko)/.test(document.documentElement.lang);
  // SVG の文字のおおよその幅(13px)。全角(ハングルを含む)は 13、半角は 7.6 とみなす
  const tw = str => [...str].reduce((w, c) => w + (/[ᄀ-ᇿ⺀-鿿가-힯豈-￯]/.test(c) ? 13 : /[̀-ͯ]/.test(c) ? 0 : 7.6), 0);
  const nm = x => `${num(x, 4)} nm`;

  const css = document.createElement('style');
  css.textContent = `
#xtal-form { grid-template-columns: repeat(12, minmax(0, 1fr)); }
#xtal-form > h2 { grid-column: 1 / -1; }
#xtal-form > .dy-field { grid-column: span 4; }
#xtal-form > .dy-field.xt-idx { grid-column: span 2; }
/* 広い画面: 選択肢の長い文字(構造の名前、HCP の面とすべり系)が切れないように幅を割り振る。指数の6欄は新しい行から */
@media (min-width: 561px) {
  #xtal-form > .dy-field:has([name="type"]) { grid-column: span 6; }
  #xtal-form > .dy-field:has([name="a"]), #xtal-form > .dy-field:has([name="ca"]) { grid-column: span 3; }
  #xtal-form > .dy-field:has([name="atom"]) { grid-column: 1 / span 4; }
  #xtal-form > .dy-field:has([name="void"]) { grid-column: span 3; }
  #xtal-form > .dy-field:has([name="show"]), #xtal-form > .dy-field:has([name="hp"]) { grid-column: span 5; }
  #xtal-form > .dy-field:has([name="h"]) { grid-column: 1 / span 2; }
}
@media (max-width: 560px) { #xtal-form > .dy-field { grid-column: span 6; } #xtal-form > .dy-field.xt-idx { grid-column: span 4; } #xtal-form > .dy-field:has(select), #xtal-form > .dy-field.xt-mid { grid-column: 1 / -1; } }
.xt-bar { text-decoration: overline; }
.xt-cp { font-size: 0; }
.xt-fig { margin: 0 0 10px; padding: 6px; }
.xt-fig svg { max-width: 560px; touch-action: pan-y pinch-zoom; cursor: grab; user-select: none; -webkit-user-select: none; }
.xt-fig svg:active { cursor: grabbing; }
.xt-ctl { display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; margin: 8px 0 0; }
.xt-ctl .btn { min-height: 36px; padding: 0 12px; font-size: .85rem; }
.xt-ctl .btn[aria-pressed="true"] { border-color: var(--accent); background: var(--accent-soft); }
.xt-legend { display: flex; flex-wrap: wrap; justify-content: center; gap: 4px 14px; margin: 8px 0 0; padding: 0; list-style: none; font-size: .82rem; color: var(--muted); }
.xt-legend li { display: inline-flex; align-items: center; gap: 5px; }
.xt-fig .xt-legend svg { width: 16px; height: 16px; margin: 0; display: inline-block; flex: none; }
.xt-sub { display: block; margin-top: 2px; font-size: .8rem; font-weight: 400; color: var(--muted); line-height: 1.5; }
.xt-note { font-size: .88rem; margin: 6px 0 0; }
.xt-warn { font-size: .9rem; margin: 6px 0; padding: 8px 10px; border-radius: 8px; background: var(--ng-bg); color: var(--text); }
.xt-slips { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0; }
.xt-slips .btn { min-height: 34px; padding: 0 10px; font-size: .85rem; font-variant-numeric: tabular-nums; }
.xt-slips .btn[aria-pressed="true"] { border-color: var(--accent); background: var(--accent-soft); }
.xt-void th, .xt-void td { white-space: normal; overflow-wrap: normal; word-break: normal; }
.xt-void th[scope="row"] { width: 34%; }
.xt-void td { text-align: right; }
.xt-void th[scope="row"] { text-align: left; }
@media (max-width: 480px) { .xt-void th, .xt-void td { padding: 6px 5px; font-size: .85rem; } }
.xt-void thead th { hyphens: auto; }
:lang(ko) .xt-void th, :lang(ko) .xt-void td { word-break: keep-all; }
@media (max-width: 480px) { .xt-void thead th { font-size: .75rem; } .xt-void th[scope="row"] { width: 30%; } }
`;
  document.head.append(css);
  // 入力欄の幅: 指数の6つの欄は狭く
  for (const n of ['h', 'k', 'l', 'u', 'v', 'w']) el[n].closest('label').classList.add('xt-idx');
  for (const n of ['void', 'show']) el[n].closest('label').classList.add('xt-mid');
  for (const s of form.querySelectorAll('select')) { s.style.fontSize = '.92rem'; s.style.paddingLeft = s.style.paddingRight = '6px'; }

  // 図の枠(SVG と回すボタン)は一度だけ作る(ドラッグの途中で作り直さない)
  const box = out('view');
  const B = (k, label, aria) => `<button type="button" class="btn btn-ghost" data-rot="${k}"${aria ? ` aria-label="${esc(aria)}"` : ''}>${esc(label)}</button>`;
  box.innerHTML = `<div class="fig xt-fig"><svg data-xt="svg" viewBox="0 0 520 420" role="img" tabindex="0"></svg><ul class="xt-legend" data-xt="legend"></ul></div>
<div class="xt-ctl" role="group" aria-label="${esc(T.rot_label)}">${B('left', '◀', T.rot_left)}${B('right', '▶', T.rot_right)}${B('up', '▲', T.rot_up)}${B('down', '▼', T.rot_down)}<span data-xt="views" style="display: contents"></span>${B('reset', T.view_reset)}</div>
<p class="muted xt-note" data-xt="hint">${esc(T.hint_rotate)}</p>
<div class="xt-ctl" data-xt="ex" role="group" aria-label="${esc(T.ex_label)}"></div>`;
  const svg = box.querySelector('[data-xt="svg"]');
  const part = k => box.querySelector(`[data-xt="${k}"]`);
  const DEF = { az: 20, el: 20 };
  const view = { ...DEF };
  // 例の元素(周期表ツールと同じ 25 °C の格子定数、ASM の表)
  const EX = [['Fe', 'bcc', 0.28665], ['Cu', 'fcc', 0.36146], ['Al', 'fcc', 0.40496], ['Mg', 'hcp', 0.32094, 0.52107], ['Ti', 'hcp', 0.29506, 0.46835], ['Zn', 'hcp', 0.26649, 0.49468], ['Si', 'diamond', 0.54306]];
  part('ex').innerHTML = `<span class="muted" style="align-self: center; font-size: .85rem">${esc(T.ex_label)}</span>` + EX.map(([s, t, a, c], i) =>
    `<button type="button" class="btn btn-ghost" data-ex="${i}" title="${esc(`a = ${num(a, 5)} nm${c ? `, c = ${num(c, 5)} nm` : ''}`)}">${esc(fill(T.ex_fmt, { s, t: T[`short_${t}`] }))}</button>`).join('');

  // 状態
  const ints = n => { const v = Math.round(Number(el[n].value)); return Number.isFinite(v) && String(el[n].value).trim() !== '' ? Math.max(-9, Math.min(9, v)) : null; };
  function state() {
    const st = el.type.value;
    const a = Number(el.a.value) > 0 ? Number(el.a.value) : Number(el.a.defaultValue);
    const caIn = Number(el.ca.value);
    const ca = caIn >= 1 && caIn <= 3 ? caIn : IDEAL_CA;
    const hkl = ['h', 'k', 'l'].map(ints), uvw = ['u', 'v', 'w'].map(ints);
    return { st, a, ca, caIn, caOk: caIn >= 1 && caIn <= 3, atom: el.atom.value, vd: el.void.value, show: el.show.value, hp: el.hp.value, hkl, uvw, hklOk: hkl.every(x => x != null), uvwOk: uvw.every(x => x != null) };
  }

  // 入力欄の出し分け
  function fields(s) {
    const hcp = s.st === 'hcp';
    const vis = { ca: hcp, hp: hcp, show: !hcp, h: !hcp && /plane|both/.test(s.show), u: !hcp && /dir|both/.test(s.show) };
    for (const n of ['k', 'l']) vis[n] = vis.h;
    for (const n of ['v', 'w']) vis[n] = vis.u;
    for (const [n, v] of Object.entries(vis)) el[n].closest('label').hidden = !v;
  }

  // ---- 図のもとになる立体の組み立て ----
  function model(s) {
    const m = { atoms: [], edges: [], bonds: [], voids: [], rep: null, plane: null, nplanes: [], arrow: null, axes: [], labels: [] };
    const info = cellInfo(s.st, s.ca);
    m.info = info;
    if (s.st === 'hcp') {
      const ca = s.ca, hex = z => Array.from({ length: 6 }, (_, k) => [Math.cos(k * Math.PI / 3), Math.sin(k * Math.PI / 3), z]);
      const lo = hex(0), up = hex(ca);
      for (let k = 0; k < 6; k++) m.edges.push([lo[k], lo[(k + 1) % 6]], [up[k], up[(k + 1) % 6]], [lo[k], up[k]]);
      m.center = [0, 0, ca / 2];
      m.atoms = cellAtoms('hcp', ca);
      m.axes = [[[1, 0, 0], [1.3, 0, 0], 'a₁'], [[-0.5, S3 / 2, 0], [-0.65, 1.3 * S3 / 2, 0], 'a₂'], [[0, 0, ca], [0, 0, ca + 0.32], 'c']];
      m.origin = [0, 0, 0];
      // 基本の単位胞(底面がひし形)を破線で
      if (s.atom === 'point') {
        const rh = [[0, 0], [1, 0], [0.5, S3 / 2], [-0.5, S3 / 2]];
        for (let k = 0; k < 4; k++) {
          const p = rh[k], q = rh[(k + 1) % 4];
          m.edges.push({ p: [...p, 0], q: [...q, 0], dash: true }, { p: [...p, ca], q: [...q, ca], dash: true });
        }
        m.edges.push({ p: [0, 0, 0], q: [0, 0, ca], dash: true }, { p: [0.5, S3 / 2, 0], q: [0.5, S3 / 2, ca], dash: true });
      }
    } else {
      const C = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 1, 0], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
      for (const p of C) for (const q of C) if (dot(sub(q, p), [1, 1, 1]) === 1 && len(sub(q, p)) === 1) m.edges.push([p, q]);
      m.center = [0.5, 0.5, 0.5];
      m.atoms = cellAtoms(s.st);
      m.axes = [[[1, 0, 0], [1.28, 0, 0], 'x'], [[0, 1, 0], [0, 1.28, 0], 'y'], [[0, 0, 1], [0, 0, 1.28], 'z']];
      m.origin = [0, 0, 0];
      if (s.st === 'diamond') {
        const ins = m.atoms.filter(a => a.site === 'in');
        for (const p of ins) for (const q of m.atoms) if (q !== p && Math.abs(len(sub(q.p, p.p)) - info.nn) < 1e-9) m.bonds.push([p.p, q.p]);
      }
    }
    // すき間
    if (s.vd !== 'none') {
      const kinds = s.st === 'sc' ? ['cube'] : s.vd === 'both' ? ['oct', 'tet'] : [s.vd];
      for (const k of kinds) {
        const vi = voidInfo(s.st, k, s.ca);
        for (const v of vi.list) m.voids.push({ p: v.p, kind: k, ratio: vi.ratio });
      }
      if (kinds.length === 1) m.rep = { ...voidRep(s.st, kinds[0], s.ca), kind: kinds[0] };
    }
    // 面と方向
    if (s.st === 'hcp') {
      const pk = s.hp === 'basal' || s.hp in A_DIR ? 'basal' : s.hp === 'prism' || s.hp === 'pslip' ? 'prism' : null;
      if (pk) {
        const pl = hcpPlane(pk, s.ca);
        m.plane = { verts: pl.verts, n: pl.n, c: pl.c };
        m.onPlane = p => Math.abs(dot(pl.n, p) - pl.c) < 1e-9;
      }
      const ar = hcpArrow(s.hp, s.ca);
      if (ar) m.arrow = ar;
    } else {
      const wantP = /plane|both/.test(s.show) && s.hklOk, wantD = /dir|both/.test(s.show) && s.uvwOk;
      const pl = wantP ? planeInfo(s.st, s.hkl) : null;
      if (pl && pl.verts.length >= 3) {
        m.plane = { verts: pl.verts, n: s.hkl, c: pl.c, O: pl.O };
        m.onPlane = p => Math.abs(dot(s.hkl, p) - pl.c) < 1e-9;
        m.nplanes = neighborSections(s.hkl, pl.c);
        m.pl = pl;
      }
      if (wantD && s.uvw.some(x => x)) {
        if (m.pl && dot(s.hkl, s.uvw) === 0) m.arrow = arrowInPlane(m.pl, s.uvw);
        m.arrow ??= dirArrow(s.uvw);
        if (!(m.pl && dot(s.hkl, s.uvw) === 0)) m.arrowO = dirArrow(s.uvw)[0];
      }
    }
    return m;
  }

  // ---- 描画(正射影。視点の方位 az と仰角 el) ----
  let M = null, S = null, bound = 1;
  function boundOf(m, s) {
    const pts = [...m.edges.map(e => (Array.isArray(e) ? e : [e.p, e.q])).flat(), ...m.axes.map(x => x[1])];
    const rr = s.atom === 'sphere' ? m.info.r : 0.05;
    return Math.max(...pts.map(p => len(sub(p, m.center)))) + rr + 0.04;
  }
  const f1 = x => x.toFixed(1);
  function draw() {
    if (!M) return;
    const small = box.clientWidth < 460;
    const [W, H] = small ? [340, 320] : [520, 420];
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const az = view.az * Math.PI / 180, elv = view.el * Math.PI / 180;
    const R = [-Math.sin(az), Math.cos(az), 0];
    const U = [-Math.sin(elv) * Math.cos(az), -Math.sin(elv) * Math.sin(az), Math.cos(elv)];
    const V = [Math.cos(elv) * Math.cos(az), Math.cos(elv) * Math.sin(az), Math.sin(elv)];
    const sc = (Math.min(W, H) / 2 - 8) / bound;
    const P = p => { const d = sub(p, M.center); return [W / 2 + sc * dot(d, R), H / 2 - sc * dot(d, U), dot(d, V)]; };
    const items = []; // { d: 奥行き, g: 'back'|'front', s: svg }
    // 面より手前か(面に対して視点と同じ側)。面がなければ全部 'back'
    const pn = M.plane ? M.plane.n : null, nv = pn ? dot(pn, V) : 0;
    const side = p => (!pn ? 'back' : Math.abs(dot(pn, p) - M.plane.c) < 1e-9 ? 'front' : (dot(pn, p) - M.plane.c) * nv > 0 ? 'front' : 'back');
    const seg = (p, q, cls, style = '', k = 6) => {
      for (let i = 0; i < k; i++) {
        const a = add(p, mul(sub(q, p), i / k)), b = add(p, mul(sub(q, p), (i + 1) / k)), mid = mul(add(a, b), 0.5);
        const A = P(a), Bp = P(b);
        items.push({ d: P(mid)[2], g: side(mid), s: `<line class="${cls}" x1="${f1(A[0])}" y1="${f1(A[1])}" x2="${f1(Bp[0])}" y2="${f1(Bp[1])}"${style ? ` style="${style}"` : ''}/>` });
      }
    };
    for (const e of M.edges) {
      if (Array.isArray(e)) seg(e[0], e[1], 'ln', 'stroke-width: 1.4; stroke-linecap: round');
      else seg(e.p, e.q, 'dash', 'stroke-width: 1; stroke-dasharray: 3 3', 3);
    }
    for (const [p, q] of M.bonds) seg(p, q, 'thin', 'stroke-width: 2.2', 4);
    const sph = S.atom === 'sphere';
    const rpx = sph ? sc * M.info.r : small ? 5 : 6;
    const FILL = { corner: 'metal', edge: 'ox', face: 'n', in: 'p' };
    for (const a of M.atoms) {
      const [x, y, d] = P(a.p), on = M.onPlane?.(a.p);
      let s = `<circle class="${FILL[a.site]}" cx="${f1(x)}" cy="${f1(y)}" r="${f1(rpx)}" style="stroke: var(--text); stroke-width: ${sph ? 0.8 : 1}${sph ? '; fill-opacity: .82' : ''}"/>`;
      if (sph) s += `<circle cx="${f1(x - rpx * 0.35)}" cy="${f1(y - rpx * 0.35)}" r="${f1(rpx * 0.28)}" fill="#fff" fill-opacity=".35"/>`;
      if (on) s += `<circle class="ac" cx="${f1(x)}" cy="${f1(y)}" r="${f1(rpx + 2.5)}" style="stroke-width: 2.4"/>`;
      items.push({ d, g: side(a.p), s });
    }
    // すき間: 点の表示では印(八面体 ◆・四面体 ▲・立方体 ■)、剛体球の表示では入る球の大きさ
    for (const v of M.voids) {
      const [x, y, d] = P(v.p), cls = v.kind === 'tet' ? 'fa2' : 'fa';
      let s;
      if (sph) s = `<circle class="${cls}" cx="${f1(x)}" cy="${f1(y)}" r="${f1(Math.max(1.5, sc * M.info.r * v.ratio))}" style="stroke: var(--surface); stroke-width: .8"/>`;
      else if (v.kind === 'tet') { const r = small ? 4.6 : 5.4; s = `<polygon class="fa2" points="${f1(x)},${f1(y - r)} ${f1(x + r * 0.95)},${f1(y + r * 0.7)} ${f1(x - r * 0.95)},${f1(y + r * 0.7)}" style="stroke: var(--surface); stroke-width: .8"/>`; }
      else { const r = small ? 4.4 : 5.2; s = v.kind === 'cube' ? `<rect class="fa" x="${f1(x - r * 0.8)}" y="${f1(y - r * 0.8)}" width="${f1(r * 1.6)}" height="${f1(r * 1.6)}" style="stroke: var(--surface); stroke-width: .8"/>` : `<polygon class="fa" points="${f1(x)},${f1(y - r)} ${f1(x + r)},${f1(y)} ${f1(x)},${f1(y + r)} ${f1(x - r)},${f1(y)}" style="stroke: var(--surface); stroke-width: .8"/>`; }
      items.push({ d: d + 1e-4, g: side(v.p), s });
    }
    // 代表のすき間を囲む原子への線(BCC の八面体すき間は、近い2個を太い線、遠い4個を破線)と、単位格子の外の原子(破線の円)
    if (M.rep) {
      const distorted = M.rep.nb.some(x => !x.short);
      for (const nb of M.rep.nb) {
        seg(M.rep.p, nb.q, distorted && !nb.short ? 'dash' : 'ac', distorted && !nb.short ? 'stroke: var(--accent); stroke-width: 1.6' : `stroke-width: ${distorted ? 3 : 1.8}`, 4);
        const outside = nb.q.some((x, i) => (S.st === 'hcp' ? false : x < -1e-9 || x > 1 + 1e-9)) || (S.st === 'hcp' && !M.atoms.some(a => len(sub(a.p, nb.q)) < 1e-9));
        if (outside) { const [x, y, d] = P(nb.q); items.push({ d, g: side(nb.q), s: `<circle class="dash" cx="${f1(x)}" cy="${f1(y)}" r="${f1(rpx)}" style="stroke-width: 1.2"/>` }); }
      }
    }
    const back = items.filter(x => x.g === 'back').sort((a, b) => a.d - b.d), front = items.filter(x => x.g === 'front').sort((a, b) => a.d - b.d);
    let mid = '';
    if (M.plane) {
      const pts = M.plane.verts.map(p => P(p).slice(0, 2).map(f1).join(',')).join(' ');
      mid += `<polygon class="fa" points="${pts}" fill-opacity=".2"/><polygon class="ac" points="${pts}" style="stroke-width: 2; stroke-linejoin: round"/>`;
      for (const vs of M.nplanes) mid += `<polygon class="dash" points="${vs.map(p => P(p).slice(0, 2).map(f1).join(',')).join(' ')}" style="stroke: var(--accent); stroke-width: 1.2"/>`;
    }
    // 座標軸(単位格子の稜の先に延ばす)と原点
    let top = '';
    for (const [p, q, lab] of M.axes) {
      const A = P(p), Bq = P(q), dx = Bq[0] - A[0], dy = Bq[1] - A[1], L = Math.hypot(dx, dy);
      top += `<line class="ac2" x1="${f1(A[0])}" y1="${f1(A[1])}" x2="${f1(Bq[0])}" y2="${f1(Bq[1])}" style="stroke-width: 1.6"/>`;
      if (L > 6) {
        const ux = dx / L, uy = dy / L;
        top += `<polygon class="fa2" points="${f1(Bq[0] + ux * 7)},${f1(Bq[1] + uy * 7)} ${f1(Bq[0] - uy * 4)},${f1(Bq[1] + ux * 4)} ${f1(Bq[0] + uy * 4)},${f1(Bq[1] - ux * 4)}"/>`;
      }
      const lx = Bq[0] + (L > 1 ? dx / L : 0) * 16, ly = Bq[1] + (L > 1 ? dy / L : 0) * 16 + 5;
      top += `<text class="sm" x="${f1(Math.min(W - tw(lab) / 2 - 2, Math.max(tw(lab) / 2 + 2, lx)))}" y="${f1(Math.min(H - 4, Math.max(14, ly)))}" text-anchor="middle">${lab}</text>`;
    }
    const O = P(M.origin);
    top += `<text class="sm m" x="${f1(O[0] - 8)}" y="${f1(O[1] + 16)}" text-anchor="end">O</text>`;
    const O2 = M.plane?.O?.some(x => x) ? M.plane.O : M.arrowO?.some(x => x) ? M.arrowO : null;
    if (O2) { const Q = P(O2); top += `<circle class="fa" cx="${f1(Q[0])}" cy="${f1(Q[1])}" r="3"/><text class="sm a" x="${f1(Q[0] + 8)}" y="${f1(Q[1] - 8)}">O′</text>`; }
    // 方向の矢印
    if (M.arrow) {
      const [p, q] = M.arrow, A = P(p), Bq = P(q), dx = Bq[0] - A[0], dy = Bq[1] - A[1], L = Math.hypot(dx, dy);
      if (L > 4) {
        const ux = dx / L, uy = dy / L, hl = 13, hw = 6.5, bx = Bq[0] - ux * hl, by = Bq[1] - uy * hl;
        top += `<line class="ac2" x1="${f1(A[0])}" y1="${f1(A[1])}" x2="${f1(bx)}" y2="${f1(by)}" style="stroke-width: 3.4; stroke-linecap: round"/>`
          + `<polygon class="fa2" points="${f1(Bq[0])},${f1(Bq[1])} ${f1(bx - uy * hw)},${f1(by + ux * hw)} ${f1(bx + uy * hw)},${f1(by - ux * hw)}"/>`;
      } else {
        top += `<circle class="fa2" cx="${f1(A[0])}" cy="${f1(A[1])}" r="6"/>`; // 視線の方向と平行
      }
    }
    svg.innerHTML = back.map(x => x.s).join('') + mid + front.map(x => x.s).join('') + top;
  }
  let raf = 0;
  const redraw = () => { if (!raf) raf = requestAnimationFrame(() => { raf = 0; draw(); }); };

  // ドラッグ・スワイプで回す
  let drag = null;
  svg.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, id: e.pointerId }; svg.setPointerCapture?.(e.pointerId); e.preventDefault(); });
  // 指では図の上でもページを縦にスクロールできるようにする(touch-action: pan-y)。横のスワイプで方位だけを回し、
  // 縦の傾きは ▲▼ のボタンで変える。縦に動かすとブラウザーがスクロールを始め、pointercancel が来る
  svg.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    view.az -= (e.clientX - drag.x) * 0.6;
    if (e.pointerType !== 'touch') view.el = Math.max(-89, Math.min(89, view.el + (e.clientY - drag.y) * 0.6));
    drag.x = e.clientX; drag.y = e.clientY; markView(); redraw();
  });
  const end = () => { drag = null; };
  svg.addEventListener('pointerup', end); svg.addEventListener('pointercancel', end);
  svg.addEventListener('keydown', e => {
    const k = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }[e.key];
    if (k) { e.preventDefault(); rotate(k); }
  });
  function rotate(k) {
    if (k === 'left') view.az += 15; else if (k === 'right') view.az -= 15;
    else if (k === 'up') view.el = Math.min(89, view.el + 15); else if (k === 'down') view.el = Math.max(-89, view.el - 15);
    else if (k === 'reset') Object.assign(view, DEF);
    else if (k.startsWith('v:')) {
      // 指定の方向から見る(立方晶は [uvw]、六方晶は c 軸と a₁)
      const d = k.slice(2).split(',').map(Number);
      view.az = Math.atan2(d[1], d[0]) * 180 / Math.PI;
      view.el = Math.max(-89, Math.min(89, Math.atan2(d[2], Math.hypot(d[0], d[1])) * 180 / Math.PI));
    }
    markView(); redraw();
  }
  box.addEventListener('click', e => {
    const b = e.target.closest('[data-rot]');
    if (b) { rotate(b.dataset.rot); return; }
    const x = e.target.closest('[data-ex]');
    if (x) {
      const [, t, a, c] = EX[Number(x.dataset.ex)];
      el.type.value = t; el.a.value = String(a);
      if (c) el.ca.value = String(Number((c / a).toFixed(4)));
      form.dispatchEvent(new Event('input', { bubbles: true }));
    }
  });
  function viewButtons(s) {
    const list = s.st === 'hcp' ? [['0,0,1', T.view_c], ['1,0,0.0001', T.view_a1]] : [['1,0,0', '[100]'], ['1,1,0', '[110]'], ['1,1,1', '[111]']];
    part('views').innerHTML = list.map(([d, l]) => `<button type="button" class="btn btn-ghost" data-rot="v:${d}" aria-pressed="false">${esc(fill(T.view_from, { d: l }))}</button>`).join('');
    markView();
  }
  function markView() {
    for (const b of part('views').querySelectorAll('[data-rot]')) {
      const d = b.dataset.rot.slice(2).split(',').map(Number);
      const az = Math.atan2(d[1], d[0]) * 180 / Math.PI, elv = Math.atan2(d[2], Math.hypot(d[0], d[1])) * 180 / Math.PI;
      b.setAttribute('aria-pressed', String(Math.abs(mod(view.az - az + 180, 360) - 180) < 0.5 && Math.abs(view.el - Math.max(-89, Math.min(89, elv))) < 0.5));
    }
  }

  // ---- 凡例 ----
  function legend(s) {
    const sw = (inner) => `<svg viewBox="0 0 16 16" aria-hidden="true">${inner}</svg>`;
    const dotS = cls => sw(`<circle class="${cls}" cx="8" cy="8" r="5.5" style="stroke: var(--text); stroke-width: 1"/>`);
    const g = M.info.groups, items = [];
    const W = s.st === 'hcp' ? { corner: '1/6', face: '1/2', in: '1' } : { corner: '1/8', edge: '1/4', face: '1/2', in: '1' };
    for (const k of ['corner', 'edge', 'face', 'in']) if (g[k]) items.push(`${dotS({ corner: 'metal', edge: 'ox', face: 'n', in: 'p' }[k])}${esc(fill(T[`lg_${k}`], { w: W[k], n: g[k].count }))}`);
    if (M.voids.length) {
      const kinds = [...new Set(M.voids.map(v => v.kind))];
      for (const k of kinds) items.push(sw(k === 'tet' ? '<polygon class="fa2" points="8,2 14,13 2,13"/>' : k === 'cube' ? '<rect class="fa" x="3" y="3" width="10" height="10"/>' : '<polygon class="fa" points="8,1.5 14.5,8 8,14.5 1.5,8"/>') + esc(T[`lg_v_${s.st === 'diamond' ? 'd' : ''}${k}`]));
      if (M.rep) items.push(sw('<line class="ac" x1="1" y1="8" x2="15" y2="8" style="stroke-width: 2"/>') + esc(T.lg_rep));
    }
    if (M.plane) items.push(sw('<rect class="fa" x="1.5" y="3.5" width="13" height="9" fill-opacity=".25"/><rect class="ac" x="1.5" y="3.5" width="13" height="9" style="stroke-width: 1.6"/>') + esc(T.lg_plane));
    if (M.plane && M.atoms.some(a => M.onPlane(a.p))) items.push(sw('<circle class="ac" cx="8" cy="8" r="5.5" style="stroke-width: 2"/>') + esc(T.lg_on));
    if (M.nplanes.length) items.push(sw('<line class="dash" x1="1" y1="8" x2="15" y2="8" style="stroke: var(--accent)"/>') + esc(T.lg_next));
    if (M.arrow) items.push(sw('<line class="ac2" x1="1" y1="8" x2="11" y2="8" style="stroke-width: 2.4"/><polygon class="fa2" points="15,8 10,4.5 10,11.5"/>') + esc(T.lg_dir));
    if (s.st === 'hcp' && s.atom === 'point') items.push(sw('<line class="dash" x1="1" y1="8" x2="15" y2="8" style="stroke-dasharray: 3 3"/>') + esc(T.lg_prim));
    if (s.st === 'diamond' && s.atom === 'point') items.push(sw('<line class="thin" x1="1" y1="8" x2="15" y2="8" style="stroke-width: 2.2"/>') + esc(T.lg_bond));
    { const html = items.map(x => `<li>${x}</li>`).join(''), e = part('legend'); if (e.dataset.html !== html) { e.innerHTML = html; e.dataset.html = html; } }
  }

  // ---- 結果 ----
  const stat = (k, label, val, sub = '') => `<div><dt>${esc(label)}</dt><dd data-out="xt-${k}">${val}${sub ? `<span class="xt-sub">${sub}</span>` : ''}</dd></div>`;
  const NAME = st => esc(T[`short_${st}`]);
  const REL = { sc: 'a = 2r', bcc: 'a = 4r/√3', fcc: 'a = 2√2 r', diamond: 'a = 8r/√3', hcp: 'a = 2r' };
  const RELW = { sc: 'rel_sc', bcc: 'rel_bcc', fcc: 'rel_fcc', diamond: 'rel_diamond', hcp: 'rel_hcp' };
  const APFF = { sc: 'π/6', bcc: '√3π/8', fcc: 'π/(3√2)', diamond: '√3π/16', hcp: 'π/(3√2)' };
  const NNF = { sc: 'a', bcc: '√3a/2', fcc: 'a/√2', diamond: '√3a/4', hcp: 'a' };
  function countFormula(g, n) {
    const parts = ['corner', 'edge', 'face', 'in'].filter(k => g[k]).map(k => (g[k].w === 1 ? String(g[k].count) : `${g[k].count} × ${frac(g[k].w)}`));
    return `${parts.join(' + ')} = ${frac(n)}`;
  }
  function cellBox(s) {
    const I = M.info, rN = I.r * s.a;
    let h = `<dl class="dy-stats">`;
    h += stat('n', T.n, frac(I.n), esc(countFormula(I.groups, I.n)) + (s.st === 'hcp' ? `<br>${esc(T.n_hcp_prim)}` : ''));
    if (s.st === 'hcp') {
      const ideal = Math.abs(s.ca - IDEAL_CA) < 0.005;
      h += stat('cn', T.cn, '12', esc(ideal ? T.cn_hcp_ideal : fill(T.cn_hcp, { d1: num(I.d1, 4), d2: num(I.d2, 4) })));
      h += stat('apf', T.apf, num(I.apf, 3), esc(ideal ? `${APFF.hcp} ${T.apf_ideal}` : fill(T.apf_hcp, { v: num(cellInfo('hcp').apf, 3) })));
      h += stat('rel', T.rel, esc(ideal ? `a = 2r, c = ${num(IDEAL_CA, 4)}a` : (I.d2 < I.d1 ? fill(T.rel_hcp_short, { d: num(I.d2, 4) }) : 'a = 2r')), esc(`r = ${nm(rN)}`) + `<br>${esc(T[RELW.hcp])}`);
      h += stat('ca', T.ca, num(s.ca, 4), esc(fill(T.ca_note, { c: nm(s.ca * s.a) })) + (s.caOk ? '' : `<br>${esc(T.ca_bad)}`));
    } else {
      h += stat('cn', T.cn, String(I.cn), esc(T[`cn_${s.st}`]));
      h += stat('apf', T.apf, num(I.apf, 3), esc(APFF[s.st]));
      h += stat('rel', T.rel, esc(REL[s.st]), esc(`r = ${nm(rN)}`) + `<br>${esc(T[RELW[s.st]])}`);
    }
    h += stat('nn', T.nn, esc(s.st === 'hcp' && I.d2 < I.d1 - 1e-9 ? '√(a²/3 + c²/4)' : NNF[s.st]), esc(`= ${nm(I.nn * s.a)}`));
    h += `</dl>`;
    put('cell', h);
  }
  function voidBox(s) {
    const kinds = voidKinds(s.st), I = M.info, rows = [];
    for (const k of kinds) {
      const vi = voidInfo(s.st, k, s.ca);
      const where = T[`vpos_${s.st}_${k}`];
      rows.push(`<tr><th scope="row">${esc(T[`lg_v_${s.st === 'diamond' ? 'd' : ''}${k}`])}<span class="xt-sub">${esc(where)}</span></th><td data-out="xt-vn-${k}">${frac(vi.n)}</td><td data-out="xt-vpa-${k}">${frac(vi.perAtom)}</td><td data-out="xt-vr-${k}">${num(vi.ratio, 3)}</td><td data-out="xt-vnm-${k}">${num(vi.ratio * I.r * s.a, 3)}</td></tr>`);
    }
    let h = `<div class="table-wrap"><table class="dy-table xt-void"><thead><tr><th scope="col">${esc(T.col_kind)}</th><th scope="col">${esc(T.col_n)}</th><th scope="col">${esc(T.col_per)}</th><th scope="col">${esc(T.col_ratio)}</th><th scope="col">${esc(T.col_nm)}</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
    h += `<dl class="dy-stats" style="margin-top: 10px">${stat('empty', T.empty, num(1 - I.apf, 2), esc(T.empty_sub))}</dl>`;
    if (s.st === 'bcc') {
      const vi = voidInfo('bcc', 'oct');
      h += `<p class="xt-note">${esc(fill(T.void_bcc_oct, { s: num(vi.short, 3), l: num(vi.long, 4), r1: num(vi.ratio, 3), r2: num(vi.ratioLong, 3) }))}</p>`;
    }
    h += `<p class="xt-note">${esc(T[`void_note_${s.st}`])}</p>`;
    if (s.st === 'hcp' && Math.abs(s.ca - IDEAL_CA) >= 0.005) h += `<p class="xt-note muted">${esc(T.void_hcp_real)}</p>`;
    if (s.vd === 'none') h += `<p class="xt-note muted">${esc(T.void_hint)}</p>`;
    put('void', h);
  }
  const allowed = (st, h, k, l) => {
    const sm = h + k + l, even = [h, k, l].every(x => x % 2 === 0), odd = [h, k, l].every(x => Math.abs(x) % 2 === 1);
    if (st === 'bcc') return sm % 2 === 0;
    if (st === 'fcc') return even || odd;
    if (st === 'diamond') return odd || (even && sm % 4 === 0);
    return true;
  };
  const icpt = (x, O) => (x === 0 ? '∞' : (O ? '−' : '') + frac(1 / Math.abs(x)));
  function planeBox(s) {
    let h = '';
    if (s.st === 'hcp') {
      const pk = s.hp === 'basal' || s.hp in A_DIR ? 'basal' : s.hp === 'prism' || s.hp === 'pslip' ? 'prism' : null;
      if (!pk) { put('plane', `<p class="muted xt-note">${esc(T.hcp_hint)}</p>`); return; }
      const pi = hcpPlaneInfo(pk, s.ca);
      h += `<dl class="dy-stats">`;
      h += stat('pname', T.plane_is, pk === 'basal' ? '(0001)' : `(10${idxText([-1], true)}0)`, esc(T[`hp_desc_${pk}`]));
      h += stat('pd', T.pd, esc(`${num(pi.pd, 4)}/a²`), esc(`= ${num(pi.pd / (s.a * s.a), 3)} ${T.per_nm2}`));
      h += stat('ppf', T.ppf, num(pi.ppf, 3), '');
      h += stat('d', T[`hp_d_${pk}`], esc(pk === 'basal' ? 'c/2' : '√3a/2'), esc(`= ${nm(pi.d * s.a)}`));
      if (s.hp !== 'basal' && s.hp !== 'prism') {
        const dir = { slip1: [2, -1, -1, 0], slip2: [-1, 2, -1, 0], slip3: [-1, -1, 2, 0], pslip: [-1, 2, -1, 0] }[s.hp];
        h += stat('dir', T.dir_is, `[${idxText(dir, true)}]`, esc(T.hcp_dir_sub));
      }
      h += `</dl><p class="xt-note">${esc(fill(T[`hp_note_${pk}`], { ca: num(s.ca, 4) }))}</p>`;
      put('plane', h);
      return;
    }
    if (s.show === 'none') { put('plane', `<p class="muted xt-note">${esc(T.plane_hint)}</p>`); return; }
    const wantP = /plane|both/.test(s.show), wantD = /dir|both/.test(s.show);
    if (wantP && !s.hklOk) h += `<p class="xt-warn">${esc(T.bad_int)}</p>`;
    if (wantD && !s.uvwOk) h += `<p class="xt-warn">${esc(T.bad_int)}</p>`;
    h += `<dl class="dy-stats">`;
    if (wantP && s.hklOk) {
      const pl = M.pl ?? planeInfo(s.st, s.hkl);
      if (!pl) h += `</dl><p class="xt-warn">${esc(T.zero_plane)}</p><dl class="dy-stats">`;
      else {
        const [hh, kk, ll] = s.hkl, n2 = pl.n2;
        const ic = s.hkl.map((x, i) => `${'xyz'[i]} = ${icpt(x, pl.O[i])}`).join(', ');
        h += stat('pname', T.plane_is, `(${idxText(s.hkl, true)})`, esc(ic) + (pl.O.some(x => x) ? `<br>${esc(fill(T.origin_moved, { o: `(${pl.O.join(', ')})` }))}` : ''));
        h += stat('d', T.d, esc(`${sqrtForm(n2)}`), esc(`= ${nm(s.a / Math.sqrt(n2))}`) + `<br>${esc(`d = a/√(h² + k² + l²)`)}`);
        const p = pl.parts, groups = {};
        for (const f of p.corner) { const key = frac(f); groups[key] = (groups[key] ?? 0) + 1; }
        const terms = [...Object.entries(groups).map(([f, c]) => fill(T.p_corner, { n: c, f })), ...(p.edge ? [fill(T.p_edge, { n: p.edge })] : []), ...(p.in ? [fill(T.p_in, { n: p.in })] : [])];
        const cellTxt = terms.length ? `${terms.join(' + ')} = ${frac(pl.nCell)}` : T.p_none;
        h += stat('pn', T.pn, frac(pl.nCell), esc(cellTxt) + `<br>${esc(fill(T.p_area, { s: num(pl.area, 4), nm: num(pl.area * s.a * s.a, 3) }))}`);
        h += stat('pd', T.pd, esc(`${num(pl.pd, 4)}/a²`), esc(`= ${num(pl.pd / (s.a * s.a), 3)} ${T.per_nm2}`) + (pl.same ? '' : `<br>${esc(fill(T.pd_cell_differs, { v: num(pl.pdCell, 4) }))}`));
        h += stat('ppf', T.ppf, num(pl.pd * Math.PI * M.info.r ** 2, 3), esc(T.ppf_sub));
        h += stat('xrd', T.xrd_rule, esc(allowed(s.st, hh, kk, ll) ? T.rule_yes : T.rule_no), esc(T[`rule_${s.st}`]));
        if (pl.nCell === 0) h += `</dl><p class="xt-warn">${pl.pd > 0 ? esc(T.p_empty_cell) : fill(esc(T.p_empty), { hkl: idxText(s.hkl, true) })}</p><dl class="dy-stats">`;
      }
    }
    if (wantD && s.uvwOk) {
      const li = lineInfo(s.st, s.uvw);
      if (!li) h += `</dl><p class="xt-warn">${esc(T.zero_dir)}</p><dl class="dy-stats">`;
      else {
        h += stat('dir', T.dir_is, `[${idxText(s.uvw, true)}]`, esc(T.dir_sub));
        h += stat('ld', T.ld, esc(`${num(li.ld, 4)}/a`), esc(`= ${num(li.ld / s.a, 3)} ${T.per_nm}`) + `<br>${esc(fill(T.ld_sub, { n: li.cnt, L: num(li.L, 4), nm: num(li.L * s.a, 4) }))}`);
        h += stat('lpf', T.lpf, num(Math.min(1, li.ld * 2 * M.info.r), 3), esc(T.lpf_sub));
      }
    }
    h += `</dl>`;
    if (s.show === 'both' && s.hklOk && s.uvwOk && s.hkl.some(x => x) && s.uvw.some(x => x)) {
      const dp = dot(s.hkl, s.uvw), ang = Math.acos(Math.min(1, Math.abs(dp) / (len(s.hkl) * len(s.uvw)))) * 180 / Math.PI;
      const fam = slipFamily(s.st, s.hkl, s.uvw);
      let msg = dp === 0 ? T.in_plane : fill(T.not_in_plane, { dp: num(dp, 3), ang: num(ang, 3) });
      if (fam) msg += ' ' + T[`slip_is_${fam}`];
      h += `<p class="xt-note"><b>${esc(msg)}</b></p>`;
    }
    h = h.replace(/<dl class="dy-stats"><\/dl>/g, '');
    put('plane', h);
  }
  function slipBox(s) {
    let h = `<p class="xt-note">${esc(T[`slip_${s.st}`])}</p>`;
    const btn = (label, data, on) => `<button type="button" class="btn btn-ghost" ${data} aria-pressed="${on}">${label}</button>`;
    const cur = (p, d) => s.show === 'both' && s.hklOk && s.uvwOk && s.hkl.every((x, i) => x === p[i]) && s.uvw.every((x, i) => x === d[i]);
    if (s.st === 'hcp') {
      h += `<div class="xt-slips" role="group" aria-label="${esc(T.slip_heading)}">${['slip1', 'slip2', 'slip3'].map((k, i) => btn(`(0001)[${idxText([[2, -1, -1, 0], [-1, 2, -1, 0], [-1, -1, 2, 0]][i], true)}]`, `data-hp="${k}"`, s.hp === k)).join('')}</div>`;
      h += `<p class="xt-note muted">${esc(T.slip_hcp_prism)}</p><div class="xt-slips">${btn(`(10${idxText([-1], true)}0)[${idxText([-1, 2, -1, 0], true)}]`, 'data-hp="pslip"', s.hp === 'pslip')}</div>`;
    } else if (SLIP[s.st]) {
      h += `<div class="xt-slips" role="group" aria-label="${esc(T.slip_heading)}">${SLIP[s.st].map(([p, d]) => btn(`(${idxText(p, true)})[${idxText(d, true)}]`, `data-slip="${p.join(',')};${d.join(',')}"`, cur(p, d))).join('')}</div>`;
      if (s.st === 'bcc') h += `<p class="xt-note muted">${esc(T.slip_bcc_more)}</p><div class="xt-slips">${SLIP.bccExtra.map(([p, d]) => btn(`(${idxText(p, true)})[${idxText(d, true)}]`, `data-slip="${p.join(',')};${d.join(',')}"`, cur(p, d))).join('')}</div>`;
    }
    put('slip', h);
  }
  out('slip').addEventListener('click', e => {
    const b = e.target.closest('[data-slip],[data-hp]');
    if (!b) return;
    if (b.dataset.hp) el.hp.value = b.dataset.hp;
    else {
      const [p, d] = b.dataset.slip.split(';').map(x => x.split(',').map(Number));
      ['h', 'k', 'l'].forEach((n, i) => { el[n].value = p[i]; });
      ['u', 'v', 'w'].forEach((n, i) => { el[n].value = d[i]; });
      el.show.value = 'both';
    }
    form.dispatchEvent(new Event('input', { bubbles: true }));
    // 面がよく見える向きにする(面の法線に近い方向から少し斜めに)
    svg.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  });
  function linkBox(s) {
    const links = [];
    if (s.st === 'hcp') {
      // HCP は c も渡し、いちばん強い (101) を選んで開く
      const q = `type=hcp&a=${Number(s.a.toPrecision(6))}&c=${Number((s.a * s.ca).toPrecision(6))}&lambda=0.15406&h=1&k=0&l=1`;
      links.push(`<p><a class="btn btn-ghost" href="${home}tools/xrd-bragg-calculator/?${esc(q)}">${esc(fill(T.xrd_link, { hkl: '101', s: T.short_hcp, a: num(s.a, 5) }))} →</a></p>`);
      links.push(`<p class="muted xt-note">${esc(T.xrd_note)}</p>`);
    } else {
      const def = { sc: [1, 0, 0], bcc: [1, 1, 0], fcc: [1, 1, 1], diamond: [1, 1, 1] }[s.st];
      const useP = /plane|both/.test(s.show) && s.hklOk && s.hkl.some(x => x);
      const hkl = useP ? s.hkl.map(Math.abs) : def;
      const q = `type=${s.st}&a=${Number(s.a.toPrecision(6))}&lambda=0.15406&h=${hkl[0]}&k=${hkl[1]}&l=${hkl[2]}`;
      links.push(`<p><a class="btn btn-ghost" href="${home}tools/xrd-bragg-calculator/?${esc(q)}">${esc(fill(T.xrd_link, { hkl: idxText(hkl), s: T[`short_${s.st}`], a: num(s.a, 5) }))} →</a></p>`);
      links.push(`<p class="muted xt-note">${esc(useP && s.hkl.some(x => x < 0) ? T.xrd_note_neg : T.xrd_note)}</p>`);
    }
    if (T.ptable_link) links.push(`<p><a class="btn btn-ghost" href="${home}tools/materials-periodic-table/">${esc(T.ptable_link)} →</a></p>`);
    put('links', links.join(''));
  }

  let lastStruct = '';
  function update() {
    const s = state();
    S = s;
    fields(s);
    M = model(s);
    const key = `${s.st} ${s.ca} ${s.atom}`;
    if (key !== lastStruct) { bound = boundOf(M, s); if (!lastStruct.startsWith(`${s.st} `)) viewButtons(s); lastStruct = key; }
    svg.setAttribute('aria-label', fill(T.svg_label, { s: T[`type_${s.st}`] }));
    legend(s);
    cellBox(s); voidBox(s); planeBox(s); slipBox(s); linkBox(s);
    draw();
  }
  form.addEventListener('input', update);
  form.addEventListener('change', update);
  form.addEventListener('submit', e => e.preventDefault());
  if (window.ResizeObserver) new ResizeObserver(() => redraw()).observe(box);
  update();
}
