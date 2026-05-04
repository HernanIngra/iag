"use client";

import dynamic from "next/dynamic";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase-browser";
import { getUserProfile } from "@/lib/db";

const RecorredorApp = dynamic(() => import("./RecorredorApp"), { ssr: false });

function RecorredorPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const asUserId = searchParams.get("as") ?? undefined;
  const asEmail = searchParams.get("email") ?? undefined;
  const [ready, setReady] = useState(false);
  const supabase = createSupabaseBrowserClient();

  useEffect(() => {
    async function check() {
      const { data: { user } } = await supabase.auth.getUser();
      // Visitors (no account) skip onboarding
      if (!user) { setReady(true); return; }
      const profile = await getUserProfile(supabase);
      if (profile && !profile.onboarding_done) {
        router.replace("/onboarding");
        return;
      }
      setReady(true);
    }
    check();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!ready) {
    return (
      <main className="flex-1 flex items-center justify-center" style={{ background: "#1a1a2e" }}>
        <span className="text-2xl font-bold tracking-widest" style={{ color: "#e2b04a" }}>I.Ag</span>
      </main>
    );
  }

  return <RecorredorApp asUserId={asUserId} asEmail={asEmail} />;
}

export default function RecorredorPage() {
  return (
    <Suspense>
      <RecorredorPageInner />
    </Suspense>
  );
}
