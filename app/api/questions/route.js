import { NextResponse } from 'next/server'
import { getQuestions, getFilterOptions, getPmQuestions } from '@/lib/db'

const PAGE_SIZE = 50

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url)
    if (searchParams.get('filters') === 'true') {
      return NextResponse.json(await getFilterOptions())
    }

    const params = {
      company:         searchParams.get('company')         || '',
      role:            searchParams.get('role')            || '',
      location:        searchParams.get('location')        || '',
      experienceYears: searchParams.get('experienceYears') || '',
      search:          searchParams.get('search')          || '',
      source:          searchParams.get('source')          || '',
      questionType:    searchParams.get('questionType')    || '',
      sortBy:          searchParams.get('sortBy')          || 'recency',
    }
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10))

    const shouldIncludeLewisLin     = !params.source || params.source === 'lewis_lin'
    const shouldIncludeUserQuestions = !params.source || params.source !== 'lewis_lin'

    const [userQs, pmQs] = await Promise.allSettled([
      shouldIncludeUserQuestions ? getQuestions(params)   : Promise.resolve([]),
      shouldIncludeLewisLin      ? getPmQuestions(params) : Promise.resolve([]),
    ])

    const userRows = userQs.status === 'fulfilled' ? userQs.value : []
    const pmRows   = pmQs.status   === 'fulfilled' ? pmQs.value   : []

    const combined = [...userRows, ...pmRows]
    if (params.sortBy === 'frequency') {
      combined.sort((a, b) => (b.frequency ?? 0) - (a.frequency ?? 0))
    } else {
      combined.sort((a, b) =>
        new Date(b.last_seen || 0) - new Date(a.last_seen || 0)
      )
    }

    const total = combined.length
    const start = (page - 1) * PAGE_SIZE
    const questions = combined.slice(start, start + PAGE_SIZE)

    return NextResponse.json({ questions, total, page, pageSize: PAGE_SIZE })
  } catch (e) { return NextResponse.json({ error: e.message }, { status: 500 }) }
}
