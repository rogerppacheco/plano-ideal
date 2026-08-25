/**
 * HTML estático injetado no build para crawlers (Google, Anatel, ferramentas de SEO)
 * lerem o conteúdo sem executar JavaScript.
 */
export const SITE_NAME = "Fibra Aqui";
export const SITE_URL = "https://www.fibraaqui.com.br";
export const COMPANY_LEGAL_NAME = "FALA SOLUÇÕES EM TECNOLOGIA LTDA";
export const COMPANY_TRADE_NAME = "Fala Soluções em Tecnologia Ltda";
export const COMPANY_CNPJ = "41.070.660/0001-26";
export const COMPANY_ADDRESS =
  "R. dos Guajajaras, 910, Sala 1201 — Centro, Belo Horizonte/MG — CEP 30.180-106";
export const COMPANY_DISCLAIMER =
  "Fibra Aqui é uma marca da Fala Soluções em Tecnologia Ltda, empresa de intermediação e agenciamento de planos de internet. Não somos operadora de telecomunicações.";

const NAV_LINKS = `
  <nav aria-label="Institucional">
    <a href="/">Início</a>
    <a href="/sobre">Sobre</a>
    <a href="/contato">Contato</a>
    <a href="/termos">Termos de Uso</a>
    <a href="/privacidade">Política de Privacidade</a>
  </nav>
`;

const FOOTER_HTML = `
  <footer>
    ${NAV_LINKS}
    <p>${COMPANY_LEGAL_NAME} — CNPJ ${COMPANY_CNPJ}</p>
    <p>${COMPANY_ADDRESS}</p>
    <p>${COMPANY_DISCLAIMER}</p>
  </footer>
`;

function pageShell(title, inner) {
  return `
  <div class="min-h-[100dvh] bg-pi-dark text-white">
    <header>
      <p>${SITE_NAME}</p>
      <p>Internet Fibra</p>
      ${NAV_LINKS}
    </header>
    <main>
      <h1>${title}</h1>
      ${inner}
    </main>
    ${FOOTER_HTML}
  </div>`;
}

export const HOME_CRAWLER_HTML = `
  <div class="min-h-[100dvh] bg-pi-dark text-white">
    <header>
      <p>${SITE_NAME}</p>
      <p>Internet Fibra</p>
      ${NAV_LINKS}
    </header>
    <main>
      <h1>Internet fibra que simplesmente funciona — ${SITE_NAME}</h1>
      <p>${COMPANY_DISCLAIMER}</p>
      <p>Compare planos de internet fibra óptica, consulte cobertura pelo CEP e fale com um consultor. A ${SITE_NAME} é uma marca da ${COMPANY_TRADE_NAME} e atua como agenciadora de planos, não como operadora.</p>
      <h2>Planos de internet fibra</h2>
      <article>
        <h3>Essencial 600 Mega</h3>
        <p>Roteador Wi-Fi 5 e Skeelo. A partir de R$ 95/mês no cartão.</p>
      </article>
      <article>
        <h3>Super 800 Mega</h3>
        <p>Roteador Wi-Fi 6, Globoplay 12 meses e Skeelo. A partir de R$ 120/mês no cartão.</p>
      </article>
      <article>
        <h3>Ultra 1 Giga</h3>
        <p>Roteador Wi-Fi 6, Globoplay 12 meses e Skeelo. A partir de R$ 135/mês no cartão.</p>
      </article>
      <h2>Consulta de cobertura</h2>
      <p>Informe seu CEP na página inicial para verificar se há fibra no endereço e encaminhar o pedido pelo WhatsApp.</p>
    </main>
    ${FOOTER_HTML}
  </div>
`;

const SOBRE_INNER = `
  <p>${SITE_NAME} é o canal digital da ${COMPANY_TRADE_NAME} para comparar e encaminhar pedidos de planos de internet fibra. Atuamos como intermediários.</p>
  <h2>Quem somos</h2>
  <p>${COMPANY_LEGAL_NAME}, inscrita no CNPJ ${COMPANY_CNPJ}, com sede em ${COMPANY_ADDRESS}.</p>
  <h2>O que fazemos</h2>
  <p>Consultamos a viabilidade no endereço, exibimos planos de referência e conectamos você a um consultor. O contrato do serviço de internet é com a operadora parceira.</p>
  <h2>O que não somos</h2>
  <p>Não somos operadora de telecomunicações e não prestamos o serviço de acesso à internet em nome próprio.</p>
`;

const CONTATO_INNER = `
  <h2>Dados da empresa</h2>
  <p>${COMPANY_LEGAL_NAME}</p>
  <p>CNPJ ${COMPANY_CNPJ}</p>
  <p>${COMPANY_ADDRESS}</p>
  <h2>Atendimento comercial</h2>
  <p>Use a consulta de cobertura na <a href="/">página inicial</a> para falar com um consultor no WhatsApp.</p>
  <p>${COMPANY_DISCLAIMER}</p>
`;

const TERMOS_INNER = `
  <h2>1. Natureza do serviço</h2>
  <p>${SITE_NAME} é uma marca da ${COMPANY_TRADE_NAME}. Prestamos intermediação e agenciamento de planos de internet. Não somos operadora de telecomunicações.</p>
  <h2>2. Relação com a operadora</h2>
  <p>A contratação, instalação, cobrança e suporte técnico da conexão são da operadora escolhida, sujeitas à Anatel no que couber a ela.</p>
  <h2>3. Uso do site</h2>
  <p>Informe dados verdadeiros na consulta e não utilize o site para fins ilícitos.</p>
  <h2>4. Limitação</h2>
  <p>Cobertura, prazo e condições comerciais dependem de confirmação da operadora no endereço.</p>
  <h2>5. Foro</h2>
  <p>Foro da comarca de Belo Horizonte/MG, salvo foro privilegiado. Sede: ${COMPANY_ADDRESS}.</p>
`;

const PRIVACIDADE_INNER = `
  <h2>1. Controladora</h2>
  <p>${COMPANY_LEGAL_NAME}, CNPJ ${COMPANY_CNPJ}, ${COMPANY_ADDRESS}.</p>
  <h2>2. Dados</h2>
  <p>Nome, CEP, estado, cidade, fachada, plano de interesse e resultado de viabilidade, além de dados técnicos básicos de acesso quando necessários.</p>
  <h2>3. Finalidades</h2>
  <p>Agenciamento de planos, consulta de cobertura e encaminhamento comercial, nos termos da LGPD.</p>
  <h2>4. Compartilhamento</h2>
  <p>Com consultores autorizados e com a operadora parceira na medida necessária à contratação. Não vendemos dados pessoais.</p>
  <h2>5. Direitos</h2>
  <p>Acesso, correção, eliminação e demais direitos da LGPD pelos canais de <a href="/contato">contato</a> ou no endereço da sede.</p>
`;

export const PRERENDER_PAGES = [
  {
    path: "/",
    title: "Fibra Aqui | Compare planos de internet fibra e consulte disponibilidade",
    description:
      "Compare planos de internet fibra óptica com velocidades de até 1 Giga. Consulte cobertura pelo CEP. A Fibra Aqui é uma marca da Fala Soluções e agencia planos — não somos operadora.",
    body: HOME_CRAWLER_HTML,
  },
  {
    path: "/sobre",
    title: "Sobre | Fibra Aqui",
    description:
      "A Fibra Aqui é uma marca da Fala Soluções em Tecnologia Ltda. Agenciamos planos de internet fibra — não somos operadora de telecomunicações.",
    body: pageShell("Sobre a Fibra Aqui", SOBRE_INNER),
  },
  {
    path: "/contato",
    title: "Contato | Fibra Aqui",
    description:
      "Fale com a Fibra Aqui, marca da Fala Soluções em Tecnologia Ltda. Sede em Belo Horizonte/MG.",
    body: pageShell("Contato", CONTATO_INNER),
  },
  {
    path: "/termos",
    title: "Termos de Uso | Fibra Aqui",
    description:
      "Termos de uso do site Fibra Aqui para consulta e agenciamento de planos de internet.",
    body: pageShell("Termos de Uso", TERMOS_INNER),
  },
  {
    path: "/privacidade",
    title: "Política de Privacidade | Fibra Aqui",
    description:
      "Política de privacidade da Fibra Aqui e da Fala Soluções em Tecnologia Ltda (LGPD).",
    body: pageShell("Política de Privacidade", PRIVACIDADE_INNER),
  },
];
