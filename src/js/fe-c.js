// 鉄–炭素(Fe–Fe₃C、準安定系)状態図。主な点は教科書の定番の値で、線はその点を通る近似:
// A3(GS)は 912 ℃ から共析点まで T = 912 − 185·(C/0.76)^0.7 の滑らかな曲線、そのほかの線は直線。
// 727 ℃より下のαの固溶限(PQ)は 0.022 wt%(727 ℃)から 0.002 wt%(20 ℃)へ指数関数で下がる形の模式。
// 図の点(炭素量 c、温度 t)の相を決め、二相領域ならタイラインの両端の組成と、てこの規則での質量分率を出す。
// あわせて、その炭素量の合金を液相からゆっくり冷やしたときの室温の組織の分率(727 ℃直下の値で近似)を出す
import { num, reader } from './eng.js';

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

// ---- ここから画面 ----
const form = document.getElementById('fe-c-form');
if (form) {
  const out = k => document.querySelector(`[data-out="${k}"]`);
  const val = reader(form);
  const T = JSON.parse(form.dataset.text);
  const SYM = { alpha: 'α', gamma: 'γ', delta: 'δ', L: 'L', cem: 'Fe₃C' };
  const pct = w => `${num(w * 100, 3)} %`;
  const wt = x => `${num(x, x < 0.1 ? 2 : 3)} wt%`;
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // 図の大きさ(viewBox の座標)。狭い画面では viewBox を小さくして、文字が小さくなりすぎないようにする
  let W, Hh, m, pw, ph;
  const size = () => {
    const small = out('chart').clientWidth < 440;
    [W, Hh, m] = small ? [340, 300, { l: 44, r: 10, t: 12, b: 40 }] : [480, 400, { l: 52, r: 14, t: 14, b: 46 }];
    pw = W - m.l - m.r; ph = Hh - m.t - m.b;
    return small;
  };
  const view = () => (form.elements.view.value === 'steel' ? 2.2 : CM);
  const X = c => m.l + c / view() * pw, Y = t => m.t + (1600 - t) / 1200 * ph;
  const pts = list => list.map(([c, t]) => `${X(c).toFixed(1)},${Y(t).toFixed(1)}`).join(' ');
  // 曲線を温度方向に細かく区切った点の列に
  const temps = (lo, hi) => { const a = []; for (let k = 0; k <= 60; k++) a.push(lo + (hi - lo) * k / 60); return a; };
  const curve = (f, lo, hi) => temps(lo, hi).map(t => [f(t), t]);
  const seg = (c0, t0, c1, t1) => [[c0, t0], [c1, t1]];
  const lines = [
    curve(L.liqL, TP, TA), curve(L.solD, TP, TA), curve(L.dG, TN, TP), curve(L.gD, TN, TP), seg(H, TP, B, TP),
    curve(L.liqM, TE, TP), curve(L.solG, TE, TP), seg(E, TE, CM, TE), curve(L.a3, TS, TG), curve(L.gp, TS, TG),
    curve(L.acm, TS, TE), seg(P, TS, CM, TS), curve(L.pq, 400, TS), seg(CM, 400, CM, TD),
  ];
  const regionPoly = r => {
    const ts = [...new Set([...temps(r.lo, r.hi), TN, TG, TE, TP, TA, TD].filter(t => t >= r.lo && t <= r.hi))].sort((a, b) => a - b);
    return pts([...ts.map(t => [r.l(t), t]), ...ts.reverse().map(t => [r.r(t), t])]);
  };
  const LABEL = { L: 'L', Ld: 'L+δ', d: 'δ', dg: 'δ+γ', Lg: 'L+γ', g: 'γ', Lc: 'L+Fe₃C', gc: 'γ+Fe₃C', ag: 'α+γ', a: 'α', ac: 'α+Fe₃C' };
  // 拡大表示では、小さい領域にも名前を出す
  // 拡大表示では、小さい領域にも名前を出す(細い領域は引き出し線つき: [文字の c, t, 指す点の c, t])
  const steelAt = { L: [1.6, 1560], Ld: [0.85, 1548, 0.24, 1503], d: [0.35, 1568, 0.02, 1460], dg: [0.5, 1430, 0.06, 1440], Lg: [1.38, 1370], g: [1.0, 1100],
    gc: [1.8, 880], ag: [0.24, 780], a: [0.3, 640, 0.006, 640], ac: [1.2, 560] };
  const fullShow = ['L', 'Lg', 'g', 'Lc', 'gc', 'ac']; // α+γ は全体表示では狭いので、拡大表示でだけ名前を出す

  function draw(c, t, loc) {
    const steel = view() === 2.2;
    const small = W < 400;
    const xt = steel ? [0, 0.4, 0.8, 1.2, 1.6, 2.0] : small ? [0, 1, 2, 3, 4, 5] : [0, 1, 2, 3, 4, 5, 6];
    const yt = [400, 600, 800, 1000, 1200, 1400, 1600];
    const hl = loc?.key && regions[loc.key] ? `<polygon class="band" points="${regionPoly(regions[loc.key])}"/>` : '';
    const labels = (steel ? Object.keys(steelAt) : fullShow).map(k => {
      const [lc, lt, ac, at] = steel ? steelAt[k] : regions[k].at;
      const lead = ac == null ? '' : `<line class="thin" x1="${X(ac).toFixed(1)}" y1="${Y(at).toFixed(1)}" x2="${(X(lc) - 12).toFixed(1)}" y2="${(Y(lt) - 4).toFixed(1)}"/>`;
      return `${lead}<text class="sm" x="${X(lc).toFixed(1)}" y="${Y(lt).toFixed(1)}" text-anchor="middle">${LABEL[k]}</text>`;
    }).join('');
    // 主な点の印と名前(包晶は線の右端 B の右上に名前を置く)
    const keys = [[S, TS, T.pt_eutectoid, 6, 15], [C, TE, T.pt_eutectic, 6, 15], [J, TP, T.pt_peritectic, (B - J) / view() * pw + 6, -5]].filter(([kc], i) => kc <= view() && (i < 2 || (steel && !small)))
      .map(([kc, kt, name, dx, dy]) => `<circle class="ink" cx="${X(kc).toFixed(1)}" cy="${Y(kt).toFixed(1)}" r="3.5"/><text class="sm a" x="${(X(kc) + dx).toFixed(1)}" y="${(Y(kt) + dy).toFixed(1)}">${esc(name)}</text>`).join('');
    const temps0 = [[TG, '912'], [TE, '1147 ℃'], [TN, '1394'], [TA, '1538']].map(([tt, s]) => `<text class="sm m" x="${m.l + 4}" y="${(Y(tt) - 4).toFixed(1)}">${s}</text>`).join('');
    const tl = [[TS, '727']].map(([tt, s]) => `<text class="sm m" x="${W - m.r - 4}" y="${(Y(tt) - 4).toFixed(1)}" text-anchor="end">${s} ℃</text>`).join('');
    let mark = '';
    if (loc && c <= view()) {
      if (loc.phases?.length === 2) {
        const [ca, cb] = [loc.phases[0][1], loc.phases[1][1]];
        mark += `<line class="ac" x1="${X(ca).toFixed(1)}" y1="${Y(t).toFixed(1)}" x2="${X(Math.min(cb, view())).toFixed(1)}" y2="${Y(t).toFixed(1)}"/>`
          + [ca, cb].filter(x => x <= view()).map(x => `<circle class="hole" cx="${X(x).toFixed(1)}" cy="${Y(t).toFixed(1)}" r="4"/>`).join('');
      }
      mark += `<circle class="fa" cx="${X(c).toFixed(1)}" cy="${Y(t).toFixed(1)}" r="6"/>`;
    }
    const svg = `<svg viewBox="0 0 ${W} ${Hh}" data-plot="${m.l} ${m.t} ${pw} ${ph}" role="img" aria-labelledby="fec-title" style="touch-action: manipulation; cursor: crosshair">
  <title id="fec-title">${esc(T.chart_title)}</title>
  <defs><clipPath id="fec-clip"><rect x="${m.l}" y="${m.t}" width="${pw}" height="${ph}"/></clipPath></defs>
  <rect class="ok" x="${m.l}" y="${m.t}" width="${pw}" height="${ph}"/>
  <g clip-path="url(#fec-clip)">${hl}
    ${yt.slice(1, -1).map(y => `<line class="thin" stroke-dasharray="2 4" x1="${m.l}" x2="${m.l + pw}" y1="${Y(y)}" y2="${Y(y)}"/>`).join('')}
    ${lines.map(l => `<polyline class="ln" points="${pts(l)}"/>`).join('')}
    <polyline class="dash" points="${pts(curve(L.liqR, TE, TD))}"/>
    ${labels}${keys}${temps0}${tl}${mark}
  </g>
  ${xt.map(x => `<text class="sm m" x="${X(x).toFixed(1)}" y="${Hh - m.b + 16}" text-anchor="middle">${x}</text>`).join('')}
  ${steel ? '' : `<text class="sm a" x="${X(CM).toFixed(1)}" y="${Hh - m.b + 16}" text-anchor="end">Fe₃C</text>`}
  ${yt.map(y => `<text class="sm m" x="${m.l - 4}" y="${Y(y) + 4}" text-anchor="end">${y}</text>`).join('')}
  <text class="sm" x="${m.l + pw / 2}" y="${Hh - 8}" text-anchor="middle">${esc(T.axis_c)}</text>
  <text class="sm" transform="translate(${small ? 10 : 14} ${m.t + ph / 2}) rotate(-90)" text-anchor="middle">${esc(T.axis_t)}</text>
</svg>`;
    const cap = !loc ? T.out_range : c > view() ? T.hidden : T.tap;
    out('chart').innerHTML = `<div class="fig">${svg}</div><p class="muted">${esc(cap)}</p>`;
    out('chart').querySelector('svg').addEventListener('click', pick);
  }

  // 図をクリック・タップした点を入力欄へ
  function pick(e) {
    const svg = e.currentTarget, p = svg.createSVGPoint();
    p.x = e.clientX; p.y = e.clientY;
    const q = p.matrixTransform(svg.getScreenCTM().inverse());
    if (q.x < m.l || q.x > m.l + pw || q.y < m.t || q.y > m.t + ph) return;
    const c = Math.min(CM, Math.max(0, (q.x - m.l) / pw * view())), t = 1600 - (q.y - m.t) / ph * 1200;
    form.elements.c.value = String(Math.round(c * 100) / 100);
    form.elements.t.value = String(Math.round(t));
    form.dispatchEvent(new Event('input', { bubbles: true }));
  }

  const table = (head, rows, id) => `<div class="table-wrap"><table class="dy-table">
<thead><tr>${head.map(x => `<th scope="col" style="white-space: normal; overflow-wrap: normal">${esc(x)}</th>`).join('')}</tr></thead>
<tbody>${rows.map((r, i) => `<tr><th scope="row" style="white-space: normal; overflow-wrap: normal">${esc(r[0])}</th>${r.slice(1).map((x, j) => `<td data-out="${id}-${i}-${j}">${esc(x)}</td>`).join('')}</tr>`).join('')}</tbody>
</table></div>`;

  // 入力欄からフォーカスが外れたときの change でも呼ばれる。値が同じなら描き直さない
  // (図をクリックした瞬間に図を作り直すと、そのクリックが失われるため)
  let last = '';
  function update() {
    const c = val('c'), t = val('t');
    const key = `${c} ${t} ${form.elements.view.value} ${size()}`;
    if (key === last) return;
    last = key;
    const loc = locate(c, t), mc = micro(c);
    draw(c, t, loc);
    if (!loc) {
      out('phase').textContent = '–';
      out('kind').textContent = mc ? T[`kind_${mc.kind}`] : '–';
      out('tie').innerHTML = `<p>${esc(T.out_range)}</p>`;
    } else if (loc.inv) {
      out('phase').textContent = loc.inv.phases.map(p => SYM[p[0]]).join(' + ');
      out('tie').innerHTML = `<p>${esc(T[`inv_${loc.inv.key}`])}</p>`
        + table([T.col_phase, T.col_comp, T.col_frac], loc.inv.phases.map(([ph, x]) => [T[`ph_${ph}`], wt(x), '–']), 'tie');
    } else {
      out('phase').textContent = loc.phases.map(p => SYM[p[0]]).join(' + ');
      const rows = loc.phases.map(([ph, x, w]) => [T[`ph_${ph}`], wt(x), pct(w)]);
      let note = T.single;
      if (loc.phases.length === 2) {
        const [[pa, ca], [pb, cb]] = loc.phases, f = x => num(x, x < 0.1 ? 2 : 3);
        note = `${T.two} W(${SYM[pa]}) = (C${SYM[pb]} − C₀)/(C${SYM[pb]} − C${SYM[pa]}) = (${f(cb)} − ${f(c)})/(${f(cb)} − ${f(ca)}) = ${num(loc.phases[0][2], 3)}`;
      }
      out('tie').innerHTML = `<p>${esc(note)}</p>${table([T.col_phase, T.col_comp, T.col_frac], rows, 'tie')}`;
    }
    if (mc) {
      out('kind').textContent = T[`kind_${mc.kind}`];
      const rows = mc.parts.map(([k, w]) => [T[`m_${k}`], pct(w)]);
      rows.push([T.m_total_a, pct(mc.total[0])], [T.m_total_c, pct(mc.total[1])]);
      out('micro').innerHTML = table([T.col_micro, T.col_frac], rows, 'micro')
        + `<p class="muted">${esc(T[`mnote_${mc.kind}`] ?? '')} ${esc(T.mnote)}</p>`;
    } else {
      out('kind').textContent = '–';
      out('micro').innerHTML = `<p>${esc(T.out_range)}</p>`;
    }
  }
  form.addEventListener('input', update);
  form.addEventListener('change', update);
  form.addEventListener('submit', e => e.preventDefault());
  // 画面の幅が変わって図の大きさの段階が変わったら描き直す
  if (window.ResizeObserver) new ResizeObserver(() => update()).observe(out('chart'));
  update();
}
