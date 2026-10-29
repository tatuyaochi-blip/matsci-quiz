// 計算ドリル(/drill/)。数値が毎回変わる計算問題を出し、答えの数値(単位つき)を判定して、途中式とよくある間違いを示す。
// 問題の型の文章・数値の範囲・許容差は data/drill.json(build.js がページに埋め込む)、計算はこのファイルの TYPES。
// 物性値はサイトの計算ツールのデータ集をそのまま使う: 格子定数・密度は周期表ツール(ptable.js)、状態図は2元系状態図ラボ(lever.js)、
// 鉄–炭素の点は状態図ビューア(fe-c.js)、材料の性質の範囲は材料選びチャート(ashby.js)、拡散の D0・Q と誤差関数は拡散シミュレーター(diffusion.js)。
// 原子量・X線の波長・定数・導体の値は data/drill.json。
// 問題は (型, 種) で決まる(同じ種なら同じ数値)。種は URL の ?t=型&s=種 に残し、答えは URL に入れない。
// 問題文の数値は表示する桁に丸めてから答えを計算する(表示した数値で解けば、丸めの差で不正解にならない)。
// 検算: review の scripts/check_drill.py(python で式を別に書き、多くの種で突き合わせる)
import { EL } from './ptable.js';
import { SYS, MW, randomPoint, toAt, toWt } from './lever.js';
import { P as FE_P, S as FE_S, CM as FE_CM } from './fe-c.js';
import { MATS, range } from './ashby.js';
import { erf, ierf, ierfc, sysById, acmAt } from './diffusion.js';
import { matById as xrdMat } from './xrd.js';

// ---- 数の書き方(言語の小数点。桁区切りは使わない) ----
let LANG = typeof document !== 'undefined' ? document.documentElement.lang || 'en' : 'en';
// 見出しのあとのコロンと、箇条書きの印(中国語は全角のコロン、日本語だけ中点)
const colon = () => (/^zh/.test(LANG) ? '：' : ': ');
const bullet = () => (/^ja/.test(LANG) ? '・' : '• ');
export const setLang = l => { LANG = l; };
const nf = o => new Intl.NumberFormat(LANG, { useGrouping: false, ...o });
const minus = t => (/^-0(?:[.,]0*)?$/.test(t) ? t.slice(1) : t.replace(/^-/, '−'));
const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
// 小数 d 桁
export const fd = (x, d) => minus(nf({ minimumFractionDigits: d, maximumFractionDigits: d }).format(x));
// 指数表記(有効数字 s 桁): 2.30 × 10⁻⁵
export const fsci = (x, s = 3) => {
  if (!Number.isFinite(x)) return '–';
  if (x === 0) return '0';
  const [m, e] = x.toExponential(s - 1).split('e');
  const mm = minus(nf({ minimumFractionDigits: s - 1, maximumFractionDigits: s - 1 }).format(Number(m)));
  return Number(e) === 0 ? mm : `${mm} × 10${String(Number(e)).replace(/./g, c => SUP[c])}`;
};
// 有効数字 s 桁(とても大きい・小さい値は指数表記)
export const fs = (x, s = 4) => {
  if (!Number.isFinite(x)) return '–';
  if (x === 0) return '0';
  const a = Math.abs(x);
  if (a >= 1e5 || a < 1e-3) return fsci(x, s);
  return minus(nf({ minimumSignificantDigits: s, maximumSignificantDigits: s }).format(x));
};
const f4 = x => fs(x, 4);
const dpOf = s => { const t = String(s); return t.includes('e-') ? Number(t.split('e-')[1]) : (t.split('.')[1]?.length ?? 0); };
const rnd = (x, d) => Number(x.toFixed(d));
const sig = (x, s) => Number(x.toPrecision(s));
// 文献の値をその桁のまま(小数1桁以上。100 以上の整数はそのまま)
const fv = x => (Number.isInteger(x) && x >= 100 ? String(x) : fd(x, Math.max(1, dpOf(x))));
// 問題文の数(整数はそのまま、小数は持っている桁で。言語の小数点と − を使う)
const fn = x => (Number.isInteger(x) ? minus(String(x)) : fd(x, dpOf(x)));
// 許容差の % の表示(0.01 → 1、0.005 → 0.5)
export const tolPct = tol => fs(tol * 100, 2).replace(/0+$/, '').replace(/[.,]$/, '');

// ---- 種つきの乱数(mulberry32)。型の名前も混ぜて、型ごとに別の列にする ----
export function makeRng(seed, id) {
  let h = (2166136261 ^ (seed >>> 0)) >>> 0;
  for (const ch of id) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  let a = h;
  const next = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const r = {
    f: next,
    int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
    pick: arr => arr[Math.floor(next() * arr.length)],
    // lo〜hi を s 刻みで(表示の桁にそろえた値)
    step: (lo, hi, s) => { const n = Math.round((hi - lo) / s); return rnd(lo + Math.floor(next() * (n + 1)) * s, dpOf(s)); },
    // lo〜hi(log なら対数で一様)を有効数字 n 桁で
    sig: (lo, hi, n, log) => sig(log ? Math.exp(Math.log(lo) + next() * (Math.log(hi) - Math.log(lo))) : lo + next() * (hi - lo), n),
  };
  // data/drill.json の範囲 v: [下限, 上限, 刻み] か { sig: 有効数字, lin|log: [下限, 上限] }
  r.v = spec => (Array.isArray(spec) ? r.step(...spec) : r.sig(...(spec.log ?? spec.lin), spec.sig, !!spec.log));
  return r;
}
// 範囲の書き方で表示する
export const showSpec = (x, spec) => (Array.isArray(spec) ? fd(x, dpOf(spec[2])) : fs(x, spec.sig));

// ---- 単位(家族ごとに、基準の単位に対する倍率。温度は [倍率, ずれ]) ----
export const UNITS = {
  len: { m: 1, cm: 1e-2, mm: 1e-3, 'µm': 1e-6, nm: 1e-9, 'Å': 1e-10, pm: 1e-12 },
  ang: { '°': 1, rad: 180 / Math.PI },
  dens: { 'g/cm³': 1, 'kg/m³': 1e-3 },
  stress: { MPa: 1, GPa: 1e3, kPa: 1e-3, Pa: 1e-6 },
  diff: { 'm²/s': 1, 'cm²/s': 1e-4, 'mm²/s': 1e-6 },
  time: { h: 1, min: 1 / 60, s: 1 / 3600, d: 24 },
  flux: { 'kg/(m²·s)': 1, 'g/(m²·s)': 1e-3 },
  vol: { 'm⁻³': 1, 'cm⁻³': 1e6 },
  area: { 'nm⁻²': 1, 'Å⁻²': 100, 'm⁻²': 1e-18, 'cm⁻²': 1e-14 },
  frac: { '': 1, '%': 0.01 },
  pct: { '%': 1 },
  num: { '': 1 },
  ohm: { 'Ω': 1, 'mΩ': 1e-3, 'kΩ': 1e3 },
  rho: { 'Ω·m': 1, 'Ω·cm': 1e-2, 'mΩ·cm': 1e-5, 'µΩ·cm': 1e-8 },
  cond: { 'S/m': 1, 'S/cm': 100 },
  mass: { g: 1, mg: 1e-3, kg: 1e3 },
  rate: { 'µm/y': 1, 'mm/y': 1e3 },
  heat: { 'W/m²': 1, 'kW/m²': 1e3 },
  temp: { '°C': [1, 0], K: [1, -273.15] },
};
// 単位の書き方の揺れ(入力欄に単位まで書いたとき)。小文字にし、空白・中点・^ を除いてから引く
const nUnit = s => s.normalize('NFKC').replace(/[\s·⋅*.^]/g, '').replace(/[−–]/g, '-').replace(/[µμ]/g, 'u').replace(/Ω/g, 'ohm').replace(/[Å]/g, 'A').toLowerCase();
const ALIAS = {
  len: { um: 'µm', 'μm': 'µm', a: 'Å', ang: 'Å', angstrom: 'Å' },
  ang: { deg: '°', '度': '°', '도': '°', '°': '°', degree: '°', degrees: '°', grad: '°' },
  dens: { 'g/cm3': 'g/cm³', 'g/cc': 'g/cm³', 'kg/m3': 'kg/m³' },
  diff: { 'm2/s': 'm²/s', 'cm2/s': 'cm²/s', 'mm2/s': 'mm²/s' },
  time: { hr: 'h', hrs: 'h', hour: 'h', hours: 'h', '時間': 'h', '小時': 'h', '시간': 'h', std: 'h', stunde: 'h', stunden: 'h', sec: 's', '秒': 's', '초': 's', sekunde: 's', sekunden: 's', '分': 'min', '分鐘': 'min', '분': 'min', minute: 'min', minuten: 'min', day: 'd', days: 'd', '日': 'd', '天': 'd', '일': 'd', tag: 'd', tage: 'd' },
  flux: { 'kg/(m2s)': 'kg/(m²·s)', 'kg/m2s': 'kg/(m²·s)', 'kg/m2/s': 'kg/(m²·s)', 'kgm-2s-1': 'kg/(m²·s)', 'g/(m2s)': 'g/(m²·s)', 'g/m2s': 'g/(m²·s)' },
  vol: { 'm-3': 'm⁻³', '/m3': 'm⁻³', '1/m3': 'm⁻³', 'cm-3': 'cm⁻³', '/cm3': 'cm⁻³', '1/cm3': 'cm⁻³' },
  area: { 'nm-2': 'nm⁻²', '/nm2': 'nm⁻²', '1/nm2': 'nm⁻²', 'atoms/nm2': 'nm⁻²', '個/nm2': 'nm⁻²', '개/nm2': 'nm⁻²', 'm-2': 'm⁻²', '/m2': 'm⁻²', 'atoms/m2': 'm⁻²', 'cm-2': 'cm⁻²', '/cm2': 'cm⁻²', 'a-2': 'Å⁻²', '/a2': 'Å⁻²' },
  ohm: { ohm: 'Ω', mohm: 'mΩ', kohm: 'kΩ' },
  rho: { ohmm: 'Ω·m', ohmcm: 'Ω·cm', mohmcm: 'mΩ·cm', uohmcm: 'µΩ·cm' },
  rate: { 'um/y': 'µm/y', 'um/yr': 'µm/y', 'um/year': 'µm/y', 'um/年': 'µm/y', 'um/년': 'µm/y', 'um/a': 'µm/y', 'um/jahr': 'µm/y', 'mm/yr': 'mm/y', 'mm/year': 'mm/y', 'mm/年': 'mm/y', 'mm/년': 'mm/y', 'mm/a': 'mm/y', 'mm/jahr': 'mm/y' },
  heat: { 'w/m2': 'W/m²', 'kw/m2': 'kW/m²' },
  temp: { c: '°C', degc: '°C', '°c': '°C', '度': '°C', '도': '°C', grad: '°C', kelvin: 'K' },
};
export function unitOf(fam, s) {
  const k = nUnit(s);
  if (!k) return null;
  for (const u of Object.keys(UNITS[fam])) if (nUnit(u) === k) return u;
  return ALIAS[fam]?.[k] ?? null;
}
// 値 x(単位 u)を、単位 to での値に
export function convert(fam, x, u, to) {
  const F = UNITS[fam];
  if (fam === 'temp') return (x * F[u][0] + F[u][1] - F[to][1]) / F[to][0];
  return x * F[u] / F[to];
}

// ---- 入力の読み取り: 「2.3e-5」「2,3 × 10^-5」「2.3×10⁻⁵ m²/s」など。単位が書いてあればその単位も返す ----
export function parseAnswer(raw, fam, lang = LANG) {
  let s = String(raw ?? '').normalize('NFKC').trim().replace(/[−–—]/g, '-').replace(/\s+/g, ' ');
  if (!s) return null;
  const m = s.match(/^([+-]?(?:\d[\d.,]*|[.,]\d+))\s*(?:[eE]\s*([+-]?\d+)|[×xX*]\s*10\s*(?:\^|\*\*)?\s*\(?\s*([+-]?\d+)\s*\)?)?\s*(.*)$/);
  if (!m) return null;
  let t = m[1];
  if (/^de/.test(lang)) t = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t;
  else if (/^[+-]?\d{1,3}(,\d{3})+(\.\d+)?$/.test(t)) t = t.replace(/,/g, '');
  else t = t.replace(',', '.');
  if ((t.match(/\./g) ?? []).length > 1) return null;
  const v = Number(t) * 10 ** Number(m[2] ?? m[3] ?? 0);
  if (!Number.isFinite(v)) return null;
  const rest = m[4].trim();
  if (!rest) return { v, u: null };
  const u = unitOf(fam, rest);
  return u == null ? { v, u: null, bad: rest } : { v, u };
}

// ---- 誤差関数は拡散シミュレーターのもの(級数と連分数で相対誤差 1e-13 程度)。逆関数 ierf・ierfc も同じ ----
export { erf, ierf };

// ---- データ ----
const ELS = Object.fromEntries(EL.map(e => [e.s, e]));
const mat = id => MATS.find(m => m[0] === id);
// 材料選びチャートの範囲 [最小, 最大] から、刻み s の値を選ぶ
const fromRange = (r, id, prop, s) => {
  const [lo, hi] = range(mat(id), prop), d = dpOf(s), a = rnd(Math.ceil(lo / s - 1e-9) * s, d), b = rnd(Math.floor(hi / s + 1e-9) * s, d);
  return a > b ? b : r.step(a, b, s);
};
const CUBIC_N = { bcc: [2, 4, 6, 8, 10, 12, 14, 16], fcc: [3, 4, 8, 11, 12, 16, 19, 20] };
const HKL = { 1: [1, 0, 0], 2: [1, 1, 0], 3: [1, 1, 1], 4: [2, 0, 0], 5: [2, 1, 0], 6: [2, 1, 1], 8: [2, 2, 0], 9: [3, 0, 0], 10: [3, 1, 0], 11: [3, 1, 1], 12: [2, 2, 2], 13: [3, 2, 0], 14: [3, 2, 1], 16: [4, 0, 0], 19: [3, 3, 1], 20: [4, 2, 0] };
const hklStr = (v, b = '()') => `${b[0]}${v.some(x => Math.abs(x) > 9) ? v.join(' ') : v.map(x => (x < 0 ? `−${-x}` : x)).join(v.some(x => x < 0) ? ' ' : '')}${b[1]}`;
const struct = s => ({ bcc: 'BCC', fcc: 'FCC', sc: 'SC' }[s] ?? s);
const TK = c => c + 273.15;
const LN10 = Math.LN10;
// XRD 解析ワークベンチを同じ物質・同じ波長で開く。ツールは URL の mat だけでは構造・格子定数・波長を入れ直さないので、
// 蔵書(xrd.js の MATS)の値と問題の λ をそのまま渡す
const xrdQ = v => { const m = xrdMat(v.mat); return { mode: 'sim', src: `${v.src}ka1`, lambda: v.lam, mat: v.mat, type: m?.type ?? v.st, a: m?.a ?? v.a ?? v.a0, ea: m?.ea ?? v.mat, bdw: m?.B ?? 0 }; };

// ---- 問題の型 ----
// gen(r, T, X): 問題の数値(vals)。T は data/drill.json の型(v: 範囲、pick: 選ぶもの)、X は { D: データ、N: 名前 }
// show(vals, T, X): 問題文に入れる文字(自動で、範囲 v のある値は範囲の桁で入る)
// solve(vals, X): { ans, fam, unit, k: 途中式の文字, alt: { 間違いのID: そのときの値(unit で) }, tool: { id, q } }
// vals.v があれば、文章(q・steps)の場合分けの鍵になる
export const TYPES = {
  // ===== 結晶 =====
  'd-spacing': {
    gen: (r, T) => { const mat = r.pick(T.pick.mat), e = ELS[mat]; const N = r.pick([2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 14]); const [h, k, l] = HKL[N]; return { mat, st: e.c, a: e.a, h, k, l }; },
    show: (v, T, X) => ({ mat: X.N.el[v.mat], st: struct(v.st), a: fd(v.a, dpOf(v.a)), hkl: hklStr([v.h, v.k, v.l]) }),
    solve: v => {
      const N = v.h ** 2 + v.k ** 2 + v.l ** 2, d = v.a / Math.sqrt(N);
      return { ans: d, fam: 'len', unit: 'nm', k: { N, sq: f4(Math.sqrt(N)), d: f4(d) },
        alt: { sum: v.a / (v.h + v.k + v.l), nosqrt: v.a / N, times: v.a * Math.sqrt(N) },
        tool: { id: 'xtal', q: { type: v.st, a: v.a, show: 'plane', h: v.h, k: v.k, l: v.l } } };
    },
  },
  'bragg-angle': {
    gen: (r, T, X) => {
      const mat = r.pick(T.pick.mat), e = ELS[mat], src = r.pick(T.pick.src), lam = X.D.lambda[src];
      const ok = CUBIC_N[e.c].filter(N => lam * Math.sqrt(N) / (2 * e.a) < 0.95);
      const [h, k, l] = HKL[r.pick(ok)];
      return { mat, st: e.c, a: e.a, src, lam, h, k, l };
    },
    show: (v, T, X) => ({ mat: X.N.el[v.mat], st: struct(v.st), a: fd(v.a, dpOf(v.a)), src: X.N.x[`src_${v.src}`], lam: fd(v.lam, dpOf(v.lam)), hkl: hklStr([v.h, v.k, v.l]) }),
    solve: v => {
      const N = v.h ** 2 + v.k ** 2 + v.l ** 2, d = v.a / Math.sqrt(N), s = v.lam / (2 * d), th = Math.asin(s) / (Math.PI / 180);
      const sum = v.lam * (v.h + v.k + v.l) / (2 * v.a);
      return { ans: 2 * th, fam: 'ang', unit: '°', k: { N, d: f4(d), s: f4(s), th: f4(th), tt: f4(2 * th) },
        alt: { theta: th, ...(sum < 1 ? { sum: 2 * Math.asin(sum) / (Math.PI / 180) } : {}), ...(2 * s < 1 ? { no2: 2 * Math.asin(2 * s) / (Math.PI / 180) } : {}) },
        tool: { id: 'xrd', q: xrdQ(v) } };
    },
  },
  'lattice-from-peak': {
    gen: (r, T, X) => {
      const mat = r.pick(T.pick.mat), e = ELS[mat], src = r.pick(T.pick.src), lam = X.D.lambda[src];
      const ok = CUBIC_N[e.c].filter(N => lam * Math.sqrt(N) / (2 * e.a) < 0.95);
      const N = r.pick(ok), [h, k, l] = HKL[N];
      const tt = rnd(2 * Math.asin(lam * Math.sqrt(N) / (2 * e.a)) / (Math.PI / 180), 2);
      return { mat, st: e.c, src, lam, h, k, l, tt, a0: e.a };
    },
    show: (v, T, X) => ({ mat: X.N.el[v.mat], st: struct(v.st), src: X.N.x[`src_${v.src}`], lam: fd(v.lam, dpOf(v.lam)), hkl: hklStr([v.h, v.k, v.l]), tt: fd(v.tt, 2) }),
    solve: v => {
      const N = v.h ** 2 + v.k ** 2 + v.l ** 2, th = v.tt / 2 * Math.PI / 180, d = v.lam / (2 * Math.sin(th)), a = d * Math.sqrt(N);
      return { ans: a, fam: 'len', unit: 'nm', k: { th: f4(v.tt / 2), d: f4(d), N, sq: f4(Math.sqrt(N)), a: f4(a), a0: fd(v.a0, dpOf(v.a0)) },
        alt: { twotheta: v.lam / (2 * Math.sin(2 * th)) * Math.sqrt(N), donly: d },
        tool: { id: 'xrd', q: xrdQ(v) } };
    },
  },
  density: {
    gen: (r, T) => { const mat = r.pick(T.pick.mat), e = ELS[mat]; return { mat, st: e.c, a: e.a, d: e.d }; },
    show: (v, T, X) => ({ mat: X.N.el[v.mat], st: struct(v.st), a: fd(v.a, dpOf(v.a)), M: fv(X.D.aw[v.mat]), NA: fsci(X.D.c.NA, 4) }),
    solve: (v, X) => {
      const n = v.st === 'bcc' ? 2 : 4, M = X.D.aw[v.mat], NA = X.D.c.NA, V = (v.a * 1e-7) ** 3, rho = n * M / (NA * V);
      return { ans: rho, fam: 'dens', unit: 'g/cm³', k: { n, V: fsci(V, 4), m: fsci(n * M / NA, 4), rho: f4(rho), d: fs(v.d, 3) },
        alt: { n: (6 - n) * M / (NA * V), n1: M / (NA * V) },
        tool: { id: 'ptable', q: { el: v.mat, view: 'rho' } } };
    },
  },
  'atomic-radius': {
    gen: (r, T) => { const mat = r.pick(T.pick.mat), e = ELS[mat]; const dir = r.pick(['a2r', 'r2a']); return dir === 'a2r' ? { v: dir, mat, st: e.c, a: e.a } : { v: dir, mat, st: e.c, rr: rnd(e.h / 1000, 4) }; },
    show: (v, T, X) => ({ mat: X.N.el[v.mat], st: struct(v.st), touch: X.N.x[`touch_${v.st}`], ...(v.a != null ? { a: fd(v.a, dpOf(v.a)) } : { rr: fd(v.rr, 4) }) }),
    solve: v => {
      const f = v.st === 'bcc' ? Math.sqrt(3) / 4 : Math.sqrt(2) / 4, g = v.st === 'bcc' ? Math.sqrt(2) / 4 : Math.sqrt(3) / 4;
      const fx = v.st === 'bcc' ? '√3/4' : '√2/4';
      if (v.v === 'a2r') return { ans: v.a * f, fam: 'len', unit: 'nm', k: { f: fx, r: f4(v.a * f) }, alt: { diam: 2 * v.a * f, other: v.a * g, half: v.a / 2 }, tool: { id: 'xtal', q: { type: v.st, a: v.a, atom: 'sphere' } } };
      const a = v.rr / f;
      return { ans: a, fam: 'len', unit: 'nm', k: { f: v.st === 'bcc' ? '4/√3' : '2√2', a: f4(a) }, alt: { diam: a / 2, other: v.rr / g, half: 2 * v.rr }, tool: { id: 'xtal', q: { type: v.st, a: rnd(a, 5), atom: 'sphere' } } };
    },
  },
  'planar-density': {
    gen: (r, T) => { const mat = r.pick(T.pick.mat), e = ELS[mat]; return { mat, st: e.c, a: e.a, pl: r.pick(['100', '110', '111']) }; },
    show: (v, T, X) => ({ mat: X.N.el[v.mat], st: struct(v.st), a: fd(v.a, dpOf(v.a)), hkl: `(${v.pl})` }),
    solve: v => {
      // 単位格子の切り口の面積(a² の何倍か)と、その中の原子の数
      const P = { bcc: { 100: [1, '1', '4 × 1/4 = 1', 4], 110: [Math.SQRT2, '√2', '4 × 1/4 + 1 = 2', 5], 111: [Math.sqrt(3) / 2, '√3/2', '3 × 1/6 = 1/2', 3] },
        fcc: { 100: [1, '1', '4 × 1/4 + 1 = 2', 5], 110: [Math.SQRT2, '√2', '4 × 1/4 + 2 × 1/2 = 2', 6], 111: [Math.sqrt(3) / 2, '√3/2', '3 × 1/6 + 3 × 1/2 = 2', 6] } }[v.st][v.pl];
      const n = { bcc: { 100: 1, 110: 2, 111: 0.5 }, fcc: { 100: 2, 110: 2, 111: 2 } }[v.st][v.pl];
      const A = P[0] * v.a ** 2, pd = n / A;
      return { ans: pd, fam: 'area', unit: 'nm⁻²', k: { af: P[1], A: f4(A), cnt: P[2], n: n % 1 ? fd(n, 1) : String(n), pd: f4(pd) },
        alt: { area: n / v.a ** 2, whole: P[3] / A },
        tool: { id: 'xtal', q: { type: v.st, a: v.a, show: 'plane', h: +v.pl[0], k: +v.pl[1], l: +v.pl[2] } } };
    },
  },
  'ionic-apf': {
    gen: (r, T) => {
      const st = r.pick(['nacl', 'cscl']), ra = r.v(T.v.ra), q = st === 'nacl' ? r.sig(0.42, 0.72, 3) : r.sig(0.74, 0.95, 3);
      return { v: st, st, ra, rc: rnd(ra * q, 3) };
    },
    show: (v, T, X) => ({ st: X.N.x[`st_${v.st}`], ra: fd(v.ra, 3), rc: fd(v.rc, 3) }),
    solve: v => {
      const nacl = v.st === 'nacl', s = v.rc + v.ra, a = nacl ? 2 * s : 2 * s / Math.sqrt(3), n = nacl ? 4 : 1;
      const Vi = 4 / 3 * Math.PI * (v.rc ** 3 + v.ra ** 3), apf = n * Vi / a ** 3;
      const a2 = nacl ? 2 * s / Math.sqrt(3) : 2 * s;
      return { ans: apf, fam: 'frac', unit: '', k: { a: f4(a), n, Vi: f4(Vi), V: f4(a ** 3), apf: f4(apf) },
        alt: { contact: n * Vi / a2 ** 3, n: (nacl ? 1 : 2) * Vi / a ** 3 } };
    },
  },
  // ===== 状態図 =====
  lever: {
    gen: (r, T) => {
      for (;;) {
        const sys = r.pick(T.pick.sys), p = randomPoint(sys, r.f);
        if (!p) continue;
        const [[p1, c1], [p2, c2]] = p.loc.phases, a = rnd(c1, 1), b = rnd(c2, 1);
        if (!(b - a >= 4 && p.c > a + 1 && p.c < b - 1)) continue;
        return { sys, t: p.t, c0: p.c, p1, c1: a, p2, c2: b, ask: r.pick([0, 1]) };
      }
    },
    show: (v, T, X) => { const S = SYS[v.sys], P = k => X.N.x[`ph_${S.ph[k] === 'L' ? 'L' : 'S'}`].replace('{p}', S.ph[k]); return { A: S.A, B: S.B, t: fn(v.t), c0: fn(v.c0), p1: P(v.p1), p2: P(v.p2), c1: fd(v.c1, 1), c2: fd(v.c2, 1), pa: P(v.ask ? v.p2 : v.p1) }; },
    solve: v => {
      const [ca, co] = v.ask ? [v.c2, v.c1] : [v.c1, v.c2], w = (co - v.c0) / (co - ca);
      return { ans: w, fam: 'frac', unit: '', k: { ca: fd(ca, 1), co: fd(co, 1), num: f4(Math.abs(co - v.c0)), den: f4(Math.abs(co - ca)), w: f4(w), w2: f4(1 - w) },
        alt: { swap: 1 - w }, tool: { id: 'lever', q: { mode: 'diagram', sys: v.sys, unit: 'wt', c: v.c0, t: v.t } } };
    },
  },
  proeutectoid: {
    gen: (r, T) => { const side = r.pick(['hypo', 'hyper']), q = r.pick(['pro', 'pearl']); return { v: `${side}-${q}`, c0: r.v(T.v[side]) }; },
    show: (v, T, X) => ({ c0: fd(v.c0, 2), P: fd(FE_P, 3), S: fd(FE_S, 2), CM: fd(FE_CM, 2) }),
    solve: v => {
      const hypo = v.v.startsWith('hypo'), pro = v.v.endsWith('pro'), c = v.c0;
      const wpro = hypo ? (FE_S - c) / (FE_S - FE_P) : (c - FE_S) / (FE_CM - FE_S);
      const w = pro ? wpro : 1 - wpro;
      const total = hypo ? (FE_CM - c) / (FE_CM - FE_P) : (c - FE_P) / (FE_CM - FE_P);
      return { ans: w, fam: 'frac', unit: '', k: { wpro: f4(wpro), wp: f4(1 - wpro), w: f4(w), total: f4(total) },
        alt: { swap: 1 - w, total, ...(hypo && pro ? { noP: (FE_S - c) / FE_S } : {}) },
        tool: { id: 'fe-c', q: { c, t: 700 } } };
    },
  },
  eutectic: {
    gen: (r, T) => {
      const sys = r.pick(T.pick.sys), S = SYS[sys], side = r.pick(['hypo', 'hyper']), q = r.pick(['prim', 'eut', 'phase']);
      const s = sys === 'alsi' ? 0.5 : 1;
      const [lo, hi] = side === 'hypo' ? [S.ca + 0.15 * (S.ce - S.ca), S.ce - 0.1 * (S.ce - S.ca)] : [S.ce + 0.1 * (S.cb - S.ce), S.cb - 0.15 * (S.cb - S.ce)];
      return { v: `${side}-${q}`, sys, c0: r.step(Math.ceil(lo / s) * s, Math.floor(hi / s) * s, s) };
    },
    show: (v, T, X) => {
      const S = SYS[v.sys], hypo = v.v.startsWith('hypo');
      return { A: S.A, B: S.B, TE: fn(S.TE), c0: fd(v.c0, v.sys === 'alsi' ? 1 : 0), ca: fv(S.ca), ce: fv(S.ce), cb: fv(S.cb), pa: S.ph.a, pb: S.ph.b, pp: hypo ? S.ph.a : S.ph.b };
    },
    solve: v => {
      const S = SYS[v.sys], { ca, ce, cb } = S, c = v.c0, hypo = v.v.startsWith('hypo'), q = v.v.split('-')[1];
      const we = hypo ? (c - ca) / (ce - ca) : (cb - c) / (cb - ce), wprim = 1 - we, wph = hypo ? (cb - c) / (cb - ca) : (c - ca) / (cb - ca);
      const all = { prim: wprim, eut: we, phase: wph }, w = all[q];
      return { ans: w, fam: 'frac', unit: '', k: { we: f4(we), wprim: f4(wprim), wph: f4(wph), w: f4(w) },
        alt: Object.fromEntries(Object.entries(all).filter(([k]) => k !== q)),
        tool: { id: 'lever', q: { mode: 'diagram', sys: v.sys, unit: 'wt', c, t: Math.floor(S.TE) - 1 } } };
    },
  },
  'wt-at': {
    gen: (r, T) => { const sys = r.pick(T.pick.sys); return { v: r.pick(['w2a', 'a2w']), sys, x: r.v(T.v.x) }; },
    show: (v, T, X) => { const S = SYS[v.sys]; return { A: S.A, B: S.B, x: fn(v.x), xa: fn(100 - v.x), MA: fv(MW[S.A]), MB: fv(MW[S.B]), nA: X.N.el[S.A], nB: X.N.el[S.B] }; },
    solve: v => {
      const S = SYS[v.sys], MA = MW[S.A], MB = MW[S.B], w2a = v.v === 'w2a';
      const a = w2a ? v.x / MB : v.x * MB, b = w2a ? (100 - v.x) / MA : (100 - v.x) * MA, y = 100 * a / (a + b);
      const t = S.ex[0][1];
      return { ans: y, fam: 'pct', unit: '%', k: { a: f4(a), b: f4(b), y: f4(y) },
        alt: { same: v.x, inv: w2a ? toWt(S, v.x) : toAt(S, v.x) },
        tool: { id: 'lever', q: { mode: 'diagram', sys: v.sys, unit: w2a ? 'wt' : 'at', c: v.x, t } } };
    },
  },
  // ===== 拡散 =====
  arrhenius: {
    gen: (r, T, X) => { const p = r.pick(X.D.diff), s = sysById(p.id); return { pair: p.id, D0: s.d0, Q: s.q, tc: r.step(p.T[0], p.T[1], 5) }; },
    show: (v, T, X) => ({ pair: X.N.diff[v.pair], D0: fsci(v.D0, 2), Q: fn(v.Q), tc: fn(v.tc), R: fs(X.D.c.R, 4) }),
    solve: (v, X) => {
      const R = X.D.c.R, T = TK(v.tc), e = v.Q * 1000 / (R * T), D = v.D0 * Math.exp(-e);
      return { ans: D, fam: 'diff', unit: 'm²/s', k: { T: fs(T, 5), e: f4(e), x: fsci(Math.exp(-e), 4), D: fsci(D, 4) },
        alt: { celsius: v.D0 * Math.exp(-v.Q * 1000 / (R * v.tc)), kj: v.D0 * Math.exp(-v.Q / (R * T)) },
        tool: { id: 'diffusion', q: { mode: 'arr', sys: v.pair, d0: v.D0, q: v.Q, t: v.tc } } };
    },
  },
  'carb-depth': {
    gen: (r, T) => carbGen(r, T, 'x'),
    show: carbShow,
    solve: (v, X) => {
      const c = carbCore(v, X), x = 2 * c.z * Math.sqrt(c.D * v.hours * 3600);
      return { ans: x * 1e3, fam: 'len', unit: 'mm', k: { ...c.k, s: fs(v.hours * 3600, 5), sq: fsci(Math.sqrt(c.D * v.hours * 3600), 4), x: f4(x * 1e3) },
        alt: { erf: 2 * ierf(c.ratio) * Math.sqrt(c.D * v.hours * 3600) * 1e3, no2: x * 1e3 / 2, hours: x * 1e3 / 60 },
        tool: { id: 'diffusion', q: { mode: 'carb', sys: 'c_g', d0: v.D0, q: v.Q, c0: v.c0, cs: v.cs, cx: v.cx, xd: sig(x * 1e3, 3), t: v.tc, hours: v.hours } } };
    },
  },
  'carb-time': {
    gen: (r, T) => carbGen(r, T, 't'),
    show: carbShow,
    solve: (v, X) => {
      const c = carbCore(v, X), xm = v.x / 1e3, ts = (xm / (2 * c.z)) ** 2 / c.D, th = ts / 3600;
      return { ans: th, fam: 'time', unit: 'h', k: { ...c.k, xm: fsci(xm, 3), q: fsci(xm / (2 * c.z), 4), ts: fs(ts, 4), th: f4(th) },
        alt: { erf: (xm / (2 * ierf(c.ratio))) ** 2 / c.D / 3600, no2: th * 4 },
        tool: { id: 'diffusion', q: { mode: 'carb', sys: 'c_g', d0: v.D0, q: v.Q, c0: v.c0, cs: v.cs, cx: v.cx, xd: v.x, t: v.tc, hours: sig(th, 3) } } };
    },
  },
  'time-temp': {
    gen: (r, T, X) => {
      for (;;) {
        const p = r.pick(X.D.diff), s = sysById(p.id), t1c = r.step(p.T[0], p.T[1], 5), t2c = r.step(p.T[0], p.T[1], 5);
        if (Math.abs(t1c - t2c) < 30) continue;
        const h1 = r.v(T.v.h1), h2 = h1 * Math.exp(s.q * 1000 / X.D.c.R * (1 / TK(t2c) - 1 / TK(t1c)));
        if (h2 < 0.05 || h2 > 2e4) continue;
        return { pair: p.id, D0: s.d0, Q: s.q, t1c, t2c, h1 };
      }
    },
    show: (v, T, X) => ({ pair: X.N.diff[v.pair], D0: fsci(v.D0, 2), Q: fn(v.Q), t1c: fn(v.t1c), t2c: fn(v.t2c), h1: showSpec(v.h1, T.v.h1), R: fs(X.D.c.R, 4) }),
    solve: (v, X) => {
      const R = X.D.c.R, T1 = TK(v.t1c), T2 = TK(v.t2c), D1 = v.D0 * Math.exp(-v.Q * 1000 / (R * T1)), D2 = v.D0 * Math.exp(-v.Q * 1000 / (R * T2));
      const e = v.Q * 1000 / R * (1 / T2 - 1 / T1), h2 = v.h1 * Math.exp(e);
      return { ans: h2, fam: 'time', unit: 'h', k: { T1: fs(T1, 5), T2: fs(T2, 5), D1: fsci(D1, 4), D2: fsci(D2, 4), e: f4(e), h2: f4(h2) },
        alt: { inv: v.h1 / Math.exp(e), celsius: v.h1 * Math.exp(v.Q * 1000 / R * (1 / v.t2c - 1 / v.t1c)) },
        tool: { id: 'diffusion', q: { mode: 'arr', sys: v.pair, d0: v.D0, q: v.Q, t: v.t1c, hours: v.h1, t2: v.t2c } } };
    },
  },
  fick1: {
    gen: (r, T) => { const D = r.v(T.v.D), c1 = r.v(T.v.c1), c2 = r.step(0.1, Math.max(0.1, c1 - 0.3), 0.1), x1 = r.v(T.v.x1), dx = r.v(T.v.dx); return { D, c1, c2, x1, x2: rnd(x1 + dx, 1) }; },
    show: (v, T) => ({ D: fsci(v.D, 2), c1: fd(v.c1, 1), c2: fd(v.c2, 1), x1: fd(v.x1, 1), x2: fd(v.x2, 1) }),
    solve: v => {
      const dx = (v.x2 - v.x1) / 1e3, J = v.D * (v.c1 - v.c2) / dx;
      return { ans: J, fam: 'flux', unit: 'kg/(m²·s)', k: { dc: f4(v.c1 - v.c2), dx: fsci(dx, 3), g: f4((v.c1 - v.c2) / dx), J: fsci(J, 4) },
        alt: { x2: v.D * (v.c1 - v.c2) / (v.x2 / 1e3) } };
    },
  },
  vacancy: {
    gen: (r, T) => { const m = r.pick(T.pick.mat), e = ELS[m]; return { mat: m, d: e.d, Qv: r.v(T.v.Qv), tc: r.step(400, Math.floor(e.mp * 0.9 / 10) * 10, 10) }; },
    show: (v, T, X) => ({ mat: X.N.el[v.mat], d: fd(v.d, dpOf(v.d)), M: fv(X.D.aw[v.mat]), Qv: fd(v.Qv, 2), tc: fn(v.tc), NA: fsci(X.D.c.NA, 4), kB: fsci(X.D.c.kB, 4) }),
    solve: (v, X) => {
      const M = X.D.aw[v.mat], N = X.D.c.NA * v.d / M * 1e6, T = TK(v.tc), e = v.Qv / (X.D.c.kB * T), f = Math.exp(-e), Nv = N * f;
      return { ans: Nv, fam: 'vol', unit: 'm⁻³', k: { N: fsci(N, 4), T: fs(T, 5), e: f4(e), f: fsci(f, 4), Nv: fsci(Nv, 4) },
        alt: { celsius: N * Math.exp(-v.Qv / (X.D.c.kB * v.tc)), frac: f } };
    },
  },
  // ===== 機械的性質 =====
  elongation: {
    gen: (r, T) => {
      const m = r.pick(T.pick.mat), E = fromRange(r, m, 'E', 1), d = r.v(T.v.d), L = r.v(T.v.L);
      const sy = range(mat(m), 's')[0], s = sy * r.sig(0.3, 0.7, 2), F = sig(s * Math.PI * d * d / 4 / 1000, 3);
      return { mat: m, E, d, L, F };
    },
    show: (v, T, X) => ({ mat: X.N.mat[v.mat], E: fn(v.E), d: fd(v.d, 1), L: fn(v.L), F: fs(v.F, 3) }),
    solve: v => {
      const A = Math.PI * v.d ** 2 / 4, s = v.F * 1000 / A, e = s / (v.E * 1000), dl = e * v.L;
      return { ans: dl, fam: 'len', unit: 'mm', k: { A: f4(A), s: f4(s), e: fsci(e, 4), dl: f4(dl) }, alt: { radius: dl / 4, diam2: dl / 2 } };
    },
  },
  poisson: {
    gen: (r, T) => { const m = r.pick(T.pick.mat), E = fromRange(r, m, 'E', 1), sy = range(mat(m), 's')[0]; return { mat: m, E, nu: r.v(T.v.nu), s: r.step(20, Math.max(25, Math.floor(sy * 0.7 / 5) * 5), 5), d: r.v(T.v.d) }; },
    show: (v, T, X) => ({ mat: X.N.mat[v.mat], E: fn(v.E), nu: fd(v.nu, 2), s: fn(v.s), d: fd(v.d, 1) }),
    solve: v => {
      const ez = v.s / (v.E * 1000), ex = -v.nu * ez, dd = -ex * v.d * 1000;
      return { ans: dd, fam: 'len', unit: 'µm', k: { ez: fsci(ez, 4), ex: fsci(ex, 4), dd: f4(dd) }, alt: { nonu: ez * v.d * 1000, radius: dd / 2 } };
    },
  },
  'true-stress': {
    gen: (r, T) => ({ v: r.pick(['stress', 'strain']), s: r.v(T.v.s), e: r.v(T.v.e) }),
    show: v => ({ s: fn(v.s), e: fd(v.e, 3) }),
    solve: v => (v.v === 'stress'
      ? { ans: v.s * (1 + v.e), fam: 'stress', unit: 'MPa', k: { st: f4(v.s * (1 + v.e)), et: f4(Math.log(1 + v.e)) }, alt: { minus: v.s * (1 - v.e), same: v.s } }
      : { ans: Math.log(1 + v.e), fam: 'frac', unit: '', k: { st: f4(v.s * (1 + v.e)), et: f4(Math.log(1 + v.e)) }, alt: { same: v.e, log10: Math.log10(1 + v.e) } }),
  },
  'reduction-area': {
    gen: (r, T) => { const d0 = r.v(T.v.d0), df = rnd(d0 * r.sig(0.45, 0.9, 3), 1); return { v: r.pick(['ra', 'strain', 'tsf']), d0, df, sf: r.v(T.v.sf) }; },
    show: v => ({ d0: fd(v.d0, 1), df: fd(v.df, 1), sf: fn(v.sf) }),
    solve: v => {
      const A0 = Math.PI * v.d0 ** 2 / 4, Af = Math.PI * v.df ** 2 / 4, ra = (A0 - Af) / A0, et = Math.log(A0 / Af), st = v.sf * A0 / Af;
      const k = { A0: f4(A0), Af: f4(Af), ra: f4(ra), rap: f4(ra * 100), et: f4(et), F: f4(v.sf * A0), st: f4(st) };
      if (v.v === 'ra') return { ans: ra * 100, fam: 'frac', unit: '%', k, alt: { diam: (v.d0 - v.df) / v.d0 * 100, af: (A0 - Af) / Af * 100 } };
      if (v.v === 'strain') return { ans: et, fam: 'frac', unit: '', k, alt: { diam: Math.log(v.d0 / v.df), eng: (A0 - Af) / Af } };
      return { ans: st, fam: 'stress', unit: 'MPa', k, alt: { same: v.sf, diam: v.sf * v.d0 / v.df } };
    },
  },
  'hall-petch': {
    gen: (r, T) => {
      for (;;) {
        const s0 = r.v(T.v.s0), ky = r.v(T.v.k), ds = [r.v(T.v.d), r.v(T.v.d), r.v(T.v.d)];
        if (Math.max(ds[0], ds[1]) / Math.min(ds[0], ds[1]) < 3 || new Set(ds).size < 3) continue;
        const sy = d => sig(s0 + ky / Math.sqrt(d * 1e-6), 3);
        return { d1: ds[0], s1: sy(ds[0]), d2: ds[1], s2: sy(ds[1]), d3: ds[2] };
      }
    },
    show: v => ({ d1: fn(v.d1), s1: fn(v.s1), d2: fn(v.d2), s2: fn(v.s2), d3: fn(v.d3) }),
    solve: v => {
      const x = d => 1 / Math.sqrt(d * 1e-6), k = (v.s1 - v.s2) / (x(v.d1) - x(v.d2)), s0 = v.s1 - k * x(v.d1), s3 = s0 + k * x(v.d3);
      const lin = (v.s1 - v.s2) / (v.d1 - v.d2), inv = (v.s1 - v.s2) / (1 / v.d1 - 1 / v.d2);
      return { ans: s3, fam: 'stress', unit: 'MPa', k: { x1: f4(x(v.d1)), x2: f4(x(v.d2)), x3: f4(x(v.d3)), k: f4(k), s0: f4(s0), s3: f4(s3) },
        alt: { linear: v.s1 + lin * (v.d3 - v.d1), inv: v.s1 + inv * (1 / v.d3 - 1 / v.d1) } };
    },
  },
  schmid: {
    gen: (r, T) => {
      for (;;) {
        const st = r.pick(['fcc', 'bcc']);
        const ax = r.pick([[0, 0, 1], [0, 1, 0], [1, 0, 0], [0, 1, 1], [1, 0, 1], [1, 1, 0], [1, 1, 1], [0, 1, 2], [1, 1, 2], [1, 2, 3], [1, 0, 2], [2, 1, 3]]);
        const pl = st === 'fcc' ? r.pick([[1, 1, 1], [-1, 1, 1], [1, -1, 1], [1, 1, -1]]) : r.pick([[1, 1, 0], [1, -1, 0], [1, 0, 1], [1, 0, -1], [0, 1, 1], [0, 1, -1]]);
        const dirs = (st === 'fcc' ? [[1, -1, 0], [1, 0, -1], [0, 1, -1], [1, 1, 0], [1, 0, 1], [0, 1, 1]] : [[1, 1, 1], [-1, 1, 1], [1, -1, 1], [1, 1, -1]])
          .flatMap(d => [d, d.map(x => -x)]).filter(d => d[0] * pl[0] + d[1] * pl[1] + d[2] * pl[2] === 0);
        const b = r.pick(dirs);
        const m = Math.abs(dot3(ax, pl) * dot3(ax, b)) / (len3(ax) ** 2 * len3(pl) * len3(b));
        if (m < 0.15) continue;
        const q = r.pick(['tau', 'sigma']);
        return { v: q, st, ax, pl, b, s: q === 'tau' ? r.v(T.v.s) : null, tc: q === 'sigma' ? r.v(T.v.tc) : null };
      }
    },
    show: v => ({ st: struct(v.st), ax: hklStr(v.ax, '[]'), pl: hklStr(v.pl), b: hklStr(v.b, '[]'), ...(v.s != null ? { s: fn(v.s) } : { tc: fd(v.tc, 1) }) }),
    solve: v => {
      const cp = Math.abs(dot3(v.ax, v.pl)) / (len3(v.ax) * len3(v.pl)), cl = Math.abs(dot3(v.ax, v.b)) / (len3(v.ax) * len3(v.b)), m = cp * cl;
      const k = { dp: Math.abs(dot3(v.ax, v.pl)), lp: f4(len3(v.ax) * len3(v.pl)), dl: Math.abs(dot3(v.ax, v.b)), ll: f4(len3(v.ax) * len3(v.b)), cp: f4(cp), cl: f4(cl), m: f4(m) };
      if (v.v === 'tau') return { ans: v.s * m, fam: 'stress', unit: 'MPa', k: { ...k, tau: f4(v.s * m) }, alt: { onep: v.s * cp, onel: v.s * cl, sin: v.s * Math.sqrt(1 - cp * cp) * Math.sqrt(1 - cl * cl) } };
      return { ans: v.tc / m, fam: 'stress', unit: 'MPa', k: { ...k, sy: f4(v.tc / m) }, alt: { mult: v.tc * m, onep: v.tc / cp, onel: v.tc / cl } };
    },
  },
  // ===== 破壊 =====
  'stress-conc': {
    gen: (r, T) => { const kind = r.pick(['surface', 'internal']), a = r.v(T.v.a), ratio = r.sig(4, 400, 3, true); return { v: kind, s0: r.v(T.v.s0), a, rho: sig(a * 1000 / ratio, 2) }; },
    show: v => ({ s0: fn(v.s0), a: fd(v.a, 1), a2: fd(2 * v.a, 1), rho: fs(v.rho, 2) }),
    solve: v => {
      const q = v.a * 1000 / v.rho, kt = 1 + 2 * Math.sqrt(q), sm = v.s0 * kt;
      return { ans: sm, fam: 'stress', unit: 'MPa', k: { q: f4(q), sq: f4(Math.sqrt(q)), kt: f4(kt), sm: f4(sm) },
        alt: { approx: 2 * v.s0 * Math.sqrt(q), unit: v.s0 * (1 + 2 * Math.sqrt(v.a / v.rho)), ...(v.v === 'internal' ? { full: v.s0 * (1 + 2 * Math.sqrt(2 * q)) } : {}) } };
    },
  },
  'kic-stress': {
    gen: (r, T) => {
      // 破壊する応力が、その材料の強さの範囲の上限より低くなる組み合わせだけ(そうでなければ先に降伏する)
      for (;;) {
        const m = r.pick(T.pick.mat), cer = range(mat(m), 'K')[1] < 10, kind = r.pick(['surface', 'internal']);
        const K = fromRange(r, m, 'K', cer ? 0.1 : 1), Y = r.pick(T.pick.Y), a = cer ? r.v(T.v.ac) : r.v(T.v.am);
        if (K / (Y * Math.sqrt(Math.PI * a / 1000)) > range(mat(m), 's')[1]) continue;
        return { v: kind, mat: m, K, Y, a };
      }
    },
    show: (v, T, X) => ({ mat: X.N.mat[v.mat], K: fn(v.K), Y: fd(v.Y, dpOf(v.Y) || 1), a: fd(v.a, dpOf(v.a)), a2: fd(2 * v.a, dpOf(v.a)) }),
    solve: v => {
      const am = v.a / 1000, s = v.K / (v.Y * Math.sqrt(Math.PI * am));
      return { ans: s, fam: 'stress', unit: 'MPa', k: { am: fsci(am, 3), sq: f4(Math.sqrt(Math.PI * am)), s: f4(s) },
        alt: { mm: v.K / (v.Y * Math.sqrt(Math.PI * v.a)), nopi: v.K / (v.Y * Math.sqrt(am)), ...(v.v === 'internal' ? { full: v.K / (v.Y * Math.sqrt(2 * Math.PI * am)) } : {}) } };
    },
  },
  'kic-crack': {
    gen: (r, T) => {
      // 使う応力は強さの範囲の 0.3 倍(下限)〜0.7 倍(上限)。き裂の深さが 5 µm〜30 mm になる組み合わせだけ
      for (;;) {
        const m = r.pick(T.pick.mat), cer = range(mat(m), 'K')[1] < 10, [lo, hi] = range(mat(m), 's');
        const K = fromRange(r, m, 'K', cer ? 0.1 : 1), Y = r.pick(T.pick.Y), s = r.step(Math.max(10, Math.ceil(lo * 0.3 / 5) * 5), Math.max(15, Math.floor(hi * 0.7 / 5) * 5), 5);
        const a = (K / (Y * s)) ** 2 / Math.PI * 1000;
        if (a < 0.005 || a > 30) continue;
        return { v: r.pick(['surface', 'internal']), mat: m, K, Y, s };
      }
    },
    show: (v, T, X) => ({ mat: X.N.mat[v.mat], K: fn(v.K), Y: fd(v.Y, dpOf(v.Y) || 1), s: fn(v.s) }),
    solve: v => {
      const a = (v.K / (v.Y * v.s)) ** 2 / Math.PI * 1000, ans = v.v === 'internal' ? 2 * a : a;
      return { ans, fam: 'len', unit: 'mm', k: { r: f4(v.K / (v.Y * v.s)), a: f4(a), a2: f4(2 * a) },
        alt: { full: v.v === 'internal' ? a : 2 * a, nosq: v.K / (v.Y * v.s) / Math.PI * 1000 * (v.v === 'internal' ? 2 : 1), nopi: (v.K / (v.Y * v.s)) ** 2 * 1000 * (v.v === 'internal' ? 2 : 1) } };
    },
  },
  // ===== 熱 =====
  'thermal-expansion': {
    gen: (r, T) => { const m = r.pick(T.pick.mat), poly = range(mat(m), 'a')[0] > 50, al = fromRange(r, m, 'a', poly ? 5 : 0.1), t1 = r.v(T.v.t1); return { mat: m, al, L: r.v(T.v.L), t1, t2: t1 + r.step(20, poly ? 60 : 400, 5) }; },
    show: (v, T, X) => ({ mat: X.N.mat[v.mat], al: v.al >= 50 ? fn(v.al) : fd(v.al, 1), L: fn(v.L), t1: fn(v.t1), t2: fn(v.t2) }),
    solve: v => {
      const dT = v.t2 - v.t1, dl = v.al * 1e-6 * v.L * dT;
      return { ans: dl, fam: 'len', unit: 'mm', k: { dT, e: fsci(v.al * 1e-6 * dT, 4), dl: f4(dl) }, alt: { abs: v.al * 1e-6 * v.L * TK(v.t2), final: v.L + dl },
        tool: { id: 'thermal', q: { mode: 'uniaxial', alpha: v.al, as: 0, l: v.L, t1: v.t1, t2: v.t2 } } };
    },
  },
  'thermal-stress': {
    gen: (r, T) => {
      const m = r.pick(T.pick.mat), E = fromRange(r, m, 'E', 1), al = fromRange(r, m, 'a', 0.1), t1 = r.v(T.v.t1), q = r.pick(['stress', 'temp']);
      return q === 'stress' ? { v: q, mat: m, E, al, t1, t2: t1 + r.step(20, 150, 5) } : { v: q, mat: m, E, al, t1, sa: r.v(T.v.sa) };
    },
    show: (v, T, X) => ({ mat: X.N.mat[v.mat], E: fn(v.E), al: fd(v.al, 1), t1: fn(v.t1), ...(v.v === 'stress' ? { t2: fn(v.t2) } : { sa: fn(v.sa) }) }),
    solve: v => {
      const Ea = v.E * 1000 * v.al * 1e-6;
      if (v.v === 'stress') {
        const dT = v.t2 - v.t1, s = Ea * dT;
        return { ans: s, fam: 'stress', unit: 'MPa', k: { dT, Ea: f4(Ea), s: f4(s) }, alt: { abs: Ea * TK(v.t2), gpa: s / 1000 },
          tool: { id: 'thermal', q: { mode: 'uniaxial', alpha: v.al, as: 0, l: 1000, t1: v.t1, t2: v.t2, e: v.E } } };
      }
      const dT = v.sa / Ea, t2 = v.t1 + dT;
      return { ans: t2, fam: 'temp', unit: '°C', k: { Ea: f4(Ea), dT: f4(dT), t2: f4(t2) }, alt: { dt: dT, kelvin: TK(t2) },
        tool: { id: 'thermal', q: { mode: 'uniaxial', alpha: v.al, as: 0, l: 1000, t1: v.t1, t2: sig(t2, 4), e: v.E, sy: v.sa } } };
    },
  },
  'film-stress': {
    gen: (r, T) => {
      for (;;) {
        const f = r.pick(T.pick.film), s = r.pick(T.pick.sub);
        if (f === s) continue;
        const af = fromRange(r, f, 'a', 0.1), as = fromRange(r, s, 'a', 0.1);
        if (Math.abs(af - as) < 1) continue;
        return { film: f, sub: s, E: fromRange(r, f, 'E', 1), nu: f === 'silica' ? 0.17 : r.v(T.v.nu), af, as, t1: r.v(T.v.t1), t2: 25 };
      }
    },
    show: (v, T, X) => ({ film: X.N.mat[v.film], sub: X.N.mat[v.sub], E: fn(v.E), nu: fd(v.nu, 2), af: fd(v.af, 1), as: fd(v.as, 1), t1: fn(v.t1), t2: fn(v.t2) }),
    solve: (v, X) => {
      const dT = v.t2 - v.t1, da = (v.af - v.as) * 1e-6, s = -v.E * 1000 * da * dT / (1 - v.nu);
      return { ans: s, fam: 'stress', unit: 'MPa', k: { dT: fd(dT, 0), da: fsci(da, 3), b: f4(v.E * 1000 / (1 - v.nu)), s: f4(s), st: X.N.x[s > 0 ? 'tension' : 'compression'] },
        alt: { nonu: s * (1 - v.nu), onlyf: -v.E * 1000 * v.af * 1e-6 * dT / (1 - v.nu) },
        tool: { id: 'thermal', q: { mode: 'biaxial', alpha: v.af, as: v.as, l: 1000, t1: v.t1, t2: v.t2, e: v.E, nu: v.nu } } };
    },
  },
  conduction: {
    gen: (r, T) => {
      const m = r.pick(T.pick.mat), [lo] = range(mat(m), 'k'), s = lo >= 10 ? 1 : 0.01;
      const poly = mat(m)[1] === 3;
      return { mat: m, k: fromRange(r, m, 'k', s), L: lo >= 10 ? r.v(T.v.Lm) : r.v(T.v.Li), th: poly ? r.v(T.v.thp) : r.v(T.v.th), tl: r.v(T.v.tl) };
    },
    show: (v, T, X) => ({ mat: X.N.mat[v.mat], k: v.k >= 10 ? fn(v.k) : fd(v.k, 2), L: fn(v.L), th: fn(v.th), tl: fn(v.tl) }),
    solve: v => {
      const dT = v.th - v.tl, q = v.k * dT / (v.L / 1000);
      return { ans: q, fam: 'heat', unit: 'W/m²', k: { dT, Lm: fs(v.L / 1000, 3), q: f4(q) }, alt: { inv: v.L / 1000 / (v.k * dT) } };
    },
  },
  bimetal: {
    gen: (r, T) => {
      for (;;) {
        const m1 = r.pick(T.pick.mat), m2 = r.pick(T.pick.mat);
        if (m1 === m2) continue;
        const a1 = fromRange(r, m1, 'a', 0.1), a2 = fromRange(r, m2, 'a', 0.1);
        if (Math.abs(a1 - a2) < 3) continue;
        const A1 = r.v(T.v.A), A2 = r.pick([A1, r.v(T.v.A)]);
        return { v: r.pick(['hi', 'lo']), m1, m2, a1, a2, E1: fromRange(r, m1, 'E', 1), E2: fromRange(r, m2, 'E', 1), A1, A2, dT: r.v(T.v.dT) };
      }
    },
    show: (v, T, X) => {
      const hi = v.a1 > v.a2 ? v.m1 : v.m2, lo = hi === v.m1 ? v.m2 : v.m1;
      return { m1: X.N.mat[v.m1], m2: X.N.mat[v.m2], a1: fd(v.a1, 1), a2: fd(v.a2, 1), E1: fn(v.E1), E2: fn(v.E2), A1: fn(v.A1), A2: fn(v.A2), dT: fn(v.dT), mq: X.N.mat[v.v === 'hi' ? hi : lo] };
    },
    solve: v => {
      // 2本の棒(1: m1、2: m2)。力のつり合い σ1A1 + σ2A2 = 0、両端で伸びが同じ α1ΔT + σ1/E1 = α2ΔT + σ2/E2
      const E1 = v.E1 * 1000, E2 = v.E2 * 1000, da = (v.a1 - v.a2) * 1e-6 * v.dT;
      const s1 = -da / (1 / E1 + v.A1 / (v.A2 * E2)), s2 = -s1 * v.A1 / v.A2;
      const hi1 = v.a1 > v.a2, want = (v.v === 'hi') === hi1 ? 1 : 2, s = want === 1 ? s1 : s2;
      const Eq = want === 1 ? E1 : E2, single = Math.abs(da) * Eq;
      return { ans: Math.abs(s), fam: 'stress', unit: 'MPa', k: { da: fsci(da, 4), s1: f4(s1), s2: f4(s2), s: f4(Math.abs(s)) },
        alt: { rigid: single, ...(v.A1 !== v.A2 ? { noA: Math.abs(da / (1 / E1 + 1 / E2)) } : {}) } };
    },
  },
  // ===== 複合材料 =====
  rom: {
    gen: (r, T) => compGen(r, T),
    show: compShow,
    solve: (v, X) => {
      const c = compCore(v, X), e1 = c.vf * v.ef + (1 - c.vf) * v.em, e2 = 1 / (c.vf / v.ef + (1 - c.vf) / v.em);
      return { ans: e1, fam: 'stress', unit: 'GPa', k: { ...c.k, e1: f4(e1) },
        alt: { reuss: e2, ...(v.basis === 'mass' ? { wf: v.f / 100 * v.ef + (1 - v.f / 100) * v.em } : {}) }, tool: compTool(v) };
    },
  },
  'rom-trans': {
    gen: (r, T) => compGen(r, T),
    show: compShow,
    solve: (v, X) => {
      const c = compCore(v, X), e1 = c.vf * v.ef + (1 - c.vf) * v.em, e2 = 1 / (c.vf / v.ef + (1 - c.vf) / v.em);
      return { ans: e2, fam: 'stress', unit: 'GPa', k: { ...c.k, i: f4(c.vf / v.ef + (1 - c.vf) / v.em), e2: f4(e2) },
        alt: { voigt: e1, ...(v.basis === 'mass' ? { wf: 1 / (v.f / 100 / v.ef + (1 - v.f / 100) / v.em) } : {}) }, tool: compTool(v) };
    },
  },
  'load-share': {
    gen: (r, T, X) => { const g = compGen(r, T, 'vol'); return { ...g, v: r.pick(['ratio', 'frac']) }; },
    show: compShow,
    solve: (v, X) => {
      const c = compCore(v, X), a = c.vf * v.ef, b = (1 - c.vf) * v.em;
      return v.v === 'ratio'
        ? { ans: a / b, fam: 'num', unit: '', k: { a: f4(a), b: f4(b), r: f4(a / b), fr: f4(a / (a + b)) }, alt: { inv: b / a, noV: v.ef / v.em }, tool: compTool(v) }
        : { ans: a / (a + b), fam: 'frac', unit: '', k: { a: f4(a), b: f4(b), r: f4(a / b), fr: f4(a / (a + b)) }, alt: { vf: c.vf, ratio: a / b }, tool: compTool(v) };
    },
  },
  // ===== 電気・腐食・高温 =====
  'wire-resistance': {
    gen: (r, T, X) => { const c = r.pick(Object.keys(X.D.cond)); return { cond: c, d: r.v(T.v.d), L: r.v(T.v.L), tc: r.v(T.v.tc) }; },
    show: (v, T, X) => { const c = X.D.cond[v.cond]; return { cond: X.N.x[`cond_${v.cond}`], r20: fsci(c.r20, 5), aR: fs(c.aR, 3), d: fd(v.d, 1), L: fn(v.L), tc: fn(v.tc) }; },
    solve: (v, X) => {
      const c = X.D.cond[v.cond], rt = c.r20 * (1 + c.aR * (v.tc - 20)), A = Math.PI * (v.d / 1000) ** 2 / 4, R = rt * v.L / A;
      return { ans: R, fam: 'ohm', unit: 'Ω', k: { rt: fsci(rt, 4), A: fsci(A, 4), R: f4(R) }, alt: { noT: c.r20 * v.L / A, radius: R / 4 } };
    },
  },
  semiconductor: {
    gen: (r, T) => { const Nd = r.v(T.v.Nd); return { v: r.pick(['rho', 'sigma']), Nd, mu: Math.round(muSi(Nd) * r.sig(0.95, 1.05, 3) / 10) * 10 }; },
    show: (v, T, X) => ({ Nd: fsci(v.Nd, 2), mu: fn(v.mu), e: fsci(X.D.c.e, 4) }),
    solve: (v, X) => {
      const n = v.Nd * 1e6, mu = v.mu * 1e-4, s = n * X.D.c.e * mu, rho = 1 / s;
      const k = { n: fsci(n, 3), muSI: fs(mu, 4), s: f4(s), rho: f4(rho), rcm: f4(rho * 100) };
      return v.v === 'rho' ? { ans: rho, fam: 'rho', unit: 'Ω·m', k, alt: { recip: s } } : { ans: s, fam: 'cond', unit: 'S/m', k, alt: { recip: rho } };
    },
  },
  faraday: {
    gen: (r, T, X) => {
      const m = r.pick(T.pick.mat), q = r.pick(['mass', 'rate']);
      return q === 'mass' ? { v: q, mat: m, n: X.D.valence[m], I: r.v(T.v.I), days: r.v(T.v.days) } : { v: q, mat: m, n: X.D.valence[m], i: r.v(T.v.i), d: ELS[m].d };
    },
    show: (v, T, X) => ({ mat: X.N.el[v.mat], n: fn(v.n), ion: `${v.mat}${v.n > 1 ? SUP[v.n] : ''}⁺`, M: fv(X.D.aw[v.mat]), F: fn(X.D.c.F),
      ...(v.v === 'mass' ? { I: fs(v.I, 2), days: fn(v.days) } : { i: fd(v.i, 1), d: fn(v.d) }) }),
    solve: (v, X) => {
      const M = X.D.aw[v.mat], F = X.D.c.F;
      if (v.v === 'mass') {
        const t = v.days * 86400, Q = v.I * t, m = Q * M / (v.n * F);
        return { ans: m, fam: 'mass', unit: 'g', k: { t: fs(t, 4), Q: fs(Q, 4), m: f4(m) }, alt: { n1: m * v.n, hours: m / 3600, days: m / 86400 } };
      }
      const cps = v.i * 1e-6 * M / (v.n * F * v.d), um = cps * 3.1536e7 * 1e4;
      return { ans: um, fam: 'rate', unit: 'µm/y', k: { g: fsci(v.i * 1e-6 * M / (v.n * F), 4), c: fsci(cps, 4), um: f4(um) }, alt: { n1: um * v.n } };
    },
  },
  'larson-miller': {
    gen: (r, T, X) => {
      for (;;) {
        const t1c = r.v(T.v.t1c), h1 = r.v(T.v.h1), q = r.pick(['time', 'temp']), C = X.D.c.LMC;
        const P = TK(t1c) * (C + Math.log10(h1));
        if (q === 'time') {
          const t2c = t1c - r.step(20, 100, 5), h2 = 10 ** (P / TK(t2c) - C);
          if (h2 > 1e6) continue;
          return { v: q, t1c, h1, t2c };
        }
        const h2 = r.v(T.v.h2);
        if (h2 <= h1 * 3) continue;
        return { v: q, t1c, h1, h2 };
      }
    },
    show: (v, T, X) => ({ t1c: fn(v.t1c), h1: fs(v.h1, 2), C: fn(X.D.c.LMC), ...(v.v === 'time' ? { t2c: fn(v.t2c) } : { h2: fsci(v.h2, 2) }) }),
    solve: (v, X) => {
      const C = X.D.c.LMC, T1 = TK(v.t1c), P = T1 * (C + Math.log10(v.h1));
      if (v.v === 'time') {
        const T2 = TK(v.t2c), e = P / T2 - C, h2 = 10 ** e;
        return { ans: h2, fam: 'time', unit: 'h', k: { T1: fs(T1, 5), lg: f4(Math.log10(v.h1)), P: fs(P, 5), T2: fs(T2, 5), e: f4(e), h2: fs(h2, 4) },
          alt: { celsius: 10 ** (v.t1c * (C + Math.log10(v.h1)) / v.t2c - C), ln: Math.exp(T1 * (C + Math.log(v.h1)) / T2 - C) } };
      }
      const T2 = P / (C + Math.log10(v.h2)), t2 = T2 - 273.15;
      return { ans: t2, fam: 'temp', unit: '°C', k: { T1: fs(T1, 5), lg: f4(Math.log10(v.h1)), P: fs(P, 5), lg2: f4(Math.log10(v.h2)), T2: fs(T2, 5), t2: fs(t2, 4) },
        alt: { kelvin: T2, celsius: v.t1c * (C + Math.log10(v.h1)) / (C + Math.log10(v.h2)) } };
    },
  },
};
// シリコンの電子の移動度 cm²/(V·s)(300 K、Caughey–Thomas の式。係数は Jacoboni ら 1977)
const muSi = N => 52.2 + 1364.8 / (1 + (N / 9.68e16) ** 0.68);
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len3 = a => Math.hypot(a[0], a[1], a[2]);

// 浸炭(γ鉄中の炭素、一定の表面濃度): (Cx − C0)/(Cs − C0) = 1 − erf(x/(2√(Dt)))
// D0・Q は拡散シミュレーターの「γ鉄中の炭素」。表面の濃度はその温度の Acm 線より低くする(セメンタイトができない)
function carbGen(r, T, ask) {
  const s = sysById('c_g');
  for (;;) {
    const tc = r.v(T.v.tc), c0 = r.v(T.v.c0), cs = r.v(T.v.cs), ratio = r.f() * 0.5 + 0.25, cx = rnd(c0 + ratio * (cs - c0), 2);
    if (!(cs <= acmAt(tc)) || !(cx > c0 + 0.05 && cx < cs - 0.05)) continue;
    const base = { D0: s.d0, Q: s.q, tc, c0, cs, cx };
    if (ask === 'x') return { ...base, hours: r.v(T.v.hours) };
    return { ...base, x: r.v(T.v.x) };
  }
}
function carbShow(v, T, X) {
  return { D0: fsci(v.D0, 2), Q: fn(v.Q), tc: fn(v.tc), c0: fd(v.c0, 2), cs: fd(v.cs, 2), cx: fd(v.cx, 2), R: fs(X.D.c.R, 4),
    ...(v.hours != null ? { hours: showSpec(v.hours, T.v.hours) } : { x: showSpec(v.x, T.v.x) }) };
}
function carbCore(v, X) {
  const T = TK(v.tc), D = v.D0 * Math.exp(-v.Q * 1000 / (X.D.c.R * T)), ratio = (v.cx - v.c0) / (v.cs - v.c0), z = ierfc(ratio);
  return { D, ratio, z, k: { T: fs(T, 5), D: fsci(D, 4), ratio: f4(ratio), er: f4(1 - ratio), z: f4(z) } };
}
// 複合材料: 繊維(とする値)と母材(材料選びチャートの範囲)。質量分率で与えたときは体積分率に換算する
function compGen(r, T, basis) {
  const fib = r.pick(Object.keys(T.data.fiber)), F = T.data.fiber[fib], mx = r.pick(T.pick.matrix);
  const b = basis ?? r.pick(['vol', 'mass']);
  return { v: b, basis: b, fib, mx, f: r.v(T.v.f), ef: r.step(...F.E), rf: F.rho, em: fromRange(r, mx, 'E', 0.1), rm: fromRange(r, mx, 'rho', 0.01) };
}
function compShow(v, T, X) {
  return { fib: X.N.x[`fib_${v.fib}`], mx: X.N.mat[v.mx], f: fn(v.f), ef: fn(v.ef), em: fd(v.em, 1), rf: fd(v.rf, 2), rm: fd(v.rm, 2) };
}
function compCore(v) {
  const w = v.f / 100, vf = v.basis === 'mass' ? (w / v.rf) / (w / v.rf + (1 - w) / v.rm) : w;
  return { vf, k: { vf: f4(vf), vm: f4(1 - vf), a: f4(w / v.rf), b: f4((1 - w) / v.rm) } };
}
// 複合材料デザイナーの一方向材のタブ。ドリルは繊維を等方とみなす(教科書の式)ので、横方向の繊維の弾性率 ef2 も Ef にする。
// 繊維・母材はデータ集の値と合わないので、ツールの側で「自分で入れた値」になる。空隙 vv は 0
const compTool = v => ({ id: 'composite', q: { mode: 'ud', basis: v.basis, f: v.f, vv: 0, ef1: v.ef, ef2: v.ef, rf: v.rf, em: v.em, rm: v.rm } });

// ---- 問題を作る: 型のデータ T(data/drill.json の1件)、種 seed → { vals, show, sol } ----
export function makeProblem(T, seed, X) {
  const def = TYPES[T.id];
  const r = makeRng(seed, T.id);
  const vals = def.gen(r, T, X);
  const auto = {};
  for (const [k, spec] of Object.entries(T.v ?? {})) if (typeof vals[k] === 'number') auto[k] = showSpec(vals[k], spec);
  const show = { ...auto, ...(def.show ? def.show(vals, T, X) : {}) };
  const sol = def.solve(vals, X);
  return { vals, show, sol };
}
// 文章の場合分け: 文字ならそのまま、{ 場合: 文 } なら vals.v(なければその頭「hypo-pro」→「hypo」、それもなければ「_」)
export const pickText = (x, v) => (typeof x === 'string' || Array.isArray(x) || x == null ? x : x[v] ?? x[String(v).split('-')[0]] ?? x[String(v).split('-').at(-1)] ?? x._);
// 許容差(場合ごとに tolv で変えられる)
export const tolOf = (T, v) => T.tolv?.[v] ?? T.tol;
export const fillText = (s, vars) => s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));

// ---- 判定 ----
// 値 x(単位 u)を、答え(sol.unit)と比べる。tol は相対の許容差(0.01 = ±1 %)
// 戻り値: { ok, err(相対のずれ)、hint: 間違いのID か 一般の指摘 { kind, ... } }
export function judge(sol, x, u, tol) {
  const fam = sol.fam;
  const y = convert(fam, x, u, sol.unit);
  // 温度は絶対温度で比べる(℃の 0 は物理的な基準ではないので)
  const abs = fam === 'temp' ? z => convert(fam, z, sol.unit, 'K') : z => z;
  const near = (a, b, t = tol) => Math.abs(abs(a) - abs(b)) <= t * Math.abs(abs(b)) + 1e-300;
  const err = sol.ans === 0 ? Math.abs(y) : (abs(y) - abs(sol.ans)) / Math.abs(abs(sol.ans));
  if (near(y, sol.ans)) return { ok: true, err, y };
  // その型によくある間違い
  const hits = Object.entries(sol.alt ?? {}).filter(([, a]) => Number.isFinite(a) && near(y, a, Math.max(tol, 0.005))).map(([id]) => id);
  if (hits.length) return { ok: false, err, y, hint: { kind: 'alt', id: hits[0], ids: hits } };
  // 符号
  if (near(-y, sol.ans)) return { ok: false, err, y, hint: { kind: 'sign' } };
  // 入れた数値が、同じ家族の別の単位で表した答えと同じ(単位の取り違え)
  if (fam !== 'temp') {
    for (const w of Object.keys(UNITS[fam])) {
      if (w === u) continue;
      if (near(x, convert(fam, sol.ans, sol.unit, w))) return { ok: false, err, y, hint: { kind: 'unit', u: w } };
    }
  } else if (Math.abs(x - convert(fam, sol.ans, sol.unit, u === 'K' ? '°C' : 'K')) <= tol * convert(fam, sol.ans, sol.unit, 'K')) return { ok: false, err, y, hint: { kind: 'unit', u: u === 'K' ? '°C' : 'K' } };
  // 10 の累乗だけずれている
  if (fam !== 'temp' && y / sol.ans > 0) {
    const p = Math.log10(y / sol.ans), n = Math.round(p);
    if (n && Math.abs(p - n) <= Math.log10(1 + tol)) return { ok: false, err, y, hint: { kind: 'pow', n } };
  }
  if (Math.abs(err) <= 0.05) return { ok: false, err, y, hint: { kind: 'close' } };
  return { ok: false, err, y };
}

// ======================================================================
// ---- ここから画面 ----
const app = typeof document !== 'undefined' ? document.getElementById('dr-app') : null;
const dataEl = typeof document !== 'undefined' ? document.getElementById('dr-data') : null;
if (app && dataEl) ui(JSON.parse(dataEl.textContent));

function ui(D) {
  const S = D.t;
  const X = { D: D.data, N: D.names };
  const byId = Object.fromEntries(D.types.map(T => [T.id, T]));
  const groupName = Object.fromEntries(D.groups.map(g => [g.id, g.name]));
  const $ = s => app.querySelector(s);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const fmtS = (k, v = {}) => fillText(S[k] ?? k, v);
  // ずれ(%)。1 % 未満は小数2桁(ごく小さいずれを 7.0×10⁻⁵ % のように出さない)
  const errTxt = e => { const a = Math.abs(e) * 100; return a < 0.005 ? fd(0, 2) : `${e >= 0 ? '+' : '−'}${a >= 1 ? fs(a, 2) : fd(a, 2)}`; };
  const ulabel = u => (u === '' ? S.drill_unit_none : D.unitLabels?.[u] ?? u);

  // ---- 記録(localStorage。使えなくても動く) ----
  const KEY = `drill:${document.documentElement.dataset.base ?? '/'}:v1`;
  const load = () => { try { const d = JSON.parse(localStorage.getItem(KEY)); return d && typeof d === 'object' && d.t && typeof d.t === 'object' ? d : { t: {} }; } catch { return { t: {} }; } };
  let rec = load();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(rec)); } catch {} };
  const note = (id, ok) => {
    const x = rec.t[id] ?? (rec.t[id] = { ok: 0, ng: 0 });
    if (ok) x.ok++; else x.ng++;
    x.last = ok ? 1 : 0;
    x.at = Date.now();
    save();
  };

  // ---- 選ぶところ ----
  const pick = $('#dr-pick');
  const selG = pick.elements.group, selT = pick.elements.type;
  const fillTypes = () => {
    const g = selG.value, cur = selT.value;
    selT.replaceChildren(new Option(S.drill_all_types, ''), ...D.types.filter(T => !g || T.group === g).map(T => new Option(T.name, T.id)));
    if ([...selT.options].some(o => o.value === cur)) selT.value = cur;
  };
  selG.addEventListener('change', fillTypes);

  // ---- 出題の状態 ----
  let set = null; // { list: [型ID…], i, results: [{ id, ok }] }
  let cur = null; // { T, seed, p, done }
  const card = $('#dr-card'), sum = $('#dr-sum');
  const qText = $('.dr-q'), meta = $('.dr-meta'), form = $('#dr-ans'), input = form.elements.ans, unitSel = form.elements.unit;
  const msg = $('.dr-msg'), res = $('.dr-res'), verdict = $('.dr-verdict'), hintEl = $('.dr-hint'), stepsEl = $('.dr-steps'), linksEl = $('.dr-links');
  const nextBtn = $('[data-next]'), againBtn = $('[data-again]'), shareBtn = $('[data-share]'), giveBtn = $('[data-give]');

  // まちがえた型を多めに(最後にまちがえた型は4倍、まちがえた回数が多いほど重く)
  const weight = id => { const x = rec.t[id]; if (!x) return 1; return 1 + (x.last === 0 ? 3 : 0) + Math.min(x.ng, 4) * 0.5 - Math.min(x.ok, 4) * 0.1; };
  const choose = (ids, n, weak) => {
    const out = [];
    let pool = [...ids];
    while (out.length < n) {
      if (!pool.length) pool = [...ids];
      const w = pool.map(id => (weak ? weight(id) : 1)), tot = w.reduce((a, b) => a + b, 0);
      let x = Math.random() * tot, i = 0;
      while (x > w[i] && i < pool.length - 1) x -= w[i++];
      // 型が少なくて同じ型をくり返すときも、続けて同じ型にはしない
      if (pool.length > 1 && pool[i] === out.at(-1)) continue;
      out.push(pool[i]);
      if (ids.length >= n) pool.splice(i, 1);
    }
    return out;
  };
  const newSeed = () => 1 + Math.floor(Math.random() * 99999);
  const setUrl = () => {
    const p = new URLSearchParams(location.search);
    for (const k of ['t', 's']) p.delete(k);
    if (cur) { p.set('t', cur.T.id); p.set('s', String(cur.seed)); }
    const q = p.toString();
    history.replaceState(null, '', `${location.pathname}${q ? `?${q}` : ''}${location.hash}`);
  };

  function show(id, seed) {
    const T = byId[id];
    let p;
    try { p = makeProblem(T, seed, X); } catch (e) { console.error(e); return; }
    cur = { T, seed, p, done: false };
    card.hidden = false;
    sum.hidden = true;
    meta.replaceChildren(
      ...(set ? [el('span', 'dr-count', fmtS('drill_n_of', { i: set.i + 1, n: set.list.length }))] : []),
      el('span', 'chip dr-chip', groupName[T.group]),
      el('strong', 'dr-name', T.name),
    );
    const vars = { ...p.show };
    qText.textContent = fillText(pickText(T.q, p.vals.v), vars);
    $('.dr-ask').textContent = fmtS('drill_answer_in', { tol: tolPct(tolOf(T, p.vals.v)), sig: T.sig });
    msg.hidden = true;
    unitSel.replaceChildren(...Object.keys(UNITS[p.sol.fam]).map(u => new Option(ulabel(u), u)));
    unitSel.value = p.sol.unit;
    unitSel.hidden = unitSel.options.length < 2;
    $('.dr-unit-one').textContent = unitSel.hidden ? ulabel(p.sol.unit) : '';
    input.value = '';
    input.disabled = false;
    form.querySelector('button[type=submit]').disabled = false;
    giveBtn.hidden = false;
    nextBtn.hidden = true;
    res.hidden = true;
    setUrl();
    try { input.focus({ preventScroll: true }); } catch {}
  }

  function answer(given) {
    if (!cur || cur.done) return;
    const { T, p } = cur, sol = p.sol;
    let x = null, u = unitSel.value, j = null;
    if (!given) {
      const a = parseAnswer(input.value, sol.fam);
      if (!a || a.bad) { msg.textContent = a ? fmtS('drill_bad_unit', { u: a.bad }) : S.drill_bad_input; msg.hidden = false; return; }
      msg.hidden = true;
      if (a.u) { u = a.u; unitSel.value = u; }
      x = a.v;
      j = judge(sol, x, u, tolOf(T, p.vals.v));
    }
    cur.done = true;
    input.disabled = true;
    form.querySelector('button[type=submit]').disabled = true;
    giveBtn.hidden = true;
    const ok = !!j?.ok;
    note(T.id, ok);
    if (set) set.results.push({ id: T.id, ok });
    // 判定
    const ansTxt = `${fs(sol.ans, T.sig)}${sol.unit ? ` ${ulabel(sol.unit)}` : ''}`;
    verdict.className = `dr-verdict ${ok ? 'ok' : 'ng'}`;
    verdict.replaceChildren(el('span', 'dr-mark', ok ? S.drill_correct : given ? S.drill_shown : S.drill_incorrect),
      el('span', 'dr-ans-line', fmtS('drill_answer_is', { a: ansTxt })),
      ...(j ? [el('span', 'dr-you', fmtS('drill_you', { a: `${fs(x, 4)}${u ? ` ${ulabel(u)}` : ''}`, e: errTxt(j.err) }))] : []));
    // 間違いの指摘
    const H = j?.hint;
    let hint = '';
    if (H?.kind === 'alt') {
      // 同じ値になる間違いが複数あるときは、文の違うものを並べる
      const texts = [...new Set((H.ids ?? [H.id]).map(id => fillText(T.mistakes[id] ?? '', { ...p.show, ...p.sol.k })).filter(Boolean))];
      hint = texts.length > 1 ? [S.drill_h_either, ...texts.map(t => `${bullet()}${t}`)].join('\n') : texts[0] ?? '';
    }
    else if (H?.kind === 'sign') hint = S.drill_h_sign;
    else if (H?.kind === 'unit') hint = fmtS('drill_h_unit', { u: ulabel(H.u), a: fs(convert(sol.fam, sol.ans, sol.unit, u), 4), uu: ulabel(u) });
    else if (H?.kind === 'pow') hint = fmtS('drill_h_pow', { n: (H.n > 0 ? '' : '−') + Math.abs(H.n) });
    else if (H?.kind === 'close') hint = fmtS('drill_h_close', { tol: tolPct(tolOf(T, p.vals.v)) });
    hintEl.textContent = hint;
    hintEl.hidden = !hint;
    // 途中式
    const vars = { ...p.show, ...p.sol.k };
    const steps = pickText(T.steps, p.vals.v) ?? [];
    const ol = el('ol');
    for (const s of steps) ol.append(el('li', null, fillText(s, vars)));
    stepsEl.replaceChildren(el('h3', null, S.drill_steps), ol);
    stepsEl.hidden = false;
    // リンク(計算ツールを同じ数値で、用語、やさしい解説)
    linksEl.replaceChildren();
    if (sol.tool && T.tools?.[sol.tool.id]) {
      const t = T.tools[sol.tool.id];
      const q = new URLSearchParams(Object.entries(sol.tool.q).map(([k, v]) => [k, String(v)]));
      const a = el('a', 'btn btn-ghost btn-small', t.n);
      a.href = `${t.u}?${q}`;
      linksEl.append(el('p', 'dr-tool', S.drill_tool_lead), a);
    }
    if (T.terms?.length || T.learn?.length) {
      const p2 = el('p', 'term-chips');
      p2.append(el('span', 'muted', `${S.drill_related}${colon()}`));
      for (const x of [...(T.learn ?? []), ...(T.terms ?? [])]) { const a = el('a', 'chip', x.n); a.href = x.u; p2.append(a, ' '); }
      linksEl.append(p2);
    }
    linksEl.hidden = !linksEl.childNodes.length;
    res.hidden = false;
    nextBtn.textContent = set && set.i + 1 >= set.list.length ? S.drill_to_summary : S.drill_next;
    nextBtn.hidden = false;
    renderRec();
    try { res.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch {}
  }

  function next() {
    if (set) {
      set.i++;
      if (set.i >= set.list.length) return summary();
      return show(set.list[set.i], newSeed());
    }
    const ids = selected();
    show(choose(ids, 1, pick.elements.weak.checked)[0], newSeed());
  }
  const selected = () => (selT.value ? [selT.value] : D.types.filter(T => !selG.value || T.group === selG.value).map(T => T.id));

  function summary() {
    card.hidden = true;
    sum.hidden = false;
    const n = set.results.length, ok = set.results.filter(x => x.ok).length;
    $('.dr-score').textContent = fmtS('drill_score', { ok, n });
    const miss = [...new Set(set.results.filter(x => !x.ok).map(x => x.id))];
    const ul = $('.dr-miss');
    ul.replaceChildren(...miss.map(id => {
      const li = el('li');
      const b = el('button', 'btn btn-ghost btn-small', fmtS('drill_retry_type', { name: byId[id].name }));
      b.type = 'button';
      b.addEventListener('click', () => { set = null; selG.value = byId[id].group; fillTypes(); selT.value = id; show(id, newSeed()); });
      li.append(b);
      return li;
    }));
    $('.dr-miss-h').hidden = !miss.length;
    cur = null;
    setUrl();
    set.done = true;
    try { sum.scrollIntoView({ block: 'nearest' }); } catch {}
  }

  function start() {
    const n = Number(pick.elements.n.value);
    const ids = selected();
    if (n > 1) {
      set = { list: choose(ids, n, pick.elements.weak.checked), i: 0, results: [] };
      show(set.list[0], newSeed());
    } else {
      set = null;
      show(choose(ids, 1, pick.elements.weak.checked)[0], newSeed());
    }
    try { card.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch {}
  }

  // ---- 記録の表示 ----
  function renderRec() {
    const box = $('.dr-rec-body');
    const rows = D.groups.map(g => {
      const ids = D.types.filter(T => T.group === g.id).map(T => T.id);
      const ok = ids.reduce((s, id) => s + (rec.t[id]?.ok ?? 0), 0), ng = ids.reduce((s, id) => s + (rec.t[id]?.ng ?? 0), 0);
      return { g, ok, ng, weak: ids.filter(id => rec.t[id]?.last === 0) };
    });
    const any = rows.some(r => r.ok + r.ng);
    box.replaceChildren();
    if (!any) { box.append(el('p', 'muted', S.drill_rec_empty)); $('[data-clear]').hidden = true; return; }
    $('[data-clear]').hidden = false;
    const table = el('table', 'dr-rec-table');
    const tr = el('tr');
    for (const h of [S.drill_rec_group, S.drill_rec_done, S.drill_rec_rate]) tr.append(el('th', null, h));
    table.append(el('thead'));
    table.tHead.append(tr);
    const tb = el('tbody');
    for (const r of rows) {
      if (!(r.ok + r.ng)) continue;
      const row = el('tr');
      row.append(el('th', null, r.g.name), el('td', null, String(r.ok + r.ng)), el('td', null, `${Math.round(r.ok / (r.ok + r.ng) * 100)} %`));
      tb.append(row);
    }
    table.append(tb);
    box.append(table);
    const weak = rows.flatMap(r => r.weak);
    if (weak.length) {
      const p = el('p', 'dr-weak');
      p.append(el('span', 'muted', `${S.drill_rec_weak}${colon()}`));
      for (const id of weak) {
        const b = el('button', 'chip', byId[id].name);
        b.type = 'button';
        b.addEventListener('click', () => { set = null; selG.value = byId[id].group; fillTypes(); selT.value = id; show(id, newSeed()); try { card.scrollIntoView({ block: 'start' }); } catch {} });
        p.append(b, ' ');
      }
      box.append(p);
    }
  }

  // ---- つなぐ ----
  pick.addEventListener('submit', e => { e.preventDefault(); start(); });
  form.addEventListener('submit', e => { e.preventDefault(); answer(false); });
  giveBtn.addEventListener('click', () => answer(true));
  nextBtn.addEventListener('click', next);
  againBtn.addEventListener('click', () => { if (!cur) return; const id = cur.T.id; if (set) set = null; show(id, newSeed()); });
  shareBtn.addEventListener('click', async () => {
    if (!cur) return;
    const url = `${location.origin}${location.pathname}?t=${encodeURIComponent(cur.T.id)}&s=${cur.seed}`;
    let ok = false;
    try { await navigator.clipboard.writeText(url); ok = true; } catch {}
    if (!ok) { try { const ta = el('textarea'); ta.value = url; document.body.append(ta); ta.select(); ok = document.execCommand('copy'); ta.remove(); } catch {} }
    const old = shareBtn.textContent;
    shareBtn.textContent = ok ? shareBtn.dataset.done : url;
    setTimeout(() => { shareBtn.textContent = old; }, 2000);
  });
  $('[data-sum-again]').addEventListener('click', start);
  $('[data-clear]').addEventListener('click', () => { if (!confirm(S.drill_rec_clear_q)) return; rec = { t: {} }; save(); renderRec(); });
  // 静的な一覧の「この型を解く」(JS があるときは、ページを読み直さずに出す)
  document.addEventListener('click', e => {
    const a = e.target.closest?.('a[data-drill-type]');
    if (!a) return;
    e.preventDefault();
    const id = a.dataset.drillType;
    set = null;
    selG.value = byId[id].group;
    fillTypes();
    selT.value = id;
    show(id, newSeed());
    try { card.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch {}
  });

  app.hidden = false;
  fillTypes();
  renderRec();
  // URL の ?t=型&s=種(s がなければ種を新しく)。?g=分野 で分野を選んでおく
  const params = new URLSearchParams(location.search);
  const g0 = params.get('g');
  if (g0 && groupName[g0]) { selG.value = g0; fillTypes(); }
  const t0 = params.get('t');
  if (t0 && byId[t0]) {
    selG.value = byId[t0].group;
    fillTypes();
    selT.value = t0;
    const s0 = Number(params.get('s'));
    show(t0, Number.isInteger(s0) && s0 > 0 ? s0 : newSeed());
  }
}
