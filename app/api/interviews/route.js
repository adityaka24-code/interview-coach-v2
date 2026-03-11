import { NextResponse } from 'next/server'
import { listInterviews, getInterview } from '@/lib/db'

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (id) {
      const interview = await getInterview(id)
      if (!interview) return NextResponse.json({ error: 'Not found' }, { status: 404 })
      return NextResponse.json({ interview })
    }
    return NextResponse.json({ interviews: await listInterviews() })
  } catch (e) { return NextResponse.json({ error: e.message }, { status: 500 }) }
}