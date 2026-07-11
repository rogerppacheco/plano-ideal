import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { maskCep } from "../utils/coverage";
import { EmptyState } from "../components/ui/EmptyState";
import { FormField } from "../components/ui/FormField";
import { PanelCard } from "../components/ui/PanelCard";
import { useToast } from "../components/ui/Toast";

export default function InternalConsult() {
  const navigate = useNavigate();
  const toast = useToast();
  const [cep, setCep] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [isConsulting, setIsConsulting] = useState(false);

  const handleCepChange = (event) => {
    setCep(maskCep(event.target.value));
    setError("");
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (cep.length !== 9) {
      setError("Informe um CEP válido no formato 00000-000.");
      setResult(null);
      return;
    }

    setIsConsulting(true);
    await new Promise((r) => setTimeout(r, 400));
    const operators = [];
    setResult({ cep, operators });
    setIsConsulting(false);

    if (operators.length > 0) {
      toast.success(`${operators.length} operadora(s) encontrada(s) para o CEP.`);
    } else {
      toast.warning("Nenhuma operadora disponível para este CEP.");
    }
  };

  const handleLogout = () => {
    sessionStorage.removeItem("internalAuth");
    navigate("/interno");
  };

  return (
    <div className="dashboard-shell">
      <div className="dashboard-container max-w-2xl">
        <PanelCard
          title="Consulta interna por CEP"
          description="Resultado visível somente para o time interno."
          action={
            <button type="button" onClick={handleLogout} className="btn-secondary">
              Sair
            </button>
          }
        >
          <form className="space-y-4" onSubmit={handleSubmit}>
            <FormField
              id="internal-cep"
              label="CEP"
              hint="Digite o CEP com hífen. Ex: 30130-010"
              error={error}
              required
            >
              {({ id, describedBy, "aria-invalid": ariaInvalid }) => (
                <input
                  id={id}
                  type="text"
                  inputMode="numeric"
                  value={cep}
                  onChange={handleCepChange}
                  placeholder="00000-000"
                  className="input-modern"
                  aria-describedby={describedBy}
                  aria-invalid={ariaInvalid}
                  required
                />
              )}
            </FormField>

            <button type="submit" className="btn-primary" disabled={isConsulting}>
              {isConsulting ? "Consultando…" : "Consultar CEP"}
            </button>
          </form>

          {isConsulting ? (
            <div className="mt-6 space-y-2" role="status" aria-label="Consultando CEP">
              <div className="skeleton h-4 w-48" />
              <div className="skeleton h-3 w-full" />
            </div>
          ) : result ? (
            <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-700">CEP consultado: {result.cep}</p>
              {result.operators.length > 0 ? (
                <p className="mt-2 text-sm text-slate-800">
                  Operadoras disponíveis:{" "}
                  <span className="font-semibold">{result.operators.join(", ")}</span>
                </p>
              ) : (
                <p className="mt-2 text-sm font-semibold text-slate-800">
                  Nenhuma operadora disponível para este CEP.
                </p>
              )}
            </div>
          ) : (
            <div className="mt-6">
              <EmptyState
                icon="search"
                title="Nenhum CEP consultado ainda"
                description="Informe um CEP válido e clique em consultar para ver as operadoras disponíveis."
              />
            </div>
          )}
        </PanelCard>
      </div>
    </div>
  );
}
