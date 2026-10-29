// 拡散係数 D = D0·exp(−Q/RT)、拡散距離の目安 x ≈ √(Dt)(と 2√(Dt))、
// 一定の表面濃度からの浸炭など: (Cx − C0)/(Cs − C0) = 1 − erf(x/(2√(Dt)))
import { num, sci, reader } from './eng.js';
const form = document.getElementById('diff-form');
const out = k => document.querySelector(`[data-out="${k}"]`);
const val = reader(form);
const R = 8.314;

// 誤差関数(Abramowitz & Stegun 7.1.26、誤差 1.5×10⁻⁷ 以下)
export function erf(x) {
  const s = Math.sign(x), t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return s * y;
}

function update() {
  const d0 = val('d0', 0), q = val('q', 0) * 1000, tc = val('t', -273.15), hours = val('hours', 0), xmm = val('x', 0);
  const T = tc + 273.15; // 絶対零度より低い温度は既定値に戻す(reader の下限)
  const D = d0 * Math.exp(-q / (R * T));
  const t = hours * 3600;
  const L = Math.sqrt(D * t);
  out('tk').textContent = `${num(T, 5)} K`;
  out('d').textContent = `${sci(D)} m²/s`;
  out('l').textContent = Number.isFinite(L) ? `${num(L * 1e3, 4)} mm` : '–';
  const z = (xmm / 1e3) / (2 * L);
  out('ratio').textContent = L > 0 ? `${num((1 - erf(z)) * 100, 4)} %` : '–';
}
form.addEventListener('input', update);
form.addEventListener('submit', e => e.preventDefault());
update();
