import { useCallback, useRef, useState } from 'react';
import type { Clip } from '../types';
import { HISTORY_LIMIT } from '../constants';

/**
 * Tracks `clips` with undo/redo. Drag/slider gestures use `setLive` on every
 * intermediate frame (no history entry) and commit exactly once at gesture
 * end via `commitBaseline`, so one drag = one undo step. Discrete actions
 * (split, delete, duplicate, import, new project) use `commit` directly.
 */
export function useClipsHistory(initial: Clip[]) {
  const [clips, setClipsState] = useState<Clip[]>(initial);
  const [past, setPast] = useState<Clip[][]>([]);
  const [future, setFuture] = useState<Clip[][]>([]);
  const clipsRef = useRef(clips);
  clipsRef.current = clips;

  const setLive = useCallback((updater: (prev: Clip[]) => Clip[]) => {
    setClipsState(updater);
  }, []);

  const commit = useCallback((updater: (prev: Clip[]) => Clip[]) => {
    setClipsState((prev) => {
      const next = updater(prev);
      if (next === prev) return prev;
      setPast((p) => [...p, prev].slice(-HISTORY_LIMIT));
      setFuture([]);
      return next;
    });
  }, []);

  const commitBaseline = useCallback((baseline: Clip[]) => {
    setClipsState((current) => {
      if (current === baseline) return current;
      setPast((p) => [...p, baseline].slice(-HISTORY_LIMIT));
      setFuture([]);
      return current;
    });
  }, []);

  const undo = useCallback(() => {
    setPast((p) => {
      if (p.length === 0) return p;
      const previous = p[p.length - 1];
      setFuture((f) => [clipsRef.current, ...f]);
      setClipsState(previous);
      return p.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setFuture((f) => {
      if (f.length === 0) return f;
      const next = f[0];
      setPast((p) => [...p, clipsRef.current]);
      setClipsState(next);
      return f.slice(1);
    });
  }, []);

  const replace = useCallback((next: Clip[]) => {
    setClipsState(next);
    setPast([]);
    setFuture([]);
  }, []);

  return {
    clips,
    clipsRef,
    setLive,
    commit,
    commitBaseline,
    undo,
    redo,
    canUndo: past.length > 0,
    canRedo: future.length > 0,
    replace,
  };
}
