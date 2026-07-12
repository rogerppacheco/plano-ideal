import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { getOsConsultationScreenshot } from "../services/api";
import type { OsConsultation, OsOrderResult } from "../types/os";
import {
  isPendingOsStatus,
  isOsNotFoundResult,
  isTerminalOsStatus,
  osResultBadgeLabel,
  osStatusLabel,
} from "../types/os";
import { useOsConsult } from "../hooks/useOsConsult";
import { DataTable, DataTableCell, DataTableRow } from "./ui/DataTable";
import type { DataTableColumn } from "./ui/DataTable";
import { FormField } from "./ui/FormField";
import { PanelCard } from "./ui/PanelCard";
import { SkeletonTable } from "./ui/Skeleton";
import { useToast } from "./ui/Toast";
import { ScreenshotModal } from "./ScreenshotModal";

export interface OsConsultTabProps {
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

function ResultBadge({ item }: { item: OsConsultation }) {
  if (isPendingOsStatus(item.status)) {
    return <span className="badge-status badge-status-pending">{osStatusLabel(item.status)}</span>;
  }
  if (item.status === "failed") {
    return <span className="badge-status badge-status-error">Erro</span>;
  }
  if (isOsNotFoundResult(item)) {
    return <span className="badge-status badge-status-pending">OS não encontrada</span>;
  }
  if (item.resultsCount === 0) {
    return <span className="badge-status badge-status-denied">Sem pedidos</span>;
  }
  return <span className="badge-status badge-status-success">{osResultBadgeLabel(item)}</span>;
}

function OrderDetailsTable({ orders }: { orders: OsOrderResult[] }) {
  if (!orders.length) {
    return null;
  }

  return (
    <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-3 py-2">OS</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Plano</th>
            <th className="px-3 py-2">Data</th>
            <th className="px-3 py-2">Agendamento</th>
            <th className="px-3 py-2">Pendência</th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order, index) => (
            <tr key={`${order.numero_os || index}`} className="border-t border-slate-200 text-slate-800">
              <td className="px-3 py-2 font-mono text-xs">{order.numero_os || "—"}</td>
              <td className="px-3 py-2">{order.status || "—"}</td>
              <td className="px-3 py-2">{order.plano || "—"}</td>
              <td className="px-3 py-2 whitespace-nowrap">{order.data_hora || "—"}</td>
              <td className="px-3 py-2">{order.agendamento || order.status_agendamento || "—"}</td>
              <td className="px-3 py-2">{order.pendencia || "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function consultationTitle(consultation: OsConsultation): string {
  const doc = consultation.documentMasked || consultation.document;
  const os = consultation.numeroOsFiltro ? ` · OS ${consultation.numeroOsFiltro}` : "";
  return `Consulta #${consultation.id} — ${doc}${os}`;
}

function OsConsultResultPanel({
  consultation,
  onOpenScreenshot,
}: {
  consultation: OsConsultation;
  onOpenScreenshot?: (consultation: OsConsultation) => void;
}) {
  if (isPendingOsStatus(consultation.status)) {
    return (
      <div className="mt-3 space-y-2" role="status" aria-label="Consulta em andamento">
        <p className="text-sm text-slate-600">
          Status: <span className="font-medium">{osStatusLabel(consultation.status)}</span>
        </p>
        <div className="skeleton h-3 w-48" />
        <p className="text-sm text-amber-800">
          Aguardando retorno do PAP… o histórico abaixo atualiza automaticamente.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        Status: <span className="font-medium">{osStatusLabel(consultation.status)}</span>
      </p>
      {consultation.status === "success" ? (
        <>
          <ResultBadge item={consultation} />
          {consultation.resultSummary ? (
            <p className="text-sm text-slate-700">{consultation.resultSummary}</p>
          ) : null}
          <OrderDetailsTable orders={consultation.results} />
          {consultation.durationSeconds != null ? (
            <p className="text-xs text-slate-500">
              Tempo de resposta: {consultation.durationSeconds}s
            </p>
          ) : null}
          {consultation.hasScreenshot && onOpenScreenshot ? (
            <button
              type="button"
              className="btn-secondary px-3 py-2 text-xs"
              onClick={() => onOpenScreenshot(consultation)}
            >
              Ver captura PAP
            </button>
          ) : null}
        </>
      ) : null}
      {consultation.status === "failed" ? (
        <p className="text-sm font-medium text-red-700">
          {consultation.errorMessage || "Erro ao consultar OS."}
        </p>
      ) : null}
    </div>
  );
}

function OsConsultResultModal({
  open,
  consultation,
  onClose,
  onOpenScreenshot,
}: {
  open: boolean;
  consultation: OsConsultation | null;
  onClose: () => void;
  onOpenScreenshot: (consultation: OsConsultation) => void;
}) {
  useEffect(() => {
    if (!open) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open || !consultation) return null;

  const modal = (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="os-result-modal-title"
        className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3">
          <h3 id="os-result-modal-title" className="text-sm font-bold text-slate-900">
            {consultationTitle(consultation)}
          </h3>
          <button type="button" onClick={onClose} className="btn-secondary px-3 py-1 text-xs">
            Fechar
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-4">
          <OsConsultResultPanel consultation={consultation} onOpenScreenshot={onOpenScreenshot} />
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

function canViewStoredResult(item: OsConsultation): boolean {
  return isTerminalOsStatus(item.status);
}

export function OsConsultTab({ token }: OsConsultTabProps) {
  const toast = useToast();
  const {
    document,
    numeroOs,
    trackingConsultation,
    history,
    isLoadingHistory,
    isSubmitting,
    handleDocumentChange,
    handleNumeroOsChange,
    submitConsultation,
  } = useOsConsult(token);

  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalScreenshot, setModalScreenshot] = useState("");
  const [resultModalConsultation, setResultModalConsultation] = useState<OsConsultation | null>(
    null
  );

  const openScreenshot = async (consultation: OsConsultation) => {
    try {
      const data = await getOsConsultationScreenshot(consultation.id, token);
      setModalTitle(`Consulta OS — ${consultation.documentMasked || consultation.document}`);
      setModalScreenshot(data.screenshotBase64);
      setModalOpen(true);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Captura PAP indisponível.";
      toast.error(message);
    }
  };

  return (
    <PanelCard
      id="panel-consulta-os"
      title="Consulta de OS / Pedido PAP"
      description="Disponível para admin e vendedor. Consulta pedidos dos últimos 30 dias no PAP Nio. Você pode trocar de aba — o processamento continua no servidor."
    >
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={submitConsultation}>
        <FormField
          id="os-document"
          label="CPF ou CNPJ"
          hint="Documento do cliente para filtrar pedidos no PAP."
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

        <FormField
          id="os-numero"
          label="Nº da OS (opcional)"
          hint="Restringe o resultado a uma OS entre os pedidos do CPF nos últimos 30 dias."
        >
          {({ id, describedBy }) => (
            <input
              id={id}
              type="text"
              inputMode="numeric"
              value={numeroOs}
              onChange={handleNumeroOsChange}
              placeholder="Ex: 12345678"
              className="input-modern"
              aria-describedby={describedBy}
            />
          )}
        </FormField>

        <div className="sm:col-span-2">
          <button type="submit" className="btn-primary" disabled={isSubmitting}>
            {isSubmitting ? "Enviando consulta…" : "Consultar OS"}
          </button>
        </div>
      </form>

      {trackingConsultation ? (
        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-800">
            {consultationTitle(trackingConsultation)}
          </p>
          <OsConsultResultPanel
            consultation={trackingConsultation}
            onOpenScreenshot={openScreenshot}
          />
        </div>
      ) : null}

      <div className="mt-8">
        <h3 className="text-sm font-bold text-slate-900">Histórico recente</h3>
        <div className="mt-3">
          <DataTable
            columns={HISTORY_COLUMNS}
            caption="Histórico de consultas de OS"
            isEmpty={!isLoadingHistory && history.length === 0}
            loading={isLoadingHistory}
            loadingComponent={<SkeletonTable rows={5} cols={5} />}
            emptyIcon="search"
            emptyTitle="Nenhuma consulta de OS ainda"
            emptyDescription="As consultas de pedido aparecerão aqui assim que forem enviadas."
          >
            {history.map((item) => (
              <DataTableRow key={item.id}>
                <DataTableCell className="whitespace-nowrap text-slate-600">
                  {formatDate(item.createdAt)}
                </DataTableCell>
                <DataTableCell className="font-medium text-slate-800">
                  {item.documentMasked}
                  {item.numeroOsFiltro ? (
                    <span className="ml-1 text-xs text-slate-500">· OS {item.numeroOsFiltro}</span>
                  ) : null}
                </DataTableCell>
                <DataTableCell className="text-slate-600">
                  {item.requesterName || "—"}
                </DataTableCell>
                <DataTableCell>
                  <ResultBadge item={item} />
                </DataTableCell>
                <DataTableCell>
                  <div className="flex flex-wrap items-center gap-2">
                    {canViewStoredResult(item) ? (
                      <button
                        type="button"
                        className="btn-ghost"
                        onClick={() => setResultModalConsultation(item)}
                      >
                        Ver resultado
                      </button>
                    ) : null}
                    {item.hasScreenshot ? (
                      <button type="button" className="btn-ghost" onClick={() => openScreenshot(item)}>
                        Ver captura
                      </button>
                    ) : null}
                    {!canViewStoredResult(item) && !item.hasScreenshot ? (
                      <span className="text-xs text-slate-400">—</span>
                    ) : null}
                  </div>
                </DataTableCell>
              </DataTableRow>
            ))}
          </DataTable>
        </div>
      </div>

      <OsConsultResultModal
        open={resultModalConsultation != null}
        consultation={resultModalConsultation}
        onClose={() => setResultModalConsultation(null)}
        onOpenScreenshot={openScreenshot}
      />

      <ScreenshotModal
        open={modalOpen}
        title={modalTitle}
        screenshotBase64={modalScreenshot}
        onClose={() => setModalOpen(false)}
      />
    </PanelCard>
  );
}
