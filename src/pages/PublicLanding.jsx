import { useMemo, useState } from "react";
import { getPublicViabilityStatus } from "../services/api";
import { maskCep } from "../utils/coverage";

const WHATSAPP_NUMBER = "5511999999999";

const NIO_PLANS = [
  {
    id: "essencial-600",
    name: "Essencial",
    speed: 600,
    speedLabel: "600 Mega",
    benefits: ["Roteador Wi-Fi 5", "Skeelo"],
    priceStandard: 110,
    priceCard: 95,
    cardDiscount: 15,
    featured: false,
    badge: null,
  },
  {
    id: "super-800",
    name: "Super",
    speed: 800,
    speedLabel: "800 Mega",
    benefits: [
      "Roteador Wi-Fi 6 (nova geração)",
      "Globoplay 12 meses por conta da Nio",
      "Skeelo",
    ],
    priceStandard: 135,
    priceCard: 120,
    cardDiscount: 15,
    featured: true,
    badge: "Mais Assinado",
  },
  {
    id: "ultra-1giga",
    name: "Ultra",
    speed: 1000,
    speedLabel: "1 Giga",
    benefits: [
      "Roteador Wi-Fi 6",
      "Globoplay 12 meses por conta da Nio",
      "Skeelo",
    ],
    priceStandard: 150,
    priceCard: 135,
    cardDiscount: 15,
    featured: false,
    badge: null,
  },
];

const TRUST_PILLS = [
  "Preço fixo até jan/2030",
  "Taxa de habilitação isenta*",
  "Fidelidade 12 meses",
  "Fibra 100% óptica",
];

function formatPrice(value) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function buildWhatsappLink({ name, cep, facade, statusCode, planLabel }) {
  const reference = statusCode === "V-OK" ? "[Ref: V-OK]" : "[Ref: V-NOK]";
  const facadeInfo = facade?.trim() ? `Fachada: ${facade.trim()}. ` : "";
  const planInfo = planLabel ? `Plano de interesse: ${planLabel}. ` : "";
  const message = `Olá! Sou ${name}. Quero contratar internet fibra Nio. ${planInfo}Meu CEP é ${cep}. ${facadeInfo}${reference}`;
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

function FloatingBubbles() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div className="absolute -left-16 top-20 h-64 w-64 rounded-full bg-neon-green/20 blur-3xl animate-float-slow" />
      <div className="absolute right-0 top-32 h-48 w-72 rounded-[3rem] bg-white/5 blur-2xl animate-float-medium" />
      <div className="absolute bottom-20 left-1/4 h-40 w-56 rounded-full bg-neon-green/15 blur-3xl animate-float-fast" />
      <div className="absolute -right-10 bottom-40 h-56 w-56 rounded-[2rem] bg-neon-green/10 blur-2xl animate-float-slow" />
      <div className="absolute left-1/2 top-1/2 h-32 w-48 -translate-x-1/2 rounded-full bg-white/5 blur-xl animate-pulse-neon" />
    </div>
  );
}

function CheckIcon() {
  return (
    <svg className="h-4 w-4 shrink-0 text-neon-green" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M16.704 5.29a1 1 0 010 1.42l-7.25 7.25a1 1 0 01-1.42 0l-3.25-3.25a1 1 0 111.42-1.42l2.54 2.54 6.54-6.54a1 1 0 011.42 0z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function PlanCard({ plan, onSelect }) {
  const isFeatured = plan.featured;

  return (
    <article
      className={`relative flex flex-col rounded-[2rem] border p-6 transition duration-300 sm:p-8 ${
        isFeatured
          ? "z-10 scale-105 border-neon-green/60 bg-white shadow-nio-featured sm:scale-105"
          : "border-white/10 bg-white/95 shadow-nio-card backdrop-blur-sm hover:-translate-y-1 hover:shadow-neon-glow"
      }`}
      aria-label={`Plano ${plan.name} ${plan.speedLabel}`}
    >
      {plan.badge ? (
        <span className="absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-neon-green px-4 py-1.5 text-xs font-extrabold uppercase tracking-wide text-nio-dark shadow-neon-glow">
          {plan.badge}
        </span>
      ) : null}

      <div className="flex items-center justify-between gap-2">
        <p className="rounded-full bg-nio-dark/5 px-3 py-1 text-xs font-bold uppercase tracking-wider text-nio-dark/70">
          Nio Fibra
        </p>
        {isFeatured ? (
          <span className="rounded-full bg-neon-green/20 px-2.5 py-0.5 text-[10px] font-bold uppercase text-nio-dark">
            Destaque
          </span>
        ) : null}
      </div>

      <h3 className="mt-4 text-lg font-bold text-nio-dark">{plan.name}</h3>

      <div className="mt-1 flex items-end gap-1.5">
        <span className="text-4xl font-black leading-none text-nio-dark sm:text-5xl">
          {plan.speedLabel.split(" ")[0]}
        </span>
        <span className="mb-1 text-base font-bold text-nio-dark/60">
          {plan.speedLabel.includes("Giga") ? "Giga" : "Mega"}
        </span>
      </div>

      <ul className="mt-5 flex-1 space-y-2.5" aria-label="Benefícios do plano">
        {plan.benefits.map((benefit) => (
          <li key={benefit} className="flex items-start gap-2 text-sm text-nio-dark/80">
            <CheckIcon />
            {benefit}
          </li>
        ))}
      </ul>

      <div className="mt-6 space-y-3 rounded-[1.5rem] bg-nio-dark/5 p-4">
        <div>
          <p className="text-xs text-nio-dark/50">Boleto / Débito</p>
          <p className="text-xl font-bold text-nio-dark/70 line-through decoration-nio-dark/30">
            {formatPrice(plan.priceStandard)}
            <span className="text-sm font-medium">/mês</span>
          </p>
        </div>

        <div className="relative">
          <span className="absolute -top-3 left-0 rounded-full bg-neon-green px-2.5 py-0.5 text-[10px] font-extrabold uppercase text-nio-dark shadow-sm">
            Desconto no Cartão −{formatPrice(plan.cardDiscount)}
          </span>
          <p className="pt-1 text-3xl font-black text-nio-dark">
            {formatPrice(plan.priceCard)}
            <span className="text-base font-semibold text-nio-dark/50">/mês</span>
          </p>
          <p className="mt-0.5 text-xs font-medium text-neon-green">pagando no cartão de crédito</p>
        </div>
      </div>

      <p className="mt-3 text-center text-[11px] text-nio-dark/40">
        Preço fixo até jan/2030 · Taxa de habilitação isenta*
      </p>

      <button
        type="button"
        onClick={() => onSelect(plan)}
        className={`mt-5 w-full rounded-full px-6 py-4 text-sm font-extrabold transition duration-200 hover:scale-[1.02] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
          isFeatured
            ? "bg-neon-green text-nio-dark shadow-neon-glow hover:shadow-neon-glow-lg focus-visible:outline-neon-green"
            : "bg-nio-dark text-white hover:bg-nio-darker focus-visible:outline-nio-dark"
        }`}
        aria-label={`Contratar plano ${plan.name} ${plan.speedLabel}`}
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
    if (formattedCep.length === 9) setCepError("");
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
        ? `${selectedPlan.name} ${selectedPlan.speedLabel} — ${formatPrice(selectedPlan.priceCard)}/mês no cartão`
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
    <div className="min-h-screen bg-nio-dark text-white">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-nio-dark/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 md:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-neon-green text-sm font-black text-nio-dark">
              N
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-neon-green">
                Nio Fibra
              </p>
              <h1 className="text-lg font-extrabold tracking-tight md:text-xl">Plano Ideal</h1>
            </div>
          </div>
          <a
            href="#planos"
            className="hidden rounded-full bg-neon-green px-5 py-2.5 text-sm font-extrabold text-nio-dark shadow-neon-glow transition hover:scale-105 sm:inline-flex"
            aria-label="Ver planos de internet disponíveis"
          >
            Ver planos
          </a>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-white/5 bg-nio-dark">
          <FloatingBubbles />
          <div className="relative mx-auto max-w-6xl px-4 py-16 md:px-8 md:py-24">
            <div className="mx-auto max-w-3xl text-center">
              <span className="inline-block rounded-full border border-neon-green/30 bg-neon-green/10 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-neon-green">
                Internet fibra ultra rápida
              </span>

              <h2 className="mt-6 text-4xl font-black leading-[1.1] tracking-tight md:text-6xl">
                Internet fibra que{" "}
                <span className="text-neon-green">simplesmente funciona</span>
              </h2>

              <p className="mt-5 text-base text-white/70 md:text-xl">
                Velocidade real, Wi-Fi de última geração e{" "}
                <strong className="font-bold text-neon-green">preço fixo até janeiro de 2030</strong>.
                Sem surpresas na fatura.
              </p>

              <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                {TRUST_PILLS.map((pill) => (
                  <span
                    key={pill}
                    className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-white/80 backdrop-blur-sm"
                  >
                    {pill}
                  </span>
                ))}
              </div>

              <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <a
                  href="#planos"
                  className="w-full rounded-full bg-neon-green px-8 py-4 text-base font-extrabold text-nio-dark shadow-neon-glow transition hover:scale-105 hover:shadow-neon-glow-lg sm:w-auto"
                >
                  Escolher meu plano
                </a>
                <a
                  href="#consulta-cobertura"
                  className="w-full rounded-full border border-white/20 bg-white/5 px-8 py-4 text-base font-bold text-white backdrop-blur-sm transition hover:bg-white/10 sm:w-auto"
                >
                  Consultar meu CEP
                </a>
              </div>
            </div>

            <div className="mt-14 grid gap-4 sm:grid-cols-3">
              {[
                { emoji: "⚡", title: "Velocidade real", desc: "Fibra óptica direto até sua casa." },
                { emoji: "📶", title: "Wi-Fi 6 incluso", desc: "Roteador de nova geração nos planos Super e Ultra." },
                { emoji: "💬", title: "Atendimento humano", desc: "Consulta de cobertura e contratação via WhatsApp." },
              ].map((item) => (
                <div
                  key={item.title}
                  className="rounded-[2rem] border border-white/10 bg-white/5 p-5 backdrop-blur-sm transition hover:border-neon-green/30"
                >
                  <span className="text-2xl" aria-hidden="true">{item.emoji}</span>
                  <p className="mt-2 text-sm font-bold text-white">{item.title}</p>
                  <p className="mt-1 text-xs text-white/60">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Planos */}
        <section
          id="planos"
          className="relative bg-nio-darker py-16 md:py-24"
          aria-labelledby="planos-titulo"
        >
          <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
            <div className="absolute left-1/3 top-0 h-72 w-72 rounded-full bg-neon-green/8 blur-3xl" />
          </div>

          <div className="relative mx-auto max-w-6xl px-4 md:px-8">
            <div className="mb-12 text-center">
              <span className="rounded-full bg-neon-green/15 px-4 py-1 text-xs font-bold uppercase tracking-widest text-neon-green">
                Planos Nio
              </span>
              <h2 id="planos-titulo" className="mt-4 text-3xl font-black text-white md:text-5xl">
                Escolha sua velocidade
              </h2>
              <p className="mt-3 text-white/60">
                Todos com preço fixo até jan/2030 e isenção de taxa de habilitação*
              </p>
            </div>

            <div className="grid items-center gap-6 md:grid-cols-3 md:gap-4 lg:gap-6">
              {NIO_PLANS.map((plan) => (
                <PlanCard key={plan.id} plan={plan} onSelect={handlePlanSelect} />
              ))}
            </div>

            <p className="mt-8 text-center text-xs text-white/30">
              * Com fidelidade de 12 meses. Valores promocionais no cartão de crédito.
            </p>
          </div>
        </section>

        {/* Consulta CEP */}
        <section
          id="consulta-cobertura"
          className="border-t border-white/5 bg-nio-dark py-16 md:py-24"
          aria-labelledby="consulta-titulo"
        >
          <div className="mx-auto max-w-6xl px-4 md:px-8">
            <div className="mx-auto max-w-2xl rounded-[2rem] border border-white/10 bg-white/5 p-6 backdrop-blur-md md:p-10">
              <span className="rounded-full bg-neon-green/15 px-3 py-1 text-xs font-bold uppercase tracking-widest text-neon-green">
                Consulta de cobertura
              </span>
              <h2 id="consulta-titulo" className="mt-4 text-2xl font-black text-white md:text-3xl">
                Tem fibra no seu endereço?
              </h2>
              <p className="mt-2 text-sm text-white/60">
                Informe seu CEP e fale com um consultor no WhatsApp com a viabilidade já preenchida.
              </p>

              {selectedPlan ? (
                <div className="mt-5 flex flex-wrap items-center gap-2 rounded-full border border-neon-green/30 bg-neon-green/10 px-4 py-2.5 text-sm text-neon-green">
                  <span className="font-bold">
                    {selectedPlan.name} {selectedPlan.speedLabel} — {formatPrice(selectedPlan.priceCard)}/mês
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedPlan(null)}
                    className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-semibold text-white/70 hover:bg-white/20"
                    aria-label="Remover plano selecionado"
                  >
                    trocar
                  </button>
                </div>
              ) : null}

              <form className="mt-6 grid gap-4" onSubmit={handleSubmit} noValidate>
                <div>
                  <label className="mb-1.5 block text-sm font-semibold text-white/80" htmlFor="name">
                    Nome
                  </label>
                  <input
                    id="name"
                    type="text"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Como podemos te chamar?"
                    className="w-full rounded-full border border-white/15 bg-white/10 px-5 py-3.5 text-sm text-white placeholder:text-white/30 outline-none transition focus:border-neon-green/50 focus:ring-2 focus:ring-neon-green/20"
                    autoComplete="name"
                    required
                  />
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-white/80" htmlFor="cep">
                      CEP <span className="text-neon-green">*</span>
                    </label>
                    <input
                      id="cep"
                      type="text"
                      inputMode="numeric"
                      value={cep}
                      onChange={handleCepChange}
                      placeholder="00000-000"
                      className={`w-full rounded-full border bg-white/10 px-5 py-3.5 text-sm text-white placeholder:text-white/30 outline-none transition focus:ring-2 ${
                        cepError
                          ? "border-red-400 focus:border-red-400 focus:ring-red-400/20"
                          : "border-white/15 focus:border-neon-green/50 focus:ring-neon-green/20"
                      }`}
                      autoComplete="postal-code"
                      aria-invalid={cepError ? "true" : "false"}
                      aria-describedby={cepError ? "cep-error" : undefined}
                      required
                    />
                    {cepError ? (
                      <p id="cep-error" className="mt-1.5 text-xs text-red-400" role="alert">
                        {cepError}
                      </p>
                    ) : (
                      <p className="mt-1.5 text-xs text-white/40">Formato: 00000-000</p>
                    )}
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-white/80" htmlFor="facade">
                      Fachada <span className="font-normal text-white/40">(opcional)</span>
                    </label>
                    <input
                      id="facade"
                      type="text"
                      value={facade}
                      onChange={(event) => setFacade(event.target.value)}
                      placeholder="Ex: casa azul, nº 120"
                      className="w-full rounded-full border border-white/15 bg-white/10 px-5 py-3.5 text-sm text-white placeholder:text-white/30 outline-none transition focus:border-neon-green/50 focus:ring-2 focus:ring-neon-green/20"
                    />
                    <p className="mt-1.5 text-xs text-white/40">Ajuda a localizar seu endereço</p>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={!canSubmit || isSubmitting}
                  className="w-full rounded-full bg-neon-green py-4 text-base font-extrabold text-nio-dark shadow-neon-glow transition hover:scale-[1.02] hover:shadow-neon-glow-lg disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
                  aria-label="Consultar cobertura e abrir WhatsApp"
                >
                  {isSubmitting ? "Consultando cobertura…" : "Consultar e falar no WhatsApp"}
                </button>
              </form>

              {submitError ? (
                <p className="mt-3 text-sm text-red-400" role="alert">
                  {submitError}
                </p>
              ) : (
                <p className="mt-3 text-xs text-white/30">
                  Ao continuar, você será direcionado ao WhatsApp com os dados preenchidos.
                </p>
              )}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-white/5 bg-nio-darker">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-center text-sm text-white/40 md:flex-row md:px-8 md:text-left">
          <p>© {new Date().getFullYear()} Plano Ideal · Parceiro Nio Fibra</p>
          <a
            href="/interno"
            className="rounded-full px-3 py-1 text-xs text-white/30 transition hover:bg-white/5 hover:text-white/60"
            aria-label="Acesso interno para equipe"
          >
            Acesso interno
          </a>
        </div>
      </footer>
    </div>
  );
}
