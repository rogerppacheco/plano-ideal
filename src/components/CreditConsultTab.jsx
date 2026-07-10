import { useCallback, useEffect, useState } from "react";
import {
  getCreditConsultation,
  getCreditConsultationHistory,
  getCreditConsultationScreenshot,
  startCreditConsultation,
} from "../services/api";
import { ScreenshotModal } from "./ScreenshotModal";

const PENDING_CONSULTATION_KEY = "planoideal_pending_credit_consultation_id";

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
  const [document, setDocument] = useState("");
  const [cpfRepresentative, setCpfRepresentative] = useState("");
  const [activeConsultation, setActiveConsultation] = useState(null);
  const [history, setHistory] = useState([]);
  const [error, setError] = useState("");
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
    } catch (err) {
      setHistory([]);
      return [];
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
          setError(err.message || "Falha ao acompanhar consulta.");
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
  }, [activeConsultation?.id, activeConsultation?.status, token, loadHistory]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
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
    } catch (err) {
      setError(err.message || "Não foi possível iniciar a consulta.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const openScreenshot = async (consultation) => {
    try {
      setError("");
      const data = await getCreditConsultationScreenshot(consultation.id, token);
      setModalTitle(`Comprovante — ${consultation.documentMasked || consultation.document}`);
      setModalScreenshot(data.screenshotBase64);
      setModalOpen(true);
    } catch (err) {
      setError(err.message || "Comprovante indisponível.");
    }
  };

  const documentDigits = document.replace(/\D/g, "");
  const showRepresentative = documentDigits.length > 11;

  return (
    <section className="surface-card p-6">
      <h2 className="text-xl font-bold text-slate-900">Consulta de Crédito PAP Nio</h2>
      <p className="mt-1 text-sm text-slate-600">
        Disponível para admin e vendedor. A consulta leva cerca de 30–60 segundos. Você pode trocar
        de aba — o processamento continua no servidor e o histórico atualiza automaticamente.
      </p>

      <form className="mt-4 grid gap-3 sm:grid-cols-2" onSubmit={handleSubmit}>
        <div>
          <label className="text-xs font-semibold text-slate-700">CPF ou CNPJ</label>
          <input
            type="text"
            inputMode="numeric"
            value={document}
            onChange={(e) => setDocument(maskDocumentInput(e.target.value))}
            placeholder="000.000.000-00"
            className="input-modern mt-1"
            required
          />
        </div>
        {showRepresentative ? (
          <div>
            <label className="text-xs font-semibold text-slate-700">CPF do representante</label>
            <input
              type="text"
              inputMode="numeric"
              value={cpfRepresentative}
              onChange={(e) => setCpfRepresentative(maskDocumentInput(e.target.value))}
              placeholder="000.000.000-00"
              className="input-modern mt-1"
              required
            />
          </div>
        ) : null}
        <div className="sm:col-span-2">
          <button type="submit" className="btn-primary" disabled={isSubmitting}>
            {isSubmitting ? "Enviando…" : "Consultar crédito"}
          </button>
        </div>
      </form>

      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}

      {activeConsultation ? (
        <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm font-semibold text-slate-800">
            Consulta #{activeConsultation.id} — {activeConsultation.documentMasked}
          </p>
          <p className="mt-1 text-sm text-slate-600">Status: {statusLabel(activeConsultation.status)}</p>

          {activeConsultation.status === "processing" || activeConsultation.status === "queued" ? (
            <p className="mt-2 text-sm text-amber-800">
              Aguardando retorno do PAP… o histórico abaixo atualiza sozinho.
            </p>
          ) : null}

          {activeConsultation.status === "success" ? (
            <div className="mt-3">
              {activeConsultation.approved ? (
                <p className="text-sm font-semibold text-emerald-700">Crédito APROVADO</p>
              ) : (
                <p className="text-sm font-semibold text-red-700">Crédito NEGADO</p>
              )}
              {activeConsultation.resultDetail ? (
                <p className="mt-1 text-sm text-slate-700">{activeConsultation.resultDetail}</p>
              ) : null}
              {activeConsultation.durationSeconds != null ? (
                <p className="mt-1 text-xs text-slate-500">{activeConsultation.durationSeconds}s</p>
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
            <p className="mt-2 text-sm text-red-700">
              {activeConsultation.errorMessage || "Erro ao consultar crédito."}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-6">
        <h3 className="text-sm font-bold text-slate-900">Histórico recente</h3>
        {history.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">Nenhuma consulta realizada ainda.</p>
        ) : (
          <div className="mt-2 overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                  <th className="py-2 pr-3">Data</th>
                  <th className="py-2 pr-3">Documento</th>
                  <th className="py-2 pr-3">Resultado</th>
                  <th className="py-2 pr-3">Ações</th>
                </tr>
              </thead>
              <tbody>
                {history.map((item) => (
                  <tr key={item.id} className="border-b border-slate-100">
                    <td className="py-2 pr-3 text-slate-600">{formatDate(item.createdAt)}</td>
                    <td className="py-2 pr-3 font-medium text-slate-800">{item.documentMasked}</td>
                    <td className="py-2 pr-3">
                      <ResultBadge item={item} />
                    </td>
                    <td className="py-2 pr-3">
                      {item.hasScreenshot ? (
                        <button
                          type="button"
                          className="text-xs font-semibold text-indigo-700 hover:underline"
                          onClick={() => openScreenshot(item)}
                        >
                          Ver comprovante
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ScreenshotModal
        open={modalOpen}
        title={modalTitle}
        screenshotBase64={modalScreenshot}
        onClose={() => setModalOpen(false)}
      />
    </section>
  );
}
