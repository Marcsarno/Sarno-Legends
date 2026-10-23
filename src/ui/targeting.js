// The targeting arrow: a curved chain of chevrons from the card (or potion) to the pointer, ending in an arrowhead.
//   const arrow = createTargeting(layerEl)
//   arrow.show(from {x,y}, to {x,y}, { hot })   call every frame while aiming; hot = locked on a zombie (red, glowing)
//   arrow.hide()
// Drawn in one full-screen SVG. The chevrons march toward the head so it reads as "pointing" even when still.

const NS = 'http://www.w3.org/2000/svg';
const COUNT = 18;

export function createTargeting(layer) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('class', 'tarrow');
  svg.innerHTML = `<defs><filter id="tarrow-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`;
  const g = document.createElementNS(NS, 'g');
  svg.append(g);
  const chev = [];
  for (let i = 0; i < COUNT; i++) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', 'M-7 -9 L5 0 L-7 9 L-3 0 Z');
    p.setAttribute('class', 'tarrow__seg');
    g.append(p);
    chev.push(p);
  }
  const head = document.createElementNS(NS, 'path');
  head.setAttribute('d', 'M-12 -14 L14 0 L-12 14 L-5 0 Z');
  head.setAttribute('class', 'tarrow__head');
  g.append(head);
  layer.append(svg);
  let visible = false;

  function bez(p0, p1, p2, p3, t) {
    const u = 1 - t;
    return {
      x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
      y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
    };
  }

  function show(from, to, { hot = false, scale = 1 } = {}) {
    if (!visible) { svg.classList.add('tarrow--on'); visible = true; }
    svg.classList.toggle('tarrow--hot', !!hot);
    const dx = to.x - from.x, dy = to.y - from.y;
    const dist = Math.hypot(dx, dy);
    // rise out of the card first, then bow over to the target
    const c1 = { x: from.x + dx * .08, y: from.y - Math.max(40, dist * .45) };
    const c2 = { x: to.x - dx * .18, y: to.y - Math.max(30, dist * .28) };
    const phase = (performance.now() / 520) % 1;
    const end = Math.max(0.6, 1 - 26 / Math.max(dist, 1));
    for (let i = 0; i < COUNT; i++) {
      let t = (i + phase) / COUNT * end;
      const p = bez(from, c1, c2, to, t), q = bez(from, c1, c2, to, Math.min(1, t + 0.01));
      const ang = Math.atan2(q.y - p.y, q.x - p.x) * 180 / Math.PI;
      const s = (0.55 + 0.75 * t) * scale;
      const fade = Math.min(1, t * 6) * (dist < 30 ? 0 : 1);
      chev[i].setAttribute('transform', `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)}) rotate(${ang.toFixed(1)}) scale(${s.toFixed(2)})`);
      chev[i].style.opacity = fade.toFixed(2);
    }
    const a = bez(from, c1, c2, to, 0.985);
    const ang = Math.atan2(to.y - a.y, to.x - a.x) * 180 / Math.PI;
    head.setAttribute('transform', `translate(${to.x.toFixed(1)} ${to.y.toFixed(1)}) rotate(${ang.toFixed(1)}) scale(${(hot ? 1.15 : 1) * scale})`);
  }

  function hide() {
    if (!visible) return;
    visible = false;
    svg.classList.remove('tarrow--on', 'tarrow--hot');
  }

  return { show, hide, el: svg, get visible() { return visible; } };
}
