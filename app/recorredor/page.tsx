"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

const RecorredorApp = dynamic(() => import("./RecorredorApp"), { ssr: false });

function RecorredorPageInner() {
  const searchParams = useSearchParams();
  const asUserId = searchParams.get("as") ?? undefined;
  const asEmail = searchParams.get("email") ?? undefined;
  return <RecorredorApp asUserId={asUserId} asEmail={asEmail} />;
}

export default function RecorredorPage() {
  return (
    <Suspense>
      <RecorredorPageInner />
    </Suspense>
  );
}
