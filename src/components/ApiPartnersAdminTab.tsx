import { useCallback, useEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import {
  ApiError,
  createPartner,
  createPartnerApiKey,
  getPartnerApiKeys,
  getPartners,
  revokePartnerApiKey,
  updatePartner,
} from "../services/api";
import { API_SCOPES, type ApiKeyView, type ApiScope, type Partner } from "../types/apiKeys";
import { ConfirmDialog } from "./ui/ConfirmDialog";
import { EmptyState } from "./ui/EmptyState";
import { FormField } from "./ui/FormField";
import { PanelCard } from "./ui/PanelCard";
import { SkeletonTable } from "./ui/Skeleton";
import { useToast } from "./ui/Toast";

export interface ApiPartnersAdminTabProps {
  token: string;
}

function formatDateTime(value?: string | null): string {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError || error instanceof Error) {
    return error.message || fallback;
  }
  return fallback;
}

interface ApiKeyRevealModalProps {
  open: boolean;
  plaintext: string;
  onClose: () => void;
}

function ApiKeyRevealModal({ open, plaintext, onClose }: ApiKeyRevealModalProps) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!open) {
      setCopied(false);
      return undefined;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  if (!open) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(plaintext);
      setCopied(true);
      toast.success("Chave copiada!");
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error("Não foi possível copiar. Selecione e copie manualmente.");
    }
  };

  const modal = (
    <div
      className="fixed inset-0 z-[100] flex min-h-screen items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="api-key-reveal-title"
        className="w-full max-w-xl overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="border-b border-slate-200 px-5 py-4">
          <h3 id="api-key-reveal-title" className="text-lg font-bold text-slate-900">
            Nova API Key gerada
          </h3>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">
            <p className="font-semibold">Atenção: visualização única</p>
            <p className="mt-1">
              O segredo completo não é armazenado em texto plano. Após fechar este modal, não será
              possível recuperar a chave — apenas revogá-la e gerar outra.
            </p>
          </div>

          <FormField id="api-key-plaintext" label="Chave de API (pk_live_...)">
            {({ id }) => (
              <input
                id={id}
                type="text"
                readOnly
                value={plaintext}
                className="input-modern font-mono text-xs"
                onFocus={(event) => event.currentTarget.select()}
              />
            )}
          </FormField>

          <div className="flex flex-wrap gap-2">
            <button type="button" className="btn-primary" onClick={handleCopy}>
              {copied ? "✓ Copiada" : "Copiar chave"}
            </button>
            <button type="button" className="btn-secondary" onClick={onClose}>
              Já copiei — fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

export function ApiPartnersAdminTab({ token }: ApiPartnersAdminTabProps) {
  const toast = useToast();
  const [partners, setPartners] = useState<Partner[]>([]);
  const [selectedPartnerId, setSelectedPartnerId] = useState<number | null>(null);
  const [apiKeys, setApiKeys] = useState<ApiKeyView[]>([]);
  const [isLoadingPartners, setIsLoadingPartners] = useState(true);
  const [isLoadingKeys, setIsLoadingKeys] = useState(false);
  const [isCreatingPartner, setIsCreatingPartner] = useState(false);
  const [isCreatingKey, setIsCreatingKey] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<ApiKeyView | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);
  const [revealedPlaintext, setRevealedPlaintext] = useState<string | null>(null);

  const [newPartnerName, setNewPartnerName] = useState("");
  const [newPartnerSlug, setNewPartnerSlug] = useState("");
  const [newPartnerEmail, setNewPartnerEmail] = useState("");
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyScopes, setNewKeyScopes] = useState<ApiScope[]>([...API_SCOPES]);

  const selectedPartner = partners.find((partner) => partner.id === selectedPartnerId) ?? null;

  const loadPartners = useCallback(async () => {
    setIsLoadingPartners(true);
    try {
      const data = await getPartners(token);
      const list = data.partners || [];
      setPartners(list);
      if (list.length > 0 && !list.some((partner) => partner.id === selectedPartnerId)) {
        setSelectedPartnerId(list[0].id);
      }
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Falha ao carregar parceiros."));
    } finally {
      setIsLoadingPartners(false);
    }
  }, [token, toast, selectedPartnerId]);

  const loadApiKeys = useCallback(
    async (partnerId: number) => {
      setIsLoadingKeys(true);
      try {
        const data = await getPartnerApiKeys(partnerId, token);
        setApiKeys(data.apiKeys || []);
      } catch (error: unknown) {
        toast.error(getErrorMessage(error, "Falha ao carregar chaves do parceiro."));
      } finally {
        setIsLoadingKeys(false);
      }
    },
    [token, toast]
  );

  useEffect(() => {
    loadPartners();
  }, [loadPartners]);

  useEffect(() => {
    if (!selectedPartnerId) {
      setApiKeys([]);
      return;
    }
    loadApiKeys(selectedPartnerId);
  }, [selectedPartnerId, loadApiKeys]);

  const handleCreatePartner = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    try {
      setIsCreatingPartner(true);
      await createPartner({
        token,
        name: newPartnerName,
        slug: newPartnerSlug || undefined,
        contactEmail: newPartnerEmail || undefined,
      });
      toast.success("Parceiro criado com sucesso.");
      setNewPartnerName("");
      setNewPartnerSlug("");
      setNewPartnerEmail("");
      await loadPartners();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Não foi possível criar parceiro."));
    } finally {
      setIsCreatingPartner(false);
    }
  };

  const handleTogglePartnerStatus = async (partner: Partner) => {
    try {
      const result = await updatePartner({
        token,
        partnerId: partner.id,
        isActive: !partner.isActive,
      });
      toast.success(result.message || "Status do parceiro atualizado.");
      await loadPartners();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Não foi possível atualizar parceiro."));
    }
  };

  const toggleScope = (scope: ApiScope) => {
    setNewKeyScopes((current) => {
      if (current.includes(scope)) {
        const next = current.filter((item) => item !== scope);
        return next.length > 0 ? next : current;
      }
      return [...current, scope];
    });
  };

  const handleCreateApiKey = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedPartnerId) return;
    try {
      setIsCreatingKey(true);
      const result = await createPartnerApiKey({
        token,
        partnerId: selectedPartnerId,
        name: newKeyName,
        scopes: newKeyScopes,
      });
      setRevealedPlaintext(result.plaintext);
      setNewKeyName("");
      setNewKeyScopes([...API_SCOPES]);
      toast.success(result.message || "Chave criada com sucesso.");
      await loadApiKeys(selectedPartnerId);
      await loadPartners();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Não foi possível gerar chave."));
    } finally {
      setIsCreatingKey(false);
    }
  };

  const handleRevokeKey = async () => {
    if (!revokeTarget || !selectedPartnerId) return;
    setIsRevoking(true);
    try {
      const result = await revokePartnerApiKey(revokeTarget.id, token);
      toast.success(result.message || "Chave revogada.");
      setRevokeTarget(null);
      await loadApiKeys(selectedPartnerId);
      await loadPartners();
    } catch (error: unknown) {
      toast.error(getErrorMessage(error, "Não foi possível revogar chave."));
    } finally {
      setIsRevoking(false);
    }
  };

  return (
    <>
      <div className="grid gap-6 xl:grid-cols-2">
        <PanelCard
          id="panel-parceiros"
          title="Parceiros B2B"
          description="Tenants externos (Allvo, Record, Inova MG…) isolados dos usuários internos."
        >
          <form className="mb-6 grid gap-4" onSubmit={handleCreatePartner}>
            <FormField id="partner-name" label="Nome do parceiro" required>
              {({ id }) => (
                <input
                  id={id}
                  type="text"
                  className="input-modern"
                  value={newPartnerName}
                  onChange={(event) => setNewPartnerName(event.target.value)}
                  required
                />
              )}
            </FormField>
            <FormField
              id="partner-slug"
              label="Slug (opcional)"
              hint="Identificador estável. Se vazio, é gerado a partir do nome."
            >
              {({ id }) => (
                <input
                  id={id}
                  type="text"
                  className="input-modern"
                  value={newPartnerSlug}
                  onChange={(event) => setNewPartnerSlug(event.target.value)}
                  placeholder="ex: allvo-telecom"
                />
              )}
            </FormField>
            <FormField id="partner-email" label="E-mail de contato (opcional)">
              {({ id }) => (
                <input
                  id={id}
                  type="email"
                  className="input-modern"
                  value={newPartnerEmail}
                  onChange={(event) => setNewPartnerEmail(event.target.value)}
                />
              )}
            </FormField>
            <button type="submit" className="btn-primary w-fit" disabled={isCreatingPartner}>
              {isCreatingPartner ? "Criando…" : "Cadastrar parceiro"}
            </button>
          </form>

          {isLoadingPartners ? (
            <SkeletonTable rows={4} cols={4} />
          ) : partners.length === 0 ? (
            <EmptyState
              title="Nenhum parceiro cadastrado"
              description="Crie o primeiro tenant B2B."
            />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-3">Parceiro</th>
                    <th className="px-4 py-3">Slug</th>
                    <th className="px-4 py-3">Chaves ativas</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {partners.map((partner) => {
                    const isSelected = partner.id === selectedPartnerId;
                    return (
                      <tr
                        key={partner.id}
                        className={`border-t border-slate-100 ${isSelected ? "bg-sky-50" : "bg-white"}`}
                      >
                        <td className="px-4 py-3 font-medium text-slate-900">{partner.name}</td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-600">
                          {partner.slug}
                        </td>
                        <td className="px-4 py-3">{partner.activeKeyCount ?? 0}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                              partner.isActive
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-slate-200 text-slate-700"
                            }`}
                          >
                            {partner.isActive ? "Ativo" : "Inativo"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              className="btn-secondary px-2 py-1 text-xs"
                              onClick={() => setSelectedPartnerId(partner.id)}
                            >
                              {isSelected ? "Selecionado" : "Gerenciar chaves"}
                            </button>
                            <button
                              type="button"
                              className="btn-secondary px-2 py-1 text-xs"
                              onClick={() => handleTogglePartnerStatus(partner)}
                            >
                              {partner.isActive ? "Inativar" : "Reativar"}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </PanelCard>

        <PanelCard
          id="panel-api-keys"
          title="Chaves de API"
          description={
            selectedPartner
              ? `Chaves vinculadas a ${selectedPartner.name}. Somente prefixo visível após criação.`
              : "Selecione um parceiro para gerenciar chaves."
          }
        >
          {!selectedPartner ? (
            <EmptyState
              title="Nenhum parceiro selecionado"
              description="Escolha um tenant na lista ao lado."
            />
          ) : (
            <>
              <form className="mb-6 grid gap-4" onSubmit={handleCreateApiKey}>
                <FormField id="api-key-name" label="Nome da chave" required>
                  {({ id }) => (
                    <input
                      id={id}
                      type="text"
                      className="input-modern"
                      value={newKeyName}
                      onChange={(event) => setNewKeyName(event.target.value)}
                      placeholder="Produção, Homologação, WhatsApp IA…"
                      required
                    />
                  )}
                </FormField>

                <fieldset>
                  <legend className="mb-2 text-sm font-semibold text-slate-800">Escopos</legend>
                  <div className="flex flex-wrap gap-3">
                    {API_SCOPES.map((scope) => (
                      <label
                        key={scope}
                        className="inline-flex items-center gap-2 text-sm text-slate-700"
                      >
                        <input
                          type="checkbox"
                          checked={newKeyScopes.includes(scope)}
                          onChange={() => toggleScope(scope)}
                        />
                        {scope}
                      </label>
                    ))}
                  </div>
                </fieldset>

                <button type="submit" className="btn-primary w-fit" disabled={isCreatingKey}>
                  {isCreatingKey ? "Gerando…" : "Gerar nova chave"}
                </button>
              </form>

              {isLoadingKeys ? (
                <SkeletonTable rows={3} cols={5} />
              ) : apiKeys.length === 0 ? (
                <EmptyState
                  title="Nenhuma chave para este parceiro"
                  description="Gere a primeira chave para liberar acesso à API B2B."
                />
              ) : (
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-4 py-3">Nome</th>
                        <th className="px-4 py-3">Prefixo</th>
                        <th className="px-4 py-3">Escopos</th>
                        <th className="px-4 py-3">Último uso</th>
                        <th className="px-4 py-3">Status</th>
                        <th className="px-4 py-3">Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {apiKeys.map((apiKey) => (
                        <tr key={apiKey.id} className="border-t border-slate-100 bg-white">
                          <td className="px-4 py-3 font-medium text-slate-900">{apiKey.name}</td>
                          <td className="px-4 py-3 font-mono text-xs text-slate-600">
                            {apiKey.displayPrefix}••••
                          </td>
                          <td className="px-4 py-3">{apiKey.scopes.join(", ")}</td>
                          <td className="px-4 py-3">{formatDateTime(apiKey.lastUsedAt)}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                                apiKey.isRevoked
                                  ? "bg-rose-100 text-rose-800"
                                  : apiKey.isActive
                                    ? "bg-emerald-100 text-emerald-800"
                                    : "bg-slate-200 text-slate-700"
                              }`}
                            >
                              {apiKey.isRevoked
                                ? "Revogada"
                                : apiKey.isActive
                                  ? "Ativa"
                                  : "Inativa"}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            {!apiKey.isRevoked ? (
                              <button
                                type="button"
                                className="btn-secondary px-2 py-1 text-xs text-rose-700"
                                onClick={() => setRevokeTarget(apiKey)}
                              >
                                Revogar
                              </button>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </PanelCard>
      </div>

      <ApiKeyRevealModal
        open={Boolean(revealedPlaintext)}
        plaintext={revealedPlaintext || ""}
        onClose={() => setRevealedPlaintext(null)}
      />

      <ConfirmDialog
        open={Boolean(revokeTarget)}
        title="Revogar API Key?"
        description={
          revokeTarget
            ? `A chave "${revokeTarget.name}" (${revokeTarget.displayPrefix}••••) deixará de funcionar imediatamente. O histórico será preservado.`
            : ""
        }
        confirmLabel="Revogar chave"
        variant="danger"
        isLoading={isRevoking}
        onConfirm={handleRevokeKey}
        onCancel={() => setRevokeTarget(null)}
      />
    </>
  );
}
