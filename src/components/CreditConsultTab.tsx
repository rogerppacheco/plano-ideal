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
    handleDocumentChange,
    handleRepresentativeChange,
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
        <h3 className="text-sm font-bold text-slate-900">Histórico recente</h3>
        <div className="mt-3">
          <DataTable
            columns={HISTORY_COLUMNS}
            caption="Histórico de consultas de crédito"
            isEmpty={!isLoadingHistory && history.length === 0}
            loading={isLoadingHistory}
            loadingComponent={<SkeletonTable rows={5} cols={5} />}
            emptyIcon="search"
            emptyTitle="Nenhuma consulta realizada ainda"
            emptyDescription="As consultas de crédito aparecerão aqui assim que forem enviadas."
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
