import { describe, expect, it } from "vitest";
import {
  COMPANY_ADDRESS,
  COMPANY_CNPJ,
  COMPANY_DISCLAIMER,
  COMPANY_FOOTER_LINES,
  COMPANY_LEGAL_NAME,
  SITE_NAME,
  SITE_URL,
} from "./company";
import { LEGAL_PAGES } from "./legalPages";
import { PRERENDER_PAGES } from "./prerenderPages.js";

describe("identidade pública Fibra Aqui", () => {
  it("usa o domínio certo e os dados da Fala Soluções", () => {
    expect(SITE_NAME).toBe("Fibra Aqui");
    expect(SITE_URL).toBe("https://www.fibraaqui.com.br");
    expect(COMPANY_LEGAL_NAME).toBe("FALA SOLUÇÕES EM TECNOLOGIA LTDA");
    expect(COMPANY_CNPJ).toBe("41.070.660/0001-26");
    expect(COMPANY_ADDRESS).toContain("Guajajaras");
    expect(COMPANY_DISCLAIMER).toMatch(/Não somos operadora de telecomunicações/);
    expect(COMPANY_FOOTER_LINES).toHaveLength(3);
  });

  it("entrega HTML estático com CNPJ, aviso de agenciamento e páginas legais", () => {
    expect(LEGAL_PAGES.map((page) => page.path)).toEqual([
      "/sobre",
      "/contato",
      "/termos",
      "/privacidade",
    ]);
    for (const page of PRERENDER_PAGES) {
      expect(page.body).not.toMatch(/planoideal\.com/i);
      expect(page.body).toContain(COMPANY_CNPJ);
      expect(page.body).toMatch(/Não somos operadora/);
      expect(page.body).toContain("/sobre");
    }
  });
});
