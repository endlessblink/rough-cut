import { useCallback, useMemo } from 'react'
import type { TimelineItem as TimelineItemType } from '@/types/timeline'
import { useItemsStore } from '../../stores/items-store'
import { canJoinItems } from '@/features/timeline/utils/clip-utils'

export interface ClipNeighbors {
  leftNeighbor: TimelineItemType | null
  rightNeighbor: TimelineItemType | null
  hasJoinableLeft: boolean
  hasJoinableRight: boolean
  /** Clip has empty space before it (no strictly adjacent left neighbor). */
  hasGapBefore: boolean
  /** Gap width in frames immediately before the clip (0 when none). */
  gapBeforeFrames: number
}

/**
 * Reactive adjacency for a clip: its strictly-adjacent left/right neighbors,
 * whether each side is join-eligible, and the gap before it.
 *
 * Recomputes when the item's own position changes OR when the adjacent neighbor
 * set changes — detected via `neighborKey`, an O(trackItems) scan of
 * `itemsByTrackId` (covers deletion, cross-track moves, and position shifts).
 */
export function useClipNeighbors(item: TimelineItemType): ClipNeighbors {
  const neighborKey = useItemsStore(
    useCallback(
      (s) => {
        const trackItems = s.itemsByTrackId[item.trackId]
        if (!trackItems) return '|'
        let leftId = ''
        let rightId = ''
        for (const other of trackItems) {
          if (other.id === item.id) continue
          if (other.from + other.durationInFrames === item.from) leftId = other.id
          else if (other.from === item.from + item.durationInFrames) rightId = other.id
        }
        return leftId + '|' + rightId
      },
      [item.id, item.trackId, item.from, item.durationInFrames],
    ),
  )

  const getNeighbors = useCallback(() => {
    const trackItems = useItemsStore.getState().itemsByTrackId[item.trackId] ?? []

    const left =
      trackItems.find(
        (other) => other.id !== item.id && other.from + other.durationInFrames === item.from,
      ) ?? null

    const right =
      trackItems.find(
        (other) => other.id !== item.id && other.from === item.from + item.durationInFrames,
      ) ?? null

    return {
      leftNeighbor: left,
      rightNeighbor: right,
      hasJoinableLeft: left ? canJoinItems(left, item) : false,
      hasJoinableRight: right ? canJoinItems(item, right) : false,
    }
  }, [item])

  // Recomputes when item props change OR when adjacent neighbor set changes
  const { leftNeighbor, rightNeighbor, hasJoinableLeft, hasJoinableRight } = useMemo(() => {
    void neighborKey
    return getNeighbors()
  }, [getNeighbors, neighborKey])

  // Gap detection: clip has empty space before it (no strictly adjacent left neighbor)
  const hasGapBefore = item.from > 0 && !leftNeighbor

  // Gap width in frames - lets the track-push affordance follow zoom through CSS
  // variables without forcing the entire item shell to re-render on every wheel tick.
  const gapBeforeFrames = useMemo(() => {
    if (!hasGapBefore) return 0
    const trackItems = useItemsStore.getState().itemsByTrackId[item.trackId] ?? []
    let prevEnd = 0
    for (const ti of trackItems) {
      if (ti.id === item.id) continue
      const end = ti.from + ti.durationInFrames
      if (end <= item.from && end > prevEnd) prevEnd = end
    }
    return Math.max(0, item.from - prevEnd)
  }, [hasGapBefore, item.trackId, item.id, item.from])

  return {
    leftNeighbor,
    rightNeighbor,
    hasJoinableLeft,
    hasJoinableRight,
    hasGapBefore,
    gapBeforeFrames,
  }
}
