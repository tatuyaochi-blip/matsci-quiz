// 材料記号の読み方。JIS などの材料記号を部分に分け、規則で意味を読む(未知の番号でも分かる範囲を示す)。
// 代表的な鋼種・合金には、成分の目安(質量%)・用途・近い海外規格も出す。数値と規則の出典は
// review/tools/matsci-quiz/designation/sources.md。文言は data/tools/designation.json の text.{言語}.js
import { home } from './dom.js';
const form = document.getElementById('designation-form');
const input = form.elements.code;
const out = k => document.querySelector(`[data-out="${k}"]`);
const T = JSON.parse(form.dataset.text);
// 記号の入力欄はフォームの幅いっぱいに使う(説明の文が長いので)
input.closest('label').style.gridColumn = '1 / -1';
const P = T.p;
const fill = (s, v = {}) => String(s ?? '').replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m));

// ---- 成分の書き方: 'C:0.38-0.43,Cr:-0.25,S:0.15-,C:~0.38' (下限-上限、-上限 は以下、下限- は以上、~ は約)
const parseComp = s => (s ? s.split(',').map(x => {
  const [e, v] = x.split(':');
  if (v.startsWith('~')) return { e, ap: v.slice(1) };
  const [a, b] = v.split('-');
  return { e, a, b };
}) : []);
const fmtEl = x => `${x.e} ${x.ap ? fill(T.ui.approx, { a: x.ap }) : x.a && x.b ? fill(T.ui.range, { a: x.a, b: x.b }) : x.b ? fill(T.ui.max, { b: x.b }) : fill(T.ui.min, { a: x.a })}`;
const fmtComp = (s, onlyRanges = false) => parseComp(s).filter(x => !onlyRanges || x.ap || (x.a && x.b)).map(fmtEl).join(T.ui.sep);

// ---- 機械構造用合金鋼(JIS G 4053)の40鋼種。C・Mn・Ni・Cr・Mo の規定範囲。c = 主として肌焼用、n = 主として表面窒化用
const NI = 'Ni:-0.25', CR = 'Cr:0.90-1.20', MN = 'Mn:0.60-0.90';
const G4053 = {
  SMn420: [`C:0.17-0.23,Mn:1.20-1.50,${NI},Cr:-0.35`, 'c'], SMn433: [`C:0.30-0.36,Mn:1.20-1.50,${NI},Cr:-0.35`],
  SMn438: [`C:0.35-0.41,Mn:1.35-1.65,${NI},Cr:-0.35`], SMn443: [`C:0.40-0.46,Mn:1.35-1.65,${NI},Cr:-0.35`],
  SMnC420: [`C:0.17-0.23,Mn:1.20-1.50,${NI},Cr:0.35-0.70`, 'c'], SMnC443: [`C:0.40-0.46,Mn:1.35-1.65,${NI},Cr:0.35-0.70`],
  SCr415: [`C:0.13-0.18,${MN},${NI},${CR}`, 'c'], SCr420: [`C:0.18-0.23,${MN},${NI},${CR}`, 'c'],
  SCr430: [`C:0.28-0.33,${MN},${NI},${CR}`], SCr435: [`C:0.33-0.38,${MN},${NI},${CR}`],
  SCr440: [`C:0.38-0.43,${MN},${NI},${CR}`], SCr445: [`C:0.43-0.48,${MN},${NI},${CR}`],
  SCM415: [`C:0.13-0.18,${MN},${NI},${CR},Mo:0.15-0.25`, 'c'], SCM418: [`C:0.16-0.21,${MN},${NI},${CR},Mo:0.15-0.25`, 'c'],
  SCM420: [`C:0.18-0.23,${MN},${NI},${CR},Mo:0.15-0.25`, 'c'], SCM421: [`C:0.17-0.23,Mn:0.70-1.00,${NI},${CR},Mo:0.15-0.25`, 'c'],
  SCM425: [`C:0.23-0.28,${MN},${NI},${CR},Mo:0.15-0.30`, 'c'], SCM430: [`C:0.28-0.33,${MN},${NI},${CR},Mo:0.15-0.30`],
  SCM432: [`C:0.27-0.37,Mn:0.30-0.60,${NI},Cr:1.00-1.50,Mo:0.15-0.30`], SCM435: [`C:0.33-0.38,${MN},${NI},${CR},Mo:0.15-0.30`],
  SCM440: [`C:0.38-0.43,${MN},${NI},${CR},Mo:0.15-0.30`], SCM445: [`C:0.43-0.48,${MN},${NI},${CR},Mo:0.15-0.30`],
  SCM822: [`C:0.20-0.25,${MN},${NI},${CR},Mo:0.35-0.45`, 'c'],
  SNC236: ['C:0.32-0.40,Mn:0.50-0.80,Ni:1.00-1.50,Cr:0.50-0.90'], SNC415: ['C:0.12-0.18,Mn:0.35-0.65,Ni:2.00-2.50,Cr:0.20-0.50', 'c'],
  SNC631: ['C:0.27-0.35,Mn:0.35-0.65,Ni:2.50-3.00,Cr:0.60-1.00'], SNC815: ['C:0.12-0.18,Mn:0.35-0.65,Ni:3.00-3.50,Cr:0.60-1.00', 'c'],
  SNC836: ['C:0.32-0.40,Mn:0.35-0.65,Ni:3.00-3.50,Cr:0.60-1.00'],
  SNCM220: ['C:0.17-0.23,Mn:0.60-0.90,Ni:0.40-0.70,Cr:0.40-0.60,Mo:0.15-0.25', 'c'], SNCM240: ['C:0.38-0.43,Mn:0.70-1.00,Ni:0.40-0.70,Cr:0.40-0.60,Mo:0.15-0.30'],
  SNCM415: ['C:0.12-0.18,Mn:0.40-0.70,Ni:1.60-2.00,Cr:0.40-0.60,Mo:0.15-0.30', 'c'], SNCM420: ['C:0.17-0.23,Mn:0.40-0.70,Ni:1.60-2.00,Cr:0.40-0.60,Mo:0.15-0.30', 'c'],
  SNCM431: ['C:0.27-0.35,Mn:0.60-0.90,Ni:1.60-2.00,Cr:0.60-1.00,Mo:0.15-0.30'], SNCM439: ['C:0.36-0.43,Mn:0.60-0.90,Ni:1.60-2.00,Cr:0.60-1.00,Mo:0.15-0.30'],
  SNCM447: ['C:0.44-0.50,Mn:0.60-0.90,Ni:1.60-2.00,Cr:0.60-1.00,Mo:0.15-0.30'], SNCM616: ['C:0.13-0.20,Mn:0.80-1.20,Ni:2.80-3.20,Cr:1.40-1.80,Mo:0.40-0.60', 'c'],
  SNCM625: ['C:0.20-0.30,Mn:0.35-0.60,Ni:3.00-3.50,Cr:1.00-1.50,Mo:0.15-0.30'], SNCM630: ['C:0.25-0.35,Mn:0.35-0.60,Ni:2.50-3.50,Cr:2.50-3.50,Mo:0.50-0.70'],
  SNCM815: ['C:0.12-0.18,Mn:0.30-0.60,Ni:4.00-4.50,Cr:0.70-1.00,Mo:0.15-0.30', 'c'],
  SACM645: ['C:0.40-0.50,Mn:-0.60,Ni:-0.25,Cr:1.30-1.70,Mo:0.15-0.30,Al:0.70-1.20', 'n'],
};
// 合金元素の記号(大文字にしたもの)→ 表示、系統の名前のキー、主な合金元素
const ALLOY = {
  MN: ['Mn', 'mn', ['Mn']], MNC: ['MnC', 'mnc', ['Mn', 'Cr']], CR: ['Cr', 'cr', ['Cr']], CM: ['CM', 'cm', ['Cr', 'Mo']],
  NC: ['NC', 'nc', ['Ni', 'Cr']], NCM: ['NCM', 'ncm', ['Ni', 'Cr', 'Mo']], ACM: ['ACM', 'acm', ['Al', 'Cr', 'Mo']],
};
// 主要合金元素量コードの区分の範囲を、JIS G 4053 の同じ系統・同じコードの鋼種の成分から求める
function codeRange(sym, code) {
  const [disp, , els] = ALLOY[sym];
  const rows = Object.entries(G4053).filter(([k]) => new RegExp(`^S${disp}${code}\\d\\d$`).test(k)).map(([, v]) => parseComp(v[0]));
  if (!rows.length) return null;
  return els.map(e => {
    const xs = rows.map(r => r.find(x => x.e === e)).filter(x => x && x.a && x.b);
    if (!xs.length) return '';
    const lo = Math.min(...xs.map(x => +x.a)), hi = Math.max(...xs.map(x => +x.b));
    return `${e} ${fill(T.ui.range, { a: lo.toFixed(2), b: hi.toFixed(2) })}`;
  }).filter(Boolean).join(T.ui.sep);
}

// 機械構造用炭素鋼(JIS G 4051)の種類と、確かめた炭素量の範囲
const G4051 = ['S10C', 'S12C', 'S15C', 'S17C', 'S20C', 'S22C', 'S25C', 'S28C', 'S30C', 'S33C', 'S35C', 'S38C', 'S40C', 'S43C', 'S45C', 'S48C',
  'S50C', 'S53C', 'S55C', 'S58C', 'S09CK', 'S15CK', 'S20CK'];
const G4051C = { S20C: '0.18-0.23', S35C: '0.32-0.38', S45C: '0.42-0.48', S50C: '0.47-0.53', S55C: '0.52-0.58' };

// 個別の説明。comp は成分の目安、eq は近い海外規格(同一ではない)、std は規格
const INFO = {
  S45C: { comp: 'C:0.42-0.48', eq: 'EN C45 (C45E)', std: 'JIS G 4051' },
  SCM440: { eq: 'SAE 4140, EN 42CrMo4' },
  SCM435: { eq: 'EN 34CrMo4' },
  SS400: { comp: 'P:-0.050,S:-0.050', std: 'JIS G 3101' },
  SM490A: { comp: 'C:-0.20,Si:-0.55,Mn:-1.65,P:-0.035,S:-0.035', std: 'JIS G 3106' },
  SN490B: { comp: 'C:-0.18,Si:-0.55,Mn:-1.60,P:-0.030,S:-0.015', std: 'JIS G 3136' },
  SPHC: { comp: 'C:-0.12,Mn:-0.60,P:-0.045,S:-0.035', std: 'JIS G 3131' },
  SPCC: { std: 'JIS G 3141' },
  SK105: { comp: 'C:1.00-1.10', std: 'JIS G 4401' },
  SKD11: { comp: 'C:1.40-1.60,Cr:11.0-13.0', std: 'JIS G 4404', eq: 'AISI D2' },
  SKD61: { comp: 'C:0.35-0.42,Cr:4.80-5.50', std: 'JIS G 4404', eq: 'AISI H13, EN X40CrMoV5-1' },
  SKH51: { comp: 'C:~0.85,Cr:~4,Mo:~5,W:~6,V:~2', std: 'JIS G 4403', eq: 'AISI M2, HS6-5-2' },
  SUJ2: { comp: 'C:0.95-1.10,Si:0.15-0.35,Mn:-0.50,Cr:1.30-1.60', std: 'JIS G 4805', eq: 'SAE 52100, EN 100Cr6' },
  SUJ3: { comp: 'C:0.95-1.10,Si:0.40-0.70,Mn:0.90-1.15,Cr:0.90-1.20', std: 'JIS G 4805' },
  SUJ5: { comp: 'C:0.95-1.10,Si:0.40-0.70,Mn:0.90-1.15,Cr:0.90-1.20,Mo:0.10-0.25', std: 'JIS G 4805' },
  SUS303: { comp: 'C:-0.15,S:0.15-,Ni:8.00-10.00,Cr:17.00-19.00', eq: 'UNS S30300, EN 1.4305' },
  SUS304: { comp: 'C:-0.08,Ni:8.00-10.50,Cr:18.00-20.00', eq: 'UNS S30400, EN 1.4301' },
  SUS304L: { comp: 'C:-0.030,Ni:9.00-13.00,Cr:18.00-20.00', eq: 'UNS S30403, EN 1.4306 / 1.4307' },
  SUS304N1: { comp: 'C:-0.08,Ni:7.00-10.50,Cr:18.00-20.00,N:0.10-0.25' },
  SUS316: { comp: 'C:-0.08,Ni:10.00-14.00,Cr:16.00-18.00,Mo:2.00-3.00', eq: 'UNS S31600, EN 1.4401' },
  SUS316L: { comp: 'C:-0.030,Ni:12.00-15.00,Cr:16.00-18.00,Mo:2.00-3.00', eq: 'UNS S31603, EN 1.4404' },
  SUS316J1: { comp: 'C:-0.08,Ni:10.00-14.00,Cr:17.00-19.00,Mo:1.20-2.75,Cu:1.00-2.50' },
  SUS321: { comp: 'C:-0.08,Ni:9.00-13.00,Cr:17.00-19.00,Ti:5×C-', eq: 'UNS S32100, EN 1.4541' },
  SUS347: { comp: 'C:-0.08,Ni:9.00-13.00,Cr:17.00-19.00,Nb:10×C-' },
  SUS329J3L: { eq: 'UNS S32205, EN 1.4462' },
  SUS329J4L: { comp: 'C:-0.030,Ni:5.50-7.50,Cr:24.00-26.00,Mo:2.50-3.50,N:0.08-0.30', eq: 'UNS S31260' },
  SUS410: { comp: 'C:-0.15,Cr:11.50-13.50', eq: 'UNS S41000, EN 1.4006' },
  SUS420J1: { comp: 'C:0.16-0.25,Cr:12.00-14.00' },
  SUS420J2: { comp: 'C:0.26-0.40,Cr:12.00-14.00', eq: 'UNS S42000, EN 1.4028' },
  SUS430: { comp: 'C:-0.12,Cr:16.00-18.00', eq: 'UNS S43000, EN 1.4016' },
  SUS440C: { comp: 'C:0.95-1.20,Cr:16.00-18.00', eq: 'UNS S44004' },
  SUS444: { comp: 'C:-0.025,Cr:17.00-20.00,Mo:1.75-2.50,N:-0.025', eq: 'UNS S44400, EN 1.4521' },
  SUS630: { comp: 'C:-0.07,Ni:3.00-5.00,Cr:15.00-17.50,Cu:3.00-5.00,Nb:0.15-0.45', eq: 'UNS S17400, EN 1.4542' },
  SUS631: { comp: 'C:-0.09,Ni:6.50-7.75,Cr:16.00-18.00,Al:0.75-1.50' },
  A1050: { comp: 'Al:99.50-' }, A1100: { comp: 'Al:99.00-' },
  A2017: { comp: 'Cu:3.5-4.5,Mg:0.40-0.8,Mn:0.40-1.0,Si:0.20-0.8' }, A2024: { comp: 'Cu:3.8-4.9,Mg:1.2-1.8,Mn:0.30-0.9' },
  A3003: { comp: 'Mn:1.0-1.5,Cu:0.05-0.20' }, A5052: { comp: 'Mg:2.2-2.8,Cr:0.15-0.35' }, A5083: { comp: 'Mg:4.0-4.9,Mn:0.40-1.0,Cr:0.05-0.25' },
  A6061: { comp: 'Mg:0.8-1.2,Si:0.40-0.8,Cu:0.15-0.40,Cr:0.04-0.35' }, A6063: { comp: 'Mg:0.45-0.9,Si:0.20-0.6' },
  A7075: { comp: 'Zn:5.1-6.1,Mg:2.1-2.9,Cu:1.2-2.0,Cr:0.18-0.28' },
  C1020: { comp: 'Cu:99.96-' }, C1100: { comp: 'Cu:99.90-' }, C1220: { comp: 'Cu:99.90-,P:0.015-0.040' },
  C2600: { comp: 'Cu:68.5-71.5,Pb:-0.05,Fe:-0.05' }, C2801: { comp: 'Cu:59.0-62.0,Pb:-0.1,Fe:-0.07' },
  C3604: { comp: 'Cu:57.0-61.0,Pb:1.8-3.7,Fe:-0.50' }, C4621: { comp: 'Cu:61.0-64.0,Sn:0.7-1.5' },
  C5191: { comp: 'Sn:5.5-7.0,P:0.03-0.35' }, C1720: { comp: 'Be:1.80-2.00' },
  FC250: {}, FCD450: {},
};
const termsFor = { steel: ['hardenability', 'tempering'], tool: ['martensite', 'tempering'], sus: ['stainless-steel'] };

// ---- 入力の正規化: 全角→半角(NFKC)、大文字、空白と中黒を除き、いろいろなダッシュをハイフンに
export function normalize(raw) {
  return String(raw ?? '').normalize('NFKC').toUpperCase()
    .replace(/[‐‑‒–—―−ーｰ﹣]/g, '-').replace(/[\s・·_]+/g, '').replace(/^JIS/, '')
    .replace(/-+/g, '-').replace(/^-|-$/g, '');
}

// ---- 各系統の読み方。返り値 { code, fam, parts: [[部分, 意味]], key?, cls?, uses?, notes: [], terms: [] }
const R = (code, fam) => ({ code, fam, parts: [], notes: [], terms: [] });

function steelCarbon(s) {
  const m = /^S(\d{2})C(K?)$/.exec(s);
  if (!m) return null;
  const r = R(s, 'carbon');
  r.parts.push(['S', P.s_steel], [m[1], fill(P.carbon_digits, { c: (+m[1] / 100).toFixed(2) })], ['C', P.c_carbon]);
  if (m[2]) r.parts.push(['K', P.k_case]);
  if (!G4051.includes(s)) r.notes.push(P.not_in_g4051);
  if (G4051C[s.replace(/K$/, '')] && !m[2]) r.comp = `C:${G4051C[s]}`;
  r.std = 'JIS G 4051';
  r.terms = m[2] ? ['carburizing', 'hardenability'] : termsFor.steel;
  return r;
}

function steelAlloy(s) {
  const m = /^S(MNC|MN|CR|CM|NCM|NC|ACM)(\d)(\d{2})(H?)$/.exec(s);
  if (!m) return null;
  const [disp, famKey] = ALLOY[m[1]];
  const name = `S${disp}${m[2]}${m[3]}`;
  const r = R(name + m[4], 'alloy');
  const row = G4053[name];
  r.parts.push(['S', P.s_steel], [disp, P[`el_${famKey}`]]);
  const range = codeRange(m[1], m[2]);
  r.parts.push([m[2], `${P.code_digit}${range ? fill(P.code_range, { r: range }) : P.code_none}`]);
  const cm = row && parseComp(row[0]).find(x => x.e === 'C');
  r.parts.push([m[3], fill(P.carbon_rep, { c: (+m[3] / 100).toFixed(2) }) + (cm ? fill(P.carbon_this, { r: fill(T.ui.range, { a: cm.a, b: cm.b }) }) : '')]);
  if (m[4]) r.parts.push(['H', P.h_steel]);
  r.cls = `${T.fam.alloy} — ${P[`sub_${famKey}`]}`;
  r.std = m[4] ? 'JIS G 4052' : 'JIS G 4053';
  r.terms = [...termsFor.steel];
  if (row) {
    r.comp = row[0];
    r.compOnlyRanges = true;
    if (row[1] === 'c') { r.uses = P.use_case; r.terms.push('carburizing'); }
    if (row[1] === 'n') { r.uses = P.use_nitride; r.terms.push('nitriding'); }
    r.key = name;
    if (m[4]) { r.notes.push(P.h_comp_note); r.noEq = true; }
  } else r.notes.push(P.not_in_g4053);
  return r;
}

// JIS G 3106・G 3136 の種類(中部鋼鈑のカタログで確かめたもの)
const G3106 = ['SM400A', 'SM400B', 'SM400C', 'SM490A', 'SM490B', 'SM490C', 'SM490YA', 'SM490YB', 'SM520B', 'SM520C', 'SM570'];
const G3136 = ['SN400A', 'SN400B', 'SN400C', 'SN490B', 'SN490C'];
function steelStructural(s) {
  let m = /^SS(\d{3})$/.exec(s);
  if (m) {
    const r = R(s, 'ss');
    r.parts.push(['SS', P.ss], [m[1], fill(P.tensile_min, { n: m[1] })]);
    if (!['330', '400', '490', '540'].includes(m[1])) r.notes.push(P.not_listed);
    r.std = 'JIS G 3101';
    r.notes.push(P.ss_note);
    return r;
  }
  m = /^SM(\d{3})(Y?)([ABC]?)$/.exec(s);
  if (m) {
    const r = R(s, 'sm');
    if (!G3106.includes(s)) r.notes.push(P.not_listed);
    r.parts.push(['SM', P.sm], [m[1], fill(P.tensile_min, { n: m[1] })]);
    if (m[2]) r.parts.push(['Y', P.sm_y]);
    if (m[3]) r.parts.push([m[3], P[`sm_${m[3].toLowerCase()}`]]);
    r.std = 'JIS G 3106';
    r.terms = ['carbon-equivalent'];
    return r;
  }
  m = /^SN(\d{3})([ABC]?)$/.exec(s);
  if (m) {
    const r = R(s, 'sn');
    if (!G3136.includes(s)) r.notes.push(P.not_listed);
    r.parts.push(['SN', P.sn], [m[1], fill(P.tensile_min, { n: m[1] })]);
    if (m[2]) r.parts.push([m[2], P[`sn_${m[2].toLowerCase()}`]]);
    r.std = 'JIS G 3136';
    r.terms = ['carbon-equivalent'];
    return r;
  }
  m = /^SP([HC])([C-G])$/.exec(s);
  if (m) {
    const hot = m[1] === 'H';
    const r = R(s, hot ? 'sph' : 'spc');
    const use = P[`${hot ? 'sph' : 'spc'}_${m[2].toLowerCase()}`];
    r.parts.push([`SP${m[1]}`, hot ? P.sph : P.spc], [m[2], use ?? P.kind_only]);
    if (!use) r.notes.push(P.not_listed);
    r.std = hot ? 'JIS G 3131' : 'JIS G 3141';
    return r;
  }
  return null;
}

// JIS G 4401 の今の種類(番号は炭素量の代表値 ×100)。旧記号 SK1〜SK7 は1桁
const SK_NOW = ['60', '65', '70', '75', '80', '85', '90', '95', '105', '120', '140'];
function steelSpecial(s) {
  let m = /^SK(\d{1,3})$/.exec(s);
  if (m) {
    const n = +m[1], r = R(s, 'sk');
    r.std = 'JIS G 4401';
    r.terms = termsFor.tool;
    if (m[1].length > 1) {
      r.parts.push(['SK', P.sk], [m[1], fill(P.carbon_rep, { c: (n / 100).toFixed(2) })]);
      if (!SK_NOW.includes(m[1])) r.notes.push(P.not_listed);
    } else {
      r.parts.push(['SK', P.sk], [m[1], P.sk_old]);
      if (n < 1 || n > 7) r.notes.push(P.not_listed);
      const now = { 1: 'SK140', 3: 'SK105', 5: 'SK85', 7: 'SK65' }[n];
      if (now) r.notes.push(fill(P.sk_old_now, { now }));
    }
    return r;
  }
  m = /^SK([SDTH])(\d{1,2})$/.exec(s);
  if (m) {
    const k = `sk${m[1].toLowerCase()}`, r = R(s, k);
    r.parts.push([`SK${m[1]}`, P[k]], [m[2], P.kind_no]);
    r.std = m[1] === 'H' ? 'JIS G 4403' : 'JIS G 4404';
    r.terms = termsFor.tool;
    return r;
  }
  m = /^SUJ(\d)$/.exec(s);
  if (m) {
    const r = R(s, 'suj');
    r.parts.push(['SUJ', P.suj], [m[1], P.kind_no]);
    r.std = 'JIS G 4805';
    r.terms = termsFor.tool;
    return r;
  }
  m = /^SUP(\d{1,2})$/.exec(s);
  if (m) {
    const r = R(s, 'sup');
    r.parts.push(['SUP', P.sup], [m[1], P.sup_no]);
    r.std = 'JIS G 4801';
    r.terms = termsFor.tool;
    return r;
  }
  return null;
}

// ステンレス鋼。番号で系統を決められるものだけ決める(4○○は既知の番号だけ)
const MART = ['403', '410', '416', '420', '440'], FERR = ['430', '434', '444', '447'];
const SUS_KNOWN = ['201', '202', '301', '302', '303', '304', '305', '309', '310', '312', '315', '316', '317', '321', '329', '347', '384', '836', '890',
  '403', '405', '409', '410', '416', '420', '429', '430', '431', '434', '436', '440', '443', '444', '445', '447', '630', '631', '632'];
const susSystem = n => (n === '329' ? 'dup' : /^[23]/.test(n) ? 'aus' : MART.includes(n) ? 'mar' : FERR.includes(n) ? 'fer' : /^6/.test(n) ? 'ph' : n[0] === '4' ? 'fm' : '');
function stainless(s) {
  const m = /^SUS(\d{3})((?:J\d)?)(L?)((?:N\d?)?)(F?)((?:SE)?)((?:CU)?)((?:H\d{3,4})?)$/.exec(s);
  if (!m) return null;
  const [, n, j, l, nn, f, se, cu, h] = m;
  const code = `SUS${n}${j}${l}${nn}${f}${se ? 'Se' : ''}${cu ? 'Cu' : ''}${h}`;
  const r = R(code, 'sus');
  // SUS410L は低炭素の 13Cr で、JIS ではフェライト系に分類される
  const sys = n === '410' && l ? 'fer' : susSystem(n);
  r.parts.push(['SUS', P.sus], [n, P.sus_no + (sys ? fill(P.sus_sys, { s: T.sys[sys] }) : '')]);
  if (j) r.parts.push([j, P.sus_j]);
  if (l) r.parts.push(['L', P.sus_l]);
  if (nn) r.parts.push([nn, P.sus_n]);
  if (f) r.parts.push(['F', P.sus_f]);
  if (se) r.parts.push(['Se', P.sus_se]);
  if (cu) r.parts.push(['Cu', P.sus_cu]);
  if (h) r.parts.push([h, n === '630' && P[`sus630_${h}`] ? P[`sus630_${h}`] : P.sus_h]);
  r.cls = sys ? `${T.fam.sus} — ${T.sys[sys]}` : T.fam.sus;
  r.terms = [...termsFor.sus];
  if (l || ['304', '316'].includes(n)) r.terms.push('sensitization');
  if (n === '316' || n === '329') r.terms.push('pitting-corrosion');
  if (sys === 'ph') r.terms.push('precipitation-hardening');
  if (sys === 'mar') r.terms.push('martensite');
  r.key = `SUS${n}${j}${l}${nn}${f}${se ? 'Se' : ''}${cu ? 'Cu' : ''}`;
  r.std = fill(T.ui.etc, { s: 'JIS G 4303' });
  if (!SUS_KNOWN.includes(n)) r.notes.push(P.not_listed);
  return r;
}

// JIS G 5502 の種類(引張強さ-伸び)
const G5502 = ['350-22', '400-18', '400-15', '450-10', '500-7', '600-3', '700-2', '800-2'];
function castIron(s) {
  let m = /^FC(\d{3})$/.exec(s);
  if (m) {
    const r = R(s, 'fc');
    r.parts.push(['F', P.f_ferrum], ['C', P.c_cast], [m[1], fill(P.tensile_min, { n: m[1] })]);
    if (!['100', '150', '200', '250', '300', '350'].includes(m[1])) r.notes.push(P.not_listed);
    r.notes.push(P.fc_comp);
    r.std = 'JIS G 5501';
    r.key = s;
    return r;
  }
  m = /^FCD(\d{3})(?:-?(\d{1,2}))?$/.exec(s);
  if (m) {
    const r = R(`FCD${m[1]}${m[2] ? `-${m[2]}` : ''}`, 'fcd');
    r.parts.push(['FCD', P.fcd], [m[1], fill(P.tensile_min, { n: m[1] })]);
    if (m[2]) r.parts.push([`-${m[2]}`, fill(P.elong_min, { n: m[2] })]);
    if (m[2] ? !G5502.includes(`${m[1]}-${m[2]}`) : !G5502.some(x => x.startsWith(`${m[1]}-`))) r.notes.push(P.not_listed);
    r.notes.push(P.fc_comp);
    r.std = 'JIS G 5502';
    r.key = `FCD${m[1]}`;
    return r;
  }
  return null;
}

// アルミニウム合金: A + 4桁(2桁目は N のことがある)+ 形状の記号 + 質別
const AL_FORMS = ['TWA', 'TWS', 'BES', 'BDS', 'TES', 'TDS', 'PC', 'PS', 'BE', 'BD', 'WS', 'TE', 'TD', 'TW', 'SS', 'FD', 'FH', 'BY', 'WY', 'P', 'W', 'S', 'H'];
const AL_TEMPER = /^(F|O|H112|H[123]\d{1,2}|T\d{1,5})$/;
function alTemper(t, series) {
  if (t === 'F' || t === 'O' || t === 'H112') return P[`al_${t}`];
  let m = /^H([123])(\d)(\d?)$/.exec(t);
  if (m) {
    const level = P[`al_hx${m[2]}`] ?? P.al_hx_other;
    return `${P[`al_h${m[1]}`]}${T.ui.clause}${fill(P.al_hlevel, { d: m[2], v: level })}${m[3] ? T.ui.clause + P.al_h3rd : ''}`;
  }
  m = /^T(\d)(\d*)$/.exec(t);
  if (m) {
    const base = P[`al_t${m[1]}`] ?? P.al_t_other;
    const ext = { '': '', 51: P.al_t51, 511: P.al_t511, 52: P.al_t52 }[m[2]] ?? P.al_t_ext;
    const warn = ['1', '3', '5'].includes(series) ? T.ui.clause + P.al_t_nonheat : '';
    return `${fill(base, { d: m[1] })}${ext ? T.ui.clause + ext : ''}${warn}`;
  }
  return null;
}
function aluminum(s) {
  const m = /^A?([1-8])([0-9N])(\d{2})([A-Z]*?)(?:-?(F|O|H\d{2,3}|T\d{1,5}))?$/.exec(s);
  if (!m || (!s.startsWith('A') && !/^\d/.test(s))) return null;
  const [, se, d2, d34, formRaw, temper] = m;
  if (!s.startsWith('A') && !INFO[`A${se}${d2}${d34}`]) return null;
  let form = formRaw;
  if (form && !AL_FORMS.includes(form)) return null;
  if (temper && !AL_TEMPER.test(temper)) return null;
  const num = `${se}${d2}${d34}`;
  const r = R(`A${num}${form}${temper ? `-${temper}` : ''}`, 'al');
  r.parts.push(['A', P.al_a], [se, T.al_series[se]]);
  r.parts.push([d2, d2 === 'N' ? P.al_n : se === '1' ? P.al_d2_pure : d2 === '0' ? P.al_d2_0 : P.al_d2_x]);
  r.parts.push([d34, se === '1' ? fill(P.al_pure, { p: `99.${d34}` }) : P.al_d34]);
  if (form) r.parts.push([form, T.al_forms[form]]);
  if (temper) r.parts.push([temper, alTemper(temper, se)]);
  if (!s.startsWith('A')) r.notes.push(P.al_added_a);
  r.cls = `${T.fam.al} — ${T.al_series[se]}${['2', '6', '7'].includes(se) ? T.ui.sep + P.al_heat : ['1', '3', '5'].includes(se) ? T.ui.sep + P.al_nonheat : se === '4' ? T.ui.sep + P.al_heat4 : ''}`;
  r.key = `A${num}`;
  if (d2 !== 'N' && INFO[r.key]) r.eq = fill(P.al_eq, { n: num });
  r.std = fill(T.ui.etc, { s: 'JIS H 4000' });
  r.terms = [];
  if (['2', '6', '7'].includes(se) || /^T/.test(temper ?? '')) r.terms.push('precipitation-hardening');
  if (/^H/.test(temper ?? '') || ['1', '3', '5'].includes(se)) r.terms.push('work-hardening');
  return r;
}

// 銅・銅合金: C + 4桁 + 形状の記号 + 質別
function copper(s) {
  const m = /^C([1-7])(\d{3})([A-Z]{0,3}?)(?:-?(O|1\/8H|1\/4H|1\/2H|3\/4H|ESH|EH|SH|H))?$/.exec(s);
  if (!m) return null;
  const [, f1, rest, form, temper] = m;
  const r = R(`C${f1}${rest}${form}${temper ? `-${temper}` : ''}`, 'cu');
  r.parts.push(['C', P.cu_c], [f1, T.cu_fam[f1]], [rest, P.cu_rest]);
  if (form) r.parts.push([form, T.cu_forms[form[0]] ? T.cu_forms[form[0]] + (form.length > 1 ? T.ui.clause + P.cu_form_more : '') : P.form_unknown]);
  if (temper) r.parts.push([temper, T.cu_temper[temper]]);
  r.cls = `${T.fam.cu} — ${T.cu_fam[f1]}`;
  r.key = `C${f1}${rest}`;
  r.std = fill(T.ui.etc, { s: 'JIS H 3100 / H 3250 / H 3300' });
  r.terms = [];
  if (f1 === '1' && rest[0] === '0' && !INFO[r.key]) r.notes.push(P.cu_aisi);
  if (['2', '3', '4'].includes(f1)) r.terms.push('brass');
  if (temper && temper !== 'O') r.terms.push('work-hardening');
  if (r.key === 'C1720') r.terms.push('precipitation-hardening');
  return r;
}

const withKey = r => { r.key ??= r.code; return r; };
const READERS = [aluminum, copper, castIron, stainless, steelCarbon, steelAlloy, steelStructural, steelSpecial];
export function decode(raw) {
  const s = normalize(raw);
  if (!s) return null;
  for (const f of READERS) { const r = f(s); if (r) return withKey(r); }
  // 鋼の記号の後ろのハイフン以降(調質や仕上げの記号など)は読まずに、前の部分だけ読む。S-45C のような書き方も読む
  const [head, ...tail] = s.split('-');
  for (const cand of [s.replace(/-/g, ''), head]) {
    if (!cand || cand === s) continue;
    for (const f of [castIron, stainless, steelCarbon, steelAlloy, steelStructural, steelSpecial]) {
      const r = f(cand);
      if (r) { if (cand === head && tail.length) r.notes.unshift(fill(P.tail_unread, { t: tail.join('-') })); return withKey(r); }
    }
  }
  return null;
}

// ---- 表示
// 小数点がコンマの言語(de など)では、表の数値(0.45 → 0,45)を書き換える。記号(A5052-H32 など)には「数字.数字」がないので変わらない
const decimalComma = /^(de|nl|fr|es|pt)/.test(document.documentElement.lang);
function commaDecimals(root) {
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) if (/\d\.\d/.test(n.data)) n.data = n.data.replace(/(\d)\.(\d)/g, '$1,$2');
}
const el = (tag, attrs = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  e.append(...kids.filter(k => k != null));
  return e;
};
function table(rows, head) {
  const t = el('table', { class: 'numbers dict' });
  if (head) t.append(el('thead', {}, el('tr', {}, ...head.map(h => el('th', { scope: 'col', style: 'white-space: nowrap' }, h)))));
  // 記号の部分の表は、左の列(記号)を強調して折り返さない。本文の overflow-wrap: anywhere で見出しの列が細くならないようにする
  const thStyle = head ? 'white-space: nowrap; overflow-wrap: normal' : 'overflow-wrap: normal; width: 32%';
  t.append(el('tbody', {}, ...rows.map(([k, v, small]) => el('tr', {}, el('th', { scope: 'row', style: thStyle }, head ? el('span', { class: 'num-value' }, k) : k),
    el('td', { 'data-out': 'row' }, v, small ? el('small', {}, small) : null)))));
  return el('div', { class: 'table-wrap' }, t);
}
const EXAMPLES = ['S45C', 'SCM440', 'SNCM439', 'SS400', 'SUS304L', 'SUS329J4L', 'SKD11', 'A5052-H32', 'A7075-T651', 'C3604', 'FC250', 'FCD450-10'];
function examples() {
  return el('div', { class: 'term-chips' }, el('span', { class: 'muted' }, T.ui.examples, ' '),
    ...EXAMPLES.map(x => el('button', { type: 'button', class: 'chip', 'data-example': x }, x)));
}

function render(r) {
  const box = out('result');
  box.replaceChildren();
  if (!r) {
    out('read').textContent = normalize(input.value) || '–';
    out('family').textContent = '–';
    box.append(el('p', {}, el('strong', {}, T.ui.unknown)), el('p', { class: 'muted' }, T.ui.unknown_hint), examples());
    return;
  }
  out('read').textContent = r.code;
  out('family').textContent = T.fam[r.fam];
  box.append(table(r.parts, [T.ui.part, T.ui.meaning]));
  const info = INFO[r.key] ?? {};
  const comp = info.comp ?? r.comp;
  const rows = [];
  rows.push([T.ui.cls, r.cls ?? T.fam[r.fam]]);
  if (comp) rows.push([T.ui.comp, fmtComp(comp, r.compOnlyRanges && !info.comp), r.compOnlyRanges ? T.ui.comp_g4053 : T.ui.comp_note]);
  const uses = T.uses[r.key] ?? r.uses;
  if (uses) rows.push([T.ui.uses, uses]);
  const eq = r.noEq ? null : info.eq ?? r.eq;
  if (eq) rows.push([T.ui.equiv, eq, T.ui.equiv_note]);
  rows.push([T.ui.std, info.std ?? r.std, T.ui.std_note]);
  if (!INFO[r.key] && !T.uses[r.key] && !r.comp) r.notes.unshift(T.ui.no_detail);
  box.append(el('h3', {}, T.ui.about), table(rows));
  if (r.notes.length) box.append(el('ul', { class: 'muted' }, ...r.notes.map(n => el('li', {}, n))));
  const terms = [...new Set(r.terms)];
  if (terms.length) {
    box.append(el('p', { class: 'term-chips' }, el('span', { class: 'muted' }, T.ui.terms, ' '),
      ...terms.map(t => el('a', { class: 'chip', href: `${home}term/${t}/` }, T.term_names[t]))));
  }
  box.append(examples());
  if (decimalComma) commaDecimals(box);
}

// URL の ?code= で記号を受け取り、入力に合わせて書き換える(言語の切り替え先にも渡す)
const initial = input.defaultValue;
try { const q = new URLSearchParams(location.search).get('code'); if (q) input.value = q.slice(0, 40); } catch {}
function sync() {
  const v = input.value.trim();
  const query = v && v !== initial ? `?code=${encodeURIComponent(v)}` : '';
  try { history.replaceState(history.state, '', location.pathname + query + location.hash); } catch {}
  document.querySelectorAll('.lang-switch a').forEach(a => { a.search = query; });
}
function update() { render(decode(input.value)); sync(); }
form.addEventListener('input', update);
form.addEventListener('submit', e => e.preventDefault());
out('result').addEventListener('click', e => {
  const b = e.target.closest('[data-example]');
  if (!b) return;
  input.value = b.dataset.example;
  update();
  input.focus({ preventScroll: true });
});
update();
