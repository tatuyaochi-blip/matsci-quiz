// 熱膨張と熱応力。自由な膨張 ΔL = α·L·ΔT(熱ひずみ ε = αΔT)。
// 拘束したときの熱応力(引張を正): 棒を両端で拘束(一軸)なら σ = −E(α − αs)ΔT、
// 基板上の薄膜や面内を拘束した板(等二軸)なら σ = −E(α − αs)ΔT/(1 − ν)。αs は拘束する側の線膨張係数(0 なら動かない壁)
// |σ| が強さ σs に達する温度変化 ΔTc = σs/(E|α − αs|)(等二軸では ×(1 − ν))
import { num, sci, reader } from './eng.js';
const form = document.getElementById('thermal-form');
const out = k => document.querySelector(`[data-out="${k}"]`);
const val = reader(form);
const T = JSON.parse(form.dataset.text);
// 負の数はハイフンでなくマイナス記号「−」で(−0 は 0 に)
const minus = s => s.replace(/^-/, '−');
const fmt = (x, d) => minus(num(x === 0 ? 0 : x, d));

function update() {
  const biaxial = form.elements.mode.value === 'biaxial';
  const alpha = val('alpha') * 1e-6, as = val('as') * 1e-6, L = val('l', 0);
  const dT = val('t2') - val('t1');
  // E は正の値だけ(0 以下は既定値)。ν は 0〜0.5 の範囲外なら既定値(1 − ν が 0 以下になるのを防ぐ)
  const E = val('e', 1e-9) * 1e9, sy = val('sy', 0) * 1e6;
  const nu0 = val('nu', 0), nu = nu0 <= 0.5 ? nu0 : Number(form.elements.nu.defaultValue);
  const f = biaxial ? 1 / (1 - nu) : 1;
  const sigma = -E * (alpha - as) * dT * f;
  const dtc = sy / (E * Math.abs(alpha - as) * f);
  out('dt').textContent = `${fmt(dT, 5)} K`;
  out('dl').textContent = `${fmt(alpha * L * dT, 4)} mm`;
  out('eps').textContent = minus(sci(alpha * dT));
  out('sigma').textContent = `${fmt(sigma / 1e6, 4)} MPa`;
  out('state').textContent = Math.abs(sigma) < 1e-6 ? T.none : sigma > 0 ? T.tension : T.compression;
  out('dtc').textContent = Number.isFinite(dtc) ? `${fmt(dtc, 4)} K` : T.no_limit;
}
form.addEventListener('input', update);
form.addEventListener('submit', e => e.preventDefault());
update();
