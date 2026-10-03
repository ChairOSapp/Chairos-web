'use client'
import { useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import type { TipTapDoc } from '@/lib/campaignContent'

const EXTENSIONS = [
  StarterKit.configure({
    heading: false,
    blockquote: false,
    codeBlock: false,
    horizontalRule: false,
    code: false,
    strike: false,
    dropcursor: false,
    gapcursor: false,
  }),
  Link.configure({
    openOnClick: false,
    autolink: true,
    HTMLAttributes: { rel: 'noopener noreferrer' },
  }),
]

function ToolbarButton({
  active,
  onClick,
  label,
  children,
}: {
  active?: boolean
  onClick: () => void
  label: string
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onMouseDown={e => e.preventDefault()}
      onClick={onClick}
      className={`min-w-[44px] min-h-[44px] px-3 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center ${
        active ? 'bg-od-green text-white' : 'text-charcoal-500 hover:bg-warm-300 hover:text-charcoal-900'
      }`}
    >
      {children}
    </button>
  )
}

// Rich-text email body editor. Emits the canonical TipTap JSON document;
// HTML is generated from it at send/preview time and DOMPurify-sanitized.
export default function CampaignEmailEditor({
  value,
  onChange,
}: {
  value: TipTapDoc | null
  onChange: (doc: TipTapDoc) => void
}) {
  const [showLinkInput, setShowLinkInput] = useState(false)
  const [linkUrl, setLinkUrl] = useState('')
  const lastEmitted = useRef<string>('')

  const editor = useEditor({
    extensions: EXTENSIONS,
    content: value ?? { type: 'doc', content: [{ type: 'paragraph' }] },
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: 'min-h-[160px] px-4 py-3 text-charcoal-900 text-sm leading-relaxed outline-none',
        'aria-label': 'Email body',
      },
    },
    onUpdate: ({ editor }) => {
      const doc = editor.getJSON() as TipTapDoc
      lastEmitted.current = JSON.stringify(doc)
      onChange(doc)
    },
  })

  // Push external changes (AI generate, loading a draft) into the editor.
  useEffect(() => {
    if (!editor) return
    const next = JSON.stringify(value ?? { type: 'doc', content: [{ type: 'paragraph' }] })
    if (next !== lastEmitted.current && next !== JSON.stringify(editor.getJSON())) {
      lastEmitted.current = next
      editor.commands.setContent(value ?? { type: 'doc', content: [{ type: 'paragraph' }] })
    }
  }, [editor, value])

  useEffect(() => {
    return () => { editor?.destroy() }
  }, [editor])

  function applyLink() {
    if (!editor) return
    const url = linkUrl.trim()
    setShowLinkInput(false)
    setLinkUrl('')
    if (!url) {
      editor.chain().focus().unsetLink().run()
      return
    }
    const href = /^(https?:\/\/|mailto:)/i.test(url) ? url : `https://${url}`
    editor.chain().focus().setLink({ href }).run()
  }

  return (
    <div className="bg-warm-200 border border-warm-300 rounded-lg overflow-hidden focus-within:border-od-green transition-colors">
      <div className="flex flex-wrap items-center gap-1 px-2 py-1.5 border-b border-warm-300 bg-warm-100/60">
        <ToolbarButton label="Bold" active={editor?.isActive('bold')} onClick={() => editor?.chain().focus().toggleBold().run()}>
          <span className="font-bold">B</span>
        </ToolbarButton>
        <ToolbarButton label="Italic" active={editor?.isActive('italic')} onClick={() => editor?.chain().focus().toggleItalic().run()}>
          <span className="italic font-serif">I</span>
        </ToolbarButton>
        <ToolbarButton label="Bullet list" active={editor?.isActive('bulletList')} onClick={() => editor?.chain().focus().toggleBulletList().run()}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden><circle cx="3" cy="3.5" r="1.4" /><circle cx="3" cy="8" r="1.4" /><circle cx="3" cy="12.5" r="1.4" /><rect x="6" y="2.6" width="8" height="1.8" rx="0.9" /><rect x="6" y="7.1" width="8" height="1.8" rx="0.9" /><rect x="6" y="11.6" width="8" height="1.8" rx="0.9" /></svg>
        </ToolbarButton>
        <ToolbarButton label="Numbered list" active={editor?.isActive('orderedList')} onClick={() => editor?.chain().focus().toggleOrderedList().run()}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden><path d="M5 4h9M5 8h9M5 12h9" strokeLinecap="round" /><text x="1" y="5.5" fontSize="4.5" fill="currentColor" stroke="none">1</text><text x="1" y="10" fontSize="4.5" fill="currentColor" stroke="none">2</text><text x="1" y="14.5" fontSize="4.5" fill="currentColor" stroke="none">3</text></svg>
        </ToolbarButton>
        <ToolbarButton
          label={editor?.isActive('link') ? 'Edit link' : 'Add link'}
          active={editor?.isActive('link')}
          onClick={() => {
            if (!editor) return
            if (editor.isActive('link')) {
              editor.chain().focus().unsetLink().run()
              return
            }
            setLinkUrl('')
            setShowLinkInput(v => !v)
          }}
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden><path d="M6.5 9.5a3.5 3.5 0 0 0 5 0l2-2a3.54 3.54 0 0 0-5-5l-1 1" strokeLinecap="round" /><path d="M9.5 6.5a3.5 3.5 0 0 0-5 0l-2 2a3.54 3.54 0 0 0 5 5l1-1" strokeLinecap="round" /></svg>
        </ToolbarButton>
      </div>
      {showLinkInput && (
        <div className="flex gap-2 px-3 py-2 border-b border-warm-300 bg-warm-100/60">
          <input
            type="url"
            inputMode="url"
            autoFocus
            value={linkUrl}
            onChange={e => setLinkUrl(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') applyLink(); if (e.key === 'Escape') setShowLinkInput(false) }}
            placeholder="https://example.com"
            className="flex-1 min-w-0 bg-warm-200 border border-warm-300 rounded-lg px-3 py-2 text-sm text-charcoal-900 outline-none focus:border-od-green"
          />
          <button type="button" onClick={applyLink} className="px-4 min-h-[44px] rounded-lg bg-od-green text-white text-sm font-semibold">Apply</button>
        </div>
      )}
      <EditorContent
        editor={editor}
        className="[&_.ProseMirror]:outline-none [&_.ProseMirror_p]:my-2 [&_.ProseMirror_ul]:list-disc [&_.ProseMirror_ul]:pl-6 [&_.ProseMirror_ul]:my-2 [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_ol]:pl-6 [&_.ProseMirror_ol]:my-2 [&_.ProseMirror_li]:my-1 [&_.ProseMirror_a]:text-od-green [&_.ProseMirror_a]:underline [&_.ProseMirror]:break-words"
      />
    </div>
  )
}
