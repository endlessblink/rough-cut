import { NLE_TRACK_LANES } from './asset-format.mjs';
import { buildLaneClips } from './timeline-clips.mjs';
import type { NleLaneClipBlock, NleLaneKind } from './timeline-clips.mjs';
import type { NleProject } from './types';

export function NleTimeline({ project }: { project: NleProject | null }) {
  return (
    <div className="nleTimeline" data-ui-region="nle-timeline">
      {NLE_TRACK_LANES.map((lane) => {
        const blocks: NleLaneClipBlock[] = project
          ? buildLaneClips(project, lane.kind as NleLaneKind)
          : [];
        return (
          <div
            key={lane.kind}
            className="nleTrackLane"
            data-track-kind={lane.kind}
          >
            <div className="nleTrackLaneHeader">{lane.label}</div>
            <div className="nleTrackLaneBody">
              {blocks.length === 0 ? (
                <span className="nleTrackLaneEmpty">No clips yet</span>
              ) : (
                blocks.map((block, index) => (
                  <div
                    key={block.id ?? `${lane.kind}-${index}`}
                    className={`nleClipBlock ${block.enabled ? '' : 'disabled'}`}
                    data-clip-id={block.id ?? ''}
                    data-asset-id={block.assetId ?? ''}
                    style={{ left: `${block.leftPct}%`, width: `${block.widthPct}%` }}
                    title={block.name ?? undefined}
                  >
                    <span className="nleClipBlockLabel">{block.name ?? 'Clip'}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
