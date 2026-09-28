// Shared by every direction: icons, controls, the approved timeline, real project data, view switching.
// Icons come from icons.js (Phosphor, the set the app ships). Solid glyphs for transport.
const FILLED = new Set(['play', 'skipb', 'skipf', 'record', 'circle', 'square']);
const icon = (name, cls = '', weight) => {
  const w = weight || (FILLED.has(name) ? 'fill' : 'regular');
  const set = PH[name];
  if (!set) return '';
  return `<svg class="i ${cls}" viewBox="0 0 256 256" fill="currentColor" aria-hidden="true">${set[w] || set.regular}</svg>`;
};

// Slider: <div data-slider data-label data-min data-max data-value data-unit data-step data-compact data-ends="A|B">
function initSlider(el) {
  const min = Number(el.dataset.min ?? 0), max = Number(el.dataset.max ?? 100), step = Number(el.dataset.step ?? 1);
  const unit = el.dataset.unit ?? '', digits = (String(step).split('.')[1] || '').length;
  let value = Number(el.dataset.value ?? min);
  el.classList.add('sld'); if (el.dataset.compact !== undefined) el.classList.add('compact');
  el.innerHTML = `${el.dataset.label ? `<div class="sldTop"><span>${el.dataset.label}</span><output></output></div>` : ''}
    <div class="sldRow"><div class="sldTrack"><div class="sldFill"></div><div class="sldThumb" role="slider" tabindex="0" aria-label="${el.dataset.label || ''}"></div></div>${el.dataset.label ? '' : '<output class="sldField"></output>'}</div>
    ${el.dataset.ends ? `<div class="sldEnds">${el.dataset.ends.split('|').map((s) => `<span>${s}</span>`).join('')}</div>` : ''}`;
  const track = el.querySelector('.sldTrack'), thumb = el.querySelector('.sldThumb');
  const render = () => {
    const p = (value - min) / (max - min) * 100;
    el.style.setProperty('--p', p + '%');
    el.querySelectorAll('output').forEach((o) => { o.textContent = value.toFixed(digits) + unit; });
    thumb.setAttribute('aria-valuenow', value);
  };
  const setFrom = (x) => {
    const r = track.getBoundingClientRect();
    const raw = min + Math.min(1, Math.max(0, (x - r.left) / r.width)) * (max - min);
    value = Math.round(raw / step) * step; render();
  };
  track.addEventListener('pointerdown', (e) => { el.classList.add('drag'); track.setPointerCapture(e.pointerId); setFrom(e.clientX); });
  track.addEventListener('pointermove', (e) => { if (el.classList.contains('drag')) setFrom(e.clientX); });
  track.addEventListener('pointerup', () => el.classList.remove('drag'));
  thumb.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') value = Math.min(max, value + step);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') value = Math.max(min, value - step);
    else return;
    e.preventDefault(); render();
  });
  render();
}
// Switch: <button data-switch aria-checked="true">
function initSwitch(b) {
  b.classList.add('switch'); b.setAttribute('role', 'switch'); b.type = 'button';
  if (!b.hasAttribute('aria-checked')) b.setAttribute('aria-checked', 'false');
  b.addEventListener('click', (e) => { e.stopPropagation(); b.setAttribute('aria-checked', String(b.getAttribute('aria-checked') !== 'true')); });
}

const TOTAL = 15.5;
function renderTimeline(el) {
  const pct = (s) => (s / TOTAL * 100) + '%';
  let ticks = '';
  for (let s = 0; s <= 15; s++) ticks += `<div class="tick${s % 2 ? '' : ' major'}" style="left:${pct(s)}">${s % 2 ? '' : `<b>0:${String(s).padStart(2, '0')}</b>`}</div>`;
  const clicks = [3.1, 4.4, 4.9, 6.3, 7.2, 9.1, 12.2].map((s) => `<span class="clickDot" style="left:${pct(s)}"></span>`).join('');
  el.innerHTML = `
    <div class="tlBar">
      <button class="tlBtn" title="Split at playhead (S)">${icon('scissors')}</button>
      <button class="tlBtn" title="Delete (Del)">${icon('trash')}</button>
      <button class="tlBtn on" title="Snapping">${icon('magnet')}</button>
      <span class="tlSep"></span>
      <button class="tlBtn">Select range</button>
      <span class="spacer"></span>
      <div class="tlZoom">
        <button class="tlBtn" title="Zoom out">${icon('zout')}</button>
        <div data-slider data-compact data-min="25" data-max="400" data-step="25" data-value="100" data-unit="%" class="tlZoomSl"></div>
        <button class="tlBtn" title="Zoom in">${icon('zin')}</button>
        <button class="tlBtn">Fit</button>
      </div>
    </div>
    <div class="tlGrid">
      <div class="heads">
        <div></div>
        <div>${icon('film', 'sm')}Screen</div><div>${icon('wave', 'sm')}Audio</div><div>${icon('zin', 'sm')}Zoom</div>
        <div>${icon('eyeoff', 'sm')}Censor</div><div>${icon('cursor', 'sm')}Clicks</div><div>${icon('camera', 'sm')}Camera</div>
      </div>
      <div class="lanes">
        <div class="ruler">${ticks}</div>
        <div class="lane"><div class="clip screen" style="left:0;width:calc(27.7% - 2px)">Screen <span class="dur">4.3s</span></div><div class="clip screen sel" style="left:27.7%;width:72.3%">Screen <span class="dur">11.2s</span></div></div>
        <div class="lane"><div class="clip audio" style="left:0;width:calc(27.7% - 2px)"><svg preserveAspectRatio="none" viewBox="0 0 100 20">${wave(7, 90)}</svg></div><div class="clip audio" style="left:27.7%;width:72.3%"><svg preserveAspectRatio="none" viewBox="0 0 100 20">${wave(31, 240)}</svg></div></div>
        <div class="lane"><div class="zpill" style="left:43%;width:17%">${icon('zin', 'sm')}1.8×</div></div>
        <div class="lane"></div>
        <div class="lane">${clicks}</div>
        <div class="lane"><div class="clip cam" style="left:0;width:100%"><img src="strip.jpg" alt=""></div></div>
        <div class="playhead" style="left:33%"></div>
      </div>
    </div>`;
}
function wave(seed, n) {
  let x = seed, d = '';
  for (let i = 0; i < n; i++) {
    x = (x * 9301 + 49297) % 233280;
    const a = 1.5 + x / 233280 * 7 * (0.55 + 0.45 * Math.sin(i / 6));
    const px = (i + 0.5) / n * 100; d += `M${px} ${10 - a}V${10 + a}`;
  }
  return `<path d="${d}" stroke="var(--tl-wave)" stroke-opacity="0.7" stroke-width="0.35"/>`;
}
document.querySelectorAll('[data-timeline]').forEach(renderTimeline);

// Real library (thumbnails pulled from the user's recordings folder).
const PROJECTS = [
  { src: 'p0.jpg', name: 'Sun 27 Sep · 13:50', when: 'Yesterday', dur: '1:44', cam: false, size: '212 MB' },
  { src: 'p1.jpg', name: 'Sun 27 Sep · 13:12', when: 'Yesterday', dur: '0:03', cam: false, blank: true, size: '6 MB' },
  { src: 'p2.jpg', name: 'Sun 27 Sep · 13:06', when: 'Yesterday', dur: '0:02', cam: false, blank: true, size: '4 MB' },
  { src: 'p3.jpg', name: 'Sun 27 Sep · 12:43', when: 'Yesterday', dur: '0:10', cam: false, size: '19 MB' },
  { src: 'p4.jpg', name: 'Sun 27 Sep · 12:44', when: 'Yesterday', dur: '1:39', cam: false, size: '188 MB' },
  { src: 'p5.jpg', name: 'Sat 25 Jul · 12:18', when: '25 Jul', dur: '33:22', cam: true, size: '3.1 GB' },
  { src: 'p6.jpg', name: 'Sun 19 Jul · 18:07', when: '19 Jul', dur: '0:16', cam: true, size: '41 MB' },
  { src: 'p7.jpg', name: 'Sat 25 Jul · 12:14', when: '25 Jul', dur: '0:22', cam: true, size: '52 MB' },
];

// View switching: ?view=edit|projects, nav buttons with data-go, parent kept in sync.
function setView(v) {
  document.querySelectorAll('.view').forEach((m) => m.classList.toggle('on', m.dataset.view === v));
  document.querySelectorAll('[data-go]').forEach((b) => b.toggleAttribute('data-active', b.dataset.go === v));
  if (window.parent !== window) window.parent.postMessage({ view: v }, '*');
}
document.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.go)));
window.addEventListener('message', (e) => { if (e.data && e.data.setView) setView(e.data.setView); });
// Generic single-choice groups.
document.querySelectorAll('[data-choice]').forEach((g) => g.addEventListener('click', (e) => {
  const b = e.target.closest('button'); if (!b || !g.contains(b)) return;
  g.querySelectorAll(':scope > button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
}));
// Pages call hydrate() after injecting their own markup.
function hydrate(root = document) {
  root.querySelectorAll('[data-i]:not([data-i-done])').forEach((el) => { el.setAttribute('data-i-done', ''); el.insertAdjacentHTML('afterbegin', icon(el.dataset.i, el.dataset.ic || '', el.dataset.iw)); });
  root.querySelectorAll('[data-slider]:not(.sld)').forEach(initSlider);
  root.querySelectorAll('[data-switch]:not(.switch)').forEach(initSwitch);
}
hydrate();
// Slider style under comparison: knob | bar | ruler (?sl= or a message from the switcher).
function setSliderStyle(s) {
  document.body.classList.remove('sl-bar', 'sl-ruler');
  if (s === 'bar' || s === 'ruler') document.body.classList.add(`sl-${s}`);
}
setSliderStyle(new URLSearchParams(location.search).get('sl') || 'bar');
window.addEventListener('message', (e) => { if (e.data && e.data.sliderStyle) setSliderStyle(e.data.sliderStyle); });
queueMicrotask(() => setView(new URLSearchParams(location.search).get('view') || 'edit'));
