// 材料選択ラボ(材料選びチャート、Ashby の方法)。1ページに5つのモード(タブ)を持つ:
//   chart   チャート: 性質を2つ選んだ両対数の図。Ashby の範囲(楕円・箱)と材料データ集の値(点)、群の囲み、
//           材料指標の線(傾きを選んで平行移動)と、線より良い側の材料の一覧
//   derive  指標を導く: 機能・制約・目的・自由変数を選ぶと、目的関数から自由変数を消して材料指標を途中の式つきで導く。
//           寸法と荷重を入れると、材料ごとの質量・費用・許せる圧力などを出す。導いた指標はチャートと選択にそのまま渡す
//   select  足切りと順位づけ: 条件(密度 ≤、E ≥、K_IC ≥、絶縁・導電 など)で絞り、残った材料を指標で並べる。
//           範囲の上下で順位がどれだけ動くか(最良・最悪の順位)。CSV の書き出し
//   compare 比べる: 2〜4 材料の性質と指標を並べ、比と横棒の図。材料データ集のカードへのリンク
//   practice 練習: 定番の選択問題。条件を入れて開くボタンと、答え(この表のデータで並べた上位)と理由
// データ: Ashby の範囲(下の MATS、44 材料。値と出典は review の sources.md、元は scripts/ashby_data.py)と、
// 材料データ集(/materials/ のページに埋め込まれた data/materials.json の値。必要になったときだけ読み込む)。
// 材料データ集の値はここに写さず、そのページから読む(値を二重に持たないため)。
// 式の導き方は M. F. Ashby, Materials Selection in Mechanical Design(5th ed., 2017)の指標の導き方と標準解に合わせる。
// 検算は scripts/check_ashby.py(python で独立に計算して突き合わせる)。純粋な計算の関数は export し、DOM の部分は form があるときだけ動かす
import { num, sci } from './eng.js';
import { toBase, unitOf } from './materials.js';

// =====================================================================
// データ(Ashby の範囲)
// =====================================================================
// 値は M. F. Ashby「Material property data for engineering materials」(5th ed., 2021, Ansys Granta EduPack の教材)の表の範囲。
// ρ・E・σf・K_IC は表 A2〜A4、κ・α は表 A6、価格 Cm は表 A2、T(Tm または Tg)は表 A5、電気抵抗率 ρe は表 A7。
// 表の誤植・欠けた行は、メーカーの技術資料などで確かめた値に置き換え、確かめられなかった値は null(図にも表にも出さない)。
// 単位: ρ g/cm³、E GPa、σf MPa、K_IC MPa·√m、κ W/(m·K)、α 10⁻⁶ K⁻¹、Cm USD/kg、T ℃、ρe µΩ·cm
// [id, 群の番号, [ρ], [E], [σf], [K_IC], [κ], [α], [Cm], [T], [ρe]](各 [最小, 最大])
export const MATS = [
  ["lcs",0,[7.8,7.9],[200,220],[250,400],[41,82],[49,54],[12,13],[0.52,0.58],[1470,1500],[15,20]],
  ["las",0,[7.8,7.9],[210,220],[400,1500],[14,200],[34,55],[11,14],[0.56,0.62],[1400,1500],[15,35]],
  ["ss",0,[7.6,8.1],[190,210],[170,1170],[62,150],[12,24],[13,20],[5.9,6.5],[1350,1400],[64,110]],
  ["gci",0,[7.1,7.3],[80,140],[140,420],[10,24],[40,72],[11,13],[0.45,0.5],[1100,1400],[62,86]],
  ["al",0,[2.5,2.9],[68,82],[30,500],[22,48],[76,240],[21,24],[2.1,2.3],[470,680],[3.8,6]],
  ["cu",0,[8.9,8.9],[110,150],[30,500],[30,90],[160,390],[17,18],[7.1,7.8],[980,1100],[1.7,5]],
  ["mg",0,[1.7,2],[42,47],[70,400],[12,18],[50,160],[25,28],[3.1,3.4],[450,650],[5.5,15]],
  ["ti",0,[4.4,4.8],[90,120],[250,1200],[14,120],[6.7,14],[7.9,11],[22,25],[1500,1700],[100,170]],
  ["ni",0,[8.8,9],[190,220],[70,1100],[80,110],[11,91],[12,14],[17,19],[1400,1500],[8,125]],
  ["pb",0,[10,11],[13,15],[8,14],[5,15],[22,36],[18,32],[6.9,7.6],[320,330],[15,22]],
  ["w",0,[10.8,20],[310,380],[530,800],[50,60],[100,140],[4,5.6],[51,57],[3200,3400],[10,14]],
  ["al2o3",1,[3.8,3.98],[340,390],[350,590],[3.3,4.8],[26,39],[7,7.9],[18,27],null,[1e20,1e22]],
  ["aln",1,[3.3,3.3],[300,350],[300,350],[2.5,3.4],[140,200],[4.9,5.5],[100,170],[2400,2500],[1e19,1e21]],
  ["sic",1,[3.1,3.2],[400,460],[400,610],[3,5.6],[80,130],[4,4.8],[15,21],[2200,2500],[1e9,1e12]],
  ["wc",1,[10.5,10.6],[630,700],[340,550],[2,3.8],[55,88],[5.2,7.1],[19,29],[2800,2900],[20,100]],
  ["brick",1,[1.6,2.1],[15,30],[5,14],[1,2],[0.46,0.73],[5,8],[0.62,1.7],[930,1200],[1e14,3e16]],
  ["concrete",1,[2.3,2.6],[15,25],[1,3],[0.35,0.45],[0.8,2.4],[6,13],[0.04,0.06],[930,1200],[1.9e12,1.9e13]],
  ["stone",1,[2,2.6],[20,60],[2,25],[0.7,1.4],[1.3,6],[3.7,6.3],[0.41,0.62],[1200,1400],[1e10,1e14]],
  ["sodalime",2,[2.4,2.5],[68,72],[30,35],[0.55,0.75],[0.7,1.3],[9,9.5],[1.4,1.7],[440,590],[7.9e17,7.9e18]],
  ["boro",2,[2.2,2.3],[61,64],[22,32],[0.5,0.7],[1,1.3],[3.2,4],[4.5,7.5],[450,600],[3.2e21,3.2e22]],
  ["silica",2,[2.2,2.2],[68,74],[45,160],[0.6,0.8],[1.3,1.5],[0.52,0.75],[6.2,10],[960,1600],[1e23,1e27]],
  ["pe",3,[0.94,0.96],[0.62,0.9],[18,29],[1.4,1.7],[0.4,0.44],[130,200],[2.1,2.3],[120,130],[3.3e22,3e24]],
  ["pp",3,[0.89,0.91],[0.9,1.6],[21,37],[3,4.5],[0.11,0.17],[120,180],[2.1,2.4],[150,170],[3.3e22,3e23]],
  ["ps",3,[1,1.1],[1.2,2.6],[29,56],[0.7,1.1],[0.12,0.13],[90,150],[2.8,3.5],[74,110],null],
  ["pvc",3,[1.3,1.6],[2.1,4.1],[35,52],[1.5,5.1],[0.15,0.29],[100,150],[2,2.2],[75,100],[1e20,1e22]],
  ["pmma",3,[1.2,1.2],[2.2,3.8],[54,72],[0.7,1.6],[0.084,0.25],[72,160],[2.7,3],[85,160],null],
  ["pa",3,[1.1,1.1],[2.6,3.2],[50,95],[2.2,5.6],[0.23,0.25],[140,150],[4.1,4.5],[44,56],[1.5e19,1.4e20]],
  ["pc",3,[1.1,1.2],[2,2.4],[59,70],[2.1,4.6],[0.19,0.22],[120,140],[4.6,5.1],[140,200],[1e20,1e21]],
  ["peek",3,[1.3,1.3],[3.8,4],[65,95],[2.7,4.3],[0.24,0.26],[72,190],[94,100],[140,200],[3.3e21,3e22]],
  ["ptfe",3,[2.1,2.2],[0.4,0.55],[15,25],[1.3,1.8],[0.24,0.26],[130,220],[15,17],[110,120],[3.3e23,3e24]],
  ["epoxy",3,[1.1,1.4],[2.4,3.1],[36,72],[0.4,2.2],[0.18,0.5],[58,120],[2.2,2.5],[67,170],[1e20,6e21]],
  ["iir",4,[0.9,0.92],[0.001,0.002],[2,3],[0.07,0.1],[0.08,0.1],[120,300],[3.9,4.5],[-73,-63],[1e15,1e16]],
  ["nr",4,[0.92,0.93],[0.0015,0.0025],[20,30],[0.15,0.25],[0.1,0.14],[150,450],[3.5,3.9],[-78,-63],[1e15,1e16]],
  ["cr",4,[1.2,1.3],[0.0007,0.002],[3.4,24],[0.1,0.3],[0.1,0.2],[185,250],[5.3,5.9],[-48,-43],[1e19,1e23]],
  ["sir",4,[1.3,1.8],[0.005,0.022],[2.4,5.5],[0.033,0.5],[0.3,1],[250,300],[11,13],[-120,-73],[3.2e19,1e22]],
  ["cfrp",5,[1.5,1.6],[69,150],[550,1100],[6.1,20],[1.3,2.6],[1,4],[37,42],null,[1.7e5,9.5e5]],
  ["gfrp",5,[1.8,2],[15,28],[110,190],[7,23],[0.4,0.55],[8.6,33],[24,34],null,[2.4e21,1.9e22]],
  ["ffoam",6,[0.038,0.07],[0.001,0.003],[0.02,0.3],[0.015,0.05],null,null,[2.6,2.9],[-110,-13],[1e20,1e23]],
  ["rfoam",6,[0.036,0.07],[0.023,0.08],[0.3,1.7],[0.002,0.02],null,null,[15,17],[67,170],[1e17,1e21]],
  ["rfoamh",6,[0.17,0.47],[0.2,0.48],[0.8,12],[0.024,0.09],null,null,[15,17],[67,170],[1e16,1e20]],
  ["cork",7,[0.12,0.24],[0.013,0.05],[0.3,1.5],[0.05,0.1],[0.035,0.048],[130,230],[2.7,13],null,[1e9,1e11]],
  ["paper",7,[0.48,0.86],[3,8.9],[15,34],[6,10],[0.06,0.17],[5,20],[0.99,1.2],[47,67],[2.1e14,7e14]],
  ["woodl",7,[0.6,0.8],[6,20],[30,70],[5,9],[0.31,0.38],[2,11],[0.66,0.73],[77,100],[1e13,1e15]],
  ["woodt",7,[0.6,0.8],[0.5,3],[2,6],[0.5,0.8],[0.15,0.19],[32,43],[0.66,0.73],[77,100],[6e13,2e14]],
];
// Ashby の材料 → 材料データ集の材料の id(カードへのリンク。data/materials.json の tl の ashby の行と同じ。検算で確かめる)
export const MDID = {"lcs":"low-carbon-steel","las":"low-alloy-steel","ss":"stainless-steel","gci":"gray-cast-iron","al":"al-alloys","cu":"cu-alloys","mg":"mg-alloys","ti":"ti-alloys","ni":"ni-alloys","pb":"pb-alloys","w":"w-alloys","al2o3":"alumina","aln":"aln","sic":"sic","wc":"wc","brick":"brick","concrete":"concrete","stone":"stone","sodalime":"soda-lime-glass","boro":"borosilicate-glass","silica":"silica-glass","pe":"pe","pp":"pp","ps":"ps","pvc":"pvc","pmma":"pmma","pa":"pa","pc":"pc","peek":"peek","ptfe":"ptfe","epoxy":"epoxy","iir":"iir","nr":"nr","cr":"cr-rubber","sir":"silicone-rubber","cfrp":"cfrp","gfrp":"gfrp","ffoam":"flexible-foam","rfoam":"rigid-foam","rfoamh":"rigid-foam-hd","cork":"cork","paper":"paper","woodl":"wood-along","woodt":"wood-across"};

// Ashby の範囲の材料ごとの値の出典(A = Ashby の資料。ほかは置き換え・確かめに使った資料。詳しくは review の sources.md)
export const ASRC = {"lcs":"A","las":"A","ss":"A+P","gci":"A","al":"A+L","cu":"A","mg":"A","ti":"A+T","ni":"A+I","pb":"A","w":"A","al2o3":"A+C+N","aln":"A","sic":"A","wc":"A","brick":"A","concrete":"A","stone":"A+R","sodalime":"A+W","boro":"A","silica":"A+Q","pe":"A","pp":"A","ps":"A","pvc":"A","pmma":"A","pa":"A","pc":"A","peek":"A","ptfe":"A","epoxy":"A","iir":"A","nr":"A","cr":"A+Z","sir":"A","cfrp":"A","gfrp":"A","ffoam":"A","rfoam":"A","rfoamh":"A","cork":"A","paper":"A","woodl":"A","woodt":"A"};
export const SRCN = {"C":"CoorsTek, Advanced Alumina","W":"Wikipedia, Soda–lime glass","Q":"Corning HPFS 7980","S":"SCHOTT BOROFLOAT 33","N":"NIST Structural Ceramics Database","L":"A. F. Liu, Mechanics and Mechanisms of Fracture (ASM, 2005)","P":"Aircraft Materials, 17-4PH (AMS 5643)","T":"ASM Aerospace Specification Metals, Ti-6Al-4V","I":"Special Metals, INCONEL alloy 718","R":"Natural Stone Institute, R-Value for Natural Stone","Z":"NETZSCH Polymers, CR"};

export const PROPS = ['rho', 'E', 's', 'K', 'k', 'a', 'price', 'T', 'res'];
// 図の軸にできる量 = c × Π 性質^指数(cv = Cm ρ、ea = E α)。単位は図の単位(T は K)
export const QTY = {
  rho: { rho: 1 }, E: { E: 1 }, s: { s: 1 }, K: { K: 1 }, k: { k: 1 }, a: { a: 1 }, price: { price: 1 }, T: { T: 1 }, res: { res: 1 },
  cv: { price: 1, rho: 1 },            // USD/kg × g/cm³ = USD/L
  ea: { c: 1e-3, E: 1, a: 1 },         // GPa × 10⁻⁶/K = 10⁻³ MPa/K
};
export const AXES = ['E', 's', 'K', 'k', 'a', 'rho', 'T', 'res', 'price', 'cv', 'ea'];
export const UNIT = { rho: 'g/cm³', E: 'GPa', s: 'MPa', K: 'MPa·√m', k: 'W/(m·K)', a: '10⁻⁶ K⁻¹', price: 'USD/kg', T: 'K', res: 'µΩ·cm', cv: 'USD/L', ea: 'MPa/K' };
export const SYM = { rho: 'ρ', E: 'E', s: 'σf', K: 'K_IC', k: 'κ', a: 'α', price: 'Cm', T: 'T', res: 'ρe', cv: 'Cm·ρ', ea: 'E·α' };
export const GROUPS = ['metal', 'ceramic', 'glass', 'polymer', 'elastomer', 'composite', 'foam', 'natural', 'fiber', 'other'];
// 材料データ集の種類 → 群(fiber は繊維、other は半導体と非金属の元素)
export const CLS2G = { metal: 0, alloy: 0, ceramic: 1, glass: 2, polymer: 3, elastomer: 4, composite: 5, foam: 6, natural: 7, fiber: 8, semi: 9, nonmetal: 9 };
const C2K = 273.15;

// Ashby の材料の性質の範囲(図の単位。T は ℃ から K に直す)
export function range(m, p) {
  const i = PROPS.indexOf(p);
  if (i < 0) return null;
  const r = m[2 + i];
  if (!r) return null;
  return p === 'T' ? [r[0] + C2K, r[1] + C2K] : r;
}
export const matById = id => MATS.find(m => m[0] === id);
// べき乗の積 c × Π P^e の、範囲の両端で取りうる最小 lo・最大 hi と、代表値 c(各範囲の相乗平均 = 対数の図で真ん中)
// get(p) は性質 p の [最小, 最大](なければ null)
export function powRange(get, ex) {
  const c0 = ex.c ?? 1;
  let lo = c0, hi = c0, c = c0;
  for (const [p, e] of Object.entries(ex)) {
    if (p === 'c' || e === 0) continue;
    const r = get(p);
    if (!r || !(r[0] > 0) || !(r[1] > 0)) return null;
    const [a, b] = e > 0 ? r : [r[1], r[0]];
    lo *= a ** e; hi *= b ** e; c *= Math.sqrt(r[0] * r[1]) ** e;
  }
  return { lo, hi, c };
}
export const qtyRange = (get, q) => powRange(get, QTY[q]);

// ---- 材料指標(最大にする量)。ex は指数、c は単位の換算の係数、ax は直線になる軸 [縦, 横]、v は線の既定の値 ----
export const INDEX = {
  e1: { ex: { E: 1, rho: -1 }, f: 'E/ρ', u: 'GPa/(g/cm³)', v: 25, ax: ['E', 'rho'] },
  e2: { ex: { E: 1 / 2, rho: -1 }, f: '√E/ρ', u: 'GPa^½/(g/cm³)', v: 3, ax: ['E', 'rho'] },
  e3: { ex: { E: 1 / 3, rho: -1 }, f: '∛E/ρ', u: 'GPa^⅓/(g/cm³)', v: 1.5, ax: ['E', 'rho'] },
  s1: { ex: { s: 1, rho: -1 }, f: 'σf/ρ', u: 'MPa/(g/cm³)', v: 100, ax: ['s', 'rho'] },
  s23: { ex: { s: 2 / 3, rho: -1 }, f: '∛(σf²)/ρ', u: 'MPa^⅔/(g/cm³)', v: 10, ax: ['s', 'rho'] },
  s12: { ex: { s: 1 / 2, rho: -1 }, f: '√σf/ρ', u: 'MPa^½/(g/cm³)', v: 5, ax: ['s', 'rho'] },
  ks: { ex: { K: 1, s: -1 }, f: 'K_IC/σf', u: '√m', v: 0.1, ax: ['K', 's'] },
  k2s: { ex: { K: 2, s: -1 }, f: 'K_IC²/σf', u: 'MPa·m', v: 10, ax: ['K', 's'] },
  ka: { ex: { k: 1, a: -1 }, f: 'κ/α', u: 'W/(m·K)/(10⁻⁶ K⁻¹)', v: 5, ax: ['k', 'a'] },
  sp: { ex: { c: 1e-3, s: 2, E: -1 }, f: 'σf²/E', u: 'MJ/m³', v: 1, ax: ['s', 'E'] },
  spm: { ex: { c: 1e-3, s: 2, E: -1, rho: -1 }, f: 'σf²/(Eρ)', u: 'kJ/kg', v: 1, ax: null },
  tsh: { ex: { c: 1e3, s: 1, E: -1, a: -1 }, f: 'σf/(Eα)', u: 'K', v: 300, ax: ['s', 'ea'] },
  ik: { ex: { k: -1 }, f: '1/κ', u: 'm·K/W', v: 2, ax: ['k', 'rho'] },
  ce1: { ex: { E: 1, price: -1, rho: -1 }, f: 'E/(Cm·ρ)', u: 'GPa/(USD/L)', v: 10, ax: ['E', 'cv'] },
  ce2: { ex: { E: 1 / 2, price: -1, rho: -1 }, f: '√E/(Cm·ρ)', u: 'GPa^½/(USD/L)', v: 1, ax: ['E', 'cv'] },
  ce3: { ex: { E: 1 / 3, price: -1, rho: -1 }, f: '∛E/(Cm·ρ)', u: 'GPa^⅓/(USD/L)', v: 1, ax: ['E', 'cv'] },
  cs1: { ex: { s: 1, price: -1, rho: -1 }, f: 'σf/(Cm·ρ)', u: 'MPa/(USD/L)', v: 20, ax: ['s', 'cv'] },
  cs23: { ex: { s: 2 / 3, price: -1, rho: -1 }, f: '∛(σf²)/(Cm·ρ)', u: 'MPa^⅔/(USD/L)', v: 3, ax: ['s', 'cv'] },
  cs12: { ex: { s: 1 / 2, price: -1, rho: -1 }, f: '√σf/(Cm·ρ)', u: 'MPa^½/(USD/L)', v: 3, ax: ['s', 'cv'] },
  spc: { ex: { s: 2, E: -1, price: -1, rho: -1 }, f: 'σf²/(E·Cm·ρ)', u: 'J/USD', v: 100, ax: null },
};
export const INDEX_KEYS = Object.keys(INDEX);
// 自由な線(idx = free)の傾きの選択肢
export const SLOPES = { p1: 1, p2: 2, p3: 3, h: 1 / 2, t: 1 / 3, m1: -1 };

// 指標(または自由な線 Y / X^n)の指数。free は図の軸の量から作る
export function exOf(key, x, y, sl = 1) {
  if (key !== 'free') return INDEX[key]?.ex ?? null;
  const vx = QTY[x], vy = QTY[y], ex = { c: (vy.c ?? 1) * (vx.c ?? 1) ** -sl };
  for (const [p, e] of Object.entries(vy)) if (p !== 'c') ex[p] = (ex[p] ?? 0) + e;
  for (const [p, e] of Object.entries(vx)) if (p !== 'c') ex[p] = (ex[p] ?? 0) - sl * e;
  return ex;
}
// 指標を図の軸で M = K · Y^a · X^b と書けるか。書ければ { a, b, K }(a = 0 なら縦の線)、書けなければ null
export function lineFit(key, x, y, sl = 1) {
  if (x === y) return null;
  if (key === 'free') return { a: 1, b: -sl, K: 1 };
  const I = INDEX[key];
  if (!I) return null;
  const vx = QTY[x], vy = QTY[y], m = I.ex;
  const ps = [...new Set([...Object.keys(m), ...Object.keys(vx), ...Object.keys(vy)])].filter(p => p !== 'c');
  let xx = 0, yy = 0, xy = 0, xm = 0, ym = 0;
  for (const p of ps) { const X = vx[p] ?? 0, Y = vy[p] ?? 0, M = m[p] ?? 0; xx += X * X; yy += Y * Y; xy += X * Y; xm += X * M; ym += Y * M; }
  const det = yy * xx - xy * xy;
  if (Math.abs(det) < 1e-12) return null;
  const a = (ym * xx - xm * xy) / det, b = (xm * yy - ym * xy) / det;
  for (const p of ps) if (Math.abs(a * (vy[p] ?? 0) + b * (vx[p] ?? 0) - (m[p] ?? 0)) > 1e-9) return null;
  if (Math.abs(a) < 1e-12 && Math.abs(b) < 1e-12) return null;
  const A = Math.abs(a) < 1e-12 ? 0 : a, B = Math.abs(b) < 1e-12 ? 0 : b;
  return { a: A, b: B, K: (m.c ?? 1) / ((vy.c ?? 1) ** A * (vx.c ?? 1) ** B) };
}
// 図の点(横 X・縦 Y)を通る線の指標の値、指標 v の線の横 X での縦の値、両対数の図での傾き
export const fitAt = (F, X, Y) => F.K * Y ** F.a * X ** F.b;
export const fitY = (F, v, X) => (v / (F.K * X ** F.b)) ** (1 / F.a);
export const fitX = (F, v) => (v / F.K) ** (1 / F.b); // 縦の線(a = 0)の位置
export const fitSlope = F => (F.a === 0 ? Infinity : -F.b / F.a);
// 指標 v に対する材料の位置: 'good'(代表値が線の良い側)、'cross'(範囲が線をまたぐ)、'bad'
export const side = (ix, v) => (ix.c >= v ? 'good' : ix.hi >= v ? 'cross' : 'bad');
// 前の版と同じ呼び方(Ashby の材料と指標の鍵): 代表値・範囲の端
export const indexOf = (m, key) => powRange(p => range(m, p), INDEX[key].ex);
export const fits = (key, x, y) => !!lineFit(key, x, y);
export const slope = (key, x, y) => fitSlope(lineFit(key, x, y));

// 範囲で与えられた値の順位の幅: 自分が上端・ほかが下端のときの最良の順位と、その逆の最悪の順位(大きいほど良い指標)。
// 端がちょうど同じ値(例: Ni の σf/ρ の上端 1100/8.8 と SiC の下端 400/3.2 はどちらも 125)は、浮動小数の誤差で順位が動かないよう同じとみなす
const gt = (a, b) => a > b * (1 + 1e-12);
export function rankSpan(list) {
  return list.map((p, i) => ({
    best: 1 + list.filter((q, j) => j !== i && gt(q.lo, p.hi)).length,
    worst: 1 + list.filter((q, j) => j !== i && gt(q.hi, p.lo)).length,
  }));
}

// ---- 足切りの条件(フォームの欄の名前、性質、向き)。T は ℃ で入れて K で比べる ----
export const SCREEN = [['sc_rho', 'rho', 'le'], ['sc_E', 'E', 'ge'], ['sc_s', 's', 'ge'], ['sc_K', 'K', 'ge'], ['sc_kmin', 'k', 'ge'], ['sc_kmax', 'k', 'le'], ['sc_a', 'a', 'le'], ['sc_T', 'T', 'ge'], ['sc_price', 'price', 'le']];
// 電気: 絶縁体は導電率 10⁻¹⁰ S/m 以下(ρe ≥ 10¹⁰ Ω·m = 10¹⁸ µΩ·cm)、導体は半導体の上限 10⁴ S/m 以上(ρe ≤ 10⁻⁴ Ω·m = 10⁴ µΩ·cm)。
// 区切りは Callister「Materials Science and Engineering」の導電率の区分(金属 約 10⁷、半導体 10⁻⁶〜10⁴、絶縁体 10⁻¹⁰〜10⁻²⁰ (Ω·m)⁻¹)
export const ELEC = { ins: ['res', 'ge', 1e18], cond: ['res', 'le', 1e4] };
// 1つの条件: 範囲の全部が満たす 'pass'、一部だけ 'part'、満たさない 'fail'、値がない 'na'
export function screenOne(r, op, v) {
  if (!r) return 'na';
  if (op === 'ge') return r[0] >= v ? 'pass' : r[1] >= v ? 'part' : 'fail';
  return r[1] <= v ? 'pass' : r[0] <= v ? 'part' : 'fail';
}
// 条件 conds = [{ p, op, v }] をまとめた結果(1つでも fail・na なら外す。part が1つでもあれば part)
export function screenAll(get, conds) {
  let st = 'pass';
  const each = conds.map(c => screenOne(get(c.p), c.op, c.v));
  for (const s of each) { if (s === 'fail' || s === 'na') return { st: s, each }; if (s === 'part') st = 'part'; }
  return { st, each };
}

// =====================================================================
// 指標を導く(Ashby の方法: 機能・制約・目的・自由変数)
// =====================================================================
// 選べる組み合わせ: 機能 → 制約 → { 目的, 自由変数 }
export const DVALID = {
  tie: { stiff: { obj: ['mass', 'cost'], free: ['area'] }, str: { obj: ['mass', 'cost'], free: ['area'] } },
  beam: { stiff: { obj: ['mass', 'cost'], free: ['sq', 'h'] }, str: { obj: ['mass', 'cost'], free: ['sq', 'h'] } },
  panel: { stiff: { obj: ['mass', 'cost'], free: ['t'] }, str: { obj: ['mass', 'cost'], free: ['t'] } },
  spring: { energy: { obj: ['vol', 'mass', 'cost'], free: ['size'] } },
  vessel: { yield: { obj: ['mass', 'cost'], free: ['t'] }, ybb: { obj: ['perf'], free: ['none'] }, lbb: { obj: ['perf'], free: ['none'] } },
  thermal: { shock: { obj: ['perf'], free: ['none'] }, distort: { obj: ['perf'], free: ['none'] } },
  wall: { steady: { obj: ['perf'], free: ['none'] } },
};
// 選んだ値を、選べる組み合わせに直す(合わない値は最初の選択肢へ)
export function dnorm(fun, con, obj, free) {
  const F = DVALID[fun] ?? DVALID.tie;
  fun = DVALID[fun] ? fun : 'tie';
  if (!F[con]) con = Object.keys(F)[0];
  const C = F[con];
  if (!C.obj.includes(obj)) obj = C.obj[0];
  if (!C.free.includes(free)) free = C.free[0];
  return { fun, con, obj, free };
}
// 支え方: 片持ち梁の先端の荷重(たわみ δ = FL³/(3EI)、最大の曲げモーメント FL)と、両端支持の中央の荷重(FL³/(48EI)、FL/4)
export const SUPPORT = { cant: { C1: 3, C2: 1 }, ss: { C1: 48, C2: 4 } };
// 性質の SI への倍率(ρ kg/m³、E・σf Pa、K_IC Pa·√m、α 1/K)
export const SI = { rho: 1e3, E: 1e9, s: 1e6, K: 1e6, k: 1, a: 1e-6, price: 1, T: 1, res: 1e-8 };
// 導いた結果: 指標の鍵 key と、材料ごとの出力 = G × Π(性質の SI の値)^q。
// inp は SI: L m、S N/m、F N、W m、U J、R m、p Pa、q W/m²、dT K、w m。sup は支え方。
// out.u は出力の単位、scale は SI から表示の単位への倍率、dir は 'low'(小さいほど良い)か 'high'
export function derive(sel, inp) {
  const { fun, con, obj, free } = dnorm(sel.fun, sel.con, sel.obj, sel.free);
  const { C1, C2 } = SUPPORT[inp.sup] ?? SUPPORT.cant;
  const { L, S, F, W, U, R, p, q, dT, w } = inp;
  const cost = obj === 'cost';
  const withCost = o => (cost ? { ...o, q: { ...o.q, price: 1 }, u: 'USD', scale: 1 } : o);
  let key, out;
  if (fun === 'tie') {
    if (con === 'stiff') { key = cost ? 'ce1' : 'e1'; out = { G: S * L ** 2, q: { rho: 1, E: -1 } }; }
    else { key = cost ? 'cs1' : 's1'; out = { G: F * L, q: { rho: 1, s: -1 } }; }
  } else if ((fun === 'beam' && free === 'h') || fun === 'panel') {
    if (con === 'stiff') { key = cost ? 'ce3' : 'e3'; out = { G: W * L * (12 * S * L ** 3 / (C1 * W)) ** (1 / 3), q: { rho: 1, E: -1 / 3 } }; }
    else { key = cost ? 'cs12' : 's12'; out = { G: W * L * (6 * F * L / (C2 * W)) ** (1 / 2), q: { rho: 1, s: -1 / 2 } }; }
  } else if (fun === 'beam') {
    if (con === 'stiff') { key = cost ? 'ce2' : 'e2'; out = { G: L * (12 * S * L ** 3 / C1) ** (1 / 2), q: { rho: 1, E: -1 / 2 } }; }
    else { key = cost ? 'cs23' : 's23'; out = { G: L * (6 * F * L / C2) ** (2 / 3), q: { rho: 1, s: -2 / 3 } }; }
  } else if (fun === 'spring') {
    if (obj === 'vol') { key = 'sp'; out = { G: 2 * U, q: { E: 1, s: -2 }, u: 'cm³', scale: 1e6, dir: 'low' }; }
    else { key = cost ? 'spc' : 'spm'; out = { G: 2 * U, q: { rho: 1, E: 1, s: -2 } }; }
  } else if (fun === 'vessel') {
    if (con === 'yield') { key = cost ? 'cs1' : 's1'; out = { G: 2 * Math.PI * p * R ** 3, q: { rho: 1, s: -1 } }; }
    else if (con === 'ybb') { key = 'ks'; out = { G: 1 / Math.PI, q: { K: 2, s: -2 }, u: 'mm', scale: 1e3, dir: 'high' }; }
    else { key = 'k2s'; out = { G: 4 / (Math.PI * R), q: { K: 2, s: -1 }, u: 'MPa', scale: 1e-6, dir: 'high' }; }
  } else if (fun === 'thermal') {
    if (con === 'shock') { key = 'tsh'; out = { G: 1, q: { s: 1, E: -1, a: -1 }, u: 'K', scale: 1, dir: 'high' }; }
    else { key = 'ka'; out = { G: q, q: { a: 1, k: -1 }, u: '1/m', scale: 1, dir: 'low' }; }
  } else {
    key = 'ik'; out = { G: dT / w, q: { k: 1 }, u: 'W/m²', scale: 1, dir: 'low' };
  }
  out = { u: 'kg', scale: 1, dir: 'low', ...out };
  if (cost) out = withCost(out);
  return { fun, con, obj, free, key, out };
}
// 出力が指標 M の何乗に比例するか(out.q の指数 ÷ 指標の指数。どの性質でも同じになることを確かめ、ならなければ null)
export function outPow(key, out) {
  const ex = INDEX[key]?.ex;
  if (!ex) return null;
  let n = null;
  for (const p of new Set([...Object.keys(ex), ...Object.keys(out.q)])) {
    if (p === 'c') continue;
    const a = out.q[p] ?? 0, b = ex[p] ?? 0;
    if (b === 0) { if (a !== 0) return null; continue; }
    const r = a / b;
    if (n === null) n = r; else if (Math.abs(r - n) > 1e-9) return null;
  }
  return n === null ? null : Math.round(n * 1e9) / 1e9;
}
// 材料ごとの出力(表示の単位)。get は図の単位の範囲。{ c, lo, hi }(lo ≤ hi)
export function outOf(get, out) {
  const r = powRange(p => { const x = get(p); return x ? [x[0] * SI[p], x[1] * SI[p]] : null; }, out.q);
  if (!r) return null;
  const k = out.G * out.scale;
  return { c: r.c * k, lo: r.lo * k, hi: r.hi * k };
}

// ---- 練習問題: 指標、群、足切りの条件(フォームの欄の名前と値)、条件の「一部だけ満たす」の扱い ----
export const PRACTICE = [
  { id: 'bike', idx: 'e2', grp: 'all', sc: { sc_K: 15 } },
  { id: 'spring', idx: 'sp', grp: 'metal', sc: {} },
  { id: 'insul', idx: 'ik', grp: 'all', sc: {} },
  { id: 'oven', idx: 'tsh', grp: 'glass', sc: {} },
  { id: 'vessel', idx: 'k2s', grp: 'all', sc: { sc_s: 100 } },
  { id: 'cheap', idx: 'ce2', grp: 'all', sc: {} },
];

// ---- 材料データ集の値(/materials/ のページの JSON)から、図と選択に使う点を作る ----
// 1つの材料・性質に値がいくつかあるときは、データ集の表と同じく最初の値を使う。ただし Ashby の範囲(このツールのデータ)だけの値は使わない
// (同じ値を二重に数えないため。その材料は Ashby の範囲として出る)。強さは降伏強さ → 引張強さ → 曲げ強さの順に選ぶ(圧縮・せん断は使わない)。
// T は融点(なければガラス転移温度)。単位は図の単位に直す
const SKIND = ['y', 't', 'f'];
export function mdItems(D) {
  const toTool = (p, x) => (p === 'E' ? x / 1e3 : p === 'a' ? x * 1e6 : p === 'res' ? x * 1e8 : x); // 群の基準の単位 → 図の単位
  const own = v => !v.t.includes('ashby'); // 'ashby' を含む値(ashby と thermal の両方など)は Ashby の範囲の写しなので使わない
  const items = [];
  for (const m of D.materials) {
    const vals = {};
    const take = (p, v) => {
      const u = unitOf(D, v);
      const r = v.v != null ? [v.v, v.v] : v.r ? v.r : null;
      if (!r || !r.every(Number.isFinite)) return;
      const b = r.map(x => toTool(p, toBase(x, u))).sort((a, c) => a - c);
      vals[p] = { r: b, s: v.s, k: v.k, g: v.g, single: v.v != null, src: v };
    };
    for (const p of ['rho', 'E', 'K', 'k', 'a', 'res']) { const v = m.v.find(x => x.p === p && own(x)); if (v) take(p, v); }
    for (const k of SKIND) { const v = m.v.find(x => x.p === 's' && x.k === k && own(x)); if (v) { take('s', v); break; } }
    const t = m.v.find(x => x.p === 'mp' && own(x) && (x.v != null || x.r)) ?? m.v.find(x => x.p === 'tg' && own(x) && (x.v != null || x.r));
    if (t) { take('T', t); vals.T.tk = t.p; }
    if (!Object.keys(vals).length) continue;
    const ash = m.tl.find(l => l.tool === 'ashby')?.q?.mat ?? null;
    // 銘柄・状態(vars)の値なら、その名前を添える(同じ名前の Ashby の範囲と見分けるため)
    const gs = Object.values(vals).map(v => v.g).filter(Boolean);
    const variant = gs.length ? m.vars?.[gs[0]] ?? null : null;
    items.push({ key: `m:${m.id}`, kind: 'md', id: m.id, g: CLS2G[m.cls] ?? 9, cls: m.cls, name: m.name, variant, ash, vals, get: p => vals[p]?.r ?? null });
  }
  return items;
}

// =====================================================================
// 画面
// =====================================================================
const form = typeof document !== 'undefined' ? document.getElementById('ashby-form') : null;
if (form) ui();

function ui() {
  const T = JSON.parse(form.dataset.text || '{}');
  const el = form.elements;
  const box = document.querySelector('[data-out="main"]');
  const home = document.documentElement.dataset.home ?? '/';
  const isCJK = /^(ja|zh|ko)/.test(document.documentElement.lang);
  const DEG = isCJK ? '℃' : '°C';
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const fill = (s, o = {}) => String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (k in o ? o[k] : m));
  const lab = n => el[n]?.closest('label');
  const optText = (name, v) => [...el[name].options].find(o => o.value === v)?.textContent ?? v;
  const par = s => (isCJK ? `(${s})` : ` (${s})`);
  const fin = Number.isFinite;
  const cap = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
  // 数の表示: 0.001〜10⁵ は有効数字3桁、それ以外は × 10ⁿ
  const fmt = (x, d = 3) => (!fin(x) ? '–' : Math.abs(x) >= 1e5 || (Math.abs(x) < 1e-3 && x !== 0) ? sci(x, d) : num(x, d));
  const rngT = (lo, hi, d = 3) => (Math.abs(hi - lo) <= Math.abs(hi) * 1e-9 ? fmt(lo, d) : `${fmt(lo, d)}–${fmt(hi, d)}`);
  const csvNum = v => (typeof v === 'number' ? (fin(v) ? String(Number(v.toPrecision(4))) : '') : `"${String(v ?? '').replace(/"/g, '""')}"`);
  const NAME = Object.fromEntries([...el.mat.options].map(o => [o.value, o.textContent]));
  const gname = g => T[`g_${GROUPS[g]}`] ?? GROUPS[g];
  // 性質の名前・記号・単位(T は ℃ で見せる欄と K で描く図がある)
  const pname = p => T[`p_${p}`] ?? p;
  const axisLabel = q => `${pname(q)} ${SYM[q]} (${UNIT[q]})`;

  // ---- 見た目(このツールだけの小さな CSS) ----
  const css = document.createElement('style');
  css.textContent = `
#ashby-form .dy-field[hidden], #ashby-form .ab-sub[hidden] { display: none !important; }
#ashby-form select { font-size: .9rem; padding-left: 6px; padding-right: 6px; }
#ashby-form .ab-wide { grid-column: 1 / -1; }
#ashby-form .ab-wide2 { grid-column: span 2; }
.ab-tabs { grid-column: 1 / -1; display: flex; flex-wrap: wrap; gap: 6px; margin: 0; }
.ab-tabs button { font: inherit; font-size: .88rem; font-weight: 600; padding: 8px 12px; border-radius: 999px; border: 1px solid var(--border); background: var(--bg); color: var(--text); cursor: pointer; min-height: 40px; }
.ab-tabs button[aria-pressed="true"] { background: var(--accent); border-color: var(--accent); color: var(--surface); }
.ab-sub { grid-column: 1 / -1; margin: 6px 0 -4px; font-size: .85rem; font-weight: 700; color: var(--text); border-top: 1px solid var(--border); padding-top: 10px; }
.ab-root { --ab-g0: #6b7a8f; --ab-g1: #d4a017; --ab-g2: #4aa3c4; --ab-g3: #e0702f; --ab-g4: #c94a6a; --ab-g5: #2a78d6; --ab-g6: #7d8b2e; --ab-g7: #8a5a2b; --ab-g8: #6250d6; --ab-g9: #199e70; }
@media (prefers-color-scheme: dark) { .ab-root { --ab-g0: #9aa8bb; --ab-g1: #e3b53a; --ab-g2: #63bad9; --ab-g3: #ef8a4f; --ab-g4: #e06d8b; --ab-g5: #5b9cf0; --ab-g6: #a4b545; --ab-g7: #c08a55; --ab-g8: #9085e9; --ab-g9: #3cc9a3; } }
.ab-root h3 { margin: 18px 0 8px; font-size: 1.02rem; }
.ab-root .fig { padding: 8px; }
.ab-root .fig svg { max-width: 640px; }
.ab-root .dy-stats { grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 8px; }
.ab-root .dy-stats dd { font-size: 1.05rem; overflow-wrap: anywhere; }
.ab-root .table-wrap { margin: .5rem 0; }
.ab-root .dy-table { font-size: .84rem; }
.ab-root .dy-table td, .ab-root .dy-table th { white-space: nowrap; }
.ab-root .dy-table th.l, .ab-root .dy-table td.l { text-align: left; white-space: normal; min-width: 7em; }
.ab-root .dy-table tr.cur { background: var(--accent-soft); }
.ab-root .dy-table tr.part td, .ab-root .dy-table tr.part th { color: var(--muted); }
.ab-warn { margin: 8px 0; padding: 8px 12px; border-radius: 8px; font-size: .88rem; line-height: 1.6; background: var(--ng-bg); color: var(--text); border-left: 4px solid var(--ng); }
.ab-warn.soft { background: var(--accent-soft); border-left-color: var(--accent); }
.ab-legend { display: flex; flex-wrap: wrap; justify-content: center; gap: 4px 14px; margin: 8px 0 0; font-size: .82rem; }
.ab-legend span { display: inline-flex; align-items: center; gap: 5px; }
.ab-legend svg { display: inline-block; width: 22px; height: 14px; margin: 0; }
.ab-btns { display: flex; flex-wrap: wrap; gap: 8px; margin: 8px 0; }
.ab-steps { margin: 6px 0 0; padding-left: 1.4em; font-size: .9rem; line-height: 1.7; }
.ab-steps li { margin: 6px 0; }
.ab-steps code, .ab-eq { display: block; white-space: pre-wrap; overflow-wrap: anywhere; font-size: .9rem; background: var(--bg); padding: 4px 8px; border-radius: 6px; color: var(--text); font-family: inherit; }
.ab-eq.big { font-size: 1.1rem; font-weight: 700; text-align: center; padding: 10px; }
.ab-card { border: 1px solid var(--border); border-radius: 12px; padding: 12px 14px; margin: 12px 0; background: var(--surface); }
.ab-card h3 { margin-top: 0; }
.ab-card p { margin: 6px 0; }
.ab-fcro { display: grid; grid-template-columns: max-content 1fr; gap: 4px 12px; margin: 6px 0; font-size: .92rem; }
.ab-fcro dt { font-weight: 700; color: var(--muted); }
.ab-fcro dd { margin: 0; }
.ab-src { font-size: .8rem; color: var(--muted); margin: 6px 0 0; line-height: 1.5; }
.ab-chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0; }
.ab-chips span { font-size: .82rem; padding: 3px 10px; border-radius: 999px; border: 1px solid var(--border); background: var(--bg); }
.ab-ok { color: var(--ok); font-weight: 700; }
.ab-ng { color: var(--ng); font-weight: 700; }
.ab-pick { display: flex; flex-wrap: wrap; gap: 8px; align-items: end; margin: 8px 0; }
.ab-pick select { font: inherit; font-size: .9rem; max-width: 100%; min-height: 40px; padding: 6px; border-radius: 8px; border: 1px solid var(--border); background: var(--surface); color: var(--text); }
.ab-x { font: inherit; font-size: .8rem; border: 1px solid var(--border); background: var(--bg); color: var(--text); border-radius: 999px; padding: 2px 8px; cursor: pointer; }
.ab-root details summary { cursor: pointer; font-weight: 700; }
`;
  document.head.append(css);
  box.classList.add('ab-root');

  // ---- フォームの整え: タブ、副見出し、モードごとに見せる欄 ----
  const modeSel = el.mode;
  const modes = [...modeSel.options].map(o => o.value);
  lab('mode').hidden = true;
  const tabs = document.createElement('div');
  tabs.className = 'ab-tabs';
  tabs.setAttribute('role', 'group');
  tabs.setAttribute('aria-label', lab('mode').querySelector('span').textContent);
  tabs.innerHTML = modes.map(m => `<button type="button" data-mode="${m}" aria-pressed="false">${esc(optText('mode', m))}</button>`).join('');
  form.querySelector('h2').after(tabs);
  const subs = {};
  for (const [before, key] of [['y', 'sub_axes'], ['idx', 'sub_line'], ['show', 'sub_show'], ['dfun', 'sub_case'], ['dsup', 'sub_dims'], ['src', 'sub_src'], ['sc_rho', 'sub_screen']]) {
    const p = document.createElement('p');
    p.className = 'ab-sub';
    lab(before).before(p);
    subs[key] = p;
  }
  for (const n of ['mat', 'idx', 'src', 'sc_grp']) lab(n).classList.add('ab-wide');
  for (const n of ['dfun', 'dcon', 'dobj', 'dfree', 'dsup', 'sc_el', 'sc_part', 'show']) lab(n).classList.add('ab-wide2');
  const DFIELDS = { stiff: ['dS'], str: ['dF'], energy: ['dU'], yield: ['dR', 'dp'], ybb: [], lbb: ['dR'], shock: [], distort: ['dq'], steady: ['ddT', 'dw'] };
  const VIS = {
    chart: ['sub_axes', 'y', 'x', 'sub_line', 'idx', 'sl', 'v', 'sub_show', 'show', 'env', 'tap', 'mat'],
    derive: ['sub_case', 'dfun', 'dcon', 'dobj', 'dfree', 'sub_dims', 'dsup', 'dL', 'dS', 'dF', 'dW', 'dU', 'dR', 'dp', 'dq', 'ddT', 'dw'],
    select: ['sub_line', 'idx', 'sl', 'sub_src', 'src', 'sc_grp', 'sub_screen', ...SCREEN.map(s => s[0]), 'sc_el', 'sc_part'],
    compare: ['sub_line', 'idx', 'sl'],
    practice: [],
  };
  const visible = () => {
    const mode = modeSel.value;
    const show = new Set(VIS[mode]);
    if (el.idx.value !== 'free') show.delete('sl');
    if (mode === 'derive') {
      const d = dsel();
      for (const n of ['dS', 'dF', 'dU', 'dR', 'dp', 'dq', 'ddT', 'dw']) if (!DFIELDS[d.con].includes(n)) show.delete(n);
      if (!['tie', 'beam', 'panel'].includes(d.fun) || d.con === 'energy') show.delete('dL');
      if (!(d.fun === 'beam' || d.fun === 'panel')) show.delete('dsup');
      if (!(d.fun === 'panel' || (d.fun === 'beam' && d.free === 'h'))) show.delete('dW');
      if (d.fun === 'tie') show.delete('dsup');
      if (!['dsup', 'dL', 'dS', 'dF', 'dW', 'dU', 'dR', 'dp', 'dq', 'ddT', 'dw'].some(n => show.has(n))) show.delete('sub_dims');
    }
    for (const f of el) if (f.name && f.name !== 'mode') lab(f.name).hidden = !show.has(f.name);
    for (const k in subs) { subs[k].hidden = !show.has(k); subs[k].textContent = T[k] ?? ''; }
    tabs.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
  };
  tabs.addEventListener('click', e => {
    const b = e.target.closest('button[data-mode]');
    if (b && b.dataset.mode !== modeSel.value) setMode(b.dataset.mode);
  });
  const fire = () => { form.dispatchEvent(new Event('change', { bubbles: true })); form.dispatchEvent(new Event('input', { bubbles: true })); };
  const setMode = m => { modeSel.value = m; fire(); };

  // ---- 入力の読み取り ----
  const numv = n => { const s = String(el[n]?.value ?? '').trim(); return s === '' ? NaN : Number(s); };
  const posv = n => { const v = numv(n); return fin(v) && v > 0 ? v : Number(el[n].defaultValue); };
  const dsel = () => dnorm(el.dfun.value, el.dcon.value, el.dobj.value, el.dfree.value);
  const slv = () => SLOPES[el.sl.value] ?? 1;
  const keyNow = () => (el.idx.value === 'none' ? null : el.idx.value);

  // 導く欄の選択肢: 今の機能で選べないものは使えなくする(値も選べるものへ)
  function syncDerive() {
    const d = dsel();
    for (const [n, list] of [['dcon', Object.keys(DVALID[d.fun])], ['dobj', DVALID[d.fun][d.con].obj], ['dfree', DVALID[d.fun][d.con].free]]) {
      for (const o of el[n].options) o.disabled = !list.includes(o.value);
    }
    el.dfun.value = d.fun; el.dcon.value = d.con; el.dobj.value = d.obj; el.dfree.value = d.free;
  }

  // 指標を選び直したら、その指標が直線になる軸にして、線の位置をその指標の既定値にする。
  // 軸を変えて指標が直線にならなくなっても、指標はそのまま(順位づけに使う。図には線を引かずに知らせる)
  function onIdx() {
    const k = el.idx.value;
    if (k === 'none') return;
    if (k === 'free') { el.v.value = '1'; return; }
    const I = INDEX[k];
    if (I.ax && !lineFit(k, el.x.value, el.y.value)) { el.y.value = I.ax[0]; el.x.value = I.ax[1]; }
    el.v.value = String(I.v);
  }
  form.addEventListener('input', e => {
    const n = e.target.name;
    if (n === 'idx') onIdx();
    if (n === 'dfun' || n === 'dcon' || n === 'dobj' || n === 'dfree') {
      syncDerive();
      const r = derive(dsel(), dinp());
      if (el.idx.value !== r.key) { el.idx.value = r.key; onIdx(); }
    }
    if (n === 'mat') cur = `a:${el.mat.value}`;
  }, true);

  // ---- 材料データ集(必要になったときだけ /materials/ のページから読む) ----
  let MD = null, mdState = 'idle';
  let mdSrc = {};
  async function loadMd() {
    if (mdState !== 'idle') return;
    mdState = 'loading';
    schedule();
    try {
      const r = await fetch(`${home}materials/`);
      if (!r.ok) throw new Error(String(r.status));
      const h = await r.text();
      const m = h.match(/<script type="application\/json" id="md-data">([\s\S]*?)<\/script>/);
      if (!m) throw new Error('no data');
      const D = JSON.parse(m[1]);
      mdSrc = Object.fromEntries(D.sources.map(s => [s.id, s]));
      MD = { D, items: mdItems(D).map(it => (it.variant && !it.name.includes(it.variant) ? { ...it, name: `${it.name}${par(it.variant)}` } : it)) };
      mdState = 'ok';
    } catch (err) {
      console.warn('materials data', err);
      mdState = 'err';
    }
    schedule();
  }
  const needMd = () => (modeSel.value === 'chart' && ['pts', 'both', 'boxpts'].includes(el.show.value)) || (modeSel.value === 'select' && el.src.value !== 'ash') || cmp.some(k => k.startsWith('m:'));
  const mdNote = () => (mdState === 'loading' ? `<p class="ab-warn soft">${esc(T.md_loading)}</p>` : mdState === 'err' ? `<p class="ab-warn">${esc(T.md_err)}</p>` : '');

  // ---- 材料(Ashby の範囲と、材料データ集の点)----
  const ASH = MATS.map(m => ({ key: `a:${m[0]}`, kind: 'ash', id: m[0], g: m[1], name: NAME[m[0]] ?? m[0], md: MDID[m[0]], get: p => range(m, p) }));
  const byKey = k => (k?.startsWith('a:') ? ASH.find(x => x.key === k) : MD?.items.find(x => x.key === k)) ?? null;
  let cur = `a:${el.mat.value}`; // 選んだ材料(図・表)
  const cardUrl = it => (it.kind === 'ash' ? (it.md ? `${home}materials/?m=${encodeURIComponent(it.md)}#md-card` : null) : `${home}materials/?m=${encodeURIComponent(it.id)}#md-card`);
  const kindText = it => (it.kind === 'ash' ? T.kind_ash : T.kind_md);
  // 図の軸の量の範囲
  const qr = (it, q) => qtyRange(it.get, q);
  // 指標の範囲(free は今の軸の Y / X^n)
  const ixOf = (it, key) => { const ex = exOf(key, el.x.value, el.y.value, slv()); return ex ? powRange(it.get, ex) : null; };
  const idxF = key => (key === 'free' ? `${SYM[el.y.value]}/${SYM[el.x.value]}${slv() === 1 ? '' : `^${optText('sl', el.sl.value).split(/\s/)[0]}`}` : INDEX[key].f);
  const idxU = key => (key === 'free' ? '' : INDEX[key].u);
  // 性質の値の文字(図の単位。T は ℃)
  function valText(it, p) {
    const r = it.get(p);
    if (!r) return T.unverified;
    if (p === 'T') return `${rngT(r[0] - C2K, r[1] - C2K, 4)} ${DEG}`;
    return `${rngT(r[0], r[1])} ${UNIT[p]}`;
  }
  const srcNames = it => {
    if (it.kind === 'ash') return (ASRC[it.id] ?? 'A').split('+').map(c => (c === 'A' ? T.src_ashby : SRCN[c] ?? c));
    const ids = [...new Set(Object.values(it.vals).flatMap(v => v.s))];
    return ids.map(id => mdSrc[id]?.name ?? id);
  };
  const strengthKind = it => (it.kind === 'md' && it.vals.s ? T[`sk_md_${it.vals.s.k}`] ?? '' : '');

  // =====================================================================
  // 図(SVG)
  // =====================================================================
  // 群ごとの塗り(サイトの .fig のクラス)と輪郭のクラス(前の版と同じ)
  const FILL = { metal: ['metal', 'thin'], ceramic: ['ox', 'thin'], glass: ['dep', null], polymer: ['p', 'thin'], elastomer: ['ng', 'thin'], composite: ['n', 'thin'], foam: ['ok', 'dash'], natural: ['fa2', 'thin'], fiber: ['n', 'dash'], other: ['ok', 'thin'] };
  const HATCH = { foam: true };
  const OPACITY = { natural: 0.4 };
  const hatchDef = id => `<pattern id="${id}" patternUnits="userSpaceOnUse" width="5" height="5" patternTransform="rotate(45)"><line class="thin" x1="0" y1="0" x2="0" y2="5"/></pattern>`;
  const tw = str => [...str].reduce((w, c) => w + (/[ᄀ-ᇿ⺀-鿿가-힯豈-￯]/.test(c) ? 13.5 : 8.2), 0);
  const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
  const tick = e => (e >= -3 && e <= 3 ? num(10 ** e, 1) : `10${String(e).replace(/./g, c => SUP[c])}`);
  function hull(pts) {
    const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const half = list => { const h = []; for (const q of list) { while (h.length >= 2 && cross(h[h.length - 2], h[h.length - 1], q) <= 0) h.pop(); h.push(q); } h.pop(); return h; };
    return p.length < 3 ? p : [...half(p), ...half([...p].reverse())];
  }
  function centroid(poly) {
    let A = 0, cx = 0, cy = 0;
    poly.forEach((p, i) => { const q = poly[(i + 1) % poly.length], c = p[0] * q[1] - q[0] * p[1]; A += c; cx += (p[0] + q[0]) * c; cy += (p[1] + q[1]) * c; });
    return Math.abs(A) < 1e-9 ? poly[0] : [cx / (3 * A), cy / (3 * A)];
  }
  const polyArea = poly => Math.abs(poly.reduce((A, p, i) => { const q = poly[(i + 1) % poly.length]; return A + (p[0] * q[1] - q[0] * p[1]) / 2; }, 0));
  const inside = (poly, x, y) => poly.reduce((inn, p, i) => { const q = poly[(i + 1) % poly.length]; return (p[1] > y) !== (q[1] > y) && x < (q[0] - p[0]) * (y - p[1]) / (q[1] - p[1]) + p[0] ? !inn : inn; }, false);

  // 図の枠は一度だけ作る(スライダーを動かしている途中で作り直すと、つかんでいる指が外れるため)
  box.innerHTML = `<div data-ab="top"></div>
<div data-ab="chartwrap"><div class="fig"><div data-ab="svg"></div>
<label class="dy-field" data-ab="slider-wrap" style="margin-top: 8px"><span data-ab="slider-label"></span><input type="range" data-ab="slider" min="0" max="1" step="0.005" style="padding: 0; border: 0; background: none; min-height: 32px; margin: 0; width: 100%; box-sizing: border-box"></label>
<div class="ab-legend" data-ab="legend"></div></div>
<p class="muted" data-ab="cap" style="font-size: .86rem"></p></div>
<div data-ab="body"></div>`;
  const part = k => box.querySelector(`[data-ab="${k}"]`);
  const slider = part('slider');
  let W, H, mg, pw, ph;
  const small = () => box.clientWidth < 460;
  const size = () => {
    const s = small();
    [W, H, mg] = s ? [300, 330, { l: 40, r: 6, t: 10, b: 38 }] : [520, 470, { l: 58, r: 12, t: 12, b: 46 }];
    pw = W - mg.l - mg.r; ph = H - mg.t - mg.b;
    part('chartwrap').firstElementChild.style.padding = s ? '6px 4px' : '';
    return s;
  };
  let geo = null;

  // 軸の範囲: 描く材料の値を全部含む 10 の累乗の区切り
  function axisOf(items, q) {
    const vals = items.map(it => qr(it, q)).filter(Boolean).flatMap(r => [r.lo, r.hi]).filter(v => v > 0);
    if (!vals.length) return [0, 1];
    let lo = Math.floor(Math.log10(Math.min(...vals)) + 1e-9), hi = Math.ceil(Math.log10(Math.max(...vals)) - 1e-9);
    if (hi <= lo) hi = lo + 1;
    return [lo, hi];
  }

  // 軸の題と目盛の重なり・はみ出しを、描いた文字の大きさ(getBBox)で直す。返り値は足りない余白 { l, b }(足りていれば null)。
  // 縦軸の題: 図の高さより長ければ文字を小さくし、目盛の左に、図からはみ出さない位置に置く。横軸の題: 図の幅に収め、目盛の下に置く
  function fitAxes(svg, sm) {
    const yt = svg?.querySelector('[data-ab-yt]'), xt = svg?.querySelector('[data-ab-xt]');
    const bb = e => { try { const b = e.getBBox(); return b.width || b.height ? b : null; } catch { return null; } };
    if (!yt || !xt || !bb(yt) || !bb(xt)) return null;   // 見えていない(測れない)ときは何もしない
    const fs0 = 13, gap = 3, need = { l: 0, b: 0 };
    // 縦軸の題
    let by = bb(yt);
    if (by.width > H - 6) { yt.style.fontSize = `${(fs0 * (H - 6) / by.width).toFixed(2)}px`; by = bb(yt); }
    const ty = [...svg.querySelectorAll('[data-ab-ty]')].map(bb).filter(Boolean);
    const minTick = ty.length ? Math.min(...ty.map(b => b.x)) : mg.l - 4;
    const lower = 1 - by.y, upper = minTick - gap - (by.y + by.height);   // 回した題の横の範囲は tx + by.y 〜 tx + by.y + by.height
    let txp = sm ? 11 : 14;
    if (upper >= lower) txp = Math.min(Math.max(txp, lower), upper);
    else need.l = Math.ceil(lower - upper) + 1;
    let cy = mg.t + ph / 2;                                                 // 縦の範囲は cy − by.x − by.width 〜 cy − by.x
    cy = Math.min(Math.max(cy, 2 + by.x + by.width), H - 2 + by.x);
    yt.setAttribute('transform', `translate(${txp.toFixed(1)} ${cy.toFixed(1)}) rotate(-90)`);
    // 横軸の題
    let bx = bb(xt);
    if (bx.width > W - 6) { xt.style.fontSize = `${(fs0 * (W - 6) / bx.width).toFixed(2)}px`; bx = bb(xt); }
    const cx = Math.min(Math.max(mg.l + pw / 2, 3 + bx.width / 2), W - 3 - bx.width / 2);
    xt.setAttribute('x', cx.toFixed(1));
    const tx = [...svg.querySelectorAll('[data-ab-tx]')].map(bb).filter(Boolean);
    const tickBot = tx.length ? Math.max(...tx.map(b => b.y + b.height)) : H - mg.b + 16;
    const d = tickBot + 1 - bx.y;
    if (d > 0) {
      if (bx.y + bx.height + d <= H - 1) xt.setAttribute('y', (Number(xt.getAttribute('y')) + d).toFixed(1));
      else need.b = Math.ceil(bx.y + bx.height + d - (H - 1)) + 1;
    }
    return need.l || need.b ? need : null;
  }

  // st: { x, y, key, F(線の式), v, show, env, scr(足切りの結果 key → 'pass'|'part'|'fail'), items }
  function draw(st, extra = { l: 0, b: 0 }, depth = 0) {
    const sm = size();
    const { x, y, key, F, v, show, scr } = st;
    if (x === y) { part('svg').innerHTML = `<p>${esc(T.same_axes)}</p>`; part('legend').innerHTML = ''; geo = null; return; }
    const items = st.items.filter(it => qr(it, x) && qr(it, y));
    if (!items.length) { part('svg').innerHTML = `<p>${esc(T.no_points)}</p>`; part('legend').innerHTML = ''; geo = null; return; }
    const lx = axisOf(items, x), ly = axisOf(items, y);
    {
      // 縦軸の目盛の文字の幅(13px の文字の目安)から左の余白を広げる(軸の名前と重ならないように)
      const stepY0 = Math.max(1, Math.ceil((ly[1] - ly[0] + 1) / (sm ? 7 : 11)));
      const tickW = t => [...t].reduce((w, c) => w + (/[.,]/.test(c) ? 3.8 : /[⁰-⁹⁻¹²³]/.test(c) ? 5.2 : 7.5), 0);
      let wMax = 0;
      for (let e = ly[0], i = 0; e <= ly[1]; e++, i++) if (i % stepY0 === 0) wMax = Math.max(wMax, tickW(tick(e)));
      const need = (sm ? 11 : 14) + 5 + wMax + 6;
      if (need > mg.l) { mg = { ...mg, l: Math.ceil(need) }; pw = W - mg.l - mg.r; }
      // 描いたあとに測って足りなかった分(fitAxes)
      if (extra.l || extra.b) { mg = { ...mg, l: mg.l + extra.l, b: mg.b + extra.b }; pw = W - mg.l - mg.r; ph = H - mg.t - mg.b; }
    }
    const ax = lx.map(e => 10 ** e), ay = ly.map(e => 10 ** e);
    const X = val => mg.l + (Math.log10(val) - lx[0]) / (lx[1] - lx[0]) * pw;
    const Y = val => mg.t + (ly[1] - Math.log10(val)) / (ly[1] - ly[0]) * ph;
    const f1 = z => z.toFixed(1);
    const rmin = sm ? 5 : 6, rpt = sm ? 3.4 : 4;
    const els = items.map(it => {
      const rx = qr(it, x), ry = qr(it, y);
      const isPt = it.kind === 'md';
      const cx = isPt ? X(rx.c) : (X(rx.lo) + X(rx.hi)) / 2, cy = isPt ? Y(ry.c) : (Y(ry.lo) + Y(ry.hi)) / 2;
      const a = isPt ? rpt : Math.max(Math.abs(X(rx.hi) - X(rx.lo)) / 2, rmin), b = isPt ? rpt : Math.max(Math.abs(Y(ry.hi) - Y(ry.lo)) / 2, rmin);
      const ix = key ? ixOf(it, key) : null;
      return { it, cx, cy, a, b, pt: isPt, pos: ix && F ? side(ix, v) : 'none', scr: scr?.get(it.key) };
    }).sort((p, q) => (p.pt - q.pt) || q.a * q.b - p.a * p.b);
    geo = { X, Y, lx, ly, els };
    const shape = e => {
      const gn = GROUPS[e.it.g], [fc, oc] = FILL[gn];
      const fade = e.pos === 'bad' || e.scr === 'fail' ? ' opacity="0.16"' : '';
      const good = e.pos === 'good' && e.scr !== 'fail';
      const dash = e.scr === 'part' ? ' stroke-dasharray="3 2"' : '';
      if (e.pt) {
        return `<g data-k="${esc(e.it.key)}"${fade}><circle cx="${f1(e.cx)}" cy="${f1(e.cy)}" r="${f1(e.a + (good ? 0.6 : 0))}" style="fill: var(--ab-g${e.it.g}); stroke: ${good ? 'var(--text)' : 'var(--surface)'}; stroke-width: ${good ? 1.6 : 1}"${dash}/></g>`;
      }
      const at = `cx="${f1(e.cx)}" cy="${f1(e.cy)}" rx="${f1(e.a)}" ry="${f1(e.b)}"`;
      if (show === 'box' || show === 'boxpts') {
        const r = `x="${f1(e.cx - e.a)}" y="${f1(e.cy - e.b)}" width="${f1(2 * e.a)}" height="${f1(2 * e.b)}"`;
        return `<g data-k="${esc(e.it.key)}"${fade}><rect class="${fc}" ${r} fill-opacity="${good ? 0.85 : (OPACITY[gn] ?? 0.6)}" stroke-opacity="0"/>${HATCH[gn] ? `<rect ${r} fill="url(#ab-hatch)"/>` : ''}<rect class="${good ? 'ln' : oc ?? 'thin'}" ${r} style="stroke-width: ${good ? 2.2 : 1.3}"${dash}/></g>`;
      }
      const fillE = `<ellipse class="${fc}" ${at} fill-opacity="${good ? 0.9 : OPACITY[gn] ?? 0.7}"${oc || good ? ' stroke-opacity="0"' : ' style="stroke-width: 1.6"'}/>`;
      const hatch = HATCH[gn] ? `<ellipse ${at} fill="url(#ab-hatch)"/>` : '';
      const line = good ? `<ellipse class="ln" ${at} style="stroke-width: 2.4"${dash}/>` : oc ? `<ellipse class="${oc}" ${at} style="stroke-width: 1.6"${dash}/>` : dash ? `<ellipse class="thin" ${at}${dash}/>` : '';
      return `<g data-k="${esc(e.it.key)}"${fade}>${fillE}${hatch}${line}</g>`;
    };
    // 群の囲み: 群の楕円・点の周り(少し膨らませる)の凸包
    const pad = sm ? 5 : 7;
    const env = st.env ? GROUPS.map((g, gi) => {
      const es = els.filter(e => e.it.g === gi && e.scr !== 'fail');
      if (!es.length) return null;
      const pts = es.flatMap(e => Array.from({ length: 16 }, (_, k) => [e.cx + (e.a + pad) * Math.cos(k * Math.PI / 8), e.cy + (e.b + pad) * Math.sin(k * Math.PI / 8)]));
      return { g, gi, poly: hull(pts) };
    }).filter(Boolean) : [];
    const envSvg = env.map(({ g, poly }) => {
      const pts = poly.map(p => `${f1(p[0])},${f1(p[1])}`).join(' ');
      const fc = HATCH[g] || g === 'other' ? 'ok' : FILL[g][0];
      return `<polygon class="${fc}" points="${pts}" fill-opacity="${g === 'natural' ? 0.1 : 0.2}" stroke-opacity="0"/><polygon class="dash" points="${pts}" style="stroke-width: 1.1"/>`;
    }).join('');
    const placed = [];
    // 選んだ材料の輪郭と名前
    let mark = '';
    const se = els.find(e => e.it.key === cur);
    if (se) {
      let nm = se.it.name, w = tw(nm);
      const room = ww => se.cx + se.a + 4 + ww <= W - mg.r || se.cx - se.a - 4 - ww >= mg.l;
      if (!room(w)) { nm = nm.split(/[(（]/)[0].trim(); w = tw(nm); }
      const right = se.cx + se.a + 4 + w <= W - mg.r || se.cx - se.a - 4 - w < mg.l;
      const tx = right ? Math.max(mg.l + 2, Math.min(se.cx + se.a + 4, W - mg.r - w)) : Math.min(W - mg.r - 2, Math.max(se.cx - se.a - 4, mg.l + w));
      const ty = Math.min(Math.max(se.cy - se.b - 4, mg.t + 12), mg.t + ph - 4);
      placed.push({ x: right ? tx + w / 2 : tx - w / 2, y: ty, w });
      mark = (se.pt ? `<circle class="ac" cx="${f1(se.cx)}" cy="${f1(se.cy)}" r="${f1(se.a + 3)}"/>` : `<ellipse class="ac" cx="${f1(se.cx)}" cy="${f1(se.cy)}" rx="${f1(se.a + 2.5)}" ry="${f1(se.b + 2.5)}"/>`)
        + `<text class="sm a" x="${f1(tx)}" y="${f1(ty)}" text-anchor="${right ? 'start' : 'end'}">${esc(nm)}</text>`;
    }
    // 指標の線と「良い側」の印
    let line = '', seg = null;
    if (key && F) {
      if (F.a === 0) {
        const xv = fitX(F, v);
        if (xv >= ax[0] && xv <= ax[1]) {
          seg = [[X(xv), mg.t], [X(xv), mg.t + ph]];
          const right = F.b > 0, gt = right ? T.good_right : T.good_left, gw = tw(gt);
          const tx = right ? Math.min(X(xv) + 6, W - mg.r - gw - 2) : Math.max(X(xv) - 6, mg.l + gw + 2);
          line = `<line class="ac2" x1="${f1(X(xv))}" y1="${mg.t}" x2="${f1(X(xv))}" y2="${mg.t + ph}"/><text class="sm a" x="${f1(tx)}" y="${mg.t + 18}" text-anchor="${right ? 'start' : 'end'}">${esc(gt)}</text>`;
          placed.push({ x: right ? tx + gw / 2 : tx - gw / 2, y: mg.t + 18, w: gw });
        }
      } else {
        const p0 = [ax[0], fitY(F, v, ax[0])], p1 = [ax[1], fitY(F, v, ax[1])];
        line = `<line class="ac2" x1="${f1(X(p0[0]))}" y1="${f1(Y(p0[1]))}" x2="${f1(X(p1[0]))}" y2="${f1(Y(p1[1]))}"/>`;
        seg = [[X(p0[0]), Y(p0[1])], [X(p1[0]), Y(p1[1])]];
        const pts = [];
        for (let i = 0; i <= 40; i++) {
          const xv = 10 ** (lx[0] + (lx[1] - lx[0]) * i / 40), yv = fitY(F, v, xv);
          if (yv >= ay[0] && yv <= ay[1]) pts.push([X(xv), Y(yv)]);
        }
        if (pts.length) {
          const [mx, my] = pts[Math.floor(pts.length / 2)];
          const up = F.a > 0;
          const gt = up ? T.good_up : T.good_down, gw = tw(gt);
          const sl = fitSlope(F);
          // 良い側は線の上(左上・右上)か下。線の傾きの向きで、文字を線から離す向きを決める
          const leftSide = (up && sl >= 0) || (!up && sl < 0);
          const tx = leftSide ? Math.min(Math.max(mx - 10, mg.l + gw + 2), W - mg.r - 2) : Math.max(Math.min(mx + 10, W - mg.r - gw - 2), mg.l + 2);
          const ty = Math.min(Math.max(my + (up ? -12 : 22), mg.t + 14), mg.t + ph - 6);
          line += `<text class="sm a" x="${f1(tx)}" y="${f1(ty)}" text-anchor="${leftSide ? 'end' : 'start'}">${esc(gt)}</text>`;
          placed.push({ x: leftSide ? tx - gw / 2 : tx + gw / 2, y: ty, w: gw });
        }
      }
    }
    // 群の名前(前の版と同じ置き方: 囲みの重心の近くで、ほかの名前・楕円・線にかぶらない所)
    const hitAt = (x0, y0, w) => placed.some(q => Math.abs(q.x - x0) < (q.w + w) / 2 + 4 && Math.abs(q.y - y0) < 18);
    const cand = [];
    for (let dy = -120; dy <= 120; dy += 8) for (let dx = -160; dx <= 160; dx += 10) cand.push([dx, dy]);
    const nearLine = (x0, y0) => {
      if (!seg) return false;
      const [[x1, y1], [x2, y2]] = seg, L2 = (x2 - x1) ** 2 + (y2 - y1) ** 2 || 1;
      const t = Math.max(0, Math.min(1, ((x0 - x1) * (x2 - x1) + (y0 - y1) * (y2 - y1)) / L2));
      return Math.hypot(x0 - x1 - t * (x2 - x1), y0 - y1 - t * (y2 - y1)) < 11;
    };
    const order = env.map(e => ({ ...e, area: polyArea(e.poly) })).sort((p, q) => p.area - q.area);
    const glabels = order.map(({ g, gi, poly }) => {
      const name = gname(gi), w = tw(name);
      const [gx, gy] = centroid(poly);
      let best = null, bestScore = Infinity;
      for (const [dx, dy] of cand) {
        const x0 = gx + dx, y0 = gy + 4 + dy;
        if (x0 - w / 2 < mg.l + 2 || x0 + w / 2 > W - mg.r - 2 || y0 - 12 < mg.t + 2 || y0 + 4 > mg.t + ph - 2 || hitAt(x0, y0, w)) continue;
        const sx = [x0 - w / 2 - 2, x0, x0 + w / 2 + 2], sy = [y0 - 12, y0 - 4, y0 + 4];
        let own = 0, other = 0;
        for (const e of els) if (sx.some(px => sy.some(py => ((px - e.cx) / (e.a + 2)) ** 2 + ((py - e.cy) / (e.b + 2)) ** 2 <= 1))) e.it.g === gi ? own++ : other++;
        const out = !inside(poly, x0, y0 - 4);
        const sc = Math.hypot(dx, dy * 1.3) + 80 * other + 30 * own + (out ? 35 : 0) + (nearLine(x0, y0 - 4) ? 30 : 0);
        if (sc < bestScore) { bestScore = sc; best = [x0, y0, out]; }
      }
      if (!best) best = [Math.min(Math.max(gx, mg.l + w / 2 + 2), W - mg.r - w / 2 - 2), Math.min(Math.max(gy + 4, mg.t + 14), mg.t + ph - 4), false];
      const [tx, ty, out] = best;
      placed.push({ x: tx, y: ty, w });
      let lead = '';
      const near = els.filter(e => e.it.g === gi).map(e => {
        const dx = tx - e.cx, dy = ty - 4 - e.cy, d = Math.hypot(dx, dy) || 1;
        const r = 1 / Math.sqrt((dx / d / e.a) ** 2 + (dy / d / e.b) ** 2);
        return { gap: d - r, ex: e.cx + dx / d * r, ey: e.cy + dy / d * r };
      }).sort((p, q) => p.gap - q.gap)[0];
      if (near && (out || near.gap > Math.max(16, w / 2 + 6))) lead = `<line class="thin" x1="${f1(tx)}" y1="${f1(ty - 4)}" x2="${f1(near.ex)}" y2="${f1(near.ey)}"/>`;
      return `<g data-g="${g}">${lead}<rect class="ok" x="${f1(tx - w / 2 - 3)}" y="${f1(ty - 12)}" width="${f1(w + 6)}" height="16" rx="3" fill-opacity="0.88" stroke-opacity="0"/><text class="sm" x="${f1(tx)}" y="${f1(ty)}" text-anchor="middle" font-weight="700">${esc(name)}</text></g>`;
    }).join('');
    const ex = [], ey = [];
    for (let e = lx[0]; e <= lx[1]; e++) ex.push(e);
    for (let e = ly[0]; e <= ly[1]; e++) ey.push(e);
    const step = Math.max(1, Math.ceil(ex.length / (sm ? 5 : 9))), stepY = Math.max(1, Math.ceil(ey.length / (sm ? 7 : 11)));
    part('svg').innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="ab-title" style="touch-action: manipulation; cursor: pointer">
  <title id="ab-title">${esc(fill(T.chart_title, { y: axisLabel(y), x: axisLabel(x) }))}</title>
  <defs><clipPath id="ab-clip"><rect x="${mg.l}" y="${mg.t}" width="${pw}" height="${ph}"/></clipPath>${hatchDef('ab-hatch')}</defs>
  <rect class="ok" x="${mg.l}" y="${mg.t}" width="${pw}" height="${ph}"/>
  <g clip-path="url(#ab-clip)">
    ${ex.slice(1, -1).map(e => `<line class="thin" stroke-dasharray="2 4" x1="${f1(X(10 ** e))}" x2="${f1(X(10 ** e))}" y1="${mg.t}" y2="${mg.t + ph}"/>`).join('')}
    ${ey.slice(1, -1).map(e => `<line class="thin" stroke-dasharray="2 4" y1="${f1(Y(10 ** e))}" y2="${f1(Y(10 ** e))}" x1="${mg.l}" x2="${mg.l + pw}"/>`).join('')}
    ${envSvg}
    ${els.map(shape).join('')}
    ${line}${glabels}${mark}
  </g>
  ${ex.filter((e, i) => i % step === 0).map(e => `<text class="sm m" x="${f1(X(10 ** e))}" y="${H - mg.b + 16}" text-anchor="${e === lx[1] ? 'end' : e === lx[0] ? 'start' : 'middle'}" data-ab-tx>${tick(e)}</text>`).join('')}
  ${ey.filter((e, i) => i % stepY === 0).map(e => `<text class="sm m" x="${mg.l - 4}" y="${f1(Y(10 ** e) + 4)}" text-anchor="end" data-ab-ty>${tick(e)}</text>`).join('')}
  <text class="sm" x="${mg.l + pw / 2}" y="${H - 8}" text-anchor="middle" data-ab-xt>${esc(axisLabel(x))}</text>
  <text class="sm" transform="translate(${sm ? 11 : 14} ${mg.t + ph / 2}) rotate(-90)" text-anchor="middle" data-ab-yt>${esc(axisLabel(y))}</text>
</svg>`;
    // 軸の題と目盛を測って、重なり・はみ出しを直す(足りない余白があれば、その分を広げて描き直す)
    const fit = fitAxes(part('svg').querySelector('svg'), sm);
    if (fit && depth < 2) { draw(st, { l: extra.l + fit.l, b: extra.b + fit.b }, depth + 1); return; }
    part('svg').querySelector('svg').addEventListener('click', pick);
    // 凡例: 描いた群だけ
    const gs = [...new Set(els.map(e => e.it.g))].sort((a, b) => a - b);
    const hasRange = els.some(e => !e.pt), hasPt = els.some(e => e.pt);
    part('legend').innerHTML = gs.map(g => {
      const gn = GROUPS[g], [fc, oc] = FILL[gn], at = 'cx="11" cy="7" rx="9.5" ry="5.5"';
      const rangeSw = hasRange && g < 8 ? `${HATCH[gn] ? `<defs>${hatchDef(`ab-h-${gn}`)}</defs>` : ''}<ellipse class="${fc}" ${at} fill-opacity="${OPACITY[gn] ?? 0.7}"${oc ? ' stroke-opacity="0"' : ' style="stroke-width: 1.5"'}/>${HATCH[gn] ? `<ellipse ${at} fill="url(#ab-h-${gn})"/>` : ''}${oc ? `<ellipse class="${oc}" ${at} style="stroke-width: 1.5"/>` : ''}` : '';
      const ptSw = hasPt ? `<circle cx="${rangeSw ? 17 : 11}" cy="7" r="4" style="fill: var(--ab-g${g}); stroke: var(--surface); stroke-width: 1"/>` : '';
      return `<span><svg viewBox="0 0 22 14" aria-hidden="true" class="fig" style="padding:0;border:0;background:none">${rangeSw}${ptSw}</svg>${esc(gname(g))}</span>`;
    }).join('');
  }

  // 図のクリック・タップ: 「材料を選ぶ」なら、その点を含む楕円のうち一番小さいもの(点は近いもの)を選ぶ。「線を動かす」なら、その点を通る線に
  function pick(e) {
    if (!geo) return;
    const svg = e.currentTarget, pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const q = pt.matrixTransform(svg.getScreenCTM().inverse());
    if (q.x < mg.l || q.x > mg.l + pw || q.y < mg.t || q.y > mg.t + ph) return;
    const key = keyNow(), F = key ? lineFit(key, el.x.value, el.y.value, slv()) : null;
    if (el.tap.value === 'line' && F && modeSel.value === 'chart') {
      const Xv = 10 ** (geo.lx[0] + (q.x - mg.l) / pw * (geo.lx[1] - geo.lx[0]));
      const Yv = 10 ** (geo.ly[1] - (q.y - mg.t) / ph * (geo.ly[1] - geo.ly[0]));
      el.v.value = String(Number(fitAt(F, Xv, Yv).toPrecision(3)));
    } else {
      const pts = geo.els.filter(g => g.pt).map(g => [Math.hypot(q.x - g.cx, q.y - g.cy), g]).filter(([d]) => d < 10).sort((a, b) => a[0] - b[0]);
      const ins = geo.els.filter(g => !g.pt && (el.show.value.startsWith('box') ? Math.abs(q.x - g.cx) <= g.a && Math.abs(q.y - g.cy) <= g.b : ((q.x - g.cx) / g.a) ** 2 + ((q.y - g.cy) / g.b) ** 2 <= 1)).sort((a, b) => a.a * a.b - b.a * b.b);
      const near = geo.els.map(g => [Math.hypot(q.x - g.cx, q.y - g.cy), g]).filter(([d]) => d < 18).sort((a, b) => a[0] - b[0]);
      const hit = pts[0]?.[1] ?? ins[0] ?? near[0]?.[1];
      if (!hit) return;
      cur = hit.it.key;
      if (hit.it.kind === 'ash') el.mat.value = hit.it.id;
    }
    fire();
  }

  // スライダーは指標の値の対数。範囲は、描いている材料の指標の全体より少し広く
  let sliderSig = '';
  function setSlider(key, F, v, items) {
    const wrap = part('slider-wrap');
    if (!key || !F || modeSel.value !== 'chart') { wrap.hidden = true; return; }
    wrap.hidden = false;
    part('slider-label').textContent = `${T.slider} ${idxF(key)} = ${fmt(v)}${idxU(key) ? ` ${idxU(key)}` : ''}`;
    const sig = `${key} ${el.x.value} ${el.y.value} ${el.sl.value} ${items.length}`;
    if (sliderSig !== sig) {
      const ixs = items.map(it => ixOf(it, key)).filter(Boolean);
      if (ixs.length) {
        slider.min = String(Math.floor(Math.log10(Math.min(...ixs.map(i => i.lo))) * 10) / 10);
        slider.max = String(Math.ceil(Math.log10(Math.max(...ixs.map(i => i.hi))) * 10) / 10);
      }
      sliderSig = sig;
    }
    if (document.activeElement !== slider) slider.value = String(Math.log10(v));
  }
  slider.addEventListener('input', () => {
    el.v.value = String(Number((10 ** Number(slider.value)).toPrecision(3)));
    fire();
  });

  // ---- 表 ----
  const tables = {};
  // rows の各セル: 文字、または { t: 表示, v: CSV の値, h: HTML }。opts.cls: 行ごとのクラス、left: 左寄せの列
  const tableHTML = (name, head, rows, opts = {}) => {
    tables[name] = { head: opts.csvHead ?? head, rows: opts.csvRows ?? rows.map(r => r.map(c => (c && typeof c === 'object' ? c.v : c))) };
    return `<div class="table-wrap"><table class="dy-table"><thead><tr>${head.map((h, i) => `<th scope="col"${(opts.left ?? [0]).includes(i) ? ' class="l"' : ''}>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r, ri) => `<tr${opts.cls?.[ri] ? ` class="${opts.cls[ri]}"` : ''}>${r.map((c, i) => {
      const t = c && typeof c === 'object' ? c.t : c;
      const l = (opts.left ?? [0]).includes(i);
      const inner = c && typeof c === 'object' && c.h ? c.h : esc(t);
      return i === (opts.rowHead ?? 0) ? `<th scope="row" class="l">${inner}</th>` : `<td data-out="${name}-${ri}-${i}"${l ? ' class="l"' : ''}>${inner}</td>`;
    }).join('')}</tr>`).join('')}</tbody></table></div>`;
  };
  const csvBtns = name => `<div class="ab-btns"><button type="button" class="btn btn-ghost btn-small" data-csv="${name}">${esc(T.csv_copy)}</button><button type="button" class="btn btn-ghost btn-small" data-csv-save="${name}">${esc(T.csv_save)}</button></div>`;
  const csvText = name => { const t = tables[name]; return [t.head, ...t.rows].map(r => r.map(csvNum).join(',')).join('\n'); };
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch { /* 古いブラウザ */ }
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.append(ta); ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* だめでも */ }
    ta.remove();
    return ok;
  }
  const flash = (btn, text) => { const old = btn.textContent; btn.textContent = text; setTimeout(() => { btn.textContent = old; }, 1600); };
  const warn = (text, soft = false) => `<p class="ab-warn${soft ? ' soft' : ''}" data-ab-warn>${esc(text)}</p>`;
  const stats = items => `<dl class="dy-stats">${items.filter(Boolean).map(([k, l, v]) => `<div><dt>${esc(l)}</dt><dd data-out="${k}">${v}</dd></div>`).join('')}</dl>`;
  const linkA = (href, text) => `<a href="${esc(href)}">${esc(text)}</a>`;

  // 比べる材料(URL のハッシュ #cmp=a:lcs,m:sus304 に残す。共通の共有の部品は数と選択肢だけを扱うため)
  let cmp = [];
  try {
    const m = location.hash.match(/(?:^#|&)cmp=([^&]*)/);
    if (m) cmp = decodeURIComponent(m[1]).split(',').filter(k => /^[am]:[\w-]+$/.test(k)).slice(0, 4);
  } catch { /* 読めなければ空 */ }
  const saveHash = () => {
    const h = cmp.length ? `#cmp=${cmp.join(',')}` : '';
    try { history.replaceState(history.state, '', location.pathname + location.search + h); } catch { /* 変えられなくても続ける */ }
  };
  const toggleCmp = k => {
    if (cmp.includes(k)) cmp = cmp.filter(x => x !== k);
    else if (cmp.length < 4) cmp = [...cmp, k];
    saveHash();
  };
  const cmpBtn = it => `<button type="button" class="ab-x" data-cmp="${esc(it.key)}" aria-pressed="${cmp.includes(it.key)}">${esc(cmp.includes(it.key) ? T.cmp_on : T.cmp_add)}</button>`;

  // =====================================================================
  // 共通: 候補の材料と、足切り
  // =====================================================================
  const shownItems = () => {
    const s = el.show.value, out = [];
    if (s !== 'pts') out.push(...ASH);
    if ((s === 'pts' || s === 'both' || s === 'boxpts') && MD) out.push(...MD.items);
    return out;
  };
  function candidates() {
    const src = el.src.value;
    const out = [];
    if (src !== 'md') out.push(...ASH);
    if (src !== 'ash' && MD) out.push(...MD.items);
    return out;
  }
  function conditions() {
    const cs = [];
    for (const [n, p, op] of SCREEN) {
      const v = numv(n);
      if (!fin(v)) continue;
      cs.push({ n, p, op, v: p === 'T' ? v + C2K : v, shown: v });
    }
    const e = ELEC[el.sc_el.value];
    if (e) cs.push({ n: 'sc_el', p: e[0], op: e[1], v: e[2], shown: e[2] });
    return cs;
  }
  const condText = c => (c.n === 'sc_el' ? optText('sc_el', el.sc_el.value) : `${SYM[c.p]} ${c.op === 'ge' ? '≥' : '≤'} ${fmt(c.shown)} ${c.p === 'T' ? DEG : UNIT[c.p]}`);
  // 足切りと順位づけ。返り値: { list(順位の順、{ it, ix, scr, best, worst }), out(外れた材料と理由), noix(指標の値がない) }
  function selectRun(key, opts = {}) {
    const conds = opts.conds ?? conditions(), grp = opts.grp ?? el.sc_grp.value, keep = (opts.part ?? el.sc_part.value) === 'keep';
    const items = opts.items ?? candidates();
    const passed = [], out = [], noix = [];
    for (const it of items) {
      if (grp !== 'all' && GROUPS[it.g] !== grp) { out.push({ it, why: 'grp' }); continue; }
      const s = screenAll(it.get, conds);
      if (s.st === 'fail' || s.st === 'na' || (s.st === 'part' && !keep)) { out.push({ it, why: s.st, each: s.each }); continue; }
      const ix = key ? (opts.ex ? powRange(it.get, opts.ex) : ixOf(it, key)) : null;
      if (key && !ix) { noix.push(it); continue; }
      passed.push({ it, ix, scr: s.st, each: s.each });
    }
    if (key) passed.sort((a, b) => b.ix.c - a.ix.c);
    const span = key ? rankSpan(passed.map(p => p.ix)) : [];
    passed.forEach((p, i) => Object.assign(p, span[i] ?? {}, { rank: i + 1 }));
    return { list: passed, out, noix, conds };
  }

  // =====================================================================
  // モードごとの描き直し
  // =====================================================================
  function renderChart() {
    const key = keyNow(), x = el.x.value, y = el.y.value;
    let v = numv('v');
    if (key && !(fin(v) && v > 0)) v = key === 'free' ? 1 : INDEX[key].v;
    const F = key ? lineFit(key, x, y, slv()) : null;
    const items = shownItems();
    part('chartwrap').hidden = false;
    let top = mdNote();
    if (['pts', 'both', 'boxpts'].includes(el.show.value) && el.show.value !== 'pts') top += warn(T.w_mix_chart, true);
    part('top').innerHTML = top;
    draw({ x, y, key, F, v, show: el.show.value, env: el.env.value === 'on', items });
    setSlider(key, F, v, items.filter(it => qr(it, x) && qr(it, y)));
    const drawnN = items.filter(it => qr(it, x) && qr(it, y)).length;
    const miss = items.filter(it => it.kind === 'ash' && (!qr(it, x) || !qr(it, y))).map(it => it.name);
    const hint = el.tap.value === 'line' && F ? T.hint_line : el.tap.value === 'line' ? T.hint_line_none : T.hint_pick;
    part('cap').textContent = `${hint}${miss.length && x !== y ? ` ${fill(T.missing, { list: miss.join(T.sep) })}` : ''}${x === 'T' || y === 'T' ? ` ${T.note_T}` : ''}`;
    let html = '';
    if (key && !F && x !== y) {
      const I = INDEX[key];
      html += warn(I?.ax ? fill(T.w_nofit, { f: idxF(key), y: axisLabel(I.ax[0]), x: axisLabel(I.ax[1]) }) : fill(T.w_nofit_any, { f: idxF(key) }), true);
      if (I?.ax) html += `<div class="ab-btns"><button type="button" class="btn btn-ghost btn-small" data-fit="${key}">${esc(T.btn_fit)}</button></div>`;
    }
    const drawn = items.filter(it => qr(it, x) && qr(it, y));
    const ixs = key ? drawn.map(it => ({ it, ix: ixOf(it, key) })).filter(r => r.ix) : [];
    if (key && F) {
      const good = ixs.filter(r => side(r.ix, v) === 'good').length, cross = ixs.filter(r => side(r.ix, v) === 'cross').length;
      const sl = fitSlope(F);
      html += stats([
        ['slope', T.slope, esc(`${sl === Infinity ? '∞' : num(sl, 3)}${par(`${idxF(key)} = ${fmt(v)}${idxU(key) ? ` ${idxU(key)}` : ''}`)}`)],
        ['above', T.above, esc(fill(T.above_fmt, { n: good, m: cross, all: drawnN }))],
      ]);
    }
    // 指標の高い順(範囲の一部でも線の良い側にかかる材料)
    if (key) {
      const rows = ixs.filter(r => !F || r.ix.hi >= v).sort((a, b) => b.ix.c - a.ix.c);
      html += `<h3>${esc(T.rank_heading)}</h3>`;
      if (rows.slice(0, 10).some(r => GROUPS[r.it.g] === 'fiber')) html += warn(T.w_fiber, true);
      if (rows.length) {
        const narrow = small();
        const both = rows.some(r => r.it.kind === 'md') && rows.some(r => r.it.kind === 'ash');
        const head = [T.col_mat, ...(narrow ? [] : [T.col_group]), ...(both ? [T.col_kind] : []), `${idxF(key)}`, T.col_range, ...(F ? [T.col_pos] : [])];
        html += `<p>${esc(F ? fill(T.rank_lead, { f: idxF(key), v: fmt(v), u: idxU(key) }) : fill(T.rank_lead_all, { f: idxF(key) }))}</p>`;
        html += tableHTML('rank', head, rows.slice(0, 60).map(r => [r.it.name, ...(narrow ? [] : [gname(r.it.g)]), ...(both ? [kindText(r.it)] : []), { t: fmt(r.ix.c), v: r.ix.c }, rngT(r.ix.lo, r.ix.hi), ...(F ? [T[`pos_${side(r.ix, v)}`]] : [])]), { cls: rows.slice(0, 60).map(r => (r.it.key === cur ? 'cur' : '')) });
        if (rows.length > 60) html += `<p class="muted">${esc(fill(T.rank_more, { n: rows.length - 60 }))}</p>`;
        html += csvBtns('rank');
      } else html += `<p>${esc(T.rank_none)}</p>`;
      html += `<p class="muted" style="font-size:.85rem">${esc(T.rank_note)}</p>`;
    } else html += `<p>${esc(T.no_index)}</p>`;
    html += matPanel(key);
    part('body').innerHTML = html;
  }

  // 選んだ材料の値(全部の性質)と、データ集のカードへのリンク
  function matPanel(key) {
    const it = byKey(cur);
    if (!it) return `<h3>${esc(T.mat_heading)}</h3><p>${esc(T.hint_pick)}</p>`;
    const props = it.kind === 'ash' ? PROPS : PROPS.filter(p => it.get(p));
    const rows = props.map(p => {
      let label = `${pname(p)} ${SYM[p]}`;
      if (p === 's') label += par(it.kind === 'ash' ? T[`sk_${GROUPS[it.g]}`] : strengthKind(it));
      if (p === 'T' && it.kind === 'md') label = `${it.vals.T.tk === 'mp' ? T.p_mp : T.p_tg} ${SYM.T}`;
      return [label, valText(it, p)];
    });
    if (key) { const ix = ixOf(it, key); rows.push([`${T.mat_idx} ${idxF(key)}`, ix ? `${fmt(ix.c)}${ix.hi > ix.lo * (1 + 1e-9) ? par(rngT(ix.lo, ix.hi)) : ''} ${idxU(key)}` : T.unverified]); }
    const url = cardUrl(it);
    let h = `<h3>${esc(T.mat_heading)}</h3><p><strong>${esc(it.name)}</strong>${esc(par(`${gname(it.g)} · ${kindText(it)}`))}</p>`;
    h += tableHTML('mat', [T.col_prop, T.col_val], rows, { left: [0, 1] });
    h += `<p class="ab-src">${esc(T.src_label)}: ${esc(srcNames(it).join(' / '))}</p>`;
    h += `<div class="ab-btns">${url ? `<a class="btn btn-ghost btn-small" href="${esc(url)}">${esc(T.ln_card)} →</a>` : ''}${cmpBtn(it)}</div>`;
    return h;
  }

  // ---- 指標を導く ----
  const dinp = () => ({ L: posv('dL'), S: posv('dS') * 1e3, F: posv('dF') * 1e3, W: posv('dW') / 1e3, U: posv('dU'), R: posv('dR') / 1e3, p: posv('dp') * 1e6, q: posv('dq'), dT: posv('ddT'), w: posv('dw') / 1e3, sup: el.dsup.value });
  function dsteps(d, inp) {
    const c = d.obj === 'cost', mv = c ? 'C' : 'm', Cm = c ? ' Cm' : '';
    const { C1, C2 } = SUPPORT[inp.sup] ?? SUPPORT.cant;
    const s = [];
    const K = INDEX[d.key];
    const objLine = f => [c ? T.st_obj_cost : T.st_obj_mass, `${mv} = ${f}${Cm}`];
    if (d.fun === 'tie') {
      s.push(objLine('A L ρ'));
      if (d.con === 'stiff') s.push([T.st_con_stiff, 'S = E A / L'], [T.st_free, 'A = S L / E'], [T.st_sub, `${mv} = (S) (L²) (ρ${Cm} / E)`]);
      else s.push([T.st_con_str, 'F / A ≤ σf'], [T.st_free, 'A = F / σf'], [T.st_sub, `${mv} = (F) (L) (ρ${Cm} / σf)`]);
    } else if (d.fun === 'beam' && d.free === 'sq') {
      s.push(objLine('b² L ρ'));
      if (d.con === 'stiff') s.push([T.st_con_beam_stiff, `S = C₁ E I / L³,  I = b⁴/12,  C₁ = ${C1}`], [T.st_free, 'b² = (12 S L³ / (C₁ E))^½'], [T.st_sub, `${mv} = (12 S / C₁)^½ (L^5/2) (ρ${Cm} / E^½)`]);
      else s.push([T.st_con_beam_str, `F L / C₂ = σf Z,  Z = b³/6,  C₂ = ${C2}`], [T.st_free, 'b = (6 F L / (C₂ σf))^⅓'], [T.st_sub, `${mv} = (6 F / C₂)^⅔ (L^5/3) (ρ${Cm} / σf^⅔)`]);
    } else if (d.fun === 'beam' || d.fun === 'panel') {
      const v = d.fun === 'panel' ? 't' : 'h';
      s.push(objLine(`W ${v} L ρ`));
      if (d.con === 'stiff') s.push([T.st_con_beam_stiff, `S = C₁ E I / L³,  I = W ${v}³/12,  C₁ = ${C1}`], [T.st_free, `${v} = (12 S L³ / (C₁ E W))^⅓`], [T.st_sub, `${mv} = (12 S W² / C₁)^⅓ (L²) (ρ${Cm} / E^⅓)`]);
      else s.push([T.st_con_beam_str, `F L / C₂ = σf Z,  Z = W ${v}²/6,  C₂ = ${C2}`], [T.st_free, `${v} = (6 F L / (C₂ W σf))^½`], [T.st_sub, `${mv} = (6 F W / C₂)^½ (L^3/2) (ρ${Cm} / σf^½)`]);
    } else if (d.fun === 'spring') {
      s.push([T.st_spring_u, 'U = (σ² / 2E) V ≤ (σf² / 2E) V'], [T.st_free_v, 'V = 2 E U / σf²']);
      if (d.obj === 'vol') s.push([T.st_obj_vol, 'V = (2U) (E / σf²)']);
      else s.push(objLine('V ρ'), [T.st_sub, `${mv} = (2U) (ρ${Cm} E / σf²)`]);
    } else if (d.fun === 'vessel') {
      if (d.con === 'yield') s.push(objLine('4π R² t ρ'), [T.st_con_vessel, 'σ = p R / (2t) ≤ σf'], [T.st_free, 't = p R / (2 σf)'], [T.st_sub, `${mv} = (2π p R³) (ρ${Cm} / σf)`]);
      else if (d.con === 'ybb') s.push([T.st_crack, 'σ = C K_IC / √(π a)   (C ≈ 1)'], [T.st_ybb, 'a_c = (1/π) (K_IC / σf)²']);
      else s.push([T.st_crack, 'σ = C K_IC / √(π a)   (C ≈ 1)'], [T.st_lbb, 'σ √(π t / 2) ≤ K_IC,  σ = p R / (2t)'], [T.st_lbb2, 'p ≤ (4 / (π R)) (K_IC² / σf)']);
    } else if (d.fun === 'thermal') {
      if (d.con === 'shock') s.push([T.st_shock, 'σ = E α ΔT ≤ σf'], [T.st_shock2, 'ΔT_max = σf / (E α)']);
      else s.push([T.st_dist, 'dT/dx = q / κ'], [T.st_dist2, 'dε/dx = α dT/dx = (α / κ) q']);
    } else s.push([T.st_wall, 'q = κ ΔT / w'], [T.st_wall2, `${T.st_wall3}`]);
    s.push([T.st_index, `M = ${K.f}${K.u ? `   [${K.u}]` : ''}`]);
    return s;
  }
  function renderDerive() {
    syncDerive();
    const d0 = dsel(), inp = dinp(), d = derive(d0, inp);
    const key = d.key;
    if (el.idx.value !== key) { el.idx.value = key; onIdx(); }
    let h = `<div class="ab-card"><h3>${esc(T.d_heading)}</h3><dl class="ab-fcro">
<dt>${esc(T.d_fun)}</dt><dd>${esc(optText('dfun', d.fun))}</dd>
<dt>${esc(T.d_con)}</dt><dd>${esc(optText('dcon', d.con))}</dd>
<dt>${esc(T.d_obj)}</dt><dd>${esc(optText('dobj', d.obj))}</dd>
<dt>${esc(T.d_free)}</dt><dd>${esc(optText('dfree', d.free))}</dd></dl>
<p>${esc(T[`dx_${d.fun}_${d.con}`] ?? '')}</p>
<ol class="ab-steps">${dsteps(d, inp).map(([l, f]) => `<li>${esc(l)}<code>${esc(f)}</code></li>`).join('')}</ol>
<p class="ab-eq big">M = ${esc(INDEX[key].f)}</p>
<p>${esc(T[`dm_${key}`] ?? '')}</p>
<div class="ab-btns"><button type="button" class="btn btn-ghost btn-small" data-go="chart">${esc(T.go_chart)} →</button><button type="button" class="btn btn-ghost btn-small" data-go="select">${esc(T.go_select)} →</button></div>
<p class="ab-src">${esc(T.d_src)}</p></div>`;
    // 寸法と荷重から、材料ごとの出力
    const out = d.out;
    const okIn = Object.entries(inp).every(([k, v]) => k === 'sup' || (fin(v) && v > 0));
    const rows = ASH.map(it => ({ it, ix: ixOf(it, key), o: outOf(it.get, out) })).filter(r => r.ix && r.o).sort((a, b) => b.ix.c - a.ix.c);
    const oName = T[`o_${d.fun}_${d.con}_${d.obj === 'perf' ? 'perf' : d.obj}`] ?? T[`o_${d.obj}`] ?? '';
    h += `<h3>${esc(cap(fill(T.d_out_heading, { o: oName })))}</h3>`;
    if (!okIn) h += warn(T.w_input);
    h += `<p>${esc(fill(T.d_out_lead, { f: INDEX[key].f, o: oName, u: out.u }))}</p>`;
    const head = [T.col_rank, T.col_mat, `${INDEX[key].f}`, `${cap(oName)} (${out.u})`, `${T.col_orange} (${out.u})`];
    const data = rows.map((r, i) => [i + 1, r.it.name, { t: fmt(r.ix.c), v: r.ix.c }, { t: fmt(r.o.c), v: r.o.c }, { t: rngT(r.o.lo, r.o.hi), v: `${Number(r.o.lo.toPrecision(4))}–${Number(r.o.hi.toPrecision(4))}` }]);
    h += tableHTML('derive', head, data.slice(0, 15), { rowHead: 1, left: [1], csvRows: data.map(r => r.map(c => (c && typeof c === 'object' ? c.v : c))) });
    if (data.length > 15) h += `<details><summary>${esc(fill(T.d_more, { n: data.length - 15 }))}</summary>${tableHTML('derive2', head, data.slice(15), { rowHead: 1, left: [1] })}</details>`;
    h += csvBtns('derive');
    const best = rows[0];
    if (best) {
      const n = outPow(key, out), pwT = n === -1 ? '1/M' : n === 1 ? 'M' : n === 2 ? 'M²' : `M^${num(n, 3)}`;
      h += `<p class="muted" style="font-size:.85rem">${esc(cap(fill(T.d_note_ratio, { a: best.it.name, o: oName, pw: pwT, dir: out.dir === 'low' ? T.dir_low : T.dir_high })))}</p>`;
    }
    part('top').innerHTML = h;
    // 図: 導いた指標の線(既定の値)
    const x = el.x.value, y = el.y.value, F = lineFit(key, x, y);
    let v = numv('v');
    if (!(fin(v) && v > 0)) v = INDEX[key].v;
    part('chartwrap').hidden = !F;
    if (F) {
      draw({ x, y, key, F, v, show: 'ell', env: true, items: ASH });
      part('slider-wrap').hidden = true;
      part('cap').textContent = fill(T.d_chart_cap, { f: INDEX[key].f, v: fmt(v), u: INDEX[key].u });
    }
    part('body').innerHTML = F ? '' : `<p class="muted">${esc(fill(T.w_nofit_any, { f: INDEX[key].f }))}</p>`;
  }

  // ---- 足切りと順位づけ ----
  function renderSelect() {
    const key = keyNow();
    let top = mdNote();
    const res = selectRun(key);
    const nAll = candidates().length;
    const nPart = res.list.filter(r => r.scr === 'part').length;
    top += `<div class="ab-chips">${res.conds.length ? res.conds.map(c => `<span>${esc(condText(c))}</span>`).join('') : `<span>${esc(T.no_cond)}</span>`}${el.sc_grp.value !== 'all' ? `<span>${esc(optText('sc_grp', el.sc_grp.value))}</span>` : ''}</div>`;
    top += stats([
      ['n-pass', T.s_pass, esc(fill(T.s_pass_fmt, { n: res.list.length, all: nAll, p: nPart }))],
      key ? ['idx', T.s_idx, esc(`${idxF(key)}${idxU(key) ? ` (${idxU(key)})` : ''}`)] : null,
    ]);
    if (el.src.value === 'all') top += warn(T.w_mix);
    if (el.src.value !== 'ash' && key && INDEX[key]?.ex.price) top += warn(T.w_price_md, true);
    if (res.conds.some(c => c.p === 'T')) top += warn(T.note_T, true);
    if (res.conds.some(c => c.p === 'res')) top += warn(T.note_el, true);
    const kinds = new Set(res.list.filter(r => r.it.kind === 'md' && r.it.vals.s).map(r => r.it.vals.s.k));
    if (key && exOf(key, el.x.value, el.y.value, slv())?.s && kinds.size > 1) top += warn(T.w_skind, true);
    if (res.list.slice(0, 10).some(r => GROUPS[r.it.g] === 'fiber')) top += warn(T.w_fiber, true);
    part('top').innerHTML = top;
    // 図: 足切りの結果を色で(外れた材料は薄く、一部だけ満たすものは破線)
    const x = el.x.value, y = el.y.value, F = key ? lineFit(key, x, y, slv()) : null;
    const scr = new Map();
    for (const r of res.list) scr.set(r.it.key, r.scr);
    for (const r of res.out) scr.set(r.it.key, 'fail');
    const items = candidates();
    part('chartwrap').hidden = false;
    let v = numv('v');
    if (key && !(fin(v) && v > 0)) v = key === 'free' ? 1 : INDEX[key].v;
    const n5 = res.list[Math.min(4, res.list.length - 1)];
    const v5 = F && n5 ? Number(n5.ix.c.toPrecision(3)) : v;
    draw({ x, y, key, F, v: v5, show: el.src.value === 'md' ? 'pts' : 'ell', env: false, scr, items });
    part('slider-wrap').hidden = true;
    part('cap').textContent = `${T.sel_cap}${F && n5 ? ` ${fill(T.sel_cap_line, { f: idxF(key), v: fmt(v5), u: idxU(key) })}` : ''}`;
    let h = `<h3>${esc(T.rank_sel_heading)}</h3>`;
    if (!key) h += `<p>${esc(T.no_index_sel)}</p>`;
    if (res.list.length) {
      const narrow = small();
      const both = res.list.some(r => r.it.kind === 'md') && res.list.some(r => r.it.kind === 'ash');
      const head = [T.col_rank, T.col_mat, ...(narrow ? [] : [T.col_group]), ...(both ? [T.col_kind] : []), ...(key ? [idxF(key), T.col_range, T.col_span] : []), T.col_scr, ''];
      const rows = res.list.map(r => [r.rank, r.it.name, ...(narrow ? [] : [gname(r.it.g)]), ...(both ? [kindText(r.it)] : []),
        ...(key ? [{ t: fmt(r.ix.c), v: r.ix.c }, rngT(r.ix.lo, r.ix.hi), { t: r.best === r.worst ? String(r.best) : `${r.best}–${r.worst}`, v: `${r.best}-${r.worst}` }] : []),
        r.scr === 'part' ? T.scr_part : T.scr_pass, { t: '', h: cmpBtn(r.it), v: '' }]);
      const csvHead = [T.col_rank, T.col_mat, T.col_group, T.col_kind, ...(key ? [`${idxF(key)} (${idxU(key)})`, `${T.col_lo}`, `${T.col_hi}`, T.col_best, T.col_worst] : []), T.col_scr, ...res.conds.map(condText), T.col_src];
      const csvRows = res.list.map(r => [r.rank, r.it.name, gname(r.it.g), kindText(r.it), ...(key ? [r.ix.c, r.ix.lo, r.ix.hi, r.best, r.worst] : []), r.scr === 'part' ? T.scr_part : T.scr_pass, ...r.each.map(s => T[`scr_${s}`] ?? s), srcNames(r.it).join(' / ')]);
      h += tableHTML('sel', head, rows, { rowHead: 1, left: [1], cls: res.list.map(r => [r.it.key === cur ? 'cur' : '', r.scr === 'part' ? 'part' : ''].join(' ').trim()), csvHead, csvRows });
      h += csvBtns('sel');
      h += `<p class="muted" style="font-size:.85rem">${esc(T.span_note)}</p>`;
    } else h += `<p>${esc(T.sel_none)}</p>`;
    if (res.noix.length) h += `<p class="muted" style="font-size:.85rem">${esc(fill(T.sel_noix, { list: res.noix.slice(0, 30).map(it => it.name).join(T.sep), n: res.noix.length }))}</p>`;
    if (res.out.length) {
      const why = res.out.filter(r => r.why !== 'grp');
      if (why.length) h += `<details><summary>${esc(fill(T.sel_out, { n: why.length }))}</summary>${tableHTML('out', [T.col_mat, T.col_why], why.map(r => [r.it.name, r.each.map((s, i) => (s === 'pass' ? null : `${condText(res.conds[i])}: ${T[`scr_${s}`]}`)).filter(Boolean).join(' / ')]), { left: [0, 1] })}</details>`;
    }
    if (cmp.length) h += `<div class="ab-btns"><button type="button" class="btn btn-ghost btn-small" data-go="compare">${esc(fill(T.go_compare, { n: cmp.length }))} →</button></div>`;
    part('body').innerHTML = h;
  }

  // ---- 比べる ----
  function renderCompare() {
    part('chartwrap').hidden = true;
    const key = keyNow();
    let h = mdNote();
    const list = cmp.map(byKey).filter(Boolean);
    const opts = [`<option value="">${esc(T.cmp_pick)}</option>`, `<optgroup label="${esc(T.kind_ash_long)}">${ASH.filter(it => !cmp.includes(it.key)).map(it => `<option value="${esc(it.key)}">${esc(it.name)}</option>`).join('')}</optgroup>`];
    if (MD) {
      const cls = MD.D.classes;
      for (const c of cls) {
        const its = MD.items.filter(it => it.cls === c.id && !cmp.includes(it.key));
        if (its.length) opts.push(`<optgroup label="${esc(`${T.kind_md}: ${c.name}`)}">${its.map(it => `<option value="${esc(it.key)}">${esc(it.name)}</option>`).join('')}</optgroup>`);
      }
    }
    h += `<div class="ab-pick"><label class="dy-field" style="flex: 1 1 260px; margin: 0"><span>${esc(T.cmp_add_label)}</span><select data-ab="add" ${cmp.length >= 4 ? 'disabled' : ''}>${opts.join('')}</select></label>${MD || mdState === 'loading' ? '' : `<button type="button" class="btn btn-ghost btn-small" data-loadmd>${esc(T.btn_loadmd)}</button>`}</div>`;
    if (list.length < 2) h += `<p>${esc(T.cmp_lead)}</p>`;
    if (list.length) {
      if (list.some(it => it.kind === 'ash') && list.some(it => it.kind === 'md')) h += warn(T.w_mix);
      if (list.some(it => GROUPS[it.g] === 'fiber')) h += warn(T.w_fiber, true);
      const ref = list[0];
      const props = PROPS.filter(p => list.some(it => it.get(p)));
      const head = [T.col_prop, ...list.map(it => it.name)];
      const cell = (it, p) => {
        const r = it.get(p);
        if (!r) return { t: '–', v: '' };
        const rr = ref.get(p);
        const ratio = rr && it !== ref ? Math.sqrt(r[0] * r[1]) / Math.sqrt(rr[0] * rr[1]) : null;
        const t = p === 'T' ? `${rngT(r[0] - C2K, r[1] - C2K, 4)} ${DEG}` : `${rngT(r[0], r[1])}`;
        return { t: ratio ? `${t} (×${fmt(ratio)})` : t, v: p === 'T' ? `${r[0] - C2K}–${r[1] - C2K}` : r[0] === r[1] ? r[0] : `${r[0]}–${r[1]}` };
      };
      const rows = props.map(p => [`${pname(p)} ${SYM[p]}${p === 'T' ? '' : ` (${UNIT[p]})`}`, ...list.map(it => cell(it, p))]);
      const keys = [...new Set([key, 'e1', 'e2', 's1', 'ks', 'ka'].filter(k => k && k !== 'free'))];
      for (const k of keys) {
        rows.push([`${k === key ? '★ ' : ''}${INDEX[k].f} (${INDEX[k].u})`, ...list.map(it => {
          const ix = ixOf(it, k), ix0 = ixOf(ref, k);
          if (!ix) return { t: '–', v: '' };
          const ratio = ix0 && it !== ref ? ix.c / ix0.c : null;
          return { t: `${fmt(ix.c)}${ratio ? ` (×${fmt(ratio)})` : ''}`, v: ix.c };
        })]);
      }
      if (list.some(it => it.kind === 'md')) rows.push([T.col_skind, ...list.map(it => (it.kind === 'ash' ? T[`sk_${GROUPS[it.g]}`] : strengthKind(it) || '–'))]);
      rows.push([T.col_kind, ...list.map(it => kindText(it))]);
      h += `<h3>${esc(T.cmp_heading)}</h3><p class="muted" style="font-size:.85rem">${esc(fill(T.cmp_ratio_note, { a: ref.name }))}</p>`;
      h += tableHTML('cmp', head, rows, { left: [0] });
      h += csvBtns('cmp');
      h += `<div class="ab-btns">${list.map(it => { const u = cardUrl(it); return `${u ? `<a class="btn btn-ghost btn-small" href="${esc(u)}">${esc(fill(T.ln_card_of, { m: it.name }))} →</a>` : ''}<button type="button" class="ab-x" data-cmp="${esc(it.key)}">${esc(fill(T.cmp_remove, { m: it.name }))}</button>`; }).join('')}</div>`;
      // 横棒: 今の指標(対数の横軸。範囲は細い線)
      const bk = key && key !== 'free' ? key : 'e2';
      const bars = list.map(it => ({ it, ix: ixOf(it, bk) })).filter(b => b.ix);
      if (bars.length) {
        const sm = small(), Wb = sm ? 340 : 620, Lw = sm ? 120 : 210, rowH = 30, Hb = 10 + rowH * bars.length + 30;
        const lo = Math.floor(Math.log10(Math.min(...bars.map(b => b.ix.lo)))), hi = Math.max(Math.ceil(Math.log10(Math.max(...bars.map(b => b.ix.hi)))), lo + 1);
        const X = v => Lw + (Math.log10(v) - lo) / (hi - lo) * (Wb - Lw - 14);
        // 名前の幅の見積り(12px の文字。全角・ハングルは 1 文字 12.5、大文字 8.6、小文字・数字 7.2、細い文字 3.6)。描いたあとに実際の幅で確かめて詰める
        const cw = c => (c.codePointAt(0) > 0x2e7f ? 12.5 : /[A-ZÄÖÜ]/.test(c) ? 8.6 : /[ilIjtf.,:;'’|!()\[\] ]/.test(c) ? 3.6 : 7.2);
        const clip = (t, px) => { let w = 0, o = ''; for (const c of t) { w += cw(c); if (w > px - 10) return `${o}…`; o += c; } return o; };
        let s = '';
        for (let e = lo; e <= hi; e++) s += `<line x1="${X(10 ** e)}" x2="${X(10 ** e)}" y1="8" y2="${Hb - 22}" stroke="var(--border)"/><text x="${X(10 ** e)}" y="${Hb - 6}" fill="var(--muted)" text-anchor="middle" style="font-size: 11px">${tick(e)}</text>`;
        bars.forEach((b, i) => {
          const yy = 10 + i * rowH;
          s += `<text x="${Lw - 6}" y="${yy + rowH / 2 + 4}" fill="var(--text)" text-anchor="end" style="font-size: 12px" data-ab-bn="${Lw - 8}" data-full="${esc(b.it.name)}"><title>${esc(b.it.name)}</title>${esc(clip(b.it.name, Lw - 6))}</text>`;
          s += `<rect x="${Lw}" y="${yy + 7}" width="${Math.max(X(b.ix.c) - Lw, 1).toFixed(1)}" height="${rowH - 14}" rx="3" style="fill: var(--ab-g${b.it.g})"/>`;
          if (b.ix.hi > b.ix.lo * (1 + 1e-9)) s += `<line x1="${X(b.ix.lo).toFixed(1)}" x2="${X(b.ix.hi).toFixed(1)}" y1="${yy + rowH / 2}" y2="${yy + rowH / 2}" stroke="var(--text)" stroke-width="1.5"/><line x1="${X(b.ix.lo).toFixed(1)}" x2="${X(b.ix.lo).toFixed(1)}" y1="${yy + rowH / 2 - 5}" y2="${yy + rowH / 2 + 5}" stroke="var(--text)"/><line x1="${X(b.ix.hi).toFixed(1)}" x2="${X(b.ix.hi).toFixed(1)}" y1="${yy + rowH / 2 - 5}" y2="${yy + rowH / 2 + 5}" stroke="var(--text)"/>`;
        });
        h += `<h3>${esc(fill(T.cmp_bar, { f: INDEX[bk].f, u: INDEX[bk].u }))}</h3><div class="fig"><svg viewBox="0 0 ${Wb} ${Hb}" role="img" aria-label="${esc(fill(T.cmp_bar, { f: INDEX[bk].f, u: INDEX[bk].u }))}" style="max-width: ${Wb}px; touch-action: manipulation">${s}</svg></div><p class="muted" style="font-size:.85rem">${esc(T.cmp_bar_note)}</p>`;
      }
    }
    part('top').innerHTML = h;
    part('body').innerHTML = '';
    // 横棒の材料名: 実際の幅で測り、入らなければ左端が切れないところまで詰める(測れないときは見積りの文字のまま)
    for (const t of part('top').querySelectorAll('[data-ab-bn]')) {
      const max = Number(t.dataset.abBn), full = [...t.dataset.full];
      const node = [...t.childNodes].find(n => n.nodeType === 3);
      if (!node) continue;
      const keep = node.textContent;
      node.textContent = full.join('');
      let len = 0;
      try { len = t.getComputedTextLength(); } catch { len = 0; }
      if (!len) { node.textContent = keep; continue; }
      let k = full.length;
      while (len > max && k > 1) { k--; node.textContent = `${full.slice(0, k).join('')}…`; len = t.getComputedTextLength(); }
    }
  }

  // ---- 練習 ----
  let openAns = new Set();
  function renderPractice() {
    part('chartwrap').hidden = true;
    let h = `<p>${esc(T.pq_lead)}</p>`;
    for (const q of PRACTICE) {
      const conds = Object.entries(q.sc).map(([n, v]) => { const s = SCREEN.find(x => x[0] === n); return { n, p: s[1], op: s[2], v: s[1] === 'T' ? v + C2K : v, shown: v }; });
      const r = selectRun(q.idx, { conds, grp: q.grp, part: 'keep', items: ASH });
      const top3 = r.list.slice(0, 5).map(x => `${x.it.name}${par(`${fmt(x.ix.c)}${x.scr === 'part' ? `, ${T.scr_part}` : ''}`)}`);
      h += `<div class="ab-card"><h3>${esc(T[`pq_${q.id}_q`])}</h3><p>${esc(T[`pq_${q.id}_body`])}</p>
<div class="ab-btns"><button type="button" class="btn btn-ghost btn-small" data-pq="${q.id}">${esc(T.pq_open)} →</button></div>
<details data-ans="${q.id}"${openAns.has(q.id) ? ' open' : ''}><summary>${esc(T.pq_ans)}</summary>
<p><strong>${esc(T.pq_index)}:</strong> M = ${esc(INDEX[q.idx].f)}${conds.length || q.grp !== 'all' ? `; ${esc([...conds.map(condText), ...(q.grp !== 'all' ? [optText('sc_grp', q.grp)] : [])].join(', '))}` : ''}</p>
<p><strong>${esc(T.pq_top)}:</strong> ${esc(top3.join(' > '))}</p>
<p>${esc(T[`pq_${q.id}_why`])}</p></details></div>`;
    }
    part('top').innerHTML = h;
    part('body').innerHTML = '';
  }
  box.addEventListener('toggle', e => { const d = e.target.closest?.('[data-ans]'); if (d) { if (d.open) openAns.add(d.dataset.ans); else openAns.delete(d.dataset.ans); } }, true);

  // ---- ボタン ----
  box.addEventListener('click', async e => {
    const t = e.target;
    const b = t.closest('[data-csv]');
    if (b) { if (tables[b.dataset.csv] && await copyText(csvText(b.dataset.csv))) flash(b, T.copied); return; }
    const sv = t.closest('[data-csv-save]');
    if (sv) {
      const name = sv.dataset.csvSave;
      if (!tables[name]) return;
      const blob = new Blob([`﻿${csvText(name)}\n`], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `material-selection-${name}.csv`;
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      return;
    }
    const c = t.closest('[data-cmp]');
    if (c) { toggleCmp(c.dataset.cmp); schedule(); return; }
    const g = t.closest('[data-go]');
    if (g) { setMode(g.dataset.go); window.scrollTo({ top: form.getBoundingClientRect().top + window.scrollY - 10, behavior: 'smooth' }); return; }
    const f = t.closest('[data-fit]');
    if (f) { const I = INDEX[f.dataset.fit]; el.y.value = I.ax[0]; el.x.value = I.ax[1]; fire(); return; }
    if (t.closest('[data-loadmd]')) { loadMd(); return; }
    const pq = t.closest('[data-pq]');
    if (pq) {
      const q = PRACTICE.find(x => x.id === pq.dataset.pq);
      for (const [n] of SCREEN) el[n].value = '';
      for (const [n, v] of Object.entries(q.sc)) el[n].value = String(v);
      el.sc_el.value = 'any'; el.sc_grp.value = q.grp; el.sc_part.value = 'keep'; el.src.value = 'ash';
      el.idx.value = q.idx; onIdx();
      setMode('select');
      window.scrollTo({ top: form.getBoundingClientRect().top + window.scrollY - 10, behavior: 'smooth' });
    }
  });
  box.addEventListener('change', e => {
    const s = e.target.closest('[data-ab="add"]');
    if (s && s.value) { toggleCmp(s.value); if (s.value.startsWith('m:')) loadMd(); schedule(); }
  });

  // ---- 結果のコピー(今のモードで見えている入力と結果だけ。共通の部品より先に受ける) ----
  const clean = n => n?.textContent.trim().replace(/\s+/g, ' ') ?? '';
  function resultText() {
    const lines = [clean(document.querySelector('h1')), `[${optText('mode', modeSel.value)}]`, ''];
    for (const f of el) if (f.name && f.name !== 'mode' && !lab(f.name).hidden && String(f.value).trim() !== '') lines.push(`${clean(lab(f.name).querySelector('span'))}: ${f.tagName === 'SELECT' ? clean(f.selectedOptions[0]) : f.value}`);
    for (const n of box.querySelectorAll('[data-ab-warn]')) lines.push('', `! ${clean(n)}`);
    for (const node of box.querySelectorAll('h3, .dy-stats > div, table, .ab-eq')) {
      if (node.closest('[hidden]')) continue;
      if (node.tagName === 'H3') lines.push('', `[${clean(node)}]`);
      else if (node.tagName === 'TABLE') for (const row of node.rows) lines.push([...row.cells].map(clean).join('\t'));
      else if (node.classList.contains('ab-eq')) lines.push(clean(node));
      else lines.push(`${clean(node.querySelector('dt'))}: ${clean(node.querySelector('dd'))}`);
    }
    lines.push('', location.href);
    return lines.join('\n');
  }
  document.querySelector('[data-tool-id]')?.addEventListener('click', async e => {
    const b = e.target.closest('[data-copy-result]');
    if (!b) return;
    e.stopPropagation();
    if (await copyText(resultText())) flash(b, b.dataset.done);
  }, true);

  // ---- 描き直し ----
  let raf = 0;
  const render = () => {
    const mode = modeSel.value;
    if (mode === 'derive') syncDerive();
    visible();
    if (needMd() && mdState === 'idle') loadMd();
    try {
      if (mode === 'chart') renderChart();
      else if (mode === 'derive') renderDerive();
      else if (mode === 'select') renderSelect();
      else if (mode === 'compare') renderCompare();
      else renderPractice();
    } catch (err) {
      part('top').innerHTML = warn(T.w_error);
      console.error(err);
    }
  };
  const schedule = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(render); };
  form.addEventListener('input', schedule);
  form.addEventListener('change', schedule);
  form.addEventListener('submit', e => e.preventDefault());
  let lastW = small();
  if (window.ResizeObserver) new ResizeObserver(() => { const w = small(); if (w !== lastW) { lastW = w; render(); } }).observe(box);
  syncDerive();
  // URL で指標だけ渡されて線の位置 v がないとき(ほかのツールからのリンク)は、Ashby の範囲の材料の指標の中央値に線を置く
  {
    // 共通の共有の部品(tool-share.js)が先に全部の欄をクエリに書き込むので、開いたときの URL(navigation の記録)で見る
    let u0 = location.href;
    try { u0 = performance.getEntriesByType('navigation')[0]?.name || u0; } catch { /* 古いブラウザは今の URL */ }
    const q = new URL(u0, location.href).searchParams, k = q.get('idx');
    if (k && INDEX[k] && !q.has('v')) {
      const cs = MATS.map(m => indexOf(m, k)?.c).filter(fin).sort((a, b) => a - b);
      if (cs.length) {
        const n = cs.length, med = n % 2 ? cs[(n - 1) / 2] : Math.sqrt(cs[n / 2 - 1] * cs[n / 2]);
        el.v.value = String(Number(med.toPrecision(2)));
        form.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  }
  render();
}
