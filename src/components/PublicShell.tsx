import Link from "next/link";

/** The frame for pages a visitor sees before they have an account. */
export function PublicShell({
  title,
  subtitle,
  wide = false,
  children,
}: {
  title: string;
  subtitle?: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[var(--ark-bg)] px-4 py-10">
      <div className={`mx-auto ${wide ? "max-w-5xl" : "max-w-md"}`}>
        <Link href="/login" className="mb-8 inline-block text-lg font-bold tracking-tight">
          ARKQUEN
        </Link>
        <h1 className="text-2xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}
