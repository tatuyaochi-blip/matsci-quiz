// 複合材料の弾性率(連続繊維の一方向材)。繊維の体積分率 Vf(質量分率 Wf で入れたときは
// Vf = (Wf/ρf)/(Wf/ρf + (1 − Wf)/ρm) に換算)、密度 ρ = Vfρf + Vmρm。
// 繊維方向(等ひずみ、並列、Voigt): E₁ = VfEf + VmEm。垂直方向(等応力、直列、Reuss): 1/E₂ = Vf/Ef + Vm/Em。
// 繊維方向の荷重のうち繊維の受け持ち VfEf/E₁。比剛性 E/ρ と、軽くて剛い梁の指数 √E/ρ
import { num, reader } from './eng.js';
const form = document.getElementById('comp-form');
const out = k => document.querySelector(`[data-out="${k}"]`);
const val = reader(form);
const T = JSON.parse(form.dataset.text);

function update() {
  const byMass = form.elements.basis.value === 'mass';
  const f = Math.min(Math.max(val('f', 0), 0), 100) / 100;
  const ef = val('ef', 1e-9), em = val('em', 1e-9), rf = val('rf', 1e-9), rm = val('rm', 1e-9);
  const vf = byMass ? (f / rf) / (f / rf + (1 - f) / rm) : f, vm = 1 - vf;
  const rho = vf * rf + vm * rm;
  const e1 = vf * ef + vm * em, e2 = 1 / (vf / ef + vm / em);
  const unit = T.unit_specific;
  out('vf').textContent = `${num(vf * 100, 4)} %`;
  out('wf').textContent = `${num(vf * rf / rho * 100, 4)} %`;
  out('rho').textContent = `${num(rho, 4)} g/cm³`;
  out('e1').textContent = `${num(e1, 4)} GPa`;
  out('e2').textContent = `${num(e2, 4)} GPa`;
  out('ratio').textContent = num(e1 / e2, 3);
  out('share').textContent = `${num(vf * ef / e1 * 100, 4)} %`;
  out('s1').textContent = `${num(e1 / rho, 4)} ${unit}`;
  out('s2').textContent = `${num(e2 / rho, 4)} ${unit}`;
  out('sb').textContent = num(Math.sqrt(e1) / rho, 4);
}
form.addEventListener('input', update);
form.addEventListener('submit', e => e.preventDefault());
update();
