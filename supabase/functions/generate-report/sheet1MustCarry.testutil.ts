// The sheet-1 must-carry guard's machinery (CUL-2551): v1 page 1's blocks, read off v1's own output,
// and the folded text they are compared in. The test is `sheet1MustCarry.test.ts`.
import type { ReportSnapshot } from './report.ts'
import { classOf, topLevelDivs, v1Page1Html } from './sheet1CarryV2.ts'

/** Elements that start a block of text. Anything else (b, span, small, abbr) is inline. */
const BLOCK_TAGS = new Set(['div', 'p', 'h1', 'h2', 'h3', 'h4', 'li', 'ul', 'ol', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'dl', 'dt', 'dd', 'section', 'header', 'footer', 'caption'])
const VOID = new Set(['br', 'img', 'hr', 'meta', 'input', 'source', 'wbr'])

/** One v1 page-1 leaf: the smallest block of text v1 prints, with the top-level block it sits in. */
export interface V1Leaf {
  /** The top-level block's class (`sec` blocks name their heading instead: `sec:at a glance`). */
  top: string
  /** The leaf's own class, when it has one ("kv", "tile", "callout", "flag"). */
  cls: string
  /** Folded text (`fold`). */
  text: string
}

/** Text with an entity, a curly quote, a no-break space or a line break never a difference. */
export function fold(html: string): string {
  return html
    .replace(/<style>[\s\S]*?<\/style>/g, ' ')
    .replace(/<script>[\s\S]*?<\/script>/g, ' ')
    .replace(/<svg\b[\s\S]*?<\/svg>/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;|&lsquo;|[‘’]/g, "'")
    .replace(/&ldquo;|&rdquo;|[“”]/g, '"')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&middot;/g, '·')
    .replace(/&times;/g, '×')
    .replace(/&rarr;/g, '→')
    .replace(/&hellip;/g, '…')
    .replace(/&[a-z]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

/**
 * Every pointer, both sides, to one token, so a block is compared word for word around its pointer
 * (`v2Pointers` moves only the pointer, never the sentence). v1 names appendices and page 1; v2 names
 * sheets. The relative rewrites v2 makes on sheet 1 (`SHEET1_RELATIVE`, the band's "flags above")
 * are listed pair by pair, so any other rewrite is a difference.
 */
export function pointerFold(t: string): string {
  return t
    .replace(/the charts below span the report's/g, '@r')
    .replace(/the chart above spans the report's/g, '@r')
    .replace(/ \(named among the concurrent changes on page 1\)/g, '')
    .replace(/\(in the flags above\)/g, '(above)')
    .replace(/\b(?:(?:in|on) )?(?:appendi(?:x|ces) [a-g](?:[–-][a-g])?|page 1)\b/g, '@')
    .replace(/\b(?:(?:in|on) )?(?:the sheet headed "[^"]+"|this sheet|sheet 1)/g, '@')
}

interface Node {
  tag: string
  cls: string
  children: Array<Node | string>
}

/** A forgiving tree of a v1 fragment: enough to find its leaves (v1's markup is generated, balanced). */
function parse(html: string): Node {
  const root: Node = { tag: '#root', cls: '', children: [] }
  const stack: Node[] = [root]
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b([^>]*?)(\/?)>|([^<]+)/g
  const clean = html.replace(/<svg\b[\s\S]*?<\/svg>/g, ' ').replace(/<!--[\s\S]*?-->/g, '')
  for (let m = re.exec(clean); m !== null; m = re.exec(clean)) {
    const top = stack[stack.length - 1]
    if (m[5] !== undefined) {
      top.children.push(m[5])
      continue
    }
    const tag = m[2].toLowerCase()
    if (m[1]) {
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tag === tag) {
          stack.length = i
          break
        }
      }
      continue
    }
    const node: Node = { tag, cls: /class="([^"]*)"/.exec(m[3])?.[1] ?? '', children: [] }
    top.children.push(node)
    if (!m[4] && !VOID.has(tag)) stack.push(node)
  }
  return root
}

function hasBlockChild(n: Node): boolean {
  return n.children.some((c) => typeof c !== 'string' && (BLOCK_TAGS.has(c.tag) || hasBlockChild(c) && !BLOCK_TAGS.has(c.tag)))
}

function inlineText(n: Node | string): string {
  if (typeof n === 'string') return n
  // Every tag is a space, as `fold` reads the other side: v1's "<span class=k>Trial</span><span>…"
  // is two columns, never one word.
  if (VOID.has(n.tag)) return ' '
  return ` ${n.children.map(inlineText).join('')} `
}

/** The leaves under a node: each block element with no block inside, plus any loose text run beside blocks. */
function leaves(n: Node, out: Array<{ cls: string; text: string }>, cls: string): void {
  if (!hasBlockChild(n)) {
    const t = fold(inlineText(n))
    if (t !== '') out.push({ cls: n.cls || cls, text: t })
    return
  }
  let run = ''
  const flush = () => {
    const t = fold(run)
    if (t !== '') out.push({ cls: n.cls || cls, text: t })
    run = ''
  }
  for (const c of n.children) {
    if (typeof c === 'string') run += c
    else if (BLOCK_TAGS.has(c.tag) || hasBlockChild(c)) {
      flush()
      leaves(c, out, c.cls || n.cls || cls)
    } else run += ` ${inlineText(c)} `
  }
  flush()
}

/** A top-level block's name: its class, and for a section its heading. */
function topName(div: string): string {
  const cls = classOf(div)
  if (cls !== 'sec') return cls
  const h2 = /<h2[^>]*>([\s\S]*?)<\/h2>/.exec(div)?.[1] ?? ''
  return `sec:${fold(h2.replace(/<span class="aside">[\s\S]*?<\/span>/g, ''))}`
}

/** Every leaf of v1's page 1, in order, read off `renderReport`'s output. */
export function v1Page1Leaves(snap: ReportSnapshot): V1Leaf[] {
  const out: V1Leaf[] = []
  for (const div of topLevelDivs(v1Page1Html(snap))) {
    const parts = classOf(div) === 'tail' ? topLevelDivs(div.replace(/^<div\b[^>]*>/, '').replace(/<\/div>$/, '')) : [div]
    for (const part of parts) {
      const top = topName(part)
      const found: Array<{ cls: string; text: string }> = []
      leaves(parse(part), found, '')
      for (const f of found) out.push({ top, cls: f.cls, text: f.text })
    }
  }
  return out
}
