// 引張試験のデータ解析。貼り付けた「荷重−変位」または「応力−ひずみ」のデータから、ヤング率(最小二乗の直線)、
// オフセット法の耐力(0.2 % 耐力)、上降伏点・下降伏点・降伏点伸び(ある場合)、引張強さ、一様伸び、破断までの伸び、
// n 値と K(真応力−真塑性ひずみの両対数の直線)、曲線の下の面積を求めて、範囲と式つきで表と図に出す。
// データはこのページの中だけで扱う(どこにも送らない。通信の関数は使わない。URL にも入れない)。
// 解析の関数(parseData・toStressStrain・analyze・sample)は DOM なしで import できる(検算: review の check/check_tensile.py)。
// 規格の定義で確かめたものと、この計算で決めたものの区別は review の notes/sources.md。文言は data/tools/tensile.json の text.{言語}.js

// =====================================================================
// 読み込み
// =====================================================================
const NUM_DOT = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;
const NUM_COMMA = /^[+-]?(?:\d+,\d*|,\d+)(?:[eE][+-]?\d+)?$/;
const unq = t => t.trim().replace(/^"(.*)"$/, '$1').replace(/^'(.*)'$/, '$1').trim();
// 1つの欄を数にする。comma が true なら「1,5」を 1.5 と読む(区切りがコンマでないときだけ)
const asNum = (t, comma) => {
  const s = unq(t);
  if (NUM_DOT.test(s)) return Number(s);
  if (comma && NUM_COMMA.test(s)) return Number(s.replace(',', '.'));
  return NaN;
};
// 1行を欄に分ける: タブかセミコロンがあればそれで(欄の中の「,」は小数点)、
// 空白で分けて全部が数になればそれで(「1,5 2,3」も読む)、そうでなければコンマで分ける(このとき「,」は区切り)
export function splitLine(line) {
  const s = String(line ?? '').replace(/^﻿/, '').trim();
  if (!s) return null;
  if (/[\t;]/.test(s)) return s.split(/[\t;]/).map(t => asNum(t, true));
  const ws = s.split(/\s+/);
  if (ws.length >= 2 && ws.every(t => !Number.isNaN(asNum(t, true)))) return ws.map(t => asNum(t, true));
  if (s.includes(',')) return s.split(',').map(t => asNum(t, false));
  return ws.map(t => asNum(t, false));
}
// テキスト全体を読む。cx・cy は横軸(変位・ひずみ)と縦軸(荷重・応力)の列の番号(1から)。
// 最初のデータ行より前の読めない行は見出しとして数え、データが始まったあとの読めない行は bad に行番号を入れる
export function parseData(text, cx = 1, cy = 2) {
  const x = [], y = [], bad = [];
  let header = 0;
  String(text ?? '').split(/\r\n|\r|\n/).forEach((ln, i) => {
    const t = splitLine(ln);
    if (!t) return;
    const a = t[cx - 1], b = t[cy - 1];
    if (Number.isFinite(a) && Number.isFinite(b)) { x.push(a); y.push(b); }
    else if (!x.length) header++;
    else bad.push(i + 1);
  });
  if (!x.length) return { x, y, header: 0, bad: [], unread: header };
  return { x, y, header, bad, unread: 0 };
}

// 荷重−変位を公称応力−公称ひずみに: σ = F/A₀(N/mm² = MPa)、ε = ΔL/L₀。応力−ひずみなら単位だけそろえる(ε は無次元)
export function toStressStrain(x, y, c) {
  if (c.kind === 'fd') {
    const k = c.fu === 'kN' ? 1000 : 1;
    return { e: x.map(v => v / c.L0), s: y.map(v => (v * k) / c.A0) };
  }
  const k = c.su === 'pct' ? 100 : 1;
  return { e: x.map(v => v / k), s: y.slice() };
}
// 断面積(mm²): 丸棒 πd²/4、板 w·t、直接
export const areaOf = (shape, d, w, t, a) => (shape === 'round' ? (Math.PI * d * d) / 4 : shape === 'plate' ? w * t : a);

// =====================================================================
// 解析
// =====================================================================
// 最小二乗の直線 y = a·x + b と決定係数
export function linfit(xs, ys) {
  const n = xs.length;
  if (n < 2) return null;
  let sx = 0, sy = 0;
  for (let i = 0; i < n; i++) { sx += xs[i]; sy += ys[i]; }
  const mx = sx / n, my = sy / n;
  let sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < n; i++) { const dx = xs[i] - mx, dy = ys[i] - my; sxx += dx * dx; sxy += dx * dy; syy += dy * dy; }
  if (!(sxx > 0)) return null;
  const a = sxy / sxx, b = my - a * mx;
  const r2 = syy > 0 ? (sxy * sxy) / (sxx * syy) : 1;
  return { a, b, r2, n };
}

// 配列の最大・最小(点が多くても呼び出しの引数の上限に当たらないように、展開せずにループで)
const amax = (a, m = -Infinity) => { for (const v of a) if (v > m) m = v; return m; };
const amin = (a, m = Infinity) => { for (const v of a) if (v < m) m = v; return m; };

// 解析の設定(既定値)
// E の自動範囲は二段構え(この計算で決めた規則)。
//   一段目: 引張強さの elo〜ehi 倍(10〜40 %)の応力の点。決定係数 R² が eR2(0.999)以上ならこれを使う。
//   曲がりの判定: 範囲を応力の中央で上下に分け、上の半分の傾きが下の半分の eCurv(0.9)倍より小さいときだけ「曲がっている」とする
//           (雑音で R² が下がっただけの直線を二段目に回さないため)。
//   二段目: R² が eR2 未満で、しかも曲がっているときだけ、最初の立ち上がり(応力が初めて eUp × Rm = 0.5 Rm を超えるまで)の中で、
//           幅 eW × Rm(0.1 Rm)の応力の窓を、下端 eLo0 × Rm(0.02 Rm)から eStep × Rm(0.01 Rm)刻みで eLo1 × Rm(0.4 Rm)まで動かし、
//           点が eMinN(8)点以上ある窓のうち傾きが最大のものを使う(一段目より傾きが大きいときだけ。候補がなければ一段目のまま)。
//   比例限度の低い材料(焼なまし銅・純アルミなど)では 10〜40 % に塑性が入って E が大きく小さく出るため、より直線に近い所を探す。
//   それでも試験の曲線から出す E は小さめに出やすいので、E が分かっていれば erng: { known } で与える
export const DEF = { elo: 0.1, ehi: 0.4, off: 0.002, drop: 0.005, flow: 0.0005, ypMax: 0.005, frac: 0.1,
  eR2: 0.999, eCurv: 0.9, eUp: 0.5, eW: 0.1, eLo0: 0.02, eLo1: 0.4, eStep: 0.01, eMinN: 8 };

// E の自動範囲の二段目: 傾き最大の応力の窓を探す。最初の立ち上がりの点を応力の順に並べ、窓の両端を二分探索で決めるので、
// 窓ごとに全点を回さない(1つの点が入る窓は高々 eW/eStep + 1 = 11 個。10 万点でも数百万回の足し算で済む)。
// 窓は下端 ≤ σ ≤ 上端(両端を含む)。返す値: { fit, fi(点の番号、小さい順), lo, hi(窓の応力 MPa) } か null
export function eSearch(e, s, smax, opt = {}) {
  const o = { ...DEF, ...opt };
  const top = o.eUp * smax;
  let k = 0;
  while (k < s.length && s[k] <= top) k++;
  const idx = new Array(k);
  for (let i = 0; i < k; i++) idx[i] = i;
  idx.sort((a, b) => s[a] - s[b]);
  const sv = idx.map(i => s[i]);
  // 値 v 以上(gt なら v より大きい)の最初の位置
  const bound = (v, gt) => { let a = 0, b = sv.length; while (a < b) { const m = (a + b) >> 1; if (gt ? sv[m] <= v : sv[m] < v) a = m + 1; else b = m; } return a; };
  const nW = Math.round((o.eLo1 - o.eLo0) / o.eStep);
  let best = null;
  for (let j = 0; j <= nW; j++) {
    const lo = (o.eLo0 + j * o.eStep) * smax, hi = lo + o.eW * smax;
    const i0 = bound(lo, false), i1 = bound(hi, true);
    if (i1 - i0 < o.eMinN) continue;
    const xs = new Array(i1 - i0), ys = new Array(i1 - i0);
    for (let m = i0; m < i1; m++) { xs[m - i0] = e[idx[m]]; ys[m - i0] = sv[m]; }
    const fit = linfit(xs, ys);
    if (fit && fit.a > 0 && (!best || fit.a > best.fit.a)) best = { fit, i0, i1, lo, hi };
  }
  if (!best) return null;
  const fi = idx.slice(best.i0, best.i1).sort((a, b) => a - b);
  return { fit: best.fit, fi, lo: best.lo, hi: best.hi };
}

// e: 公称ひずみ(無次元)、s: 公称応力(MPa)。opt:
//   erng: 'auto'(引張強さの elo〜ehi 倍の応力の範囲。最初の立ち上がりの部分だけ。直線でなければ傾き最大の窓。DEF の説明)、
//         [下限, 上限](MPa)、{ known: E(MPa) }(E はあてはめずにこの値を使う。範囲は 'auto' と同じ決め方で、ひずみの原点だけに使う)
//   off: オフセットのひずみ(無次元、0.002 = 0.2 %)、yp: 'auto' | 'none'(降伏点を探さない)
//   nrng: 'auto'(一様な塑性域の全体)か [下限, 上限](公称の塑性ひずみ、無次元)、nm: 'plastic'(真塑性ひずみ)| 'total'(真ひずみ全体)
export function analyze(e, s, opt = {}) {
  const o = { ...DEF, erng: 'auto', yp: 'auto', nrng: 'auto', nm: 'plastic', ...opt };
  const N = e.length;
  const R = { warn: [], N };
  if (N < 10) { R.error = 'few'; return R; }
  let smax = -Infinity;
  for (const v of s) if (v > smax) smax = v;
  if (!(smax > 0)) { R.error = 'nopos'; return R; }

  // ---- 1. ヤング率: 最初の立ち上がり(応力が上限を初めて超えるまで)の、範囲の中の点で σ = E·ε + b
  const isKnown = !!o.erng && typeof o.erng === 'object' && !Array.isArray(o.erng);
  const known = isKnown ? o.erng.known : undefined;
  if (isKnown && !(known > 0)) { R.error = 'eknown'; return R; } // { known } で E が空・0 以下・数でない
  const auto = o.erng === 'auto' || isKnown;
  let [elo, ehi] = auto ? [o.elo * smax, o.ehi * smax] : o.erng;
  let kUp = 0;
  while (kUp < N && s[kUp] <= ehi) kUp++;
  let fi = [];
  for (let i = 0; i < kUp; i++) if (s[i] >= elo) fi.push(i);
  let fit = linfit(fi.map(i => e[i]), fi.map(i => s[i]));
  if (fit && fit.n >= 3 && !(fit.a > 0)) { R.error = 'eneg'; R.eN = fi.length; return R; }
  if (!fit || fit.n < 3) { R.error = 'efit'; R.eN = fi.length; return R; }
  // 自動の二段目: 10〜40 % が直線でなく(R² < eR2)、上の半分の傾きが下の半分の 0.9 倍未満なら、立ち上がりで傾き最大の窓に移す(傾きが大きくなるときだけ)
  // 上下の半分の傾き(曲がりの判定)
  const curved = () => {
    const mid = (elo + ehi) / 2, lo = fi.filter(i => s[i] < mid), hi = fi.filter(i => s[i] >= mid);
    const fl = linfit(lo.map(i => e[i]), lo.map(i => s[i])), fh = linfit(hi.map(i => e[i]), hi.map(i => s[i]));
    return !!(fl && fh && fl.n >= 3 && fh.n >= 3 && fl.a > 0 && fh.a < o.eCurv * fl.a);
  };
  if (auto && fit.r2 < o.eR2 && curved()) {
    const w = eSearch(e, s, smax, o);
    if (w && w.fit.a > fit.a) {
      Object.assign(R, { eAuto: 'search', r2Base: fit.r2, eBase: fit.a, eRangeBase: [elo, ehi] });
      ({ fit, fi } = w); elo = w.lo; ehi = w.hi;
      if (known === undefined) R.warn.push('e_search');
    }
  }
  R.eRange = [elo, ehi];
  let E, e0;
  if (known !== undefined) {
    // 既知の E: 傾きを E に固定し、切片だけを最小二乗で決める。σ = E(ε − ε₀) の残差 Σ(σ − E(ε − ε₀))² を最小にする
    // ε₀ は ε₀ = mean(ε − σ/E)(範囲の点の平均)。初めのたるみの補正になる。R.Efit・R.r2 は同じ点の直線の当てはめ(参考)
    E = known;
    let sum = 0;
    for (const i of fi) sum += e[i] - s[i] / E;
    e0 = sum / fi.length;
    Object.assign(R, { eKnown: true, Efit: fit.a });
  } else { E = fit.a; e0 = -fit.b / E; }
  Object.assign(R, { E, e0, r2: fit.r2, eN: fit.n, eIdx: [fi[0], fi[fi.length - 1]] });
  const ep = i => e[i] - e0 - s[i] / E; // 公称の塑性ひずみ(弾性分を引いたもの)

  // ---- 2. 上降伏点: E の範囲より先で、塑性ひずみが ypMax 以下の最初の極大のうち、そのあと応力が drop(0.5 %)以上下がり、
  //         ReH を超えないまま flow(0.05 %)以上ひずみが進むもの(ISO 6892-1 の説明にある判定の目安。この計算での定義)
  let yp = null;
  if (o.yp !== 'none') {
    for (let i = Math.max(1, kUp); i < N - 1; i++) {
      if (ep(i) > o.ypMax) break;
      if (!(s[i] >= s[i - 1] && s[i] > s[i + 1])) continue;
      let m = i + 1, low = Infinity;
      while (m < N && s[m] <= s[i]) { low = Math.min(low, s[m]); m++; }
      const span = e[m - 1] - e[i];
      if (low <= s[i] * (1 - o.drop) && low >= 0.5 * s[i] && span >= o.flow && m - i >= 3) { yp = { iH: i, m }; break; }
    }
  }

  // ---- 3. 降伏の間: ReH の次から、応力が再び ReH を超えるまで(超えなければ、そのあとの最大の点まで)。
  //         降伏点伸びの終わり = その間の最後の極小(傾き 0 の点。均一な加工硬化の始まり)。
  //         下降伏点 = その間の極小のうち最初のもの(初期過渡効果)を除いた最小(極小が1つならそれ)。この計算での定義
  let kEnd = -1;
  if (yp) {
    let m = yp.m;
    if (m >= N) { // ReH を超えないまま終わる: 最初の極小のあとの最大の点まで
      let im = yp.iH + 1;
      for (let i = yp.iH + 1; i < N; i++) if (s[i] > s[im]) im = i;
      m = im;
    }
    const mins = [];
    for (let k = yp.iH + 1; k < m; k++) {
      const prev = s[k - 1], next = k + 1 < N ? s[k + 1] : -Infinity;
      if (s[k] <= prev && s[k] < next) mins.push(k);
    }
    if (mins.length) {
      kEnd = mins[mins.length - 1];
      const use = mins.length >= 2 ? mins.slice(1) : mins;
      let iL = use[0];
      for (const k of use) if (s[k] < s[iL]) iL = k;
      let iMin = mins[0];
      for (const k of mins) if (s[k] < s[iMin]) iMin = k;
      R.ReH = s[yp.iH]; R.iH = yp.iH; R.eH = e[yp.iH] - e0;
      R.ReL = s[iL]; R.iL = iL; R.ReLall = s[iMin]; R.nMins = mins.length;
      R.iAe = kEnd; R.Ae = e[kEnd] - e[yp.iH];
    }
  }
  R.hasYP = kEnd >= 0;

  // ---- 4. 破断: 最大の点(降伏点があれば降伏点伸びの終わりより先)から先で、1点で応力が最大応力の frac(10 %)を超えて落ちる直前の点。
  //         落ちる点がなければ最後の点
  const from = R.hasYP ? kEnd : 0;
  let iPk = from;
  for (let i = from; i < N; i++) if (s[i] > s[iPk]) iPk = i;
  let jF = N - 1;
  for (let i = iPk; i < N - 1; i++) if (s[i] - s[i + 1] > o.frac * smax) { jF = i; break; }
  R.iF = jF; R.after = N - 1 - jF;

  // ---- 5. 引張強さ: 破断までの最大の応力(最初の点)。一様伸び: そのときのひずみ(全体 Agt と、弾性分を引いた Ag)
  let iM = 0;
  for (let i = 0; i <= jF; i++) if (s[i] > s[iM]) iM = i;
  R.Rm = s[iM]; R.iM = iM;
  R.Agt = e[iM] - e0; R.Ag = ep(iM);
  if (R.hasYP && iM === R.iH) R.warn.push('rm_is_reh');
  // 最大の付近が平らなとき(最大の 0.1 % 以内の点のひずみの幅)
  let a = iM, b = iM;
  while (a > 0 && s[a - 1] >= R.Rm * 0.999) a--;
  while (b < jF && s[b + 1] >= R.Rm * 0.999) b++;
  R.AgtSpan = [e[a] - e0, e[b] - e0];

  // ---- 6. 破断までの伸び(曲線から): 全体 At と、弾性の戻りを引いた値(破断後の伸び A の目安)
  R.sF = s[jF]; R.At = e[jF] - e0; R.Af = ep(jF);

  // ---- 7. オフセット法の耐力: σ = E(ε − e0 − off) と曲線の最初の交点(点の間は直線補間)
  const f = i => s[i] - E * (e[i] - e0 - o.off);
  R.off = o.off;
  for (let i = Math.max(1, fi[0] ?? 1); i <= jF; i++) {
    if (f(i - 1) > 0 && f(i) <= 0) {
      const t = f(i - 1) / (f(i - 1) - f(i));
      R.Rp = s[i - 1] + t * (s[i] - s[i - 1]);
      R.eRp = e[i - 1] + t * (e[i] - e[i - 1]) - e0;
      R.iRp = i;
      break;
    }
  }

  // ---- 8. 曲線の下の面積(台形則、最初の点から破断の点まで)。MPa × 無次元 = MJ/m³
  let W = 0;
  for (let i = 1; i <= jF; i++) W += ((s[i] + s[i - 1]) / 2) * (e[i] - e[i - 1]);
  R.W = W;

  // ---- 9. n 値: σt = σ(1 + ε)、εt = ln(1 + ε)(ε はひずみの原点を e0 に移したもの)、真塑性ひずみ εtp = εt − σt/E。
  //         範囲は公称の塑性ひずみで決める。auto = 一様な塑性域の全体(降伏点伸びの終わり、なければオフセットの点から、最大の点の直前まで)
  const eps = i => e[i] - e0;
  R.true = i => { const st = s[i] * (1 + eps(i)), et = Math.log(1 + eps(i)); return { st, et, etp: et - st / E }; };
  let nlo, nhi;
  if (o.nrng === 'auto') {
    nlo = R.hasYP ? ep(kEnd) : o.off;
    nhi = R.Ag;
    R.nAuto = true;
  } else {
    [nlo, nhi] = o.nrng;
    if (nhi > R.Ag) R.warn.push('n_over_ag');
  }
  const ni = [];
  const iStart = R.hasYP ? kEnd : 0;
  for (let i = iStart; i < iM; i++) { const p = ep(i); if (p >= nlo - 1e-12 && p <= nhi + 1e-12 && p > 0) ni.push(i); }
  R.nRange = [nlo, Math.min(nhi, R.Ag)];
  R.nN = ni.length;
  if (ni.length >= 2) {
    const tv = ni.map(R.true);
    const xs = tv.map(v => (o.nm === 'total' ? v.et : v.etp));
    if (xs.every(v => v > 0)) {
      const nf = linfit(xs.map(Math.log), tv.map(v => Math.log(v.st)));
      if (nf) {
        R.n = nf.a; R.K = Math.exp(nf.b); R.nR2 = nf.r2; R.nIdx = ni; R.nm = o.nm;
        if (o.nm === 'total' && tv.some(v => v.st / E > 0.1 * v.et)) R.warn.push('n_total_elastic');
      }
    }
    if (ni.length < 5) R.warn.push('n_few');
  } else R.warn.push('n_none');
  if (R.hasYP && R.Ae > 0 && R.nAuto) R.nFromAe = true;
  return R;
}

// =====================================================================
// 練習用の合成データ(答えの分かる曲線)
// =====================================================================
// 軟鋼風(荷重 kN − 変位 mm、丸棒 d = 10 mm、L₀ = 50 mm):
//   E = 206 GPa の直線で ReH = 310 MPa まで → 285・262 MPa(初期過渡の極小)→ 降伏の段 274 + 3cos(2πk/8) MPa(Δε = 0.025 %)、
//   k = 68 の極小(271 MPa)で降伏点伸びが終わり、そこから σt = K·εtpⁿ(n = 0.22、K はその点で 271 MPa につながる値)。
//   最大の点(Considère の条件 εtp = n(1 − σt/E))を過ぎたら σ に 1 − 30(ε − εu)² をかけてくびれを模し、εtp = 0.27 で破断。
// アルミニウム合金風(応力 MPa − ひずみ %): 200 MPa までは σ = Eε の直線、そこから先は真塑性ひずみ εtp を刻んで
//   σt = K·εtpⁿ、εt = εtp + σt/E(E = 69 GPa、K = 440 MPa、n = 0.08)、
//   最大の点を過ぎたら 1 − 40(ε − εu)²、εtp = 0.13 で破断。どちらも破断のあとに急に落ちた2点を足す
// 焼なまし銅風(応力 MPa − ひずみ %、比例限度の低い連続降伏): Ramberg–Osgood の式 εt = σt/E + a(σt/σ₀)^m
//   (E = 117 GPa、a = 0.002、σ₀ = 60 MPa、m = 3。σ₀ が作った 0.2 % 耐力にあたり、n = 1/m、K = σ₀/a^(1/m))。
//   σt を 0 から 330/399 MPa 刻みで(0〜330 MPa の 400 点。Considère の点 σt ≈ 329.9 MPa はこの範囲の終わりにあり、公称応力の最大は σt = 330 MPa の点)、
//   その先も同じ刻みで εtp = 0.42 まで続け、最大の点を過ぎたら 1 − 10(ε − εu)² をかけてくびれを模す。破断のあとに急に落ちた2点を足す
export const SAMPLE = {
  steel: { E: 206000, ReH: 310, ReL: 271, first: 262, n: 0.22, d: 10, L0: 50, dk: 0.00025, kEnd: 68, c: 30, etpF: 0.27 },
  al: { E: 69000, K: 440, n: 0.08, c: 40, etpF: 0.13 },
  cu: { E: 117000, a: 0.002, s0: 60, m: 3, ds: 330 / 399, c: 10, etpF: 0.42 },
};
// Ramberg–Osgood の曲線の Considère の点: 公称応力 σt·exp(−εt) が最大 ⇔ 1/σt = 1/E + a·m·σt^(m−1)/σ₀^m(二分法で解く)
export function considereRO(P) {
  const g = st => 1 / st - 1 / P.E - (P.a * P.m * st ** (P.m - 1)) / P.s0 ** P.m;
  let lo = 1, hi = 10 * P.s0 * 100;
  for (let k = 0; k < 200; k++) { const m = (lo + hi) / 2; if (g(m) > 0) lo = m; else hi = m; }
  const st = (lo + hi) / 2, et = st / P.E + P.a * (st / P.s0) ** P.m;
  return { st, et, etp: et - st / P.E, e: Math.exp(et) - 1, s: st / Math.exp(et) };
}
// Considère の点(公称応力が最大): εtp = n(1 − σt/E)、σt = K·εtpⁿ を繰り返しで解く
export function considere(K, n, E) {
  let etp = n;
  for (let k = 0; k < 100; k++) etp = n * (1 - (K * etp ** n) / E);
  const st = K * etp ** n, et = etp + st / E;
  return { etp, st, et, e: Math.exp(et) - 1, s: st / Math.exp(et) };
}
export function sample(kind) {
  const rows = [];
  if (kind === 'steel') {
    const P = SAMPLE.steel, A0 = (Math.PI * P.d * P.d) / 4;
    const push = (e, s) => rows.push([e, s]);
    for (let k = 0; k <= 20; k++) { const s = (P.ReH * k) / 20; push(s / P.E, s); }
    const eH = P.ReH / P.E;
    push(eH + 0.0001, 285); push(eH + 0.0002, P.first); push(eH + 0.0003, 270);
    for (let k = 0; k <= P.kEnd; k++) push(eH + 0.0004 + k * P.dk, 274 + 3 * Math.cos((2 * Math.PI * k) / 8));
    const eL = eH + 0.0004 + P.kEnd * P.dk;
    const stL = P.ReL * (1 + eL), etpL = Math.log(1 + eL) - stL / P.E, K = stL / etpL ** P.n;
    const cu = considere(K, P.n, P.E);
    const M = 160;
    for (let k = 1; k <= M; k++) {
      const etp = etpL + ((P.etpF - etpL) * k) / M, st = K * etp ** P.n, et = etp + st / P.E, e = Math.exp(et) - 1;
      const d = Math.max(0, e - cu.e);
      push(e, (st / (1 + e)) * (1 - P.c * d * d));
    }
    const [eF, sF] = rows[rows.length - 1];
    push(eF + 0.0004, 0.35 * sF); push(eF + 0.0008, 3);
    return { kind: 'fd', fu: 'kN', K, cu, A0, text: `Displacement (mm)\tForce (kN)\n${rows.map(([e, s]) => `${(e * P.L0).toFixed(5)}\t${((s * A0) / 1000).toFixed(4)}`).join('\n')}\n` };
  }
  if (kind === 'cu') {
    const P = SAMPLE.cu, cu = considereRO(P);
    for (let k = 0; ; k++) {
      const st = k * P.ds, etp = P.a * (st / P.s0) ** P.m;
      if (etp > P.etpF) break;
      const et = st / P.E + etp, e = Math.exp(et) - 1, d = Math.max(0, e - cu.e);
      rows.push([e, (st / (1 + e)) * (1 - P.c * d * d)]);
    }
    const [eF, sF] = rows[rows.length - 1];
    rows.push([eF + 0.0002, 0.3 * sF], [eF + 0.0004, 2]);
    return { kind: 'ss', su: 'pct', cu, text: `Strain (%)\tStress (MPa)\n${rows.map(([e, s]) => `${(e * 100).toFixed(5)}\t${s.toFixed(2)}`).join('\n')}\n` };
  }
  const P = SAMPLE.al;
  const push = (e, s) => rows.push([e, s]);
  // 200 MPa までは直線、そのあとは εtp で刻む
  for (let k = 0; k <= 20; k++) push((10 * k) / P.E, 10 * k);
  const cu = considere(P.K, P.n, P.E);
  const etps = [];
  for (let k = 0; k <= 24; k++) etps.push(1e-4 * 100 ** (k / 24)); // 1e-4〜1e-2
  for (let k = 1; k <= 120; k++) etps.push(0.01 + ((P.etpF - 0.01) * k) / 120);
  for (const etp of etps) {
    const st = P.K * etp ** P.n, et = etp + st / P.E, e = Math.exp(et) - 1;
    if (st <= 200) continue;
    const d = Math.max(0, e - cu.e);
    push(e, (st / (1 + e)) * (1 - P.c * d * d));
  }
  const [eF, sF] = rows[rows.length - 1];
  push(eF + 0.0002, 0.3 * sF); push(eF + 0.0004, 2);
  return { kind: 'ss', su: 'pct', cu, text: `Strain (%)\tStress (MPa)\n${rows.map(([e, s]) => `${(e * 100).toFixed(5)}\t${s.toFixed(2)}`).join('\n')}\n` };
}

// =====================================================================
// 画面
// =====================================================================
const form = typeof document !== 'undefined' ? document.getElementById('tensile-form') : null;
if (form) ui();

function ui() {
  const T = JSON.parse(form.dataset.text || '{}');
  const el = form.elements;
  const box = document.querySelector('[data-out="main"]');
  const lang = document.documentElement.lang || 'en';
  const home = document.documentElement.dataset.home ?? '/';
  const isCJK = /^(ja|zh)/.test(lang); // 全角の句点・括弧を使う言語(韓国語はピリオドと半角の括弧)
  const esc = v => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const fill = (str, v = {}) => String(str ?? '').replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m));
  const fin = Number.isFinite;
  const minus = t => t.replace(/^-/, '−');
  // 表示用の数: 小数 d 桁(言語の書き方)。CSV は「.」で
  const fx = (x, d) => (fin(x) ? minus(x.toLocaleString(lang, { minimumFractionDigits: d, maximumFractionDigits: d, useGrouping: false })) : '–');
  const sg = (x, d = 3) => (fin(x) ? minus(x.toLocaleString(lang, { maximumSignificantDigits: d, useGrouping: false })) : '–');
  const csvN = (x, d) => (fin(x) ? x.toFixed(d) : '');
  const lab = n => el[n]?.closest('label');
  const par = str => (isCJK ? `(${str})` : ` (${str})`);

  // ---- 見た目(このツールだけの小さな CSS) ----
  const css = document.createElement('style');
  css.textContent = `
#tensile-form .dy-field[hidden], #tensile-form .ts-sub[hidden] { display: none !important; }
#tensile-form .ts-wide { grid-column: 1 / -1; }
#tensile-form .ts-wide2 { grid-column: span 2; }
.ts-sub { grid-column: 1 / -1; margin: 6px 0 -4px; font-size: .85rem; font-weight: 700; color: var(--text); border-top: 1px solid var(--border); padding-top: 10px; }
.ts-paste { grid-column: 1 / -1; display: flex; flex-direction: column; gap: 6px; font-size: .88rem; color: var(--muted); }
.ts-paste textarea { font: inherit; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: .85rem; line-height: 1.45; color: var(--text); background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; width: 100%; min-height: 9.5em; resize: vertical; box-sizing: border-box; }
.ts-btns { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.ts-btns .btn { min-height: 40px; }
.ts-file { position: relative; overflow: hidden; }
.ts-file input { position: absolute; inset: 0; opacity: 0; cursor: pointer; width: 100%; }
.ts-read { grid-column: 1 / -1; margin: 0; font-size: .85rem; color: var(--muted); }
.ts-root { --ts-c: #2a78d6; --ts-e: #d4570f; --ts-o: #7b4cc9; --ts-n: #0a8a5f; --ts-y: #c2185b; --ts-m: #17212e; --ts-g: #8a96a8; }
@media (prefers-color-scheme: dark) { .ts-root { --ts-c: #6aa9ff; --ts-e: #ff9a5c; --ts-o: #b69cff; --ts-n: #46d19c; --ts-y: #ff7fae; --ts-m: #e4ebf3; --ts-g: #6c7b8f; } }
.ts-root h3 { margin: 18px 0 8px; font-size: 1.02rem; }
.ts-root .fig { padding: 8px; }
.ts-root .fig svg { display: block; width: 100%; max-width: 640px; height: auto; margin: 0 auto; }
.ts-root .fig { overflow: hidden; }
.ts-root .dy-stats dd { font-size: 1.05rem; overflow-wrap: anywhere; }
.ts-root .dy-table { font-size: .84rem; }
.ts-root .dy-table td, .ts-root .dy-table th { white-space: nowrap; vertical-align: top; }
.ts-root .dy-table td.l, .ts-root .dy-table th.l { text-align: left; white-space: normal; min-width: 9em; }
@media (max-width: 640px) {
  .ts-root .dy-table thead { display: none; }
  .ts-root .dy-table tr { display: grid; grid-template-columns: minmax(0, 1fr) auto auto auto; column-gap: 8px; padding: 8px 10px; border-bottom: 1px solid var(--border); }
  .ts-root .dy-table th, .ts-root .dy-table td { border: 0; padding: 2px 0; }
  .ts-root .dy-table th.l { min-width: 0; }
  .ts-root .dy-table td.l { grid-column: 1 / -1; min-width: 0; color: var(--muted); font-size: .8rem; }
  .ts-root .dy-table td.l::before { content: attr(data-l) ": "; font-weight: 700; }
}
.ts-warn { margin: 8px 0; padding: 8px 12px; border-radius: 8px; font-size: .88rem; line-height: 1.6; background: var(--ng-bg, var(--bg)); color: var(--text); border-left: 4px solid var(--ng); }
.ts-warn.soft { background: var(--accent-soft, var(--bg)); border-left-color: var(--accent); }
.ts-legend { display: flex; flex-wrap: wrap; justify-content: center; gap: 4px 14px; margin: 8px 0 0; font-size: .82rem; padding: 0; list-style: none; }
.ts-legend li { display: inline-flex; align-items: center; gap: 5px; }
.ts-legend i { display: inline-block; width: 18px; height: 0; border-top: 3px solid; }
.ts-legend i.dash { border-top-style: dashed; }
.ts-legend i.dot { width: 9px; height: 9px; border: 0; border-radius: 50%; }
.ts-tabs { display: flex; flex-wrap: wrap; gap: 6px; margin: 4px 0 8px; }
.ts-tabs button { font: inherit; font-size: .88rem; font-weight: 600; padding: 6px 12px; border-radius: 999px; border: 1px solid var(--border); background: var(--bg); color: var(--text); cursor: pointer; min-height: 38px; }
.ts-tabs button[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); color: var(--surface); }
.ts-eq { margin: 6px 0 0; padding-left: 1.3em; font-size: .9rem; line-height: 1.7; }
.ts-eq li { margin: 4px 0; overflow-wrap: anywhere; }
.ts-root details summary { cursor: pointer; font-weight: 700; }
.ts-root .muted { font-size: .85rem; }
`;
  document.head.append(css);
  box.classList.add('ts-root');

  // ---- フォームの整え: 貼り付け欄・ボタン・副見出し ----
  const h2 = form.querySelector('h2');
  const paste = document.createElement('label');
  paste.className = 'ts-paste';
  paste.innerHTML = `<span>${esc(T.paste)}</span><textarea name="data" rows="8" spellcheck="false" autocomplete="off" placeholder="${esc(T.paste_ph)}"></textarea>`;
  const btns = document.createElement('div');
  btns.className = 'ts-btns';
  btns.innerHTML = `<button type="button" class="btn btn-ghost" data-sample="steel">${esc(T.sample_steel)}</button>
<button type="button" class="btn btn-ghost" data-sample="al">${esc(T.sample_al)}</button>
<button type="button" class="btn btn-ghost" data-sample="cu">${esc(T.sample_cu)}</button>
<span class="btn btn-ghost ts-file">${esc(T.file)}<input type="file" accept=".csv,.txt,.tsv,.dat,text/csv,text/plain" aria-label="${esc(T.file)}"></span>
<button type="button" class="btn btn-ghost" data-clear>${esc(T.clear)}</button>`;
  const readP = document.createElement('p');
  readP.className = 'ts-read';
  readP.setAttribute('aria-live', 'polite');
  const local = document.createElement('p');
  local.className = 'ts-read';
  local.textContent = T.local;
  h2.after(paste, btns, readP, local);
  const ta = paste.querySelector('textarea');
  // 大きいファイル(5000 行より多い)は欄に入れずに持つ(欄に何十万行も入れると、ブラウザの描画に数秒かかるため)
  let fileText = null;
  const phDefault = ta.placeholder;
  const dropFile = () => { if (fileText != null) { fileText = null; ta.placeholder = phDefault; } };
  for (const [before, key] of [['kind', 'sub_data'], ['shape', 'sub_spec'], ['erng', 'sub_range'], ['du', 'sub_after']]) {
    const p = document.createElement('p');
    p.className = 'ts-sub';
    p.dataset.sub = key;
    p.textContent = T[key];
    lab(before).before(p);
  }
  lab('kind').classList.add('ts-wide');
  lab('src').classList.add('ts-wide');
  for (const n of ['erng', 'nrng', 'nm', 'shape']) lab(n).classList.add('ts-wide2');

  const show = (name, on) => { const l = lab(name); if (l) l.hidden = !on; };
  function syncFields() {
    const fd = el.kind.value === 'fd';
    show('fu', fd); show('su', !fd); show('src', fd);
    const sh = el.shape.value;
    show('d', sh === 'round'); show('w', sh === 'plate'); show('t', sh === 'plate'); show('a0', sh === 'area');
    show('du', sh === 'round'); show('wu', sh === 'plate'); show('tu', sh === 'plate'); show('au', sh === 'area');
    show('elo', el.erng.value === 'manual'); show('ehi', el.erng.value === 'manual'); show('eknown', el.erng.value === 'known');
    show('nlo', el.nrng.value === 'manual'); show('nhi', el.nrng.value === 'manual');
  }

  // ---- 入力の読み取り ----
  const val = n => { const v = String(el[n].value).trim().replace(',', '.'); return v === '' ? NaN : Number(v); };
  let current = null; // 最後の解析 { R, e, s, cfg }
  let view = 'eng';

  function run() {
    syncFields();
    const cfg = { kind: el.kind.value, fu: el.fu.value, su: el.su.value };
    const cx = Math.max(1, Math.round(val('cx') || 1)), cy = Math.max(1, Math.round(val('cy') || 2));
    const P = parseData(fileText ?? ta.value, cx, cy);
    const sh = el.shape.value;
    const A0 = areaOf(sh, val('d'), val('w'), val('t'), val('a0'));
    const Au = areaOf(sh, val('du'), val('wu'), val('tu'), val('au'));
    const L0 = val('L0'), Lu = val('Lu');
    // 読み取りの報告
    const msg = [];
    if (P.x.length) msg.push(fill(T.read_ok, { n: P.x.length }));
    if (P.header) msg.push(fill(T.read_header, { n: P.header }));
    if (P.bad.length) msg.push(fill(T.read_bad, { n: P.bad.length, lines: P.bad.slice(0, 5).join(', ') + (P.bad.length > 5 ? '…' : '') }));
    if (P.unread) msg.push(fill(T.read_none, { n: P.unread }));
    readP.textContent = msg.join(isCJK ? '。' : '. ') + (msg.length ? (isCJK ? '。' : '.') : '');
    if (!P.x.length) { current = null; box.innerHTML = `<p class="muted">${esc(T.empty)}</p>`; return; }
    if (cfg.kind === 'fd' && !(A0 > 0 && L0 > 0)) { current = null; box.innerHTML = `<p class="ts-warn">${esc(T.need_dims)}</p>`; return; }
    const { e, s } = toStressStrain(P.x, P.y, { ...cfg, A0, L0 });
    const opt = { off: (fin(val('off')) && val('off') > 0 ? val('off') : 0.2) / 100, yp: el.yp.value, nm: el.nm.value };
    if (el.erng.value === 'manual') {
      const lo = val('elo'), hi = val('ehi');
      if (!(lo >= 0 && hi > lo)) { current = null; box.innerHTML = `<p class="ts-warn">${esc(T.need_erange)}</p>`; return; }
      opt.erng = [lo, hi];
    }
    if (el.erng.value === 'known') {
      // 既知の E(GPa)。空・0 以下・数でないものはエラー
      const v = val('eknown');
      if (!(v > 0)) { current = null; box.innerHTML = `<p class="ts-warn">${esc(T.need_eknown)}</p>`; return; }
      opt.erng = { known: v * 1000 };
    }
    if (el.nrng.value === 'manual') {
      const lo = val('nlo'), hi = val('nhi');
      if (!(lo >= 0 && hi > lo)) { current = null; box.innerHTML = `<p class="ts-warn">${esc(T.need_nrange)}</p>`; return; }
      opt.nrng = [lo / 100, hi / 100];
    }
    const R = analyze(e, s, opt);
    if (R.error) { current = null; box.innerHTML = `<p class="ts-warn">${esc(fill(T[`err_${R.error}`] ?? (R.error === 'eknown' ? T.need_eknown : T.err_internal), { n: R.eN ?? 0 }))}</p>`; return; }
    R.A0 = A0; R.L0 = L0;
    if (Au > 0 && A0 > 0 && Au < A0) R.Z = (A0 - Au) / A0;
    if (Lu > 0 && L0 > 0) R.Aext = (Lu - L0) / L0;
    current = { R, e, s, cfg, opt };
    try { render(); } catch (err) { current = null; box.innerHTML = `<p class="ts-warn">${esc(T.err_internal)}</p>`; }
  }

  // ---- 図(SVG)。色は CSS の変数(画面)か固定の色(PNG) ----
  const SCREEN = { c: 'var(--ts-c)', e: 'var(--ts-e)', o: 'var(--ts-o)', n: 'var(--ts-n)', y: 'var(--ts-y)', m: 'var(--ts-m)', g: 'var(--ts-g)', text: 'var(--text)', muted: 'var(--muted)', grid: 'var(--border)', bg: 'none' };
  const PRINT = { c: '#2a78d6', e: '#d4570f', o: '#7b4cc9', n: '#0a8a5f', y: '#c2185b', m: '#17212e', g: '#8a96a8', text: '#17212e', muted: '#5a6a7e', grid: '#dbe3ec', bg: '#ffffff' };
  function ticks(lo, hi, want = 6) {
    const span = hi - lo;
    if (!(span > 0)) return [lo];
    const raw = span / want, p = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 2.5, 5, 10].map(k => k * p).find(k => k >= raw) ?? 10 * p;
    const out = [];
    for (let v = Math.ceil(lo / step - 1e-9) * step; v <= hi + step * 1e-9; v += step) out.push(Math.abs(v) < step * 1e-9 ? 0 : v);
    return out;
  }
  // 図の大きさ: 画面では枠の幅に合わせて viewBox を決め(スマートフォンでも文字が小さくならないように)、PNG は 560 × 400 の 2 倍
  let W = 520, H = 380, PL = 66, PR = 14, PT = 14, PB = 52, FS = 16;
  const setDims = w => {
    W = Math.round(Math.max(300, Math.min(560, w)));
    H = Math.round(Math.max(260, Math.min(400, W * 0.72)));
    FS = W < 420 ? 12.5 : 15;
    PL = W < 420 ? 50 : 62; PB = W < 420 ? 42 : 50;
  };
  // 図に描く点を max 点ほどに間引く(区間ごとに縦軸の最小と最大の点を、元の順で残す。計算には使わない)
  const thin = (pts, max) => {
    if (pts.length <= max) return pts;
    const k = Math.ceil(pts.length / (max / 2)), out = [];
    for (let i = 0; i < pts.length; i += k) {
      let a = i, b = i;
      for (let j = i; j < Math.min(i + k, pts.length); j++) { if (pts[j][1] < pts[a][1]) a = j; if (pts[j][1] > pts[b][1]) b = j; }
      if (a === b) out.push(pts[a]); else if (a < b) out.push(pts[a], pts[b]); else out.push(pts[b], pts[a]);
    }
    if (out[out.length - 1] !== pts[pts.length - 1]) out.push(pts[pts.length - 1]);
    return out;
  };
  // spec: { xr, yr, xl, yl, lines: [{ pts, col, w, dash, op }], dots: [{ x, y, col, lab, dx, dy }], xlog, ylog }
  function chart(spec, C, title) {
    const { xr, yr } = spec;
    const lt = (lo, hi) => { const a = []; for (let k = Math.floor(Math.log10(lo)); k <= Math.ceil(Math.log10(hi)); k++) for (const m of [1, 2, 5]) { const v = m * 10 ** k; if (v >= lo * 0.999 && v <= hi * 1.001) a.push(v); } return a; };
    const xt = spec.xlog ? lt(...xr) : ticks(...xr), yt = spec.ylog ? lt(...yr) : ticks(...yr, 6);
    const tl = (v, log) => (log ? sg(v, 2) : sg(v, 4));
    // 縦軸の目盛の数字が長いとき(1000、0.05 など)は左の余白を広げ、縦軸の名前と重ならないようにする
    const PLc = Math.max(PL, Math.ceil(FS * 1.7 + 10 + Math.max(...yt.map(v => tl(v, spec.ylog).length)) * FS * 0.75));
    const tx = v => (spec.xlog ? Math.log(v) : v), ty = v => (spec.ylog ? Math.log(v) : v);
    const X = v => PLc + ((tx(v) - tx(xr[0])) / (tx(xr[1]) - tx(xr[0]))) * (W - PLc - PR);
    const Y = v => H - PB - ((ty(v) - ty(yr[0])) / (ty(yr[1]) - ty(yr[0]))) * (H - PT - PB);
    let g = `<rect x="0" y="0" width="${W}" height="${H}" fill="${C.bg}"/>`;
    g += xt.map(v => `<line x1="${X(v).toFixed(1)}" x2="${X(v).toFixed(1)}" y1="${PT}" y2="${H - PB}" stroke="${C.grid}" stroke-width="1"/><text x="${X(v).toFixed(1)}" y="${H - PB + 20}" text-anchor="middle" font-size="${FS}" fill="${C.muted}">${esc(tl(v, spec.xlog))}</text>`).join('');
    g += yt.map(v => `<line x1="${PLc}" x2="${W - PR}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" stroke="${C.grid}" stroke-width="1"/><text x="${PLc - 6}" y="${(Y(v) + 6).toFixed(1)}" text-anchor="end" font-size="${FS}" fill="${C.muted}">${esc(tl(v, spec.ylog))}</text>`).join('');
    g += `<rect x="${PLc}" y="${PT}" width="${W - PLc - PR}" height="${H - PT - PB}" fill="none" stroke="${C.muted}" stroke-width="1"/>`;
    g += `<text x="${(PLc + W - PR) / 2}" y="${H - 8}" text-anchor="middle" font-size="${FS}" fill="${C.text}">${esc(spec.xl)}</text>`;
    g += `<text transform="translate(16 ${(PT + H - PB) / 2}) rotate(-90)" text-anchor="middle" font-size="${FS}" fill="${C.text}">${esc(spec.yl)}</text>`;
    g += `<clipPath id="clip-${spec.id}"><rect x="${PLc}" y="${PT}" width="${W - PLc - PR}" height="${H - PT - PB}"/></clipPath><g clip-path="url(#clip-${spec.id})">`;
    for (const L of spec.lines) {
      const pts = thin(L.pts.filter(([x, y]) => fin(x) && fin(y) && (!spec.xlog || x > 0) && (!spec.ylog || y > 0)), L.marks ? 1500 : 6000);
      if (pts.length < 2 && !L.marks) { if (!pts.length) continue; }
      if (L.marks) g += pts.map(([x, y]) => `<circle cx="${X(x).toFixed(1)}" cy="${Y(y).toFixed(1)}" r="3" fill="${C[L.col]}"${L.op ? ` opacity="${L.op}"` : ''}/>`).join('');
      else g += `<polyline fill="none" stroke="${C[L.col]}" stroke-width="${L.w ?? 2}" stroke-linejoin="round" stroke-linecap="round"${L.dash ? ` stroke-dasharray="${L.dash}"` : ''}${L.op ? ` opacity="${L.op}"` : ''} points="${pts.map(([x, y]) => `${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join(' ')}"/>`;
    }
    g += '</g>';
    for (const d of spec.dots) {
      if (!fin(d.x) || !fin(d.y)) continue;
      const cx = X(d.x), cy = Y(d.y);
      if (cx < PLc - 1 || cx > W - PR + 1 || cy < PT - 1 || cy > H - PB + 1) continue;
      g += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="5.5" fill="${C[d.col]}" stroke="${C.bg === 'none' ? 'var(--surface)' : C.bg}" stroke-width="1.5"/>`;
      if (d.lab) {
        const lx = Math.min(W - PR - 4, Math.max(PLc + 4, cx + (d.dx ?? 8))), ly = Math.min(H - PB - 4, Math.max(PT + FS, cy + (d.dy ?? -8)));
        g += `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" font-size="${FS}" font-weight="700" fill="${C[d.col]}"${(d.dx ?? 8) < 0 ? ' text-anchor="end"' : ''}>${esc(d.lab)}</text>`;
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(title)}" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif">${g}</svg>`;
  }

  // 図の中身
  const P100 = v => v * 100;
  function specs() {
    const { R, e, s } = current;
    const e0 = R.e0, n = R.iF;
    const cur = [];
    for (let i = 0; i <= Math.min(e.length - 1, n + R.after); i++) cur.push([P100(e[i] - e0), s[i]]);
    const EL = (a, b) => [[P100(a), R.E * a], [P100(b), R.E * b]];
    const eLo = R.eRange[0] / R.E, eHi = R.eRange[1] / R.E;
    const offPts = fin(R.Rp) ? [[P100(R.off), 0], [P100(R.off + (R.Rp * 1.08) / R.E), R.Rp * 1.08]] : [];
    const nPts = (R.nIdx ?? []).map(i => [P100(e[i] - e0), s[i]]);
    const dots = [];
    if (R.hasYP) {
      dots.push({ x: P100(R.eH), y: R.ReH, col: 'y', lab: T.lab_reh, dx: 8, dy: -8 });
      dots.push({ x: P100(e[R.iL] - e0), y: R.ReL, col: 'y', lab: T.lab_rel, dx: 8, dy: 22 });
    }
    if (fin(R.Rp)) dots.push({ x: P100(R.eRp), y: R.Rp, col: 'o', lab: fill(T.lab_rp, { p: sg(R.off * 100, 3) }), dx: 8, dy: R.hasYP ? 40 : 22 });
    dots.push({ x: P100(R.Agt), y: R.Rm, col: 'm', lab: T.lab_rm, dx: 0, dy: -10 });
    dots.push({ x: P100(R.At), y: R.sF, col: 'g', lab: T.lab_frac, dx: -8, dy: -10 });
    const xMax = P100(Math.max(R.At, e[Math.min(e.length - 1, n + R.after)] - e0)) * 1.03;
    const yMax = Math.max(R.Rm, R.ReH ?? 0) * 1.1;
    const main = { id: 'main', xr: [0, xMax], yr: [0, yMax], xl: T.ax_e, yl: T.ax_s, dots,
      lines: [{ pts: cur, col: 'c', w: 2 }, { pts: EL(eLo, eHi), col: 'e', w: 6, op: 0.75 }, { pts: offPts, col: 'o', w: 1.8, dash: '6 5' }, { pts: nPts, col: 'n', w: 5, op: 0.6 }] };
    // 初期の拡大: 降伏のあたり
    const xz = Math.min(P100(R.Agt), Math.max(P100((R.eRp ?? 0) * 3), R.hasYP ? P100(e[R.iAe] - e0) * 1.25 : 0, P100((R.Rm / R.E) * 4), 0.5));
    const yz = amax(cur.filter(([x]) => x <= xz).map(([, y]) => y), R.ReH ?? 0) * 1.12;
    const zoom = { id: 'zoom', xr: [0, xz], yr: [0, yz], xl: T.ax_e, yl: T.ax_s,
      dots: dots.filter(d => d.col !== 'm' && d.col !== 'g'),
      lines: [{ pts: cur.filter(([x]) => x <= xz * 1.05), col: 'c', w: 2 }, { pts: cur.filter(([x]) => x <= xz * 1.05), col: 'c', marks: true, op: 0.55 }, { pts: EL(eLo, eHi), col: 'e', w: 6, op: 0.75 }, { pts: offPts, col: 'o', w: 1.8, dash: '6 5' }, { pts: EL(0, Math.min(yz / R.E, xz / 100)), col: 'e', w: 1.2, dash: '3 4' }] };
    // 真応力−真ひずみ(最大の点まで)と、あてはめた曲線
    const tv = [];
    for (let i = 0; i <= R.iM; i++) { const v = R.true(i); tv.push([P100(v.et), v.st]); }
    const fitPts = [];
    if (fin(R.n) && R.nIdx?.length) {
      const a = R.nIdx[0], b = R.nIdx[R.nIdx.length - 1];
      const x0 = R.nm === 'total' ? R.true(a).et : R.true(a).etp, x1 = R.nm === 'total' ? R.true(b).et : R.true(b).etp;
      for (let k = 0; k <= 40; k++) { const x = x0 * (x1 / x0) ** (k / 40), st = R.K * x ** R.n; fitPts.push([P100(R.nm === 'total' ? x : x + st / R.E), st]); }
    }
    const engToM = cur.filter((_, i) => i <= R.iM);
    const tmax = tv.length ? amax(tv.map(p => p[1])) : yMax;
    const tru = { id: 'true', xr: [0, amax(tv.map(p => p[0])) * 1.04], yr: [0, tmax * 1.1], xl: T.ax_et, yl: T.ax_st,
      dots: [{ x: tv[tv.length - 1][0], y: tv[tv.length - 1][1], col: 'm', lab: T.lab_rm_true, dx: -8, dy: -10 }],
      lines: [{ pts: engToM, col: 'g', w: 1.5, dash: '4 4' }, { pts: tv, col: 'c', w: 2 }, { pts: (R.nIdx ?? []).map(i => { const v = R.true(i); return [P100(v.et), v.st]; }), col: 'n', w: 5, op: 0.6 }, { pts: fitPts, col: 'm', w: 1.5, dash: '6 4' }] };
    // n 値の両対数
    let nlog = null;
    if (fin(R.n) && R.nIdx?.length >= 2) {
      const pts = R.nIdx.map(i => { const v = R.true(i); return [R.nm === 'total' ? v.et : v.etp, v.st]; });
      const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
      const xa = amin(xs) / 1.3, xb = amax(xs) * 1.3, ya = amin(ys) / 1.08, yb = amax(ys) * 1.08;
      nlog = { id: 'nlog', xlog: true, ylog: true, xr: [xa, xb], yr: [ya, yb], xl: R.nm === 'total' ? T.ax_lnet : T.ax_lnetp, yl: T.ax_lnst, dots: [],
        lines: [{ pts, col: 'n', marks: true }, { pts: [[xa, R.K * xa ** R.n], [xb, R.K * xb ** R.n]], col: 'm', w: 1.5, dash: '6 4' }] };
    }
    return { main, zoom, tru, nlog };
  }

  // ---- 結果の表 ----
  function rows() {
    const { R, cfg } = current;
    const pc = v => fx(v * 100, 2);
    const mpa = v => fx(v, v >= 100 ? 0 : 1);
    const er = R.eRange;
    const out = [];
    const add = (key, sym, v, csv, unit, range, eq) => out.push({ name: T[`r_${key}`], sym, v, csv, unit, range, eq });
    // 範囲の名前: 手動 / 自動(10〜40 %)/ 自動の二段目(立ち上がりで傾き最大の窓)
    const how = Array.isArray(current.opt.erng) ? T.rg_manual
      : R.eAuto === 'search' ? T.rg_auto_search : fill(T.rg_auto_E, { a: sg(DEF.elo * 100, 2), b: sg(DEF.ehi * 100, 2) });
    const rgE = fill(T.rg_E, { a: mpa(er[0]), b: mpa(er[1]), n: R.eN, auto: how });
    if (R.eKnown) {
      // 既知の E: E は入力値。R² の行は、同じ範囲の点に直線を当てはめた傾き(参考。計算には使わない)とその R²
      add('E', 'E', sg(R.E / 1000, 4), csvN(R.E / 1000, 2), 'GPa', fill(T.rg_E_known, { rg: rgE, e0: fx(R.e0 * 100, 4) }), T.eq_E_known);
      add('r2', 'R²', fx(R.r2, 5), csvN(R.r2, 6), '–', fill(T.rg_r2_known, { e: sg(R.Efit / 1000, 4) }), T.eq_r2);
    } else {
      add('E', 'E', sg(R.E / 1000, 4), csvN(R.E / 1000, 2), 'GPa', rgE, T.eq_E);
      add('r2', 'R²', fx(R.r2, 5), csvN(R.r2, 6), '–', R.eAuto === 'search' ? fill(T.rg_r2_search, { r2: fx(R.r2Base, 4) }) : T.rg_r2, T.eq_r2);
    }
    add('Rp', `Rp${sg(R.off * 100, 3)}`, fin(R.Rp) ? mpa(R.Rp) : '–', csvN(R.Rp, 1), 'MPa', fin(R.Rp) ? fill(T.rg_Rp, { e: pc(R.eRp) }) : T.rg_none, fill(T.eq_Rp, { p: sg(R.off * 100, 3) }));
    if (R.hasYP) {
      add('ReH', 'ReH', mpa(R.ReH), csvN(R.ReH, 1), 'MPa', fill(T.rg_ReH, { e: pc(R.eH) }), T.eq_ReH);
      add('ReL', 'ReL', mpa(R.ReL), csvN(R.ReL, 1), 'MPa', fill(R.nMins >= 2 ? T.rg_ReL : T.rg_ReL1, { n: R.nMins, all: mpa(R.ReLall) }), T.eq_ReL);
      add('Ae', 'Ae', pc(R.Ae), csvN(R.Ae * 100, 3), '%', fill(T.rg_Ae, { a: pc(R.eH), b: pc(current.e[R.iAe] - R.e0) }), T.eq_Ae);
    }
    add('Rm', 'Rm', mpa(R.Rm), csvN(R.Rm, 1), 'MPa', T.rg_Rm, T.eq_Rm);
    add('Agt', 'Agt', pc(R.Agt), csvN(R.Agt * 100, 3), '%', R.AgtSpan[1] - R.AgtSpan[0] > 0.002 ? fill(T.rg_Agt_flat, { a: pc(R.AgtSpan[0]), b: pc(R.AgtSpan[1]) }) : T.rg_Agt, T.eq_Agt);
    add('Ag', 'Ag', pc(R.Ag), csvN(R.Ag * 100, 3), '%', T.rg_Ag, T.eq_Ag);
    add('At', 'At', pc(R.At), csvN(R.At * 100, 3), '%', fill(T.rg_At, { s: mpa(R.sF), n: R.after }), T.eq_At);
    add('Af', '–', pc(R.Af), csvN(R.Af * 100, 3), '%', T.rg_Af, T.eq_Af);
    if (fin(R.Aext)) add('A', 'A', pc(R.Aext), csvN(R.Aext * 100, 3), '%', fill(T.rg_A, { lu: sg(val('Lu'), 5), l0: sg(R.L0, 5) }), T.eq_A);
    if (fin(R.Z)) add('Z', 'Z', pc(R.Z), csvN(R.Z * 100, 3), '%', fill(T.rg_Z, { a0: sg(R.A0, 4) }), T.eq_Z);
    const rng = fill(R.nAuto ? (R.hasYP ? T.rg_n_auto_yp : T.rg_n_auto) : T.rg_n_manual, { a: pc(R.nRange[0]), b: pc(R.nRange[1]), k: R.nN });
    add('n', 'n', fin(R.n) ? fx(R.n, 3) : '–', csvN(R.n, 4), '–', rng, R.nm === 'total' ? T.eq_n_total : T.eq_n);
    add('K', 'K', fin(R.K) ? fx(R.K, 0) : '–', csvN(R.K, 1), 'MPa', fill(T.rg_K, { r2: fin(R.nR2) ? fx(R.nR2, 4) : '–' }), T.eq_K);
    add('W', 'W', sg(R.W, 3), csvN(R.W, 3), 'MJ/m³', T.rg_W, T.eq_W);
    return out;
  }

  // ---- 描く ----
  function render() {
    if (!current) return;
    const { R, cfg } = current;
    setDims((box.clientWidth || 520) - 18);
    const sp = specs();
    const rs = rows();
    const warns = [];
    if (cfg.kind === 'fd' && el.src.value === 'xhead') warns.push(['', T.w_xhead]);
    if (R.E < 1000 || R.E > 1.2e6) warns.push(['', fill(T.w_E_units, { e: sg(R.E / 1000, 3) })]);
    const emax = amax(current.e);
    if (cfg.kind === 'ss' && cfg.su === 'abs' && emax > 2) warns.push(['', T.w_strain_pct]);
    if (cfg.kind === 'ss' && cfg.su === 'pct' && emax < 0.005) warns.push(['', T.w_strain_abs]);
    // 二段目に移したとき(その注意を出す)と既知の E のときは、範囲を狭める注意は出さない
    if (R.r2 < 0.995 && !R.eAuto && !R.eKnown) warns.push(['soft', fill(T.w_r2, { r2: fx(R.r2, 4) })]);
    for (const w of R.warn) warns.push(['soft', fill(T[`w_${w}`], { r2: fx(R.r2Base, 4) })]);
    if (R.hasYP) warns.push(['soft', T.w_yp_report]);
    if (!R.hasYP && el.yp.value === 'auto') warns.push(['soft', T.w_no_yp]);
    if (R.after === 0) warns.push(['soft', T.w_no_drop]);

    const stats = [
      ['E', `${sg(R.E / 1000, 4)} GPa`],
      ...(R.hasYP ? [['ReH', `${fx(R.ReH, 0)} MPa`], ['ReL', `${fx(R.ReL, 0)} MPa`]] : [['Rp', `${fin(R.Rp) ? fx(R.Rp, 0) : '–'} MPa`]]),
      ['Rm', `${fx(R.Rm, 0)} MPa`], ['Ag', `${fx(R.Ag * 100, 2)} %`], ['n', fin(R.n) ? fx(R.n, 3) : '–'],
    ];
    const statName = k => ({ E: T.r_E, ReH: T.r_ReH, ReL: T.r_ReL, Rp: fill(T.r_Rp_s, { p: sg(R.off * 100, 3) }), Rm: T.r_Rm, Ag: T.r_Ag, n: T.r_n })[k];
    const legend = items => `<ul class="ts-legend">${items.map(([c, t, k]) => `<li><i class="${k ?? ''}" style="${k === 'dot' ? `background:var(--ts-${c})` : `border-color:var(--ts-${c})`}"></i>${esc(t)}</li>`).join('')}</ul>`;
    const viewBtns = `<div class="ts-tabs" role="group" aria-label="${esc(T.view)}">${['eng', 'true'].map(v => `<button type="button" data-view="${v}" aria-pressed="${view === v}">${esc(T[`view_${v}`])}</button>`).join('')}</div>`;
    const mainSpec = view === 'true' ? sp.tru : sp.main;
    const mainTitle = view === 'true' ? T.fig_true : T.fig_main;
    const mainLegend = view === 'true'
      ? legend([['c', T.lg_true], ['g', T.lg_eng, 'dash'], ['n', T.lg_nrange], ['m', T.lg_fit, 'dash']])
      : legend([['c', T.lg_curve], ['e', T.lg_erange], ['o', fill(T.lg_offset, { p: sg(R.off * 100, 3) }), 'dash'], ['n', T.lg_nrange], ['y', T.lg_yp, 'dot'], ['m', T.lg_rm, 'dot']]);
    const tbl = `<div class="table-wrap"><table class="dy-table"><thead><tr><th scope="col" class="l">${esc(T.col_q)}</th><th scope="col">${esc(T.col_sym)}</th><th scope="col">${esc(T.col_v)}</th><th scope="col">${esc(T.col_u)}</th><th scope="col" class="l">${esc(T.col_range)}</th><th scope="col" class="l">${esc(T.col_eq)}</th></tr></thead><tbody>${rs.map(r => `<tr><th scope="row" class="l">${esc(r.name)}</th><td class="ts-sym">${esc(r.sym)}</td><td class="ts-v" data-out="r-${esc(r.sym)}"><strong>${esc(r.v)}</strong></td><td class="ts-u">${esc(r.unit)}</td><td class="l" data-l="${esc(T.col_range)}">${esc(r.range)}</td><td class="l" data-l="${esc(T.col_eq)}">${esc(r.eq)}</td></tr>`).join('')}</tbody></table></div>`;
    const eqs = [T.eq_conv_fd, T.eq_true, T.eq_plastic].filter(Boolean);
    box.innerHTML = `${warns.map(([k, t]) => `<p class="ts-warn ${k}">${esc(t)}</p>`).join('')}
<dl class="dy-stats">${stats.map(([k, v]) => `<div><dt>${esc(statName(k))}</dt><dd data-out="${k}">${esc(v)}</dd></div>`).join('')}</dl>
<h3>${esc(T.fig_h)}</h3>${viewBtns}
<div class="fig" data-fig="main">${chart(mainSpec, SCREEN, mainTitle)}</div>${mainLegend}
<p class="muted">${esc(view === 'true' ? T.cap_true : T.cap_main)}</p>
<h3>${esc(T.fig_zoom)}</h3>
<div class="fig" data-fig="zoom">${chart(sp.zoom, SCREEN, T.fig_zoom)}</div>${legend([['c', T.lg_curve], ['e', T.lg_erange], ['o', fill(T.lg_offset, { p: sg(R.off * 100, 3) }), 'dash'], ['y', T.lg_yp, 'dot'], ['o', T.lg_rp, 'dot']])}
<div class="ts-btns" style="margin:10px 0"><button type="button" class="btn btn-ghost" data-act="png">${esc(T.btn_png)}</button></div>
<h3>${esc(T.tbl_h)}</h3>${tbl}
<div class="ts-btns" style="margin:10px 0"><button type="button" class="btn btn-ghost" data-act="txt" data-done="${esc(T.copied)}">${esc(T.btn_txt)}</button><button type="button" class="btn btn-ghost" data-act="csv" data-done="${esc(T.copied)}">${esc(T.btn_csv)}</button><button type="button" class="btn btn-ghost" data-act="data">${esc(T.btn_data)}</button></div>
${sp.nlog ? `<h3>${esc(T.fig_n)}</h3><div class="fig" data-fig="nlog">${chart(sp.nlog, SCREEN, T.fig_n)}</div><p class="muted">${esc(fill(T.cap_n, { n: fx(R.n, 3), k: fx(R.K, 0), r2: fx(R.nR2, 4) }))}</p>` : ''}
<details><summary>${esc(T.eq_h)}</summary><ul class="ts-eq">${eqs.map(t => `<li>${esc(t)}</li>`).join('')}<li>${esc(fill(T.eq_e0, { e0: fx(R.e0 * 100, 4) }))}</li></ul></details>
<p class="muted">${esc(T.after_note)} <a href="${home}methods/#m-tensile">${esc(T.to_methods)}</a></p>`;
  }

  // ---- 書き出し ----
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch { /* だめなら下の方法 */ }
    const t = document.createElement('textarea');
    t.value = text; t.style.position = 'fixed'; t.style.opacity = '0';
    document.body.append(t); t.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* だめでも */ }
    t.remove();
    return ok;
  }
  const flash = btn => { const old = btn.textContent; btn.textContent = btn.dataset.done; setTimeout(() => { btn.textContent = old; }, 1600); };
  function save(blob, name) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  const inputLines = () => {
    const { R, cfg } = current;
    const opt = n => el[n].selectedOptions?.[0]?.textContent ?? el[n].value;
    const L = [`${T.in_kind}: ${opt('kind')}`];
    if (cfg.kind === 'fd') L.push(`${T.in_area}: ${sg(R.A0, 5)} mm²`, `${T.in_L0}: ${sg(R.L0, 5)} mm`, `${T.in_src}: ${opt('src')}`);
    L.push(`${T.in_points}: ${R.N}`);
    return L;
  };
  function resultText() {
    const L = [document.querySelector('h1')?.textContent.trim() ?? '', '', ...inputLines(), ''];
    for (const r of rows()) L.push(`${r.name} ${r.sym} = ${r.v}${r.unit === '–' ? '' : ` ${r.unit}`}${par(r.range)}`);
    L.push('', T.txt_note);
    return L.join('\n');
  }
  function resultCSV() {
    const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
    return [[T.col_q, T.col_sym, T.col_v, T.col_u, T.col_range, T.col_eq].map(q).join(','), ...rows().map(r => [q(r.name), q(r.sym), r.csv, q(r.unit), q(r.range), q(r.eq)].join(','))].join('\n');
  }
  function dataCSV() {
    const { R, e, s } = current;
    const L = [T.csv_data_head];
    for (let i = 0; i < e.length; i++) {
      const eps = e[i] - R.e0, ok = i <= R.iM;
      L.push([(eps * 100).toFixed(5), s[i].toFixed(3), ok ? (Math.log(1 + eps) * 100).toFixed(5) : '', ok ? (s[i] * (1 + eps)).toFixed(3) : ''].join(','));
    }
    return L.join('\n');
  }
  async function savePng() {
    const keep = W;
    setDims(560);
    const sp = specs();
    const svg = chart(view === 'true' ? sp.tru : sp.main, PRINT, view === 'true' ? T.fig_true : T.fig_main);
    const w = W, hh = H;
    setDims(keep);
    const img = new Image();
    const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    const k = 2, c = document.createElement('canvas');
    c.width = w * k; c.height = hh * k;
    const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
    g.drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url);
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    if (blob) save(blob, `tensile-${view}.png`);
  }

  box.addEventListener('click', async e => {
    const b = e.target.closest('button');
    if (!b || !current) return;
    if (b.dataset.view) { view = b.dataset.view; render(); box.querySelector(`[data-view="${view}"]`)?.focus(); return; }
    const act = b.dataset.act;
    if (act === 'txt' && (await copy(resultText()))) flash(b);
    if (act === 'csv' && (await copy(resultCSV()))) flash(b);
    if (act === 'data') save(new Blob([`﻿${dataCSV()}\n`], { type: 'text/csv;charset=utf-8' }), 'tensile-stress-strain.csv');
    if (act === 'png') savePng().catch(() => {});
  });

  // ---- サンプル・ファイル・消す ----
  btns.addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.clear != null) { dropFile(); ta.value = ''; run(); ta.focus(); return; }
    const k = b.dataset.sample;
    if (!k) return;
    const smp = sample(k);
    dropFile();
    ta.value = smp.text;
    el.kind.value = smp.kind; el.cx.value = 1; el.cy.value = 2;
    if (k === 'steel') { el.fu.value = 'kN'; el.shape.value = 'round'; el.d.value = SAMPLE.steel.d; el.L0.value = SAMPLE.steel.L0; el.src.value = 'ext'; }
    else { el.su.value = 'pct'; }
    for (const n of ['du', 'wu', 'tu', 'au', 'Lu']) el[n].value = '';
    el.erng.value = 'auto'; el.nrng.value = 'auto'; el.off.value = 0.2; el.yp.value = 'auto'; el.nm.value = 'plastic';
    run();
    const note = fill(T[`sample_${k}_note`], { K: fx(smp.K, 0), su: fx(smp.cu.s, 1), eu: fx(smp.cu.e * 100, 2) });
    box.insertAdjacentHTML('afterbegin', `<p class="ts-warn soft" data-sample-note>${esc(note)}</p>`);
  });
  btns.querySelector('input[type=file]').addEventListener('change', e => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 20e6) { readP.textContent = T.file_big; return; }
    const r = new FileReader();
    r.onload = () => {
      const txt = String(r.result ?? ''), lines = txt.trim() === '' ? 0 : (txt.trimEnd().match(/\n/g) || []).length + 1;
      if (lines > 5000) { fileText = txt; ta.value = ''; ta.placeholder = fill(T.file_hidden, { name: f.name, n: lines }); }
      else { dropFile(); ta.value = txt; }
      run();
    };
    r.readAsText(f);
    e.target.value = '';
  });
  let timer = 0;
  form.addEventListener('input', e => { if (e.target === ta && ta.value !== '') dropFile(); clearTimeout(timer); timer = setTimeout(run, 150); });
  form.addEventListener('change', () => { clearTimeout(timer); run(); });
  form.addEventListener('submit', e => e.preventDefault());
  // 画面の幅が変わったら図を描き直す(文字の大きさを保つため)
  let lastW = box.clientWidth;
  window.addEventListener('resize', () => { if (Math.abs(box.clientWidth - lastW) > 30) { lastW = box.clientWidth; render(); } });
  run();
}
