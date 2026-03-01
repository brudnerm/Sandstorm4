import { useState, useEffect, useMemo } from 'react'
import type { TransactionData, DraftData, Transaction, TeamOwnerEntry, OwnerGroup } from '../types'

export interface TransactionIndexes {
  data: TransactionData
  /** lowercase normalized name → all transactions that include that player */
  playerIndex: Map<string, Transaction[]>
  /** canonical player name → all transactions */
  playerNames: Map<string, Transaction[]>
  /** exact team name → all transactions */
  teamIndex: Map<string, Transaction[]>
  /** sorted list of unique team names */
  teamNames: string[]
  /** sorted descending seasons */
  seasons: string[]
  /** team_name → TeamOwnerEntry (from team_owners.json) */
  ownerByTeam: Map<string, TeamOwnerEntry>
  /** owner display name → OwnerGroup (all their teams, sorted season desc) */
  ownerGroups: OwnerGroup[]
}

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; indexes: TransactionIndexes }

function dedupTxns(txns: Transaction[]): Transaction[] {
  const seen = new Set<string>()
  return txns.filter(t => {
    const id = `${t.season}-${t.transaction_id}`
    if (seen.has(id)) return false
    seen.add(id)
    return true
  })
}

function buildIndexes(
  data: TransactionData,
  ownerEntries: TeamOwnerEntry[]
): TransactionIndexes {
  const playerIndex = new Map<string, Transaction[]>()
  const playerNames = new Map<string, Transaction[]>()
  const teamIndex = new Map<string, Transaction[]>()

  for (const txn of data.transactions) {
    for (const p of txn.players) {
      // Lowercase key for fuzzy search
      const lowerName = p.name.toLowerCase()
      if (!playerIndex.has(lowerName)) playerIndex.set(lowerName, [])
      playerIndex.get(lowerName)!.push(txn)

      // Canonical name map
      if (!playerNames.has(p.name)) playerNames.set(p.name, [])
      playerNames.get(p.name)!.push(txn)

      // Team indexes
      for (const teamName of [p.source_team, p.destination_team]) {
        if (!teamName) continue
        const key = teamName.trim()
        if (!key) continue
        if (!teamIndex.has(key)) teamIndex.set(key, [])
        teamIndex.get(key)!.push(txn)
      }
    }

    // Index teams from traded picks (for picks-only trades and to ensure pick teams are searchable)
    if (txn.picks) {
      for (const pk of txn.picks) {
        for (const teamName of [pk.source_team, pk.destination_team]) {
          if (!teamName) continue
          const key = teamName.trim()
          if (!key) continue
          if (!teamIndex.has(key)) teamIndex.set(key, [])
          teamIndex.get(key)!.push(txn)
        }
      }
    }
  }

  // Deduplicate
  for (const [key, txns] of playerIndex.entries()) playerIndex.set(key, dedupTxns(txns))
  for (const [key, txns] of playerNames.entries()) playerNames.set(key, dedupTxns(txns))
  for (const [key, txns] of teamIndex.entries()) teamIndex.set(key, dedupTxns(txns))

  const teamNames = Array.from(teamIndex.keys()).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' })
  )

  const seasons = [...data.seasons_included].sort((a, b) => b.localeCompare(a))

  // Build owner maps
  const ownerByTeam = new Map<string, TeamOwnerEntry>()
  for (const entry of ownerEntries) {
    ownerByTeam.set(entry.team_name, entry)
  }

  // Build owner groups: guid (or fallback key) → OwnerGroup
  // Group by GUID when available, else by owner string, else by team name
  const guidToGroup = new Map<string, OwnerGroup>()

  for (const entry of ownerEntries) {
    const ownerKey = entry.owner_guid ?? entry.owner ?? entry.team_name
    const ownerDisplay = entry.owner ?? 'Unknown'

    if (!guidToGroup.has(ownerKey)) {
      guidToGroup.set(ownerKey, {
        owner: ownerDisplay,
        guid: entry.owner_guid,
        teams: [],
      })
    }
    const group = guidToGroup.get(ownerKey)!
    // Add one entry per season this team appeared
    for (const season of entry.seasons) {
      group.teams.push({ team_name: entry.team_name, season })
    }
  }

  // Sort each group's teams by season descending
  for (const group of guidToGroup.values()) {
    group.teams.sort((a, b) => b.season.localeCompare(a.season))
  }

  // Sort owner groups: known owners first (by most recent season desc), then Unknown
  const ownerGroups = [...guidToGroup.values()].sort((a, b) => {
    const aKnown = a.owner !== 'Unknown'
    const bKnown = b.owner !== 'Unknown'
    if (aKnown !== bKnown) return aKnown ? -1 : 1
    const aMax = a.teams[0]?.season ?? ''
    const bMax = b.teams[0]?.season ?? ''
    if (aMax !== bMax) return bMax.localeCompare(aMax)
    return a.owner.localeCompare(b.owner)
  })

  return {
    data, playerIndex, playerNames, teamIndex, teamNames, seasons,
    ownerByTeam, ownerGroups,
  }
}

/** Search player index with fuzzy prefix/substring matching.
 *  Returns a list of [canonicalName, transactions] sorted by match quality. */
export function searchPlayers(
  query: string,
  playerNames: Map<string, Transaction[]>
): Array<{ name: string; transactions: Transaction[] }> {
  if (!query.trim()) return []
  const q = query.toLowerCase().trim()

  const results: Array<{ name: string; transactions: Transaction[]; score: number }> = []
  for (const [name, txns] of playerNames.entries()) {
    const lower = name.toLowerCase()
    if (!lower.includes(q)) continue
    const score = lower.startsWith(q) ? 0 : lower.indexOf(q)
    results.push({ name, transactions: txns, score })
  }

  return results
    .sort((a, b) => {
      if (a.score !== b.score) return a.score - b.score
      return a.name.localeCompare(b.name)
    })
    .map(({ name, transactions }) => ({ name, transactions }))
}

export function useTransactionData(): State {
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    Promise.all([
      fetch(`${import.meta.env.BASE_URL}data/all_transactions.json`).then(r => {
        if (!r.ok) throw new Error(`transactions HTTP ${r.status}`)
        return r.json() as Promise<TransactionData>
      }),
      fetch(`${import.meta.env.BASE_URL}data/team_owners.json`).then(r => {
        if (!r.ok) throw new Error(`team_owners HTTP ${r.status}`)
        return r.json() as Promise<TeamOwnerEntry[]>
      }),
      fetch(`${import.meta.env.BASE_URL}data/all_drafts.json`).then(r => {
        if (!r.ok) throw new Error(`drafts HTTP ${r.status}`)
        return r.json() as Promise<DraftData>
      }),
    ])
      .then(([data, ownerEntries, draftData]) => {
        if (cancelled) return
        // Merge draft entries into the main transaction list
        const merged: TransactionData = {
          ...data,
          total_transactions: data.total_transactions + draftData.total_drafts,
          seasons_included: [...new Set([...data.seasons_included, ...draftData.seasons_included])].sort(),
          transactions: [...data.transactions, ...draftData.transactions],
        }
        const indexes = buildIndexes(merged, ownerEntries)
        setState({ status: 'ready', indexes })
      })
      .catch(err => {
        if (cancelled) return
        setState({ status: 'error', message: String(err) })
      })
    return () => { cancelled = true }
  }, [])

  return state
}

export function useMemoedPlayerTransactions(
  playerNames: Map<string, Transaction[]>,
  canonicalName: string
): Transaction[] {
  return useMemo(() => {
    if (!canonicalName) return []
    const txns = playerNames.get(canonicalName) ?? []
    return [...txns].sort((a, b) => a.timestamp - b.timestamp)
  }, [playerNames, canonicalName])
}
