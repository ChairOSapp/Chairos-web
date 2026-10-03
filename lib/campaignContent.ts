// Campaign email content helpers.
//
// The campaigns.email_body column stores the CANONICAL TipTap JSON document
// (stringified). HTML is generated from it at send/render time and always
// passed through DOMPurify before it touches a browser or an email.
//
// Legacy rows (pre-TipTap) hold plain text; the helpers below transparently
// upgrade those to a TipTap doc so old campaigns keep working unchanged.

export type TipTapDoc = {
  type: 'doc'
  content?: TipTapNode[]
}

export type TipTapNode = {
  type: string
  text?: string
  attrs?: Record<string, any>
  marks?: { type: string; attrs?: Record<string, any> }[]
  content?: TipTapNode[]
}

export function isTipTapDoc(value: unknown): value is TipTapDoc {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as any).type === 'doc' &&
    Array.isArray((value as any).content)
  )
}

// Parse the stored email_body value into a TipTap doc. Accepts a stringified
// doc, an already-parsed doc, legacy plain text, or null.
export function parseEmailBody(stored: string | TipTapDoc | null | undefined): TipTapDoc | null {
  if (!stored) return null
  if (isTipTapDoc(stored)) return stored
  if (typeof stored !== 'string') return null
  const trimmed = stored.trim()
  if (!trimmed) return null
  try {
    const parsed = JSON.parse(trimmed)
    if (isTipTapDoc(parsed)) return parsed
  } catch {
    // Not JSON: legacy plain text.
  }
  return textToTipTapDoc(trimmed)
}

export function textToTipTapDoc(text: string): TipTapDoc {
  const trimmed = text.trim()
  if (!trimmed) return { type: 'doc', content: [{ type: 'paragraph' }] }
  const paragraphs = trimmed.split(/\n\s*\n/).map(block => ({
    type: 'paragraph' as const,
    content: block
      .split('\n')
      .flatMap((line, i, arr) => {
        const nodes: TipTapNode[] = line ? [{ type: 'text', text: line }] : []
        if (i < arr.length - 1) nodes.push({ type: 'hardBreak' })
        return nodes
      }),
  }))
  return { type: 'doc', content: paragraphs }
}

export function isDocEmpty(doc: TipTapDoc | null | undefined): boolean {
  if (!doc || !Array.isArray(doc.content)) return true
  return doc.content.every(node => {
    if (node.type === 'paragraph' || node.type === 'heading') {
      return !node.content || node.content.every(c => !c.text?.trim())
    }
    return false
  })
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Only http(s) and mailto links survive; everything else (javascript:,
// data:, etc.) is dropped to plain text.
function safeHref(href: unknown): string | null {
  if (typeof href !== 'string') return null
  const h = href.trim()
  if (/^(https?:\/\/|mailto:)/i.test(h)) return escapeHtml(h)
  return null
}

function renderMarks(text: string, marks: TipTapNode['marks']): string {
  let out = escapeHtml(text)
  for (const mark of marks ?? []) {
    if (mark.type === 'bold') out = `<strong>${out}</strong>`
    else if (mark.type === 'italic') out = `<em>${out}</em>`
    else if (mark.type === 'link') {
      const href = safeHref(mark.attrs?.href)
      out = href ? `<a href="${href}">${out}</a>` : out
    }
    // Unknown marks are dropped (their text survives).
  }
  return out
}

function renderInline(content: TipTapNode[] | undefined): string {
  return (content ?? [])
    .map(node => {
      if (node.type === 'text') return renderMarks(node.text ?? '', node.marks)
      if (node.type === 'hardBreak') return '<br>'
      return ''
    })
    .join('')
}

function renderBlock(node: TipTapNode): string {
  switch (node.type) {
    case 'paragraph':
      return `<p>${renderInline(node.content)}</p>`
    case 'bulletList':
      return `<ul>${(node.content ?? []).map(renderBlock).join('')}</ul>`
    case 'orderedList':
      return `<ol>${(node.content ?? []).map(renderBlock).join('')}</ol>`
    case 'listItem':
      // TipTap wraps list item content in paragraph nodes.
      return `<li>${(node.content ?? []).map(n => (n.type === 'paragraph' ? renderInline(n.content) : renderBlock(n))).join('')}</li>`
    default:
      return ''
  }
}

// Render a TipTap doc to HTML with a strict allowlist (paragraphs, lists,
// bold, italic, safe links). No DOM required, so this runs on the server.
// The result must STILL go through DOMPurify before rendering/sending:
// this renderer is the first layer, DOMPurify is the enforceable second.
export function tiptapDocToSafeHtml(doc: TipTapDoc | null | undefined): string {
  if (!doc || !Array.isArray(doc.content)) return ''
  return doc.content.map(renderBlock).join('')
}

// Plain-text extraction (fallbacks, character counts).
export function tiptapDocToText(doc: TipTapDoc | null | undefined): string {
  if (!doc || !Array.isArray(doc.content)) return ''
  const walk = (nodes: TipTapNode[] | undefined): string =>
    (nodes ?? [])
      .map(n => {
        if (n.type === 'text') return n.text ?? ''
        if (n.type === 'hardBreak') return '\n'
        const inner = walk(n.content)
        return n.type === 'paragraph' ? inner + '\n\n' : inner
      })
      .join('')
  return walk(doc.content).replace(/\n{3,}/g, '\n\n').trim()
}
