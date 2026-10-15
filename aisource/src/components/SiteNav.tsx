"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Clapperboard, Images, Settings2 } from "lucide-react";

const links = [
  { href: "/studio", label: "创作台", icon: Clapperboard },
  { href: "/gallery", label: "成片库", icon: Images },
  { href: "/settings", label: "接入设置", icon: Settings2 },
];

export function SiteNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--line)] bg-[rgba(238,244,245,0.82)] backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Link href="/" className="group flex items-baseline gap-2">
          <span className="brand-mark text-2xl text-ink transition-colors group-hover:text-teal">
            镜叙
          </span>
          <span className="display text-[11px] tracking-[0.28em] text-muted uppercase">
            JINGXU
          </span>
        </Link>

        <nav className="flex items-center gap-1 sm:gap-2">
          {links.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || pathname.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-1.5 rounded-md px-3 py-2 text-sm transition-colors ${
                  active
                    ? "bg-ink text-paper"
                    : "text-ink-soft hover:bg-white/70"
                }`}
              >
                <Icon size={15} />
                <span className="hidden sm:inline">{label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
