"use client";

import AppShell from "@/components/shell/AppShell";

/**
 * Legacy symbol preserved (AGENTS.md): the file name `XAgentApp.tsx` and this
 * default export must not be renamed. The single-page shell now lives in
 * AppShell (left sidebar + 5 primary areas); this stays the mount point.
 */
export default function XAgentApp() {
  return <AppShell />;
}
