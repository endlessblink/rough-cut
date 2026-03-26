import React, { useEffect, useRef, useState } from 'react';

/** Displays FPS, render count, and dropped frames */
export function StatsPanel() {
  const [fps, setFps] = useState(0);
  const frameTimesRef = useRef<number[]>([]);
  const lastTimeRef = useRef(performance.now());

  useEffect(() => {
    let rafId: number;
    const tick = () => {
      const now = performance.now();
      const dt = now - lastTimeRef.current;
      lastTimeRef.current = now;
      frameTimesRef.current.push(dt);
      if (frameTimesRef.current.length > 60) frameTimesRef.current.shift();

      const avgDt = frameTimesRef.current.reduce((s, t) => s + t, 0) / frameTimesRef.current.length;
      setFps(Math.round(1000 / avgDt));
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const dropped = frameTimesRef.current.filter(t => t > 20).length;

  return (
    <div style={{
      position: 'fixed', top: 8, right: 8, background: '#222', padding: '8px 12px',
      borderRadius: 4, fontFamily: 'monospace', fontSize: 12, zIndex: 100,
    }}>
      <div>FPS: <strong>{fps}</strong></div>
      <div>Dropped (last 60): <strong style={{ color: dropped > 0 ? '#ef4444' : '#22c55e' }}>{dropped}</strong></div>
    </div>
  );
}
