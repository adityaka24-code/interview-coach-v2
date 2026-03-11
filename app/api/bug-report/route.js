import { NextResponse } from 'next/server'
import { saveBugReport } from '@/lib/db'

export async function POST(request) {
  try {
    const body = await request.json()
    const { description, page, activity, userAgent, screenSize, userName } = body
    if (!description || description.trim().length < 5) {
      return NextResponse.json({ error: 'Description too short' }, { status: 400 })
    }
    const wordCount = description.trim().split(/\s+/).filter(Boolean).length
    if (wordCount > 200) {
      return NextResponse.json({ error: 'Max 200 words' }, { status: 400 })
    }
    const id = await saveBugReport({
      description: description.trim(),
      page: page || '',
      activity: activity || '',
      userAgent: userAgent || '',
      screenSize: screenSize || '',
      userName: userName || '',
    })
    return NextResponse.json({ success: true, id })
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
