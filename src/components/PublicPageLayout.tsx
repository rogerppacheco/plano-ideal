import type { ReactNode } from "react";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";

interface PublicPageLayoutProps {
  children: ReactNode;
  heading: string;
  intro?: string;
}

export function PublicPageLayout({ children, heading, intro }: PublicPageLayoutProps) {
  return (
    <div className="flex min-h-[100dvh] flex-col bg-pi-dark text-white">
      <SiteHeader variant="page" />
      <main className="flex-1">
        <section className="mx-auto max-w-3xl px-4 py-12 md:px-8 md:py-16">
          <h1 className="text-3xl font-black tracking-tight md:text-5xl">{heading}</h1>
          {intro ? <p className="mt-4 text-base leading-relaxed text-white/70">{intro}</p> : null}
          <div className="mt-10 space-y-8">{children}</div>
        </section>
      </main>
      <SiteFooter showNav showInternalAccess />
    </div>
  );
}

export function LegalSection({
  heading,
  children,
}: {
  heading: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h2 className="text-lg font-bold text-white md:text-xl">{heading}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-white/70 md:text-base">
        {children}
      </div>
    </section>
  );
}
