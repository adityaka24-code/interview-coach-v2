import { NextResponse } from 'next/server'
import { getQuestions, getFilterOptions } from '@/lib/db'

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    if (searchParams.get('filters') === 'true') return NextResponse.json(await getFilterOptions())
    const questions = await getQuestions({
      company: searchParams.get('company') || '',
      role: searchParams.get('role') || '',
      location: searchParams.get('location') || '',
      experienceYears: searchParams.get('experienceYears') || '',
      search: searchParams.get('search') || '',
      source: searchParams.get('source') || '',
      questionType: searchParams.get('questionType') || '',
      sortBy: searchParams.get('sortBy') || 'recency',
    })
    return NextResponse.json({ questions })
  } catch (e) { return NextResponse.json({ error: e.message }, { status: 500 }) }
}