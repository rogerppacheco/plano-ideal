import { useMemo, useState } from "react";
import { getPublicViabilityStatus } from "../services/api";
import { maskCep } from "../utils/coverage";

const WHATSAPP_NUMBER = "5511999999999";

const INTERNET_PLANS = [
  {
    id: "200",
    speed: 200,
    price: 59.9,
    operator: "Nio Fibra",
    badge: null,
    featured: false,
    benefits: ["Fibra óptica até o roteador", "Wi-Fi incluso", "Instalação grátis"],
  },
  {
    id: "400",
    speed: 400,
    price: 79.9,
    operator: "Nio Fibra",
    badge: "Mais Vendido",
    featured: true,
    benefits: ["Upload de até 200 Mbps", "Wi-Fi 6", "Globoplay incluso por 12 meses"],
  },
  {
    id: "600",
    speed: 600,
    price: 99.9,
    operator: "Nio Fibra",
    badge: null,
    featured: false,
    benefits: ["Ideal para famílias conectadas", "Wi-Fi 6 mesh", "Suporte prioritário"],
  },
  {
    id: "1000",
    speed: 1000,
    price: 129.9,
    operator: "Nio Fibra",
    badge: "Máxima Velocidade",
    featured: false,
    benefits: ["1 Giga de download", "Gaming e home office", "Roteador premium"],
  },
];

function formatPrice(value) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function buildWhatsappLink({ name, cep, facade, statusCode, planLabel }) {
  const reference = statusCode === "V-OK" ? "[Ref: V-OK]" : "[Ref: V-NOK]";
  const facadeInfo = facade?.trim() ? `Fachada: ${facade.trim()}. ` : "";
  const planInfo = planLabel ? `Plano de interesse: ${planLabel}. ` : "";
  const message = `Olá! Sou ${name}. Quero contratar internet fibra. ${planInfo}Meu CEP é ${cep}. ${facadeInfo}${reference}`;
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

function PlanCard({ plan, onSelect }) {
  return (
    <article
      className={`plan-card ${plan.featured ? "plan-card-featured" : ""}`}
      aria-label={`Plano de ${plan.speed} megas por ${formatPrice(plan.price)}`}
    >
      {plan.badge ? (
        <span
          className={`absolute -top-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide ${
            plan.featured
              ? "bg-brand-600 text-white shadow-md"
              : "bg-ink-800 text-white"
          }`}
        >
          {plan.badge}
        </span>
      ) : null}

      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{plan.operator}</p>

      <div className="mt-3 flex items-end gap-1">
        <span className="text-4xl font-extrabold leading-none text-ink-900">{plan.speed}</span>
        <span className="mb-1 text-lg font-bold text-brand-600">Mbps</span>
      </div>

      <p className="mt-1 text-sm text-ink-600">Download em fibra óptica</p>

      <div className="mt-5 border-t border-slate-100 pt-5">
        <p className="text-xs text-slate-500">A partir de</p>
        <p className="mt-0.5 text-3xl font-extrabold text-ink-900">
          {formatPrice(plan.price)}
          <span className="text-base font-semibold text-slate-500">/mês</span>
        </p>
      </div>

      <ul className="mt-5 flex-1 space-y-2.5" aria-label="Benefícios do plano">
        {plan.benefits.map((benefit) => (
          <li key={benefit} className="flex items-start gap-2 text-sm text-ink-700">
            <svg
              className="mt-0.5 h-4 w-4 shrink-0 text-accent-500"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M16.704 5.29a1 1 0 010 1.42l-7.25 7.25a1 1 0 01-1.42 0l-3.25-3.25a1 1 0 111.42-1.42l2.54 2.54 6.54-6.54a1 1 0 011.42 0z"
                clipRule="evenodd"
              />
            </svg>
            {benefit}
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={() => onSelect(plan)}
        className={`mt-6 w-full ${plan.featured ? "btn-cta" : "btn-primary"}`}
        aria-label={`Contratar plano de ${plan.speed} megas`}
      >
        Quero este plano
      </button>
    </article>
  );
}

export default function PublicLanding() {
  const [name, setName] = useState("");
  const [cep, setCep] = useState("");
  const [facade, setFacade] = useState("");
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [cepError, setCepError] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit = useMemo(() => name.trim() && cep.length === 9, [name, cep]);

  const handleCepChange = (event) => {
    const formattedCep = maskCep(event.target.value);
    setCep(formattedCep);
    if (formattedCep.length === 9) {
      setCepError("");
    }
    setSubmitError("");
  };

  const handlePlanSelect = (plan) => {
    setSelectedPlan(plan);
    setSubmitError("");
    document.getElementById("consulta-cobertura")?.scrollIntoView({ behavior: "smooth" });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSubmitError("");

    if (cep.length !== 9) {
      setCepError("Informe um CEP válido no formato 00000-000.");
      return;
    }

    try {
      setIsSubmitting(true);
      const viability = await getPublicViabilityStatus(cep);
      const planLabel = selectedPlan
        ? `${selectedPlan.speed} Mbps — ${formatPrice(selectedPlan.price)}/mês`
        : null;
      const whatsappLink = buildWhatsappLink({
        name: name.trim(),
        cep,
        facade,
        statusCode: viability.statusCode,
        planLabel,
      });
      window.open(whatsappLink, "_blank", "noopener,noreferrer");
    } catch (error) {
      setSubmitError(error.message || "Falha ao consultar cobertura. Tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen text-ink-900">
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 md:px-8">
          <div>
            <p className="section-label">Internet Fibra</p>
            <h1 className="text-xl font-extrabold tracking-tight text-ink-900 md:text-2xl">
              Plano Ideal
            </h1>
          </div>
          <a
            href="#planos"
            className="btn-primary hidden px-4 py-2 text-sm sm:inline-flex"
            aria-label="Ver planos de internet disponíveis"
          >
            Ver planos
          </a>
        </div>
      </header>

      <main>
        <section className="border-b border-slate-100 bg-gradient-to-b from-brand-50/60 to-white">
          <div className="mx-auto max-w-6xl px-4 py-14 md:px-8 md:py-20">
            <div className="mx-auto max-w-3xl text-center">
              <p className="section-label">Compare e contrate em minutos</p>
              <h2 className="mt-3 text-3xl font-extrabold leading-tight tracking-tight text-ink-900 md:text-5xl">
                O plano de internet certo para sua casa
              </h2>
              <p className="mt-4 text-base text-ink-600 md:text-lg">
                Fibra óptica com velocidades de até 1 Giga, preços transparentes e consulta de
                cobertura pelo CEP. Atendimento humano direto no WhatsApp.
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <a href="#planos" className="btn-cta w-full px-8 sm:w-auto">
                  Comparar planos
                </a>
                <a href="#consulta-cobertura" className="btn-secondary w-full px-8 sm:w-auto">
                  Consultar meu CEP
                </a>
              </div>
            </div>

            <div className="mt-12 grid gap-4 sm:grid-cols-3">
              {[
                { title: "Fibra 100% óptica", desc: "Conexão estável para streaming, games e trabalho remoto." },
                { title: "Sem surpresas", desc: "Valores claros, sem letras miúdas escondidas no contrato." },
                { title: "Atendimento rápido", desc: "Consulta de viabilidade em segundos e suporte no WhatsApp." },
              ].map((item) => (
                <div
                  key={item.title}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <p className="text-sm font-bold text-ink-900">{item.title}</p>
                  <p className="mt-1 text-sm text-ink-600">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="planos" className="mx-auto max-w-6xl px-4 py-14 md:px-8 md:py-20" aria-labelledby="planos-titulo">
          <div className="mb-10 text-center">
            <p className="section-label">Nossos planos</p>
            <h2 id="planos-titulo" className="mt-2 text-2xl font-extrabold text-ink-900 md:text-4xl">
              Escolha a velocidade ideal
            </h2>
            <p className="mt-3 text-ink-600">
              Todos os planos incluem fibra óptica, instalação e suporte dedicado.
            </p>
          </div>

          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
            {INTERNET_PLANS.map((plan) => (
              <PlanCard key={plan.id} plan={plan} onSelect={handlePlanSelect} />
            ))}
          </div>
        </section>

        <section
          id="consulta-cobertura"
          className="border-t border-slate-100 bg-slate-50/80"
          aria-labelledby="consulta-titulo"
        >
          <div className="mx-auto max-w-6xl px-4 py-14 md:px-8 md:py-20">
            <div className="surface-card mx-auto max-w-3xl p-6 md:p-10">
              <p className="section-label">Consulta de cobertura</p>
              <h2 id="consulta-titulo" className="mt-2 text-2xl font-extrabold text-ink-900 md:text-3xl">
                Verifique disponibilidade no seu endereço
              </h2>
              <p className="mt-3 text-sm text-ink-600 md:text-base">
                Informe seu CEP e fale com um consultor no WhatsApp com a referência de viabilidade
                já preenchida.
              </p>

              {selectedPlan ? (
                <div className="mt-4 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900">
                  <span className="font-semibold">Plano selecionado:</span>{" "}
                  {selectedPlan.speed} Mbps — {formatPrice(selectedPlan.price)}/mês
                  <button
                    type="button"
                    onClick={() => setSelectedPlan(null)}
                    className="ml-2 font-semibold underline hover:no-underline"
                    aria-label="Remover plano selecionado"
                  >
                    trocar
                  </button>
                </div>
              ) : null}

              <form className="mt-6 grid gap-4" onSubmit={handleSubmit} noValidate>
                <div>
                  <label className="mb-1 block text-sm font-medium text-ink-700" htmlFor="name">
                    Nome
                  </label>
                  <input
                    id="name"
                    type="text"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Como podemos te chamar?"
                    className="input-modern"
                    autoComplete="name"
                    required
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-ink-700" htmlFor="cep">
                      CEP <span className="text-red-600">*</span>
                    </label>
                    <input
                      id="cep"
                      type="text"
                      inputMode="numeric"
                      value={cep}
                      onChange={handleCepChange}
                      placeholder="00000-000"
                      className={`input-modern ${
                        cepError
                          ? "border-red-500 focus:border-red-500 focus:ring-red-100"
                          : ""
                      }`}
                      autoComplete="postal-code"
                      aria-invalid={cepError ? "true" : "false"}
                      aria-describedby={cepError ? "cep-error" : undefined}
                      required
                    />
                    {cepError ? (
                      <p id="cep-error" className="mt-1 text-xs text-red-600" role="alert">
                        {cepError}
                      </p>
                    ) : null}
                  </div>

                  <div>
                    <label className="mb-1 block text-sm font-medium text-ink-700" htmlFor="facade">
                      Fachada <span className="font-normal text-slate-500">(opcional)</span>
                    </label>
                    <input
                      id="facade"
                      type="text"
                      value={facade}
                      onChange={(event) => setFacade(event.target.value)}
                      placeholder="Ex: casa azul, nº 120"
                      className="input-modern"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={!canSubmit || isSubmitting}
                  className="btn-cta w-full py-4 text-base"
                  aria-label="Consultar cobertura e abrir WhatsApp"
                >
                  {isSubmitting ? "Consultando cobertura…" : "Consultar e falar no WhatsApp"}
                </button>
              </form>

              {submitError ? (
                <p className="mt-3 text-sm text-red-600" role="alert">
                  {submitError}
                </p>
              ) : null}

              {!submitError ? (
                <p className="mt-3 text-xs text-slate-500">
                  Ao continuar, você será direcionado ao WhatsApp com os dados preenchidos.
                </p>
              ) : null}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-center text-sm text-slate-500 md:flex-row md:px-8 md:text-left">
          <p>© {new Date().getFullYear()} Plano Ideal. Todos os direitos reservados.</p>
          <a
            href="/interno"
            className="text-xs text-slate-400 transition hover:text-slate-600"
            aria-label="Acesso interno para equipe"
          >
            Acesso interno
          </a>
        </div>
      </footer>
    </div>
  );
}
