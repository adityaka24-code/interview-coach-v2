import { savePrediction, getPredictions } from '@/lib/db'
import { NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'

export async function POST(request) {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const data = await request.json()
    if (!data.result) {
      return NextResponse.json({ error: 'result is required' }, { status: 400 })
    }
    const id = await savePrediction({ ...data, userId })
    return NextResponse.json({ id })
  } catch (err) {
    console.error('Save prediction error:', err)
    return NextResponse.json({ error: err.message || 'Failed to save' }, { status: 500 })
  }
}

export async function GET() {
  try {
    const { userId } = await auth()
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const rows = await getPredictions(userId)
    const predictions = rows.map(p => {
      let callbackProbability = null
      try {
        const result = typeof p.result === 'string' ? JSON.parse(p.result) : (p.result || {})
        callbackProbability = result.callbackProbability ?? null
      } catch {}
      const { result: _r, ...rest } = p
      return { ...rest, callbackProbability }
    })
    return NextResponse.json({ predictions })
  } catch (err) {
    console.error('Get predictions error:', err)
    return NextResponse.json({ error: err.message || 'Failed to fetch' }, { status: 500 })
  }
}
