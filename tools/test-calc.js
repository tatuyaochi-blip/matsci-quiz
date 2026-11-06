// 計算ツールの常設テスト。src/js/*.js から export された計算の関数(DOM に触れないもの)を呼び、
// 教科書・規格・データ表の値(①)か、出典の式を python3 で別に計算した値(②)と比べる。
// ②の python は作業の記録(リポジトリの外)に残している。JS の出力を写した期待値は置かない。
// 使い方: node tools/test-calc.js(全部合えば終了コード 0、1件でも違えば違ったものを出して 1)
//
// 外しているもの(import すると落ちる): fe-c・ashby・diffusion・composite・xrd・thermal・lever・xtal・eng・drill。
//   どれも eng.js の 2 行目(const lang = document.documentElement.lang)がモジュールの読み込みのときに document を読むので、
//   node では ReferenceError になる(drill は eng.js を使うモジュールを import している)。JS は変えずに外した。
//   eng.js が document のないときも読めるようになったら、ここに足す。
const tools = {};
for (const id of ['measure', 'ellingham', 'fatigue', 'corrosionrate', 'polymercalc', 'steelcolor', 'tensile', 'galvanic', 'micro', 'materials']) {
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
