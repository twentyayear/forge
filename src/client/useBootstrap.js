import { useCallback, useEffect, useRef, useState } from "react";
import { call } from "./net.js";

// ONE GET /api/bootstrap ON MOUNT; refetch REPLACES data IN PLACE WITHOUT FLASHING THE LOADING STATE.
export function useBootstrap(session, onSignedOut) {
  const [state, setState] = useState({ data: null, loading: true, error: null });
  const signedOut = useRef(onSignedOut);
  useEffect(() => { signedOut.current = onSignedOut; });

  const load = useCallback(async () => {
    const res = await call("/api/bootstrap", undefined, () => signedOut.current && signedOut.current());
    if (res.ok && res.data) {
      setState({ data: res.data, loading: false, error: null });
      return true;
    }
    setState((s) => ({
      ...s, loading: false,
      error: res.status === 401 ? null : "Couldn't load your data. Check your connection and try again.",
    }));
    return false;
  }, []);

  useEffect(() => { load(); }, [session?.id, load]);
  return { ...state, refetch: load };
}
