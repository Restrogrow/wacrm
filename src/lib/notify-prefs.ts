// Per-browser preferences for new-message alerts. Stored in
// localStorage (a convenience, not account data); every read and write
// is guarded because storage can be blocked.

const SOUND_KEY = 'rg.notify.sound';
const PROMPT_DISMISSED_KEY = 'rg.notify.promptDismissed';

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // storage blocked: the preference just won't persist
  }
}

export function soundEnabled(): boolean {
  return read(SOUND_KEY) !== 'off';
}

export function setSoundEnabled(on: boolean): void {
  write(SOUND_KEY, on ? 'on' : 'off');
}

export function promptDismissed(): boolean {
  return read(PROMPT_DISMISSED_KEY) === '1';
}

export function dismissPrompt(): void {
  write(PROMPT_DISMISSED_KEY, '1');
}

/**
 * Should a new inbound message trigger an alert? Not when the agent is
 * already looking at that chat, and not for a chat a teammate owns.
 */
export function shouldAlert(opts: {
  conversationId: string;
  assignedTo: string | null;
  currentUserId: string;
  tabHidden: boolean;
  /** window.location.pathname + search */
  location: string;
}): boolean {
  if (opts.assignedTo && opts.assignedTo !== opts.currentUserId) return false;
  const viewingThisChat =
    !opts.tabHidden && opts.location.startsWith('/inbox') && opts.location.includes(`c=${opts.conversationId}`);
  return !viewingThisChat;
}
