import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { getOsConsultation, getOsConsultationHistory, startOsConsultation } from "../services/api";
import type { OsConsultation, OsConsultState, OsConsultStatus } from "../types/os";
import { isPendingOsStatus, isTerminalOsStatus } from "../types/os";
import { maskCreditDocumentInput } from "./useCreditConsult";
import { useToast } from "../components/ui/Toast";

export const PENDING_OS_CONSULTATION_KEY = "planoideal_pending_os_consultation_id";

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function syncPendingStorage(consultation: OsConsultation | null) {
  if (!consultation) {
    sessionStorage.removeItem(PENDING_OS_CONSULTATION_KEY);
    return;
  }
  if (isTerminalOsStatus(consultation.status)) {
    sessionStorage.removeItem(PENDING_OS_CONSULTATION_KEY);
    return;
  }
  sessionStorage.setItem(PENDING_OS_CONSULTATION_KEY, String(consultation.id));
}

export function useOsConsult(token: string) {
  const toast = useToast();
  const [document, setDocument] = useState("");
  const [numeroOs, setNumeroOs] = useState("");
  const [consultState, setConsultState] = useState<OsConsultState>({ status: "idle" });
  const [history, setHistory] = useState<OsConsultation[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);

  const trackingConsultation =
    consultState.status === "tracking" ? consultState.consultation : null;
  const trackingId = trackingConsultation?.id ?? null;
  const trackingStatus = trackingConsultation?.status ?? null;

  const loadHistory = useCallback(async () => {
    try {
      const data = await getOsConsultationHistory(token);
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
    const storedId = sessionStorage.getItem(PENDING_OS_CONSULTATION_KEY);
    if (!storedId) return;

    try {
      const data = await getOsConsultation(storedId, token);
      setConsultState({ status: "tracking", consultation: data.consultation });
      syncPendingStorage(data.consultation);
    } catch {
      sessionStorage.removeItem(PENDING_OS_CONSULTATION_KEY);
    }
  }, [token]);

  useEffect(() => {
    loadHistory();
    resumePendingConsultation();
  }, [loadHistory, resumePendingConsultation]);

  useEffect(() => {
    const hasPending =
      trackingStatus != null && isPendingOsStatus(trackingStatus as OsConsultStatus);

    const interval = window.setInterval(async () => {
      const items = await loadHistory();

      if (hasPending && trackingId != null) {
        try {
          const data = await getOsConsultation(trackingId, token);
          setConsultState({ status: "tracking", consultation: data.consultation });
          syncPendingStorage(data.consultation);
        } catch (error: unknown) {
          toast.error(getErrorMessage(error, "Falha ao acompanhar consulta de OS."));
        }
        return;
      }

      const pending = items.find((item) => isPendingOsStatus(item.status));
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

  const handleNumeroOsChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setNumeroOs(event.target.value.replace(/\D/g, "").slice(0, 12));
  }, []);

  const submitConsultation = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      setConsultState({ status: "submitting" });

      try {
        const data = await startOsConsultation({
          token,
          document: document.replace(/\D/g, ""),
          numeroOs: numeroOs || undefined,
        });
        setConsultState({ status: "tracking", consultation: data.consultation });
        syncPendingStorage(data.consultation);
        await loadHistory();
        toast.info("Consulta enviada. O resultado aparecerá em cerca de 30–90 segundos.");
      } catch (error: unknown) {
        const message = getErrorMessage(error, "Não foi possível iniciar a consulta de OS.");
        setConsultState({ status: "error", message });
        toast.error(message);
      }
    },
    [token, document, numeroOs, loadHistory, toast]
  );

  const isSubmitting = consultState.status === "submitting";
  const submitError = consultState.status === "error" ? consultState.message : "";

  return {
    document,
    numeroOs,
    consultState,
    trackingConsultation,
    history,
    isLoadingHistory,
    isSubmitting,
    submitError,
    handleDocumentChange,
    handleNumeroOsChange,
    submitConsultation,
    loadHistory,
  };
}
