// 材料英語の表現集(/phrases/)。表現のカードは build.js が data/phrases.json から作ってページに書く(JavaScript がなくても全部読める)。
// このファイルは、検索(日本語・英語・場面)と場面で絞ること、お気に入り(このブラウザの localStorage)、文型の差し込み欄とコピー、
// お気に入り・表示中の表現の印刷(html に ph-print-fav / ph-print-shown を付けてから印刷。印刷の CSS は style.css)、
// それと英文の点検(下の RULES。貼った文はこの端末の中だけで調べ、どこにも送らない)。
// 点検の規則は「よくある誤りの目安」で、文法の点検ではない。規則の名前・理由・直し方の文は data/phrases.json の rules(id がこのファイルの RULES とそろうことを build.js が確かめる)。
// 検算: review の scripts/test_checker.mjs(正しい文と誤りを入れた文で、誤検出と見逃しを数える)
const app = typeof document !== 'undefined' ? document.getElementById('ph-app') : null;
const list = typeof document !== 'undefined' ? document.getElementById('ph-list') : null;

// 検索の文字をそろえる(全角・半角、カタカナ・ひらがな、大文字・小文字、空白と記号の違いを消す)
export function norm(s) {
  return String(s).normalize('NFKC').toLowerCase().replace(/[ァ-ヶ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0x60))
    .replace(/[\s_{}^·・,、。()()[\]「」:：/'’"“”.\-–—~〜]/g, '');
}
// 文型の {名前} を値で埋める(値がなければ {名前} のまま)
export const fill = (pattern, v) => pattern.replace(/\{([^{}]+)\}/g, (m, k) => (v[k] != null && v[k] !== '' ? v[k] : m));
export const slotsOf = pattern => [...new Set([...pattern.matchAll(/\{([^{}]+)\}/g)].map(m => m[1]))];

// ---- 英文の点検の規則 ----
// find(text) は当たった所の配列 [{ i: 位置, len: 長さ, fix: 直した文字(直し方が1つに決まらないときは null) }] を返す
const SUP = { '-': '⁻', '−': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
const SUB = { 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉' };
const sup = s => String(s).replace(/^\+/, '').replace(/^([-−]?)0+(?=\d)/, '$1').replace(/[-−\d]/g, c => SUP[c]);
const sub = s => s.replace(/\d/g, c => SUB[c]);
const NUM = String.raw`(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?`;
// 数が語・合金名(Ti6Al4V、Ti-6Al-4V)・大きな数の一部でないこと
const PRE = String.raw`(?<![\p{L}\d.,]|\p{L}[-‐–])`;
const rx = (re, fix = () => null) => t => [...t.matchAll(re)].map(m => ({ i: m.index, len: m[0].length, fix: fix(...m) })).filter(h => h.fix !== false);
const keepCase = (from, to) => (/^[A-Z]/.test(from) ? to[0].toUpperCase() + to.slice(1) : to);

const UNITS = ['nm', 'µm', 'μm', 'mm', 'cm', 'km', 'm', 'kg', 'mg', 'g', 'min', 'ms', 'µs', 'μs', 'h', 'K', 'kV', 'mV', 'V', 'mA', 'µA', 'μA', 'kW', 'mW', 'W',
  'kJ', 'mJ', 'J', 'keV', 'eV', 'kHz', 'MHz', 'GHz', 'Hz', 'mol', 'mmol', 'mL', 'kPa', 'MPa', 'GPa', 'Pa', 'kN', 'HV', 'HRC', 'HRB', 'HBW', 'wt%', 'at%', 'vol%', 'mass%', 'ppm'];
const UNIT_CASE = { Mpa: 'MPa', MPA: 'MPa', mpa: 'MPa', Gpa: 'GPa', GPA: 'GPa', gpa: 'GPa', Kpa: 'kPa', KPa: 'kPa', kpa: 'kPa', KJ: 'kJ', Kj: 'kJ', Kg: 'kg', KG: 'kg',
  KHz: 'kHz', Khz: 'kHz', khz: 'kHz', Mhz: 'MHz', mhz: 'MHz', Ghz: 'GHz', ghz: 'GHz', KV: 'kV', Kv: 'kV', KW: 'kW', Kw: 'kW', KN: 'kN', Kn: 'kN',
  KeV: 'keV', Kev: 'keV', kev: 'keV', ev: 'eV', Ev: 'eV', EV: 'eV', hz: 'Hz', Hv: 'HV', hv: 'HV', Hrc: 'HRC', hrc: 'HRC' };
const UNIT_ABBR = { hr: 'h', hrs: 'h', mins: 'min', sec: 's', secs: 's' };
const PLURAL = { datas: 'data', informations: 'information', researches: 'research', equipments: 'equipment', evidences: 'evidence', advices: 'advice',
  knowledges: 'knowledge', softwares: 'software', feedbacks: 'feedback', literatures: 'literature' };
const ELEMENTS = new Set(('H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe '
  + 'Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl Mc Lv Ts Og').split(' '));
// 酸化物・窒化物などの形(…O2、…N4、…C6)でないが、材料でよく書く化合物
const FORMULAS = new Set(['Fe3C', 'Mg2Si', 'Al2Cu', 'Ni3Al', 'Ni3Ti', 'Ni3Nb', 'Al3Sc', 'Al3Zr', 'Al3Ti', 'TiAl3', 'Ti3Al', 'Fe3Al', 'Fe3Si', 'Fe2B', 'B4C', 'Al2CuMg', 'MgZn2',
  'Mg17Al12', 'Al6Mn', 'Cu6Sn5', 'Cu3Sn', 'Ag3Sn', 'Nd2Fe14B', 'SmCo5', 'Sm2Co17', 'Bi2Te3', 'Fe2Mo', 'Fe2Nb', 'NiAl3', 'Cr7C3', 'Mo2C', 'Fe23C6', 'Al4C3', 'Ti5Si3', 'Mo5Si3', 'Nb3Sn', 'MoSi2', 'H2O']);
// 鋼・鋳鋼の規格の名前で、元素記号の並びに見えるもの(JIS の SKH51・SUP9・SUH3・SCS13・SNB7、ASTM の CF8・CF3M・HP40 など)
const GRADE = /^(?:S[A-Z]{2}\d|C[FN](?!4$)\d|HP\d+$|BC\d+$)/;
const isFormula = tok => {
  const parts = [...tok.matchAll(/([A-Z][a-z]?)(\d*)/g)];
  if (parts.map(p => p[0]).join('') !== tok || parts.length < 2 || !/\d/.test(tok) || /\d{3}/.test(tok) || GRADE.test(tok)) return false;
  if (parts.some(p => p[2] === '1')) return false; // 化学式で下付きの 1 は書かない(HC1・BC1 のような試料の名前)
  if (!parts.every(p => ELEMENTS.has(p[1]))) return false;
  return FORMULAS.has(tok) || /(?:O|N|C|F|S|B|H|P|Cl|Se|Te|I)\d+$/.test(tok);
};
// 冠詞 a / an: 1文字ずつ読む略語だけ(SIMS・SAXS・STEM のように語として読む略語は入れない)
const ACRONYMS = new Set(['SEM', 'TEM', 'HRTEM', 'XRD', 'EDS', 'EDX', 'EBSD', 'XPS', 'AFM', 'DSC', 'DTA', 'TGA', 'XRF', 'NMR', 'FTIR', 'SAED', 'EPMA', 'ICP', 'OM', 'HAZ', 'MD',
  'DFT', 'FEM', 'FCC', 'BCC', 'HCP', 'SPS', 'UTS', 'SCC', 'BSE', 'LPBF', 'SLM', 'DED', 'CMC', 'MMC', 'DIC', 'LED', 'EELS', 'UV', 'IR', 'CVD', 'PVD']);
const DET = new Set(['the', 'a', 'an', 'this', 'that', 'these', 'those', 'its', 'their', 'our', 'his', 'her', 'my', 'your', 'each', 'every', 'any', 'no', 'some', 'all', 'both',
  'either', 'neither', 'another', 'such', 'what', 'which', 'whose']);
const PRED = new Set(['is', 'are', 'was', 'were', 'be', 'been', 'being', 'remain', 'remains', 'remained', 'become', 'becomes', 'became', 'seem', 'seems', 'seemed', 'appear', 'appears', 'appeared']);
const SUPERL = new Set(['highest', 'lowest', 'largest', 'smallest', 'greatest', 'best', 'worst', 'finest', 'coarsest', 'strongest', 'weakest', 'hardest']);
const AFTER_ADV = new Set(['at', 'in', 'of', 'on', 'for', 'among', 'when', 'after', 'before', 'and', 'or', 'than', 'with', 'during', 'under', 'to', 'by', 'from', 'as', 'is', 'was',
  'are', 'were', 'if', 'because', 'since', 'while', 'within', 'overall', 'practice', 'practices', 'regards', 'wishes']);
// best / worst が副詞のとき(the model best describes …、can best be seen)
const MODAL = new Set(['can', 'could', 'may', 'might', 'will', 'would', 'shall', 'should', 'must']);
const ADV_V = /^(?:be|been|describ|fit|represent|match|explain|reflect|suit|captur|reproduc|agree|approximat|characteri[sz]|illustrat|known|seen|understood|view|serv|predict|correlat|account|demonstrat|show|reveal)/;
const FOLLOW_N = new Set(['equation', 'equations', 'reason', 'reasons', 'table', 'figure', 'section', 'sections', 'conditions', 'procedure', 'steps', 'expression', 'relationship', 'relation', 'assumptions', 'questions']);
const ABBR_END = /(?:\b(?:Fig|Figs|Eq|Eqs|Ref|Refs|No|Nos|Vol|vol|pp|p|ca|approx|vs|cf|Sect|Sec|Ch|Tab|Dr|Prof|resp|al|etc|Inc|Ltd|Co|Corp|Ex|Nr|St|e\.g|i\.e)\.)$/;

function words(t) { return [...t.matchAll(/[\p{L}\d][\p{L}\d'’-]*|[^\s\p{L}\d]/gu)].map(m => ({ w: m[0], lw: m[0].toLowerCase(), i: m.index })); }

// 数字で始まる文: 行ごとに文の頭を探す(Fig. 3 や et al. のあとの数は文の頭ではない。見出しの行と、行頭の番号 1. 1) は除く)
function numberStart(t) {
  const hits = [];
  let off = 0;
  for (const line of t.split('\n')) {
    const s = line.trim();
    const heading = !/[.?!:;]["')\]”’]*$/.test(s) && s.split(/\s+/).length <= 10;
    if (s && !heading) {
      const starts = [line.search(/\S/)];
      for (const m of line.matchAll(/[.!?]["')\]”’]*\s+/g)) if (!ABBR_END.test(line.slice(0, m.index + 1))) starts.push(m.index + m[0].length);
      for (const p of starts) {
        const rest = line.slice(p);
        if (!/^[−-]?\d/.test(rest) || /^\(?\d+[.)]\s/.test(rest)) continue;
        hits.push({ i: off + p, len: rest.match(/^\S+/)[0].length, fix: null });
      }
    }
    off += line.length + 1;
  }
  return hits;
}
// the の抜けやすい所の目安: the same、名詞の前の最上級、the following + 名詞、the rest of
function theHint(t) {
  const ws = words(t);
  const hits = [];
  ws.forEach((x, k) => {
    const prev = ws[k - 1], next = ws[k + 1];
    const prevWord = prev && /^[\p{L}\d]/u.test(prev.w) ? prev.lw : null;
    const ok = prevWord && (DET.has(prevWord) || /['’]s$/.test(prevWord));
    const nextWord = next && /^\p{L}/u.test(next.w) ? next.lw : null;
    if (x.lw === 'same' && !ok && !['very', 'exact', 'much'].includes(prevWord)) hits.push({ i: x.i, len: x.w.length, fix: null });
    else if ((x.lw === 'best' || x.lw === 'worst') && (MODAL.has(prevWord) || ADV_V.test(nextWord ?? ''))) return;
    else if (SUPERL.has(x.lw) && !ok && !PRED.has(prevWord) && !/^\d/.test(prevWord ?? '') && !['second', 'third', 'fourth', 'fifth', 'next', 'very'].includes(prevWord) && nextWord && !AFTER_ADV.has(nextWord))
      hits.push({ i: x.i, len: x.w.length, fix: null });
    else if (x.lw === 'following' && !ok && nextWord && FOLLOW_N.has(nextWord)) hits.push({ i: x.i, len: x.w.length, fix: null });
    else if (x.lw === 'rest' && nextWord === 'of' && !ok) hits.push({ i: x.i, len: x.w.length, fix: null });
  });
  for (const m of t.matchAll(/\b(on) (other hand)\b/gi)) hits.push({ i: m.index, len: m[0].length, fix: `${m[1]} the ${m[2]}` });
  for (const m of t.matchAll(/\b(in) (present (?:study|work|paper|investigation|research|experiments?))\b/gi)) hits.push({ i: m.index, len: m[0].length, fix: `${m[1]} the ${m[2]}` });
  return hits;
}
// 同じ文書の中で書き方が混ざっているとき、少ない方を示す
function mixed(t, re, styleOf, fixTo) {
  const ms = [...t.matchAll(re)].map(m => ({ m, s: styleOf(m) }));
  const n = {};
  for (const x of ms) n[x.s] = (n[x.s] ?? 0) + 1;
  const styles = Object.keys(n);
  if (styles.length < 2) return [];
  const main = styles.reduce((a, b) => (n[b] > n[a] ? b : a));
  return ms.filter(x => x.s !== main).map(({ m }) => ({ i: m.index, len: m[0].length, fix: fixTo(m, main) }));
}

export const RULES = [
  { id: 'unit-space', find: rx(new RegExp(`${PRE}(${NUM})(${UNITS.join('|')})(?![\\p{L}\\d])`, 'gu'), (m, n, u) => `${n} ${u}`) },
  { id: 'deg-space', find: rx(new RegExp(`${PRE}(${NUM})°C(?!\\p{L})`, 'gu'), (m, n) => `${n} °C`) },
  { id: 'degree-c', find: t => [
    ...rx(/(?:(\d)\s*)?°\s+C(?!\p{L})/gu, (m, d) => (d ? `${d} °C` : '°C'))(t),
    ...rx(/(\d)\s?[oº˚]\s?C(?!\p{L})/gu, (m, d) => `${d} °C`)(t),
    ...rx(/(?:(\d)\s?)?℃/gu, (m, d) => (d ? `${d} °C` : '°C'))(t),
    ...rx(/(?:(\d)\s?)?°\s?K(?!\p{L})/gu, (m, d) => (d ? `${d} K` : 'K'))(t),
    ...rx(/(\d)\s?deg(?:rees?|\.)?\s?C(?!\p{L})/giu, (m, d) => `${d} °C`)(t)] },
  { id: 'percent-mix', find: t => mixed(t, /(\d)( ?)%/g, m => (m[2] ? 'sp' : 'ns'), (m, main) => `${m[1]}${main === 'sp' ? ' ' : ''}%`) },
  { id: 'wt-mix', find: t => mixed(t, /\b(wt|at|vol)(\.?)( ?)%/g, m => `${m[2]}${m[3]}`, (m, main) => `${m[1]}${main}%`) },
  { id: 'unit-case', find: rx(new RegExp(`(?<![\\p{L}\\d.,])(${NUM})\\s?(${Object.keys(UNIT_CASE).join('|')})(?!\\p{L})`, 'gu'), (m, n, u) => `${n} ${UNIT_CASE[u]}`) },
  { id: 'unit-abbr', find: rx(/(\d)\s?(hrs?|mins|secs?)(?![\p{L}\d])/giu, (m, d, u) => `${d} ${UNIT_ABBR[u.toLowerCase()]}`) },
  { id: 'micro-um', find: rx(/(\d)\s?um(?!\p{L})/gu, (m, d) => `${d} µm`) },
  { id: 'sub-sup', find: t => [
    ...rx(/(?<=^|[\s\d/·(])((?:k|c|m|µ|μ|n)?m)([23])(?![\p{L}\d])/gu, (m, u, e) => u + sup(e))(t),
    ...rx(/(?<=^|[\s·/(])(s|m|cm|mm|nm|µm|μm|K|h|min|g|kg|mol|Pa|MPa|J)-([1-4])(?![\p{L}\d])/gu, (m, u, e) => u + sup(`-${e}`))(t),
    ...rx(/(?<=\p{L})\^\{?\(?([-−]?\d+)\)?\}?/gu, (m, e) => sup(e))(t).filter(h => !/1\/2/.test(t.slice(h.i, h.i + h.len + 2))),
    ...rx(/(?<=MPa\s?[·⋅]?\s?)m(?:\^\(?1\/2\)?|1\/2|0\.5)(?!\d)/gu)(t)] },
  { id: 'formula-sub', find: rx(/(?<![\p{L}\d])((?:[A-Z][a-z]?\d*){2,})(?![\p{L}\d])/gu, (m, tok) => (isFormula(tok) ? sub(tok) : false)) },
  { id: 'exponent', find: t => [
    ...rx(/(\d+(?:\.\d+)?)\s?[x×]\s?10(?:\^\{?\(?([-−+]?\d+)\)?\}?|([-−]\d+))(?!\d)/gu, (m, a, e1, e2) => `${a} × 10${sup(e1 ?? e2)}`)(t),
    ...rx(/(?<![\p{L}\d.])(\d+(?:\.\d+)?)[eE]([-+]?\d+)(?![\p{L}\d])/gu, (m, a, e) => `${a} × 10${sup(e)}`)(t)] },
  { id: 'range-tilde', find: rx(/(\d+(?:\.\d+)?)\s?[~〜～∼]\s?(\d+(?:\.\d+)?)/gu, (m, a, b) => `${a}–${b}`) },
  // from 3–5 specimens(3〜5 個の試料から)は正しいので、from は範囲のあとに単位・°C・% があるときだけ調べる
  { id: 'range-words', find: t => [
    ...rx(/\b(between)\s+[−-]?\d+(?:\.\d+)?(?:\s?(?:°C|K|%|[a-zA-Zµμ]+%?))?\s?[–—-]\s?\d/giu)(t),
    ...rx(new RegExp(`\\b(from)\\s+[−-]?\\d+(?:\\.\\d+)?(?:\\s?(?:°C|%|${UNITS.join('|')}))?\\s?[–—-]\\s?[−-]?\\d+(?:\\.\\d+)?\\s?(?:°C|%|${UNITS.join('|')})(?![\\p{L}\\d])`, 'giu'))(t)] },
  // researches は「he researches」のような動詞なら正しいので、主語の代名詞・関係詞のあとは調べない
  { id: 'plural-uncountable', find: t => rx(new RegExp(`\\b(${Object.keys(PLURAL).join('|')})\\b`, 'gi'), m => keepCase(m, PLURAL[m.toLowerCase()]))(t)
    .filter(h => !(/^researches$/i.test(t.slice(h.i, h.i + h.len)) && /\b(?:he|she|it|who|which|that|also)\s+$/i.test(t.slice(0, h.i)))) },
  { id: 'consist', find: rx(/\b(is|are|was|were|be|been|being)\s+consist(?:ed|ing|s)?\s+of\b/gi, (m, v) => ({ is: 'consists of', are: 'consist of', was: 'consisted of', were: 'consisted of' })[v.toLowerCase()] ?? null) },
  { id: 'about-verb', find: rx(/\b(discuss(?:es|ed|ing)?|mention(?:s|ed|ing)?|explain(?:s|ed|ing)?|consider(?:s|ed|ing)?)\s+about\b(?!\s+(?:\d|a\s+(?:few|third|quarter|half|dozen)|half|one|two|three|four|five|six|seven|eight|nine|ten|twenty|fifty|hundred|several|twice|equal(?:ly)?|identical|constant|the\s+same))/gi, (m, v) => v) },
  { id: 'reason-because', find: rx(/\b(reason)\s+(is|was)\s+because\b/gi, (m, r, v) => `${r} ${v} that`) },
  { id: 'according', find: rx(/\baccording to (?:the|our|these|this|present) (?:experimental )?(?:results?|experiments?|data|observations?)\b/gi) },
  { id: 'as-follows', find: rx(/\b(as) following\b/gi, (m, a) => `${a} follows`) },
  { id: 'number-start', find: numberStart },
  { id: 'eg-form', find: t => [
    ...rx(/\b(e\.g|i\.e)(?![.\p{L}])/giu, (m, a) => `${a}.`)(t),
    ...rx(/\b(eg|ie)\b\.?/g, m => (m.startsWith('e') ? 'e.g.' : 'i.e.'))(t)] }, // 小文字だけ(Eg はバンドギャップ、EG はエチレングリコール)
  { id: 'eg-comma', find: rx(/\b(e\.g\.|i\.e\.)(?![,\p{L}])/giu, (m, a) => `${a},`) },
  { id: 'et-al', find: t => [...rx(/\bet\.\s?al\b\.?/g, () => 'et al.')(t), ...rx(/\bet al(?![.\p{L}])/gu, () => 'et al.')(t)] },
  { id: 'fig-space', find: t => [...rx(/\b(Figs?|Eqs?|Refs?)\.(?=\(?\d)/g, (m, a) => `${a}. `)(t), ...rx(/\b(Figs?|Figures?|Tables?|Eqs?|Equations?)(?=\d)/g, (m, a) => `${a} `)(t)] },
  // the Fig. 3 data・the Table 1 values のように、番号のあとの名詞に the が掛かるときは正しいので調べない
  { id: 'the-fig', find: rx(/\b(the)\s+(?=(?:Fig\.|Figs\.|Figure|Figures|Table|Tables|Eq\.|Eqs\.|Equation)\s?\(?\d+(?!\d)(?:\)|(?!\)))(?:\([a-z]\)|[a-z])?(?![(a-z])(?!\s+(?:data|values?|results?|curves?|conditions?|insets?|samples?|specimens?|compositions?|parameters?|measurements?|alloys?|steels?)\b))/gi, () => '') },
  { id: 'the-hint', find: theHint },
  { id: 'a-an', find: rx(/\b(a|an|A|An)\s+([A-Z]{2,6})(?![\p{L}\d])/gu, (m, a, x) => {
    if (!ACRONYMS.has(x)) return false;
    const want = /^[AEFHILMNORSX]/.test(x) ? 'an' : 'a';
    return a.toLowerCase() === want ? false : `${keepCase(a, want)} ${x}`;
  }) },
  { id: 'double-word', find: rx(/\b(the|a|an|of|in|on|at|to|and|for|with|by|is|was|are|were)\s+\1\b(?![\s-]+(?:situ|vivo|vitro)\b)/giu, (m, a) => a) }, // in in situ は正しい
  { id: 'space-punct', find: rx(/(?<=[\p{L}\d)%])[ \t]+([,.;])(?=\s|$)/gu, (m, p) => p) },
  { id: 'fullwidth', find: rx(/[！-｝　、。]+/gu, m => [...m].map(c => (c === '、' ? ', ' : c === '。' ? '. ' : c === '　' ? ' ' : c.normalize('NFKC'))).join('')) },
  { id: 'japanese-char', find: rx(/[぀-ヿ㐀-鿿]+/gu) },
  { id: 'contraction', find: rx(/\b(?:do|does|did|ca|wo|is|are|was|were|could|should|would|has|have|had)n['’]t\b|\b(?:it|that|there|we|they|you)['’](?:s|re|ve|ll|d)\b/gi) },
];

// 英文を点検する。規則ごとの当たりを位置の順に並べる(同じ所に同じ規則が2回当たったものは1つにする)
export function check(text) {
  const hits = [];
  for (const r of RULES) {
    const seen = new Set();
    for (const h of r.find(text)) {
      if (seen.has(h.i)) continue;
      seen.add(h.i);
      hits.push({ rule: r.id, i: h.i, len: h.len, s: text.slice(h.i, h.i + h.len), fix: h.fix ?? null });
    }
  }
  return hits.sort((a, b) => a.i - b.i || RULES.findIndex(r => r.id === a.rule) - RULES.findIndex(r => r.id === b.rule));
}
// 直し方が決まっている当たりだけを直した文(重なる当たりは先のものだけ)
export function applyFixes(text, hits) {
  let out = '', at = 0;
  for (const h of hits) {
    if (h.fix == null || h.i < at) continue;
    out += text.slice(at, h.i) + h.fix;
    at = h.i + h.len;
  }
  return out + text.slice(at);
}

if (app && list) init();

function init() {
  const T = JSON.parse(app.dataset.t || '{}');
  const t = (k, v = {}) => (T[k] ?? k).replace(/\{(\w+)\}/g, (m, x) => (x in v ? v[x] : m));
  const KEY = 'phrasesFav';
  const html = document.documentElement;
  const cards = [...list.querySelectorAll('.ph-card')];
  const groups = [...list.querySelectorAll('.ph-group')];
  const ids = new Set(cards.map(c => c.dataset.id));
  const keyOf = new Map(cards.map(c => [c, norm(c.dataset.k || '')]));
  const q = document.getElementById('ph-q');
  const only = document.getElementById('ph-only');
  const chips = [...app.querySelectorAll('.ph-chips [data-g]')];
  const count = app.querySelector('.ph-count');
  const favN = app.querySelector('.ph-fav-n');
  const msg = app.querySelector('.ph-msg');
  const none = document.querySelector('.ph-none');
  let group = '';

  // お気に入り: このブラウザに残したもの(保存できないブラウザでも、開いている間は使える)
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; } };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify([...fav])); } catch {} };
  let fav = new Set(load().filter(id => ids.has(id)));
  const params = new URLSearchParams(location.search);
  if (params.get('q')) q.value = params.get('q');
  if (params.get('g') && chips.some(c => c.dataset.g === params.get('g'))) group = params.get('g');

  list.classList.add('ph-js');
  app.hidden = false;

  function render() {
    const ws = q.value.split(/[\s　]+/).map(norm).filter(Boolean);
    let n = 0;
    for (const c of cards) {
      const on = fav.has(c.dataset.id);
      c.classList.toggle('is-fav', on);
      const b = c.querySelector('[data-fav]');
      b.setAttribute('aria-pressed', String(on));
      b.querySelector('.ph-star').textContent = on ? '★' : '☆';
      const show = (!group || c.dataset.g === group) && ws.every(w => keyOf.get(c).includes(w)) && (!only.checked || on);
      c.hidden = !show;
      if (show) n++;
    }
    for (const g of groups) {
      g.hidden = !g.querySelector('.ph-card:not([hidden])');
      g.classList.toggle('has-fav', !!g.querySelector('.ph-card.is-fav'));
    }
    for (const c of chips) c.setAttribute('aria-pressed', String(c.dataset.g === group));
    count.textContent = t('count', { n, total: cards.length });
    none.hidden = n > 0;
    favN.textContent = t('fav_n', { n: fav.size });
  }

  const flash = (el, text) => { el.textContent = text; el.hidden = false; clearTimeout(el.tm); el.tm = setTimeout(() => { el.hidden = true; }, 3000); };
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch {}
    try {
      const a = document.createElement('textarea');
      a.value = text; a.setAttribute('readonly', ''); a.style.position = 'fixed'; a.style.opacity = '0';
      document.body.append(a); a.select();
      const ok = document.execCommand('copy');
      a.remove();
      return ok;
    } catch { return false; }
  }

  q.addEventListener('input', render);
  for (const c of chips) c.addEventListener('click', () => { group = c.dataset.g; render(); });
  only.addEventListener('change', render);

  // カードの中のボタン: お気に入り・差し込み欄・コピー
  list.addEventListener('click', async e => {
    const b = e.target.closest('button');
    if (!b) return;
    const card = b.closest('.ph-card');
    if (b.dataset.fav) {
      const id = b.dataset.fav;
      if (fav.has(id)) fav.delete(id); else fav.add(id);
      save(); render();
    } else if (b.hasAttribute('data-fill')) {
      const box = card.querySelector('.ph-fill');
      if (!box.firstChild) buildFill(card, box);
      box.hidden = !box.hidden;
      b.setAttribute('aria-expanded', String(!box.hidden));
      if (!box.hidden) box.querySelector('input')?.focus();
    } else if (b.hasAttribute('data-copy')) {
      const src = b.dataset.copy === 'out' ? card.querySelector('.ph-out') : card.querySelector('.ph-ex-en');
      const ok = await copy(src.textContent);
      flash(card.querySelector('.ph-copied'), ok ? t('copied') : t('copy_fail'));
    }
  });
  // 差し込み欄: 文型の {名前} ごとに入力欄を作り、例文の値を入れておく。入れた値で文を作り直す
  function buildFill(card, box) {
    const pattern = card.dataset.en;
    const v = JSON.parse(card.dataset.v || '{}');
    const grid = document.createElement('div');
    grid.className = 'ph-fill-grid';
    const out = document.createElement('p');
    out.className = 'ph-out';
    out.lang = 'en';
    const inputs = slotsOf(pattern).map(k => {
      const label = document.createElement('label');
      const span = document.createElement('span');
      span.textContent = k;
      const input = document.createElement('input');
      input.type = 'text';
      input.value = v[k] ?? '';
      input.dataset.k = k;
      input.autocomplete = 'off';
      input.spellcheck = false;
      input.lang = 'en';
      label.append(span, input);
      grid.append(label);
      return input;
    });
    const update = () => { out.textContent = fill(pattern, Object.fromEntries(inputs.map(x => [x.dataset.k, x.value.trim()]))); };
    grid.addEventListener('input', update);
    const row = document.createElement('div');
    row.className = 'ph-fill-row';
    const made = document.createElement('span');
    made.className = 'ph-made';
    made.textContent = t('made');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn btn-primary btn-small';
    btn.dataset.copy = 'out';
    btn.textContent = t('copy_made');
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'btn btn-ghost btn-small';
    reset.textContent = t('reset');
    reset.addEventListener('click', () => { for (const x of inputs) x.value = v[x.dataset.k] ?? ''; update(); });
    row.append(btn, reset);
    box.append(grid, made, out, row);
    update();
  }

  app.querySelector('[data-print="fav"]').addEventListener('click', () => {
    if (!fav.size) { flash(msg, t('fav_first')); return; }
    html.classList.add('ph-print-fav');
    window.print();
  });
  app.querySelector('[data-print="shown"]').addEventListener('click', () => {
    html.classList.add('ph-print-shown');
    window.print();
  });
  window.addEventListener('afterprint', () => html.classList.remove('ph-print-fav', 'ph-print-shown'));
  app.querySelector('[data-clear]').addEventListener('click', () => { fav = new Set(); only.checked = false; save(); render(); });

  // ページ内のリンク(#p-…・#g-…)の表現が絞り込みで隠れているときは、絞り込みを外して見せる
  const reveal = () => {
    const m = location.hash.match(/^#(p-[a-z0-9-]+|g-[a-z0-9-]+)$/);
    const el = m && document.getElementById(m[1]);
    if (!el || !list.contains(el) || (!el.hidden && !el.closest('[hidden]'))) return;
    q.value = ''; group = ''; only.checked = false; render();
    el.scrollIntoView();
  };
  window.addEventListener('hashchange', reveal);
  render();
  reveal();
  initCheck(t, copy, flash);
}

// ---- 英文の点検の画面 ----
function initCheck(t, copy, flash) {
  const box = document.getElementById('ph-check');
  if (!box) return;
  const R = JSON.parse(document.getElementById('ph-rules').textContent);
  const area = box.querySelector('#ph-text');
  const res = box.querySelector('.ph-res');
  const fixedBox = box.querySelector('.ph-fixed');
  const fixedText = box.querySelector('.ph-fixed-text');
  const marked = box.querySelector('.ph-marked');
  const msg = box.querySelector('.ph-check-msg');
  box.querySelector('.ph-check-ui').hidden = false;
  const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  let tm;
  function run() {
    const text = area.value;
    res.replaceChildren();
    marked.replaceChildren();
    fixedBox.hidden = true;
    if (!text.trim()) { msg.textContent = t('check_empty'); return; }
    const hits = check(text);
    const n = { error: 0, style: 0, hint: 0 };
    for (const h of hits) n[R[h.rule].level]++;
    msg.textContent = hits.length ? t('check_n', { n: hits.length, e: n.error, s: n.style, h: n.hint }) : t('check_none');
    // 当たった所に印を付けた文(重なる所は先の当たりだけに印)
    let at = 0, htmlOut = '';
    hits.forEach((h, k) => {
      if (h.i < at) return;
      htmlOut += esc(text.slice(at, h.i)) + `<mark class="ph-m-${R[h.rule].level}" title="${esc(R[h.rule].name)}">${esc(h.s)}<sup>${k + 1}</sup></mark>`;
      at = h.i + h.len;
    });
    marked.innerHTML = htmlOut + esc(text.slice(at));
    marked.hidden = !hits.length;
    hits.forEach((h, k) => {
      const r = R[h.rule];
      const li = document.createElement('li');
      li.className = `ph-hit ph-hit-${r.level}`;
      li.innerHTML = `<p class="ph-hit-h"><span class="ph-lv ph-lv-${r.level}">${esc(t(`level_${r.level}`))}</span> <b>${k + 1}. ${esc(r.name)}</b></p>`
        + `<p class="ph-hit-s" lang="en"><code>${esc(h.s)}</code>${h.fix != null ? ` → <code>${esc(h.fix) || esc(t('check_delete'))}</code>` : ''}</p>`
        + `<p class="ph-hit-why">${esc(r.why)}</p><p class="ph-hit-fix"><b>${esc(t('check_how'))}</b> ${esc(r.fix)}</p>`;
      res.append(li);
    });
    if (hits.some(h => h.fix != null)) {
      fixedText.textContent = applyFixes(text, hits);
      fixedBox.hidden = false;
    }
  }
  area.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(run, 300); });
  box.querySelector('[data-run]').addEventListener('click', run);
  box.querySelector('[data-sample]').addEventListener('click', () => { area.value = area.dataset.sample; run(); });
  box.querySelector('[data-clear-text]').addEventListener('click', () => { area.value = ''; run(); area.focus(); });
  box.querySelector('[data-copy-fixed]').addEventListener('click', async () => {
    const ok = await copy(fixedText.textContent);
    flash(box.querySelector('.ph-fixed-msg'), ok ? t('copied') : t('copy_fail'));
  });
}
