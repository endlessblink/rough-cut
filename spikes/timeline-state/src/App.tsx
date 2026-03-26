import React, { useState } from 'react';
import { TimelineNaive } from './architectures/a-naive/Timeline';
import { TimelineSplit } from './architectures/b-split/Timeline';
import { TimelineRef } from './architectures/c-ref/Timeline';
import { StatsPanel } from './components/StatsPanel';

type Architecture = 'A-naive' | 'B-split' | 'C-ref' | 'D-signals';

export function App() {
  const [arch, setArch] = useState<Architecture>('A-naive');
  const [clipCount, setClipCount] = useState(100);

  return (
    <div style={{ padding: 16 }}>
      <h1 style={{ fontSize: 18, margin: '0 0 16px' }}>
        Spike 3: Timeline State Performance
      </h1>

      <div style={{ display: 'flex', gap: 16, marginBottom: 16, alignItems: 'center' }}>
        <label>
          Architecture:
          <select
            value={arch}
            onChange={e => setArch(e.target.value as Architecture)}
            style={{ marginLeft: 8, padding: '4px 8px' }}
          >
            <option value="A-naive">A — Single Naive Store</option>
            <option value="B-split">B — Split Stores</option>
            <option value="C-ref">C — Ref-Based Playhead</option>
            <option value="D-signals">D — Signals (TODO)</option>
          </select>
        </label>

        <label>
          Clips:
          <select
            value={clipCount}
            onChange={e => setClipCount(Number(e.target.value))}
            style={{ marginLeft: 8, padding: '4px 8px' }}
          >
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={500}>500</option>
            <option value={1000}>1000</option>
          </select>
        </label>
      </div>

      <StatsPanel />

      {arch === 'A-naive' && <TimelineNaive clipCount={clipCount} />}
      {arch === 'B-split' && <TimelineSplit clipCount={clipCount} />}
      {arch === 'C-ref' && <TimelineRef clipCount={clipCount} />}
      {arch === 'D-signals' && <div>TODO: Signals architecture</div>}
    </div>
  );
}
