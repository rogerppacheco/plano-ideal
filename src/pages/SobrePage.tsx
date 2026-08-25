import { LegalSection, PublicPageLayout } from "../components/PublicPageLayout";
import { SOBRE_PAGE } from "../content/legalPages";

export default function SobrePage() {
  return (
    <PublicPageLayout heading={SOBRE_PAGE.title} intro={SOBRE_PAGE.intro}>
      {SOBRE_PAGE.sections.map((section) => (
        <LegalSection key={section.heading} heading={section.heading}>
          {section.paragraphs.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </LegalSection>
      ))}
    </PublicPageLayout>
  );
}
