'use client'
import { useState, useRef } from 'react'

export default function FileDropZone({ onText, label = 'Drop PDF, DOCX, or PPTX', compact = false }) {
  const [parsing, setParsing] = useState(false)
  const [error, setError] = useState('')
  const [fileName, setFileName] = useState('')
  const inputRef = useRef(null)

  const handle = async (file) => {
    if (!file) return
    const name = file.name?.toLowerCase() || ''
    if (!name.match(/\.(pdf|docx|pptx|ppt)$/)) {
      setError('Use PDF, DOCX, or PPTX files only'); return
    }
    setParsing(true); setError(''); setFileName(file.name)
    try {
      const fd = new FormData(); fd.append('file', file)
      const res = await fetch('/api/parse-file', { method:'POST', body:fd })
      const d = await res.json()
      if (d.error) throw new Error(d.error)
      onText(d.text)
    } catch(e) {
      setError(e.message); setFileName('')
    } finally { setParsing(false) }
  }

  const onDrop = (e) => {
    e.preventDefault()
    handle(e.dataTransfer.files[0])
  }

  return (
    <div>
      <div
        onDrop={onDrop}
        onDragOver={e=>e.preventDefault()}
        onClick={()=>inputRef.current?.click()}
        role="button"
        tabIndex={0}
        aria-label={label}
        onKeyDown={e=>e.key==='Enter'&&inputRef.current?.click()}
        style={{
          border: '1px dashed var(--border)',
          borderRadius: 8,
          padding: compact ? '10px 14px' : '14px 18px',
          cursor: 'pointer',
          textAlign: 'center',
          background: 'transparent',
          transition: 'border-color 0.2s, background 0.2s',
          marginBottom: error ? 6 : 0,
        }}
        onMouseEnter={e=>{ e.currentTarget.style.borderColor='var(--accent)'; e.currentTarget.style.background='rgba(99,179,237,0.03)' }}
        onMouseLeave={e=>{ e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.background='transparent' }}
      >
        {parsing ? (
          <span style={{ fontSize:'var(--font-size-xs)', color:'var(--accent)' }}>
            ⏳ Extracting text from {fileName}...
          </span>
        ) : fileName ? (
          <span style={{ fontSize:'var(--font-size-xs)', color:'var(--accent2)' }}>
            ✓ {fileName} — click to replace
          </span>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:6 }}>
            <span style={{ fontSize:20, opacity:0.4 }}>↑</span>
            <span style={{ fontSize:'var(--font-size-xs)', color:'var(--text-muted)' }}>{label}</span>
            <span style={{ fontSize:'var(--font-size-xs)', color:'var(--text-muted)', opacity:0.55 }}>or click to browse</span>
          </div>
        )}
      </div>
      {error && <p style={{ fontSize:'var(--font-size-xs)', color:'var(--danger)', marginTop:4 }}>⚠ {error}</p>}
      <input ref={inputRef} type="file" accept=".pdf,.docx,.pptx,.ppt" onChange={e=>handle(e.target.files[0])} style={{ display:'none' }} aria-hidden/>
    </div>
  )
}