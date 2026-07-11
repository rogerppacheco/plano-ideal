import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import {
  getCreditConsultation,
  getCreditConsultationHistory,
  startCreditConsultation,
} from "../services/api";
import type { CreditConsultation, CreditConsultState, CreditConsultStatus } from "../types/credit";
import { isPendingCreditStatus, isTerminalCreditStatus } from "../types/credit";
import { useToast } from "../components/ui/Toast";

export const PENDING_CREDIT_CONSULTATION_KEY = "planoideal_pending_credit_consultation_id";

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function maskCreditDocumentInput(value: string): string {
  const digits = String(value || "")
    .replace(/\D/g, "")
    .slice(0, 14);
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

function syncPendingStorage(consultation: CreditConsultation | null) {
  if (!consultation) {
    sessionStorage.removeItem(PENDING_CREDIT_CONSULTATION_KEY);
    return;
  }
  if (isTerminalCreditStatus(consultation.status)) {
    sessionStorage.removeItem(PENDING_CREDIT_CONSULTATION_KEY);
    return;
  }
  sessionStorage.setItem(PENDING_CREDIT_CONSULTATION_KEY, String(consultation.id));
}

export function useCreditConsult(token: string) {
  const toast = useToast();
  const [document, setDocument] = useState("");
  const [cpfRepresentative, setCpfRepresentative] = useState("");
  const [consultState, setConsultState] = useState<CreditConsultState>({ status: "idle" });
  const [history, setHistory] = useState<CreditConsultation[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);

  const trackingConsultation =
    consultState.status === "tracking" ? consultState.consultation : null;
  const trackingId = trackingConsultation?.id ?? null;
  const trackingStatus = trackingConsultation?.status ?? null;

  const loadHistory = useCallback(async () => {
    try {
      const data = await getCreditConsultationHistory(token);
      const items = data.consultations ?? [];
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
    const storedId = sessionStorage.getItem(PENDING_CREDIT_CONSULTATION_KEY);
    if (!storedId) return;

    try {
      const data = await getCreditConsultation(storedId, token);
      setConsultState({ status: "tracking", consultation: data.consultation });
      syncPendingStorage(data.consultation);
    } catch {
      sessionStorage.removeItem(PENDING_CREDIT_CONSULTATION_KEY);
    }
  }, [token]);

  useEffect(() => {
    loadHistory();
    resumePendingConsultation();
  }, [loadHistory, resumePendingConsultation]);

  useEffect(() => {
    const hasPending =
      trackingStatus != null && isPendingCreditStatus(trackingStatus as CreditConsultStatus);

    const interval = window.setInterval(async () => {
      const items = await loadHistory();

      if (hasPending && trackingId != null) {
        try {
          const data = await getCreditConsultation(trackingId, token);
          setConsultState({ status: "tracking", consultation: data.consultation });
          syncPendingStorage(data.consultation);
        } catch (error: unknown) {
          toast.error(getErrorMessage(error, "Falha ao acompanhar consulta."));
        }
        return;
      }

      const pending = items.find((item) => isPendingCreditStatus(item.status));
      if (pending) {
        setConsultState({ status: "tracking", consultation: pending });
        syncPendingStorage(pending);
      }
    }, 3000);

    return () => window.clearInterval(interval);
  }, [trackingId, trackingStatus, token, loadHistory, toast]);

  const handleDocumentChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setDocument(maskCreditDocumentInput(event.target.value));
  }, []);

  const handleRepresentativeChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setCpfRepresentative(maskCreditDocumentInput(event.target.value));
  }, []);

  const submitConsultation = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setConsultState({ status: "submitting" });

      try {
        const data = await startCreditConsultation({
          token,
          document: document.replace(/\D/g, ""),
          cpfRepresentative: cpfRepresentative.replace(/\D/g, "") || undefined,
        });
        setConsultState({ status: "tracking", consultation: data.consultation });
        syncPendingStorage(data.consultation);
        await loadHistory();
        toast.info("Consulta enviada. O resultado aparecerá em cerca de 30–60 segundos.");
      } catch (error: unknown) {
        const message = getErrorMessage(error, "Não foi possível iniciar a consulta.");
        setConsultState({ status: "error", message });
        toast.error(message);
      }
    },
    [token, document, cpfRepresentative, loadHistory, toast]
  );

  const documentDigits = document.replace(/\D/g, "");
  const showRepresentative = documentDigits.length > 11;
  const isSubmitting = consultState.status === "submitting";
  const submitError = consultState.status === "error" ? consultState.message : "";

  return {
    document,
    cpfRepresentative,
    consultState,
    trackingConsultation,
    history,
    isLoadingHistory,
    isSubmitting,
    submitError,
    showRepresentative,
    handleDocumentChange,
    handleRepresentativeChange,
    submitConsultation,
    loadHistory,
  };
}
