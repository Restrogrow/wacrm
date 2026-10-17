'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'

import { JourneyEditor, defaultInitial } from '@/components/journeys/journey-editor'
import type { JourneyKind } from '@/lib/journeys/core'

function NewJourney() {
  const raw = useSearchParams().get('kind')
  const kind: JourneyKind = raw === 'drip' || raw === 'winback' ? raw : 'date'
  return <JourneyEditor key={kind} initial={defaultInitial(kind)} />
}

export default function NewJourneyPage() {
  return (
    <Suspense fallback={null}>
      <NewJourney />
    </Suspense>
  )
}
