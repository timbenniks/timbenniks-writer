"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";

interface AppHeaderProps {
  // Optional right-side actions (buttons, etc.)
  actions?: React.ReactNode;
  // Optional subtitle text
  subtitle?: string;
}

export default function AppHeader({ actions, subtitle }: AppHeaderProps) {
  const pathname = usePathname();

  const navItems = [
    { href: "/", label: "Articles", matches: (p: string) => p === "/" || p.startsWith("/article") },
    { href: "/videos", label: "Videos", matches: (p: string) => p.startsWith("/videos") || p.startsWith("/video") },
    { href: "/settings", label: "Settings", matches: (p: string) => p.startsWith("/settings") },
  ];

  return (
    <header className="bg-white border-b border-gray-200 px-6 py-4">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between">
          {/* Left side: Navigation */}
          <div className="flex items-center gap-8">
            {/* Logo/Brand */}
            <Link href="/" className="flex items-center gap-2 group">
              <div className="w-8 h-8 bg-gray-900 rounded-lg flex items-center justify-center group-hover:bg-gray-700 transition-colors">
                <svg
                  className="w-5 h-5 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                  />
                </svg>
              </div>
              <span className="font-semibold text-gray-900 hidden sm:inline">
                Writer
              </span>
            </Link>

            {/* Navigation Tabs */}
            <nav className="flex items-center gap-1" aria-label="Main navigation">
              {navItems.map((item) => {
                const isActive = item.matches(pathname);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={clsx(
                      "px-4 py-2 text-sm font-medium rounded-md transition-colors",
                      isActive
                        ? "bg-gray-100 text-gray-900"
                        : "text-gray-600 hover:text-gray-900 hover:bg-gray-50"
                    )}
                    aria-current={isActive ? "page" : undefined}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Right side: Actions */}
          {actions && (
            <div className="flex items-center gap-3">{actions}</div>
          )}
        </div>

        {/* Optional subtitle row */}
        {subtitle && (
          <p className="text-sm text-gray-600 mt-2">{subtitle}</p>
        )}
      </div>
    </header>
  );
}

