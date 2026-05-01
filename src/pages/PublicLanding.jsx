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
    <div className="min-h-screen bg-gradient-to-b from-brand-50 to-slate-100 text-slate-900">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto max-w-5xl px-4 py-4 md:px-8">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-brand-600">
              Consulta de Cobertura
            </p>
            <h1 className="text-xl font-extrabold md:text-2xl">Plano Ideal</h1>
          </div>
        </div>
      </header>

      <main className="mx-auto flex min-h-[calc(100vh-80px)] max-w-5xl items-center px-4 py-12 md:px-8">
        <section className="w-full rounded-3xl border border-slate-200 bg-white p-6 shadow-card md:p-10">
          <p className="mb-2 text-sm font-semibold uppercase tracking-wide text-brand-700">
            Qual plano ideial
          </p>
          <h2 className="text-2xl font-black leading-tight md:text-4xl">
            Consulte cobertura pelo CEP
          </h2>

          <form className="mt-8 grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
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
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
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
                className={`w-full rounded-xl border px-4 py-3 text-sm text-slate-900 outline-none transition focus:ring-2 ${
                  cepError
                    ? "border-red-500 focus:border-red-500 focus:ring-red-100"
                    : "border-slate-300 focus:border-brand-500 focus:ring-brand-100"
                }`}
                required
              />
              {cepError ? <p className="mt-1 text-xs text-red-600">{cepError}</p> : null}
            </div>

            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="facade">
                Fachada
              </label>
              <input
                id="facade"
                type="text"
                value={facade}
                onChange={(event) => setFacade(event.target.value)}
                placeholder="Ex: casa azul, número 120, perto da praça"
                className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              />
            </div>

            <button
              type="submit"
              disabled={!canSubmit || isSubmitting}
              className="md:col-span-2 mt-2 rounded-xl bg-brand-600 px-5 py-4 text-base font-bold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isSubmitting ? "Consultando..." : "Consultar"}
            </button>
          </form>

          {submitError ? <p className="mt-3 text-sm text-red-600">{submitError}</p> : null}

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
