// 計算ツールの常設テスト。src/js/*.js から export された計算の関数(DOM に触れないもの)を呼び、
// 教科書・規格・データ表の値(①)か、出典の式を python3 で別に計算した値(②)と比べる。
// ②の python は作業の記録(リポジトリの外)に残している。JS の出力を写した期待値は置かない。
// 使い方: node tools/test-calc.js(全部合えば終了コード 0、1件でも違えば違ったものを出して 1)
//
// 外しているもの: import できないツールはない(以前は eng.js などが読み込みのときに document を読んで落ちたが、今は読まない)。
//   DOM に触れる関数(画面を描くもの)と、文章を組み立てるだけの関数はテストしない。比べる出典の値や独立の計算を用意していない計算も
//   まだ入れていない: fe-c の Grossmann の D_I の表と冷却の道筋、diffusion の差分法・2段浸炭・シート抵抗、composite の順に壊す最終破壊と
//   Cox のシアラグ、xrd の線の形と異常分散、lever の Scheil の式、xtal の切り口と矢印の図、drill の一部の型(ionic-apf・lever など)。
//   drill は data/drill.json の問題の型から種 1〜20 の問題を作り、答えをこのファイルの中の式で別に出して比べる。
import { readFileSync } from 'node:fs';

const tools = {};
for (const id of ['measure', 'weibull', 'creep', 'stress', 'ellingham', 'fatigue', 'corrosionrate', 'polymercalc', 'steelcolor', 'tensile', 'galvanic', 'micro', 'materials',
  'fe-c', 'ashby', 'diffusion', 'composite', 'xrd', 'thermal', 'lever', 'xtal', 'eng', 'ptable', 'drill']) {
  try { tools[id] = await import(`../src/js/${id}.js`); } catch (e) { tools[id] = e; }
}

const cases = [];
// tool: ツール、name: ケース名、src: 期待値の出どころ、run: 関数の値を返す。checks: [項目, 実際の値, 期待値, 許容差]
// 許容差: { rel } 相対、{ abs } 絶対、'eq' 同じ値(null・NaN・文字・真偽)
const T = (tool, name, src, run) => cases.push({ tool, name, src, run });
const rel = r => ({ rel: r }), abs = a => ({ abs: a });
const EQ = 'eq';

// =====================================================================
// measure(組織写真の計測室): ASTM E112 の式と表 4、E562 の表、t 分布
// =====================================================================
T('measure', 'G = 8 から換算(E112 表 4 の行)', '① ASTM E112-13 表 4(G = 8: N_A 100× 128、1× 1984.0 /mm²、Ā 504 µm²、d̄ 0.0225 mm、ℓ̄ 0.0200 mm、N_L 50.0 /mm)。表の桁で比べる', m => {
  const r = m.convert('g', 8);
  return [['n100', r.n100, 128, abs(0.5)], ['na', r.na, 1984.0, abs(0.5)], ['abar(µm²)', r.abar, 504, abs(1)], ['dbar(µm)', r.dbar, 22.5, abs(0.05)],
    ['l_mm', r.l_mm, 0.0200, abs(0.00005)], ['nl', r.nl, 50.0, abs(0.05)]];
});
T('measure', 'N_A と ℓ̄ から G(E112 表 4 の G = 5・0)', '① ASTM E112-13 表 4(G = 5: N_A 248.0、ℓ̄ 0.0566 mm。G = 0: N_A 7.75、ℓ̄ 0.3200 mm)。G は表の行の番号、許容差は表の桁', m => {
  const a = m.convert('na', 248.0), b = m.convert('l_mm', 0.3200);
  return [['G(N_A 248.0)', a.g, 5, abs(0.005)], ['ℓ̄(N_A 248.0)', a.l_mm, 0.0566, abs(0.00005)],
    ['G(ℓ̄ 0.3200)', b.g, 0, abs(0.005)], ['N_A(ℓ̄ 0.3200)', b.na, 7.75, abs(0.005)], ['JIS の番号は ℓ̄ から出さない', b.gjis, null, EQ],
    ['JIS G 0551 の m = 8·2^G(N_A = 256 → 5)', m.convert('na', 256).gjis, 5, abs(1e-9)]];
});
T('measure', 't 分布の両側 95 % の値', '① t 分布表(NIST/SEMATECH e-Handbook 1.3.6.7.2: t(0.975; 1) 12.706、4: 2.776、9: 2.262)。scipy の t.ppf でも同じ(check_out.txt)', m => [
  ['df = 1', m.tInv(0.975, 1), 12.706, abs(0.0005)], ['df = 4', m.tInv(0.975, 4), 2.776, abs(0.0005)], ['df = 9', m.tInv(0.975, 9), 2.262, abs(0.0005)],
  ['p = 0.5 は 0', m.tInv(0.5, 5), 0, abs(1e-12)]]);
T('measure', '視野の統計(平均・s・95 % 信頼区間・%RA)', '② check_testcalc.py(n − 1 で割る s、t·s/√n、E112・E562 の %RA の定義)', m => {
  const r = m.stats([21.3, 19.8, 23.1, 20.4, 22.0]);
  return [['mean', r.mean, 21.32, rel(1e-12)], ['s', r.s, 1.3026895255585658, rel(1e-9)], ['ci', r.ci, 1.6175026847232132, rel(1e-6)], ['ra', r.ra, 7.586785575624828, rel(1e-6)]];
});
T('measure', '数から計算: 切断法と面積法(Jeffries)', '② check_testcalc.py(E112 の ℓ = (L/M)/P、G = −6.643856 log ℓ̄ − 3.288、N_A = (中 + ½ かかる)/(A/M²)、G = 3.321928 log N_A − 2.954)', m => {
  const a = m.calcIcpt([{ P: 45, L: 500, M: 100 }, { P: 52, L: 500, M: 100 }, { P: 48, L: 500, M: 100 }]);
  const b = m.calcPlan([{ nIn: 40, nCut: 20, A: 5000, M: 100 }]);
  return [['ℓ̄(µm)', a.st.mean, 103.81054131054131, rel(1e-9)], ['G(切断法)', a.G, 3.247950107515622, abs(1e-9)], ['ΣL/ΣP(µm)', a.pooled, 103.44827586206897, rel(1e-9)],
    ['N_A', b.st.mean, 100, rel(1e-12)], ['G(面積法)', b.G, 3.689856, abs(1e-9)]];
});
T('measure', '境目: 0・負の値・E562 の格子の表', '① ASTM E562 の表(目で見た割合 2〜5 % → 100 点、5〜10 % → 49、10〜20 % → 25、20 % 超 → 16)。0 以下の入力は null(関数の決まり)', m => [
  ['convert(na, 0)', m.convert('na', 0), null, EQ], ['convert(l_um, −5)', m.convert('l_um', -5), null, EQ], ['stats([])', m.stats([]), null, EQ],
  ['stats 1 個の s', m.stats([3]).s, null, EQ], ['pointFieldsFor(p = 0)', m.pointFieldsFor(10, 0, 100), null, EQ],
  ['gridFor(3 %)', m.gridFor(0.03), 100, EQ], ['gridFor(7 %)', m.gridFor(0.07), 49, EQ], ['gridFor(15 %)', m.gridFor(0.15), 25, EQ], ['gridFor(50 %)', m.gridFor(0.5), 16, EQ],
  ['gridFor(97 %、少ない方で見る)', m.gridFor(0.97), 100, EQ]]);

// =====================================================================
// weibull(ワイブル解析ラボ): 破壊確率の推定と回帰、最尤法、ガンマ関数、破壊確率と強さ、有効体積と寸法効果
// ②の python は review の check/calc_weibull.py(numpy.polyfit・scipy の brentq と weibull_min.fit・math.gamma。122 項目一致)
// =====================================================================
T('weibull', '問題 ceramics-006・007 と公式集の例', '① 問題 ceramics-006(σ₀ 400・m 10・300 MPa → Pf ≈ 0.055)、ceramics-007(m 10・体積 10 倍 → 500 × 0.1^0.1 ≈ 397 MPa)、公式集 weibull の例(m 10・σ₀ 300・200 MPa → 0.0172)。σ = σ₀ で 1 − 1/e', m => [
  ['ceramics-006', m.failProb(300, 10, 400), 0.0548, abs(0.0005)], ['ceramics-007', m.sizeScale(500, 1, 10, 10), 397, abs(0.5)], ['公式集の例', m.failProb(200, 10, 300), 0.0172, abs(0.00005)],
  ['σ = σ₀', m.failProb(400, 7, 400), 1 - Math.exp(-1), rel(1e-12)]]);
T('weibull', '例①②: 20 本の回帰(3つの推定)と最尤法', '② calc_weibull.py(numpy.polyfit で y = ln ln(1/(1 − F)) を ln σ に回帰。MLE は brentq で式を解き、scipy.stats.weibull_min.fit(floc=0)でも m 11.27231・σ₀ 373.9922)', m => {
  const a = m.regress(m.SAMPLE, 'med'), b = m.regress(m.SAMPLE, 'hazen'), c = m.regress(m.SAMPLE, 'mean'), q = m.mle(m.SAMPLE);
  return [['med m', a.m, 10.53902261094418, rel(1e-9)], ['med σ₀', a.s0, 374.64677844007076, rel(1e-9)], ['med R²', a.r2, 0.9270551764371404, rel(1e-9)],
    ['hazen m', b.m, 11.115974730372834, rel(1e-9)], ['hazen σ₀', b.s0, 374.2749971680074, rel(1e-9)], ['逆向きの回帰 m(med)', a.mRev, 11.368279773214567, rel(1e-9)],
    ['mean F₁ = 1/21', c.F[0], 1 / 21, rel(1e-12)], ['MLE m', q.m, 11.272298290233856, rel(1e-9)], ['MLE σ₀', q.s0, 373.9921760225497, rel(1e-9)]];
});
T('weibull', '最尤法の境目: n = 5・ばらつきが大きい・とても小さい', '② calc_weibull.py(brentq と logsumexp で解いた MLE の式)と関数の決まり(5 個未満は few、0 以下は neg、全部同じは same、m > 10⁴ は big)', m => [
  ['n = 5 の m', m.mle([310, 352, 287, 401, 365]).m, 9.70696733340357, rel(1e-9)], ['m が小さい', m.mle([40, 95, 160, 210, 260, 330, 420, 515]).m, 1.6874640426071874, rel(1e-9)],
  ['m がとても大きい', m.mle([500.0, 500.5, 501.0, 501.2, 499.4, 500.8, 499.9]).m, 987.6792886727733, rel(1e-8)], ['n = 4', m.mle([1, 2, 3, 4]).error, 'few', EQ],
  ['全部同じ', m.regress([400, 400, 400, 400, 400]).error, 'same', EQ], ['0 を含む', m.mle([0, 300, 310, 320, 330]).error, 'neg', EQ], ['m > 10⁴', m.mle([400, 400, 400, 400, 400.0001]).error, 'big', EQ]]);
T('weibull', 'ガンマ関数(ランチョスの近似)', '② Python の math.gamma(Γ(1.1) 0.951350769866873、Γ(1.2) 0.9181687423997604、Γ(0.5) = √π、Γ(3.5) 3.323350970447842)', m => [
  ['Γ(1.1)', m.gamma(1.1), 0.951350769866873, rel(1e-13)], ['Γ(1.2)', m.gamma(1.2), 0.9181687423997604, rel(1e-13)], ['Γ(0.5)', m.gamma(0.5), Math.sqrt(Math.PI), rel(1e-13)],
  ['Γ(3.5)', m.gamma(3.5), 3.323350970447842, rel(1e-13)], ['Γ(1.05)', m.gamma(1.05), 0.9735042655627756, rel(1e-13)]]);
T('weibull', '例③⑥: 破壊確率・強さ・平均・中央値・変動係数', '② calc_weibull.py(scipy.stats.weibull_min の cdf・ppf・mean・median・std)', m => [
  ['③ F(300)', m.failProb(300, 11.3, 374), 0.0794631384108593, rel(1e-9)], ['③ σ(0.1 %)', m.strengthAt(1e-3, 11.3, 374), 202.95703101276877, rel(1e-9)],
  ['③ 平均', m.meanStrength(11.3, 374), 357.5780780938831, rel(1e-12)], ['③ 中央値', m.medianStrength(11.3, 374), 362.0640122747868, rel(1e-12)],
  ['⑥ m 5 の σ(0.1 %)', m.strengthAt(1e-3, 5, 400), 100.48550949791331, rel(1e-9)], ['⑥ m 20 の σ(0.1 %)', m.strengthAt(1e-3, 20, 400), 283.18539625161196, rel(1e-9)],
  ['変動係数 m 10', m.cov(10), 0.12031021893115534, rel(1e-9)], ['変動係数 m 5', m.cov(5), 0.22905293328137888, rel(1e-9)], ['F = 0.5 の強さ = 中央値', m.strengthAt(0.5, 10, 400), m.medianStrength(10, 400), rel(1e-12)],
  ['F = 1 は NaN', m.strengthAt(1, 10, 400), NaN, EQ]]);
T('weibull', '例④⑤: 有効体積と寸法効果', '① Quinn & Quinn(2010)の 3点曲げ V_E = bdL/[2(m + 1)²]、1/4 点曲げ bdL(m + 2)/[4(m + 1)²] と σ₃pt/σ₄pt = [(m + 2)/2]^(1/m)、② calc_weibull.py(1/3 点は一般式 bdL(mL_i/L + 1)/[2(m + 1)²])', m => {
  const a = m.effVolume('t3', 11.3, { b: 4, d: 3, L: 30 }).ve, t = m.effVolume('ten', 11.3, { b: 10, d: 10, L: 50 }).ve;
  const b3 = m.effVolume('t3', 11.3, { b: 4, d: 3, L: 40 }).ve, b4 = m.effVolume('q4', 11.3, { b: 4, d: 3, L: 40 }).ve;
  return [['④ V_E(3点)', a, 1.189767995240928, rel(1e-12)], ['④ V_E(引張)', t, 5000, rel(1e-12)], ['④ σ₂', m.sizeScale(374, a, t, 11.3), 178.7340111909095, rel(1e-9)],
    ['⑤ V_E(1/4 点)', b4, 10.54927622446956, rel(1e-12)], ['⑤ σ₃/σ₄', 374 / m.sizeScale(374, b3, b4, 11.3), (13.3 / 2) ** (1 / 11.3), rel(1e-12)],
    ['1/3 点 m 10', m.effVolume('h4', 10, { b: 4, d: 3, L: 30 }).ve, 6.446280991735538, rel(1e-12)], ['寸法が 0', m.effVolume('t3', 10, { b: 0, d: 3, L: 30 }), null, EQ]];
});

// =====================================================================
// stress(応力状態ラボ): 平面応力の変換・主応力、3次元の固有値と不変量、トレスカ・ミーゼス、薄肉円筒、ロゼット、平面ひずみ
// ②の python は review の check/calc_stress.py(numpy のテンソルの回転・eigh・solve で別に計算。459 項目一致)
// =====================================================================
T('stress', '平面応力の主応力(問題 mechanical-027 と Roylance の例)', '① 問題 mechanical-027 の解説(σx 120・σy 0・τxy 80 → σ₁ 160、σ₂ −40、τmax 100 MPa)と、Roylance「Transformation of Stresses and Strains」の例(σx 5・σy −3・τxy 4 → 中心 1、半径 √32)を手で', m => {
  const a = m.principal2(120, 0, 80), b = m.principal2(5, -3, 4);
  return [['027 σ₁', a.s1, 160, rel(1e-12)], ['027 σ₂', a.s2, -40, rel(1e-12)], ['027 τmax', a.tauMax, 100, rel(1e-12)], ['027 θp = ½atan(160/120)', a.thp, 26.56505117707799, abs(1e-9)],
    ['Roylance σ₁', b.s1, 1 + Math.sqrt(32), rel(1e-12)], ['Roylance σ₂', b.s2, 1 - Math.sqrt(32), rel(1e-12)], ['θs = θp − 45°', a.ths, 26.56505117707799 - 45, abs(1e-9)]];
});
T('stress', '例①: σx 80・σy −40・τxy 45 と θ = 30° の面', '② calc_stress.py(Q σ Qᵀ の回転と numpy.linalg.eigh。C 20、R 75 → σ₁ 95・σ₂ −55、θp 18.435°、σx′ 88.971・τx′y′ −29.462)', m => {
  const p = m.principal2(80, -40, 45), t = m.transform(80, -40, 45, 30);
  return [['σ₁', p.s1, 95, rel(1e-12)], ['σ₂', p.s2, -55, rel(1e-12)], ['θp', p.thp, 18.43494882292201, abs(1e-9)], ['τabs(σz = 0 を含む)', p.tauAbs, 75, rel(1e-12)],
    ["σx'", t.sx, 88.97114317029975, rel(1e-12)], ["τx'y'", t.txy, -29.46152422706631, rel(1e-12)], ["σy'", t.sy, -48.97114317029975, rel(1e-12)]];
});
T('stress', '境目(平面): τxy = 0・σx = σy・すべて 0・等二軸', '関数の決まり(円が点のときは角度 NaN、τxy = 0 なら主方向は 0°)と ①(等二軸 200・200 では面内 τmax 0、σz = 0 を含めた τabs = 100)', m => [
  ['τxy = 0 の θp', m.principal2(100, 20, 0).thp, 0, abs(1e-12)], ['σx < σy・τ = 0 の θp', m.principal2(20, 100, 0).thp, 90, abs(1e-12)], ['σx = σy・τ = 0 の θp', m.principal2(50, 50, 0).thp, NaN, EQ],
  ['σx = σy・τ 30 の θp', m.principal2(50, 50, 30).thp, 45, abs(1e-12)], ['すべて 0 の σ₁', m.principal2(0, 0, 0).s1, 0, EQ], ['等二軸の面内 τmax', m.principal2(200, 200, 0).tauMax, 0, EQ],
  ['等二軸の τabs', m.principal2(200, 200, 0).tauAbs, 100, rel(1e-12)], ['数でない入力', m.principal2(NaN, 1, 1), null, EQ]]);
T('stress', '例⑥: 3次元の主応力と不変量', '② calc_stress.py(numpy.linalg.eigvalsh、I2 = ½[(tr σ)² − tr σ²]、I3 = det)', m => {
  const c = [60, 30, -20, 20, -10, 15], e = m.eig3(...c), I = m.invariants(...c);
  return [['σ₁', e.s[0], 70.9289543671339, rel(1e-10)], ['σ₂', e.s[1], 25.212866470683345, rel(1e-10)], ['σ₃', e.s[2], -26.141820837817214, rel(1e-10)],
    ['I1', I.I1, 70, rel(1e-12)], ['I2', I.I2, -725, rel(1e-12)], ['I3', I.I3, -46750, rel(1e-10)], ['σm', I.sm, 70 / 3, rel(1e-12)], ['σ_vM = √(3J2)', m.vonMises(...c), 84.1130192063036, rel(1e-10)],
    ['σ_vM = √(3J2)(J2 から)', Math.sqrt(3 * I.J2), 84.1130192063036, rel(1e-10)]];
});
T('stress', '境目(3次元): 重根・等三軸・すべて 0・順序', '② calc_stress.py(diag(100, 100, 50)・diag(80, −20, −20) を回した成分の固有値)と ①(等三軸は偏差応力 0、単軸 100 は σ₁ 100・σ₂ = σ₃ = 0、σ₃ が最も小さい代数の値)', m => {
  const r = m.eig3(94.835301110418, 84.505903331255, 70.658795558327, 8.94552088255, 21.321713298811, -12.310096912653);
  const h = m.eig3(70, 70, 70, 0, 0, 0), z = m.eig3(0, 0, 0, 0, 0, 0), u = m.eig3(-100, -100, -400, 0, 0, 0);
  return [['重根 σ₁', r.s[0], 100, abs(1e-8)], ['重根 σ₂', r.s[1], 100, abs(1e-8)], ['重根 σ₃', r.s[2], 50, abs(1e-8)], ['重根の印 12', r.same12, true, EQ], ['重根の印 23', r.same23, false, EQ],
    ['等三軸 J2', m.invariants(70, 70, 70, 0, 0, 0).J2, 0, EQ], ['等三軸の印', h.same12 && h.same23, true, EQ], ['等三軸 Tresca', m.tresca(70, 70, 70, 0, 0, 0), 0, EQ],
    ['すべて 0', z.s.join(','), '0,0,0', EQ], ['圧縮の順序 σ₁', u.s[0], -100, abs(1e-12)], ['圧縮の順序 σ₃', u.s[2], -400, abs(1e-12)],
    ['純粋せん断の σ₁・σ₃', m.eig3(0, 0, 0, 100, 0, 0).s.map(v => Math.round(v * 1e9) / 1e9).join(','), '100,0,-100', EQ]];
});
T('stress', 'トレスカとミーゼス(純粋せん断・単軸・等二軸・静水圧)', '① 問題 mechanical-020(σY 300 で純粋せん断の降伏 τ = σY/√3 ≈ 173 MPa、トレスカ σY/2 = 150)と DoITPoMS「Yield criteria for metals」(Y = 2k と Y = √3k)', m => {
  const s = m.yieldState({ sx: 0, sy: 0, sz: 0, txy: 100, tyz: 0, tzx: 0 }, 250), b = m.yieldState({ sx: 200, sy: 200, sz: 0, txy: 0, tyz: 0, tzx: 0 }, 250);
  const h = m.yieldState({ sx: 70, sy: 70, sz: 70, txy: 0, tyz: 0, tzx: 0 }, 250);
  return [['020 の k(ミーゼス)', m.yieldState({ sx: 0, sy: 0, sz: 0, txy: 1, tyz: 0, tzx: 0 }, 300).kVm, 173.20508075688772, rel(1e-12)], ['k(トレスカ)', s.kTr, 125, rel(1e-12)],
    ['純粋せん断 σ_T', s.tr, 200, rel(1e-12)], ['純粋せん断 σ_vM', s.vm, 100 * Math.sqrt(3), rel(1e-12)], ['σ_T/σ_vM = 2/√3', s.ratio, 2 / Math.sqrt(3), rel(1e-12)],
    ['安全率 トレスカ', s.nTr, 1.25, rel(1e-12)], ['等二軸 σ_T', b.tr, 200, rel(1e-12)], ['等二軸 σ_vM', b.vm, 200, rel(1e-12)], ['静水圧の安全率', h.nVm, Infinity, EQ],
    ['平面の mises2(100, −100)', m.mises2(100, -100), 100 * Math.sqrt(3), rel(1e-12)], ['平面の tresca2(100, 50)', m.tresca2(100, 50), 100, rel(1e-12)]];
});
T('stress', '例③: 薄肉円筒(p 2 MPa・r 500 mm・t 10 mm・σY 250 MPa)', '① Roylance「Pressure Vessels」の σθ = pr/b・σz = pr/2b から手で(σθ 100、σz 50、σr ≈ 0 → トレスカ 100 で n 2.5、ミーゼス √7500 = 86.603 で n 2.887)', m => {
  const c = m.thinCylinder(2, 500, 10), y = m.yieldState({ sx: c.axial, sy: c.hoop, sz: 0, txy: 0, tyz: 0, tzx: 0 }, 250);
  return [['σθ', c.hoop, 100, rel(1e-12)], ['σz', c.axial, 50, rel(1e-12)], ['n トレスカ', y.nTr, 2.5, rel(1e-12)], ['n ミーゼス', y.nVm, 250 / Math.sqrt(7500), rel(1e-12)], ['t = 0', m.thinCylinder(2, 500, 0), null, EQ]];
});
T('stress', '例④⑤: 直角・デルタのロゼットから主ひずみ・主応力', '② calc_stress.py(ε(θ) の3本を numpy.linalg.solve、ひずみテンソルを eigh、平面応力のこわさ行列)と ① Micro-Measurements TN-515 の閉じた式(rosetteTN)', m => {
  const a = m.rosette('rect', 450, 380, -120), b = m.rosette('delta', 300, 500, -200);
  const sa = m.strainToStress(a.e1 * 1e-6, a.e2 * 1e-6, 200e3, 0.3), sb = m.strainToStress(b.e1 * 1e-6, b.e2 * 1e-6, 70e3, 0.33);
  const ta = m.rosetteTN('rect', 450, 380, -120), tb = m.rosetteTN('delta', 300, 500, -200);
  return [['直角 ε₁', a.e1, 522.0014005574768, rel(1e-12)], ['直角 ε₂', a.e2, -192.0014005574768, rel(1e-12)], ['直角 φ', a.phi, 18.515194802839318, abs(1e-9)], ['直角 γxy', a.gxy, 430, rel(1e-12)],
    ['直角 σ₁', sa.s1, 102.0661495363151, rel(1e-10)], ['直角 σ₂', sa.s2, -7.78043525060083, rel(1e-9)], ['直角 TN-515 の ε_P', ta.p, a.e1, rel(1e-12)], ['直角 TN-515 の ε_Q', ta.q, a.e2, rel(1e-12)],
    ['デルタ ε₁', b.e1, 616.3331998932266, rel(1e-12)], ['デルタ ε₂', b.e2, -216.33319989322658, rel(1e-12)], ['デルタ φ', b.phi, 38.051056875993, abs(1e-9)], ['デルタ γxy', b.gxy, 808.2903768654761, rel(1e-12)],
    ['デルタ σ₁', sb.s1, 42.807796066650575, rel(1e-10)], ['デルタ σ₂', sb.s2, -1.0167512905311678, rel(1e-8)], ['デルタ TN-515 の ε_P', tb.p, b.e1, rel(1e-12)], ['デルタ TN-515 の ε_Q', tb.q, b.e2, rel(1e-12)],
    ['γmax = ε₁ − ε₂', a.gmax, a.e1 - a.e2, rel(1e-12)], ['ε_xy = γ/2', a.exy, 215, rel(1e-12)]];
});
T('stress', '境目(ロゼット): 3つ同じ・εa = εc の ±45°', '① TN-515 の主軸の決め方(ε₁ = ε₃ で ε₂ > ε₁ なら φ_P = +45°、ε₂ < ε₁ なら −45°、3つ同じなら決まらない)', m => [
  ['3つ同じ φ', m.rosette('rect', 100, 100, 100).phi, NaN, EQ], ['3つ同じ ε₁', m.rosette('delta', 100, 100, 100).e1, 100, rel(1e-12)], ['εb > εa = εc', m.rosette('rect', 200, 300, 200).phi, 45, abs(1e-12)],
  ['εb < εa = εc', m.rosette('rect', 200, 100, 200).phi, -45, abs(1e-12)], ['すべて 0', m.rosette('rect', 0, 0, 0).e1, 0, EQ], ['形の名前の誤り', m.rosette('tee', 1, 2, 3), null, EQ], ['ν = 0.5 は出さない', m.strainToStress(1e-3, 0, 200e3, 0.5), null, EQ]]);
T('stress', '平面応力と平面ひずみ(σx 80・σy −40・τxy 45、E 200 GPa、ν 0.3)', '① σz = ν(σx + σy) = 0.3 × 40 = 12 MPa、εz = −ν(σx + σy)/E = −6.0 × 10⁻⁵ を手で、② calc_stress.py(コンプライアンス行列で εz = 0 を解く。σ_vM 131.434・130.150)', m => {
  const q = m.planeCompare(80, -40, 45, 200e3, 0.3);
  return [['平面ひずみ σz', q.pe.sz, 12, rel(1e-12)], ['平面ひずみ εz', q.pe.ez, 0, EQ], ['平面応力 εz', q.ps.ez, -6e-5, rel(1e-12)],
    ['平面応力 σ_vM', q.ps.vm, 131.43439428094916, rel(1e-10)], ['平面ひずみ σ_vM', q.pe.vm, 130.14991356124673, rel(1e-10)], ['G', q.G, 200e3 / 2.6, rel(1e-12)]];
});

// =====================================================================
// creep(クリープ寿命ラボ): Larson–Miller、OSD、Manson–Haferd、ノートン則、Monkman–Grant、Robinson
// ②の python は review の check/calc_creep.py(numpy の lstsq を含む)
// =====================================================================
T('creep', 'LMP の定義(1000 K・1000 h → 10⁵ h の温度)', '① 定義 P = T(C + log₁₀t_r) から手で計算できる値(C = 20: P = 1000 × 23 = 23000、T = 23000/25 = 920 K)', m => [
  ['P', m.lmpP(1000, 1000, 20), 23000, rel(1e-12)], ['T', m.lmpT(23000, 1e5, 20), 920, rel(1e-12)], ['t_r', m.lmpTr(23000, 920, 20), 1e5, rel(1e-9)]]);
T('creep', '例①: 600 ℃・10万 h と同じ P で 1000 h になる温度', '② calc_creep.py(P = 873.15 × 25 = 21828.75、T₂ = P/23 = 949.076 K = 675.93 ℃、650 ℃の t_r = 4425.3 h、10 K 上げると 1.919 分の1)', m => {
  const P = m.lmpP(600 + m.K0, 1e5, 20);
  return [['P', P, 21828.75, rel(1e-12)], ['T₂(K)', m.lmpT(P, 1000, 20), 949.0760869565217, rel(1e-12)], ['650 ℃の t_r', m.lmpTr(P, 650 + m.K0, 20), 4425.277704927844, rel(1e-9)],
    ['10 K の倍率', m.lmpPerK(P, 600 + m.K0, 20, 10), 1.9190116880469137, rel(1e-9)], ['見かけの Q(J/mol)', m.lmpQ(22382.45), 428506.5815450802, rel(1e-6)]];
});
T('creep', 'パラメータの比べ(700 ℃・1000 h → 600 ℃、C 20、Q 300 kJ/mol、T_a 50 ℃、log t_a 15)', '② calc_creep.py(LMP 4.307 × 10⁵ h、OSD 6.985 × 10⁴ h、MH 7.017 × 10⁴ h)', m => {
  const x = m.extrapolate(700 + m.K0, 1000, 600 + m.K0, { C: 20, Q: 300e3, Ta: 50 + m.K0, lta: 15 });
  return [['LMP', x.lmp, 430666.16667791357, rel(1e-9)], ['OSD', x.osd, 69851.79492768437, rel(1e-6)], ['MH', x.mh, 70170.38286703808, rel(1e-9)],
    ['P(OSD)', x.Po, -13.102436455282543, rel(1e-6)], ['P(MH)', x.Pm, -0.018461538461538463, rel(1e-12)]];
});
T('creep', 'ノートン則: n・Q・A・倍率', '② calc_creep.py(n = ln(10/3)/ln 1.25 = 5.3955、A、Q = 358.04 kJ/mol、ε̇)と ① 公式集の例(n = 5 で応力 1.2 倍 → 1.2⁵ = 2.48832、Q = 300 kJ/mol で 900 → 950 K は 8.25 倍)', m => {
  const n = m.fitN(120, 3e-5, 150, 1e-4);
  return [['n', n, 5.395507946499492, rel(1e-12)], ['A', m.nortonA(3e-5, 120, n, 300e3, 600 + m.K0), 160.50787500141013, rel(1e-6)],
    ['Q', m.fitQ(550 + m.K0, 1e-6, 600 + m.K0, 2e-5), 358042.8618131895, rel(1e-6)], ['ε̇', m.nortonRate(2e-3, 100, 5, 300e3, 873.15), 2.2616009091100634e-11, rel(1e-6)],
    ['応力 1.2 倍', m.rateRatio(100, 900, 120, 900, 5, 300e3), 2.48832, rel(1e-12)], ['900 → 950 K', m.rateRatio(100, 900, 100, 950, 5, 300e3), 8.25, abs(0.005)],
    ['両方', m.rateRatio(100, 900, 120, 950, 5, 300e3), 20.525111763223617, rel(1e-6)]];
});
T('creep', 'モンクマン・グラント', '① 問題 high-temperature-016 の条件(1.0 × 10⁻⁵ h⁻¹・2000 h → 4.0 × 10⁻⁵ h⁻¹ で 500 h)と ② calc_creep.py(例③ C_MG 0.08 → 4000 h、m = 0.9 で 2705 h)', m => [
  ['問題 016', m.mgTr(4e-5, 1, m.mgC(1e-5, 2000, 1)), 500, rel(1e-12)], ['例③ C_MG', m.mgC(1e-3, 80, 1), 0.08, rel(1e-12)], ['例③ t_r', m.mgTr(2e-5, 1, 0.08), 4000, rel(1e-12)],
  ['m = 0.9', m.mgTr(2e-5, 0.9, m.mgC(1e-3, 80, 0.9)), 2704.9733512249654, rel(1e-9)]]);
T('creep', '例④: ロビンソン則(650 ℃・2000 h の試験点、570・590・610 ℃)', '② calc_creep.py(t_r = 3.250 × 10⁵・8.332 × 10⁴・2.272 × 10⁴ h、D = 0.33113、残り 15196 h)', m => {
  const P = m.lmpP(650 + m.K0, 2000, 20);
  const L = m.lifeFraction([[570, 40000], [590, 10000], [610, 2000]].map(([t, h]) => ({ t: h, tr: m.lmpTr(P, t + m.K0, 20) })));
  return [['t_r,1', L.last && m.lmpTr(P, 570 + m.K0, 20), 325001.22898593725, rel(1e-9)], ['D', L.D, 0.33112718463644714, rel(1e-9)], ['残りの時間', L.remH, 15196.149555951102, rel(1e-9)],
    ['空の行は数えない', m.lifeFraction([{ t: NaN, tr: 100 }, { t: 50, tr: 100 }]).D, 0.5, rel(1e-12)]];
});
T('creep', '試験点の線(6点、1次・2次、C 固定と C も当てはめ)', '② calc_creep.py(numpy.linalg.lstsq で log₁₀t_r の残差を最小に。C を当てはめた2次は C = 23.846、s = 0.01991。自由度は 6 − 4 = 2)', m => {
  const pts = [[250, 550, 3200], [200, 575, 4100], [160, 600, 3500], [120, 625, 3900], [90, 650, 2600], [200, 600, 650]].map(([s, t, h]) => ({ s, T: t + m.K0, tr: h }));
  const a = m.fitCurve(pts, 1, 20), b = m.fitCurve(pts, 2, 20), c = m.fitCurve(pts, 2, null);
  return [['1次 b₀', a.b[0], 31841.561569704107, rel(1e-8)], ['1次 b₁', a.b[1], -5166.618559012943, rel(1e-8)], ['1次 s', a.sd, 0.1310464881960453, rel(1e-6)],
    ['2次 b₂', b.b[2], -4557.7198361615165, rel(1e-6)], ['2次 s', b.sd, 0.05662633160954717, rel(1e-6)], ['2次の見積もり 150 MPa・560 ℃', m.curveTr(b, 150, 560 + m.K0), 71118.0245602781, rel(1e-6)],
    ['C も当てはめ: C', c.C, 23.845808724708284, rel(1e-6)], ['C も当てはめ: s', c.sd, 0.019909169814790746, rel(1e-5)], ['その見積もり', m.curveTr(c, 150, 560 + m.K0), 121987.13404447005, rel(1e-5)]];
});
T('creep', '境目: 0 以下・足りない点・T_a より下', '関数の決まり(0 以下の時間・温度は NaN、点が足りなければ error、T ≤ T_a では MH を出さない)', m => [
  ['lmpP(T, 0)', m.lmpP(900, 0, 20), NaN, EQ], ['lmpT(C + log t ≤ 0)', m.lmpT(20000, 1e-21, 20), NaN, EQ], ['fitN(同じ σ)', m.fitN(100, 1e-5, 100, 2e-5), NaN, EQ],
  ['fitQ(同じ T)', m.fitQ(900, 1e-5, 900, 2e-5), NaN, EQ], ['mgTr(0)', m.mgTr(0, 1, 0.05), NaN, EQ], ['lifeFraction([])', m.lifeFraction([]), null, EQ],
  ['fitCurve 1 点', m.fitCurve([{ s: 100, T: 900, tr: 1000 }], 1, 20).error, 'few', EQ], ['fitCurve C を合わせるのに温度が1つ', m.fitCurve([{ s: 100, T: 900, tr: 1000 }, { s: 120, T: 900, tr: 500 }, { s: 140, T: 900, tr: 200 }], 1, null).error, 'temps', EQ],
  ['MH は T₂ ≤ T_a で出さない', m.extrapolate(900, 1000, 300, { C: 20, Q: 3e5, Ta: 323, lta: 15 }).mh, NaN, EQ]]);

// =====================================================================
// ellingham(エリンガム図ラボ): NIST-JANAF、IAPWS
// ページの許容差: 当てはめと JANAF の差は最大 0.91 kJ/(mol O₂) → 1 kJ で比べる
// =====================================================================
const JANAF = '① NIST-JANAF 第4版の表(janaf.nist.gov/tables/Al-101・Cr-016・Cu-021・H-064・C-093・C-095.txt の ΔfG を O₂ 1 mol あたりに)。許容差 1 kJ はページの「最大 0.91 kJ」から';
T('ellingham', 'ΔG°(O₂ 1 mol あたり)を JANAF の行と比べる', JANAF, m => [
  ['4/3Al + O₂ → 2/3Al₂O₃(1000 K)', m.dG('Al2O3', 1000), -907.625, abs(1)], ['4/3Cr + O₂ → 2/3Cr₂O₃(1500 K)', m.dG('Cr2O3', 1500), -495.093, abs(1)],
  ['4Cu + O₂ → 2Cu₂O(1000 K)', m.dG('Cu2O', 1000), -191.034, abs(1)], ['2H₂ + O₂ → 2H₂O(1000 K)', m.dG('H2O', 1000), -385.18, abs(1)],
  ['2C + O₂ → 2CO(1500 K)', m.dG('CO', 1500), -487.48, abs(1)], ['2CO + O₂ → 2CO₂(1200 K)', m.dG('COCO2', 1200), -356.558, abs(1)]]);
T('ellingham', '境目の比 H₂/H₂O・CO/CO₂ と平衡酸素分圧', '② check_testcalc.py(JANAF の行から exp[(ΔG°(H₂O) − ΔG°(酸化物))/(2RT)] など)。ΔG° の差が ±1.8 kJ までずれうるので、相対の許容差は exp(1.8 kJ/2RT) − 1 ≈ 8 %(1500 K)・10 %(1200 K)、p(O₂) は exp(0.91 kJ/RT) − 1 ≈ 12 %(1000 K)', m => [
  ['(p(H₂)/p(H₂O))eq Cr₂O₃ 1500 K', m.ratioH2('Cr2O3', 1500), 787.39, rel(0.08)], ['(p(CO)/p(CO₂))eq FeO 1200 K', m.ratioCO('FeO', 1200), 2.2548, rel(0.10)],
  ['p(O₂) Cu₂O 1000 K(bar)', m.pO2(m.dG('Cu2O', 1000), 1000), 1.051e-10, rel(0.12)]]);
T('ellingham', '炭素で FeO を還元できる温度(p(CO) = 1 bar)', '② check_testcalc.py(JANAF の 2ΔfG(Fe₀.₉₄₇O) と 2ΔfG(CO) の交点、100 K の行の線形補間で 994.2 K)。傾きの差 ≈ 0.3 kJ/K なので 1.8 kJ のずれで ≈ 6 K → 許容差 10 K', m => {
  const c = m.carbonT('FeO');
  return [['交点の数', c.length, 1, EQ], ['T(K)', c[0]?.T, 994.2, abs(10)], ['その上で炭素の線が下(還元できる)', c[0]?.up, true, EQ]];
});
T('ellingham', '飽和水蒸気圧と露点(IAPWS)', '① Wagner・Pruss, J. Phys. Chem. Ref. Data 22 (1993) 783 の表 1(273.16 K → 611.657 Pa、373.1243 K → 101325 Pa)と IAPWS R14-08(2011) の検査値(230 K → 8.94735 × 10⁻⁶ MPa)', m => [
  ['psat(273.16 K)', m.psatWater(273.16), 611.657, rel(1e-5)], ['psat(373.1243 K)', m.psatWater(373.1243), 101325, rel(1e-5)],
  ['psatIce(230 K)', m.psatIce(230), 8.94735, rel(1e-5)], ['dewOf(101325 Pa)', m.dewOf(101325), 373.1243, abs(0.001)]]);
T('ellingham', '境目: 範囲の外・0 以下', '関数の決まり(範囲の外は null・NaN、−100 ℃ より低い露点は −Infinity)', m => [
  ['dG(Al₂O₃, 2500 K)', m.dG('Al2O3', 2500), null, EQ], ['dG(FeO, 1700 K)(1600 K まで)', m.dG('FeO', 1700), null, EQ], ['ratioH2(FeO, 200 K)', m.ratioH2('FeO', 200), null, EQ],
  ['psatWater(200 K)', m.psatWater(200), NaN, EQ], ['dewOf(0)', m.dewOf(0), NaN, EQ], ['dewOf(1e-6 Pa)', m.dewOf(1e-6), -Infinity, EQ],
  ['h2Atmos(H₂ 0 %)', m.h2Atmos(1e5, 0, 100), null, EQ], ['h2Atmos(pw ≥ ptot)', m.h2Atmos(1e5, 1, 1e5), null, EQ]]);

// =====================================================================
// fatigue(疲労寿命とき裂進展)
// =====================================================================
T('fatigue', 'パリス則の閉じた式(Callister の例題の条件)', '② check_testcalc.py(scipy quad で ∫da/(C(Δσ√(πa))³))。条件は Callister, Materials Science and Engineering: An Introduction 8 版 8 章の疲労寿命の例題(Δσ = 100 MPa、K_IC = 25 MPa√m、Y = 1、a₀ = 2 mm、C = 1.0 × 10⁻¹²、m = 3。教科書の答えの丸めた値は未確認)', m => {
  const ac = m.critA({ geo: 'center' }, 100, 25);
  return [['a_c(m)', ac, 0.019894367886486918, rel(1e-9)], ['Δσ(圧縮を数えない)', m.deltaS(100, -50, 'pos'), 100, EQ], ['Δσ(全幅)', m.deltaS(100, -50, 'full'), 150, EQ],
    ['N', m.lifeClosed(0.002, ac, 100, 1e-12, 3, 1), 5484901.17, rel(1e-6)], ['N(m = 2 の式、Y = 1.12)', m.lifeClosed(0.001, 0.01, 150, 2e-11, 2, 1.12), 1298426.16, rel(1e-6)]];
});
T('fatigue', '有限幅の中央き裂(数値積分と限界き裂)', '② check_testcalc.py(Gross・Seelig 表 4.1 の Y = (1 − 0.025α² + 0.06α⁴)√sec(πα/2) を scipy quad・brentq で)', m => {
  const g = { geo: 'finite', W: 0.3 };
  return [['Y(α = 0.5)', m.yFinite(0.075, 0.3), 1.1862340972152143, rel(1e-9)], ['N', m.lifeNumeric(g, 0.005, 0.02, 120, 6.9e-12, 3), 211053.727, rel(1e-6)],
    ['a_c(m)', m.critA(g, 120, 60), 0.06313205986999203, rel(1e-6)], ['α ≥ 1 は NaN', m.yFinite(0.15, 0.3), NaN, EQ]];
});
T('fatigue', '縁き裂の K・a_c・σ_c・塑性域・E399', '② check_testcalc.py(Y = 1.12、K = Yσ√(πa)、r_y = (K/σ_y)²/2π、E399 の 2.5(K_IC/σ_y)²)', m => {
  const g = { geo: 'edge' };
  return [['K', m.kOf(g, 300, 0.005), 42.11135501380081, rel(1e-9)], ['a_c', m.critA(g, 300, 60), 0.0101501876971872, rel(1e-9)], ['σ_c', m.critS(g, 0.005, 60), 427.4381575729635, rel(1e-9)],
    ['r_y', m.plasticZone(m.kOf(g, 300, 0.005), 600), 0.000784, rel(1e-9)], ['E399 の寸法', m.e399Size(60, 600), 0.025, rel(1e-12)]];
});
T('fatigue', '平均応力の補正(σa 200、σm 150、σu 800、σy 600)', '② check_testcalc.py(修正グッドマン・ゲルバー・ゾーダーバーグ・SWT の式)', m => {
  const r = m.meanStress(200, 150, 800, 600), c = m.meanStress(200, -100, 800, 600);
  return [['goodman', r.goodman, 246.15384615384616, rel(1e-9)], ['gerber', r.gerber, 207.28744939271255, rel(1e-9)], ['soderberg', r.soderberg, 266.6666666666667, rel(1e-9)],
    ['swt', r.swt, 264.5751311064591, rel(1e-9)], ['安全率 n(σe 300)', m.goodmanN(200, 150, 300, 800), 1.1707317073170733, rel(1e-9)],
    ['圧縮の平均応力はグッドマンで効かせない', c.goodman, 200, rel(1e-12)]];
});
T('fatigue', 'バスキンの式とマイナー則', '② check_testcalc.py(N = ½(σa/σf′)^(1/b)、D = Σn/N。σf′ 1000、b −0.09、σe 250)', m => {
  const rows = [{ sa: 400, n: 1000 }, { sa: 320, n: 10000 }, { sa: 240, n: 200000 }];
  return [['N(400 MPa)', m.basquinN(400, 1000, -0.09), 13198.53280651462, rel(1e-9)], ['σa(N = 13198.5)', m.basquinS(13198.53280651462, 1000, -0.09), 400, rel(1e-9)],
    ['D(延ばす)', m.miner(rows, 1000, -0.09, 250, 'ext').D, 0.1911966432481268, rel(1e-9)], ['D(疲労限度より下を数えない)', m.miner(rows, 1000, -0.09, 250, 'skip').D, 0.13925469531429688, rel(1e-9)],
    ['b ≥ 0 は null', m.basquinN(400, 1000, 0.1), null, EQ]];
});
T('fatigue', 'パリス則の C の単位の換算(Barsom の鋼)', '① Kinser・Allison・Jordon, Int. J. Metalcasting (2026) の SI の値(フェライト・パーライト 6.89 × 10⁻¹²、マルテンサイト 1.36 × 10⁻¹⁰)と Norton, Machine Design 6 版 表 6-2 の US の値(3.6 × 10⁻¹⁰・6.6 × 10⁻⁹)。許容差は表の桁', m => [
  ['fp(m = 3)', m.cUsToSi(3.6e-10, 3), 6.89e-12, abs(0.005e-12)], ['mart(m = 2.25)', m.cUsToSi(6.6e-9, 2.25), 1.36e-10, abs(0.005e-10)],
  ['往復', m.cSiToUs(m.cUsToSi(3.0e-10, 3.25), 3.25), 3.0e-10, rel(1e-12)]]);

// =====================================================================
// corrosionrate(腐食速度): ASTM G1・G102
// =====================================================================
T('corrosionrate', '合金の当量 EW(G102 表 1)', '① ASTM G102-23 表 1(最も低い価数の列: 炭素鋼 27.92、304 25.12、316 25.50、430 25.30、Cu(n = 1)63.55、6061 9.01)。組成は表の注のとおり範囲の中央・1 % 未満を除く。表は古い原子量なので相対 1e-3', m => {
  const v = { fe: 2, cr: 3, ni: 2, mo: 3, cu: 1, al: 3, mg: 2 };
  return [['炭素鋼', m.ewOf({ fe: 100 }, v).ew, 27.92, rel(1e-3)], ['304', m.ewOf({ fe: 71.75, cr: 19, ni: 9.25 }, v).ew, 25.12, rel(1e-3)],
    ['316', m.ewOf({ fe: 68.5, cr: 17, ni: 12, mo: 2.5 }, v).ew, 25.50, rel(1e-3)], ['430', m.ewOf({ fe: 83, cr: 17 }, v).ew, 25.30, rel(1e-3)],
    ['Cu(n = 1)', m.ewOf({ cu: 100 }, v).ew, 63.55, rel(1e-3)], ['6061', m.ewOf({ al: 99, mg: 1 }, v).ew, 9.01, rel(1e-3)],
    ['合計が 100 でなくても割合にそろえる', m.ewOf({ fe: 50 }, v).ew, 27.92, rel(1e-3)]];
});
T('corrosionrate', '重量減少から(G1 の式 1)', '② check_testcalc.py(CR = K·W/(A·T·D)、K は G1-03 8.1.2 の 8.76 × 10⁴ mm/y・3.45 × 10⁶ mpy・1.00 × 10⁴ D g/(m²·h)・2.40 × 10⁶ D mdd)。W 0.085 g、A 30 cm²、T 168 h、D 7.87', m => {
  const r = m.wlRates(0.085, 30, 168, 7.87);
  return [['mm/y', r.mmy, 0.18772311974345013, rel(1e-9)], ['mpy', r.mpy, 7.393205058389301, rel(1e-9)], ['g/(m²·d)', r.gm2d, 4.0476190476190474, rel(1e-9)], ['mdd', r.mdd, 40.47619047619048, rel(1e-9)]];
});
T('corrosionrate', '電流密度から(G102 の式 5・6)とシュテルン・ギアリー', '② check_testcalc.py(CR = K1·i·EW/ρ、MR = K2·i·EW、B = βaβc/(2.303(βa + βc))、icorr = B/Rp)', m => {
  const fe = m.ecRates(1, 55.845 / 2, 7.87), s = m.ecRates(0.15, m.ewOf({ fe: 71.75, cr: 19, ni: 9.25 }, { fe: 2, cr: 3, ni: 2 }).ew, 7.9);
  const g1 = m.sternGeary(0.12, 0.12, 1000), g2 = m.sternGeary(0.06, 0.12, 250);
  return [['Fe 1 µA/cm²(mm/y)', fe.mmy, 0.011601851969504447, rel(1e-9)], ['Fe 1 µA/cm²(g/(m²·d))', fe.gm2d, 0.250018065, rel(1e-9)],
    ['304 0.15 µA/cm²(mm/y)', s.mmy, 0.0015596038444695062, rel(1e-6)], ['304(mpy)', s.mpy, 0.06143026763537383, rel(1e-6)],
    ['B(120・120 mV)', g1.B, 0.026052974381241857, rel(1e-9)], ['icorr(Rp 1000 Ω·cm²)', g1.icorr, 26.052974381241857, rel(1e-9)], ['icorr(60・120 mV、Rp 250)', g2.icorr, 69.4745983499783, rel(1e-9)]];
});
T('corrosionrate', '単位の換算と余寿命', '② check_testcalc.py(1 mil = 0.0254 mm、g/(m²·d) = mm/y × ρ × 1000/365.25、mdd = 10 × g/(m²·d))', m => {
  const r = m.convert(0.12, 'mmy', 7.87);
  return [['mpy', r.mpy, 4.724409448818897, rel(1e-12)], ['g/(m²·d)', r.gmd, 2.5856262833675565, rel(1e-12)], ['mdd', r.mdd, 25.856262833675565, rel(1e-12)],
    ['mdd 50 → mm/y', m.toMmy(50, 'mdd', 7.87), 0.2320520965692503, rel(1e-12)], ['余寿命 3 mm ÷ 0.12', m.lifeYears(3, 0.12), 25, rel(1e-12)]];
});
T('corrosionrate', '境目: 0・負の値・密度なし', '関数の決まり(入力が正でなければ null。質量の単位は密度がないと出さない)', m => [
  ['wlRates(A = 0)', m.wlRates(0.1, 0, 10, 7.87), null, EQ], ['ecRates(i < 0)', m.ecRates(-1, 27.92, 7.87), null, EQ], ['ecRates(ρ なし)の mm/y', m.ecRates(1, 27.92, 0).mmy, null, EQ],
  ['convert(−1)', m.convert(-1, 'mmy', 7.87), null, EQ], ['toMmy(gmd、ρ なし)', m.toMmy(1, 'gmd', 0), null, EQ], ['ewOf({})', m.ewOf({}, {}), null, EQ], ['lifeYears(速度 0)', m.lifeYears(1, 0), null, EQ]]);

// =====================================================================
// polymercalc(高分子の計算)
// =====================================================================
T('polymercalc', '分子量の平均(本数基準・質量基準)', '② check_testcalc.py(Mn = ΣnM/Σn、Mw = ΣnM²/ΣnM、Mz = ΣnM³/ΣnM²。質量基準は n = w/M)', m => {
  const a = m.averages([10000, 20000, 40000, 60000, 80000, 120000], [5, 12, 20, 15, 8, 3], 'n'), b = m.averages([10000, 100000], [1, 1], 'w');
  return [['Mn', a.Mn, 47460.31746031746, rel(1e-12)], ['Mw', a.Mw, 62107.023411371236, rel(1e-12)], ['Mz', a.Mz, 74857.29671513193, rel(1e-12)], ['Đ', a.D, 62107.023411371236 / 47460.31746031746, rel(1e-12)],
    ['Mn(質量基準)', b.Mn, 18181.81818181818, rel(1e-12)], ['Mw(質量基準)', b.Mw, 55000, rel(1e-12)]];
});
T('polymercalc', '逐次重合(カロザースの式・フローリー分布)', '② check_testcalc.py と式からの値(Odian, Principles of Polymerization 4 版 2-6 節の Xn = (1 + r)/(1 + r − 2rp)、r = 1 で 1/(1 − p)、Đ = 1 + p)', m => [
  ['Xn(p 0.99)', m.carothers(0.99), 100, rel(1e-9)], ['Xn(p 0.98、r 0.99)', m.carothers(0.98, 0.99), 40.12096774193541, rel(1e-9)], ['Xn の上限(r 0.99)', m.xnLimit(0.99), 199, rel(1e-9)],
  ['Xw(p 0.99)', m.xwFlory(0.99), 199, rel(1e-9)], ['Đ(p 0.99)', m.dispersityFlory(0.99), 1.99, rel(1e-12)], ['p(Xn 150、r 0.995)', m.pFor(150, 0.995), 0.9958291457286432, rel(1e-9)]]);
T('polymercalc', '完全結晶の融解熱の換算(TN048 表 1)', '① Blaine, TA Instruments TN048 表 1(PE 4.11 kJ/mol = 293 J/g、PET 26.9 kJ/mol = 140 J/g)。式量は CIAAW の原子量から(PE 14.027、PET 192.17、check_testcalc.py)。J/g は表の桁(整数)で', m => [
  ['PE の式量', m.presetById.pe.mru, 14.027, rel(1e-9)], ['PET の式量', m.presetById.pet.mru, 192.17, rel(1e-9)],
  ['PE(J/g)', m.kjmolToJg(4.11, 14.027), 293, abs(0.5)], ['PET(J/g)', m.kjmolToJg(26.9, 192.17), 140, abs(0.5)]]);
T('polymercalc', '結晶化度(密度・DSC)とガラス転移(Fox・WLF・Flory–Fox)', '② check_testcalc.py(1/ρ = wc/ρc + (1 − wc)/ρa、Xc = (ΔHm − ΔHc)/(wΔHm°)、1/Tg = w₁/Tg₁ + w₂/Tg₂、log aT = −C₁(T − Tr)/(C₂ + T − Tr)、C₁ 17.44・C₂ 51.6)', m => {
  const d = m.xcDensity(0.95, 1.003, 0.852);
  return [['wc', d.wc, 0.6852143604043223, rel(1e-12)], ['φ', d.phi, 0.6490066225165565, rel(1e-12)], ['DSC', m.xcDsc(45, 20, 140), 0.17857142857142858, rel(1e-12)],
    ['DSC(樹脂 70 %)', m.xcDsc(30, 0, 293, 0.7), 0.14627011214041932, rel(1e-12)], ['Fox(K)', m.fox(378.15, 263.15, 0.6), 321.8831392527899, rel(1e-12)],
    ['WLF(Tr + 10)', m.wlf(110, 100), -2.831168831168831, rel(1e-12)], ['WLF(Tr − 20)', m.wlf(80, 100), 11.037974683544304, rel(1e-12)], ['Flory–Fox', m.floryFox(100, 1e5, 2e4), 95, rel(1e-12)]];
});
T('polymercalc', '境目: 範囲の外', '関数の決まり(p > 1・r > 1・C₂ + T − Tr ≤ 0・ρc ≤ ρa・負の M は null、p = 1 で Xn は無限大)', m => [
  ['carothers(1.1)', m.carothers(1.1), null, EQ], ['carothers(0.5, 1.2)', m.carothers(0.5, 1.2), null, EQ], ['carothers(1)', m.carothers(1), Infinity, EQ],
  ['wlf(C₂ + T − Tr = 0)', m.wlf(48.4, 100), null, EQ], ['fox(0 K)', m.fox(0, 300, 0.5), null, EQ], ['xcDensity(ρc < ρa)', m.xcDensity(1, 0.9, 1.1), null, EQ],
  ['averages(M < 0)', m.averages([-1, 2], [1, 1]), null, EQ]]);

// =====================================================================
// steelcolor(鋼の色と温度)
// =====================================================================
T('steelcolor', '黒体の色度: CIE 標準イルミナント A', '① CIE 15:2004 の標準イルミナント A の白色点 x 0.44757、y 0.40745(2848 K・c₂ = 1.435 × 10⁻² の黒体 = 今の c₂ で 2855.50 K)。5 nm の和なので許容差 5 × 10⁻⁵', m => {
  const [x, y] = m.xyOf(2848 * m.C2 / 1.435e-2);
  return [['x', x, 0.44757, abs(5e-5)], ['y', y, 0.40745, abs(5e-5)]];
});
T('steelcolor', 'プランクの式とウィーンの変位則', '① CODATA 2018 の b = 2.897771955 × 10⁻³ m·K。② check_testcalc.py(λ⁻⁵/(exp(c₂/λT) − 1) の比)', m => [
  ['山の波長 1000 K(µm)', m.peakUm(1000), 2.897771955, rel(1e-12)], ['山の波長 1273.15 K(µm)', m.peakUm(1273.15), 2.897771955 / 1.27315, rel(1e-12)],
  ['放射の比 500/700 nm(1000 ℃)', m.planck(500, 1273.15) / m.planck(700, 1273.15), 0.008435480537751993, rel(1e-9)]]);
T('steelcolor', '火色の表の引き当てと温度の換算', '① Waidner・Burgess, Bulletin of the Bureau of Standards 1(2), 1905, p.209 の表(White & Taylor の Cherry 746 ℃、Howe の Dull red 550〜625 ℃、Pouillet の Bright cherry 1000 ℃ = 1832 °F)', m => [
  ['W&T 750 ℃ に近い色', m.nearestFire('wt', 750).e.n, 'wt_cherry', EQ], ['Howe 600 ℃(範囲の中は差 0)', m.nearestFire('howe', 600).d, 0, EQ], ['Howe 600 ℃ の色', m.nearestFire('howe', 600).e.n, 'howe_dull', EQ],
  ['1000 ℃ → °F', m.cToF(1000), 1832, rel(1e-12)], ['1832 °F → ℃', m.fToC(1832), 1000, rel(1e-12)], ['1000 ℃ → K', m.cToK(1000), 1273.15, rel(1e-12)]]);

// =====================================================================
// tensile(引張試験のデータ解析)
// 作った曲線: E = 200 GPa の直線で 180 MPa まで、その先は σt = 400 εtp^0.1(εtp 0.0005〜0.15 を 0.0001 刻み)。公称に直して解析する
// =====================================================================
const curve = () => {
  const E = 200000, e = [], s = [];
  for (let k = 0; k <= 30; k++) { const v = 6 * k; e.push(v / E); s.push(v); }
  for (let k = 5; k <= 1500; k++) { const etp = k / 10000, st = 400 * etp ** 0.1, en = Math.expm1(etp + st / E); e.push(en); s.push(st / (1 + en)); }
  return { e, s };
};
T('tensile', '作った曲線の E・0.2 % 耐力・引張強さ・n 値', '② check_testcalc.py(Considère の条件 εtp = n(1 − σt/E) を brentq で: Rm 287.0388 MPa、Agt 0.106752。0.2 % 耐力は連続な曲線で ε − σ/E = 0.002 となる 214.1202 MPa)。E・n・K は曲線を作った値。耐力は点の間の直線補間なので 0.1 MPa、Agt は点の間隔から 2 × 10⁻⁴', m => {
  const { e, s } = curve(), r = m.analyze(e, s);
  return [['E(MPa)', r.E, 200000, rel(1e-9)], ['Rp0.2(MPa)', r.Rp, 214.12017819892714, abs(0.1)], ['Rm(MPa)', r.Rm, 287.03883137842746, rel(1e-6)],
    ['Agt', r.Agt, 0.10675195996902254, abs(2e-4)], ['n', r.n, 0.1, abs(1e-6)], ['K(MPa)', r.K, 400, rel(1e-5)], ['降伏点なし', r.hasYP, false, EQ]];
});
T('tensile', 'Considère の点(べき乗則・Ramberg–Osgood)', '② check_testcalc.py(brentq。べき乗則 K 400・n 0.1・E 200 GPa、Ramberg–Osgood は焼なまし銅の見本の E 117 GPa・a 0.002・σ₀ 60・m 3)', m => {
  const c = m.considere(400, 0.1, 200000), ro = m.considereRO({ E: 117000, a: 0.002, s0: 60, m: 3 });
  return [['εtp', c.etp, 0.09984115960546192, rel(1e-9)], ['公称応力の最大', c.s, 287.03883137842746, rel(1e-9)], ['公称ひずみ', c.e, 0.10675195996902254, rel(1e-9)],
    ['RO の σt', ro.st, 329.88210607641884, rel(1e-9)]];
});
T('tensile', '最小二乗の直線と断面積', '② check_testcalc.py(定義の式で a・b・R²)。丸棒 d = 10 mm は π·10²/4', m => {
  const f = m.linfit([0, 1, 2, 3, 4], [1.1, 2.9, 5.2, 7.1, 8.8]);
  return [['a', f.a, 1.96, rel(1e-12)], ['b', f.b, 1.1, rel(1e-12)], ['R²', f.r2, 0.9976108860496521, rel(1e-12)], ['丸棒の断面積', m.areaOf('round', 10), 78.53981633974483, rel(1e-12)],
    ['板 20 × 2', m.areaOf('plate', 0, 20, 2), 40, EQ]];
});
T('tensile', '境目: 点が少ない・1 点', '関数の決まり(10 点未満は error few、直線は 2 点以上)', m => [
  ['analyze(5 点)', m.analyze([0, 1, 2, 3, 4], [0, 1, 2, 3, 4]).error, 'few', EQ], ['linfit(1 点)', m.linfit([1], [1]), null, EQ], ['linfit(x が同じ)', m.linfit([1, 1, 1], [1, 2, 3]), null, EQ]]);

// =====================================================================
// galvanic(異種金属接触腐食チェッカー)
// =====================================================================
const ACA = '① Australasian Corrosion Association「Seawater Corrosion」の表(流れる海水中の腐食電位、V vs SCE: Zn −0.98〜−1.03、Cu −0.30〜−0.37、Al 合金 −0.76〜−1.00、軟鋼 −0.60〜−0.72、Al 青銅・黄銅 −0.31〜−0.40、304 活性 −0.44〜−0.58・不動態 −0.04〜−0.10)。差は表の値の引き算';
T('galvanic', 'アノードと電位差の範囲', ACA, m => {
  const a = m.judge('zn', 'cu'), b = m.judge('steel', 'al'), c = m.judge('ss304p', 'ss304a');
  return [['Zn–Cu のアノード', a.anode, 'zn', EQ], ['Zn–Cu 最小', a.dmin, 0.61, abs(1e-9)], ['Zn–Cu 最大', a.dmax, 0.73, abs(1e-9)],
    ['鋼–Al のアノード(順序によらない)', b.anode, 'al', EQ], ['鋼–Al 最小', b.dmin, 0.04, abs(1e-9)], ['鋼–Al 最大', b.dmax, 0.40, abs(1e-9)],
    ['304 不動態–活性のアノード', c.anode, 'ss304a', EQ], ['304 最小', c.dmin, 0.34, abs(1e-9)], ['304 最大', c.dmax, 0.54, abs(1e-9)]];
});
T('galvanic', '範囲が重なる・同じ金属', ACA + '。重なるときはアノードを決めず、最大は端どうしの差の大きい方(関数の決まり)', m => {
  const o = m.judge('albz', 'brass'), c = m.judge('cu', 'cu');
  return [['重なる: アノードなし', o.anode, null, EQ], ['重なる: 最小', o.dmin, 0, EQ], ['重なる: 最大', o.dmax, 0.09, abs(1e-9)], ['同じ金属: same', c.same, true, EQ], ['同じ金属: 最大', c.dmax, 0, EQ]];
});
T('galvanic', '面積比と境目', '関数の決まり(返す値はカソード面積 ÷ アノード面積。比は「A の面積 ÷ B の面積」)。アノードは ' + ACA.slice(2), m => {
  const z = m.judge('zn', 'cu'), o = m.judge('albz', 'brass');
  return [['A = Zn がアノード、A/B = 0.05 → 20', m.areaFactor(z, 'zn', 0.05), 20, rel(1e-12)], ['A = Cu、B = Zn がアノード、A/B = 0.05 → 0.05', m.areaFactor(m.judge('cu', 'zn'), 'cu', 0.05), 0.05, rel(1e-12)],
    ['重なるときは出さない', m.areaFactor(o, 'albz', 2), null, EQ], ['面積比 0', m.areaFactor(z, 'zn', 0), null, EQ], ['面積比 ∞', m.areaFactor(z, 'zn', Infinity), null, EQ], ['ない金属', m.judge('xx', 'cu'), null, EQ]];
});

// =====================================================================
// micro(組織の模式図)
// =====================================================================
T('micro', 'てこの規則(初析・パーライト)', '① Callister, Materials Science and Engineering: An Introduction 9 章の式(W_p = (C₀ − 0.022)/(0.76 − 0.022)、W_Fe₃C′ = (C₁ − 0.76)/(6.70 − 0.76))。② check_testcalc.py で数値', m => [
  ['0.40 % C のパーライト', m.leverFrac({ lo: 0.022, hi: 0.76 }, 0.40), 0.5121951219512195, rel(1e-12)], ['1.00 % C の初析セメンタイト', m.leverFrac({ lo: 0.76, hi: 6.70 }, 1.00), 0.0404040404040404, rel(1e-12)],
  ['共析 0.76 % C は全部パーライト', m.leverFrac({ lo: 0.022, hi: 0.76 }, 0.76), 1, rel(1e-12)]]);
T('micro', '境目: てこの規則の範囲の外', '関数の決まり(0〜1 に切る)', m => [
  ['下限より下は 0', m.leverFrac({ lo: 0.022, hi: 0.76 }, 0), 0, EQ], ['上限より上は 1', m.leverFrac({ lo: 0.022, hi: 0.76 }, 1.2), 1, EQ], ['ちょうど下限は 0', m.leverFrac({ lo: 0.76, hi: 6.70 }, 0.76), 0, EQ]]);
T('micro', '種の文字列のハッシュ(FNV-1a 32 bit)', '① FNV の検査値(draft-eastlake-fnv の表: "" → 0x811c9dc5、"a" → 0xe40c292c、"foobar" → 0xbf9cf968)', m => [
  ['""', m.seedOf(''), 0x811c9dc5, EQ], ['"a"', m.seedOf('a'), 0xe40c292c, EQ], ['"foobar"', m.seedOf('foobar'), 0xbf9cf968, EQ]]);

// =====================================================================
// materials(材料データ集)の単位の換算
// =====================================================================
T('materials', '単位の換算(10 の累乗・定数)', '① SI の定義と CODATA 2018(1 eV × N_A = 96.48533212 kJ/mol、熱化学カロリー 4.184 J)', m => [
  ['210 GPa → MPa', m.conv(210, 'GPa', 'MPa').n, 210000, EQ], ['7.87 g/cm³ → kg/m³', m.conv(7.87, 'gcc', 'kgm3').n, 7870, EQ], ['1.2 Å → nm', m.conv(1.2, 'A', 'nm').n, 0.12, EQ],
  ['1 eV の基準(kJ/mol)', m.toBase(1, 'eV'), 96.48533212, rel(1e-12)], ['1000 cal/mol の基準(kJ/mol)', m.toBase(1000, 'calmol'), 4.184, rel(1e-12)],
  ['2.50 eV → kJ/mol(元の有効数字 2 桁以上)', m.conv(2.5, 'eV', 'kJmol').n, 240, EQ], ['違う量どうしは null', m.conv(1, 'GPa', 'gcc'), null, EQ]]);
T('materials', '温度の換算(273.15 を足し引きして元の小数の桁に)', '① T/K = t/℃ + 273.15(SI の定義)。丸めはファイル冒頭の決まり(元の小数の桁、0.5 は 0 から遠い側へ)を手で当てた値', m => [
  ['25 ℃ → K', m.conv(25, 'C', 'K').n, 298, EQ], ['1083.4 ℃ → K', m.conv(1083.4, 'C', 'K').n, 1356.6, EQ], ['−40.5 ℃ → K', m.conv(-40.5, 'C', 'K').n, 232.7, EQ],
  ['300 K → ℃', m.conv(300, 'K', 'C').n, 27, EQ], ['273.15 K → ℃', m.conv(273.15, 'K', 'C').n, 0, EQ], ['基準は K', m.toBase(25, 'C'), 298.15, rel(1e-12)]]);

T('materials', 'ほかの量の単位(拡散係数・抵抗率・熱膨張)', '① SI の定義(1 cm²/s = 10⁻⁴ m²/s、1 µΩ·cm = 10⁻⁸ Ω·m、1 ppm/K = 10⁻⁶ K⁻¹、1 W/(cm·K) = 100 W/(m·K))', m => [
  ['2.5 cm²/s → m²/s', m.conv(2.5, 'cm2s', 'm2s').n, 2.5e-4, rel(1e-12)], ['1.68 µΩ·cm → Ω·m', m.conv(1.68, 'uOcm', 'Om').n, 1.68e-8, rel(1e-12)],
  ['23.1 ppm/K → 1/K', m.conv(23.1, 'ppmK', 'perK').n, 2.31e-5, rel(1e-12)], ['4.01 W/(cm·K) → W/(m·K)', m.conv(4.01, 'Wcm', 'Wm').n, 401, EQ], ['値がないときは null', m.conv(null, 'GPa', 'MPa'), null, EQ]]);

// =====================================================================
// fe-c(鋼の熱処理ラボ): 状態図のてこの規則、変態点・炭素当量の経験式、焼入れ・焼戻しの式、丸棒の中心の冷え方
// =====================================================================
const FEC_X = { C: 0.15, Si: 0.30, Mn: 1.40, Ni: 0.20, Cr: 0.10, Mo: 0.05, V: 0.02, Cu: 0.20, B: 0.001 };
T('fe-c', '室温の組織分率(てこの規則)', '① Callister, Materials Science and Engineering: An Introduction 9 章の式(亜共析 W_α′ = (0.76 − C₀)/(0.76 − 0.022)、過共析 W_Fe₃C′ = (C₁ − 0.76)/(6.70 − 0.76))。3.0 % C の亜共晶鋳鉄は 1147 ℃・727 ℃のてこの規則を python で(②)', m => {
  const a = m.micro(0.40), b = m.micro(1.00), c = m.micro(3.0), part = (r, k) => r.parts.find(p => p[0] === k)[1];
  return [['0.40 % C の初析フェライト', part(a, 'pro_a'), 0.4878048780487805, rel(1e-12)], ['0.40 % C のパーライト', part(a, 'pearlite'), 0.5121951219512195, rel(1e-12)],
    ['0.40 % C の α の全量', a.total[0], 0.9433962264150944, rel(1e-12)], ['1.00 % C の初析セメンタイト', part(b, 'pro_c'), 0.0404040404040404, rel(1e-12)],
    ['3.0 % C の分類', c.kind, 'ci_hypo', EQ], ['3.0 % C のパーライト(初晶γから)', part(c, 'pearlite_g'), 0.46202768424990653, rel(1e-9)],
    ['3.0 % C の二次セメンタイト', part(c, 'sec_c'), 0.13982416760194538, rel(1e-9)], ['3.0 % C のレデブライト', part(c, 'led'), 0.39814814814814814, rel(1e-9)]];
});
T('fe-c', '状態図の点と相', '① Callister 9 章の Fe–Fe₃C 状態図(A3 は 0 % C で 912 ℃・共析 0.76 % C・727 ℃、Acm は 2.14 % C で 1147 ℃。0.40 % C は 900 ℃でγ、600 ℃で α + Fe₃C)', m => [
  ['0 % C の A3', m.upperCrit(0), 912, abs(1e-9)], ['共析の 0.76 % C', m.upperCrit(0.76), 727, abs(1e-9)], ['2.14 % C の Acm', m.upperCrit(2.14), 1147, abs(1e-9)],
  ['0.76 % C・727 ℃は共析の線の上', m.locate(0.76, 727)?.inv?.key, 'eutectoid', EQ], ['4.30 % C・1147 ℃は共晶の線の上', m.locate(4.30, 1147)?.inv?.key, 'eutectic', EQ],
  ['0.40 % C・900 ℃', m.locate(0.40, 900).key, 'g', EQ], ['0.40 % C・600 ℃', m.locate(0.40, 600).key, 'ac', EQ]]);
T('fe-c', '境目: 範囲の外', '関数の決まり(組成 0〜6.70 %・温度 400〜1600 ℃の外は null、2.14 % を超える upperCrit は NaN、Ms 以上ではマルテンサイト 0)', m => [
  ['負の炭素量は null', m.locate(-0.1, 800), null, EQ], ['400 ℃より下は null', m.locate(1, 300), null, EQ], ['6.70 % を超える組織は null', m.micro(7), null, EQ],
  ['3 % C の upperCrit は NaN', m.upperCrit(3), NaN, EQ], ['Ms より上ではマルテンサイト 0', m.kmFrac(300, 350), 0, EQ], ['D_I が 0 なら NaN', m.critD(0, 1), NaN, EQ], ['H = ∞ なら D = D_I', m.critD(2, Infinity), 2, EQ]]);
T('fe-c', '変態点の経験式(S45C の成分の中央)', '② Andrews(J. Iron Steel Inst. 203 (1965) 721)の Ac1・Ac3・Ms の1次式、Steven–Haynes(1956)の Ms を check_testcalc2.py で(C 0.45・Si 0.25・Mn 0.75)。参考: C45E のデータシートの値 Ac1 725・Ac3 785・Ms 300 ℃(ページの LIT)', m => {
  const r = m.transTemps({ C: 0.45, Si: 0.25, Mn: 0.75 });
  return [['Ac1(Andrews)', r.ac1_and.v, 722.25, abs(1e-9)], ['Ac3(Andrews)', r.ac3_and.v, 784.9984601702628, rel(1e-12)], ['Ms(Andrews の1次式)', r.ms_and.v, 325.85, abs(1e-9)],
    ['Ms(Steven–Haynes)', r.ms_sh.v, 322.95, abs(1e-9)], ['Ac1(Andrews)は C 0.6 % までの式の範囲の中', r.ac1_and.out.length, 0, EQ]];
});
T('fe-c', '焼入れ・焼戻し・溶接の式', '② Koistinen–Marburger(1959、α = 0.011)、Hollomon–Jaffe(P = T(Cc + log t)、Cc = 20)、Yurioka ら(1987)の HV = 884C(1 − 0.3C²) + 294、IIW の CE・Ito–Bessyo の Pcm・Yurioka の CEN を check_testcalc2.py で', m => {
  const ce = m.ceAll(FEC_X), P = m.hjP(600, 1, 20);
  return [['Ms 325 ℃から 25 ℃まで冷やしたマルテンサイト', m.kmFrac(325, 25), 0.96311683259876, rel(1e-12)], ['Ms 300 ℃で 50 % になる温度', m.kmTemp(300, 0.5), 236.98661994909588, rel(1e-12)],
    ['600 ℃・1 h の P', P, 17463, rel(1e-12)], ['同じ P になる 650 ℃の時間(h)', m.hjTime(P, 650, 20), 0.08255671881638145, rel(1e-9)], ['同じ P になる 10 h の温度(℃)', m.hjTemp(P, 10, 20), 558.4214285714286, rel(1e-12)],
    ['0.45 % C の 100 % マルテンサイトの HV', m.hvMart(0.45), 667.63365, rel(1e-12)],
    ['CE(IIW)', ce.iiw, 0.444, rel(1e-12)], ['Pcm', ce.pcm, 0.25866666666666666, rel(1e-12)], ['CEN', ce.cen, 0.42250019372414027, rel(1e-9)],
    ['CE 0.40 ちょうどは 2 段目(0.40〜0.45)', m.iiwBand(0.40), 1, EQ], ['CE 0.60 ちょうどは 3 段目(0.45〜0.60)', m.iiwBand(0.60), 2, EQ]];
});
T('fe-c', '丸棒の中心の冷え方(Bessel 関数の級数)', '② 無限長の円柱の中心の温度 θ = Σ 2J₁(λ)/(λ(J₀² + J₁²))·exp(−λ²Fo)(λJ₁ = Bi·J₀ の根)を scipy の Bessel 関数で(check_testcalc2.py)。2/√Fo½(∞) は Asimow ら(1941)の係数 4.458 に 0.2 % で合う', m => [
  ['Fo = 0.2・Bi = ∞', m.centerTheta(0.2, Infinity), 0.5014868606073983, rel(1e-6)], ['Fo = 0.1・Bi = 1', m.centerTheta(0.1, 1), 0.9768165133858498, rel(1e-6)],
  ['2/√Fo½(∞)', m.asimowCoef(), 4.466288037144203, rel(1e-6)]]);

// =====================================================================
// ashby(材料選択ラボ): 材料指標の導き方、チャートの線の傾き、撓み・強さの式からの質量
// =====================================================================
const STEEL = p => ({ rho: [7.85, 7.85], E: [210, 210], s: [300, 300] }[p] ?? null);
T('ashby', '機能・制約・目的から導く指標', '① M. F. Ashby, Materials Selection in Mechanical Design 5th ed. の材料指標(引張棒 E/ρ・σf/ρ、梁 E^½/ρ・σf^⅔/ρ、板 E^⅓/ρ・σf^½/ρ、ばね σf²/E、圧力容器 K_IC/σf・K_IC²/σf、熱衝撃 σf/(Eα)、費用は Cm·ρ で割る)', m => {
  const k = (fun, con, obj, free) => m.derive({ fun, con, obj, free }, { L: 1, S: 1, F: 1, W: 1, U: 1, R: 1, p: 1, q: 1, dT: 1, w: 1 }).key;
  return [['引張棒・剛性・質量', k('tie', 'stiff', 'mass', 'area'), 'e1', EQ], ['引張棒・強さ・質量', k('tie', 'str', 'mass', 'area'), 's1', EQ], ['引張棒・剛性・費用', k('tie', 'stiff', 'cost', 'area'), 'ce1', EQ],
    ['梁(正方形)・剛性・質量', k('beam', 'stiff', 'mass', 'sq'), 'e2', EQ], ['梁(正方形)・強さ・質量', k('beam', 'str', 'mass', 'sq'), 's23', EQ],
    ['板・剛性・質量', k('panel', 'stiff', 'mass', 't'), 'e3', EQ], ['板・強さ・質量', k('panel', 'str', 'mass', 't'), 's12', EQ], ['ばね・体積', k('spring', 'energy', 'vol', 'size'), 'sp', EQ],
    ['圧力容器・破壊前の降伏', k('vessel', 'ybb', 'perf', 'none'), 'ks', EQ], ['圧力容器・破壊前の漏れ', k('vessel', 'lbb', 'perf', 'none'), 'k2s', EQ], ['熱衝撃', k('thermal', 'shock', 'perf', 'none'), 'tsh', EQ]];
});
T('ashby', '両対数のチャートでの指標の線の傾き', '① Ashby 5th ed. の材料選択チャート(E–ρ の図で E/ρ・E^½/ρ・E^⅓/ρ の線の傾きは 1・2・3、σf–ρ の図で σf/ρ・σf^⅔/ρ・σf^½/ρ は 1・3/2・2、K_IC–σf の図で K_IC/σf は 1)', m => [
  ['E/ρ', m.slope('e1', 'rho', 'E'), 1, rel(1e-12)], ['E^½/ρ', m.slope('e2', 'rho', 'E'), 2, rel(1e-12)], ['E^⅓/ρ', m.slope('e3', 'rho', 'E'), 3, rel(1e-12)],
  ['σf/ρ', m.slope('s1', 'rho', 's'), 1, rel(1e-12)], ['σf^⅔/ρ', m.slope('s23', 'rho', 's'), 1.5, rel(1e-12)], ['σf^½/ρ', m.slope('s12', 'rho', 's'), 2, rel(1e-12)],
  ['K_IC/σf', m.slope('ks', 's', 'K'), 1, rel(1e-12)], ['κ/α は E–ρ の図に描けない', m.fits('ka', 'rho', 'E'), false, EQ], ['同じ軸どうしは null', m.lineFit('e1', 'E', 'E'), null, EQ]]);
T('ashby', '撓み・強さの式から部材の質量(鋼 ρ 7850 kg/m³、E 210 GPa、σf 300 MPa)', '② 剛性 S = F/δ の式(引張棒 δ = FL/(EA)、片持ち梁 δ = FL³/(3EI)・I = b⁴/12、板 I = Wt³/12)と強さ F = σf·A から質量を直接求めた値(check_testcalc2.py)。引張棒は S 10⁶ N/m・L 1 m、梁と板は S 10⁴ N/m・L 1 m・W 0.1 m、強さは F 10⁵ N', m => {
  const mass = (sel, inp) => m.outOf(STEEL, m.derive(sel, inp).out).c;
  const tie = m.derive({ fun: 'tie', con: 'stiff', obj: 'mass', free: 'area' }, { L: 1, S: 1e6 });
  return [['引張棒・剛性', mass({ fun: 'tie', con: 'stiff', obj: 'mass', free: 'area' }, { L: 1, S: 1e6 }), 0.03738095238095238, rel(1e-12)],
    ['片持ち梁(正方形)・剛性', mass({ fun: 'beam', con: 'stiff', obj: 'mass', free: 'sq' }, { L: 1, S: 1e4, sup: 'cant' }), 3.4260208767050804, rel(1e-12)],
    ['片持ちの板・剛性', mass({ fun: 'panel', con: 'stiff', obj: 'mass', free: 't' }, { L: 1, S: 1e4, W: 0.1, sup: 'cant' }), 9.73083007958517, rel(1e-12)],
    ['引張棒・強さ', mass({ fun: 'tie', con: 'str', obj: 'mass', free: 'area' }, { L: 1, F: 1e5 }), 2.6166666666666667, rel(1e-12)],
    ['質量は指標 E/ρ の −1 乗に比例', m.outPow(tie.key, tie.out), -1, EQ]];
});
T('ashby', '範囲からの指標の幅(低炭素鋼の E^½/ρ)', '② Ashby の範囲(低炭素鋼 E 200〜220 GPa、ρ 7.8〜7.9 g/cm³)の両端と相乗平均から check_testcalc2.py で(下限 √200/7.9、上限 √220/7.8)', m => {
  const r = m.indexOf(m.matById('lcs'), 'e2');
  return [['下限', r.lo, 1.7901437498393609, rel(1e-12)], ['上限', r.hi, 1.9015893556655548, rel(1e-12)], ['代表値', r.c, 1.845025284326952, rel(1e-12)],
    ['融点は K に直す(1470 ℃ → 1743.15 K)', m.range(m.matById('lcs'), 'T')[0], 1743.15, rel(1e-12)]];
});
T('ashby', '境目: 足切りの判定と値のない性質', '関数の決まり(範囲の全部が満たせば pass、一部なら part、満たさなければ fail、値がなければ na。性質がなければ null)', m => [
  ['範囲 1〜2 に ≥ 1', m.screenOne([1, 2], 'ge', 1), 'pass', EQ], ['範囲 1〜2 に ≥ 2', m.screenOne([1, 2], 'ge', 2), 'part', EQ], ['範囲 1〜2 に ≤ 0.5', m.screenOne([1, 2], 'le', 0.5), 'fail', EQ],
  ['値なし', m.screenOne(null, 'ge', 1), 'na', EQ], ['ない性質の範囲は null', m.range(m.matById('lcs'), 'zz'), null, EQ], ['範囲のない性質を含む指標は null', m.powRange(() => null, { E: 1 }), null, EQ]]);

// =====================================================================
// diffusion(拡散・表面処理シミュレーター): 誤差関数、Callister の例題、半導体のドーパント、濃度分布、最小二乗
// =====================================================================
T('diffusion', '誤差関数とその逆', '① Abramowitz & Stegun, Handbook of Mathematical Functions 表 7.1(erf 0.5 = 0.5204998778、erf 1 = 0.8427007929、erf 2 = 0.9953222650、erfc 3 = 2.209049700 × 10⁻⁵)と、python の math.erf・math.erfc・scipy の erfcinv(②)', m => [
  ['erf(0.5)', m.erf(0.5), 0.5204998778130465, rel(1e-12)], ['erf(1)', m.erf(1), 0.8427007929497149, rel(1e-12)], ['erf(2)', m.erf(2), 0.9953222650189527, rel(1e-12)],
  ['erf(−1) = −erf(1)', m.erf(-1), -0.8427007929497149, rel(1e-12)], ['erfc(3)', m.erfc(3), 2.2090496998585438e-5, rel(1e-10)], ['erfc(5)', m.erfc(5), 1.5374597944280351e-12, rel(1e-10)],
  ['ierfc(0.5)', m.ierfc(0.5), 0.4769362762044699, rel(1e-12)], ['ierfc(0) は ∞', m.ierfc(0), Infinity, EQ], ['ierfc(2) は −∞', m.ierfc(2), -Infinity, EQ]]);
T('diffusion', '浸炭の時間(Callister の例題)', '① Callister & Rethwisch 9th ed. 5 章の非定常拡散の例題(0.25 % C の鋼を 950 ℃・表面 1.20 % C、0.5 mm で 0.80 % C、D = 1.6 × 10⁻¹¹ m²/s: z = 0.392、t = 25,400 s = 7.1 h)。z は ② scipy の erfcinv でも', m => [
  ['z(本の 3 桁)', m.zFor(0.25, 1.20, 0.80), 0.392, abs(0.0005)], ['z(②)', m.zFor(0.25, 1.20, 0.80), 0.39238977582104045, rel(1e-10)],
  ['t(本の z = 0.392 で、本の 3 桁)', m.tFor(0.5e-3, 0.392, 1.6e-11), 25400, abs(50)]]);
T('diffusion', 'アレニウスの式(Callister の例題と表 5.2)', '① Callister & Rethwisch 9th ed. 5 章の例題(Al 中の Mg、550 ℃: D = 6.7 × 10⁻¹³ m²/s。本は R = 8.31・T = 823 K で丸めるので相対 1.5 %)と表 5.2(γ鉄中の C: D₀ 2.3 × 10⁻⁵ m²/s・Q 148 kJ/mol、Al 中の Mg: 1.2 × 10⁻⁴・130)。② CODATA の R で check_testcalc2.py', m => {
  const D = m.Dof(1.2e-4, 130, 550), cg = m.sysById('c_g'), mg = m.sysById('mg_al');
  return [['550 ℃の D(本)', D, 6.7e-13, rel(0.015)], ['550 ℃の D(②)', D, 6.759750475206361e-13, rel(1e-10)], ['D から温度に戻す', m.TforD(1.2e-4, 130, D), 550, abs(1e-9)],
    ['γ鉄中の C の D₀', cg.d0, 2.3e-5, EQ], ['γ鉄中の C の Q', cg.q, 148, EQ], ['Al 中の Mg の D₀', mg.d0, 1.2e-4, EQ], ['Al 中の Mg の Q', mg.q, 130, EQ],
    ['D ≥ D₀ になる温度はない', m.TforD(1.2e-4, 130, 2e-4), NaN, EQ]];
});
T('diffusion', 'Si へのホウ素の拡散(Callister の例題)', '① Callister & Rethwisch 9th ed. 5.6 節の例題(D₀ 2.4 × 10⁻³ m²/s、Q 3.87 eV、900 ℃・30 分のプリデポジション、表面 3 × 10²⁶ m⁻³、1100 ℃・2 h のドライブイン、基板 10²⁰ m⁻³: Q₀ = 3.44 × 10¹⁸ m⁻²、x_j = 2.19 µm。本は k = 8.62 × 10⁻⁵ eV/K で丸めるので相対 1 %)。② CODATA の k で check_testcalc2.py(単位は cm)', m => {
  const s = m.semi({ dop: 'bc', tp: 900, tpm: 30, ns: 3e20, td: 1100, tdm: 120, nb: 1e14, sum: false });
  return [['Q₀(本、cm⁻²)', s.Q, 3.44e14, rel(0.01)], ['x_j(本、cm)', s.xjd, 2.19e-4, rel(0.01)],
    ['900 ℃の D(②、cm²/s)', s.Dp, 5.687691883958814e-16, rel(1e-10)], ['1100 ℃の D(②)', s.Dd, 1.501121678950484e-13, rel(1e-10)],
    ['Q₀(②)', s.Q, 342515790064917.6, rel(1e-10)], ['x_j(②)', s.xjd, 0.00021788946723276604, rel(1e-6)]];
});
T('diffusion', '濃度分布の解析解', '② 有限の板の厳密解(Crank, The Mathematics of Diffusion 4.3 のフーリエ級数)、半無限体の erfc、薄膜のガウス分布を check_testcalc2.py で。拡散対の中央は両側の平均(式の形から)', m => [
  ['板(Dt/L² = 0.6、フーリエ級数の側)', m.pSlab(0.3e-3, 0.6e-6, 1e-3, 0.2, 1.0), 0.8947791214037326, rel(1e-9)],
  ['板(Dt/L² = 0.01、鏡像の側)は半無限体の erfc と同じ', m.pSlab(0.1e-3, 1e-8, 1e-3, 0.2, 1.0), 0.5836000977495628, rel(1e-9)], ['半無限体の erfc', m.pErf(0.1e-3, 1e-8, 0.2, 1.0), 0.5836000977495628, rel(1e-12)],
  ['薄膜のガウス分布', m.pGauss(1e-5, 1e-10, 2e-6, 0.1), 0.1878782578935445, rel(1e-12)], ['拡散対の x = 0', m.pCouple(0, 1e-10, 1, 0.2), 0.6, rel(1e-12)],
  ['Dt = 0 の板の表面', m.pSlab(0, 0, 1e-3, 0.2, 1.0), 1.0, EQ]]);
T('diffusion', '測定値から D₀ と Q(最小二乗)', '② scipy の linregress(ln D と 1/T)と t 分布の 97.5 % 点で check_testcalc2.py(1000〜1300 K の 4 点)。t(0.975; 3) = 3.182 は ① t 分布表。移動度は Arora ら(IEEE Trans. Electron Devices 29 (1982) 292)の式を python で', m => {
  const f = m.fitArr([[1000, 2.1e-13], [1100, 2.0e-12], [1200, 9.0e-12], [1300, 4.4e-11]]);
  return [['Q(kJ/mol)', f.Q, 189.99838881375692, rel(1e-9)], ['D₀', f.D0, 0.0018531850784555017, rel(1e-9)], ['r²', f.r2, 0.9981274851089357, rel(1e-9)], ['Q の 95 % 区間の幅', f.Qci, 25.037493424548913, rel(2e-4)],
    ['t(0.975; 3)', m.t975(3), 3.182, abs(0.0005)], ['1 点では null', m.fitArr([[1000, 1e-12]]), null, EQ],
    ['n 型 10¹⁶ cm⁻³ の移動度', m.mobility(1e16, 'n'), 1218.4069532889587, rel(1e-12)], ['p 型 10¹⁸ cm⁻³ の移動度', m.mobility(1e18, 'p'), 143.23226205513964, rel(1e-12)]];
});

// =====================================================================
// composite(複合材料デザイナー): 複合則、単層の剛性、古典積層理論、短繊維、積層の書き方、破壊則
// =====================================================================
const T300 = { E1: 181e3, E2: 10.3e3, nu12: 0.28, G12: 7.17e3 };
const ply = (th, Q) => ({ th, t: 0.125, Q, a1: 0, a2: 0 });
T('composite', '一方向材の複合則(Callister の例題)', '① Callister & Rethwisch 9th ed. 16 章の例題(ガラス繊維 40 vol%・E 69 GPa、エポキシ E 3.4 GPa: 縦 E = 30 GPa、繊維と母材の荷重の比 13.5、横 E = 5.5 GPa)。② 値そのものは check_testcalc2.py(29.64・0.93117・5.4864)', m => {
  const fr = m.fractions({ basis: 'vol', f: 0.4, vv: 0, rf: 2.58, rm: 1.2 });
  const o = m.micro({ E1: 69, E2: 69, G12: 28, nu: 0.22, a1: 5, a2: 5, s: 3450 }, { E: 3.4, nu: 0.35, a: 60, s: 70, eu: NaN }, fr);
  return [['縦の E(本)', o.E1, 30, abs(0.5)], ['縦の E(②)', o.E1, 29.64, rel(1e-12)], ['繊維の荷重の比 Ff/Fm(本)', o.share / (1 - o.share), 13.5, abs(0.05)],
    ['繊維の荷重の割合(②)', o.share, 0.9311740890688259, rel(1e-12)], ['横の E(本)', o.E2r, 5.5, abs(0.05)], ['横の E(②)', o.E2r, 5.486435921421889, rel(1e-12)]];
});
T('composite', '単層の換算剛性 Q と 60° 回した Q̄(T300/5208)', '① A. K. Kaw, Mechanics of Composite Materials 2nd ed. 2 章の例題(E1 181 GPa、E2 10.3 GPa、ν12 0.28、G12 7.17 GPa: Q11 181.8、Q12 2.897、Q22 10.35、Q66 7.17 GPa。60° で Q̄11 23.65、Q̄12 32.46、Q̄16 20.05、Q̄22 109.4、Q̄26 54.19、Q̄66 36.74 GPa)。本の桁で比べる', m => {
  const Q = m.Qmat(T300.E1, T300.E2, T300.nu12, T300.G12), B = m.Qbar(Q, 60);
  return [['Q11', Q[0][0], 181.8e3, abs(50)], ['Q12', Q[0][1], 2.897e3, abs(0.5)], ['Q22', Q[1][1], 10.35e3, abs(5)], ['Q66', Q[2][2], 7.17e3, abs(5)],
    ['Q̄11', B[0][0], 23.65e3, abs(5)], ['Q̄12', B[0][1], 32.46e3, abs(5)], ['Q̄16', B[0][2], 20.05e3, abs(5)], ['Q̄22', B[1][1], 109.4e3, abs(50)], ['Q̄26', B[1][2], 54.19e3, abs(5)], ['Q̄66', B[2][2], 36.74e3, abs(5)]];
});
T('composite', '古典積層理論(T300/5208、1 層 0.125 mm)', '② ABD 行列を numpy で別に組んで逆行列から Ex・νxy(check_testcalc2.py。Q̄ は T⁻¹QRTR⁻¹ の行列の積で)', m => {
  const Q = m.Qmat(T300.E1, T300.E2, T300.nu12, T300.G12), L = m.laminate([0, 90, 90, 0].map(a => ply(a, Q)));
  const U = m.laminate([0, 90].map(a => ply(a, Q))), QI = m.laminate([0, 45, -45, 90, 90, -45, 45, 0].map(a => ply(a, Q)));
  return [['[0/90]s の A11(N/mm)', L.A[0][0], 48039.3243935596, rel(1e-10)], ['A12', L.A[0][1], 1448.4622221748657, rel(1e-10)], ['A66', L.A[2][2], 3585.0, rel(1e-10)],
    ['D11(N·mm)', L.D[0][0], 1670.6043367718048, rel(1e-10)], ['D22', L.D[1][1], 331.034179626512, rel(1e-10)], ['Ex(MPa)', L.Ex, 95991.30189639775, rel(1e-9)], ['νxy', L.nuxy, 0.03015159435441715, rel(1e-8)],
    ['対称なので B = 0', L.symB, true, EQ], ['[0/90] の B11(N)', U.B[0][0], -1339.5701571452928, rel(1e-10)], ['[0/90] は B ≠ 0', U.symB, false, EQ],
    ['[0/±45/90]s の Ex', QI.Ex, 69675.74091664812, rel(1e-9)], ['[0/±45/90]s の νxy', QI.nuxy, 0.2960309433752795, rel(1e-8)]];
});
T('composite', '回した単層の E(θ)・Halpin–Tsai・質量率・短繊維', '② 1/Ex = cos⁴θ/E1 + (1/G12 − 2ν12/E1)sin²θcos²θ + sin⁴θ/E2、Halpin–Tsai(ξ = 2、Ef 230・Em 3.5 GPa、Vf 0.6)、質量率 0.6(ρf 1.8、ρm 1.2)の体積率、Callister 16 章の lc = σf·d/(2τc) と Kelly–Tyson の式(l ≥ lc: Vf σf(1 − lc/2l) + Vm σm′、l < lc: Vf τ l/d + Vm σm′。σf 3500 MPa、d 10 µm、τ 75 MPa、Vf 0.3、σm′ 60 MPa)を check_testcalc2.py で。Krenchel の配向の効率は ① Krenchel(1964)の 1・1/2・3/8・1/5', m => {
  const lc = m.critLen(3500, 10, 75);
  return [['45° の E(MPa)', m.lamE(T300.E1, T300.E2, T300.nu12, T300.G12, 45), 16737.218799067326, rel(1e-12)], ['0° は E1', m.lamE(T300.E1, T300.E2, T300.nu12, T300.G12, 0), 181e3, rel(1e-12)],
    ['Halpin–Tsai', m.halpinTsai(230, 3.5, 2, 0.6), 17.614243323442132, rel(1e-12)], ['質量率 0.6 の体積率', m.fractions({ basis: 'mass', f: 0.6, vv: 0, rf: 1.8, rm: 1.2 }).vf, 0.5, rel(1e-12)],
    ['空隙 2 % のとき', m.fractions({ basis: 'mass', f: 0.6, vv: 0.02, rf: 1.8, rm: 1.2 }).vf, 0.49, rel(1e-12)],
    ['lc(mm)', lc, 0.23333333333333334, rel(1e-12)], ['l = 1 mm の強さ', m.kellyTyson(3500, 75, 10, 1.0, lc, 0.3, 0.7, 60), 969.5, rel(1e-12)], ['l = 0.1 mm の強さ', m.kellyTyson(3500, 75, 10, 0.1, lc, 0.3, 0.7, 60), 267.0, rel(1e-12)],
    ['l = 1 mm の効率', m.ktEff(1.0, lc), 0.8833333333333333, rel(1e-12)], ['l = 0.1 mm の効率', m.ktEff(0.1, lc), 0.2142857142857143, rel(1e-12)],
    ['Krenchel: そろった繊維', m.KRENCHEL.al, 1, EQ], ['直交 2 方向', m.KRENCHEL.bi, 0.5, EQ], ['面内でランダム', m.KRENCHEL.r2, 0.375, EQ], ['3 次元でランダム', m.KRENCHEL.r3, 0.2, EQ]];
});
T('composite', '積層の書き方と境目', '① 積層の記号の約束(s は対称、±θ は +θ と −θ、数字は繰り返し。Kaw 4 章の書き方)。角度は −90°〜90° に直し、読めないものは err(関数の決まり)', m => [
  ['[0/±45/90]s', m.parseLayup('[0/±45/90]s').angles?.join('/'), '0/45/-45/90/90/-45/45/0', EQ], ['[0/90]2s', m.parseLayup('[0/90]2s').angles?.join('/'), '0/90/0/90/90/0/90/0', EQ],
  ['[±45]s', m.parseLayup('[±45]s').angles?.join('/'), '45/-45/-45/45', EQ], ['135° は −45°', m.parseLayup('[135/45]').angles?.join('/'), '-45/45', EQ],
  ['読めない', m.parseLayup('abc').err, 'syntax', EQ], ['空', m.parseLayup('').err, 'empty', EQ]]);
T('composite', '破壊則(Tsai–Wu・Tsai–Hill・最大応力)', '② Tsai–Wu(F12 = −½√(F11F22))・Tsai–Hill の式と、強度比の2次方程式を check_testcalc2.py で(X = X′ 1500、Y 40、Y′ 246、S 68 MPa、σ = (500, 20, 30) MPa)。最大応力則は X/σ1', m => {
  const Lm = { X: 1500, Xc: 1500, Y: 40, Yc: 246, S: 68 }, C = m.tsaiWuF(Lm), s = [500, 20, 30];
  const mx = m.srMax([0, 0, 0], [100, 0, 0], Lm);
  return [['Tsai–Wu の値', m.twIndex(s, C), 0.6978908962622788, rel(1e-12)], ['Tsai–Wu の強度比', m.srTsaiWu([0, 0, 0], s, C), 1.2858475580640136, rel(1e-10)],
    ['Tsai–Hill の値', m.hillIndex(s, Lm), 0.5513033448673588, rel(1e-12)], ['最大応力則の強度比(σ1 = 100)', mx.r, 15, rel(1e-12)], ['そのモード', mx.mode, '1t', EQ]];
});

// =====================================================================
// xrd(XRD 解析ワークベンチ): 面間隔とブラッグ角、消滅則と構造因子、指数づけ、LP 因子、結晶子の大きさ
// =====================================================================
T('xrd', '面間隔と回折角(Callister の例題)', '① Callister & Rethwisch 9th ed. 3 章の例題(BCC 鉄 a = 0.2866 nm の (220)、λ = 0.1790 nm: d = 0.1013 nm)。2θ は ② python で 124.08°(本の 124.26° は d を丸めた値からも出ないので比べない)', m => {
  const d = 1 / Math.sqrt(m.invD2('cubic', 0.2866, 0.2866, 2, 2, 0));
  return [['d220(本)', d, 0.1013, abs(0.00005)], ['d220(②)', d, 0.10132840174403226, rel(1e-12)], ['2θ(②)', m.twoTheta(d, 0.1790), 124.07793222910493, rel(1e-12)],
    ['六方晶の (002) は c/2', 1 / Math.sqrt(m.invD2('hex', 0.25, 0.4, 0, 0, 2)), 0.2, rel(1e-12)], ['λ/2d > 1 は NaN', m.twoTheta(0.05, 0.15406), NaN, EQ]];
});
T('xrd', '回折パターンの線の並び(FCC の Cu・BCC の Fe)', '① B. D. Cullity, Elements of X-Ray Diffraction 3rd ed. 4 章の消滅則(FCC は hkl が全部偶数か全部奇数、BCC は h + k + l が偶数)と線の順。2θ は ② python(Cu a = 0.36146 nm・Cu Kα1 0.1540601 nm、Fe a = 0.28665 nm・Co Kα1 0.1789011 nm)', m => {
  const cu = m.simulate({ type: 'fcc', a: 0.36146, ea: 'Cu', lam: 0.1540601, src: 'cuka1', B: 0, disp: 'off', mono: 'none', tmin: 20, tmax: 100 }).lines;
  const fe = m.simulate({ type: 'bcc', a: 0.28665, ea: 'Fe', lam: 0.1789011, src: 'coka1', B: 0, disp: 'off', mono: 'none', tmin: 20, tmax: 165 }).lines;
  return [['Cu の線', cu.map(l => l.label).join(' '), '(111) (200) (220) (311) (222)', EQ], ['Cu (111) の 2θ', cu[0].tt, 43.32197622613202, rel(1e-10)], ['Cu (311) の 2θ', cu[3].tt, 89.95022549032407, rel(1e-10)],
    ['Fe の線', fe.map(l => l.label).join(' '), '(110) (200) (211) (220) (310)', EQ], ['Fe (211) の 2θ', fe[2].tt, 99.7029113065682, rel(1e-10)], ['いちばん強い線は 100', Math.max(...cu.map(l => l.rel)), 100, rel(1e-12)]];
});
T('xrd', '構造因子と消滅則', '① Cullity 3rd ed. 4-13 節の例(NaCl: F(111) = 4(f_Na − f_Cl)、F(200) = 4(f_Na + f_Cl)。BCC: F(100) = 0、F(110) = 2f。ダイヤモンド: F(200) = F(222) = 0、|F(111)|² = 32f²)。散乱因子を f_Na 11・f_Cl 17・f 10 に固定して', m => {
  const F = (type, h, k, l, fa = 10, fb = 0) => m.structureFactor(m.STRUCT[type].sites(), { A: [fa, 0], B: [fb, 0] }, h, k, l);
  const F2 = v => v[0] ** 2 + v[1] ** 2;
  return [['NaCl F(111)', F('nacl', 1, 1, 1, 11, 17)[0], -24, abs(1e-9)], ['NaCl F(200)', F('nacl', 2, 0, 0, 11, 17)[0], 112, abs(1e-9)], ['BCC F(100)', F2(F('bcc', 1, 0, 0)), 0, abs(1e-9)],
    ['BCC F(110)', F('bcc', 1, 1, 0)[0], 20, abs(1e-9)], ['ダイヤモンド F(200)', F2(F('diamond', 2, 0, 0)), 0, abs(1e-9)], ['ダイヤモンド F(222)', F2(F('diamond', 2, 2, 2)), 0, abs(1e-9)],
    ['ダイヤモンド |F(111)|²', F2(F('diamond', 1, 1, 1)), 3200, abs(1e-9)], ['FCC F(100)', F2(F('fcc', 1, 0, 0)), 0, abs(1e-9)]];
});
T('xrd', '指数づけ(測った 2θ から構造と格子定数)', '② Cu(FCC、a = 0.36150 nm)・Cu Kα1 0.15406 nm の 2θ を python で出し(小数 4 桁に丸めた 43.3169・50.4493・74.1261・89.9375・95.1474°)、それを入れて FCC と a に戻るか。BCC の Fe も同じ(Co Kα1、a = 0.28665 nm)', m => {
  const r = m.indexCubic([43.3169, 50.4493, 74.1261, 89.9375, 95.1474], 0.15406, 0.1, 'lsq').res[0];
  const f = m.indexCubic([52.3753, 77.2338, 99.7029, 123.9212], 0.1789011, 0.1, 'lsq').res[0];
  return [['Cu の構造', r.type, 'fcc', EQ], ['Cu の a(nm)', r.final.a, 0.36150, abs(1e-5)], ['合ったピーク', r.nMatch, 5, EQ], ['Fe の構造', f.type, 'bcc', EQ], ['Fe の a', f.final.a, 0.28665, abs(1e-5)]];
});
T('xrd', 'LP 因子と原子散乱因子', '① Cullity 3rd ed. の LP 因子 (1 + cos²2θ)/(sin²θ cosθ)(2θ = 90° で 2√2)。散乱角 0 の原子散乱因子は電子の数(International Tables Vol. C 表 6.1.1.4 の係数の和は Z に 0.05 以内で合う)。② 2θ = 43.3° は python', m => [
  ['2θ = 90°', m.lpFactor(90, 'none', 0.15406), 2 * Math.SQRT2, rel(1e-12)], ['2θ = 43.3°', m.lpFactor(43.3, 'none', 0.15406), 12.091023757284082, rel(1e-12)],
  ['f₀(Cu, 0)', m.f0('Cu', 0), 29, abs(0.05)], ['f₀(Fe, 0)', m.f0('Fe', 0), 26, abs(0.05)], ['f₀(Al, 0)', m.f0('Al', 0), 13, abs(0.05)], ['ない元素は NaN', m.f0('Xx', 0), NaN, EQ]]);
T('xrd', '結晶子の大きさ・ひずみ・ピークの移動・ベガード則', '② Scherrer の式 D = Kλ/(β cosθ)(K 0.9、λ 0.15406 nm、β² = βm² − βi²)と Williamson–Hall の直線(scipy の linregress)、Δa/a = 0.2 % の 2θ の移動(厳密と −2ε tanθ)、ベガード則を check_testcalc2.py で', m => {
  const rows = [[38.2, 0.30, 0.08], [44.4, 0.33, 0.08], [64.6, 0.42, 0.09], [77.6, 0.50, 0.10]].map(([tt, b, bi]) => ({ tt, b, bi }));
  const r = m.sizeStrain(rows, 0.15406, 0.9, 'gauss'), sh = m.shiftOf(0.36146 / Math.sqrt(3), 0.1540601, 0.002);
  return [['38.2° の D(nm)', r.pts[0].D, 29.07659633474687, rel(1e-12)], ['W–H の D', r.wh.D, 49.73917911048371, rel(1e-9)], ['W–H の ε', r.wh.eps, 0.0015417100557183591, rel(1e-9)],
    ['移動(厳密)', sh.exact, -0.09082636133724975, rel(1e-9)], ['移動(近似)', sh.approx, -0.09102232885791328, rel(1e-9)], ['ベガード則の x', m.vegardX(0.3570, 0.36146, 0.3524), 0.49227373068432817, rel(1e-12)],
    ['測った幅が装置の幅以下は使わない', m.sizeStrain([{ tt: 40, b: 0.05, bi: 0.08 }], 0.15406, 0.9, 'gauss').pts[0].ok, false, EQ]];
});

// =====================================================================
// thermal(熱膨張・熱応力ラボ): 拘束の熱応力、バイメタル・Stoney、中空円筒、焼きばめ、熱衝撃、Eurocode の鋼の熱ひずみ
// =====================================================================
T('thermal', '両端を固定した棒の熱応力(Callister の例題)', '① Callister & Rethwisch 9th ed. 19 章の例題(黄銅の棒、20 ℃で応力なし、E 100 GPa・α 20 × 10⁻⁶/℃、圧縮 172 MPa を超えない温度: 106 ℃)', m => {
  const f = t => m.conStress({ type: 'rod', E: 100e9, de: 20e-6 * (t - 20) }).s + 172e6;
  return [['172 MPa になる温度(℃)', m.solveT(f, 20, 500), 106, abs(0.01)], ['86 ℃上げたときの応力(Pa)', m.conStress({ type: 'rod', E: 100e9, de: 20e-6 * 86 }).s, -172e6, rel(1e-12)]];
});
T('thermal', '拘束の種類ごとの熱応力', '② σ = −Eε(一軸)、−Eε/(1 − ν)(等二軸)、−Eε/(1 − 2ν)(3軸)、ばね −Eε/(1 + EA/(kL))、すき間 g の壁 −E(εL − g)/L を check_testcalc2.py で(アルミ E 70 GPa・ν 0.33・α 23 × 10⁻⁶・ΔT 100 K、鋼 E 200 GPa・ε 10⁻³)', m => [
  ['等二軸', m.conStress({ type: 'plate', E: 70e9, nu: 0.33, de: 23e-6 * 100 }).s, -240298507.4626866, rel(1e-12)], ['3軸', m.conStress({ type: 'tri', E: 70e9, nu: 0.33, de: 23e-6 * 100 }).s, -473529411.7647059, rel(1e-12)],
  ['ばね(k 10⁸ N/m、A 10⁻⁴ m²、L 1 m)', m.conStress({ type: 'spring', E: 200e9, de: 1e-3, L: 1, A: 1e-4, k: 1e8 }).s, -166666666.6666667, rel(1e-12)],
  ['すき間 1 mm・L 2 m', m.conStress({ type: 'gap', E: 200e9, de: 1e-3, L: 2, g: 1e-3 }).s, -1e8, rel(1e-12)], ['すき間が埋まらなければ 0', m.conStress({ type: 'gap', E: 200e9, de: 1e-3, L: 0.5, g: 1e-3 }).s, 0, EQ]]);
T('thermal', 'バイメタル・Stoney の式', '① Timoshenko(J. Opt. Soc. Am. 11 (1925) 233)の式で、厚さと E が同じときは 1/ρ = 3Δε/(2h)。② 一般の場合と Stoney の式 κ = 6σf tf/(Ms ts²)(Ms = E/(1 − ν))は check_testcalc2.py', m => [
  ['同じ厚さ・同じ E(1/m)', m.bimetal({ E1: 200e9, E2: 200e9, t1: 1e-3, t2: 1e-3, de: 1e-3 }), 0.75, rel(1e-12)],
  ['0.5 mm(200 GPa)と 1.5 mm(70 GPa)', m.bimetal({ E1: 200e9, E2: 70e9, t1: 0.5e-3, t2: 1.5e-3, de: 1e-3 }), 0.7017299592746006, rel(1e-12)],
  ['Stoney の曲率(1/m)', m.stoneyK(200e6, 1e-6, 130e9 / (1 - 0.28), 500e-6), 0.026584615384615384, rel(1e-12)],
  ['曲率から応力に戻す', m.stoneyS(0.026584615384615384, 1e-6, 130e9 / (1 - 0.28), 500e-6), 200e6, rel(1e-12)]]);
T('thermal', '中空円筒の定常の熱応力', '② Timoshenko & Goodier, Theory of Elasticity 3rd ed. 151 節の閉じた式(σθ・σr・σz、両端自由)を check_testcalc2.py で(E 200 GPa、ν 0.3、α 12 × 10⁻⁶、内面が 100 K 高い、内径 50 mm・外径 100 mm の半径)', m => {
  const p = { E: 200e9, nu: 0.3, a: 12, dT: 100, ra: 0.05, rb: 0.1 }, at = r => m.cylStress({ ...p, r });
  return [['内面の σθ', at(0.05).st, -209823707.27617764, rel(1e-9)], ['外面の σθ', at(0.1).st, 133033435.58096519, rel(1e-9)], ['中ほどの σr', at(0.075).sr, -26704841.146214504, rel(1e-9)],
    ['中ほどの σθ', at(0.075).st, 17439705.545861743, rel(1e-9)], ['内面の σz(= σθ)', at(0.05).sz, -209823707.27617767, rel(1e-9)], ['内面の σr は 0', at(0.05).sr, 0, abs(1)]];
});
T('thermal', '焼きばめ・熱衝撃・はんだの寿命', '② 同じ材料の中実の軸の焼きばめ p = Eδ/(2d)·(1 − d²/D²)(Shigley の厚肉円筒の式)、R = σf(1 − ν)/(Eα)、Manson の式、Engelmaier の式を check_testcalc2.py で', m => {
  const l = m.lame({ dl: 50e-6, d: 0.05, D: 0.1, di: 0, Eo: 200e9, nuo: 0.3, Ei: 200e9, nui: 0.3 });
  return [['しめしろ 50 µm の面圧(Pa)', l.p, 75e6, rel(1e-12)], ['外側の内面の σθ', l.sto, 125e6, rel(1e-12)], ['中実の軸の σθ = −p', l.sti, -75e6, rel(1e-12)],
    ['R(K)', m.shockR(70e6, 0.22, 70e9, 9), 86.66666666666667, rel(1e-12)], ['Manson(β = 5)', m.manson(5), 0.4695675836338868, rel(1e-12)], ['β = 0 は 0', m.manson(0), 0, EQ],
    ['はんだの寿命(回)', m.solder({ F: 0.7, LD: 3e-3, h: 0.1e-3, da: 10, dT: 100, Ts: 50, f: 2 }).N, 978.4241908792418, rel(1e-9)]];
});
T('thermal', '鋼の熱ひずみ(Eurocode 3)', '① EN 1993-1-2 3.4.1.1 の式(20 ℃で 0、750〜860 ℃は 1.1 × 10⁻²、860 ℃より上は 2 × 10⁻⁵θ − 6.2 × 10⁻³)。範囲の外は NaN(関数の決まり)', m => {
  const s = m.matById('steel'), c = m.CURVES.steel;
  return [['20 ℃', m.curveEps(c, 20), 0, abs(1e-12)], ['800 ℃', m.curveEps(c, 800), 1.1e-2, rel(1e-12)], ['1000 ℃', m.curveEps(c, 1000), 0.0138, rel(1e-12)],
    ['20 → 800 ℃の熱ひずみ(曲線)', m.thStrain(s, 12, 20, 800, true).eps, 1.1e-2, rel(1e-12)], ['曲線を使わないとき', m.thStrain(s, 12, 20, 800, false).eps, 12e-6 * 780, rel(1e-12)],
    ['1300 ℃は範囲の外', m.curveEps(c, 1300), NaN, EQ]];
});

// =====================================================================
// lever(2元系状態図ラボ): Callister の例題のタイラインとてこの規則、組織、wt% と at%、理想溶液、PCHIP
// =====================================================================
T('lever', 'Cu–Ni の 35 % Ni・1250 ℃(Callister の例題)', '① Callister & Rethwisch 9th ed. 9 章の例題(C_L = 31.5、Cα = 42.5 wt% Ni、W_L = 0.68、Wα = 0.32)。組成は本の桁、分率は 2 桁', m => {
  const p = m.locate('cuni', 35, 1250).phases;
  return [['液相の組成', p[0][1], 31.5, abs(0.05)], ['α の組成', p[1][1], 42.5, abs(0.05)], ['液相の分率', p[0][2], 0.68, abs(0.005)], ['α の分率', p[1][2], 0.32, abs(0.005)]];
});
T('lever', 'Pb–Sn の 40 % Sn・150 ℃(Callister の例題)', '① Callister & Rethwisch 9th ed. 9 章の例題(Cα = 11、Cβ = 99 wt% Sn、Wα = 0.67、Wβ = 0.33)。共晶の点(183 ℃、18.3・61.9・97.8 wt% Sn)も Callister の図の値', m => {
  const p = m.locate('pbsn', 40, 150).phases, inv = m.invariant(m.SYS.pbsn);
  return [['α の組成', p[0][1], 11, abs(0.05)], ['β の組成', p[1][1], 99, abs(0.05)], ['α の分率', p[0][2], 0.67, abs(0.005)], ['β の分率', p[1][2], 0.33, abs(0.005)],
    ['共晶温度', inv.t, 183, EQ], ['共晶の液相の組成', inv.phases[1][1], 61.9, EQ], ['183 ℃ちょうどは共晶の線の上', m.locate('pbsn', 40, 183).inv?.key, 'eut', EQ]];
});
T('lever', '共晶温度の直下の組織(Pb–Sn)', '② Callister 9 章の式(初晶 α′ = (61.9 − C₀)/(61.9 − 18.3)、α の全量 = (97.8 − C₀)/(97.8 − 18.3)、過共晶の初晶 β = (C₀ − 61.9)/(97.8 − 61.9))を check_testcalc2.py で', m => {
  const a = m.constituents('pbsn', 40, 182), b = m.constituents('pbsn', 80, 182), w = (r, k) => r.parts.find(p => p.k === k).w;
  return [['40 % Sn の初晶 α', w(a, 'pa'), 0.5022935779816514, rel(1e-12)], ['40 % Sn の共晶', w(a, 'eut'), 1 - 0.5022935779816514, rel(1e-12)],
    ['40 % Sn の α の全量(共晶温度の直下)', m.invLevers('pbsn', 40).below[0][2], 0.7270440251572327, rel(1e-12)], ['80 % Sn の初晶 β', w(b, 'pb'), 0.5041782729805014, rel(1e-12)]];
});
T('lever', 'wt% と at%・密度', '① Callister & Rethwisch 9th ed. 4 章の例題(97 wt% Al–3 wt% Cu は 1.30 at% Cu)。② 50 wt% Ni(Cu–Ni)の at% と、比体積の和の密度(周期表ツールの Pb 11.3・Sn 7.265 g/cm³ を入力)は check_testcalc2.py。原子量は IUPAC の標準原子量', m => [
  ['3 wt% Cu(本)', m.toAt(m.SYS.alcu, 3), 1.30, abs(0.005)], ['3 wt% Cu(②)', m.toAt(m.SYS.alcu, 3), 1.2961920335735928, rel(1e-12)], ['50 wt% Ni', m.toAt(m.SYS.cuni, 50), 51.98504568918267, rel(1e-12)],
  ['at% から wt% に戻す', m.toWt(m.SYS.cuni, 51.98504568918267), 50, rel(1e-12)], ['0 と 100 はそのまま', m.toAt(m.SYS.cuni, 100), 100, EQ], ['Pb–40 % Sn の密度', m.rhoOf(m.SYS.pbsn, 40), 9.245917333032999, rel(1e-12)]]);
T('lever', '理想溶液の固相線・液相線と PCHIP', '② 固相と液相で各成分の化学ポテンシャルが等しい式(ΔHf Cu 13.26・Ni 17.48 kJ/mol、Tm Cu 1084.62・Ni 1455 ℃、Ω = 0、1300 ℃)を scipy の fsolve で解いた値と、scipy の PchipInterpolator の値(check_testcalc2.py)', m => {
  const r = m.solveReg(1300 + 273.15, { HA: 13260, TA: 1084.62 + 273.15, HB: 17480, TB: 1455 + 273.15 }), f = m.pchip([[0, 0], [1, 1], [2, 4], [3, 3], [5, 0]]);
  return [['固相の x_Ni', r[0], 0.6069948871573703, rel(1e-9)], ['液相の x_Ni', r[1], 0.5384295991830507, rel(1e-9)], ['融点より上では解なし', m.solveReg(1500 + 273.15, { HA: 13260, TA: 1357.77, HB: 17480, TB: 1728.15 }), null, EQ],
    ['PCHIP(0.5)', f(0.5), 0.3125, rel(1e-12)], ['PCHIP(1.5)', f(1.5), 2.6875, rel(1e-12)], ['PCHIP(2.5)', f(2.5), 3.6467391304347827, rel(1e-12)], ['PCHIP(4)', f(4), 1.664855072463768, rel(1e-12)],
    ['てこの規則', m.lever(40, 11, 99), 59 / 88, rel(1e-12)], ['範囲の外は null', m.locate('pbsn', 40, 400), null, EQ]];
});

// =====================================================================
// xtal(結晶構造ビューア): 単位格子の値、すき間、面密度・線密度、すべり系、六方最密
// =====================================================================
T('xtal', '単位格子の原子数・配位数・充填率', '① Callister & Rethwisch 9th ed. 3 章(SC 1・6・π/6、BCC 2・8・√3π/8、FCC 4・12・√2π/6、HCP(c/a = √(8/3))6・12・√2π/6)とダイヤモンド構造(8・4・√3π/16)。原子半径は a の単位で BCC √3/4、FCC √2/4', m => {
  const c = st => m.cellInfo(st);
  return [['SC の原子数', c('sc').n, 1, rel(1e-12)], ['SC の配位数', c('sc').cn, 6, EQ], ['SC の充填率', c('sc').apf, Math.PI / 6, rel(1e-12)],
    ['BCC の原子数', c('bcc').n, 2, rel(1e-12)], ['BCC の配位数', c('bcc').cn, 8, EQ], ['BCC の充填率', c('bcc').apf, Math.sqrt(3) * Math.PI / 8, rel(1e-12)], ['BCC の r/a', c('bcc').r, Math.sqrt(3) / 4, rel(1e-12)],
    ['FCC の原子数', c('fcc').n, 4, rel(1e-12)], ['FCC の配位数', c('fcc').cn, 12, EQ], ['FCC の充填率', c('fcc').apf, Math.SQRT2 * Math.PI / 6, rel(1e-12)], ['FCC の r/a', c('fcc').r, Math.SQRT2 / 4, rel(1e-12)],
    ['ダイヤモンドの原子数', c('diamond').n, 8, rel(1e-12)], ['ダイヤモンドの配位数', c('diamond').cn, 4, EQ], ['ダイヤモンドの充填率', c('diamond').apf, Math.sqrt(3) * Math.PI / 16, rel(1e-12)],
    ['HCP の原子数', c('hcp').n, 6, rel(1e-12)], ['HCP の充填率', c('hcp').apf, Math.SQRT2 * Math.PI / 6, rel(1e-12)]];
});
T('xtal', 'すき間の数と入る球の半径比', '① すき間の幾何(FCC・HCP の八面体 √2 − 1 = 0.414・四面体 √(3/2) − 1 = 0.225、原子 1 個あたり 1 個と 2 個。BCC の八面体 2/√3 − 1 = 0.155(短い方)・四面体 √(5/3) − 1 = 0.291、単位格子に 6 個と 12 個。SC の立方体のすき間 √3 − 1)', m => {
  const v = (st, k) => m.voidInfo(st, k);
  return [['FCC 八面体の比', v('fcc', 'oct').ratio, Math.SQRT2 - 1, rel(1e-12)], ['FCC 八面体の数', v('fcc', 'oct').n, 4, rel(1e-12)], ['FCC 四面体の比', v('fcc', 'tet').ratio, Math.sqrt(1.5) - 1, rel(1e-12)], ['FCC 四面体の数', v('fcc', 'tet').n, 8, rel(1e-12)],
    ['BCC 八面体の比', v('bcc', 'oct').ratio, 2 / Math.sqrt(3) - 1, rel(1e-12)], ['BCC 八面体の数', v('bcc', 'oct').n, 6, rel(1e-12)], ['BCC 四面体の比', v('bcc', 'tet').ratio, Math.sqrt(5 / 3) - 1, rel(1e-12)], ['BCC 四面体の数', v('bcc', 'tet').n, 12, rel(1e-12)],
    ['HCP 八面体は原子 1 個に 1 個', v('hcp', 'oct').perAtom, 1, rel(1e-12)], ['HCP 四面体は原子 1 個に 2 個', v('hcp', 'tet').perAtom, 2, rel(1e-12)], ['SC 立方体のすき間の比', v('sc', 'cube').ratio, Math.sqrt(3) - 1, rel(1e-12)]];
});
T('xtal', '面密度と線密度(a の単位)', '① Callister & Rethwisch 9th ed. 3 章の面密度・線密度の例題の考え方(FCC (100) 2/a²、(110) √2/a²、(111) 4/(√3a²)、BCC (100) 1/a²、(110) √2/a²、(111) は面の間隔が a/(2√3) なので 1/(√3a²)。線密度 FCC [110] √2/a、[100] 1/a、BCC [111] 2/(√3a))', m => {
  const p = (st, h) => m.planeInfo(st, h).pd, l = (st, u) => m.lineInfo(st, u).ld;
  return [['FCC (100)', p('fcc', [1, 0, 0]), 2, rel(1e-12)], ['FCC (110)', p('fcc', [1, 1, 0]), Math.SQRT2, rel(1e-12)], ['FCC (111)', p('fcc', [1, 1, 1]), 4 / Math.sqrt(3), rel(1e-12)],
    ['BCC (100)', p('bcc', [1, 0, 0]), 1, rel(1e-12)], ['BCC (110)', p('bcc', [1, 1, 0]), Math.SQRT2, rel(1e-12)], ['BCC (111)', p('bcc', [1, 1, 1]), 1 / Math.sqrt(3), rel(1e-12)],
    ['FCC [110]', l('fcc', [1, 1, 0]), Math.SQRT2, rel(1e-12)], ['FCC [100]', l('fcc', [1, 0, 0]), 1, rel(1e-12)], ['BCC [111]', l('bcc', [1, 1, 1]), 2 / Math.sqrt(3), rel(1e-12)],
    ['(000) は null', m.planeInfo('fcc', [0, 0, 0]), null, EQ], ['[000] は null', m.lineInfo('fcc', [0, 0, 0]), null, EQ]];
});
T('xtal', 'すべり系と六方最密の面', '① Callister & Rethwisch 9th ed. 表 7.1(FCC {111}⟨110⟩ と BCC {110}⟨111⟩ はどちらも 12 のすべり系)。HCP の底面は面密度 2/(√3a²)、充填率 π/(2√3) = 0.9069', m => [
  ['FCC のすべり系の数', m.SLIP.fcc.length, 12, EQ], ['BCC のすべり系の数', m.SLIP.bcc.length, 12, EQ], ['FCC (111)[1−10]', m.slipFamily('fcc', [1, 1, 1], [1, -1, 0]), 'fcc', EQ],
  ['BCC (110)[1−11]', m.slipFamily('bcc', [1, 1, 0], [1, -1, 1]), 'bcc011', EQ], ['面の中にない方向は null', m.slipFamily('fcc', [1, 1, 1], [1, 0, 0]), null, EQ],
  ['HCP 底面の面密度', m.hcpPlaneInfo('basal', m.IDEAL_CA).pd, 2 / Math.sqrt(3), rel(1e-12)], ['HCP 底面の充填率', m.hcpPlaneInfo('basal', m.IDEAL_CA).ppf, Math.PI / (2 * Math.sqrt(3)), rel(1e-12)]]);

// =====================================================================
// eng(電子回路の計算の共通部品): E 系列と SI 接頭辞の表示
// =====================================================================
T('eng', '抵抗の E 系列', '① IEC 60063 の E24・E12 の値(1.0 1.1 1.2 1.3 1.5 1.6 1.8 2.0 2.2 2.4 2.7 3.0 3.3 3.6 3.9 4.3 4.7 5.1 5.6 6.2 6.8 7.5 8.2 9.1)。eUp は x 以上で最小、eNear は対数で最も近い値', m => [
  ['E24 の数', m.E24.length, 24, EQ], ['E24 の 4.3・5.1', `${m.E24[15]} ${m.E24[17]}`, '4.3 5.1', EQ], ['E12 の数', m.E12.length, 12, EQ],
  ['4.5 kΩ 以上の E24', m.eUp(4500), 4700, EQ], ['5.0 kΩ に最も近い E24', m.eNear(5000), 5100, EQ], ['1.5 kΩ に最も近い E12', m.eNear(1500, m.E12), 1500, EQ], ['ちょうど 1 kΩ', m.eUp(1000), 1000, EQ],
  ['9.5 Ω 以上の E24 は次の桁', m.eUp(9.5), 10, EQ], ['0 は NaN', m.eUp(0), NaN, EQ], ['負は NaN', m.eNear(-1), NaN, EQ]]);
T('eng', 'SI 接頭辞と指数の表示', '① SI 文書(第 9 版)の接頭辞(k = 10³、M = 10⁶、µ = 10⁻⁶ など)。丸めて 1000 になるときは次の接頭辞、負はマイナス記号「−」(関数の決まり)', m => [
  ['4700 Ω', m.si(4700, 'Ω'), '4.7 kΩ', EQ], ['999.6 Ω は 1 kΩ', m.si(999.6, 'Ω'), '1 kΩ', EQ], ['2.2 × 10⁻⁶ F', m.si(2.2e-6, 'F'), '2.2 µF', EQ], ['−0.0033 A', m.si(-0.0033, 'A'), '−3.3 mA', EQ],
  ['0', m.si(0, 'V'), '0 V', EQ], ['数でないとき', m.si(NaN, 'V'), '–', EQ], ['5.913 × 10⁻¹²', m.sci(5.913e-12), '5.913 × 10⁻¹²', EQ], ['指数 0 は数だけ', m.sci(3.2), '3.200', EQ]]);

T('eng', '数の表示(有効数字・マイナス記号)', '関数の決まり(既定の有効数字 3 桁、英語の桁区切り、負はマイナス記号「−」、−0 は「0」、数でないときは「–」)', m => [
  ['1234567', m.num(1234567), '1,230,000', EQ], ['0.012345(4 桁)', m.num(0.012345, 4), '0.01235', EQ], ['−0.0001', m.num(-0.0001), '−0.0001', EQ], ['−0', m.num(-0), '0', EQ], ['NaN', m.num(NaN), '–', EQ]]);

// =====================================================================
// ptable(材料のための周期表): 周期表の位置と、格子定数から出した密度・半径・充填率
// =====================================================================
T('ptable', '周期表の位置', '① IUPAC の周期表(18 族の長周期型。Fe は 4 周期 8 族、Au は 6 周期 11 族、Hf は 6 周期 4 族、ランタノイドは下の段)', m => [
  ['H', m.pos(1).join(','), '1,1', EQ], ['He', m.pos(2).join(','), '1,18', EQ], ['B', m.pos(5).join(','), '2,13', EQ], ['Al', m.pos(13).join(','), '3,13', EQ], ['Fe', m.pos(26).join(','), '4,8', EQ],
  ['Ag', m.pos(47).join(','), '5,11', EQ], ['Ba', m.pos(56).join(','), '6,2', EQ], ['La は下の段', m.pos(57).join(','), '8,3', EQ], ['Hf', m.pos(72).join(','), '6,4', EQ], ['Au', m.pos(79).join(','), '6,11', EQ]]);
T('ptable', '格子定数から出した密度・原子間距離の半分・充填率', '② x = nM/(N_A a³)(原子量は CIAAW の標準原子量 Fe 55.845・Cu 63.546・Al 26.982・W 183.84、a は表の値)を check_testcalc2.py で。h は BCC √3a/4・FCC √2a/4(pm)、f は ① BCC 0.68・FCC 0.74(表の桁)', m => {
  const e = s => m.EL.find(x => x.s === s);
  return [['Fe の x', e('Fe').x, 7.874220103783387, abs(0.0005)], ['Cu の x', e('Cu').x, 8.937510696804765, abs(0.0005)], ['Al の x', e('Al').x, 2.6986517450965426, abs(0.0005)], ['W の x', e('W').x, 19.253763523041275, abs(0.005)],
    ['Fe の h', e('Fe').h, e('Fe').a * 1000 * Math.sqrt(3) / 4, abs(0.05)], ['Cu の h', e('Cu').h, e('Cu').a * 1000 * Math.SQRT2 / 4, abs(0.05)], ['Fe の f', e('Fe').f, 0.68, EQ], ['Cu の f', e('Cu').f, 0.74, EQ]];
});
T('ptable', '境目: 図の濃淡の段', '関数の決まり(区切りの値以上で次の段。密度は 2・4・7・10・15 g/cm³、気体と範囲で示したヤング率は塗らない、値なしは −1)。Fe のヤング率 211 GPa は ① WebElements の値', m => {
  const e = s => m.EL.find(x => x.s === s);
  return [['気体の密度は塗らない', m.valueOf(e('N'), 'rho'), undefined, EQ], ['密度 7.87 は 4 段目(7〜10)', m.binOf(7.87, 'rho'), 3, EQ], ['ちょうど 7 も 4 段目', m.binOf(7, 'rho'), 3, EQ],
    ['2 未満は 1 段目', m.binOf(0.53, 'rho'), 0, EQ], ['値なしは −1', m.binOf(undefined, 'rho'), -1, EQ], ['Fe のヤング率', m.valueOf(e('Fe'), 'E'), 211, EQ]];
});

// =====================================================================
// drill(計算ドリル): 種で決まる問題を作り、その答えをこのテストの中の式で別に出して比べる
// =====================================================================
// 問題の型と数値の範囲は data/drill.json。名前は問題の数値に関係しないので、鍵をそのまま返すものにする
const DRILL = JSON.parse(readFileSync(new URL('../data/drill.json', import.meta.url), 'utf8'));
const NAME = new Proxy({}, { get: (_, k) => String(k) });
const DX = { D: DRILL.data, N: { el: NAME, mat: NAME, x: NAME, diff: NAME } };
const SEEDS = Array.from({ length: 20 }, (_, i) => i + 1);
// 誤差関数(マクローリン級数、|x| ≤ 3 で使う)と erfc の逆(二分法)。浸炭の問題の z のために、拡散のツールとは別に書く
const erfS = x => { let t = x, s = x; for (let n = 1; n < 120; n++) { t *= -x * x / n; s += t / (2 * n + 1); } return 2 / Math.sqrt(Math.PI) * s; };
const ierfcS = p => { let lo = 0, hi = 3; for (let i = 0; i < 100; i++) { const mid = (lo + hi) / 2; if (1 - erfS(mid) > p) lo = mid; else hi = mid; } return (lo + hi) / 2; };
// Callister 9 章の Fe–Fe₃C と共晶系の点(wt%)、IUPAC の標準原子量
const FE = { P: 0.022, S: 0.76, CM: 6.70 }, EUT = { pbsn: [18.3, 61.9, 97.8], agcu: [8.0, 71.9, 91.2], alsi: [1.65, 12.6, 100] };
const AW = { Cu: 63.546, Ni: 58.693, Pb: 207.2, Sn: 118.71, Al: 26.982, Si: 28.085, Ag: 107.87, Pt: 195.08 };
const AB = { cuni: ['Cu', 'Ni'], pbsn: ['Pb', 'Sn'], agcu: ['Cu', 'Ag'], alsi: ['Al', 'Si'], alcu: ['Al', 'Cu'], ptag: ['Pt', 'Ag'] };
const CK = c => c + 273.15, Rg = DRILL.data.c.R;
const ANS = {
  'd-spacing': v => v.a / Math.hypot(v.h, v.k, v.l),
  'bragg-angle': v => 2 * Math.asin(v.lam * Math.hypot(v.h, v.k, v.l) / (2 * v.a)) * 180 / Math.PI,
  'lattice-from-peak': v => v.lam / (2 * Math.sin(v.tt / 2 * Math.PI / 180)) * Math.hypot(v.h, v.k, v.l),
  density: v => (v.st === 'bcc' ? 2 : 4) * DRILL.data.aw[v.mat] / (DRILL.data.c.NA * (v.a * 1e-7) ** 3),
  'atomic-radius': v => (v.v === 'a2r' ? v.a * (v.st === 'bcc' ? Math.sqrt(3) : Math.SQRT2) / 4 : v.rr * (v.st === 'bcc' ? 4 / Math.sqrt(3) : 2 * Math.SQRT2)),
  'planar-density': v => ({ bcc: { 100: 1, 110: 2 / Math.SQRT2, 111: 0.5 / (Math.sqrt(3) / 2) }, fcc: { 100: 2, 110: 2 / Math.SQRT2, 111: 2 / (Math.sqrt(3) / 2) } })[v.st][v.pl] / v.a ** 2,
  proeutectoid: v => { const w = v.v.startsWith('hypo') ? (FE.S - v.c0) / (FE.S - FE.P) : (v.c0 - FE.S) / (FE.CM - FE.S); return v.v.endsWith('pro') ? w : 1 - w; },
  eutectic: v => {
    const [ca, ce, cb] = EUT[v.sys], hypo = v.v.startsWith('hypo'), we = hypo ? (v.c0 - ca) / (ce - ca) : (cb - v.c0) / (cb - ce);
    return { eut: we, prim: 1 - we, phase: hypo ? (cb - v.c0) / (cb - ca) : (v.c0 - ca) / (cb - ca) }[v.v.split('-')[1]];
  },
  'wt-at': v => { const [A, B] = AB[v.sys]; return v.v === 'w2a' ? 100 * (v.x / AW[B]) / (v.x / AW[B] + (100 - v.x) / AW[A]) : 100 * v.x * AW[B] / (v.x * AW[B] + (100 - v.x) * AW[A]); },
  arrhenius: v => v.D0 * Math.exp(-v.Q * 1e3 / (Rg * CK(v.tc))),
  'carb-depth': v => 2 * ierfcS((v.cx - v.c0) / (v.cs - v.c0)) * Math.sqrt(v.D0 * Math.exp(-v.Q * 1e3 / (Rg * CK(v.tc))) * v.hours * 3600) * 1e3,
  'carb-time': v => (v.x / 1e3 / (2 * ierfcS((v.cx - v.c0) / (v.cs - v.c0)))) ** 2 / (v.D0 * Math.exp(-v.Q * 1e3 / (Rg * CK(v.tc)))) / 3600,
  'time-temp': v => v.h1 * Math.exp(v.Q * 1e3 / Rg * (1 / CK(v.t2c) - 1 / CK(v.t1c))),
  'true-stress': v => (v.v === 'stress' ? v.s * (1 + v.e) : Math.log(1 + v.e)),
  'kic-crack': v => (v.v === 'internal' ? 2 : 1) * (v.K / (v.Y * v.s)) ** 2 / Math.PI * 1e3,
  'thermal-stress': v => { const k = v.E * 1e3 * v.al * 1e-6; return v.v === 'stress' ? k * (v.t2 - v.t1) : v.t1 + v.sa / k; },
  rom: v => { const w = v.f / 100, vf = v.basis === 'mass' ? (w / v.rf) / (w / v.rf + (1 - w) / v.rm) : w; return vf * v.ef + (1 - vf) * v.em; },
  faraday: v => { const M = DRILL.data.aw[v.mat], F = DRILL.data.c.F; return v.v === 'mass' ? v.I * v.days * 86400 * M / (v.n * F) : v.i * 1e-6 * M / (v.n * F * v.d) * 365 * 86400 * 1e4; },
  'larson-miller': v => { const C = DRILL.data.c.LMC, P = CK(v.t1c) * (C + Math.log10(v.h1)); return v.v === 'time' ? 10 ** (P / CK(v.t2c) - C) : P / (C + Math.log10(v.h2)) - 273.15; },
  vacancy: v => DRILL.data.c.NA * v.d / DRILL.data.aw[v.mat] * 1e6 * Math.exp(-v.Qv / (DRILL.data.c.kB * CK(v.tc))),
  'hall-petch': v => { const x = d => 1 / Math.sqrt(d * 1e-6), k = (v.s1 - v.s2) / (x(v.d1) - x(v.d2)); return v.s1 + k * (x(v.d3) - x(v.d1)); },
  schmid: v => {
    const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], n = a => Math.sqrt(dot(a, a));
    const mm = Math.abs(dot(v.ax, v.pl)) / (n(v.ax) * n(v.pl)) * Math.abs(dot(v.ax, v.b)) / (n(v.ax) * n(v.b));
    return v.v === 'tau' ? v.s * mm : v.tc / mm;
  },
  'kic-stress': v => v.K / (v.Y * Math.sqrt(Math.PI * v.a / 1e3)),
  'film-stress': v => v.E * 1e3 / (1 - v.nu) * (v.af - v.as) * 1e-6 * (v.t1 - v.t2),
  bimetal: v => {
    // σ1A1 + σ2A2 = 0 と α1ΔT + σ1/E1 = α2ΔT + σ2/E2 の連立1次方程式をクラメルの公式で
    const E1 = v.E1 * 1e3, E2 = v.E2 * 1e3, r = (v.a2 - v.a1) * 1e-6 * v.dT, det = v.A1 * (-1 / E2) - v.A2 / E1;
    const s1 = (0 * (-1 / E2) - v.A2 * r) / det, s2 = (v.A1 * r - 0 / E1) / det;
    return Math.abs((v.v === 'hi') === (v.a1 > v.a2) ? s1 : s2);
  },
  'rom-trans': v => { const w = v.f / 100, vf = v.basis === 'mass' ? (w / v.rf) / (w / v.rf + (1 - w) / v.rm) : w; return 1 / (vf / v.ef + (1 - vf) / v.em); },
  semiconductor: v => { const s = v.Nd * 1e6 * DRILL.data.c.e * v.mu * 1e-4; return v.v === 'rho' ? 1 / s : s; },
  'wire-resistance': v => { const c = DRILL.data.cond[v.cond]; return c.r20 * (1 + c.aR * (v.tc - 20)) * v.L / (Math.PI * (v.d / 1e3) ** 2 / 4); },
};
const drillChecks = (m, ids, tol) => ids.flatMap(id => {
  const T0 = DRILL.types.find(t => t.id === id);
  return SEEDS.map(seed => { const p = m.makeProblem(T0, seed, DX); return [`${id} 種 ${seed}(${JSON.stringify(p.vals)})`, p.sol.ans, ANS[id](p.vals), tol]; });
});
T('drill', '種つきの乱数(mulberry32)', '② mulberry32 と FNV-1a の種の混ぜ方を python で別に書いた値(check_testcalc2.py、型 d-spacing の種 1・2・3 の最初の 3 つ)。同じ種なら同じ問題', m => {
  const r = s => { const g = m.makeRng(s, 'd-spacing'); return [g.f(), g.f(), g.f()]; };
  const T0 = DRILL.types.find(t => t.id === 'density');
  return [['種 1', r(1).join(' '), [0.6574787879362702, 0.044178798561915755, 0.3103187601082027].join(' '), EQ], ['種 2', r(2).join(' '), [0.1472165088634938, 0.7230713723693043, 0.7788771432824433].join(' '), EQ],
    ['種 3', r(3).join(' '), [0.6189667207654566, 0.890563829569146, 0.540736568858847].join(' '), EQ],
    ['同じ種の問題は同じ', JSON.stringify(m.makeProblem(T0, 7, DX).vals), JSON.stringify(m.makeProblem(T0, 7, DX).vals), EQ]];
});
T('drill', '結晶の問題の答え(種 1〜20)', '① Callister 3 章の式(立方晶の d = a/√(h² + k² + l²)、ブラッグの式 λ = 2d sinθ、理論密度 ρ = nA/(V_C N_A)、BCC 4r = √3a・FCC 4r = √2a、面密度)をこのテストの中で書き、問題の数値から出した値。問題文の定数(N_A・原子量)は data/drill.json の値', m =>
  drillChecks(m, ['d-spacing', 'bragg-angle', 'lattice-from-peak', 'density', 'atomic-radius', 'planar-density'], rel(1e-12)));
T('drill', '状態図の問題の答え(種 1〜20)', '① Callister 9 章のてこの規則と点(Fe–Fe₃C の 0.022・0.76・6.70 wt% C、共晶 Pb–Sn 18.3・61.9・97.8、Cu–Ag 8.0・71.9・91.2 wt%)、Al–Si の共晶(1.65・12.6 wt% Si、ASM の Al–Si 状態図の定番の値。Si 側は純 Si の 100)と、IUPAC の標準原子量での wt% ↔ at% をこのテストの中で', m =>
  drillChecks(m, ['proeutectoid', 'eutectic', 'wt-at'], rel(1e-12)));
T('drill', '拡散の問題の答え(種 1〜20)', '① Callister 5 章の式(D = D₀ exp(−Q/RT)、一定表面濃度の (Cx − C₀)/(Cs − C₀) = erfc(x/2√(Dt))、同じ Dt になる時間)をこのテストの中で。erfc の逆は級数と二分法で別に書く。② check_testcalc2.py の scipy の erfcinv でも種 1〜5 が合う', m =>
  drillChecks(m, ['arrhenius', 'carb-depth', 'carb-time', 'time-temp'], rel(1e-9)));
T('drill', '機械・熱・複合材・電気化学・クリープの問題の答え(種 1〜20)', '① 標準の式(真応力 σ(1 + ε)・真ひずみ ln(1 + ε)、Hall–Petch、Schmid 因子 cosφ cosλ、破壊靱性 σ = K/(Y√(πa))・a = (K/(Yσ))²/π、拘束の熱応力 EαΔT、薄膜 Eα差ΔT/(1 − ν)、2本の棒のつり合い、複合則 Vf Ef + Vm Em と逆複合則(質量率は体積率に直す)、ファラデーの法則 m = ItM/(nF)、Larson–Miller P = T(C + log t)、空孔 N exp(−Qv/kT)、σ = neμ、R = ρ(1 + αΔT)L/A)をこのテストの中で。問題文の定数は data/drill.json の値', m =>
  drillChecks(m, ['true-stress', 'hall-petch', 'schmid', 'kic-stress', 'kic-crack', 'thermal-stress', 'film-stress', 'bimetal', 'rom', 'rom-trans', 'faraday', 'larson-miller', 'vacancy', 'semiconductor', 'wire-resistance'], rel(1e-9)));
T('drill', '答えの判定と入力の読み取り', '関数の決まり(相対の許容差で比べる、単位は換算してから。よくある間違いの値・10 の累乗のずれ・符号を見分ける。2,3 × 10^-5 などを読む)。温度の換算は ① SI(T/K = t/℃ + 273.15)', m => {
  const sol = { ans: 0.2, fam: 'len', unit: 'nm', alt: { half: 0.1 } };
  return [['同じ値', m.judge(sol, 0.2, 'nm', 0.01).ok, true, EQ], ['Å で入れても同じ', m.judge(sol, 2, 'Å', 0.01).ok, true, EQ], ['1 % の中', m.judge(sol, 0.2019, 'nm', 0.01).ok, true, EQ], ['1 % の外', m.judge(sol, 0.2021, 'nm', 0.01).ok, false, EQ],
    ['よくある間違い', m.judge(sol, 0.1, 'nm', 0.01).hint?.id, 'half', EQ], ['100 倍', m.judge(sol, 20, 'nm', 0.01).hint?.n, 2, EQ], ['符号', m.judge(sol, -0.2, 'nm', 0.01).hint?.kind, 'sign', EQ],
    ['25 ℃ → K', m.convert('temp', 25, '°C', 'K'), 298.15, rel(1e-12)], ['2 h → min', m.convert('time', 2, 'h', 'min'), 120, rel(1e-12)],
    ['「2,3 × 10^-5 m2/s」', m.parseAnswer('2,3 × 10^-5 m2/s', 'diff', 'en')?.v, 2.3e-5, rel(1e-12)], ['その単位', m.parseAnswer('2,3 × 10^-5 m2/s', 'diff', 'en')?.u, 'm²/s', EQ],
    ['ドイツ語の「1.234,5」', m.parseAnswer('1.234,5', 'len', 'de')?.v, 1234.5, rel(1e-12)], ['英語の「1,234」は桁区切り', m.parseAnswer('1,234', 'len', 'en')?.v, 1234, rel(1e-12)], ['数でない', m.parseAnswer('abc', 'len', 'en'), null, EQ]];
});

// =====================================================================
// 実行
// =====================================================================
const same = (a, b) => (Number.isNaN(a) && Number.isNaN(b)) || Object.is(a, b) || a === b;
const fmt = v => (typeof v === 'number' && Number.isFinite(v) ? String(Number(v.toPrecision(10))) : typeof v === 'string' ? `"${v}"` : String(v));
const tolText = t => (t === EQ ? '同じ値' : t.rel != null ? `相対 ${t.rel}` : `絶対 ${t.abs}`);
const fails = [];
for (const c of cases) {
  const mod = tools[c.tool];
  if (mod instanceof Error) { fails.push(`${c.tool} / ${c.name}: src/js/${c.tool}.js を import できません(${mod.message})`); continue; }
  let checks;
  try { checks = c.run(mod); } catch (e) { fails.push(`${c.tool} / ${c.name}: 例外 ${e.message}`); continue; }
  for (const [label, got, want, tol] of checks) {
    let ok;
    if (tol === EQ) ok = same(got, want);
    else if (typeof got !== 'number' || !Number.isFinite(got)) ok = false;
    else ok = Math.abs(got - want) <= (tol.rel != null ? tol.rel * Math.abs(want) : tol.abs);
    if (!ok) fails.push(`${c.tool} / ${c.name} / ${label}: 期待値 ${fmt(want)}、実際の値 ${fmt(got)}、許容差 ${tolText(tol)}\n  出どころ: ${c.src}`);
  }
}
const nTools = new Set(cases.map(c => c.tool)).size;
for (const f of fails) console.error(`誤り: ${f}`);
if (fails.length) {
  console.error(`計算のテスト ${cases.length} 件(ツール ${nTools} 個)のうち、合わない項目が ${fails.length} 個あります`);
  process.exit(1);
}
console.log(`OK: 計算のテスト ${cases.length} 件(ツール ${nTools} 個)`);
