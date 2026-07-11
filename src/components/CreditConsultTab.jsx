import { useCallback, useEffect, useState } from "react";
import {
  getCreditConsultation,
  getCreditConsultationHistory,
  getCreditConsultationScreenshot,
  startCreditConsultation,
} from "../services/api";
import { DataTable, DataTableCell, DataTableRow } from "./ui/DataTable";
import { EmptyState } from "./ui/EmptyState";
import { FormField } from "./ui/FormField";
import { PanelCard } from "./ui/PanelCard";
import { SkeletonTable } from "./ui/Skeleton";
import { useToast } from "./ui/Toast";
import { ScreenshotModal } from "./ScreenshotModal";

const PENDING_CONSULTATION_KEY = "planoideal_pending_credit_consultation_id";

const HISTORY_COLUMNS = [
  { key: "date", label: "Data" },
  { key: "document", label: "Documento" },
  { key: "result", label: "Resultado" },
  { key: "actions", label: "Ações" },
];

function formatDate(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR");
  } catch {
    return iso;
  }
}

function statusLabel(status) {
  if (status === "queued") return "Na fila";
  if (status === "processing") return "Consultando no PAP…";
  if (status === "success") return "Concluída";
  if (status === "failed") return "Erro";
  return status;
}

function ResultBadge({ item }) {
  if (item.status === "queued" || item.status === "processing") {
    return (
      <span className="badge-status badge-status-pending">
        {statusLabel(item.status)}
      </span>
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

function maskDocumentInput(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 14);
  if (digits.length <= 11) {
    return digits
      .replace(/^(\d{3})(\d)/, "$1.$2")
      .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
      .replace(/^(\d{3})\.(\d{3})\.(\d{3})(\d{1,2})$/, "$1.$2.$3-$4");
  }
  return digits
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})(\d)/, "$1.$2.$3/$4")
    .replace(/^(\d{2})\.(\d{3})\.(\d{3})\/(\d{4})(\d{1,2})$/, "$1.$2.$3/$4-$5");
}

export function CreditConsultTab({ token }) {
  const toast = useToast();
  const [document, setDocument] = useState("");
  const [cpfRepresentative, setCpfRepresentative] = useState("");
  const [activeConsultation, setActiveConsultation] = useState(null);
  const [history, setHistory] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [modalScreenshot, setModalScreenshot] = useState("");

  const loadHistory = useCallback(async () => {
    try {
      const data = await getCreditConsultationHistory(token);
      const items = data.consultations || [];
      setHistory(items);
      return items;
    } catch {
      setHistory([]);
      return [];
    } finally {
      setIsLoadingHistory(false);
    }
  }, [token]);

  const resumePendingConsultation = useCallback(async () => {
    const storedId = sessionStorage.getItem(PENDING_CONSULTATION_KEY);
    if (!storedId) return;

    try {
      const data = await getCreditConsultation(storedId, token);
      setActiveConsultation(data.consultation);
      if (data.consultation.status === "success" || data.consultation.status === "failed") {
        sessionStorage.removeItem(PENDING_CONSULTATION_KEY);
      }
    } catch {
      sessionStorage.removeItem(PENDING_CONSULTATION_KEY);
    }
  }, [token]);

  useEffect(() => {
    loadHistory();
    resumePendingConsultation();
  }, [loadHistory, resumePendingConsultation]);

  useEffect(() => {
    const hasPending =
      activeConsultation &&
      activeConsultation.status !== "success" &&
      activeConsultation.status !== "failed";

    const interval = setInterval(async () => {
      const items = await loadHistory();
      if (hasPending && activeConsultation?.id) {
        try {
          const data = await getCreditConsultation(activeConsultation.id, token);
          setActiveConsultation(data.consultation);
          if (data.consultation.status === "success" || data.consultation.status === "failed") {
            sessionStorage.removeItem(PENDING_CONSULTATION_KEY);
          }
        } catch (err) {
          toast.error(err.message || "Falha ao acompanhar consulta.");
        }
      } else if (items.some((item) => item.status === "queued" || item.status === "processing")) {
        const pending = items.find((item) => item.status === "queued" || item.status === "processing");
        if (pending) {
          setActiveConsultation(pending);
          sessionStorage.setItem(PENDING_CONSULTATION_KEY, String(pending.id));
        }
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [activeConsultation?.id, activeConsultation?.status, token, loadHistory, toast]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);
    try {
      const data = await startCreditConsultation({
        token,
        document: document.replace(/\D/g, ""),
        cpfRepresentative: cpfRepresentative.replace(/\D/g, "") || null,
      });
      setActiveConsultation(data.consultation);
      sessionStorage.setItem(PENDING_CONSULTATION_KEY, String(data.consultation.id));
      await loadHistory();
      toast.info("Consulta enviada. O resultado aparecerá em cerca de 30–60 segundos.");
    } catch (err) {
      toast.error(err.message || "Não foi possível iniciar a consulta.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const openScreenshot = async (consultation) => {
    try {
      const data = await getCreditConsultationScreenshot(consultation.id, token);
      setModalTitle(`Comprovante — ${consultation.documentMasked || consultation.document}`);
      setModalScreenshot(data.screenshotBase64);
      setModalOpen(true);
    } catch (err) {
      toast.error(err.message || "Comprovante indisponível.");
    }
  };

  const documentDigits = document.replace(/\D/g, "");
  const showRepresentative = documentDigits.length > 11;

  return (
    <PanelCard
      id="panel-credito"
      title="Consulta de Crédito PAP Nio"
      description="Disponível para admin e vendedor. A consulta leva cerca de 30–60 segundos. Você pode trocar de aba — o processamento continua no servidor."
    >
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={handleSubmit}>
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
              onChange={(e) => setDocument(maskDocumentInput(e.target.value))}
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
                onChange={(e) => setCpfRepresentative(maskDocumentInput(e.target.value))}
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

      {activeConsultation ? (
        <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-800">
            Consulta #{activeConsultation.id} — {activeConsultation.documentMasked}
          </p>
          <p className="mt-1 text-sm text-slate-600">
            Status: <span className="font-medium">{statusLabel(activeConsultation.status)}</span>
          </p>

          {activeConsultation.status === "processing" || activeConsultation.status === "queued" ? (
            <div className="mt-3 space-y-2" role="status" aria-label="Consulta em andamento">
              <div className="skeleton h-3 w-48" />
              <p className="text-sm text-amber-800">
                Aguardando retorno do PAP… o histórico abaixo atualiza automaticamente.
              </p>
            </div>
          ) : null}

          {activeConsultation.status === "success" ? (
            <div className="mt-3">
              <ResultBadge item={activeConsultation} />
              {activeConsultation.resultDetail ? (
                <p className="mt-2 text-sm text-slate-700">{activeConsultation.resultDetail}</p>
              ) : null}
              {activeConsultation.durationSeconds != null ? (
                <p className="mt-1 text-xs text-slate-500">
                  Tempo de resposta: {activeConsultation.durationSeconds}s
                </p>
              ) : null}
              {activeConsultation.hasScreenshot ? (
                <button
                  type="button"
                  className="btn-secondary mt-3 px-3 py-2 text-xs"
                  onClick={() => openScreenshot(activeConsultation)}
                >
                  Ver comprovante PAP
                </button>
              ) : null}
            </div>
          ) : null}

          {activeConsultation.status === "failed" ? (
            <p className="mt-2 text-sm font-medium text-red-700">
              {activeConsultation.errorMessage || "Erro ao consultar crédito."}
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
            loadingComponent={<SkeletonTable rows={5} cols={4} />}
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
