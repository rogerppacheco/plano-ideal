import { useEffect, useMemo, useState, type ChangeEvent, type FormEvent } from "react";
import mascotCloud from "../assets/mascot-cloud-hero.png";
import { SiteFooter } from "../components/SiteFooter";
import { SiteHeader } from "../components/SiteHeader";
import { BRAZILIAN_UFS } from "../constants/brazilianUfs";
import { COMPANY_DISCLAIMER, SITE_NAME } from "../content/company";
import { DEFAULT_INTERNET_PLANS, type InternetPlan } from "../constants/defaultPlans";
import {
  ApiError,
  getPublicCepLocation,
  getPublicCitiesByUf,
  getPublicCityPricing,
  getPublicSiteConfig,
  getPublicViabilityStatus,
} from "../services/api";
import type { GdpCityOption } from "../types/gdpPricing";
import type { PublicSiteConfig } from "../types/siteSettings";
import type { PublicViabilityCode } from "../types/coverage";
import { isPublicViabilityCode } from "../types/coverage";
import { matchCityInOptions } from "../utils/cityName";
import { hasLeadsWhatsappConfig, resolveLeadsWhatsappNumber } from "../utils/leadsWhatsapp";
import { maskCep } from "../utils/coverage";

type ViabilitySubmitState =
  { status: "idle" } | { status: "submitting" } | { status: "error"; message: string };

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
  whatsappNumber,
  name,
  cep,
  facade,
  statusCode,
  planLabel,
  uf,
  city,
}: {
  whatsappNumber: string;
  name: string;
  cep: string;
  facade: string;
  statusCode: PublicViabilityCode;
  planLabel: string | null;
  uf: string | null;
  city: string | null;
}): string {
  const reference = statusCode === "V-OK" ? "[Ref: V-OK]" : "[Ref: V-NOK]";
  const facadeInfo = facade?.trim() ? `Fachada: ${facade.trim()}. ` : "";
  const planInfo = planLabel ? `Plano de interesse: ${planLabel}. ` : "";
  const ufInfo = uf ? `Estado: ${uf}. ` : "";
  const cityInfo = city ? `Cidade: ${city}. ` : "";
  const message = `Olá! Sou ${name}. Quero contratar internet fibra com a ${SITE_NAME}. ${planInfo}Meu CEP é ${cep}. ${cityInfo}${ufInfo}${facadeInfo}${reference}`;
  return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
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
    <div className="relative z-0 mx-auto flex w-full max-w-sm shrink-0 items-center justify-center sm:max-w-md lg:mx-0 lg:max-w-lg">
      <div
        className="pointer-events-none absolute left-1/2 top-1/2 h-full w-full max-h-[28rem] max-w-[28rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[radial-gradient(circle,rgba(57,255,20,0.12)_0%,transparent_70%)]"
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
        className="pointer-events-none absolute bottom-[5%] left-1/2 z-0 h-8 w-[58%] -translate-x-1/2 rounded-[100%] bg-black/50 blur-2xl"
        aria-hidden="true"
      />

      <div className="animate-float relative z-0 w-full max-w-xs shrink-0 bg-transparent sm:max-w-sm lg:max-w-[22rem]">
        <img
          src={mascotCloud}
          alt={`Mascote ${SITE_NAME} — consultor de internet fibra sobre nuvem`}
          className="mx-auto h-auto max-h-[min(38vh,20rem)] w-full object-contain object-center drop-shadow-[0_12px_40px_rgba(0,0,0,0.5)]"
          width={512}
          height={512}
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
  const [siteConfig, setSiteConfig] = useState<PublicSiteConfig | null>(null);
  const [selectedUf, setSelectedUf] = useState("");
  const [selectedCity, setSelectedCity] = useState("");
  const [detectedUf, setDetectedUf] = useState<string | null>(null);
  const [detectedCity, setDetectedCity] = useState<string | null>(null);
  const [detectedCityKey, setDetectedCityKey] = useState<string | null>(null);
  const [detectedIbge, setDetectedIbge] = useState<number | null>(null);
  const [locationSource, setLocationSource] = useState<"coverage" | "viacep" | null>(null);
  const [cityOptions, setCityOptions] = useState<GdpCityOption[]>([]);
  const [isResolvingLocation, setIsResolvingLocation] = useState(false);
  const [isLoadingCities, setIsLoadingCities] = useState(false);
  const [ufError, setUfError] = useState("");
  const [cityError, setCityError] = useState("");
  const [displayPlans, setDisplayPlans] = useState<InternetPlan[]>(DEFAULT_INTERNET_PLANS);
  const [pricingCityLabel, setPricingCityLabel] = useState<string | null>(null);
  const [isLoadingPricing, setIsLoadingPricing] = useState(false);
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  const [submitState, setSubmitState] = useState<ViabilitySubmitState>({ status: "idle" });

  useEffect(() => {
    let cancelled = false;
    getPublicSiteConfig()
      .then((config) => {
        if (!cancelled) setSiteConfig(config);
      })
      .catch(() => {
        if (!cancelled) setSiteConfig(null);
      })
      .finally(() => {
        if (!cancelled) setIsLoadingConfig(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (cep.length !== 9) {
      setDetectedUf(null);
      setDetectedCity(null);
      setDetectedCityKey(null);
      setDetectedIbge(null);
      setLocationSource(null);
      setSelectedUf("");
      setSelectedCity("");
      setCityOptions([]);
      setUfError("");
      setCityError("");
      setIsResolvingLocation(false);
      setDisplayPlans(DEFAULT_INTERNET_PLANS);
      setPricingCityLabel(null);
      return;
    }

    let cancelled = false;
    setIsResolvingLocation(true);
    setUfError("");
    setCityError("");

    getPublicCepLocation(cep)
      .then((location) => {
        if (cancelled) return;
        setDetectedUf(location.uf);
        setDetectedCity(location.city);
        setDetectedCityKey(location.cityKey);
        setDetectedIbge(location.ibgeCode);
        setLocationSource(location.source);
        setSelectedUf(location.uf || "");
      })
      .catch(() => {
        if (cancelled) return;
        setDetectedUf(null);
        setDetectedCity(null);
        setDetectedCityKey(null);
        setDetectedIbge(null);
        setLocationSource(null);
        setSelectedUf("");
        setSelectedCity("");
        setUfError("Não foi possível identificar a localização pelo CEP. Selecione estado e cidade.");
      })
      .finally(() => {
        if (!cancelled) setIsResolvingLocation(false);
      });

    return () => {
      cancelled = true;
    };
  }, [cep]);

  useEffect(() => {
    if (!selectedUf) {
      setCityOptions([]);
      setSelectedCity("");
      return;
    }

    let cancelled = false;
    setIsLoadingCities(true);
    getPublicCitiesByUf(selectedUf)
      .then((response) => {
        if (cancelled) return;
        const cities = response.cities || [];
        setCityOptions(cities);
        const matchedCity =
          detectedUf === selectedUf
            ? matchCityInOptions(cities, {
                city: detectedCity,
                cityKey: detectedCityKey,
                ibgeCode: detectedIbge,
              })
            : "";
        setSelectedCity((current) => current || matchedCity);
      })
      .catch(() => {
        if (!cancelled) {
          setCityOptions([]);
          setSelectedCity("");
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingCities(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedUf, detectedCity, detectedCityKey, detectedIbge]);

  useEffect(() => {
    if (!selectedUf || !selectedCity) {
      setDisplayPlans(DEFAULT_INTERNET_PLANS);
      setPricingCityLabel(null);
      return;
    }

    let cancelled = false;
    setIsLoadingPricing(true);
    getPublicCityPricing({
      uf: selectedUf,
      city: selectedCity,
      ibgeCode: detectedIbge,
    })
      .then((pricing) => {
        if (cancelled) return;
        if (pricing.plans?.length) {
          setDisplayPlans(pricing.plans);
          setPricingCityLabel(`${pricing.city}/${pricing.uf}`);
        } else {
          setDisplayPlans(DEFAULT_INTERNET_PLANS);
          setPricingCityLabel(null);
        }
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setDisplayPlans(DEFAULT_INTERNET_PLANS);
        setPricingCityLabel(null);
        if (error instanceof ApiError && error.status !== 404) {
          setCityError("Não foi possível carregar os preços desta cidade.");
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingPricing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedUf, selectedCity, detectedIbge]);

  useEffect(() => {
    if (!selectedPlan) return;
    const refreshed = displayPlans.find((plan) => plan.id === selectedPlan.id);
    if (refreshed && refreshed.priceCard !== selectedPlan.priceCard) {
      setSelectedPlan(refreshed);
    }
  }, [displayPlans, selectedPlan]);

  const effectiveUf = selectedUf || null;
  const effectiveCity = selectedCity || null;
  const locationWasDetected = Boolean(detectedUf || detectedCity);

  const whatsappNumber = useMemo(
    () => resolveLeadsWhatsappNumber(siteConfig, effectiveUf),
    [siteConfig, effectiveUf]
  );

  const canSubmit = useMemo(
    () =>
      Boolean(
        name.trim() &&
          cep.length === 9 &&
          effectiveUf &&
          effectiveCity &&
          whatsappNumber &&
          hasLeadsWhatsappConfig(siteConfig) &&
          !isLoadingConfig &&
          !isResolvingLocation &&
          !isLoadingCities
      ),
    [
      name,
      cep,
      effectiveUf,
      effectiveCity,
      whatsappNumber,
      siteConfig,
      isLoadingConfig,
      isResolvingLocation,
      isLoadingCities,
    ]
  );
  const isSubmitting = submitState.status === "submitting";
  const submitError = submitState.status === "error" ? submitState.message : "";

  const handleCepChange = (event: ChangeEvent<HTMLInputElement>) => {
    const formattedCep = maskCep(event.target.value);
    setCep(formattedCep);
    if (formattedCep.length === 9) setCepError("");
    setSubmitState({ status: "idle" });
  };

  const handleManualUfChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setSelectedUf(event.target.value);
    setSelectedCity("");
    setUfError("");
    setCityError("");
    setSubmitState({ status: "idle" });
  };

  const handleManualCityChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setSelectedCity(event.target.value);
    setCityError("");
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

    if (!effectiveUf) {
      setUfError("Selecione seu estado para continuar.");
      return;
    }

    if (!effectiveCity) {
      setCityError("Selecione sua cidade para continuar.");
      return;
    }

    if (!whatsappNumber) {
      setSubmitState({
        status: "error",
        message: "Contato temporariamente indisponível para o seu estado. Tente novamente mais tarde.",
      });
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
        whatsappNumber,
        name: name.trim(),
        cep,
        facade,
        statusCode,
        planLabel,
        uf: effectiveUf,
        city: effectiveCity,
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
    <div className="min-h-[100dvh] bg-pi-dark text-white">
      <SiteHeader variant="landing" />

      <main>
        {/* Hero */}
        <section className="hero-mesh relative flex min-h-[calc(100svh-4.75rem)] flex-col overflow-hidden border-b border-white/5">
          <GlowingBlobs />
          <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-4 py-6 md:px-8 md:py-8">
            <div className="grid items-center gap-6 lg:grid-cols-2 lg:gap-10">
              <div className="relative z-10 order-1 mx-auto max-w-2xl text-center lg:order-none lg:mx-0 lg:text-left">
                <span className="inline-block rounded-full border border-neon-green/25 bg-neon-green/10 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-neon-green">
                  Nossa Fibra · ultra rápida
                </span>

                <h1 className="mt-4 text-4xl font-black leading-[1.08] tracking-tight md:text-5xl xl:text-6xl">
                  Internet fibra que <span className="text-neon-green">simplesmente funciona</span>
                </h1>

                <p className="mt-4 text-base leading-relaxed text-white/70 md:text-lg">
                  Velocidade real, Wi-Fi de última geração e{" "}
                  <strong className="font-bold text-neon-green">
                    preço fixo até janeiro de 2030
                  </strong>
                  . Sem surpresas na fatura.
                </p>

                <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row lg:justify-start">
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

                <div className="mt-5 flex flex-wrap items-center justify-center gap-2 lg:justify-start">
                  {TRUST_PILLS.map((pill) => (
                    <span
                      key={pill}
                      className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-semibold text-white/80 backdrop-blur-sm"
                    >
                      {pill}
                    </span>
                  ))}
                </div>
                <p className="mt-4 text-xs leading-relaxed text-white/45 md:text-sm">
                  {COMPANY_DISCLAIMER}
                </p>
              </div>

              <div className="relative z-0 order-2 shrink-0 lg:order-none">
                <HeroMascot />
              </div>
            </div>

            <div className="mt-8 grid gap-4 sm:grid-cols-3">
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
              {pricingCityLabel ? (
                <p className="mt-2 text-sm font-semibold text-neon-green">
                  Preços para {pricingCityLabel}
                  {isLoadingPricing ? " (atualizando…)" : ""}
                </p>
              ) : (
                <p className="mt-2 text-sm text-white/45">
                  Informe seu CEP na consulta abaixo para ver os preços da sua cidade.
                </p>
              )}
            </div>

            <div className="grid items-center gap-6 md:grid-cols-3 md:gap-4 lg:gap-6">
              {displayPlans.map((plan) => (
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
                      htmlFor="uf"
                    >
                      Estado <span className="text-neon-green">*</span>
                    </label>
                    {isResolvingLocation ? (
                      <p className="rounded-full border border-white/15 bg-white/10 px-5 py-3.5 text-sm text-white/60">
                        Identificando localização pelo CEP…
                      </p>
                    ) : (
                      <>
                        <select
                          id="uf"
                          value={selectedUf}
                          onChange={handleManualUfChange}
                          className={`select-dark w-full rounded-full border bg-white/10 px-5 py-3.5 text-sm text-white outline-none transition focus:ring-2 ${
                            ufError
                              ? "border-red-400 focus:border-red-400 focus:ring-red-400/20"
                              : "border-white/15 focus:border-neon-green/50 focus:ring-neon-green/20"
                          }`}
                          aria-invalid={ufError ? "true" : "false"}
                          aria-describedby={ufError ? "uf-error" : "uf-hint"}
                          required
                        >
                          <option value="" className="bg-pi-dark text-white">
                            Selecione seu estado
                          </option>
                          {BRAZILIAN_UFS.map((state) => (
                            <option key={state.uf} value={state.uf} className="bg-pi-dark text-white">
                              {state.name} ({state.uf})
                            </option>
                          ))}
                        </select>
                        {detectedUf && selectedUf === detectedUf ? (
                          <p id="uf-hint" className="mt-1.5 text-xs text-neon-green/80">
                            Estado identificado automaticamente
                            {locationSource === "coverage" ? " pela base de cobertura" : " pelo CEP"}.
                            Você pode alterar se necessário.
                          </p>
                        ) : ufError ? (
                          <p id="uf-error" className="mt-1.5 text-xs text-red-400" role="alert">
                            {ufError}
                          </p>
                        ) : (
                          <p id="uf-hint" className="mt-1.5 text-xs text-white/40">
                            Selecione ou confirme seu estado.
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
                    <label
                      className="mb-1.5 block text-sm font-semibold text-white/80"
                      htmlFor="city"
                    >
                      Cidade <span className="text-neon-green">*</span>
                    </label>
                    {isLoadingCities ? (
                      <p className="rounded-full border border-white/15 bg-white/10 px-5 py-3.5 text-sm text-white/60">
                        Carregando cidades com cobertura…
                      </p>
                    ) : (
                      <>
                        <select
                          id="city"
                          value={selectedCity}
                          onChange={handleManualCityChange}
                          disabled={!selectedUf || cityOptions.length === 0}
                          className={`select-dark w-full rounded-full border bg-white/10 px-5 py-3.5 text-sm text-white outline-none transition focus:ring-2 disabled:cursor-not-allowed disabled:opacity-50 ${
                            cityError
                              ? "border-red-400 focus:border-red-400 focus:ring-red-400/20"
                              : "border-white/15 focus:border-neon-green/50 focus:ring-neon-green/20"
                          }`}
                          aria-invalid={cityError ? "true" : "false"}
                          aria-describedby={cityError ? "city-error" : "city-hint"}
                          required
                        >
                          <option value="" className="bg-pi-dark text-white">
                            {selectedUf ? "Selecione sua cidade" : "Selecione o estado primeiro"}
                          </option>
                          {cityOptions.map((city) => (
                            <option
                              key={`${city.municipio_key}-${city.cod_ibge ?? "na"}`}
                              value={city.municipio}
                              className="bg-pi-dark text-white"
                            >
                              {city.municipio}
                            </option>
                          ))}
                        </select>
                        {detectedCity && selectedCity && locationWasDetected ? (
                          <p id="city-hint" className="mt-1.5 text-xs text-neon-green/80">
                            Cidade identificada: {detectedCity}. Você pode trocar manualmente se
                            necessário.
                          </p>
                        ) : cityError ? (
                          <p id="city-error" className="mt-1.5 text-xs text-red-400" role="alert">
                            {cityError}
                          </p>
                        ) : (
                          <p id="city-hint" className="mt-1.5 text-xs text-white/40">
                            {selectedUf
                              ? "Escolha a cidade para ver os preços corretos do seu município."
                              : "Informe o CEP ou selecione o estado para carregar as cidades."}
                          </p>
                        )}
                      </>
                    )}
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="sm:col-span-2">
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

      <SiteFooter showNav showInternalAccess />
    </div>
  );
}
