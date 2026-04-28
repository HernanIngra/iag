"use client";

import dynamic from "next/dynamic";

const CargaApp = dynamic(() => import("./CargaApp"), { ssr: false });

export default function CargaPage() {
  return <CargaApp />;
}
