"use client";

import { createBrowserSupabaseClient } from "@/lib/supabase";
import { useEffect, useState } from "react";

/**
 * Dashboard passes cloud sync from server getUser(). Cookie-fallback girişte sunucu
 * user boş kalabilir; tarayıcıda Supabase oturumu yine de vardır — istemci tarafında
 * getSession ile kontrol ederek albüm/yapılacakları buluta yazıp diğer cihazlardan okuruz.
 */
export function useEffectiveCloudSync(serverWantsCloud: boolean): {
  effectiveCloudSync: boolean;
  clientChecked: boolean;
} {
  const [clientChecked, setClientChecked] = useState(serverWantsCloud);
  const [clientHasSession, setClientHasSession] = useState(false);

  useEffect(() => {
    if (serverWantsCloud) {
      setClientChecked(true);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const c = createBrowserSupabaseClient();
        const {
          data: { session },
        } = await c.auth.getSession();
        if (!cancelled) setClientHasSession(Boolean(session?.user));
      } catch {
        if (!cancelled) setClientHasSession(false);
      }
      if (!cancelled) setClientChecked(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [serverWantsCloud]);

  return {
    effectiveCloudSync: serverWantsCloud || clientHasSession,
    clientChecked,
  };
}
