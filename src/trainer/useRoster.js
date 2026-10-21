import { useGet } from "./useGet.js";

const pickRoster = (d) => (d && Array.isArray(d.needsYou) && Array.isArray(d.clients) ? d : null);

// GET /api/admin/roster ON MOUNT; refetch REPLACES THE DATA IN PLACE.
export function useRoster(onSignedOut) {
  const { data, loading, error, reload } = useGet("/api/admin/roster", onSignedOut, pickRoster);
  return { data, loading, error, refetch: reload };
}
