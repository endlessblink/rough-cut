import { describe, it, expect, beforeEach } from 'vitest';
import { createTransportStore, DEFAULT_TRANSPORT_STATE } from './transport-store.js';
import type { StoreApi } from 'zustand/vanilla';
import type { TransportStore } from './transport-store.js';

describe('transportStore', () => {
  let store: StoreApi<TransportStore>;

  beforeEach(() => {
    store = createTransportStore();
  });

  it('has correct initial state', () => {
    const state = store.getState();
    expect(state.playheadFrame).toBe(0);
    expect(state.isPlaying).toBe(false);
    expect(state.playbackRate).toBe(1);
    expect(state.loopEnabled).toBe(false);
    expect(state.loopStartFrame).toBe(0);
    expect(state.loopEndFrame).toBe(0);
  });

  it('DEFAULT_TRANSPORT_STATE matches initial store state', () => {
    const state = store.getState();
    expect(state.playheadFrame).toBe(DEFAULT_TRANSPORT_STATE.playheadFrame);
    expect(state.isPlaying).toBe(DEFAULT_TRANSPORT_STATE.isPlaying);
    expect(state.playbackRate).toBe(DEFAULT_TRANSPORT_STATE.playbackRate);
  });

  it('setPlayheadFrame updates frame', () => {
    store.getState().setPlayheadFrame(42);
    expect(store.getState().playheadFrame).toBe(42);
  });

  it('setPlayheadFrame clamps to 0', () => {
    store.getState().setPlayheadFrame(-10);
    expect(store.getState().playheadFrame).toBe(0);
  });

  it('setPlayheadFrame rounds to integer', () => {
    store.getState().setPlayheadFrame(5.7);
    expect(store.getState().playheadFrame).toBe(6);
  });

  it('play sets isPlaying = true', () => {
    store.getState().play();
    expect(store.getState().isPlaying).toBe(true);
  });

  it('pause sets isPlaying = false', () => {
    store.getState().play();
    store.getState().pause();
    expect(store.getState().isPlaying).toBe(false);
  });

  it('togglePlay flips isPlaying from false to true', () => {
    store.getState().togglePlay();
    expect(store.getState().isPlaying).toBe(true);
  });

  it('togglePlay flips isPlaying from true to false', () => {
    store.getState().play();
    store.getState().togglePlay();
    expect(store.getState().isPlaying).toBe(false);
  });

  it('seekToFrame sets frame and pauses', () => {
    store.getState().play();
    store.getState().seekToFrame(100);
    expect(store.getState().playheadFrame).toBe(100);
    expect(store.getState().isPlaying).toBe(false);
  });

  it('seekToFrame clamps to 0', () => {
    store.getState().seekToFrame(-5);
    expect(store.getState().playheadFrame).toBe(0);
  });

  it('stepForward increments by 1 by default', () => {
    store.getState().setPlayheadFrame(10);
    store.getState().stepForward();
    expect(store.getState().playheadFrame).toBe(11);
  });

  it('stepForward increments by N frames', () => {
    store.getState().setPlayheadFrame(10);
    store.getState().stepForward(5);
    expect(store.getState().playheadFrame).toBe(15);
  });

  it('stepBackward decrements by 1 by default', () => {
    store.getState().setPlayheadFrame(10);
    store.getState().stepBackward();
    expect(store.getState().playheadFrame).toBe(9);
  });

  it('stepBackward decrements by N frames', () => {
    store.getState().setPlayheadFrame(10);
    store.getState().stepBackward(3);
    expect(store.getState().playheadFrame).toBe(7);
  });

  it('stepBackward clamps at 0', () => {
    store.getState().setPlayheadFrame(2);
    store.getState().stepBackward(10);
    expect(store.getState().playheadFrame).toBe(0);
  });

  it('setPlaybackRate updates rate', () => {
    store.getState().setPlaybackRate(2);
    expect(store.getState().playbackRate).toBe(2);
  });

  it('setPlaybackRate can set fractional rates', () => {
    store.getState().setPlaybackRate(0.5);
    expect(store.getState().playbackRate).toBe(0.5);
  });

  it('setLoop enables loop with frame bounds', () => {
    store.getState().setLoop(true, 10, 100);
    const state = store.getState();
    expect(state.loopEnabled).toBe(true);
    expect(state.loopStartFrame).toBe(10);
    expect(state.loopEndFrame).toBe(100);
  });

  it('setLoop disables loop', () => {
    store.getState().setLoop(true, 10, 100);
    store.getState().setLoop(false);
    expect(store.getState().loopEnabled).toBe(false);
  });

  it('setLoop preserves existing bounds when not provided', () => {
    store.getState().setLoop(true, 10, 100);
    store.getState().setLoop(false);
    const state = store.getState();
    expect(state.loopStartFrame).toBe(10);
    expect(state.loopEndFrame).toBe(100);
  });
});
