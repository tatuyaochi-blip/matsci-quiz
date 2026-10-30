// 分析・評価手法ナビ(/methods/)。手法の説明(カード)と一覧表は build.js が data/methods.json から作ってページに書く(JavaScript がなくても全部読める)。
// このファイルは、知りたいことと試料の条件での絞り込み(合う手法を順に並べ、合わない手法は理由を付けて分ける)、2〜4 個の手法を並べて比べる表、
// 条件の URL(?n=目的&d=&s=&m=&v=1&e=h,li,cno,trace&r=&z=&c=id,id)の読み書きとコピー。
// 判定は judge()(build の検査と場面の確かめでも使うので、DOM に触れない)。手法の数値の段階は data/methods.json の x
const app = typeof document !== 'undefined' ? document.getElementById('mt-app') : null;

// 横の分解能の条件(m)。「原子の大きさ」は 0.5 nm 以下
export const RES = { '10u': 1e-5, '1u': 1e-6, '10n': 1e-8, atom: 5e-10 };
const SIZE = { p: 0, s: 1, l: 2 };
const EL = { h: 'H', li: 'Li', cno: 'cno' };

// 1 つの手法が条件に合うかを決める。
// st: { n: 目的, d: ''|cut|none, s: ''|p|s|l, m: ''|fe|metal|ins, v: 真空不可, e: [h, li, cno, trace], r: ''|10u|1u|10n|atom, z: ''|s|n|m|b }
// 返す値: { k: 目的への強さ(2 主に使う / 1 補助 / 0 使わない), why: 合わない理由, nb: 注意, score: 並べる順の点 }
export function judge(m, st) {
  const x = m.x;
  let k = st.n ? (m.need[st.n] ?? 0) : 0;
  const why = [], nb = [];
  // 壊すか: 目的(x.dsBy。x.dsByNotS なら最表面だけを見るときは除く)と深さ(x.dsZ)で上がることがある
  let ds = x.ds, by = false;
  const up = v => { if (v != null && v > ds) { ds = v; by = true; } };
  if (st.n && !(x.dsByNotS && st.z === 's')) up(x.dsBy?.[st.n]);
  if (st.z) up(x.dsZ?.[st.z]);
  if (st.d === 'none' && ds >= 1) why.push(ds === 2 ? 'ds2' : by ? 'ds1by' : 'ds1');
  if (st.d === 'cut' && ds === 2) why.push('ds2');
  if (st.d === 'none' && ds === 0 && x.mark) nb.push('mark');
  if (st.s) {
    const i = SIZE[st.s];
    if (i < x.sz[0]) why.push('small');
    else if (i > x.sz[1]) (st.d === 'none' ? why : nb).push(st.d === 'none' ? 'big' : 'cutout');
  }
  if (st.m === 'ins' && x.cd === 2) why.push('cond');
  else if (st.m === 'ins' && x.cd === 1) nb.push('coat');
  if (x.cd === 3 && (st.m === 'ins' || st.m === 'metal')) why.push('ferro');
  // 金属そのものに使えない手法(x.mo 2 使えない・1 注意。目的ごとの上書きは x.moBy、最表面を見るときの上書きは x.moS)
  const mo = (st.n && st.z === 's' && x.moS?.[st.n] != null) ? x.moS[st.n] : (st.n && x.moBy?.[st.n] != null) ? x.moBy[st.n] : (x.mo ?? 0);
  if (st.m === 'fe' || st.m === 'metal') { if (mo === 2) why.push('nometal'); else if (mo === 1) nb.push('nometal1'); }
  if (st.v && x.vac === 2) why.push('vac');
  else if (st.v && x.vac === 1) nb.push('lowvac');
  const e = st.e ?? [];
  let plus = 0;
  for (const y of e) {
    if (y === 'trace') {
      if (x.dlx == null) why.push('noel');
      else if (x.dlx > -4) why.push('dl');
      else if (x.dlx === -4) nb.push('dl4');
      // 微量を選んだときは、検出限界の低い手法ほど上に(100 ppm を 0 として 1 桁ごとに 1 点)
      if (x.dlx != null && x.dlx <= -4) plus += -4 - x.dlx;
      continue;
    }
    const v = x[y];
    if (v == null) why.push('noel');
    else if (v === 0) why.push(`no${EL[y]}`);
    else if (v === 1) nb.push(`${EL[y]}1`);
    else plus += 2;
  }
  // 測れる元素が決まっている手法(x.only): ほかの元素だけを選んだら外す。元素を選ばないときは「補助」に下げて注意
  if (x.only) {
    const els = e.filter(y => y !== 'trace');
    if (!els.some(y => x.only.includes(y))) {
      if (els.length) why.push('only');
      else { nb.push('only'); k = Math.min(k, 1); }
    }
  }
  // 組成の分布を見るときは、検出限界の低い手法を少し上に(0.1 % を 0 として 1 桁ごとに 0.3 点。粒界偏析のような少ない元素の分布)
  if (st.n === 'map' && x.dlx != null && x.dlx < -3) plus += 0.3 * (-3 - x.dlx);
  if (st.r) {
    if (x.rl == null) why.push(x.avg ? 'avg' : 'resna');
    else if (x.rl > RES[st.r]) why.push('res');
  }
  if (st.z && !x.dp.includes(st.z)) why.push('depth');
  else if (st.z && x.dpNb?.[st.z]) nb.push(x.dpNb[st.z]);
  const uniq = a => [...new Set(a)];
  const w = uniq(why), n = uniq(nb);
  return { k, why: w, nb: n, score: 10 * k + plus - 3 * n.length - 0.3 * (x.t + x.c) };
}

// すべての手法を判定して、合う手法(点の高い順。同じ点はデータの順)と合わない手法に分ける。目的を選んだときは、その目的に使わない手法は数えない
export function rank(methods, st) {
  const all = methods.map((m, i) => ({ m, i, ...judge(m, st) })).filter(r => !st.n || r.k > 0);
  const fit = all.filter(r => !r.why.length).sort((a, b) => b.score - a.score || a.i - b.i);
  const out = all.filter(r => r.why.length);
  return { fit, out, total: all.length };
}

// URL の値を条件にする(知らない値は捨てる)
export function readState(params, needIds, methodIds) {
  const one = (k, ok) => (ok.includes(params.get(k) ?? '') ? params.get(k) ?? '' : '');
  return {
    n: needIds.includes(params.get('n')) ? params.get('n') : '',
    d: one('d', ['cut', 'none']),
    s: one('s', ['p', 's', 'l']),
    m: one('m', ['fe', 'metal', 'ins']),
    v: params.get('v') === '1',
    e: (params.get('e') || '').split(',').filter((y, i, a) => ['h', 'li', 'cno', 'trace'].includes(y) && a.indexOf(y) === i),
    r: one('r', Object.keys(RES)),
    z: one('z', ['s', 'n', 'm', 'b']),
    c: (params.get('c') || '').split(',').filter((y, i, a) => methodIds.includes(y) && a.indexOf(y) === i).slice(0, 4),
  };
}

export function writeState(st) {
  const p = new URLSearchParams();
  for (const k of ['n', 'd', 's', 'm', 'r', 'z']) if (st[k]) p.set(k, st[k]);
  if (st.v) p.set('v', '1');
  if (st.e.length) p.set('e', st.e.join(','));
  if (st.c.length) p.set('c', st.c.join(','));
  return p.toString().replace(/%2C/gi, ',');
}

// 理由・注意ごとに、カードのどの欄の文を添えるか
const FIELD = { ds1: 'ds', ds2: 'ds', ds1by: 'ds', mark: 'ds', layer: 'ds', nometal: 'el', nometal1: 'el', only: 'el', dpS: 'rd', dpM: 'vol', coarse: 'rl', small: 'size', big: 'size', cutout: 'size', cond: 'cond', ferro: 'cond', coat: 'cond', vac: 'vac', lowvac: 'vac',
  noel: 'el', noH: 'el', noLi: 'el', nocno: 'el', H1: 'el', Li1: 'el', cno1: 'el', dl: 'dl', dl4: 'dl', avg: 'rl', resna: 'rl', res: 'rl', depth: 'rd' };
// 比べる表の行(カードの欄の data-f)
const ROWS = ['what', 'rl', 'rd', 'dl', 'vol', 'el', 'q', 'size', 'cond', 'vac', 'ds', 'prep', 'time', 'cost', 'miss', 'pair'];

function init() {
  const T = JSON.parse(app.dataset.t || '{}');
  const t = (k, v = {}) => (T[k] ?? k).replace(/\{(\w+)\}/g, (m, x) => (x in v ? v[x] : m));
  const M = JSON.parse(app.dataset.m || '[]');
  const needIds = JSON.parse(app.dataset.n || '[]');
  const ids = M.map(m => m.id);
  const card = id => document.getElementById(`m-${id}`);
  const field = (id, f) => card(id)?.querySelector(`[data-f="${f}"]`);
  const form = app.querySelector('.mt-form');
  const res = app.querySelector('.mt-res');
  const outBox = app.querySelector('.mt-out');
  const count = app.querySelector('.mt-count');
  const none = app.querySelector('.mt-none');
  const cmp = document.getElementById('compare');
  const msg = app.querySelector('.mt-msg');
  let st = readState(new URLSearchParams(location.search), needIds, ids);

  const setForm = () => {
    for (const el of form.elements) {
      if (!el.name) continue;
      if (el.name === 'n') el.checked = el.value === st.n;
      else if (el.name === 'v') el.checked = st.v;
      else if (el.name === 'e') el.checked = st.e.includes(el.value);
      else if (el.tagName === 'SELECT') el.value = st[el.name];
    }
  };
  const getForm = () => {
    const f = new FormData(form);
    st = { ...st, n: f.get('n') || '', d: f.get('d') || '', s: f.get('s') || '', m: f.get('m') || '', v: f.get('v') === '1', e: f.getAll('e'), r: f.get('r') || '', z: f.get('z') || '' };
  };
  const syncUrl = () => {
    const q = writeState(st);
    try { history.replaceState(history.state, '', location.pathname + (q ? `?${q}` : '') + location.hash); } catch {}
  };

  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const nameLink = m => { const a = el('a', 'mt-name', m.name); a.href = `#m-${m.id}`; return m.abbr ? [a, ' ', el('span', 'mt-abbr', m.abbr)] : [a]; };
  const pick = id => {
    const l = el('label', 'mt-pick');
    const b = el('input'); b.type = 'checkbox'; b.dataset.cmp = id; b.checked = st.c.includes(id);
    l.append(b, ' ', t('methods_cmp_add'));
    return l;
  };
  // 理由・注意の一覧(同じ欄の文は1回だけ添える)
  const reasons = (id, keys, pre) => {
    const ul = el('ul', 'mt-why');
    const used = new Set();
    for (const k of keys) {
      const li = el('li', null, t(`${pre}${k}`));
      const f = FIELD[k], d = f && !used.has(f) && field(id, f);
      if (d) { used.add(f); li.append(el('span', 'mt-why-d', ` — ${d.textContent.trim()}`)); }
      ul.append(li);
    }
    return ul;
  };

  function renderResults() {
    const { fit, out, total } = rank(M, st);
    count.textContent = t(st.n ? 'methods_count' : 'methods_count_all', { n: fit.length, m: total });
    none.hidden = fit.length > 0;
    res.replaceChildren(...fit.map(r => {
      const li = el('li', 'mt-hit');
      const h = el('p', 'mt-hit-h');
      h.append(...nameLink(r.m));
      if (st.n) h.append(' ', el('span', `mt-tag mt-k${r.k}`, t(r.k === 2 ? 'methods_main' : 'methods_sub')));
      li.append(h);
      const w = field(r.m.id, 'what');
      if (w) li.append(el('p', 'mt-hit-w', w.textContent.trim()));
      if (r.nb.length) {
        const p = el('div', 'mt-nb');
        p.append(el('b', null, t('methods_note_h')), reasons(r.m.id, r.nb, 'methods_nb_'));
        li.append(p);
      }
      li.append(pick(r.m.id));
      return li;
    }));
    outBox.hidden = !out.length;
    if (out.length) {
      const d = el('details');
      const s = el('summary', null, t('methods_out_h', { n: out.length }));
      const ul = el('ul', 'mt-outl');
      for (const r of out) {
        const li = el('li');
        const p = el('p', 'mt-hit-h');
        p.append(...nameLink(r.m));
        li.append(p, reasons(r.m.id, r.why, 'methods_why_'));
        ul.append(li);
      }
      d.append(s, ul);
      d.open = outBox.dataset.open === '1';
      d.addEventListener('toggle', () => { outBox.dataset.open = d.open ? '1' : ''; });
      outBox.replaceChildren(d);
    }
  }

  function renderCompare() {
    for (const b of document.querySelectorAll('[data-cmp]')) b.checked = st.c.includes(b.dataset.cmp);
    for (const id of ids) card(id)?.classList.toggle('is-picked', st.c.includes(id));
    const body = cmp.querySelector('.mt-cmp-body');
    const clear = cmp.querySelector('[data-cmp-clear]');
    clear.hidden = !st.c.length;
    if (st.c.length < 2) {
      body.replaceChildren(el('p', 'muted', t(st.c.length ? 'methods_cmp_one' : 'methods_cmp_empty')));
      return;
    }
    const ms = st.c.map(id => M.find(m => m.id === id));
    const wrap = el('div', 'mt-scroll');
    const tb = el('table', 'mt-cmp');
    const head = el('tr');
    head.append(el('th', null, t('methods_cmp_item')));
    for (const m of ms) { const th = el('th'); th.scope = 'col'; th.append(...nameLink(m)); head.append(th); }
    const thead = el('thead'); thead.append(head);
    const tbody = el('tbody');
    for (const f of ROWS) {
      const tr = el('tr');
      const th = el('th', null, t(`methods_${f}`)); th.scope = 'row';
      tr.append(th);
      for (const m of ms) {
        const td = el('td');
        const src = field(m.id, f);
        if (src) td.innerHTML = src.innerHTML; else td.textContent = '—';
        tr.append(td);
      }
      tbody.append(tr);
    }
    tb.append(thead, tbody);
    wrap.append(tb);
    body.replaceChildren(wrap);
  }

  const flash = text => { msg.textContent = text; msg.hidden = false; clearTimeout(flash.tm); flash.tm = setTimeout(() => { msg.hidden = true; }, 4000); };
  const cmpMsg = cmp.querySelector('.mt-cmp-msg');
  const cmpFlash = text => { cmpMsg.textContent = text; cmpMsg.hidden = false; clearTimeout(cmpFlash.tm); cmpFlash.tm = setTimeout(() => { cmpMsg.hidden = true; }, 4000); };

  form.addEventListener('change', () => { getForm(); syncUrl(); renderResults(); });
  form.addEventListener('submit', e => e.preventDefault());
  app.querySelector('[data-reset]').addEventListener('click', () => {
    st = { ...st, n: '', d: '', s: '', m: '', v: false, e: [], r: '', z: '' };
    setForm(); syncUrl(); renderResults();
  });
  app.querySelector('[data-share]').addEventListener('click', async () => {
    const q = writeState(st);
    const text = new URL(location.pathname + (q ? `?${q}` : ''), location.origin).href;
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch {}
    if (!ok) { try { window.prompt('', text); } catch {} }
    else flash(t('compare_link_copied'));
  });
  // 比べる: 結果の一覧と手法のカードのどちらのチェックでも同じ(選んだ順に並べる。4 個まで)
  document.addEventListener('change', e => {
    const id = e.target.dataset?.cmp;
    if (!id) return;
    if (e.target.checked && !st.c.includes(id)) {
      if (st.c.length >= 4) { e.target.checked = false; cmpFlash(t('methods_cmp_max')); return; }
      st.c = [...st.c, id];
    } else if (!e.target.checked) st.c = st.c.filter(x => x !== id);
    syncUrl(); renderCompare();
  });
  cmp.querySelector('[data-cmp-clear]').addEventListener('click', () => { st.c = []; syncUrl(); renderCompare(); });

  document.getElementById('mt-list')?.classList.add('mt-js');
  for (const id of ids) {
    const h = card(id)?.querySelector('.mt-head');
    if (h) h.append(pick(id));
  }
  app.hidden = false;
  cmp.hidden = false;
  setForm();
  renderResults();
  renderCompare();
  // 共有の URL で開いたときは、ページ内のリンク(#m-…)がなければ結果のところを見せる
  if (location.search && !location.hash) app.scrollIntoView();
}

if (app) init();
