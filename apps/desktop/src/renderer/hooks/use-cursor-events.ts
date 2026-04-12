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

/** Promise-based cache keyed by sidecar path. Hits survive remounts. */
const cache = new Map<string, Promise<readonly CursorEvent[]>>();

function loadEvents(path: string): Promise<readonly CursorEvent[]> {
  const existing = cache.get(path);
  if (existing) return existing;

  const promise = (async () => {
    try {
      const ndjson = await (window as { roughcut: { readTextFile: (p: string) => Promise<string | null> } }).roughcut.readTextFile(path);
      if (!ndjson) return [];
      const raw = parseNdjsonCursorEvents(ndjson);
      return raw.map<CursorEvent>((e) => ({
        frame: e.frame,
        x: e.x,
        y: e.y,
        type: e.type as CursorEventType,
        button: (e.button as MouseButton) ?? 0,
      }));
    } catch (err) {
      console.warn('[useCursorEvents] Failed to load', path, err);
      return [];
    }
  })();

  cache.set(path, promise);
  return promise;
}

/**
 * Load parsed cursor events for the given sidecar path.
 * Returns `null` while loading or if the path is falsy.
 */
export function useCursorEvents(path: string | null | undefined): readonly CursorEvent[] | null {
  const [events, setEvents] = useState<readonly CursorEvent[] | null>(null);

  useEffect(() => {
    if (!path) {
      setEvents(null);
      return;
    }

    let cancelled = false;
    loadEvents(path).then((result) => {
      if (!cancelled) setEvents(result);
    });

    return () => {
      cancelled = true;
    };
  }, [path]);

  return events;
}
