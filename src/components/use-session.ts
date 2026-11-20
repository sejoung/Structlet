import { useSyncExternalStore } from 'react';
import type { EditorSession, SessionSnapshot } from '../application';

export function useSession(session: EditorSession): SessionSnapshot {
  return useSyncExternalStore(session.subscribe, session.getSnapshot);
}
