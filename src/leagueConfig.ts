import type { DraftPrepBatter, DraftPrepPitcher, SeasonBatter, SeasonPitcher } from './draftPrepTypes'

// ---- Column & format types ----

export type AnyBatter = DraftPrepBatter | SeasonBatter
export type AnyPitcher = DraftPrepPitcher | SeasonPitcher

export interface Column<T> {
  key: string
  label: string
  group: string
  getValue: (p: T) => number | string | undefined
  format?: (v: number | string | undefined) => string
  width: number
  align?: 'left' | 'right'
  /** Override default sort direction for this column */
  defaultDir?: 'asc' | 'desc'
  /** Tooltip shown on column header hover */
  tooltip?: string
  /** How to aggregate this stat for team comparison.
   *  'sum' = add values; 'avg_pa' = PA-weighted avg; 'avg_ip' = IP-weighted avg */
  teamAgg?: 'sum' | 'avg_pa' | 'avg_ip'
}

export const fmt3 = (v: number | string | undefined) => typeof v === 'number' ? v.toFixed(3).replace(/^0/, '') : '—'
export const fmt2 = (v: number | string | undefined) => typeof v === 'number' ? v.toFixed(2) : '—'
export const fmt1 = (v: number | string | undefined) => typeof v === 'number' ? v.toFixed(1) : '—'
export const fmtInt = (v: number | string | undefined) => typeof v === 'number' ? String(Math.round(v)) : '—'
export const fmtPct = (v: number | string | undefined) => typeof v === 'number' ? v.toFixed(1) + '%' : '—'
export const fmtAdp = (v: number | string | undefined) => typeof v === 'number' && v > 0 ? v.toFixed(1) : '—'
export const fmtDollars = (v: number | string | undefined) => typeof v === 'number' ? '$' + v.toFixed(1) : '—'

// ---- League config type ----

export type DraftType = 'snake' | 'auction'

export interface LeagueConfig {
  id: string
  name: string
  owners: string[]
  draftType: DraftType
  enableKeepers: boolean
  storagePrefix: string
  /** Show transaction-history tabs (Player Search, Season Browser, etc.) */
  showTransactionTabs: boolean
  batterColumns: Column<AnyBatter>[]
  pitcherColumns: Column<AnyPitcher>[]
  batterGroups: string[]
  pitcherGroups: string[]
  batterPositions: string[]
  pitcherPositions: string[]
}

// ---- KP column definitions ----

const KP_BATTER_COLUMNS: Column<AnyBatter>[] = [
  { key: 'adp',        label: 'ADP',    group: 'Scoring', getValue: p => (p as DraftPrepBatter).adp,        format: fmtAdp, width: 48, align: 'right', defaultDir: 'asc' },
  { key: 'yahoo_rank', label: 'Y-Rank', group: 'Scoring', getValue: p => (p as DraftPrepBatter).yahoo_rank, format: fmtInt, width: 52, align: 'right', defaultDir: 'asc', tooltip: 'Yahoo O-Rank (2026 pre-draft overall rank)' },
  { key: 'pa',  label: 'PA',  group: 'Scoring', getValue: p => p.pa,  format: fmtInt, width: 44, align: 'right' },
  { key: 'r',   label: 'R',   group: 'Scoring', getValue: p => p.r,   format: fmtInt, width: 38, align: 'right', teamAgg: 'sum' },
  { key: 'hr',  label: 'HR',  group: 'Scoring', getValue: p => p.hr,  format: fmtInt, width: 38, align: 'right', teamAgg: 'sum' },
  { key: 'rbi', label: 'RBI', group: 'Scoring', getValue: p => p.rbi, format: fmtInt, width: 42, align: 'right', teamAgg: 'sum' },
  { key: 'sb',  label: 'SB',  group: 'Scoring', getValue: p => p.sb,  format: fmtInt, width: 38, align: 'right', teamAgg: 'sum' },
  { key: 'avg', label: 'AVG', group: 'Scoring', getValue: p => p.avg, format: fmt3,   width: 50, align: 'right', teamAgg: 'avg_pa' },
  { key: 'obp', label: 'OBP', group: 'Scoring', getValue: p => p.obp, format: fmt3,   width: 50, align: 'right', teamAgg: 'avg_pa' },
  // Rates
  { key: 'slg',    label: 'SLG',  group: 'Rates', getValue: p => p.slg,    format: fmt3,   width: 50, align: 'right' },
  { key: 'ops',    label: 'OPS',  group: 'Rates', getValue: p => p.ops,    format: fmt3,   width: 50, align: 'right' },
  { key: 'woba',   label: 'wOBA', group: 'Rates', getValue: p => p.woba,   format: fmt3,   width: 50, align: 'right' },
  { key: 'k_pct',  label: 'K%',   group: 'Rates', getValue: p => p.k_pct,  format: fmtPct, width: 50, align: 'right', defaultDir: 'asc' },
  { key: 'bb_pct', label: 'BB%',  group: 'Rates', getValue: p => p.bb_pct, format: fmtPct, width: 50, align: 'right' },
  { key: 'war',    label: 'WAR',  group: 'Rates', getValue: p => p.war,    format: fmt1,   width: 44, align: 'right' },
  // Advanced
  { key: 'xba',         label: 'xBA',   group: 'Advanced', getValue: p => (p as DraftPrepBatter).xba,         format: fmt3,   width: 50, align: 'right' },
  { key: 'xslg',        label: 'xSLG',  group: 'Advanced', getValue: p => (p as DraftPrepBatter).xslg,        format: fmt3,   width: 50, align: 'right' },
  { key: 'xwoba',       label: 'xwOBA', group: 'Advanced', getValue: p => (p as DraftPrepBatter).xwoba,       format: fmt3,   width: 56, align: 'right' },
  { key: 'barrel_pct',  label: 'Brl%',  group: 'Advanced', getValue: p => (p as DraftPrepBatter).barrel_pct,  format: fmtPct, width: 50, align: 'right' },
]

const KP_PITCHER_COLUMNS: Column<AnyPitcher>[] = [
  { key: 'adp',        label: 'ADP',    group: 'Scoring', getValue: p => (p as DraftPrepPitcher).adp,        format: fmtAdp, width: 48, align: 'right', defaultDir: 'asc' },
  { key: 'yahoo_rank', label: 'Y-Rank', group: 'Scoring', getValue: p => (p as DraftPrepPitcher).yahoo_rank, format: fmtInt, width: 52, align: 'right', defaultDir: 'asc', tooltip: 'Yahoo O-Rank (2026 pre-draft overall rank)' },
  { key: 'ip',   label: 'IP',   group: 'Scoring', getValue: p => p.ip,   format: fmt1,   width: 44, align: 'right', teamAgg: 'sum' },
  { key: 'w',    label: 'W',    group: 'Scoring', getValue: p => p.w,    format: fmtInt, width: 34, align: 'right', teamAgg: 'sum' },
  { key: 'l',    label: 'L',    group: 'Scoring', getValue: p => p.l,    format: fmtInt, width: 34, align: 'right', defaultDir: 'asc', teamAgg: 'sum' },
  { key: 'sv',   label: 'SV',   group: 'Scoring', getValue: p => p.sv,   format: fmtInt, width: 34, align: 'right', teamAgg: 'sum' },
  { key: 'k',    label: 'K',    group: 'Scoring', getValue: p => p.k,    format: fmtInt, width: 40, align: 'right', teamAgg: 'sum' },
  { key: 'era',  label: 'ERA',  group: 'Scoring', getValue: p => p.era,  format: fmt2,   width: 48, align: 'right', defaultDir: 'asc', teamAgg: 'avg_ip' },
  { key: 'whip', label: 'WHIP', group: 'Scoring', getValue: p => p.whip, format: fmt2,   width: 50, align: 'right', defaultDir: 'asc', teamAgg: 'avg_ip' },
  // Rates
  { key: 'fip',    label: 'FIP',  group: 'Rates', getValue: p => p.fip,    format: fmt2,   width: 48, align: 'right', defaultDir: 'asc' },
  { key: 'k_9',   label: 'K/9',  group: 'Rates', getValue: p => p.k_9,   format: fmt2,   width: 48, align: 'right' },
  { key: 'bb_9',  label: 'BB/9', group: 'Rates', getValue: p => p.bb_9,  format: fmt2,   width: 48, align: 'right', defaultDir: 'asc' },
  { key: 'k_pct', label: 'K%',   group: 'Rates', getValue: p => p.k_pct, format: fmtPct, width: 50, align: 'right' },
  { key: 'bb_pct',label: 'BB%',  group: 'Rates', getValue: p => p.bb_pct,format: fmtPct, width: 50, align: 'right', defaultDir: 'asc' },
  { key: 'war',   label: 'WAR',  group: 'Rates', getValue: p => p.war,   format: fmt1,   width: 44, align: 'right' },
  // Advanced
  { key: 'xera',        label: 'xERA', group: 'Advanced', getValue: p => (p as DraftPrepPitcher).xera,        format: fmt2, width: 50, align: 'right', defaultDir: 'asc' },
  { key: 'xba_against', label: 'xBA',  group: 'Advanced', getValue: p => (p as DraftPrepPitcher).xba_against, format: fmt3, width: 50, align: 'right', defaultDir: 'asc' },
]

// ---- Sidebar column definitions ----
// Column array order determines default display order: Scoring → Auction → Rates → Advanced

const SIDEBAR_BATTER_COLUMNS: Column<AnyBatter>[] = [
  // Scoring
  { key: 'auc_dollars', label: '$Val', group: 'Scoring',
    tooltip: 'FanGraphs projected auction value (Depth Charts projections)',
    getValue: p => (p as DraftPrepBatter).auc_dollars, format: fmtDollars, width: 50, align: 'right', defaultDir: 'desc', teamAgg: 'sum' },
  { key: 'auc_total', label: '$PRO', group: 'Scoring',
    tooltip: 'Projected dollar contribution: PTS + aPOS (FanGraphs Auction Calculator)',
    getValue: p => {
      const b = p as DraftPrepBatter
      return (b.auc_pts != null && b.auc_apos != null) ? b.auc_pts + b.auc_apos : undefined
    }, format: fmtDollars, width: 50, align: 'right', defaultDir: 'desc' },
  { key: 'adp', label: 'ADP', group: 'Scoring',
    tooltip: 'Average Draft Position',
    getValue: p => (p as DraftPrepBatter).adp, format: fmtAdp, width: 48, align: 'right', defaultDir: 'asc' },
  { key: 'yahoo_rank', label: 'Y-Rank', group: 'Scoring',
    tooltip: 'Yahoo O-Rank (2026 pre-draft overall rank)',
    getValue: p => (p as DraftPrepBatter).yahoo_rank, format: fmtInt, width: 52, align: 'right', defaultDir: 'asc' },
  { key: 'pa',  label: 'PA',  group: 'Scoring',
    tooltip: 'Projected plate appearances',
    getValue: p => p.pa,  format: fmtInt, width: 44, align: 'right' },
  { key: 'r',   label: 'R',   group: 'Scoring',
    tooltip: 'Projected runs scored',
    getValue: p => p.r,   format: fmtInt, width: 38, align: 'right', teamAgg: 'sum' },
  { key: 'hr',  label: 'HR',  group: 'Scoring',
    tooltip: 'Projected home runs',
    getValue: p => p.hr,  format: fmtInt, width: 38, align: 'right', teamAgg: 'sum' },
  { key: 'rbi', label: 'RBI', group: 'Scoring',
    tooltip: 'Projected runs batted in',
    getValue: p => p.rbi, format: fmtInt, width: 42, align: 'right', teamAgg: 'sum' },
  { key: 'sb',  label: 'SB',  group: 'Scoring',
    tooltip: 'Projected stolen bases',
    getValue: p => p.sb,  format: fmtInt, width: 38, align: 'right', teamAgg: 'sum' },
  { key: 'avg', label: 'AVG', group: 'Scoring',
    tooltip: 'Projected batting average',
    getValue: p => p.avg, format: fmt3,   width: 50, align: 'right', teamAgg: 'avg_pa' },
  { key: 'ops', label: 'OPS', group: 'Scoring',
    tooltip: 'Projected on-base plus slugging',
    getValue: p => p.ops, format: fmt3,   width: 50, align: 'right', teamAgg: 'avg_pa' },
  { key: 'so',  label: 'K',   group: 'Scoring',
    tooltip: 'Projected strikeouts (negative scoring category)',
    getValue: p => (p as DraftPrepBatter).so ?? (p as SeasonBatter).so, format: fmtInt, width: 38, align: 'right', defaultDir: 'asc', teamAgg: 'sum' },
  { key: 'gdp', label: 'GIDP', group: 'Scoring',
    tooltip: 'Projected grounded into double plays (negative scoring category)',
    getValue: p => (p as DraftPrepBatter).gdp ?? (p as SeasonBatter).gdp, format: fmtInt, width: 44, align: 'right', defaultDir: 'asc', teamAgg: 'sum' },
  // Auction (FanGraphs marginal values — shown when Auction group is enabled)
  { key: 'auc_mAVG', label: 'mAVG', group: 'Auction',
    tooltip: 'Marginal dollar value from batting average category (FanGraphs Auction Calculator)',
    getValue: p => (p as DraftPrepBatter).auc_mAVG, format: fmt1, width: 50, align: 'right' },
  { key: 'auc_mR',   label: 'mR',   group: 'Auction',
    tooltip: 'Marginal dollar value from runs category (FanGraphs Auction Calculator)',
    getValue: p => (p as DraftPrepBatter).auc_mR,   format: fmt1, width: 44, align: 'right' },
  { key: 'auc_mHR',  label: 'mHR',  group: 'Auction',
    tooltip: 'Marginal dollar value from home runs category (FanGraphs Auction Calculator)',
    getValue: p => (p as DraftPrepBatter).auc_mHR,  format: fmt1, width: 44, align: 'right' },
  { key: 'auc_mRBI', label: 'mRBI', group: 'Auction',
    tooltip: 'Marginal dollar value from RBI category (FanGraphs Auction Calculator)',
    getValue: p => (p as DraftPrepBatter).auc_mRBI, format: fmt1, width: 50, align: 'right' },
  { key: 'auc_mSB',  label: 'mSB',  group: 'Auction',
    tooltip: 'Marginal dollar value from stolen bases category (FanGraphs Auction Calculator)',
    getValue: p => (p as DraftPrepBatter).auc_mSB,  format: fmt1, width: 44, align: 'right' },
  { key: 'auc_mOPS', label: 'mOPS', group: 'Auction',
    tooltip: 'Marginal dollar value from OPS category (FanGraphs Auction Calculator)',
    getValue: p => (p as DraftPrepBatter).auc_mOPS, format: fmt1, width: 50, align: 'right' },
  { key: 'auc_mSO',  label: 'mSO',  group: 'Auction',
    tooltip: 'Marginal dollar value from strikeout category (FanGraphs Auction Calculator)',
    getValue: p => (p as DraftPrepBatter).auc_mSO,  format: fmt1, width: 44, align: 'right' },
  { key: 'auc_pts',  label: 'PTS',  group: 'Auction',
    tooltip: 'Total point score before positional adjustment (FanGraphs Auction Calculator)',
    getValue: p => (p as DraftPrepBatter).auc_pts,  format: fmt1, width: 44, align: 'right' },
  { key: 'auc_apos', label: 'aPOS', group: 'Auction',
    tooltip: 'Positional scarcity adjustment value (FanGraphs Auction Calculator)',
    getValue: p => (p as DraftPrepBatter).auc_apos, format: fmt1, width: 44, align: 'right' },
  // Rates
  { key: 'obp',    label: 'OBP',  group: 'Rates',
    tooltip: 'On-base percentage',
    getValue: p => p.obp,    format: fmt3,   width: 50, align: 'right' },
  { key: 'slg',    label: 'SLG',  group: 'Rates',
    tooltip: 'Slugging percentage',
    getValue: p => p.slg,    format: fmt3,   width: 50, align: 'right' },
  { key: 'woba',   label: 'wOBA', group: 'Rates',
    tooltip: 'Weighted on-base average (FanGraphs)',
    getValue: p => p.woba,   format: fmt3,   width: 50, align: 'right' },
  { key: 'k_pct',  label: 'K%',   group: 'Rates',
    tooltip: 'Strikeout rate',
    getValue: p => p.k_pct,  format: fmtPct, width: 50, align: 'right', defaultDir: 'asc' },
  { key: 'bb_pct', label: 'BB%',  group: 'Rates',
    tooltip: 'Walk rate',
    getValue: p => p.bb_pct, format: fmtPct, width: 50, align: 'right' },
  { key: 'war',    label: 'WAR',  group: 'Rates',
    tooltip: 'Wins above replacement (FanGraphs)',
    getValue: p => p.war,    format: fmt1,   width: 44, align: 'right' },
  // Advanced
  { key: 'xba',        label: 'xBA',   group: 'Advanced',
    tooltip: 'Expected batting average (Baseball Savant / Statcast)',
    getValue: p => (p as DraftPrepBatter).xba,        format: fmt3,   width: 50, align: 'right' },
  { key: 'xslg',       label: 'xSLG',  group: 'Advanced',
    tooltip: 'Expected slugging percentage (Baseball Savant / Statcast)',
    getValue: p => (p as DraftPrepBatter).xslg,       format: fmt3,   width: 50, align: 'right' },
  { key: 'xwoba',      label: 'xwOBA', group: 'Advanced',
    tooltip: 'Expected weighted on-base average (Baseball Savant / Statcast)',
    getValue: p => (p as DraftPrepBatter).xwoba,      format: fmt3,   width: 56, align: 'right' },
  { key: 'barrel_pct', label: 'Brl%',  group: 'Advanced',
    tooltip: 'Barrel rate — hard contact at optimal launch angle (Baseball Savant / Statcast)',
    getValue: p => (p as DraftPrepBatter).barrel_pct, format: fmtPct, width: 50, align: 'right' },
]

const SIDEBAR_PITCHER_COLUMNS: Column<AnyPitcher>[] = [
  // Scoring
  { key: 'auc_dollars', label: '$Val', group: 'Scoring',
    tooltip: 'FanGraphs projected auction value (Depth Charts projections)',
    getValue: p => (p as DraftPrepPitcher).auc_dollars, format: fmtDollars, width: 50, align: 'right', defaultDir: 'desc', teamAgg: 'sum' },
  { key: 'auc_total', label: '$PRO', group: 'Scoring',
    tooltip: 'Projected dollar contribution: PTS + aPOS (FanGraphs Auction Calculator)',
    getValue: p => {
      const pit = p as DraftPrepPitcher
      return (pit.auc_pts != null && pit.auc_apos != null) ? pit.auc_pts + pit.auc_apos : undefined
    }, format: fmtDollars, width: 50, align: 'right', defaultDir: 'desc' },
  { key: 'adp',  label: 'ADP',  group: 'Scoring',
    tooltip: 'Average Draft Position',
    getValue: p => (p as DraftPrepPitcher).adp, format: fmtAdp, width: 48, align: 'right', defaultDir: 'asc' },
  { key: 'yahoo_rank', label: 'Y-Rank', group: 'Scoring',
    tooltip: 'Yahoo O-Rank (2026 pre-draft overall rank)',
    getValue: p => (p as DraftPrepPitcher).yahoo_rank, format: fmtInt, width: 52, align: 'right', defaultDir: 'asc' },
  { key: 'ip',   label: 'IP',   group: 'Scoring',
    tooltip: 'Projected innings pitched',
    getValue: p => p.ip,   format: fmt1,   width: 44, align: 'right', teamAgg: 'sum' },
  { key: 'l',    label: 'L',    group: 'Scoring',
    tooltip: 'Projected losses (negative scoring category)',
    getValue: p => p.l,    format: fmtInt, width: 34, align: 'right', defaultDir: 'asc', teamAgg: 'sum' },
  { key: 'sv',   label: 'SV',   group: 'Scoring',
    tooltip: 'Projected saves',
    getValue: p => p.sv,   format: fmtInt, width: 34, align: 'right', teamAgg: 'sum' },
  { key: 'k',    label: 'K',    group: 'Scoring',
    tooltip: 'Projected strikeouts',
    getValue: p => p.k,    format: fmtInt, width: 40, align: 'right', teamAgg: 'sum' },
  { key: 'era',  label: 'ERA',  group: 'Scoring',
    tooltip: 'Projected earned run average (lower is better)',
    getValue: p => p.era,  format: fmt2,   width: 48, align: 'right', defaultDir: 'asc', teamAgg: 'avg_ip' },
  { key: 'whip', label: 'WHIP', group: 'Scoring',
    tooltip: 'Projected walks + hits per inning pitched (lower is better)',
    getValue: p => p.whip, format: fmt2,   width: 50, align: 'right', defaultDir: 'asc', teamAgg: 'avg_ip' },
  { key: 'k_bb', label: 'K/BB', group: 'Scoring',
    tooltip: 'Projected strikeout-to-walk ratio',
    getValue: p => (p as DraftPrepPitcher).k_bb ?? (p as SeasonPitcher).k_bb, format: fmt2, width: 48, align: 'right', teamAgg: 'avg_ip' },
  { key: 'qs',   label: 'QS',   group: 'Scoring',
    tooltip: 'Projected quality starts (6+ IP, ≤3 earned runs)',
    getValue: p => (p as DraftPrepPitcher).qs ?? (p as SeasonPitcher).qs, format: fmtInt, width: 38, align: 'right', teamAgg: 'sum' },
  { key: 'gdp',  label: 'GIDP', group: 'Scoring',
    tooltip: 'Projected grounded into double plays induced',
    getValue: p => (p as DraftPrepPitcher).gdp ?? (p as SeasonPitcher).gdp, format: fmtInt, width: 44, align: 'right', teamAgg: 'sum' },
  // Auction (FanGraphs marginal values — shown when Auction group is enabled)
  { key: 'auc_mW',    label: 'mW',    group: 'Auction',
    tooltip: 'Marginal dollar value from wins category (FanGraphs Auction Calculator)',
    getValue: p => (p as DraftPrepPitcher).auc_mW,    format: fmt1, width: 44, align: 'right' },
  { key: 'auc_mSV',   label: 'mSV',   group: 'Auction',
    tooltip: 'Marginal dollar value from saves category (FanGraphs Auction Calculator)',
    getValue: p => (p as DraftPrepPitcher).auc_mSV,   format: fmt1, width: 44, align: 'right' },
  { key: 'auc_mERA',  label: 'mERA',  group: 'Auction',
    tooltip: 'Marginal dollar value from ERA category (FanGraphs Auction Calculator)',
    getValue: p => (p as DraftPrepPitcher).auc_mERA,  format: fmt1, width: 50, align: 'right' },
  { key: 'auc_mWHIP', label: 'mWHIP', group: 'Auction',
    tooltip: 'Marginal dollar value from WHIP category (FanGraphs Auction Calculator)',
    getValue: p => (p as DraftPrepPitcher).auc_mWHIP, format: fmt1, width: 56, align: 'right' },
  { key: 'auc_mSO',   label: 'mSO',   group: 'Auction',
    tooltip: 'Marginal dollar value from strikeouts category (FanGraphs Auction Calculator)',
    getValue: p => (p as DraftPrepPitcher).auc_mSO,   format: fmt1, width: 44, align: 'right' },
  { key: 'auc_mKBB',  label: 'mK/BB', group: 'Auction',
    tooltip: 'Marginal dollar value from K/BB category (FanGraphs Auction Calculator)',
    getValue: p => (p as DraftPrepPitcher).auc_mKBB,  format: fmt1, width: 50, align: 'right' },
  { key: 'auc_mQS',   label: 'mQS',   group: 'Auction',
    tooltip: 'Marginal dollar value from quality starts category (FanGraphs Auction Calculator)',
    getValue: p => (p as DraftPrepPitcher).auc_mQS,   format: fmt1, width: 44, align: 'right' },
  { key: 'auc_pts',   label: 'PTS',   group: 'Auction',
    tooltip: 'Total point score before positional adjustment (FanGraphs Auction Calculator)',
    getValue: p => (p as DraftPrepPitcher).auc_pts,   format: fmt1, width: 44, align: 'right' },
  { key: 'auc_apos',  label: 'aPOS',  group: 'Auction',
    tooltip: 'Positional scarcity adjustment value (FanGraphs Auction Calculator)',
    getValue: p => (p as DraftPrepPitcher).auc_apos,  format: fmt1, width: 44, align: 'right' },
  // Rates
  { key: 'w',     label: 'W',    group: 'Rates',
    tooltip: 'Projected wins',
    getValue: p => p.w,     format: fmtInt, width: 34, align: 'right' },
  { key: 'fip',   label: 'FIP',  group: 'Rates',
    tooltip: 'Fielding independent pitching (lower is better)',
    getValue: p => p.fip,   format: fmt2,   width: 48, align: 'right', defaultDir: 'asc' },
  { key: 'k_9',   label: 'K/9',  group: 'Rates',
    tooltip: 'Strikeouts per 9 innings',
    getValue: p => p.k_9,   format: fmt2,   width: 48, align: 'right' },
  { key: 'bb_9',  label: 'BB/9', group: 'Rates',
    tooltip: 'Walks per 9 innings (lower is better)',
    getValue: p => p.bb_9,  format: fmt2,   width: 48, align: 'right', defaultDir: 'asc' },
  { key: 'k_pct', label: 'K%',   group: 'Rates',
    tooltip: 'Strikeout rate',
    getValue: p => p.k_pct, format: fmtPct, width: 50, align: 'right' },
  { key: 'bb_pct', label: 'BB%', group: 'Rates',
    tooltip: 'Walk rate (lower is better)',
    getValue: p => p.bb_pct, format: fmtPct, width: 50, align: 'right', defaultDir: 'asc' },
  { key: 'war',   label: 'WAR',  group: 'Rates',
    tooltip: 'Wins above replacement (FanGraphs)',
    getValue: p => p.war,   format: fmt1,   width: 44, align: 'right' },
  // Advanced
  { key: 'xera',        label: 'xERA', group: 'Advanced',
    tooltip: 'Expected ERA based on quality of contact allowed (Baseball Savant / Statcast)',
    getValue: p => (p as DraftPrepPitcher).xera,        format: fmt2, width: 50, align: 'right', defaultDir: 'asc' },
  { key: 'xba_against', label: 'xBA',  group: 'Advanced',
    tooltip: 'Expected batting average against (Baseball Savant / Statcast)',
    getValue: p => (p as DraftPrepPitcher).xba_against, format: fmt3, width: 50, align: 'right', defaultDir: 'asc' },
]

// ---- League configs ----

export const KP_CONFIG: LeagueConfig = {
  id: 'kp',
  name: 'Keeping Pattycakes',
  owners: [
    'angel escobar', 'Brian Bennett', 'Galen', 'Jamison',
    'joey', 'KC', 'Mark', 'mike',
    'Nick', 'Rich Garcis', 'Swan', 'Will Youmans',
  ],
  draftType: 'snake',
  enableKeepers: true,
  storagePrefix: 'sandstorm_draft',
  showTransactionTabs: true,
  batterColumns: KP_BATTER_COLUMNS,
  pitcherColumns: KP_PITCHER_COLUMNS,
  batterGroups: ['Scoring', 'Rates', 'Advanced'],
  pitcherGroups: ['Scoring', 'Rates', 'Advanced'],
  batterPositions: ['All', 'C', '1B', '2B', '3B', 'SS', 'OF', 'DH'],
  pitcherPositions: ['All', 'SP', 'RP'],
}

export const SIDEBAR_CONFIG: LeagueConfig = {
  id: 'sidebar',
  name: 'sidebar',
  owners: [
    'angel escobar', 'rich garcis', 'joey', 'Nick', 'Jamison',
    'Will Youmans', 'Mark', 'KC', 'mike', 'Galen',
  ],
  draftType: 'auction',
  enableKeepers: false,
  storagePrefix: 'sandstorm_sidebar_draft',
  showTransactionTabs: false,
  batterColumns: SIDEBAR_BATTER_COLUMNS,
  pitcherColumns: SIDEBAR_PITCHER_COLUMNS,
  batterGroups: ['Scoring', 'Auction', 'Rates', 'Advanced'],
  pitcherGroups: ['Scoring', 'Auction', 'Rates', 'Advanced'],
  batterPositions: ['All', 'C', '1B', '2B', '3B', 'SS', 'OF', 'DH'],
  pitcherPositions: ['All', 'SP', 'RP'],
}

export const ALL_LEAGUES = [KP_CONFIG, SIDEBAR_CONFIG]
