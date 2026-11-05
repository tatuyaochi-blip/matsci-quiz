// 腐食速度の計算。3つの計算を1つのページで行い、使った式と、値を代入した形を見せる(実験レポートに写せるように)。
//   1. 重量減少(質量減少)から: CR = K·W/(A·T·D)(ASTM G1 の式 1 と、その K の表)
//   2. 腐食電流密度から(ファラデー則): CR = K1·icorr·EW/ρ、MR = K2·icorr·EW(ASTM G102 の式 5・6)。
//      合金の当量 EW = 1/Σ(nᵢ·fᵢ/Wᵢ)(G102 の式 4)。icorr は直接入れるか、分極抵抗から icorr = B/Rp、B = βa·βc/(2.303(βa+βc))(G102 の式 7・10)
//   3. 単位の換算と余寿命: mm/y ↔ mpy ↔ µm/y ↔ g/(m²·d) ↔ mdd、余寿命 = 腐食しろ ÷ 速度
// 値と出典は review の check/data.md。文言は data/tools/corrosionrate.json の text.{言語}.js
// 計算の関数(wlRates・ecRates・ewOf・sternGeary・convert など)は DOM なしで import できる(検算: review の check/check_corrosionrate.py と check/js_results.mjs)。

// =====================================================================
// 定数
// =====================================================================
// ASTM G1(-03)の 8.1 の式 1 の K。W は g、A は cm²、T は h、D は g/cm³。
// mm/y の 8.76×10⁴ は 8760 h/y × 10 mm/cm(1 年 = 365 日)。mpy の 3.45×10⁶ は 8760 × 10 ÷ 0.0254 = 3.4488×10⁶ を 3 桁に丸めた値。
// g/(m²·h) と mdd は K に D が掛かる(D が打ち消し合い、質量の速度は密度によらない)
export const G1K = { mmy: 8.76e4, mpy: 3.45e6, umy: 8.76e7, gm2h: 1.00e4, mdd: 2.40e6 };
// ASTM G102(-23)の 4.7 と表 2。icorr は µA/cm²、ρ は g/cm³、EW は g/mol(当量)。
// K1(mm/y)= 3.27×10⁻³、K1(mpy)= 0.1288、K2(g/(m²·d))= 8.954×10⁻³(4.7 の値。表 2 の SI の 0.8953 g/(A·d) とは丸めが違う)。
// mdd は表 2 の 0.0895(= K2 × 10。1 g/m² = 10 mg/dm²)
export const G102K = { k1mm: 3.27e-3, k1mpy: 0.1288, k2: 8.954e-3, k2mdd: 0.0895 };
// 単位の換算(計算 3)。1 mil = 0.0254 mm(1 in = 25.4 mm は定義)。質量の速度への換算は 1 年 = 365.25 日
export const MIL_MM = 0.0254;
export const YEAR_D = 365.25;
// 原子量: CIAAW の abridged standard atomic weights(https://www.ciaaw.org/abridged-atomic-weights.htm)
export const AW = { fe: 55.845, cr: 51.996, ni: 58.693, mo: 95.95, cu: 63.546, zn: 65.38, al: 26.982, mg: 24.305, ti: 47.867, sn: 118.71, mn: 54.938, si: 28.085 };
export const ELEMS = Object.keys(AW);
export const SYM = { fe: 'Fe', cr: 'Cr', ni: 'Ni', mo: 'Mo', cu: 'Cu', zn: 'Zn', al: 'Al', mg: 'Mg', ti: 'Ti', sn: 'Sn', mn: 'Mn', si: 'Si' };
// 価数の選択肢(ASTM G102 の表 1 に出てくる価数)。先頭が表 1 で最も低い価数で、既定にする。選択肢が1つの元素は固定
export const VALENCES = { fe: [2, 3], cr: [3, 6], ni: [2, 3], mo: [3, 4, 6], cu: [1, 2], zn: [2], al: [3], mg: [2], ti: [2, 3, 4], sn: [2, 4], mn: [2], si: [4] };

// =====================================================================
// 材料のプリセット。組成は質量 %(1 % 未満の元素は G102 の表 1 の注 1 と同じく入れない。残りを主成分とした)。
//   ステンレス鋼の組成は SAE の成分範囲(Cr・Ni・Mo)の中央。G102 の表 1 の注 2 も「範囲の中央」を使ったとしている。
//   密度(g/cm³)は代表値で、出典は src(下の DSRC)。g102 は G102 の表 1 の当量(最も低い価数の列)で、計算との照合に使う
// =====================================================================
export const MATS = [
  { id: 'cs', c: { fe: 100 }, rho: 7.87, ds: 'elgin', g102: 27.92 },
  { id: 'ss304', c: { fe: 71.75, cr: 19, ni: 9.25 }, rho: 7.9, ds: 'oto', g102: 25.12 },
  { id: 'ss316', c: { fe: 68.5, cr: 17, ni: 12, mo: 2.5 }, rho: 8.0, ds: 'oto', g102: 25.50 },
  { id: 'ss410', c: { fe: 87.5, cr: 12.5 }, rho: 7.7, ds: 'oto', g102: 25.94 },
  { id: 'ss430', c: { fe: 83, cr: 17 }, rho: 7.7, ds: 'oto', g102: 25.30 },
  { id: 'al', c: { al: 100 }, rho: 2.699, ds: 'wal', g102: 8.99 },
  { id: 'al6061', c: { al: 99, mg: 1 }, rho: 2.70, ds: 'asm6061', g102: 9.01 },
  { id: 'cu', c: { cu: 100 }, rho: 8.935, ds: 'wcu', g102: 63.55 },
  { id: 'zn', c: { zn: 100 }, rho: 7.140, ds: 'wzn', g102: 32.68 },
  { id: 'ti', c: { ti: 100 }, rho: 4.52, ds: 'ati', g102: 23.95 },
  { id: 'ni', c: { ni: 100 }, rho: 8.907, ds: 'wni', g102: 29.36 },
];
export const matById = Object.fromEntries(MATS.map(m => [m.id, m]));
export const DSRC = {
  elgin: 'https://www.mwcomponents.com/uploads/Resource-Center/Elgin-Material-Sheets/Carbon-Steel-Grade-1018-Data-Sheet_Elgin.pdf',
  oto: 'https://www.outokumpu.com/-/media/from-sharepoint/documents/product/outokumpu-steel-grades-properties-global-standards.pdf',
  wal: 'https://en.wikipedia.org/wiki/Aluminium',
  asm6061: 'https://asm.matweb.com/search/SpecificMaterial.asp?bassnum=MA6061t6',
  wcu: 'https://en.wikipedia.org/wiki/Copper',
  wzn: 'https://en.wikipedia.org/wiki/Zinc',
  ati: 'https://www.aerospacemetals.com/wp-content/uploads/2023/06/Allegheny-Ludlum-Grade-2-Titanium-UNS-R50400.pdf',
  wni: 'https://en.wikipedia.org/wiki/Nickel',
};
export const SRC = {
  g1: 'https://cdn.standards.iteh.ai/samples/30491/50c0318975cb48ccac624fe2331e5129/ASTM-G1-03.pdf',
  g102: 'https://cdn.standards.iteh.ai/samples/114600/5c102419cea6498bb885fd5722a3b1cc/ASTM-G102-23.pdf',
  sae: 'https://en.wikipedia.org/wiki/SAE_steel_grades',
  ciaaw: 'https://www.ciaaw.org/abridged-atomic-weights.htm',
};
// 各プリセットの価数: 表 1 の最も低い価数(VALENCES の先頭)
export const lowValences = () => Object.fromEntries(ELEMS.map(e => [e, VALENCES[e][0]]));

// =====================================================================
// 計算(単位はすべて内部の基準にそろえてから)
// =====================================================================
// 単位の換算: 質量 → g、面積 → cm²、時間 → h、電流密度 → µA/cm²
export const MASS_G = { g: 1, mg: 1e-3 };
export const AREA_CM2 = { cm2: 1, mm2: 0.01, m2: 1e4 };
export const TIME_H = { h: 1, d: 24 };
export const CUR_UA_CM2 = { ua_cm2: 1, ma_cm2: 1000, a_m2: 100 };

// 1. 重量減少から。W g、A cm²、T h、D g/cm³。G1 の K をそのまま使う(g/(m²·d) は g/(m²·h) の 24 倍)
export function wlRates(W, A, T, D) {
  if (!(W >= 0) || !(A > 0) || !(T > 0) || !(D > 0)) return null;
  const q = W / (A * T * D);
  const gm2h = (G1K.gm2h * D * W) / (A * T * D);
  return { mmy: G1K.mmy * q, mpy: G1K.mpy * q, umy: G1K.umy * q, gm2h, gm2d: gm2h * 24, mdd: (G1K.mdd * D * W) / (A * T * D) };
}

// 当量。comp: { 元素: 質量 % }、val: { 元素: 価数 }。合計が 100 でなければ合計で割る(質量分率にそろえる)。
// 返す terms は各元素の nᵢ·fᵢ/Wᵢ(画面の式に使う)
export function ewOf(comp, val) {
  const els = ELEMS.filter(e => comp[e] > 0);
  const sum = els.reduce((s, e) => s + comp[e], 0);
  if (!(sum > 0)) return null;
  const terms = els.map(e => ({ e, pct: comp[e], f: comp[e] / sum, n: val[e], W: AW[e], q: (val[e] * comp[e]) / sum / AW[e] }));
  const Q = terms.reduce((s, t) => s + t.q, 0);
  return { ew: 1 / Q, Q, sum, terms };
}

// シュテルン・ギアリー: βa・βc は V/decade(画面は mV/decade で入れる)、Rp は Ω·cm²。B は V、icorr は µA/cm²
export function sternGeary(ba, bc, rp) {
  if (!(ba > 0) || !(bc > 0) || !(rp > 0)) return null;
  const B = (ba * bc) / (2.303 * (ba + bc));
  return { B, icorr: (B / rp) * 1e6 };
}

// 2. 腐食電流密度から。icorr µA/cm²、EW g/mol、ρ g/cm³
export function ecRates(i, EW, rho) {
  if (!(i >= 0) || !(EW > 0)) return null;
  const mmy = rho > 0 ? G102K.k1mm * i * EW / rho : null;
  return { mmy, mpy: rho > 0 ? G102K.k1mpy * i * EW / rho : null, umy: mmy == null ? null : mmy * 1000, gm2d: G102K.k2 * i * EW, mdd: G102K.k2mdd * i * EW };
}

// 3. 単位の換算。unit: mmy・mpy・umy・gmd(g/(m²·d))・mdd。質量の単位は ρ(g/cm³)が要る。
// 1 mm/y の厚さの減りは 1 m² あたり 1 年に ρ × 1000 g → 1 日に ρ × 1000 / 365.25 g
export const GMD_PER_MMY = rho => (rho * 1000) / YEAR_D;
export function toMmy(v, unit, rho) {
  if (!(v >= 0)) return null;
  switch (unit) {
    case 'mmy': return v;
    case 'mpy': return v * MIL_MM;
    case 'umy': return v / 1000;
    case 'gmd': return rho > 0 ? v / GMD_PER_MMY(rho) : null;
    case 'mdd': return rho > 0 ? v / 10 / GMD_PER_MMY(rho) : null;
    default: return null;
  }
}
export function convert(v, unit, rho) {
  const mmy = toMmy(v, unit, rho);
  if (mmy == null) return null;
  const gmd = rho > 0 ? mmy * GMD_PER_MMY(rho) : null;
  return { mmy, mpy: mmy / MIL_MM, umy: mmy * 1000, gmd, mdd: gmd == null ? null : gmd * 10 };
}
// 余寿命(年)= 腐食しろ(mm)÷ 速度(mm/y)
export const lifeYears = (allow, mmy) => (allow >= 0 && mmy > 0 ? allow / mmy : null);

// 例のボタン(計算の例として作った値。実測のデータではない)
export const EXAMPLES = [
  { mode: 'wl', mat: 'cs', w: 0.085, wu: 'g', a: 30, au: 'cm2', t: 168, tu: 'h' },
  { mode: 'ec', mat: 'ss304', isrc: 'ic', ic: 0.15, icu: 'ua_cm2', ewm: 'comp' },
  { mode: 'conv', mat: 'cs', rate: 0.12, ru: 'mmy', allow: 3 },
];

// =====================================================================
// 画面(ブラウザのときだけ)
// =====================================================================
const form = typeof document !== 'undefined' ? document.getElementById('corrosionrate-form') : null;
if (form) setup();

function setup() {
  const T = JSON.parse(form.dataset.text);
  const U = T.ui;
  const home = document.documentElement.dataset.home ?? '/';
  const lang = document.documentElement.lang;
  const out = k => document.querySelector(`[data-out="${k}"]`);
  const fill = (s, v = {}) => String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m));
  const el = (tag, attrs = {}, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) if (v != null && v !== false) e.setAttribute(k, v);
    e.append(...kids.flat().filter(k => k != null && k !== false));
    return e;
  };
  const E = form.elements;

  // ---- 数の書式(言語で小数点が変わる。de はあとでコンマになる) ----
  const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
  const nfs = new Intl.NumberFormat(lang, { minimumSignificantDigits: 3, maximumSignificantDigits: 3, useGrouping: false });
  const nfd = d => new Intl.NumberFormat(lang, { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: false });
  const nfmax = d => new Intl.NumberFormat(lang, { maximumFractionDigits: d, useGrouping: false });
  // 有効数字 sig 桁。0.001 未満と 10⁵ 以上は a×10ⁿ の形
  const sci = (v, sig = 3) => {
    if (v == null || !Number.isFinite(v)) return '–';
    if (v === 0) return '0';
    const a = Math.abs(v);
    if (a >= 1e-3 && a < 1e5) return sig === 3 ? nfs.format(v) : new Intl.NumberFormat(lang, { minimumSignificantDigits: sig, maximumSignificantDigits: sig, useGrouping: false }).format(v);
    const [m, e] = v.toExponential(sig - 1).split('e');
    return `${nfd(sig - 1).format(Number(m))}×10${String(Number(e)).replace(/./g, ch => SUP[ch])}`;
  };
  // 入力の値はそのまま(余分な桁を足さない)
  const inp = v => nfmax(6).format(v);
  const signed = v => `${v < 0 ? '−' : '+'}${nfd(2).format(Math.abs(v))}`;
  const numOf = name => {
    const s = String(E[name]?.value ?? '').trim().replace(',', '.');
    return s === '' ? NaN : Number(s);
  };

  // ---- 見た目(このツールだけ) ----
  const css = document.createElement('style');
  css.textContent = `
#corrosionrate-form .cr-wide { grid-column: 1 / -1; margin: 0; }
#corrosionrate-form .cr-full { grid-column: span 2; }
@media (max-width: 480px) { #corrosionrate-form .cr-full { grid-column: 1 / -1; } }
#corrosionrate-form .dy-field[hidden], #corrosionrate-form .cr-group[hidden] { display: none !important; }
#corrosionrate-form .cr-group { grid-column: 1 / -1; border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; margin: 0; min-width: 0; }
#corrosionrate-form .cr-group legend { font-size: .88rem; color: var(--muted); padding: 0 4px; }
#corrosionrate-form .cr-comp { display: grid; grid-template-columns: repeat(auto-fill, minmax(118px, 1fr)); gap: 8px; }
#corrosionrate-form .cr-comp .dy-field { margin: 0; }
.cr-tabs { display: flex; flex-wrap: wrap; gap: 6px; }
.cr-tabs .btn { min-height: 40px; padding: 0 14px; }
.cr-tabs .btn[aria-pressed="true"] { background: var(--accent); color: #fff; border-color: var(--accent); }
.cr-ex { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.cr-ex .btn { min-height: 36px; padding: 0 12px; font-size: .85rem; }
.cr-box { margin: 12px 0; padding: 10px 12px; border-radius: 8px; background: var(--bg); }
.cr-box h3 { margin: 0 0 6px; font-size: 1rem; }
.cr-box ul { margin: 4px 0; padding-left: 1.3em; line-height: 1.7; }
.cr-box p { margin: 4px 0; line-height: 1.7; }
.cr-main { font-size: 1.05rem; line-height: 1.7; margin: 0 0 10px; padding: 10px 12px; border-radius: 8px; background: var(--accent-soft); }
.cr-eq { font-family: var(--mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace); font-size: .88rem; line-height: 1.8; white-space: pre-wrap; overflow-wrap: anywhere; margin: 4px 0; }
.cr-warn { color: var(--text); border-left: 3px solid var(--accent-2); padding-left: 8px; }
.cr-tbl-wrap { overflow-x: auto; }
.cr-tbl { width: 100%; border-collapse: collapse; font-size: .86rem; }
.cr-tbl th, .cr-tbl td { text-align: left; padding: 5px 6px; border-bottom: 1px solid var(--border); vertical-align: top; }
.cr-tbl td.cr-num { white-space: nowrap; font-variant-numeric: tabular-nums; }
.cr-tbl thead th { font-size: .78rem; color: var(--muted); font-weight: 600; }
.cr-tbl tr.cr-on { background: var(--accent-soft); }
@media (max-width: 480px) { .cr-tbl th, .cr-tbl td { padding: 4px 3px; font-size: .78rem; } #corrosionrate-form .cr-comp { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
.cr-links { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0 0; }
`;
  document.head.append(css);

  const lab = n => E[n]?.closest('label');
  // 選択肢の文字が長い欄は1行を使う(375px で欄の中で切れないように)
  for (const n of ['mat', 'isrc', 'ewm', 'ru']) lab(n)?.classList.add('cr-full');

  // ---- 計算の切り替え(タブ)。選んだ計算は mode の選択欄に入れる(URL に残る) ----
  const MODES = ['wl', 'ec', 'conv'];
  lab('mode').hidden = true;
  const tabs = el('div', { class: 'cr-tabs cr-wide', role: 'group', 'aria-label': U.tabs_label },
    ...MODES.map(m => el('button', { type: 'button', class: 'btn btn-ghost', 'data-mode': m, 'aria-pressed': 'false' }, U[`tab_${m}`])));
  form.querySelector('h2').after(tabs);
  tabs.addEventListener('click', e => {
    const b = e.target.closest('[data-mode]');
    if (!b) return;
    E.mode.value = b.dataset.mode;
    form.dispatchEvent(new Event('change', { bubbles: true }));
  });

  // ---- 例のボタン ----
  const ex = el('div', { class: 'cr-ex cr-wide' }, el('span', { class: 'muted' }, U.examples),
    ...EXAMPLES.map((x, i) => el('button', { type: 'button', class: 'btn btn-ghost', 'data-ex': String(i) }, U.ex[i])));
  tabs.after(ex);
  const exNote = el('p', { class: 'muted cr-wide' }, U.ex_note);
  ex.after(exNote);
  ex.addEventListener('click', e => {
    const b = e.target.closest('[data-ex]');
    if (!b) return;
    const x = EXAMPLES[Number(b.dataset.ex)];
    if (x.mat) applyMat(x.mat);
    for (const [k, v] of Object.entries(x)) if (k !== 'mat' && E[k]) E[k].value = String(v);
    form.dispatchEvent(new Event('change', { bubbles: true }));
  });

  // ---- 組成と価数の欄を1つの枠にまとめる ----
  const compSet = el('fieldset', { class: 'cr-group' }, el('legend', {}, U.comp_legend), el('div', { class: 'cr-comp' }));
  const grid = compSet.querySelector('.cr-comp');
  lab('ewm').after(compSet);
  for (const e of ELEMS) {
    grid.append(lab(`c_${e}`));
    if (E[`n_${e}`]) grid.append(lab(`n_${e}`));
  }
  compSet.append(el('p', { class: 'muted', style: 'margin:6px 0 0;font-size:.82rem' }, U.comp_help));
  // 分極抵抗の欄
  const rpSet = el('fieldset', { class: 'cr-group' }, el('legend', {}, U.rp_legend));
  lab('isrc').after(rpSet);
  for (const n of ['rp', 'ba', 'bc']) rpSet.append(lab(n));
  rpSet.append(el('p', { class: 'muted', style: 'margin:6px 0 0;font-size:.82rem' }, U.rp_help));

  // ---- 材料のプリセット: 選ぶと密度・組成・価数を入れる。密度や組成を書き換えたら「自分で入れる」にする ----
  function applyMat(id) {
    const m = matById[id];
    if (!m) return;
    E.mat.value = id;
    E.rho.value = String(m.rho);
    const lv = lowValences();
    for (const e of ELEMS) {
      E[`c_${e}`].value = m.c[e] ? String(m.c[e]) : '0';
      if (E[`n_${e}`]) E[`n_${e}`].value = String(lv[e]);
    }
  }
  form.addEventListener('change', e => { if (e.target === E.mat && E.mat.value !== 'custom') applyMat(E.mat.value); });
  form.addEventListener('input', e => {
    const n = e.target.name ?? '';
    if (n === 'rho' || n.startsWith('c_') || n.startsWith('n_')) E.mat.value = 'custom';
  });
  form.addEventListener('change', e => {
    const n = e.target.name ?? '';
    if (n.startsWith('n_')) E.mat.value = 'custom';
  });

  // ---- 表示の切り替え ----
  const SHOW = {
    wl: ['mat', 'rho', 'w', 'wu', 'a', 'au', 't', 'tu'],
    ec: ['mat', 'rho', 'isrc', 'ic', 'icu', 'ewm', 'ew'],
    conv: ['mat', 'rho', 'rate', 'ru', 'allow'],
  };
  function layout() {
    const m = MODES.includes(E.mode.value) ? E.mode.value : 'wl';
    for (const b of tabs.querySelectorAll('[data-mode]')) b.setAttribute('aria-pressed', String(b.dataset.mode === m));
    const on = new Set(SHOW[m]);
    for (const f of form.querySelectorAll('.dy-field')) {
      const n = f.querySelector('[name]')?.name;
      if (!n || n === 'mode' || n.startsWith('c_') || n.startsWith('n_') || ['rp', 'ba', 'bc'].includes(n)) continue;
      f.hidden = !on.has(n);
    }
    if (m === 'ec') {
      const rp = E.isrc.value === 'rp';
      lab('ic').hidden = rp; lab('icu').hidden = rp; rpSet.hidden = !rp;
      const direct = E.ewm.value === 'direct';
      compSet.hidden = direct; lab('ew').hidden = !direct;
    } else { rpSet.hidden = true; compSet.hidden = true; }
  }

  // ---- 結果の部品 ----
  const UNIT = { mmy: 'mm/y', mpy: 'mpy', umy: 'µm/y', gm2h: 'g/(m²·h)', gm2d: 'g/(m²·d)', gmd: 'g/(m²·d)', mdd: 'mdd' };
  const stats = rows => el('dl', { class: 'dy-stats' }, ...rows.map(([k, v]) => el('div', {}, el('dt', {}, k), el('dd', {}, v))));
  const eq = (...lines) => el('p', { class: 'cr-eq' }, lines.filter(Boolean).join('\n'));
  const box = (h, ...kids) => el('div', { class: 'cr-box' }, h ? el('h3', {}, h) : null, ...kids);
  const warn = t => el('p', { class: 'cr-warn' }, t);
  const matName = () => (E.mat.value === 'custom' ? U.custom : T.mats[E.mat.value]);
  const link = (href, text) => el('a', { href, target: '_blank', rel: 'noopener' }, text);

  // 1. 重量減少
  function renderWl(res) {
    const W0 = numOf('w'), A0 = numOf('a'), T0 = numOf('t'), D = numOf('rho');
    const W = W0 * MASS_G[E.wu.value], A = A0 * AREA_CM2[E.au.value], Th = T0 * TIME_H[E.tu.value];
    const r = wlRates(W, A, Th, D);
    if (!r) { res.append(warn(U.need_wl)); return; }
    res.append(el('p', { class: 'cr-main' }, fill(U.wl_main, { v: sci(r.mmy), m: matName() })));
    res.append(stats([[UNIT.mmy, sci(r.mmy)], [UNIT.mpy, sci(r.mpy)], [UNIT.umy, sci(r.umy)], [UNIT.gm2d, sci(r.gm2d)], [UNIT.mdd, sci(r.mdd)], [UNIT.gm2h, sci(r.gm2h)]]));
    const conv = [];
    if (E.wu.value !== 'g') conv.push(`W = ${inp(W0)} mg = ${sci(W, 4)} g`);
    if (E.au.value !== 'cm2') conv.push(`A = ${inp(A0)} ${E.au.value === 'mm2' ? 'mm²' : 'm²'} = ${sci(A, 4)} cm²`);
    if (E.tu.value !== 'h') conv.push(`T = ${inp(T0)} d × 24 = ${sci(Th, 4)} h`);
    res.append(box(U.h_eq,
      el('p', {}, U.wl_eq_lead),
      eq(...conv,
        `CR = K·W/(A·T·D)`,
        `CR(mm/y) = 8.76×10⁴ × ${sci(W, 4)} / (${sci(A, 4)} × ${sci(Th, 4)} × ${inp(D)}) = ${sci(r.mmy)} mm/y`,
        `CR(mpy) = 3.45×10⁶ × ${sci(W, 4)} / (${sci(A, 4)} × ${sci(Th, 4)} × ${inp(D)}) = ${sci(r.mpy)} mpy`,
        `g/(m²·h) = 1.00×10⁴ × D × W/(A·T·D) = 1.00×10⁴ × ${sci(W, 4)} / (${sci(A, 4)} × ${sci(Th, 4)}) = ${sci(r.gm2h)}`,
        `g/(m²·d) = 24 × ${sci(r.gm2h)} = ${sci(r.gm2d)}   mdd = 2.40×10⁶ × W/(A·T) = ${sci(r.mdd)}`),
      el('p', { class: 'muted' }, U.wl_eq_note)));
    res.append(box(U.h_wl_steps, el('ul', {}, ...U.wl_steps.map(s => el('li', {}, s)))));
  }

  // 2. 電気化学
  function renderEc(res) {
    const rho = numOf('rho');
    let i, sg = null;
    if (E.isrc.value === 'rp') {
      sg = sternGeary(numOf('ba') / 1000, numOf('bc') / 1000, numOf('rp'));
      if (!sg) { res.append(warn(U.need_rp)); return; }
      i = sg.icorr;
    } else {
      i = numOf('ic') * CUR_UA_CM2[E.icu.value];
      if (!(i >= 0)) { res.append(warn(U.need_ic)); return; }
    }
    let EW, ewr = null;
    if (E.ewm.value === 'direct') {
      EW = numOf('ew');
      if (!(EW > 0)) { res.append(warn(U.need_ew)); return; }
    } else {
      const comp = Object.fromEntries(ELEMS.map(e => [e, numOf(`c_${e}`)]));
      const val = Object.fromEntries(ELEMS.map(e => [e, E[`n_${e}`] ? Number(E[`n_${e}`].value) : VALENCES[e][0]]));
      if (ELEMS.some(e => comp[e] < 0)) { res.append(warn(U.need_comp)); return; }
      ewr = ewOf(comp, val);
      if (!ewr) { res.append(warn(U.need_comp)); return; }
      EW = ewr.ew;
    }
    const r = ecRates(i, EW, rho);
    res.append(el('p', { class: 'cr-main' }, r.mmy == null ? fill(U.ec_main_norho, { g: sci(r.gm2d) }) : fill(U.ec_main, { v: sci(r.mmy), m: matName() })));
    res.append(stats([[UNIT.mmy, sci(r.mmy)], [UNIT.mpy, sci(r.mpy)], [UNIT.umy, sci(r.umy)], [UNIT.gm2d, sci(r.gm2d)], [UNIT.mdd, sci(r.mdd)], ['icorr (µA/cm²)', sci(i)], ['EW', sci(EW, 4)]]));
    const lines = [];
    if (sg) {
      lines.push(`B = βa·βc / (2.303 (βa + βc)) = ${inp(numOf('ba') / 1000)} × ${inp(numOf('bc') / 1000)} / (2.303 × (${inp(numOf('ba') / 1000)} + ${inp(numOf('bc') / 1000)})) = ${sci(sg.B)} V`);
      lines.push(`icorr = B / Rp = ${sci(sg.B)} / ${inp(numOf('rp'))} = ${sci(sg.B / numOf('rp'))} A/cm² = ${sci(i)} µA/cm²`);
    } else if (E.icu.value !== 'ua_cm2') {
      lines.push(`icorr = ${inp(numOf('ic'))} ${E.icu.value === 'ma_cm2' ? 'mA/cm²' : 'A/m²'} = ${sci(i)} µA/cm²`);
    }
    if (ewr) {
      const sumTxt = ewr.terms.map(t => `${t.n}×${nfmax(4).format(t.f)}/${t.W}`).join(' + ');
      lines.push(`EW = 1 / Σ(nᵢ·fᵢ/Wᵢ) = 1 / (${sumTxt}) = 1 / ${sci(ewr.Q, 4)} = ${sci(EW, 4)}`);
    }
    if (r.mmy != null) {
      lines.push(`CR(mm/y) = K1·icorr·EW/ρ = 3.27×10⁻³ × ${sci(i)} × ${sci(EW, 4)} / ${inp(rho)} = ${sci(r.mmy)} mm/y`);
      lines.push(`CR(mpy) = 0.1288 × ${sci(i)} × ${sci(EW, 4)} / ${inp(rho)} = ${sci(r.mpy)} mpy`);
    }
    lines.push(`MR = K2·icorr·EW = 8.954×10⁻³ × ${sci(i)} × ${sci(EW, 4)} = ${sci(r.gm2d)} g/(m²·d)   mdd = 0.0895 × icorr × EW = ${sci(r.mdd)}`);
    res.append(box(U.h_eq, el('p', {}, U.ec_eq_lead), eq(...lines), el('p', { class: 'muted' }, U.ec_eq_note)));
    if (ewr) {
      const used = ewr.terms.map(t => `${SYM[t.e]} ${nfmax(3).format(t.pct)} % (n = ${t.n})`).join(lang === 'ja' ? '、' : ', ');
      const ps = [el('p', {}, fill(U.ew_used, { list: used }))];
      if (Math.abs(ewr.sum - 100) > 0.01) ps.push(warn(fill(U.sum_warn, { s: nfmax(2).format(ewr.sum) })));
      const m = matById[E.mat.value];
      if (m) ps.push(el('p', {}, fill(U.ew_g102, { calc: nfd(2).format(EW), g: nfd(2).format(m.g102), d: signed(100 * (EW / m.g102 - 1)) })));
      ps.push(el('p', { class: 'muted' }, U.valence_note));
      res.append(box(U.h_ew, ...ps));
    }
    if (sg) res.append(box(U.h_rp, el('p', {}, U.rp_note)));
  }

  // 3. 換算と余寿命
  function renderConv(res) {
    const v = numOf('rate'), rho = numOf('rho'), allow = numOf('allow');
    const r = convert(v, E.ru.value, rho);
    if (!r) { res.append(warn(['gmd', 'mdd'].includes(E.ru.value) ? U.need_rho : U.need_rate)); return; }
    const life = lifeYears(allow, r.mmy);
    res.append(el('p', { class: 'cr-main' }, life != null ? fill(U.life_main, { y: sci(life), a: inp(allow), v: sci(r.mmy) })
      : r.mmy === 0 ? U.life_zero : fill(U.conv_main, { v: sci(r.mmy) })));
    res.append(stats([[UNIT.mmy, sci(r.mmy)], [UNIT.mpy, sci(r.mpy)], [UNIT.umy, sci(r.umy)], [UNIT.gmd, sci(r.gmd)], [UNIT.mdd, sci(r.mdd)], [U.life, life == null ? '–' : `${sci(life)} ${U.years}`]]));
    const lines = [
      `1 mm/y = 1 / 0.0254 mpy = 39.37 mpy   1 mm/y = 1000 µm/y`,
      rho > 0 ? `g/(m²·d) = mm/y × ρ × 1000 / 365.25 = ${sci(r.mmy)} × ${inp(rho)} × 1000 / 365.25 = ${sci(r.gmd)}` : null,
      rho > 0 ? `mdd = 10 × g/(m²·d) = ${sci(r.mdd)}` : null,
      life != null ? `${U.life_eq} = ${inp(allow)} mm / ${sci(r.mmy)} mm/y = ${sci(life)} ${U.years}` : null,
    ];
    res.append(box(U.h_eq, eq(...lines), el('p', { class: 'muted' }, U.conv_note)));
    res.append(box(U.h_life, el('ul', {}, ...U.life_limits.map(s => el('li', {}, s)))));
  }

  // 材料の表(プリセットの組成・価数・EW・G102 の EW・密度・出典)
  function matTable() {
    const lv = lowValences();
    const rows = MATS.map(m => {
      const r = ewOf(m.c, lv);
      const comp = ELEMS.filter(e => m.c[e]).map(e => `${SYM[e]} ${nfmax(2).format(m.c[e])}`).join(' ');
      const val = ELEMS.filter(e => m.c[e]).map(e => `${SYM[e]}/${lv[e]}`).join(' ');
      return el('tr', { class: m.id === E.mat.value ? 'cr-on' : null },
        el('th', { scope: 'row' }, T.mats[m.id]),
        el('td', {}, comp), el('td', {}, val),
        el('td', { class: 'cr-num' }, nfd(2).format(r.ew)), el('td', { class: 'cr-num' }, nfd(2).format(m.g102)),
        el('td', { class: 'cr-num' }, link(DSRC[m.ds], inp(m.rho))));
    });
    return el('div', {},
      el('p', { class: 'muted' }, U.mat_lead),
      el('div', { class: 'cr-tbl-wrap' }, el('table', { class: 'cr-tbl' },
        el('thead', {}, el('tr', {}, ...U.mat_cols.map(c => el('th', { scope: 'col' }, c)))),
        el('tbody', {}, ...rows))),
      el('p', { class: 'muted' }, U.mat_src, ' ', link(SRC.g102, 'ASTM G102-23'), ' · ', link(SRC.sae, 'SAE steel grades'), ' · ', link(SRC.ciaaw, 'CIAAW')));
  }

  function render() {
    layout();
    const res = out('res');
    res.replaceChildren();
    const m = MODES.includes(E.mode.value) ? E.mode.value : 'wl';
    if (m === 'wl') renderWl(res); else if (m === 'ec') renderEc(res); else renderConv(res);
    // 共通の注意
    res.append(box(U.h_caution, el('ul', {}, ...U.cautions.map(s => el('li', {}, s)))));
    res.append(el('div', { class: 'cr-links' },
      el('a', { class: 'btn btn-ghost', href: `${home}tools/galvanic-corrosion-checker/` }, U.l_galvanic),
      el('a', { class: 'btn btn-ghost', href: `${home}formulas/#f-faraday` }, U.l_formula)));
    out('mats').replaceChildren(matTable());
  }
  form.addEventListener('submit', e => e.preventDefault());
  form.addEventListener('input', () => setTimeout(render));
  form.addEventListener('change', () => setTimeout(render));
  render();
}
