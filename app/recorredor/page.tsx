"use client";

import dynamic from "next/dynamic";

const RecorredorApp = dynamic(() => import("./RecorredorApp"), { ssr: false });

export default function RecorredorPage() {
  return <RecorredorApp />;
}
