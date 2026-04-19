/**
 * useCursorEvents — shared loader for cursor NDJSON sidecars.
 *
 * Reads the sidecar once per path via IPC, parses to the raw CursorEvent[]
 * form, and caches in a module-level Map so multiple consumers (playback
 * overlay, auto-zoom generator) share the same parsed data.
 */
import { useEffect, useState } from 'react';
import type { CursorEvent, CursorEventType, MouseButton } from '@rough-cut/project-model';
import { parseNdjsonCursorEvents } from '../components/cursor-data-loader.js';

interface CaptureDisplayBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  scaleFactor: number;
}

/** Promise-based cache keyed by sidecar path. Hits survive remounts. */
const cache = new Map<string, Promise<readonly CursorEvent[]>>();

let displayBoundsPromise: Promise<readonly CaptureDisplayBounds[]> | null = null;

function getDisplayBounds(): Promise<readonly CaptureDisplayBounds[]> {
  if (!displayBoundsPromise) {
    displayBoundsPromise = window.roughcut.recordingGetDisplayBounds().catch((err) => {
      console.warn('[useCursorEvents] Failed to load display bounds:', err);
      return [];
    });
  }
  return displayBoundsPromise;
}

function scoreInBounds(
  events: readonly CursorEvent[],
  width: number,
  height: number,
  offsetX: number,
  offsetY: number,
): number {
  let count = 0;
  for (const event of events) {
    const x = event.x - offsetX;
    const y = event.y - offsetY;
    if (x >= 0 && x <= width && y >= 0 && y <= height) count += 1;
  }
  return count;
}

function normalizeCursorEvents(
  events: readonly CursorEvent[],
  width: number,
  height: number,
  displays: readonly CaptureDisplayBounds[],
): readonly CursorEvent[] {
  if (events.length === 0 || width <= 0 || height <= 0) return events;

  const localScore = scoreInBounds(events, width, height, 0, 0);
  if (localScore === events.length) return events;

  let bestOffsetX = 0;
  let bestOffsetY = 0;
  let bestScore = localScore;

  for (const display of displays) {
    if (Math.abs(display.width - width) > 2 || Math.abs(display.height - height) > 2) continue;
    const score = scoreInBounds(events, width, height, display.x, display.y);
    if (score > bestScore) {
      bestScore = score;
      bestOffsetX = display.x;
      bestOffsetY = display.y;
    }
  }

  if (bestScore === localScore) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const event of events) {
      if (event.x < minX) minX = event.x;
      if (event.y < minY) minY = event.y;
      if (event.x > maxX) maxX = event.x;
      if (event.y > maxY) maxY = event.y;
    }

    const rangeXStart = Math.max(0, maxX - width);
    const rangeXEnd = Math.max(0, minX);
    const rangeYStart = Math.max(0, maxY - height);
    const rangeYEnd = Math.max(0, minY);
    if (rangeXStart <= rangeXEnd && rangeYStart <= rangeYEnd) {
      const guessedOffsetX = Math.round((rangeXStart + rangeXEnd) / 2);
      const guessedOffsetY = Math.round((rangeYStart + rangeYEnd) / 2);
      const guessedScore = scoreInBounds(events, width, height, guessedOffsetX, guessedOffsetY);
      if (guessedScore > bestScore) {
        bestScore = guessedScore;
        bestOffsetX = guessedOffsetX;
        bestOffsetY = guessedOffsetY;
      }
    }
  }

  if (bestScore <= localScore || bestScore < Math.ceil(events.length * 0.8)) return events;

  return events.map((event) => ({
    ...event,
    x: event.x - bestOffsetX,
    y: event.y - bestOffsetY,
  }));
}

function loadEvents(path: string, width: number, height: number): Promise<readonly CursorEvent[]> {
  const cacheKey = `${path}:${width}x${height}`;
  const existing = cache.get(cacheKey);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const [displays, ndjson] = await Promise.all([
        getDisplayBounds(),
        (window as { roughcut: { readTextFile: (p: string) => Promise<string | null> } }).roughcut.readTextFile(path),
      ]);
      if (!ndjson) return [];
      const raw = parseNdjsonCursorEvents(ndjson);
      const events = raw.map<CursorEvent>((e) => ({
        frame: e.frame,
        x: e.x,
        y: e.y,
        type: e.type as CursorEventType,
        button: (e.button as MouseButton) ?? 0,
      }));
      return normalizeCursorEvents(events, width, height, displays);
    } catch (err) {
      console.warn('[useCursorEvents] Failed to load', path, err);
      return [];
    }
  })();

  cache.set(cacheKey, promise);
  return promise;
}

/**
 * Load parsed cursor events for the given sidecar path.
 * Returns `null` while loading or if the path is falsy.
 */
export function useCursorEvents(
  path: string | null | undefined,
  width: number,
  height: number,
): readonly CursorEvent[] | null {
  const [events, setEvents] = useState<readonly CursorEvent[] | null>(null);

  useEffect(() => {
    if (!path) {
      setEvents(null);
      return;
    }

    let cancelled = false;
    loadEvents(path, width, height).then((result) => {
      if (!cancelled) setEvents(result);
    });

    return () => {
      cancelled = true;
    };
  }, [height, path, width]);

  return events;
}
