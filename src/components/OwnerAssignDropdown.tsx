import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import type { DraftAssignment, OwnerInfo } from '../hooks/useDraftBoard'

interface Props {
  fgId: string
  assignment?: DraftAssignment
  ownerInfo?: OwnerInfo
  owners: OwnerInfo[]
  onAssign: (fgId: string, owner: string) => void
  onUnassign: (fgId: string) => void
}

export default function OwnerAssignDropdown({ fgId, assignment, ownerInfo, owners, onAssign, onUnassign }: Props) {
  const [open, setOpen] = useState(false)
  const [focusedIndex, setFocusedIndex] = useState(0)
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const isKeeper = assignment?.type === 'keeper'
  // Items: all owners + optional Clear item
  const showClear = !!assignment && !isKeeper
  const totalItems = owners.length + (showClear ? 1 : 0)

  const openDropdown = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    if (!btnRef.current) return
    const rect = btnRef.current.getBoundingClientRect()
    setDropdownPos({ top: rect.bottom + 4, left: rect.left })
    setFocusedIndex(0)
    setOpen(true)
  }, [])

  const closeDropdown = useCallback(() => setOpen(false), [])

  // Recalculate position on scroll/resize while open
  useEffect(() => {
    if (!open) return
    const update = () => {
      if (!btnRef.current) return
      const rect = btnRef.current.getBoundingClientRect()
      setDropdownPos({ top: rect.bottom + 4, left: rect.left })
    }
    window.addEventListener('scroll', update, true)
    window.addEventListener('resize', update)
    return () => {
      window.removeEventListener('scroll', update, true)
      window.removeEventListener('resize', update)
    }
  }, [open])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node
      if (
        btnRef.current && !btnRef.current.contains(target) &&
        dropdownRef.current && !dropdownRef.current.contains(target)
      ) {
        closeDropdown()
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, closeDropdown])

  // Keyboard navigation
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeDropdown()
        return
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setFocusedIndex(i => (i + 1) % totalItems)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setFocusedIndex(i => (i - 1 + totalItems) % totalItems)
        return
      }
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault()
        if (focusedIndex < owners.length) {
          onAssign(fgId, owners[focusedIndex].name)
          closeDropdown()
        } else if (showClear) {
          onUnassign(fgId)
          closeDropdown()
        }
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [open, focusedIndex, totalItems, owners, fgId, onAssign, onUnassign, showClear, closeDropdown])

  const handleAssign = (e: React.MouseEvent, ownerName: string) => {
    e.stopPropagation()
    onAssign(fgId, ownerName)
    closeDropdown()
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onUnassign(fgId)
    closeDropdown()
  }

  const dropdown = open ? createPortal(
    <div
      ref={dropdownRef}
      className="dp-assign-dropdown"
      style={{ top: dropdownPos.top, left: dropdownPos.left }}
      onClick={e => e.stopPropagation()}
    >
      {owners.map((o, i) => (
        <button
          key={o.name}
          className={[
            'dp-assign-option',
            assignment?.owner === o.name ? 'dp-assign-option--selected' : '',
            focusedIndex === i ? 'dp-assign-option--focused' : '',
          ].filter(Boolean).join(' ')}
          onMouseEnter={() => setFocusedIndex(i)}
          onClick={e => handleAssign(e, o.name)}
        >
          <span className="dp-assign-option-dot" style={{ background: o.color }} />
          <span className="dp-assign-option-abbrev">{o.abbrev}</span>
          <span className="dp-assign-option-name">{o.name}</span>
        </button>
      ))}
      {showClear && (
        <>
          <div className="dp-assign-divider" />
          <button
            className={[
              'dp-assign-option dp-assign-option--clear',
              focusedIndex === owners.length ? 'dp-assign-option--focused' : '',
            ].filter(Boolean).join(' ')}
            onMouseEnter={() => setFocusedIndex(owners.length)}
            onClick={handleClear}
          >
            <span className="dp-assign-option-dot" style={{ background: 'var(--text-dim)' }} />
            <span className="dp-assign-option-name">Clear</span>
          </button>
        </>
      )}
    </div>,
    document.body
  ) : null

  return (
    <div className="dp-assign-container">
      <button
        ref={btnRef}
        className={`dp-assign-btn${assignment ? ' dp-assign-btn--active' : ''}`}
        onClick={openDropdown}
        title={assignment ? `${assignment.owner} (${assignment.type})` : 'Assign owner'}
        style={ownerInfo ? { background: ownerInfo.color + '33', borderColor: ownerInfo.color + '66', color: ownerInfo.color } : undefined}
      >
        {ownerInfo ? ownerInfo.abbrev.charAt(0) : '+'}
      </button>
      {dropdown}
    </div>
  )
}
