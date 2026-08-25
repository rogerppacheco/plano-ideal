import { LegalSection, PublicPageLayout } from "../components/PublicPageLayout";
import { TERMOS_PAGE } from "../content/legalPages";

export default function TermosPage() {
  return (
    <PublicPageLayout heading={TERMOS_PAGE.title} intro={TERMOS_PAGE.intro}>
      {TERMOS_PAGE.sections.map((section) => (
        <LegalSection key={section.heading} heading={section.heading}>
          {section.paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </LegalSection>
      ))}
    </PublicPageLayout>
  );
}
