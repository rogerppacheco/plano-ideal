import { useCallback, useMemo, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { getCoverageByCep } from "../services/api";
import type { CoverageRecord } from "../types/coverage";
import { maskCep, normalizeCoverageRecords, pickFieldFromRow } from "../utils/coverage";

export type CoverageConsultState =
  | { status: "idle" }
  | { status: "loading" }
  | {
      status: "success";
      cep: string;
      operators: string[];
      records: CoverageRecord[];
    }
  | { status: "error"; message: string };

export function formatAddressFromCoverageRecords(records: CoverageRecord[]): string {
  if (!Array.isArray(records) || records.length === 0) return "";
  const row = records[0]?.row_data ?? {};
  const logradouro = pickFieldFromRow(row, [
    "LOGRADOURO",
    "logradouro",
    "ENDERECO",
    "ENDEREÇO",
    "endereco",
  ]);
  const numero = pickFieldFromRow(row, [
    "NUM",
    "Numero",
    "NUMERO",
    "numero",
    "NUM_FACHADA",
    "num_fachada",
  ]);
  const bairro = pickFieldFromRow(row, ["BAIRRO", "bairro"]);
  const cidade = pickFieldFromRow(row, ["CIDADE", "Cidade", "MUNICIPIO", "municipio", "MUNICÍPIO"]);
  const uf = pickFieldFromRow(row, ["UF", "uf"]);

  const ruaNumero = [logradouro, numero].filter(Boolean).join(", ");
  const cidadeUf = [cidade, uf].filter(Boolean).join("/");
  return [ruaNumero, bairro, cidadeUf].filter(Boolean).join(" - ");
}

function getErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function useCoverageConsult(token: string) {
  const [cep, setCep] = useState("");
  const [consultState, setConsultState] = useState<CoverageConsultState>({ status: "idle" });

  const handleCepChange = useCallback((event: ChangeEvent<HTMLInputElement>) => {
    setCep(maskCep(event.target.value));
    setConsultState((prev) => (prev.status === "error" ? { status: "idle" } : prev));
  }, []);

  const submitConsult = useCallback(
    async (
      event: FormEvent<HTMLFormElement>,
      onSuccess?: (operatorCount: number) => void,
      onEmpty?: () => void,
      onFailure?: (message: string) => void
    ) => {
      event.preventDefault();

      if (cep.length !== 9) {
        const message = "Informe um CEP válido no formato 00000-000.";
        setConsultState({ status: "error", message });
        onFailure?.(message);
        return;
      }

      setConsultState({ status: "loading" });

      try {
        const data = await getCoverageByCep(cep, token);
        const records = normalizeCoverageRecords(data.records ?? []);
        const operators = data.operators ?? [];

        setConsultState({
          status: "success",
          cep,
          operators,
          records,
        });

        if (operators.length > 0) {
          onSuccess?.(operators.length);
        } else {
          onEmpty?.();
        }
      } catch (error) {
        const message = getErrorMessage(error, "Não foi possível consultar o CEP.");
        setConsultState({ status: "error", message });
        onFailure?.(message);
      }
    },
    [cep, token]
  );

  const consultedAddress = useMemo(() => {
    if (consultState.status !== "success") return "";
    return formatAddressFromCoverageRecords(consultState.records);
  }, [consultState]);

  const consultError = consultState.status === "error" ? consultState.message : "";
  const isConsulting = consultState.status === "loading";
  const consultResult = consultState.status === "success" ? consultState : null;

  return {
    cep,
    consultState,
    consultResult,
    consultError,
    isConsulting,
    consultedAddress,
    handleCepChange,
    submitConsult,
  };
}
