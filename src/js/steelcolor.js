// 鋼の色と温度。2つの「鋼の色」を、しくみと出典つきで示す。
//   1. 加熱した鋼が出す光の色: 温度からプランクの式で黒体のスペクトルを出し、CIE 1931 の等色関数で XYZ → 色度 (x, y) → sRGB にして見本を出す。
//      昔からの火色の表(Bureau of Standards 1905 の表にある White & Taylor・Pouillet・Howe の3つ)と並べる。
//   2. 焼戻し色(炭素鋼)とステンレスの溶接焼け(ヒートティント)の色: 出典の表を、値は出典のまま並べる(計算しない)。
// 値と出典は review の check/data.md。文言は data/tools/steelcolor.json の text.{言語}.js
// 計算の関数(xyzOf・xyOf・srgbOf・relY・peakUm・CMF など)は DOM なしで import できる
// (検算: review の check/check_steelcolor.py と check/js_results.mjs)。

// =====================================================================
// CIE 1931 2° 視野の等色関数 x̄(λ), ȳ(λ), z̄(λ)。360–830 nm、5 nm 刻み(95 行)。
// 出どころ: CIE (2019) "CIE 1931 colour-matching functions, 2 degree observer", DOI 10.25039/CIE.DS.xvudnb9b
//   (CIE 018:2019 の表 6、1 nm 刻み)。その 1 nm の表から 5 nm ごとの行をそのまま抜き出した(補間はしていない)。
//   値は colour-science 0.4.6 と luxpy 1.12.5 の写し(どちらも CVRL の表。両者の差は 5e-13 以下)から取り、
//   10 の波長で files.cie.co.at の CSV と一致することを確かめた(check/data.md)。
// 5 nm と 1 nm の和の差は、このツールの温度範囲で (x, y) が 1e-6 程度(check/python_results.txt)
// =====================================================================
export const CMF_START = 360, CMF_STEP = 5;
export const CMF = [
  [0.0001299,3.917e-06,0.0006061], [0.0002321,6.965e-06,0.001086], [0.0004149,1.239e-05,0.001946], [0.0007416,2.202e-05,0.003486], [0.001368,3.9e-05,0.006450001],  // 360–380 nm
  [0.002236,6.4e-05,0.01054999], [0.004243,0.00012,0.02005001], [0.00765,0.000217,0.03621], [0.01431,0.000396,0.06785001], [0.02319,0.00064,0.1102],  // 385–405 nm
  [0.04351,0.00121,0.2074], [0.07763,0.00218,0.3713], [0.13438,0.004,0.6456], [0.21477,0.0073,1.0390501], [0.2839,0.0116,1.3856],  // 410–430 nm
  [0.3285,0.01684,1.62296], [0.34828,0.023,1.74706], [0.34806,0.0298,1.7826], [0.3362,0.038,1.77211], [0.3187,0.048,1.7441],  // 435–455 nm
  [0.2908,0.06,1.6692], [0.2511,0.0739,1.5281], [0.19536,0.09098,1.28764], [0.1421,0.1126,1.0419], [0.09564,0.13902,0.8129501],  // 460–480 nm
  [0.05795001,0.1693,0.6162], [0.03201,0.20802,0.46518], [0.0147,0.2586,0.3533], [0.0049,0.323,0.272], [0.0024,0.4073,0.2123],  // 485–505 nm
  [0.0093,0.503,0.1582], [0.0291,0.6082,0.1117], [0.06327,0.71,0.07824999], [0.1096,0.7932,0.05725001], [0.1655,0.862,0.04216],  // 510–530 nm
  [0.2257499,0.9148501,0.02984], [0.2904,0.954,0.0203], [0.3597,0.9803,0.0134], [0.4334499,0.9949501,0.008749999], [0.5120501,1.0,0.005749999],  // 535–555 nm
  [0.5945,0.995,0.0039], [0.6784,0.9786,0.002749999], [0.7621,0.952,0.0021], [0.8425,0.9154,0.0018], [0.9163,0.87,0.001650001],  // 560–580 nm
  [0.9786,0.8163,0.0014], [1.0263,0.757,0.0011], [1.0567,0.6949,0.001], [1.0622,0.631,0.0008], [1.0456,0.5668,0.0006],  // 585–605 nm
  [1.0026,0.503,0.00034], [0.9384,0.4412,0.00024], [0.8544499,0.381,0.00019], [0.7514,0.321,0.0001], [0.6424,0.265,4.999999e-05],  // 610–630 nm
  [0.5419,0.217,3e-05], [0.4479,0.175,2e-05], [0.3608,0.1382,1e-05], [0.2835,0.107,0.0], [0.2187,0.0816,0.0],  // 635–655 nm
  [0.1649,0.061,0.0], [0.1212,0.04458,0.0], [0.0874,0.032,0.0], [0.0636,0.0232,0.0], [0.04677,0.017,0.0],  // 660–680 nm
  [0.0329,0.01192,0.0], [0.0227,0.00821,0.0], [0.01584,0.005723,0.0], [0.01135916,0.004102,0.0], [0.008110916,0.002929,0.0],  // 685–705 nm
  [0.005790346,0.002091,0.0], [0.004109457,0.001484,0.0], [0.002899327,0.001047,0.0], [0.00204919,0.00074,0.0], [0.001439971,0.00052,0.0],  // 710–730 nm
  [0.0009999493,0.0003611,0.0], [0.0006900786,0.0002492,0.0], [0.0004760213,0.0001719,0.0], [0.0003323011,0.00012,0.0], [0.0002348261,8.48e-05,0.0],  // 735–755 nm
  [0.0001661505,6e-05,0.0], [0.000117413,4.24e-05,0.0], [8.307527e-05,3e-05,0.0], [5.870652e-05,2.12e-05,0.0], [4.150994e-05,1.499e-05,0.0],  // 760–780 nm
  [2.935326e-05,1.06e-05,0.0], [2.067383e-05,7.4657e-06,0.0], [1.455977e-05,5.2578e-06,0.0], [1.025398e-05,3.7029e-06,0.0], [7.221456e-06,2.6078e-06,0.0],  // 785–805 nm
  [5.085868e-06,1.8366e-06,0.0], [3.581652e-06,1.2934e-06,0.0], [2.522525e-06,9.1093e-07,0.0], [1.776509e-06,6.4153e-07,0.0], [1.251141e-06,4.5181e-07,0.0],  // 810–830 nm
];

// 第2放射定数 c2 = h c / k(m·K)。2019 年の SI で h・c・k が定義値になったので正確な値(CODATA 2018)
export const C2 = 1.438776877e-2;
// ウィーンの変位則の定数 b(m·K、CODATA 2018)
export const WIEN_B = 2.897771955e-3;

// プランクの式(分光放射発散度)の形。定数倍は (x, y) にも比にも効かないので省く: λ^-5 / (exp(c2/λT) − 1)
export function planck(lamNm, T) {
  const lam = lamNm * 1e-9;
  return lam ** -5 / Math.expm1(C2 / (lam * T));
}

// 黒体(温度 T K)の三刺激値 X, Y, Z(5 nm ごとの和。単位はそろえていないので、比と色度にだけ使う)
export function xyzOf(T) {
  let X = 0, Y = 0, Z = 0;
  CMF.forEach(([xb, yb, zb], i) => {
    const p = planck(CMF_START + CMF_STEP * i, T);
    X += p * xb; Y += p * yb; Z += p * zb;
  });
  return [X, Y, Z];
}

// 色度座標 (x, y)
export function xyOf(T) {
  const [X, Y, Z] = xyzOf(T);
  const s = X + Y + Z;
  return [X / s, Y / s];
}

// 輝度(Y)の比: 温度 T の黒体と、基準の温度 Tref の黒体(同じ放射率のとき)
export const relY = (T, Tref) => xyzOf(T)[1] / xyzOf(Tref)[1];

// スペクトルの山の波長(µm、ウィーンの変位則)
export const peakUm = T => (WIEN_B / T) * 1e6;

// XYZ → sRGB(IEC 61966-2-1 の行列と、ガンマ補正)。
// 明るさは正規化する: 色度 (x, y) から Y = 1 の XYZ を作り、線形の R, G, B のうち最大のものを 1 にそろえる。
// 色域の外(sRGB で出せない色)は、負の成分を 0 に切る(clipped: true)。切ると色度は少しずれる
const M = [[3.2406, -1.5372, -0.4986], [-0.9689, 1.8758, 0.0415], [0.0557, -0.2040, 1.0570]];
const gamma = c => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
export function srgbOf(T, scale = 1) {
  const [x, y] = xyOf(T);
  const XYZ = [x / y, 1, (1 - x - y) / y];
  const lin0 = M.map(r => r[0] * XYZ[0] + r[1] * XYZ[1] + r[2] * XYZ[2]);
  const clipped = lin0.some(c => c < 0);
  const lin = lin0.map(c => Math.max(0, c));
  const m = Math.max(...lin);
  // scale(0〜1)は「明るさも入れた帯」用: 正規化した線形の値に掛けてからガンマ補正する
  const rgb = lin.map(c => Math.round(255 * gamma(Math.min(1, (c / m) * scale))));
  const hex = `#${rgb.map(v => v.toString(16).padStart(2, '0')).join('')}`;
  return { rgb, hex, clipped };
}

export const cToK = c => c + 273.15;
export const cToF = c => (c * 9) / 5 + 32;
export const fToC = f => ((f - 32) * 5) / 9;

// 計算する温度の範囲(°C)。表と帯は 400〜1600 ℃。外でも 200〜3000 ℃ なら計算する(注意を出す)
export const T_MIN = 400, T_MAX = 1600, T_CALC_MIN = 200, T_CALC_MAX = 3000;

// =====================================================================
// 火色の表。出典: C. W. Waidner & G. K. Burgess, "Optical Pyrometry", Bulletin of the Bureau of Standards 1(2), 1905, p. 209
//   (https://nvlpubs.nist.gov/nistpubs/bulletin/01/nbsbulletinv1n2p189_A2b.pdf)。この表は White & Taylor(Trans. ASME 1899)、
//   Pouillet、Howe の3つの色の目盛りを、同じ行に並べて比べている(行のそろえ方も原表のまま)。
//   値は原表の °C と °F。OCR の読み違いは、原表の差の列(Pouillet − W&T、Howe − W&T の °F)で確かめた(check/data.md)。
//   n: 原表の色の名前(英語のまま。訳は text の js.fire)、c・f: その色の温度、c2・f2: 範囲の上限(原表が「〜」の行)
// =====================================================================
export const FIRE = [
  { wt: { n: 'wt_dark', c: 470, f: 878 }, pou: { n: 'pou_lowest', c: 525, f: 977 }, howe: { n: 'howe_day', c: 475, f: 887 } },
  { wt: { n: 'wt_darkred', c: 566, f: 1050 }, pou: { n: 'pou_darkred', c: 700, f: 1292 }, howe: { n: 'howe_dull', c: 550, f: 1022, c2: 625, f2: 1157 } },
  { wt: { n: 'wt_darkcherry', c: 635, f: 1175 }, pou: { n: 'pou_lowcherry', c: 800, f: 1472 } },
  { wt: { n: 'wt_cherry', c: 746, f: 1375 }, pou: { n: 'pou_cherry', c: 900, f: 1652 }, howe: { n: 'howe_fullcherry', c: 700, f: 1292 } },
  { wt: { n: 'wt_lightred', c: 843, f: 1550 }, pou: { n: 'pou_brightcherry', c: 1000, f: 1832 }, howe: { n: 'howe_lightred', c: 850, f: 1562 } },
  { wt: { n: 'wt_orange', c: 899, f: 1650 }, pou: { n: 'pou_darkorange', c: 1100, f: 2012 } },
  { wt: { n: 'wt_lightorange', c: 941, f: 1725 }, pou: { n: 'pou_brightorange', c: 1200, f: 2192 } },
  { wt: { n: 'wt_yellow', c: 996, f: 1825 }, howe: { n: 'howe_fullyellow', c: 950, f: 1742, c2: 1000, f2: 1832 } },
  { wt: { n: 'wt_lightyellow', c: 1079, f: 1975 }, howe: { n: 'howe_lightyellow', c: 1050, f: 1922 } },
  // Howe の White は原表の OCR で 2108 °F と読めるが、差の列(−98)と °C(1150)から 2102 °F とした
  { wt: { n: 'wt_white', c: 1205, f: 2200 }, pou: { n: 'pou_white', c: 1300, f: 2372 }, howe: { n: 'howe_white', c: 1150, f: 2102 } },
  { pou: { n: 'pou_brightwhite', c: 1400, f: 2552 } },
  { pou: { n: 'pou_dazzling', c: 1500, f: 2732, c2: 1600, f2: 2912 } },
];
export const FIRE_COLS = ['wt', 'pou', 'howe'];
export const FIRE_URL = 'https://nvlpubs.nist.gov/nistpubs/bulletin/01/nbsbulletinv1n2p189_A2b.pdf';

// 温度 tc(°C)にいちばん近い、その目盛りの色(範囲の行は、範囲の中なら差 0)
export function nearestFire(col, tc) {
  let best = null;
  for (const row of FIRE) {
    const e = row[col];
    if (!e) continue;
    const d = e.c2 != null ? (tc < e.c ? e.c - tc : tc > e.c2 ? tc - e.c2 : 0) : Math.abs(tc - e.c);
    if (!best || d < best.d) best = { e, d };
  }
  return best;
}

// =====================================================================
// 焼戻し色(炭素鋼、空気中で加熱、磨いた面)。値は出典のまま(°C・°F とも)。
//   navy: U.S. Navy, Aviation Structural Mechanic (AM) の訓練教材(NAVEDTRA 14315)、Table 6-2
//         "Color Chart for Various Tempering Temperatures of Carbon Steel"(tpub.com の写し)
//   spon: Spon's Workshop Receipts(American Library Edition, Vol. 3)の "Colour Tests"(chestofbooks.com の写し。Vol. 3 は第3集にあたると読める。アイルランド国立図書館の目録の注では第3・4集は C. G. Warnford Lock、1884–85 年。この版の刊年は未確認)
// sw: 画面に出す色の見本(このツールで選んだ表示の色。出典の値ではない)
// =====================================================================
export const TEMPER = [
  { k: 'pale_yellow', sw: '#efe0a2', navy: [220, 428], spon: ['very_pale_yellow', 221, 430] },
  { k: 'straw', sw: '#e2c27a', navy: [230, 446], spon: ['straw_yellow', 238, 460] },
  { k: 'golden', sw: '#d2a248', navy: [243, 469] },
  { k: 'brown', sw: '#a8703a', navy: [254, 491], spon: ['brown_yellow', 254, 490] },
  { k: 'brown_purple', sw: '#8c5a60', navy: [266, 509] },
  { k: 'purple', sw: '#7a4a8c', navy: [277, 531], spon: ['light_purple', 277, 530] },
  { k: 'dark_purple', sw: '#5c3a80', spon: ['dark_purple', 288, 550] },
  { k: 'dark_blue', sw: '#2f428f', navy: [288, 550], spon: ['clear_blue', 299, 570] },
  { k: 'bright_blue', sw: '#3f6fbf', navy: [297, 567] },
  { k: 'pale_blue', sw: '#7fa4c8', navy: [321, 610], spon: ['pale_blue', 321, 610] },
  { k: 'green_blue', sw: '#6f9c9a', spon: ['blue_green', 332, 630] },
];
export const TEMPER_URL = {
  navy: 'https://navyaviation.tpub.com/14315/Table-6-2-Color-Chart-For-Various-Tempering-Temperatures-Of-Carbon-Steel-251.html',
  spon: 'https://chestofbooks.com/crafts/mechanics/Workshop-Receipts-3/Testing-Steels.html',
};

// ステンレス鋼 1.4301(SUS304 相当)を空気中で加熱したときの色の目安(°C)。
// 出典: British Stainless Steel Association (BSSA), "Heat Tint (Temper) Colours on Stainless Steel Surface Heated in Air"
//   (加熱時間 1 時間ほどを前提にした表。時間が長いと色は濃くなる、と同じ記事にある)。°F は換算
export const TINT = [
  { k: 'pale_yellow', sw: '#efe0a6', c: 290 },
  { k: 'straw_yellow', sw: '#e0c483', c: 340 },
  { k: 'dark_yellow', sw: '#c99a44', c: 370 },
  { k: 'brown', sw: '#9a6436', c: 390 },
  { k: 'purple_brown', sw: '#7e4f5c', c: 420 },
  { k: 'dark_purple', sw: '#5a3a7a', c: 450 },
  { k: 'blue', sw: '#3a5aa8', c: 540 },
  { k: 'dark_blue', sw: '#2a3a78', c: 600 },
];
export const TINT_URL = 'https://bssa.org.uk/bssa_articles/heat-tint-temper-colours-on-stainless-steel-surface-heated-in-air/';

// =====================================================================
// 画面(ブラウザのときだけ)
// =====================================================================
const form = typeof document !== 'undefined' ? document.getElementById('steelcolor-form') : null;
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
  const svgEl = (tag, attrs = {}, text) => {
    const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    if (text != null) e.textContent = text;
    return e;
  };
  // 温度などの数(桁区切りなし: 1000 ℃ を 1,000 と書かない)
  const nf = (d = 0) => new Intl.NumberFormat(lang, { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: false });
  const E = form.elements;
  // 0.01 以上は有効数字3桁、それより小さい数は 2.1×10⁻⁴ の形
  const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
  const sci = v => {
    if (v >= 0.01) return new Intl.NumberFormat(lang, { maximumSignificantDigits: 3, useGrouping: false }).format(v);
    const [m, e] = v.toExponential(1).split('e');
    return `${nf(1).format(Number(m))}×10${String(Number(e)).replace(/./g, ch => SUP[ch])}`;
  };
  const isF = () => E.unit.value === 'f';
  // セルシウス度の記号: ja・zh-hant・ko の本文は ℃、en・de は °C(サイトの表記にそろえる)
  const CS = ['ja', 'zh-hant', 'ko'].includes(lang.toLowerCase()) ? '℃' : '°C';
  const unitSym = () => (isF() ? '°F' : CS);
  // 表の温度: 出典の °C と °F をそのまま使う(換算し直さない)
  const tempOf = (c, f) => `${nf(0).format(isF() ? f : c)} ${unitSym()}`;
  const rangeOf = e => (e.c2 != null ? `${nf(0).format(isF() ? e.f : e.c)}–${nf(0).format(isF() ? e.f2 : e.c2)} ${unitSym()}` : tempOf(e.c, e.f));

  // ---- 見た目(このツールだけ) ----
  const css = document.createElement('style');
  css.textContent = `
#steelcolor-form .sc-wide { grid-column: 1 / -1; margin: 0; }
#steelcolor-form .sc-slider { grid-column: 1 / -1; display: flex; flex-direction: column; gap: 4px; font-size: .88rem; color: var(--muted); }
#steelcolor-form .sc-slider input { width: 100%; min-height: 32px; accent-color: var(--accent); }
.sc-quick { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.sc-quick .btn { min-height: 36px; padding: 0 12px; font-size: .85rem; }
.sc-swatch { height: 150px; border-radius: 10px; border: 1px solid var(--border); display: flex; align-items: flex-end; justify-content: flex-end; padding: 8px 10px; box-sizing: border-box; }
.sc-swatch span { background: rgba(0,0,0,.55); color: #fff; border-radius: 6px; padding: 2px 8px; font-size: .85rem; font-variant-numeric: tabular-nums; }
.sc-band-wrap { margin: 12px 0 0; }
.sc-band-wrap p { margin: 2px 0; font-size: .82rem; color: var(--muted); }
.sc-band { position: relative; height: 26px; border-radius: 6px; border: 1px solid var(--border); }
.sc-mark { position: absolute; top: -4px; bottom: -4px; width: 0; border-left: 3px solid var(--text); transform: translateX(-1.5px); }
.sc-mark::after { content: ''; position: absolute; top: -2px; bottom: -2px; left: -4.5px; width: 6px; border: 1px solid var(--bg); border-radius: 2px; }
.sc-ticks { position: relative; height: 16px; font-size: .75rem; color: var(--muted); font-variant-numeric: tabular-nums; }
.sc-ticks span { position: absolute; transform: translateX(-50%); white-space: nowrap; }
.sc-ticks span:first-child { transform: none; }
.sc-ticks span:last-child { transform: translateX(-100%); }
.sc-box { margin: 12px 0; padding: 10px 12px; border-radius: 8px; background: var(--bg); }
.sc-box h3 { margin: 0 0 6px; font-size: 1rem; }
.sc-box ul { margin: 4px 0; padding-left: 1.3em; line-height: 1.7; }
.sc-box p, .dy-box > p { margin: 6px 0; line-height: 1.7; }
.sc-lead { font-size: 1.02rem; line-height: 1.7; margin: 0 0 10px; padding: 10px 12px; border-radius: 8px; background: var(--accent-soft); }
.sc-tbl { width: 100%; border-collapse: collapse; font-size: .9rem; }
.sc-tbl th, .sc-tbl td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--border); vertical-align: top; overflow-wrap: anywhere; }
.sc-tbl th.sc-swcol { white-space: nowrap; width: 1%; }
.sc-tbl thead th { font-size: .8rem; color: var(--muted); font-weight: 600; }
.sc-tbl .sc-num { white-space: nowrap; font-variant-numeric: tabular-nums; }
.sc-tbl small { display: block; color: var(--muted); font-size: .78rem; line-height: 1.35; }
.sc-tbl td.sc-hit { background: var(--accent-soft); font-weight: 700; }
.sc-tbl .sc-chip { display: inline-block; width: 28px; height: 18px; border-radius: 4px; border: 1px solid var(--border); vertical-align: middle; }
@media (max-width: 480px) { .sc-tbl th, .sc-tbl td { padding: 5px 4px; font-size: .82rem; } .sc-tbl .sc-chip { width: 20px; } }
.sc-fig { width: 100%; max-width: 420px; height: auto; display: block; margin: 6px 0; }
.sc-fig text { font-size: 11px; fill: var(--text); }
.sc-links { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0 0; }
`;
  document.head.append(css);

  // ---- スライダー(数値の欄と同じ値。名前を付けないので URL には残らない。URL には数値の欄 t と単位 unit が残る) ----
  const tLabel = E.t.closest('label');
  const slider = el('input', { type: 'range', step: '1', 'aria-label': U.slider });
  const sliderWrap = el('label', { class: 'sc-slider' }, el('span', {}, U.slider), slider);
  tLabel.after(sliderWrap);
  const quick = el('div', { class: 'sc-quick sc-wide' }, el('span', { class: 'muted' }, U.quick),
    ...[600, 800, 1000, 1200, 1400].map(c => el('button', { type: 'button', class: 'btn btn-ghost', 'data-c': String(c) }, '')));
  sliderWrap.after(quick);
  const lim = () => (isF() ? [cToF(T_MIN), cToF(T_MAX)] : [T_MIN, T_MAX]);
  function setBounds() {
    const [lo, hi] = lim();
    slider.min = String(lo); slider.max = String(hi);
    E.t.min = String(isF() ? cToF(T_CALC_MIN) : T_CALC_MIN);
    E.t.max = String(isF() ? cToF(T_CALC_MAX) : T_CALC_MAX);
    for (const b of quick.querySelectorAll('[data-c]')) {
      const c = Number(b.dataset.c);
      b.textContent = isF() ? `${nf(0).format(Math.round(cToF(c)))} °F` : `${nf(0).format(c)} ${CS}`;
    }
  }
  const readT = () => Number(String(E.t.value).replace(',', '.'));
  const syncSlider = () => { const v = readT(); if (Number.isFinite(v)) slider.value = String(v); };

  let lastUnit = E.unit.value;
  form.addEventListener('submit', e => e.preventDefault());
  slider.addEventListener('input', () => {
    E.t.value = slider.value;
    form.dispatchEvent(new Event('change', { bubbles: true })); // URL を書き換える(tool-share.js)
  });
  quick.addEventListener('click', e => {
    const b = e.target.closest('[data-c]');
    if (!b) return;
    const c = Number(b.dataset.c);
    E.t.value = String(isF() ? Math.round(cToF(c)) : c);
    form.dispatchEvent(new Event('change', { bubbles: true }));
  });
  form.addEventListener('input', e => { if (e.target === E.t) { syncSlider(); render(); } });
  form.addEventListener('change', e => {
    // 単位を変えたら、数値を換算する(整数に丸める)
    if (E.unit.value !== lastUnit) {
      const v = readT();
      if (Number.isFinite(v)) E.t.value = String(Math.round(E.unit.value === 'f' ? cToF(v) : fToC(v)));
      lastUnit = E.unit.value;
      setBounds();
    }
    syncSlider();
    render();
  });

  // ---- 色の帯(400〜1600 ℃)。上は明るさを正規化した色、下は明るさも入れた色(1600 ℃ の明るさを最大とする) ----
  const BAND_STEP = 25;
  const bandStops = [], bandStopsLum = [];
  const yMax = xyzOf(cToK(T_MAX))[1];
  for (let c = T_MIN; c <= T_MAX; c += BAND_STEP) {
    const p = (((c - T_MIN) / (T_MAX - T_MIN)) * 100).toFixed(2);
    bandStops.push(`${srgbOf(cToK(c)).hex} ${p}%`);
    bandStopsLum.push(`${srgbOf(cToK(c), xyzOf(cToK(c))[1] / yMax).hex} ${p}%`);
  }
  const pctOf = c => `${Math.min(100, Math.max(0, ((c - T_MIN) / (T_MAX - T_MIN)) * 100)).toFixed(2)}%`;
  function band(stops, tc, label) {
    return el('div', { class: 'sc-band-wrap' }, el('p', {}, label),
      el('div', { class: 'sc-band', role: 'img', 'aria-label': label, style: `background: linear-gradient(90deg, ${stops.join(', ')})` },
        tc != null ? el('span', { class: 'sc-mark', style: `left:${pctOf(tc)}` }) : null));
  }
  function ticks() {
    return el('div', { class: 'sc-ticks', 'aria-hidden': 'true' },
      ...[400, 800, 1200, 1600].map(c => el('span', { style: `left:${pctOf(c)}` },
        isF() ? nf(0).format(Math.round(cToF(c))) : nf(0).format(c))), );
  }

  // ---- 酸化膜の干渉の図(しくみだけ。膜の厚さの数値は入れない) ----
  function interferenceFig() {
    const s = svgEl('svg', { class: 'sc-fig', viewBox: '0 0 360 150', role: 'img', 'aria-label': U.fig_label });
    s.append(
      svgEl('rect', { x: 0, y: 104, width: 360, height: 46, fill: 'var(--fig-metal)' }),
      svgEl('rect', { x: 0, y: 86, width: 360, height: 18, fill: 'var(--fig-ox)', opacity: '0.8' }),
      svgEl('line', { x1: 30, y1: 12, x2: 110, y2: 86, stroke: 'var(--accent)', 'stroke-width': 2.5 }),
      svgEl('line', { x1: 110, y1: 86, x2: 170, y2: 14, stroke: 'var(--accent)', 'stroke-width': 2, 'stroke-dasharray': '5 3' }),
      svgEl('line', { x1: 110, y1: 86, x2: 128, y2: 104, stroke: 'var(--accent-2)', 'stroke-width': 2 }),
      svgEl('line', { x1: 128, y1: 104, x2: 146, y2: 86, stroke: 'var(--accent-2)', 'stroke-width': 2 }),
      svgEl('line', { x1: 146, y1: 86, x2: 206, y2: 14, stroke: 'var(--accent-2)', 'stroke-width': 2 }),
      svgEl('text', { x: 8, y: 20 }, U.fig_air),
      svgEl('text', { x: 352, y: 99, 'text-anchor': 'end' }, U.fig_oxide),
      svgEl('text', { x: 8, y: 132 }, U.fig_steel),
      // 反射した2つの光に番号を付け、説明は右に書く(線と文字が重ならないように)
      svgEl('text', { x: 166, y: 11, 'text-anchor': 'end' }, '1'),
      svgEl('text', { x: 211, y: 11 }, '2'),
      svgEl('text', { x: 228, y: 30 }, `1: ${U.fig_r1}`),
      svgEl('text', { x: 228, y: 48 }, `2: ${U.fig_r2}`),
    );
    return s;
  }

  function link(path, text) { return el('a', { class: 'btn btn-ghost', href: `${home}${path}` }, `${text} →`); }
  function srcLink(url, text) { return el('a', { href: url, target: '_blank', rel: 'noopener' }, text); }

  // ---- 表(温度によらない部分は、単位が変わったときだけ作り直す) ----
  function fireTable(tc) {
    const hits = Object.fromEntries(FIRE_COLS.map(k => [k, tc == null ? null : nearestFire(k, tc)?.e]));
    const cell = (k, e) => (e ? el('td', { class: hits[k] === e ? 'sc-hit' : null },
      el('span', { class: 'sc-num' }, rangeOf(e)), el('small', {}, T.fire[e.n] ?? e.n)) : el('td', {}, ''));
    return el('table', { class: 'sc-tbl' },
      el('thead', {}, el('tr', {}, ...FIRE_COLS.map(k => el('th', { scope: 'col' }, T.src[k])))),
      el('tbody', {}, ...FIRE.map(row => el('tr', {}, ...FIRE_COLS.map(k => cell(k, row[k]))))));
  }
  function temperTable() {
    return el('table', { class: 'sc-tbl' },
      el('thead', {}, el('tr', {}, el('th', { scope: 'col', class: 'sc-swcol' }, U.col_sw), el('th', { scope: 'col' }, U.col_color),
        el('th', { scope: 'col' }, T.src.navy), el('th', { scope: 'col' }, T.src.spon))),
      el('tbody', {}, ...TEMPER.map(r => el('tr', {},
        el('td', {}, el('span', { class: 'sc-chip', style: `background:${r.sw}` })),
        el('td', {}, T.temper[r.k]),
        el('td', { class: 'sc-num' }, r.navy ? tempOf(r.navy[0], r.navy[1]) : '–'),
        el('td', {}, r.spon ? [el('span', { class: 'sc-num' }, tempOf(r.spon[1], r.spon[2])), el('small', {}, T.spon[r.spon[0]])] : '–')))));
  }
  function tintTable() {
    return el('table', { class: 'sc-tbl' },
      el('thead', {}, el('tr', {}, el('th', { scope: 'col', class: 'sc-swcol' }, U.col_sw), el('th', { scope: 'col' }, U.col_color), el('th', { scope: 'col' }, U.col_temp))),
      el('tbody', {}, ...TINT.map(r => el('tr', {},
        el('td', {}, el('span', { class: 'sc-chip', style: `background:${r.sw}` })),
        el('td', {}, T.tint[r.k]),
        el('td', { class: 'sc-num' }, isF() ? `≈ ${nf(0).format(Math.round(cToF(r.c)))} °F` : `${nf(0).format(r.c)} ${CS}`)))));
  }

  function renderStatic() {
    out('temper').replaceChildren(
      el('div', { class: 'sc-box' }, el('h3', {}, U.h_mech), interferenceFig(), el('p', {}, U.mech1), el('p', {}, U.mech2),
        el('p', { class: 'muted' }, fill(U.mech_src, {}), ' ', srcLink(T.url.cam, T.src.cam))),
      temperTable(),
      el('p', { class: 'muted' }, U.temper_sw),
      el('div', { class: 'sc-box' }, el('h3', {}, U.h_temper_notes), el('ul', {}, ...U.temper_notes.map(n => el('li', {}, n))),
        el('p', { class: 'muted' }, srcLink(TEMPER_URL.navy, T.src.navy_full), ' / ', srcLink(TEMPER_URL.spon, T.src.spon_full), ' / ', srcLink(T.url.lc630, T.src.lc630))));
    out('tint').replaceChildren(
      el('p', {}, U.tint_lead),
      tintTable(),
      el('p', { class: 'muted' }, U.tint_sw, ' ', srcLink(TINT_URL, T.src.bssa)),
      el('div', { class: 'sc-box' }, el('h3', {}, U.h_tint_care), el('ul', {}, ...U.tint_care.map(n => el('li', {}, n))),
        el('p', { class: 'muted' }, srcLink(T.url.euroinox, T.src.euroinox), ' / ', srcLink(T.url.assda, T.src.assda))),
      el('div', { class: 'sc-links' },
        link('tools/iron-carbon-phase-diagram/', U.l_lab),
        lang === 'ja' ? link('compare/quenching-vs-tempering/', U.l_cmp) : null,
        link('materials/?m=stainless-steel#md-card', U.l_ss),
        link('glossary/', U.l_glossary)),
      el('p', { class: 'muted' }, U.safety));
  }

  function render() {
    const v = readT();
    const tc = isF() ? fToC(v) : v;
    const ok = String(E.t.value).trim() !== '' && Number.isFinite(v) && tc >= T_CALC_MIN && tc <= T_CALC_MAX;
    if (!ok) {
      for (const k of ['kelvin', 'xy', 'hex', 'peak', 'lum']) out(k).textContent = '–';
      out('swatch').replaceChildren(el('p', { class: 'sc-lead' }, fill(U.bad, {
        lo: isF() ? `${nf(0).format(cToF(T_CALC_MIN))} °F` : `${T_CALC_MIN} ${CS}`, hi: isF() ? `${nf(0).format(cToF(T_CALC_MAX))} °F` : `${T_CALC_MAX} ${CS}` })));
      out('fire').replaceChildren(fireTable(null));
      return;
    }
    const K = cToK(tc);
    const [x, y] = xyOf(K);
    const col = srgbOf(K);
    const lum = relY(K, cToK(1000));
    out('kelvin').textContent = `${nf(0).format(Math.round(K))} K`;
    out('xy').textContent = `${nf(4).format(x)}${lang === 'de' ? '; ' : ', '}${nf(4).format(y)}`;
    out('hex').textContent = col.hex;
    out('peak').textContent = `${nf(2).format(peakUm(K))} µm`;
    out('lum').textContent = sci(lum);
    const tStr = isF() ? `${nf(0).format(v)} °F ≈ ${nf(0).format(Math.round(tc))} ${CS}` : `${nf(0).format(v)} ${CS}`;

    const notes = [];
    if (tc < T_MIN || tc > T_MAX) notes.push(fill(U.n_out, { lo: isF() ? `${nf(0).format(cToF(T_MIN))} °F` : `${T_MIN} ${CS}`, hi: isF() ? `${nf(0).format(cToF(T_MAX))} °F` : `${T_MAX} ${CS}` }));
    if (col.clipped) notes.push(U.n_clip);
    if (col.rgb[1] === 0) notes.push(U.n_red);
    if (lum < 1e-4) notes.push(U.n_dim);
    // 火色の表で「黄色」「白色」が出てくる温度(Howe の Full yellow 950 ℃ 以上)では、計算の色度(橙)と合わない
    if (tc >= 950) notes.push(U.n_white);
    notes.push(U.n_screen);
    out('swatch').replaceChildren(
      el('p', { class: 'sc-lead' }, fill(U.lead_v, { t: tStr, k: nf(0).format(Math.round(K)), x: nf(4).format(x), y: nf(4).format(y), p: nf(2).format(peakUm(K)) })),
      el('div', { class: 'sc-swatch', role: 'img', 'aria-label': fill(U.swatch_label, { t: tStr, hex: col.hex }), style: `background:${col.hex}` }, el('span', {}, `${tStr} · ${col.hex}`)),
      band(bandStops, tc >= T_MIN && tc <= T_MAX ? tc : null, U.band1), ticks(),
      band(bandStopsLum, tc >= T_MIN && tc <= T_MAX ? tc : null, U.band2), ticks(),
      el('p', { class: 'muted' }, fill(U.band_unit, { u: unitSym() })),
      el('div', { class: 'sc-box' }, el('h3', {}, U.h_notes), el('ul', {}, ...notes.map(n => el('li', {}, n)))),
      el('p', { class: 'muted' }, U.method));

    // 火色の表
    const near = FIRE_COLS.map(k => ({ k, r: nearestFire(k, tc) }));
    out('fire').replaceChildren(
      el('p', {}, fill(U.fire_near, { t: tStr }), ' ', ...near.flatMap(({ k, r }, i) => [i ? U.sep : '',
        el('strong', {}, T.src[k]), fill(U.fire_item, { n: T.fire[r.e.n], v: rangeOf(r.e) })])),
      fireTable(tc),
      el('p', { class: 'muted' }, U.fire_note, ' ', srcLink(FIRE_URL, T.src.nbs)),
      el('div', { class: 'sc-box' }, el('h3', {}, U.h_fire_cmp), el('ul', {}, ...U.fire_cmp.map(n => el('li', {}, n)))));
  }

  // 初期化: URL の値(tool-share.js が先に入れる)に合わせて範囲と表を作る
  setBounds();
  syncSlider();
  renderStatic();
  render();
  // 単位を変えたら、温度によらない表も作り直す
  form.addEventListener('change', () => renderStatic());
}
