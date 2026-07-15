import { useEffect, useState, type ChangeEvent, type FormEvent } from "react";
import { BRAZILIAN_UFS } from "../constants/brazilianUfs";
import {
  ApiError,
  getGdpPricingSummary,
  getLeadsWhatsappSetting,
  updateLeadsWhatsappConfig,
  uploadGdpPricingSpreadsheet,
} from "../services/api";
import type { GdpPricingSummaryResponse } from "../types/gdpPricing";
import { FormField } from "./ui/FormField";
import { PanelCard } from "./ui/PanelCard";
import { SkeletonTable } from "./ui/Skeleton";
import { useToast } from "./ui/Toast";

export interface SiteSettingsAdminTabProps {
  token: string;
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError || error instanceof Error) {
    return error.message || fallback;
  }
  return fallback;
}

function formatUpdatedAt(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("pt-BR");
}

function buildEmptyRegionalMap(): Record<string, string> {
  return Object.fromEntries(BRAZILIAN_UFS.map((item) => [item.uf, ""]));
}

export function SiteSettingsAdminTab({ token }: SiteSettingsAdminTabProps) {
  const toast = useToast();
  const [defaultNumber, setDefaultNumber] = useState("");
  const [byUf, setByUf] = useState<Record<string, string>>(() => buildEmptyRegionalMap());
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [updatedByName, setUpdatedByName] = useState<string | null>(null);
  const [gdpSummary, setGdpSummary] = useState<GdpPricingSummaryResponse | null>(null);
  const [gdpFile, setGdpFile] = useState<File | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingGdp, setIsUploadingGdp] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function loadAll() {
      setIsLoading(true);
      setLoadError(null);

      const [whatsappResult, gdpResult] = await Promise.allSettled([
        getLeadsWhatsappSetting(token),
        getGdpPricingSummary(token),
      ]);

      if (cancelled) return;

      const errors: string[] = [];

      if (whatsappResult.status === "fulfilled") {
        const whatsappData = whatsappResult.value;
        setDefaultNumber(whatsappData.defaultNumber ?? "");
        setByUf({ ...buildEmptyRegionalMap(), ...(whatsappData.byUf ?? {}) });
        setUpdatedAt(whatsappData.updatedAt);
        setUpdatedByName(whatsappData.updatedByName);
      } else {
        errors.push(
          getErrorMessage(whatsappResult.reason, "Falha ao carregar configuração de WhatsApp.")
        );
      }

      if (gdpResult.status === "fulfilled") {
        setGdpSummary(gdpResult.value);
      } else {
        errors.push(getErrorMessage(gdpResult.reason, "Falha ao carregar resumo da planilha GDP."));
      }

      if (errors.length) {
        const message = errors.join(" ");
        setLoadError(message);
        toast.error(message);
      }

      setIsLoading(false);
    }

    void loadAll();

    return () => {
      cancelled = true;
    };
  }, [token, toast]);

  const handleRegionalChange = (uf: string, value: string) => {
    setByUf((current) => ({ ...current, [uf]: value }));
  };

  const handleWhatsappSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSaving(true);
    try {
      const regionalPayload = Object.fromEntries(
        Object.entries(byUf).filter(([, number]) => String(number || "").trim())
      );
      const data = await updateLeadsWhatsappConfig({
        token,
        defaultNumber,
        byUf: regionalPayload,
      });
      setDefaultNumber(data.defaultNumber ?? "");
      setByUf({ ...buildEmptyRegionalMap(), ...(data.byUf ?? {}) });
      setUpdatedAt(data.updatedAt);
      setUpdatedByName(data.updatedByName);
      toast.success("Configuração de WhatsApp atualizada.");
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Não foi possível salvar a configuração."));
    } finally {
      setIsSaving(false);
    }
  };

  const handleGdpFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setGdpFile(file);
  };

  const handleGdpUpload = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!gdpFile) {
      toast.error("Selecione a planilha GDP (.xlsx).");
      return;
    }

    setIsUploadingGdp(true);
    try {
      const response = await uploadGdpPricingSpreadsheet({ token, file: gdpFile });
      setGdpSummary(response.summary);
      setGdpFile(null);
      toast.success(response.message);
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Não foi possível importar a planilha GDP."));
    } finally {
      setIsUploadingGdp(false);
    }
  };

  if (isLoading) {
    return (
      <PanelCard title="Configurações do site" description="Carregando…">
        <SkeletonTable rows={2} cols={1} />
      </PanelCard>
    );
  }

  const formattedUpdatedAt = formatUpdatedAt(updatedAt);
  const hasAnyWhatsappConfig =
    Boolean(defaultNumber.trim()) || Object.values(byUf).some((value) => value.trim());
  const lastGdpImport = gdpSummary?.lastImport ?? null;
  const formattedGdpImport = formatUpdatedAt(lastGdpImport?.importedAt ?? null);

  return (
    <div className="space-y-6">
      {loadError ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {loadError} Você ainda pode editar e salvar abaixo; recarregue a página para tentar
          novamente.
        </div>
      ) : null}
      <PanelCard
        title="Preços por cidade (GDP)"
        description="Importe a planilha GDP para atualizar os preços exibidos no site conforme a cidade do visitante."
      >
        <div className="mt-4 space-y-4">
          <p className="text-sm text-slate-600">
            Use o arquivo <strong>.xlsx</strong> com a aba <strong>PAP (Local)</strong>. A importação
            substitui todos os preços por cidade cadastrados anteriormente.
          </p>

          <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 text-sm text-slate-700">
            <p>
              <strong>{gdpSummary?.citiesCount ?? 0}</strong> cidades com preços cadastrados.
            </p>
            {lastGdpImport && formattedGdpImport ? (
              <p className="mt-1">
                Última importação: {formattedGdpImport}
                {lastGdpImport.importedByName ? ` por ${lastGdpImport.importedByName}` : ""}
                {" — "}
                {lastGdpImport.fileName} ({lastGdpImport.citiesCount} cidades, {lastGdpImport.status})
              </p>
            ) : (
              <p className="mt-1 text-amber-700">
                Nenhuma planilha GDP importada. O site usará os preços padrão até a primeira
                importação.
              </p>
            )}
          </div>

          <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={handleGdpUpload}>
            <FormField
              id="gdp-pricing-file"
              label="Planilha GDP"
              hint="Arquivo .xlsx com cidades e ofertas (ex: 20260701_B2C_GDP.xlsx)"
              className="flex-1"
            >
              {({ id, describedBy }) => (
                <input
                  id={id}
                  aria-describedby={describedBy}
                  type="file"
                  accept=".xlsx"
                  className="input-field"
                  onChange={handleGdpFileChange}
                  disabled={isUploadingGdp}
                />
              )}
            </FormField>
            <button type="submit" className="btn-primary shrink-0" disabled={isUploadingGdp || !gdpFile}>
              {isUploadingGdp ? "Importando…" : "Importar planilha"}
            </button>
          </form>
        </div>
      </PanelCard>

      <PanelCard
        title="WhatsApp dos leads"
        description="Configure o WhatsApp que receberá os leads. O sistema identifica estado e cidade pelo CEP."
      >
        <form className="mt-4 space-y-6" onSubmit={handleWhatsappSubmit}>
          <div className="max-w-xl">
            <FormField
              id="leads-whatsapp-default"
              label="WhatsApp padrão (fallback)"
              hint="DDD + número, sem o 55. Ex: 11999999999. Usado quando não houver número específico para o estado."
              required
            >
              {({ id, describedBy, "aria-invalid": ariaInvalid }) => (
                <input
                  id={id}
                  aria-describedby={describedBy}
                  aria-invalid={ariaInvalid}
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  className="input-field"
                  placeholder="11999999999"
                  value={defaultNumber}
                  onChange={(event) => setDefaultNumber(event.target.value)}
                  disabled={isSaving}
                />
              )}
            </FormField>
          </div>

          <div>
            <h3 className="text-sm font-bold text-slate-800">Números por estado (opcional)</h3>
            <p className="mt-1 text-sm text-slate-600">
              Deixe em branco para usar o número padrão naquele estado. O código do país (55) é
              adicionado automaticamente.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {BRAZILIAN_UFS.map((state) => (
                <div key={state.uf} className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                  <label
                    htmlFor={`whatsapp-${state.uf}`}
                    className="block text-sm font-semibold text-slate-800"
                  >
                    {state.name} ({state.uf})
                  </label>
                  <input
                    id={`whatsapp-${state.uf}`}
                    type="tel"
                    inputMode="numeric"
                    className="input-field mt-2"
                    placeholder="Opcional"
                    value={byUf[state.uf] ?? ""}
                    onChange={(event) => handleRegionalChange(state.uf, event.target.value)}
                    disabled={isSaving}
                  />
                </div>
              ))}
            </div>
          </div>

          {formattedUpdatedAt ? (
            <p className="text-sm text-slate-600">
              Última atualização: {formattedUpdatedAt}
              {updatedByName ? ` por ${updatedByName}` : ""}
            </p>
          ) : !hasAnyWhatsappConfig ? (
            <p className="text-sm text-amber-700">
              Nenhum número configurado. Os visitantes não conseguirão enviar leads pelo site até que
              o WhatsApp padrão seja preenchido.
            </p>
          ) : null}

          <button type="submit" className="btn-primary" disabled={isSaving}>
            {isSaving ? "Salvando…" : "Salvar WhatsApp"}
          </button>
        </form>
      </PanelCard>
    </div>
  );
}
