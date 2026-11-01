// 試料調製・エッチングガイド(/prep/)。共通の流れ・材料ごとの手順・腐食液・安全・失敗の表は build.js が data/prep.json から作ってページに書く(JavaScript がなくても全部読める)。
// このファイルは「失敗から原因を探す」: 見えた不具合と材料を選ぶと、原因と直し方を確からしい順に並べ、その材料では考えにくい原因を分ける。
// 条件の URL(?f=不具合&p=材料)の読み書きとコピー。順位は rank()(build の検査と場面の確かめでも使うので、DOM に触れない)。
// 原因と直し方・材料ごとの注意の文は、ページの失敗の表(#f-…)の data-c・data-p の項目を写して使う
const app = typeof document !== 'undefined' ? document.getElementById('pp-app') : null;

// 1 つの不具合の原因を並べる。
// d: { id, causes: [{ id, w: 基本の重み, up: { 性質: 加点 }, only?: [性質] }] }、tr: 材料の性質の並び(材料を選ばないときは null)
// 返す値: { hits: [{ id, s: 点, up: 点を上げた性質 }](点の高い順。同点はデータの順), low: [{ id, why: 'only' | 'zero', only? }] }
// 材料を選ばないとき(と、性質を持たない材料: どの金属にも使う EBSD の仕上げなど)は基本の重みの順で、重み 0(材料によって起きる原因)も最後に並べる。
// 性質のある材料を選ぶと、性質で点を足し、only の性質を持たない材料と、点が 0 のままの原因は「考えにくい」に分ける
export function rank(d, tr) {
  const hits = [], low = [];
  const any = !tr || !tr.length;
  for (const c of d.causes) {
    if (any) { hits.push({ id: c.id, s: c.w, up: [] }); continue; }
    if (c.only && !c.only.some(t => tr.includes(t))) { low.push({ id: c.id, why: 'only', only: c.only }); continue; }
    const up = tr.filter(t => (c.up?.[t] ?? 0) > 0);
    const s = c.w + up.reduce((a, t) => a + c.up[t], 0);
    if (s <= 0) { low.push({ id: c.id, why: 'zero' }); continue; }
    hits.push({ id: c.id, s, up });
  }
  hits.sort((a, b) => b.s - a.s); // Array.prototype.sort は安定なので、同点はデータの順のまま
  return { hits, low };
}

// URL の条件を読む。知らない値は捨てる
export function readState(params, defectIds, matIds) {
  const f = params.get('f') ?? '', p = params.get('p') ?? '';
  return { f: defectIds.includes(f) ? f : '', p: matIds.includes(p) ? p : '' };
}
export function writeState(st) {
  const q = new URLSearchParams();
  if (st.f) q.set('f', st.f);
  if (st.p) q.set('p', st.p);
  return q.toString();
}

function init() {
  const T = JSON.parse(app.dataset.t);
  const D = JSON.parse(app.dataset.d); // [{ id, causes }]
  const M = JSON.parse(app.dataset.m); // [{ id, tr }]
  const TR = JSON.parse(app.dataset.tr); // { 性質: 名前 }
  const t = (k, v = {}) => T[k].replace(/\{(\w+)\}/g, (_, x) => v[x] ?? '');
  const byD = Object.fromEntries(D.map(d => [d.id, d]));
  const byM = Object.fromEntries(M.map(m => [m.id, m]));
  const form = app.querySelector('form');
  const out = app.querySelector('.pp-out');
  const msg = app.querySelector('.pp-msg');
  let st = readState(new URLSearchParams(location.search), D.map(d => d.id), M.map(m => m.id));

  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const link = (href, text) => { const a = el('a', null, text); a.href = href; return a; };
  // ページの失敗の表から、原因(data-c)と材料ごとの注意(data-p)の中身を写す(id は付けない)
  const copy = node => { const c = node.cloneNode(true); c.removeAttribute('id'); return c; };
  const sec = id => document.getElementById(`f-${id}`);
  const matName = id => document.querySelector(`#p-${id} h3 a`)?.textContent ?? id;
  let timer;
  const flash = text => { msg.textContent = text; msg.hidden = false; clearTimeout(timer); timer = setTimeout(() => { msg.hidden = true; }, 2500); };

  function setForm() {
    for (const r of form.querySelectorAll('input[name="f"]')) r.checked = r.value === st.f;
    form.querySelector('select[name="p"]').value = st.p;
  }
  function syncUrl() {
    const q = writeState(st);
    try { history.replaceState(history.state, '', location.pathname + (q ? `?${q}` : '') + location.hash); } catch {}
  }
  function render() {
    out.replaceChildren();
    if (!st.f) {
      out.append(el('p', 'muted', t('prep_pick')));
      if (st.p) { const p = el('p'); p.append(link(`#p-${st.p}`, t('prep_mat_link', { m: matName(st.p) }))); out.append(p); }
      return;
    }
    const s = sec(st.f);
    const r = rank(byD[st.f], st.p ? byM[st.p].tr : null);
    const h = el('h4'); h.append(link(`#f-${st.f}`, s.querySelector('h3 a').textContent)); out.append(h);
    const look = s.querySelector('.pp-look'); if (look) out.append(copy(look));
    // その材料での注意(材料の手順に書いた、この不具合への対策)を先に出す
    const tip = st.p && s.querySelector(`.pp-tips [data-p="${st.p}"]`);
    if (tip) {
      const box = el('div', 'mt-nb pp-tip');
      box.append(el('p', 'pp-tip-h', t('prep_tip_h', { m: matName(st.p) })));
      box.append(copy(tip.querySelector('.pp-tt'))); // 材料名のリンクは省き、注意の文だけ
      out.append(box);
    }
    out.append(el('p', 'pp-count muted', st.p ? t('prep_count_m', { n: r.hits.length, m: matName(st.p) }) : t('prep_count', { n: r.hits.length })));
    const ol = el('ol', 'mt-res pp-res');
    for (const x of r.hits) {
      const li = el('li', 'mt-hit pp-hit');
      const src = s.querySelector(`[data-c="${x.id}"]`);
      for (const n of [...copy(src).childNodes]) if (!(n.classList && n.classList.contains('pp-by'))) li.append(n);
      if (x.up.length) li.append(el('p', 'pp-up', `${t('prep_up')} ${x.up.map(k => TR[k]).join(t('prep_sep'))}`));
      else if (x.s === 0) li.append(el('p', 'pp-up', t('prep_by_mat')));
      ol.append(li);
    }
    out.append(ol);
    if (r.low.length) {
      const det = el('details', 'mt-out pp-low');
      det.append(el('summary', null, t('prep_low_h', { n: r.low.length })));
      const ul = el('ul', 'mt-outl');
      for (const x of r.low) {
        const li = el('li');
        const src = s.querySelector(`[data-c="${x.id}"] .pp-c`);
        li.append(copy(src));
        li.append(el('p', 'pp-why muted', x.why === 'only' ? t('prep_low_only', { t: x.only.map(k => TR[k]).join(t('prep_sep')) }) : t('prep_low_zero')));
        ul.append(li);
      }
      det.append(ul);
      out.append(det);
    }
    const more = el('p', 'pp-more');
    if (st.p) more.append(link(`#p-${st.p}`, t('prep_mat_link', { m: matName(st.p) })));
    out.append(more);
  }

  form.addEventListener('change', e => {
    if (e.target.name === 'f') st.f = e.target.value;
    else if (e.target.name === 'p') st.p = e.target.value;
    else return;
    syncUrl(); render();
  });
  form.addEventListener('submit', e => e.preventDefault());
  app.querySelector('[data-reset]').addEventListener('click', () => { st = { f: '', p: '' }; setForm(); syncUrl(); render(); });
  app.querySelector('[data-share]').addEventListener('click', async () => {
    const q = writeState(st);
    const text = new URL(location.pathname + (q ? `?${q}` : ''), location.origin).href;
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch {}
    if (!ok) { try { window.prompt('', text); } catch {} }
    else flash(t('compare_link_copied'));
  });
  // 材料のカードの「この材料で失敗の原因を探す」: 材料を選んで、探す所へ
  document.addEventListener('click', e => {
    const a = e.target.closest?.('[data-pp-try]');
    if (!a) return;
    e.preventDefault();
    st.p = a.dataset.ppTry;
    setForm(); syncUrl(); render();
    app.scrollIntoView();
    form.querySelector('input[name="f"]:checked, input[name="f"]')?.focus();
  });
  for (const a of document.querySelectorAll('[data-pp-try]')) a.hidden = false;
  app.hidden = false;
  setForm();
  render();
  // 共有の URL で開いたときは、ページ内のリンク(#…)がなければ結果のところを見せる
  if (location.search && !location.hash) app.scrollIntoView();
}

if (app) init();
