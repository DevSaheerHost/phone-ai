import Link from "next/link";
import { SignOutButton } from "./SignOutButton";

const LINKS = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/calls", label: "Calls" },
  { href: "/admin/service-requests", label: "Service Requests" },
  { href: "/admin/bookings", label: "Bookings" },
  { href: "/admin/pricing", label: "Pricing" },
  { href: "/admin/config", label: "Shop Config" },
];

export function Nav() {
  return (
    <header className="surface sticky top-0 z-10 border-b">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-6">
          <span className="font-semibold">Phone AI</span>
          <nav className="flex flex-wrap gap-1">
            {LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-muted rounded-md px-3 py-1.5 text-sm transition hover:bg-black/5 hover:text-current dark:hover:bg-white/10"
              >
                {link.label}
              </Link>
            ))}
          </nav>
        </div>
        <SignOutButton />
      </div>
    </header>
  );
}
