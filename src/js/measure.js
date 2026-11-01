// 組織写真の計測室(/measure/)。数え方の決まり・式・粒度番号の表・読み物・FAQ は build.js が data/measure.json から作ってページに書く(JavaScript がなくても読める)。
// このファイルは計測の道具: 自分の顕微鏡写真(または練習用の合成組織)を開き、スケールを合わせ、
// 切断法(ASTM E112 の線分法・円の切断法)・面積法(Jeffries 法)・点算法(ASTM E562)で、画像の上をクリックして数える。
// 結果(G・ℓ̄・N_A・体積分率と、視野ごとのばらつき・95 % 信頼区間・%RA)をテキスト・CSV・PNG で出す。
// 画像はこのブラウザの中だけで扱い、どこにも送らない(このファイルは通信の関数を使わない。build の検査で確かめる)。
// 計算の関数(式・統計・パターン・合成組織と真の値・理想的な数え方)は DOM に触れず、build の検査と python の突き合わせでも使う。
// 画面の文言はすべて data-t(src/i18n の measure_*)から受け取り、数値の書式は <html lang> の言語に合わせる
const app = typeof document !== 'undefined' ? document.getElementById('ms-app') : null;

// ---------------------------------------------------------------- 式(ASTM E112)
// 切断法: G = −6.643856 log10(ℓ̄ / mm) − 3.288。面積法: G = 3.321928 log10(N_A / mm⁻²) − 2.954
export const E112 = { kL: 6.643856, cL: 3.288, kA: 3.321928, cA: 2.954 };
export const gFromL = lMm => -E112.kL * Math.log10(lMm) - E112.cL;
export const gFromNA = na => E112.kA * Math.log10(na) - E112.cA;
export const lFromG = g => 10 ** (-(g + E112.cL) / E112.kL);
export const naFromG = g => 10 ** ((g + E112.cA) / E112.kA);
// JIS G 0551・ISO 643 の面積の定義 m = 8 × 2^G(読み物の比べのため。計測の結果は ASTM の式で出す)
export const gmFromNA = na => Math.log2(na / 8);

// ---------------------------------------------------------------- 統計(t 分布)
function lgamma(x) {
  const c = [76.18009172947146, -86.50532032941677, 24.01409824083091, -1.231739572450155, 0.1208650973866179e-2, -0.5395239384953e-5];
  let y = x, tmp = x + 5.5, ser = 1.000000000190015;
  tmp -= (x + 0.5) * Math.log(tmp);
  for (const v of c) ser += v / ++y;
  return -tmp + Math.log(2.5066282746310005 * ser / x);
}
function betacf(a, b, x) {
  const FP = 1e-300;
  let qab = a + b, qap = a + 1, qam = a - 1, c = 1, d = 1 - qab * x / qap;
  if (Math.abs(d) < FP) d = FP;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= 300; m++) {
    const m2 = 2 * m;
    let aa = m * (b - m) * x / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FP) d = FP;
    c = 1 + aa / c; if (Math.abs(c) < FP) c = FP;
    d = 1 / d; h *= d * c;
    aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FP) d = FP;
    c = 1 + aa / c; if (Math.abs(c) < FP) c = FP;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-14) break;
  }
  return h;
}
// 正則化不完全ベータ関数 I_x(a, b)
export function ibeta(a, b, x) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  return x < (a + 1) / (a + b + 2) ? bt * betacf(a, b, x) / a : 1 - bt * betacf(b, a, 1 - x) / b;
}
// t 分布の累積分布と、その逆(二分法。両側 95 % なら tInv(0.975, n − 1))
export function tCdf(t, df) {
  const p = 0.5 * ibeta(df / 2, 0.5, df / (df + t * t));
  return t > 0 ? 1 - p : p;
}
export function tInv(p, df) {
  if (p === 0.5) return 0;
  if (p < 0.5) return -tInv(1 - p, df);
  let lo = 0, hi = 1;
  while (tCdf(hi, df) < p) hi *= 2;
  for (let i = 0; i < 200 && hi - lo > 1e-12 * hi; i++) {
    const mid = (lo + hi) / 2;
    if (tCdf(mid, df) < p) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}
// 視野ごとの値の平均・標準偏差(n − 1 で割る)・95 % 信頼区間の半幅 t·s/√n・相対精度 %RA = 100 × 信頼区間 / 平均(E112・E562 の形)
export function stats(xs, conf = 0.95) {
  const n = xs.length;
  if (!n) return null;
  const mean = xs.reduce((a, x) => a + x, 0) / n;
  if (n < 2) return { n, mean, s: null, t: null, ci: null, ra: null };
  const s = Math.sqrt(xs.reduce((a, x) => a + (x - mean) ** 2, 0) / (n - 1));
  const t = tInv(1 - (1 - conf) / 2, n - 1);
  const ci = t * s / Math.sqrt(n);
  return { n, mean, s, t, ci, ra: mean > 0 ? 100 * ci / mean : null };
}
// 今のばらつき(s / 平均)のまま、相対精度を ra % 以下にするのに要る視野の数(t は視野の数で変わるので順に探す)
export function fieldsFor(ra, cv) {
  if (!(cv > 0)) return 2;
  for (let n = 2; n <= 2000; n++) if (100 * tInv(0.975, n - 1) * cv / Math.sqrt(n) <= ra) return n;
  return Infinity;
}
// 点算法で、点が独立と見たとき(二項分布)の目安の視野の数: %RA ≈ 100 × 2 √((1 − p) / (p · P_T · n))
export function pointFieldsFor(ra, p, pt) {
  if (!(p > 0 && p < 1) || !(pt > 0)) return null;
  return Math.ceil(4 * (1 - p) / (p * pt * (ra / 100) ** 2));
}
// E562 の表(目で見た面積の割合 → 格子の点の数): 2〜5 % → 100、5〜10 % → 49、10〜20 % → 25、20 % より多い → 16
export function gridFor(p) {
  if (!(p > 0)) return null;
  const pc = Math.min(p, 1 - p) * 100; // 多いほうの相を数えるときは少ないほうの割合で見る
  return pc < 2 ? 400 : pc < 5 ? 100 : pc < 10 ? 49 : pc < 20 ? 25 : 16;
}

// ---------------------------------------------------------------- 数え方の重み
// 切断法の交点: x 粒界を横切る 1、t 粒界に接する 1、j 三重点 1.5、e 直線の端がちょうど粒界に触れる ½(E112 の交点 P の数え方)
export const W_ICPT = { x: 1, t: 1, j: 1.5, e: 0.5 };
// 面積法の粒: in 枠の中にすっかり入った粒 1、cut 枠にかかる粒 ½(四角の枠では四隅の粒を数えず、まとめて 1 を足す)
export const W_PLAN = { in: 1, cut: 0.5 };

// ---------------------------------------------------------------- パターン(画像の画素の座標)
// 切断法: c3 3 つの同心円(半径 r・2r/3・r/3)、c1 円 1 つ、l4 直線 4 本(横・縦・斜め 2 本、中心を通る)、l1 横の直線 1 本、lv 縦の直線 1 本。size は外の円の直径・直線の長さ
export const PATS = ['c3', 'c1', 'l4', 'l1', 'lv'];
export function pattern(kind, cx, cy, size) {
  const r = size / 2, el = [];
  if (kind === 'c3') for (const k of [1, 2 / 3, 1 / 3]) el.push({ t: 'c', cx, cy, r: r * k });
  else if (kind === 'c1') el.push({ t: 'c', cx, cy, r });
  else {
    const dirs = kind === 'l4' ? [0, 90, 45, 135] : kind === 'lv' ? [90] : [0];
    for (const a of dirs) {
      const c = Math.cos(a * Math.PI / 180) * r, s = Math.sin(a * Math.PI / 180) * r;
      el.push({ t: 'l', x1: cx - c, y1: cy - s, x2: cx + c, y2: cy + s });
    }
  }
  return { kind, el, len: el.reduce((a, e) => a + elLen(e), 0) };
}
export const elLen = e => (e.t === 'c' ? 2 * Math.PI * e.r : Math.hypot(e.x2 - e.x1, e.y2 - e.y1));
// パターンが占める半分の幅(画像からはみ出さないように置くため)
export const patHalf = (kind, size) => size / 2;
// 面積法の枠: circle 円(直径 size)、rect 正方形(1 辺 size)
export function frame(shape, cx, cy, size) {
  return shape === 'rect' ? { t: 'r', x: cx - size / 2, y: cy - size / 2, w: size, h: size, area: size * size } : { t: 'c', cx, cy, r: size / 2, area: Math.PI * size * size / 4 };
}
// 点算法の格子: n × n 点、1 辺 size の正方形の中に間隔 size/n で(端は間隔の半分あける)
export function grid(n, cx, cy, size) {
  const d = size / n, pts = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) pts.push([cx - size / 2 + d * (i + 0.5), cy - size / 2 + d * (j + 0.5)]);
  return { n, d, pts };
}
// パターンの上でいちばん近い点(交点の印を線の上に乗せる)。ends が真なら直線の端だけを候補にする
export function snap(el, x, y, ends = false) {
  let best = null;
  const take = (i, px, py) => { const d = Math.hypot(px - x, py - y); if (!best || d < best.d) best = { i, x: px, y: py, d }; };
  el.forEach((e, i) => {
    if (e.t === 'c') {
      if (ends) return;
      const a = Math.atan2(y - e.cy, x - e.cx);
      take(i, e.cx + e.r * Math.cos(a), e.cy + e.r * Math.sin(a));
    } else if (ends) { take(i, e.x1, e.y1); take(i, e.x2, e.y2); }
    else {
      const dx = e.x2 - e.x1, dy = e.y2 - e.y1, L2 = dx * dx + dy * dy;
      const u = Math.max(0, Math.min(1, ((x - e.x1) * dx + (y - e.y1) * dy) / L2));
      take(i, e.x1 + u * dx, e.y1 + u * dy);
    }
  });
  return best;
}

// ---------------------------------------------------------------- 視野ごとの値
// 切断法: 線の長さ L(µm)と交点の数 P → ℓ = L / P(µm)
export const icptCount = marks => marks.reduce((a, m) => a + (W_ICPT[m.k] ?? 0), 0);
// 面積法: (中の粒 + ½ 枠にかかる粒 [+ 1 四角の枠の四隅]) / 枠の面積
export function planCount(marks, rect) {
  const nIn = marks.filter(m => m.k === 'in').length, nCut = marks.filter(m => m.k === 'cut').length;
  return { nIn, nCut, n: nIn + 0.5 * nCut + (rect ? 1 : 0) };
}
// 点算法: 各点の割り当て [[相, 重み]](境界の点は ½ ずつ)。相ごとの点の数の和
export function pointHits(pts) {
  const h = {};
  for (const a of pts) if (a) for (const [p, w] of a) h[p] = (h[p] ?? 0) + w;
  return h;
}
// 3 つの方法の結果をまとめる。fields: 数えた視野、um(img) → µm/px
export function summarize(method, fields, umOf, extra = {}) {
  if (method === 'icpt') {
    const rows = fields.map(f => {
      const um = umOf(f.img), L = pattern(f.pat, f.cx, f.cy, f.size).len * (um ?? NaN), P = icptCount(f.marks);
      return { L, P, l: P > 0 ? L / P : null };
    });
    const ok = rows.filter(r => r.l != null && Number.isFinite(r.l));
    const st = stats(ok.map(r => r.l));
    const sumL = ok.reduce((a, r) => a + r.L, 0), sumP = rows.reduce((a, r) => a + r.P, 0);
    const G = st ? gFromL(st.mean / 1000) : null;
    const Gr = st && st.ci != null ? [gFromL((st.mean + st.ci) / 1000), st.mean - st.ci > 0 ? gFromL((st.mean - st.ci) / 1000) : null] : null;
    return { rows, st, sumL, sumP, pooled: sumP > 0 ? sumL / sumP : null, G, Gr, nOk: ok.length };
  }
  if (method === 'plan') {
    const rows = fields.map(f => {
      const um = umOf(f.img), fr = frame(f.shape, f.cx, f.cy, f.size), A = fr.area * ((um ?? NaN) / 1000) ** 2, c = planCount(f.marks, f.shape === 'rect');
      return { A, ...c, na: A > 0 ? c.n / A : null };
    });
    const ok = rows.filter(r => r.na != null && Number.isFinite(r.na));
    const st = stats(ok.map(r => r.na));
    const G = st && st.mean > 0 ? gFromNA(st.mean) : null;
    const Gr = st && st.ci != null ? [st.mean - st.ci > 0 ? gFromNA(st.mean - st.ci) : null, gFromNA(st.mean + st.ci)] : null;
    return { rows, st, sumN: rows.reduce((a, r) => a + r.n, 0), G, Gr, nOk: ok.length };
  }
  // 点算法: 相ごとに、視野ごとの点の割合 P_P = 点の数 / P_T
  const phases = extra.phases ?? [];
  const rows = fields.map(f => ({ pt: f.n * f.n, h: pointHits(f.pts) }));
  const per = phases.map(ph => {
    const xs = rows.map(r => (r.h[ph.id] ?? 0) / r.pt);
    return { id: ph.id, xs, st: stats(xs), sum: rows.reduce((a, r) => a + (r.h[ph.id] ?? 0), 0) };
  });
  return { rows, per, sumPt: rows.reduce((a, r) => a + r.pt, 0) };
}

// ---------------------------------------------------------------- 練習用の合成組織
// 乱数(mulberry32)。種が同じなら同じ組織になる
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// 組織の大きさ(画素)。この下に、スケールバーを入れる帯(SYN.bar 画素)を足した画像にする
export const SYN = { W: 1200, H: 900, bar: 56, kinds: ['poly', 'two', 'part'], g: [3, 4, 5, 6, 7, 8, 9, 10], n: [50, 100, 200, 400], f: [5, 10, 20, 30, 50, 70], pn: [40, 80, 160] };
// URL の条件(?syn=poly&g=7&n=200&f=30&seed=123)を読む。知らない値は既定にする
export function synParams(q) {
  const kind = SYN.kinds.includes(q.get('syn')) ? q.get('syn') : null;
  if (!kind) return null;
  const num = (k, list, d) => { const v = Number(q.get(k)); return list.includes(v) ? v : d; };
  const seed = Number(q.get('seed'));
  return {
    kind, g: num('g', SYN.g, 7), n: kind === 'part' ? num('n', SYN.pn, 80) : num('n', SYN.n, 200),
    f: kind === 'poly' ? 0 : num('f', kind === 'part' ? SYN.f.filter(x => x <= 30) : SYN.f, kind === 'part' ? 10 : 30),
    seed: Number.isInteger(seed) && seed >= 0 && seed < 2 ** 31 ? seed : 1,
  };
}
export function synQuery(p) {
  const q = new URLSearchParams({ syn: p.kind });
  if (p.kind !== 'part') q.set('g', p.g);
  q.set('n', p.n);
  if (p.kind !== 'poly') q.set('f', p.f);
  q.set('seed', p.seed);
  return q.toString();
}
export const synKey = p => `syn:${synQuery(p)}`;

// 周期的な(上下・左右がつながった)平面の上の点の近傍を探す格子
function bins(pts, W, H, cell) {
  const nx = Math.max(1, Math.floor(W / cell)), ny = Math.max(1, Math.floor(H / cell));
  const b = Array.from({ length: nx * ny }, () => []);
  pts.forEach((p, i) => b[Math.min(ny - 1, Math.floor(p[1] / H * ny)) * nx + Math.min(nx - 1, Math.floor(p[0] / W * nx))].push(i));
  return { nx, ny, cw: W / nx, ch: H / ny, b, W, H, pts };
}
// (x, y) から近い順に k 個(周期の写しも含む)。返す値 [{ i, d2, sx, sy }](sx・sy は写しのずらし)
function nearest(B, x, y, k = 2) {
  const { nx, ny, cw, ch, b, W, H, pts } = B;
  const ix = Math.floor(x / cw), iy = Math.floor(y / ch), best = [];
  for (let ring = 0; ; ring++) {
    for (let dy = -ring; dy <= ring; dy++) for (let dx = -ring; dx <= ring; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
      const gx = ix + dx, gy = iy + dy;
      const wx = Math.floor(gx / nx), wy = Math.floor(gy / ny);
      for (const i of b[(gy - wy * ny) * nx + (gx - wx * nx)]) {
        const sx = wx * W, sy = wy * H, px = pts[i][0] + sx, py = pts[i][1] + sy;
        const d2 = (px - x) ** 2 + (py - y) ** 2;
        if (best.length < k || d2 < best[best.length - 1].d2) {
          best.push({ i, d2, sx, sy });
          best.sort((p, q) => p.d2 - q.d2);
          if (best.length > k) best.pop();
        }
      }
    }
    // この輪より外の点は ring × 格子の幅 より遠い
    const lim = ring * Math.min(cw, ch);
    if (best.length >= k && lim * lim >= best[best.length - 1].d2) return best;
    if (ring > nx + ny + 2) return best;
  }
}
// 硬い円の点の置き方(互いに dmin より近づけない)で、ほぼ等軸の粒をつくる
function seedPoints(n, W, H, r, dminK = 0.6) {
  const dmin = dminK * Math.sqrt(W * H / n), pts = [];
  const cell = dmin, nx = Math.max(1, Math.floor(W / cell)), ny = Math.max(1, Math.floor(H / cell));
  const g = Array.from({ length: nx * ny }, () => []);
  let tries = 0;
  while (pts.length < n && tries < n * 2000) {
    tries++;
    const x = r() * W, y = r() * H;
    const ix = Math.min(nx - 1, Math.floor(x / W * nx)), iy = Math.min(ny - 1, Math.floor(y / H * ny));
    let ok = true;
    for (let dy = -1; dy <= 1 && ok; dy++) for (let dx = -1; dx <= 1 && ok; dx++) {
      const gx = (ix + dx + nx) % nx, gy = (iy + dy + ny) % ny;
      for (const j of g[gy * nx + gx]) {
        let ddx = Math.abs(pts[j][0] - x), ddy = Math.abs(pts[j][1] - y);
        ddx = Math.min(ddx, W - ddx); ddy = Math.min(ddy, H - ddy);
        if (ddx * ddx + ddy * ddy < dmin * dmin) { ok = false; break; }
      }
    }
    if (!ok) continue;
    pts.push([x, y]);
    g[iy * nx + ix].push(pts.length - 1);
  }
  return pts;
}
// 周期的なボロノイ分割の粒の多角形(半平面で切っていく。外の点が多角形を削れなくなるまで近傍を広げる)
function clip(poly, mx, my, nxv, nyv) {
  // (p − m)·n ≤ 0 の側を残す
  const out = [], side = p => (p[0] - mx) * nxv + (p[1] - my) * nyv;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], sa = side(a), sb = side(b);
    if (sa <= 0) out.push(a);
    if ((sa < 0 && sb > 0) || (sa > 0 && sb < 0)) { const u = sa / (sa - sb); out.push([a[0] + u * (b[0] - a[0]), a[1] + u * (b[1] - a[1])]); }
  }
  return out;
}
export function cells(pts, W, H) {
  const B = bins(pts, W, H, Math.sqrt(W * H / pts.length));
  const { nx, ny, cw, ch, b } = B;
  return pts.map((s, i) => {
    const R0 = W + H;
    let poly = [[s[0] - R0, s[1] - R0], [s[0] + R0, s[1] - R0], [s[0] + R0, s[1] + R0], [s[0] - R0, s[1] + R0]];
    const ix = Math.min(nx - 1, Math.floor(s[0] / cw)), iy = Math.min(ny - 1, Math.floor(s[1] / ch));
    const nb = [];
    for (let ring = 0; ring <= Math.max(nx, ny) + 2; ring++) {
      for (let dy = -ring; dy <= ring; dy++) for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const gx = ix + dx, gy = iy + dy, wx = Math.floor(gx / nx), wy = Math.floor(gy / ny);
        for (const j of b[(gy - wy * ny) * nx + (gx - wx * nx)]) {
          const sx = wx * W, sy = wy * H;
          if (j === i && sx === 0 && sy === 0) continue;
          const qx = pts[j][0] + sx, qy = pts[j][1] + sy;
          poly = clip(poly, (s[0] + qx) / 2, (s[1] + qy) / 2, qx - s[0], qy - s[1]);
          nb.push(j);
        }
      }
      let R = 0;
      for (const p of poly) R = Math.max(R, Math.hypot(p[0] - s[0], p[1] - s[1]));
      if (ring * Math.min(cw, ch) >= 2 * R) break;
    }
    let area = 0, per = 0;
    for (let k = 0; k < poly.length; k++) {
      const a = poly[k], c = poly[(k + 1) % poly.length];
      area += a[0] * c[1] - c[0] * a[1];
      per += Math.hypot(c[0] - a[0], c[1] - a[1]);
    }
    return { poly, area: Math.abs(area) / 2, per };
  });
}
// 合成組織をつくる(画素はまだ描かない)。返す値に「真の値」を入れる:
//   N_A = 粒の数 / 面積(周期的な平面なので、どの粒もちょうど 1 個)
//   ℓ̄ = π A / (2 L_B)(L_B は粒界の長さの合計。どの向きの試験線でも平均すると P_L = (2/π) L_A になる)
//   体積分率 = 暗い相の粒の面積の和 / 面積(2 相)、Σ π r² / 面積(粒子)
// どれも多角形と円の形から計算するので、画素の数え方による誤差は入らない
export function makeSynth(p) {
  const { W, H } = SYN, A = W * H, r = rng(p.seed * 7919 + 17);
  if (p.kind === 'part') {
    // 母相の中の粒子(黒鉛の粒に見立てる)。大きさは少しばらつかせ、重ならないように置く。体積分率 f %、粒子の数 n
    const ks = Array.from({ length: p.n }, () => Math.exp(0.25 * Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r())));
    const k2 = ks.reduce((a, k) => a + k * k, 0);
    const r0 = Math.sqrt(p.f / 100 * A / (Math.PI * k2));
    const disks = [];
    ks.sort((a, b) => b - a);
    for (const k of ks) {
      const rad = r0 * k;
      for (let t = 0; t < 5000; t++) {
        const x = r() * W, y = r() * H;
        if (disks.every(d => { let dx = Math.abs(d[0] - x), dy = Math.abs(d[1] - y); dx = Math.min(dx, W - dx); dy = Math.min(dy, H - dy); return dx * dx + dy * dy > (d[2] + rad + 3) ** 2; })) { disks.push([x, y, rad]); break; }
      }
    }
    const vv = disks.reduce((a, d) => a + Math.PI * d[2] * d[2], 0) / A;
    const mean = disks.reduce((a, d) => a + d[2], 0) / disks.length;
    const um = 25 / (2 * r0); // 粒子の直径がおよそ 25 µm になる縮尺
    // 画素を描くときに近くの粒子だけを見るための格子(1 マスは最も大きい粒子の直径より大きい)
    const big = Math.max(...disks.map(d => d[2])) * 2 + 4, gx = Math.max(1, Math.floor(W / big)), gy = Math.max(1, Math.floor(H / big));
    const db = Array.from({ length: gx * gy }, () => []);
    disks.forEach((d, i) => db[Math.min(gy - 1, Math.floor(d[1] / H * gy)) * gx + Math.min(gx - 1, Math.floor(d[0] / W * gx))].push(i));
    return { p, W, H, um, disks, dbin: { gx, gy, db }, grains: null, truth: { vv, nPart: disks.length, mean: mean * um } };
  }
  // 1 相・2 相の多結晶: 粒の数 n、ASTM の粒度番号 g になる縮尺(N_A = n / 面積 が g の N_A にちょうどなる)
  const pts = seedPoints(p.n, W, H, r);
  const cs = cells(pts, W, H);
  const n = pts.length;
  const um = 1000 * Math.sqrt(n / naFromG(p.g) / A); // µm/px
  const gray = pts.map(() => 0.15 + 0.85 * r()), ang = pts.map(() => r() * Math.PI);
  let dark = pts.map(() => false);
  if (p.kind === 'two') {
    // 暗い相(パーライトに見立てる)の粒を、面積の割合が f % にいちばん近くなるまで選ぶ
    const order = pts.map((_, i) => i).sort((a, b) => gray[a] - gray[b]);
    let acc = 0;
    for (const i of order) {
      if (Math.abs(acc + cs[i].area - p.f / 100 * A) > Math.abs(acc - p.f / 100 * A)) continue;
      dark[i] = true; acc += cs[i].area;
    }
  }
  const sumA = cs.reduce((a, c) => a + c.area, 0);
  const LB = cs.reduce((a, c) => a + c.per, 0) / 2;
  const lPx = Math.PI * A / (2 * LB);
  const truth = { n, na: n / (A * (um / 1000) ** 2), l: lPx * um, area: sumA, LB, ...(p.kind === 'two' ? { vv: cs.reduce((a, c, i) => a + (dark[i] ? c.area : 0), 0) / A } : {}) };
  truth.gA = gFromNA(truth.na);
  truth.gL = gFromL(truth.l / 1000);
  return { p, W, H, um, grains: { pts, cs, gray, ang, dark, B: bins(pts, W, H, Math.sqrt(A / n)) }, disks: null, truth };
}
// 合成組織のある点の相(d 暗い相・l 明るい相)と粒の番号
export function synthAt(S, x, y) {
  if (S.disks) {
    for (const d of S.disks) {
      let dx = Math.abs(d[0] - x), dy = Math.abs(d[1] - y);
      dx = Math.min(dx, S.W - dx); dy = Math.min(dy, S.H - dy);
      if (dx * dx + dy * dy <= d[2] * d[2]) return { ph: 'd', g: -1 };
    }
    return { ph: 'l', g: -1 };
  }
  const xx = ((x % S.W) + S.W) % S.W, yy = ((y % S.H) + S.H) % S.H;
  const [a] = nearest(S.grains.B, xx, yy, 1);
  return { ph: S.grains.dark[a.i] ? 'd' : 'l', g: a.i };
}
// 理想的に数えた場合: パターンの線を細かくたどり、粒が変わる所を数える(三重点に当たる確率は 0)
export function idealIntercepts(S, el, step = 0.2) {
  return el.map(e => {
    const L = elLen(e), m = Math.max(16, Math.ceil(L / step));
    const at = u => (e.t === 'c' ? [e.cx + e.r * Math.cos(2 * Math.PI * u), e.cy + e.r * Math.sin(2 * Math.PI * u)] : [e.x1 + u * (e.x2 - e.x1), e.y1 + u * (e.y2 - e.y1)]);
    let prev = synthAt(S, ...at(0)).g, first = prev, c = 0;
    for (let k = 1; k <= m; k++) {
      if (e.t === 'c' && k === m) { if (prev !== first) c++; break; }
      const g = synthAt(S, ...at(k / m)).g;
      if (g !== prev) c++;
      prev = g;
    }
    return c;
  });
}
// 理想的な面積法: 粒の多角形(周期の写し 9 つ)が枠の中にすっかり入るか、枠にかかるか。四角の枠では四隅を含む粒を分ける
export function idealPlanimetric(S, fr) {
  let nIn = 0, nCut = 0, nCorner = 0;
  const corners = fr.t === 'r' ? [[fr.x, fr.y], [fr.x + fr.w, fr.y], [fr.x, fr.y + fr.h], [fr.x + fr.w, fr.y + fr.h]] : [];
  const inPoly = (poly, x, y) => {
    let s = 0;
    for (let k = 0; k < poly.length; k++) {
      const a = poly[k], b = poly[(k + 1) % poly.length], c = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
      if (c !== 0) { if (s === 0) s = Math.sign(c); else if (Math.sign(c) !== s) return false; }
    }
    return true;
  };
  const segDist = (a, b, x, y) => { const dx = b[0] - a[0], dy = b[1] - a[1], u = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / (dx * dx + dy * dy))); return Math.hypot(a[0] + u * dx - x, a[1] + u * dy - y); };
  for (const c of S.grains.cs) for (const sy of [-S.H, 0, S.H]) for (const sx of [-S.W, 0, S.W]) {
    const poly = c.poly.map(q => [q[0] + sx, q[1] + sy]);
    let state;
    if (fr.t === 'c') {
      const dmax = Math.max(...poly.map(q => Math.hypot(q[0] - fr.cx, q[1] - fr.cy)));
      const dmin = inPoly(poly, fr.cx, fr.cy) ? 0 : Math.min(...poly.map((q, k) => segDist(q, poly[(k + 1) % poly.length], fr.cx, fr.cy)));
      state = dmax <= fr.r ? 'in' : dmin < fr.r ? 'cut' : 'out';
    } else {
      const xs = poly.map(q => q[0]), ys = poly.map(q => q[1]);
      const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
      if (x0 >= fr.x && x1 <= fr.x + fr.w && y0 >= fr.y && y1 <= fr.y + fr.h) state = 'in';
      else if (x1 <= fr.x || x0 >= fr.x + fr.w || y1 <= fr.y || y0 >= fr.y + fr.h) state = 'out';
      else {
        // 凸多角形と長方形が重なるか(分離軸: 多角形の辺の法線)
        let sep = false;
        for (let k = 0; k < poly.length && !sep; k++) {
          const a = poly[k], b = poly[(k + 1) % poly.length], nxv = b[1] - a[1], nyv = a[0] - b[0];
          const pr = corners.map(q => (q[0] - a[0]) * nxv + (q[1] - a[1]) * nyv), pp = poly.map(q => (q[0] - a[0]) * nxv + (q[1] - a[1]) * nyv);
          if (Math.min(...pr) >= Math.max(...pp) || Math.max(...pr) <= Math.min(...pp)) sep = true;
        }
        state = sep ? 'out' : 'cut';
      }
      if (state === 'cut' && corners.some(q => inPoly(poly, q[0], q[1]))) state = 'corner';
    }
    if (state === 'in') nIn++;
    else if (state === 'cut') nCut++;
    else if (state === 'corner') nCorner++;
  }
  return { nIn, nCut, nCorner, n: nIn + 0.5 * nCut + (fr.t === 'r' ? 1 : 0) };
}
// 理想的な点算法: 格子の点が暗い相に乗った数
export const idealPoints = (S, pts) => pts.reduce((a, q) => a + (synthAt(S, q[0], q[1]).ph === 'd' ? 1 : 0), 0);

// 合成組織の画素を描く(y0 から y1 の行)。粒の中は粒ごとの明るさ、粒界は暗い線(二等分線までの距離で滑らかに)、
// 暗い相はパーライトに見立てた縞、粒子は暗い円。少しの雑音を足す
export function paintSynth(S, data, y0, y1) {
  const { W } = S;
  const hw = 1.3; // 粒界の線の半分の幅(画素)
  const noise = (x, y) => { let h = Math.imul(x * 374761393 + y * 668265263 + S.p.seed * 2246822519, 1274126177); h ^= h >>> 13; return ((h >>> 0) % 1000) / 1000 - 0.5; };
  for (let y = y0; y < y1; y++) for (let x = 0; x < W; x++) {
    const px = x + 0.5, py = y + 0.5;
    let v;
    if (S.disks) {
      v = 214 + 10 * noise(x >> 2, y >> 2);
      const { gx, gy, db } = S.dbin, ix = Math.min(gx - 1, Math.floor(px / S.W * gx)), iy = Math.min(gy - 1, Math.floor(py / S.H * gy));
      const near = [];
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) near.push(...db[((iy + dy + gy) % gy) * gx + ((ix + dx + gx) % gx)]);
      for (const d of (gx < 3 || gy < 3 ? S.disks : near.map(i => S.disks[i]))) {
        let dx = Math.abs(d[0] - px), dy = Math.abs(d[1] - py);
        dx = Math.min(dx, S.W - dx); dy = Math.min(dy, S.H - dy);
        const e = Math.sqrt(dx * dx + dy * dy) - d[2];
        if (e < 1) { const a = Math.max(0, Math.min(1, (e + 1) / 2)); v = (52 + 18 * noise(x, y)) * (1 - a) + v * a; }
      }
    } else {
      const G = S.grains, [a, b] = nearest(G.B, px, py, 2);
      const ax = G.pts[a.i][0] + a.sx, ay = G.pts[a.i][1] + a.sy, bx = G.pts[b.i][0] + b.sx, by = G.pts[b.i][1] + b.sy;
      const db = (b.d2 - a.d2) / (2 * Math.hypot(bx - ax, by - ay));
      let base;
      if (G.dark[a.i]) {
        const th = G.ang[a.i], s = Math.sin(2 * Math.PI * (px * Math.cos(th) + py * Math.sin(th)) / 5.5);
        base = 92 + 34 * s;
      } else base = S.p.kind === 'two' ? 222 - 14 * G.gray[a.i] : 236 - 52 * G.gray[a.i];
      const k = Math.max(0, Math.min(1, (db - hw) / 1.1));
      v = 34 + (base - 34) * k + 6 * noise(x, y);
    }
    const o = (y * W + x) * 4, c = Math.max(0, Math.min(255, Math.round(v)));
    data[o] = c; data[o + 1] = c; data[o + 2] = Math.max(0, Math.min(255, c + 4)); data[o + 3] = 255;
  }
}
// スケールバーの長さ(切りのよい µm)。組織の幅の 1/5 前後
export function niceBar(umPerPx, W) {
  const target = umPerPx * W / 5, e = 10 ** Math.floor(Math.log10(target));
  const m = [1, 2, 5, 10].find(k => k * e >= target / 1.6) ?? 10;
  return m * e;
}

// ================================================================ 画面(ここから下は DOM を使う)
function init() {
  const T = JSON.parse(app.dataset.t);
  const D = JSON.parse(app.dataset.d); // { rules: { icpt: [[k, 文]], plan, pt }, presets: [{ name, atlas, url }], refs }
  const lang = document.documentElement.lang || 'en';
  const t = (k, v = {}) => (T[k] ?? k).replace(/\{(\w+)\}/g, (_, x) => (v[x] ?? ''));
  // 数値の書式(言語に合わせる)。d: 小数の桁、sig: 有効数字
  const nfs = {};
  const nf = (x, d = 0) => (x == null || !Number.isFinite(x) ? '—' : (nfs[d] ??= new Intl.NumberFormat(lang, { minimumFractionDigits: d, maximumFractionDigits: d })).format(x));
  const sigD = (x, s = 3) => (x === 0 || !Number.isFinite(x) ? 0 : Math.max(0, s - 1 - Math.floor(Math.log10(Math.abs(x)))));
  const sig = (x, s = 3) => nf(x, sigD(x, s));
  const raw = (x, s = 6) => (x == null || !Number.isFinite(x) ? '' : String(Number(x.toPrecision(s)))); // CSV 用(小数点はいつも「.」)
  const COLORS = ['#e8590c', '#1c7ed6', '#2f9e44', '#ae3ec9', '#f08c00', '#0c8599'];
  const KEY = 'ms:v1';

  // ---------------- 状態
  const fresh = () => ({
    v: 1, img: null, syn: null, scales: {}, method: 'icpt',
    set: { icpt: { pat: 'c3', size: 0.8 }, plan: { shape: 'circle', size: 0.8 }, pt: { n: 5, size: 0.8 } },
    phases: [{ id: 'p1', name: '', c: 0 }], cur: { icpt: -1, plan: -1, pt: -1 }, fields: { icpt: [], plan: [], pt: [] },
    tool: { icpt: 'x', plan: 'in', pt: 'p1', half: false }, reveal: false,
  });
  let st = fresh(), saved = null;
  try { saved = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch {}
  if (saved?.v === 1 && saved.fields) st = { ...fresh(), ...saved, reveal: false };
  let src = null, S = null; // 画像(ImageBitmap か canvas)、合成組織のデータ
  let view = { s: 1, ox: 0, oy: 0 }, mode = 'count', pick = null; // pick: スケールバーの端を選んでいる途中('a' | 'b')
  const undo = [];
  let saveTimer;
  const save = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch {} }, 300); };

  // ---------------- 小さな部品
  const el = (tag, attrs = {}, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v;
      else if (k === 'text') e.textContent = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat()) if (c != null) e.append(c);
    return e;
  };
  const btn = (text, on, cls = 'btn btn-ghost btn-small', attrs = {}) => el('button', { type: 'button', class: cls, onclick: on, ...attrs }, text);
  const sel = (label, opts, value, on, attrs = {}) => {
    const s = el('select', attrs, opts.map(([v, x]) => el('option', { value: v, selected: String(v) === String(value) }, x)));
    s.addEventListener('change', () => on(s.value));
    return el('label', { class: 'ms-f' }, el('span', { text: label }), s);
  };
  const num = (label, value, on, attrs = {}) => {
    const i = el('input', { type: 'number', inputmode: 'decimal', step: 'any', min: '0', value: value ?? '', ...attrs });
    i.addEventListener('input', () => on(i.value === '' ? null : Number(i.value)));
    return el('label', { class: 'ms-f' }, el('span', { text: label }), i);
  };
  const root = app.querySelector('.ms-root');
  const msg = el('p', { class: 'fm-msg ms-msg', role: 'status', hidden: true });
  let msgTimer;
  const flash = text => { msg.textContent = text; msg.hidden = false; clearTimeout(msgTimer); msgTimer = setTimeout(() => { msg.hidden = true; }, 3000); };
  async function copyText(text, done) {
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch {}
    if (!ok) { // クリップボードが使えないときは、選んでコピーできる欄に出す
      const ta = el('textarea', { class: 'ms-copy', rows: 6, readonly: true });
      ta.value = text;
      out.after(ta); ta.focus(); ta.select();
      flash(t('measure_copy_manual'));
      return;
    }
    flash(done);
  }
  const download = (blob, name) => {
    const u = URL.createObjectURL(blob), a = el('a', { href: u, download: name });
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 4000);
  };

  // ---------------- 画像の範囲・スケール
  const region = () => (st.img ? (st.syn ? { x: 0, y: 0, w: SYN.W, h: SYN.H } : { x: 0, y: 0, w: st.img.w, h: st.img.h }) : null);
  const scaleOf = key => st.scales[key] ?? null;
  const umOf = key => { const s = scaleOf(key); return s && s.um > 0 ? s.um : null; };
  const um = () => (st.img ? umOf(st.img.key) : null);
  function calcScale(sc) {
    if (!sc || !st.img) return null;
    const v = sc.mode === 'bar' ? (sc.bar?.a && sc.bar?.b && sc.bar.len > 0 ? sc.bar.len / Math.hypot(sc.bar.b[0] - sc.bar.a[0], sc.bar.b[1] - sc.bar.a[1]) : null)
      : sc.mode === 'px' ? sc.px
        : sc.mode === 'mag' ? (sc.m > 0 && sc.wmm > 0 ? sc.wmm * 1000 / sc.m / st.img.w : null)
          : sc.fov > 0 ? sc.fov / st.img.w : null;
    return v > 0 && Number.isFinite(v) ? v : null;
  }
  const lenTxt = umv => (umv == null ? '—' : umv >= 1000 ? `${sig(umv / 1000, 4)} mm` : `${sig(umv, 4)} µm`);

  // ---------------- 視野
  const isMarked = (m, f) => (m === 'pt' ? f.pts.some(Boolean) : f.marks.length > 0);
  // 結果に入れる視野: 印のある視野だけ(点算法では、相に乗った点がないことを確かめた「0 点の視野」も入れる)
  const isCounted = (m, f) => isMarked(m, f) || (m === 'pt' && f.zero === true);
  const counted = m => st.fields[m].filter(f => isCounted(m, f));
  function newField(m, place = 'center') {
    const R = region(), s = st.set[m], size = Math.max(20, s.size * Math.min(R.w, R.h));
    let cx = R.x + R.w / 2, cy = R.y + R.h / 2;
    if (place === 'random') { const h = size / 2; cx = R.x + h + Math.random() * Math.max(0, R.w - size); cy = R.y + h + Math.random() * Math.max(0, R.h - size); }
    const base = { img: st.img.key, name: st.img.name, cx, cy, size, done: false };
    if (m === 'icpt') return { ...base, pat: s.pat, marks: [] };
    if (m === 'plan') return { ...base, shape: s.shape, marks: [] };
    return { ...base, n: s.n, pts: Array(s.n * s.n).fill(null) };
  }
  function field(m = st.method) {
    if (!st.img) return null;
    let f = st.fields[m][st.cur[m]];
    if (!f || f.img !== st.img.key) {
      f = newField(m);
      st.fields[m].push(f);
      st.cur[m] = st.fields[m].length - 1;
    }
    return f;
  }
  const geom = (m, f) => (m === 'icpt' ? pattern(f.pat, f.cx, f.cy, f.size) : m === 'plan' ? frame(f.shape, f.cx, f.cy, f.size) : grid(f.n, f.cx, f.cy, f.size));
  const snapshot = (m, f) => ({ m, f, data: JSON.stringify(m === 'pt' ? f.pts : f.marks) });
  const remember = (m, f) => { undo.push(snapshot(m, f)); if (undo.length > 200) undo.shift(); };
  function changed() { save(); draw(); renderPanel(); renderResults(); }

  // ================= 画面をつくる
  // 1. 画像を開く
  const fileIn = el('input', { type: 'file', accept: 'image/*', class: 'ms-file' });
  const drop = el('div', { class: 'ms-drop' },
    el('p', { class: 'ms-drop-t' }, t('measure_open_drop'), ' ', el('label', { class: 'btn btn-primary btn-small ms-pick' }, fileIn, t('measure_open_pick'))),
    el('p', { class: 'ms-drop-n muted', text: t('measure_open_fmt') }));
  const imgInfo = el('p', { class: 'ms-info', 'aria-live': 'polite' });
  const restoreBox = el('div', { class: 'mt-nb ms-restore', hidden: true });
  // 練習用の合成組織
  const sp = st.syn ?? { kind: 'poly', g: 7, n: 200, f: 30, seed: 1 + Math.floor(Math.random() * 99999) };
  const synBox = el('div', { class: 'ms-syn-grid' });
  const synMsg = el('p', { class: 'ms-syn-msg muted', 'aria-live': 'polite' });
  function renderSynForm() {
    synBox.replaceChildren(
      sel(t('measure_syn_kind'), SYN.kinds.map(k => [k, t(`measure_syn_${k}`)]), sp.kind, v => { sp.kind = v; if (v === 'part') { sp.n = SYN.pn.includes(sp.n) ? sp.n : 80; sp.f = Math.min(sp.f, 30) || 10; } else if (!SYN.n.includes(sp.n)) sp.n = 200; renderSynForm(); }),
      ...(sp.kind !== 'part' ? [sel(t('measure_syn_g'), SYN.g.map(g => [g, `G ${g}`]), sp.g, v => { sp.g = Number(v); })] : []),
      sel(t(sp.kind === 'part' ? 'measure_syn_pn' : 'measure_syn_n'), (sp.kind === 'part' ? SYN.pn : SYN.n).map(n => [n, nf(n)]), sp.n, v => { sp.n = Number(v); }),
      ...(sp.kind !== 'poly' ? [sel(t('measure_syn_f'), (sp.kind === 'part' ? SYN.f.filter(x => x <= 30) : SYN.f).map(f => [f, `${nf(f)} %`]), sp.f, v => { sp.f = Number(v); })] : []),
      num(t('measure_syn_seed'), sp.seed, v => { if (Number.isInteger(v) && v >= 0 && v < 2 ** 31) sp.seed = v; }, { step: '1', inputmode: 'numeric', class: 'ms-seed' }),
    );
  }
  renderSynForm();
  const synDet = el('details', { class: 'ms-syn' }, el('summary', { text: t('measure_syn_h') }),
    el('p', { class: 'ms-syn-lead', text: t('measure_syn_lead') }), synBox,
    el('div', { class: 'fm-sel-btns' },
      btn(t('measure_syn_make'), () => makeSyn({ ...sp }), 'btn btn-primary btn-small'),
      btn(t('measure_syn_rand'), () => { sp.seed = 1 + Math.floor(Math.random() * 999999); renderSynForm(); makeSyn({ ...sp }); }),
      btn(t('measure_syn_share'), () => { if (!st.syn) { flash(t('measure_syn_first')); return; } copyText(new URL(`${location.pathname}?${synQuery(st.syn)}`, location.origin).href, t('compare_link_copied')); })),
    synMsg);

  // 2. 画像を見る所
  const cv = el('canvas', { class: 'ms-cv', tabindex: '0', 'aria-label': t('measure_cv_label') });
  const empty = el('p', { class: 'ms-empty muted', text: t('measure_view_empty') });
  const stage = el('div', { class: 'ms-stage' }, cv, empty);
  const hint = el('p', { class: 'ms-hint', 'aria-live': 'polite' });
  // 画像のすぐ下の小さな道具の列: 付ける印の種類・この視野の数・次の視野へ(スマートフォンで、印を替えるたびに下まで動かなくてよいように)
  const qbar = el('div', { class: 'ms-qbar', role: 'group', 'aria-label': t('measure_qbar') });
  const modeBtns = ['count', 'move'].map(k => btn(t(`measure_mode_${k}`), () => setMode(k), 'chip', { 'aria-pressed': String(mode === k), 'data-mode': k }));
  const bar = el('div', { class: 'ms-bar', role: 'toolbar', 'aria-label': t('measure_toolbar') },
    el('span', { class: 'ms-seg' }, modeBtns),
    el('span', { class: 'ms-zoom' },
      btn('−', () => zoomAt(1 / 1.4), 'chip ms-z', { 'aria-label': t('measure_zoom_out') }),
      btn('+', () => zoomAt(1.4), 'chip ms-z', { 'aria-label': t('measure_zoom_in') }),
      btn(t('measure_zoom_fit'), () => { fit(); draw(); }, 'chip')),
    btn(t('measure_undo'), () => doUndo(), 'chip ms-undo'));

  // 3. スケール
  const scaleBox = el('div', { class: 'ms-scale-body' });
  // スケールの欄は、スケールが決まったらたためる(見出しに今のスケールを出す)
  const scaleSum = el('span', { class: 'ms-scale-sum muted' });
  const scaleDet = el('details', { class: 'ms-scale-det', open: true }, el('summary', {}, el('h3', { id: 'ms-h-scale', text: t('measure_scale_h') }), scaleSum), scaleBox);
  // 4. 数える
  const tabs = el('div', { class: 'ms-tabs', role: 'tablist', 'aria-label': t('measure_meth_h') }, ['icpt', 'plan', 'pt'].map(m =>
    el('button', { type: 'button', role: 'tab', class: 'ms-tab', id: `ms-tab-${m}`, 'aria-controls': 'ms-panel', 'aria-selected': String(st.method === m), onclick: () => { st.method = m; changed(); renderTabs(); } }, t(`measure_m_${m}`))));
  const panel = el('div', { class: 'ms-panel', id: 'ms-panel', role: 'tabpanel' });
  // 5. 結果
  const out = el('div', { class: 'ms-out', 'aria-live': 'polite' });
  const ansBox = el('div', { class: 'ms-ans' });
  const resBtns = el('div', { class: 'fm-sel-btns ms-res-btns' },
    btn(t('measure_copy_text'), () => copyText(reportText(), t('measure_copied'))),
    btn(t('measure_copy_csv'), () => copyText(reportCsv(), t('measure_copied'))),
    btn(t('measure_save_csv'), () => download(new Blob(['﻿' + reportCsv()], { type: 'text/csv' }), `${fileBase()}.csv`)),
    btn(t('measure_save_png'), () => savePng()),
    btn(t('measure_reset'), () => resetAll(), 'btn btn-ghost btn-small ms-danger'));

  root.replaceChildren(
    el('section', { class: 'ms-step ms-open', 'aria-labelledby': 'ms-h-open' }, el('h3', { id: 'ms-h-open', text: t('measure_open_h') }), restoreBox, drop, synDet, imgInfo),
    el('section', { class: 'ms-step ms-view', 'aria-label': t('measure_view_h') }, bar, stage, qbar, hint),
    el('section', { class: 'ms-step ms-scale', 'aria-labelledby': 'ms-h-scale' }, scaleDet),
    el('section', { class: 'ms-step ms-meth', 'aria-labelledby': 'ms-h-meth' }, el('h3', { id: 'ms-h-meth', text: t('measure_meth_h') }), tabs, panel),
    el('section', { class: 'ms-step ms-res', 'aria-labelledby': 'ms-h-res' }, el('h3', { id: 'ms-h-res', text: t('measure_res_h') }), out, resBtns, msg, ansBox),
  );

  // ================= 画像を開く
  fileIn.addEventListener('change', () => { if (fileIn.files?.[0]) openFile(fileIn.files[0]); fileIn.value = ''; });
  for (const ev of ['dragenter', 'dragover']) drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('is-over'); });
  for (const ev of ['dragleave', 'drop']) drop.addEventListener(ev, () => drop.classList.remove('is-over'));
  drop.addEventListener('drop', e => { e.preventDefault(); const f = [...(e.dataTransfer?.files ?? [])].find(x => x.type.startsWith('image/') || /\.(png|jpe?g|webp|bmp|gif|tiff?|avif)$/i.test(x.name)); if (f) openFile(f); });
  async function openFile(file) {
    let bmp = null;
    try { bmp = await createImageBitmap(file); } catch {
      // createImageBitmap が使えないブラウザは <img> で読む(URL はこのページの中だけの blob:)
      try {
        const u = URL.createObjectURL(file);
        bmp = await new Promise((ok, ng) => { const im = new Image(); im.onload = () => ok(im); im.onerror = ng; im.src = u; });
        setTimeout(() => URL.revokeObjectURL(u), 1000);
      } catch { bmp = null; }
    }
    if (!bmp || !(bmp.width > 0)) { flash(t('measure_open_bad', { name: file.name })); imgInfo.textContent = t('measure_open_bad', { name: file.name }); return; }
    S = null;
    setImage({ key: `file:${file.name}|${bmp.width}x${bmp.height}|${file.size}`, name: file.name, w: bmp.width, h: bmp.height }, bmp, null);
  }
  async function makeSyn(p) {
    synMsg.textContent = t('measure_syn_busy');
    await new Promise(r => setTimeout(r, 20));
    const SS = makeSynth(p);
    const c = document.createElement('canvas');
    c.width = SYN.W; c.height = SYN.H + SYN.bar;
    const g = c.getContext('2d');
    const id = g.createImageData(SYN.W, SYN.H);
    // 重い描画は行ごとに分け、間に画面へ返す(画面を止めない)
    for (let y = 0; y < SYN.H; y += 48) {
      paintSynth(SS, id.data, y, Math.min(SYN.H, y + 48));
      synMsg.textContent = t('measure_syn_busy_p', { p: Math.round(100 * y / SYN.H) });
      await new Promise(r => setTimeout(r, 0));
    }
    g.putImageData(id, 0, 0);
    // 下の帯: スケールバーと条件
    g.fillStyle = '#fff'; g.fillRect(0, SYN.H, SYN.W, SYN.bar);
    const barUm = niceBar(SS.um, SYN.W), barPx = barUm / SS.um, x0 = 24, yb = SYN.H + 34;
    g.fillStyle = '#000'; g.fillRect(x0, yb - 6, barPx, 8);
    g.font = '600 20px system-ui, sans-serif'; g.textBaseline = 'alphabetic';
    g.fillText(`${barUm} µm`, x0 + barPx + 14, yb + 2);
    g.font = '16px system-ui, sans-serif'; g.fillStyle = '#444';
    const lab = `${t('measure_syn_tag')} ${synQuery(p)}`;
    g.fillText(lab, SYN.W - 24 - g.measureText(lab).width, yb + 2);
    S = SS;
    S.barPx = { a: [x0, yb - 2], b: [x0 + barPx, yb - 2], um: barUm };
    synMsg.textContent = t('measure_syn_done', { k: t(`measure_syn_${p.kind}`) });
    const key = synKey(p);
    if (!st.scales[key]) st.scales[key] = { mode: 'px', px: Number(SS.um.toPrecision(6)), um: Number(SS.um.toPrecision(6)), auto: true, bar: { len: barUm, level: true } };
    st.syn = p;
    setImage({ key, name: t('measure_syn_name', { k: t(`measure_syn_${p.kind}`), seed: p.seed }), w: SYN.W, h: SYN.H + SYN.bar }, c, p);
    try { history.replaceState(history.state, '', `${location.pathname}?${synQuery(p)}${location.hash}`); } catch {}
    // 点算法の相: 合成組織の 2 相・粒子では「暗い相」を用意する(答え合わせはこの相で)
    if (p.kind !== 'poly' && !st.phases.some(x => x.id === 'd')) {
      const used = st.fields.pt.some(f => isMarked('pt', f));
      if (!used) st.phases = [{ id: 'd', name: t('measure_syn_dark'), c: 0 }];
      else st.phases.push({ id: 'd', name: t('measure_syn_dark'), c: st.phases.length % COLORS.length });
      st.tool.pt = 'd';
    }
    if (st.method === 'icpt' && p.kind === 'part') st.method = 'pt';
    renderTabs();
    changed();
  }
  function setImage(info, source, syn) {
    const prev = st.img ?? st._prev ?? null;
    delete st._prev;
    src = source;
    if (!syn) st.syn = null;
    if (!prev || prev.key !== info.key) {
      // 別の画像: 写真どうしなら、数えた視野は「終えた視野」として残し(同じ試料の別の視野)、この画像の新しい視野を始める。
      // 合成組織に変えたとき・合成組織から変えたときは、別の試料なので前の視野を片付ける
      const other = prev && (prev.key.startsWith('syn:') || info.key.startsWith('syn:'));
      if (other && Object.keys(st.fields).some(m => st.fields[m].some(f => isCounted(m, f)))) flash(t('measure_new_specimen'));
      for (const m of ['icpt', 'plan', 'pt']) {
        st.fields[m] = other ? [] : st.fields[m].filter(f => isCounted(m, f));
        for (const f of st.fields[m]) f.done = true;
        st.cur[m] = -1;
      }
      if (other) undo.length = 0;
      st.img = info;
      if (!st.scales[info.key] && prev && umOf(prev.key)) { st.scales[info.key] = { ...st.scales[prev.key], carried: prev.name }; if (st.scales[info.key].mode === 'bar') st.scales[info.key] = { mode: 'px', px: umOf(prev.key), um: umOf(prev.key), carried: prev.name }; }
    } else st.img = info;
    st.reveal = false;
    restoreBox.hidden = true;
    empty.hidden = true;
    stage.classList.add('has-img');
    imgInfo.textContent = t('measure_img_info', { name: info.name, w: nf(info.w), h: nf(info.h) });
    resize(); fit();
    for (const m of ['icpt', 'plan', 'pt']) field(m);
    scaleDet.open = !um();
    renderScale(); changed();
    setHint();
  }

  // ================= 表示(拡大・移動)
  const dpr = () => window.devicePixelRatio || 1;
  let cssW = 300, cssH = 240;
  function resize() {
    const w = stage.clientWidth || 300;
    const ih = st.img ? st.img.h : 3, iw = st.img ? st.img.w : 4;
    const h = Math.round(Math.max(240, Math.min(window.innerHeight * 0.68, w * ih / iw)));
    cssW = w; cssH = st.img ? h : 160;
    cv.style.height = `${cssH}px`;
    cv.width = Math.round(cssW * dpr()); cv.height = Math.round(cssH * dpr());
  }
  function fit() {
    if (!st.img) return;
    const s = Math.min(cssW / st.img.w, cssH / st.img.h);
    view = { s, ox: (cssW - st.img.w * s) / 2, oy: (cssH - st.img.h * s) / 2 };
  }
  const minS = () => (st.img ? Math.min(cssW / st.img.w, cssH / st.img.h) * 0.5 : 0.1);
  function clampView() {
    if (!st.img) return;
    view.s = Math.max(minS(), Math.min(40, view.s));
    const w = st.img.w * view.s, h = st.img.h * view.s, m = 40;
    view.ox = w < cssW ? (cssW - w) / 2 : Math.min(m, Math.max(cssW - w - m, view.ox));
    view.oy = h < cssH ? (cssH - h) / 2 : Math.min(m, Math.max(cssH - h - m, view.oy));
  }
  function zoomAt(k, sx = cssW / 2, sy = cssH / 2) {
    if (!st.img) return;
    const ix = (sx - view.ox) / view.s, iy = (sy - view.oy) / view.s;
    view.s *= k; clampView();
    view.ox = sx - ix * view.s; view.oy = sy - iy * view.s; clampView();
    draw();
  }
  const toImg = (sx, sy) => [(sx - view.ox) / view.s, (sy - view.oy) / view.s];
  function setMode(k) {
    mode = k;
    for (const b of modeBtns) b.setAttribute('aria-pressed', String(b.dataset.mode === k));
    stage.classList.toggle('is-move', k === 'move');
    setHint();
  }
  function setHint(text) {
    if (text) { hint.textContent = text; return; }
    if (!st.img) { hint.textContent = t('measure_h_noimg'); return; }
    if (pick) { hint.textContent = t(pick === 'a' ? 'measure_h_scale_a' : 'measure_h_scale_b'); return; }
    hint.textContent = mode === 'move' ? t('measure_h_move') : `${t(`measure_h_${st.method}`)} ${t('measure_h_scroll')}`;
  }

  // ================= 描く
  let raf = 0;
  function draw() { if (!raf) raf = requestAnimationFrame(() => { raf = 0; paint(cv.getContext('2d'), dpr(), view, false); }); }
  // 画像の上の重ね描き。g は文脈、k は画像 1 画素あたりの出力の画素(書き出しでは 1)
  function overlay(g, k, forPng) {
    const z = forPng ? Math.max(1, g.canvas.width / 1100) : 1, lw = px => px * z / k;
    // スケールバーを選んだ線
    const sc = st.img && scaleOf(st.img.key);
    if (!forPng && sc?.mode === 'bar' && sc.bar?.a) {
      g.strokeStyle = '#ffd43b'; g.lineWidth = lw(3);
      g.beginPath(); g.moveTo(...sc.bar.a); g.lineTo(...(sc.bar.b ?? sc.bar.a)); g.stroke();
      for (const p of [sc.bar.a, sc.bar.b].filter(Boolean)) { g.beginPath(); g.arc(p[0], p[1], lw(6), 0, 7); g.fillStyle = '#ffd43b'; g.fill(); g.lineWidth = lw(1.5); g.strokeStyle = '#000'; g.stroke(); }
    }
    if (!st.img) return;
    const m = st.method, f = field(m), G = geom(m, f);
    const line = (draw1, color, w) => { g.lineCap = 'round'; g.strokeStyle = 'rgba(0,0,0,.65)'; g.lineWidth = lw(w + 2.5); draw1(); g.stroke(); g.strokeStyle = color; g.lineWidth = lw(w); draw1(); g.stroke(); };
    if (m === 'icpt') for (const e of G.el) line(() => { g.beginPath(); if (e.t === 'c') g.arc(e.cx, e.cy, e.r, 0, 2 * Math.PI); else { g.moveTo(e.x1, e.y1); g.lineTo(e.x2, e.y2); } }, '#22d3ee', 2);
    if (m === 'plan') line(() => { g.beginPath(); if (G.t === 'c') g.arc(G.cx, G.cy, G.r, 0, 2 * Math.PI); else g.rect(G.x, G.y, G.w, G.h); }, '#22d3ee', 2);
    const R = lw(7);
    const dot = (x, y, color, shape) => {
      g.beginPath();
      if (shape === 'tri') { g.moveTo(x, y - R * 1.25); g.lineTo(x + R * 1.1, y + R * 0.8); g.lineTo(x - R * 1.1, y + R * 0.8); g.closePath(); }
      else if (shape === 'dia') { g.moveTo(x, y - R * 1.2); g.lineTo(x + R * 1.2, y); g.lineTo(x, y + R * 1.2); g.lineTo(x - R * 1.2, y); g.closePath(); }
      else g.arc(x, y, R, 0, 2 * Math.PI);
      g.fillStyle = color; g.fill(); g.lineWidth = lw(1.6); g.strokeStyle = '#fff'; g.stroke();
      if (shape === 'half') { g.beginPath(); g.arc(x, y, R, -Math.PI / 2, Math.PI / 2); g.closePath(); g.fillStyle = '#fff'; g.fill(); }
      if (shape === 'ring') { g.beginPath(); g.arc(x, y, R * 0.45, 0, 2 * Math.PI); g.fillStyle = '#fff'; g.fill(); }
    };
    if (m === 'icpt') for (const mk of f.marks) dot(mk.x, mk.y, { x: '#f03e3e', j: '#f59f00', t: '#7048e8', e: '#2f9e44' }[mk.k], { x: 'c', j: 'tri', t: 'dia', e: 'half' }[mk.k]);
    if (m === 'plan') for (const mk of f.marks) dot(mk.x, mk.y, mk.k === 'in' ? '#2f9e44' : '#f59f00', mk.k === 'in' ? 'c' : 'ring');
    if (m === 'pt') {
      const col = id => COLORS[(st.phases.find(p => p.id === id)?.c ?? 0) % COLORS.length];
      G.pts.forEach(([x, y], i) => {
        const a = f.pts[i];
        if (!a) {
          const c = lw(6);
          g.lineWidth = lw(3.5); g.strokeStyle = 'rgba(0,0,0,.7)';
          g.beginPath(); g.moveTo(x - c, y); g.lineTo(x + c, y); g.moveTo(x, y - c); g.lineTo(x, y + c); g.stroke();
          g.lineWidth = lw(1.6); g.strokeStyle = '#fff'; g.stroke();
          return;
        }
        // 割り当てた点: 相の色の円(½ は半分だけ塗る)
        let a0 = -Math.PI / 2;
        g.beginPath(); g.arc(x, y, R, 0, 2 * Math.PI); g.fillStyle = 'rgba(255,255,255,.9)'; g.fill();
        for (const [id, w] of a) { g.beginPath(); g.moveTo(x, y); g.arc(x, y, R, a0, a0 + 2 * Math.PI * w); g.closePath(); g.fillStyle = col(id); g.fill(); a0 += 2 * Math.PI * w; }
        g.beginPath(); g.arc(x, y, R, 0, 2 * Math.PI); g.lineWidth = lw(1.6); g.strokeStyle = '#000'; g.stroke();
      });
    }
  }
  function paint(g, k, v, forPng) {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, g.canvas.width, g.canvas.height);
    g.lineCap = 'round'; g.lineJoin = 'round'; // 前に描いたときの線の端の形を持ち越さない(同じ状態なら同じ絵になるように)
    if (!st.img || !src) return;
    g.setTransform(k * v.s, 0, 0, k * v.s, k * v.ox, k * v.oy);
    g.imageSmoothingEnabled = v.s < 2;
    g.drawImage(src, 0, 0);
    overlay(g, k * v.s, forPng);
  }

  // ================= 指・マウス
  const ptrs = new Map();
  let gesture = null; // { kind: 'tap' | 'pan' | 'pinch', ... }
  const pos = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  cv.addEventListener('pointerdown', e => {
    if (!st.img) return;
    const p = pos(e);
    ptrs.set(e.pointerId, p);
    if (e.pointerType !== 'touch' || mode === 'move') try { cv.setPointerCapture(e.pointerId); } catch {}
    if (ptrs.size === 2 && (mode === 'move' || e.pointerType !== 'touch')) {
      const [a, b] = [...ptrs.values()];
      gesture = { kind: 'pinch', d: Math.hypot(a[0] - b[0], a[1] - b[1]), c: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], v: { ...view } };
    } else if (ptrs.size === 1) gesture = { kind: 'tap', p0: p, t0: performance.now(), v: { ...view }, move: mode === 'move' || e.pointerType === 'mouse' };
    else gesture = null;
  });
  cv.addEventListener('pointermove', e => {
    if (!ptrs.has(e.pointerId) || !gesture) return;
    const p = pos(e);
    ptrs.set(e.pointerId, p);
    if (gesture.kind === 'pinch' && ptrs.size === 2) {
      const [a, b] = [...ptrs.values()], d = Math.hypot(a[0] - b[0], a[1] - b[1]), c = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      const s = gesture.v.s * d / gesture.d, ix = (gesture.c[0] - gesture.v.ox) / gesture.v.s, iy = (gesture.c[1] - gesture.v.oy) / gesture.v.s;
      view.s = s; clampView(); view.ox = c[0] - ix * view.s; view.oy = c[1] - iy * view.s; clampView(); draw();
      e.preventDefault();
      return;
    }
    const dx = p[0] - gesture.p0[0], dy = p[1] - gesture.p0[1];
    if (gesture.kind === 'tap' && Math.hypot(dx, dy) > 6 && gesture.move) gesture.kind = 'pan';
    if (gesture.kind === 'pan') { view.ox = gesture.v.ox + dx; view.oy = gesture.v.oy + dy; clampView(); draw(); e.preventDefault(); }
  });
  const end = e => {
    if (!ptrs.has(e.pointerId)) return;
    const p = pos(e);
    ptrs.delete(e.pointerId);
    if (e.type === 'pointerup' && gesture?.kind === 'tap' && Math.hypot(p[0] - gesture.p0[0], p[1] - gesture.p0[1]) <= 8 && performance.now() - gesture.t0 < 800) tap(p);
    if (!ptrs.size) gesture = null;
  };
  cv.addEventListener('pointerup', end);
  cv.addEventListener('pointercancel', end); // 指で縦に動かすと、ページのスクロールに渡る(数えるモード)
  cv.addEventListener('wheel', e => {
    if (!st.img || (mode !== 'move' && !e.ctrlKey && !e.metaKey)) return; // 数えるモードでは、ホイールはページのスクロールのまま
    e.preventDefault();
    const p = pos(e);
    zoomAt(Math.exp(-e.deltaY * 0.0015), p[0], p[1]);
  }, { passive: false });
  cv.addEventListener('keydown', e => {
    if (!st.img) return;
    const k = { ArrowLeft: [40, 0], ArrowRight: [-40, 0], ArrowUp: [0, 40], ArrowDown: [0, -40] }[e.key];
    if (k) { view.ox += k[0]; view.oy += k[1]; clampView(); draw(); e.preventDefault(); }
    else if (e.key === '+' || e.key === '=') { zoomAt(1.25); e.preventDefault(); }
    else if (e.key === '-') { zoomAt(0.8); e.preventDefault(); }
    else if (e.key === '0') { fit(); draw(); e.preventDefault(); }
    else if ((e.ctrlKey || e.metaKey) && e.key === 'z') { doUndo(); e.preventDefault(); }
  });
  // 幅が変わったら(画面の回転など)描き直す。高さだけの変化(スマートフォンのアドレスバー)では動かさない
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => { if (Math.abs(stage.clientWidth - cssW) > 1) { resize(); fit(); draw(); } }).observe(stage);

  // タップ(クリック)したときの動き
  function tap(p) {
    const [x, y] = toImg(...p), tol = 24 / view.s;
    if (pick) {
      const sc = st.scales[st.img.key];
      if (pick === 'a') { sc.bar = { ...sc.bar, a: [x, y], b: null }; pick = 'b'; }
      else { const by = sc.bar.level ? sc.bar.a[1] : y; sc.bar = { ...sc.bar, b: [x, by] }; pick = null; }
      sc.um = calcScale(sc);
      renderScale(); setHint(); changed();
      return;
    }
    const m = st.method, f = field(m), G = geom(m, f), tool = st.tool[m];
    if (m === 'icpt') {
      if (tool === 'del') return delNear(m, f, x, y);
      const sn = snap(G.el, x, y, tool === 'e');
      if (!sn || sn.d > tol) { setHint(t(tool === 'e' ? 'measure_h_far_end' : 'measure_h_far')); return; }
      remember(m, f);
      const near = f.marks.some(q => Math.hypot(q.x - sn.x, q.y - sn.y) < 6 / view.s);
      f.marks.push({ x: sn.x, y: sn.y, k: tool, e: sn.i });
      if (near) { setHint(t('measure_close')); changed(); return; }
    } else if (m === 'plan') {
      if (tool === 'del') return delNear(m, f, x, y);
      const R = region();
      if (x < R.x || y < R.y || x > R.x + R.w || y > R.y + R.h) return;
      remember(m, f);
      const near = f.marks.some(q => Math.hypot(q.x - x, q.y - y) < 6 / view.s);
      f.marks.push({ x, y, k: tool });
      if (near) { setHint(t('measure_close')); changed(); return; }
    } else {
      let best = -1, bd = Infinity;
      G.pts.forEach(([px, py], i) => { const d = Math.hypot(px - x, py - y); if (d < bd) { bd = d; best = i; } });
      if (best < 0 || bd > Math.max(tol, G.d * 0.5)) { setHint(t('measure_h_far_pt')); return; }
      remember(m, f);
      delete f.zero; delete f.zeroAsk;
      const cur = f.pts[best];
      if (tool === 'del' || !st.phases.some(x => x.id === tool)) { if (tool !== 'del') { setHint(t('measure_h_pick_ph')); return; } f.pts[best] = null; }
      else if (st.tool.half) {
        // 境界の点: ½ を足す(同じ相の ½ をもう一度なら外す。2 つの相に ½ ずつまで)
        let a = (cur ?? []).filter(([, w]) => w === 0.5);
        if (a.some(([id]) => id === tool)) a = a.filter(([id]) => id !== tool);
        else a = [...a, [tool, 0.5]].slice(-2);
        f.pts[best] = a.length ? a : null;
      } else f.pts[best] = cur && cur.length === 1 && cur[0][0] === tool && cur[0][1] === 1 ? null : [[tool, 1]];
    }
    setHint();
    changed();
  }
  function delNear(m, f, x, y) {
    let bi = -1, bd = Infinity;
    f.marks.forEach((mk, i) => { const d = Math.hypot(mk.x - x, mk.y - y); if (d < bd) { bd = d; bi = i; } });
    if (bi < 0 || bd > 18 / view.s) { setHint(t('measure_h_far_del')); return; }
    remember(m, f);
    f.marks.splice(bi, 1);
    changed();
  }
  function doUndo() {
    const u = undo.pop();
    if (!u) { flash(t('measure_undo_none')); return; }
    if (u.m === 'pt') u.f.pts = JSON.parse(u.data); else u.f.marks = JSON.parse(u.data);
    if (st.fields[u.m].includes(u.f)) { st.method = u.m; st.cur[u.m] = st.fields[u.m].indexOf(u.f); renderTabs(); }
    changed();
  }

  // ================= スケールの欄
  function renderScale() {
    if (!st.img) { scaleSum.textContent = ''; scaleBox.replaceChildren(el('p', { class: 'muted', text: t('measure_scale_noimg') })); return; }
    const key = st.img.key;
    const sc = st.scales[key] ??= { mode: 'bar', bar: { level: true } };
    const upd = () => { sc.um = calcScale(sc); delete sc.auto; delete sc.carried; now.textContent = nowText(); scaleSum.textContent = sumText(); changed(); };
    const sumText = () => (sc.um ? `${sig(sc.um, 4)} µm/px` : '');
    const nowText = () => (sc.um ? t('measure_scale_now', { v: sig(sc.um, 4), w: lenTxt(sc.um * st.img.w) }) : t('measure_scale_none'));
    const now = el('p', { class: 'ms-scale-now', 'aria-live': 'polite', text: nowText() });
    scaleSum.textContent = sumText();
    const modes = ['bar', 'px', 'mag', 'fov'];
    const chips = el('div', { class: 'mt-chips', role: 'radiogroup', 'aria-label': t('measure_scale_h') }, modes.map(k => {
      const i = el('input', { type: 'radio', name: 'ms-scale', value: k, checked: sc.mode === k });
      i.addEventListener('change', () => { sc.mode = k; pick = null; renderScale(); upd(); setHint(); });
      return el('label', { class: 'mt-chip' }, i, ` ${t(`measure_scale_${k}`)}`);
    }));
    let body;
    if (sc.mode === 'bar') {
      sc.bar ??= { level: true };
      const d = sc.bar.a && sc.bar.b ? Math.hypot(sc.bar.b[0] - sc.bar.a[0], sc.bar.b[1] - sc.bar.a[1]) : null;
      const lv = el('input', { type: 'checkbox', checked: sc.bar.level !== false });
      lv.addEventListener('change', () => { sc.bar.level = lv.checked; });
      body = el('div', { class: 'ms-scale-row' },
        btn(t(pick ? 'measure_scale_picking' : 'measure_scale_pick'), () => { pick = pick ? null : 'a'; if (mode === 'move') setMode('count'); renderScale(); setHint(); stage.scrollIntoView({ block: 'nearest' }); }, `btn btn-small ${pick ? 'btn-primary' : 'btn-ghost'}`, { 'aria-pressed': String(!!pick) }),
        el('label', { class: 'mt-pick' }, lv, t('measure_scale_level')),
        num(t('measure_scale_len'), sc.bar.len, v => { sc.bar.len = v; upd(); }),
        el('p', { class: 'muted ms-scale-px', text: d ? t('measure_scale_barpx', { d: nf(d, 1) }) : t('measure_scale_pick_lead') }),
        ...(S?.barPx ? [btn(t('measure_scale_syn_bar'), () => { sc.bar = { ...sc.bar, a: S.barPx.a, b: S.barPx.b, len: S.barPx.um }; renderScale(); upd(); })] : []));
    } else if (sc.mode === 'px') body = el('div', { class: 'ms-scale-row' }, num(t('measure_scale_um'), sc.px, v => { sc.px = v; upd(); }));
    else if (sc.mode === 'mag') body = el('div', { class: 'ms-scale-row' }, num(t('measure_scale_m'), sc.m, v => { sc.m = v; upd(); }), num(t('measure_scale_wmm'), sc.wmm, v => { sc.wmm = v; upd(); }), el('p', { class: 'muted', text: t('measure_scale_mag_note') }));
    else body = el('div', { class: 'ms-scale-row' }, num(t('measure_scale_fovum'), sc.fov, v => { sc.fov = v; upd(); }));
    scaleBox.replaceChildren(chips, body, now,
      ...(sc.auto ? [el('p', { class: 'muted ms-scale-note', text: t('measure_scale_syn') })] : []),
      ...(sc.carried ? [el('p', { class: 'mt-nb ms-scale-note', text: t('measure_scale_carried', { name: sc.carried }) })] : []));
  }

  // ================= 数える欄(方法ごと)
  function renderTabs() { for (const b of tabs.children) b.setAttribute('aria-selected', String(b.id === `ms-tab-${st.method}`)); setHint(); }
  function renderPanel() {
    const m = st.method;
    if (!st.img) { qbar.replaceChildren(); panel.replaceChildren(el('p', { class: 'muted', text: t('measure_meth_noimg') })); return; }
    const f = field(m), locked = isMarked(m, f), R = region(), short = Math.min(R.w, R.h), s = st.set[m];
    const kids = [];
    // パターンの設定(印のある視野では変えない)
    const setGeom = (k, v) => { s[k] = v; if (!locked) { f[k] = v; if (k === 'n') f.pts = Array(v * v).fill(null); keepInside(f); } changed(); };
    const conf = el('div', { class: 'ms-conf' });
    if (m === 'icpt') conf.append(sel(t('measure_pat'), PATS.map(p => [p, t(`measure_pat_${p}`)]), f.pat, v => setGeom('pat', v), { disabled: locked }));
    if (m === 'plan') conf.append(sel(t('measure_shape'), [['circle', t('measure_shape_c')], ['rect', t('measure_shape_r')]], f.shape, v => setGeom('shape', v), { disabled: locked }));
    if (m === 'pt') conf.append(sel(t('measure_grid'), [3, 4, 5, 7, 8, 10].map(n => [n, t('measure_grid_n', { n, p: n * n })]), f.n, v => setGeom('n', Number(v)), { disabled: locked }));
    const rng2 = el('input', { type: 'range', min: '20', max: '100', step: '1', value: String(Math.round(100 * f.size / short)), disabled: locked, 'aria-label': t('measure_size') });
    const sizeTxt = el('span', { class: 'ms-size-v' });
    const sizeNow = () => {
      const u = um(), G = geom(m, f);
      sizeTxt.textContent = m === 'icpt' ? t('measure_size_icpt', { p: Math.round(100 * f.size / short), L: u ? lenTxt(G.len * u) : `${nf(G.len)} px` })
        : m === 'plan' ? t('measure_size_plan', { p: Math.round(100 * f.size / short), A: u ? `${sig(G.area * (u / 1000) ** 2, 3)} mm²` : `${nf(G.area)} px²` })
          : t('measure_size_pt', { p: Math.round(100 * f.size / short), d: u ? lenTxt(G.d * u) : `${nf(G.d, 1)} px` });
    };
    rng2.addEventListener('input', () => { s.size = Number(rng2.value) / 100; f.size = Math.max(20, s.size * short); if (m === 'pt') f.pts = Array(f.n * f.n).fill(null); keepInside(f); sizeNow(); save(); draw(); });
    rng2.addEventListener('change', () => changed());
    sizeNow();
    conf.append(el('label', { class: 'ms-f ms-size' }, el('span', { text: t('measure_size') }), rng2, sizeTxt));
    conf.append(el('div', { class: 'fm-sel-btns' },
      btn(t('measure_place_rand'), () => { const g = newField(m, 'random'); f.cx = g.cx; f.cy = g.cy; changed(); }, 'btn btn-ghost btn-small', { disabled: locked }),
      btn(t('measure_place_here'), () => { const [x, y] = toImg(cssW / 2, cssH / 2); f.cx = x; f.cy = y; keepInside(f); changed(); }, 'btn btn-ghost btn-small', { disabled: locked })));
    if (locked) conf.append(el('p', { class: 'muted ms-locked', text: t('measure_locked') }));
    kids.push(conf);
    // 印の種類(画像のすぐ下の列に出す)。点算法では相を選ぶ・境界の点 ½・消す
    if (m === 'icpt' && st.tool.icpt === 'e' && !f.pat.startsWith('l')) st.tool.icpt = 'x';
    const chip = (k, label, sw) => {
      const i = el('input', { type: 'radio', name: `ms-tool-${m}`, value: k, checked: st.tool[m] === k });
      i.addEventListener('change', () => { st.tool[m] = k; save(); });
      return el('label', { class: `mt-chip ms-k ms-k-${k}` }, i, sw ?? el('span', { class: 'ms-sym', 'aria-hidden': 'true' }), ` ${label}`);
    };
    const tools = m === 'icpt' ? ['x', 'j', 't', ...(f.pat.startsWith('l') ? ['e'] : []), 'del'].map(k => chip(k, t(`measure_k_${k}`)))
      : m === 'plan' ? ['in', 'cut', 'del'].map(k => chip(k, t(`measure_k_${k}`)))
        : [...st.phases.map(p => chip(p.id, p.name || t('measure_ph_noname'), el('span', { class: 'ms-sw', style: `background:${COLORS[p.c % COLORS.length]}`, 'aria-hidden': 'true' }))),
          btn(t('measure_pt_half'), () => { st.tool.half = !st.tool.half; save(); renderPanel(); }, 'chip ms-half', { 'aria-pressed': String(!!st.tool.half) }),
          chip('del', t('measure_pt_clear'))];
    qbar.replaceChildren(
      el('div', { class: 'ms-tools', role: 'radiogroup', 'aria-label': t('measure_tool') }, tools),
      el('div', { class: 'ms-qrow' }, el('p', { class: 'ms-tally', 'aria-live': 'polite', text: tally(m, f) }), btn(t('measure_next'), () => nextField(m), 'btn btn-primary btn-small ms-next')));
    if (m === 'pt') kids.push(phaseEditor(f));
    // 数え方の決まり(ページの決まりの節と同じ文)
    kids.push(el('details', { class: 'ms-rules' }, el('summary', { text: t('measure_rules_short') }),
      el('ul', { class: 'mt-miss' }, (D.rules[m] ?? []).map(([w, x]) => el('li', {}, w ? el('b', { text: `${w} ` }) : null, x))),
      el('p', { class: 'ms-rules-more' }, el('a', { href: `#rules-${m}`, text: t('measure_rules_more') }))));
    kids.push(el('div', { class: 'fm-sel-btns' },
      btn(t('measure_clear_field'), () => { if (!isMarked(m, f)) return; remember(m, f); if (m === 'pt') f.pts = f.pts.map(() => null); else f.marks = []; changed(); })));
    kids.push(fieldList(m));
    panel.replaceChildren(...kids);
  }
  function keepInside(f) {
    const R = region(), h = f.size / 2;
    f.size = Math.min(f.size, Math.min(R.w, R.h));
    f.cx = Math.max(R.x + h, Math.min(R.x + R.w - h, f.cx));
    f.cy = Math.max(R.y + h, Math.min(R.y + R.h - h, f.cy));
  }
  function tally(m, f) {
    const u = um();
    if (m === 'icpt') {
      const c = k => f.marks.filter(x => x.k === k).length, L = pattern(f.pat, f.cx, f.cy, f.size).len;
      return t('measure_tally_icpt', { p: nf(icptCount(f.marks), 1), x: c('x'), j: c('j'), t: c('t'), e: c('e'), L: u ? lenTxt(L * u) : `${nf(L)} px` });
    }
    if (m === 'plan') {
      const c = planCount(f.marks, f.shape === 'rect'), A = frame(f.shape, f.cx, f.cy, f.size).area;
      return t('measure_tally_plan', { i: c.nIn, c: c.nCut, k: f.shape === 'rect' ? t('measure_tally_corner') : '', n: nf(c.n, 1), A: u ? `${sig(A * (u / 1000) ** 2, 3)} mm²` : `${nf(A)} px²` });
    }
    const h = pointHits(f.pts), pt = f.n * f.n, used = Object.values(h).reduce((a, x) => a + x, 0);
    return t('measure_tally_pt', { list: st.phases.map(p => `${p.name || t('measure_ph_noname')} ${nf(h[p.id] ?? 0, 1)}`).join(t('measure_sep')), r: nf(pt - used, 1), pt });
  }
  function nextField(m) {
    const f = field(m);
    // 印のない視野では次へ進まない(面積法で N_A = 0、点算法で P_P = 0 の視野が平均に入るのを防ぐ)。
    // 点算法だけは、相に乗る点が本当にない視野がありうるので、2 度目の「次へ」で 0 点の視野として数える
    if (!isMarked(m, f)) {
      if (m === 'pt' && f.zeroAsk) f.zero = true;
      else {
        if (m === 'pt') f.zeroAsk = true;
        const x = t(m === 'pt' ? 'measure_next_empty_pt' : 'measure_next_empty');
        flash(x); setHint(x);
        return;
      }
    }
    delete f.zeroAsk;
    f.done = true;
    const g = newField(m, 'random');
    st.fields[m].push(g);
    st.cur[m] = st.fields[m].length - 1;
    setHint(t('measure_h_next'));
    changed();
  }
  function fieldList(m) {
    const list = st.fields[m];
    if (!list.length) return el('p');
    const tb = el('tbody');
    list.forEach((f, i) => {
      const here = i === st.cur[m] && f.img === st.img?.key;
      const val = fieldValue(m, f);
      tb.append(el('tr', { class: here ? 'is-cur' : '' },
        el('th', { scope: 'row' }, `${i + 1}${here ? ` ${t('measure_f_cur')}` : ''}`),
        el('td', { class: 'ms-fimg', text: f.name }),
        el('td', { class: 'ms-num', text: val }),
        el('td', { class: 'ms-fbtn' },
          f.img === st.img?.key && !here ? btn(t('measure_f_edit'), () => { st.cur[m] = i; changed(); }, 'chip') : null,
          btn('×', () => { if (i === st.cur[m]) st.cur[m] = -1; else if (st.cur[m] > i) st.cur[m]--; st.fields[m].splice(i, 1); changed(); }, 'chip', { 'aria-label': t('measure_f_del', { i: i + 1 }) }))));
    });
    return el('div', { class: 'fm-scroll ms-fields' }, el('table', { class: 'pp-tbl ms-ftbl' },
      el('caption', { text: t('measure_fields_h') }),
      el('thead', {}, el('tr', {}, ['measure_f_no', 'measure_f_img', 'measure_f_val', 'measure_f_act'].map(k => el('th', { scope: 'col', text: t(k) })))), tb));
  }
  function fieldValue(m, f) {
    const u = umOf(f.img);
    if (m === 'icpt') { const P = icptCount(f.marks), L = pattern(f.pat, f.cx, f.cy, f.size).len * (u ?? NaN); return `P = ${nf(P, 1)}${P > 0 && u ? ` · ℓ = ${sig(L / P, 3)} µm` : ''}`; }
    if (m === 'plan') { const c = planCount(f.marks, f.shape === 'rect'), A = frame(f.shape, f.cx, f.cy, f.size).area * ((u ?? NaN) / 1000) ** 2; return `N = ${nf(c.n, 1)}${u ? ` · N_A = ${sig(c.n / A, 3)} mm⁻²` : ''}`; }
    const h = pointHits(f.pts), pt = f.n * f.n;
    return st.phases.map(p => `${p.name || t('measure_ph_noname')} ${nf(100 * (h[p.id] ?? 0) / pt, 1)} %`).join(' · ');
  }
  // 相の名前・色・数える相の選択
  function phaseEditor(f) {
    const box = el('div', { class: 'ms-phases' });
    const dl = el('datalist', { id: 'ms-presets' }, D.presets.map(p => el('option', { value: p.name })));
    box.append(el('p', { class: 'ms-tools-h', text: t('measure_ph_h') }), dl);
    for (const p of st.phases) {
      const name = el('input', { type: 'text', value: p.name, list: 'ms-presets', placeholder: t('measure_ph_ph'), 'aria-label': t('measure_ph_name'), maxlength: '40' });
      name.addEventListener('input', () => { p.name = name.value; save(); link.replaceChildren(...atlasLink(p.name)); draw(); });
      name.addEventListener('change', () => changed());
      const link = el('span', { class: 'ms-ph-atlas' }, ...atlasLink(p.name));
      box.append(el('div', { class: 'ms-ph' }, el('span', { class: 'ms-sw', style: `background:${COLORS[p.c % COLORS.length]}` }), name,
        st.phases.length > 1 ? btn('×', () => { st.phases = st.phases.filter(x => x !== p); for (const g of st.fields.pt) g.pts = g.pts.map(a => { const b = a?.filter(([id]) => id !== p.id); return b?.length ? b : null; }); if (st.tool.pt === p.id) st.tool.pt = st.phases[0].id; changed(); }, 'chip', { 'aria-label': t('measure_ph_del', { name: p.name || t('measure_ph_noname') }) }) : null, link));
    }
    box.append(el('div', { class: 'fm-sel-btns' },
      st.phases.length < COLORS.length ? btn(t('measure_ph_add'), () => { const used = new Set(st.phases.map(x => x.c)); const c = [...COLORS.keys()].find(k => !used.has(k)) ?? 0; const id = `p${Date.now().toString(36)}`; st.phases.push({ id, name: '', c }); st.tool.pt = id; changed(); }) : null,
      btn(t('measure_pt_fill'), () => { if (st.tool.pt === 'del') { flash(t('measure_pt_fill_pick')); return; } const g = field('pt'); remember('pt', g); g.pts = g.pts.map(a => a ?? [[st.tool.pt, 1]]); changed(); })));
    return box;
  }
  const atlasLink = name => { const p = D.presets.find(x => x.name === name.trim()); return p?.url ? [el('a', { href: p.url, text: t('measure_ph_atlas', { s: p.atlasName }) })] : []; };

  // ================= 結果
  const names = { icpt: () => t('measure_m_icpt'), plan: () => t('measure_m_plan'), pt: () => t('measure_m_pt') };
  function results() {
    const R = {};
    for (const m of ['icpt', 'plan', 'pt']) {
      const fs = counted(m);
      if (!fs.length) continue;
      R[m] = { fields: fs, ...summarize(m, fs, umOf, { phases: st.phases }) };
    }
    return R;
  }
  function warnings(m, r) {
    const w = [];
    const n = m === 'pt' ? r.rows.length : r.nOk;
    if (m !== 'pt' && r.fields.some(f => !umOf(f.img))) w.push(t('measure_w_noscale'));
    if (n < 2) w.push(t('measure_w_one'));
    if (m === 'icpt') {
      if (r.rows.some(x => x.P === 0)) w.push(t('measure_w_zero'));
      const low = r.fields.map((f, i) => [f, r.rows[i]]).filter(([f, x]) => x.P < (f.pat.startsWith('c') ? 40 : 50)).map(([f]) => st.fields.icpt.indexOf(f) + 1);
      if (low.length) w.push(t('measure_w_low_icpt', { list: low.join(', ') }));
      if (n < 5) w.push(t('measure_w_few_icpt'));
      if (r.sumP < 400) w.push(t('measure_w_total_icpt', { n: nf(r.sumP, 1) }));
    }
    if (m === 'plan') {
      const low = r.rows.map((x, i) => [x, i]).filter(([x]) => x.n < 50).map(([, i]) => st.fields.plan.indexOf(r.fields[i]) + 1);
      if (low.length) w.push(t('measure_w_low_plan', { list: low.join(', ') }));
      if (r.rows.some(x => x.n > 100)) w.push(t('measure_w_high_plan'));
      if (n < 3) w.push(t('measure_w_few_plan'));
      if (r.sumN < 700) w.push(t('measure_w_total_plan', { n: nf(r.sumN, 1) }));
    }
    const ra = st0 => {
      if (!st0 || st0.ra == null) return;
      if (st0.ra > 10) w.push(t('measure_w_ra', { ra: nf(st0.ra, 1), n: Number.isFinite(fieldsFor(10, st0.s / st0.mean)) ? fieldsFor(10, st0.s / st0.mean) : '—' }));
    };
    if (m !== 'pt') ra(r.st);
    else for (const p of r.per) {
      const ph = st.phases.find(x => x.id === p.id), nm = ph?.name || t('measure_ph_noname'), mean = p.st?.mean ?? 0;
      if (p.st?.ra != null && p.st.ra > 10) w.push(t('measure_w_ra_pt', { name: nm, ra: nf(p.st.ra, 1), n: Number.isFinite(fieldsFor(10, p.st.s / p.st.mean)) ? fieldsFor(10, p.st.s / p.st.mean) : '—' }));
      const pts = r.rows.map(x => x.pt), g = gridFor(mean);
      if (g && Math.max(...pts) < g && mean > 0) w.push(t('measure_w_grid', { name: nm, p: nf(100 * mean, 1), n: g }));
      const need = pointFieldsFor(10, mean, pts.reduce((a, b) => a + b, 0) / pts.length);
      if (need && need > r.rows.length) w.push(t('measure_w_pt_need', { name: nm, n: need }));
    }
    if (m === 'pt' && n >= 2 && n < 30) w.push(t('measure_w_pt_30', { n }));
    return w;
  }
  // 結果の表(画面・テキスト・CSV で同じ行を使う)。[ラベル, 値の文, CSV の値, 単位]
  function rowsOf(m, r) {
    const x = r.st, rows = [];
    const add = (k, txt, v, u = '') => rows.push([t(k), txt, v, u]);
    if (m === 'icpt') {
      add('measure_r_n', nf(r.nOk), r.nOk);
      add('measure_r_sump', nf(r.sumP, 1), r.sumP);
      add('measure_r_suml', lenTxt(r.sumL), raw(r.sumL), 'µm');
      add('measure_r_lbar', x ? `${sig(x.mean, 4)} µm` : '—', raw(x?.mean), 'µm');
      add('measure_r_s', x?.s != null ? `${sig(x.s, 3)} µm` : '—', raw(x?.s), 'µm');
      add('measure_r_ci', x?.ci != null ? `± ${sig(x.ci, 3)} µm (t = ${nf(x.t, 3)})` : '—', raw(x?.ci), 'µm');
      add('measure_r_ra', x?.ra != null ? `${nf(x.ra, 1)} %` : '—', raw(x?.ra, 4), '%');
      add('measure_r_g', r.G != null && Number.isFinite(r.G) ? nf(r.G, 2) : '—', raw(r.G, 4));
      if (r.Gr) add('measure_r_grange', `${nf(r.Gr[0], 2)} – ${r.Gr[1] != null ? nf(r.Gr[1], 2) : '—'}`, `${raw(r.Gr[0], 4)} – ${raw(r.Gr[1], 4)}`);
      add('measure_r_pooled', r.pooled ? `${sig(r.pooled, 4)} µm` : '—', raw(r.pooled), 'µm');
      add('measure_r_formula', 'ℓ = L / P;  G = −6.643856 log₁₀(ℓ̄ / mm) − 3.288', 'l = L / P; G = -6.643856 log10(l/mm) - 3.288');
    } else if (m === 'plan') {
      add('measure_r_n', nf(r.nOk), r.nOk);
      add('measure_r_sumn', nf(r.sumN, 1), r.sumN);
      add('measure_r_na', x ? `${sig(x.mean, 4)} mm⁻²` : '—', raw(x?.mean), 'mm-2');
      add('measure_r_s', x?.s != null ? `${sig(x.s, 3)} mm⁻²` : '—', raw(x?.s), 'mm-2');
      add('measure_r_ci', x?.ci != null ? `± ${sig(x.ci, 3)} mm⁻² (t = ${nf(x.t, 3)})` : '—', raw(x?.ci), 'mm-2');
      add('measure_r_ra', x?.ra != null ? `${nf(x.ra, 1)} %` : '—', raw(x?.ra, 4), '%');
      add('measure_r_g', r.G != null && Number.isFinite(r.G) ? nf(r.G, 2) : '—', raw(r.G, 4));
      if (r.Gr) add('measure_r_grange', `${r.Gr[0] != null ? nf(r.Gr[0], 2) : '—'} – ${nf(r.Gr[1], 2)}`, `${raw(r.Gr[0], 4)} – ${raw(r.Gr[1], 4)}`);
      add('measure_r_dbar', x?.mean > 0 ? `${sig(1000 / Math.sqrt(x.mean), 3)} µm` : '—', raw(x?.mean > 0 ? 1000 / Math.sqrt(x.mean) : null), 'µm');
      add('measure_r_formula', 'N_A = (N_in + ½ N_cut [+ 1]) / A;  G = 3.321928 log₁₀(N_A / mm⁻²) − 2.954', 'N_A = (N_in + 0.5 N_cut [+1 rect]) / A; G = 3.321928 log10(N_A/mm-2) - 2.954');
    } else {
      add('measure_r_n', nf(r.rows.length), r.rows.length);
      add('measure_r_sumpt', nf(r.sumPt), r.sumPt);
      for (const p of r.per) {
        const nm = st.phases.find(y => y.id === p.id)?.name || t('measure_ph_noname'), s = p.st;
        rows.push([t('measure_r_vv', { name: nm }), s ? `${nf(100 * s.mean, 1)} %${s.ci != null ? ` ± ${nf(100 * s.ci, 1)} % (${t('measure_r_ra_s', { ra: s.ra != null ? nf(s.ra, 1) : '—' })})` : ''}` : '—', raw(s ? 100 * s.mean : null), '%']);
        rows.push([t('measure_r_vv_detail', { name: nm }), s ? `${t('measure_r_hits', { n: nf(p.sum, 1) })}${s.s != null ? ` · s = ${nf(100 * s.s, 2)} % · t = ${nf(s.t, 3)}` : ''}` : '—', s?.ci != null ? `s=${raw(100 * s.s)}; ci95=${raw(100 * s.ci)}; ra=${raw(s.ra, 4)}` : '', '%']);
      }
      add('measure_r_formula', 'P_P = P_α / P_T;  V_V ≈ P̄_P;  95 % CI = t·s/√n', 'P_P = P_alpha / P_T; V_V = mean(P_P); CI95 = t s / sqrt(n)');
    }
    return rows;
  }
  function renderResults() {
    const R = results();
    const ms = Object.keys(R);
    if (!ms.length) { out.replaceChildren(el('p', { class: 'muted', text: t('measure_res_none') })); renderAnswer(R); return; }
    out.replaceChildren(...ms.map(m => {
      const r = R[m], w = warnings(m, r);
      return el('div', { class: 'ms-rbox' },
        el('h4', { text: names[m]() }),
        el('div', { class: 'fm-scroll' }, el('table', { class: 'pp-tbl ms-rtbl' }, el('tbody', {}, rowsOf(m, r).map(([k, v]) => el('tr', {}, el('th', { scope: 'row', text: k }), el('td', { class: 'ms-num', text: v })))))),
        w.length ? el('ul', { class: 'mt-miss ms-warn' }, w.map(x => el('li', { text: x }))) : el('p', { class: 'ms-ok', text: t('measure_w_none') }));
    }), el('p', { class: 'fn-caution ms-est', text: t('measure_est') }));
    renderAnswer(R);
  }

  // ================= 答え合わせ(合成組織)
  function renderAnswer(R) {
    ansBox.replaceChildren();
    if (!st.syn || !S) return;
    const key = synKey(st.syn);
    const head = el('h4', { text: t('measure_ans_h') });
    if (!st.reveal) {
      ansBox.append(head, el('p', { class: 'muted', text: t('measure_ans_lead') }), btn(t('measure_ans_show'), () => { st.reveal = true; renderAnswer(results()); }, 'btn btn-primary btn-small'));
      return;
    }
    const T0 = S.truth, kids = [head, el('p', { class: 'muted', text: t('measure_ans_how') })];
    // 差: 量は % で、粒度番号 G は番号の差で(対数の目盛りなので % にしない)
    const cmp = (label, truth, yours, ci, fmt, num = false) => {
      const d = yours == null || truth == null ? null : num ? yours - truth : truth ? 100 * (yours / truth - 1) : null;
      const sign = v => (v > 0 ? '+' : v < 0 ? '−' : '');
      return el('tr', {}, el('th', { scope: 'row', text: label }), el('td', { class: 'ms-num', text: fmt(truth) }), el('td', { class: 'ms-num', text: yours != null ? fmt(yours) : '—' }),
        el('td', { class: 'ms-num', text: d == null ? '—' : num ? `${sign(d)}${nf(Math.abs(d), 2)}` : `${sign(d)}${nf(Math.abs(d), 1)} %` }),
        el('td', { text: ci != null && yours != null ? t(Math.abs(yours - truth) <= ci ? 'measure_ans_in' : 'measure_ans_out') : '—' }));
    };
    const tbl = rows => el('div', { class: 'fm-scroll' }, el('table', { class: 'pp-tbl ms-atbl' }, el('thead', {}, el('tr', {}, ['measure_ans_q', 'measure_ans_true', 'measure_ans_yours', 'measure_ans_diff', 'measure_ans_ci'].map(k => el('th', { scope: 'col', text: t(k) })))), el('tbody', {}, rows)));
    const mine = m => (R[m] ? R[m].fields.map((f, i) => [f, i]).filter(([f]) => f.img === key) : []);
    if (S.grains) {
      const fi = mine('icpt');
      if (fi.length) {
        const r = R.icpt, ideal = fi.map(([f]) => { const P = pattern(f.pat, f.cx, f.cy, f.size); const c = idealIntercepts(S, P.el).reduce((a, b) => a + b, 0); return { P: c, l: c > 0 ? P.len * S.um / c : null }; });
        const il = stats(ideal.filter(x => x.l).map(x => x.l));
        kids.push(el('h5', { text: t('measure_m_icpt') }), tbl([cmp(t('measure_ans_you_l'), T0.l, r.st?.mean, r.st?.ci, v => sig(v, 4)), cmp(t('measure_ans_ideal_l'), T0.l, il?.mean, il?.ci, v => sig(v, 4)), cmp('G', T0.gL, r.G, null, v => nf(v, 2), true)]),
          el('p', { class: 'ms-afield' }, fi.map(([f, i], j) => t('measure_ans_field', { i: st.fields.icpt.indexOf(f) + 1, u: nf(r.rows[i].P, 1), v: nf(ideal[j].P) })).join(' / ')));
      }
      const fp = mine('plan');
      if (fp.length) {
        const r = R.plan, ideal = fp.map(([f]) => { const fr = frame(f.shape, f.cx, f.cy, f.size), c = idealPlanimetric(S, fr); return { ...c, na: c.n / (fr.area * (S.um / 1000) ** 2) }; });
        const ia = stats(ideal.map(x => x.na));
        kids.push(el('h5', { text: t('measure_m_plan') }), tbl([cmp(t('measure_ans_you_na'), T0.na, r.st?.mean, r.st?.ci, v => sig(v, 4)), cmp(t('measure_ans_ideal_na'), T0.na, ia?.mean, ia?.ci, v => sig(v, 4)), cmp('G', T0.gA, r.G, null, v => nf(v, 2), true)]),
          el('p', { class: 'ms-afield' }, fp.map(([f, i], j) => t('measure_ans_field_plan', { i: st.fields.plan.indexOf(f) + 1, ui: r.rows[i].nIn, uc: r.rows[i].nCut, vi: ideal[j].nIn, vc: ideal[j].nCut })).join(' / ')));
      }
      kids.push(el('p', { class: 'muted ms-anote', text: t('measure_ans_gnote', { gl: nf(T0.gL, 2), ga: nf(T0.gA, 2) }) }));
    }
    if (T0.vv != null) {
      const fq = mine('pt'), r = R.pt;
      if (fq.length) {
        const ideal = fq.map(([f]) => idealPoints(S, grid(f.n, f.cx, f.cy, f.size).pts) / (f.n * f.n)), iv = stats(ideal);
        const dk = r.per.find(p => p.id === 'd');
        const ys = dk ? stats(fq.map(([, i]) => dk.xs[i])) : null;
        kids.push(el('h5', { text: t('measure_m_pt') }), tbl([cmp(t('measure_ans_you_vv', { ph: t('measure_syn_dark') }), 100 * T0.vv, ys ? 100 * ys.mean : null, ys?.ci != null ? 100 * ys.ci : null, v => nf(v, 1)), cmp(t('measure_ans_ideal_vv'), 100 * T0.vv, 100 * iv.mean, iv.ci != null ? 100 * iv.ci : null, v => nf(v, 1))]),
          el('p', { class: 'ms-afield' }, fq.map(([f], j) => t('measure_ans_field_pt', { i: st.fields.pt.indexOf(f) + 1, u: dk ? nf(dk.xs[fq[j][1]] * f.n * f.n, 1) : '—', v: nf(ideal[j] * f.n * f.n) })).join(' / ')));
        if (!dk) kids.push(el('p', { class: 'muted', text: t('measure_ans_nodark') }));
      }
    }
    if (kids.length <= 2) kids.push(el('p', { class: 'muted', text: t('measure_ans_none') }));
    ansBox.append(...kids);
  }

  // ================= 書き出し
  const fileBase = () => `measure-${new Date().toISOString().slice(0, 10)}`;
  const scaleDesc = key => {
    const sc = scaleOf(key);
    if (!sc?.um) return t('measure_scale_none');
    const how = sc.mode === 'bar' ? t('measure_rep_bar', { len: sig(sc.bar.len, 4), d: nf(Math.hypot(sc.bar.b[0] - sc.bar.a[0], sc.bar.b[1] - sc.bar.a[1]), 1) })
      : sc.mode === 'mag' ? t('measure_rep_mag', { m: nf(sc.m), w: sig(sc.wmm, 4) }) : sc.mode === 'fov' ? t('measure_rep_fov', { w: sig(sc.fov, 4) }) : t('measure_rep_px');
    return `${sig(sc.um, 4)} µm/px (${how})`;
  };
  const patName = (m, f) => (m === 'icpt' ? t(`measure_pat_${f.pat}`) : m === 'plan' ? t(f.shape === 'rect' ? 'measure_shape_r' : 'measure_shape_c') : t('measure_grid_n', { n: f.n, p: f.n * f.n }));
  function reportText() {
    const R = results(), L = [t('measure_rep_title'), `${t('measure_rep_date')}: ${new Date().toLocaleString(lang)}`];
    const imgs = [...new Set(Object.values(R).flatMap(r => r.fields.map(f => f.img)))];
    for (const k of imgs) { const f = Object.values(R).flatMap(r => r.fields).find(x => x.img === k); L.push(`${t('measure_rep_img')}: ${f.name} — ${t('measure_rep_scale')}: ${scaleDesc(k)}`); }
    for (const m of Object.keys(R)) {
      const r = R[m];
      L.push('', `[${names[m]()}]`);
      r.fields.forEach((f, i) => L.push(`  ${t('measure_f_no')} ${st.fields[m].indexOf(f) + 1} (${f.name}, ${patName(m, f)}): ${fieldValue(m, f)}`));
      for (const [k, v] of rowsOf(m, r)) L.push(`${k}: ${v}`);
      for (const w of warnings(m, r)) L.push(`* ${w}`);
    }
    if (!Object.keys(R).length) L.push('', t('measure_res_none'));
    L.push('', t('measure_est'), t('measure_rep_src'));
    return L.join('\n');
  }
  function reportCsv() {
    const R = results(), q = v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const rows = [T.measure_csv_cols.split('|')];
    for (const m of Object.keys(R)) {
      const r = R[m];
      r.fields.forEach((f, i) => {
        const no = st.fields[m].indexOf(f) + 1, u = umOf(f.img), base = [names[m](), no, f.name, patName(m, f)];
        if (m === 'icpt') { const x = r.rows[i]; rows.push([...base, 'L', raw(x.L), 'µm'], [...base, 'P', x.P, ''], [...base, 'l', raw(x.l), 'µm']); }
        else if (m === 'plan') { const x = r.rows[i]; rows.push([...base, 'A', raw(x.A), 'mm2'], [...base, 'N_in', x.nIn, ''], [...base, 'N_cut', x.nCut, ''], [...base, 'N', x.n, ''], [...base, 'N_A', raw(x.na), 'mm-2']); }
        else { const x = r.rows[i]; rows.push([...base, 'P_T', x.pt, '']); for (const p of st.phases) rows.push([...base, `P(${p.name || t('measure_ph_noname')})`, x.h[p.id] ?? 0, '']); }
        rows.push([...base, 'um_per_px', raw(u), 'µm/px']);
      });
      for (const [k, , v, unit] of rowsOf(m, r)) rows.push([names[m](), t('measure_csv_all'), '', '', k, v, unit]);
    }
    rows.push(['', '', '', '', t('measure_est'), '', '']);
    return rows.map(r => r.map(q).join(',')).join('\r\n');
  }
  async function savePng() {
    if (!st.img || !src) { flash(t('measure_h_noimg')); return; }
    const m = st.method, f = field(m), W = st.img.w, H = st.img.h, k = Math.min(1, 6000 / Math.max(W, H));
    const lines = [`${names[m]()} — ${f.name}`, tally(m, f), `${t('measure_rep_scale')}: ${scaleDesc(st.img.key)}`];
    const fs = Math.max(14, Math.round(W * k / 70)), pad = Math.round(fs * 0.8), legend = lines.length * fs * 1.5 + pad * 2;
    const c = document.createElement('canvas');
    c.width = Math.round(W * k); c.height = Math.round(H * k + legend);
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    paint(g, 1, { s: k, ox: 0, oy: 0 }, true);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.fillStyle = '#fff'; g.fillRect(0, H * k, c.width, legend);
    g.fillStyle = '#111'; g.font = `${fs}px system-ui, sans-serif`; g.textBaseline = 'top';
    lines.forEach((x, i) => g.fillText(x, pad, H * k + pad + i * fs * 1.5, c.width - 2 * pad));
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    if (blob) download(blob, `${fileBase()}-${m}-${st.fields[m].indexOf(f) + 1}.png`);
  }
  function resetAll() {
    if (!Object.values(st.fields).some(l => l.some(f => f.done || f.marks?.length || f.pts?.some(Boolean)))) return;
    for (const m of ['icpt', 'plan', 'pt']) { st.fields[m] = []; st.cur[m] = -1; }
    undo.length = 0;
    st.reveal = false;
    flash(t('measure_reset_done'));
    changed();
  }

  // ================= はじめ
  app.hidden = false;
  resize();
  renderScale(); renderTabs(); renderPanel(); renderResults(); setHint(); draw();
  const qp = synParams(new URLSearchParams(location.search));
  if (qp) {
    Object.assign(sp, qp); renderSynForm(); synDet.open = true;
    makeSyn(qp).then(() => { if (!location.hash) app.scrollIntoView(); });
  } else if (saved?.img) {
    if (saved.syn) { Object.assign(sp, saved.syn); renderSynForm(); synDet.open = true; makeSyn({ ...saved.syn }); }
    else {
      const n = Object.values(st.fields).reduce((a, l) => a + l.filter(f => f.done || f.marks?.length || f.pts?.some(Boolean)).length, 0);
      restoreBox.replaceChildren(el('p', { text: t('measure_restore', { name: saved.img.name, n }) }), btn(t('measure_restore_clear'), () => { st = fresh(); try { localStorage.removeItem(KEY); } catch {} restoreBox.hidden = true; renderScale(); renderPanel(); renderResults(); setHint(); draw(); }));
      restoreBox.hidden = false;
      st.img = null; // 画像は残していないので、開くまでは「画像なし」
      st._prev = saved.img;
    }
  }
}

if (app) init();
