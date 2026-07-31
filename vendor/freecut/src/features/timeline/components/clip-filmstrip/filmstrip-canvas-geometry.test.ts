import { describe, expect, it } from 'vite-plus/test'

import {
  computeCoverDrawRect,
  computeFilmstripCanvasGeometry,
} from './filmstrip-canvas-geometry'

describe('computeFilmstripCanvasGeometry', () => {
  it('bounds the canvas to the visible tile window', () => {
    expect(computeFilmstripCanvasGeometry(100_000, 4_000.2, 6_079.4)).toEqual({
      left: 4_000,
      width: 2_080,
    })
  })

  it('clips the visible window at the clip edge', () => {
    expect(computeFilmstripCanvasGeometry(415, 320, 480)).toEqual({
      left: 320,
      width: 95,
    })
  })
})

describe('computeCoverDrawRect', () => {
  it('center-crops a wide source into a portrait tile', () => {
    expect(computeCoverDrawRect(160, 90, 60, 60)).toEqual({
      x: expect.closeTo(-23.333, 2),
      y: 0,
      width: expect.closeTo(106.667, 2),
      height: 60,
    })
  })
})
