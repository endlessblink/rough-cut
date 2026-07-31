import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { render, screen } from '@testing-library/react'
import type { TimelineItem } from '@/types/timeline'
import { useSettingsStore } from '@/features/timeline/deps/settings'
import { useMediaLibraryStore } from '@/features/timeline/deps/media-library-store'
import { useItemsStore } from '../../stores/items-store'
import { useCompositionsStore } from '../../stores/compositions-store'
import { useSequencesStore } from '../../stores/sequences-store'
import { useTimelineStore } from '../../stores/timeline-store'
import { useZoomStore, _resetZoomStoreForTest } from '../../stores/zoom-store'
import { ClipContent } from './clip-content'

vi.mock('../clip-filmstrip', () => ({
  ClipFilmstrip: ({ pixelsPerSecond }: { pixelsPerSecond: number }) => (
    <div data-testid="clip-filmstrip" data-pps={String(pixelsPerSecond)} />
  ),
}))

vi.mock('../clip-filmstrip/image-filmstrip', () => ({
  ImageFilmstrip: ({ pixelsPerSecond }: { pixelsPerSecond: number }) => (
    <div data-testid="image-filmstrip" data-pps={String(pixelsPerSecond)} />
  ),
}))

vi.mock('../clip-waveform', () => ({
  ClipWaveform: ({
    pixelsPerSecond,
    liveTimelineZoom,
  }: {
    pixelsPerSecond: number
    liveTimelineZoom?: boolean
  }) => (
    <div
      data-testid="clip-waveform"
      data-pps={String(pixelsPerSecond)}
      data-live-timeline-zoom={String(!!liveTimelineZoom)}
    />
  ),
}))

vi.mock('../clip-waveform/compound-clip-waveform', () => ({
  CompoundClipWaveform: ({ pixelsPerSecond }: { pixelsPerSecond: number }) => (
    <div data-testid="compound-clip-waveform" data-pps={String(pixelsPerSecond)} />
  ),
}))

describe('ClipContent', () => {
  beforeEach(() => {
    useTimelineStore.setState({ fps: 30 })
    _resetZoomStoreForTest()
    useZoomStore.setState({
      level: 1,
      pixelsPerSecond: 100,
      contentLevel: 1,
      contentPixelsPerSecond: 100,
      isZoomInteracting: false,
    })
    useSettingsStore.setState({
      showFilmstrips: false,
      enableFilmstripExtraction: false,
      showWaveforms: false,
    })
    useMediaLibraryStore.setState({
      mediaItems: [],
      mediaById: {},
      brokenMediaIds: [],
      selectedMediaIds: [],
      notification: null,
    })
    useItemsStore.getState().setItems([])
    useCompositionsStore.getState().setCompositions([])
    useSequencesStore.getState().reset()
  })

  it('renders the linked delta badge before the clip title text', () => {
    const item: TimelineItem = {
      id: 'video-1',
      type: 'video',
      trackId: 'track-1',
      from: 0,
      durationInFrames: 60,
      label: 'Clip title',
      mediaId: 'media-1',
      src: 'blob:test',
    } as TimelineItem

    render(
      <ClipContent
        item={item}
        clipLeftFrames={0}
        clipWidthFrames={96}
        fps={30}
        isLinked={true}
        linkedSyncOffsetFrames={-283}
      />,
    )

    expect(screen.getByText('-09:13')).toBeInTheDocument()
    expect(screen.getByTitle('Linked audio/video pair out of sync by -09:13')).toBeInTheDocument()
    expect(screen.getByText('Clip title')).toBeInTheDocument()
  })

  it('renders the linked icon before the title when clips are still in sync', () => {
    const item: TimelineItem = {
      id: 'video-1',
      type: 'video',
      trackId: 'track-1',
      from: 0,
      durationInFrames: 60,
      label: 'Linked clip',
      mediaId: 'media-1',
      src: 'blob:test',
    } as TimelineItem

    render(
      <ClipContent item={item} clipLeftFrames={0} clipWidthFrames={96} fps={30} isLinked={true} />,
    )

    expect(screen.getByTitle('Linked audio/video pair')).toBeInTheDocument()
    expect(screen.getByText('Linked clip')).toBeInTheDocument()
  })

  it('labels Motion assets as compositions instead of compound clips', () => {
    useCompositionsStore.getState().addComposition({
      id: 'motion-composition',
      name: 'Lower Third',
      editorKind: 'composite-2d',
      tracks: [],
      items: [],
      transitions: [],
      keyframes: [],
      fps: 30,
      width: 1920,
      height: 1080,
      durationInFrames: 90,
    })
    const item: TimelineItem = {
      id: 'motion-wrapper',
      type: 'composition',
      trackId: 'track-1',
      from: 0,
      durationInFrames: 90,
      label: 'Lower Third',
      compositionId: 'motion-composition',
      compositionWidth: 1920,
      compositionHeight: 1080,
      transform: { x: 0, y: 0, rotation: 0, opacity: 1 },
    }

    render(<ClipContent item={item} clipLeftFrames={0} clipWidthFrames={96} fps={30} />)

    expect(screen.getByText('Composition')).toBeInTheDocument()
    expect(screen.queryByText('Compound')).not.toBeInTheDocument()
    expect(screen.getByText('Lower Third')).toBeInTheDocument()
  })

  it('uses settled zoom for filmstrip content by default', async () => {
    // Not interacting: content renders (mid-gesture deferral is covered by its
    // own test below). pixelsPerSecond (180) and contentPixelsPerSecond (100)
    // are set apart purely to verify which one the filmstrip reads.
    useZoomStore.setState({
      level: 1.8,
      pixelsPerSecond: 180,
      contentLevel: 1,
      contentPixelsPerSecond: 100,
      isZoomInteracting: false,
    })
    useSettingsStore.setState({
      showFilmstrips: true,
      enableFilmstripExtraction: true,
      showWaveforms: false,
    })

    const item: TimelineItem = {
      id: 'video-1',
      type: 'video',
      trackId: 'track-1',
      from: 0,
      durationInFrames: 60,
      label: 'Video clip',
      mediaId: 'media-1',
      src: 'blob:test',
    } as TimelineItem

    render(<ClipContent item={item} clipLeftFrames={0} clipWidthFrames={96} fps={30} />)

    // Default (no preferImmediateRendering): filmstrip tracks the SETTLED zoom
    // (contentPixelsPerSecond = 100), not the live in-gesture pps (180). This is
    // what keeps the filmstrip tile grid from re-rendering on every zoom frame.
    expect(await screen.findByTestId('clip-filmstrip')).toHaveAttribute('data-pps', '100')
  })

  it('can opt clip internals into live zoom for immediate edit previews', async () => {
    useZoomStore.setState({
      level: 1.8,
      pixelsPerSecond: 180,
      contentLevel: 1,
      contentPixelsPerSecond: 100,
      isZoomInteracting: false,
    })
    useSettingsStore.setState({
      showFilmstrips: false,
      showWaveforms: true,
    })

    const item: TimelineItem = {
      id: 'audio-1',
      type: 'audio',
      trackId: 'track-1',
      from: 0,
      durationInFrames: 60,
      label: 'Audio clip',
      mediaId: 'media-1',
      src: 'blob:test',
    } as TimelineItem

    render(
      <ClipContent
        item={item}
        clipLeftFrames={0}
        clipWidthFrames={96}
        fps={30}
        preferImmediateRendering={true}
      />,
    )

    expect(await screen.findByTestId('clip-waveform')).toHaveAttribute('data-pps', '180')
  })

  it('mounts the bounded filmstrip for clips that appear during an active zoom gesture', async () => {
    useZoomStore.setState({
      level: 1,
      pixelsPerSecond: 100,
      contentLevel: 1,
      contentPixelsPerSecond: 100,
      isZoomInteracting: true,
    })
    useSettingsStore.setState({
      showFilmstrips: true,
      enableFilmstripExtraction: true,
      showWaveforms: false,
    })

    const item: TimelineItem = {
      id: 'video-defer',
      type: 'video',
      trackId: 'track-1',
      from: 0,
      durationInFrames: 60,
      label: 'Video clip',
      mediaId: 'media-1',
      src: 'blob:test',
    } as TimelineItem

    render(<ClipContent item={item} clipLeftFrames={0} clipWidthFrames={96} fps={30} />)

    expect(await screen.findByTestId('clip-filmstrip')).toBeInTheDocument()
    expect(screen.getByText('Video clip')).toBeInTheDocument()
  })

  it('mounts the bounded waveform for clips that appear during an active zoom gesture', async () => {
    useZoomStore.setState({
      level: 1,
      pixelsPerSecond: 100,
      contentLevel: 1,
      contentPixelsPerSecond: 100,
      isZoomInteracting: true,
    })
    useSettingsStore.setState({
      showFilmstrips: false,
      enableFilmstripExtraction: false,
      showWaveforms: true,
    })

    const item: TimelineItem = {
      id: 'audio-during-zoom',
      type: 'audio',
      trackId: 'track-1',
      from: 0,
      durationInFrames: 60,
      label: 'Audio clip',
      mediaId: 'media-1',
      src: 'blob:test',
    } as TimelineItem

    render(<ClipContent item={item} clipLeftFrames={0} clipWidthFrames={96} fps={30} />)

    expect(await screen.findByTestId('clip-waveform')).toBeInTheDocument()
    expect(screen.getByTestId('clip-waveform')).toHaveAttribute(
      'data-live-timeline-zoom',
      'true',
    )
    expect(screen.getByText('Audio clip')).toBeInTheDocument()
  })

  it('mounts a waveform when live zoom crosses the visual-width threshold', async () => {
    useZoomStore.setState({
      level: 1.8,
      pixelsPerSecond: 180,
      contentLevel: 1,
      contentPixelsPerSecond: 100,
      isZoomInteracting: true,
    })
    useSettingsStore.setState({
      showFilmstrips: false,
      enableFilmstripExtraction: false,
      showWaveforms: true,
    })
    const item: TimelineItem = {
      id: 'short-audio-during-zoom',
      type: 'audio',
      trackId: 'track-1',
      from: 0,
      durationInFrames: 1,
      label: 'Short audio clip',
      mediaId: 'media-1',
      src: 'blob:test',
    } as TimelineItem

    render(<ClipContent item={item} clipLeftFrames={0} clipWidthFrames={1} fps={30} />)

    expect(await screen.findByTestId('clip-waveform')).toBeInTheDocument()
  })
})
