// 金属のミクロ組織の模式図(組織の見分け方アトラス /atlas/)。乱数の種(seed)から毎回少し違う形を手続き的に描き、SVG の文字列を返す。
// 写真ではなく模式図: 粒界はボロノイ分割(ロイドの緩和で等軸に近づける)、パーライト・共晶は層、マルテンサイトはラス・板、
// 黒鉛は片状・球状などの簡単な形で描く。色は .fig の mg0(いちばん明るい)〜 mg5(いちばん暗い)のクラスで、
// ダーク表示では明るさを少し下げるだけで明暗の関係は変えない(明るい相は明るいまま)。DOM を使わないので build.js からも呼べる
export const W = 400, H = 300, STRIP = 34;

// ---- 乱数(種が同じなら同じ形) ----
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// 文字列から種を作る(組織ごとの既定の形)
export const seedOf = s => [...String(s)].reduce((h, ch) => (Math.imul(h ^ ch.codePointAt(0), 16777619) >>> 0), 2166136261);

// ---- 幾何 ----
const area = p => p.reduce((s, a, i) => { const b = p[(i + 1) % p.length]; return s + a[0] * b[1] - b[0] * a[1]; }, 0) / 2;
const centroid = p => {
  const A = area(p);
  if (Math.abs(A) < 1e-9) return p[0];
  let x = 0, y = 0;
  p.forEach((a, i) => { const b = p[(i + 1) % p.length]; const k = a[0] * b[1] - b[0] * a[1]; x += (a[0] + b[0]) * k; y += (a[1] + b[1]) * k; });
  return [x / (6 * A), y / (6 * A)];
};
// 半平面 nx·x + ny·y <= c で多角形を切る(サザーランド・ホジマン)
function clipHalf(p, nx, ny, c) {
  const out = [];
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    const da = nx * a[0] + ny * a[1] - c, db = nx * b[0] + ny * b[1] - c;
    if (da <= 0) out.push(a);
    if ((da < 0 && db > 0) || (da > 0 && db < 0)) { const t = da / (da - db); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
  }
  return out;
}
// 凸多角形 q の内側だけを残す
function clipConvex(p, q) {
  const s = Math.sign(area(q)) || 1;
  for (let i = 0; i < q.length && p.length; i++) {
    const a = q[i], b = q[(i + 1) % q.length];
    // 内側が左(反時計回り)なら外向きの法線は (dy, −dx)
    const nx = s * (b[1] - a[1]), ny = -s * (b[0] - a[0]);
    p = clipHalf(p, nx, ny, nx * a[0] + ny * a[1]);
  }
  return p;
}
const rect = (x0, y0, x1, y1) => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
// ボロノイ分割(枠 box の中)。母点ごとに、近い母点から順に二等分線で切る
export function voronoi(pts, box = rect(0, 0, W, H)) {
  return pts.map((pi, i) => {
    let poly = box;
    const near = pts.map((pj, j) => [j, (pj[0] - pi[0]) ** 2 + (pj[1] - pi[1]) ** 2]).filter(x => x[0] !== i).sort((a, b) => a[1] - b[1]);
    for (const [j, d2] of near) {
      const R2 = Math.max(...poly.map(v => (v[0] - pi[0]) ** 2 + (v[1] - pi[1]) ** 2));
      if (d2 > 4 * R2) break;
      const pj = pts[j];
      const nx = pj[0] - pi[0], ny = pj[1] - pi[1];
      poly = clipHalf(poly, nx, ny, (pj[0] ** 2 + pj[1] ** 2 - pi[0] ** 2 - pi[1] ** 2) / 2);
      if (poly.length < 3) break;
    }
    return poly;
  }).map((poly, i) => ({ site: pts[i], poly })).filter(c => c.poly.length >= 3);
}
// 粒: n 個の母点をばらまき、ロイドの緩和で大きさをそろえる
export function grains(R, n, iters = 2, box = rect(0, 0, W, H)) {
  const [x0, y0] = box[0], [x1, y1] = box[2];
  let pts = Array.from({ length: Math.max(1, Math.round(n)) }, () => [x0 + R() * (x1 - x0), y0 + R() * (y1 - y0)]);
  let cells = voronoi(pts, box);
  for (let k = 0; k < iters; k++) {
    pts = cells.map(c => centroid(c.poly));
    cells = voronoi(pts, box);
  }
  return cells;
}
// 方向 n の直線 n·p = s と凸多角形の交わり(線分)
function chord(p, nx, ny, s) {
  const hits = [];
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    const da = nx * a[0] + ny * a[1] - s, db = nx * b[0] + ny * b[1] - s;
    if ((da <= 0 && db > 0) || (da > 0 && db <= 0)) { const t = da / (da - db); hits.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
  }
  return hits.length >= 2 ? [hits[0], hits[1]] : null;
}
// 多角形を角度 th の平行な線で埋める(層・ラス)。spacing の間隔で、線分の配列を返す
function hatch(R, p, th, spacing, jitter = 0.2) {
  const nx = -Math.sin(th), ny = Math.cos(th);
  const ss = p.map(v => nx * v[0] + ny * v[1]);
  const lo = Math.min(...ss), hi = Math.max(...ss);
  const segs = [];
  for (let s = lo + spacing * (0.3 + 0.4 * R()); s < hi; s += spacing * (1 + jitter * (R() * 2 - 1))) {
    const c = chord(p, nx, ny, s);
    if (c) segs.push(c);
  }
  return segs;
}
// 線分 p→q(方向 d)が多角形の辺・既存の線分に当たるまでの長さ
function rayHit(o, d, polys, segs) {
  let best = Infinity;
  const test = (a, b) => {
    const ex = b[0] - a[0], ey = b[1] - a[1];
    const den = d[0] * ey - d[1] * ex;
    if (Math.abs(den) < 1e-9) return;
    const t = ((a[0] - o[0]) * ey - (a[1] - o[1]) * ex) / den;
    const u = ((a[0] - o[0]) * d[1] - (a[1] - o[1]) * d[0]) / den;
    if (t > 1e-6 && u >= 0 && u <= 1 && t < best) best = t;
  };
  for (const p of polys) for (let i = 0; i < p.length; i++) test(p[i], p[(i + 1) % p.length]);
  for (const [a, b] of segs) test(a, b);
  return best;
}
const inPoly = (pt, p) => {
  let inside = false;
  for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
    const a = p[i], b = p[j];
    if ((a[1] > pt[1]) !== (b[1] > pt[1]) && pt[0] < ((b[0] - a[0]) * (pt[1] - a[1])) / (b[1] - a[1]) + a[0]) inside = !inside;
  }
  return inside;
};
const randIn = (R, p) => {
  const xs = p.map(v => v[0]), ys = p.map(v => v[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  for (let k = 0; k < 40; k++) { const q = [x0 + R() * (x1 - x0), y0 + R() * (y1 - y0)]; if (inPoly(q, p)) return q; }
  return centroid(p);
};
// 粒の内側の辺(枠の上にない辺)
const onFrame = (a, b) => (Math.abs(a[0] - b[0]) < 1e-6 && (Math.abs(a[0]) < 1e-6 || Math.abs(a[0] - W) < 1e-6))
  || (Math.abs(a[1] - b[1]) < 1e-6 && (Math.abs(a[1]) < 1e-6 || Math.abs(a[1] - H) < 1e-6));
const edges = p => p.map((a, i) => [a, p[(i + 1) % p.length]]);
const innerEdges = p => edges(p).filter(([a, b]) => !onFrame(a, b));
const len = ([a, b]) => Math.hypot(b[0] - a[0], b[1] - a[1]);
// 乱数で k 個を選ぶ(フィッシャー–イェーツ)。sort(() => R() − 0.5) はブラウザごとに比べる回数が違い、同じ種でも形が変わるので使わない
const pick = (R, arr, k) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a.slice(0, k);
};

// ---- SVG の組み立て ----
const f1 = v => (Math.round(v * 10) / 10).toString();
const dPoly = p => `M${p.map(v => `${f1(v[0])} ${f1(v[1])}`).join('L')}Z`;
const dSeg = ([a, b]) => `M${f1(a[0])} ${f1(a[1])}L${f1(b[0])} ${f1(b[1])}`;
const dLine = pts => `M${pts.map(v => `${f1(v[0])} ${f1(v[1])}`).join('L')}`;
const dCircle = (x, y, r) => `M${f1(x - r)} ${f1(y)}a${f1(r)} ${f1(r)} 0 1 0 ${f1(2 * r)} 0a${f1(r)} ${f1(r)} 0 1 0 ${f1(-2 * r)} 0Z`;
// 描く層: [クラス, 線の太さ(塗りなら 0), d の配列, ほかの属性]。同じクラスはまとめて1つの path にする
function layers() {
  const list = [];
  const add = (cls, d, sw = 0, extra = '') => {
    let L = list.find(x => x.cls === cls && x.sw === sw && x.extra === extra);
    if (!L) list.push(L = { cls, sw, extra, d: [] });
    L.d.push(d);
  };
  const svg = () => list.filter(L => L.d.length).map(L => `<path class="${L.cls}" d="${L.d.join('')}"${L.sw ? ` stroke-width="${L.sw}"` : ''}${L.extra}/>`).join('');
  return { add, svg };
}
// 粒の明るさのばらつき(結晶の向きで腐食の進み方が違う)
const tone = (R, tones = ['mg0', 'mg1', 'mg2'], w = [0.45, 0.35, 0.2]) => {
  let u = R();
  for (let i = 0; i < tones.length; i++) { if ((u -= w[i]) < 0) return tones[i]; }
  return tones[0];
};
const fillCells = (Ly, cells, R, tones, w) => cells.forEach(c => Ly.add(c.tone = c.tone ?? tone(R, tones, w), dPoly(c.poly)));
const boundaries = (Ly, cells, cls = 'mgs5', sw = 1.1) => cells.forEach(c => innerEdges(c.poly).forEach(e => Ly.add(cls, dSeg(e), sw)));

// ---- 組織ごとの描き方 ----
// 引数: R(乱数)、Ly(層)、o(オプション: f は割合、G は粒度番号など)。戻り値(任意)は数え方の結果など
const K = {};

// フェライト: 等軸の明るい粒、細い粒界、三重点にわずかなパーライト
K.ferrite = (R, Ly) => {
  const cells = grains(R, 70);
  fillCells(Ly, cells, R);
  boundaries(Ly, cells, 'mgs5', 1.1);
  const vs = cells.flatMap(c => c.poly).filter(v => v[0] > 4 && v[0] < W - 4 && v[1] > 4 && v[1] < H - 4);
  for (let k = 0; k < 5; k++) {
    const [x, y] = vs[Math.floor(R() * vs.length)];
    const r = 2.5 + R() * 2.5;
    Ly.add('mg4', dPoly([0, 1, 2].map(i => [x + r * Math.cos(R() * 0.6 + i * 2.1), y + r * Math.sin(R() * 0.6 + i * 2.1)])));
  }
};

// フェライト+パーライト: 面積の割合 f をパーライト(暗い)にする
K['ferrite-pearlite'] = (R, Ly, o) => {
  const cells = grains(R, 90);
  const total = cells.reduce((s, c) => s + Math.abs(area(c.poly)), 0);
  const order = cells.map((c, i) => [i, R()]).sort((a, b) => a[1] - b[1]).map(x => x[0]);
  let acc = 0;
  const f = o.f ?? 0.45;
  for (const i of order) {
    const a = Math.abs(area(cells[i].poly));
    if (acc + a / 2 > f * total) continue;
    cells[i].pearlite = true;
    acc += a;
  }
  for (const c of cells) {
    if (c.pearlite) {
      Ly.add('mg4', dPoly(c.poly));
      hatch(R, c.poly, R() * Math.PI, 2.6).forEach(s => Ly.add('mgs5', dSeg(s), 0.8));
    } else Ly.add(tone(R, ['mg0', 'mg1'], [0.6, 0.4]), dPoly(c.poly));
  }
  boundaries(Ly, cells.filter(c => !c.pearlite), 'mgs5', 1);
  return { fill: acc / total };
};

// パーライト: コロニーごとに向きのそろった層。見かけの間隔は切り口の角度で変わる。ごく細かいコロニーは暗く見える
const lamellae = (R, Ly, poly, sp, w, base = 'mg0', ink = 'mgs5') => {
  Ly.add(base, dPoly(poly));
  for (const [a, b] of hatch(R, poly, R() * Math.PI, sp, 0.18)) {
    if (R() < 0.12) { // 層の途切れ(欠陥)
      const t = 0.3 + R() * 0.4, g = 0.06 + R() * 0.08;
      const m1 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], m2 = [a[0] + (b[0] - a[0]) * (t + g), a[1] + (b[1] - a[1]) * (t + g)];
      Ly.add(ink, dSeg([a, m1]), w);
      Ly.add(ink, dSeg([m2, b]), w);
    } else Ly.add(ink, dSeg([a, b]), w);
  }
};
K.pearlite = (R, Ly) => {
  const cells = grains(R, 16);
  for (const c of cells) {
    if (R() < 0.15) { Ly.add('mg4', dPoly(c.poly)); hatch(R, c.poly, R() * Math.PI, 2.1).forEach(s => Ly.add('mgs5', dSeg(s), 0.9)); } else lamellae(R, Ly, c.poly, 3.6 + R() * 3, 1.3);
  }
  boundaries(Ly, cells, 'mgs3', 0.7);
};

// 初析セメンタイト+パーライト: 粒界の白い網目。網目の面積の割合が f になる幅にする
K['cementite-pearlite'] = (R, Ly, o) => {
  const cells = grains(R, 16);
  for (const c of cells) lamellae(R, Ly, c.poly, 3.4 + R() * 2.5, 1.2);
  const es = new Map();
  for (const c of cells) for (const e of innerEdges(c.poly)) es.set([...e[0], ...e[1]].map(v => Math.round(v)).sort().join(','), e);
  const L = [...es.values()].reduce((s, e) => s + len(e), 0);
  const t = Math.max(1.5, ((o.f ?? 0.07) * W * H) / L);
  for (const e of es.values()) Ly.add('mgs5', dSeg(e), f1(t + 2.4));
  for (const e of es.values()) Ly.add('mgs0', dSeg(e), f1(t), ' stroke-linecap="round"');
  return { width: t, fill: (t * L) / (W * H) };
};

// ウィドマンシュテッテン・フェライト: 粗い旧オーステナイト粒、粒界の白いフェライトの帯、そこから粒内へのびる平行なくさび
K.widmanstatten = (R, Ly) => {
  const cells = grains(R, 12);
  for (const c of cells) {
    Ly.add('mg4', dPoly(c.poly));
    hatch(R, c.poly, R() * Math.PI, 2.4).forEach(s => Ly.add('mgs5', dSeg(s), 0.7));
  }
  const plates = [];
  for (const c of cells) {
    const es = pick(R, innerEdges(c.poly).filter(e => len(e) > 25), 3);
    const s = Math.sign(area(c.poly)) || 1;
    for (const [a, b] of es) {
      const L = len([a, b]);
      const tx = (b[0] - a[0]) / L, ty = (b[1] - a[1]) / L;
      let nx = -ty * s, ny = tx * s; // 内向きの法線
      const turn = (R() - 0.5) * 1.0;
      const dx = nx * Math.cos(turn) - ny * Math.sin(turn), dy = nx * Math.sin(turn) + ny * Math.cos(turn);
      for (let u = 6 + R() * 4; u < L - 5; u += 9 + R() * 6) {
        const o0 = [a[0] + tx * u + dx * 1.5, a[1] + ty * u + dy * 1.5];
        if (!inPoly(o0, c.poly)) continue;
        const reach = rayHit(o0, [dx, dy], [c.poly], []) - 4;
        const l = Math.min(reach, 22 + R() * 55);
        if (l < 10) continue;
        const hw = 1.6 + R() * 1.4;
        plates.push([[o0[0] - tx * hw, o0[1] - ty * hw], [o0[0] + dx * l, o0[1] + dy * l], [o0[0] + tx * hw, o0[1] + ty * hw]]);
      }
    }
  }
  boundaries(Ly, cells, 'mgs0', 6);
  plates.forEach(p => Ly.add('mg0', dPoly(p)));
};

// 球状化組織: 明るいフェライトの粒と、黒く縁どられた丸いセメンタイトの粒子(粒界にも多い)
K.spheroidized = (R, Ly) => {
  const cells = grains(R, 30);
  fillCells(Ly, cells, R, ['mg0', 'mg1'], [0.6, 0.4]);
  boundaries(Ly, cells, 'mgs3', 0.8);
  const parts = [];
  const put = (x, y, r) => { if (parts.every(([a, b, q]) => (a - x) ** 2 + (b - y) ** 2 > (q + r + 1.2) ** 2)) parts.push([x, y, r]); };
  for (let k = 0; k < 420 && parts.length < 230; k++) put(R() * W, R() * H, 1.6 + 3.4 * R() ** 2);
  const es = cells.flatMap(c => innerEdges(c.poly));
  for (let k = 0; k < 60; k++) { const [a, b] = es[Math.floor(R() * es.length)]; const t = R(); put(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, 2.4 + 3 * R()); }
  parts.forEach(([x, y, r]) => Ly.add('mg0', dCircle(x, y, r)));
  parts.forEach(([x, y, r]) => Ly.add('mgs5', dCircle(x, y, r), 1.1));
};

// 旧オーステナイト粒を、向きのそろった区画(パケット)に分ける
function packets(R, cells, k = [3, 5]) {
  const out = [];
  for (const c of cells) {
    const n = k[0] + Math.floor(R() * (k[1] - k[0] + 1));
    const pts = Array.from({ length: n }, () => randIn(R, c.poly));
    const xs = c.poly.map(v => v[0]), ys = c.poly.map(v => v[1]);
    const box = rect(Math.min(...xs) - 1, Math.min(...ys) - 1, Math.max(...xs) + 1, Math.max(...ys) + 1);
    for (const v of voronoi(pts, box)) {
      const p = clipConvex(v.poly, c.poly);
      if (p.length >= 3 && Math.abs(area(p)) > 4) out.push({ poly: p, th: R() * Math.PI, grain: c });
    }
  }
  return out;
}

// 上部ベイナイト: 旧オーステナイト粒界から、平行な板の束(シーフ)が羽毛状に粒の内側へ育つ。束は暗く腐食され、
// 板のあいだに黒いセメンタイトが途切れた列で並ぶ。途中まで変態させて焼き入れた見え方(残りは明るいマルテンサイトの地)で描く
K['upper-bainite'] = (R, Ly) => {
  const cells = grains(R, 9);
  fillCells(Ly, cells, R, ['mg0', 'mg1'], [0.55, 0.45]);
  for (const pk of packets(R, cells, [2, 3])) hatch(R, pk.poly, pk.th, 3.2, 0.3).forEach(s => Ly.add('mgs2', dSeg(s), 0.5));
  const sheaves = [];
  for (const c of cells) {
    const sg = Math.sign(area(c.poly)) || 1;
    const axes = [];
    const es = pick(R, innerEdges(c.poly).filter(e => len(e) > 30), 3);
    for (const [a, b] of es) {
      const L = len([a, b]);
      const tx = (b[0] - a[0]) / L, ty = (b[1] - a[1]) / L;
      const nx = -ty * sg, ny = tx * sg; // 内向きの法線
      const turn = (R() - 0.5) * 0.9; // 同じ粒界から出る束はほぼ平行
      const dx = nx * Math.cos(turn) - ny * Math.sin(turn), dy = nx * Math.sin(turn) + ny * Math.cos(turn);
      for (let u = 8 + R() * 6; u < L - 8; u += 14 + R() * 9) {
        if (R() < 0.2) continue;
        const o0 = [a[0] + tx * u + dx * 1.2, a[1] + ty * u + dy * 1.2];
        if (!inPoly(o0, c.poly)) continue;
        const reach = rayHit(o0, [dx, dy], [c.poly], axes) - 3;
        const l = Math.min(reach, 35 + R() * 75);
        if (l < 18) continue;
        const hw = 7 + R() * 5, tip = 1.5 + R() * 2;
        const poly = clipConvex([[o0[0] - tx * hw, o0[1] - ty * hw], [o0[0] + tx * hw, o0[1] + ty * hw],
          [o0[0] + dx * l + tx * tip, o0[1] + dy * l + ty * tip], [o0[0] + dx * l - tx * tip, o0[1] + dy * l - ty * tip]], c.poly);
        if (poly.length < 3) continue;
        axes.push([o0, [o0[0] + dx * l, o0[1] + dy * l]]);
        sheaves.push({ poly, th: Math.atan2(dy, dx) });
      }
    }
  }
  for (const sh of sheaves) Ly.add('mg4', dPoly(sh.poly));
  for (const sh of sheaves) {
    hatch(R, sh.poly, sh.th, 2.4, 0.2).forEach((s, i) => (i % 2
      ? Ly.add('mgs5', dSeg(s), 1.3, ` stroke-dasharray="${f1(1.5 + R() * 2.5)} ${f1(1 + R() * 1.5)}"`)
      : Ly.add('mgs2', dSeg(s), 0.5)));
  }
  boundaries(Ly, cells, 'mgs5', 1.3);
};

// 板が育って、粒界かほかの板に当たると止まる(マルテンサイトの板・下部ベイナイト)
function growPlates(R, poly, tries, minLen, segs = []) {
  const plates = [];
  for (let k = 0; k < tries; k++) {
    const o = randIn(R, poly);
    const th = R() * Math.PI;
    const d = [Math.cos(th), Math.sin(th)];
    const l1 = rayHit(o, d, [poly], segs), l2 = rayHit(o, [-d[0], -d[1]], [poly], segs);
    if (!isFinite(l1) || !isFinite(l2) || l1 + l2 < minLen) continue;
    const a = [o[0] - d[0] * l2, o[1] - d[1] * l2], b = [o[0] + d[0] * l1, o[1] + d[1] * l1];
    segs.push([a, b]);
    plates.push([a, b]);
  }
  return plates;
}
const lens = ([a, b], w) => {
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2, L = len([a, b]);
  const nx = -(b[1] - a[1]) / L * w, ny = (b[0] - a[0]) / L * w;
  return `M${f1(a[0])} ${f1(a[1])}Q${f1(mx + nx * 2)} ${f1(my + ny * 2)} ${f1(b[0])} ${f1(b[1])}Q${f1(mx - nx * 2)} ${f1(my - ny * 2)} ${f1(a[0])} ${f1(a[1])}Z`;
};

// 下部ベイナイト: 向きのそろわない細く暗い針(板)。まわりは明るい(残りのマルテンサイトなど)
K['lower-bainite'] = (R, Ly) => {
  const cells = grains(R, 9);
  fillCells(Ly, cells, R, ['mg1', 'mg2'], [0.6, 0.4]);
  for (const c of cells) {
    for (const p of growPlates(R, c.poly, 70, 14)) {
      const L = len(p);
      Ly.add(R() < 0.5 ? 'mg4' : 'mg5', lens(p, Math.min(0.035 * L, 1.8) + 0.5));
    }
  }
  boundaries(Ly, cells, 'mgs4', 1.2);
};

// ラスマルテンサイト: 旧オーステナイト粒の中に、細い平行な筋のそろった区画(パケット・ブロック)
K['lath-martensite'] = (R, Ly, o, dark = false) => {
  const cells = grains(R, 14);
  const [t1, t2, ink] = dark ? ['mg3', 'mg4', 'mgs5'] : ['mg1', 'mg2', 'mgs3'];
  for (const pk of packets(R, cells)) {
    Ly.add(t1, dPoly(pk.poly));
    // ブロック: 同じ向きで明るさの違う帯
    const nx = -Math.sin(pk.th), ny = Math.cos(pk.th);
    const ss = pk.poly.map(v => nx * v[0] + ny * v[1]);
    for (let s = Math.min(...ss) + R() * 6, on = R() < 0.5; s < Math.max(...ss); on = !on) {
      const w = 4 + R() * 7;
      if (on) { const band = clipHalf(clipHalf(pk.poly, nx, ny, s + w), -nx, -ny, -s); if (band.length >= 3) Ly.add(t2, dPoly(band)); }
      s += w;
    }
    hatch(R, pk.poly, pk.th, dark ? 2.6 : 2.3, 0.3).forEach(sg => Ly.add(ink, dSeg(sg), dark ? 0.8 : 0.6));
    if (dark) for (let k = 0; k < Math.abs(area(pk.poly)) / 240; k++) { const [x, y] = randIn(R, pk.poly); Ly.add('mg5', dCircle(x, y, 0.7 + R() * 0.6)); }
  }
  boundaries(Ly, cells, dark ? 'mgs5' : 'mgs4', 1.3);
};
// 焼戻しマルテンサイト: もとのラスの形が残り、全体に暗く、細かい炭化物の点
K['tempered-martensite'] = (R, Ly, o) => K['lath-martensite'](R, Ly, o, true);

// レンズマルテンサイト: 明るい残留オーステナイトの中の、中央に筋(ミッドリブ)のあるレンズ形の板。大きい板が先にできる
K['plate-martensite'] = (R, Ly) => {
  const cells = grains(R, 8);
  fillCells(Ly, cells, R, ['mg0', 'mg1'], [0.7, 0.3]);
  const ribs = [], cracks = [];
  for (const c of cells) {
    for (const p of growPlates(R, c.poly, 28, 14)) {
      const L = len(p);
      Ly.add('mg3', lens(p, Math.min(0.09 * L, 7) + 0.5));
      ribs.push(p);
      if (L > 50 && R() < 0.25) { // 板どうしが当たってできる微小割れ
        const t = 0.3 + R() * 0.4, [a, b] = p, m = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
        const nx = -(b[1] - a[1]) / L, ny = (b[0] - a[0]) / L, w = Math.min(0.09 * L, 7) * 1.6;
        cracks.push([[m[0] - nx * w, m[1] - ny * w], [m[0] + nx * w, m[1] + ny * w]]);
      }
    }
  }
  ribs.forEach(p => Ly.add('mgs5', dSeg(p), 0.8));
  cracks.forEach(p => Ly.add('mgs5', dSeg(p), 1.1));
  boundaries(Ly, cells, 'mgs4', 1.1);
};

// オーステナイト(焼なまし双晶): 等軸の粒、粒の中を横切るまっすぐで平行な双晶境界の帯
function twinsBase(R, Ly, decorate) {
  const cells = grains(R, decorate ? 30 : 45);
  const tones = ['mg0', 'mg1', 'mg2'];
  fillCells(Ly, cells, R, tones, [0.4, 0.35, 0.25]);
  if (!decorate) {
    for (const c of cells) {
      if (R() < 0.35) continue;
      const th = R() * Math.PI, nx = -Math.sin(th), ny = Math.cos(th);
      const ss = c.poly.map(v => nx * v[0] + ny * v[1]);
      const lo = Math.min(...ss), hi = Math.max(...ss);
      for (let k = 0, n = R() < 0.4 ? 2 : 1; k < n; k++) {
        const w = 3 + R() * 9, s = lo + (hi - lo - w) * (0.15 + 0.7 * R());
        const band = clipHalf(clipHalf(c.poly, nx, ny, s + w), -nx, -ny, -s);
        if (band.length < 3) continue;
        Ly.add(tones[(tones.indexOf(c.tone) + 1 + Math.floor(R() * 2)) % 3], dPoly(band));
        for (const x of [s, s + w]) { const ch = chord(c.poly, nx, ny, x); if (ch) Ly.add('mgs4', dSeg(ch), 1); }
      }
    }
  }
  boundaries(Ly, cells, 'mgs5', decorate ? 2.6 : 1.1);
  return cells;
}
K['austenite-twins'] = (R, Ly) => { twinsBase(R, Ly, false); };

// 析出物: 粒界に沿って並ぶ析出物(連続した黒い溝)と、粒内のまばらな粒子
K.precipitates = (R, Ly, o) => {
  const cells = twinsBase(R, Ly, true);
  for (const c of cells) for (const e of innerEdges(c.poly)) {
    const L = len(e);
    for (let u = R() * 4; u < L; u += 4 + R() * 3) { const t = u / L; Ly.add('mg5', dCircle(e[0][0] + (e[1][0] - e[0][0]) * t, e[0][1] + (e[1][1] - e[0][1]) * t, 1.2 + R() * 1.2)); }
  }
  for (let k = 0; k < 70; k++) Ly.add('mg4', dCircle(R() * W, R() * H, 0.8 + R() * 0.8));
};

// 片状黒鉛: 曲がりながらのびる、両端のとがった黒い片。ときどき枝分かれする
function flake(R, x, y, th, L, wmax) {
  const pts = [];
  for (let s = 0; s <= L; s += 3) { pts.push([x, y]); th += (R() - 0.5) * 0.3; x += 3 * Math.cos(th); y += 3 * Math.sin(th); }
  const n = pts.length;
  if (n < 3) return null;
  const side = sgn => pts.map((p, i) => {
    const q = pts[Math.min(i + 1, n - 1)], r = pts[Math.max(i - 1, 0)];
    const dx = q[0] - r[0], dy = q[1] - r[1], l = Math.hypot(dx, dy) || 1;
    const w = (wmax * Math.max(0, Math.sin((Math.PI * i) / (n - 1))) ** 0.7 + 0.35) / 2; // 端で sin がわずかに負になると NaN になる
    return [p[0] - (dy / l) * w * sgn, p[1] + (dx / l) * w * sgn];
  });
  return { d: dPoly([...side(1), ...side(-1).reverse()]), pts, th };
}
K['gray-iron'] = (R, Ly) => {
  Ly.add('mg3', dPoly(rect(0, 0, W, H)));
  for (let k = 0; k < 160; k++) { const x = R() * W, y = R() * H, a = R() * Math.PI; Ly.add('mgs4', dSeg([[x, y], [x + 6 * Math.cos(a), y + 6 * Math.sin(a)]]), 0.6); }
  for (let k = 0; k < 42; k++) {
    const L = 30 + R() * 100;
    const f = flake(R, -20 + R() * (W + 40), -20 + R() * (H + 40), R() * Math.PI * 2, L, 3 + R() * 3);
    if (!f) continue;
    Ly.add('mg5', f.d);
    if (R() < 0.4) {
      const p = f.pts[Math.floor(f.pts.length * (0.3 + R() * 0.4))];
      const b = flake(R, p[0], p[1], f.th + (R() < 0.5 ? 1 : -1) * (0.4 + R() * 0.5), L * (0.3 + R() * 0.3), 1.6 + R() * 1.4);
      if (b) Ly.add('mg5', b.d);
    }
  }
};

// 球状黒鉛: 暗いパーライトの地に、白いフェライトの輪(ブルズアイ)に囲まれた黒い球
const blob = (R, x, y, r, k = 14, rough = 0.12) => dPoly(Array.from({ length: k }, (_, i) => { const a = (i / k) * Math.PI * 2, q = r * (1 + (R() - 0.5) * rough * 2); return [x + q * Math.cos(a), y + q * Math.sin(a)]; }));
K['ductile-iron'] = (R, Ly) => {
  Ly.add('mg4', dPoly(rect(0, 0, W, H)));
  for (let k = 0; k < 220; k++) { const x = R() * W, y = R() * H, a = R() * Math.PI; Ly.add('mgs5', dSeg([[x, y], [x + 5 * Math.cos(a), y + 5 * Math.sin(a)]]), 0.6); }
  const ns = [];
  for (let k = 0; k < 300 && ns.length < 30; k++) {
    const r = 4.5 + R() * 8, h = r * (1.6 + R() * 0.7), x = R() * W, y = R() * H;
    if (ns.every(([a, b, , hh]) => Math.hypot(a - x, b - y) > hh + h - 3)) ns.push([x, y, r, h]);
  }
  for (const [x, y, , h] of ns) Ly.add('mg0', blob(R, x, y, h, 18, 0.16));
  for (const [x, y, r, h] of ns) for (let i = 0, n = 2 + Math.floor(R() * 3); i < n; i++) { const a = R() * Math.PI * 2; Ly.add('mgs3', dSeg([[x + r * Math.cos(a), y + r * Math.sin(a)], [x + h * 0.95 * Math.cos(a), y + h * 0.95 * Math.sin(a)]]), 0.7); }
  for (const [x, y, r] of ns) Ly.add('mg5', blob(R, x, y, r, 16, 0.08));
};

// デンドライト: 幹と、ほぼ直角にのびる枝(2次の枝)。芯(先に固まった所)ほど明るく、枝のあいだ(最後に固まった所)は暗い
K.dendrite = (R, Ly) => {
  Ly.add('mg3', dPoly(rect(0, 0, W, H)));
  const arms = [];
  for (let k = 0; k < 11; k++) {
    let x = R() * W, y = R() * H, th = R() * Math.PI * 2;
    const L = 90 + R() * 170, trunk = [[x, y]];
    for (let s = 0; s < L; s += 11 + R() * 2) {
      x += 12 * Math.cos(th); y += 12 * Math.sin(th); th += (R() - 0.5) * 0.06;
      trunk.push([x, y]);
      const rest = 1 - s / L;
      for (const sg of [1, -1]) {
        const a = th + sg * (Math.PI / 2 + (R() - 0.5) * 0.2), l = (14 + R() * 26) * (0.35 + 0.65 * rest);
        arms.push([[x, y], [x + l * Math.cos(a), y + l * Math.sin(a)]]);
      }
    }
    arms.push(trunk);
  }
  const round = ' stroke-linecap="round" stroke-linejoin="round"';
  arms.forEach(a => Ly.add('mgs2', dLine(a), a.length > 2 ? 9 : 7, round));
  arms.forEach(a => Ly.add('mgs1', dLine(a), a.length > 2 ? 5 : 4, round));
  arms.forEach(a => Ly.add('mgs0', dLine(a), a.length > 2 ? 2 : 1.6, round));
};

// 共晶組織(Pb–Sn): コロニーごとに、暗い α(Pb に富む)と明るい β(Sn に富む)が交互に並ぶ層
K.eutectic = (R, Ly) => {
  const cells = grains(R, 12);
  for (const c of cells) lamellae(R, Ly, c.poly, 4.4 + R() * 1.8, 2.1, 'mg1', 'mgs4');
  boundaries(Ly, cells, 'mgs3', 0.5);
};

// 混粒: 粗い粒と、細かい粒の集まりがまじる
K.duplex = (R, Ly) => {
  const coarse = grains(R, 13, 2);
  const cells = [];
  for (const c of coarse) {
    if (R() < 0.5) { cells.push(c); continue; }
    const n = Math.max(6, Math.round(Math.abs(area(c.poly)) / 260));
    const pts = Array.from({ length: n }, () => randIn(R, c.poly));
    const xs = c.poly.map(v => v[0]), ys = c.poly.map(v => v[1]);
    const box = rect(Math.min(...xs) - 1, Math.min(...ys) - 1, Math.max(...xs) + 1, Math.max(...ys) + 1);
    for (const v of voronoi(pts, box)) { const p = clipConvex(v.poly, c.poly); if (p.length >= 3) cells.push({ poly: p }); }
  }
  fillCells(Ly, cells, R);
  boundaries(Ly, cells, 'mgs5', 1);
};

// 加工組織: 圧延の方向(横)に伸びた粒と、粒の中のすべり帯
K['cold-worked'] = (R, Ly) => {
  const k = 2.2;
  const cells = grains(R, 55, 2, rect(0, 0, W / k, H * k)).map(c => ({ poly: c.poly.map(([x, y]) => [x * k, y / k]) }));
  fillCells(Ly, cells, R);
  for (const c of cells) {
    if (R() < 0.45) continue;
    hatch(R, c.poly, (R() < 0.5 ? 1 : -1) * (0.5 + R() * 0.4), 3 + R() * 2, 0.3).forEach(s => Ly.add('mgs3', dSeg(s), 0.6));
  }
  boundaries(Ly, cells, 'mgs5', 1);
};

// 結晶粒度: n 個の等軸の粒。数え方(計数法・切断法)の結果も返す
K.grain = (R, Ly, o) => {
  // 実際の顕微鏡の視野と同じく、粒は枠の外まで続く(枠より 1.5 粒ぶん広い範囲で分割し、枠で切る)。
  // 枠の中だけで分割すると、枠に接する粒が切れていない丸ごとの粒になり、計数法の「枠に掛かる粒 × 1/2」で数が少なく出る
  const n0 = o.n ?? 120;
  const m = Math.ceil(1.5 * Math.sqrt((W * H) / n0));
  const frame = rect(0, 0, W, H);
  const cells = grains(R, (n0 * (W + 2 * m) * (H + 2 * m)) / (W * H), 3, rect(-m, -m, W + m, H + m))
    .map(c => ({ full: c.poly, poly: clipConvex(c.poly, frame) }))
    .filter(c => c.poly.length >= 3 && Math.abs(area(c.poly)) > 1e-6);
  fillCells(Ly, cells, R);
  boundaries(Ly, cells, 'mgs5', n0 > 260 ? 0.8 : 1.1);
  // 計数法(ジェフリーズ): 枠の中の粒 + 枠に掛かる粒の半分 + 1(四隅の粒はそれぞれ 1/4)
  const touch = c => c.full.some(v => v[0] < -1e-6 || v[1] < -1e-6 || v[0] > W + 1e-6 || v[1] > H + 1e-6);
  const corner = c => [[0, 0], [W, 0], [W, H], [0, H]].some(q => inPoly(q, c.full));
  const inside = cells.filter(c => !touch(c)).length, cut = cells.filter(c => touch(c) && !corner(c)).length;
  // 切断法: 横3本・縦2本の試験線と粒界の交点
  const lines = [[[0, H / 4], [W, H / 4]], [[0, H / 2], [W, H / 2]], [[0, (3 * H) / 4], [W, (3 * H) / 4]], [[W / 3, 0], [W / 3, H]], [[(2 * W) / 3, 0], [(2 * W) / 3, H]]];
  const hits = [];
  for (const [a, b] of lines) {
    const vert = a[0] === b[0];
    const nx = vert ? 1 : 0, ny = vert ? 0 : 1, s = vert ? a[0] : a[1];
    const pts = [];
    for (const c of cells) {
      const ch = chord(c.poly, nx, ny, s);
      if (ch) for (const p of ch) { const u = vert ? p[1] : p[0]; if (u > 0.5 && u < (vert ? H : W) - 0.5) pts.push(p); }
    }
    // 隣の粒どうしで同じ点を2回数えるので、近い点をまとめる
    pts.sort((p, q) => (vert ? p[1] - q[1] : p[0] - q[0]));
    for (const p of pts) if (!hits.length || Math.hypot(hits.at(-1)[0] - p[0], hits.at(-1)[1] - p[1]) > 0.3) hits.push(p);
  }
  const lineLen = 3 * W + 2 * H;
  if (o.lines) {
    lines.forEach(l => Ly.add('mg-test', dSeg(l), 1.6));
    hits.forEach(([x, y]) => Ly.add('mg-hit', dCircle(x, y, 2.4)));
  }
  return { n: cells.length, inside, cut: Math.max(0, cut), hits: hits.length, lineLen };
};

export const kinds = Object.keys(K);

// 縮尺の線の長さ(1・2・5 × 10^k µm で、図の幅の 1/6〜1/3)
export function scaleBar(field) {
  const target = field / 4;
  const k = 10 ** Math.floor(Math.log10(target));
  const v = [1, 2, 5, 10].map(m => m * k).reduce((a, b) => (Math.abs(Math.log(b / target)) < Math.abs(Math.log(a / target)) ? b : a));
  return { um: v, px: (v / field) * W };
}

// 模式図の SVG。o: { kind, seed, field(図の幅 µm), mag(倍率の目安), f, n, lines, thumb, uid, title, label: { mag: '×{m}', um: '{n} µm', note } }
export function drawMicro(o) {
  const draw = K[o.kind];
  if (!draw) throw new Error(`micro.js: 描き方のない組織 ${o.kind}`);
  const R = rng(o.seed ?? seedOf(o.kind));
  const Ly = layers();
  const stats = draw(R, Ly, o) ?? null;
  const uid = o.uid ?? `m${(o.seed ?? 0) >>> 0}`;
  const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
  const body = `<defs><clipPath id="${uid}"><rect width="${W}" height="${H}"/></clipPath></defs><g clip-path="url(#${uid})">${Ly.svg()}</g><rect width="${W}" height="${H}" class="mg-frame"/>`;
  if (o.thumb) return { svg: `<svg viewBox="0 0 ${W} ${H}" role="img"><title>${esc(o.title ?? o.kind)}</title>${body}</svg>`, stats };
  const sb = scaleBar(o.field);
  const L = o.label ?? {};
  const um = (L.um ?? '{n} µm').replace('{n}', sb.um);
  const mag = (L.mag ?? '×{m}').replace('{m}', o.mag);
  const y = H + 20;
  const strip = `<path class="ln" d="M12 ${y - 5}v8M${f1(12 + sb.px)} ${y - 5}v8M12 ${y - 1}H${f1(12 + sb.px)}"/><text x="${f1(20 + sb.px)}" y="${y + 4}" class="sm">${esc(um)}</text>`
    + `<text x="${W - 8}" y="${y + 4}" class="sm m" text-anchor="end">${esc(mag)}</text>`;
  return { svg: `<svg viewBox="0 0 ${W} ${H + STRIP}" role="img"><title>${esc(o.title ?? o.kind)}</title>${body}${strip}</svg>`, stats, scale: sb };
}

// てこの規則の割合: 亜共析(hypo)はパーライト、過共析(hyper)は初析セメンタイトの質量分率 (C − lo)/(hi − lo)
export const leverFrac = (lv, c) => Math.min(1, Math.max(0, (c - lv.lo) / (lv.hi - lv.lo)));
