import type { ReactNode } from "react";

import { AppShell } from "@/components/app-shell/app-shell";
import { requireOrgContext } from "@/lib/auth/context";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const context = await requireOrgContext();

  const header = (
    <div className="flex min-w-0 flex-1 items-center">
      <p className="truncate text-sm font-semibold text-slate-900">{context.organization.name}</p>
    </div>
  );

  return <AppShell header={header}>{children}</AppShell>;
}
