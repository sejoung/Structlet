import { useEffect, useRef, useState } from 'react';
import { errorDetails, log } from '../../adapters/diagnostics/log';
import type { DriveAuth } from '../../adapters/drive/types';

export function useAuthRenewal(auth: DriveAuth | undefined, active: boolean, onFail: () => void, hint: () => string | undefined) {
  const [expiring, setExpiring] = useState(() => Boolean(auth?.expiring()));
  const [automatic, setAutomatic] = useState(true);
  const renewing = useRef(false);
  const stopped = useRef(false);
  const latest = useRef({ onFail, hint });
  latest.current = { onFail, hint };

  const renew = useRef(async (manual: boolean) => {
    if (!auth || renewing.current || !auth.expiring() || (stopped.current && !manual)) return;
    renewing.current = true;
    try {
      await auth.connect(latest.current.hint());
      log.info('drive.renewed', { manual });
    } catch (error) {
      stopped.current = true;
      setAutomatic(false);
      log.warn('drive.renew-failed', { manual, ...errorDetails(error, false) });
      if (manual) latest.current.onFail();
    } finally {
      renewing.current = false;
      setExpiring(auth.expiring());
    }
  }).current;

  useEffect(() => {
    if (!auth) return;
    return auth.subscribe((event) => {
      setExpiring(auth.expiring());
      if (event === 'expiring') return;
      stopped.current = false;
      setAutomatic(true);
    });
  }, [auth]);

  useEffect(() => {
    if (!expiring || !automatic || !active) return;
    const click = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest('[data-drive-renew]')) return;
      void renew(false);
    };
    window.addEventListener('click', click, true);
    return () => window.removeEventListener('click', click, true);
  }, [expiring, automatic, active, renew]);

  return { expiring: expiring && active, renew: () => void renew(true) };
}
