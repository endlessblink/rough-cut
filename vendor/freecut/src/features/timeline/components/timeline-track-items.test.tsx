import { render } from '@testing-library/react'
import { describe, expect, it, vi } from 'vite-plus/test'
import type { TimelineItem } from '@/types/timeline'

vi.mock('./timeline-item', () => ({
  TimelineItem: ({ item }: { item: TimelineItem }) => (
    <div data-item-id={item.id} data-rich-item-id={item.id} />
  ),
}))

import { TimelineTrackItems } from './timeline-track-items'

const items: TimelineItem[] = [
  {
    id: 'item-1',
    type: 'video',
    trackId: 'track-1',
    from: 0,
    durationInFrames: 30,
    label: 'One',
    src: 'blob:one',
  },
  {
    id: 'item-2',
    type: 'image',
    trackId: 'track-1',
    from: 35,
    durationInFrames: 30,
    label: 'Two',
    src: 'blob:two',
  },
]

describe('TimelineTrackItems stable DOM renderer', () => {
  it('keeps rich clip nodes mounted across rerenders', () => {
    const view = render(
      <TimelineTrackItems trackItems={items} trackLocked={false} trackHidden={false} />,
    )
    const firstItem = view.container.querySelector('[data-rich-item-id="item-1"]')

    view.rerender(
      <TimelineTrackItems trackItems={[...items]} trackLocked={false} trackHidden={false} />,
    )

    expect(view.container.querySelectorAll('[data-rich-item-id]')).toHaveLength(2)
    expect(view.container.querySelector('[data-rich-item-id="item-1"]')).toBe(firstItem)
    expect(view.container.querySelector('canvas')).toBeNull()
    expect(view.container.querySelector('[data-timeline-hit-target="true"]')).toBeNull()
  })
})
