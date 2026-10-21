import { useCallback, useEffect, useRef, useState } from "react";
import { call } from "../client/net.js";

// ONE GET PER path; path null WAITS. reload REFETCHES WITHOUT CLEARING WHAT IS ON SCREEN; A 401 SIGNS THE SHELL OUT.
export function useGet(path, onSignedOut, pick = (d) => d) {
  const [state, setState] = useState({ data: null, loading: !!path, error: false });
  const signedOut = useRef(onSignedOut);
  const picker = useRef(pick);
  useEffect(() => { signedOut.current = onSignedOut; picker.current = pick; });

  const load = useCallback(async () => {
    if (!path) return null;
    const res = await call(path, undefined, () => signedOut.current && signedOut.current());
    const data = res.ok ? picker.current(res.data) : null;
    if (data !== null && data !== undefined) setState({ data, loading: false, error: false });
    else setState((s) => ({ ...s, loading: false, error: res.status !== 401 }));
    return data;
  }, [path]);

  useEffect(() => {
    setState({ data: null, loading: !!path, error: false });
    load();
  }, [path, load]);

  return { ...state, reload: load };
}

export const pickArray = (d) => (Array.isArray(d) ? d : null);
