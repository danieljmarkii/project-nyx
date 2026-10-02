// Builds the two operating-model pages (CUL-1455) from their specs:
//   docs/how-we-work.html           Culprit's own operating model, written to the PM
//   docs/how-we-work-template.html  the generic version: the map of operating-kit/
// Both share this one layout, so their diagrams stay structurally identical; edit a spec,
// never the generated HTML. Run: node scripts/how-we-work/build.mjs [--artifact <dir>]
// --artifact also writes skeleton-free copies (no doctype/head/body) for publishing as
// claude.ai Artifacts, which add their own skeleton.
// Light markup in spec strings: `code` becomes <code> in HTML and a mono tspan in SVG;
// **bold** becomes <b>. A label longer than its slot in the SVG layout throws.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import culprit from './culprit.mjs';
import template from './template.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');

const escText = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const html = (s) => escText(s)
  .replace(/`([^`]+)`/g, '<code>$1</code>')
  .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
  .replace(/\[([^\]]+)\]\((https:\/\/[^)\s]+)\)/g, '<a href="$2">$1</a>');
const svgt = (s) => escText(s).replace(/`([^`]+)`/g, '<tspan class="mono">$1</tspan>');

function check(label, s, max) {
  const plain = String(s).replace(/`/g, '');
  if (plain.length > max) throw new Error(`${label} is ${plain.length} chars (max ${max}): "${plain}"`);
}

function fig1(f, human) {
  const SX = (i) => 40 + 148 * i;           // station left edge
  const SC = (i) => SX(i) + 64;             // station centre
  const out = [];
  out.push(`<defs>
  <marker id="f1-n" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path class="ah" d="M0,0 L10,5 L0,10 z"/></marker>
  <marker id="f1-p" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="9" markerHeight="9" orient="auto-start-reverse"><path class="ah-pm" d="M0,0 L10,5 L0,10 z"/></marker>
  <marker id="f1-a" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="9" markerHeight="9" orient="auto-start-reverse"><path class="ah-acc" d="M0,0 L10,5 L0,10 z"/></marker>
</defs>`);
  // Human band
  out.push(`<rect class="pmfill" x="20" y="16" width="1200" height="72" rx="10"/>
<text class="t-pmeye" x="40" y="42">${svgt(human.label)}</text>
<text class="t-pm" x="40" y="66">${svgt(f.band)}</text>
<text class="t-pmeye" x="1200" y="42" text-anchor="end">${svgt(f.betweenLabel)}</text>
<text class="t-pm" x="1200" y="66" text-anchor="end">${svgt(f.between)}</text>`);
  check('fig1.band', f.band, 84);
  check('fig1.between', f.between, 58);
  // Handoffs: fixed positions keyed to stations 0, 3, 4, 6, 7
  const H = f.handoffs; // [{lines:[a,b]}] x5
  const lab = (x, y, s, anchor) => `<text class="t-lab pm" x="${x}" y="${y}"${anchor ? ` text-anchor="${anchor}"` : ''}>${svgt(s)}</text>`;
  H.forEach((h, k) => h.lines.forEach((l, j) => check(`handoff ${k} line ${j}`, l, 20)));
  out.push(`<line class="ln pm" x1="${SC(0)}" y1="90" x2="${SC(0)}" y2="176" marker-end="url(#f1-p)"/>
${lab(SC(0) + 10, 124, H[0].lines[0])}${lab(SC(0) + 10, 139, H[0].lines[1])}
<line class="ln pm" x1="${SC(3) - 8}" y1="177" x2="${SC(3) - 8}" y2="90" marker-end="url(#f1-p)"/>
<line class="ln pm" x1="${SC(3) + 8}" y1="90" x2="${SC(3) + 8}" y2="176" marker-end="url(#f1-p)"/>
${lab(SC(3) + 18, 124, H[1].lines[0])}${lab(SC(3) + 18, 139, H[1].lines[1])}
<line class="ln pm" x1="${SC(4)}" y1="177" x2="${SC(4)}" y2="90" marker-end="url(#f1-p)"/>
${lab(SC(4) + 10, 124, H[2].lines[0])}${lab(SC(4) + 10, 139, H[2].lines[1])}
<line class="ln pm" x1="${SC(6)}" y1="90" x2="${SC(6)}" y2="176" marker-end="url(#f1-p)"/>
${lab(SC(6) - 10, 124, H[3].lines[0], 'end')}${lab(SC(6) - 10, 139, H[3].lines[1], 'end')}
<line class="ln pm" x1="${SC(7)}" y1="177" x2="${SC(7)}" y2="90" marker-end="url(#f1-p)"/>
${lab(SC(7) - 10, 124, H[4].lines[0], 'end')}${lab(SC(7) - 10, 139, H[4].lines[1], 'end')}`);
  // Session frame + stations
  out.push(`<rect class="frame" x="26" y="152" width="1188" height="138" rx="12"/>
<text class="t-eye" x="122" y="169">${svgt(f.frameLabel)}</text>`);
  f.stations.forEach((s, i) => {
    const x = SX(i);
    check(`station ${i} name`, s.name, 11);
    s.lines.forEach((l, j) => check(`station ${i} line ${j}`, l, 17));
    out.push(`<rect class="box" x="${x}" y="178" width="128" height="96" rx="8"/>
<text class="t-num" x="${x + 12}" y="201">${String(i + 1).padStart(2, '0')}</text><text class="t-title" x="${x + 34}" y="201">${svgt(s.name)}</text>
${s.lines.map((l, j) => `<text class="t-body" x="${x + 12}" y="${223 + 16 * j}">${svgt(l)}</text>`).join('\n')}`);
    if (i < 7) out.push(`<line class="ln" x1="${x + 131}" y1="226" x2="${x + 146}" y2="226" marker-end="url(#f1-n)"/>`);
  });
  // Store arrows: up from store into station 0 and 2; down from 1, 4, 6, 7
  const A = f.storeArrows; // {0:{lines}, 1:..., 2, 4, 6, 7}
  const alab = (x, y, s, anchor) => `<text class="t-lab acc" x="${x}" y="${y}"${anchor ? ` text-anchor="${anchor}"` : ''}>${svgt(s)}</text>`;
  const up = (i) => `<line class="ln acc" x1="${SC(i)}" y1="351" x2="${SC(i)}" y2="277" marker-end="url(#f1-a)"/>`;
  const down = (i) => `<line class="ln acc" x1="${SC(i)}" y1="276" x2="${SC(i)}" y2="350" marker-end="url(#f1-a)"/>`;
  const two = (i, lines, anchor) => lines.length === 1
    ? alab(anchor ? SC(i) - 10 : SC(i) + 10, 325, lines[0], anchor)
    : alab(anchor ? SC(i) - 10 : SC(i) + 10, 318, lines[0], anchor) + alab(anchor ? SC(i) - 10 : SC(i) + 10, 332, lines[1], anchor);
  Object.values(A).forEach((a) => a.lines.forEach((l) => check('store arrow', l, 14)));
  out.push(up(0) + two(0, A[0].lines), down(1) + two(1, A[1].lines), up(2) + two(2, A[2].lines),
    down(4) + two(4, A[4].lines), down(6) + two(6, A[6].lines), down(7) + two(7, A[7].lines, 'end'));
  // Stores
  const S = [
    { x: 20, w: 302, max: 40 }, { x: 336, w: 434, max: 62 }, { x: 784, w: 278, max: 38 }, { x: 1076, w: 144, max: 18 },
  ];
  f.stores.forEach((st, k) => {
    const g = S[k];
    st.lines.forEach((l, j) => check(`store ${k} line ${j}`, l, g.max));
    check(`store ${k} title`, st.title, k === 3 ? 14 : k === 1 ? 50 : 32);
    out.push(`<rect class="store" x="${g.x}" y="352" width="${g.w}" height="144" rx="10"/>
<text class="t-eye" x="${g.x + 16}" y="376">${svgt(st.eyebrow)}</text>
<text class="t-title" x="${g.x + 16}" y="398">${svgt(st.title)}</text>
${st.lines.map((l, j) => `<text class="t-body" x="${g.x + 16}" y="${422 + 18 * j}">${svgt(l)}</text>`).join('\n')}`);
  });
  out.push(`<path class="ln acc" d="M1206 236 H1230 V526 H160 V499" marker-end="url(#f1-a)"/>
<text class="t-lab acc" x="690" y="518" text-anchor="middle">${svgt(f.returnLabel)}</text>`);
  return `<svg class="d" viewBox="0 0 1240 548" role="img" aria-label="${escText(f.aria)}">\n${out.join('\n')}\n</svg>`;
}

function fig2(f) {
  const NX = (j) => 26 + 152 * j;
  const NC = (j) => NX(j) + 66;
  const out = [];
  out.push(`<defs>
  <marker id="f2-n" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="8" markerHeight="8" orient="auto-start-reverse"><path class="ah" d="M0,0 L10,5 L0,10 z"/></marker>
  <marker id="f2-p" viewBox="0 0 10 10" refX="9" refY="5" markerUnits="userSpaceOnUse" markerWidth="9" markerHeight="9" orient="auto-start-reverse"><path class="ah-pm" d="M0,0 L10,5 L0,10 z"/></marker>
</defs>`);
  f.phases.forEach((p, k) => {
    const x1 = NX(2 * k), x2 = NX(2 * k + 1) + 132;
    out.push(`<text class="t-eye" x="${x1}" y="18">${svgt(p)}</text><line class="rule" x1="${x1}" y1="27" x2="${x2}" y2="27"/>`);
  });
  f.nodes.forEach((n, j) => {
    const x = NX(j);
    check(`fig2 node ${j} name`, n.name, 15);
    n.lines.forEach((l, i) => check(`fig2 node ${j} line ${i}`, l, 18));
    out.push(`<rect class="box" x="${x}" y="44" width="132" height="80" rx="8"/>
<text class="t-title" x="${x + 12}" y="68">${svgt(n.name)}</text>
${n.lines.map((l, i) => `<text class="t-body" x="${x + 12}" y="${90 + 16 * i}">${svgt(l)}</text>`).join('\n')}`);
    if (j < 7) out.push(`<line class="ln" x1="${x + 135}" y1="84" x2="${x + 150}" y2="84" marker-end="url(#f2-n)"/>`);
  });
  f.human.forEach((h) => {
    const j = h.under, x = NX(j), c = NC(j);
    check('fig2 human name', h.name, 15);
    check('fig2 human line', h.line, 18);
    out.push(`<rect class="pmfill" x="${x}" y="200" width="132" height="56" rx="8"/>
<text class="t-pm b" x="${x + 12}" y="224">${svgt(h.name)}</text>
<text class="t-pm2" x="${x + 12}" y="243">${svgt(h.line)}</text>
<line class="ln pm" x1="${c - 10}" y1="126" x2="${c - 10}" y2="198" marker-end="url(#f2-p)"/>
<line class="ln pm" x1="${c + 10}" y1="199" x2="${c + 10}" y2="127" marker-end="url(#f2-p)"/>
<text class="t-lab pm" x="${c - 18}" y="167" text-anchor="end">${svgt(h.down)}</text>
<text class="t-lab pm" x="${c + 18}" y="167">${svgt(h.up)}</text>`);
  });
  out.push(`<text class="t-lab" x="26" y="288">${svgt(f.footnote)}</text>`);
  return `<svg class="d" viewBox="0 0 1240 300" role="img" aria-label="${escText(f.aria)}">\n${out.join('\n')}\n</svg>`;
}

function section(s, body) {
  return `<section${s.id ? ` id="${s.id}"` : ''}>
  <div class="sec-head">
    <p class="eyebrow">${html(s.eyebrow)}</p>
    <h2>${html(s.h2)}</h2>
    ${s.deck ? `<p class="deck">${html(s.deck)}</p>` : ''}
  </div>
${body}
</section>`;
}

function figure(svg, caption, legend) {
  return `  <figure>
    <p class="hint">Wide figure: scroll sideways.</p>
    <div class="scroll">
${svg}
    </div>
    <figcaption>
      <span>${html(caption)}</span>
${legend ? `      <span class="legend">
        <span><i class="sw pm"></i>${html(legend[0])}</span>
        <span><i class="sw acc"></i>${html(legend[1])}</span>
        <span><i class="sw seq"></i>${html(legend[2])}</span>
      </span>` : ''}
    </figcaption>
  </figure>`;
}

function render(spec, standalone) {
  const css = fs.readFileSync(path.join(HERE, 'style.css'), 'utf8');
  const parts = [];
  parts.push(`<header>
  <p class="eyebrow">${html(spec.eyebrow)}</p>
  <h1>${html(spec.h1)}</h1>
  <p class="lede">${html(spec.lede)}</p>
${spec.stats ? `  <dl class="stats">
${spec.stats.map((s) => `    <div class="stat"><dt>${html(s.l)}</dt><dd>${html(s.v)}</dd></div>`).join('\n')}
  </dl>` : ''}
</header>`);

  if (spec.loop) {
    parts.push(section(spec.loop, `  <div class="loop">
    <ol class="loop-steps">
${spec.loop.steps.map((s) => `      <li><span class="k">${html(s.when)}</span><p>${html(s.what)}</p></li>`).join('\n')}
    </ol>
${spec.loop.aside ? `    <div class="aside">${spec.loop.aside.map((a) => `<p>${html(a)}</p>`).join('')}</div>` : ''}
  </div>`));
  }

  parts.push(section(spec.fig1, figure(fig1(spec.fig1, spec.human), spec.fig1.caption, spec.fig1.legend)));
  parts.push(section(spec.fig2, figure(fig2(spec.fig2), spec.fig2.caption)));

  const L = spec.ladder;
  parts.push(section(L, `  <div class="scale" aria-hidden="true"><span>${html(L.scale[0])}</span><span class="bar"></span><span>${html(L.scale[1])}</span></div>
  <div class="ladder">
${L.rungs.map((r, i) => `    <article class="rung">
      <div class="rung-top"><h3>${html(r.name)}</h3><span class="meter" aria-label="hardness ${i + 1} of 4">${[0, 1, 2, 3].map((k) => `<i${k <= i ? ' class="on"' : ''}></i>`).join('')}</span></div>
      <p>${html(r.what)}</p>
      <div class="fires"><b>Fires</b>${html(r.fires)}</div>
      <div class="ex">${html(r.example)}</div>
      ${r.count ? `<span class="count">${html(r.count)}</span>` : ''}
      ${r.file ? `<span class="count">${html(r.file)}</span>` : ''}
    </article>`).join('\n')}
  </div>
  <div class="panel">
    <p class="eyebrow">${html(L.pathLabel)}</p>
    <ol class="path">
${L.path.map((p) => `      <li><span class="k">${html(p.k)}</span><p>${html(p.text)}</p></li>`).join('\n')}
    </ol>
  </div>`));

  const R = spec.ref;
  const panels = [];
  panels.push(`    <div class="panel">
      <h3>${html(R.state.h3)}</h3>
      <table>
${R.state.rows.map((r) => `        <tr><td>${html(r[0])}</td><td>${html(r[1])}</td></tr>`).join('\n')}
      </table>
      ${R.state.note ? `<p class="note">${html(R.state.note)}</p>` : ''}
    </div>`);
  panels.push(`    <div class="panel">
      <h3>${html(R.clocks.h3)}</h3>
      <dl class="clocks">
${R.clocks.rows.map((r) => `        <div><dt>${html(r[0])}</dt><dd>${html(r[1])}</dd></div>`).join('\n')}
      </dl>
    </div>`);
  panels.push(`    <div class="panel">
      <h3>${html(R.talk.h3)}</h3>
      <div class="brief" aria-label="A sample decision brief">
        <span class="eyebrow">${html(R.talk.brief.label)}</span>
        <div class="row"><b>Deciding</b><span>${html(R.talk.brief.deciding)}</span></div>
        <div class="row"><b>Options</b><span><span class="rec">${html(R.talk.brief.rec)}</span> ${html(R.talk.brief.options)}</span></div>
        <div class="row"><b>Consequence</b><span>${html(R.talk.brief.consequence)}</span></div>
      </div>
      <ul class="plain">
${R.talk.bullets.map((b) => `        <li><b>${html(b[0])}</b> ${html(b[1])}</li>`).join('\n')}
      </ul>
    </div>`);
  panels.push(`    <div class="panel">
      <h3>${html(R.laws.h3)}</h3>
      <ul class="plain laws">
${R.laws.items.map((l) => `        <li><b>${html(l[0])}</b> ${html(l[1])}${l[2] ? `<span class="src">${html(l[2])}</span>` : ''}</li>`).join('\n')}
      </ul>
      ${R.laws.leak ? `<div class="leak">${R.laws.leak.map((p) => `<p>${html(p)}</p>`).join('')}</div>` : ''}
    </div>`);
  const extraPanel = (x) => `    <div class="panel">
      <h3>${html(x.h3)}</h3>
${x.rows ? `      <table${x.wide ? ' class="wide"' : ''}>
${x.rows.map((r) => `        <tr><td>${html(r[0])}</td><td>${html(r[1])}</td></tr>`).join('\n')}
      </table>` : ''}
${x.items ? `      <ul class="plain">
${x.items.map((b) => `        <li><b>${html(b[0])}</b> ${html(b[1])}</li>`).join('\n')}
      </ul>` : ''}
      ${x.note ? `<p class="note">${html(x.note)}</p>` : ''}
    </div>`;
  if (R.before) panels.unshift(...R.before.map(extraPanel));
  if (R.extra) R.extra.forEach((x) => panels.push(extraPanel(x)));
  parts.push(section(R, `  <div class="ref">
${panels.join('\n')}
  </div>`));

  const K = spec.kit;
  parts.push(section(K, `${K.intro ? `  <div class="panel intro">${K.intro.map((p) => `<p>${html(p)}</p>`).join('')}</div>` : ''}
${K.table ? `  <div class="panel">
    <h3>${html(K.table.h3)}</h3>
    <div class="tscroll"><table class="div">
      <thead><tr>${K.table.head.map((h) => `<th>${html(h)}</th>`).join('')}</tr></thead>
      <tbody>
${K.table.rows.map((r) => `        <tr>${r.map((c) => `<td>${html(c)}</td>`).join('')}</tr>`).join('\n')}
      </tbody>
    </table></div>
    ${K.table.note ? `<p class="note">${html(K.table.note)}</p>` : ''}
  </div>` : ''}
${K.items ? `  <ol class="kit">
${K.items.map((k) => `    <li><div>${html(k.title)}<span>${html(k.detail)}</span>${k.file ? `<span class="file">${html(k.file)}</span>` : ''}</div></li>`).join('\n')}
  </ol>` : ''}`));

  parts.push(`<footer>${html(spec.footer)}</footer>`);

  const head = `<title>${escText(spec.title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500;600&family=Newsreader:opsz,wght@6..72,400;6..72,500&display=swap">
<style>
${css}
</style>`;
  const body = `<div class="page">

${parts.join('\n\n')}

</div>
`;
  if (!standalone) return `${head}\n\n${body}`;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<!-- Generated by scripts/how-we-work/build.mjs from ${spec.source}. Edit the spec, then rebuild. -->
${head}
</head>
<body>
${body}</body>
</html>
`;
}

const PAGES = [
  { spec: culprit, out: 'docs/how-we-work.html', artifact: 'culprit-operating-model.html' },
  { spec: template, out: 'docs/how-we-work-template.html', artifact: 'operating-kit-map.html' },
];
const i = process.argv.indexOf('--artifact');
const artifactDir = i > -1 ? process.argv[i + 1] : null;
for (const p of PAGES) {
  fs.writeFileSync(path.join(REPO, p.out), render(p.spec, true));
  console.log(`wrote ${p.out}`);
  if (artifactDir) {
    fs.writeFileSync(path.join(artifactDir, p.artifact), render(p.spec, false));
    console.log(`wrote ${path.join(artifactDir, p.artifact)}`);
  }
}
