import { NextResponse } from 'next/server'

export async function POST(request) {
  try {
    const formData = await request.formData()
    const file = formData.get('file')
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const name = file.name?.toLowerCase() || ''
    let text = ''

    if (name.endsWith('.pdf')) {
      // Dynamic import to avoid SSR issues
      const pdfParse = (await import('pdf-parse/lib/pdf-parse.js')).default
      const data = await pdfParse(buffer)
      text = data.text
    } else if (name.endsWith('.docx')) {
      const mammoth = await import('mammoth')
      const result = await mammoth.extractRawText({ buffer })
      text = result.value
    } else if (name.endsWith('.pptx') || name.endsWith('.ppt')) {
      const { parseOfficeAsync } = await import('officeparser')
      text = await parseOfficeAsync(buffer, { outputErrorToConsole: false })
    } else {
      return NextResponse.json({ error: 'Unsupported file type. Use PDF, DOCX, or PPTX.' }, { status: 400 })
    }

    // Clean up whitespace
    text = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 12000)
    return NextResponse.json({ text, chars: text.length })
  } catch(e) {
    console.error('parse-file error:', e)
    return NextResponse.json({ error: e.message || 'Failed to parse file' }, { status: 500 })
  }
}