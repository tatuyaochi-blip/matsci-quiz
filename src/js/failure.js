// 破損解析ナビ(/failure/): 質問の答えから、点数表(data/failure.json を build.js が埋め込んだもの)の点を足して、
// 破損の形態の候補を並べる。どの手がかりで点が入ったか(根拠)と、合わない手がかりも出す。
// 答えは URL のクエリ(?f=bm,st&l=cy …)に残すので、リンクを送れば同じ答えと候補が開く。何もサーバーに送らない
const form = document.getElementById('fn-form');
const dataEl = document.getElementById('fn-data');
if (form && dataEl) {
  const D = JSON.parse(dataEl.textContent);
  const T = D.t;
  const lang = document.documentElement.lang;
  const result = document.getElementById('fn-result');
  const summary = result.querySelector('.fn-summary');
  const list = result.querySelector('.fn-cands');
  const next = result.querySelector('.fn-next');
  const unlikely = result.querySelector('.fn-unlikely');
  const float = document.querySelector('.fn-float');
  const modeName = Object.fromEntries(D.modes.map(m => [m.id, m.name]));
  const fmt = (s, v) => s.replace(/\{(\w+)\|([^|}]*)\|([^}]*)\}/g, (m, k, one, many) => (Number(v[k]) === 1 ? one : many)).replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m));
  const pts = n => (n > 0 ? `+${n}` : `−${-n}`);
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };

  // いまの答え: 質問ID → 選んだ選択肢IDの配列(「わからない」は空)
  const answers = () => Object.fromEntries(D.q.map(q => [q.id, [...form.querySelectorAll(`input[name="${q.id}"]:checked`)].map(i => i.value).filter(Boolean)]));
  const setAnswers = a => {
    for (const q of D.q) {
      const vals = (a[q.id] ?? []).filter(v => q.o.some(o => o.id === v));
      const use = q.multi ? vals : vals.slice(0, 1);
      for (const i of form.querySelectorAll(`input[name="${q.id}"]`)) i.checked = i.value ? use.includes(i.value) : !use.length;
    }
  };
  const fromUrl = () => {
    const p = new URLSearchParams(location.search);
    return Object.fromEntries(D.q.map(q => [q.id, (p.get(q.id) ?? '').split(',').filter(Boolean)]));
  };
  const toUrl = a => {
    const p = new URLSearchParams();
    for (const q of D.q) if (a[q.id].length) p.set(q.id, a[q.id].join(','));
    const qs = p.toString().replace(/%2C/g, ',');
    history.replaceState(null, '', `${location.pathname}${qs ? `?${qs}` : ''}${location.hash}`);
  };

  // 点を足す。根拠(+)と合わない点(−)を、形態ごとに手がかりの名前で残す
  const score = a => {
    const s = Object.fromEntries(D.modes.map(m => [m.id, { n: 0, plus: [], minus: [] }]));
    const add = (pts, label) => {
      for (const [id, n] of Object.entries(pts)) {
        if (!n) continue;
        s[id].n += n;
        (n > 0 ? s[id].plus : s[id].minus).push({ label, n });
      }
    };
    for (const q of D.q) for (const v of a[q.id]) {
      const o = q.o.find(x => x.id === v);
      if (o) add(o.s, o.label);
    }
    const chosen = new Set(D.q.flatMap(q => a[q.id].map(v => `${q.id}.${v}`)));
    for (const c of D.combos) if (c.if.every(k => chosen.has(k))) add(c.s, c.label);
    return s;
  };

  // まだ答えていない質問のうち、上位2つの候補の差がいちばん開く選択肢をもつ質問
  const nextQuestion = (a, top) => {
    let best = null;
    for (const q of D.q) {
      if (a[q.id].length) continue;
      const gap = Math.max(...q.o.map(o => Math.abs((o.s[top[0]] ?? 0) - (o.s[top[1]] ?? 0))));
      if (gap > 0 && (!best || gap > best.gap)) best = { q, gap };
    }
    return best?.q;
  };

  const reasonLine = (label, items) => {
    const p = el('p', 'fn-why');
    p.append(el('b', '', `${label}: `));
    items.sort((x, y) => Math.abs(y.n) - Math.abs(x.n)).forEach((x, i) => {
      if (i) p.append(lang.startsWith('ja') ? '、' : ', ');
      p.append(`${x.label} `, el('span', x.n > 0 ? 'fn-p' : 'fn-n', pts(x.n)));
    });
    return p;
  };

  const render = () => {
    const a = answers();
    toUrl(a);
    const nAns = D.q.filter(q => a[q.id].length).length;
    list.replaceChildren();
    next.hidden = true;
    unlikely.hidden = true;
    float.hidden = true;
    if (!nAns) { summary.textContent = T.failure_empty; return; }
    const s = score(a);
    const order = D.modes.map(m => m.id);
    const ranked = order.filter(id => s[id].n > 0).sort((x, y) => s[y].n - s[x].n || order.indexOf(x) - order.indexOf(y));
    summary.textContent = ranked.length ? fmt(T.failure_n_answered, { n: nAns }) : T.failure_none_fit;
    const max = ranked.length ? s[ranked[0]].n : 1;
    ranked.slice(0, 6).forEach((id, i) => {
      const li = el('li', `fn-cand${i === 0 ? ' fn-first' : ''}`);
      const head = el('p', 'fn-cand-head');
      const a2 = el('a', '', modeName[id]);
      a2.href = `#mode-${id}`;
      head.append(a2, el('span', 'fn-pts', fmt(T.failure_points, { n: s[id].n })));
      const bar = el('span', 'fn-bar');
      const fill = el('span');
      fill.style.width = `${Math.max(4, Math.round((100 * s[id].n) / max))}%`;
      bar.append(fill);
      li.append(head, bar);
      if (s[id].plus.length) li.append(reasonLine(T.failure_for, s[id].plus));
      if (s[id].minus.length) li.append(reasonLine(T.failure_against, s[id].minus));
      const more = el('a', 'fn-more', `${T.failure_details} →`);
      more.href = `#mode-${id}`;
      li.append(more);
      list.append(li);
    });
    // 当てはまりにくい形態(点が0以下)。合わない手がかりを添える
    const low = order.filter(id => s[id].n <= 0 && (s[id].minus.length || s[id].plus.length));
    if (low.length) {
      const ul = unlikely.querySelector('ul');
      ul.replaceChildren(...low.sort((x, y) => s[x].n - s[y].n).map(id => {
        const li = el('li');
        const a3 = el('a', '', modeName[id]);
        a3.href = `#mode-${id}`;
        li.append(a3, ` (${fmt(T.failure_points, { n: s[id].n }).replace('-', '−')})`);
        if (s[id].minus.length) li.append(reasonLine(T.failure_against, s[id].minus));
        return li;
      }));
      unlikely.hidden = false;
    }
    if (ranked.length >= 2) {
      const q = nextQuestion(a, ranked);
      if (q) {
        next.replaceChildren();
        const link = el('a', '', q.label);
        link.href = `#q-${q.id}`;
        const [pre, post] = T.failure_next.split('{q}');
        next.append(fmt(pre, {}), link, fmt(post, { a: modeName[ranked[0]], b: modeName[ranked[1]] }));
        next.hidden = false;
      }
    }
    if (ranked.length) {
      float.textContent = `${T.failure_top}: ${modeName[ranked[0]]} — ${T.failure_to_result} ↓`;
      float.hidden = false;
    }
  };

  // 複数選べる質問: 「わからない」を選んだらほかを外し、ほかを選んだら「わからない」を外す
  form.addEventListener('change', e => {
    const i = e.target;
    const q = D.q.find(x => x.id === i.name);
    if (q?.multi) {
      const boxes = [...form.querySelectorAll(`input[name="${q.id}"]`)];
      if (!i.value && i.checked) boxes.forEach(b => { if (b.value) b.checked = false; });
      else if (i.value && i.checked) boxes.forEach(b => { if (!b.value) b.checked = false; });
      if (!boxes.some(b => b.checked)) boxes.find(b => !b.value).checked = true;
    }
    render();
  });

  // 最上位の候補の案内は、結果の欄が画面に見えている間は隠す
  if ('IntersectionObserver' in window) {
    let visible = false;
    new IntersectionObserver(es => { visible = es.some(x => x.isIntersecting); float.classList.toggle('fn-off', visible); }).observe(result);
  }

  // 形態の見出し(#mode-…)へ移ったら、その欄を開く
  const openHash = () => {
    const d = location.hash.startsWith('#mode-') && document.getElementById(location.hash.slice(1));
    if (d && d.tagName === 'DETAILS') d.open = true;
  };
  window.addEventListener('hashchange', openHash);
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href^="#mode-"]');
    if (a) { const d = document.getElementById(a.getAttribute('href').slice(1)); if (d) d.open = true; }
  });

  async function copy(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch {}
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch {}
    ta.remove();
    return ok;
  }
  result.querySelector('[data-share]').addEventListener('click', async e => {
    const btn = e.currentTarget;
    const url = location.href.split('#')[0];
    if (await copy(url)) {
      const old = btn.textContent;
      btn.textContent = btn.dataset.done;
      setTimeout(() => { btn.textContent = old; }, 1800);
    } else {
      window.prompt('URL', url);
    }
  });
  result.querySelector('[data-reset]').addEventListener('click', () => {
    setAnswers({});
    render();
  });

  setAnswers(fromUrl());
  render();
  openHash();
}
