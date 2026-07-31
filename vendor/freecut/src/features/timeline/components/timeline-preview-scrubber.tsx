import { TimelinePreviewScrubberVisual } from '@/shared/ui/timeline-preview-scrubber-visual'
import { timelineSkimmerScrubSignal } from '@/shared/timeline/main-timeline-scrub'
import { useTimelineZoomContext } from '../contexts/timeline-zoom-context'
import { IO_LANE_HEIGHT } from './timeline-markers'
import { previewScrubberSuppressRef } from './preview-scrubber-suppress'

const MAIN_TIMELINE_SKIMMER_SUPPRESS_REFS = [previewScrubberSuppressRef]

interface TimelinePreviewScrubberProps {
  inRuler?: boolean
  maxFrame?: number
  zIndex?: number
}

/** Main timeline adapter for the shared preview scrubber visual. */
export function TimelinePreviewScrubber({
  inRuler = false,
  maxFrame,
  zIndex,
}: TimelinePreviewScrubberProps) {
  const { frameToPixels, fps } = useTimelineZoomContext()

  return (
    <TimelinePreviewScrubberVisual
      frameToPixels={frameToPixels}
      fps={fps}
      inRuler={inRuler}
      maxFrame={maxFrame}
      rulerOffset={IO_LANE_HEIGHT}
      suppressRefs={MAIN_TIMELINE_SKIMMER_SUPPRESS_REFS}
      suppressSignal={timelineSkimmerScrubSignal}
      zIndex={zIndex}
    />
  )
}
