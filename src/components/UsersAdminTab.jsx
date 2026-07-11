import { useCallback, useEffect, useState } from "react";
import {
  createInternalUser,
  deleteInternalUser,
  getInternalUsers,
  updateInternalUserPassword,
  updateInternalUserStatus,
} from "../services/api";
import { ROLE_LABELS, ROLES } from "../lib/rbac";
import { ConfirmDialog } from "./ui/ConfirmDialog";
import { EmptyState } from "./ui/EmptyState";
import { FormField } from "./ui/FormField";
import { PanelCard } from "./ui/PanelCard";
import { SkeletonUserList } from "./ui/Skeleton";
import { useToast } from "./ui/Toast";

function formatLastLogin(value) {
  if (!value) return "Nunca";
  return new Date(value).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function normalizeUser(user) {
  const isActive = user.is_active ?? user.isActive ?? true;
  return {
    id: user.id,
    username: user.username,
    fullName: user.full_name ?? user.fullName ?? user.name,
    role: user.role,
    isActive,
    lastLoginAt: user.last_login_at ?? user.lastLoginAt,
  };
}

export function UsersAdminTab({ token, currentUserId }) {
  const toast = useToast();
  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [passwordEditUserId, setPasswordEditUserId] = useState(null);
  const [passwordDraft, setPasswordDraft] = useState("");
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [pendingAction, setPendingAction] = useState(null);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const [newUser, setNewUser] = useState({
    username: "",
    fullName: "",
    role: ROLES.OPERATOR,
    password: "",
  });

  const loadUsers = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getInternalUsers(token);
      setUsers((data.users || []).map(normalizeUser));
    } catch (error) {
      toast.error(error.message || "Falha ao carregar usuários.");
    } finally {
      setIsLoading(false);
    }
  }, [token, toast]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleCreateUser = async (event) => {
    event.preventDefault();
    try {
      setIsCreating(true);
      await createInternalUser({ token, ...newUser });
      toast.success("Usuário criado com sucesso.");
      setNewUser({ username: "", fullName: "", role: ROLES.OPERATOR, password: "" });
      await loadUsers();
    } catch (error) {
      toast.error(error.message || "Não foi possível criar usuário.");
    } finally {
      setIsCreating(false);
    }
  };

  const handlePasswordSubmit = async (event, user) => {
    event.preventDefault();
    if (passwordDraft.length < 6) {
      toast.error("A nova senha deve ter ao menos 6 caracteres.");
      return;
    }
    try {
      setIsUpdatingPassword(true);
      const result = await updateInternalUserPassword({
        token,
        userId: user.id,
        password: passwordDraft,
      });
      toast.success(result.message || `Senha de ${user.fullName} atualizada.`);
      setPasswordEditUserId(null);
      setPasswordDraft("");
    } catch (error) {
      toast.error(error.message || "Não foi possível alterar a senha.");
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const runPendingAction = async () => {
    if (!pendingAction) return;
    setIsActionLoading(true);
    try {
      if (pendingAction.type === "status") {
        const result = await updateInternalUserStatus({
          token,
          userId: pendingAction.user.id,
          isActive: pendingAction.nextActive,
        });
        toast.success(result.message || "Status atualizado.");
      }
      if (pendingAction.type === "delete") {
        const result = await deleteInternalUser({ token, userId: pendingAction.user.id });
        toast.success(result.message || "Usuário excluído.");
      }
      setPendingAction(null);
      await loadUsers();
    } catch (error) {
      toast.error(error.message || "Não foi possível concluir a ação.");
    } finally {
      setIsActionLoading(false);
    }
  };

  return (
    <PanelCard
      id="panel-usuarios"
      title="Cadastro de usuários"
      description="Apenas administradores podem criar, inativar e excluir usuários internos."
    >
      <form className="grid gap-4 md:grid-cols-2" onSubmit={handleCreateUser}>
        <FormField id="new-fullName" label="Nome completo" required>
          {({ id }) => (
            <input
              id={id}
              type="text"
              value={newUser.fullName}
              onChange={(event) => setNewUser((prev) => ({ ...prev, fullName: event.target.value }))}
              className="input-modern"
              required
            />
          )}
        </FormField>
        <FormField id="new-username" label="Usuário" hint="Login de acesso ao painel." required>
          {({ id, describedBy }) => (
            <input
              id={id}
              type="text"
              value={newUser.username}
              onChange={(event) => setNewUser((prev) => ({ ...prev, username: event.target.value }))}
              className="input-modern"
              aria-describedby={describedBy}
              required
            />
          )}
        </FormField>
        <FormField id="new-role" label="Perfil">
          {({ id }) => (
            <select
              id={id}
              value={newUser.role}
              onChange={(event) => setNewUser((prev) => ({ ...prev, role: event.target.value }))}
              className="input-modern"
            >
              <option value={ROLES.OPERATOR}>Operador</option>
              <option value={ROLES.MANAGER}>Gestor</option>
              <option value={ROLES.ADMIN}>Administrador</option>
            </select>
          )}
        </FormField>
        <FormField id="new-password" label="Senha" hint="Mínimo de 6 caracteres." required>
          {({ id, describedBy }) => (
            <input
              id={id}
              type="password"
              minLength={6}
              value={newUser.password}
              onChange={(event) => setNewUser((prev) => ({ ...prev, password: event.target.value }))}
              className="input-modern"
              aria-describedby={describedBy}
              required
            />
          )}
        </FormField>
        <div className="md:col-span-2">
          <button type="submit" disabled={isCreating} className="btn-primary">
            {isCreating ? "Criando…" : "Criar usuário"}
          </button>
        </div>
      </form>

      <div className="mt-6">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">Usuários cadastrados</h3>
          <button type="button" className="btn-secondary text-xs" onClick={loadUsers} disabled={isLoading}>
            {isLoading ? "Atualizando…" : "Atualizar"}
          </button>
        </div>

        {isLoading ? (
          <SkeletonUserList count={5} />
        ) : users.length === 0 ? (
          <EmptyState
            icon="users"
            title="Nenhum usuário encontrado"
            description="Crie o primeiro usuário usando o formulário acima."
          />
        ) : (
          <div className="space-y-2">
            {users.map((user) => (
              <div
                key={user.id}
                className={`rounded-lg border px-3 py-2 ${
                  user.isActive ? "border-slate-200 bg-white" : "border-white/10 bg-white/5 opacity-80"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-800">
                      {user.fullName}{" "}
                      <span className="text-slate-500">(@{user.username})</span>
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      Último acesso: {formatLastLogin(user.lastLoginAt)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="badge-role">{ROLE_LABELS[user.role] ?? user.role}</span>
                    <span
                      className={
                        user.isActive
                          ? "badge-status badge-status-success"
                          : "badge-status badge-status-denied"
                      }
                    >
                      {user.isActive ? "Ativo" : "Inativo"}
                    </span>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPasswordEditUserId((current) => (current === user.id ? null : user.id));
                      setPasswordDraft("");
                    }}
                    className="btn-secondary px-3 py-1 text-xs"
                  >
                    {passwordEditUserId === user.id ? "Cancelar senha" : "Alterar senha"}
                  </button>
                  <button
                    type="button"
                    className="btn-secondary px-3 py-1 text-xs"
                    disabled={Number(currentUserId) === Number(user.id)}
                    onClick={() =>
                      setPendingAction({
                        type: "status",
                        user,
                        nextActive: !user.isActive,
                      })
                    }
                  >
                    {user.isActive ? "Inativar" : "Reativar"}
                  </button>
                  <button
                    type="button"
                    className="btn-danger px-3 py-1 text-xs"
                    disabled={Number(currentUserId) === Number(user.id)}
                    onClick={() => setPendingAction({ type: "delete", user })}
                  >
                    Excluir
                  </button>
                </div>

                {passwordEditUserId === user.id ? (
                  <form
                    className="mt-3 flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:items-end"
                    onSubmit={(event) => handlePasswordSubmit(event, user)}
                  >
                    <div className="flex-1">
                      <label
                        className="mb-1 block text-xs font-medium text-slate-700"
                        htmlFor={`password-${user.id}`}
                      >
                        Nova senha para {user.fullName}
                      </label>
                      <input
                        id={`password-${user.id}`}
                        type="password"
                        minLength={6}
                        value={passwordDraft}
                        onChange={(event) => setPasswordDraft(event.target.value)}
                        className="input-modern"
                        placeholder="Mínimo 6 caracteres"
                        required
                        autoFocus
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={isUpdatingPassword}
                      className="btn-primary px-4 py-2 text-xs disabled:opacity-50"
                    >
                      {isUpdatingPassword ? "Salvando…" : "Salvar senha"}
                    </button>
                  </form>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(pendingAction)}
        title={
          pendingAction?.type === "delete"
            ? "Excluir usuário permanentemente?"
            : pendingAction?.nextActive
              ? "Reativar usuário?"
              : "Inativar usuário?"
        }
        description={
          pendingAction?.type === "delete"
            ? `O usuário "${pendingAction?.user?.fullName}" será removido do banco. Esta ação não pode ser desfeita. Usuários com histórico de crédito não podem ser excluídos.`
            : pendingAction?.nextActive
              ? `O usuário "${pendingAction?.user?.fullName}" voltará a acessar o painel após novo login.`
              : `O usuário "${pendingAction?.user?.fullName}" perderá o acesso imediatamente. A sessão ativa será encerrada no próximo request.`
        }
        confirmLabel={
          pendingAction?.type === "delete"
            ? "Excluir permanentemente"
            : pendingAction?.nextActive
              ? "Reativar"
              : "Inativar"
        }
        variant={pendingAction?.type === "delete" ? "danger" : "warning"}
        isLoading={isActionLoading}
        onConfirm={runPendingAction}
        onCancel={() => !isActionLoading && setPendingAction(null)}
      />
    </PanelCard>
  );
}
