import { useMemo, useState } from "react";
import { getPublicViabilityStatus } from "../services/api";
import { maskCep } from "../utils/coverage";

const WHATSAPP_NUMBER = "5511999999999";

function buildWhatsappLink({ name, cep, facade, statusCode }) {
  const reference = statusCode === "V-OK" ? "[Ref: V-OK]" : "[Ref: V-NOK]";
  const facadeInfo = facade?.trim() ? `Fachada: ${facade.trim()}. ` : "";
  const message = `Olá! Sou ${name}. Quero consultar cobertura no meu endereço. Meu CEP é ${cep}. ${facadeInfo}${reference}`;
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
}

export default function PublicLanding() {
  const [name, setName] = useState("");
  const [cep, setCep] = useState("");
  const [facade, setFacade] = useState("");
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
      const whatsappLink = buildWhatsappLink({
        name: name.trim(),
        cep,
        facade,
        statusCode: viability.statusCode,
      });
      window.open(whatsappLink, "_blank", "noopener,noreferrer");
    } catch (error) {
      setSubmitError(error.message || "Falha ao consultar cobertura. Tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen text-slate-900">
      <header className="border-b border-white/60 bg-white/80 backdrop-blur-md">
        <div className="mx-auto max-w-5xl px-4 py-4 md:px-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-brand-600">
              Consulta de Cobertura
            </p>
            <h1 className="text-xl font-extrabold md:text-2xl">Plano Ideal</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto flex min-h-[calc(100vh-80px)] max-w-6xl items-center px-4 py-12 md:px-8">
        <section className="surface-card w-full p-6 md:p-10">
          <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-brand-700">
            Qual plano ideal
          </p>
          <h2 className="text-2xl font-black leading-tight text-slate-900 md:text-4xl">
            Consulte cobertura pelo CEP
          </h2>
          <p className="mt-3 max-w-2xl text-sm text-slate-700 md:text-base">
            Descubra em segundos se a sua regiao possui cobertura e siga direto para o atendimento
            no WhatsApp.
          </p>

          <form className="mt-8 grid gap-4 md:grid-cols-3" onSubmit={handleSubmit}>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="name">
                Nome
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Digite seu nome"
                className="input-modern"
                required
              />
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="cep">
                CEP (Obrigatório)
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
                required
              />
              {cepError ? <p className="mt-1 text-xs text-red-600">{cepError}</p> : null}
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="facade">
                Fachada
              </label>
              <input
                id="facade"
                type="text"
                value={facade}
                onChange={(event) => setFacade(event.target.value)}
                placeholder="Ex: casa azul, número 120, perto da praça"
                className="input-modern"
              />
            </div>

            <button
              type="submit"
              disabled={!canSubmit || isSubmitting}
              className="btn-primary md:col-span-3 mt-2 py-4 text-base font-bold"
            >
              {isSubmitting ? "Consultando..." : "Consultar"}
            </button>
          </form>

          {submitError ? <p className="mt-3 text-sm text-red-600">{submitError}</p> : null}

          {!submitError ? (
            <p className="mt-3 text-xs text-slate-500">
              Dica: informe a fachada para facilitar a localizacao no atendimento.
            </p>
          ) : null}

          <div className="mt-6 grid gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 transition duration-200 hover:-translate-y-0.5 hover:bg-white">
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">Rapido</p>
              <p className="mt-1 text-sm text-slate-700">Consulta de viabilidade em poucos segundos.</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 transition duration-200 hover:-translate-y-0.5 hover:bg-white">
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">Direto no WhatsApp</p>
              <p className="mt-1 text-sm text-slate-700">Fluxo simples para acelerar o atendimento comercial.</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 transition duration-200 hover:-translate-y-0.5 hover:bg-white">
              <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">Privado</p>
              <p className="mt-1 text-sm text-slate-700">Triagem interna por referencia, sem expor regras ao cliente.</p>
            </div>
          </div>

          <div className="mt-4 text-right">
            <a
              href="/interno"
              className="text-xs text-slate-400 transition hover:text-slate-600"
            >
              Acesso interno
            </a>
          </div>
        </section>
      </main>
    </div>
  );
}
