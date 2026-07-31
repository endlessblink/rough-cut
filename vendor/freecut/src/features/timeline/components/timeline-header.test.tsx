import { act, fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { ZOOM_MAX, ZOOM_MIN } from '../constants'
import { useZoomStore } from '../stores/zoom-store'
import { useSelectionStore } from '@/shared/state/selection'
import { TimelineHeader } from './timeline-header'

const { micRenderSpy, sliderInput } = vi.hoisted(() => ({
  micRenderSpy: vi.fn(),
  sliderInput: { value: 0.75 },
}))

vi.mock('@/components/ui/slider', async () => {
  const { forwardRef } = await vi.importActual<typeof import('react')>('react')

  return {
    Slider: forwardRef<
      HTMLSpanElement,
      {
        value?: number[]
        onValueChange?: (value: number[]) => void
        onValueCommit?: (value: number[]) => void
      }
    >(function MockSlider({ value, onValueChange, onValueCommit }, ref) {
      return (
        <span ref={ref} data-testid="zoom-slider" data-value={value?.[0]}>
          <span>
            <span data-testid="zoom-slider-range" />
          </span>
          <span data-testid="zoom-slider-thumb-positioner">
            <button
              type="button"
              role="slider"
              aria-valuenow={value?.[0]}
              onMouseDown={() => onValueChange?.([sliderInput.value])}
              onMouseUp={() => onValueCommit?.([sliderInput.value])}
            />
          </span>
        </span>
      )
    }),
  }
})

vi.mock('./mic-record-control', () => ({
  MicRecordControl: () => {
    micRenderSpy()
    return null
  },
}))

describe('TimelineHeader zoom slider', () => {
  beforeEach(() => {
    micRenderSpy.mockClear()
    sliderInput.value = 0.75
    useZoomStore.getState().setZoomLevelSynchronized(1)
    useSelectionStore.setState({
      selectedItemIds: [],
      selectedItemIdSet: new Set<string>(),
      editKeyframePanelOpen: false,
      expandedKeyframeLanes: new Set<string>(),
    })
  })

  it('previews pointer input immediately and commits without slider-only momentum', () => {
    const animationFrameSpy = vi.spyOn(window, 'requestAnimationFrame')
    const onZoomChange = vi.fn()
    const targetZoom = ZOOM_MIN * Math.pow(ZOOM_MAX / ZOOM_MIN, 0.75)

    render(<TimelineHeader onZoomChange={onZoomChange} />)
    expect(micRenderSpy).toHaveBeenCalledTimes(1)

    const slider = screen.getByTestId('zoom-slider')
    fireEvent.mouseDown(screen.getByRole('slider'))

    expect(screen.getByTestId('zoom-slider-thumb-positioner').style.left).toBe('calc(75% - 4px)')
    expect(screen.getByTestId('zoom-slider-range').style.right).toBe('25%')
    expect(onZoomChange).toHaveBeenLastCalledWith(targetZoom)
    expect(animationFrameSpy).not.toHaveBeenCalled()
    expect(micRenderSpy).toHaveBeenCalledTimes(1)
    expect(useZoomStore.getState().level).toBe(1)

    fireEvent.mouseUp(screen.getByRole('slider'))

    expect(onZoomChange).toHaveBeenCalledTimes(1)
    expect(onZoomChange).toHaveBeenLastCalledWith(targetZoom)
    expect(animationFrameSpy).not.toHaveBeenCalled()

    act(() => useZoomStore.getState().setZoomLevelImmediate(targetZoom))
    expect(Number(slider.dataset.value)).toBeCloseTo(0.75)
    expect(micRenderSpy).toHaveBeenCalledTimes(1)

    animationFrameSpy.mockRestore()
  })

  it('releases a max-zoom preview when a later zoom supersedes its queued target', () => {
    sliderInput.value = 1
    const onZoomChange = vi.fn()

    render(<TimelineHeader onZoomChange={onZoomChange} />)
    const slider = screen.getByTestId('zoom-slider')

    fireEvent.mouseDown(screen.getByRole('slider'))
    fireEvent.mouseUp(screen.getByRole('slider'))
    expect(onZoomChange).toHaveBeenLastCalledWith(ZOOM_MAX)

    act(() => useZoomStore.getState().setZoomLevelSynchronized(ZOOM_MIN))

    expect(Number(slider.dataset.value)).toBeCloseTo(0)
    expect(screen.getByRole('slider')).toHaveAttribute('aria-valuenow', '0')
  })

  it('toggles the keyframe panel without a selected clip', () => {
    render(<TimelineHeader />)

    const toggle = screen.getByRole('button', { name: 'Show keyframe panel' })
    expect(toggle).toBeEnabled()

    fireEvent.click(toggle)

    expect(useSelectionStore.getState().editKeyframePanelOpen).toBe(true)
    expect(useSelectionStore.getState().expandedKeyframeLanes.size).toBe(0)
    expect(screen.getByRole('button', { name: 'Hide keyframe panel' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })
})
