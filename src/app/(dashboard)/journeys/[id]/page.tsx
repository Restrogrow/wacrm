'use client'

import { use, useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'

import { JourneyEditor, type EditorInitial } from '@/components/journeys/journey-editor'

export default function EditJourneyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const [initial, setInitial] = useState<EditorInitial | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void fetch(`/api/journeys/${id}`)
      .then(async (r) => {
        const json = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(json.error || 'Journey not found')
        const j = json.journey
        setInitial({
          id: j.id,
          kind: j.kind,
          name: j.name,
          daily_cap: j.daily_cap,
          config: j.config,
          steps: j.steps,
        })
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Could not load'))
  }, [id])

  if (error) return <p className="text-sm text-red-600">{error}</p>
  if (!initial) {
    return (
      <div className="text-muted-foreground flex items-center gap-2 text-sm">
        <Loader2 className="size-4 animate-spin" /> Loading…
      </div>
    )
  }
  return <JourneyEditor initial={initial} />
}
