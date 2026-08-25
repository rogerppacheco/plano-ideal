import { LegalSection, PublicPageLayout } from "../components/PublicPageLayout";
import { PRIVACIDADE_PAGE } from "../content/legalPages";

export default function PrivacidadePage() {
  return (
    <PublicPageLayout heading={PRIVACIDADE_PAGE.title} intro={PRIVACIDADE_PAGE.intro}>
      {PRIVACIDADE_PAGE.sections.map((section) => (
        <LegalSection key={section.heading} heading={section.heading}>
          {section.paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </LegalSection>
      ))}
    </PublicPageLayout>
  );
}
