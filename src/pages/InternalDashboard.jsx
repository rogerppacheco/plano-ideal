import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { clearSession, getSessionToken, getSessionUser } from "../lib/authSession";
import {
  createImportJob,
  getCoverageByCep,
  getImportJobStatus,
  getImportSummary,
} from "../services/api";
import { maskCep } from "../utils/coverage";

function buildTemplateCsv(operator) {
  const headers = [
    "CEP",
    "UF",
    "Cidade",
    "Bairro",
    "Logradouro",
    "Numero",
    "Complemento",
    "Tecnologia",
    "Velocidade",
    "Status",
    "Observacao",
  ];
  const example = [
    "30130-010",
    "MG",
    "Belo Horizonte",
    "Centro",
    "Rua Exemplo",
    "100",
    "Sala 1",
    "FTTH",
    "500",
    "Disponivel",
    `${operator} - linha de exemplo`,
  ];
  return `${headers.join(";")}\n${example.join(";")}`;
}

export default function InternalDashboard() {
  const navigate = useNavigate();
  const sessionUser = useMemo(() => getSessionUser(), []);
  const token = useMemo(() => getSessionToken(), []);
  const isAdmin = sessionUser?.role === "admin";

  const [cep, setCep] = useState("");
  const [result, setResult] = useState(null);
  const [consultError, setConsultError] = useState("");

  const [operator, setOperator] = useState("Vivo");
  const [files, setFiles] = useState([]);
  const [importFeedback, setImportFeedback] = useState("");
  const [importError, setImportError] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [jobProgress, setJobProgress] = useState(null);
  const [summary, setSummary] = useState({
    totalImportedRows: 0,
    byOperator: {},
    fieldsByOperator: {},
  });

  if (!sessionUser || !token) {
    return null;
  }

  useEffect(() => {
    if (!sessionUser || !token) {
      navigate("/interno");
      return;
    }

    if (isAdmin) {
      loadSummary();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionUser, token, isAdmin, navigate]);

  const loadSummary = async () => {
    try {
      const data = await getImportSummary(token);
      setSummary(data);
    } catch {
      setSummary({
        totalImportedRows: 0,
        byOperator: {},
        fieldsByOperator: {},
      });
    }
  };

  const handleLogout = () => {
    clearSession();
    navigate("/interno");
  };

  const handleCepChange = (event) => {
    setCep(maskCep(event.target.value));
    setConsultError("");
  };

  const handleConsultSubmit = async (event) => {
    event.preventDefault();

    if (cep.length !== 9) {
      setConsultError("Informe um CEP válido no formato 00000-000.");
      setResult(null);
      return;
    }

    try {
      const data = await getCoverageByCep(cep, token);
      setResult({ cep, operators: data.operators, records: data.records });
    } catch (apiError) {
      setConsultError(apiError.message || "Não foi possível consultar o CEP.");
      setResult(null);
    }
  };

  const handleTemplateDownload = (templateOperator) => {
    const csvContent = buildTemplateCsv(templateOperator);
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `modelo-importacao-${templateOperator.toLowerCase()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImportSubmit = async (event) => {
    event.preventDefault();
    setImportFeedback("");
    setImportError("");

    if (!files.length) {
      setImportError("Selecione ao menos um arquivo para importar.");
      return;
    }

    try {
      setIsImporting(true);
      setJobProgress(null);

      const payload = await createImportJob({ operator, files, token });
      const started = await pollImportJob(payload.jobId);

      if (started.status === "completed") {
        setImportFeedback(
          `Importação concluída. Registros válidos: ${started.imported_rows}. Ignorados (sem CEP válido): ${started.ignored_rows}.`
        );
        await loadSummary();
        setFiles([]);
        event.target.reset();
      } else if (started.status === "failed") {
        setImportError(started.error_message || "A importação falhou.");
      }
    } catch (apiError) {
      setImportError(apiError.message || "Não foi possível importar os arquivos.");
    } finally {
      setIsImporting(false);
    }
  };

  const pollImportJob = async (jobId) => {
    while (true) {
      const job = await getImportJobStatus(jobId, token);
      setJobProgress(job);

      if (job.status === "completed" || job.status === "failed") {
        return job;
      }

      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-extrabold text-slate-900">Área interna</h1>
              <p className="text-sm text-slate-600">
                Logado como {sessionUser.name} ({sessionUser.role}).
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
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
          <h2 className="text-xl font-bold text-slate-900">Consulta por CEP</h2>
          <p className="mt-1 text-sm text-slate-600">
            Consulta disponível para admin e vendedor.
          </p>

          <form className="mt-4 flex flex-col gap-3 sm:flex-row" onSubmit={handleConsultSubmit}>
            <input
              type="text"
              inputMode="numeric"
              value={cep}
              onChange={handleCepChange}
              placeholder="00000-000"
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              required
            />
            <button
              type="submit"
              className="rounded-xl bg-brand-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-brand-700"
            >
              Consultar
            </button>
          </form>

          {consultError ? <p className="mt-2 text-sm text-red-600">{consultError}</p> : null}

          {result ? (
            <div className="mt-4 rounded-xl bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-700">CEP consultado: {result.cep}</p>
              {result.operators.length > 0 ? (
                <>
                  <p className="mt-2 text-sm text-slate-800">
                    Operadoras disponíveis:{" "}
                    <span className="font-semibold">{result.operators.join(", ")}</span>
                  </p>
                  <p className="mt-2 text-xs text-slate-500">
                    Registros encontrados: {result.records?.length || 0}
                  </p>
                </>
              ) : (
                <p className="mt-2 text-sm font-semibold text-slate-800">
                  Nenhuma operadora disponível para este CEP.
                </p>
              )}
            </div>
          ) : null}
        </section>

        {isAdmin ? (
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card">
            <h2 className="text-xl font-bold text-slate-900">Importar bases para o banco interno</h2>
            <p className="mt-1 text-sm text-slate-600">
              Modelo: coluna com nome contendo "CEP" é obrigatória. Todos os outros campos da
              planilha são preservados integralmente.
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handleTemplateDownload("Vivo")}
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
              >
                Baixar modelo Vivo (.csv)
              </button>
              <button
                type="button"
                onClick={() => handleTemplateDownload("Nio")}
                className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
              >
                Baixar modelo Nio (.csv)
              </button>
            </div>

            <form className="mt-4 space-y-4" onSubmit={handleImportSubmit}>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="operator">
                  Operadora da base
                </label>
                <select
                  id="operator"
                  value={operator}
                  onChange={(event) => setOperator(event.target.value)}
                  className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                >
                  <option value="Vivo">Vivo</option>
                  <option value="Nio">Nio</option>
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="files">
                  Arquivos (.xlsx, .xls, .csv)
                </label>
                <input
                  id="files"
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  multiple
                  onChange={(event) => setFiles([...event.target.files])}
                  className="block w-full rounded-xl border border-slate-300 p-2 text-sm"
                />
              </div>

              {importError ? <p className="text-sm text-red-600">{importError}</p> : null}
              {importFeedback ? <p className="text-sm text-emerald-700">{importFeedback}</p> : null}

              {jobProgress ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                  <p className="font-semibold text-slate-800">
                    Status: {translateJobStatus(jobProgress.status)}
                  </p>
                  <p className="mt-1 text-slate-700">
                    Linhas processadas: {jobProgress.processed_rows} / {jobProgress.total_rows || 0}
                  </p>
                  <p className="text-slate-700">
                    Válidas: {jobProgress.imported_rows} | Ignoradas: {jobProgress.ignored_rows}
                  </p>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full rounded-full bg-brand-600 transition-all"
                      style={{ width: `${getProgressPercent(jobProgress)}%` }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-slate-600">
                    Progresso: {getProgressPercent(jobProgress)}%
                  </p>
                  {jobProgress.error_message ? (
                    <p className="mt-1 text-xs text-red-600">{jobProgress.error_message}</p>
                  ) : null}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={isImporting}
                className="rounded-xl bg-brand-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isImporting ? "Importando..." : "Importar base"}
              </button>
            </form>

            <div className="mt-6 rounded-xl bg-slate-50 p-4">
              <h3 className="text-sm font-bold text-slate-900">Resumo das importações</h3>
              <p className="mt-1 text-sm text-slate-700">
                Total de linhas importadas: <span className="font-semibold">{summary.totalImportedRows}</span>
              </p>
              <div className="mt-2 text-sm text-slate-700">
                Operadoras:
                {Object.keys(summary.byOperator).length > 0 ? (
                  <span className="font-semibold">
                    {" "}
                    {Object.entries(summary.byOperator)
                      .map(([name, count]) => `${name} (${count})`)
                      .join(" | ")}
                  </span>
                ) : (
                  <span className="font-semibold"> sem importações ainda</span>
                )}
              </div>

              <div className="mt-3 space-y-2">
                {Object.entries(summary.fieldsByOperator).map(([name, fields]) => (
                  <div key={name}>
                    <p className="text-sm font-semibold text-slate-800">Campos detectados - {name}</p>
                    <p className="text-xs text-slate-600">{fields.join(", ")}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        {!isAdmin ? (
          <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm text-amber-900">
              Seu perfil é vendedor. Importação de base disponível apenas para administradores.
            </p>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function getProgressPercent(job) {
  if (!job?.total_rows || job.total_rows <= 0) return 0;
  const percent = Math.round((job.processed_rows / job.total_rows) * 100);
  if (percent < 0) return 0;
  if (percent > 100) return 100;
  return percent;
}

function translateJobStatus(status) {
  if (status === "queued") return "Na fila";
  if (status === "processing") return "Processando";
  if (status === "completed") return "Concluído";
  if (status === "failed") return "Falhou";
  return status;
}
