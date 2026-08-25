export const SITE_NAME = "Fibra Aqui";
export const SITE_URL = "https://www.fibraaqui.com.br";
export const SITE_DOMAIN = "www.fibraaqui.com.br";

export const COMPANY_LEGAL_NAME = "FALA SOLUÇÕES EM TECNOLOGIA LTDA";
export const COMPANY_TRADE_NAME = "Fala Soluções em Tecnologia Ltda";
export const COMPANY_CNPJ = "41.070.660/0001-26";
export const COMPANY_ADDRESS =
  "R. dos Guajajaras, 910, Sala 1201 — Centro, Belo Horizonte/MG — CEP 30.180-106";
export const COMPANY_ADDRESS_LINES = {
  street: "R. dos Guajajaras, 910, Sala 1201",
  district: "Centro",
  city: "Belo Horizonte",
  state: "MG",
  postalCode: "30.180-106",
};

export const COMPANY_DISCLAIMER =
  "Fibra Aqui é uma marca da Fala Soluções em Tecnologia Ltda, empresa de intermediação e agenciamento de planos de internet. Não somos operadora de telecomunicações.";

export const COMPANY_FOOTER_LINES = [
  `${COMPANY_LEGAL_NAME} — CNPJ ${COMPANY_CNPJ}`,
  COMPANY_ADDRESS,
  COMPANY_DISCLAIMER,
] as const;

export const PUBLIC_NAV = [
  { to: "/sobre", label: "Sobre" },
  { to: "/contato", label: "Contato" },
  { to: "/termos", label: "Termos de Uso" },
  { to: "/privacidade", label: "Política de Privacidade" },
] as const;

export function absoluteUrl(pathname = "/"): string {
  const normalized = pathname.startsWith("/") ? pathname : `/${pathname}`;
  if (normalized === "/") return `${SITE_URL}/`;
  return `${SITE_URL}${normalized}`;
}
