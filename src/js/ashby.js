// 材料選びチャート(Ashby 図)。材料の性質の範囲を両対数の図に楕円で描き、材料指標が一定の直線を引く。
// 値は M. F. Ashby「Material property data for engineering materials」(5th ed., 2021, Ansys Granta EduPack の教材)の表の範囲。
// その表の誤植・欠けた行は、メーカーの技術資料などで確かめた値に置き換え、確かめられなかった性質は null(図に描かない)。
// 材料ごと・性質ごとの出典は review の sources.md、値の元は ashby_data.py(この配列はそこから作る)。
// 単位: ρ g/cm³、E GPa、σf MPa、K_IC MPa·√m、κ W/(m·K)、α 10⁻⁶ K⁻¹
// 楕円の中心は範囲の両端の相乗平均(対数の図で真ん中)。材料の「代表値」の指標はこの中心の値で計算する
import { num } from './eng.js';

// [id, 群の番号, [ρ], [E], [σf], [K_IC], [κ], [α]](各 [最小, 最大]、null は確かめられた値がない)
export const MATS = [
  ["lcs",0,[7.8,7.9],[200,220],[250,400],[41,82],[49,54],[12,13]],
  ["las",0,[7.8,7.9],[210,220],[400,1500],[14,200],[34,55],[11,14]],
  ["ss",0,[7.6,8.1],[190,210],[170,1170],[62,150],[12,24],[13,20]],
  ["gci",0,[7.1,7.3],[80,140],[140,420],[10,24],[40,72],[11,13]],
  ["al",0,[2.5,2.9],[68,82],[30,500],[22,48],[76,240],[21,24]],
  ["cu",0,[8.9,8.9],[110,150],[30,500],[30,90],[160,390],[17,18]],
  ["mg",0,[1.7,2.0],[42,47],[70,400],[12,18],[50,160],[25,28]],
  ["ti",0,[4.4,4.8],[90,120],[250,1200],[14,120],[6.7,14],[7.9,11]],
  ["ni",0,[8.8,9.0],[190,220],[70,1100],[80,110],[11,91],[12,14]],
  ["pb",0,[10,11],[13,15],[8,14],[5,15],[22,36],[18,32]],
  ["w",0,[10.8,20.0],[310,380],[530,800],[50,60],[100,140],[4,5.6]],
  ["al2o3",1,[3.8,3.98],[340,390],[350,590],[3.3,4.8],[26,39],[7,7.9]],
  ["aln",1,[3.3,3.3],[300,350],[300,350],[2.5,3.4],[140,200],[4.9,5.5]],
  ["sic",1,[3.1,3.2],[400,460],[400,610],[3,5.6],[80,130],[4,4.8]],
  ["wc",1,[10.5,10.6],[630,700],[340,550],[2,3.8],[55,88],[5.2,7.1]],
  ["brick",1,[1.6,2.1],[15,30],[5,14],[1,2],[0.46,0.73],[5,8]],
  ["concrete",1,[2.3,2.6],[15,25],[1,3],[0.35,0.45],[0.8,2.4],[6,13]],
  ["stone",1,[2.0,2.6],[20,60],[2,25],[0.7,1.4],[1.3,6],[3.7,6.3]],
  ["sodalime",2,[2.4,2.5],[68,72],[30,35],[0.55,0.75],[0.7,1.3],[9.0,9.5]],
  ["boro",2,[2.2,2.3],[61,64],[22,32],[0.5,0.7],[1,1.3],[3.2,4]],
  ["silica",2,[2.2,2.2],[68,74],[45,160],[0.6,0.8],[1.3,1.5],[0.52,0.75]],
  ["pe",3,[0.94,0.96],[0.62,0.9],[18,29],[1.4,1.7],[0.4,0.44],[130,200]],
  ["pp",3,[0.89,0.91],[0.9,1.6],[21,37],[3,4.5],[0.11,0.17],[120,180]],
  ["ps",3,[1.0,1.1],[1.2,2.6],[29,56],[0.7,1.1],[0.12,0.13],[90,150]],
  ["pvc",3,[1.3,1.6],[2.1,4.1],[35,52],[1.5,5.1],[0.15,0.29],[100,150]],
  ["pmma",3,[1.2,1.2],[2.2,3.8],[54,72],[0.7,1.6],[0.084,0.25],[72,160]],
  ["pa",3,[1.1,1.1],[2.6,3.2],[50,95],[2.2,5.6],[0.23,0.25],[140,150]],
  ["pc",3,[1.1,1.2],[2,2.4],[59,70],[2.1,4.6],[0.19,0.22],[120,140]],
  ["peek",3,[1.3,1.3],[3.8,4],[65,95],[2.7,4.3],[0.24,0.26],[72,190]],
  ["ptfe",3,[2.1,2.2],[0.4,0.55],[15,25],[1.3,1.8],[0.24,0.26],[130,220]],
  ["epoxy",3,[1.1,1.4],[2.4,3.1],[36,72],[0.4,2.2],[0.18,0.5],[58,120]],
  ["iir",4,[0.9,0.92],[0.001,0.002],[2,3],[0.07,0.1],[0.08,0.1],[120,300]],
  ["nr",4,[0.92,0.93],[0.0015,0.0025],[20,30],[0.15,0.25],[0.1,0.14],[150,450]],
  ["cr",4,[1.2,1.3],[0.0007,0.002],[3.4,24],[0.1,0.3],[0.1,0.2],[185,250]],
  ["sir",4,[1.3,1.8],[0.005,0.022],[2.4,5.5],[0.033,0.5],[0.3,1],[250,300]],
  ["cfrp",5,[1.5,1.6],[69,150],[550,1100],[6.1,20],[1.3,2.6],[1,4]],
  ["gfrp",5,[1.8,2.0],[15,28],[110,190],[7,23],[0.4,0.55],[8.6,33]],
  ["ffoam",6,[0.038,0.07],[0.001,0.003],[0.02,0.3],[0.015,0.05],null,null],
  ["rfoam",6,[0.036,0.07],[0.023,0.08],[0.3,1.7],[0.002,0.02],null,null],
  ["rfoamh",6,[0.17,0.47],[0.2,0.48],[0.8,12],[0.024,0.09],null,null],
  ["cork",7,[0.12,0.24],[0.013,0.05],[0.3,1.5],[0.05,0.1],[0.035,0.048],[130,230]],
  ["paper",7,[0.48,0.86],[3,8.9],[15,34],[6,10],[0.06,0.17],[5,20]],
  ["woodl",7,[0.6,0.8],[6,20],[30,70],[5,9],[0.31,0.38],[2,11]],
  ["woodt",7,[0.6,0.8],[0.5,3],[2,6],[0.5,0.8],[0.15,0.19],[32,43]],
];

export const PROPS = ['rho', 'E', 's', 'K', 'k', 'a'];
export const UNIT = { rho: 'g/cm³', E: 'GPa', s: 'MPa', K: 'MPa·√m', k: 'W/(m·K)', a: '10⁻⁶ K⁻¹' };
export const SYM = { rho: 'ρ', E: 'E', s: 'σf', K: 'K_IC', k: 'κ', a: 'α' };
export const GROUPS = ['metal', 'ceramic', 'glass', 'polymer', 'elastomer', 'composite', 'foam', 'natural'];
// 群ごとの塗り(サイトの .fig のクラス)と輪郭のクラス。輪郭が null の群は塗りのクラスに輪郭がある(dep は破線)。
// 発泡体は、複合材料(n の塗り)と見分けやすいように、白地(ok)に斜線の模様(thin の線)と破線の輪郭にする
const FILL = { metal: ['metal', 'thin'], ceramic: ['ox', 'thin'], glass: ['dep', null], polymer: ['p', 'thin'],
  elastomer: ['ng', 'thin'], composite: ['n', 'thin'], foam: ['ok', 'dash'], natural: ['fa2', 'thin'] };
const HATCH = { foam: true };
const OPACITY = { natural: 0.4 }; // fa2 は濃い色なので薄く塗る(ほかは 0.7)
// 斜線の模様(線は .fig の thin のクラスなので、色はサイトの CSS が決める)
const hatchDef = id => `<pattern id="${id}" patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(45)"><line class="thin" x1="0" y1="0" x2="0" y2="5"/></pattern>`;
// 凸包(Andrew の単調連鎖法)。点は [x, y]
function hull(pts) {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const half = list => { const h = []; for (const q of list) { while (h.length >= 2 && cross(h[h.length - 2], h[h.length - 1], q) <= 0) h.pop(); h.push(q); } h.pop(); return h; };
  return p.length < 3 ? p : [...half(p), ...half([...p].reverse())];
}
// 多角形の面積の重心と、点が中にあるか
function centroid(poly) {
  let A = 0, cx = 0, cy = 0;
  poly.forEach((p, i) => { const q = poly[(i + 1) % poly.length], c = p[0] * q[1] - q[0] * p[1]; A += c; cx += (p[0] + q[0]) * c; cy += (p[1] + q[1]) * c; });
  return Math.abs(A) < 1e-9 ? poly[0] : [cx / (3 * A), cy / (3 * A)];
}
const centroidArea = poly => poly.reduce((A, p, i) => { const q = poly[(i + 1) % poly.length]; return A + (p[0] * q[1] - q[0] * p[1]) / 2; }, 0);
const inside = (poly, x, y) => poly.reduce((inn, p, i) => { const q = poly[(i + 1) % poly.length]; return (p[1] > y) !== (q[1] > y) && x < (q[0] - p[0]) * (y - p[1]) / (q[1] - p[1]) + p[0] ? !inn : inn; }, false);

// 材料指標 = n^p / d。n と d が図の2つの軸のとき、指標が一定の線は両対数で直線になる
export const INDEX = {
  e1: { n: 'E', d: 'rho', p: 1, f: 'E/ρ', u: 'GPa/(g/cm³)', v: 25 },
  e2: { n: 'E', d: 'rho', p: 1 / 2, f: '√E/ρ', u: 'GPa^½/(g/cm³)', v: 3 },
  e3: { n: 'E', d: 'rho', p: 1 / 3, f: '∛E/ρ', u: 'GPa^⅓/(g/cm³)', v: 1.5 },
  s1: { n: 's', d: 'rho', p: 1, f: 'σf/ρ', u: 'MPa/(g/cm³)', v: 100 },
  s23: { n: 's', d: 'rho', p: 2 / 3, f: '∛(σf²)/ρ', u: 'MPa^⅔/(g/cm³)', v: 10 },
  s12: { n: 's', d: 'rho', p: 1 / 2, f: '√σf/ρ', u: 'MPa^½/(g/cm³)', v: 5 },
  ks: { n: 'K', d: 's', p: 1, f: 'K_IC/σf', u: '√m', v: 0.1 },
  ka: { n: 'k', d: 'a', p: 1, f: 'κ/α', u: 'W/(m·K)/(10⁻⁶ K⁻¹)', v: 5 },
};

export const range = (m, prop) => m[2 + PROPS.indexOf(prop)];
const gmean = r => Math.sqrt(r[0] * r[1]);
// 材料の指標: 代表値 c(楕円の中心)と、範囲の端どうしで取りうる最小 lo・最大 hi
export function indexOf(m, key) {
  const { n, d, p } = INDEX[key], N = range(m, n), D = range(m, d);
  if (!N || !D) return null;
  return { c: gmean(N) ** p / gmean(D), lo: N[0] ** p / D[1], hi: N[1] ** p / D[0] };
}
// 指標がこの軸の組み合わせ(縦 y・横 x)で直線になるか
export const fits = (key, x, y) => { const { n, d } = INDEX[key] ?? {}; return !!n && ((x === d && y === n) || (x === n && y === d)); };
// 両対数の図での線の傾き。縦軸が分子の性質なら 1/p、逆なら p
export const slope = (key, x) => (x === INDEX[key].d ? 1 / INDEX[key].p : INDEX[key].p);
// 指標 = v の線の、横軸の値 X での縦軸の値
export const lineY = (key, v, x, X) => { const { d, p } = INDEX[key]; return x === d ? (v * X) ** (1 / p) : X ** p / v; };
// 図の点(横 X・縦 Y)を通る線の指標の値
export const indexAt = (key, x, X, Y) => { const { d, p } = INDEX[key]; return x === d ? Y ** p / X : X ** p / Y; };
// 指標の値 v に対する材料の位置: 'good'(代表値が線の良い側)、'cross'(範囲が線をまたぐ)、'bad'
export const side = (ix, v) => (ix.c >= v ? 'good' : ix.hi >= v ? 'cross' : 'bad');
// 軸の範囲: 値のある材料を全部含む10の累乗の区切り。[下端の指数, 上端の指数]
export function axisOf(prop) {
  const vals = MATS.map(m => range(m, prop)).filter(Boolean).flat();
  return [Math.floor(Math.log10(Math.min(...vals)) + 1e-9), Math.ceil(Math.log10(Math.max(...vals)) - 1e-9)];
}
const sig = x => Number(x.toPrecision(3));

// ---- ここから画面 ----
const form = document.getElementById('ashby-form');
if (form) {
  const out = k => document.querySelector(`[data-out="${k}"]`);
  const T = JSON.parse(form.dataset.text);
  const el = form.elements;
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const NAME = Object.fromEntries([...el.mat.options].map(o => [o.value, o.textContent]));
  const unitOf = prop => (prop === 'rho' ? 'g/cm³' : UNIT[prop]);
  const axisLabel = prop => `${T[`p_${prop}`]} ${SYM[prop]} (${unitOf(prop)})`;
  const fmt = x => num(x, 3);
  // 13px の文字列のおおよその幅(viewBox の単位)。太字を考えて、全角(ハングルを含む)は 13.5、半角は 8.2 とみなす
  // 括弧書き: 日本語・中国語・韓国語は前に空白を入れず、ほかの言語は空白を入れる
  const par = str => (/^(ja|zh|ko)/.test(document.documentElement.lang) ? `(${str})` : ` (${str})`);
  const tw = str => [...str].reduce((w, c) => w + (/[\u2e80-\u9fff\uf900-\uffef]/.test(c) ? 13.5 : 8.2), 0);
  const rng = r => (r[0] === r[1] ? fmt(r[0]) : `${fmt(r[0])}–${fmt(r[1])}`);
  // 目盛の数字: 0.001〜1000 はそのまま、それ以外は 10 の累乗
  const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
  const tick = e => (e >= -3 && e <= 3 ? num(10 ** e, 1) : `10${String(e).replace(/./g, c => SUP[c])}`);

  // 枠の骨組み(図・スライダー・凡例・説明)は一度だけ作り、あとは中身だけ書き換える
  // (スライダーを動かしている途中で作り直すと、つかんでいる指が外れるため)
  const box = out('chart');
  box.innerHTML = `<div class="fig"><div data-ab="svg"></div>
<label class="dy-field" data-ab="slider-wrap" style="margin-top: 8px"><span data-ab="slider-label"></span><input type="range" data-ab="slider" min="0" max="1" step="0.005" style="padding: 0; border: 0; background: none; min-height: 32px"></label>
<p data-ab="legend" style="display: flex; flex-wrap: wrap; justify-content: center; gap: 4px 14px; margin: 8px 0 0; font-size: .85rem">${GROUPS.map(g => {
    const [fc, oc] = FILL[g], at = 'cx="11" cy="7" rx="9.5" ry="5.5"';
    return `<span style="display: inline-flex; align-items: center; gap: 5px"><svg viewBox="0 0 22 14" aria-hidden="true" style="display: inline-block; width: 22px; height: 14px; margin: 0">${HATCH[g] ? `<defs>${hatchDef(`ab-hatch-${g}`)}</defs>` : ''}<ellipse class="${fc}" ${at} fill-opacity="${OPACITY[g] ?? 0.7}"${oc ? ' stroke-opacity="0"' : ' style="stroke-width: 1.5"'}/>${HATCH[g] ? `<ellipse ${at} fill="url(#ab-hatch-${g})"/>` : ''}${oc ? `<ellipse class="${oc}" ${at} style="stroke-width: 1.5"/>` : ''}</svg>${esc(T[`g_${g}`])}</span>`;
  }).join('')}</p></div>
<p class="muted" data-ab="cap"></p>`;
  const part = k => box.querySelector(`[data-ab="${k}"]`);
  // 選択肢の名前が切れないように(この画面だけの調整): 選択欄の文字と左右の余白を少し小さくし、
  // 名前が長い「材料指標」「材料」の欄は2列分の幅に、狭い画面では縦軸・横軸の欄も2列分にする
  for (const s of form.querySelectorAll('select')) { s.style.fontSize = '.9rem'; s.style.paddingLeft = s.style.paddingRight = '6px'; }
  const layout = () => {
    const narrow = form.clientWidth < 420;
    for (const n of ['idx', 'mat', 'y', 'x']) {
      const lab = el[n].closest('label');
      if (lab) lab.style.gridColumn = n === 'idx' || n === 'mat' || narrow ? 'span 2' : '';
    }
  };
  layout();
  if (window.ResizeObserver) new ResizeObserver(layout).observe(form);
  const slider = part('slider');

  let W, H, mg, pw, ph;
  const size = () => {
    const small = box.clientWidth < 460;
    // 狭い画面では viewBox を小さくし、枠の余白も詰めて、文字が小さくなりすぎないようにする
    [W, H, mg] = small ? [300, 330, { l: 40, r: 6, t: 8, b: 38 }] : [520, 470, { l: 58, r: 12, t: 12, b: 46 }];
    pw = W - mg.l - mg.r; ph = H - mg.t - mg.b;
    box.firstElementChild.style.padding = small ? '6px 4px' : '';
    return small;
  };
  let geo = null; // 今の図の座標変換と楕円(クリックの判定に使う)

  function draw(st) {
    const small = size();
    const { x, y, key, v, sel } = st;
    if (x === y) { part('svg').innerHTML = `<p>${esc(T.same_axes)}</p>`; geo = null; return; }
    const lx = axisOf(x), ly = axisOf(y);
    const ax = lx.map(e => 10 ** e), ay = ly.map(e => 10 ** e);
    const X = val => mg.l + (Math.log10(val) - lx[0]) / (lx[1] - lx[0]) * pw;
    const Y = val => mg.t + (ly[1] - Math.log10(val)) / (ly[1] - ly[0]) * ph;
    const f1 = z => z.toFixed(1);
    const rmin = small ? 5 : 6; // 範囲の狭い材料も見分けて押せるように、楕円の半径の最小値(viewBox の単位)
    // 楕円(面積の大きい順に描き、小さいものを上に重ねる)
    const els = MATS.filter(m => range(m, x) && range(m, y)).map(m => {
      const rx = range(m, x), ry = range(m, y);
      const cx = (X(rx[0]) + X(rx[1])) / 2, cy = (Y(ry[0]) + Y(ry[1])) / 2;
      const a = Math.max(Math.abs(X(rx[1]) - X(rx[0])) / 2, rmin), b = Math.max(Math.abs(Y(ry[1]) - Y(ry[0])) / 2, rmin);
      const ix = key ? indexOf(m, key) : null;
      return { m, cx, cy, a, b, pos: ix ? side(ix, v) : 'none' };
    }).sort((p, q) => q.a * q.b - p.a * p.b);
    geo = { X, Y, lx, ly, els };
    // 楕円: 塗り(+発泡体は斜線)と輪郭。線より良い側は濃い輪郭で、悪い側は全体を薄く
    const shape = e => {
      const g = GROUPS[e.m[1]], [fc, oc] = FILL[g];
      const fade = e.pos === 'bad' ? ' opacity="0.18"' : '';
      const at = `cx="${f1(e.cx)}" cy="${f1(e.cy)}" rx="${f1(e.a)}" ry="${f1(e.b)}"`;
      const good = e.pos === 'good';
      const fill = `<ellipse class="${fc}" ${at} fill-opacity="${good ? 0.9 : OPACITY[g] ?? 0.7}"${oc || good ? ' stroke-opacity="0"' : ' style="stroke-width: 1.6"'}/>`;
      const hatch = HATCH[g] ? `<ellipse ${at} fill="url(#ab-hatch)"/>` : '';
      const line = good ? `<ellipse class="ln" ${at} style="stroke-width: 2.4"/>` : oc ? `<ellipse class="${oc}" ${at} style="stroke-width: 1.6"/>` : '';
      return `<g data-m="${e.m[0]}"${fade}>${fill}${hatch}${line}</g>`;
    };
    // 群の包絡線: 群の楕円の周りの点(少し膨らませる)の凸包。対数の図の座標で直線的に計算できる
    const pad = small ? 5 : 7;
    const env = GROUPS.map((g, gi) => {
      const es = els.filter(e => e.m[1] === gi);
      if (!es.length) return null;
      const pts = es.flatMap(e => Array.from({ length: 24 }, (_, k) => [e.cx + (e.a + pad) * Math.cos(k * Math.PI / 12), e.cy + (e.b + pad) * Math.sin(k * Math.PI / 12)]));
      return { g, poly: hull(pts) };
    }).filter(Boolean);
    const envSvg = env.map(({ g, poly }) => {
      const pts = poly.map(p => `${f1(p[0])},${f1(p[1])}`).join(' ');
      const fc = HATCH[g] ? 'ok' : FILL[g][0];
      return `<polygon class="${fc}" points="${pts}" fill-opacity="${g === 'natural' ? 0.1 : 0.22}" stroke-opacity="0"/><polygon class="dash" points="${pts}" style="stroke-width: 1.1"/>`;
    }).join('');
    const placed = []; // 置いた名前(重ならないようにずらすため)
    // 選んだ材料の輪郭と名前
    let mark = '';
    const se = els.find(e => e.m[0] === sel);
    if (se) {
      let nm = NAME[sel], w = tw(nm);
      const fits = ww => se.cx + se.a + 4 + ww <= W - mg.r || se.cx - se.a - 4 - ww >= mg.l;
      if (!fits(w)) { nm = nm.split(/[(（]/)[0].trim(); w = tw(nm); } // 長い名前は括弧の前だけ
      const right = se.cx + se.a + 4 + w <= W - mg.r || se.cx - se.a - 4 - w < mg.l;
      const tx = right ? Math.max(mg.l + 2, Math.min(se.cx + se.a + 4, W - mg.r - w)) : Math.min(W - mg.r - 2, Math.max(se.cx - se.a - 4, mg.l + w));
      const ty = Math.min(Math.max(se.cy - se.b - 4, mg.t + 12), mg.t + ph - 4);
      placed.push({ x: right ? tx + w / 2 : tx - w / 2, y: ty, w });
      mark = `<ellipse class="ac" cx="${f1(se.cx)}" cy="${f1(se.cy)}" rx="${f1(se.a + 2.5)}" ry="${f1(se.b + 2.5)}"/>`
        + `<text class="sm a" x="${f1(tx)}" y="${f1(ty)}" text-anchor="${right ? 'start' : 'end'}">${esc(nm)}</text>`;
    }
    // 指標の線と「良い側」の印
    let line = '', lineSeg = null;
    if (key) {
      const p0 = [ax[0], lineY(key, v, x, ax[0])], p1 = [ax[1], lineY(key, v, x, ax[1])];
      line = `<line class="ac2" x1="${f1(X(p0[0]))}" y1="${f1(Y(p0[1]))}" x2="${f1(X(p1[0]))}" y2="${f1(Y(p1[1]))}"/>`;
      lineSeg = [[X(p0[0]), Y(p0[1])], [X(p1[0]), Y(p1[1])]];
      // 線の上で図の中に入っている部分の中ほどに、良い側の向きを書く
      const pts = [];
      for (let i = 0; i <= 40; i++) {
        const xv = 10 ** (lx[0] + (lx[1] - lx[0]) * i / 40), yv = lineY(key, v, x, xv);
        if (yv >= ay[0] && yv <= ay[1]) pts.push([X(xv), Y(yv)]);
      }
      if (pts.length) {
        const [mx, my] = pts[Math.floor(pts.length / 2)];
        const up = x === INDEX[key].d; // 縦軸が分子の性質なら左上が良い側
        const gw = tw(up ? T.good_up : T.good_down);
        const tx = up ? Math.min(Math.max(mx - 10, mg.l + gw + 2), W - mg.r - 2) : Math.max(Math.min(mx + 10, W - mg.r - gw - 2), mg.l + 2);
        const ty = Math.min(Math.max(my + (up ? -12 : 22), mg.t + 14), mg.t + ph - 6);
        line += `<text class="sm a" x="${f1(tx)}" y="${f1(ty)}" text-anchor="${up ? 'end' : 'start'}">${esc(up ? T.good_up : T.good_down)}</text>`;
        placed.push({ x: up ? tx - gw / 2 : tx + gw / 2, y: ty, w: gw });
      }
    }
    // 群の名前: 包絡線の重心の近くで、ほかの名前と重ならない位置を、点数の小さい候補から選ぶ。
    // 点数 = 重心からの距離 + 楕円にかぶる数(ほかの群は重く)+ 自分の包絡線の外(外なら引き出し線を引く)+ 指標の線にかぶる。
    // 読みやすいように、名前の下に白地(ok)の札を敷く
    const hitAt = (x0, y0, w) => placed.some(q => Math.abs(q.x - x0) < (q.w + w) / 2 + 4 && Math.abs(q.y - y0) < 18);
    const cand = [];
    for (let dy = -120; dy <= 120; dy += 8) for (let dx = -160; dx <= 160; dx += 10) cand.push([dx, dy]);
    const seg = lineSeg; // 指標の線の両端(なければ null)
    const nearLine = (x0, y0) => {
      if (!seg) return false;
      const [[x1, y1], [x2, y2]] = seg, L2 = (x2 - x1) ** 2 + (y2 - y1) ** 2;
      const t = Math.max(0, Math.min(1, ((x0 - x1) * (x2 - x1) + (y0 - y1) * (y2 - y1)) / L2));
      return Math.hypot(x0 - x1 - t * (x2 - x1), y0 - y1 - t * (y2 - y1)) < 11;
    };
    const order = env.map(e => ({ ...e, area: Math.abs(centroidArea(e.poly)) })).sort((p, q) => p.area - q.area);
    const glabels = order.map(({ g, poly }) => {
      const gi = GROUPS.indexOf(g), name = T[`g_${g}`], w = tw(name);
      const [gx, gy] = centroid(poly);
      let best = null, bestScore = Infinity;
      for (const [dx, dy] of cand) {
        const x0 = gx + dx, y0 = gy + 4 + dy;
        if (x0 - w / 2 < mg.l + 2 || x0 + w / 2 > W - mg.r - 2 || y0 - 12 < mg.t + 2 || y0 + 4 > mg.t + ph - 2 || hitAt(x0, y0, w)) continue;
        const sx = [x0 - w / 2 - 2, x0, x0 + w / 2 + 2], sy = [y0 - 12, y0 - 4, y0 + 4];
        let own = 0, other = 0;
        for (const e of els) {
          if (sx.some(px => sy.some(py => ((px - e.cx) / (e.a + 2)) ** 2 + ((py - e.cy) / (e.b + 2)) ** 2 <= 1))) e.m[1] === gi ? own++ : other++;
        }
        const out = !inside(poly, x0, y0 - 4);
        const sc = Math.hypot(dx, dy * 1.3) + 80 * other + 30 * own + (out ? 35 : 0) + (nearLine(x0, y0 - 4) ? 30 : 0);
        if (sc < bestScore) { bestScore = sc; best = [x0, y0, out]; }
      }
      if (!best) best = [Math.min(Math.max(gx, mg.l + w / 2 + 2), W - mg.r - w / 2 - 2), Math.min(Math.max(gy + 4, mg.t + 14), mg.t + ph - 4), false];
      const [tx, ty, out] = best;
      placed.push({ x: tx, y: ty, w });
      // 包絡線の外に置いたときや、自分の群の楕円から離れたときは、いちばん近い楕円の縁へ引き出し線を引く
      let lead = '';
      const near = els.filter(e => e.m[1] === gi).map(e => {
        const dx = tx - e.cx, dy = ty - 4 - e.cy, d = Math.hypot(dx, dy) || 1;
        const r = 1 / Math.sqrt((dx / d / e.a) ** 2 + (dy / d / e.b) ** 2); // 楕円の中心から、その向きの縁までの長さ
        return { e, gap: d - r, ex: e.cx + dx / d * r, ey: e.cy + dy / d * r };
      }).sort((p, q) => p.gap - q.gap)[0];
      if (near && (out || near.gap > Math.max(16, w / 2 + 6))) lead = `<line class="thin" x1="${f1(tx)}" y1="${f1(ty - 4)}" x2="${f1(near.ex)}" y2="${f1(near.ey)}"/>`;
      return `<g data-g="${g}">${lead}<rect class="ok" x="${f1(tx - w / 2 - 3)}" y="${f1(ty - 12)}" width="${f1(w + 6)}" height="16" rx="3" fill-opacity="0.88" stroke-opacity="0"/><text class="sm" x="${f1(tx)}" y="${f1(ty)}" text-anchor="middle" font-weight="700">${esc(name)}</text></g>`;
    }).join('');
    const ex = [], ey = [];
    for (let e = lx[0]; e <= lx[1]; e++) ex.push(e);
    for (let e = ly[0]; e <= ly[1]; e++) ey.push(e);
    const step = small && ex.length > 5 ? 2 : 1, stepY = small && ey.length > 7 ? 2 : 1;
    const svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="ab-title" style="touch-action: manipulation; cursor: pointer">
  <title id="ab-title">${esc(T.chart_title.replace('{y}', axisLabel(y)).replace('{x}', axisLabel(x)))}</title>
  <defs><clipPath id="ab-clip"><rect x="${mg.l}" y="${mg.t}" width="${pw}" height="${ph}"/></clipPath>${hatchDef('ab-hatch')}</defs>
  <rect class="ok" x="${mg.l}" y="${mg.t}" width="${pw}" height="${ph}"/>
  <g clip-path="url(#ab-clip)">
    ${ex.slice(1, -1).map(e => `<line class="thin" stroke-dasharray="2 4" x1="${f1(X(10 ** e))}" x2="${f1(X(10 ** e))}" y1="${mg.t}" y2="${mg.t + ph}"/>`).join('')}
    ${ey.slice(1, -1).map(e => `<line class="thin" stroke-dasharray="2 4" y1="${f1(Y(10 ** e))}" y2="${f1(Y(10 ** e))}" x1="${mg.l}" x2="${mg.l + pw}"/>`).join('')}
    ${envSvg}
    ${els.map(shape).join('')}
    ${line}${glabels}${mark}
  </g>
  ${ex.filter((e, i) => i % step === 0).map(e => `<text class="sm m" x="${f1(X(10 ** e))}" y="${H - mg.b + 16}" text-anchor="${e === lx[1] ? 'end' : e === lx[0] ? 'start' : 'middle'}">${tick(e)}</text>`).join('')}
  ${ey.filter((e, i) => i % stepY === 0).map(e => `<text class="sm m" x="${mg.l - 4}" y="${f1(Y(10 ** e) + 4)}" text-anchor="end">${tick(e)}</text>`).join('')}
  <text class="sm" x="${mg.l + pw / 2}" y="${H - 8}" text-anchor="middle">${esc(axisLabel(x))}</text>
  <text class="sm" transform="translate(${small ? 11 : 14} ${mg.t + ph / 2}) rotate(-90)" text-anchor="middle">${esc(axisLabel(y))}</text>
</svg>`;
    part('svg').innerHTML = svg;
    part('svg').querySelector('svg').addEventListener('click', pick);
  }

  // 図のクリック・タップ: 「材料を選ぶ」なら、その点を含む楕円のうち一番小さいもの(なければ近くの楕円)を選ぶ。
  // 「線を動かす」なら、その点を通る線になるように指標の値を変える
  function pick(e) {
    if (!geo) return;
    const svg = e.currentTarget, pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const q = pt.matrixTransform(svg.getScreenCTM().inverse());
    if (q.x < mg.l || q.x > mg.l + pw || q.y < mg.t || q.y > mg.t + ph) return;
    const key = el.idx.value;
    if (el.tap.value === 'line' && key !== 'none') {
      const Xv = 10 ** (geo.lx[0] + (q.x - mg.l) / pw * (geo.lx[1] - geo.lx[0]));
      const Yv = 10 ** (geo.ly[1] - (q.y - mg.t) / ph * (geo.ly[1] - geo.ly[0]));
      el.v.value = String(sig(indexAt(key, el.x.value, Xv, Yv)));
    } else {
      const inside = geo.els.filter(g => ((q.x - g.cx) / g.a) ** 2 + ((q.y - g.cy) / g.b) ** 2 <= 1).sort((a, b) => a.a * a.b - b.a * b.b);
      const near = geo.els.map(g => [Math.hypot(q.x - g.cx, q.y - g.cy), g]).filter(([dd]) => dd < 18).sort((a, b) => a[0] - b[0]);
      const hit = inside[0] ?? near[0]?.[1];
      if (!hit) return;
      el.mat.value = hit.m[0];
    }
    form.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // スライダーは指標の値の対数。範囲は、その指標を計算できる材料の値の全体より少し広く
  let sliderKey = '';
  function setSlider(key, v) {
    const wrap = part('slider-wrap');
    if (key === 'none') { wrap.hidden = true; return; }
    wrap.hidden = false;
    const I = INDEX[key];
    part('slider-label').textContent = `${T.slider} ${I.f} = ${fmt(v)} ${I.u}`;
    if (sliderKey !== key) {
      const ixs = MATS.map(m => indexOf(m, key)).filter(Boolean);
      slider.min = String(Math.floor(Math.log10(Math.min(...ixs.map(i => i.lo))) * 10) / 10);
      slider.max = String(Math.ceil(Math.log10(Math.max(...ixs.map(i => i.hi))) * 10) / 10);
      sliderKey = key;
    }
    if (document.activeElement !== slider) slider.value = String(Math.log10(v));
  }
  slider.addEventListener('input', () => {
    el.v.value = String(sig(10 ** Number(slider.value)));
    form.dispatchEvent(new Event('input', { bubbles: true }));
  });

  // wrap: 値の欄も折り返す(狭い画面で値の欄が表の外にはみ出して見えなくならないように)
  // (値の欄も折り返し、セルの余白を詰める)
  const table = (head, rows, id, wrap = false) => {
    const pad = wrap ? ' padding: 6px 5px;' : '';
    const td = wrap ? ` style="white-space: normal; overflow-wrap: normal;${pad}"` : '';
    return `<div class="table-wrap"><table class="dy-table"${wrap ? ' style="font-size: .88rem"' : ''}>
<thead><tr>${head.map(h => `<th scope="col" style="white-space: normal; overflow-wrap: normal;${pad}">${esc(h)}</th>`).join('')}</tr></thead>
<tbody>${rows.map((r, i) => `<tr><th scope="row" style="white-space: normal; overflow-wrap: normal;${pad}">${esc(r[0])}</th>${r.slice(1).map((c, j) => `<td data-out="${id}-${i}-${j}"${td}>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody>
</table></div>`;
  };

  // 入力の読み取り。指標の値が数でない・0以下なら、その指標の既定値
  function state() {
    const x = el.x.value, y = el.y.value, key = el.idx.value === 'none' ? null : el.idx.value;
    let v = Number(String(el.v.value).trim());
    if (key && !(Number.isFinite(v) && v > 0)) v = INDEX[key].v;
    return { x, y, key, v, sel: el.mat.value };
  }

  let last = '';
  function update(ev) {
    // 指標を選び直したら、その指標の軸の組み合わせにして、線の位置をその指標の既定値にする。
    // 軸を変えて指標が直線にならなくなったら、指標を「なし」にする
    const t = ev?.target;
    if (t === el.idx && el.idx.value !== 'none') {
      const I = INDEX[el.idx.value];
      if (!fits(el.idx.value, el.x.value, el.y.value)) { el.y.value = I.n; el.x.value = I.d; }
      el.v.value = String(I.v);
    } else if ((t === el.x || t === el.y) && el.idx.value !== 'none' && !fits(el.idx.value, el.x.value, el.y.value)) {
      el.idx.value = 'none';
    }
    const st = state();
    const k = `${st.x} ${st.y} ${st.key} ${st.v} ${st.sel} ${el.tap.value} ${size()}`;
    if (k === last) return;
    last = k;
    draw(st);
    setSlider(st.key ?? 'none', st.v);

    // 図の説明: タップの使い方と、この組み合わせで値のない材料
    const miss = MATS.filter(m => !range(m, st.x) || !range(m, st.y)).map(m => NAME[m[0]]);
    const hint = el.tap.value === 'line' && st.key ? T.hint_line : el.tap.value === 'line' ? T.hint_line_none : T.hint_pick;
    part('cap').textContent = `${hint}${miss.length && st.x !== st.y ? ` ${T.missing.replace('{list}', miss.join(T.sep))}` : ''}`;

    // 線の傾きと、良い側にある材料の数
    const ixs = st.key && st.x !== st.y ? MATS.map(m => [m, indexOf(m, st.key)]).filter(([, i]) => i) : [];
    if (st.key && st.x !== st.y) {
      const sl = slope(st.key, st.x);
      out('slope').textContent = `${num(sl, 3)}${par(`${INDEX[st.key].f} = ${fmt(st.v)} ${INDEX[st.key].u}`)}`;
      const good = ixs.filter(([, i]) => side(i, st.v) === 'good').length, cross = ixs.filter(([, i]) => side(i, st.v) === 'cross').length;
      out('above').textContent = T.above_fmt.replace('{n}', good).replace('{m}', cross);
    } else {
      out('slope').textContent = '–';
      out('above').textContent = '–';
    }

    // 指標の高い順の一覧(範囲の一部でも線の良い側にかかる材料)
    if (!st.key || st.x === st.y) {
      out('rank').innerHTML = `<p>${esc(st.x === st.y ? T.same_axes : T.no_index)}</p>`;
    } else {
      const I = INDEX[st.key];
      // 狭い画面では「群」の列を省く(群は選んだ材料の表と図の色でわかる)
      const narrow = box.clientWidth < 460;
      const rows = ixs.filter(([, i]) => i.hi >= st.v).sort((a, b) => b[1].c - a[1].c)
        .map(([m, i]) => [NAME[m[0]], ...(narrow ? [] : [T[`g_${GROUPS[m[1]]}`]]), fmt(i.c), `${fmt(i.lo)}–${fmt(i.hi)}`, T[`pos_${side(i, st.v)}`]]);
      const head = [T.col_mat, ...(narrow ? [] : [T.col_group]), `${T.col_idx} ${I.f}`, T.col_range, T.col_pos];
      out('rank').innerHTML = (rows.length
        ? `<p>${esc(T.rank_lead.replace('{f}', I.f).replace('{v}', fmt(st.v)).replace('{u}', I.u))}</p>${table(head, rows, 'rank', narrow)}`
        : `<p>${esc(T.rank_none)}</p>`) + `<p class="muted">${esc(T.rank_note)}</p>`;
    }

    // 選んだ材料の値の範囲
    const m = MATS.find(z => z[0] === st.sel);
    if (!m) { out('mat').innerHTML = `<p>${esc(T.hint_pick)}</p>`; return; }
    const g = GROUPS[m[1]];
    const rows = PROPS.map(p => {
      const r = range(m, p);
      const label = p === 's' ? `${T.p_s} ${SYM.s}${par(T[`sk_${g}`])}` : `${T[`p_${p}`]} ${SYM[p]}`;
      return [label, r ? `${rng(r)} ${unitOf(p)}` : T.unverified];
    });
    if (st.key) {
      const i = indexOf(m, st.key), I = INDEX[st.key];
      rows.push([`${T.mat_idx} ${I.f}`, i ? `${fmt(i.c)}${par(`${fmt(i.lo)}–${fmt(i.hi)}`)} ${I.u}` : T.unverified]);
    }
    out('mat').innerHTML = `<p><strong>${esc(NAME[m[0]])}</strong>${esc(par(T[`g_${g}`]))}</p>${table([T.col_prop, T.col_val], rows, 'mat', box.clientWidth < 460)}`;
  }
  form.addEventListener('input', update);
  form.addEventListener('change', update);
  form.addEventListener('submit', e => e.preventDefault());
  // URL から開いたとき、指標と軸が合わない組み合わせなら指標を「なし」に
  if (el.idx.value !== 'none' && !fits(el.idx.value, el.x.value, el.y.value)) el.idx.value = 'none';
  if (window.ResizeObserver) new ResizeObserver(() => update()).observe(box);
  update();
}
