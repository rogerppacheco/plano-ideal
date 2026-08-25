import {
  COMPANY_ADDRESS,
  COMPANY_CNPJ,
  COMPANY_LEGAL_NAME,
  COMPANY_TRADE_NAME,
  SITE_NAME,
  SITE_URL,
} from "./company";

export interface LegalSection {
  heading: string;
  paragraphs: string[];
}

export interface LegalPageContent {
  path: string;
  title: string;
  description: string;
  intro: string;
  sections: LegalSection[];
}

export const SOBRE_PAGE: LegalPageContent = {
  path: "/sobre",
  title: "Sobre a Fibra Aqui",
  description:
    "A Fibra Aqui é uma marca da Fala Soluções em Tecnologia Ltda. Agenciamos planos de internet fibra — não somos operadora de telecomunicações.",
  intro: `${SITE_NAME} é o canal digital da ${COMPANY_TRADE_NAME} para comparar e encaminhar pedidos de planos de internet fibra. Atuamos como intermediários: ajudamos você a consultar cobertura, entender as ofertas e falar com um consultor para seguir a contratação junto à operadora parceira.`,
  sections: [
    {
      heading: "Quem somos",
      paragraphs: [
        `${COMPANY_LEGAL_NAME}, inscrita no CNPJ ${COMPANY_CNPJ}, com sede em ${COMPANY_ADDRESS}.`,
        `${SITE_NAME} é uma marca da ${COMPANY_TRADE_NAME}. O site ${SITE_URL.replace("https://", "")} apresenta ofertas de internet fibra de operadoras parceiras e encaminha o interessado para o atendimento comercial.`,
      ],
    },
    {
      heading: "O que fazemos",
      paragraphs: [
        "Consultamos a viabilidade no endereço informado, exibimos planos e preços de referência da região e conectamos você a um consultor, em regra pelo WhatsApp, para dar andamento ao pedido.",
        "O contrato de prestação do serviço de telecomunicações, a instalação, a fatura e o suporte técnico da conexão são de responsabilidade da operadora escolhida, e não da Fibra Aqui ou da Fala Soluções.",
      ],
    },
    {
      heading: "O que não somos",
      paragraphs: [
        "Não somos operadora de telecomunicações, não detemos outorga da Anatel para explorar SCM/STFC e não prestamos o serviço de acesso à internet em nome próprio.",
        "Preços, prazos, cobertura e condições comerciais podem depender de confirmação da operadora no endereço e estão sujeitos às regras do contrato firmado com ela.",
      ],
    },
  ],
};

export const CONTATO_PAGE: LegalPageContent = {
  path: "/contato",
  title: "Contato",
  description:
    "Fale com a Fibra Aqui, marca da Fala Soluções em Tecnologia Ltda. Sede em Belo Horizonte/MG. Atendimento comercial pelo site e WhatsApp.",
  intro: `Para pedidos de internet, use a consulta de cobertura na página inicial. Correspondências e questões institucionais devem ser dirigidas à ${COMPANY_TRADE_NAME}.`,
  sections: [
    {
      heading: "Dados da empresa",
      paragraphs: [
        `${COMPANY_LEGAL_NAME}`,
        `CNPJ ${COMPANY_CNPJ}`,
        COMPANY_ADDRESS,
      ],
    },
    {
      heading: "Atendimento comercial",
      paragraphs: [
        "O canal principal para consultar cobertura e contratar é o formulário da página inicial. Com o CEP e os dados básicos, você é direcionado a um consultor no WhatsApp com as informações já preenchidas.",
        "Esse atendimento destina-se ao agenciamento de planos. A operadora parceira é quem conclui a habilitação e presta o serviço de internet.",
      ],
    },
    {
      heading: "Marca e responsabilidade",
      paragraphs: [
        `${SITE_NAME} é uma marca da ${COMPANY_TRADE_NAME}, empresa de intermediação e agenciamento de planos de internet. Não somos operadora de telecomunicações.`,
      ],
    },
  ],
};

export const TERMOS_PAGE: LegalPageContent = {
  path: "/termos",
  title: "Termos de Uso",
  description:
    "Termos de uso do site Fibra Aqui, marca da Fala Soluções em Tecnologia Ltda, para consulta e agenciamento de planos de internet.",
  intro: `Ao acessar ${SITE_URL.replace("https://www.", "")}, você concorda com estes termos. O site é operado pela ${COMPANY_TRADE_NAME} (${COMPANY_LEGAL_NAME}, CNPJ ${COMPANY_CNPJ}).`,
  sections: [
    {
      heading: "1. Natureza do serviço",
      paragraphs: [
        `${SITE_NAME} é uma marca da ${COMPANY_TRADE_NAME}. Prestamos serviço de intermediação e agenciamento de planos de internet: comparação de ofertas, consulta de cobertura por CEP e encaminhamento do interessado à equipe comercial e/ou à operadora parceira.`,
        "Não somos operadora de telecomunicações. Não vendemos, habilitamos nem operamos a rede de fibra em nome próprio. O serviço de conexão à internet, quando contratado, é prestado pela operadora indicada na oferta.",
      ],
    },
    {
      heading: "2. Relação com a operadora",
      paragraphs: [
        "A contratação do plano, a instalação, a cobrança, a fidelidade, a qualidade da conexão e o suporte técnico da internet regem-se pelo contrato e pelas políticas da operadora, além da regulamentação da Anatel aplicável a ela.",
        "Informações de preço, velocidade, benefícios e cobertura no site são de referência e podem variar após análise de viabilidade no endereço. A confirmação definitiva cabe à operadora.",
      ],
    },
    {
      heading: "3. Uso do site",
      paragraphs: [
        "Você se compromete a informar dados verdadeiros na consulta (nome, CEP, cidade, estado e demais campos) e a não utilizar o site para fins ilícitos, fraudes ou envio de informações de terceiros sem autorização.",
        "Podemos recusar ou interromper o encaminhamento de um pedido em caso de dados incompletos, suspeita de uso indevido ou indisponibilidade do canal de atendimento.",
      ],
    },
    {
      heading: "4. Limitação",
      paragraphs: [
        "A Fala Soluções não garante cobertura, prazo de instalação nem condições comerciais específicas até a validação pela operadora. Não respondemos por falhas da rede, da operadora ou de aplicativos de terceiros, inclusive WhatsApp.",
        "Na medida permitida pela legislação, a responsabilidade da Fala Soluções limita-se à atividade de agenciamento descrita nestes termos.",
      ],
    },
    {
      heading: "5. Alterações e foro",
      paragraphs: [
        "Estes termos podem ser atualizados para refletir mudanças operacionais ou legais. A versão vigente é a publicada nesta página.",
        `Fica eleito o foro da comarca de Belo Horizonte/MG, salvo disposição legal de foro privilegiado. Sede: ${COMPANY_ADDRESS}.`,
      ],
    },
  ],
};

export const PRIVACIDADE_PAGE: LegalPageContent = {
  path: "/privacidade",
  title: "Política de Privacidade",
  description:
    "Política de privacidade da Fibra Aqui e da Fala Soluções em Tecnologia Ltda sobre coleta e uso de dados no agenciamento de planos de internet.",
  intro: `Esta política descreve como a ${COMPANY_TRADE_NAME} (${COMPANY_LEGAL_NAME}, CNPJ ${COMPANY_CNPJ}) trata dados pessoais no site ${SITE_NAME}, em conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018).`,
  sections: [
    {
      heading: "1. Controladora",
      paragraphs: [
        `Controladora: ${COMPANY_LEGAL_NAME}, CNPJ ${COMPANY_CNPJ}, ${COMPANY_ADDRESS}.`,
        `${SITE_NAME} é uma marca da controladora. Não somos operadora de telecomunicações; o tratamento descrito aqui refere-se à intermediação e ao agenciamento de planos.`,
      ],
    },
    {
      heading: "2. Dados que coletamos",
      paragraphs: [
        "Na consulta de cobertura e no encaminhamento ao WhatsApp, podemos tratar: nome, CEP, estado, cidade, informação de fachada, plano de interesse e o resultado da viabilidade no endereço.",
        "Também podem ser registrados dados técnicos básicos de acesso (como endereço IP, data e hora e páginas visitadas) quando necessários à segurança e ao funcionamento do site.",
      ],
    },
    {
      heading: "3. Finalidades e bases legais",
      paragraphs: [
        "Usamos os dados para identificar a região, apresentar ofertas compatíveis, consultar viabilidade, encaminhar o atendimento comercial e cumprir obrigações legais.",
        "As bases legais incluem execução de diligências pré-contratuais (art. 7º, V, da LGPD), legítimo interesse no agenciamento de ofertas e, quando exigido, consentimento ou obrigação legal.",
      ],
    },
    {
      heading: "4. Compartilhamento",
      paragraphs: [
        "Podemos compartilhar nome, endereço/CEP e demais dados do pedido com consultores autorizados e com a operadora parceira, na medida necessária para analisar viabilidade e concluir a contratação.",
        "A operadora, ao assumir a relação de prestação do serviço de internet, passa a tratar dados na qualidade de controladora daquela relação, segundo a política dela. Não vendemos listas de dados pessoais.",
      ],
    },
    {
      heading: "5. Retenção e direitos",
      paragraphs: [
        "Guardamos os dados pelo tempo necessário ao atendimento, a obrigações legais e à defesa de direitos. Depois, eliminamos ou anonimizamos, salvo retenção legal.",
        "Você pode solicitar confirmação de tratamento, acesso, correção, anonimização, portabilidade, informação sobre compartilhamentos e revogação de consentimento, quando aplicável, pelos canais da página de Contato ou no endereço da sede.",
        "Também é possível peticionar à Autoridade Nacional de Proteção de Dados (ANPD).",
      ],
    },
    {
      heading: "6. Segurança e atualizações",
      paragraphs: [
        "Adotamos medidas técnicas e organizacionais razoáveis para proteger os dados, sem garantir segurança absoluta em redes de internet e aplicativos de terceiros.",
        "Esta política pode ser atualizada. A versão vigente é a publicada nesta página.",
      ],
    },
  ],
};

export const LEGAL_PAGES = [SOBRE_PAGE, CONTATO_PAGE, TERMOS_PAGE, PRIVACIDADE_PAGE] as const;
