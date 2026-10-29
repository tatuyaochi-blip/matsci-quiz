// 材料データ集(/materials/)。材料の物性値を、出典と条件つきで探す・並べ比べる・持ち出す。
// 値・出典・文章は data/materials.json(訳は data/i18n/{言語}/materials.json)。build.js がページに埋め込み(#md-data)、
// 動きのない表(JavaScript がないとき)もこのファイルの tableHTML で作る。
// 値は出典の単位と桁のまま持っていて(v.u がないときは性質の既定の単位)、表示の単位への換算はこのファイルだけが行う。
// 換算: 10 の累乗倍の換算は桁をそのまま移す。℃ と K は 273.15 を足し引きして元の小数の桁に丸める。eV・cal/mol と kJ/mol の間は元の有効数字(2桁以上)に丸める。
// 検算: review の scripts/check_units.py(python で別に換算して突き合わせる)と check_page.mjs(比と CSV)。

// ---- 単位: [群, 群の基準への倍率]。温度(T)は倍率でなく足し引き ----
export const UNIT = {
  gcc: ['rho', 1], kgm3: ['rho', 1e-3], GPa: ['P', 1e3], MPa: ['P', 1], none: ['1', 1], MPam: ['KIC', 1], pct: ['pct', 1],
  Wm: ['k', 1], Wcm: ['k', 100], ppmK: ['perT', 1e-6], mK: ['perT', 1e-3], perK: ['perT', 1], C: ['T', 0], K: ['T', 0], dC: ['dT', 1], dK: ['dT', 1],
  nm: ['L', 1], A: ['L', 0.1], pm: ['L', 1e-3], um: ['L', 1e3], deg: ['deg', 1], kJmol: ['Em', 1], Jmol: ['Em', 1e-3], eV: ['Em', 96.48533212], calmol: ['Em', 4.184e-3],
  uOcm: ['R', 1e-8], Om: ['R', 1], nOm: ['R', 1e-9], m2s: ['D', 1], cm2s: ['D', 1e-4],
};
const K0 = 273.15;
const pow10 = r => { const l = Math.log10(r); return Math.abs(l - Math.round(l)) < 1e-9; };
// 有効数字の桁(最短の書き方の仮数の桁。200 は 1 桁)と小数の桁
export const sigOf = x => Math.abs(x).toExponential().split('e')[0].replace('.', '').length;
export const decOf = x => { const t = String(x); if (t.includes('e-')) { const [m, e] = t.split('e-'); return Number(e) + (m.split('.')[1]?.length ?? 0); } return t.split('.')[1]?.length ?? 0; };
const clean = y => Number(y.toPrecision(12));
// x(単位 from)を単位 to に。{ n: 数(CSV に出す数), s: 表示の文字 }。換算できないときは null
export function conv(x, from, to) {
  if (x == null || !Number.isFinite(x)) return null;
  if (!to || from === to) return { n: x, s: show(x, null) };
  const [gf, ff] = UNIT[from] ?? [], [gt, ft] = UNIT[to] ?? [];
  if (!gf || gf !== gt) return null;
  if (gf === 'T') {
    // 273.15 を足し引きし、元の小数の桁に丸める(0.5 は 0 から遠い側へ)。浮動小数の誤差を避けて整数で計算する
    const d = decOf(x), e = Math.max(d, 2);
    const y = Math.round(x * 10 ** e) + (from === 'C' ? 1 : -1) * 27315 * 10 ** (e - 2);
    const q = Math.sign(y) * Math.floor(Math.abs(y) / 10 ** (e - d) + 0.5);
    const t = (q / 10 ** d).toFixed(d);
    return { n: Number(t), s: minus(t) };
  }
  const r = ff / ft;
  if (pow10(r)) { const n = clean(x * r); return { n, s: show(n, null) }; }
  const sg = Math.max(sigOf(x), 2);
  const n = Number((x * r).toPrecision(sg));
  return { n, s: show(x * r, sg) };
}
// 群の基準の単位の数(並べ替え・比・図に使う。温度は K)
export function toBase(x, u) {
  if (x == null) return null;
  const [g, f] = UNIT[u] ?? ['?', 1];
  if (g === 'T') return u === 'C' ? x + K0 : x;
  return x * f;
}
const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
const minus = t => t.replace(/^-/, '−');
// 表示の文字。sg がなければ数の持っている桁のまま。とても大きい・小さい数は × 10ⁿ
export function show(x, sg) {
  if (x === 0) return '0';
  const a = Math.abs(x);
  if (a >= 1e6 || a < 1e-3) {
    const s = sg ?? sigOf(x);
    const [m, e] = x.toExponential(s - 1).split('e');
    return `${minus(m)} × 10${String(Number(e)).replace(/./g, c => SUP[c])}`;
  }
  if (sg == null) return minus(String(x));
  const t = x.toPrecision(sg);
  return minus(t.includes('e') ? String(Number(t)) : t);
}
// 画面の数の書き方。de は小数点をコンマに(桁区切りは付けない)。ほかの言語は show のまま。
// CSV は機械で読む形なので、D.plain(csvWide・csvLong が付ける)のときはピリオドのまま
const deNum = D => /^de/.test(D?.lang ?? '') && !D.plain;
export const numText = (D, t) => (deNum(D) ? String(t).replace(/(\d)\.(\d)/g, '$1,$2') : String(t));
// 文に差し込む数(条件の {a}・変態の {t} など)。数でなければそのまま
const numIn = (D, x) => (typeof x === 'number' ? numText(D, show(x, null)) : x);

// ---- 値の読み方 ----
export const propOf = (D, p) => D.props.find(x => x.id === p);
export const unitOf = (D, v) => v.u ?? propOf(D, v.p).u;
export const valsOf = (m, p) => m.v.filter(x => x.p === p);
// 代表の数(元の単位): 1つの値、範囲の代表値、代表値のない範囲は相乗平均(正のとき)か中央
export const repOf = v => (v.v != null ? v.v : v.m != null ? v.m : v.r ? (v.r[0] > 0 && v.r[1] > 0 ? Math.sqrt(v.r[0] * v.r[1]) : (v.r[0] + v.r[1]) / 2) : null);
export const baseOf = (D, v) => toBase(repOf(v), unitOf(D, v));
const fill = (s, o) => s.replace(/\{(\w+)\}/g, (m, k) => (o[k] ?? m));
export const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// 値の文字(表示の単位 to)。{ main, rep, lo, hi, n } n は CSV の数
export function valText(D, v, to) {
  const from = unitOf(D, v);
  to = to ?? from;
  if (v.r) {
    const lo = conv(v.r[0], from, to), hi = conv(v.r[1], from, to), rep = v.m != null ? conv(v.m, from, to) : null;
    // 上下が同じ範囲(Ashby の 8.9–8.9 など)は1つの値で書く
    const ls = numText(D, lo.s), hs = numText(D, hi.s);
    return { main: ls === hs ? ls : `${ls}–${hs}`, rep: rep ? numText(D, rep.s) : null, lo: lo.n, hi: hi.n, n: rep?.n ?? null };
  }
  const c = conv(v.v, from, to);
  return c ? { main: numText(D, c.s), rep: null, n: c.n } : null;
}
// 文字の値(結晶構造・成分・変態・融点がない理由)
export function textOf(D, v) {
  if (v.p === 'struct') return D.structs[v.x] ?? v.x;
  if (v.p === 'mp') return D.mpNotes[v.x] ?? '';
  if (v.p === 'tr') {
    const [t, way, ph, k] = v.x;
    if (way === 'meta') return D.tr.meta;
    return fill(D.tr[way], { t: numIn(D, t), p: ph, s: D.tr.st[k] ?? k });
  }
  // 成分: de はコンマ小数と紛れないよう「; 」で並べる
  if (v.p === 'comp') return v.x.split(',').map(s => { const [el, q] = s.split(':'); return `${el} ${q === 'bal' ? D.t.md_bal : numText(D, q.startsWith('-') ? `≤ ${q.slice(1)}` : q.replace('-', '–'))}`; }).join(deNum(D) ? '; ' : ', ');
  return v.x ?? '';
}
export const condText = (D, v) => (v.c ?? []).map(c => fill(D.conds[c] ?? c, Object.fromEntries(Object.entries(v.cp ?? {}).map(([k, x]) => [k, numIn(D, x)]))));
// 区切りの記号は言語で変える(日本語は中点、中国語は読点と全角のコロン)
const sepOf = D => (/^ja/.test(D.lang) ? '・' : /^zh/.test(D.lang) ? '、' : ' · ');
const listSep = D => (/^(ja|zh)/.test(D.lang) ? '、' : ', ');
const colon = D => (/^zh/.test(D.lang) ? '：' : ': ');
export const kindShort = (D, k) => (D.kinds[k] ?? k).replace(/[(（].*$/, '').trim();
// 値に添える文(銘柄・状態、強さの種類、条件)
export function noteOf(D, m, v, short = true) {
  return [v.g ? m.vars?.[v.g] : null, v.k ? (short ? kindShort(D, v.k) : D.kinds[v.k]) : null, ...condText(D, v)].filter(Boolean);
}
export const srcNo = (D, k) => D.sources.findIndex(s => s.id === k) + 1;
const srcMarks = (D, v) => v.s.map(k => `<a href="#src-${srcNo(D, k)}" class="md-src">${srcNo(D, k)}</a>`).join('');
export const unitLabel = (D, u) => D.units[u] ?? '';
export const symHTML = s => esc(s).replace(/_(\w+)/, '<sub>$1</sub>');

// ---- 表 ----
// state: { cols: [性質], units: { 性質: 単位 }, sort: { p, dir }, cmp: [id] }。rows: 並べる材料
export function headHTML(D, st) {
  const sortBtn = (key, label) => {
    const on = st.sort?.p === key;
    return `<button type="button" class="md-sort" data-sort="${key}">${label}<span class="md-sort-i" aria-hidden="true">${on ? (st.sort.dir < 0 ? '▼' : '▲') : '↕'}</span></button>`;
  };
  const aria = key => (st.sort?.p === key ? ` aria-sort="${st.sort.dir < 0 ? 'descending' : 'ascending'}"` : '');
  return `<tr><th scope="col" class="md-c-cmp"><span class="visually-hidden">${esc(D.t.md_th_cmp)}</span></th><th scope="col" class="md-c-name"${aria('name')}>${sortBtn('name', esc(D.t.md_th_name))}</th>${st.cols.map(p => {
    const P = propOf(D, p), u = st.units[p] ?? P.u, ul = unitLabel(D, u);
    return `<th scope="col"${aria(p)}>${sortBtn(p, `${esc(P.name)}${ul ? `<small>${esc(ul)}</small>` : ''}`)}</th>`;
  }).join('')}</tr>`;
}
export function cellHTML(D, m, p, u) {
  const vs = valsOf(m, p);
  if (!vs.length) return '<td class="md-na"><span aria-hidden="true">–</span></td>';
  const v = vs[0];
  const more = vs.length > 1 ? `<span class="md-more" title="${esc(fill(D.t.md_more_t, { n: vs.length - 1 }))}">+${vs.length - 1}</span>` : '';
  const note = noteOf(D, m, v);
  const P = propOf(D, p);
  let main;
  if (P.text || (v.v == null && !v.r)) main = `<span class="md-tx">${esc(textOf(D, v) || '—')}</span>`;
  else {
    const t = valText(D, v, u ?? P.u); // 列の見出しの単位(選んでいなければ性質の既定の単位)で出す
    main = `<span class="md-v">${esc(t.main)}</span>${t.rep ? `<span class="md-rep">${esc(fill(D.t.md_rep_short, { v: t.rep }))}</span>` : ''}`;
  }
  return `<td>${main}<sup class="md-srcs">${srcMarks(D, v)}</sup>${more}${note.length ? `<small class="md-note">${esc(note.join(sepOf(D)))}</small>` : ''}</td>`;
}
export function rowHTML(D, m, st, home = '') {
  const on = st.cmp?.includes(m.id);
  const sub = [m.sym && m.sym !== m.name ? m.sym : null, D.classes.find(c => c.id === m.cls)?.name].filter(Boolean).join(sepOf(D));
  return `<tr data-id="${m.id}"><td class="md-c-cmp"><input type="checkbox" data-cmp="${m.id}" aria-label="${esc(fill(D.t.md_cmp_add_a, { m: m.name }))}"${on ? ' checked' : ''}></td><th scope="row" class="md-c-name"><a href="?m=${m.id}#md-card" data-card="${m.id}">${esc(m.name)}</a><small>${esc(sub)}</small></th>${st.cols.map(p => cellHTML(D, m, p, st.units[p])).join('')}</tr>`;
}
export const tableHTML = (D, rows, st) => `<thead>${headHTML(D, st)}</thead><tbody>${rows.map(m => rowHTML(D, m, st)).join('')}</tbody>`;

// ---- 検索・絞り込み・並べ替え ----
// 比べるための文字: 全角・半角、下付きの数字、大文字小文字、空白と記号の違いをなくす
export const norm = s => String(s).normalize('NFKC').toLowerCase().replace(/[\s\-‐–—・·,.()()/／_]+/g, '');
export function filterRows(D, st) {
  const qs = String(st.q ?? '').split(/\s+/).map(norm).filter(Boolean);
  return D.materials.filter(m => (!st.cls || m.cls === st.cls) && (!st.has || valsOf(m, st.has).length) && qs.every(q => m.k.includes(q)));
}
export function sortRows(D, rows, st) {
  if (!st.sort?.p) return rows;
  const { p, dir } = st.sort;
  const key = m => {
    if (p === 'name') return m.name;
    const v = valsOf(m, p)[0];
    if (!v) return null;
    if (propOf(D, p).text) return textOf(D, v) || null;
    return baseOf(D, v);
  };
  const ks = new Map(rows.map(m => [m.id, key(m)]));
  return [...rows].sort((a, b) => {
    const x = ks.get(a.id), y = ks.get(b.id);
    if (x == null || y == null) return x == null ? (y == null ? 0 : 1) : -1; // 値のない材料はいつも後ろ
    return (typeof x === 'string' ? x.localeCompare(y, D.lang) : x - y) * dir;
  });
}

// ---- 並べ比べ ----
// 物性ごとに、最初の材料を 1 とした比(代表の値。温度は K で)と、条件の違いの注意
export function compareRows(D, mats, units) {
  const out = [];
  for (const P of D.props) {
    if (P.card) continue;
    const vs = mats.map(m => valsOf(m, P.id)[0] ?? null);
    if (!vs.some(Boolean)) continue;
    const u = units[P.id] ?? P.u;
    const b0 = vs[0] && !P.text ? baseOf(D, vs[0]) : null;
    const cells = vs.map((v, i) => {
      if (!v) return null;
      if (P.text || (v.v == null && !v.r)) return { text: textOf(D, v), v };
      const t = valText(D, v, u), b = baseOf(D, v);
      const ratio = i > 0 && b0 != null && b0 !== 0 && b != null ? b / b0 : null;
      return { t, v, ratio };
    });
    // 注意: 条件・強さの種類・範囲と1つの値の違い
    const notes = [];
    const present = vs.map((v, i) => [v, mats[i]]).filter(([v]) => v);
    const sig = v => JSON.stringify([v.c ?? [], v.cp ?? {}]);
    if (present.length > 1) {
      if (new Set(present.map(([v]) => v.k ?? '')).size > 1) notes.push(fill(D.t.md_cmp_kind, { l: present.map(([v, m]) => `${m.name}${colon(D)}${v.k ? kindShort(D, v.k) : '—'}`).join(' / ') }));
      // 条件の書いていない値(資料に条件がない)は比べない。条件の書いてある値どうしが違うときだけ
      if (new Set(present.filter(([v]) => v.c?.length).map(([v]) => sig(v))).size > 1) notes.push(fill(D.t.md_cmp_cond, { l: present.map(([v, m]) => `${m.name}${colon(D)}${condText(D, v).join(sepOf(D)) || '—'}`).join(' / ') }));
      if (!P.text && new Set(present.map(([v]) => !!v.r)).size > 1) notes.push(D.t.md_cmp_range);
      if (UNIT[u]?.[0] === 'T' && present.length > 1) notes.push(D.t.md_cmp_kelvin);
    }
    if (vs[0] == null && present.length > 1) notes.push(D.t.md_cmp_nobase);
    out.push({ p: P.id, u, cells, notes });
  }
  return out;
}
export const ratioText = (r, D) => (r == null ? '' : `×${numText(D, show(r, r >= 100 || r < 0.01 ? 2 : 3))}`);

// ---- CSV ----
const csvCell = x => { const s = x == null ? '' : String(x); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
export const csvText = rows => rows.map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
const srcNames = (D, v) => v.s.map(k => D.sources.find(s => s.id === k)?.name ?? k).join(' | ');
const toolNames = (D, v) => v.t.map(t => D.tools[t]?.n ?? D.t[`md_tool_${t}`] ?? t).join(' | ');
// 表のとおり: 1材料1行、列ごとに 値(代表)・範囲・条件・出典
export function csvWide(D0, rows, st) {
  const D = { ...D0, plain: true }; // 数はピリオドの小数のまま
  const h = [D.t.md_csv_name, 'id', D.t.md_csv_class];
  for (const p of st.cols) {
    const P = propOf(D, p), ul = unitLabel(D, st.units[p] ?? P.u);
    h.push(`${P.name}${ul ? ` [${ul}]` : ''}`, ...(P.text ? [] : [`${P.name} ${D.t.md_csv_range}`]), `${P.name} ${D.t.md_csv_cond}`, `${P.name} ${D.t.md_csv_src}`);
  }
  const out = [h];
  for (const m of rows) {
    const r = [m.name, m.id, D.classes.find(c => c.id === m.cls)?.name];
    for (const p of st.cols) {
      const P = propOf(D, p), v = valsOf(m, p)[0];
      if (!v) { r.push('', ...(P.text ? [] : ['']), '', ''); continue; }
      if (P.text || (v.v == null && !v.r)) { r.push(textOf(D, v), ...(P.text ? [] : ['']), noteOf(D, m, v, false).join('; '), srcNames(D, v)); continue; }
      const t = valText(D, v, st.units[p] ?? P.u); // 見出しの単位で
      r.push(t.n ?? '', v.r ? `${t.lo}–${t.hi}` : '', noteOf(D, m, v, false).join('; '), srcNames(D, v));
    }
    out.push(r);
  }
  return out;
}
// すべての値: 1値1行。表示の単位の値と、元の単位の値の両方
export function csvLong(D0, rows, st) {
  const D = { ...D0, plain: true }; // 数はピリオドの小数のまま
  const T = D.t;
  const out = [[T.md_csv_name, 'id', T.md_csv_class, T.md_csv_prop, T.md_csv_value, T.md_csv_lo, T.md_csv_hi, T.md_csv_unit, T.md_csv_ovalue, T.md_csv_olo, T.md_csv_ohi, T.md_csv_ounit,
    T.md_csv_var, T.md_csv_kind, T.md_csv_cond, T.md_csv_src, T.md_csv_url, T.md_csv_tool]];
  for (const m of rows) for (const P of D.props) for (const v of valsOf(m, P.id)) {
    const base = [m.name, m.id, D.classes.find(c => c.id === m.cls)?.name, P.name];
    const tail = [v.g ? m.vars?.[v.g] ?? '' : '', v.k ? D.kinds[v.k] : '', condText(D, v).join('; '), srcNames(D, v), v.s.map(k => D.sources.find(s => s.id === k)?.url ?? '').join(' | '), toolNames(D, v)];
    if (P.text || (v.v == null && !v.r)) { out.push([...base, textOf(D, v), '', '', '', '', '', '', '', ...tail]); continue; }
    const from = unitOf(D, v), to = st.units[P.id] ?? P.u;
    const t = valText(D, v, to);
    const o = v.r ? { n: v.m ?? '', lo: v.r[0], hi: v.r[1] } : { n: v.v, lo: '', hi: '' };
    out.push([...base, t.n ?? '', v.r ? t.lo : '', v.r ? t.hi : '', unitLabel(D, to), o.n, o.lo, o.hi, unitLabel(D, from), ...tail]);
  }
  return out;
}

// ---- URL の状態 ----
export function readState(D, search) {
  const q = new URLSearchParams(search);
  const ids = new Set(D.materials.map(m => m.id)), props = new Set(D.props.filter(p => !p.card).map(p => p.id));
  const st = { q: (q.get('q') ?? '').slice(0, 80), cls: D.classes.some(c => c.id === q.get('c')) ? q.get('c') : '', has: props.has(q.get('h')) ? q.get('h') : '',
    cols: [...D.defCols], units: {}, sort: null, cmp: [], m: ids.has(q.get('m')) ? q.get('m') : '', ch: '', lg: null };
  const cols = (q.get('cols') ?? '').split(',').filter(p => props.has(p));
  if (cols.length) st.cols = [...new Set(cols)];
  for (const s of (q.get('u') ?? '').split(',')) { const [p, u] = s.split('.'); if (propOf(D, p)?.us?.includes(u)) st.units[p] = u; }
  const s = q.get('sort') ?? '';
  const sp = s.replace(/^-/, '');
  if (sp === 'name' || props.has(sp)) st.sort = { p: sp, dir: s.startsWith('-') ? -1 : 1 };
  st.cmp = [...new Set((q.get('cmp') ?? '').split(',').filter(id => ids.has(id)))].slice(0, 4);
  const ch = q.get('ch');
  st.ch = props.has(ch) && !propOf(D, ch).text ? ch : '';
  if (q.has('lg')) st.lg = q.get('lg') === '1';
  return st;
}
export function writeState(D, st) {
  const q = new URLSearchParams();
  if (st.q) q.set('q', st.q);
  if (st.cls) q.set('c', st.cls);
  if (st.has) q.set('h', st.has);
  if (st.cols.join(',') !== D.defCols.join(',')) q.set('cols', st.cols.join(','));
  const us = Object.entries(st.units).filter(([p, u]) => u !== propOf(D, p).u).map(([p, u]) => `${p}.${u}`);
  if (us.length) q.set('u', us.join(','));
  if (st.sort) q.set('sort', `${st.sort.dir < 0 ? '-' : ''}${st.sort.p}`);
  if (st.cmp.length) q.set('cmp', st.cmp.join(','));
  if (st.m) q.set('m', st.m);
  if (st.ch) q.set('ch', st.ch);
  if (st.lg != null) q.set('lg', st.lg ? '1' : '0');
  return q.toString();
}

// ---- 画面 ----
const app = typeof document !== 'undefined' ? document.getElementById('md-app') : null;
const dataEl = typeof document !== 'undefined' ? document.getElementById('md-data') : null;
if (app && dataEl) init(JSON.parse(dataEl.textContent));

function init(D) {
  const T = D.t;
  const $ = s => app.querySelector(s);
  const byId = id => D.materials.find(m => m.id === id);
  const st = readState(D, location.search);
  const form = $('#md-find');
  const table = document.getElementById('md-table');
  const countEl = $('.md-count');
  const cardEl = document.getElementById('md-card');
  const cmpEl = document.getElementById('md-cmp');
  const chartEl = document.getElementById('md-chart');
  const live = $('.md-live');
  let rows = [];

  // 絞り込みの欄に URL の状態を入れる
  form.q.value = st.q;
  form.c.value = st.cls;
  form.h.value = st.has;
  const colBox = $('.md-cols');
  colBox.innerHTML = D.props.filter(p => !p.card).map(p => `<label><input type="checkbox" value="${p.id}"${st.cols.includes(p.id) ? ' checked' : ''}> ${esc(p.name)}</label>`).join('');
  const unitBox = $('.md-units');
  unitBox.innerHTML = D.props.filter(p => p.us?.length > 1).map(p => `<label>${esc(p.name)}<select data-unit="${p.id}">${p.us.map(u => `<option value="${u}"${(st.units[p.id] ?? p.u) === u ? ' selected' : ''}>${esc(unitLabel(D, u))}</option>`).join('')}</select></label>`).join('');
  for (const x of [app, cmpEl, chartEl, document.getElementById('export')]) x.hidden = false;
  document.querySelectorAll('.md-static-note').forEach(x => { x.hidden = true; });

  const sync = () => { try { history.replaceState(null, '', `${location.pathname}${writeState(D, st) ? `?${writeState(D, st)}` : ''}${location.hash}`); } catch {} };
  const say = s => { live.textContent = ''; setTimeout(() => { live.textContent = s; }, 30); };

  function renderTable() {
    rows = sortRows(D, filterRows(D, st), st);
    table.innerHTML = tableHTML(D, rows, st);
    countEl.textContent = fill(T.md_count, { n: rows.length, all: D.materials.length });
    $('.md-empty').hidden = rows.length > 0;
    for (const b of table.querySelectorAll('[data-cmp]')) b.disabled = !b.checked && st.cmp.length >= 4;
  }
  function render() { renderTable(); renderCmp(); renderChart(); sync(); }

  // ---- 材料のカード ----
  function toolLinks(m) {
    return m.tl.filter(l => D.tools[l.tool]).map(l => {
      const q = new URLSearchParams(Object.entries(l.q).map(([k, v]) => [k, String(v)])).toString();
      let label = D.tools[l.tool].n;
      if (l.g && m.vars?.[l.g]) label += `(${m.vars[l.g]})`;
      if (l.dsys) { const v = m.v.find(x => x.dsys === l.dsys); if (v) label += `(${condText(D, v).join(sepOf(D))})`; }
      return `<a class="btn btn-ghost btn-small" href="${esc(D.tools[l.tool].u)}?${esc(q)}" data-tool="${l.tool}">${esc(label)}</a>`;
    }).join(' ');
  }
  function renderCard() {
    const m = byId(st.m);
    cardEl.hidden = !m;
    if (!m) return;
    const groups = D.props.map(P => [P, valsOf(m, P.id)]).filter(([, vs]) => vs.length);
    const valCell = (P, v) => {
      if (P.text || (v.v == null && !v.r)) return `<td colspan="2" class="md-num md-txv">${esc(textOf(D, v) || '—')}</td>`;
      const u = st.units[P.id] ?? P.u, t = valText(D, v, u);
      const orig = u !== unitOf(D, v) ? `<small class="md-orig">${esc(fill(T.md_orig, { v: valText(D, v).main + (valText(D, v).rep ? ` (${valText(D, v).rep})` : ''), u: unitLabel(D, unitOf(D, v)) }))}</small>` : '';
      return `<td class="md-num"><span class="md-v">${esc(t.main)}</span>${t.rep ? `<span class="md-rep">${esc(fill(T.md_rep_short, { v: t.rep }))}</span>` : ''}${orig}</td><td class="md-u">${esc(unitLabel(D, u))}</td>`;
    };
    const terms = m.terms.map(k => D.terms[k]).filter(Boolean), learn = m.learn.map(k => D.learn[k]).filter(Boolean);
    const inCmp = st.cmp.includes(m.id);
    cardEl.innerHTML = `<h2 id="md-card-h" tabindex="-1">${esc(m.name)}</h2>
<p class="md-card-sub">${[m.sub, m.sym && m.sym !== m.name ? m.sym : null, m.z ? `Z = ${m.z}` : null, D.classes.find(c => c.id === m.cls)?.name].filter(Boolean).map(esc).join(' · ')}</p>
${m.codes.length ? `<p class="md-codes"><span class="muted">${esc(T.md_codes)}${colon(D)}</span>${m.codes.map(c => `<code>${esc(c)}</code>`).join(' ')}</p>` : ''}
${m.al.length ? `<p class="md-codes"><span class="muted">${esc(T.md_alias)}${colon(D)}</span>${m.al.map(esc).join(listSep(D))}</p>` : ''}
${m.note ? `<p>${esc(m.note)}</p>` : ''}${m.trn ? `<p class="muted">${esc(m.trn)}</p>` : ''}
<div class="table-wrap"><table class="md-vals"><caption class="visually-hidden">${esc(fill(T.md_card_cap, { m: m.name }))}</caption>
<thead><tr><th scope="col">${esc(T.md_th_value)}</th><th scope="col">${esc(T.md_th_unit)}</th><th scope="col">${esc(T.md_th_cond)}</th><th scope="col">${esc(T.md_th_src)}</th></tr></thead>
${groups.map(([P, vs]) => `<tbody><tr class="md-pg"><th scope="colgroup" colspan="4">${esc(P.name)}${P.sym ? ` <span class="md-sym">${symHTML(P.sym)}</span>` : ''}</th></tr>${vs.map(v => `<tr>${valCell(P, v)}<td class="md-c">${esc(noteOf(D, m, v, false).join(sepOf(D)) || '—')}</td><td class="md-s"><sup class="md-srcs">${srcMarks(D, v)}</sup> <small class="md-tools">${esc(toolNames(D, v))}</small></td></tr>`).join('')}</tbody>`).join('')}</table></div>
${m.tl.some(l => D.tools[l.tool]) ? `<h3>${esc(T.md_open_tool)}</h3><p class="md-tl">${toolLinks(m)}</p><p class="muted md-tl-note">${esc(T.md_open_tool_note)}</p>` : ''}
${terms.length ? `<p class="term-chips"><span class="muted">${esc(T.md_terms)}${colon(D)}</span>${terms.map(x => `<a class="chip" href="${esc(x.u)}">${esc(x.n)}</a>`).join(' ')}</p>` : ''}
${learn.length ? `<p class="md-learn"><span class="muted">${esc(T.md_learn)}${colon(D)}</span>${learn.map(x => `<a href="${esc(x.u)}">${esc(x.n)}</a>`).join(' / ')}</p>` : ''}
<div class="cmp-tools"><button type="button" class="btn btn-ghost" data-card-cmp="${m.id}"${!inCmp && st.cmp.length >= 4 ? ' disabled' : ''}>${esc(inCmp ? T.md_cmp_remove : T.md_cmp_add)}</button><button type="button" class="btn btn-ghost" data-card-link data-done="${esc(T.md_copied)}">${esc(T.md_card_link)}</button><button type="button" class="btn btn-ghost" data-card-close>${esc(T.md_close)}</button></div>`;
  }
  function openCard(id, focus = true) {
    st.m = id;
    renderCard();
    sync();
    if (focus) { cardEl.scrollIntoView({ block: 'start' }); cardEl.querySelector('#md-card-h')?.focus({ preventScroll: true }); }
  }

  // ---- 並べ比べ ----
  function renderCmp() {
    const mats = st.cmp.map(byId).filter(Boolean);
    const body = cmpEl.querySelector('.md-cmp-body');
    cmpEl.querySelector('[data-cmp-clear]').hidden = !mats.length;
    if (mats.length < 2) { body.innerHTML = `<p class="muted">${esc(mats.length ? fill(T.md_cmp_one, { m: mats[0].name }) : T.md_cmp_empty)}</p>`; return; }
    const cr = compareRows(D, mats, st.units);
    body.innerHTML = `<p class="muted">${esc(fill(T.md_cmp_lead2, { m: mats[0].name }))}</p><div class="table-wrap"><table class="md-cmp-table"><thead><tr>${mats.map((m, i) => `<th scope="col"><a href="?m=${m.id}#md-card" data-card="${m.id}">${esc(m.name)}</a>${i === 0 ? `<small>${esc(T.md_cmp_base)}</small>` : ''} <button type="button" class="md-x" data-cmp-del="${m.id}" aria-label="${esc(fill(T.md_cmp_del_a, { m: m.name }))}">×</button></th>`).join('')}</tr></thead>
${cr.map(r => {
      const P = propOf(D, r.p), ul = unitLabel(D, r.u);
      // 物性ごとに: 見出しの行(物性と単位)、値の行(材料ごとの値と比)、注意の行
      return `<tbody><tr class="md-pg"><th scope="colgroup" colspan="${mats.length}">${esc(P.name)}${ul ? ` <small>${esc(ul)}</small>` : ''}</th></tr><tr>${r.cells.map((c, i) => {
        if (!c) return '<td class="md-na">–</td>';
        const note = noteOf(D, mats[i], c.v);
        if (c.text != null) return `<td>${esc(c.text || '—')}<sup class="md-srcs">${srcMarks(D, c.v)}</sup>${note.length ? `<small class="md-note">${esc(note.join(sepOf(D)))}</small>` : ''}</td>`;
        return `<td><span class="md-v">${esc(c.t.main)}</span>${c.t.rep ? `<span class="md-rep">${esc(fill(T.md_rep_short, { v: c.t.rep }))}</span>` : ''}<sup class="md-srcs">${srcMarks(D, c.v)}</sup>${c.ratio != null ? `<span class="md-ratio" data-ratio="${c.ratio}">${esc(ratioText(c.ratio, D))}</span>` : ''}${note.length ? `<small class="md-note">${esc(note.join(sepOf(D)))}</small>` : ''}</td>`;
      }).join('')}</tr>${r.notes.length ? `<tr class="md-cmp-note"><td colspan="${mats.length}">${r.notes.map(n => `<span>${esc(n)}</span>`).join('')}</td></tr>` : ''}</tbody>`;
    }).join('')}</table></div>`;
  }
  function toggleCmp(id) {
    const i = st.cmp.indexOf(id);
    if (i >= 0) st.cmp.splice(i, 1);
    else if (st.cmp.length < 4) st.cmp.push(id);
    else { say(T.md_cmp_max); return; }
    renderTable(); renderCmp(); if (st.m) renderCard(); sync();
    say(fill(T.md_cmp_n, { n: st.cmp.length }));
  }

  // ---- 図: 選んだ物性の横棒(範囲は線、代表値・1つの値は点) ----
  const chartSel = chartEl.querySelector('select[name="ch"]');
  const logBox = chartEl.querySelector('input[name="lg"]');
  chartSel.innerHTML = D.props.filter(p => !p.text).map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('');
  // 図の文字の幅を測る(見えない SVG の text。図と同じクラスなので同じ字の大きさ)。測れないときは字数から見積もる
  const NS = 'http://www.w3.org/2000/svg';
  let meas = null;
  const textW = (cls, s) => {
    if (!s) return 0;
    if (!meas?.isConnected) {
      const svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('width', '0'); svg.setAttribute('height', '0'); svg.setAttribute('aria-hidden', 'true');
      Object.assign(svg.style, { position: 'absolute', visibility: 'hidden', overflow: 'hidden' });
      meas = document.createElementNS(NS, 'text'); svg.append(meas); chartEl.append(svg);
    }
    meas.setAttribute('class', cls); meas.textContent = s;
    let w = 0; try { w = meas.getComputedTextLength(); } catch {}
    return w > 0 ? w : [...s].length * (/[\u2E80-\u9FFF\uAC00-\uD7AF\uFF00-\uFFEF]/.test(s) ? 11 : 6.5);
  };
  // 幅 max に収まるよう末尾を「…」で切る(head が true なら「…」を付けずに頭だけ返す)
  const fitEnd = (cls, s, max, head = false) => {
    if (textW(cls, s) <= max) return s;
    const cs = [...s];
    let lo = 0, hi = cs.length;
    const f = k => cs.slice(0, k).join('').trimEnd() + (head ? '' : '…');
    while (lo < hi) { const k = Math.ceil((lo + hi) / 2); if (textW(cls, f(k)) <= max) lo = k; else hi = k - 1; }
    return lo ? f(lo) : head ? '' : '…';
  };
  // 先頭を「…」にして末尾を残す
  const fitStart = (cls, s, max) => {
    if (textW(cls, s) <= max) return s;
    const cs = [...s];
    let lo = 0, hi = cs.length;
    const f = k => `…${cs.slice(cs.length - k).join('').trimStart()}`;
    while (lo < hi) { const k = Math.ceil((lo + hi) / 2); if (textW(cls, f(k)) <= max) lo = k; else hi = k - 1; }
    return f(lo);
  };
  // 材料名を幅に合わせて切る。切った形が同じになる名前どうし(「Nichtrostender Stahl 304 …」と「… 316 …」など)は、
  // 違いの始まる語を残して「頭… 違う所」にする
  function fitNames(names, max) {
    const cls = 'md-lab', out = names.map(n => fitEnd(cls, n, max));
    for (const l of new Set(out.filter((l, i) => l !== names[i]))) {
      const same = out.map((x, i) => (x === l ? i : -1)).filter(i => i >= 0);
      if (new Set(same.map(i => names[i])).size < 2) continue;
      const toks = same.map(i => names[i].split(/(?<=\s)/));
      let k = 0;
      while (toks.every(t => k < t.length - 1 && t[k] === toks[0][k])) k++;
      for (const [j, i] of same.entries()) {
        const rest = toks[j].slice(k).join(''), restW = Math.min(textW(cls, rest), max * 0.75);
        const head = k ? fitEnd(cls, toks[j].slice(0, k).join('').trimEnd(), max - restW - textW(cls, '… '), true) : '';
        out[i] = head ? `${head}… ${fitEnd(cls, rest, max - textW(cls, `${head}… `))}` : fitEnd(cls, rest, max);
      }
    }
    // それでも同じ形が残るとき(違いが名前の終わりにあるなど)は、末尾を残す
    const seen = new Map();
    out.forEach((l, i) => seen.set(l, [...(seen.get(l) ?? []), i]));
    for (const is of seen.values()) if (is.length > 1 && new Set(is.map(i => names[i])).size > 1) for (const i of is) out[i] = fitStart(cls, names[i], max);
    return out;
  }
  // 見出しを幅 max で行に分ける(空白で。漢字・かなは1字ずつ。閉じ括弧・句読点は前の字につける)
  const CJK = '\u2E80-\u9FFF\uF900-\uFAFF\u3040-\u30FF';
  const TOK = new RegExp(`[(（「]?[${CJK}][)）」、。，：・]*|[^\\s${CJK}]+|\\s+`, 'g');
  function wrap(cls, s, max) {
    const lines = []; let cur = '';
    for (const t of s.match(TOK) ?? []) {
      if (/^\s+$/.test(t)) { cur += t; continue; }
      if (cur.trim() && textW(cls, (cur + t).trimEnd()) > max) { lines.push(cur.trimEnd()); cur = t; } else cur += t;
    }
    if (cur.trim()) lines.push(cur.trimEnd());
    return lines.map(l => fitEnd(cls, l, max));
  }
  function renderChart() {
    const p = st.ch || st.has || st.cols.find(c => !propOf(D, c).text) || 'E';
    chartSel.value = p;
    const P = propOf(D, p), u = st.units[p] ?? P.u;
    const items = rows.map(m => [m, valsOf(m, p).find(v => v.v != null || v.r)]).filter(([, v]) => v).map(([m, v]) => {
      const t = valText(D, v, u);
      const lo = v.r ? t.lo : t.n, hi = v.r ? t.hi : t.n, c = t.n ?? (v.r ? Math.sqrt(lo * hi) : t.n);
      return { m, v, t, lo, hi, c };
    }).sort((a, b) => b.c - a.c);
    const N = 40, shown = items.slice(0, N);
    const box = chartEl.querySelector('.md-chart-box');
    const cap = chartEl.querySelector('.md-chart-cap');
    if (!shown.length) { box.innerHTML = ''; cap.textContent = T.md_chart_none; return; }
    const pos = shown.every(x => x.lo > 0);
    const lmin = Math.min(...shown.map(x => x.lo)), lmax = Math.max(...shown.map(x => x.hi));
    const useLog = pos && (st.lg ?? lmax / lmin > 50);
    logBox.checked = useLog; logBox.disabled = !pos;
    const W = Math.max(240, Math.min(box.clientWidth || 640, 900)), lw = Math.min(170, Math.round(W * 0.36)), pr = 56, rh = 22;
    const x0 = lw + 8, x1 = W - pr;
    // 軸の見出し: 名前と単位(ja・zh は全角の括弧、ほかは空白と半角の括弧)。収まらなければ左端から、行に分けて
    const ul = unitLabel(D, u);
    const axis = `${P.name}${ul ? (/^(ja|zh)/.test(D.lang) ? `（${ul}）` : ` (${ul})`) : ''}`;
    const logw = useLog ? `— ${T.md_chart_logw}` : '';
    const full = logw ? `${axis} ${logw}` : axis;
    let ax = x0, lines = [full];
    if (textW('md-axis', full) > W - x0 - 2) {
      ax = 2;
      const mw = W - 4;
      if (textW('md-axis', full) <= mw) lines = [full];
      else {
        lines = wrap('md-axis', axis, mw);
        if (logw) { const last = `${lines[lines.length - 1]} ${logw}`; if (textW('md-axis', last) <= mw) lines[lines.length - 1] = last; else lines.push(fitEnd('md-axis', logw, mw)); }
      }
    }
    const lh = 13, top = 42 + (lines.length - 1) * lh, H = top + shown.length * rh + 8;
    let sx, ticks;
    if (useLog) {
      const a = Math.floor(Math.log10(lmin)), b = Math.ceil(Math.log10(lmax)) + (Math.log10(lmax) % 1 === 0 ? 0 : 0);
      const B = b === a ? a + 1 : b;
      sx = x => x0 + (Math.log10(x) - a) / (B - a) * (x1 - x0);
      ticks = []; for (let e = a; e <= B; e++) ticks.push(10 ** e);
    } else {
      const lo = Math.min(0, lmin), hi = lmax <= lo ? lo + 1 : lmax;
      const step = niceStep((hi - lo) / 5);
      const a = Math.floor(lo / step) * step, b = Math.ceil(hi / step) * step;
      sx = x => x0 + (x - a) / (b - a) * (x1 - x0);
      ticks = []; for (let x = a; x <= b + step / 2; x += step) ticks.push(Number(x.toPrecision(10)));
    }
    const tickLabel = x => numText(D, useLog ? show(x, 1) : show(x, null));
    const g = ticks.map(x => `<line x1="${sx(x).toFixed(1)}" x2="${sx(x).toFixed(1)}" y1="${top - 4}" y2="${H - 6}" class="md-grid"/><text x="${sx(x).toFixed(1)}" y="${top - 8}" class="md-tick">${esc(tickLabel(x))}</text>`).join('');
    const names = fitNames(shown.map(d => d.m.name), lw - 4);
    const bars = shown.map((d, i) => {
      const y = top + i * rh + rh / 2;
      const name = names[i];
      const note = noteOf(D, d.m, d.v).join(sepOf(D));
      const tip = `${d.m.name}${colon(D)}${d.t.main}${d.t.rep ? ` (${fill(T.md_rep_short, { v: d.t.rep })})` : ''} ${ul}${note ? ` — ${note}` : ''}`;
      const xl = sx(d.lo), xh = sx(d.hi), xc = sx(d.c);
      const label = d.t.rep ?? d.t.main;
      // 値の文字: ふつうは点(範囲の右端)の右。図の右端を越えるなら範囲の左に、そこも狭ければ右端に寄せる
      const vw = textW('md-val', label);
      let vx = Math.max(xh, xc) + 8, va = '';
      if (vx + vw > W - 2) { const l = Math.min(xl, xc) - 8; if (l - vw >= x0) { vx = l; va = ' text-anchor="end"'; } else vx = W - 2 - vw; }
      return `<g class="md-bar" data-card="${d.m.id}" tabindex="0" role="link" aria-label="${esc(tip)}"><title>${esc(tip)}</title><rect x="0" y="${y - rh / 2}" width="${W}" height="${rh}" class="md-hit"/>
<text x="${lw}" y="${y + 4}" class="md-lab">${esc(name)}</text>${d.v.r ? `<line x1="${xl.toFixed(1)}" x2="${Math.max(xh, xl + 1).toFixed(1)}" y1="${y}" y2="${y}" class="md-rng"/>` : ''}<circle cx="${xc.toFixed(1)}" cy="${y}" r="4" class="md-dot"/><text x="${vx.toFixed(1)}" y="${y + 4}" class="md-val"${va}>${esc(label)}</text></g>`;
    }).join('');
    box.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(fill(T.md_chart_aria, { p: axis, n: shown.length }))}"><text x="${ax}" y="14" class="md-axis">${lines.map((l, i) => `<tspan x="${ax}"${i ? ` dy="${lh}"` : ''}>${esc(l)}</tspan>`).join('')}</text>${g}${bars}</svg>`;
    cap.textContent = fill(items.length > N ? T.md_chart_cap_n : T.md_chart_cap, { n: shown.length, all: items.length });
  }
  const niceStep = r => { const e = 10 ** Math.floor(Math.log10(r)), f = r / e; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10) * e; };

  // ---- 持ち出し ----
  async function copyText(text, btn) {
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch {
      const ta = document.createElement('textarea'); ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.append(ta); ta.select(); try { ok = document.execCommand('copy'); } catch {} ta.remove();
    }
    if (btn) { const o = btn.dataset.label ?? btn.textContent; btn.dataset.label = o; btn.textContent = ok ? T.md_copied : T.md_copy_fail; setTimeout(() => { btn.textContent = o; }, 1800); }
    say(ok ? T.md_copied : T.md_copy_fail);
  }
  const csvOf = () => csvText(document.querySelector('input[name="csv"]:checked')?.value === 'long' ? csvLong(D, rows, st) : csvWide(D, rows, st));
  // 押したもの(表・カード・並べ比べ・図は app の外にもあるので document で受ける)
  document.addEventListener('click', e => {
    const b = e.target.closest('button, a, .md-bar');
    if (!b || !b.closest('#md-app, #md-table, #md-card, #md-cmp, #md-chart, #export')) return;
    if (b.matches('[data-csv-copy]')) copyText(csvOf(), b);
    else if (b.matches('[data-csv-save]')) {
      const long = document.querySelector('input[name="csv"]:checked')?.value === 'long';
      const blob = new Blob(['\ufeff', csvOf()], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = long ? 'materials-all-values.csv' : 'materials-table.csv';
      document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    } else if (b.matches('[data-share]')) { sync(); copyText(location.href, b); }
    else if (b.matches('[data-reset]')) {
      Object.assign(st, { q: '', cls: '', has: '', cols: [...D.defCols], units: {}, sort: null, ch: '', lg: null });
      form.reset(); colBox.querySelectorAll('input').forEach(x => { x.checked = st.cols.includes(x.value); });
      unitBox.querySelectorAll('select').forEach(x => { x.value = propOf(D, x.dataset.unit).u; });
      render(); if (st.m) renderCard();
    } else if (b.matches('[data-sort]')) {
      const p = b.dataset.sort;
      const first = p === 'name' ? 1 : -1; // 押すたびに: 数は大きい順 → 小さい順 → 並べ替えなし(名前は五十音・ABC 順から)
      st.sort = st.sort?.p !== p ? { p, dir: first } : st.sort.dir === first ? { p, dir: -first } : null;
      renderTable(); renderChart(); sync();
      table.querySelector(`[data-sort="${p}"]`)?.focus();
    } else if (b.matches('[data-card-cmp]')) toggleCmp(b.dataset.cardCmp);
    else if (b.matches('[data-card-link]')) { const u = new URL(location.href); u.search = `?m=${st.m}`; u.hash = 'md-card'; copyText(u.href, b); }
    else if (b.matches('[data-card-close]')) { const id = st.m; st.m = ''; renderCard(); sync(); table.querySelector(`[data-card="${id}"]`)?.focus(); }
    else if (b.matches('[data-cmp-clear]')) { st.cmp = []; renderTable(); renderCmp(); if (st.m) renderCard(); sync(); }
    else if (b.matches('[data-cmp-del]')) toggleCmp(b.dataset.cmpDel);
    else if (b.matches('[data-card]')) { e.preventDefault(); openCard(b.dataset.card); }
  });
  chartEl.addEventListener('keydown', e => { const g = e.target.closest('.md-bar'); if (g && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openCard(g.dataset.card); } });
  table.addEventListener('change', e => { if (e.target.matches('[data-cmp]')) toggleCmp(e.target.dataset.cmp); });
  let qt;
  form.q.addEventListener('input', () => { clearTimeout(qt); qt = setTimeout(() => { st.q = form.q.value.trim(); renderTable(); renderChart(); sync(); }, 120); });
  form.addEventListener('submit', e => { e.preventDefault(); st.q = form.q.value.trim(); renderTable(); renderChart(); sync(); });
  form.c.addEventListener('change', () => { st.cls = form.c.value; renderTable(); renderChart(); sync(); });
  form.h.addEventListener('change', () => { st.has = form.h.value; if (st.has && !st.cols.includes(st.has)) { st.cols.push(st.has); colBox.querySelector(`input[value="${st.has}"]`).checked = true; } renderTable(); renderChart(); sync(); });
  colBox.addEventListener('change', () => {
    const on = [...colBox.querySelectorAll('input:checked')].map(x => x.value);
    st.cols = [...st.cols.filter(p => on.includes(p)), ...on.filter(p => !st.cols.includes(p))];
    renderTable(); renderChart(); sync();
  });
  unitBox.addEventListener('change', e => {
    const s = e.target.closest('[data-unit]'); if (!s) return;
    st.units[s.dataset.unit] = s.value;
    if (s.value === propOf(D, s.dataset.unit).u) delete st.units[s.dataset.unit];
    render(); if (st.m) renderCard();
  });
  chartSel.addEventListener('change', () => { st.ch = chartSel.value; st.lg = null; renderChart(); sync(); });
  logBox.addEventListener('change', () => { st.lg = logBox.checked; renderChart(); sync(); });
  let rw = 0;
  addEventListener('resize', () => { cancelAnimationFrame(rw); rw = requestAnimationFrame(renderChart); });

  render();
  if (st.m) { renderCard(); if (location.hash === '#md-card') requestAnimationFrame(() => cardEl.scrollIntoView({ block: 'start' })); }
}
