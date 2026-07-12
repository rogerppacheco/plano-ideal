import { useState } from "react";
import { getOsConsultationScreenshot } from "../services/api";
import type { OsConsultation, OsOrderResult } from "../types/os";
import { isPendingOsStatus, osResultBadgeLabel, osStatusLabel } from "../types/os";
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
  if (item.resultsCount === 0) {
    return <span className="badge-status badge-status-denied">Sem pedidos</span>;
  }
  return <span className="badge-status badge-status-success">{osResultBadgeLabel(item)}</span>;
}

function OrderDetailsTable({ orders }: { orders: OsOrderResult[] }) {
  if (!orders.length) {
    return (
      <p className="text-sm text-slate-600">
        Nenhum pedido nos últimos 30 dias para este documento.
      </p>
    );
  }

  return (
    <div className="mt-3 overflow-x-auto rounded-xl border border-white/10">
      <table className="min-w-full text-sm">
        <thead className="bg-white/5 text-left text-xs uppercase tracking-wide text-gray-400">
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
            <tr
              key={`${order.numero_os || index}`}
              className="border-t border-white/10 text-gray-100"
            >
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
          hint="Filtra um pedido específico, como no fluxo STATUS do WhatsApp."
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
            Consulta #{trackingConsultation.id} — {trackingConsultation.documentMasked}
            {trackingConsultation.numeroOsFiltro
              ? ` · OS ${trackingConsultation.numeroOsFiltro}`
              : ""}
          </p>
          <p className="mt-1 text-sm text-slate-600">
            Status:{" "}
            <span className="font-medium">{osStatusLabel(trackingConsultation.status)}</span>
          </p>

          {isPendingOsStatus(trackingConsultation.status) ? (
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
              {trackingConsultation.resultSummary ? (
                <p className="mt-2 text-sm text-slate-700">{trackingConsultation.resultSummary}</p>
              ) : null}
              <OrderDetailsTable orders={trackingConsultation.results} />
              {trackingConsultation.durationSeconds != null ? (
                <p className="mt-2 text-xs text-slate-500">
                  Tempo de resposta: {trackingConsultation.durationSeconds}s
                </p>
              ) : null}
              {trackingConsultation.hasScreenshot ? (
                <button
                  type="button"
                  className="btn-secondary mt-3 px-3 py-2 text-xs"
                  onClick={() => openScreenshot(trackingConsultation)}
                >
                  Ver captura PAP
                </button>
              ) : null}
            </div>
          ) : null}

          {trackingConsultation.status === "failed" ? (
            <p className="mt-2 text-sm font-medium text-red-700">
              {trackingConsultation.errorMessage || "Erro ao consultar OS."}
            </p>
          ) : null}
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
                  {item.hasScreenshot ? (
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => openScreenshot(item)}
                    >
                      Ver captura
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
