"use client";

import dynamic from "next/dynamic";

// The app runs in the browser only: it reads the browser's language, theme
// and storage before its first frame
const Studio = dynamic(() => import("@/main").then((m) => m.Studio), { ssr: false });

export default function Home() {
  return <Studio />;
}
