import { getPredictionById } from '@/lib/db'
import { NextResponse } from 'next/server'

export async function GET(request, { params }) {
  const log = []

  try {
    const { id } = await params
    log.push('1. Starting debug')

    // Step 1: DB fetch
    let prediction
    try {
      prediction = await getPredictionById(id)
      log.push(`2. DB fetch OK — prediction ${prediction ? 'found' : 'NOT FOUND'}`)
    } catch (e) {
      log.push(`2. DB fetch FAILED: ${e.message}`)
      return NextResponse.json({ log, error: e.message, step: 'db' })
    }

    if (!prediction) {
      return NextResponse.json({ log, error: 'Prediction not found', step: 'db' })
    }

    log.push(`3. result keys: ${Object.keys(prediction.result || {}).join(', ')}`)
    log.push(`4. predictedQuestions count: ${prediction.result?.predictedQuestions?.length ?? 'N/A'}`)
    log.push(`5. gapAnalysis count: ${prediction.result?.gapAnalysis?.length ?? 'N/A'}`)

    // Step 2: dynamic import
    let renderToBuffer, Document, Page, Text, View, StyleSheet, React
    try {
      const pdf = await import('@react-pdf/renderer')
      renderToBuffer = pdf.renderToBuffer
      Document = pdf.Document
      Page = pdf.Page
      Text = pdf.Text
      View = pdf.View
      StyleSheet = pdf.StyleSheet
      React = (await import('react')).default
      log.push(`6. @react-pdf/renderer import OK — renderToBuffer type: ${typeof renderToBuffer}`)
      log.push(`7. React import OK — version: ${React.version}`)
    } catch (e) {
      log.push(`6. import FAILED: ${e.message}\n${e.stack}`)
      return NextResponse.json({ log, error: e.message, step: 'import' })
    }

    // Step 3: StyleSheet.create
    let s
    try {
      s = StyleSheet.create({ test: { fontSize: 10 } })
      log.push('8. StyleSheet.create OK')
    } catch (e) {
      log.push(`8. StyleSheet.create FAILED: ${e.message}`)
      return NextResponse.json({ log, error: e.message, step: 'stylesheet' })
    }

    // Step 4: build minimal document
    let doc
    try {
      doc = React.createElement(Document, null,
        React.createElement(Page, { size: 'A4' },
          React.createElement(View, null,
            React.createElement(Text, null, 'test')
          )
        )
      )
      log.push('9. React.createElement doc OK')
    } catch (e) {
      log.push(`9. createElement FAILED: ${e.message}`)
      return NextResponse.json({ log, error: e.message, step: 'createElement' })
    }

    // Step 5: renderToBuffer
    let buffer
    try {
      buffer = await renderToBuffer(doc)
      log.push(`10. renderToBuffer OK — buffer length: ${buffer.length}`)
    } catch (e) {
      log.push(`10. renderToBuffer FAILED: ${e.message}\n${e.stack}`)
      return NextResponse.json({ log, error: e.message, step: 'renderToBuffer' })
    }

    return NextResponse.json({ log, success: true, bufferLength: buffer.length })

  } catch (e) {
    log.push(`UNHANDLED: ${e.message}\n${e.stack}`)
    return NextResponse.json({ log, error: e.message, step: 'unhandled' })
  }
}
