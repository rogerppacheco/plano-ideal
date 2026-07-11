import { useCallback, useEffect, useState } from "react";
import {
  createPapCredential,
  createPapTtMatricula,
  deletePapCredential,
  deletePapTtMatricula,
  getPapCredentials,
  getPapTtMatriculas,
  updatePapCredential,
  updatePapTtMatricula,
} from "../services/api";
import { DataTable, DataTableCell, DataTableRow } from "./ui/DataTable";
import { FormField } from "./ui/FormField";
import { PanelCard } from "./ui/PanelCard";
import { SkeletonTable } from "./ui/Skeleton";
import { useToast } from "./ui/Toast";

const CREDENTIAL_COLUMNS = [
  { key: "label", label: "Label" },
  { key: "matricula", label: "Matrícula" },
  { key: "status", label: "Status" },
  { key: "actions", label: "Ações" },
];

const MATRICULA_COLUMNS = [
  { key: "matricula", label: "Matrícula" },
  { key: "consultas", label: "Consultas hoje" },
  { key: "status", label: "Status" },
  { key: "actions", label: "Ações" },
];

function StatusPill({ active, inUse = false }) {
  if (inUse) {
    return <span className="badge-status badge-status-pending">Em uso</span>;
  }
  return (
    <span className={active ? "badge-status badge-status-success" : "badge-status badge-status-denied"}>
      {active ? "Ativo" : "Desativado"}
    </span>
  );
}

export function PapAdminTab({ token }) {
  const toast = useToast();
  const [credentials, setCredentials] = useState([]);
  const [matriculas, setMatriculas] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newCredential, setNewCredential] = useState({ label: "", matriculaPap: "", senhaPap: "" });
  const [newMatricula, setNewMatricula] = useState("");
  const [isSavingCredential, setIsSavingCredential] = useState(false);
  const [isSavingMatricula, setIsSavingMatricula] = useState(false);

  const loadAll = useCallback(async () => {
    try {
      const [credData, ttData] = await Promise.all([
        getPapCredentials(token),
        getPapTtMatriculas(token),
      ]);
      setCredentials(credData.credentials || []);
      setMatriculas(ttData.matriculas || []);
    } catch (err) {
      toast.error(err.message || "Falha ao carregar configurações PAP.");
    } finally {
      setIsLoading(false);
    }
  }, [token, toast]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleCreateCredential = async (event) => {
    event.preventDefault();
    setIsSavingCredential(true);
    try {
      await createPapCredential({ token, ...newCredential });
      setNewCredential({ label: "", matriculaPap: "", senhaPap: "" });
      toast.success("Login BackOffice cadastrado.");
      await loadAll();
    } catch (err) {
      toast.error(err.message || "Não foi possível cadastrar login.");
    } finally {
      setIsSavingCredential(false);
    }
  };

  const handleToggleCredential = async (credential) => {
    try {
      await updatePapCredential({
        token,
        id: credential.id,
        enabled: !credential.enabled,
      });
      toast.success(credential.enabled ? "Login desativado." : "Login ativado.");
      await loadAll();
    } catch (err) {
      toast.error(err.message || "Falha ao atualizar login.");
    }
  };

  const handleDeleteCredential = async (credential) => {
    const ok = window.confirm(`Remover login "${credential.label}"?`);
    if (!ok) return;
    try {
      await deletePapCredential(credential.id, token);
      toast.success("Login removido.");
      await loadAll();
    } catch (err) {
      toast.error(err.message || "Não foi possível remover login.");
    }
  };

  const handleCreateMatricula = async (event) => {
    event.preventDefault();
    setIsSavingMatricula(true);
    try {
      await createPapTtMatricula({ token, matricula: newMatricula.trim() });
      setNewMatricula("");
      toast.success("Matrícula TT cadastrada.");
      await loadAll();
    } catch (err) {
      toast.error(err.message || "Não foi possível cadastrar matrícula TT.");
    } finally {
      setIsSavingMatricula(false);
    }
  };

  const handleToggleMatricula = async (row) => {
    try {
      await updatePapTtMatricula({ token, id: row.id, enabled: !row.enabled });
      toast.success(row.enabled ? "Matrícula desativada." : "Matrícula ativada.");
      await loadAll();
    } catch (err) {
      toast.error(err.message || "Falha ao atualizar matrícula TT.");
    }
  };

  const handleDeleteMatricula = async (row) => {
    const ok = window.confirm(`Remover matrícula TT "${row.matricula}"?`);
    if (!ok) return;
    try {
      await deletePapTtMatricula(row.id, token);
      toast.success("Matrícula TT removida.");
      await loadAll();
    } catch (err) {
      toast.error(err.message || "Não foi possível remover matrícula TT.");
    }
  };

  return (
    <PanelCard
      id="panel-pap"
      title="Configuração PAP"
      description="Cadastre logins BackOffice e matrículas TT usadas na consulta de crédito."
    >
      <div className="space-y-8">
        <section>
          <h3 className="text-sm font-bold text-slate-900">Logins BackOffice PAP</h3>
          <form className="mt-4 grid gap-4 sm:grid-cols-3" onSubmit={handleCreateCredential}>
            <FormField id="pap-label" label="Identificação" hint="Nome para reconhecer este login.">
              {({ id, describedBy }) => (
                <input
                  id={id}
                  type="text"
                  placeholder="Ex: BO Principal"
                  value={newCredential.label}
                  onChange={(e) => setNewCredential((s) => ({ ...s, label: e.target.value }))}
                  className="input-modern"
                  aria-describedby={describedBy}
                  required
                />
              )}
            </FormField>
            <FormField id="pap-matricula" label="Matrícula PAP">
              {({ id }) => (
                <input
                  id={id}
                  type="text"
                  placeholder="Matrícula PAP"
                  value={newCredential.matriculaPap}
                  onChange={(e) => setNewCredential((s) => ({ ...s, matriculaPap: e.target.value }))}
                  className="input-modern"
                  required
                />
              )}
            </FormField>
            <FormField id="pap-senha" label="Senha PAP">
              {({ id }) => (
                <input
                  id={id}
                  type="password"
                  placeholder="Senha PAP"
                  value={newCredential.senhaPap}
                  onChange={(e) => setNewCredential((s) => ({ ...s, senhaPap: e.target.value }))}
                  className="input-modern"
                  required
                />
              )}
            </FormField>
            <div className="sm:col-span-3">
              <button type="submit" className="btn-primary" disabled={isSavingCredential}>
                {isSavingCredential ? "Salvando…" : "Adicionar login"}
              </button>
            </div>
          </form>

          <div className="mt-5">
            <DataTable
              columns={CREDENTIAL_COLUMNS}
              caption="Logins BackOffice PAP"
              isEmpty={!isLoading && credentials.length === 0}
              loading={isLoading}
              loadingComponent={<SkeletonTable rows={3} cols={4} />}
              emptyIcon="config"
              emptyTitle="Nenhum login cadastrado"
              emptyDescription="Adicione um login BackOffice para habilitar consultas de crédito."
            >
              {credentials.map((item) => (
                <DataTableRow key={item.id}>
                  <DataTableCell className="font-medium">{item.label}</DataTableCell>
                  <DataTableCell className="font-mono text-xs">{item.matriculaPap}</DataTableCell>
                  <DataTableCell>
                    <StatusPill active={item.enabled} inUse={item.inUse} />
                  </DataTableCell>
                  <DataTableCell>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="btn-secondary px-2 py-1 text-xs"
                        onClick={() => handleToggleCredential(item)}
                      >
                        {item.enabled ? "Desativar" : "Ativar"}
                      </button>
                      <button
                        type="button"
                        className="btn-danger"
                        disabled={item.inUse}
                        onClick={() => handleDeleteCredential(item)}
                      >
                        Remover
                      </button>
                    </div>
                  </DataTableCell>
                </DataTableRow>
              ))}
            </DataTable>
          </div>
        </section>

        <section className="border-t border-slate-100 pt-8">
          <h3 className="text-sm font-bold text-slate-900">Matrículas TT (distribuição de carga)</h3>
          <form className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={handleCreateMatricula}>
            <FormField
              id="pap-tt"
              label="Matrícula TT"
              hint="Ex: TT703413 — usada para balancear consultas."
              className="flex-1"
            >
              {({ id, describedBy }) => (
                <input
                  id={id}
                  type="text"
                  placeholder="TT703413"
                  value={newMatricula}
                  onChange={(e) => setNewMatricula(e.target.value)}
                  className="input-modern"
                  aria-describedby={describedBy}
                  required
                />
              )}
            </FormField>
            <button type="submit" className="btn-primary shrink-0" disabled={isSavingMatricula}>
              {isSavingMatricula ? "Salvando…" : "Adicionar TT"}
            </button>
          </form>

          <div className="mt-5">
            <DataTable
              columns={MATRICULA_COLUMNS}
              caption="Matrículas TT"
              isEmpty={!isLoading && matriculas.length === 0}
              loading={isLoading}
              loadingComponent={<SkeletonTable rows={3} cols={4} />}
              emptyIcon="config"
              emptyTitle="Nenhuma matrícula TT cadastrada"
              emptyDescription="Cadastre matrículas para distribuir a carga das consultas."
            >
              {matriculas.map((item) => (
                <DataTableRow key={item.id}>
                  <DataTableCell className="font-mono text-xs font-medium">{item.matricula}</DataTableCell>
                  <DataTableCell>{item.consultas_hoje ?? 0}</DataTableCell>
                  <DataTableCell>
                    <StatusPill active={item.enabled} />
                  </DataTableCell>
                  <DataTableCell>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className="btn-secondary px-2 py-1 text-xs"
                        onClick={() => handleToggleMatricula(item)}
                      >
                        {item.enabled ? "Desativar" : "Ativar"}
                      </button>
                      <button
                        type="button"
                        className="btn-danger"
                        onClick={() => handleDeleteMatricula(item)}
                      >
                        Remover
                      </button>
                    </div>
                  </DataTableCell>
                </DataTableRow>
              ))}
            </DataTable>
          </div>
        </section>
      </div>
    </PanelCard>
  );
}
