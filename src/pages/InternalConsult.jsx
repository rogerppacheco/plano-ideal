import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { getOperatorsByCep, maskCep } from "../utils/coverage";

export default function InternalConsult() {
  const navigate = useNavigate();
  const [cep, setCep] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const handleCepChange = (event) => {
    setCep(maskCep(event.target.value));
    setError("");
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    if (cep.length !== 9) {
      setError("Informe um CEP válido no formato 00000-000.");
      setResult(null);
      return;
    }

    const operators = getOperatorsByCep(cep);
    setResult({ cep, operators });
  };

  const handleLogout = () => {
    sessionStorage.removeItem("internalAuth");
    navigate("/interno");
  };

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-10">
      <div className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900">Consulta interna por CEP</h1>
            <p className="text-sm text-slate-600">
              Resultado visível somente para o time interno.
            </p>
          </div>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
          >
            Sair
          </button>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="cep">
              CEP
            </label>
            <input
              id="cep"
              type="text"
              inputMode="numeric"
              value={cep}
              onChange={handleCepChange}
              placeholder="00000-000"
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              required
            />
          </div>

          {error ? <p className="text-sm text-red-600">{error}</p> : null}

          <button
            type="submit"
            className="rounded-xl bg-brand-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-brand-700"
          >
            Consultar CEP
          </button>
        </form>

        {result ? (
          <div className="mt-6 rounded-xl bg-slate-50 p-4">
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
        ) : null}
      </div>
    </div>
  );
}
