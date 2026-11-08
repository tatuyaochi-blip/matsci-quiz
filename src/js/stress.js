// 応力状態ラボ。次を計算して、式に値を代入した形と図を見せる。
//   1. 平面応力の座標変換とモールの応力円: σx・σy・τxy → 角度 θ の面の σ・τ、主応力 σ₁・σ₂ と主方向、面内の最大せん断応力とその面
//   2. 3次元の応力状態: 6成分 → 主応力3つ(対称行列の固有値。ヤコビ法)・不変量 I1・I2・I3・静水圧応力・偏差応力・3つのモールの円
//   3. 降伏条件: トレスカとミーゼスの相当応力と安全率(応力の成分か、薄肉円筒 σθ = pr/t・σz = pr/2t から)。平面応力の降伏曲面の図
//   4. ひずみゲージのロゼット: 直角(0°/45°/90°)とデルタ(0°/60°/120°)の読み → 主ひずみ・主方向・最大せん断ひずみ・主応力(平面応力)
//   5. 平面応力と平面ひずみ: 同じ面内の応力で σz・εz・相当応力を比べる
// 符号の約束: 引張が正。τxy は +x 面で +y 向きが正。θ は x 軸から反時計回りが正(x' 軸 = 傾けた面の法線)。
// モールの円は σ を右向き、τ を下向きに正として描く(要素を θ 回すと、円の上の点も同じ向きに 2θ 回る)。
// 式の出典は data/tools/stress.json の text.{言語}.js.ui の src_* と、review の check/sources.md。
// 計算の関数(transform・principal2・eig3・invariants・vonMises・tresca・yieldState・thinCylinder・rosette・rosetteTN・
// strainToStress・planeCompare・hooke3)は DOM なしで import できる(検算: review の check/calc_stress.py と check/js_results.mjs)。

// =====================================================================
// 定数と小さな道具
// =====================================================================
export const RAD = Math.PI / 180;
const ok = (...v) => v.every(Number.isFinite);
const scaleOf = (...v) => Math.max(...v.map(Math.abs), 0);
// 丸めの誤差で出る 1e-15 などを 0 にする(全体の大きさに対して)
const tidy = (v, s) => (Math.abs(v) <= 1e-12 * Math.max(s, 1e-300) ? 0 : v);
// 角度を (−90°, 90°] に
export const wrap90 = a => { let x = ((a + 90) % 180 + 180) % 180 - 90; if (x === -90) x = 90; return x; };

// =====================================================================
// 1. 平面応力(応力は同じ単位なら何でも。θ は度)
// =====================================================================
export function transform(sx, sy, txy, th) {
  if (!ok(sx, sy, txy, th)) return null;
  const c = Math.cos(2 * th * RAD), s = Math.sin(2 * th * RAD), m = (sx + sy) / 2, d = (sx - sy) / 2, S = scaleOf(sx, sy, txy);
  const a = tidy(m + d * c + txy * s, S), t = tidy(-d * s + txy * c, S);
  return { sx: a, sy: tidy(sx + sy - a, S), txy: t };
}
// 主応力(面内)。thp は σ₁ の向き(x 軸から反時計回り、(−90°, 90°])、ths は τ が +τmax になる面の法線の向き(thp − 45°)
// iso: 円が点になる(σx = σy かつ τxy = 0)とき、どの向きも主方向なので角度は NaN
export function principal2(sx, sy, txy) {
  if (!ok(sx, sy, txy)) return null;
  const S = scaleOf(sx, sy, txy);
  const c = (sx + sy) / 2, d = (sx - sy) / 2, r = tidy(Math.hypot(d, txy), S);
  const iso = r === 0;
  const thp = iso ? NaN : wrap90(0.5 * Math.atan2(2 * txy, sx - sy) / RAD);
  const s1 = tidy(c + r, S), s2 = tidy(c - r, S);
  // σz = 0 を3つ目の主応力とした絶対の最大せん断応力
  const hi = Math.max(s1, s2, 0), lo = Math.min(s1, s2, 0);
  return { c, r, s1, s2, thp, thp2: iso ? NaN : wrap90(thp + 90), ths: iso ? NaN : wrap90(thp - 45), tauMax: r, tauAbs: (hi - lo) / 2, iso };
}

// =====================================================================
// 2. 3次元。対称行列の固有値と固有ベクトル(ヤコビ法)。σ₁ ≥ σ₂ ≥ σ₃ に並べる
// =====================================================================
export function eig3(sx, sy, sz, txy, tyz, tzx) {
  if (!ok(sx, sy, sz, txy, tyz, tzx)) return null;
  const S = scaleOf(sx, sy, sz, txy, tyz, tzx);
  const A = [[sx, txy, tzx], [txy, sy, tyz], [tzx, tyz, sz]];
  const V = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 60; sweep++) {
    const off = Math.abs(A[0][1]) + Math.abs(A[0][2]) + Math.abs(A[1][2]);
    if (off <= 1e-15 * Math.max(S, 1e-300)) break;
    for (const [p, q] of [[0, 1], [0, 2], [1, 2]]) {
      if (Math.abs(A[p][q]) <= 1e-300) continue;
      const th = (A[q][q] - A[p][p]) / (2 * A[p][q]);
      const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < 3; k++) { // 列 p・q
        const akp = A[k][p], akq = A[k][q];
        A[k][p] = c * akp - s * akq; A[k][q] = s * akp + c * akq;
      }
      for (let k = 0; k < 3; k++) { // 行 p・q
        const apk = A[p][k], aqk = A[q][k];
        A[p][k] = c * apk - s * aqk; A[q][k] = s * apk + c * aqk;
      }
      for (let k = 0; k < 3; k++) {
        const vkp = V[k][p], vkq = V[k][q];
        V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq;
      }
    }
  }
  const list = [0, 1, 2].map(i => ({ s: tidy(A[i][i], S), v: [V[0][i], V[1][i], V[2][i]] })).sort((a, b) => b.s - a.s);
  // 向きの符号: いちばん大きい成分を正に(向きは ± どちらでも同じ主軸)
  for (const e of list) { const k = e.v.reduce((m, x, i) => (Math.abs(x) > Math.abs(e.v[m]) ? i : m), 0); if (e.v[k] < 0) e.v = e.v.map(x => -x); e.v = e.v.map(x => tidy(x, 1)); }
  const s = list.map(e => e.s);
  const tol = 1e-9 * Math.max(S, 1e-300);
  return { s, v: list.map(e => e.v), same12: Math.abs(s[0] - s[1]) <= tol, same23: Math.abs(s[1] - s[2]) <= tol };
}
export function invariants(sx, sy, sz, txy, tyz, tzx) {
  if (!ok(sx, sy, sz, txy, tyz, tzx)) return null;
  const S = scaleOf(sx, sy, sz, txy, tyz, tzx);
  const I1 = sx + sy + sz;
  const I2 = sx * sy + sy * sz + sz * sx - txy * txy - tyz * tyz - tzx * tzx;
  const I3 = sx * sy * sz + 2 * txy * tyz * tzx - sx * tyz * tyz - sy * tzx * tzx - sz * txy * txy;
  const sm = I1 / 3;
  const dx = sx - sm, dy = sy - sm, dz = sz - sm;
  const J2 = ((sx - sy) ** 2 + (sy - sz) ** 2 + (sz - sx) ** 2) / 6 + txy * txy + tyz * tyz + tzx * tzx;
  const J3 = dx * dy * dz + 2 * txy * tyz * tzx - dx * tyz * tyz - dy * tzx * tzx - dz * txy * txy;
  return { I1: tidy(I1, S), I2: tidy(I2, S * S), I3: tidy(I3, S ** 3), sm: tidy(sm, S), dev: [tidy(dx, S), tidy(dy, S), tidy(dz, S)], J2: tidy(J2, S * S), J3: tidy(J3, S ** 3),
    toct: Math.sqrt(Math.max(tidy(J2, S * S), 0) * 2 / 3) };
}

// =====================================================================
// 3. 降伏条件
// =====================================================================
export const vonMises = (sx, sy, sz, txy, tyz, tzx) => (ok(sx, sy, sz, txy, tyz, tzx)
  ? Math.sqrt(Math.max(0, ((sx - sy) ** 2 + (sy - sz) ** 2 + (sz - sx) ** 2) / 2 + 3 * (txy * txy + tyz * tyz + tzx * tzx))) : NaN);
export const tresca = (sx, sy, sz, txy, tyz, tzx) => { const e = eig3(sx, sy, sz, txy, tyz, tzx); return e ? e.s[0] - e.s[2] : NaN; };
// 平面応力の主応力 σa・σb(σz = 0)でのミーゼス・トレスカ
export const mises2 = (a, b) => Math.sqrt(Math.max(0, a * a - a * b + b * b));
export const tresca2 = (a, b) => Math.max(a, b, 0) - Math.min(a, b, 0);
// 安全率 n = σY/σeq(σeq = 0 なら Infinity)
export const safety = (sY, seq) => (ok(sY, seq) && sY > 0 && seq >= 0 ? (seq === 0 ? Infinity : sY / seq) : NaN);
export function yieldState(c, sY) {
  const e = eig3(c.sx, c.sy, c.sz, c.txy, c.tyz, c.tzx);
  if (!e) return null;
  const vm = vonMises(c.sx, c.sy, c.sz, c.txy, c.tyz, c.tzx), tr = e.s[0] - e.s[2];
  return { p: e.s, vm, tr, nVm: safety(sY, vm), nTr: safety(sY, tr), kVm: sY / Math.sqrt(3), kTr: sY / 2, ratio: vm > 0 ? tr / vm : NaN };
}
// 薄肉円筒(両端を閉じた容器)。p は内圧、r は半径、t は肉厚(r と t は同じ単位)。半径方向の応力は小さいとして 0
export const thinCylinder = (p, r, t) => (ok(p, r, t) && r > 0 && t > 0 ? { hoop: (p * r) / t, axial: (p * r) / (2 * t), rt: r / t } : null);

// =====================================================================
// 4. ロゼット。ゲージ a・b・c は a から反時計回りに並べる(直角 0/45/90°、デルタ 0/60/120°)
// ε は µε でも何でも同じ単位。γxy は工学せん断ひずみ(テンソルのせん断ひずみ ε_xy = γxy/2)
// φ1: ゲージ a から ε₁ の向きまでの角度(反時計回りが正、(−90°, 90°])
// =====================================================================
export const ROSETTES = { rect: [0, 45, 90], delta: [0, 60, 120] };
export function rosette(type, ea, eb, ec) {
  const ang = ROSETTES[type];
  if (!ang || !ok(ea, eb, ec)) return null;
  // ε(θ) = εx cos²θ + εy sin²θ + γxy sinθ cosθ の3本を解く(a は 0° なので εx = εa)
  const row = d => [Math.cos(d * RAD) ** 2, Math.sin(d * RAD) ** 2, Math.sin(d * RAD) * Math.cos(d * RAD)];
  const M = ang.map(row), y = [ea, eb, ec];
  const det = m => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const D = det(M);
  const col = (k) => det(M.map((r, i) => r.map((v, j) => (j === k ? y[i] : v))));
  const S = scaleOf(ea, eb, ec);
  const ex = tidy(col(0) / D, S), ey = tidy(col(1) / D, S), gxy = tidy(col(2) / D, S);
  const c = (ex + ey) / 2, R = tidy(Math.hypot((ex - ey) / 2, gxy / 2), S);
  const iso = R === 0;
  const phi = iso ? NaN : wrap90(0.5 * Math.atan2(gxy, ex - ey) / RAD);
  return { ex, ey, gxy, exy: gxy / 2, e1: tidy(c + R, S), e2: tidy(c - R, S), c, R, gmax: 2 * R, phi, iso };
}
// メーカーの技術資料(Vishay Micro-Measurements TN-515)の主ひずみの閉じた式。テストで rosette と比べる
export function rosetteTN(type, e1, e2, e3) {
  if (type === 'rect') {
    const rr = Math.SQRT1_2 * Math.hypot(e1 - e2, e2 - e3);
    return { p: (e1 + e3) / 2 + rr, q: (e1 + e3) / 2 - rr };
  }
  const rr = (Math.SQRT2 / 3) * Math.sqrt((e1 - e2) ** 2 + (e2 - e3) ** 2 + (e3 - e1) ** 2);
  return { p: (e1 + e2 + e3) / 3 + rr, q: (e1 + e2 + e3) / 3 - rr };
}
// 平面応力のフックの法則(等方・線形弾性)。E と σ は同じ単位系(E[MPa]・ε[1] → σ[MPa])
export function strainToStress(e1, e2, E, nu) {
  if (!ok(e1, e2, E, nu) || !(E > 0) || !(nu > -1 && nu < 0.5)) return null;
  const k = E / (1 - nu * nu);
  return { s1: k * (e1 + nu * e2), s2: k * (e2 + nu * e1), ez: (-nu / (1 - nu)) * (e1 + e2), G: E / (2 * (1 + nu)) };
}

// =====================================================================
// 5. 一般化したフックの法則と、平面応力・平面ひずみの比べ(σ は MPa、E は MPa、ε は 1)
// =====================================================================
export const hooke3 = (sx, sy, sz, E, nu) => ({ ex: (sx - nu * (sy + sz)) / E, ey: (sy - nu * (sz + sx)) / E, ez: (sz - nu * (sx + sy)) / E });
export function planeCompare(sx, sy, txy, E, nu) {
  if (!ok(sx, sy, txy, E, nu) || !(E > 0) || !(nu > -1 && nu < 0.5)) return null;
  const G = E / (2 * (1 + nu)), g = txy / G;
  const mk = sz => ({ sz, ...hooke3(sx, sy, sz, E, nu), gxy: g, vm: vonMises(sx, sy, sz, txy, 0, 0), tr: tresca(sx, sy, sz, txy, 0, 0), p: eig3(sx, sy, sz, txy, 0, 0).s });
  const ps = mk(0), pe = mk(nu * (sx + sy));
  pe.ez = tidy(pe.ez, scaleOf(sx, sy) / E);
  return { ps, pe, G };
}

// 例(値は計算のしかたを示すために作ったもの。実在の部材の測定データではない)
export const EXAMPLES = [
  { mode: 'plane', sx: 80, sy: -40, txy: 45, th: 30 },
  { mode: 'yield', ys: 'st', sx: 0, sy: 0, sz: 0, txy: 100, tyz: 0, tzx: 0, sy0: 250 },
  { mode: 'yield', ys: 'pv', pp: 2, pr: 500, pt: 10, sy0: 250 },
  { mode: 'ros', rt: 'rect', ea: 450, eb: 380, ec: -120, em: 200, nu: 0.3 },
  { mode: 'ros', rt: 'delta', ea: 300, eb: 500, ec: -200, em: 70, nu: 0.33 },
  { mode: 'tri', sx: 60, sy: 30, sz: -20, txy: 20, tyz: -10, tzx: 15 },
];

// =====================================================================
// 画面(ブラウザのときだけ)
// =====================================================================
const form = typeof document !== 'undefined' ? document.getElementById('stress-form') : null;
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
  const nfd = d => new Intl.NumberFormat(lang, { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: false });
  const nfmax = d => new Intl.NumberFormat(lang, { maximumFractionDigits: d, useGrouping: false });
  const minus = t => t.replace(/^-/, '−');
  const fix = (v, d) => (v === Infinity ? '∞' : v == null || !Number.isFinite(v) ? '–' : minus(nfd(d).format(Object.is(Number(v.toFixed(d)), -0) ? 0 : v)));
  const inp = v => (Number.isFinite(v) ? minus(nfmax(6).format(v)) : '–');
  const numOf = name => {
    const s = String(E[name]?.value ?? '').trim().replace(',', '.');
    return s === '' ? NaN : Number(s);
  };
  const decFix = t => (lang === 'de' ? t.replace(/(\d)\.(\d)/g, '$1,$2') : t);
  // 応力の小数の桁: 入力の大きさに合わせる(100 MPa 台なら 1 桁)
  let DP = 1;
  const setDP = (...v) => { const s = scaleOf(...v.filter(Number.isFinite)); DP = s >= 10 ? 1 : s >= 1 ? 2 : s > 0 ? 3 : 1; };
  const st = v => fix(v, DP); // 応力の数(単位なし)
  const mpa = v => `${st(v)} MPa`;
  const deg = v => `${fix(v, 2)}°`;
  const ue = v => fix(v, 1); // µε
  const ueu = v => `${ue(v)} µε`;
  const pa = t => (String(t).startsWith('−') ? `(${t})` : t); // 式の中の負の数を括弧で(「+ −60」「−−65」を避ける)

  // ---- 見た目(このツールだけ) ----
  const css = document.createElement('style');
  css.textContent = `
#stress-form .ss-wide { grid-column: 1 / -1; margin: 0; }
#stress-form .dy-field[hidden] { display: none !important; }
#stress-form .dy-field:has(select) { grid-column: span 2; }
@media (max-width: 480px) { #stress-form .dy-field:has(select) { grid-column: 1 / -1; } }
.ss-tabs { display: flex; flex-wrap: wrap; gap: 6px; }
.ss-tabs .btn { min-height: 40px; padding: 0 12px; }
.ss-tabs .btn[aria-pressed="true"] { background: var(--accent); color: #fff; border-color: var(--accent); }
.ss-ex { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.ss-ex .btn { min-height: 36px; padding: 0 12px; font-size: .85rem; }
.ss-conv { font-size: .85rem; border-left: 3px solid var(--accent-2); padding-left: 8px; }
.ss-box { margin: 12px 0; padding: 10px 12px; border-radius: 8px; background: var(--bg); }
.ss-box h3 { margin: 0 0 6px; font-size: 1rem; }
.ss-box ul { margin: 4px 0; padding-left: 1.3em; line-height: 1.7; }
.ss-box p { margin: 4px 0; line-height: 1.7; }
.ss-main { font-size: 1.05rem; line-height: 1.7; margin: 0 0 10px; padding: 10px 12px; border-radius: 8px; background: var(--accent-soft); }
.ss-eq { font-family: var(--mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace); font-size: .88rem; line-height: 1.8; white-space: pre-wrap; overflow-wrap: anywhere; margin: 4px 0; }
.dy-stats .ss-sub { display: block; font-size: .72rem; font-weight: 500; color: var(--muted); }
.ss-warn { color: var(--text); border-left: 3px solid var(--ng); padding-left: 8px; }
.ss-tbl-wrap { overflow-x: auto; }
.ss-tbl { width: 100%; border-collapse: collapse; font-size: .86rem; }
.ss-tbl th, .ss-tbl td { text-align: left; padding: 5px 6px; border-bottom: 1px solid var(--border); vertical-align: top; }
.ss-tbl td.ss-num { white-space: nowrap; font-variant-numeric: tabular-nums; }
.ss-tbl thead th { font-size: .78rem; color: var(--muted); font-weight: 600; }
@media (max-width: 480px) { .ss-tbl th, .ss-tbl td { padding: 4px 3px; font-size: .78rem; } }
.ss-links { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0 0; }
.ss-figs { display: flex; flex-wrap: wrap; gap: 12px; margin: 0 0 8px; }
.ss-fig { flex: 1 1 300px; max-width: 420px; min-width: 0; margin: 0; }
.ss-fig svg { width: 100%; height: auto; display: block; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; }
.ss-fig figcaption { font-size: .8rem; color: var(--muted); margin: 4px 0 0; line-height: 1.5; }
.ss-slider[hidden] { display: none; }
.ss-slider { display: flex; align-items: center; gap: 8px; font-size: .85rem; color: var(--muted); flex: 1 1 100%; }
.ss-slider input { flex: 1; min-width: 0; }
.ss-key { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: .8rem; color: var(--muted); margin: 4px 0 0; }
.ss-key span::before { content: ""; display: inline-block; width: 18px; height: 0; border-top: 3px solid var(--c); vertical-align: middle; margin-right: 5px; }
.ss-key span.ss-dash::before { border-top-style: dashed; }
`;
  document.head.append(css);

  const lab = n => E[n]?.closest('label');

  // ---- タブ ----
  const MODES = ['plane', 'tri', 'yield', 'ros', 'pstrain'];
  lab('mode').hidden = true;
  const tabs = el('div', { class: 'ss-tabs ss-wide', role: 'group', 'aria-label': U.tabs_label },
    ...MODES.map(m => el('button', { type: 'button', class: 'btn btn-ghost', 'data-mode': m, 'aria-pressed': 'false' }, U[`tab_${m}`])));
  form.querySelector('h2').after(tabs);
  tabs.addEventListener('click', e => {
    const b = e.target.closest('[data-mode]');
    if (!b) return;
    E.mode.value = b.dataset.mode;
    form.dispatchEvent(new Event('change', { bubbles: true }));
  });

  // ---- 例 ----
  const ex = el('div', { class: 'ss-ex ss-wide' }, el('span', { class: 'muted' }, U.examples),
    ...EXAMPLES.map((x, i) => el('button', { type: 'button', class: 'btn btn-ghost', 'data-ex': String(i) }, U.ex[i])));
  tabs.after(ex);
  const conv = el('p', { class: 'muted ss-wide ss-conv' });
  ex.after(el('p', { class: 'muted ss-wide', style: 'font-size:.85rem' }, U.ex_note), conv);
  ex.addEventListener('click', e => {
    const b = e.target.closest('[data-ex]');
    if (!b) return;
    for (const [k, v] of Object.entries(EXAMPLES[Number(b.dataset.ex)])) if (E[k]) E[k].value = String(v);
    form.dispatchEvent(new Event('change', { bubbles: true }));
  });

  // ---- 表示の切り替え ----
  const SHOW = {
    plane: ['sx', 'sy', 'txy', 'th'],
    tri: ['sx', 'sy', 'sz', 'txy', 'tyz', 'tzx'],
    yield: ['ys', 'sx', 'sy', 'sz', 'txy', 'tyz', 'tzx', 'pp', 'pr', 'pt', 'sy0'],
    ros: ['rt', 'ea', 'eb', 'ec', 'em', 'nu'],
    pstrain: ['sx', 'sy', 'txy', 'em', 'nu', 'sy0'],
  };
  const mode = () => (MODES.includes(E.mode.value) ? E.mode.value : 'plane');
  function layout() {
    const m = mode();
    for (const b of tabs.querySelectorAll('[data-mode]')) b.setAttribute('aria-pressed', String(b.dataset.mode === m));
    const on = new Set(SHOW[m]);
    if (m === 'yield') { for (const n of (E.ys.value === 'pv' ? ['sx', 'sy', 'sz', 'txy', 'tyz', 'tzx'] : ['pp', 'pr', 'pt'])) on.delete(n); }
    for (const f of form.querySelectorAll('.dy-field')) {
      const n = f.querySelector('[name]')?.name;
      if (!n || n === 'mode') continue;
      f.hidden = !on.has(n);
    }
    conv.textContent = m === 'ros' ? U.conv_ros : m === 'tri' ? U.conv_tri : U.conv_plane;
  }

  // ---- 部品 ----
  const stats = rows => el('dl', { class: 'dy-stats' }, ...rows.map(([k, v]) => el('div', {}, el('dt', {}, k), el('dd', {}, v))));
  const eq = (...lines) => el('p', { class: 'ss-eq' }, decFix(lines.filter(x => x != null && x !== false).join('\n')));
  const box = (h, ...kids) => el('div', { class: 'ss-box' }, h ? el('h3', {}, h) : null, ...kids);
  const warn = t => el('p', { class: 'ss-warn' }, t);
  const ul = list => el('ul', {}, ...list.map(s => el('li', {}, s)));
  const link = (href, text) => el('a', { href, target: '_blank', rel: 'noopener' }, text);
  const main = t => el('p', { class: 'ss-main' }, t);
  const twoLine = (a, b) => el('span', {}, a, el('small', { class: 'ss-sub' }, b));
  const table = (cols, rows) => el('div', { class: 'ss-tbl-wrap' }, el('table', { class: 'ss-tbl' },
    el('thead', {}, el('tr', {}, ...cols.map(c => el('th', { scope: 'col' }, c)))),
    el('tbody', {}, ...rows.map(r => el('tr', {}, ...r.map((c, j) => (j === 0 ? el('th', { scope: 'row' }, c) : el('td', { class: 'ss-num' }, c))))))));
  const figs = el('div', { class: 'ss-figs' });
  out('res').before(figs);
  const NS = 'http://www.w3.org/2000/svg';
  const svgOf = (w, h, label, inner) => {
    const s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', `0 0 ${w} ${h}`);
    s.setAttribute('role', 'img');
    s.setAttribute('aria-label', label);
    s.innerHTML = inner;
    return s;
  };
  const fig = (svg, caption, keys) => el('figure', { class: 'ss-fig' }, svg, keys ? el('div', { class: 'ss-key' }, ...keys.map(([c, t, d]) => el('span', { class: d ? 'ss-dash' : null, style: `--c:${c}` }, t))) : null, caption ? el('figcaption', {}, caption) : null);
  const f1 = v => (Number.isFinite(v) ? v.toFixed(1) : '0');
  const tx = (x, y, s, o = {}) => `<text x="${f1(x)}" y="${f1(y)}" font-size="${o.size ?? 12}" text-anchor="${o.anchor ?? 'middle'}" fill="${o.fill ?? 'var(--text)'}" stroke="var(--bg)" stroke-width="3" paint-order="stroke"${o.w ? ` font-weight="${o.w}"` : ''}>${s}</text>`;
  const line = (x1, y1, x2, y2, o = {}) => `<line x1="${f1(x1)}" y1="${f1(y1)}" x2="${f1(x2)}" y2="${f1(y2)}" stroke="${o.c ?? 'var(--muted)'}" stroke-width="${o.w ?? 1}"${o.dash ? ` stroke-dasharray="${o.dash}"` : ''}${o.m ? ` marker-end="url(#${o.m})"` : ''}/>`;
  const dot = (x, y, c, r = 4) => `<circle cx="${f1(x)}" cy="${f1(y)}" r="${r}" fill="${c}" stroke="var(--bg)" stroke-width="1.5"/>`;
  let mid = 0;
  const arrowDefs = () => {
    mid++;
    return { id: `ssa${mid}`, defs: ['var(--accent)', 'var(--accent-2)', 'var(--ng)', 'var(--text)', 'var(--muted)'].map((c, i) => `<marker id="ssa${mid}-${i}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${c}"/></marker>`).join('') };
  };
  const AC = 'var(--accent)', AC2 = 'var(--accent-2)', NG = 'var(--ng)', MU = 'var(--muted)', TXT = 'var(--text)';

  // モールの円の図。circles: [{ c, r, cls, dash }], pts: [{ s, t, label, color }]。τ は下向きが正
  function mohrSvg(circles, pts, extra = {}) {
    const W = 340, H = 300, pad = 30;
    const lo = Math.min(0, ...circles.map(k => k.c - k.r)), hi = Math.max(0, ...circles.map(k => k.c + k.r));
    const rMax = Math.max(...circles.map(k => k.r), 0);
    let span = Math.max(hi - lo, 2 * rMax, 1e-9);
    const k = Math.min((W - 2 * pad) / span, (H - 2 * pad - 10) / Math.max(2 * rMax, span * 0.25, 1e-9));
    const cx = W / 2 - ((lo + hi) / 2) * k, cy = H / 2;
    const X = s => cx + s * k, Y = t => cy + t * k; // τ 正は下
    let g = '';
    g += line(pad / 2, cy, W - pad / 2, cy, { c: MU });
    g += line(X(0), 12, X(0), H - 12, { c: MU });
    g += tx(W - 8, cy - 6, 'σ', { anchor: 'end', fill: MU });
    g += tx(X(0) + 6, H - 6, U.fig_tau_down, { anchor: 'start', fill: MU, size: 11 });
    g += tx(X(0) - 4, cy + 14, '0', { anchor: 'end', fill: MU, size: 11 });
    for (const c of circles) g += `<circle cx="${f1(X(c.c))}" cy="${f1(cy)}" r="${f1(Math.max(c.r * k, 0.5))}" fill="none" stroke="${c.color}" stroke-width="${c.w ?? 2}"${c.dash ? ' stroke-dasharray="5 4"' : ''}/>`;
    if (extra.diam) for (const [a, b, c] of extra.diam) g += line(X(a.s), Y(a.t), X(b.s), Y(b.t), { c, w: 1.5 });
    if (extra.arc) g += extra.arc(X, Y, k);
    for (const p of pts) {
      g += dot(X(p.s), Y(p.t), p.color);
      if (p.label) g += tx(X(p.s) + (p.dx ?? 0), Y(p.t) + (p.dy ?? -8), p.label, { fill: p.color, size: 12, w: 600 });
    }
    return svgOf(W, H, U.fig_mohr, g);
  }

  // 要素の図(θ 回した要素の応力の向き)
  function elementSvg(sx, sy, txy, th, t) {
    const W = 300, H = 300, cx = 150, cy = 150, a = 46;
    const A = arrowDefs();
    const S = Math.max(scaleOf(sx, sy, txy), 1e-9);
    const L = v => 16 + 34 * Math.min(Math.abs(v) / S, 1);
    const rot = (x, y, d) => { const c = Math.cos(d * RAD), s = Math.sin(d * RAD); return [cx + x * c - y * s, cy - (x * s + y * c)]; }; // 数学の座標(上が +y)→ 画面
    let g = `<defs>${A.defs}</defs>`;
    // 元の軸
    g += line(cx - 120, cy, cx + 128, cy, { c: MU, dash: '3 3' }) + tx(cx + 128, cy - 6, 'x', { fill: MU, anchor: 'end' });
    g += line(cx, cy + 120, cx, cy - 128, { c: MU, dash: '3 3' }) + tx(cx + 8, cy - 118, 'y', { fill: MU, anchor: 'start' });
    // 回した要素
    const corners = [[a, a], [-a, a], [-a, -a], [a, -a]].map(([x, y]) => rot(x, y, th));
    g += `<polygon points="${corners.map(p => p.map(f1).join(',')).join(' ')}" fill="var(--accent-soft)" stroke="${TXT}" stroke-width="1.5"/>`;
    // x' 軸
    const [xa, ya] = rot(118, 0, th);
    g += line(cx, cy, xa, ya, { c: AC, w: 1.2, dash: '4 3' }) + tx(...rot(124, 10, th), "x'", { fill: AC, w: 600 });
    // 角度の弧
    if (Math.abs(th) > 0.5) {
      const r = 34, [ex, ey] = rot(r, 0, th);
      g += `<path d="M${f1(cx + r)},${f1(cy)} A${r},${r} 0 0 ${th > 0 ? 0 : 1} ${f1(ex)},${f1(ey)}" fill="none" stroke="${AC}" stroke-width="1.2" marker-end="url(#${A.id}-0)"/>`;
      g += tx(...rot(r + 14, 0, th / 2), `θ`, { fill: AC, size: 12 });
    }
    // 法線応力の矢印(引張は外向き)
    const normal = (v, d, col, lbl) => {
      if (v === 0) return '';
      const len = L(v);
      let s = '';
      for (const sg of [1, -1]) {
        const [x0, y0] = rot(sg * (a + (v > 0 ? 2 : 2 + len)), 0, d), [x1, y1] = rot(sg * (a + (v > 0 ? 2 + len : 2)), 0, d);
        s += line(x0, y0, x1, y1, { c: col, w: 2.2, m: `${A.id}-${col === AC ? 0 : 1}` });
      }
      const [lx, ly] = rot(a + len + 18, 0, d);
      return s + tx(lx, ly + 4, lbl, { fill: col, size: 11, w: 600 });
    };
    g += normal(t.sx, th, AC, `σx'`);
    g += normal(t.sy, th + 90, AC2, `σy'`);
    // せん断の矢印: +x' 面で +y' 向き(τ > 0)、ほかの3面はつり合いの向き
    if (t.txy !== 0) {
      const sg = Math.sign(t.txy), len = L(t.txy) * 0.9;
      const seg = (px, py, dx, dy) => { const [x0, y0] = rot(px - dx * len / 2, py - dy * len / 2, th), [x1, y1] = rot(px + dx * len / 2, py + dy * len / 2, th); return line(x0, y0, x1, y1, { c: NG, w: 2, m: `${A.id}-2` }); };
      // 法線の矢印と重ならないよう、面の端の寄りに置く
      const o = a * 0.55;
      g += seg(a + 7, -sg * o, 0, sg) + seg(-a - 7, sg * o, 0, -sg) + seg(-sg * o, a + 7, sg, 0) + seg(sg * o, -a - 7, -sg, 0);
      const [lx, ly] = rot(a + 14, a + 4, th);
      g += tx(lx, ly, `τx'y'`, { fill: NG, size: 11, w: 600, anchor: 'start' });
    }
    return svgOf(W, H, U.fig_elem, g);
  }

  // ---- 1. 平面応力 ----
  // θ のつまみ(図の上。動かすと θ の欄を書き換える。描き直しで消えないように figs の外に置く)
  const range = el('input', { type: 'range', min: '-90', max: '90', step: '0.5', value: '0', 'aria-label': U.slider });
  const sliderVal = el('span', {});
  const sliderBox = el('div', { class: 'ss-slider' }, el('span', {}, U.slider), range, sliderVal);
  range.addEventListener('input', () => { E.th.value = range.value; form.dispatchEvent(new Event('input', { bubbles: true })); });
  figs.before(sliderBox);
  function renderPlane(res) {
    const sx = numOf('sx'), sy = numOf('sy'), txy = numOf('txy'), th = numOf('th');
    if (!ok(sx, sy, txy)) return res.append(warn(U.need_s));
    const thv = Number.isFinite(th) ? th : 0;
    setDP(sx, sy, txy);
    const p = principal2(sx, sy, txy), t = transform(sx, sy, txy, thv);
    const iso = p.iso;
    res.append(main(iso ? fill(U.plane_main_iso, { s: mpa(p.s1) })
      : fill(U.plane_main, { s1: mpa(p.s1), s2: mpa(p.s2), a: deg(p.thp), b: deg(p.thp2), t: mpa(p.tauMax), c: deg(p.ths) })));
    res.append(stats([[U.s_s1, mpa(p.s1)], [U.s_s2, mpa(p.s2)], [U.s_thp, iso ? U.any_dir : deg(p.thp)], [U.s_tmax, mpa(p.tauMax)], [U.s_ths, iso ? U.any_dir : twoLine(deg(p.ths), fill(U.s_ths_sub, { c: mpa(p.c) }))],
      [U.s_tabs, twoLine(mpa(p.tauAbs), U.s_tabs_sub)],
      [fill(U.s_sth, { t: deg(thv) }), mpa(t.sx)], [fill(U.s_tth, { t: deg(thv) }), mpa(t.txy)], [fill(U.s_syth, { t: deg(thv) }), mpa(t.sy)]]));
    const c2 = Math.cos(2 * thv * RAD), s2 = Math.sin(2 * thv * RAD);
    res.append(box(U.h_eq, el('p', {}, U.plane_eq_lead), eq(
      `C = (σx + σy)/2 = (${inp(sx)} + ${inp(sy)})/2 = ${st(p.c)} MPa`,
      `R = √[((σx − σy)/2)² + τxy²] = √[(${st((sx - sy) / 2)})² + (${inp(txy)})²] = ${st(p.r)} MPa`,
      `σ₁, σ₂ = C ± R = ${st(p.s1)}, ${st(p.s2)} MPa`,
      iso ? U.eq_iso : `θp = ½·atan2(2τxy, σx − σy) = ½·atan2(${st(2 * txy)}, ${st(sx - sy)}) = ${fix(p.thp, 2)}°  (${U.eq_dir_s1})`,
      iso ? '' : `θs = θp − 45° = ${fix(p.ths, 2)}°  (τ = +τmax = R, σ = C)`,
      '',
      `θ = ${fix(thv, 2)}°, 2θ = ${fix(2 * thv, 2)}°`,
      `σx' = C + (σx − σy)/2·cos2θ + τxy·sin2θ = ${st(p.c)} + ${pa(st((sx - sy) / 2))} × ${pa(fix(c2, 4))} + ${pa(inp(txy))} × ${pa(fix(s2, 4))} = ${st(t.sx)} MPa`,
      `τx'y' = −(σx − σy)/2·sin2θ + τxy·cos2θ = −${pa(st((sx - sy) / 2))} × ${pa(fix(s2, 4))} + ${pa(inp(txy))} × ${pa(fix(c2, 4))} = ${st(t.txy)} MPa`,
      `σy' = σx + σy − σx' = ${st(t.sy)} MPa`),
      el('p', { class: 'muted' }, U.plane_note)));
    if (!Number.isFinite(th)) res.append(warn(U.th_empty));
    if (Math.abs(thv) > 360) res.append(warn(U.th_big));
    if (p.s1 * p.s2 > 0) res.append(warn(fill(U.abs_note, { t: mpa(p.tauAbs) })));
    res.append(box(U.h_caution, ul(U.plane_cautions)));
    // 図
    const P = { s: t.sx, t: t.txy };
    const diam = [[{ s: sx, t: txy }, { s: sy, t: -txy }, MU], [P, { s: t.sy, t: -t.txy }, AC]];
    const zcir = [{ c: p.s1 / 2, r: Math.abs(p.s1) / 2 }, { c: p.s2 / 2, r: Math.abs(p.s2) / 2 }].map(k => ({ ...k, color: MU, dash: true, w: 1 }));
    const svg = mohrSvg([{ c: p.c, r: p.r, color: AC }, ...zcir], [
      { s: sx, t: txy, label: 'X', color: TXT, dy: txy >= 0 ? 16 : -8 }, { s: sy, t: -txy, label: 'Y', color: TXT, dy: -txy >= 0 ? 16 : -8 },
      { s: p.s1, t: 0, label: 'σ₁', color: AC2, dx: 12, dy: -6 }, { s: p.s2, t: 0, label: 'σ₂', color: AC2, dx: -12, dy: -6 },
      { s: p.c, t: p.r, label: 'τmax', color: NG, dy: -8 }, { s: t.sx, t: t.txy, label: "x'", color: AC, dy: t.txy >= 0 ? 16 : -8 }], { diam });
    sliderBox.hidden = false;
    if (document.activeElement !== range) range.value = String(Math.max(-90, Math.min(90, thv)));
    sliderVal.textContent = deg(thv);
    figs.append(fig(svg, U.cap_mohr, [[AC, U.key_circle], [MU, U.key_zero, true]]),
      fig(elementSvg(sx, sy, txy, thv, t), fill(U.cap_elem, { t: deg(thv) })));
  }

  // ---- 2. 3次元 ----
  const dirTxt = v => `(${v.map(x => fix(x, 4)).join(', ')})`;
  function renderTri(res) {
    const c = ['sx', 'sy', 'sz', 'txy', 'tyz', 'tzx'].map(numOf);
    if (!ok(...c)) return res.append(warn(U.need_s6));
    setDP(...c);
    const e = eig3(...c), I = invariants(...c);
    const [s1, s2, s3] = e.s;
    const all = e.same12 && e.same23;
    res.append(main(fill(U.tri_main, { a: mpa(s1), b: mpa(s2), c: mpa(s3), t: mpa((s1 - s3) / 2), m: mpa(I.sm) })));
    if (all) res.append(warn(s1 === 0 ? U.tri_zero : U.tri_hydro));
    else if (e.same12 || e.same23) res.append(warn(U.tri_double));
    res.append(stats([[U.s_p1, mpa(s1)], [U.s_p2, mpa(s2)], [U.s_p3, mpa(s3)], [U.s_tmax3, mpa((s1 - s3) / 2)], [U.s_sm, mpa(I.sm)], [U.s_vm, mpa(Math.sqrt(3 * I.J2))]]));
    const dirs = all ? [] : e.v;
    res.append(box(U.h_dirs, table(U.dir_cols, e.s.map((s, i) => [`σ${'₁₂₃'[i]}`, mpa(s), dirs.length && !((i < 2 && e.same12) || (i > 0 && e.same23)) ? dirTxt(e.v[i]) : U.dir_any])), el('p', { class: 'muted' }, U.dir_note)));
    const [sx, sy, sz, txy, tyz, tzx] = c;
    const sq = v => `${pa(st(v))}²`;
    res.append(box(U.h_eq, el('p', {}, U.tri_eq_lead), eq(
      `I1 = σx + σy + σz = ${st(I.I1)} MPa`,
      `I2 = σxσy + σyσz + σzσx − τxy² − τyz² − τzx² = ${st(sx * sy)} + ${pa(st(sy * sz))} + ${pa(st(sz * sx))} − ${sq(txy)} − ${sq(tyz)} − ${sq(tzx)} = ${st(I.I2)} MPa²`,
      `I3 = det[σ] = ${st(I.I3)} MPa³`,
      `σ³ − I1σ² + I2σ − I3 = 0  → σ₁ = ${st(s1)}, σ₂ = ${st(s2)}, σ₃ = ${st(s3)} MPa`,
      `${U.eq_check}: σ₁ + σ₂ + σ₃ = ${st(s1 + s2 + s3)}, σ₁σ₂ + σ₂σ₃ + σ₃σ₁ = ${st(s1 * s2 + s2 * s3 + s3 * s1)}, σ₁σ₂σ₃ = ${st(s1 * s2 * s3)}`,
      '',
      `σm = I1/3 = ${st(I.sm)} MPa`,
      `${U.eq_dev}: sx = ${st(I.dev[0])}, sy = ${st(I.dev[1])}, sz = ${st(I.dev[2])} MPa (τ ${U.eq_same})`,
      `${U.eq_devp}: ${st(s1 - I.sm)}, ${st(s2 - I.sm)}, ${st(s3 - I.sm)} MPa`,
      `J2 = [(σ₁ − σ₂)² + (σ₂ − σ₃)² + (σ₃ − σ₁)²]/6 = ${st(I.J2)} MPa²,  σ_vM = √(3J2) = ${st(Math.sqrt(3 * I.J2))} MPa`,
      `τoct = √(2J2/3) = ${st(I.toct)} MPa,  τmax = (σ₁ − σ₃)/2 = ${st((s1 - s3) / 2)} MPa`),
      el('p', { class: 'muted' }, U.tri_note)));
    res.append(box(U.h_caution, ul(U.tri_cautions)));
    const circ = [{ c: (s1 + s3) / 2, r: (s1 - s3) / 2, color: AC }, { c: (s1 + s2) / 2, r: (s1 - s2) / 2, color: AC2 }, { c: (s2 + s3) / 2, r: (s2 - s3) / 2, color: NG }];
    figs.append(fig(mohrSvg(circ, [{ s: s1, t: 0, label: 'σ₁', color: TXT, dx: 10, dy: 16 }, { s: s2, t: 0, label: 'σ₂', color: TXT, dy: 16 }, { s: s3, t: 0, label: 'σ₃', color: TXT, dx: -10, dy: 16 }, { s: (s1 + s3) / 2, t: (s1 - s3) / 2, label: 'τmax', color: AC, dy: 16 }]),
      U.cap_tri, [[AC, '(σ₁, σ₃)'], [AC2, '(σ₁, σ₂)'], [NG, '(σ₂, σ₃)']]));
  }

  // ---- 3. 降伏条件 ----
  function yieldSvg(a, b, sY, stateOk) {
    const W = 320, H = 320, cx = 160, cy = 160;
    const A = arrowDefs();
    const m = Math.max(1.3 * sY, stateOk ? 1.15 * Math.max(Math.abs(a), Math.abs(b)) : 0);
    const k = 140 / m;
    const X = v => cx + v * k, Y = v => cy - v * k;
    let g = `<defs>${A.defs}</defs>`;
    g += line(X(-m), cy, X(m), cy, { c: MU, m: `${A.id}-4` }) + line(cx, Y(-m), cx, Y(m), { c: MU, m: `${A.id}-4` });
    g += tx(X(m) - 4, cy - 8, 'σa', { anchor: 'end', fill: MU }) + tx(cx + 6, Y(m) + 12, 'σb', { anchor: 'start', fill: MU });
    // ミーゼスの楕円 σa² − σaσb + σb² = σY²(主軸は 45° の方向、半径 √2σY と √(2/3)σY)
    const pts = [];
    for (let i = 0; i <= 180; i++) {
      const t = (i / 180) * 2 * Math.PI, u = Math.SQRT2 * sY * Math.cos(t), v = Math.sqrt(2 / 3) * sY * Math.sin(t);
      pts.push([(u - v) / Math.SQRT2, (u + v) / Math.SQRT2]);
    }
    g += `<path d="${pts.map(([p, q], i) => `${i ? 'L' : 'M'}${f1(X(p))},${f1(Y(q))}`).join('')}Z" fill="none" stroke="${AC}" stroke-width="2"/>`;
    const hex = [[1, 0], [1, 1], [0, 1], [-1, 0], [-1, -1], [0, -1]].map(([p, q]) => [p * sY, q * sY]);
    g += `<path d="${hex.map(([p, q], i) => `${i ? 'L' : 'M'}${f1(X(p))},${f1(Y(q))}`).join('')}Z" fill="none" stroke="${AC2}" stroke-width="2" stroke-dasharray="6 4"/>`;
    g += tx(X(sY) + 4, cy + 14, 'σY', { anchor: 'start', fill: MU, size: 11 }) + tx(cx - 4, Y(sY) - 4, 'σY', { anchor: 'end', fill: MU, size: 11 });
    // 参照の点: 純粋せん断(σa = −σb)の線
    g += line(X(-m * 0.8), Y(m * 0.8), X(m * 0.8), Y(-m * 0.8), { c: MU, dash: '2 4' });
    g += tx(X(m * 0.8) - 2, Y(-m * 0.8) + 14, U.fig_shear, { anchor: 'end', fill: MU, size: 11 });
    if (stateOk) {
      const vm = mises2(a, b), tr = tresca2(a, b);
      if (vm > 0) {
        const f = sY / vm, ft = sY / tr;
        g += line(cx, cy, X(a * Math.max(f, ft, 1) * 1.05), Y(b * Math.max(f, ft, 1) * 1.05), { c: MU, dash: '4 3' });
        g += dot(X(a * f), Y(b * f), AC, 3.5) + dot(X(a * ft), Y(b * ft), AC2, 3.5);
      }
      g += dot(X(a), Y(b), NG, 5) + tx(X(a) + 8, Y(b) - 8, U.fig_now, { fill: NG, anchor: 'start', w: 600 });
    }
    return svgOf(W, H, U.fig_yield, g);
  }
  function renderYield(res) {
    const sY = numOf('sy0');
    let c, pv = null;
    if (E.ys.value === 'pv') {
      const p = numOf('pp'), r = numOf('pr'), t = numOf('pt');
      pv = thinCylinder(p, r, t);
      if (!pv) return res.append(warn(U.need_pv));
      c = { sx: pv.axial, sy: pv.hoop, sz: 0, txy: 0, tyz: 0, tzx: 0 };
      setDP(pv.hoop, pv.axial);
    } else {
      const v = ['sx', 'sy', 'sz', 'txy', 'tyz', 'tzx'].map(numOf);
      if (!ok(...v)) return res.append(warn(U.need_s6));
      c = { sx: v[0], sy: v[1], sz: v[2], txy: v[3], tyz: v[4], tzx: v[5] };
      setDP(...v);
    }
    if (!(sY > 0)) return res.append(warn(U.need_sy));
    const y = yieldState(c, sY);
    const nT = x => (x === Infinity ? '∞' : fix(x, 2));
    res.append(main(fill(U.yield_main, { a: mpa(y.tr), b: nT(y.nTr), c: mpa(y.vm), d: nT(y.nVm) })));
    const yieldNow = Math.max(y.tr, y.vm) >= sY;
    if (y.vm >= sY) res.append(warn(U.yield_both));
    else if (y.tr >= sY) res.append(warn(U.yield_tr));
    res.append(stats([[U.s_tr, mpa(y.tr)], [U.s_ntr, nT(y.nTr)], [U.s_vm, mpa(y.vm)], [U.s_nvm, nT(y.nVm)], [U.s_ratio, Number.isFinite(y.ratio) ? fix(y.ratio, 3) : '–'],
      [U.s_k, twoLine(`${st(y.kTr)} / ${st(y.kVm)} MPa`, U.s_k_sub)]]));
    const [p1, p2, p3] = y.p;
    const lines = [];
    if (pv) {
      lines.push(`σθ = pr/t = ${inp(numOf('pp'))} × ${inp(numOf('pr'))} / ${inp(numOf('pt'))} = ${st(pv.hoop)} MPa`,
        `σz = pr/(2t) = ${st(pv.axial)} MPa,  σr ≈ 0  (r/t = ${fix(pv.rt, 1)})`, '');
    }
    lines.push(`σ₁ = ${st(p1)}, σ₂ = ${st(p2)}, σ₃ = ${st(p3)} MPa`,
      `${U.eq_tresca}: σ_T = σ₁ − σ₃ = ${st(p1)} − (${st(p3)}) = ${st(y.tr)} MPa,  n = σY/σ_T = ${inp(sY)}/${st(y.tr)} = ${nT(y.nTr)}`,
      `${U.eq_mises}: σ_vM = √{½[(σ₁ − σ₂)² + (σ₂ − σ₃)² + (σ₃ − σ₁)²]} = √{½[${sqr(p1 - p2)} + ${sqr(p2 - p3)} + ${sqr(p3 - p1)}]} = ${st(y.vm)} MPa`,
      `     n = σY/σ_vM = ${inp(sY)}/${st(y.vm)} = ${nT(y.nVm)}`,
      `k (${U.eq_kshear}): ${U.eq_tresca} σY/2 = ${st(y.kTr)} MPa, ${U.eq_mises} σY/√3 = ${st(y.kVm)} MPa`);
    res.append(box(U.h_eq, el('p', {}, pv ? U.yield_eq_pv : U.yield_eq_lead), eq(...lines), el('p', { class: 'muted' }, U.yield_note)));
    if (pv && pv.rt < 10) res.append(warn(U.pv_thick));
    // 3つの基準の状態
    const ref = [[U.ref_shear, '1', '2τ', '√3·τ', `σY/2 = ${st(sY / 2)}`, `σY/√3 = ${st(sY / Math.sqrt(3))}`],
      [U.ref_uni, '2', 'σ', 'σ', `σY = ${st(sY)}`, `σY = ${st(sY)}`],
      [U.ref_bi, '3', 'σ', 'σ', `σY = ${st(sY)}`, `σY = ${st(sY)}`]];
    res.append(box(U.h_ref, table(U.ref_cols, ref.map(r => [r[0], r[2], r[3], r[4], r[5]])), el('p', {}, U.ref_note)));
    const plane = c.sz === 0 && c.tyz === 0 && c.tzx === 0;
    const pin = plane ? principal2(c.sx, c.sy, c.txy) : null;
    if (!plane) res.append(warn(U.fig_plane_only));
    if (yieldNow) res.append(warn(U.yield_beyond));
    res.append(box(U.h_caution, ul(U.yield_cautions)));
    figs.append(fig(yieldSvg(pin?.s1 ?? 0, pin?.s2 ?? 0, sY, plane), plane ? fill(U.cap_yield, { a: mpa(pin.s1), b: mpa(pin.s2) }) : U.fig_plane_only, [[AC, U.key_mises], [AC2, U.key_tresca, true]]));
  }
  const sqr = v => `(${st(v)})²`;

  // ---- 4. ロゼット ----
  function rosetteSvg(type, phi) {
    const W = 300, H = 280, cx = 140, cy = 160;
    const A = arrowDefs();
    const ang = ROSETTES[type];
    const P = (r, d) => [cx + r * Math.cos(d * RAD), cy - r * Math.sin(d * RAD)];
    let g = `<defs>${A.defs}</defs>`;
    g += line(cx - 110, cy, cx + 130, cy, { c: MU, dash: '3 3' }) + tx(cx + 130, cy + 16, U.fig_x, { anchor: 'end', fill: MU, size: 11 });
    ang.forEach((d, i) => {
      const [x0, y0] = P(28, d), [x1, y1] = P(104, d);
      // ゲージの格子(太い線)
      g += line(x0, y0, x1, y1, { c: TXT, w: 7 }) + line(x0, y0, x1, y1, { c: 'var(--bg)', w: 3 });
      const [lx, ly] = P(d === 0 ? 112 : 122, d);
      g += tx(lx, ly - (d === 0 ? 12 : 0), `${'abc'[i]} (${d}°)`, { w: 600, size: 12 });
    });
    // 反時計回りの矢印
    const r = 58, [ex, ey] = P(r, ang[2] - 8);
    g += `<path d="M${f1(cx + r)},${f1(cy)} A${r},${r} 0 0 0 ${f1(ex)},${f1(ey)}" fill="none" stroke="${AC2}" stroke-width="1.5" marker-end="url(#${A.id}-1)"/>`;
    g += tx(...P(r + 4, ang[2] + 14), U.fig_ccw, { fill: AC2, size: 11, anchor: 'end' });
    if (Number.isFinite(phi)) {
      const [a0, b0] = P(-120, phi), [a1, b1] = P(120, phi);
      g += line(a0, b0, a1, b1, { c: NG, w: 2, dash: '7 4' }) + tx(...P(132, phi), 'ε₁', { fill: NG, w: 600 });
      const [c0, d0] = P(-90, phi + 90), [c1, d1] = P(90, phi + 90);
      g += line(c0, d0, c1, d1, { c: AC, w: 1.5, dash: '4 4' }) + tx(...P(100, phi + 90), 'ε₂', { fill: AC, w: 600 });
    }
    g += dot(cx, cy, TXT, 3);
    return svgOf(W, H, U.fig_ros, g);
  }
  function renderRos(res) {
    const type = E.rt.value === 'delta' ? 'delta' : 'rect';
    const ea = numOf('ea'), eb = numOf('eb'), ec = numOf('ec'), Eg = numOf('em'), nu = numOf('nu');
    if (!ok(ea, eb, ec)) return res.append(warn(U.need_e));
    const r = rosette(type, ea, eb, ec);
    const ang = ROSETTES[type];
    setDP(1);
    const sp = ok(Eg, nu) ? strainToStress(r.e1 * 1e-6, r.e2 * 1e-6, Eg * 1000, nu) : null;
    if (sp) setDP(sp.s1, sp.s2);
    res.append(main(fill(r.iso ? U.ros_main_iso : U.ros_main, { a: ueu(r.e1), b: ueu(r.e2), p: deg(r.phi), g: ueu(r.gmax), s1: sp ? mpa(sp.s1) : '–', s2: sp ? mpa(sp.s2) : '–' })));
    if (!sp) res.append(warn(U.need_enu));
    const sci6 = v => `${fix(v, 1)}×10⁻⁶`;
    res.append(stats([[U.s_e1, twoLine(ueu(r.e1), sci6(r.e1))], [U.s_e2, twoLine(ueu(r.e2), sci6(r.e2))], [U.s_phi, r.iso ? U.any_dir : deg(r.phi)],
      [U.s_gmax, twoLine(ueu(r.gmax), fill(U.s_gmax_sub, { e: ue(r.R) }))], [U.s_rs1, sp ? mpa(sp.s1) : '–'], [U.s_rs2, sp ? mpa(sp.s2) : '–'],
      [U.s_rtau, sp ? mpa((sp.s1 - sp.s2) / 2) : '–'], [U.s_ez, sp ? ueu(sp.ez * 1e6) : '–']]));
    const lines = [`εa = ${inp(ea)}, εb = ${inp(eb)}, εc = ${inp(ec)} µε  (${ang.join('°/')}°)`];
    if (type === 'rect') {
      lines.push(`εx = εa = ${ue(r.ex)},  εy = εc = ${ue(r.ey)},  γxy = 2εb − εa − εc = ${ue(r.gxy)} µε  (ε_xy = γxy/2 = ${ue(r.exy)})`,
        `ε₁, ε₂ = (εa + εc)/2 ± (1/√2)·√[(εa − εb)² + (εb − εc)²] = ${ue((ea + ec) / 2)} ± ${ue(r.R)} = ${ue(r.e1)}, ${ue(r.e2)} µε`);
    } else {
      lines.push(`εx = εa = ${ue(r.ex)},  εy = (2εb + 2εc − εa)/3 = ${ue(r.ey)},  γxy = (2/√3)(εb − εc) = ${ue(r.gxy)} µε  (ε_xy = γxy/2 = ${ue(r.exy)})`,
        `ε₁, ε₂ = (εa + εb + εc)/3 ± (√2/3)·√[(εa − εb)² + (εb − εc)² + (εc − εa)²] = ${ue((ea + eb + ec) / 3)} ± ${ue(r.R)} = ${ue(r.e1)}, ${ue(r.e2)} µε`);
    }
    lines.push(r.iso ? U.eq_iso_e : `φ = ½·atan2(γxy, εx − εy) = ½·atan2(${ue(r.gxy)}, ${ue(r.ex - r.ey)}) = ${fix(r.phi, 2)}°  (${U.eq_phi})`,
      `γmax = ε₁ − ε₂ = ${ue(r.gmax)} µε  (${U.eq_gamma})`);
    if (sp) {
      lines.push('', `σ₁ = E/(1 − ν²)·(ε₁ + νε₂) = ${inp(Eg)} GPa/(1 − ${inp(nu)}²) × (${ue(r.e1)} + ${inp(nu)} × ${pa(ue(r.e2))}) × 10⁻⁶ = ${st(sp.s1)} MPa`,
        `σ₂ = E/(1 − ν²)·(ε₂ + νε₁) = ${st(sp.s2)} MPa`,
        `τmax = (σ₁ − σ₂)/2 = G·γmax = ${fix(sp.G / 1000, 2)} GPa × ${ue(r.gmax)} × 10⁻⁶ = ${st((sp.s1 - sp.s2) / 2)} MPa`,
        `εz = −ν/(1 − ν)·(ε₁ + ε₂) = ${ue(sp.ez * 1e6)} µε  (σz = 0)`);
    }
    res.append(box(U.h_eq, el('p', {}, U.ros_eq_lead), eq(...lines), el('p', { class: 'muted' }, U.ros_note)));
    res.append(box(U.h_order, ul(U.ros_order)));
    res.append(box(U.h_caution, ul(U.ros_cautions)));
    figs.append(fig(rosetteSvg(type, r.phi), fill(U.cap_ros, { p: r.iso ? U.any_dir : deg(r.phi) }), [[NG, 'ε₁', true], [AC, 'ε₂', true]]));
  }

  // ---- 5. 平面応力と平面ひずみ ----
  function renderPstrain(res) {
    const sx = numOf('sx'), sy = numOf('sy'), txy = numOf('txy'), Eg = numOf('em'), nu = numOf('nu'), sY = numOf('sy0');
    if (!ok(sx, sy, txy)) return res.append(warn(U.need_s));
    if (!(Eg > 0) || !(nu > -1 && nu < 0.5)) return res.append(warn(U.need_enu));
    setDP(sx, sy, txy);
    const q = planeCompare(sx, sy, txy, Eg * 1000, nu);
    const n = v => (sY > 0 ? (v === 0 ? '∞' : fix(sY / v, 2)) : '–');
    res.append(main(fill(U.ps_main, { z: mpa(q.pe.sz), e: ueu(q.ps.ez * 1e6), a: mpa(q.ps.vm), b: mpa(q.pe.vm) })));
    const rows = [
      ['σz', mpa(q.ps.sz), mpa(q.pe.sz)], ['εz', ueu(q.ps.ez * 1e6), ueu(q.pe.ez * 1e6)],
      ['εx', ueu(q.ps.ex * 1e6), ueu(q.pe.ex * 1e6)], ['εy', ueu(q.ps.ey * 1e6), ueu(q.pe.ey * 1e6)], [U.row_g, ueu(q.ps.gxy * 1e6), ueu(q.pe.gxy * 1e6)],
      [U.row_p, q.ps.p.map(st).join(' / '), q.pe.p.map(st).join(' / ')],
      ['σ_T', mpa(q.ps.tr), mpa(q.pe.tr)], ['σ_vM', mpa(q.ps.vm), mpa(q.pe.vm)],
      [U.row_n, `${n(q.ps.tr)} / ${n(q.ps.vm)}`, `${n(q.pe.tr)} / ${n(q.pe.vm)}`]];
    res.append(box(U.h_ps, table(U.ps_cols, rows), el('p', { class: 'muted' }, U.ps_tbl_note)));
    res.append(box(U.h_eq, el('p', {}, U.ps_eq_lead), eq(
      `${U.eq_pstress}: σz = 0,  εz = −ν(σx + σy)/E = −${pa(inp(nu))} × (${inp(sx)} + ${pa(inp(sy))}) / ${inp(Eg * 1000)} = ${ue(q.ps.ez * 1e6)} µε`,
      `${U.eq_pstrain}: εz = 0  → σz = ν(σx + σy) = ${inp(nu)} × (${inp(sx)} + ${pa(inp(sy))}) = ${st(q.pe.sz)} MPa`,
      `εx = [σx − ν(σy + σz)]/E:  ${ue(q.ps.ex * 1e6)} µε / ${ue(q.pe.ex * 1e6)} µε`,
      `γxy = τxy/G,  G = E/[2(1 + ν)] = ${fix(q.G / 1000, 2)} GPa  → ${ue(q.ps.gxy * 1e6)} µε (${U.eq_gamma})`),
      el('p', { class: 'muted' }, U.ps_note)));
    res.append(box(U.h_caution, ul(U.ps_cautions)));
  }

  // ---- 出典 ----
  const SRCS = {
    roy: ['https://ocw.mit.edu/courses/3-91-mechanical-behavior-of-plastics-spring-2007/38b2732cd4d1efffbfe95ebe706f7b95_10_trans.pdf', 'Roylance, Transformation of Stresses and Strains (MIT OCW 2001)'],
    mit: ['https://mitocw.ups.edu.ec/courses/mechanical-engineering/2-080j-structural-mechanics-fall-2013/recitations/MIT2_080JF13_Recitation2.pdf', 'MIT 2.080J Recitation 2 (Mohr’s circle, 3D)'],
    inv: ['https://docs.itascacg.com/pfc700/common/docproject/source/manual/program_guide/modelformulation/stressstraininvariants.html', 'Itasca, Stress/Strain Invariants'],
    dp: ['https://doitpoms.ac.uk/tlplib/metal-forming-1/yield_criteria.php', 'DoITPoMS, Yield criteria for metals (Univ. of Cambridge)'],
    pv: ['https://ocw.mit.edu/courses/3-91-mechanical-behavior-of-plastics-spring-2007/0be49aef0263a94601f18b28c64af705_06_pv.pdf', 'Roylance, Pressure Vessels (MIT OCW 2001)'],
    tn: ['https://micro-measurements.com/knowledge-base/technical-notes', 'Micro-Measurements Tech Note TN-515 (Strain Gage Rosettes)'],
  };
  const SRC_OF = { plane: ['roy', 'mit'], tri: ['mit', 'inv'], yield: ['dp', 'inv', 'pv'], ros: ['tn', 'roy'], pstrain: ['roy', 'dp'] };
  const srcList = m => el('p', { class: 'muted' }, U.src_h, ' ', ...SRC_OF[m].flatMap((k, i) => [i ? ' · ' : '', link(...SRCS[k])]), ' ', U.src_books);

  function render() {
    layout();
    const res = out('res');
    res.replaceChildren();
    figs.replaceChildren();
    sliderBox.hidden = true;
    const m = mode();
    ({ plane: renderPlane, tri: renderTri, yield: renderYield, ros: renderRos, pstrain: renderPstrain })[m](res);
    res.append(srcList(m));
    res.append(el('div', { class: 'ss-links' },
      el('a', { class: 'btn btn-ghost', href: `${home}formulas/#f-elastic-constants` }, U.l_formula),
      el('a', { class: 'btn btn-ghost', href: `${home}term/youngs-modulus/` }, U.l_term),
      el('a', { class: 'btn btn-ghost', href: `${home}c/mechanical/` }, U.l_cat),
      el('a', { class: 'btn btn-ghost', href: `${home}tools/tensile-test-analyzer/` }, U.l_tensile),
      el('a', { class: 'btn btn-ghost', href: `${home}tools/fatigue-life-calculator/` }, U.l_fatigue),
      el('a', { class: 'btn btn-ghost', href: `${home}tools/thermal-expansion-stress-calculator/` }, U.l_thermal)));
  }
  // URL で空にした欄は空のまま戻す。tool-share.js は空の値を読まずに既定値を残し、
  // 先に URL を書き換えるので、開いたときの URL(navigation の name)から読む
  try {
    const url0 = performance.getEntriesByType?.('navigation')?.[0]?.name || location.href;
    let n0 = 0;
    for (const [k, v] of new URL(url0).searchParams) if (v.trim() === '' && E[k]?.tagName === 'INPUT' && E[k].value !== '') { E[k].value = ''; n0++; }
    if (n0) setTimeout(() => form.dispatchEvent(new Event('change', { bubbles: true })));
  } catch { /* 読めなくても続ける */ }
  form.addEventListener('submit', e => e.preventDefault());
  form.addEventListener('input', () => setTimeout(render));
  form.addEventListener('change', () => setTimeout(render));
  render();
}
