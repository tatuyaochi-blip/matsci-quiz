// 組織の見分け方アトラス(/atlas/): 模式図を描く(図は micro.js)、炭素量のつまみ、結晶粒度の換算と数え方、見分ける練習。
// 開いた組織(?s=)・炭素量(?c= などの lever.param)・粒度(?g=&std=)・練習の問題(?p=)と選んだ答え(&a=)を URL に残すので、
// リンクを送れば同じものが開く。練習の記録はこのブラウザの localStorage にだけ置き、どこにも送らない
import { drawMicro, rng, leverFrac, scaleBar, W } from './micro.js';

const dataEl = document.getElementById('at-data');
if (dataEl) {
  const D = JSON.parse(dataEl.textContent);
  const T = D.t;
  const lang = document.documentElement.lang;
  const byId = Object.fromEntries(D.s.map(s => [s.id, s]));
  const fmt = (s, v) => s.replace(/\{(\w+)\|([^|}]*)\|([^}]*)\}/g, (m, k, one, many) => (Number(v[k]) === 1 ? one : many)).replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m));
  // 負の数はマイナス記号(−)で書く
  const nf = (v, d = 2) => v.toLocaleString(lang, { maximumFractionDigits: d, useGrouping: !/^de/.test(lang) }).replace(/^-/, '−');
  const sig = (v, n = 3) => v.toLocaleString(lang, { maximumSignificantDigits: n, useGrouping: !/^de/.test(lang) }).replace(/^-/, '−');
  const width = um => (um >= 1000 ? `${nf(um / 1000)} mm` : `${nf(um)} µm`);
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };
  const newSeed = () => Math.floor(Math.random() * 4294967296) >>> 0;
  let uidN = 0;
  const uid = () => `at${++uidN}`;
  // 縮尺の線の文字(1000 µm 以上は mm で書く)と倍率の文字
  const label = field => {
    const um = scaleBar(field).um;
    return { mag: T.atlas_mag_label, um: um >= 1000 ? `${nf(um / 1000)} mm` : `${nf(um)} µm` };
  };
  const draw = (box, o) => {
    const r = drawMicro({ ...o, uid: uid(), label: label(o.field) });
    box.innerHTML = r.svg;
    return r;
  };

  // ---- URL ----
  const params = () => new URLSearchParams(location.search);
  const setParams = obj => {
    const p = params();
    for (const [k, v] of Object.entries(obj)) (v == null || v === '' ? p.delete(k) : p.set(k, v));
    const qs = p.toString();
    history.replaceState(null, '', `${location.pathname}${qs ? `?${qs}` : ''}${location.hash}`);
  };
  const shareUrl = (obj, hash) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(obj)) if (v != null && v !== '') p.set(k, v);
    const qs = p.toString();
    return `${location.origin}${location.pathname}${qs ? `?${qs}` : ''}${hash ? `#${hash}` : ''}`;
  };
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

  // ---- 組織ごとの模式図(開いたときに描く)と一覧の小さい図(見えたときに描く) ----
  const P0 = params();
  const seeds = {};
  const lv = {};
  for (const s of D.s) {
    if (!s.lever) continue;
    const v = Number(P0.get(s.lever.param));
    lv[s.id] = Number.isFinite(v) && P0.has(s.lever.param) ? Math.min(s.lever.max, Math.max(s.lever.min, Math.round(v / s.lever.step) * s.lever.step)) : s.lever.def;
    lv[s.id] = Number(lv[s.id].toFixed(4));
  }
  const fracOf = s => (s.lever ? leverFrac(s.lever, lv[s.id]) : undefined);
  const drawEntry = id => {
    const s = byId[id];
    const box = document.querySelector(`[data-draw="${id}"]`);
    if (!box) return;
    seeds[id] ??= newSeed();
    const r = draw(box, { kind: s.k, seed: seeds[id], field: s.f, mag: s.m, f: fracOf(s), title: fmt(T.atlas_fig_title, { name: s.name }) });
    box.dataset.done = '1';
    if (s.lever) {
      const v = lv[id];
      const frac = document.querySelector(`[data-frac="${id}"]`);
      const key = s.lever.kind === 'hypo' ? T.atlas_frac_hypo : T.atlas_frac_hyper;
      frac.textContent = fmt(key, { c: nf(v), p: nf(leverFrac(s.lever, v) * 100, 1) })
        + (r.stats?.fill != null ? fmt(T.atlas_frac_fig, { a: nf(r.stats.fill * 100, 1) }) : '');
    }
  };
  const drawThumb = box => {
    const s = byId[box.dataset.thumb];
    draw(box, { kind: s.k, seed: newSeed(), field: s.f, mag: s.m, f: s.lever ? leverFrac(s.lever, s.lever.def) : undefined, thumb: true, title: s.name });
  };
  const thumbs = [...document.querySelectorAll('[data-thumb]')];
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => {
      for (const e of es) if (e.isIntersecting) { io.unobserve(e.target); drawThumb(e.target); }
    }, { rootMargin: '200px 0px' });
    thumbs.forEach(b => io.observe(b));
  } else thumbs.forEach(drawThumb);

  const entries = [...document.querySelectorAll('.at-entry')];
  for (const d of entries) {
    d.addEventListener('toggle', () => {
      const id = d.dataset.id;
      if (d.open) {
        if (!d.querySelector('[data-draw]').dataset.done) drawEntry(id);
        const s = byId[id];
        setParams({ s: id, ...(s.lever ? { [s.lever.param]: lv[id] === s.lever.def ? null : lv[id] } : {}) });
      } else if (params().get('s') === id) {
        setParams({ s: null, ...(byId[id].lever ? { [byId[id].lever.param]: null } : {}) });
      }
    });
  }
  const openEntry = (id, scroll) => {
    const d = document.getElementById(`s-${id}`);
    if (!d || !byId[id]) return;
    d.open = true;
    entries.forEach(x => x.classList.toggle('at-hit', x === d));
    if (scroll) d.scrollIntoView({ block: 'start' });
  };
  // 一覧の図・見分け方の中の組織名: ページを読み直さずにその組織を開く
  document.addEventListener('click', e => {
    const a = e.target.closest('a[data-s]');
    if (!a || e.ctrlKey || e.metaKey || e.shiftKey || e.button) return;
    e.preventDefault();
    history.replaceState(null, '', `${location.pathname}${location.search}#s-${a.dataset.s}`);
    openEntry(a.dataset.s, true);
  });
  window.addEventListener('hashchange', () => {
    const m = location.hash.match(/^#s-([a-z0-9-]+)$/);
    if (m) openEntry(m[1], false);
  });

  // 炭素量のつまみ: 図を同じ形のまま描き直し、割合と計算ツールへのリンクを変える
  for (const inp of document.querySelectorAll('[data-lever]')) {
    const id = inp.dataset.lever;
    const s = byId[id];
    const out = document.getElementById(`${inp.id}-out`);
    const tools = [...document.querySelectorAll(`#s-${id} a[data-tq]`)];
    const apply = () => {
      out.textContent = nf(lv[id]);
      for (const a of tools) a.href = a.dataset.tq.replaceAll(`{${s.lever.param}}`, String(lv[id]));
    };
    inp.value = lv[id];
    apply();
    let raf = 0;
    inp.addEventListener('input', () => {
      lv[id] = Number(Number(inp.value).toFixed(4));
      apply();
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => drawEntry(id));
      setParams({ s: id, [s.lever.param]: lv[id] === s.lever.def ? null : lv[id] });
    });
  }
  for (const b of document.querySelectorAll('[data-redraw]')) {
    b.addEventListener('click', () => { seeds[b.dataset.redraw] = newSeed(); drawEntry(b.dataset.redraw); });
  }

  // ---- 結晶粒度 ----
  const gBox = document.querySelector('[data-grain]');
  const gNum = document.getElementById('g-num');
  const gOut = document.getElementById('g-out');
  const gCap = document.querySelector('.at-gcap');
  const gDl = document.querySelector('.at-gout');
  const gCount = document.querySelector('[data-count]');
  const gRes = document.querySelector('.at-count');
  const gCmp = document.querySelector('[data-cmp]');
  const MAGS = [25, 50, 100, 200, 400, 800, 1600];
  // 1 mm² 当たりの粒の数。JIS G 0551(ISO 643): m = 8 × 2^G。ASTM E112: N_A = 15.50 × 2^(G−1) = 7.75 × 2^G
  const perMm2 = (G, std) => (std === 'jis' ? 8 : 7.75) * 2 ** G;
  const gOf = (na, std) => (std === 'jis' ? Math.log2(na / 8) : 3.321928 * Math.log10(na) - 2.954);
  // 切断法: G = −6.643856 log10 ℓ̄ − 3.288(ℓ̄ は mm。ISO 643 も同じ関係で、G = 0 で ℓ̄ = 0.320 mm)
  const ellOf = G => 10 ** (-(G + 3.288) / 6.643856);
  const gOfEll = l => -6.643856 * Math.log10(l) - 3.288;
  const fieldArea = field => (field / 1000) ** 2 * 0.75; // 図の面積(mm²)。図は横 400 × 縦 300
  const g = { G: 5, std: 'jis', seed: newSeed(), lines: false };
  const pickMag = na => {
    let best = MAGS[0], bs = Infinity;
    for (const M of MAGS) {
      const n = na * fieldArea(1e5 / M);
      const score = Math.abs(Math.log(n / 150)) + (n > 320 || n < 50 ? 10 : 0);
      if (score < bs) { bs = score; best = M; }
    }
    return best;
  };
  if (gBox) {
    const p = params();
    const pg = Number(p.get('g'));
    if (p.has('g') && Number.isFinite(pg)) g.G = Math.min(12, Math.max(0, Math.round(pg * 2) / 2));
    if (p.get('std') === 'astm') g.std = 'astm';
    gNum.value = g.G;
    document.querySelector(`input[name="std"][value="${g.std}"]`).checked = true;
    const row = (k, v) => {
      const d = el('div');
      d.append(el('dt', '', k), el('dd', '', v));
      return d;
    };
    let cur = null;
    const render = () => {
      const na = perMm2(g.G, g.std);
      const M = pickMag(na);
      const field = 1e5 / M;
      const n = Math.max(4, Math.round(na * fieldArea(field)));
      const r = draw(gBox, { kind: 'grain', seed: g.seed, field, mag: M, n, lines: g.lines, title: `${T.atlas_g_cmp_item.replace('{g}', nf(g.G, 1))}` });
      cur = { na, M, field, n, stats: r.stats };
      gOut.textContent = nf(g.G, 1);
      gCap.textContent = fmt(T.atlas_g_cap, { m: M, w: width(field), n });
      const other = g.std === 'jis' ? 'astm' : 'jis';
      gDl.replaceChildren(
        row(T.atlas_g_na, sig(na, 4)),
        row(T.atlas_g_area, `${sig(1e6 / na, 3)} µm²`),
        row(T.atlas_g_d, `${sig(1000 / Math.sqrt(na), 3)} µm`),
        row(T.atlas_g_l, `${sig(ellOf(g.G) * 1000, 3)} µm`),
        row(T.atlas_g_n100, sig(na / 15.5, 3)),
        row(fmt(T.atlas_g_other, { std: other === 'jis' ? 'JIS G 0551' : 'ASTM E112' }), `G = ${nf(gOf(na, other), 2)}`),
      );
      gCount.textContent = g.lines ? T.atlas_g_count_hide : T.atlas_g_count;
      gCount.setAttribute('aria-pressed', String(g.lines));
      gRes.hidden = !g.lines;
      if (g.lines) {
        const st = r.stats;
        const area = fieldArea(field);
        const nj = st.inside + st.cut / 2 + 1;
        const lmm = (st.lineLen / W) * (field / 1000);
        const ell = lmm / st.hits;
        gRes.replaceChildren(
          el('p', '', fmt(T.atlas_g_jeff, { i: st.inside, c: st.cut, n: nf(nj, 1), a: sig(area, 3), na: sig(nj / area, 3), g: nf(gOf(nj / area, g.std), 2) })),
          el('p', '', fmt(T.atlas_g_icpt, { L: sig(lmm, 3), p: st.hits, l: sig(ell, 3), g: nf(gOfEll(ell), 2) })),
          el('p', 'muted', fmt(T.atlas_g_count_note, { n, na: sig(n / area, 3) })),
        );
      }
    };
    // 比較法のイメージ: 同じ倍率で G − 1・G・G + 1
    let cmpT = 0;
    const renderCmp = () => {
      clearTimeout(cmpT);
      cmpT = setTimeout(() => {
        gCmp.replaceChildren(...[-1, 0, 1].map(dg => {
          const G = g.G + dg;
          const f = el('figure', dg ? '' : 'at-cur');
          const box = el('span', 'fig at-thumb');
          const n = Math.round(cur.na * 2 ** dg * fieldArea(cur.field));
          if (G >= -1 && n >= 3 && n <= 700) draw(box, { kind: 'grain', seed: g.seed + dg + 7, field: cur.field, mag: cur.M, n, thumb: true, title: fmt(T.atlas_g_cmp_item, { g: nf(G, 1) }) });
          f.append(box, el('figcaption', '', `${fmt(T.atlas_g_cmp_item, { g: nf(G, 1) })} · ×${cur.M}`));
          return f;
        }));
      }, 150);
    };
    const update = () => {
      render();
      renderCmp();
      setParams({ g: g.G === 5 ? null : g.G, std: g.std === 'jis' ? null : 'astm' });
    };
    let raf = 0;
    gNum.addEventListener('input', () => {
      g.G = Number(gNum.value);
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    });
    for (const r of document.querySelectorAll('input[name="std"]')) r.addEventListener('change', () => { g.std = r.value; update(); });
    gCount.addEventListener('click', () => { g.lines = !g.lines; render(); });
    document.querySelector('[data-redraw-grain]').addEventListener('click', () => { g.seed = newSeed(); render(); renderCmp(); });
    render();
    renderCmp();
  }

  // ---- 見分ける練習 ----
  const pBox = document.querySelector('[data-practice]');
  const PQ = { seed: null, ans: null }; // いま出ている問題の種(36進)と選んだ答え(リンクのコピー用)
  const KEY = 'atlasPractice:v1';
  const fresh = () => ({ streak: 0, best: 0, n: 0, c: 0, miss: {}, seen: {} });
  let storeOk = true;
  let rec = fresh();
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (v && typeof v === 'object') rec = { ...fresh(), ...v };
    localStorage.setItem(`${KEY}:t`, '1');
    localStorage.removeItem(`${KEY}:t`);
  } catch { storeOk = false; }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(rec)); } catch { storeOk = false; } };
  const N = D.s.length;
  const shuffle = (R, a) => {
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(R() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };
  // 問題は種(seed)だけで決まる(URL に答えが出ない)。組織・図の形・炭素量・選択肢の並び
  const idOf = seed => D.s[Math.floor(rng(seed)() * N)].id;
  const question = seed => {
    const R = rng(seed);
    const s = D.s[Math.floor(R() * N)];
    const fig = Math.floor(R() * 4294967296) >>> 0;
    // 練習では、隣の組織と見分けられない炭素量(亜共析鋼でパーライトがわずかなど)を出さないよう pmin から
    const lo = s.lever ? (s.lever.pmin ?? s.lever.min) : 0;
    const c = s.lever ? Number((lo + R() * (s.lever.max - lo)).toFixed(2)) : null;
    const near = shuffle(R, s.conf.map(x => x.id)).slice(0, 2);
    const rest = shuffle(R, D.s.map(x => x.id).filter(id => id !== s.id && !near.includes(id)));
    const opts = shuffle(R, [s.id, ...near, ...rest].slice(0, 4));
    return { seed, s, fig, c, opts };
  };
  const weight = id => 1 + (3 * (rec.miss[id] ?? 0)) / ((rec.seen[id] ?? 0) + 1);
  const nextSeed = (avoid, weak) => {
    const wmax = Math.max(...D.s.map(s => weight(s.id)));
    for (let k = 0; k < 300; k++) {
      const seed = newSeed();
      const id = idOf(seed);
      if (id === avoid) continue;
      if (!weak || Math.random() * wmax <= weight(id)) return seed;
    }
    return newSeed();
  };
  if (pBox) {
    const opts = document.querySelector('.at-opts');
    const res = document.querySelector('.at-pres');
    const stats = document.querySelector('.at-stats');
    const weakBox = document.querySelector('[data-weak]');
    let Q = null, answered = null;
    const renderStats = () => {
      const kids = [el('p', '', fmt(T.atlas_p_streak, { n: rec.streak, b: rec.best })), el('p', '', fmt(T.atlas_p_score, { n: rec.n, c: rec.c }))];
      const weak = Object.entries(rec.miss).filter(([id, m]) => byId[id] && m > 0).sort((a, b) => b[1] - a[1]).slice(0, 3);
      kids.push(el('p', '', T.atlas_p_weak));
      if (weak.length) {
        const ol = el('ol');
        for (const [id, m] of weak) {
          const li = el('li');
          const a = el('a', '', byId[id].name);
          a.href = `?s=${id}#s-${id}`;
          a.dataset.s = id;
          li.append(a, ` ×${m}`);
          ol.append(li);
        }
        kids.push(ol);
      } else kids.push(el('p', '', T.atlas_p_weak_none));
      if (!storeOk) kids.push(el('p', '', T.atlas_p_nostore));
      if (rec.n) {
        const b = el('button', 'btn btn-ghost btn-small', T.atlas_p_reset);
        b.type = 'button';
        b.addEventListener('click', () => { rec = fresh(); save(); renderStats(); });
        kids.push(b);
      }
      stats.replaceChildren(...kids);
    };
    const show = (seed, ans, shared) => {
      Q = question(seed);
      answered = null;
      PQ.seed = seed.toString(36);
      PQ.ans = null;
      draw(pBox, { kind: Q.s.k, seed: Q.fig, field: Q.s.f, mag: Q.s.m, f: Q.s.lever ? leverFrac(Q.s.lever, Q.c) : undefined, title: T.atlas_p_fig });
      opts.replaceChildren(...Q.opts.map(id => {
        const b = el('button', 'at-opt', byId[id].name);
        b.type = 'button';
        b.dataset.id = id;
        b.addEventListener('click', () => answer(id, true));
        return b;
      }));
      res.replaceChildren();
      if (ans && byId[ans]) answer(ans, false, shared);
    };
    function answer(id, record, shared = false) {
      if (answered) return;
      answered = id;
      PQ.ans = id;
      const ok = id === Q.s.id;
      for (const b of opts.children) {
        b.disabled = true;
        if (b.dataset.id === Q.s.id) b.classList.add('at-ok');
        else if (b.dataset.id === id) b.classList.add('at-ng');
      }
      const kids = [el('p', ok ? 'at-r-ok' : 'at-r-ng', ok ? fmt(T.atlas_p_ok, { name: Q.s.name }) : fmt(T.atlas_p_ng, { name: Q.s.name }))];
      kids.push(el('p', '', T.atlas_p_clues));
      const ul = el('ul');
      for (const c of Q.s.clues) ul.append(el('li', '', c));
      kids.push(ul);
      if (!ok) {
        const how = Q.s.conf.find(x => x.id === id)?.how ?? byId[id].conf.find(x => x.id === Q.s.id)?.how;
        if (how) kids.push(el('p', '', fmt(T.atlas_p_diff, { chosen: byId[id].name })), el('p', '', how));
        else {
          // 見分け方の説明がない組み合わせ: 選んだ組織なら見えるはずの手がかりを並べて、違いに気づけるようにする
          const ul2 = el('ul');
          for (const c of byId[id].clues) ul2.append(el('li', '', c));
          kids.push(el('p', '', fmt(T.atlas_p_chosen, { chosen: byId[id].name })), ul2);
        }
      }
      const a = el('a', '', fmt(T.atlas_p_detail, { name: Q.s.name }));
      a.href = `?s=${Q.s.id}#s-${Q.s.id}`;
      a.dataset.s = Q.s.id;
      const pa = el('p');
      pa.append(a);
      kids.push(pa);
      if (shared) kids.push(el('p', 'muted', T.atlas_p_shared));
      res.replaceChildren(...kids);
      setParams({ p: Q.seed.toString(36), a: id });
      if (record) {
        rec.n++;
        rec.seen[Q.s.id] = (rec.seen[Q.s.id] ?? 0) + 1;
        if (ok) { rec.c++; rec.streak++; rec.best = Math.max(rec.best, rec.streak); } else { rec.streak = 0; rec.miss[Q.s.id] = (rec.miss[Q.s.id] ?? 0) + 1; }
        save();
        renderStats();
      }
    }
    document.querySelector('[data-next]').addEventListener('click', () => {
      const seed = nextSeed(Q?.s.id, weakBox.checked);
      show(seed);
      setParams({ p: seed.toString(36), a: null });
    });
    const p = params();
    const ps = p.has('p') ? parseInt(p.get('p'), 36) : NaN;
    if (Number.isFinite(ps) && ps >= 0 && ps < 4294967296) show(ps >>> 0, p.get('a'), true);
    else show(nextSeed(null, false));
    renderStats();
  }

  // ---- リンクのコピー ----
  for (const b of document.querySelectorAll('[data-copy]')) {
    b.addEventListener('click', async () => {
      const kind = b.dataset.copy;
      let obj;
      if (kind.startsWith('s=')) {
        const id = kind.slice(2);
        const s = byId[id];
        obj = { s: id, ...(s.lever && lv[id] !== s.lever.def ? { [s.lever.param]: lv[id] } : {}) };
      } else if (kind === 'g') obj = { g: g.G, std: g.std === 'jis' ? null : 'astm' };
      else obj = { p: PQ.seed, a: PQ.ans }; // 答える前なら問題だけ、答えたあとは選んだ答えも
      const url = shareUrl(obj, b.dataset.hash);
      if (await copy(url)) {
        const old = b.textContent;
        b.textContent = b.dataset.done;
        setTimeout(() => { b.textContent = old; }, 1800);
      } else window.prompt('URL', url);
    });
  }

  // 最初に開く組織(?s= か #s-)
  const first = P0.get('s') ?? location.hash.match(/^#s-([a-z0-9-]+)$/)?.[1];
  if (first && byId[first]) requestAnimationFrame(() => openEntry(first, true));
}
