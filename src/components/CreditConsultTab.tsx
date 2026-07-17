import { useState } from "react";
import { getCreditConsultationScreenshot } from "../services/api";
import type { CreditConsultation } from "../types/credit";
import { creditStatusLabel, isPendingCreditStatus } from "../types/credit";
import { useCreditConsult } from "../hooks/useCreditConsult";
import { DataTable, DataTableCell, DataTableRow } from "./ui/DataTable";
import type { DataTableColumn } from "./ui/DataTable";
import { FormField } from "./ui/FormField";
import { PanelCard } from "./ui/PanelCard";
import { SkeletonTable } from "./ui/Skeleton";
import { useToast } from "./ui/Toast";
import { ScreenshotModal } from "./ScreenshotModal";

export interface CreditConsultTabProps {
  token: string;
}

const HISTORY_COLUMNS: DataTableColumn[] = [
  { key: "date", label: "Data" },
  { key: "document", label: "Documento" },
  { key: "requester", label: "Solicitante" },
  { key: "result", label: "Resultado" },
  { key: "approval", label: "Aprovação" },
  { key: "duration", label: "Duração" },
  { key: "actions", label: "Ações" },
];

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR");
  } catch {
    return iso;
  }
}

function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || Number.isNaN(Number(seconds))) return "—";
  const total = Math.round(Number(seconds));
  if (total < 60) return `${total}s`;
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
}

/** Rótulo curto da elegibilidade de pagamento aprovada no PAP. */
function approvalTypeLabel(item: CreditConsultation): string {
  if (isPendingCreditStatus(item.status) || item.status === "failed" || !item.approved) {
    return "—";
  }

  const detail = (item.resultDetail || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();

  if (detail.includes("apenas") && detail.includes("cartao")) {
    return "Cartão de crédito";
  }
  if (detail.includes("todas") && detail.includes("formas")) {
    return "Todas formas de pagamento";
  }
  if (detail.includes("cartao")) {
    return "Cartão de crédito";
  }
  if (detail.includes("formas de pagamento")) {
    return "Todas formas de pagamento";
  }

  return item.resultDetail || "—";
}

function ResultBadge({ item }: { item: CreditConsultation }) {
  if (isPendingCreditStatus(item.status)) {
    return (
      <span className="badge-status badge-status-pending">{creditStatusLabel(item.status)}</span>
    );
  }
  if (item.status === "failed") {
    return <span className="badge-status badge-status-error">Erro</span>;
  }
  if (item.approved) {
    return <span className="badge-status badge-status-success">Aprovado</span>;
  }
  return <span className="badge-status badge-status-denied">Negado</span>;
}

export function CreditConsultTab({ token }: CreditConsultTabProps) {
  const toast = useToast();
  const {
    document,
    cpfRepresentative,
    trackingConsultation,
    history,
    isLoadingHistory,
    isSubmitting,
    showRepresentative,
    historyDateFrom,
    historyDateTo,
    historyPage,
    historyTotal,
    historyTotalPages,
    historyPageSize,
    handleDocumentChange,
    handleRepresentativeChange,
    handleHistoryDateFromChange,
    handleHistoryDateToChange,
    resetHistoryToToday,
    goToHistoryPage,
    submitConsultation,
  } = useCreditConsult(token);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalScreenshot, setModalScreenshot] = useState("");

  const openScreenshot = async (consultation: CreditConsultation) => {
    try {
      const data = await getCreditConsultationScreenshot(consultation.id, token);
      setModalTitle(`Comprovante — ${consultation.documentMasked || consultation.document}`);
      setModalScreenshot(data.screenshotBase64);
      setModalOpen(true);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Comprovante indisponível.";
      toast.error(message);
    }
  };

  const rangeStart = historyTotal === 0 ? 0 : (historyPage - 1) * historyPageSize + 1;
  const rangeEnd = Math.min(historyPage * historyPageSize, historyTotal);

  return (
    <PanelCard
      id="panel-credito"
      title="Consulta de Crédito PAP Nio"
      description="Disponível para admin e vendedor. A consulta leva cerca de 30–60 segundos. Você pode trocar de aba — o processamento continua no servidor."
    >
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={submitConsultation}>
        <FormField
          id="credit-document"
          label="CPF ou CNPJ"
          hint="Informe o documento do titular ou da empresa."
          required
        >
          {({ id, describedBy }) => (
            <input
              id={id}
              type="text"
              inputMode="numeric"
              value={document}
              onChange={handleDocumentChange}
              placeholder="000.000.000-00"
              className="input-modern"
              aria-describedby={describedBy}
              required
            />
          )}
        </FormField>

        {showRepresentative ? (
          <FormField
            id="credit-representative"
            label="CPF do representante"
            hint="Obrigatório para consultas de CNPJ."
            required
          >
            {({ id, describedBy }) => (
              <input
                id={id}
                type="text"
                inputMode="numeric"
                value={cpfRepresentative}
                onChange={handleRepresentativeChange}
                placeholder="000.000.000-00"
                className="input-modern"
                aria-describedby={describedBy}
                required
              />
            )}
          </FormField>
        ) : null}

        <div className="sm:col-span-2">
          <button type="submit" className="btn-primary" disabled={isSubmitting}>
            {isSubmitting ? "Enviando consulta…" : "Consultar crédito"}
          </button>
        </div>
      </form>

      {trackingConsultation ? (
        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-800">
            Consulta #{trackingConsultation.id} — {trackingConsultation.documentMasked}
          </p>
          <p className="mt-1 text-sm text-slate-600">
            Status:{" "}
            <span className="font-medium">{creditStatusLabel(trackingConsultation.status)}</span>
          </p>

          {isPendingCreditStatus(trackingConsultation.status) ? (
            <div className="mt-3 space-y-2" role="status" aria-label="Consulta em andamento">
              <div className="skeleton h-3 w-48" />
              <p className="text-sm text-amber-800">
                Aguardando retorno do PAP… o histórico abaixo atualiza automaticamente.
              </p>
            </div>
          ) : null}

          {trackingConsultation.status === "success" ? (
            <div className="mt-3">
              <ResultBadge item={trackingConsultation} />
              {trackingConsultation.resultDetail ? (
                <p className="mt-2 text-sm text-slate-700">{trackingConsultation.resultDetail}</p>
              ) : null}
              {trackingConsultation.durationSeconds != null ? (
                <p className="mt-1 text-xs text-slate-500">
                  Tempo de resposta: {trackingConsultation.durationSeconds}s
                </p>
              ) : null}
              {trackingConsultation.hasScreenshot ? (
                <button
                  type="button"
                  className="btn-secondary mt-3 px-3 py-2 text-xs"
                  onClick={() => openScreenshot(trackingConsultation)}
                >
                  Ver comprovante PAP
                </button>
              ) : null}
            </div>
          ) : null}

          {trackingConsultation.status === "failed" ? (
            <p className="mt-2 text-sm font-medium text-red-700">
              {trackingConsultation.errorMessage || "Erro ao consultar crédito."}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-8">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Histórico recente</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Por padrão, mostra as consultas de hoje. Use as datas para ver outros períodos.
            </p>
          </div>
          <button type="button" className="btn-ghost self-start sm:self-auto" onClick={resetHistoryToToday}>
            Hoje
          </button>
        </div>

        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <FormField id="credit-history-from" label="De">
            {({ id }) => (
              <input
                id={id}
                type="date"
                value={historyDateFrom}
                onChange={handleHistoryDateFromChange}
                className="input-modern"
              />
            )}
          </FormField>
          <FormField id="credit-history-to" label="Até">
            {({ id }) => (
              <input
                id={id}
                type="date"
                value={historyDateTo}
                min={historyDateFrom || undefined}
                onChange={handleHistoryDateToChange}
                className="input-modern"
              />
            )}
          </FormField>
        </div>

        <div className="mt-3">
          <DataTable
            columns={HISTORY_COLUMNS}
            caption="Histórico de consultas de crédito"
            isEmpty={!isLoadingHistory && history.length === 0}
            loading={isLoadingHistory}
            loadingComponent={<SkeletonTable rows={5} cols={7} />}
            emptyIcon="search"
            emptyTitle="Nenhuma consulta neste período"
            emptyDescription="Ajuste o filtro de datas ou realize uma nova consulta de crédito."
          >
            {history.map((item) => (
              <DataTableRow key={item.id}>
                <DataTableCell className="whitespace-nowrap text-slate-600">
                  {formatDate(item.createdAt)}
                </DataTableCell>
                <DataTableCell className="font-medium text-slate-800">
                  {item.documentMasked}
                </DataTableCell>
                <DataTableCell className="text-slate-600">
                  {item.requesterName || "—"}
                </DataTableCell>
                <DataTableCell>
                  <ResultBadge item={item} />
                </DataTableCell>
                <DataTableCell className="text-slate-700">{approvalTypeLabel(item)}</DataTableCell>
                <DataTableCell className="whitespace-nowrap text-slate-600">
                  {formatDuration(item.durationSeconds)}
                </DataTableCell>
                <DataTableCell>
                  {item.hasScreenshot ? (
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => openScreenshot(item)}
                    >
                      Ver comprovante
                    </button>
                  ) : (
                    <span className="text-xs text-slate-400">—</span>
                  )}
                </DataTableCell>
              </DataTableRow>
            ))}
          </DataTable>
        </div>

        {historyTotal > 0 ? (
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-500">
              Mostrando {rangeStart}–{rangeEnd} de {historyTotal}
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn-secondary px-3 py-1.5 text-xs"
                disabled={historyPage <= 1 || isLoadingHistory}
                onClick={() => goToHistoryPage(historyPage - 1)}
              >
                Anterior
              </button>
              <span className="text-xs font-medium text-slate-600">
                Página {historyPage} de {historyTotalPages}
              </span>
              <button
                type="button"
                className="btn-secondary px-3 py-1.5 text-xs"
                disabled={historyPage >= historyTotalPages || isLoadingHistory}
                onClick={() => goToHistoryPage(historyPage + 1)}
              >
                Próxima
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <ScreenshotModal
        open={modalOpen}
        title={modalTitle}
        screenshotBase64={modalScreenshot}
        onClose={() => setModalOpen(false)}
      />
    </PanelCard>
  );
}
