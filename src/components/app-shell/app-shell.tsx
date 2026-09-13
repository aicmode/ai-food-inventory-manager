"use client";

import {
  Boxes,
  CalendarClock,
  ClipboardCheck,
  History,
  LayoutDashboard,
  MapPin,
  Menu,
  Package,
  PackageMinus,
  PackagePlus,
  Settings,
  ShoppingCart,
  Sparkles,
  Trash2,
  Truck,
  X,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { isDemoMode } from "@/lib/app-mode";

type NavItem = { href: string; label: string; icon: LucideIcon };
type NavGroup = { label: string; items: NavItem[] };

const NAV: NavGroup[] = [
  {
    label: "概要",
    items: [
      { href: "/dashboard", label: "ダッシュボード", icon: LayoutDashboard },
      { href: "/ai-orders", label: "AI発注提案", icon: Sparkles },
    ],
  },
  {
    label: "在庫",
    items: [
      { href: "/inventory", label: "在庫一覧", icon: Boxes },
      { href: "/inventory/lots", label: "ロット・賞味期限", icon: CalendarClock },
      { href: "/inventory/transactions", label: "入出庫履歴", icon: History },
    ],
  },
  {
    label: "業務",
    items: [
      { href: "/receipts", label: "入庫", icon: PackagePlus },
      { href: "/issues", label: "出庫・移動", icon: PackageMinus },
      { href: "/stocktakes", label: "棚卸", icon: ClipboardCheck },
      { href: "/waste", label: "廃棄", icon: Trash2 },
    ],
  },
  {
    label: "購買",
    items: [
      { href: "/purchase-orders", label: "発注", icon: ShoppingCart },
      { href: "/suppliers", label: "仕入先", icon: Truck },
    ],
  },
  {
    label: "マスタ・設定",
    items: [
      { href: "/products", label: "商品", icon: Package },
      { href: "/locations", label: "拠点", icon: MapPin },
      { href: "/settings", label: "設定", icon: Settings },
    ],
  },
];

const ALL_HREFS = NAV.flatMap((group) => group.items.map((item) => item.href));

function activeHref(pathname: string): string | null {
  const matches = ALL_HREFS.filter((href) => pathname === href || pathname.startsWith(`${href}/`));
  return matches.sort((a, b) => b.length - a.length)[0] ?? null;
}

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const current = activeHref(pathname);
  return (
    <nav aria-label="メインメニュー" className="space-y-5">
      {NAV.map((group) => (
        <div key={group.label}>
          <p className="px-3 text-[11px] font-semibold tracking-wide text-slate-500">{group.label}</p>
          <ul className="mt-1 space-y-0.5">
            {group.items.map((item) => {
              const active = item.href === current;
              const Icon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? "page" : undefined}
                    className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm ${
                      active ? "bg-emerald-50 font-semibold text-emerald-900" : "text-slate-700 hover:bg-slate-100"
                    }`}
                  >
                    <Icon className={`size-4 ${active ? "text-emerald-700" : "text-slate-500"}`} aria-hidden="true" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function Brand() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2 px-3">
      <span className="flex size-8 items-center justify-center rounded-lg bg-emerald-700 text-white">
        <Boxes className="size-4" aria-hidden="true" />
      </span>
      <span className="text-sm leading-tight font-semibold text-slate-900">
        AI食品在庫
        <br />
        発注管理
      </span>
    </Link>
  );
}

export function AppShell({ header, children }: { header: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  const [lastPath, setLastPath] = useState(pathname);

  // ページ遷移したらモバイルメニューを閉じる
  if (lastPath !== pathname) {
    setLastPath(pathname);
    if (open) setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <div className="min-h-screen">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:shadow"
      >
        本文へスキップ
      </a>

      {/* デスクトップ: 固定サイドバー */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="flex h-14 items-center border-b border-slate-100">
          <Brand />
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-4">
          <NavLinks />
        </div>
      </aside>

      {/* モバイル: ドロワー */}
      {open ? (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="メニュー">
          <button type="button" className="absolute inset-0 bg-slate-900/40" aria-label="メニューを閉じる" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col bg-white shadow-xl">
            <div className="flex h-14 items-center justify-between border-b border-slate-100 pr-2">
              <Brand />
              <button
                ref={closeRef}
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-md p-2 text-slate-600 hover:bg-slate-100"
                aria-label="メニューを閉じる"
              >
                <X className="size-5" aria-hidden="true" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-2 py-4">
              <NavLinks onNavigate={() => setOpen(false)} />
            </div>
          </div>
        </div>
      ) : null}

      <div className="lg:pl-60">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-slate-200 bg-white/95 px-3 backdrop-blur sm:px-6">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded-md p-2 text-slate-700 hover:bg-slate-100 lg:hidden"
            aria-label="メニューを開く"
            aria-expanded={open}
          >
            <Menu className="size-5" aria-hidden="true" />
          </button>
          {header}
          {isDemoMode() ? (
            <span className="shrink-0 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-800">
              販売デモ
            </span>
          ) : null}
        </header>
        <main id="main" className="mx-auto w-full max-w-[1400px] px-3 py-6 sm:px-6">
          {children}
        </main>
      </div>
    </div>
  );
}
