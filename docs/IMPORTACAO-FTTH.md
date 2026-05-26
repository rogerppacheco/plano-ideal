# Importação em massa — Endereços FTTH (produção)

Guia rápido e seguro para subir as **147 planilhas** (~18M linhas) no Railway.

## Pré-requisitos

1. Arquivo `comparador-leads/.env.railway` com `DATABASE_URL` do Postgres Railway.
2. **Nenhuma** importação aberta no painel (ou use `--force` no script).
3. PC ligado, internet estável (processo pode levar **horas**, não dias, com insert em lote).

```powershell
cd c:\PlanoIdeal\comparador-leads\backend
npm install
```

Substitua o caminho da pasta:

```powershell
$FTTH = "C:\Users\rogge\Downloads\Endereços FTTH-20260523T003707Z-3-001\Endereços FTTH"
```

---

## Processo em 4 passos (recomendado)

### Passo 1 — Simular (30 segundos)

Lista arquivos sem gravar nada:

```powershell
node ./scripts/import-ftth-folder.mjs "$FTTH" --dry-run
```

### Passo 2 — Teste 1 arquivo pequeno (~2–5 min)

Valida conexão, SheetJS e insert em lote:

```powershell
node ./scripts/import-ftth-folder.mjs "$FTTH" --from AM_2.xlsx --limit 1 --force
```

Confira no painel: https://plano-ideal-production.up.railway.app/interno/painel → **Importações** → job deve estar **Concluído**.

### Passo 3 — Lote piloto 5 arquivos (~30–60 min)

```powershell
node ./scripts/import-ftth-folder.mjs "$FTTH" --limit 5 --operator Vivo --force
```

Se tudo OK, siga para o passo 4.

### Passo 4 — Carga completa

```powershell
node ./scripts/import-ftth-folder.mjs "$FTTH" --operator Vivo --skip-existing --force
```

| Opção | Por quê |
|--------|---------|
| `--skip-existing` | Se interromper, pode rodar de novo sem duplicar arquivo já concluído |
| `--retry-failed` | Igual a `--skip-existing` (só pendentes); nome mais claro para retomar |
| `--force` | Libera jobs `processing` travados no banco |
| `--from ARQUIVO.xlsx` | Retoma a partir de um arquivo (ordem alfabética) |

**Retomar após queda de luz/internet ou falha no meio:**

```powershell
# Opção A — só o que ainda não concluiu (recomendado)
node ./scripts/import-ftth-folder.mjs "$FTTH" --operator Vivo --retry-failed --force

# Opção B — a partir de um arquivo (ordem alfabética)
node ./scripts/import-ftth-folder.mjs "$FTTH" --operator Vivo --skip-existing --force --from MG_1.xlsx
```

`--retry-failed` pula tudo que já tem job **Concluído** e reprocessa falhas e arquivos que nem chegaram a rodar.

**Erro `No space left on device`:** o volume do Postgres no Railway encheu. No painel Railway → serviço do banco → aumente o disco ou apague dados antes de continuar.

---

## Opções úteis

| Flag | Descrição |
|------|-----------|
| `--batch-size 800` | Tamanho do INSERT em lote (padrão 500) |
| `--limit N` | Só N arquivos |
| `--files "A.xlsx,B.xlsx"` | Processa somente arquivos específicos da pasta |
| `--dry-run` | Só lista |
| `--operator Vivo` | Define a operadora gravada (`Vivo`, `Nio`, `Vero` etc.) |

Variável de ambiente alternativa: `IMPORT_BATCH_SIZE=800`

---

## O que esperar

- **~147 jobs** no histórico (1 por arquivo).
- **Operadora:** sempre **Vivo**.
- **Tempo:** com lote, estimativa **~2–6 h** para 18M linhas (antes podia levar dias).
- **Resumo no painel:** total de cobertura sobe após cada arquivo.

---

## Problemas comuns

| Sintoma | Ação |
|---------|------|
| `Já existe job em processing` | Use `--force` ou conclua/cancele no painel |
| Job `Falhou` memória | Arquivo muito grande no painel; use este script (SheetJS) |
| Arquivo já importado | `--skip-existing` pula automaticamente |
| Contagem “válidas” ≠ linhas no banco | Normal: deduplicação por CEP+NUM atualiza registro existente |

---

## Deploy

O painel na web também usa insert em lote após redeploy da API (`plano-ideal-api`).
