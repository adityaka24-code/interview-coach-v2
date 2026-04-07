import { getPredictionById } from '@/lib/db'
import { NextResponse } from 'next/server'

// ─────────────────────────────────────────────────────────
// Next.js aliases `react` to its compiled React 19 canary,
// which uses Symbol('react.transitional.element') for $$typeof.
// @react-pdf/reconciler was built for React 18 and only
// recognises Symbol('react.element'). We bypass this entirely
// by building elements manually with the React 18 format.
// ─────────────────────────────────────────────────────────
const REACT_ELEMENT = Symbol.for('react.element')
function el(type, props, ...children) {
  const flat = children.flat()
  const resolved = flat.filter(c => c !== null && c !== undefined && c !== false)
  const childrenValue =
    resolved.length === 0 ? undefined :
    resolved.length === 1 ? resolved[0] :
    resolved
  return {
    $$typeof: REACT_ELEMENT,
    type,
    key: null,
    ref: null,
    props: childrenValue !== undefined
      ? { ...(props || {}), children: childrenValue }
      : (props || {}),
    _owner: null,
    _store: {},
  }
}

// Color tokens — mirrors the browser dark theme
const C = {
  bg:           '#0d1117',
  surface:      '#161b22',
  surface2:     '#1c2128',
  border:       '#30363d',
  text:         '#e6edf3',
  muted:        '#8b949e',
  mutedLight:   '#6e7681',
  accent:       '#58a6ff',
  accentBg:     '#0d1f35',
  accentBorder: '#1a3a5c',
  green:        '#3fb950',
  greenBg:      '#0d2a18',
  greenBorder:  '#1e4d2b',
  amber:        '#d29922',
  amberBg:      '#2a1f0d',
  amberBorder:  '#4a3512',
  red:          '#f85149',
  redBg:        '#2d1117',
  redBorder:    '#561d20',
}

const riskOrder = { high: 0, medium: 1, low: 2 }

function formatDate(dateStr) {
  try {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'short', year: 'numeric',
    })
  } catch { return dateStr }
}

function probColor(p) {
  if (p === 'high')   return { text: C.green,  bg: C.greenBg,  border: C.greenBorder }
  if (p === 'medium') return { text: C.amber,  bg: C.amberBg,  border: C.amberBorder }
  return                     { text: C.muted,  bg: C.surface2, border: C.border }
}

function riskColor(r) {
  if (r === 'high')   return { text: C.red,   bg: C.redBg,   border: C.redBorder }
  if (r === 'medium') return { text: C.amber, bg: C.amberBg, border: C.amberBorder }
  return                     { text: C.green, bg: C.greenBg, border: C.greenBorder }
}

function wasAskedLabel(v) {
  if (v === 'yes')     return 'Asked ✓'
  if (v === 'no')      return 'Not asked'
  if (v === 'not_yet') return 'Not yet'
  return ''
}

function wasAskedColor(v) {
  if (v === 'yes')     return C.green
  if (v === 'no')      return C.muted
  if (v === 'not_yet') return C.amber
  return C.muted
}

export async function GET(request, { params }) {
  try {
    const { id } = await params
    const prediction = await getPredictionById(id)
    if (!prediction) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const { renderToBuffer, Document, Page, Text, View, StyleSheet } =
      await import('@react-pdf/renderer')

    const s = StyleSheet.create({
      page:         { backgroundColor: C.bg, fontFamily: 'Helvetica', paddingBottom: 52 },
      headerBand:   { backgroundColor: C.surface, borderBottom: `1pt solid ${C.border}`, padding: '28pt 36pt 22pt 36pt' },
      reportLabel:  { fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.accent, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 },
      companyName:  { fontSize: 26, fontFamily: 'Helvetica-Bold', color: C.text, marginBottom: 6 },
      metaRow:      { flexDirection: 'row', marginTop: 4 },
      metaTag:      { fontSize: 10, fontFamily: 'Helvetica-Bold', color: C.muted, backgroundColor: C.surface2, borderRadius: 4, padding: '2pt 8pt', border: `0.5pt solid ${C.border}`, marginRight: 6 },
      dateText:     { fontSize: 10, color: C.mutedLight, marginTop: 10 },
      content:      { padding: '20pt 36pt 0 36pt' },
      sectionHead:  { fontSize: 10, fontFamily: 'Helvetica-Bold', color: C.muted, letterSpacing: 2, textTransform: 'uppercase', marginBottom: 12, marginTop: 22, paddingBottom: 8, borderBottom: `0.5pt solid ${C.border}` },

      // Callback probability card
      cbCard:       { borderRadius: 10, overflow: 'hidden', marginBottom: 0 },
      cbTopRow:     { flexDirection: 'row' },
      cbNumCell:    { padding: '16pt 20pt', alignItems: 'center', minWidth: 90 },
      cbNumCellRef: { padding: '16pt 20pt', alignItems: 'center', minWidth: 90 },
      cbBigNum:     { fontSize: 34, fontFamily: 'Helvetica-Bold', lineHeight: 1 },
      cbNumLabel:   { fontSize: 7, fontFamily: 'Helvetica-Bold', letterSpacing: 1, textTransform: 'uppercase', marginTop: 4 },
      cbVerdictCell:{ flex: 1, padding: '16pt 16pt', justifyContent: 'center' },
      cbVerdict:    { fontSize: 11, fontFamily: 'Helvetica-Bold', marginBottom: 5 },
      cbReasoning:  { fontSize: 9, color: C.muted, lineHeight: 1.6 },
      cbBottomRow:  { flexDirection: 'row', borderTop: `0.5pt solid ${C.border}` },
      cbSignalCol:  { flex: 1, padding: '10pt 14pt' },
      cbSignalHead: { fontSize: 7, fontFamily: 'Helvetica-Bold', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 5 },
      cbSignalItem: { fontSize: 9, color: C.text, lineHeight: 1.5, marginBottom: 2 },

      typeCard:     { marginBottom: 14, borderRadius: 8, overflow: 'hidden' },
      typeHeader:   { backgroundColor: C.surface2, padding: '9pt 14pt', borderBottom: `0.5pt solid ${C.border}`, flexDirection: 'row', alignItems: 'center' },
      typeLabel:    { fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.accent, letterSpacing: 1.5, textTransform: 'uppercase' },
      typeCount:    { fontSize: 9, color: C.mutedLight, marginLeft: 8 },
      qRow:         { backgroundColor: C.surface, padding: '13pt 14pt', borderBottom: `0.5pt solid ${C.border}` },
      qRowLast:     { backgroundColor: C.surface, padding: '13pt 14pt' },
      qTop:         { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 7 },
      probBadge:    { fontSize: 8, fontFamily: 'Helvetica-Bold', borderRadius: 10, padding: '2pt 7pt', marginRight: 10, marginTop: 1, textAlign: 'center' },
      qText:        { fontSize: 11, fontFamily: 'Helvetica-Bold', color: C.text, flex: 1, lineHeight: 1.55 },
      rationaleBox: { flexDirection: 'row', marginLeft: 46 },
      rationaleWhy: { fontSize: 9, fontFamily: 'Helvetica-Bold', color: C.accent, marginRight: 3 },
      rationaleText:{ fontSize: 9, color: C.muted, flex: 1, lineHeight: 1.6, fontFamily: 'Helvetica-Oblique' },
      wasAskedRow:  { marginLeft: 46, marginTop: 7, flexDirection: 'row', alignItems: 'center' },
      wasAskedDot:  { width: 5, height: 5, borderRadius: 3, marginRight: 5 },
      wasAskedTxt:  { fontSize: 8, fontFamily: 'Helvetica-Bold' },
      gapCard:      { marginBottom: 14, borderRadius: 8, overflow: 'hidden' },
      gapHeader:    { padding: '11pt 14pt', flexDirection: 'row', alignItems: 'flex-start', borderBottom: `0.5pt solid ${C.border}` },
      riskBadge:    { fontSize: 8, fontFamily: 'Helvetica-Bold', borderRadius: 10, padding: '2pt 8pt', marginRight: 10, marginTop: 2, letterSpacing: 0.5, textTransform: 'uppercase' },
      gapTitle:     { fontSize: 11, fontFamily: 'Helvetica-Bold', color: C.text, flex: 1, lineHeight: 1.5 },
      gapBody:      { backgroundColor: C.surface, padding: '12pt 14pt' },
      gapGrid:      { flexDirection: 'row', marginBottom: 10 },
      gapColL:      { flex: 1, paddingRight: 10, borderRight: `0.5pt solid ${C.border}`, marginRight: 10 },
      gapColR:      { flex: 1 },
      gapColLabel:  { fontSize: 8, fontFamily: 'Helvetica-Bold', color: C.mutedLight, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 4 },
      gapTextP:     { fontSize: 9, color: C.text, lineHeight: 1.6 },
      gapTextM:     { fontSize: 9, color: C.muted, lineHeight: 1.6, fontFamily: 'Helvetica-Oblique' },
      prepStack:    { gap: 6 },
      prepBox:      { borderRadius: 6, padding: '8pt 11pt', marginBottom: 5 },
      prepBoxCV:    { backgroundColor: C.greenBg,   border: `0.5pt solid ${C.greenBorder}` },
      prepBoxTip:   { backgroundColor: C.accentBg,  border: `0.5pt solid ${C.accentBorder}` },
      prepBoxOther: { backgroundColor: C.surface2,  border: `0.5pt solid ${C.border}` },
      prepLabelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
      prepIcon:     { fontSize: 9, marginRight: 4 },
      prepLabel:    { fontSize: 8, fontFamily: 'Helvetica-Bold', letterSpacing: 1, textTransform: 'uppercase' },
      prepLabelCV:  { color: C.green },
      prepLabelTip: { color: C.accent },
      prepLabelOth: { color: C.muted },
      prepText:     { fontSize: 9, color: C.text, lineHeight: 1.65 },
      footer:       { position: 'absolute', bottom: 18, left: 36, right: 36, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingTop: 8, borderTop: `0.5pt solid ${C.border}` },
      footerL:      { fontSize: 8, color: C.mutedLight },
      footerR:      { fontSize: 8, color: C.accent, fontFamily: 'Helvetica-Bold' },
    })

    const { company, role_level, round_type, created_at, result } = prediction
    const { predictedQuestions = [], gapAnalysis = [], callbackProbability } = result

    const sortedGaps = [...gapAnalysis].sort(
      (a, b) => (riskOrder[a.probeRisk] ?? 3) - (riskOrder[b.probeRisk] ?? 3)
    )

    // Callback probability helpers
    const cbProb = callbackProbability?.probability ?? null
    const cbBoost = cbProb != null ? Math.min(Math.round((100 - cbProb) * 0.35), 28) : 0
    const cbBoosted = cbProb != null ? Math.min(cbProb + cbBoost, 99) : null
    const cbCol = cbProb == null ? C.muted : cbProb >= 65 ? C.green : cbProb >= 40 ? C.amber : C.red
    const cbBg  = cbProb == null ? C.surface : cbProb >= 65 ? C.greenBg : cbProb >= 40 ? C.amberBg : C.redBg
    const cbBorder = cbProb == null ? C.border : cbProb >= 65 ? C.greenBorder : cbProb >= 40 ? C.amberBorder : C.redBorder
    const cbVerdict = cbProb == null ? '' : cbProb >= 65 ? 'Strong fit' : cbProb >= 40 ? 'Borderline' : 'Weak fit'

    const doc = el(Document, { title: `Prediction — ${[company, role_level, round_type].filter(Boolean).join(' · ')}` },
      el(Page, { size: 'A4', style: s.page },

        // Header
        el(View, { style: s.headerBand },
          el(Text, { style: s.reportLabel }, 'Interview Prediction Report'),
          el(Text, { style: s.companyName }, company || 'Prediction Report'),
          el(View, { style: s.metaRow },
            role_level ? el(Text, { style: s.metaTag }, role_level) : null,
            round_type ? el(Text, { style: s.metaTag }, round_type) : null,
          ),
          el(Text, { style: s.dateText }, `Generated ${formatDate(created_at)}`),
        ),

        el(View, { style: s.content },

          // Callback probability card
          cbProb != null ? el(View, { wrap: false, style: [s.cbCard, { border: `1pt solid ${cbBorder}`, marginBottom: 4 }] },
            // Top row: two numbers + verdict
            el(View, { style: [s.cbTopRow, { borderBottom: `0.5pt solid ${cbBorder}` }] },
              // Without referral
              el(View, { style: [s.cbNumCell, { backgroundColor: cbBg, borderRight: `0.5pt solid ${cbBorder}` }] },
                el(Text, { style: [s.cbBigNum, { color: cbCol }] }, `${cbProb}%`),
                el(Text, { style: [s.cbNumLabel, { color: C.muted }] }, 'Without referral'),
              ),
              // With referral
              el(View, { style: [s.cbNumCellRef, { backgroundColor: C.greenBg, borderRight: `0.5pt solid ${cbBorder}` }] },
                el(View, { style: { flexDirection: 'row', alignItems: 'flex-end' } },
                  el(Text, { style: [s.cbBigNum, { color: C.green }] }, `${cbBoosted}%`),
                  el(Text, { style: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: C.green, marginLeft: 3, marginBottom: 2 } }, `+${cbBoost}`),
                ),
                el(Text, { style: [s.cbNumLabel, { color: C.green }] }, 'With referral'),
              ),
              // Verdict + reasoning
              el(View, { style: s.cbVerdictCell },
                el(Text, { style: [s.cbVerdict, { color: cbCol }] }, cbVerdict),
                callbackProbability?.reasoning
                  ? el(Text, { style: s.cbReasoning }, callbackProbability.reasoning)
                  : null,
              ),
            ),
            // Bottom row: signals
            (callbackProbability?.signals?.strong?.length > 0 || callbackProbability?.signals?.weak?.length > 0)
              ? el(View, { style: s.cbBottomRow },
                  el(View, { style: [s.cbSignalCol, { borderRight: `0.5pt solid ${cbBorder}` }] },
                    el(Text, { style: [s.cbSignalHead, { color: C.green }] }, 'Strengths'),
                    ...(callbackProbability.signals.strong || []).map((str, i) =>
                      el(Text, { key: String(i), style: s.cbSignalItem }, `· ${str}`)
                    ),
                  ),
                  el(View, { style: s.cbSignalCol },
                    el(Text, { style: [s.cbSignalHead, { color: C.red }] }, 'Gaps to address'),
                    ...(callbackProbability.signals.weak || []).map((str, i) =>
                      el(Text, { key: String(i), style: s.cbSignalItem }, `· ${str}`)
                    ),
                  ),
                )
              : null,
          ) : null,

          el(Text, { style: s.sectionHead }, 'Predicted Questions'),

          ...predictedQuestions.map((typeBlock, ti) => {
            const qs = typeBlock.questions || []
            return el(View, { key: String(ti), wrap: false, style: [s.typeCard, { border: `1pt solid ${C.border}` }] },
              el(View, { style: s.typeHeader },
                el(Text, { style: s.typeLabel }, typeBlock.questionType),
                el(Text, { style: s.typeCount }, `  ${qs.length} question${qs.length !== 1 ? 's' : ''}`),
              ),
              ...qs.map((q, qi) => {
                const pc = probColor(q.probability)
                const isLast = qi === qs.length - 1
                return el(View, { key: String(qi), style: isLast ? s.qRowLast : s.qRow },
                  el(View, { style: s.qTop },
                    el(Text, { style: [s.probBadge, { color: pc.text, backgroundColor: pc.bg, border: `0.5pt solid ${pc.border}` }] }, q.probability),
                    el(Text, { style: s.qText }, q.question),
                  ),
                  el(View, { style: s.rationaleBox },
                    el(Text, { style: s.rationaleWhy }, 'Why:'),
                    el(Text, { style: s.rationaleText }, q.rationale),
                  ),
                  q.wasAsked !== undefined
                    ? el(View, { style: s.wasAskedRow },
                        el(View, { style: [s.wasAskedDot, { backgroundColor: wasAskedColor(q.wasAsked) }] }),
                        el(Text, { style: [s.wasAskedTxt, { color: wasAskedColor(q.wasAsked) }] }, wasAskedLabel(q.wasAsked)),
                      )
                    : null,
                )
              }),
            )
          }),

          el(Text, { style: s.sectionHead }, 'Gap Analysis'),

          ...sortedGaps.map((gap, i) => {
            const rc = riskColor(gap.probeRisk)
            return el(View, { key: String(i), wrap: false, style: [s.gapCard, { border: `1pt solid ${rc.border}` }] },
              el(View, { style: [s.gapHeader, { backgroundColor: rc.bg, borderBottom: `0.5pt solid ${rc.border}` }] },
                el(Text, { style: [s.riskBadge, { color: rc.text, backgroundColor: rc.bg, border: `0.5pt solid ${rc.border}` }] },
                  `${gap.probeRisk.toUpperCase()} RISK`),
                el(Text, { style: s.gapTitle }, gap.jdRequires),
              ),
              el(View, { style: s.gapBody },
                el(View, { style: s.gapGrid },
                  el(View, { style: s.gapColL },
                    el(Text, { style: s.gapColLabel }, 'JD Requires'),
                    el(Text, { style: s.gapTextP }, gap.jdRequires),
                  ),
                  el(View, { style: s.gapColR },
                    el(Text, { style: s.gapColLabel }, 'CV Signal'),
                    el(Text, { style: s.gapTextM }, gap.cvSignal),
                  ),
                ),
                el(View, { style: s.prepStack },
                  // CV improvement
                  gap.prepAdvice?.cvImprovement
                    ? el(View, { style: [s.prepBox, s.prepBoxCV] },
                        el(View, { style: s.prepLabelRow },
                          el(Text, { style: s.prepIcon }, '📄'),
                          el(Text, { style: [s.prepLabel, s.prepLabelCV] }, 'CV Improvement'),
                        ),
                        el(Text, { style: s.prepText }, gap.prepAdvice.cvImprovement),
                      )
                    : null,
                  // Interview tip
                  gap.prepAdvice?.interviewTip
                    ? el(View, { style: [s.prepBox, s.prepBoxTip] },
                        el(View, { style: s.prepLabelRow },
                          el(Text, { style: s.prepIcon }, '🎯'),
                          el(Text, { style: [s.prepLabel, s.prepLabelTip] }, 'Interview Tip'),
                        ),
                        el(Text, { style: s.prepText }, gap.prepAdvice.interviewTip),
                      )
                    : null,
                  // Other
                  gap.prepAdvice?.other
                    ? el(View, { style: [s.prepBox, s.prepBoxOther] },
                        el(View, { style: s.prepLabelRow },
                          el(Text, { style: s.prepIcon }, '📚'),
                          el(Text, { style: [s.prepLabel, s.prepLabelOth] }, 'Other'),
                        ),
                        el(Text, { style: s.prepText }, gap.prepAdvice.other),
                      )
                    : null,
                  // Fallback for old single-string shape
                  typeof gap.prepAdvice === 'string'
                    ? el(View, { style: [s.prepBox, s.prepBoxTip] },
                        el(Text, { style: [s.prepLabel, s.prepLabelTip] }, 'Prep Action'),
                        el(Text, { style: s.prepText }, gap.prepAdvice),
                      )
                    : null,
                ),
              ),
            )
          }),
        ),

        el(View, { style: s.footer, fixed: true },
          el(Text, { style: s.footerL }, 'PM Interview Coach'),
          el(Text, { style: s.footerR, render: ({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}` }),
        ),
      )
    )

    const buffer = await renderToBuffer(doc)
    return new Response(buffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="prediction-report-${id.slice(0, 8)}.pdf"`,
      },
    })
  } catch (err) {
    console.error('PDF generation error:', err)
    return NextResponse.json({ error: err.message || 'PDF generation failed' }, { status: 500 })
  }
}
