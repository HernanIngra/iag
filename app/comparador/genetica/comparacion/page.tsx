"use client";

import dynamic from "next/dynamic";

const ComparacionApp = dynamic(() => import("./ComparacionApp"), { ssr: false });

export default function ComparacionPage() {
  return <ComparacionApp />;
}
