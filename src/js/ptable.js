// 材料のための周期表。元素ごとに、25 °C・1 atm での結晶構造、格子定数、密度、融点、ヤング率、金属結合半径、同素変態を示す。
// 値の元は review の scripts/ptable_data.py(この配列は make_js.py がそこから作る)、元素ごと・項目ごとの出典は sources.md。
//   格子定数 nm: ASM Alloy Phase Diagram Database の表(25 °C、Zn・Tc は WebElements)
//   密度 g/cm³: CRC Handbook(格子定数と原子量から計算した密度と 1.5 % 以上違うものは Wolfram ElementData)
//   融点 °C: CRC Handbook(1 atm。S・Ga・Kr・Xe は WebElements)、ヤング率 GPa: WebElements(希土類などは CRC)、金属結合半径 pm: 12配位の値(WebElements)
//   x: 格子定数と原子量から計算した密度、h: 最近接原子間距離の半分 pm、f: 剛体球の充填率(どれも make_js.py で計算)
// 項目: z 原子番号、s 記号、c 構造(bcc fcc hcp dia oth gas liq unk)、st そのほかの構造の種類、a b cc 格子定数 nm、ang 菱面体晶の角、
//   ls 格子定数の出典、d 密度、ds 密度の出典、mp 融点、ms 融点の出典(WEL、ないものは CRC)、mn 融点の注記、E ヤング率(配列は範囲)、Es 出典、rm 金属結合半径、
//   tr 同素変態 [温度 °C, up(以上)/down(以下)/meta(準安定), 相, 構造]
import { num } from './eng.js';

export const EL = [
  // <data>
  {z:1,s:"H",c:"gas",mp:-259.16},
  {z:2,s:"He",c:"gas",mn:"he"},
  {z:3,s:"Li",c:"bcc",a:0.35093,ls:"ASM",d:0.534,ds:"CRC",x:0.5333,mp:180.5,E:4.9,Es:"WEL",rm:152,h:152.0,f:0.68,tr:[[-193, "down", "α", "hcp"]]},
  {z:4,s:"Be",c:"hcp",a:0.22859,cc:0.35845,ls:"ASM",d:1.85,ds:"CRC",x:1.845,mp:1287,E:287,Es:"WEL",rm:112,h:111.3,f:0.712,tr:[[1270, "up", "β", "bcc"]]},
  {z:5,s:"B",c:"oth",st:"rhombB",d:2.34,ds:"CRC",mp:2075},
  {z:6,s:"C",c:"oth",st:"graphite",a:0.24612,cc:0.6709,ls:"ASM",d:2.267,ds:"WP",mn:"c",tr:[[null, "meta", "diamond", "dia"]]},
  {z:7,s:"N",c:"gas",mp:-210.0},
  {z:8,s:"O",c:"gas",mp:-218.79},
  {z:9,s:"F",c:"gas",mp:-219.67},
  {z:10,s:"Ne",c:"gas",mp:-248.59},
  {z:11,s:"Na",c:"bcc",a:0.42906,ls:"ASM",d:0.97,ds:"CRC",x:0.9666,mp:97.794,E:10,Es:"WEL",rm:186,h:185.8,f:0.68,tr:[[-233, "down", "α", "hcp"]]},
  {z:12,s:"Mg",c:"hcp",a:0.32094,cc:0.52107,ls:"ASM",d:1.74,ds:"CRC",x:1.737,mp:650,E:45,Es:"WEL",rm:160,h:159.9,f:0.736},
  {z:13,s:"Al",c:"fcc",a:0.40496,ls:"ASM",d:2.7,ds:"CRC",x:2.699,mp:660.32,E:70,Es:"WEL",rm:143,h:143.2,f:0.74},
  {z:14,s:"Si",c:"dia",a:0.54306,ls:"ASM",d:2.329,ds:"CRC",x:2.33,mp:1414,E:[130, 188],Es:"WEL+H10",h:117.6,f:0.34},
  {z:15,s:"P",c:"oth",st:"P",d:1.823,ds:"CRC",mp:44.15},
  {z:16,s:"S",c:"oth",st:"alphaS",a:1.0464,b:1.2866,cc:2.4486,ls:"ASM",d:2.07,ds:"CRC",mp:115.21,ms:"WEL",tr:[[95.5, "up", "β", "mono"]]},
  {z:17,s:"Cl",c:"gas",mp:-101.5},
  {z:18,s:"Ar",c:"gas",mp:-189.34},
  {z:19,s:"K",c:"bcc",a:0.5321,ls:"ASM",d:0.856,ds:"ED",x:0.8619,mp:63.5,rm:227,h:230.4,f:0.68},
  {z:20,s:"Ca",c:"fcc",a:0.55884,ls:"ASM",d:1.54,ds:"CRC",x:1.525,mp:842,E:20,Es:"WEL",rm:197,h:197.6,f:0.74,tr:[[443, "up", "β", "bcc"]]},
  {z:21,s:"Sc",c:"hcp",a:0.33088,cc:0.5268,ls:"ASM",d:2.99,ds:"CRC",x:2.989,mp:1541,E:74.4,Es:"CRC",rm:162,h:162.7,f:0.722,tr:[[1337, "up", "β", "bcc"]]},
  {z:22,s:"Ti",c:"hcp",a:0.29506,cc:0.46835,ls:"ASM",d:4.506,ds:"CRC",x:4.502,mp:1668,E:116,Es:"WEL",rm:147,h:144.8,f:0.72,tr:[[882, "up", "β", "bcc"]]},
  {z:23,s:"V",c:"bcc",a:0.3024,ls:"ASM",d:6.11,ds:"ED",x:6.118,mp:1910,E:128,Es:"WEL",rm:134,h:130.9,f:0.68},
  {z:24,s:"Cr",c:"bcc",a:0.28848,ls:"ASM",d:7.15,ds:"CRC",x:7.193,mp:1907,E:279,Es:"WEL",rm:128,h:124.9,f:0.68},
  {z:25,s:"Mn",c:"oth",st:"alphaMn",a:0.89126,ls:"ASM",d:7.47,ds:"ED",mp:1246,E:198,Es:"WEL",rm:127,tr:[[727, "up", "β", "cP20"], [1100, "up", "γ", "fcc"], [1138, "up", "δ", "bcc"]]},
  {z:26,s:"Fe",c:"bcc",a:0.28665,ls:"ASM",d:7.87,ds:"CRC",x:7.874,mp:1538,E:211,Es:"WEL",rm:126,h:124.1,f:0.68,tr:[[912, "up", "γ", "fcc"], [1394, "up", "δ", "bcc"]]},
  {z:27,s:"Co",c:"hcp",a:0.25071,cc:0.40686,ls:"ASM",d:8.86,ds:"CRC",x:8.837,mp:1495,E:209,Es:"WEL",rm:125,h:124.8,f:0.736,tr:[[422, "up", "α", "fcc"]]},
  {z:28,s:"Ni",c:"fcc",a:0.3524,ls:"ASM",d:8.9,ds:"CRC",x:8.908,mp:1455,E:200,Es:"WEL",rm:124,h:124.6,f:0.74},
  {z:29,s:"Cu",c:"fcc",a:0.36146,ls:"ASM",d:8.96,ds:"CRC",x:8.938,mp:1084.62,E:130,Es:"WEL",rm:128,h:127.8,f:0.74},
  {z:30,s:"Zn",c:"hcp",a:0.26649,cc:0.49468,ls:"WEL",d:7.14,ds:"CRC",x:7.137,mp:419.53,E:108,Es:"WEL",rm:134,h:133.2,f:0.651},
  {z:31,s:"Ga",c:"oth",st:"alphaGa",a:0.45186,b:0.7657,cc:0.45258,ls:"ASM",d:5.91,ds:"CRC",mp:29.76,ms:"WEL",rm:135},
  {z:32,s:"Ge",c:"dia",a:0.56574,ls:"ASM",d:5.3234,ds:"CRC",x:5.328,mp:938.25,h:122.5,f:0.34},
  {z:33,s:"As",c:"oth",st:"alphaAs",a:0.41319,ang:54.12,ls:"ASM",d:5.75,ds:"CRC",mn:"as",E:8,Es:"WEL"},
  {z:34,s:"Se",c:"oth",st:"gammaSe",a:0.43659,cc:0.49537,ls:"ASM",d:4.81,ds:"CRC",mp:220.5,E:10,Es:"WEL"},
  {z:35,s:"Br",c:"liq",d:3.1028,ds:"CRC",mp:-7.2},
  {z:36,s:"Kr",c:"gas",mp:-157.37,ms:"WEL"},
  {z:37,s:"Rb",c:"bcc",a:0.5705,ls:"ASM",d:1.53,ds:"CRC",x:1.529,mp:39.3,E:2.4,Es:"WEL",rm:248,h:247.0,f:0.68},
  {z:38,s:"Sr",c:"fcc",a:0.6084,ls:"ASM",d:2.64,ds:"CRC",x:2.584,mp:777,rm:215,h:215.1,f:0.74,tr:[[547, "up", "β", "bcc"]]},
  {z:39,s:"Y",c:"hcp",a:0.36482,cc:0.57318,ls:"ASM",d:4.47,ds:"CRC",x:4.469,mp:1522,E:63.5,Es:"CRC",rm:180,h:177.8,f:0.713,tr:[[1478, "up", "β", "bcc"]]},
  {z:40,s:"Zr",c:"hcp",a:0.32316,cc:0.51475,ls:"ASM",d:6.52,ds:"CRC",x:6.508,mp:1855,rm:160,h:158.9,f:0.723,tr:[[863, "up", "β", "bcc"]]},
  {z:41,s:"Nb",c:"bcc",a:0.33004,ls:"ASM",d:8.57,ds:"CRC",x:8.583,mp:2477,E:105,Es:"WEL",rm:146,h:142.9,f:0.68},
  {z:42,s:"Mo",c:"bcc",a:0.3147,ls:"ASM",d:10.2,ds:"CRC",x:10.22,mp:2623,E:329,Es:"WEL",rm:139,h:136.3,f:0.68},
  {z:43,s:"Tc",c:"hcp",a:0.2735,cc:0.4388,ls:"WEL",d:11.5,ds:"ED",x:11.45,mp:2157,rm:136,h:135.2,f:0.728},
  {z:44,s:"Ru",c:"hcp",a:0.27058,cc:0.42816,ls:"ASM",d:12.37,ds:"ED",x:12.36,mp:2334,E:447,Es:"WEL",rm:134,h:132.5,f:0.718},
  {z:45,s:"Rh",c:"fcc",a:0.38032,ls:"ASM",d:12.4,ds:"CRC",x:12.43,mp:1964,rm:134,h:134.5,f:0.74},
  {z:46,s:"Pd",c:"fcc",a:0.38903,ls:"ASM",d:12.0,ds:"CRC",x:12.01,mp:1554.9,E:121,Es:"WEL",rm:137,h:137.5,f:0.74},
  {z:47,s:"Ag",c:"fcc",a:0.40857,ls:"ASM",d:10.5,ds:"CRC",x:10.51,mp:961.78,E:83,Es:"WEL",rm:144,h:144.5,f:0.74},
  {z:48,s:"Cd",c:"hcp",a:0.29793,cc:0.56196,ls:"ASM",d:8.69,ds:"CRC",x:8.642,mp:321.07,E:50,Es:"WEL",rm:151,h:149.0,f:0.641},
  {z:49,s:"In",c:"oth",st:"In",a:0.3253,cc:0.4947,ls:"ASM",d:7.31,ds:"CRC",mp:156.6,E:11,Es:"WEL",rm:167},
  {z:50,s:"Sn",c:"oth",st:"betaSn",a:0.58318,cc:0.31818,ls:"ASM",d:7.265,ds:"CRC",mp:231.93,E:50,Es:"WEL",tr:[[13, "down", "α", "dia"]]},
  {z:51,s:"Sb",c:"oth",st:"alphaAs",a:0.45067,ang:57.11,ls:"ASM",d:6.68,ds:"CRC",mp:630.63,E:55,Es:"WEL"},
  {z:52,s:"Te",c:"oth",st:"gammaSe",a:0.44566,cc:0.59264,ls:"ASM",d:6.24,ds:"CRC",mp:449.51,E:43,Es:"WEL"},
  {z:53,s:"I",c:"oth",st:"I2",a:0.72697,b:0.47903,cc:0.97942,ls:"ASM",d:4.933,ds:"CRC",mp:113.7},
  {z:54,s:"Xe",c:"gas",mp:-111.7,ms:"WEL"},
  {z:55,s:"Cs",c:"bcc",a:0.6141,ls:"ASM",d:1.93,ds:"CRC",x:1.906,mp:28.5,E:1.7,Es:"WEL",rm:265,h:265.9,f:0.68},
  {z:56,s:"Ba",c:"bcc",a:0.50227,ls:"ASM",d:3.62,ds:"CRC",x:3.599,mp:727,E:13,Es:"WEL",rm:222,h:217.5,f:0.68},
  {z:57,s:"La",c:"oth",st:"dhcp",a:0.3774,cc:1.2171,ls:"ASM",d:6.15,ds:"CRC",mp:918,E:36.6,Es:"CRC",rm:187,tr:[[310, "up", "β", "fcc"], [865, "up", "γ", "bcc"]]},
  {z:58,s:"Ce",c:"oth",st:"dhcp",a:0.3681,cc:1.1857,ls:"ASM",d:6.689,ds:"ED",mp:798,E:33.6,Es:"CRC",rm:181.8,tr:[[61, "up", "γ", "fcc"], [726, "up", "δ", "bcc"], [-177, "down", "α", "fcc"]]},
  {z:59,s:"Pr",c:"oth",st:"dhcp",a:0.36721,cc:1.18326,ls:"ASM",d:6.77,ds:"CRC",mp:931,E:37.3,Es:"CRC",rm:182.4,tr:[[795, "up", "β", "bcc"]]},
  {z:60,s:"Nd",c:"oth",st:"dhcp",a:0.36582,cc:1.17966,ls:"ASM",d:7.01,ds:"CRC",mp:1021,E:41.4,Es:"CRC",rm:181.4,tr:[[863, "up", "β", "bcc"]]},
  {z:61,s:"Pm",c:"oth",st:"dhcp",a:0.365,cc:1.165,ls:"ASM",d:7.26,ds:"CRC",mp:1042,rm:183.4},
  {z:62,s:"Sm",c:"oth",st:"Sm",a:0.3629,cc:2.6207,ls:"ASM",d:7.52,ds:"CRC",mp:1074,E:49.7,Es:"CRC",rm:180.4,tr:[[734, "up", "β", "hcp"], [922, "up", "γ", "bcc"]]},
  {z:63,s:"Eu",c:"bcc",a:0.45827,ls:"ASM",d:5.24,ds:"CRC",x:5.244,mp:822,E:18.2,Es:"CRC",h:198.4,f:0.68},
  {z:64,s:"Gd",c:"hcp",a:0.36336,cc:0.5781,ls:"ASM",d:7.9,ds:"CRC",x:7.901,mp:1313,E:54.8,Es:"CRC",rm:180.4,h:178.6,f:0.722,tr:[[1235, "up", "β", "bcc"]]},
  {z:65,s:"Tb",c:"hcp",a:0.36055,cc:0.56966,ls:"ASM",d:8.23,ds:"CRC",x:8.23,mp:1356,E:55.7,Es:"CRC",rm:177.3,h:176.4,f:0.717,tr:[[1289, "up", "β", "bcc"], [-53, "down", "α", "orth"]]},
  {z:66,s:"Dy",c:"hcp",a:0.35915,cc:0.56501,ls:"ASM",d:8.55,ds:"CRC",x:8.551,mp:1412,E:61.4,Es:"CRC",rm:178.1,h:175.2,f:0.714,tr:[[1381, "up", "β", "bcc"], [-187, "down", "α′", "orth"]]},
  {z:67,s:"Ho",c:"hcp",a:0.35778,cc:0.56178,ls:"ASM",d:8.8,ds:"CRC",x:8.795,mp:1474,E:64.8,Es:"CRC",rm:176.2,h:174.3,f:0.713},
  {z:68,s:"Er",c:"hcp",a:0.35592,cc:0.5585,ls:"ASM",d:9.07,ds:"CRC",x:9.066,mp:1529,E:69.9,Es:"CRC",rm:176.1,h:173.4,f:0.712},
  {z:69,s:"Tm",c:"hcp",a:0.35375,cc:0.5554,ls:"ASM",d:9.32,ds:"CRC",x:9.321,mp:1545,E:74.0,Es:"CRC",rm:175.9,h:172.4,f:0.713},
  {z:70,s:"Yb",c:"fcc",a:0.54848,ls:"ASM",d:6.9,ds:"CRC",x:6.966,mp:819,E:23.9,Es:"CRC",h:193.9,f:0.74,tr:[[795, "up", "γ", "bcc"], [-3, "down", "α", "hcp"]]},
  {z:71,s:"Lu",c:"hcp",a:0.35052,cc:0.55494,ls:"ASM",d:9.84,ds:"CRC",x:9.841,mp:1663,E:68.6,Es:"CRC",rm:173.8,h:171.7,f:0.718},
  {z:72,s:"Hf",c:"hcp",a:0.31946,cc:0.5051,ls:"ASM",d:13.3,ds:"CRC",x:13.28,mp:2233,rm:159,h:156.4,f:0.717,tr:[[1743, "up", "β", "bcc"]]},
  {z:73,s:"Ta",c:"bcc",a:0.3303,ls:"ASM",d:16.65,ds:"ED",x:16.68,mp:3017,E:186,Es:"WEL",rm:146,h:143.0,f:0.68},
  {z:74,s:"W",c:"bcc",a:0.31652,ls:"ASM",d:19.3,ds:"CRC",x:19.25,mp:3422,E:411,Es:"WEL",rm:139,h:137.1,f:0.68},
  {z:75,s:"Re",c:"hcp",a:0.27609,cc:0.4458,ls:"ASM",d:20.8,ds:"CRC",x:21.01,mp:3186,E:463,Es:"WEL",rm:137,h:137.0,f:0.732},
  {z:76,s:"Os",c:"hcp",a:0.27341,cc:0.43198,ls:"ASM",d:22.59,ds:"CRC",x:22.59,mp:3033,rm:135,h:133.8,f:0.717},
  {z:77,s:"Ir",c:"fcc",a:0.38392,ls:"ASM",d:22.5,ds:"CRC",x:22.56,mp:2446,E:528,Es:"WEL",rm:135.5,h:135.7,f:0.74},
  {z:78,s:"Pt",c:"fcc",a:0.39236,ls:"ASM",d:21.5,ds:"CRC",x:21.45,mp:1768.4,E:168,Es:"WEL",rm:138.5,h:138.7,f:0.74},
  {z:79,s:"Au",c:"fcc",a:0.40782,ls:"ASM",d:19.3,ds:"CRC",x:19.29,mp:1064.18,E:78,Es:"WEL",rm:144,h:144.2,f:0.74},
  {z:80,s:"Hg",c:"liq",d:13.5336,ds:"CRC",mp:-38.83,rm:151},
  {z:81,s:"Tl",c:"hcp",a:0.34566,cc:0.55248,ls:"ASM",d:11.8,ds:"CRC",x:11.87,mp:304,E:8,Es:"WEL",rm:170,h:170.4,f:0.725,tr:[[230, "up", "β", "bcc"]]},
  {z:82,s:"Pb",c:"fcc",a:0.49502,ls:"ASM",d:11.3,ds:"CRC",x:11.35,mp:327.46,E:16,Es:"WEL",h:175.0,f:0.74},
  {z:83,s:"Bi",c:"oth",st:"alphaAs",a:0.4746,ang:57.23,ls:"ASM",d:9.79,ds:"CRC",mp:271.4,E:32,Es:"WEL"},
  {z:84,s:"Po",c:"oth",st:"sc",a:0.3366,ls:"ASM",d:9.2,ds:"CRC",x:9.1,mp:254,h:168.3,f:0.524,tr:[[54, "up", "β", "rhomb"]]},
  {z:85,s:"At",c:"unk"},
  {z:86,s:"Rn",c:"gas",mp:-71},
  // </data>
];

// 周期表の位置: [行, 列]。ランタノイド(57〜71)は下の別の段(8行目。7行目は 86 番までなので空き)
export function pos(z) {
  if (z === 1) return [1, 1];
  if (z === 2) return [1, 18];
  if (z <= 10) return [2, z <= 4 ? z - 2 : z + 8];
  if (z <= 18) return [3, z <= 12 ? z - 10 : z];
  if (z <= 36) return [4, z - 18];
  if (z <= 54) return [5, z - 36];
  if (z <= 56) return [6, z - 54];
  if (z <= 71) return [8, z - 54];
  return [6, z - 68];
}

// 濃淡の区切り(下の値以上で次の段)。E は数値のものだけ(範囲で示した Si は塗らない)
export const BINS = {
  mp: [0, 400, 1000, 1600, 2400],
  rho: [2, 4, 7, 10, 15],
  E: [20, 50, 100, 200, 300],
};
export const valueOf = (e, view) => (view === 'mp' ? e.mp : view === 'rho' ? (e.c === 'gas' ? undefined : e.d) : view === 'E' ? (typeof e.E === 'number' ? e.E : undefined) : undefined);
export const binOf = (v, view) => (v == null ? -1 : BINS[view].filter(b => v >= b).length);
const SHADE = [4, 15, 26, 37, 48, 60]; // var(--accent) を混ぜる割合 %(明るい表示でも暗い表示でも文字が読める範囲)
// XRD ツールで開ける構造(25 °C の相)と、最初に出る反射
const XRD = { bcc: ['bcc', [1, 1, 0]], fcc: ['fcc', [1, 1, 1]], dia: ['diamond', [1, 1, 1]], sc: ['sc', [1, 0, 0]] };
const DIAMOND_A = 0.35669; // 炭素のダイヤモンド(準安定)の格子定数(ASM、25 °C)

const form = document.getElementById('ptable-form');
if (form) {
  const T = JSON.parse(form.dataset.text);
  const el = form.elements;
  const out = k => document.querySelector(`[data-out="${k}"]`);
  const home = document.documentElement.dataset.home ?? '/';
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const BY = Object.fromEntries(EL.map(e => [e.s, e]));
  // 選択肢の文字「26 Fe 鉄」から名前を取り出す
  const NAME = Object.fromEntries([...el.el.options].map(o => [o.value, o.textContent.split(' ').slice(2).join(' ')]));
  // 資料の桁数のまま、その言語の数の書き方で出す
  const sig = v => String(Math.abs(v)).replace('.', '').replace(/^0+/, '').length || 1;
  // 4桁の数(1538 ℃など)は桁区切りを入れない
  const ungroup = (t, v) => (Math.abs(v) >= 1000 && Math.abs(v) < 10000 ? t.replace(/(\d)[,.\s\u00a0\u202f](?=\d{3}(?!\d))/, '$1') : t);
  const f = v => ungroup(num(v, Math.max(sig(v), 1)), v);
  const tag = s => (s ? ` <small class="muted">(${esc(s)})</small>` : '');

  // この画面だけの見た目(マスの大きさと色)。色はサイトの図の色(暗い表示でも切り替わる)
  const css = document.createElement('style');
  css.textContent = `
.pt-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; margin: 0 -4px; padding: 4px; }
.pt-grid { display: grid; grid-template-columns: repeat(18, minmax(34px, 1fr)); gap: 2px; min-width: 640px; }
.pt-cell { display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 46px; padding: 2px 1px; border: 1px solid var(--border); border-radius: 5px; background: var(--surface); color: var(--text); font: inherit; line-height: 1.1; cursor: pointer; }
.pt-cell:hover { border-color: var(--accent); }
.pt-cell[aria-pressed="true"] { outline: 3px solid var(--accent); outline-offset: 0; position: relative; z-index: 1; }
.pt-cell .pt-z { font-size: 9px; color: var(--muted); }
.pt-cell b { font-size: 14px; }
.pt-cell .pt-v { font-size: 9.5px; font-weight: 700; white-space: nowrap; }
.pt-bcc { background: var(--fig-n); } .pt-fcc { background: var(--fig-p); } .pt-hcp { background: var(--fig-ox); }
.pt-dia { background: var(--fig-ng); } .pt-oth { background: var(--fig-metal); }
.pt-gas, .pt-liq { background: var(--fig-dep); border-style: dashed; } .pt-unk { border-style: dotted; }
.pt-none { background: var(--surface); border-style: dotted; }
.pt-gap { grid-column: 1 / -1; height: 6px; }
.pt-head { font-size: 10px; color: var(--muted); text-align: center; align-self: end; }
.pt-lab { display: flex; align-items: center; justify-content: center; font-size: 10px; color: var(--muted); text-align: center; line-height: 1.2; border: 1px dashed var(--border); border-radius: 5px; }
.pt-legend { display: flex; flex-wrap: wrap; gap: 6px 14px; margin: 10px 0 0; padding: 0; list-style: none; font-size: .85rem; }
.pt-legend li { display: inline-flex; align-items: center; gap: 6px; }
.pt-key { display: inline-flex; align-items: center; justify-content: center; min-width: 22px; height: 20px; padding: 0 3px; border: 1px solid var(--border); border-radius: 4px; font-size: 11px; font-weight: 700; }
.pt-detail th { white-space: normal; text-align: left; width: 38%; font-weight: 600; color: var(--muted); }
.pt-detail td { white-space: normal; text-align: left; overflow-wrap: anywhere; }
.pt-detail ul { margin: 0; padding-left: 1.1em; }
@media (max-width: 480px) { .pt-detail th { width: 34%; font-size: .85rem; } .pt-detail th, .pt-detail td { padding: 7px 8px; } }
`;
  document.head.append(css);

  // 濃淡の表示: 段ごとに var(--accent) を混ぜる
  const shade = b => (b < 0 ? '' : `background: color-mix(in srgb, var(--accent) ${SHADE[b]}%, var(--surface));`);
  const CODE = { bcc: 'B', fcc: 'F', hcp: 'H', dia: 'D', oth: 'O', gas: 'G', liq: 'L', unk: '?' };
  // マスに出す短い値
  const short = (e, view) => {
    const v = valueOf(e, view);
    if (v == null) return view === 'E' && Array.isArray(e.E) ? `${num(e.E[0], 3)}–` : '—';
    if (view === 'mp') return num(Math.round(v), 4).replace(/[,\s.  ](?=\d{3}$)/, '');
    return view === 'rho' ? num(v, v < 10 ? 2 : 3) : num(v, v < 10 ? 2 : 3).replace(/[,\s.  ](?=\d{3}$)/, '');
  };

  const tbl = out('table');
  function drawTable(view, sel) {
    const cells = [];
    for (let g = 1; g <= 18; g++) cells.push(`<div class="pt-head" style="grid-row: 1; grid-column: ${g}">${g}</div>`);
    for (const e of EL) {
      const [r, c] = pos(e.z);
      const v = view === 'struct' ? null : valueOf(e, view);
      const cls = view === 'struct' ? `pt-${e.c}` : v == null ? 'pt-none' : '';
      const style = `grid-row: ${r + 1}; grid-column: ${c};${view === 'struct' ? '' : shade(binOf(v, view))}`;
      const val = view === 'struct' ? CODE[e.c] : short(e, view);
      const label = `${e.z} ${e.s} ${NAME[e.s]}: ${view === 'struct' ? T[`s_${e.c}`] : val}`;
      cells.push(`<button type="button" class="pt-cell ${cls}" style="${style}" data-el="${e.s}" aria-pressed="${e.s === sel}" aria-label="${esc(label)}"><span class="pt-z">${e.z}</span><b>${e.s}</b><span class="pt-v">${esc(val)}</span></button>`);
    }
    cells.push(`<div class="pt-lab" style="grid-row: 7; grid-column: 3">57–71</div>`);
    cells.push(`<div class="pt-gap" style="grid-row: 8"></div>`);
    cells.push(`<div class="pt-lab" style="grid-row: 9; grid-column: 1 / span 2">${esc(T.lanth)}</div>`);
    // 濃淡と構造の凡例
    let legend;
    if (view === 'struct') {
      legend = ['bcc', 'fcc', 'hcp', 'dia', 'oth', 'gas', 'liq', 'unk'].map(k => `<li><span class="pt-key pt-${k}">${CODE[k]}</span>${esc(T[`s_${k}`])}</li>`).join('');
    } else {
      const b = BINS[view], u = T[`u_${view}`];
      const lab = i => (i === 0 ? `< ${num(b[0], 4)}` : i === b.length ? `≥ ${num(b[b.length - 1], 4)}` : `${num(b[i - 1], 4)}–${num(b[i], 4)}`);
      legend = b.concat([null]).map((_, i) => `<li><span class="pt-key" style="${shade(i)}">&nbsp;</span>${esc(lab(i))} ${esc(u)}</li>`).join('')
        + `<li><span class="pt-key pt-none">—</span>${esc(T[`none_${view}`])}</li>`;
    }
    tbl.innerHTML = `<p class="muted" style="margin: 0 0 6px; font-size: .85rem">${esc(T.hint)}</p>
<div class="pt-scroll" tabindex="0" aria-label="${esc(T.scroll_label)}"><div class="pt-grid" role="group" aria-label="${esc(T[`view_label_${view}`])}">${cells.join('')}</div></div>
<p style="margin: 10px 0 0; font-size: .85rem; font-weight: 700">${esc(T[`legend_${view}`])}</p>
<ul class="pt-legend">${legend}</ul>`;
  }
  tbl.addEventListener('click', ev => {
    const b = ev.target.closest('[data-el]');
    if (!b) return;
    el.el.value = b.dataset.el;
    form.dispatchEvent(new Event('input', { bubbles: true }));
  });

  // 格子定数の文
  const nm = v => `${f(v)}\u00a0nm`;
  function latText(e) {
    if (e.a == null) return null;
    if (e.ang != null) return `a = ${nm(e.a)}, α = ${f(e.ang)}°${tag(T.rhomb_cell)}`;
    const parts = [`a = ${nm(e.a)}`];
    if (e.b != null) parts.push(`b = ${nm(e.b)}`);
    if (e.cc != null) parts.push(`c = ${nm(e.cc)}`);
    if (e.st === 'Sm') return `${parts.join(', ')}${tag(T.hex_axes)}`;
    return parts.join(', ');
  }
  const structName = e => (e.c === 'oth' ? `${T.s_oth}: ${T[`st_${e.st}`]}` : T[`s_${e.c}`]);
  function trText(e) {
    if (!e.tr) return esc(e.c === 'gas' || e.c === 'liq' || e.c === 'unk' ? '—' : T.tr_none);
    return `<ul>${e.tr.map(([t, way, ph, k]) => `<li>${esc(way === 'meta' ? T.tr_meta : T[`tr_${way}`].replace('{t}', f(t)).replace('{p}', ph).replace('{s}', T[`k_${k}`]))}</li>`).join('')}</ul>`
      + (T[`trn_${e.s}`] ? `<small class="muted">${esc(T[`trn_${e.s}`])}</small>` : '');
  }
  // XRD ツールへのリンク(25 °C の相が立方晶のもの、炭素はダイヤモンド)
  function xrdLink(e) {
    let type = XRD[e.c] ?? (e.st === 'sc' ? XRD.sc : null), a = e.a, label = T.xrd_link;
    if (e.s === 'C') { type = XRD.dia; a = DIAMOND_A; label = T.xrd_link_c; }
    if (!type || a == null) return null;
    const [t, [h, k, l]] = type;
    const q = `type=${t}&a=${a}&lambda=0.15406&h=${h}&k=${k}&l=${l}`;
    return `<a href="${home}tools/xrd-bragg-calculator/?${esc(q)}">${esc(label.replace('{s}', T[`x_${t}`]).replace('{a}', num(a, 5)))} →</a><br><small class="muted">${esc(T.xrd_note)}</small>`;
  }

  function drawDetail(s) {
    const e = BY[s];
    const rows = [];
    const add = (k, v) => { if (v != null && v !== '') rows.push([T[`r_${k}`], v]); };
    add('name', `${esc(NAME[s])} <b>${e.s}</b>`);
    add('z', String(e.z));
    add('struct', esc(structName(e)) + (T[`stn_${s}`] ? `<br><small class="muted">${esc(T[`stn_${s}`])}</small>` : ''));
    const lat = latText(e);
    add('lat', lat ? `${lat}${tag(e.ls === 'WEL' ? 'WebElements' : T.asm25)}` : '—');
    if (e.c === 'hcp' || e.st === 'dhcp') add('ca', `${num(e.cc / e.a, 4)}${tag(e.c === 'hcp' ? T.ca_ideal : T.ca_ideal_dhcp)}`);
    if (e.c === 'gas') add('rho', esc(T.rho_gas));
    else add('rho', e.d != null ? `${f(e.d)}\u00a0g/cm³${tag(e.ds === 'ED' ? 'ElementData' : e.ds === 'WP' ? 'WebElements' : 'CRC')}${e.c === 'liq' ? tag(T.liquid) : ''}` : '—');
    if (e.x != null) add('xrho', `${num(e.x, 4)}\u00a0g/cm³${tag(T.calc)}`);
    add('mp', e.mp != null ? `${f(e.mp)}\u00a0${T.degC}${tag(e.ms === 'WEL' ? 'WebElements' : 'CRC')}` : e.mn ? esc(T[`mp_${e.mn}`]) : '—');
    if (e.c !== 'gas' && e.c !== 'liq' && e.c !== 'unk') {
      add('E', e.E == null ? '—' : Array.isArray(e.E) ? `${num(e.E[0], 3)}–${num(e.E[1], 3)}\u00a0GPa${tag(T.e_si)}` : `${f(e.E)}\u00a0GPa${tag(e.Es === 'CRC' ? 'CRC' : 'WebElements')}`);
    }
    add('rm', e.rm != null ? `${f(e.rm)}\u00a0pm${tag(T.cn12)}` : '—');
    if (e.h != null) add('half', `${num(e.h, 4)}\u00a0pm${tag(T.calc)}`);
    if (e.f != null) add('apf', `${num(e.f, 2)}${tag(T.apf_note)}`);
    add('tr', trText(e));
    if (T[`note_${s}`]) add('note', esc(T[`note_${s}`]));
    const link = xrdLink(e);
    if (link) add('xrd', link);
    out('detail').innerHTML = `<div class="table-wrap"><table class="dy-table pt-detail"><tbody>${rows.map(([k, v], i) => `<tr><th scope="row">${esc(k)}</th><td data-out="pt-${i}">${v}</td></tr>`).join('')}</tbody></table></div>`;
  }

  let last = '';
  function update() {
    const view = el.view.value, s = BY[el.el.value] ? el.el.value : 'Fe';
    const key = `${view} ${s}`;
    if (key === last) return;
    const viewChanged = !last.startsWith(`${view} `);
    last = key;
    // 表の横スクロールの位置を保つ(作り直すと先頭に戻るため)
    const sc = tbl.querySelector('.pt-scroll')?.scrollLeft ?? 0;
    if (viewChanged || !tbl.firstChild) drawTable(view, s);
    else tbl.querySelectorAll('[data-el]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.el === s)));
    const box = tbl.querySelector('.pt-scroll');
    if (box) box.scrollLeft = sc;
    drawDetail(s);
  }
  form.addEventListener('input', update);
  form.addEventListener('change', update);
  form.addEventListener('submit', e => e.preventDefault());
  update();
}
