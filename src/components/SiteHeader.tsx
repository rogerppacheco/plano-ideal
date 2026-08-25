import { Link } from "react-router-dom";
import { SITE_NAME } from "../content/company";

interface SiteHeaderProps {
  variant?: "landing" | "page";
}

export function SiteHeader({ variant = "page" }: SiteHeaderProps) {
  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-pi-dark/80 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 md:px-8">
        <Link to="/" className="flex items-center gap-3" aria-label={`${SITE_NAME} — página inicial`}>
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-neon-green text-sm font-black text-pi-dark">
            FA
          </div>
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-neon-green">
              {SITE_NAME}
            </p>
            <p className="text-lg font-extrabold tracking-tight md:text-xl">Internet Fibra</p>
          </div>
        </Link>

        <nav className="flex items-center gap-2 sm:gap-3" aria-label="Principal">
          <Link
            to="/sobre"
            className="hidden rounded-full px-3 py-2 text-sm font-semibold text-white/70 transition hover:bg-white/5 hover:text-white md:inline-flex"
          >
            Sobre
          </Link>
          <Link
            to="/contato"
            className="hidden rounded-full px-3 py-2 text-sm font-semibold text-white/70 transition hover:bg-white/5 hover:text-white sm:inline-flex"
          >
            Contato
          </Link>
          {variant === "landing" ? (
            <a
              href="#planos"
              className="rounded-full bg-neon-green px-5 py-2.5 text-sm font-extrabold text-pi-dark shadow-neon-glow transition hover:scale-105"
              aria-label="Ver planos de internet disponíveis"
            >
              Ver planos
            </a>
          ) : (
            <Link
              to="/#planos"
              className="rounded-full bg-neon-green px-5 py-2.5 text-sm font-extrabold text-pi-dark shadow-neon-glow transition hover:scale-105"
            >
              Ver planos
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
