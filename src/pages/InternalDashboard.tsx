import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
  type MouseEvent,
} from "react";
import { useNavigate } from "react-router-dom";
import { clearSession, getSessionToken, getSessionUser } from "../lib/authSession";
import {
  buildDashboardTabs,
  canManageImports,
  canManagePap,
  canManageUsers,
  ROLE_LABELS,
} from "../lib/rbac";
import {
  completeStuckImportJob,
  createImportJob,
  getActiveImportJob,
  getImportJobStatus,
  getImportJobsHistory,
  getImportSummary,
  revertImportJob,
} from "../services/api";
import mascotCloudHero from "../assets/mascot-cloud-hero.png";
import nioLogo from "../assets/operators/nio.png";
import veroLogo from "../assets/operators/Vero.jpg";
import vivoLogo from "../assets/operators/vivo.png";
import {
  buildFacadeLabel,
  buildStreetLabel,
  countRecordsByOperator,
  getOperatorCoverageConfig,
  groupFacadeNumbers,
  normalizeOperatorName,
  recordsMatchOperator,
  toOperatorDisplayName,
} from "../utils/coverage";
import { useCoverageConsult } from "../hooks/useCoverageConsult";
import { CreditConsultTab } from "../components/CreditConsultTab";
import { FloatingBubbles } from "../components/FloatingBubbles";
import { PapAdminTab } from "../components/PapAdminTab";
import { UsersAdminTab } from "../components/UsersAdminTab";
import { DataTable, DataTableCell, DataTableRow } from "../components/ui/DataTable";
import { EmptyState } from "../components/ui/EmptyState";
import { FormField } from "../components/ui/FormField";
import { DashboardTabs, MetricCard, PanelCard } from "../components/ui/PanelCard";
import { SkeletonCards, SkeletonTable } from "../components/ui/Skeleton";
import { useToast } from "../components/ui/Toast";
import type { FacadeGroup } from "../types/coverage";
import type { CoverageRecord, OperatorCoverageConfig } from "../types/coverage";
import type { ImportJob } from "../types/import";
import type { ImportSummaryResponse } from "../types/import";
import {
  getHeartbeatAgeMs,
  getImportProgressLabel,
  getImportProgressPercent,
  getPollIntervalMs,
  inferProgressPhase,
  isImportStalled,
  translateProgressPhase,
} from "../utils/importProgress";

const OPERATOR_LOGOS: Record<string, string> = {
  vivo: vivoLogo,
  nio: nioLogo,
  vero: veroLogo,
};

const ACTIVE_IMPORT_STORAGE_KEY = "planoideal_active_import_job_id";

const IMPORT_HISTORY_COLUMNS = [
  { key: "id", label: "#" },
  { key: "date", label: "Data" },
  { key: "operator", label: "Operadora" },
  { key: "files", label: "Arquivo(s)" },
  { key: "status", label: "Status" },
  { key: "lines", label: "Linhas" },
  { key: "actions", label: "Ações" },
];

function buildTemplateCsv(operator: string): string {
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

function DashboardBrandWatermark() {
  return (
    <div
      className="pointer-events-none fixed bottom-4 left-2 z-0 hidden opacity-[0.14] md:block lg:bottom-8 lg:left-6"
      aria-hidden="true"
    >
      <img
        src={mascotCloudHero}
        alt=""
        className="h-auto w-40 object-contain lg:w-48"
        width={192}
        height={192}
        decoding="async"
      />
    </div>
  );
}

export default function InternalDashboard() {
  const navigate = useNavigate();
  const toast = useToast();
  const sessionUser = useMemo(() => getSessionUser(), []);
  const token = useMemo(() => getSessionToken(), []);
  const userRole = sessionUser?.role;
  const showImports = canManageImports(userRole);
  const showPap = canManagePap(userRole);
  const showUsers = canManageUsers(userRole);

  const {
    cep,
    consultResult,
    consultError,
    isConsulting,
    consultedAddress,
    handleCepChange,
    submitConsult,
  } = useCoverageConsult(token);

  const [activeTab, setActiveTab] = useState("consulta");

  const [operator, setOperator] = useState("Vivo");
  const [files, setFiles] = useState<File[]>([]);
  const [importFeedback, setImportFeedback] = useState("");
  const [importError, setImportError] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [jobProgress, setJobProgress] = useState<ImportJob | null>(null);
  const [summary, setSummary] = useState<ImportSummaryResponse>({
    byOperator: {},
    fieldsByOperator: {},
    activeJob: null,
  });
  const [importHistory, setImportHistory] = useState<ImportJob[]>([]);
  const [importHistoryError, setImportHistoryError] = useState("");
  const [summaryError, setSummaryError] = useState("");
  const [revertingJobId, setRevertingJobId] = useState<number | null>(null);
  const [completingJobId, setCompletingJobId] = useState<number | null>(null);
  const [isLoadingImportHistory, setIsLoadingImportHistory] = useState(false);
  const [isLoadingSummary, setIsLoadingSummary] = useState(false);

  useEffect(() => {
    if (!sessionUser || !token) {
      navigate("/interno");
      return;
    }

    if (showImports) {
      loadSummary();
      loadImportHistory();
      resumeActiveImportJob();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionUser, token, showImports, navigate]);

  const loadSummary = async () => {
    setIsLoadingSummary(true);
    try {
      const data = await getImportSummary(token);
      setSummary(data);
      setSummaryError("");
      return data;
    } catch (error: unknown) {
      setSummary({
        byOperator: {},
        fieldsByOperator: {},
        activeJob: null,
      });
      const message =
        (error instanceof Error ? error.message : null) ||
        "Não foi possível carregar o resumo. Tente Atualizar ou aguarde alguns segundos.";
      setSummaryError(message);
      toast.error(message);
      return null;
    } finally {
      setIsLoadingSummary(false);
    }
  };

  const loadImportHistory = async () => {
    setIsLoadingImportHistory(true);
    try {
      const data = await getImportJobsHistory(token);
      setImportHistory(data.jobs || []);
      setImportHistoryError("");
    } catch (error: unknown) {
      setImportHistory([]);
      const message =
        (error instanceof Error ? error.message : null) ||
        "Não foi possível carregar o histórico. Confira se a API no Railway foi atualizada.";
      setImportHistoryError(message);
      toast.error(message);
    } finally {
      setIsLoadingImportHistory(false);
    }
  };

  const handleCompleteStuckImport = async (job: ImportJob) => {
    if (!job?.id) return;
    try {
      setCompletingJobId(job.id);
      const result = await completeStuckImportJob(job.id, token);
      setImportFeedback(result.message || "Importação marcada como concluída.");
      setImportError("");
      toast.success(result.message || "Importação marcada como concluída.");
      setJobProgress(null);
      sessionStorage.removeItem(ACTIVE_IMPORT_STORAGE_KEY);
      await loadSummary();
      await loadImportHistory();
    } catch (error: unknown) {
      const message =
        (error instanceof Error ? error.message : null) ||
        "Não foi possível concluir a importação.";
      setImportError(message);
      toast.error(message);
    } finally {
      setCompletingJobId(null);
    }
  };

  const handleRevertImport = async (job: ImportJob) => {
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
      toast.success(result.message || "Importação removida.");
      await loadSummary();
      await loadImportHistory();
    } catch (error: unknown) {
      const message =
        (error instanceof Error ? error.message : null) || "Não foi possível remover a importação.";
      setImportError(message);
      toast.error(message);
    } finally {
      setRevertingJobId(null);
    }
  };

  const handleLogout = () => {
    clearSession();
    navigate("/");
  };

  const handleConsultSubmit = (event: FormEvent<HTMLFormElement>) =>
    submitConsult(
      event,
      (count) => toast.success(`${count} operadora(s) encontrada(s).`),
      () => toast.warning("Nenhuma operadora disponível para este CEP."),
      (message) => toast.error(message)
    );

  const handleTemplateDownload = (templateOperator: string) => {
    const csvContent = buildTemplateCsv(templateOperator);
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `modelo-importacao-${templateOperator.toLowerCase()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const finishImportJob = async (job: ImportJob) => {
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

  const pollImportJob = async (jobId: number): Promise<ImportJob> => {
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

  const handleImportSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setImportFeedback("");
    setImportError("");

    if (!files.length) {
      const message = "Selecione ao menos um arquivo para importar.";
      setImportError(message);
      toast.error(message);
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
        (event.currentTarget as HTMLFormElement).reset();
      }
    } catch (error: unknown) {
      const message =
        (error instanceof Error ? error.message : null) || "Não foi possível importar os arquivos.";
      setImportError(message);
      toast.error(message);
      sessionStorage.removeItem(ACTIVE_IMPORT_STORAGE_KEY);
    } finally {
      setIsImporting(false);
    }
  };

  const importInProgress =
    jobProgress && (jobProgress.status === "queued" || jobProgress.status === "processing");

  const dashboardTabs = useMemo(() => buildDashboardTabs(userRole), [userRole]);

  if (!sessionUser || !token) {
    return null;
  }

  return (
    <div className="dashboard-shell">
      <DashboardBrandWatermark />
      <FloatingBubbles variant="dark" />
      <div className="dashboard-container">
        {showImports && importInProgress ? (
          <div className="rounded-xl border-2 border-brand-400 bg-brand-50 p-4 shadow-sm">
            <p className="font-bold text-brand-900">
              Importação em andamento — job #{jobProgress.id} ({jobProgress.operator})
            </p>
            <p className="mt-1 text-sm text-brand-800">
              {jobProgress.current_step ||
                "Processando… Você pode atualizar a página; o progresso continua sendo carregado."}
            </p>
            <p className="mt-2 text-sm text-slate-700">{getImportProgressLabel(jobProgress)}</p>
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

        <PanelCard
          title="Área interna"
          description={`Logado como ${sessionUser.name ?? sessionUser.fullName} (${ROLE_LABELS[userRole ?? ""] ?? userRole})`}
          action={
            <button type="button" onClick={handleLogout} className="btn-secondary shrink-0">
              Sair
            </button>
          }
        />

        <div className="panel-card !p-3">
          <DashboardTabs tabs={dashboardTabs} activeTab={activeTab} onChange={setActiveTab} />
        </div>

        {activeTab === "consulta" ? (
          <PanelCard
            id="panel-consulta"
            title="Consulta por CEP"
            description="Consulta de cobertura por CEP para todos os perfis internos."
          >
            <form
              className="flex flex-col gap-3 sm:flex-row sm:items-end"
              onSubmit={handleConsultSubmit}
            >
              <FormField
                id="dashboard-cep"
                label="CEP"
                hint="Informe o CEP com hífen. Ex: 30130-010"
                error={consultError}
                className="flex-1"
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
              <button type="submit" className="btn-primary shrink-0" disabled={isConsulting}>
                {isConsulting ? "Consultando…" : "Consultar"}
              </button>
            </form>

            {isConsulting ? (
              <div className="mt-5">
                <SkeletonCards count={3} />
              </div>
            ) : consultResult ? (
              <div className="mt-4 rounded-xl border border-white/15 bg-black/20 p-4">
                <p className="text-sm font-semibold text-white/85">
                  CEP consultado: {consultResult.cep}
                  {consultedAddress ? `, ${consultedAddress}` : ""}
                </p>
                {consultResult.operators.length > 0 ? (
                  <>
                    <p className="mt-3 text-sm font-semibold text-white">Resumo por operadora</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {consultResult.operators.map((operatorName) => (
                        <OperatorSummaryCard
                          key={operatorName}
                          operatorName={operatorName}
                          count={countRecordsByOperator(consultResult.records)[operatorName] || 0}
                          config={getOperatorCoverageConfig(operatorName)}
                        />
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-white/55">
                      Total no CEP: {consultResult.records.length} registro(s)
                    </p>
                  </>
                ) : null}
                <details className="mt-3 rounded-lg border border-white/10 bg-black/15 p-3">
                  <summary className="cursor-pointer text-sm font-semibold text-white/85">
                    Ver detalhes por operadora
                  </summary>
                  <div className="mt-3 space-y-4">
                    {consultResult.operators.map((operatorName) => (
                      <OperatorCoveragePanel
                        key={operatorName}
                        operatorName={operatorName}
                        records={consultResult.records}
                      />
                    ))}
                  </div>
                </details>
                {consultResult.operators.length === 0 ? (
                  <p className="mt-2 text-sm font-semibold text-slate-800">
                    Nenhuma operadora disponível para este CEP.
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="mt-5">
                <EmptyState
                  icon="search"
                  title="Nenhum CEP consultado ainda"
                  description="Digite um CEP válido e clique em consultar para ver operadoras e detalhes de cobertura."
                />
              </div>
            )}
          </PanelCard>
        ) : null}

        {activeTab === "credito" ? <CreditConsultTab token={token} /> : null}

        {showPap && activeTab === "pap" ? <PapAdminTab token={token} /> : null}

        {showImports && activeTab === "importacoes" ? (
          <PanelCard
            id="panel-importacoes"
            title="Importar bases para o banco interno"
            description='Coluna com nome contendo "CEP" é obrigatória. Todos os outros campos da planilha são preservados integralmente.'
          >
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
              <button
                type="button"
                onClick={() => handleTemplateDownload("Vero")}
                className="btn-secondary px-3 py-2 text-xs"
              >
                Baixar modelo Vero (.csv)
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
                  <option value="Vero">Vero</option>
                </select>
                <p className="mt-1 text-xs text-slate-600">
                  A operadora escolhida define como os dados são gravados e consultados. Se enviar
                  base da Nio com &quot;Vivo&quot; selecionado, os CEPs aparecerão como Vivo e a
                  deduplicação por NUM_FACHADA não será aplicada. Para Vero, a deduplicação
                  específica por número não é aplicada.
                </p>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="files">
                  Arquivos (.csv recomendado, .xlsx)
                </label>
                <p className="mb-2 text-xs text-slate-600">
                  Arquivos grandes: prefira <strong>CSV</strong> (delimitador ;). Excel acima de ~60
                  MB pode falhar no servidor.
                </p>
                <input
                  id="files"
                  type="file"
                  accept=".xlsx,.csv"
                  multiple
                  onChange={(event: ChangeEvent<HTMLInputElement>) =>
                    setFiles([...(event.target.files ?? [])])
                  }
                  className="input-modern block p-2"
                />
              </div>

              {importError ? (
                <p className="text-sm text-red-600" role="alert">
                  {importError}
                </p>
              ) : null}
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
                      <span className="text-xs font-semibold uppercase text-slate-600">
                        Etapa atual
                      </span>
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
                    Válidas: {Number(jobProgress.imported_rows || 0).toLocaleString("pt-BR")} |
                    Ignoradas: {Number(jobProgress.ignored_rows || 0).toLocaleString("pt-BR")}
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
                  <p className="mt-1 text-xs text-slate-700">
                    {getImportProgressLabel(jobProgress)}
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

            <div className="mt-6">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-slate-900">Histórico de importações</h3>
                <button
                  type="button"
                  onClick={loadImportHistory}
                  className="btn-secondary px-3 py-1.5 text-xs"
                  disabled={isLoadingImportHistory}
                >
                  {isLoadingImportHistory ? "Atualizando…" : "Atualizar"}
                </button>
              </div>
              {importHistoryError ? (
                <p className="mb-3 text-sm text-amber-800" role="alert">
                  {importHistoryError}
                </p>
              ) : null}
              <DataTable
                columns={IMPORT_HISTORY_COLUMNS}
                caption="Histórico de importações"
                isEmpty={
                  !isLoadingImportHistory && importHistory.length === 0 && !importHistoryError
                }
                loading={isLoadingImportHistory}
                loadingComponent={<SkeletonTable rows={5} cols={7} />}
                emptyIcon="table"
                emptyTitle="Nenhuma importação registrada"
                emptyDescription="Após enviar um arquivo, aguarde o upload terminar. O histórico aparecerá aqui automaticamente."
              >
                {importHistory.map((job) => (
                  <DataTableRow key={job.id}>
                    <DataTableCell className="font-mono text-xs">{job.id}</DataTableCell>
                    <DataTableCell className="whitespace-nowrap text-xs">
                      {formatJobDate(job.finished_at || job.created_at)}
                    </DataTableCell>
                    <DataTableCell>
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
                    </DataTableCell>
                    <DataTableCell className="text-xs">
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
                    </DataTableCell>
                    <DataTableCell className="text-xs">
                      {job.reverted_at ? (
                        <span className="font-semibold text-slate-600">Removida</span>
                      ) : (
                        translateJobStatus(job.status)
                      )}
                      {job.reverted_at && job.records_deleted != null ? (
                        <p className="text-slate-500">{job.records_deleted} apagadas</p>
                      ) : null}
                    </DataTableCell>
                    <DataTableCell className="text-xs">
                      {job.ignored_rows != null
                        ? `${Number(job.imported_rows).toLocaleString("pt-BR")} válidas`
                        : "—"}
                      {(job.ignored_rows ?? 0) > 0 ? (
                        <p className="text-slate-500">
                          {Number(job.ignored_rows).toLocaleString("pt-BR")} ignoradas
                        </p>
                      ) : null}
                    </DataTableCell>
                    <DataTableCell>
                      {!job.reverted_at &&
                      (job.status === "completed" || job.status === "failed") ? (
                        <button
                          type="button"
                          disabled={revertingJobId === job.id}
                          onClick={() => handleRevertImport(job)}
                          className="btn-danger"
                        >
                          {revertingJobId === job.id ? "Removendo…" : "Limpar"}
                        </button>
                      ) : null}
                    </DataTableCell>
                  </DataTableRow>
                ))}
              </DataTable>
            </div>

            <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-slate-900">Resumo das importações</h3>
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={() => loadSummary()}
                  disabled={isLoadingSummary}
                >
                  {isLoadingSummary ? "Atualizando…" : "Atualizar resumo"}
                </button>
              </div>
              {summaryError ? (
                <p className="mt-2 text-sm text-amber-800" role="alert">
                  {summaryError}
                </p>
              ) : null}
              <p className="mt-1 text-xs text-slate-500">
                Total = soma das linhas válidas nos jobs concluídos (histórico acima).
              </p>
              {isLoadingSummary ? (
                <div className="mt-3">
                  <SkeletonCards count={3} />
                </div>
              ) : (
                <div className="mt-3 grid gap-3 md:grid-cols-3">
                  <MetricCard
                    label="Total importado"
                    value={(summary.totalImportedRows ?? 0).toLocaleString("pt-BR")}
                  />
                  <MetricCard label="Operadoras" value={Object.keys(summary.byOperator).length} />
                  <MetricCard
                    label="Campos mapeados"
                    value={Object.values(summary.fieldsByOperator).reduce(
                      (acc, fields) => acc + fields.length,
                      0
                    )}
                  />
                </div>
              )}
              <p className="mt-1 text-sm text-slate-700">
                Total de linhas importadas:{" "}
                <span className="font-semibold">{summary.totalImportedRows ?? 0}</span>
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
                  <EmptyState
                    icon="table"
                    title="Nenhum campo mapeado ainda"
                    description="Os campos aparecerão aqui após a primeira importação concluída."
                  />
                ) : (
                  Object.entries(summary.fieldsByOperator).map(([name, fields]) => (
                    <div key={name}>
                      <p className="text-sm font-semibold text-slate-800">
                        Campos detectados - {name}
                      </p>
                      <p className="text-xs text-slate-700">{fields.join(", ")}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </PanelCard>
        ) : null}

        {showUsers && activeTab === "usuarios" ? (
          <UsersAdminTab token={token} currentUserId={sessionUser.id} />
        ) : null}
      </div>
    </div>
  );
}

function ImportProgressDetails({
  job,
  compact = false,
  onCompleteStuck,
  completing = false,
}: {
  job: ImportJob | null;
  compact?: boolean;
  onCompleteStuck?: (job: ImportJob) => void;
  completing?: boolean;
}) {
  if (!job) return null;
  const phase = inferProgressPhase(job);
  const stalled = isImportStalled(job);
  const ageMs = getHeartbeatAgeMs(job);
  const ageMin = ageMs != null ? Math.floor(ageMs / 60000) : null;
  const linesDone = (job.total_rows || 0) > 0 && (job.processed_rows || 0) >= (job.total_rows || 0);

  return (
    <div className={compact ? "mt-1 space-y-1" : "mt-2 space-y-2"}>
      <p className={`text-slate-700 ${compact ? "text-xs" : "text-sm"}`}>
        Fase: <span className="font-semibold">{translateProgressPhase(phase)}</span>
        {job.heartbeat_at ? (
          <span className="text-slate-500">
            {" "}
            · última atualização há{" "}
            {ageMin != null && ageMin > 0 ? `${ageMin} min` : "poucos segundos"}
          </span>
        ) : null}
      </p>
      {phase === "parsing" ? (
        <p className="text-xs text-amber-800">
          Planilha Excel grande: se passar de alguns minutos sem subir o contador, o servidor pode
          ter ficado sem memória. Prefira exportar como CSV (;) e importar o .csv.
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
            <p className="mt-1 text-red-700">
              Atualize a página — após o deploy da API, a conclusão pode ser automática.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function formatJobDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR");
  } catch {
    return iso;
  }
}

function translateJobStatus(status: string | null | undefined): string {
  if (!status) return "—";
  if (status === "queued") return "Na fila";
  if (status === "processing") return "Processando";
  if (status === "completed") return "Concluído";
  if (status === "failed") return "Falhou";
  return status;
}

function formatBytes(value: number | string | null | undefined): string {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function getRecordsForOperator(records: CoverageRecord[], operatorName: string): CoverageRecord[] {
  if (!Array.isArray(records)) return [];
  return records.filter((record) => recordsMatchOperator(record, operatorName));
}

function OperatorSummaryCard({
  operatorName,
  count,
  config,
}: {
  operatorName: string;
  count: number;
  config: OperatorCoverageConfig;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex items-center gap-2">
        <OperatorLogo operatorName={operatorName} />
        <div>
          <p className="text-sm font-semibold text-slate-800">
            {toOperatorDisplayName(operatorName)}
          </p>
          <p className="text-xs text-slate-500">{config.hint}</p>
        </div>
      </div>
      <p className="mt-2 text-2xl font-black text-slate-900">{count.toLocaleString("pt-BR")}</p>
      <p className="text-xs text-slate-500">{config.title}</p>
    </div>
  );
}

function OperatorCoveragePanel({
  operatorName,
  records,
}: {
  operatorName: string;
  records: CoverageRecord[];
}) {
  const config = getOperatorCoverageConfig(operatorName);
  const opRecords = getRecordsForOperator(records, operatorName);
  const uniqueCount =
    config.mode === "streets"
      ? getOperatorStreetList(records, operatorName).length
      : getOperatorNumberList(records, operatorName, config.keys).length;

  return (
    <div className="coverage-operator-panel">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex rounded-lg border border-white/15 bg-white/10 px-2 py-1">
            <OperatorLogo operatorName={operatorName} />
          </span>
          <div>
            <p className="text-sm font-bold text-white">{toOperatorDisplayName(operatorName)}</p>
            <p className="text-xs text-white/55">{config.hint}</p>
          </div>
        </div>
        <p className="text-xs font-semibold text-white/70">
          {opRecords.length.toLocaleString("pt-BR")} registro(s)
          {uniqueCount > 0 ? ` · ${uniqueCount.toLocaleString("pt-BR")} distinto(s)` : ""}
        </p>
      </div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-white/55">
        {config.title}
      </p>
      {config.mode === "streets" ? (
        <StreetChips records={records} operatorName={operatorName} />
      ) : (
        <FacadeNumberChips records={records} operatorName={operatorName} keys={config.keys} />
      )}
    </div>
  );
}

function getOperatorStreetList(records: CoverageRecord[], operatorName: string): string[] {
  if (!Array.isArray(records) || records.length === 0) return [];
  const values = new Set<string>();
  for (const record of records) {
    if (!recordsMatchOperator(record, operatorName)) continue;
    const label = buildStreetLabel(record?.row_data || {});
    if (label) values.add(label);
  }
  return Array.from(values).sort((a, b) => a.localeCompare(b, "pt-BR"));
}

function StreetChips({
  records,
  operatorName,
}: {
  records: CoverageRecord[];
  operatorName: string;
}) {
  const streets = useMemo(
    () => getOperatorStreetList(records, operatorName),
    [records, operatorName]
  );

  if (streets.length === 0) {
    return (
      <p className="text-sm text-slate-600">
        Nenhum logradouro identificado nos registros desta operadora.
      </p>
    );
  }

  const visible = streets.slice(0, 40);
  const hidden = Math.max(0, streets.length - visible.length);

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {visible.map((street) => (
          <span key={street} className="coverage-chip-street">
            {street}
          </span>
        ))}
        {hidden > 0 ? <span className="coverage-chip">+{hidden} logradouros</span> : null}
      </div>
    </div>
  );
}

function getOperatorNumberList(
  records: CoverageRecord[],
  operatorName: string,
  keys: string[]
): string[] {
  if (!Array.isArray(records) || records.length === 0) return [];
  const values = new Set<string>();
  for (const record of records) {
    if (!recordsMatchOperator(record, operatorName)) continue;
    const label = buildFacadeLabel(record?.row_data || {}, keys);
    if (label) values.add(label);
  }
  return Array.from(values);
}

function FacadeNumberChips({
  records,
  operatorName,
  keys,
}: {
  records: CoverageRecord[];
  operatorName: string;
  keys: string[];
}) {
  const groups = useMemo(
    () => groupFacadeNumbers(getOperatorNumberList(records, operatorName, keys)),
    [records, operatorName, keys]
  );
  const [expandedBase, setExpandedBase] = useState<string | null>(null);

  useEffect(() => {
    if (!expandedBase) return undefined;
    const close = () => setExpandedBase(null);
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, [expandedBase]);

  if (groups.length === 0) {
    return <span className="mt-2 block text-sm text-slate-600">—</span>;
  }

  const mobileLimit = 16;
  const fullLimit = 80;
  const visibleGroups = groups.slice(0, fullLimit);
  const hiddenMobile = Math.max(0, groups.length - mobileLimit);
  const hiddenTotal = Math.max(0, groups.length - fullLimit);

  const toggleBase = (base: string) => {
    setExpandedBase((prev) => (prev === base ? null : base));
  };

  return (
    <div className="mt-2">
      <p className="mb-2 text-[11px] leading-snug text-white/55">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-slate-300" />
          número único
        </span>
        <span className="mx-1.5 text-slate-300">·</span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
          com complemento (clique para ver)
        </span>
      </p>
      <div className="flex flex-wrap gap-2">
        {visibleGroups.map((group, idx) => (
          <FacadeChipGroup
            key={`${operatorName}-${group.base}`}
            group={group}
            operatorName={operatorName}
            expanded={expandedBase === group.base}
            onToggle={() => toggleBase(group.base)}
            className={idx >= mobileLimit ? "hidden sm:inline-flex" : "inline-flex"}
          />
        ))}
        {hiddenMobile > 0 ? (
          <span className="coverage-chip sm:hidden">+{hiddenMobile} no mobile</span>
        ) : null}
        {hiddenTotal > 0 ? (
          <span className="coverage-chip hidden sm:inline-flex">+{hiddenTotal} ocultos</span>
        ) : null}
      </div>
    </div>
  );
}

function FacadeChipGroup({
  group,
  operatorName,
  expanded,
  onToggle,
  className,
}: {
  group: FacadeGroup;
  operatorName: string;
  expanded: boolean;
  onToggle: () => void;
  className: string;
}) {
  const chipId = `${operatorName}-facade-${group.base}`;

  if (!group.isExpandable) {
    const label = group.variants[0]?.full ?? group.base;
    return <span className={`coverage-chip ${className}`}>{label}</span>;
  }

  const badgeCount =
    group.complementCount > 0 ? group.complementCount : Math.max(0, group.variants.length - 1);

  return (
    <span className={`relative inline-flex flex-col ${className}`} data-facade-chip-root>
      <button
        type="button"
        id={chipId}
        aria-expanded={expanded}
        aria-controls={`${chipId}-panel`}
        onClick={(event: MouseEvent<HTMLButtonElement>) => {
          event.stopPropagation();
          onToggle();
        }}
        className={`coverage-chip-amber ${expanded ? "is-expanded" : ""}`}
      >
        <span className="tabular-nums">{group.base}</span>
        {badgeCount > 0 ? <span className="coverage-chip-badge">+{badgeCount}</span> : null}
        <span className="text-[10px] text-gray-700" aria-hidden>
          {expanded ? "▴" : "▾"}
        </span>
      </button>
      {expanded ? (
        <div
          id={`${chipId}-panel`}
          role="region"
          aria-labelledby={chipId}
          className="absolute left-0 top-full z-20 mt-1 min-w-[11rem] max-w-[16rem] rounded-lg border border-amber-200 bg-white p-2 shadow-lg"
          onClick={(event: MouseEvent<HTMLDivElement>) => event.stopPropagation()}
        >
          <ul className="space-y-1">
            {group.variants.map((variant) => (
              <li
                key={variant.full}
                className={`rounded-md px-2 py-1 text-xs ${
                  variant.isPlain
                    ? "bg-gray-100 font-semibold text-gray-900"
                    : "bg-amber-100 text-gray-900"
                }`}
              >
                {variant.isPlain ? (
                  variant.full
                ) : (
                  <>
                    <span className="tabular-nums font-semibold text-gray-900">{group.base}</span>
                    {variant.suffix ? (
                      <span className="ml-1 font-medium text-gray-800">{variant.suffix}</span>
                    ) : null}
                  </>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </span>
  );
}

function buildJobStages(job: ImportJob | null) {
  const status = job?.status;
  const isQueued = status === "queued";
  const isProcessing = status === "processing";
  const isCompleted = status === "completed";
  const isFailed = status === "failed";
  const phase = inferProgressPhase(job);
  const phaseOrder = ["queued", "reading", "parsing", "inserting", "finalizing"];
  const phaseIndex = phaseOrder.indexOf(phase);

  function stageState(stepIndex: number): "done" | "active" | "pending" {
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
      text:
        phase === "reading"
          ? translateProgressPhase("reading")
          : stageState(1) === "done"
            ? "Concluída"
            : "—",
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
        phase === "inserting" && (job?.total_rows ?? 0) > 0
          ? `${Number(job?.processed_rows || 0).toLocaleString("pt-BR")} / ${Number(job?.total_rows).toLocaleString("pt-BR")} linhas`
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

function OperatorLogo({ operatorName }: { operatorName: string }) {
  const [logoFailed, setLogoFailed] = useState(false);
  const normalized = normalizeOperatorName(operatorName);
  const logoSrc = OPERATOR_LOGOS[normalized];
  const displayName = toOperatorDisplayName(operatorName);
  if (!logoSrc) {
    return <span className="text-xs font-semibold text-slate-700">{displayName}</span>;
  }
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
