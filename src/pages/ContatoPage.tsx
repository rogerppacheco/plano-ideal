import { Link } from "react-router-dom";
import { LegalSection, PublicPageLayout } from "../components/PublicPageLayout";
import { CONTATO_PAGE } from "../content/legalPages";

export default function ContatoPage() {
  return (
    <PublicPageLayout heading={CONTATO_PAGE.title} intro={CONTATO_PAGE.intro}>
      {CONTATO_PAGE.sections.map((section) => (
        <LegalSection key={section.heading} heading={section.heading}>
          {section.paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </LegalSection>
      ))}
      <p>
        <Link
          to="/#consulta-cobertura"
          className="inline-flex rounded-full bg-neon-green px-6 py-3 text-sm font-extrabold text-pi-dark shadow-neon-glow transition hover:scale-105"
        >
          Consultar cobertura agora
        </Link>
      </p>
    </PublicPageLayout>
  );
}
