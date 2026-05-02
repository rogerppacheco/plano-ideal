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
  const consultedAddress = useMemo(() => formatAddressFromRecords(result?.records), [result]);

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

      const finishing =
        job.status === "processing" &&
        job.total_rows > 0 &&
        job.processed_rows >= job.total_rows;
      await new Promise((resolve) => setTimeout(resolve, finishing ? 250 : 1200));
    }
  };

  return (
    <div className="min-h-screen px-4 py-10">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="surface-card p-6">
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
              className="btn-secondary"
            >
              Sair
            </button>
          </div>
        </div>

        <section className="surface-card p-6">
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
              className="input-modern"
              required
            />
            <button
              type="submit"
              className="btn-primary"
            >
              Consultar
            </button>
          </form>

          {consultError ? <p className="mt-2 text-sm text-red-600">{consultError}</p> : null}

          {result ? (
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-semibold text-slate-700">
                CEP consultado: {result.cep}
                {consultedAddress ? `, ${consultedAddress}` : ""}
              </p>
              <details className="mt-2 rounded-lg bg-white p-3 ring-1 ring-slate-200">
                <summary className="cursor-pointer text-sm font-semibold text-slate-700">
                  Ver todos os números por operadora
                </summary>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Vivo (NUM)
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {renderNumberChips(result.records, "Vivo", [
                        "NUM",
                        "Numero",
                        "NUMERO",
                        "numero",
                      ])}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Nio (NUM_FACHADA)
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {renderNumberChips(result.records, "Nio", [
                        "NUM_FACHADA",
                        "Num_Fachada",
                        "num_fachada",
                      ])}
                    </div>
                  </div>
                </div>
              </details>
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
          ) : (
            <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50/80 p-4">
              <p className="text-sm font-semibold text-slate-700">Nenhum CEP consultado ainda</p>
              <p className="mt-1 text-xs text-slate-600">
                Digite um CEP valido e clique em consultar para ver operadoras e detalhes.
              </p>
            </div>
          )}
        </section>

        {isAdmin ? (
          <section className="surface-card p-6">
            <h2 className="text-xl font-bold text-slate-900">Importar bases para o banco interno</h2>
            <p className="mt-1 text-sm text-slate-600">
              Modelo: coluna com nome contendo "CEP" é obrigatória. Todos os outros campos da
              planilha são preservados integralmente.
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handleTemplateDownload("Vivo")}
                className="btn-secondary px-3 py-2 text-xs"
              >
                Baixar modelo Vivo (.csv)
              </button>
              <button
                type="button"
                onClick={() => handleTemplateDownload("Nio")}
                className="btn-secondary px-3 py-2 text-xs"
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
                  className="input-modern"
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
                  className="input-modern block p-2"
                />
              </div>

              {importError ? <p className="text-sm text-red-600">{importError}</p> : null}
              {importFeedback ? <p className="text-sm text-emerald-700">{importFeedback}</p> : null}

              {jobProgress ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
                  <p className="font-semibold text-slate-800">
                    Status: {translateJobStatus(jobProgress.status)}
                  </p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    {buildJobStages(jobProgress).map((stage) => (
                      <div
                        key={stage.label}
                        className={`rounded-lg border px-3 py-2 text-xs ${
                          stage.state === "done"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                            : stage.state === "active"
                              ? "border-brand-200 bg-brand-50 text-brand-800"
                              : "border-slate-200 bg-white text-slate-500"
                        }`}
                      >
                        <p className="font-semibold">{stage.label}</p>
                        <p className="mt-1">{stage.text}</p>
                      </div>
                    ))}
                  </div>
                  {jobProgress.current_step ? (
                    <p className="mt-2 rounded-lg bg-white px-3 py-2 text-slate-800 ring-1 ring-slate-200">
                      <span className="text-xs font-semibold uppercase text-slate-600">Etapa atual</span>
                      <br />
                      {jobProgress.current_step}
                    </p>
                  ) : null}
                  {jobProgress.file_bytes_read ? (
                    <p className="mt-1 text-xs text-slate-600">
                      Arquivo lido: {formatBytes(jobProgress.file_bytes_read)}
                    </p>
                  ) : null}
                  {jobProgress.status === "processing" &&
                  (jobProgress.total_rows || 0) === 0 &&
                  !jobProgress.current_step?.includes("Parseando") ? (
                    <p className="mt-2 text-xs text-amber-800">
                      Enquanto “Linhas processadas” estiver 0/0, o worker pode estar lendo o arquivo ou
                      parseando o CSV inteiro na memória — isso pode demorar em arquivos grandes.
                    </p>
                  ) : null}
                  <p className="mt-2 text-slate-700">
                    Linhas processadas: {jobProgress.processed_rows} / {jobProgress.total_rows || 0}
                  </p>
                  <p className="text-slate-700">
                    Válidas: {jobProgress.imported_rows} | Ignoradas: {jobProgress.ignored_rows}
                  </p>
                  {jobProgress.status === "processing" &&
                  jobProgress.total_rows > 0 &&
                  jobProgress.processed_rows >= jobProgress.total_rows ? (
                    <p className="mt-2 text-xs font-medium text-amber-800">
                      Dados já processados — aguardando o servidor gravar o status &quot;concluído&quot; (alguns segundos).
                    </p>
                  ) : null}
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                    <div
                      className="h-full rounded-full bg-brand-600 transition-all"
                      style={{ width: `${getProgressPercent(jobProgress)}%` }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-slate-700">
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
                className="btn-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isImporting ? "Importando..." : "Importar base"}
              </button>
            </form>

            <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <h3 className="text-sm font-bold text-slate-900">Resumo das importações</h3>
              <div className="mt-3 grid gap-3 md:grid-cols-3">
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <p className="text-xs font-semibold uppercase text-slate-500">Total importado</p>
                  <p className="mt-1 text-2xl font-black text-slate-900">
                    {summary.totalImportedRows.toLocaleString("pt-BR")}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <p className="text-xs font-semibold uppercase text-slate-500">Operadoras</p>
                  <p className="mt-1 text-2xl font-black text-slate-900">
                    {Object.keys(summary.byOperator).length}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <p className="text-xs font-semibold uppercase text-slate-500">Campos mapeados</p>
                  <p className="mt-1 text-2xl font-black text-slate-900">
                    {Object.values(summary.fieldsByOperator).reduce((acc, fields) => acc + fields.length, 0)}
                  </p>
                </div>
              </div>
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
                {Object.entries(summary.fieldsByOperator).length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-300 bg-white p-3">
                    <p className="text-sm font-semibold text-slate-700">Nenhum campo mapeado ainda</p>
                    <p className="mt-1 text-xs text-slate-600">
                      Os campos aparecerao aqui apos a primeira importacao concluida.
                    </p>
                  </div>
                ) : (
                  Object.entries(summary.fieldsByOperator).map(([name, fields]) => (
                    <div key={name}>
                      <p className="text-sm font-semibold text-slate-800">Campos detectados - {name}</p>
                      <p className="text-xs text-slate-700">{fields.join(", ")}</p>
                    </div>
                  ))
                )}
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
  /* Job concluído: barra 100% (não confundir com % de linhas com CEP válido). */
  if (job.status === "completed") return 100;
  const raw = Math.round((job.processed_rows / job.total_rows) * 100);
  if (raw < 0) return 0;
  if (raw > 100) return 100;
  if (job.status === "processing" && raw >= 100) return 99;
  return raw;
}

function translateJobStatus(status) {
  if (status === "queued") return "Na fila";
  if (status === "processing") return "Processando";
  if (status === "completed") return "Concluído";
  if (status === "failed") return "Falhou";
  return status;
}

function formatBytes(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function formatAddressFromRecords(records) {
  if (!Array.isArray(records) || records.length === 0) return "";
  const row = records[0]?.row_data || {};
  const logradouro = pickField(row, ["LOGRADOURO", "logradouro", "ENDERECO", "ENDEREÇO", "endereco"]);
  const numero = pickField(row, ["NUM", "Numero", "NUMERO", "numero", "NUM_FACHADA", "num_fachada"]);
  const bairro = pickField(row, ["BAIRRO", "bairro"]);
  const cidade = pickField(row, ["CIDADE", "Cidade", "MUNICIPIO", "municipio", "MUNICÍPIO"]);
  const uf = pickField(row, ["UF", "uf"]);

  const ruaNumero = [logradouro, numero].filter(Boolean).join(", ");
  const cidadeUf = [cidade, uf].filter(Boolean).join("/");
  return [ruaNumero, bairro, cidadeUf].filter(Boolean).join(" - ");
}

function pickField(source, keys) {
  for (const key of keys) {
    const value = source?.[key];
    if (value == null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
}

function getOperatorNumberList(records, operatorName, keys) {
  if (!Array.isArray(records) || records.length === 0) return [];
  const values = new Set();
  for (const record of records) {
    if (record?.operator !== operatorName) continue;
    const raw = pickField(record?.row_data || {}, keys);
    if (raw) values.add(raw);
  }
  return Array.from(values);
}

function renderNumberChips(records, operatorName, keys) {
  const list = getOperatorNumberList(records, operatorName, keys);
  if (list.length === 0) {
    return <span className="text-sm text-slate-600">—</span>;
  }
  const mobileLimit = 16;
  const fullLimit = 80;
  const visibleList = list.slice(0, fullLimit);
  const hiddenCount = Math.max(0, list.length - mobileLimit);

  return (
    <>
      {visibleList.map((value, idx) => (
        <span
          key={`${operatorName}-${value}`}
          className={`rounded-full border border-slate-300 bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 ${
            idx >= mobileLimit ? "hidden sm:inline-flex" : "inline-flex"
          }`}
        >
          {value}
        </span>
      ))}
      {hiddenCount > 0 ? (
        <span className="inline-flex rounded-full border border-brand-200 bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-700 sm:hidden">
          +{hiddenCount} no mobile
        </span>
      ) : null}
    </>
  );
}

function buildJobStages(job) {
  const status = job?.status;
  const isQueued = status === "queued";
  const isProcessing = status === "processing";
  const isCompleted = status === "completed";
  const isFailed = status === "failed";
  const hasRows = Number(job?.total_rows || 0) > 0;
  const finishing = isProcessing && hasRows && (job?.processed_rows || 0) >= (job?.total_rows || 0);

  return [
    {
      label: "1. Fila",
      state: isQueued ? "active" : "done",
      text: isQueued ? "Aguardando inicio" : "Etapa concluida",
    },
    {
      label: "2. Processamento",
      state: isProcessing ? "active" : isCompleted || isFailed ? "done" : "pending",
      text: isProcessing ? "Lendo e validando planilhas" : "Etapa concluida",
    },
    {
      label: "3. Finalizacao",
      state: isCompleted ? "done" : finishing ? "active" : isFailed ? "active" : "pending",
      text: isCompleted
        ? "Importacao concluida"
        : isFailed
          ? "Falha na importacao"
          : "Consolidando dados",
    },
  ];
}
