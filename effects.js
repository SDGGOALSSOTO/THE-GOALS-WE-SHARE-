(() => {
  'use strict';
  const root = document.documentElement;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const toggle = document.querySelector('#motion-toggle');
  const intro = document.querySelector('#intro-overlay');
  const progress = document.querySelector('#reading-progress');
  const scene = document.querySelector('#globe-scene');
  const canvas = document.querySelector('#planet-canvas');
  let motion = !reduced.matches;
  let introDone = false;
  let sceneVisible = true;
  let pageVisible = !document.hidden;
  let frame = 0;
  let elapsed = 0;
  let lastFrame = 0;
  let width = 0, height = 0;
  let pointer = { x: 0, y: 0 };
  let smoothPointer = { x: 0, y: 0 };
  let context;
  try { context = canvas.getContext('2d'); } catch (_) { /* The scene has a readable fallback. */ }

  function finishIntro() {
    if (introDone) return;
    introDone = true;
    root.classList.remove('intro-pending');
    intro.classList.add('is-leaving');
    setTimeout(() => { intro.classList.remove('is-leaving'); intro.classList.add('is-done'); }, motion ? 500 : 0);
  }
  document.querySelector('#intro-skip').addEventListener('click', finishIntro);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') finishIntro(); });

  function setMotion(value) {
    motion = value && !reduced.matches;
    root.dataset.motion = motion ? 'on' : 'off';
    toggle.setAttribute('aria-pressed', String(motion));
    toggle.setAttribute('aria-label', motion ? 'Pause decorative animations' : 'Resume decorative animations');
    if (!motion) {
      finishIntro();
      document.querySelectorAll('.reveal').forEach(element => element.classList.add('is-visible'));
      document.querySelectorAll('.goal-card').forEach(element => { element.style.setProperty('--tilt-x', '0deg'); element.style.setProperty('--tilt-y', '0deg'); });
    }
    restartGlobe();
  }
  toggle.addEventListener('click', () => setMotion(!motion));
  reduced.addEventListener('change', () => setMotion(!reduced.matches));

  // Approximate continent boundaries are an artistic scene, not a geographic dataset.
  const land = [
    [[-168,70],[-138,71],[-115,80],[-92,72],[-58,55],[-60,44],[-82,25],[-98,17],[-115,30],[-125,49],[-153,58]],
    [[-81,12],[-62,10],[-35,-7],[-40,-22],[-57,-39],[-68,-55],[-76,-26]],
    [[-18,35],[5,38],[33,31],[50,12],[43,-10],[33,-27],[18,-35],[9,-16],[-8,5],[-18,16]],
    [[-11,36],[-8,58],[20,71],[49,67],[63,54],[42,39],[26,35],[10,42]],
    [[30,68],[66,73],[110,75],[178,63],[156,42],[129,34],[124,20],[106,6],[99,15],[78,8],[69,28],[45,35],[35,52]],
    [[113,-22],[130,-11],[145,-15],[154,-28],[140,-39],[116,-34]],
    [[-53,59],[-28,66],[-24,79],[-45,83],[-61,76]],
    [[47,-13],[50,-16],[48,-25],[44,-24]], [[129,-1],[146,-3],[150,-9],[135,-8]], [[166,-35],[178,-38],[172,-47]],
    [[-180,-70],[-120,-74],[-60,-71],[0,-73],[60,-71],[120,-73],[179,-70],[179,-89],[-180,-89]]
  ];
  function inside(lon, lat, polygon) {
    let result = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[i], b = polygon[j];
      if ((a[1] > lat) !== (b[1] > lat) && lon < (b[0] - a[0]) * (lat - a[1]) / (b[1] - a[1]) + a[0]) result = !result;
    }
    return result;
  }
  const dots = [];
  const total = 2700;
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < total; i++) {
    const y = 1 - 2 * (i + .5) / total;
    const latitude = Math.asin(y);
    const longitude = ((i * golden + Math.PI) % (Math.PI * 2)) - Math.PI;
    const onLand = land.some(shape => inside(longitude * 180 / Math.PI, latitude * 180 / Math.PI, shape));
    dots.push({ latitude, longitude, radius: Math.cos(latitude), land: onLand });
  }
  const colors = ['#e5243b','#dda63a','#4c9f38','#c5192d','#ff3a21','#26bde2','#fcc30b','#a21942','#fd6925','#dd1367','#fd9d24','#bf8b2e','#3f7e44','#0a97d9','#56c02b','#00689d','#19486a'];
  const specks = Array.from({ length: 32 }, (_, i) => ({ x: ((i * 71 + 13) % 101) / 101, y: ((i * 39 + 17) % 97) / 97, size: i % 5 === 0 ? 1.2 : .65 }));

  function drawGlobe() {
    if (!context || !width || !height) return;
    const ctx = context;
    ctx.clearRect(0, 0, width, height);
    const cx = width * .5 + smoothPointer.x * 9;
    const cy = height * .49 + smoothPointer.y * 5;
    const radius = Math.min(width * .36, height * .345);
    const glow = ctx.createRadialGradient(cx, cy, radius * .1, cx, cy, radius * 1.45);
    glow.addColorStop(0, '#7ba55d28'); glow.addColorStop(.65, '#65894715'); glow.addColorStop(1, '#163f2d00');
    ctx.fillStyle = glow; ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#c9e4af50';
    for (const star of specks) { ctx.beginPath(); ctx.arc(star.x * width, star.y * height, star.size, 0, Math.PI * 2); ctx.fill(); }
    const rotation = -.23 + elapsed * .000045 + smoothPointer.x * .18;
    const tilt = -.12 + smoothPointer.y * .09;
    const c = Math.cos(tilt), s = Math.sin(tilt);
    const buckets = Array.from({ length: 8 }, () => []);
    for (const dot of dots) {
      const x = dot.radius * Math.sin(dot.longitude + rotation);
      const z = dot.radius * Math.cos(dot.longitude + rotation);
      const y = -Math.sin(dot.latitude);
      const tiltedY = y * c - z * s;
      const tiltedZ = y * s + z * c;
      if (tiltedZ < -.1) continue;
      const bucket = (dot.land ? 4 : 0) + Math.min(3, Math.max(0, Math.floor(tiltedZ * 4)));
      buckets[bucket].push([cx + x * radius, cy + tiltedY * radius, dot.land ? .85 + tiltedZ * .65 : .45 + tiltedZ * .25]);
    }
    const palette = ['#95b67c18','#95b67c28','#95b67c35','#95b67c48','#c4dda755','#c4dda780','#cce5b2af','#d5eebeeb'];
    buckets.forEach((bucket, index) => {
      ctx.beginPath();
      for (const [x, y, r] of bucket) { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, Math.PI * 2); }
      ctx.fillStyle = palette[index]; ctx.fill();
    });
    ctx.strokeStyle = '#b4d99527'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, radius + 2, 0, Math.PI * 2); ctx.stroke();
    ctx.save(); ctx.translate(cx, cy); ctx.rotate(-.35);
    ctx.beginPath(); ctx.ellipse(0, 0, radius * 1.2, radius * .59, 0, 0, Math.PI * 2); ctx.strokeStyle = '#bedfa736'; ctx.stroke();
    for (let i = 0; i < 17; i++) {
      const angle = (i / 17) * Math.PI * 2 + elapsed * .00008;
      const x = Math.cos(angle) * radius * 1.2, y = Math.sin(angle) * radius * .59;
      ctx.fillStyle = colors[i]; ctx.globalAlpha = Math.sin(angle) > 0 ? .95 : .48;
      ctx.beginPath(); ctx.arc(x, y, i % 4 === 0 ? 3 : 2, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore(); ctx.globalAlpha = 1;
  }
  function tick(time) {
    frame = 0;
    if (!motion || !sceneVisible || !pageVisible) return;
    if (time - lastFrame >= 30) {
      elapsed += lastFrame ? Math.min(time - lastFrame, 50) : 30;
      lastFrame = time;
      smoothPointer.x += (pointer.x - smoothPointer.x) * .06;
      smoothPointer.y += (pointer.y - smoothPointer.y) * .06;
      drawGlobe();
    }
    frame = requestAnimationFrame(tick);
  }
  function restartGlobe() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0; lastFrame = 0;
    drawGlobe();
    if (motion && sceneVisible && pageVisible && context) frame = requestAnimationFrame(tick);
  }
  function resize() {
    const rect = scene.getBoundingClientRect();
    width = rect.width; height = rect.height;
    if (!context) return;
    const ratio = Math.min(devicePixelRatio || 1, 1.7);
    canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio);
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    drawGlobe();
  }
  if ('ResizeObserver' in window) new ResizeObserver(resize).observe(scene);
  else window.addEventListener('resize', resize);
  scene.addEventListener('pointermove', event => {
    if (!motion || !finePointer.matches) return;
    const rect = scene.getBoundingClientRect();
    pointer = { x: (event.clientX - rect.left) / rect.width - .5, y: (event.clientY - rect.top) / rect.height - .5 };
  });
  scene.addEventListener('pointerleave', () => { pointer = { x: 0, y: 0 }; });
  document.addEventListener('visibilitychange', () => { pageVisible = !document.hidden; restartGlobe(); });
  document.querySelectorAll('[data-scene-goal]').forEach(button => button.addEventListener('click', () => openGoal(button.dataset.sceneGoal)));

  let revealObserver;
  if ('IntersectionObserver' in window) {
    revealObserver = new IntersectionObserver(entries => {
      for (const entry of entries) if (entry.isIntersecting) { entry.target.classList.add('is-visible'); revealObserver.unobserve(entry.target); }
    }, { threshold: .07 });
    new IntersectionObserver(entries => { sceneVisible = entries[0].isIntersecting; restartGlobe(); }, { threshold: .02 }).observe(scene);
  }
  function reveal(element, delay = 0) {
    element.classList.add('reveal'); element.style.setProperty('--reveal-delay', `${delay}ms`);
    if (motion && revealObserver) revealObserver.observe(element);
    else element.classList.add('is-visible');
  }
  document.querySelectorAll('.intro-strip,.section-head,.controls,.impact,.values>div,.value-item').forEach((element, index) => reveal(element, index % 3 * 40));
  function prepareCards() {
    document.querySelectorAll('.goal-card:not(.reveal)').forEach((element, index) => {
      reveal(element, index % 4 * 35);
      element.addEventListener('pointermove', event => {
        if (!finePointer.matches || !motion) return;
        const rect = element.getBoundingClientRect();
        const x = event.clientX - rect.left, y = event.clientY - rect.top;
        element.style.setProperty('--pointer-x', `${x}px`); element.style.setProperty('--pointer-y', `${y}px`);
        element.style.setProperty('--tilt-x', `${(y / rect.height - .5) * -5}deg`);
        element.style.setProperty('--tilt-y', `${(x / rect.width - .5) * 5}deg`);
      });
      element.addEventListener('pointerleave', () => { element.style.setProperty('--tilt-x', '0deg'); element.style.setProperty('--tilt-y', '0deg'); });
    });
  }
  prepareCards();
  new MutationObserver(prepareCards).observe(document.querySelector('#goal-grid'), { childList: true });
  root.classList.add('js-reveals');
  document.addEventListener('click', event => {
    const target = event.target.closest('.button,.filter,.goal-card');
    if (!target || !motion) return;
    const rect = target.getBoundingClientRect(), size = Math.max(rect.width, rect.height) * 2;
    const ripple = document.createElement('span'); ripple.className = 'ripple'; ripple.setAttribute('aria-hidden', 'true');
    ripple.style.width = ripple.style.height = `${size}px`;
    ripple.style.left = `${(event.detail ? event.clientX - rect.left : rect.width / 2) - size / 2}px`;
    ripple.style.top = `${(event.detail ? event.clientY - rect.top : rect.height / 2) - size / 2}px`;
    target.append(ripple); setTimeout(() => ripple.remove(), 600);
  });
  let scrollFrame = 0;
  function updateScroll() {
    scrollFrame = 0;
    const available = document.documentElement.scrollHeight - innerHeight;
    progress.style.transform = `scaleX(${available > 0 ? Math.min(1, Math.max(0, scrollY / available)) : 0})`;
    document.querySelector('.topbar').classList.toggle('scrolled', scrollY > 15);
  }
  window.addEventListener('scroll', () => { if (!scrollFrame) scrollFrame = requestAnimationFrame(updateScroll); }, { passive: true });
  window.addEventListener('resize', updateScroll);
  resize(); setMotion(motion); updateScroll();
  if (motion) setTimeout(finishIntro, 1150);
})();
