// 異種金属接触腐食チェッカー。2つの金属(合金)を選ぶと、流れる海水中の腐食電位の範囲(電位列)から、
// どちらが溶けやすい側(アノード)か、電位差の範囲(最小〜最大)を出し、面積比・環境・対策を目安として示す。
// 電位は範囲のまま扱い、1つの数に丸めない。範囲が重なるときは、どちらがアノードとも決めない。
// 値と出典は review の check/data.md(値ごとの出典と、確かめられなかった値)。文言は data/tools/galvanic.json の text.{言語}.js
// 判定の関数(judge・areaFactor・SERIES)は DOM なしで import できる(検算: review の check/check_galvanic.py と check/judge.mjs)。

// =====================================================================
// 電位列: 流れる海水中の腐食電位(V、飽和カロメル電極 SCE 基準)。lo が卑な側(より負)、hi が貴な側。
// src: aca = Australasian Corrosion Association「Seawater Corrosion」の表 "Corrosion potentials in flowing seawater (V vs SCE)"
//      dex = S. C. Dexter, "Galvanic Corrosion", MAS Note, University of Delaware Sea Grant (2003), Table 1
// 両方にある金属は aca の値を使い、dex の値は check/data.md で比べる(差が 0.05 V 以上のものは注記)。
// g: 選択欄のまとまり。pass: 不動態と活性の両方を持つ合金の組(不動態側→活性側)。crev: すきま・よどんだ水で活性側になりうる
// =====================================================================
export const SERIES = [
  { id: 'mg', lo: -1.63, hi: -1.60, src: 'aca', g: 'light' },
  { id: 'zn', lo: -1.03, hi: -0.98, src: 'aca', g: 'light' },
  { id: 'al', lo: -1.00, hi: -0.76, src: 'aca', g: 'light' },
  { id: 'cd', lo: -0.74, hi: -0.70, src: 'aca', g: 'other' },
  { id: 'steel', lo: -0.72, hi: -0.60, src: 'aca', g: 'iron' },
  { id: 'las', lo: -0.63, hi: -0.57, src: 'aca', g: 'iron' },
  { id: 'nicast', lo: -0.54, hi: -0.43, src: 'aca', g: 'iron' },
  { id: 'ss410a', lo: -0.57, hi: -0.45, src: 'aca', g: 'ss', act: true },
  { id: 'ss304a', lo: -0.58, hi: -0.44, src: 'aca', g: 'ss', act: true },
  { id: 'ss316a', lo: -0.46, hi: -0.33, src: 'aca', g: 'ss', act: true },
  { id: 'in600a', lo: -0.46, hi: -0.34, src: 'aca', g: 'ni', act: true },
  { id: 'albz', lo: -0.40, hi: -0.31, src: 'aca', g: 'cu' },
  { id: 'brass', lo: -0.40, hi: -0.31, src: 'aca', g: 'cu' },
  { id: 'cu', lo: -0.37, hi: -0.30, src: 'aca', g: 'cu' },
  { id: 'sn', lo: -0.33, hi: -0.30, src: 'aca', g: 'other' },
  { id: 'solder', lo: -0.36, hi: -0.27, src: 'aca', g: 'other' },
  { id: 'adm', lo: -0.36, hi: -0.26, src: 'aca', g: 'cu' },
  { id: 'bronze', lo: -0.32, hi: -0.24, src: 'aca', g: 'cu' },
  { id: 'sibz', lo: -0.29, hi: -0.25, src: 'aca', g: 'cu' },
  { id: 'ss410p', lo: -0.35, hi: -0.23, src: 'aca', g: 'ss', crev: 'ss410a' },
  { id: 'ss430p', lo: -0.28, hi: -0.20, src: 'aca', g: 'ss', crev: 'ss410a' },
  { id: 'cuni9010', lo: -0.28, hi: -0.22, src: 'aca', g: 'cu' },
  { id: 'pb', lo: -0.25, hi: -0.19, src: 'aca', g: 'other' },
  { id: 'cuni7030', lo: -0.24, hi: -0.17, src: 'aca', g: 'cu' },
  { id: 'ni', lo: -0.20, hi: -0.10, src: 'aca', g: 'ni' },
  { id: 'in600p', lo: -0.18, hi: -0.13, src: 'aca', g: 'ni', crev: 'in600a' },
  { id: 'ag', lo: -0.15, hi: -0.10, src: 'aca', g: 'noble' },
  { id: 'monel', lo: -0.14, hi: -0.03, src: 'aca', g: 'ni' },
  { id: 'ss304p', lo: -0.10, hi: -0.04, src: 'aca', g: 'ss', crev: 'ss304a' },
  { id: 'ss316p', lo: -0.10, hi: 0.00, src: 'aca', g: 'ss', crev: 'ss316a' },
  { id: 'in625', lo: -0.04, hi: 0.10, src: 'dex', g: 'ni' },
  { id: 'ti', lo: -0.05, hi: 0.06, src: 'dex', g: 'noble' },
  { id: 'pt', lo: 0.18, hi: 0.26, src: 'aca', g: 'noble' },
  { id: 'gr', lo: 0.20, hi: 0.30, src: 'aca', g: 'noble' },
];
export const GROUPS = ['light', 'iron', 'ss', 'cu', 'ni', 'other', 'noble'];
export const byId = Object.fromEntries(SERIES.map(m => [m.id, m]));
export const SOURCES = {
  aca: 'https://www.corrosion.com.au/foundation/resources/student-teacher-resources/seawater-corrosion/',
  dex: 'https://udspace.udel.edu/bitstream/handle/19716/186/corrosion.pdf?sequence=1&isAllowed=y',
};

// 電位は mV の整数で計算する(小数の誤差で 0.66 が 0.6599… にならないように)
const mv = v => Math.round(v * 1000);

// 2つの金属の判定。範囲が重ならなければ、上限(hi)が低い方がアノード。
// 電位差の最小 = カソードの下限 − アノードの上限、最大 = カソードの上限 − アノードの下限。
// 範囲が重なるときは anode = null、最小 0、最大 = 2つの範囲の端どうしの差の大きい方。同じ金属は 0(same: true)
export function judge(aId, bId) {
  const a = byId[aId], b = byId[bId];
  if (!a || !b) return null;
  // 同じ金属どうしは電位差なし(範囲の幅は、同じ金属の2か所の電位の差ではないので、差として出さない)
  if (aId === bId) return { same: true, overlap: true, anode: null, cathode: null, dmin: 0, dmax: 0 };
  const overlap = mv(a.lo) <= mv(b.hi) && mv(b.lo) <= mv(a.hi);
  if (overlap) {
    return { same: false, overlap: true, anode: null, cathode: null, dmin: 0,
      dmax: Math.max(mv(a.hi) - mv(b.lo), mv(b.hi) - mv(a.lo)) / 1000 };
  }
  const [an, ca] = mv(a.hi) < mv(b.lo) ? [a, b] : [b, a];
  return { same: false, overlap: false, anode: an.id, cathode: ca.id,
    dmin: (mv(ca.lo) - mv(an.hi)) / 1000, dmax: (mv(ca.hi) - mv(an.lo)) / 1000 };
}

// 面積比。ratio は「A の濡れる面積 ÷ B の濡れる面積」。アノードが決まるときだけ、カソード面積 ÷ アノード面積 を返す。
// 目安の考え方(単純化): 電流がカソードの反応(酸素の還元など)で決まるとき、ガルバニック電流はおおよそカソードの面積に比例し、
// アノードの電流密度は「カソード面積 ÷ アノード面積」におおよそ比例して増える。数値の腐食速度は出さない
export function areaFactor(r, aId, ratio) {
  if (!r || !r.anode || !(ratio > 0) || !Number.isFinite(ratio)) return null;
  return r.anode === aId ? 1 / ratio : ratio;
}

// 例の組み合わせ: [A, B, 環境, A/B の面積比]
export const EXAMPLES = [
  ['ss304p', 'al', 'marine', 0.05],
  ['cu', 'steel', 'fresh', 1],
  ['zn', 'cu', 'outdoor', 1],
  ['gr', 'al', 'marine', 1],
  ['ti', 'ss316p', 'sea', 1],
];
export const ENVS = ['sea', 'marine', 'outdoor', 'indoor_wet', 'indoor_dry', 'fresh', 'hot', 'soil'];

// =====================================================================
// 画面(ブラウザのときだけ)
// =====================================================================
const form = typeof document !== 'undefined' ? document.getElementById('galvanic-form') : null;
if (form) setup();

function setup() {
  const T = JSON.parse(form.dataset.text);
  const U = T.ui;
  const home = document.documentElement.dataset.home ?? '/';
  const decimalComma = /^(de|nl|fr|es|pt)/.test(document.documentElement.lang);
  const out = k => document.querySelector(`[data-out="${k}"]`);
  const fill = (s, v = {}) => String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m));
  const num = (v, d = 2) => { const s = (Math.abs(v) < 0.005 ? 0 : v).toFixed(d); return decimalComma ? s.replace('.', ',') : s; };
  const sgn = v => (v > 0.0049 ? `+${num(v)}` : v < -0.0049 ? `−${num(-v)}` : num(0));
  const range = m => fill(U.range_v, { lo: sgn(m.lo), hi: sgn(m.hi) });
  const el = (tag, attrs = {}, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    e.append(...kids.flat().filter(k => k != null && k !== false));
    return e;
  };
  const E = form.elements;
  const name = id => T.m[id] ?? id;

  // ---- 見た目(このツールだけ) ----
  const css = document.createElement('style');
  css.textContent = `
#galvanic-form .gv-wide { grid-column: 1 / -1; margin: 0; }
#galvanic-form .dy-field:has(select[name=a]), #galvanic-form .dy-field:has(select[name=b]) { grid-column: span 2; }
@media (max-width: 480px) { #galvanic-form .dy-field { grid-column: 1 / -1; } }
.gv-ex { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.gv-ex .btn { min-height: 36px; padding: 0 12px; font-size: .85rem; }
.gv-verdict { font-size: 1.02rem; line-height: 1.7; margin: 0 0 10px; padding: 10px 12px; border-radius: 8px; background: var(--accent-soft); }
.gv-box { margin: 12px 0; padding: 10px 12px; border-radius: 8px; background: var(--bg); }
.gv-box h3 { margin: 0 0 6px; font-size: 1rem; }
.gv-box ul, .gv-box ol { margin: 4px 0; padding-left: 1.3em; line-height: 1.7; }
.gv-box p { margin: 4px 0; line-height: 1.7; }
.gv-tbl { width: 100%; border-collapse: collapse; font-size: .9rem; }
.gv-tbl th, .gv-tbl td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--border); vertical-align: top; overflow-wrap: anywhere; }
.gv-tbl td.gv-num { white-space: nowrap; font-variant-numeric: tabular-nums; }
.gv-tbl thead th { font-size: .8rem; color: var(--muted); font-weight: 600; }
@media (max-width: 480px) { .gv-tbl th, .gv-tbl td { padding: 5px 4px; font-size: .82rem; } }
.gv-chart { margin: 8px 0 4px; font-size: .78rem; }
.gv-row { display: grid; grid-template-columns: minmax(0, 42%) minmax(0, 1fr); gap: 6px; align-items: center; min-height: 20px; }
.gv-row + .gv-row { margin-top: 2px; }
.gv-name { color: var(--muted); line-height: 1.25; overflow-wrap: anywhere; text-align: right; }
.gv-track { position: relative; height: 14px; background-image: var(--gv-grid); border-radius: 3px; }
@media (max-width: 560px) {
  .gv-row { grid-template-columns: minmax(0, 1fr); gap: 0; padding: 1px 2px; }
  .gv-row + .gv-row { margin-top: 3px; }
  .gv-name { text-align: left; }
  .gv-axis .gv-name { display: none; }
}
.gv-bar { position: absolute; top: 2px; bottom: 2px; min-width: 3px; border-radius: 3px; background: var(--fig-metal); }
.gv-row.gv-act .gv-bar { background: repeating-linear-gradient(135deg, var(--fig-metal) 0 3px, transparent 3px 6px); outline: 1px solid var(--fig-metal); }
.gv-row.gv-a .gv-name, .gv-row.gv-b .gv-name { color: var(--text); font-weight: 700; }
.gv-row.gv-a .gv-bar { background: var(--accent); outline: none; }
.gv-row.gv-b .gv-bar { background: var(--accent-2); outline: none; }
.gv-row.gv-a, .gv-row.gv-b { background: var(--accent-soft); border-radius: 4px; }
.gv-axis .gv-track { background: none; height: 16px; }
.gv-tick { position: absolute; top: 0; transform: translateX(-50%); font-variant-numeric: tabular-nums; color: var(--muted); white-space: nowrap; }
.gv-tick:last-child { transform: translateX(-100%); }
.gv-legend { display: flex; flex-wrap: wrap; gap: 4px 14px; margin: 6px 0 0; padding: 0; list-style: none; font-size: .8rem; color: var(--muted); }
.gv-legend i { display: inline-block; width: 18px; height: 10px; border-radius: 2px; vertical-align: middle; margin-right: 4px; background: var(--fig-metal); }
.gv-legend .gv-la { background: var(--accent); }
.gv-legend .gv-lb { background: var(--accent-2); }
.gv-legend .gv-lact { background: repeating-linear-gradient(135deg, var(--fig-metal) 0 3px, transparent 3px 6px); outline: 1px solid var(--fig-metal); }
.gv-links { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0 0; }
`;
  document.head.append(css);

  // ---- 選択欄を、金属のまとまりごとに分ける(選んでいる値はそのまま) ----
  for (const sel of [E.a, E.b]) {
    const v = sel.value;
    const opts = Object.fromEntries([...sel.options].map(o => [o.value, o]));
    sel.replaceChildren(...GROUPS.map(g => el('optgroup', { label: T.grp[g] },
      ...SERIES.filter(m => m.g === g && opts[m.id]).map(m => opts[m.id]))));
    sel.value = v;
  }

  // ---- 例の組み合わせのボタン ----
  const ex = el('div', { class: 'gv-ex gv-wide' }, el('span', { class: 'muted' }, U.examples),
    ...EXAMPLES.map((x, i) => el('button', { type: 'button', class: 'btn btn-ghost', 'data-ex': String(i) }, U.ex[i])));
  form.querySelector('h2').after(ex);
  ex.addEventListener('click', e => {
    const btn = e.target.closest('[data-ex]');
    if (!btn) return;
    const [a, b, env, area] = EXAMPLES[Number(btn.dataset.ex)];
    E.a.value = a; E.b.value = b; E.env.value = env; E.area.value = String(area);
    form.dispatchEvent(new Event('change', { bubbles: true }));
    render();
  });
  form.addEventListener('submit', e => e.preventDefault());
  form.addEventListener('input', render);
  form.addEventListener('change', render);

  // ---- 電位列の図(横棒で範囲。HTML の行なので、スマートフォンでも名前が読める) ----
  const X0 = -1.7, X1 = 0.4;
  const pct = v => `${(((v - X0) / (X1 - X0)) * 100).toFixed(2)}%`;
  const ticks = [-1.6, -1.2, -0.8, -0.4, 0, 0.4];
  // 目盛りの縦線(各行の背景に、0.2 V ごと)
  const grid = [-1.6, -1.4, -1.2, -1.0, -0.8, -0.6, -0.4, -0.2, 0, 0.2, 0.4]
    .map(t => `transparent ${pct(t)}, var(--border) ${pct(t)}, var(--border) calc(${pct(t)} + 1px), transparent calc(${pct(t)} + 1px)`).join(', ');
  function chart(aId, bId) {
    const axis = el('div', { class: 'gv-row gv-axis', 'aria-hidden': 'true' }, el('span', { class: 'gv-name' }, U.axis),
      el('div', { class: 'gv-track' }, ...ticks.map(t => el('span', { class: 'gv-tick', style: `left:${pct(t)}` }, t === 0 ? '0' : t > 0 ? `+${num(t, 1)}` : `−${num(-t, 1)}`))));
    const rows = [...SERIES].sort((p, q) => (q.lo + q.hi) - (p.lo + p.hi)).map(m => {
      const cls = ['gv-row', m.act ? 'gv-act' : '', m.id === aId ? 'gv-a' : m.id === bId ? 'gv-b' : ''].filter(Boolean).join(' ');
      return el('div', { class: cls },
        el('span', { class: 'gv-name' }, name(m.id)),
        el('div', { class: 'gv-track', title: `${name(m.id)}: ${range(m)}` },
          el('span', { class: 'gv-bar', style: `left:${pct(m.lo)};width:${(((m.hi - m.lo) / (X1 - X0)) * 100).toFixed(2)}%` })));
    });
    return el('div', {},
      el('p', { class: 'muted' }, U.chart_lead),
      el('div', { class: 'gv-chart', role: 'img', 'aria-label': U.chart_label, style: `--gv-grid: linear-gradient(90deg, ${grid})` }, axis, ...rows, axis.cloneNode(true)),
      el('ul', { class: 'gv-legend' },
        el('li', {}, el('i', { class: 'gv-la' }), 'A'), el('li', {}, el('i', { class: 'gv-lb' }), 'B'),
        el('li', {}, el('i', { class: 'gv-lact' }), U.leg_act)));
  }

  function srcCell(m) {
    return el('a', { href: SOURCES[m.src], target: '_blank', rel: 'noopener' }, T.src[m.src]);
  }

  function render() {
    const aId = E.a.value, bId = E.b.value, env = E.env.value;
    const ratio = Number(String(E.area.value).replace(',', '.'));
    const a = byId[aId], b = byId[bId];
    const r = judge(aId, bId);
    const box = out('result');
    box.replaceChildren();
    out('chart').replaceChildren(chart(aId, bId));
    if (!r) { out('anode').textContent = '–'; out('de').textContent = '–'; out('ac').textContent = '–'; return; }

    // 結論(上の数字の欄)
    out('anode').textContent = r.same ? U.same_short : r.overlap ? U.overlap_short : name(r.anode);
    out('de').textContent = r.same ? U.de_same : fill(U.de_v, { lo: num(r.dmin), hi: num(r.dmax) });
    const af = areaFactor(r, aId, ratio);
    out('ac').textContent = af == null ? '–' : num(af, af < 0.1 ? 3 : af < 10 ? 2 : 1);

    // 判定の文
    const verdict = r.same ? U.v_same
      : r.overlap ? fill(U.v_overlap, { a: name(aId), b: name(bId), hi: num(r.dmax) })
        : fill(U.v_anode, { an: name(r.anode), ca: name(r.cathode), lo: num(r.dmin), hi: num(r.dmax) });
    box.append(el('p', { class: 'gv-verdict' }, verdict));

    // 2つの金属の値と出典
    box.append(el('table', { class: 'gv-tbl' },
      el('thead', {}, el('tr', {}, el('th', { scope: 'col' }, ''), el('th', { scope: 'col' }, U.col_metal), el('th', { scope: 'col' }, U.col_range), el('th', { scope: 'col' }, U.col_src))),
      el('tbody', {}, ...[['A', a], ['B', b]].map(([k, m]) => el('tr', {},
        el('th', { scope: 'row' }, k), el('td', {}, name(m.id)), el('td', { class: 'gv-num' }, range(m)), el('td', {}, srcCell(m)))))));
    box.append(el('p', { class: 'muted' }, U.cond));

    // この組み合わせに特有の注意
    const notes = [];
    for (const m of [a, b]) {
      if (m.crev) notes.push(fill(U.n_crev, { m: name(m.id), act: name(m.crev), r: range(byId[m.crev]) }));
      if (m.act) notes.push(fill(U.n_act, { m: name(m.id) }));
    }
    if (r.overlap && !r.same) notes.push(U.n_overlap);
    if (!r.overlap && r.dmin < 0.05) notes.push(U.n_near);
    if ([aId, bId].includes('zn')) notes.push(U.n_zn);
    if ([aId, bId].includes('al') && [aId, bId].includes('gr')) notes.push(U.n_cfrp);
    else if ([aId, bId].includes('gr')) notes.push(U.n_gr);
    if ([aId, bId].includes('al')) notes.push(U.n_al);
    if ([aId, bId].some(id => ['brass', 'adm'].includes(id))) notes.push(U.n_dezinc);
    if (env === 'hot' && [aId, bId].includes('zn') && [aId, bId].some(id => ['steel', 'las'].includes(id))) notes.push(U.n_hot_zn);
    if (notes.length) box.append(el('div', { class: 'gv-box' }, el('h3', {}, U.h_notes), el('ul', {}, ...notes.map(n => el('li', {}, n)))));

    // 面積比
    const areaP = [];
    if (!r.anode) areaP.push(U.a_none);
    else if (af == null) areaP.push(U.a_bad);
    else {
      areaP.push(fill(U.a_val, { an: name(r.anode), ca: name(r.cathode), f: num(af, af < 0.1 ? 3 : af < 10 ? 2 : 1) }));
      areaP.push(af > 1.0001 ? fill(U.a_big, { f: num(af, af < 10 ? 2 : 1) }) : af < 0.9999 ? U.a_small : U.a_equal);
    }
    areaP.push(U.a_rule);
    box.append(el('div', { class: 'gv-box' }, el('h3', {}, U.h_area), ...areaP.map(p => el('p', {}, p))));

    // 環境(水の有無・塩分・温度)
    box.append(el('div', { class: 'gv-box' }, el('h3', {}, U.h_env),
      el('p', {}, el('strong', {}, T.envs[env]?.lv ?? ''), ' ', T.envs[env]?.t ?? ''),
      ...(env !== 'sea' ? [el('p', { class: 'muted' }, U.e_order)] : [])));

    // 対策
    box.append(el('div', { class: 'gv-box' }, el('h3', {}, U.h_meas), el('ol', {}, ...U.meas.map(m => el('li', {}, m)))));

    // つながるページ
    box.append(el('div', { class: 'gv-links' },
      el('a', { class: 'btn btn-ghost', href: `${home}failure/` }, U.l_failure),
      el('a', { class: 'btn btn-ghost', href: `${home}materials/` }, U.l_materials)));
    box.append(el('p', { class: 'muted' }, U.disclaimer));
  }
  render();
}
