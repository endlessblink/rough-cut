// @vitest-environment jsdom

import { describe, expect, it } from 'vite-plus/test'
import { applyTimelineLiveGeometry } from './timeline-live-geometry'

describe('applyTimelineLiveGeometry', () => {
  it('updates real clip geometry without scaling mounted DOM', () => {
    const outer = document.createElement('div')
    const surface = document.createElement('div')
    const child = document.createElement('button')
    surface.appendChild(child)
    outer.appendChild(surface)

    applyTimelineLiveGeometry({
      outer,
      surface,
      duration: 10,
      viewportWidth: 500,
      livePixelsPerSecond: 200,
      fps: 25,
    })

    expect(outer.style.width).toBe('2240px')
    expect(surface.style.width).toBe('2240px')
    expect(surface.style.transform).toBe('none')
    expect(surface.style.getPropertyValue('--timeline-px-per-frame')).toBe('8px')
    expect(outer.style.getPropertyValue('--timeline-px-per-frame')).toBe('8px')
    expect(surface.firstElementChild).toBe(child)
  })
})
