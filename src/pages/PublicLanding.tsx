import { useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import mascotCloud from "../assets/mascot-cloud-hero.png";
import { getPublicViabilityStatus } from "../services/api";
import type { PublicViabilityCode } from "../types/coverage";
import { isPublicViabilityCode } from "../types/coverage";
import { maskCep } from "../utils/coverage";

const WHATSAPP_NUMBER = "5511999999999";

interface InternetPlan {
  id: string;
  name: string;
  speedLabel: string;
  benefits: string[];
  priceStandard: number;
  priceCard: number;
  cardDiscount: number;
  featured: boolean;
  badge: string | null;
}

type ViabilitySubmitState =
  { status: "idle" } | { status: "submitting" } | { status: "error"; message: string };

const INTERNET_PLANS: InternetPlan[] = [
  {
    id: "essencial-600",
    name: "Essencial",
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
    speedLabel: "800 Mega",
    benefits: ["Roteador Wi-Fi 6 (nova geração)", "Globoplay 12 meses incluso", "Skeelo"],
    priceStandard: 135,
    priceCard: 120,
    cardDiscount: 15,
    featured: true,
    badge: "Mais Assinado",
  },
  {
    id: "ultra-1giga",
    name: "Ultra",
    speedLabel: "1 Giga",
    benefits: ["Roteador Wi-Fi 6", "Globoplay 12 meses incluso", "Skeelo"],
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
  "Nossa Fibra 100% óptica",
];

const HERO_FEATURES = [
  { emoji: "⚡", title: "Velocidade real", desc: "Internet fibra direto até sua casa." },
  {
    emoji: "📶",
    title: "Wi-Fi 6 incluso",
    desc: "Roteador de nova geração nos planos Super e Ultra.",
  },
  { emoji: "📱", title: "Nosso App", desc: "Gerencie sua conta e suporte pelo aplicativo." },
];

function formatPrice(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function buildWhatsappLink({
  name,
  cep,
  facade,
  statusCode,
  planLabel,
}: {
  name: string;
  cep: string;
  facade: string;
  statusCode: PublicViabilityCode;
  planLabel: string | null;
}): string {
  const reference = statusCode === "V-OK" ? "[Ref: V-OK]" : "[Ref: V-NOK]";
  const facadeInfo = facade?.trim() ? `Fachada: ${facade.trim()}. ` : "";
  const planInfo = planLabel ? `Plano de interesse: ${planLabel}. ` : "";
  const message = `Olá! Sou ${name}. Quero contratar internet fibra com o Plano Ideal. ${planInfo}Meu CEP é ${cep}. ${facadeInfo}${reference}`;
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

function SparkleIcon({ className = "" }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M12 0 14.09 8.26 22 10l-7.91 1.74L12 20l-2.09-8.26L2 10l7.91-1.74L12 0z" />
    </svg>
  );
}

function HeroMascot() {
  return (
    <div className="relative mx-auto flex w-full max-w-xl items-center justify-center lg:mx-0 lg:max-w-2xl">
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-[130%] w-[130%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(57,255,20,0.12)_0%,transparent_70%)]"
        aria-hidden="true"
      />

      <div
        className="pointer-events-none absolute right-[16%] top-[12%] h-2 w-2 animate-pulse-neon rounded-full bg-neon-green/45 blur-[1px]"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute right-[30%] top-[26%] h-1.5 w-1.5 rounded-full bg-white/30 blur-[0.5px]"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute left-[18%] top-[20%] h-1 w-1 rounded-full bg-teal-300/35"
        aria-hidden="true"
      />

      <div
        className="pointer-events-none absolute bottom-[5%] left-1/2 z-0 h-10 w-[58%] -translate-x-1/2 rounded-[100%] bg-black/50 blur-2xl"
        aria-hidden="true"
      />

      <div className="animate-float relative z-10 w-full bg-transparent">
        <img
          src={mascotCloud}
          alt="Mascote Plano Ideal — consultor de internet fibra sobre nuvem"
          className="mx-auto h-auto w-full max-w-md bg-transparent object-contain drop-shadow-[0_12px_40px_rgba(0,0,0,0.5)] sm:max-w-lg lg:max-w-xl"
          width={640}
          height={640}
          loading="eager"
          decoding="async"
        />
      </div>

      <SparkleIcon className="pointer-events-none absolute bottom-[20%] right-[6%] h-5 w-5 animate-pulse-neon text-white/25" />
    </div>
  );
}

function GlowingBlobs({ className = "" }) {
  return (
    <div
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}
      aria-hidden="true"
    >
      <div className="absolute -left-24 top-1/4 h-96 w-96 animate-blob-drift rounded-full bg-green-500 opacity-40 mix-blend-screen blur-[120px]" />
      <div
        className="absolute right-[-4rem] top-1/3 h-[28rem] w-[28rem] animate-blob-drift rounded-full bg-green-400 opacity-30 mix-blend-screen blur-[120px]"
        style={{ animationDelay: "-4s" }}
      />
      <div
        className="absolute bottom-[-6rem] left-1/2 h-96 w-96 -translate-x-1/2 animate-blob-drift rounded-full bg-green-500 opacity-35 mix-blend-screen blur-[120px]"
        style={{ animationDelay: "-8s" }}
      />
    </div>
  );
}

function CheckIcon() {
  return (
    <svg
      className="mt-0.5 h-4 w-4 shrink-0 text-neon-green"
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
  );
}

function PlanCard({
  plan,
  onSelect,
}: {
  plan: InternetPlan;
  onSelect: (plan: InternetPlan) => void;
}) {
  const isFeatured = plan.featured;
  const speedNumber = plan.speedLabel.split(" ")[0];
  const speedUnit = plan.speedLabel.includes("Giga") ? "Giga" : "Mega";

  return (
    <article
      className={`relative flex flex-col rounded-[2rem] border p-6 transition duration-300 sm:p-8 ${
        isFeatured
          ? "z-10 scale-105 border-neon-green/50 bg-white shadow-pi-featured"
          : "border-white/10 bg-white/95 shadow-pi-card backdrop-blur-sm hover:-translate-y-1 hover:shadow-neon-glow"
      }`}
      aria-label={`Plano ${plan.name} ${plan.speedLabel}`}
    >
      {plan.badge ? (
        <span className="absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-neon-green px-4 py-1.5 text-xs font-extrabold uppercase tracking-wide text-pi-dark shadow-neon-glow">
          {plan.badge}
        </span>
      ) : null}

      <span className="w-fit rounded-full bg-pi-dark/5 px-3 py-1 text-xs font-bold uppercase tracking-wider text-pi-dark/60">
        {isFeatured ? "Plano destaque" : "Internet Fibra"}
      </span>

      <h3 className="mt-4 text-lg font-bold text-pi-dark">{plan.name}</h3>

      <div className="mt-1 flex items-end gap-1.5">
        <span className="text-4xl font-black leading-none text-pi-dark sm:text-5xl">
          {speedNumber}
        </span>
        <span className="mb-1 text-base font-bold text-pi-dark/60">{speedUnit}</span>
      </div>

      <ul className="mt-5 flex-1 space-y-2.5" aria-label="Benefícios do plano">
        {plan.benefits.map((benefit) => (
          <li key={benefit} className="flex items-start gap-2 text-sm text-pi-dark/80">
            <CheckIcon />
            {benefit}
          </li>
        ))}
      </ul>

      <div className="mt-6 space-y-3 rounded-[1.5rem] bg-pi-dark/5 p-4">
        <div>
          <p className="text-xs text-pi-dark/50">Boleto / Débito</p>
          <p className="text-xl font-bold text-pi-dark/60 line-through decoration-pi-dark/25">
            {formatPrice(plan.priceStandard)}
            <span className="text-sm font-medium">/mês</span>
          </p>
        </div>

        <div className="relative pt-1">
          <span className="absolute -top-2 left-0 rounded-full bg-neon-green px-2.5 py-0.5 text-[10px] font-extrabold uppercase text-pi-dark">
            Desconto no Cartão −{formatPrice(plan.cardDiscount)}
          </span>
          <p className="pt-2 text-3xl font-black text-pi-dark">
            {formatPrice(plan.priceCard)}
            <span className="text-base font-semibold text-pi-dark/50">/mês</span>
          </p>
          <p className="mt-0.5 text-xs font-semibold text-neon-green">
            pagando no cartão de crédito
          </p>
        </div>
      </div>

      <p className="mt-3 text-center text-[11px] text-pi-dark/40">
        Preço fixo até jan/2030 · Taxa de habilitação isenta*
      </p>

      <button
        type="button"
        onClick={() => onSelect(plan)}
        className={`mt-5 w-full rounded-full px-6 py-4 text-sm font-extrabold transition duration-200 hover:scale-[1.02] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ${
          isFeatured
            ? "bg-neon-green text-pi-dark shadow-neon-glow hover:shadow-neon-glow-lg focus-visible:outline-neon-green"
            : "bg-pi-dark text-white hover:bg-pi-darker focus-visible:outline-neon-green"
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
  const [selectedPlan, setSelectedPlan] = useState<InternetPlan | null>(null);
  const [cepError, setCepError] = useState("");
  const [submitState, setSubmitState] = useState<ViabilitySubmitState>({ status: "idle" });

  const canSubmit = useMemo(() => name.trim() && cep.length === 9, [name, cep]);
  const isSubmitting = submitState.status === "submitting";
  const submitError = submitState.status === "error" ? submitState.message : "";

  const handleCepChange = (event: ChangeEvent<HTMLInputElement>) => {
    const formattedCep = maskCep(event.target.value);
    setCep(formattedCep);
    if (formattedCep.length === 9) setCepError("");
    setSubmitState({ status: "idle" });
  };

  const handlePlanSelect = (plan: InternetPlan) => {
    setSelectedPlan(plan);
    setSubmitState({ status: "idle" });
    document.getElementById("consulta-cobertura")?.scrollIntoView({ behavior: "smooth" });
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSubmitState({ status: "idle" });

    if (cep.length !== 9) {
      setCepError("Informe um CEP válido no formato 00000-000.");
      return;
    }

    try {
      setSubmitState({ status: "submitting" });
      const viability = await getPublicViabilityStatus(cep);
      const statusCode: PublicViabilityCode = isPublicViabilityCode(viability.statusCode)
        ? viability.statusCode
        : "V-NOK";
      const planLabel = selectedPlan
        ? `${selectedPlan.name} ${selectedPlan.speedLabel} — ${formatPrice(selectedPlan.priceCard)}/mês no cartão`
        : null;
      const whatsappLink = buildWhatsappLink({
        name: name.trim(),
        cep,
        facade,
        statusCode,
        planLabel,
      });
      window.open(whatsappLink, "_blank", "noopener,noreferrer");
      setSubmitState({ status: "idle" });
    } catch (error: unknown) {
      setSubmitState({
        status: "error",
        message:
          (error instanceof Error ? error.message : null) ||
          "Falha ao consultar cobertura. Tente novamente.",
      });
    }
  };

  return (
    <div className="min-h-screen bg-pi-dark text-white">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-pi-dark/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 md:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-neon-green text-sm font-black text-pi-dark">
              PI
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-neon-green">
                Plano Ideal
              </p>
              <h1 className="text-lg font-extrabold tracking-tight md:text-xl">Internet Fibra</h1>
            </div>
          </div>
          <a
            href="#planos"
            className="hidden rounded-full bg-neon-green px-5 py-2.5 text-sm font-extrabold text-pi-dark shadow-neon-glow transition hover:scale-105 sm:inline-flex"
            aria-label="Ver planos de internet disponíveis"
          >
            Ver planos
          </a>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="hero-mesh relative overflow-hidden border-b border-white/5">
          <GlowingBlobs />
          <div className="relative z-10 mx-auto max-w-6xl px-4 py-16 md:px-8 md:py-24">
            <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-12">
              <div className="mx-auto max-w-2xl text-center lg:mx-0 lg:text-left">
                <span className="inline-block rounded-full border border-neon-green/25 bg-neon-green/10 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-neon-green">
                  Nossa Fibra · ultra rápida
                </span>

                <h2 className="mt-6 text-4xl font-black leading-[1.08] tracking-tight md:text-6xl">
                  Internet fibra que <span className="text-neon-green">simplesmente funciona</span>
                </h2>

                <p className="mt-5 text-base leading-relaxed text-white/70 md:text-xl">
                  Velocidade real, Wi-Fi de última geração e{" "}
                  <strong className="font-bold text-neon-green">
                    preço fixo até janeiro de 2030
                  </strong>
                  . Sem surpresas na fatura.
                </p>

                <div className="mt-6 flex flex-wrap items-center justify-center gap-2 lg:justify-start">
                  {TRUST_PILLS.map((pill) => (
                    <span
                      key={pill}
                      className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-white/80 backdrop-blur-sm"
                    >
                      {pill}
                    </span>
                  ))}
                </div>

                <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row lg:justify-start">
                  <a
                    href="#planos"
                    className="w-full rounded-full bg-neon-green px-8 py-4 text-center text-base font-extrabold text-pi-dark shadow-neon-glow transition hover:scale-105 hover:shadow-neon-glow-lg sm:w-auto"
                  >
                    Escolher meu plano
                  </a>
                  <a
                    href="#consulta-cobertura"
                    className="w-full rounded-full border border-white/20 bg-white/5 px-8 py-4 text-center text-base font-bold text-white backdrop-blur-sm transition hover:bg-white/10 sm:w-auto"
                  >
                    Consultar meu CEP
                  </a>
                </div>
              </div>

              <HeroMascot />
            </div>

            <div className="mt-14 grid gap-4 sm:grid-cols-3">
              {HERO_FEATURES.map((item) => (
                <div
                  key={item.title}
                  className="rounded-[2rem] border border-white/10 bg-white/5 p-5 backdrop-blur-sm transition hover:border-neon-green/25"
                >
                  <span className="text-2xl" aria-hidden="true">
                    {item.emoji}
                  </span>
                  <p className="mt-2 text-sm font-bold text-white">{item.title}</p>
                  <p className="mt-1 text-xs leading-relaxed text-white/60">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Planos */}
        <section
          id="planos"
          className="relative overflow-hidden bg-pi-darker py-16 md:py-24"
          aria-labelledby="planos-titulo"
        >
          <GlowingBlobs />
          <div className="relative z-10 mx-auto max-w-6xl px-4 md:px-8">
            <div className="mb-12 text-center">
              <span className="rounded-full bg-neon-green/15 px-4 py-1 text-xs font-bold uppercase tracking-widest text-neon-green">
                Planos Internet Fibra
              </span>
              <h2 id="planos-titulo" className="mt-4 text-3xl font-black text-white md:text-5xl">
                Escolha sua velocidade
              </h2>
              <p className="mt-3 text-white/60">
                Todos com preço fixo até jan/2030 e isenção de taxa de habilitação*
              </p>
            </div>

            <div className="grid items-center gap-6 md:grid-cols-3 md:gap-4 lg:gap-6">
              {INTERNET_PLANS.map((plan) => (
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
          className="relative overflow-hidden border-t border-white/5 bg-pi-dark py-16 md:py-24"
          aria-labelledby="consulta-titulo"
        >
          <GlowingBlobs />
          <div className="relative z-10 mx-auto max-w-6xl px-4 md:px-8">
            <div className="mx-auto max-w-2xl rounded-[2rem] border border-white/10 bg-white/5 p-6 backdrop-blur-md md:p-10">
              <span className="rounded-full bg-neon-green/15 px-3 py-1 text-xs font-bold uppercase tracking-widest text-neon-green">
                Consulta de cobertura
              </span>
              <h2 id="consulta-titulo" className="mt-4 text-2xl font-black text-white md:text-3xl">
                Tem Nossa Fibra no seu endereço?
              </h2>
              <p className="mt-2 text-sm text-white/60">
                Informe seu CEP e fale com um consultor no WhatsApp com a viabilidade já preenchida.
              </p>

              {selectedPlan ? (
                <div className="mt-5 flex flex-wrap items-center gap-2 rounded-full border border-neon-green/30 bg-neon-green/10 px-4 py-2.5 text-sm text-neon-green">
                  <span className="font-bold">
                    {selectedPlan.name} {selectedPlan.speedLabel} —{" "}
                    {formatPrice(selectedPlan.priceCard)}/mês
                  </span>
                  <button
                    type="button"
                    onClick={() => setSelectedPlan(null)}
                    className="rounded-full bg-white/10 px-2 py-0.5 text-xs font-semibold text-white/70 transition hover:bg-white/20"
                    aria-label="Remover plano selecionado"
                  >
                    trocar
                  </button>
                </div>
              ) : null}

              <form className="mt-6 grid gap-4" onSubmit={handleSubmit} noValidate>
                <div>
                  <label
                    className="mb-1.5 block text-sm font-semibold text-white/80"
                    htmlFor="name"
                  >
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
                    <label
                      className="mb-1.5 block text-sm font-semibold text-white/80"
                      htmlFor="cep"
                    >
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
                      aria-describedby={cepError ? "cep-error" : "cep-hint"}
                      required
                    />
                    {cepError ? (
                      <p id="cep-error" className="mt-1.5 text-xs text-red-400" role="alert">
                        {cepError}
                      </p>
                    ) : (
                      <p id="cep-hint" className="mt-1.5 text-xs text-white/40">
                        Formato: 00000-000
                      </p>
                    )}
                  </div>

                  <div>
                    <label
                      className="mb-1.5 block text-sm font-semibold text-white/80"
                      htmlFor="facade"
                    >
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
                  className="w-full rounded-full bg-neon-green py-4 text-base font-extrabold text-pi-dark shadow-neon-glow transition hover:scale-[1.02] hover:shadow-neon-glow-lg disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
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

      <footer className="border-t border-white/5 bg-pi-darker">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-center text-sm text-white/40 md:flex-row md:px-8 md:text-left">
          <p>© {new Date().getFullYear()} Plano Ideal. Todos os direitos reservados.</p>
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
