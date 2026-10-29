// XRD のピーク位置。立方晶の面間隔 d = a/√(h²+k²+l²)、ブラッグの法則 nλ = 2d·sinθ(n = 1)。
// 消滅則: 単純立方はすべて、体心立方は h+k+l が偶数、面心立方は h・k・l が全部偶数か全部奇数、
// ダイヤモンド構造は面心立方の条件に加え、全部偶数なら h+k+l が4の倍数
import { num, reader } from './eng.js';
const form = document.getElementById('xrd-form');
const out = k => document.querySelector(`[data-out="${k}"]`);
const val = reader(form);
const T = JSON.parse(form.dataset.text);

export function allowed(type, h, k, l) {
  const s = h + k + l, even = [h, k, l].every(x => x % 2 === 0), odd = [h, k, l].every(x => Math.abs(x) % 2 === 1);
  if (type === 'bcc') return s % 2 === 0;
  if (type === 'fcc') return even || odd;
  if (type === 'diamond') return odd || (even && s % 4 === 0);
  return true;
}

function update() {
  const type = form.elements.type.value;
  const a = val('a', 1e-6), lam = val('lambda', 1e-6);
  const h = Math.round(val('h')), k = Math.round(val('k')), l = Math.round(val('l'));
  const n2 = h * h + k * k + l * l;
  const d = n2 ? a / Math.sqrt(n2) : NaN;
  const s = lam / (2 * d);
  out('d').textContent = Number.isFinite(d) ? `${num(d, 4)} nm` : '–';
  out('two-theta').textContent = !Number.isFinite(d) ? '–' : s <= 1 ? `${num(2 * Math.asin(s) * 180 / Math.PI, 4)}°` : T.no_peak;
  out('rule').textContent = n2 ? (allowed(type, h, k, l) ? T.rule_yes : T.rule_no) : '–';
  // 小さい角度から順に、出るピークを6本まで
  const seen = new Set(), list = [];
  for (let H = 0; H <= 6; H++) for (let K = 0; K <= H; K++) for (let L = 0; L <= K; L++) {
    const m = H * H + K * K + L * L;
    if (!m || seen.has(m) || !allowed(type, H, K, L)) continue;
    const x = lam * Math.sqrt(m) / (2 * a);
    if (x > 1) continue;
    seen.add(m);
    list.push([m, `(${H}${K}${L}) ${num(2 * Math.asin(x) * 180 / Math.PI, 4)}°`]);
  }
  out('peaks').textContent = list.sort((p, q) => p[0] - q[0]).slice(0, 6).map(p => p[1]).join('; ') || '–';
}
form.addEventListener('input', update);
form.addEventListener('submit', e => e.preventDefault());
update();
