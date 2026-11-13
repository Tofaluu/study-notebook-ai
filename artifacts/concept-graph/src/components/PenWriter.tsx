import { useEffect, useId, useRef, useState } from 'react';

/**
 * The wait for an answer: a pen writing in a notebook. `line` is a short line of handwriting for a bubble or a note
 * inside a document; `notebook` is a spiral-bound page for a tab that is waiting on its whole answer.
 *
 * The notebook never looks finished and never starts over: it writes down the page, and once the page is full it
 * scrolls up a line at a time while the pen keeps writing. The line writes, holds a moment and clears.
 *
 * Every color comes from the app's theme variables, so it follows light, dark and any custom colors: the ink is the
 * accent color, the pen is the text color, the paper is the card color. The handwriting is generated from a fixed seed,
 * so it is the same each time. With reduced motion it shows a finished page and a still pen instead of animating.
 */
type Variant = 'line' | 'notebook';

interface Line {
  x: number;
  y: number;
  w: number;
  amp: number;
  seed: number;
}

interface LineConfig {
  width: number;
  height: number;
  lines: Line[];
  /** Pixels of handwriting per second */
  speed: number;
  /** Milliseconds: before the first stroke, the pen moving to the next line, the finished line held, the line clearing */
  wait: number;
  travel: number;
  hold: number;
  fade: number;
  pen: number;
}

interface PageConfig {
  width: number;
  height: number;
  /** Where each line starts, the baseline of the first row, the distance between rows and how many rows the page shows */
  x: number;
  firstBaseline: number;
  pitch: number;
  rows: number;
  amp: number;
  /** The lines written in turn, over and over; more of them than the page has rows, so a line is long gone before it is reused */
  pool: { w: number; seed: number }[];
  speed: number;
  wait: number;
  travel: number;
  pen: number;
}

const LINE: LineConfig = {
  width: 152,
  height: 30,
  lines: [{ x: 4, y: 20, w: 108, amp: 4.6, seed: 21 }],
  speed: 85,
  wait: 250,
  travel: 260,
  hold: 700,
  fade: 380,
  pen: 0.7,
};

const PAGE: PageConfig = {
  width: 300,
  height: 222,
  x: 52,
  firstBaseline: 58,
  pitch: 28,
  rows: 6,
  amp: 5.6,
  pool: [
    // All close to the full width of the page, so no line stops half way across it
    { w: 206, seed: 3 }, { w: 214, seed: 11 }, { w: 196, seed: 17 }, { w: 208, seed: 29 }, { w: 210, seed: 37 },
    { w: 190, seed: 41 }, { w: 214, seed: 53 }, { w: 200, seed: 61 }, { w: 204, seed: 71 },
  ],
  speed: 170,
  wait: 250,
  travel: 280,
  pen: 1,
};

const NS = 'http://www.w3.org/2000/svg';

// Colors, all from the theme. The page's lines are the text color at low strength, because the border color is not
// one a user can change and would not follow a custom theme.
const INK = 'hsl(var(--primary))';
const PEN_BODY = 'hsl(var(--foreground))';
const PAPER = 'hsl(var(--card))';
const PAPER_LINE = 'hsl(var(--foreground) / 0.15)';
const GROUND = 'hsl(var(--background))';
const RING = 'hsl(var(--muted-foreground))';

function svgEl<K extends keyof SVGElementTagNameMap>(name: K, attrs: Record<string, string>, parent?: Element) {
  const node = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  parent?.appendChild(node);
  return node;
}

function seeded(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One line of cursive-looking scribble, as separate words so the pen can lift between them */
function scribble(width: number, amp: number, seed: number) {
  const rand = seeded(seed);
  const words: { x: number; d: string }[] = [];
  let x = 0;
  while (x < width - 8) {
    const end = Math.min(width, x + 22 + rand() * 50);
    const start = x;
    let d = 'M0 0';
    while (x < end - 3) {
      const dx = 3.4 + rand() * 3.4;
      const roll = rand();
      const h = roll < 0.14 ? -amp * 2.1 : roll < 0.24 ? amp * 1.5 : (rand() < 0.5 ? -1 : 1) * amp * (0.35 + rand() * 0.5);
      d += ` q${(dx / 2).toFixed(1)} ${h.toFixed(1)} ${dx.toFixed(1)} 0`;
      x += dx;
    }
    words.push({ x: start, d });
    x += 7 + rand() * 6;
  }
  return words;
}

interface Point {
  x: number;
  y: number;
}

/** A stretch of a line: either ink (a word, drawn as the pen moves along it) or a gap (the pen lifted and moving on) */
interface Segment {
  type: 'ink' | 'gap';
  from: number;
  len: number;
  to: number;
  a: Point;
  b: Point;
  path?: SVGPathElement;
  origin?: Point;
}

interface Writer {
  render: (time: number) => void;
  /** A moment when the page is finished and held, for showing it still */
  stillAt: number;
  destroy: () => void;
}

const GAP = 12;

/** Builds one line's words into `parent`, with every coordinate relative to `y` (the line's baseline) */
function buildLine(parent: Element, x0: number, y: number, width: number, amp: number, seed: number) {
  const segs: Segment[] = [];
  let virtual = 0;
  const words = scribble(width, amp, seed);
  words.forEach((word, i) => {
    const origin = { x: x0 + word.x, y };
    const path = svgEl('path', { d: word.d, transform: `translate(${origin.x} ${origin.y})` }, parent);
    path.style.cssText = `fill:none;stroke:${INK};stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round`;
    const len = path.getTotalLength();
    path.style.strokeDasharray = `${len} ${len + 2}`;
    const a = path.getPointAtLength(0);
    const b = path.getPointAtLength(len);
    segs.push({
      type: 'ink', path, origin, len, from: virtual, to: virtual + len,
      a: { x: origin.x + a.x, y: origin.y + a.y }, b: { x: origin.x + b.x, y: origin.y + b.y },
    });
    virtual += len;
    const next = words[i + 1];
    if (next) {
      segs.push({
        type: 'gap', len: GAP, from: virtual, to: virtual + GAP,
        a: { x: origin.x + b.x, y: origin.y + b.y }, b: { x: x0 + next.x, y },
      });
      virtual += GAP;
    }
  });
  return { segs, total: virtual };
}

/** Draws as much of a line as `progress` pixels of handwriting covers */
function drawLine(segs: Segment[], progress: number) {
  for (const seg of segs) {
    if (seg.type !== 'ink' || !seg.path) continue;
    const f = Math.min(1, Math.max(0, (progress - seg.from) / seg.len));
    seg.path.style.strokeDashoffset = String(seg.len * (1 - f) + (f < 1 ? 0 : -1));
    seg.path.style.visibility = f === 0 ? 'hidden' : 'visible';
  }
}

/** Where the pen is once `s` pixels of the line are written, in the line's own coordinates */
function penAt(segs: Segment[], s: number) {
  for (const seg of segs) {
    if (s > seg.to) continue;
    const f = Math.min(1, Math.max(0, (s - seg.from) / seg.len));
    if (seg.type === 'ink' && seg.path && seg.origin) {
      const p = seg.path.getPointAtLength(seg.len * f);
      return { x: seg.origin.x + p.x, y: seg.origin.y + p.y, lift: 0 };
    }
    return { x: seg.a.x + (seg.b.x - seg.a.x) * f, y: seg.a.y + (seg.b.y - seg.a.y) * f, lift: Math.sin(Math.PI * f) * 3 };
  }
  const last = segs[segs.length - 1];
  return { x: last.b.x, y: last.b.y, lift: 0 };
}

function makePen(layer: SVGGElement, scale: number) {
  // The pen: tip at the origin, leaning back to the upper right
  const pen = svgEl('g', {}, layer);
  const body = svgEl('g', { transform: `scale(${scale})` }, pen);
  svgEl('polygon', { points: '4,-11 11,-4 33,-26 26,-33', style: `fill:${PEN_BODY}` }, body);
  svgEl('polygon', { points: '0,0 4,-11 11,-4', style: `fill:${INK}` }, body);
  return pen;
}

/** One line of handwriting that is written, held for a moment, then cleared */
function createLineWriter(inkLayer: SVGGElement, penLayer: SVGGElement, cfg: LineConfig): Writer {
  const ink = svgEl('g', {}, inkLayer);
  const lines = cfg.lines.map((line) => buildLine(ink, line.x, line.y, line.w, line.amp, line.seed));
  const pen = makePen(penLayer, cfg.pen);

  const phases: { kind: 'wait' | 'line' | 'travel' | 'hold' | 'fade'; i: number; dur: number }[] = [
    { kind: 'wait', i: 0, dur: cfg.wait },
  ];
  lines.forEach((line, i) => {
    phases.push({ kind: 'line', i, dur: (line.total / cfg.speed) * 1000 });
    if (i < lines.length - 1) phases.push({ kind: 'travel', i, dur: cfg.travel });
  });
  phases.push({ kind: 'hold', i: 0, dur: cfg.hold }, { kind: 'fade', i: 0, dur: cfg.fade });
  const total = phases.reduce((n, p) => n + p.dur, 0);

  const setProgress = (done: number, current: number, s: number) => {
    lines.forEach((line, i) => drawLine(line.segs, i < done ? line.total : i === current ? s : 0));
  };

  const render = (time: number) => {
    const t = time % total;
    let at = 0;
    let phase = phases[0];
    for (const p of phases) {
      if (t < at + p.dur) { phase = p; break; }
      at += p.dur;
    }
    const q = Math.min(1, (t - at) / phase.dur);
    const first = lines[0];
    const last = lines[lines.length - 1];
    let pos: { x: number; y: number; lift: number };
    let penOpacity = 1;

    if (phase.kind === 'wait') {
      setProgress(0, -1, 0);
      pos = { x: first.segs[0].a.x, y: first.segs[0].a.y, lift: 0 };
      penOpacity = Math.min(1, q * 4);
    } else if (phase.kind === 'line') {
      const s = q * lines[phase.i].total;
      setProgress(phase.i, phase.i, s);
      pos = penAt(lines[phase.i].segs, s);
    } else if (phase.kind === 'travel') {
      setProgress(phase.i + 1, -1, 0);
      const from = lines[phase.i].segs[lines[phase.i].segs.length - 1].b;
      const to = lines[phase.i + 1].segs[0].a;
      const e = 1 - Math.pow(1 - q, 3);
      pos = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, lift: Math.sin(Math.PI * e) * 5 };
    } else {
      setProgress(lines.length, -1, 0);
      const end = last.segs[last.segs.length - 1].b;
      pos = { x: end.x, y: end.y, lift: 0 };
      if (phase.kind === 'fade') penOpacity = 1 - q;
    }
    ink.style.opacity = phase.kind === 'fade' ? String(1 - q) : '1';
    pen.style.opacity = String(penOpacity);
    pen.setAttribute('transform', `translate(${pos.x.toFixed(2)} ${(pos.y - pos.lift).toFixed(2)})`);
  };

  return {
    render,
    stillAt: total - cfg.fade - 1,
    destroy: () => { inkLayer.replaceChildren(); penLayer.replaceChildren(); },
  };
}

/**
 * The page: lines are written one after another down the rows. Once the last row is reached the paper moves up a
 * row while the pen goes back to the start of the line, so the writing carries on for as long as the wait does and
 * there is no point where it looks finished. Lines that have moved up fade out under the top edge.
 */
function createPageWriter(inkLayer: SVGGElement, penLayer: SVGGElement, cfg: PageConfig): Writer {
  const slots = cfg.pool.map((entry) => {
    const group = svgEl('g', {}, inkLayer);
    // Coordinates are relative to the line's baseline; the group is moved to the row it sits in
    return { group, ...buildLine(group, cfg.x, 0, entry.w, cfg.amp, entry.seed) };
  });

  const pen = makePen(penLayer, cfg.pen);
  const count = slots.length;
  const durations = slots.map((slot) => (slot.total / cfg.speed) * 1000);
  const period = durations.reduce((n, d) => n + d + cfg.travel, 0);
  const smooth = (q: number) => q * q * (3 - 2 * q);
  const baseline = (k: number, scroll: number) => cfg.firstBaseline + cfg.pitch * (k - scroll);
  // Rows the paper has moved up by while line k is written: none until the page is full
  const scrolled = (k: number) => Math.max(0, k - (cfg.rows - 1));
  const slotOf = (line: number) => slots[((line % count) + count) % count];

  /** Which line is being written, or being travelled on from, and how far through that moment it is */
  const locate = (time: number): { phase: 'wait' | 'write' | 'travel'; k: number; q: number } => {
    if (time < cfg.wait) return { phase: 'wait', k: 0, q: time / cfg.wait };
    let rest = time - cfg.wait;
    const cycles = Math.floor(rest / period);
    rest -= cycles * period;
    for (let j = 0; j < count; j++) {
      const k = cycles * count + j;
      if (rest < durations[j]) return { phase: 'write', k, q: rest / durations[j] };
      rest -= durations[j];
      if (rest < cfg.travel) return { phase: 'travel', k, q: rest / cfg.travel };
      rest -= cfg.travel;
    }
    return { phase: 'wait', k: 0, q: 1 };
  };

  const render = (time: number) => {
    const { phase, k, q } = locate(time);
    const scroll = scrolled(k) + (phase === 'travel' && k >= cfg.rows - 1 ? smooth(q) : 0);

    slots.forEach((slot, j) => {
      // The newest line written in this slot so far
      const kj = k - ((((k - j) % count) + count) % count);
      if (phase === 'wait' || kj < 0) { slot.group.style.visibility = 'hidden'; return; }
      slot.group.style.visibility = 'visible';
      slot.group.setAttribute('transform', `translate(0 ${baseline(kj, scroll).toFixed(2)})`);
      drawLine(slot.segs, kj === k && phase === 'write' ? q * slot.total : slot.total);
    });

    let x: number;
    let y: number;
    let lift = 0;
    let opacity = 1;
    if (phase === 'wait') {
      const a = slotOf(0).segs[0].a;
      x = a.x; y = baseline(0, 0) + a.y; opacity = Math.min(1, q * 4);
    } else if (phase === 'write') {
      const slot = slotOf(k);
      const at = penAt(slot.segs, q * slot.total);
      x = at.x; y = baseline(k, scrolled(k)) + at.y; lift = at.lift;
    } else {
      const from = slotOf(k).segs[slotOf(k).segs.length - 1].b;
      const next = slotOf(k + 1).segs[0].a;
      const fromY = baseline(k, scrolled(k)) + from.y;
      const toY = baseline(k + 1, scrolled(k) + (k >= cfg.rows - 1 ? 1 : 0)) + next.y;
      const e = 1 - Math.pow(1 - q, 3);
      x = from.x + (next.x - from.x) * e;
      y = fromY + (toY - fromY) * e;
      lift = Math.sin(Math.PI * e) * 5;
    }
    pen.style.opacity = String(opacity);
    pen.setAttribute('transform', `translate(${x.toFixed(2)} ${(y - lift).toFixed(2)})`);
  };

  // Four lines written and the pen resting at the end of the fourth, for showing it still
  const still = cfg.wait + durations.slice(0, 3).reduce((n, d) => n + d + cfg.travel, 0) + durations[3] * 0.999;

  return {
    render,
    stillAt: still,
    destroy: () => { inkLayer.replaceChildren(); penLayer.replaceChildren(); },
  };
}

function usePrefersReducedMotion() {
  const query = '(prefers-reduced-motion: reduce)';
  const [reduce, setReduce] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(query).matches);
  useEffect(() => {
    const media = matchMedia(query);
    const update = () => setReduce(media.matches);
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return reduce;
}

interface PenWriterProps {
  variant: Variant;
  className?: string;
}

export function PenWriter({ variant, className }: PenWriterProps) {
  const cfg = variant === 'notebook' ? PAGE : LINE;
  const svgRef = useRef<SVGSVGElement>(null);
  const inkRef = useRef<SVGGElement>(null);
  const penRef = useRef<SVGGElement>(null);
  const reduce = usePrefersReducedMotion();
  // Unique per instance, since several can be mounted at once and each needs its own mask
  const uid = useId().replace(/:/g, '');
  const gradientId = `pen-fade-${uid}`;
  const maskId = `pen-mask-${uid}`;

  useEffect(() => {
    const svg = svgRef.current;
    const ink = inkRef.current;
    const pen = penRef.current;
    if (!svg || !ink || !pen) return;

    const writer = variant === 'notebook' ? createPageWriter(ink, pen, PAGE) : createLineWriter(ink, pen, LINE);
    if (reduce) {
      writer.render(writer.stillAt);
      return writer.destroy;
    }

    // Chats and tabs stay mounted while hidden, so it only runs while it can be seen
    let visible = true;
    let clock = 0;
    let last = performance.now();
    const watcher = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      last = performance.now();
    });
    watcher.observe(svg);

    let frame = 0;
    const tick = (now: number) => {
      const dt = Math.min(now - last, 100);
      last = now;
      if (visible) {
        clock += dt;
        writer.render(clock);
      }
      frame = requestAnimationFrame(tick);
    };
    writer.render(0);
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      watcher.disconnect();
      writer.destroy();
    };
  }, [variant, reduce]);

  return (
    <svg
      ref={svgRef}
      width={cfg.width}
      height={cfg.height}
      viewBox={`0 0 ${cfg.width} ${cfg.height}`}
      aria-hidden="true"
      className={className}
      style={{ display: 'block', overflow: 'visible', maxWidth: '100%', height: 'auto' }}
    >
      {variant === 'notebook' && (
        <>
          <defs>
            {/* Lines that have moved up fade out under the top edge of the page instead of being cut off */}
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="black" />
              <stop offset="0.2" stopColor="white" />
              <stop offset="1" stopColor="white" />
            </linearGradient>
            <mask id={maskId} maskUnits="userSpaceOnUse" x="44" y="10" width="240" height="200">
              <rect x="44" y="10" width="240" height="200" fill={`url(#${gradientId})`} />
            </mask>
          </defs>
          <rect x="16" y="6" width="280" height="208" rx="10" style={{ fill: PAPER, stroke: PAPER_LINE }} />
          {Array.from({ length: 6 }, (_, i) => (
            <line key={i} x1="44" x2="280" y1={62 + i * 28} y2={62 + i * 28} style={{ stroke: PAPER_LINE, strokeWidth: 1 }} />
          ))}
          <line x1="40" x2="40" y1="14" y2="206" style={{ stroke: INK, strokeOpacity: 0.28, strokeWidth: 1 }} />
          {Array.from({ length: 7 }, (_, i) => {
            const y = 28 + i * 26;
            return (
              <g key={i}>
                <circle cx="16" cy={y} r="4" style={{ fill: GROUND, stroke: PAPER_LINE }} />
                <path d={`M4 ${y} q10 -7 20 0`} style={{ fill: 'none', stroke: RING, strokeWidth: 2, strokeLinecap: 'round' }} />
              </g>
            );
          })}
        </>
      )}
      <g ref={inkRef} mask={variant === 'notebook' ? `url(#${maskId})` : undefined} />
      <g ref={penRef} />
    </svg>
  );
}
