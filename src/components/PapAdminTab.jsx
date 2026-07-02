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

export function PapAdminTab({ token }) {
  const [credentials, setCredentials] = useState([]);
  const [matriculas, setMatriculas] = useState([]);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [newCredential, setNewCredential] = useState({ label: "", matriculaPap: "", senhaPap: "" });
  const [newMatricula, setNewMatricula] = useState("");

  const loadAll = useCallback(async () => {
    try {
      const [credData, ttData] = await Promise.all([
        getPapCredentials(token),
        getPapTtMatriculas(token),
      ]);
      setCredentials(credData.credentials || []);
      setMatriculas(ttData.matriculas || []);
      setError("");
    } catch (err) {
      setError(err.message || "Falha ao carregar configurações PAP.");
    }
  }, [token]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const handleCreateCredential = async (event) => {
    event.preventDefault();
    setFeedback("");
    setError("");
    try {
      await createPapCredential({ token, ...newCredential });
      setNewCredential({ label: "", matriculaPap: "", senhaPap: "" });
      setFeedback("Login BackOffice cadastrado.");
      await loadAll();
    } catch (err) {
      setError(err.message || "Não foi possível cadastrar login.");
    }
  };

  const handleToggleCredential = async (credential) => {
    try {
      await updatePapCredential({
        token,
        id: credential.id,
        enabled: !credential.enabled,
      });
      await loadAll();
    } catch (err) {
      setError(err.message || "Falha ao atualizar login.");
    }
  };

  const handleDeleteCredential = async (credential) => {
    const ok = window.confirm(`Remover login "${credential.label}"?`);
    if (!ok) return;
    try {
      await deletePapCredential(credential.id, token);
      setFeedback("Login removido.");
      await loadAll();
    } catch (err) {
      setError(err.message || "Não foi possível remover login.");
    }
  };

  const handleCreateMatricula = async (event) => {
    event.preventDefault();
    setFeedback("");
    setError("");
    try {
      await createPapTtMatricula({ token, matricula: newMatricula.trim() });
      setNewMatricula("");
      setFeedback("Matrícula TT cadastrada.");
      await loadAll();
    } catch (err) {
      setError(err.message || "Não foi possível cadastrar matrícula TT.");
    }
  };

  const handleToggleMatricula = async (row) => {
    try {
      await updatePapTtMatricula({ token, id: row.id, enabled: !row.enabled });
      await loadAll();
    } catch (err) {
      setError(err.message || "Falha ao atualizar matrícula TT.");
    }
  };

  const handleDeleteMatricula = async (row) => {
    const ok = window.confirm(`Remover matrícula TT "${row.matricula}"?`);
    if (!ok) return;
    try {
      await deletePapTtMatricula(row.id, token);
      setFeedback("Matrícula TT removida.");
      await loadAll();
    } catch (err) {
      setError(err.message || "Não foi possível remover matrícula TT.");
    }
  };

  return (
    <section className="surface-card p-6">
      <h2 className="text-xl font-bold text-slate-900">Configuração PAP (admin)</h2>
      <p className="mt-1 text-sm text-slate-600">
        Cadastre logins BackOffice e matrículas TT usadas na consulta de crédito.
      </p>

      {feedback ? <p className="mt-3 text-sm font-medium text-emerald-700">{feedback}</p> : null}
      {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

      <div className="mt-6">
        <h3 className="text-sm font-bold text-slate-900">Logins BackOffice PAP</h3>
        <form className="mt-3 grid gap-3 sm:grid-cols-3" onSubmit={handleCreateCredential}>
          <input
            type="text"
            placeholder="Label (ex: BO Principal)"
            value={newCredential.label}
            onChange={(e) => setNewCredential((s) => ({ ...s, label: e.target.value }))}
            className="input-modern"
            required
          />
          <input
            type="text"
            placeholder="Matrícula PAP"
            value={newCredential.matriculaPap}
            onChange={(e) => setNewCredential((s) => ({ ...s, matriculaPap: e.target.value }))}
            className="input-modern"
            required
          />
          <input
            type="password"
            placeholder="Senha PAP"
            value={newCredential.senhaPap}
            onChange={(e) => setNewCredential((s) => ({ ...s, senhaPap: e.target.value }))}
            className="input-modern"
            required
          />
          <div className="sm:col-span-3">
            <button type="submit" className="btn-primary">
              Adicionar login
            </button>
          </div>
        </form>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <th className="py-2 pr-3">Label</th>
                <th className="py-2 pr-3">Matrícula</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {credentials.map((item) => (
                <tr key={item.id} className="border-b border-slate-100">
                  <td className="py-2 pr-3">{item.label}</td>
                  <td className="py-2 pr-3 font-mono text-xs">{item.matriculaPap}</td>
                  <td className="py-2 pr-3">
                    {item.inUse ? "Em uso" : item.enabled ? "Ativo" : "Desativado"}
                  </td>
                  <td className="py-2 pr-3">
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
                        className="btn-secondary px-2 py-1 text-xs"
                        disabled={item.inUse}
                        onClick={() => handleDeleteCredential(item)}
                      >
                        Remover
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-8">
        <h3 className="text-sm font-bold text-slate-900">Matrículas TT (distribuição de carga)</h3>
        <form className="mt-3 flex flex-col gap-3 sm:flex-row" onSubmit={handleCreateMatricula}>
          <input
            type="text"
            placeholder="Matrícula TT (ex: TT703413)"
            value={newMatricula}
            onChange={(e) => setNewMatricula(e.target.value)}
            className="input-modern"
            required
          />
          <button type="submit" className="btn-primary">
            Adicionar TT
          </button>
        </form>

        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <th className="py-2 pr-3">Matrícula</th>
                <th className="py-2 pr-3">Consultas hoje</th>
                <th className="py-2 pr-3">Status</th>
                <th className="py-2 pr-3">Ações</th>
              </tr>
            </thead>
            <tbody>
              {matriculas.map((item) => (
                <tr key={item.id} className="border-b border-slate-100">
                  <td className="py-2 pr-3 font-mono text-xs">{item.matricula}</td>
                  <td className="py-2 pr-3">{item.consultas_hoje ?? 0}</td>
                  <td className="py-2 pr-3">{item.enabled ? "Ativo" : "Desativado"}</td>
                  <td className="py-2 pr-3">
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
                        className="btn-secondary px-2 py-1 text-xs"
                        onClick={() => handleDeleteMatricula(item)}
                      >
                        Remover
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
