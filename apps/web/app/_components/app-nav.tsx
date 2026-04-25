import Link from "next/link";

const NAV_ITEMS = [
  { href: "/connect", label: "Setup" },
  { href: "/", label: "Dashboard" },
  { href: "/devices", label: "Devices" },
  { href: "/profile", label: "Profile" },
  { href: "/firmware", label: "Firmware" },
] as const;

type AppNavProps = {
  currentPath?: string;
  extraLinks?: Array<{
    href: string;
    label: string;
  }>;
};

export default function AppNav({ currentPath, extraLinks = [] }: AppNavProps) {
  const items = [
    ...NAV_ITEMS,
    ...extraLinks.filter(
      (extraLink) => !NAV_ITEMS.some((item) => item.href === extraLink.href),
    ),
  ];

  return (
    <nav className="flex flex-wrap items-center gap-5 sm:gap-6">
      {items.map((item) => {
        const isActive = currentPath === item.href;

        return (
          <Link
            key={`${item.href}-${item.label}`}
            className={`relative inline-flex items-center justify-center pb-2 text-[0.9rem] font-semibold tracking-[0.02em] transition ${
              isActive
                ? "text-cyan-300"
                : "text-slate-200 hover:text-white"
            }`}
            href={item.href}
          >
            {item.label}
            <span
              className={`absolute inset-x-0 bottom-0 h-0.5 rounded-full transition ${
                isActive ? "bg-cyan-400" : "bg-transparent"
              }`}
            />
          </Link>
        );
      })}
    </nav>
  );
}
