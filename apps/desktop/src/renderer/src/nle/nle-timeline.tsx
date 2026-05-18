import { NLE_TRACK_LANES } from './asset-format.mjs';

export function NleTimeline() {
  return (
    <div className="nleTimeline" data-ui-region="nle-timeline">
      {NLE_TRACK_LANES.map((lane) => (
        <div
          key={lane.kind}
          className="nleTrackLane"
          data-track-kind={lane.kind}
        >
          <div className="nleTrackLaneHeader">{lane.label}</div>
          <div className="nleTrackLaneBody">
            <span className="nleTrackLaneEmpty">No clips yet</span>
          </div>
        </div>
      ))}
    </div>
  );
}
