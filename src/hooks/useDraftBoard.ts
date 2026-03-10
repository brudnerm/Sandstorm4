import { useState, useEffect, useCallback, useRef, useMemo } from 'react'

// ---- Types ----

export interface DraftAssignment {
  owner: string
  type: 'keeper' | 'drafted'
}

export interface OwnerInfo {
  name: string
  abbrev: string
  color: string
}

interface UndoEntry {
  fgId: string
  previous: DraftAssignment | undefined
}

// 12-color palette for owners (dark-theme friendly)
const OWNER_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#22c55e',
  '#14b8a6', '#3b82f6', '#6366f1', '#8b5cf6',
  '#ec4899', '#a855f7', '#06b6d4', '#84cc16',
]

function makeAbbrev(name: string): string {
  const words = name.trim().split(/\s+/)
  if (words.length === 1) return words[0].substring(0, 2).toUpperCase()
  return words.map(w => w[0]).join('').toUpperCase()
}

// ---- localStorage helpers ----

interface StoredState {
  version: number
  drafted: Array<[string, { owner: string }]>
}

function loadFromStorage(key: string): Map<string, DraftAssignment> {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return new Map()
    const parsed: StoredState = JSON.parse(raw)
    if (parsed.version !== 1) return new Map()
    const map = new Map<string, DraftAssignment>()
    for (const [fgId, { owner }] of parsed.drafted) {
      map.set(fgId, { owner, type: 'drafted' })
    }
    return map
  } catch {
    return new Map()
  }
}

function saveToStorage(key: string, assignments: Map<string, DraftAssignment>) {
  const drafted: Array<[string, { owner: string }]> = []
  assignments.forEach((val, fgId) => {
    if (val.type === 'drafted') {
      drafted.push([fgId, { owner: val.owner }])
    }
  })
  const data: StoredState = { version: 1, drafted }
  try {
    localStorage.setItem(key, JSON.stringify(data))
  } catch (e) {
    console.error('[DraftBoard] Failed to save to localStorage:', e)
  }
}

// ---- CSV parsing ----

async function fetchKeepers(
  basePath: string,
  nameIndex: Map<string, string> // lowercase name -> fg_id
): Promise<Array<{ fgId: string; owner: string }>> {
  const url = `${basePath}data/keepers.csv`
  const res = await fetch(url)
  if (!res.ok) {
    console.warn(`[DraftBoard] Failed to load keepers.csv: HTTP ${res.status}`)
    return []
  }
  const text = await res.text()
  const lines = text.trim().split('\n')
  if (lines.length < 2) return []

  const results: Array<{ fgId: string; owner: string }> = []

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    // Parse CSV: handle the simple two-column case
    const commaIdx = line.indexOf(',')
    if (commaIdx === -1) continue

    const owner = line.substring(0, commaIdx).trim()
    const playerName = line.substring(commaIdx + 1).trim()
    if (!owner || !playerName) continue

    // Match player name to fg_id
    const key = playerName.toLowerCase()
    let fgId = nameIndex.get(key)

    // Try stripping trailing period from suffixes (e.g., "Jr." vs "Jr")
    if (!fgId) {
      fgId = nameIndex.get(key.replace(/\.$/, ''))
    }
    // Try adding trailing period
    if (!fgId && !key.endsWith('.')) {
      fgId = nameIndex.get(key + '.')
    }

    if (fgId) {
      results.push({ fgId, owner })
    } else {
      console.warn(`[DraftBoard] Keeper not matched: "${playerName}" (owner: ${owner})`)
    }
  }

  return results
}

// ---- Hook ----

export function useDraftBoard(
  allPlayers: Array<{ fg_id: string; name: string }>,
  season: number
) {
  const storageKey = `sandstorm_draft_${season}`

  // Build name -> fg_id index from player data
  const nameIndex = useMemo(() => {
    const idx = new Map<string, string>()
    for (const p of allPlayers) {
      idx.set(p.name.toLowerCase(), p.fg_id)
    }
    return idx
  }, [allPlayers])

  // Core assignments state
  const [assignments, setAssignments] = useState<Map<string, DraftAssignment>>(() => {
    return loadFromStorage(storageKey)
  })

  const [keeperStatus, setKeeperStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const keepersLoadedRef = useRef(false)
  const undoStackRef = useRef<UndoEntry[]>([])

  // Load keepers from CSV when player data is available
  useEffect(() => {
    if (allPlayers.length === 0 || keepersLoadedRef.current) return
    keepersLoadedRef.current = true

    fetchKeepers(import.meta.env.BASE_URL, nameIndex)
      .then(keepers => {
        if (keepers.length === 0) {
          setKeeperStatus('ready')
          return
        }

        setAssignments(prev => {
          const next = new Map(prev)
          for (const { fgId, owner } of keepers) {
            next.set(fgId, { owner, type: 'keeper' })
          }
          return next
        })
        setKeeperStatus('ready')
      })
      .catch(err => {
        console.error('[DraftBoard] Failed to load keepers:', err)
        setKeeperStatus('error')
      })
  }, [allPlayers, nameIndex])

  // Persist drafted entries to localStorage on change
  useEffect(() => {
    saveToStorage(storageKey, assignments)
  }, [assignments, storageKey])

  // Owner list derived from keepers + hardcoded 2026 owners
  const owners = useMemo((): OwnerInfo[] => {
    // Use the known 2026 owner names, in consistent order
    const ownerNames = [
      'angel escobar', 'Brian Bennett', 'Galen', 'Jamison',
      'joey', 'KC', 'Mark', 'mike',
      'Nick', 'Rich Garcis', 'Swan', 'Will Youmans',
    ]
    return ownerNames.map((name, i) => ({
      name,
      abbrev: makeAbbrev(name),
      color: OWNER_COLORS[i % OWNER_COLORS.length],
    }))
  }, [])

  const ownerIndex = useMemo(() => {
    const idx = new Map<string, OwnerInfo>()
    for (const o of owners) {
      idx.set(o.name, o)
    }
    return idx
  }, [owners])

  // Actions
  const assignPlayer = useCallback((fgId: string, owner: string) => {
    setAssignments(prev => {
      const previous = prev.get(fgId)
      // Don't overwrite keepers
      if (previous?.type === 'keeper') return prev

      undoStackRef.current.push({ fgId, previous })
      if (undoStackRef.current.length > 50) undoStackRef.current.shift()

      const next = new Map(prev)
      next.set(fgId, { owner, type: 'drafted' })
      return next
    })
  }, [])

  const unassignPlayer = useCallback((fgId: string) => {
    setAssignments(prev => {
      const current = prev.get(fgId)
      // Can't unassign keepers
      if (!current || current.type === 'keeper') return prev

      undoStackRef.current.push({ fgId, previous: current })
      if (undoStackRef.current.length > 50) undoStackRef.current.shift()

      const next = new Map(prev)
      next.delete(fgId)
      return next
    })
  }, [])

  const resetDraft = useCallback(() => {
    setAssignments(prev => {
      const next = new Map<string, DraftAssignment>()
      prev.forEach((val, key) => {
        if (val.type === 'keeper') next.set(key, val)
      })
      // Clear undo stack on reset
      undoStackRef.current = []
      return next
    })
  }, [])

  const undo = useCallback(() => {
    const entry = undoStackRef.current.pop()
    if (!entry) return

    setAssignments(prev => {
      const next = new Map(prev)
      if (entry.previous) {
        next.set(entry.fgId, entry.previous)
      } else {
        next.delete(entry.fgId)
      }
      return next
    })
  }, [])

  const canUndo = undoStackRef.current.length > 0

  // Getters
  const getAssignment = useCallback((fgId: string): DraftAssignment | undefined => {
    return assignments.get(fgId)
  }, [assignments])

  const getOwnerInfo = useCallback((ownerName: string): OwnerInfo | undefined => {
    return ownerIndex.get(ownerName)
  }, [ownerIndex])

  // Counts
  const { keeperCount, draftedCount } = useMemo(() => {
    let keepers = 0
    let drafted = 0
    assignments.forEach(a => {
      if (a.type === 'keeper') keepers++
      else drafted++
    })
    return { keeperCount: keepers, draftedCount: drafted }
  }, [assignments])

  // Export
  const exportState = useCallback((): string => {
    const entries: Array<[string, DraftAssignment]> = []
    assignments.forEach((val, key) => entries.push([key, val]))

    // Also include player names for readability
    const namedEntries = entries.map(([fgId, assignment]) => {
      const player = allPlayers.find(p => p.fg_id === fgId)
      return {
        fg_id: fgId,
        player_name: player?.name ?? 'Unknown',
        owner: assignment.owner,
        type: assignment.type,
      }
    })

    return JSON.stringify({
      exported_at: new Date().toISOString(),
      season,
      assignments: namedEntries,
    }, null, 2)
  }, [assignments, allPlayers, season])

  // Import
  const importState = useCallback((json: string): boolean => {
    try {
      const data = JSON.parse(json)
      if (!data.assignments || !Array.isArray(data.assignments)) return false

      setAssignments(prev => {
        const next = new Map<string, DraftAssignment>()
        // Preserve keepers
        prev.forEach((val, key) => {
          if (val.type === 'keeper') next.set(key, val)
        })
        // Import drafted
        for (const entry of data.assignments) {
          if (entry.type === 'drafted' && entry.fg_id) {
            next.set(entry.fg_id, { owner: entry.owner, type: 'drafted' })
          }
        }
        return next
      })
      undoStackRef.current = []
      return true
    } catch {
      return false
    }
  }, [])

  return {
    assignments,
    owners,
    keeperStatus,
    keeperCount,
    draftedCount,
    assignPlayer,
    unassignPlayer,
    resetDraft,
    undo,
    canUndo,
    getAssignment,
    getOwnerInfo,
    exportState,
    importState,
  }
}
