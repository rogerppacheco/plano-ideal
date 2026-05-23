import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { clearSession, getSessionToken, getSessionUser } from "../lib/authSession";
import {
  createInternalUser,
  completeStuckImportJob,
  createImportJob,
  getActiveImportJob,
  getCoverageByCep,
  getImportJobStatus,
  getImportJobsHistory,
  getImportSummary,
  getInternalUsers,
  revertImportJob,
} from "../services/api";
import nioLogo from "../assets/operators/nio.png";
import vivoLogo from "../assets/operators/vivo.png";
import { maskCep, sortAddressNumbers } from "../utils/coverage";
import {
  getHeartbeatAgeMs,
  getImportProgressLabel,
  getImportProgressPercent,
  getPollIntervalMs,
  inferProgressPhase,
  isImportStalled,
  translateProgressPhase,
} from "../utils/importProgress";

const OPERATOR_LOGOS = {
  vivo: vivoLogo,
  nio: nioLogo,
};

const ACTIVE_IMPORT_STORAGE_KEY = "planoideal_active_import_job_id";

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
  const [activeTab, setActiveTab] = useState("consulta");

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
  const [importHistory, setImportHistory] = useState([]);
  const [importHistoryError, setImportHistoryError] = useState("");
  const [revertingJobId, setRevertingJobId] = useState(null);
  const [completingJobId, setCompletingJobId] = useState(null);
  const [users, setUsers] = useState([]);
  const [usersError, setUsersError] = useState("");
  const [usersFeedback, setUsersFeedback] = useState("");
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [newUser, setNewUser] = useState({
    username: "",
    fullName: "",
    role: "vendedor",
    password: "",
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
      loadUsers();
      loadImportHistory();
      resumeActiveImportJob();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionUser, token, isAdmin, navigate]);

  const loadSummary = async () => {
    try {
      const data = await getImportSummary(token);
      setSummary(data);
      return data;
    } catch {
      setSummary({
        totalImportedRows: 0,
        byOperator: {},
        fieldsByOperator: {},
      });
      return null;
    }
  };

  const loadImportHistory = async () => {
    try {
      const data = await getImportJobsHistory(token);
      setImportHistory(data.jobs || []);
      setImportHistoryError("");
    } catch (error) {
      setImportHistory([]);
      setImportHistoryError(
        error.message ||
          "Não foi possível carregar o histórico. Confira se a API no Railway foi atualizada (serviço plano-ideal-api)."
      );
    }
  };

  const handleCompleteStuckImport = async (job) => {
    if (!job?.id) return;
    try {
      setCompletingJobId(job.id);
      const result = await completeStuckImportJob(job.id, token);
      setImportFeedback(result.message || "Importação marcada como concluída.");
      setImportError("");
      setJobProgress(null);
      sessionStorage.removeItem(ACTIVE_IMPORT_STORAGE_KEY);
      await loadSummary();
      await loadImportHistory();
    } catch (error) {
      setImportError(error.message || "Não foi possível concluir a importação.");
    } finally {
      setCompletingJobId(null);
    }
  };

  const handleRevertImport = async (job) => {
    if (job.reverted_at) return;
    const label = job.files?.map((f) => f.file_name).join(", ") || `#${job.id}`;
    const ok = window.confirm(
      `Remover do banco todos os registros da importação #${job.id}?\n\nArquivo(s): ${label}\nOperadora marcada: ${job.operator}\n\nEsta ação não pode ser desfeita.`
    );
    if (!ok) return;

    try {
      setRevertingJobId(job.id);
      const result = await revertImportJob(job.id, token);
      setImportFeedback(result.message || "Importação removida.");
      setImportError("");
      await loadSummary();
      await loadImportHistory();
    } catch (error) {
      setImportError(error.message || "Não foi possível remover a importação.");
    } finally {
      setRevertingJobId(null);
    }
  };

  const loadUsers = async () => {
    if (!isAdmin) return;
    try {
      const data = await getInternalUsers(token);
      setUsers(data.users || []);
      setUsersError("");
    } catch (error) {
      setUsers([]);
      setUsersError(error.message || "Não foi possível carregar usuários.");
    }
  };

  const handleLogout = () => {
    clearSession();
    navigate("/");
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

  const handleCreateUserSubmit = async (event) => {
    event.preventDefault();
    setUsersFeedback("");
    setUsersError("");
    try {
      setIsCreatingUser(true);
      await createInternalUser({
        username: newUser.username,
        fullName: newUser.fullName,
        role: newUser.role,
        password: newUser.password,
        token,
      });
      setUsersFeedback("Usuário criado com sucesso.");
      setNewUser({ username: "", fullName: "", role: "vendedor", password: "" });
      await loadUsers();
    } catch (error) {
      setUsersError(error.message || "Não foi possível criar usuário.");
    } finally {
      setIsCreatingUser(false);
    }
  };

  const finishImportJob = async (job) => {
    sessionStorage.removeItem(ACTIVE_IMPORT_STORAGE_KEY);
    if (job.status === "completed") {
      setImportFeedback(
        `Importação #${job.id} concluída. Registros válidos: ${job.imported_rows}. Ignorados (sem CEP válido): ${job.ignored_rows}.`
      );
      await loadSummary();
      await loadImportHistory();
      if (job.operator_mismatch) {
        setImportError(
          `Atenção: você marcou "${job.operator}" mas o arquivo parece ser da operadora "${job.detected_operator}". Os dados foram gravados como ${job.operator}.`
        );
      }
    } else if (job.status === "failed") {
      setImportError(job.error_message || `A importação #${job.id} falhou.`);
    }
  };

  const pollImportJob = async (jobId) => {
    while (true) {
      const job = await getImportJobStatus(jobId, token);
      setJobProgress(job);
      sessionStorage.setItem(ACTIVE_IMPORT_STORAGE_KEY, String(jobId));

      if (job.status === "completed" || job.status === "failed") {
        return job;
      }

      await new Promise((resolve) => setTimeout(resolve, getPollIntervalMs(job)));
    }
  };

  const resumeActiveImportJob = async () => {
    let activeJob = null;
    try {
      const { job } = await getActiveImportJob(token);
      activeJob = job;
    } catch {
      // rota /import/jobs/active pode não existir em deploy antigo
    }

    if (!activeJob?.id) {
      const summaryData = await loadSummary();
      activeJob = summaryData?.activeJob || null;
    }

    if (activeJob?.id) {
      setActiveTab("importacoes");
      setIsImporting(true);
      setJobProgress(activeJob);
      sessionStorage.setItem(ACTIVE_IMPORT_STORAGE_KEY, String(activeJob.id));
      try {
        const finished = await pollImportJob(activeJob.id);
        await finishImportJob(finished);
      } finally {
        setIsImporting(false);
      }
      return;
    }

    try {
      const storedId = sessionStorage.getItem(ACTIVE_IMPORT_STORAGE_KEY);
      if (storedId) {
        try {
          const job = await getImportJobStatus(Number(storedId), token);
          if (job.status === "queued" || job.status === "processing") {
            setActiveTab("importacoes");
            setIsImporting(true);
            setJobProgress(job);
            const finished = await pollImportJob(job.id);
            await finishImportJob(finished);
            return;
          }
          sessionStorage.removeItem(ACTIVE_IMPORT_STORAGE_KEY);
        } catch {
          sessionStorage.removeItem(ACTIVE_IMPORT_STORAGE_KEY);
        }
      }
    } catch {
      sessionStorage.removeItem(ACTIVE_IMPORT_STORAGE_KEY);
    }
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
      sessionStorage.setItem(ACTIVE_IMPORT_STORAGE_KEY, String(payload.jobId));
      setActiveTab("importacoes");
      const started = await pollImportJob(payload.jobId);
      await finishImportJob(started);
      if (started.status === "completed") {
        setFiles([]);
        event.target.reset();
      }
    } catch (apiError) {
      setImportError(apiError.message || "Não foi possível importar os arquivos.");
      sessionStorage.removeItem(ACTIVE_IMPORT_STORAGE_KEY);
    } finally {
      setIsImporting(false);
    }
  };

  const importInProgress =
    jobProgress && (jobProgress.status === "queued" || jobProgress.status === "processing");

  return (
    <div className="min-h-screen px-4 py-10">
      <div className="mx-auto max-w-5xl space-y-6">
        {isAdmin && importInProgress ? (
          <div className="rounded-xl border-2 border-brand-400 bg-brand-50 p-4 shadow-sm">
            <p className="font-bold text-brand-900">
              Importação em andamento — job #{jobProgress.id} ({jobProgress.operator})
            </p>
            <p className="mt-1 text-sm text-brand-800">
              {jobProgress.current_step ||
                "Processando… Você pode atualizar a página; o progresso continua sendo carregado."}
            </p>
            <p className="mt-2 text-sm text-slate-700">
              {getImportProgressLabel(jobProgress)}
            </p>
            <ImportProgressDetails
              job={jobProgress}
              compact
              onCompleteStuck={handleCompleteStuckImport}
              completing={completingJobId === jobProgress.id}
            />
            <button
              type="button"
              onClick={() => setActiveTab("importacoes")}
              className="btn-primary mt-3 text-sm"
            >
              Ver detalhes da importação
            </button>
          </div>
        ) : null}

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

        <div className="surface-card p-3">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setActiveTab("consulta")}
              className={tabButtonClass(activeTab === "consulta")}
            >
              Consulta
            </button>
            {isAdmin ? (
              <button
                type="button"
                onClick={() => setActiveTab("importacoes")}
                className={tabButtonClass(activeTab === "importacoes")}
              >
                Importações
              </button>
            ) : null}
            {isAdmin ? (
              <button
                type="button"
                onClick={() => setActiveTab("usuarios")}
                className={tabButtonClass(activeTab === "usuarios")}
              >
                Usuários
              </button>
            ) : null}
          </div>
        </div>

        {activeTab === "consulta" ? (
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
                  {hasOperator(result.operators, "Vivo") ? (
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
                  ) : null}
                  {hasOperator(result.operators, "Nio") ? (
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
                  ) : null}
                </div>
              </details>
              {result.operators.length > 0 ? (
                <>
                  <p className="mt-2 text-sm text-slate-800">
                    Operadoras disponíveis:
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {result.operators.map((operatorName) => (
                      <span
                        key={operatorName}
                        className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-2.5 py-1.5"
                        title={operatorName}
                      >
                        <OperatorLogo operatorName={operatorName} />
                      </span>
                    ))}
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    {result.operators.join(" | ")}
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
        ) : null}

        {isAdmin && activeTab === "importacoes" ? (
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
                <p className="mt-1 text-xs text-slate-600">
                  A operadora escolhida define como os dados são gravados e consultados. Se enviar base
                  da Nio com &quot;Vivo&quot; selecionado, os CEPs aparecerão como Vivo e a deduplicação
                  por NUM_FACHADA não será aplicada.
                </p>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="files">
                  Arquivos (.csv recomendado, .xlsx)
                </label>
                <p className="mb-2 text-xs text-slate-600">
                  Arquivos grandes: prefira <strong>CSV</strong> (delimitador ;). Excel acima de ~60 MB pode falhar
                  no servidor.
                </p>
                <input
                  id="files"
                  type="file"
                  accept=".xlsx,.csv"
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
                  <ImportProgressDetails
                    job={jobProgress}
                    onCompleteStuck={handleCompleteStuckImport}
                    completing={completingJobId === jobProgress?.id}
                  />
                  <p className="mt-2 text-slate-700">
                    Linhas processadas:{" "}
                    {Number(jobProgress.processed_rows || 0).toLocaleString("pt-BR")} /{" "}
                    {Number(jobProgress.total_rows || 0).toLocaleString("pt-BR")}
                  </p>
                  <p className="text-slate-700">
                    Válidas: {Number(jobProgress.imported_rows || 0).toLocaleString("pt-BR")} | Ignoradas:{" "}
                    {Number(jobProgress.ignored_rows || 0).toLocaleString("pt-BR")}
                  </p>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                    <div
                      className={`h-full rounded-full transition-all ${
                        inferProgressPhase(jobProgress) === "parsing"
                          ? "animate-pulse bg-amber-500"
                          : "bg-brand-600"
                      }`}
                      style={{ width: `${getImportProgressPercent(jobProgress)}%` }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-slate-700">{getImportProgressLabel(jobProgress)}</p>
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

            <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-slate-900">Histórico de importações</h3>
                <button
                  type="button"
                  onClick={loadImportHistory}
                  className="btn-secondary px-3 py-1.5 text-xs"
                >
                  Atualizar
                </button>
              </div>
              {importHistoryError ? (
                <p className="mt-2 text-sm text-amber-800">{importHistoryError}</p>
              ) : null}
              {importHistory.length === 0 && !importHistoryError ? (
                <p className="mt-2 text-sm text-slate-600">
                  Nenhuma importação registrada ainda. Se você acabou de enviar um arquivo, aguarde o
                  upload terminar antes de atualizar a página.
                </p>
              ) : importHistory.length > 0 ? (
                <div className="mt-3 overflow-x-auto">
                  <table className="min-w-full text-left text-sm text-slate-800">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                        <th className="px-2 py-2">#</th>
                        <th className="px-2 py-2">Data</th>
                        <th className="px-2 py-2">Operadora</th>
                        <th className="px-2 py-2">Arquivo(s)</th>
                        <th className="px-2 py-2">Status</th>
                        <th className="px-2 py-2">Linhas</th>
                        <th className="px-2 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {importHistory.map((job) => (
                        <tr key={job.id} className="border-b border-slate-100 align-top">
                          <td className="px-2 py-2 font-mono text-xs">{job.id}</td>
                          <td className="px-2 py-2 whitespace-nowrap text-xs">
                            {formatJobDate(job.finished_at || job.created_at)}
                          </td>
                          <td className="px-2 py-2">
                            <span className="font-semibold">{job.operator}</span>
                            {job.operator_mismatch ? (
                              <p className="mt-0.5 text-xs text-amber-700">
                                Arquivo parece {job.detected_operator}
                              </p>
                            ) : job.detected_operator ? (
                              <p className="mt-0.5 text-xs text-slate-500">
                                Detectado: {job.detected_operator}
                              </p>
                            ) : null}
                          </td>
                          <td className="px-2 py-2 text-xs">
                            {(job.files || []).map((f) => (
                              <div key={f.file_name} className="mb-1">
                                <span className="font-medium">{f.file_name}</span>
                                {f.file_size_bytes ? (
                                  <span className="text-slate-500">
                                    {" "}
                                    ({formatBytes(f.file_size_bytes)})
                                  </span>
                                ) : null}
                              </div>
                            ))}
                          </td>
                          <td className="px-2 py-2 text-xs">
                            {job.reverted_at ? (
                              <span className="font-semibold text-slate-600">Removida</span>
                            ) : (
                              translateJobStatus(job.status)
                            )}
                            {job.reverted_at && job.records_deleted != null ? (
                              <p className="text-slate-500">{job.records_deleted} apagadas</p>
                            ) : null}
                          </td>
                          <td className="px-2 py-2 text-xs">
                            {job.imported_rows != null
                              ? `${Number(job.imported_rows).toLocaleString("pt-BR")} válidas`
                              : "—"}
                            {job.ignored_rows > 0 ? (
                              <p className="text-slate-500">
                                {Number(job.ignored_rows).toLocaleString("pt-BR")} ignoradas
                              </p>
                            ) : null}
                          </td>
                          <td className="px-2 py-2">
                            {!job.reverted_at &&
                            (job.status === "completed" || job.status === "failed") ? (
                              <button
                                type="button"
                                disabled={revertingJobId === job.id}
                                onClick={() => handleRevertImport(job)}
                                className="rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                              >
                                {revertingJobId === job.id ? "Removendo…" : "Limpar importação"}
                              </button>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>

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

        {isAdmin && activeTab === "usuarios" ? (
          <section className="surface-card p-6">
            <h2 className="text-xl font-bold text-slate-900">Cadastro de usuários</h2>
            <p className="mt-1 text-sm text-slate-600">
              Apenas administradores podem criar usuários internos.
            </p>

            <form className="mt-4 grid gap-3 md:grid-cols-2" onSubmit={handleCreateUserSubmit}>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="new-fullName">
                  Nome completo
                </label>
                <input
                  id="new-fullName"
                  type="text"
                  value={newUser.fullName}
                  onChange={(event) => setNewUser((prev) => ({ ...prev, fullName: event.target.value }))}
                  className="input-modern"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="new-username">
                  Usuário
                </label>
                <input
                  id="new-username"
                  type="text"
                  value={newUser.username}
                  onChange={(event) => setNewUser((prev) => ({ ...prev, username: event.target.value }))}
                  className="input-modern"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="new-role">
                  Perfil
                </label>
                <select
                  id="new-role"
                  value={newUser.role}
                  onChange={(event) => setNewUser((prev) => ({ ...prev, role: event.target.value }))}
                  className="input-modern"
                >
                  <option value="vendedor">vendedor</option>
                  <option value="admin">admin</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="new-password">
                  Senha
                </label>
                <input
                  id="new-password"
                  type="password"
                  minLength={6}
                  value={newUser.password}
                  onChange={(event) => setNewUser((prev) => ({ ...prev, password: event.target.value }))}
                  className="input-modern"
                  required
                />
              </div>

              <div className="md:col-span-2">
                {usersError ? <p className="text-sm text-red-600">{usersError}</p> : null}
                {usersFeedback ? <p className="text-sm text-emerald-700">{usersFeedback}</p> : null}
              </div>

              <div className="md:col-span-2">
                <button type="submit" disabled={isCreatingUser} className="btn-primary">
                  {isCreatingUser ? "Criando..." : "Criar usuário"}
                </button>
              </div>
            </form>

            <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900">Usuários cadastrados</h3>
                <button type="button" className="btn-secondary text-xs" onClick={loadUsers}>
                  Atualizar
                </button>
              </div>
              {users.length === 0 ? (
                <p className="text-xs text-slate-600">Nenhum usuário encontrado.</p>
              ) : (
                <div className="space-y-2">
                  {users.map((user) => (
                    <div
                      key={user.id}
                      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2"
                    >
                      <p className="text-sm font-semibold text-slate-800">
                        {user.full_name} <span className="text-slate-500">(@{user.username})</span>
                      </p>
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                        {user.role}
                      </span>
                    </div>
                  ))}
                </div>
              )}
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

function ImportProgressDetails({ job, compact = false, onCompleteStuck, completing = false }) {
  if (!job) return null;
  const phase = inferProgressPhase(job);
  const stalled = isImportStalled(job);
  const ageMs = getHeartbeatAgeMs(job);
  const ageMin = ageMs != null ? Math.floor(ageMs / 60000) : null;
  const linesDone =
    (job.total_rows || 0) > 0 && (job.processed_rows || 0) >= (job.total_rows || 0);

  return (
    <div className={compact ? "mt-1 space-y-1" : "mt-2 space-y-2"}>
      <p className={`text-slate-700 ${compact ? "text-xs" : "text-sm"}`}>
        Fase: <span className="font-semibold">{translateProgressPhase(phase)}</span>
        {job.heartbeat_at ? (
          <span className="text-slate-500">
            {" "}
            · última atualização há {ageMin != null && ageMin > 0 ? `${ageMin} min` : "poucos segundos"}
          </span>
        ) : null}
      </p>
      {phase === "parsing" ? (
        <p className="text-xs text-amber-800">
          Planilha Excel grande: se passar de alguns minutos sem subir o contador, o servidor pode ter ficado sem
          memória. Prefira exportar como CSV (;) e importar o .csv.
        </p>
      ) : null}
      {phase === "reading" && (job.total_rows || 0) === 0 ? (
        <p className="text-xs text-amber-800">
          Preparando arquivo no servidor — em CSV o contador começa a subir em seguida.
        </p>
      ) : null}
      {phase === "finalizing" ? (
        <p className="text-xs font-medium text-amber-800">
          Linhas já gravadas — finalizando job no servidor (índices e status).
        </p>
      ) : null}
      {stalled ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-800">
          <p>
            Possível travamento: sem atualização há {ageMin ?? "3+"} min (job #{job.id}).
            {linesDone
              ? " As linhas já foram gravadas; o processo pode ter caído antes de marcar concluído."
              : phase === "parsing" || phase === "reading"
                ? " O Excel grande costuma estourar a memória do servidor — exporte como CSV (;) e tente de novo."
                : " Atualize a página ou confira os logs no Railway."}
          </p>
          {linesDone && onCompleteStuck ? (
            <button
              type="button"
              disabled={completing}
              onClick={() => onCompleteStuck(job)}
              className="btn-primary mt-2 text-xs disabled:opacity-50"
            >
              {completing ? "Concluindo…" : "Marcar importação como concluída"}
            </button>
          ) : (
            <p className="mt-1 text-red-700">Atualize a página — após o deploy da API, a conclusão pode ser automática.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function formatJobDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR");
  } catch {
    return iso;
  }
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
  return sortAddressNumbers(Array.from(values));
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
  const phase = inferProgressPhase(job);
  const phaseOrder = ["queued", "reading", "parsing", "inserting", "finalizing"];
  const phaseIndex = phaseOrder.indexOf(phase);

  function stageState(stepIndex) {
    if (isCompleted) return "done";
    if (isFailed && stepIndex === 4) return "active";
    if (isFailed) return stepIndex < phaseIndex ? "done" : "pending";
    if (isQueued && stepIndex === 0) return "active";
    if (!isProcessing && !isQueued) return stepIndex <= phaseIndex ? "done" : "pending";
    if (stepIndex < phaseIndex) return "done";
    if (stepIndex === phaseIndex) return "active";
    return "pending";
  }

  return [
    {
      label: "1. Fila",
      state: stageState(0),
      text: isQueued ? "Aguardando início" : "Concluída",
    },
    {
      label: "2. Leitura",
      state: stageState(1),
      text: phase === "reading" ? translateProgressPhase("reading") : stageState(1) === "done" ? "Concluída" : "—",
    },
    {
      label: "3. Parse",
      state: stageState(2),
      text:
        phase === "parsing"
          ? "Parseando Excel (memória)"
          : stageState(2) === "done"
            ? "Concluído"
            : "—",
    },
    {
      label: "4. Inserção",
      state: stageState(3),
      text:
        phase === "inserting" && job?.total_rows > 0
          ? `${Number(job.processed_rows || 0).toLocaleString("pt-BR")} / ${Number(job.total_rows).toLocaleString("pt-BR")} linhas`
          : stageState(3) === "done"
            ? "Concluída"
            : "—",
    },
    {
      label: "5. Finalização",
      state: stageState(4),
      text: isCompleted
        ? "Importação concluída"
        : isFailed
          ? "Falha"
          : phase === "finalizing"
            ? "Gravando status final"
            : "—",
    },
  ];
}

function OperatorLogo({ operatorName }) {
  const normalized = normalizeOperatorName(operatorName);
  const logoSrc = OPERATOR_LOGOS[normalized];
  const displayName = toOperatorDisplayName(operatorName);
  if (!logoSrc) {
    return <span className="text-xs font-semibold text-slate-700">{displayName}</span>;
  }
  const [logoFailed, setLogoFailed] = useState(false);
  if (logoFailed) {
    return (
      <span className="inline-flex h-5 items-center text-xs font-semibold text-slate-700">
        {displayName}
      </span>
    );
  }
  return (
    <img
      src={logoSrc}
      alt={`Logo ${displayName}`}
      className="h-7 w-auto max-w-[140px] object-contain"
      loading="lazy"
      onError={() => setLogoFailed(true)}
    />
  );
}

function normalizeOperatorName(name) {
  return String(name || "").trim().toLowerCase();
}

function toOperatorDisplayName(name) {
  const n = normalizeOperatorName(name);
  if (n === "vivo") return "Vivo";
  if (n === "nio") return "Nio";
  return String(name || "");
}

function hasOperator(operators, operatorName) {
  const target = normalizeOperatorName(operatorName);
  return Array.isArray(operators) && operators.some((item) => normalizeOperatorName(item) === target);
}

function tabButtonClass(active) {
  return active
    ? "rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white"
    : "rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700";
}
