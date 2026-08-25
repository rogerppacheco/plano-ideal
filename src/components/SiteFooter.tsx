import { Link } from "react-router-dom";
import {
  COMPANY_FOOTER_LINES,
  PUBLIC_NAV,
  SITE_NAME,
} from "../content/company";

interface SiteFooterProps {
  showNav?: boolean;
  showInternalAccess?: boolean;
  compact?: boolean;
}

export function SiteFooter({
  showNav = true,
  showInternalAccess = false,
  compact = false,
}: SiteFooterProps) {
  return (
    <footer className="border-t border-white/5 bg-pi-darker">
      <div
        className={`mx-auto flex max-w-6xl flex-col gap-5 px-4 text-white/45 md:px-8 ${
          compact ? "py-5" : "py-8"
        }`}
      >
        {showNav ? (
          <nav
            className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm md:justify-start"
            aria-label="Institucional"
          >
            {PUBLIC_NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="text-white/55 transition hover:text-white"
              >
                {item.label}
              </Link>
            ))}
          </nav>
        ) : null}

        <div className="flex flex-col items-center justify-between gap-4 text-center md:flex-row md:items-end md:text-left">
          <div className={`max-w-3xl space-y-1.5 ${compact ? "text-[11px] leading-relaxed" : "text-xs leading-relaxed sm:text-sm"}`}>
            {COMPANY_FOOTER_LINES.map((line) => (
              <p key={line}>{line}</p>
            ))}
            <p className="pt-1 text-white/30">
              © {new Date().getFullYear()} {SITE_NAME}. {compact ? "" : "Todos os direitos reservados."}
            </p>
          </div>

          {showInternalAccess ? (
            <Link
              to="/interno"
              className="rounded-full px-3 py-1 text-xs text-white/30 transition hover:bg-white/5 hover:text-white/60"
              aria-label="Acesso interno para equipe"
            >
              Acesso interno
            </Link>
          ) : null}
        </div>
      </div>
    </footer>
  );
}
