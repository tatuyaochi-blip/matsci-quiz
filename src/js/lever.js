// てこの規則。全体の組成 C0 が、2相の組成 Cα と Cβ のあいだにあるとき
// Wα = (Cβ − C0)/(Cβ − Cα)、Wβ = (C0 − Cα)/(Cβ − Cα)。合金の質量 m があれば各相の質量も出す
import { num, reader } from './eng.js';
const form = document.getElementById('lever-form');
const out = k => document.querySelector(`[data-out="${k}"]`);
const val = reader(form);
const T = JSON.parse(form.dataset.text);

function update() {
  const c0 = val('c0'), ca = val('ca'), cb = val('cb'), m = val('m', 0);
  const lo = Math.min(ca, cb), hi = Math.max(ca, cb);
  const ok = cb !== ca && c0 >= lo && c0 <= hi;
  const wa = (cb - c0) / (cb - ca), wb = 1 - wa;
  out('wa').textContent = ok ? `${num(wa * 100, 4)} %` : '–';
  out('wb').textContent = ok ? `${num(wb * 100, 4)} %` : '–';
  out('ma').textContent = ok ? `${num(wa * m, 4)} g` : '–';
  out('mb').textContent = ok ? `${num(wb * m, 4)} g` : '–';
  out('check').textContent = ok ? T.ok : T.out_of_range;
}
form.addEventListener('input', update);
form.addEventListener('submit', e => e.preventDefault());
update();
