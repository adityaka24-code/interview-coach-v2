import { NextResponse } from 'next/server'

export async function POST(request) {
  try {
    const formData = await request.formData()
    const audio = formData.get('audio')
    if (!audio) return NextResponse.json({ error: 'No audio file provided' }, { status: 400 })

    const OPENAI_API_KEY = process.env.OPENAI_API_KEY
    if (!OPENAI_API_KEY) return NextResponse.json({ error: 'OPENAI_API_KEY is not configured' }, { status: 500 })

    const fd = new FormData()
    fd.append('file', audio, audio.name || 'recording.webm')
    fd.append('model', 'whisper-1')
    fd.append('response_format', 'text')

    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: fd,
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Whisper API error: ${res.status} — ${err}`)
    }

    const transcript = await res.text()
    if (!transcript?.trim()) return NextResponse.json({ error: 'Whisper returned an empty transcript' }, { status: 500 })

    return NextResponse.json({ transcript: transcript.trim() })
  } catch (e) {
    console.error('Transcribe error:', e)
    return NextResponse.json({ error: e.message || 'Transcription failed' }, { status: 500 })
  }
}
