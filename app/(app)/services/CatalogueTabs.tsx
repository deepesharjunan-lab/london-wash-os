"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export const CATALOGUE = [
  { href: "/services", label: "Services" },
  { href: "/services/products", label: "Products" },
  { href: "/services/price-lists", label: "Price Lists" },
  { href: "/services/prices", label: "Add to Price List" },
];

/** Tabs across the four Catalogue sections. */
export function CatalogueTabs() {
  const path = usePathname() || "";
  return (
    <nav className="mb-6 flex flex-wrap gap-1 rounded-full border border-hair bg-white p-1" aria-label="Catalogue">
      {CATALOGUE.map((t) => {
        const active = path === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? "page" : undefined}
            className={"rounded-full px-4 py-1.5 text-[13px] font-semibold transition " + (active ? "bg-navy text-[#f8f5ef]" : "text-ink-2 hover:bg-beige")}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
