// Decides what the recording tray light does for a state change.
// 'destroy' = take is over, light must disappear; 'skip' = do nothing;
// 'show' = create/update the light.
export const TERMINAL_TRAY_STATES = ['saved', 'discarded'];

export function planTrayUpdate({ hasTray, hasWindow, state }) {
  if (TERMINAL_TRAY_STATES.includes(state)) return 'destroy';
  // Only the hidden-recorder flow passes a window and owns a tray; a take
  // driven from the visible window must not spawn one on stop/pause/cancel.
  if (!hasWindow && !hasTray) return 'skip';
  return 'show';
}
