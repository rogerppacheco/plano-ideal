import { renderToString } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import type { ReactElement } from "react";
import { describe, expect, it } from "vitest";
import { SiteFooter } from "./SiteFooter";
import ContatoPage from "../pages/ContatoPage";
import PrivacidadePage from "../pages/PrivacidadePage";
import SobrePage from "../pages/SobrePage";
import TermosPage from "../pages/TermosPage";
import { COMPANY_CNPJ, COMPANY_DISCLAIMER, COMPANY_LEGAL_NAME } from "../content/company";

function renderPage(ui: ReactElement) {
  return renderToString(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("páginas públicas institucionais", () => {
  it("coloca razão social, CNPJ e aviso de agenciamento no rodapé", () => {
    const html = renderPage(<SiteFooter showNav showInternalAccess />);
    expect(html).toContain(COMPANY_LEGAL_NAME);
    expect(html).toContain(COMPANY_CNPJ);
    expect(html).toContain(COMPANY_DISCLAIMER);
    expect(html).toContain("/sobre");
    expect(html).toContain("/privacidade");
  });

  it("renderiza Sobre, Contato, Termos e Privacidade com o aviso de que não somos operadora", () => {
    const pages = [
      renderPage(<SobrePage />),
      renderPage(<ContatoPage />),
      renderPage(<TermosPage />),
      renderPage(<PrivacidadePage />),
    ];
    for (const html of pages) {
      expect(html).toContain(COMPANY_CNPJ);
      expect(html).toMatch(/Não somos operadora/);
      expect(html).toContain("Fala Soluções");
    }
  });
});
