import { memo, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { usePlaybackStore } from '@/shared/state/playback'
import { useMicRecordingStore } from '@/shared/state/mic-recording-store'

/**
 * Live "recording" bar drawn over the timeline while a voiceover take is being
 * captured. It grows from the record-start frame to the live playhead.
 *
 * It is NOT a real timeline item — mutating an item every frame would pollute
 * undo history and trigger transition repairs. Instead it's a lightweight
 * overlay positioned with the tracks container's `--timeline-px-per-frame` CSS
 * variable (so it re-scales for free during zoom) and driven by writing a single
 * `--rec-frames` custom property per playhead change. Anchoring the width to the
 * playhead (not an independent timer) keeps it exactly aligned with where the
 * committed clip will land, and self-heals after any clock catch-up.
 */
export const TimelineRecordingOverlay = memo(function TimelineRecordingOverlay() {
  const { t } = useTranslation()
  const status = useMicRecordingStore((s) => s.status)
  const recordStartFrame = useMicRecordingStore((s) => s.recordStartFrame)
  const barRef = useRef<HTMLDivElement>(null)

  const active = status === 'recording' || status === 'paused' || status === 'finalizing'

  useEffect(() => {
    if (!active) return
    const el = barRef.current
    if (!el) return

    const update = () => {
      const frames = Math.max(0, usePlaybackStore.getState().currentFrame - recordStartFrame)
      el.style.setProperty('--rec-frames', String(frames))
    }
    update()
    return usePlaybackStore.subscribe((state, prev) => {
      if (state.currentFrame !== prev.currentFrame) update()
    })
  }, [active, recordStartFrame])

  if (!active) return null

  const startCalc = `calc(var(--timeline-px-per-frame, 0px) * ${recordStartFrame})`

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-1 z-10 h-10">
      <div
        ref={barRef}
        className="absolute top-0 h-full rounded-sm border border-destructive/70 bg-destructive/20"
        style={{
          left: startCalc,
          width: 'calc(var(--timeline-px-per-frame, 0px) * var(--rec-frames, 0))',
        }}
      />
      <div
        className="absolute top-1 flex items-center gap-1 rounded-sm bg-destructive/90 px-1.5 py-0.5 text-[10px] font-semibold text-white shadow-sm"
        style={{ left: startCalc }}
      >
        <span
          className={`h-1.5 w-1.5 rounded-full bg-white ${status === 'recording' ? 'animate-pulse' : ''}`}
          aria-hidden="true"
        />
        {status === 'finalizing' ? t('recording.saving') : t('recording.rec')}
      </div>
    </div>
  )
})
