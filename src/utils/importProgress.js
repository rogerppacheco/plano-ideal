/** Cálculo de progresso por fase + detecção de travamento (espelha backend). */

const STALL_MS = 3 * 60 * 1000;

const PHASE_LABELS = {
  queued: "Na fila",
  reading: "Lendo arquivo",
  parsing: "Parseando planilha",
  inserting: "Inserindo no banco",
  finalizing: "Finalizando",
};

/** Intervalo [% início, % fim] por fase */
const PHASE_RANGE = {
  queued: [0, 8],
  reading: [8, 18],
  parsing: [18, 38],
  inserting: [38, 92],
  finalizing: [92, 99],
};

export function inferProgressPhase(job) {
  if (!job) return "queued";
  if (job.progress_phase) return job.progress_phase;
  if (job.status === "queued") return "queued";
  if (job.status !== "processing") return job.status;

  const step = String(job.current_step || "").toLowerCase();
  if (step.includes("parseando") || step.includes("parse")) return "parsing";
  if (step.includes("memória") || step.includes("lendo arquivo") || step.includes("preparando")) {
    return "reading";
  }
  if (
    job.total_rows > 0 &&
    (job.processed_rows || 0) >= job.total_rows
  ) {
    return "finalizing";
  }
  if ((job.total_rows || 0) > 0) return "inserting";
  return "reading";
}

export function translateProgressPhase(phase) {
  return PHASE_LABELS[phase] || phase || "—";
}

export function getHeartbeatAgeMs(job) {
  if (!job?.heartbeat_at) return null;
  const t = new Date(job.heartbeat_at).getTime();
  if (Number.isNaN(t)) return null;
  return Date.now() - t;
}

export function isImportStalled(job) {
  if (!job || job.status !== "processing") return false;
  const age = getHeartbeatAgeMs(job);
  if (age == null) return false;
  return age >= STALL_MS;
}

/**
 * Percentual global (0–100) com peso por fase e sub-progresso nas linhas.
 */
export function getImportProgressPercent(job) {
  if (!job) return 0;
  if (job.status === "completed") return 100;
  if (job.status === "failed") return 0;

  const phase = inferProgressPhase(job);
  const [lo, hi] = PHASE_RANGE[phase] || [0, 5];
  const span = hi - lo;

  if (phase === "inserting" && job.total_rows > 0) {
    const ratio = Math.min(1, Math.max(0, (job.processed_rows || 0) / job.total_rows));
    return Math.round(lo + span * ratio);
  }

  if (phase === "finalizing") {
    const age = getHeartbeatAgeMs(job) ?? 0;
    const bump = Math.min(6, Math.floor(age / 15000));
    return Math.min(99, hi + bump);
  }

  if (phase === "parsing") {
    const age = getHeartbeatAgeMs(job) ?? 0;
    const pulse = Math.min(span - 2, Math.floor(age / 8000));
    return Math.round(lo + 2 + pulse);
  }

  return Math.round((lo + hi) / 2);
}

export function getImportProgressLabel(job) {
  const phase = inferProgressPhase(job);
  const pct = getImportProgressPercent(job);
  const phaseLabel = translateProgressPhase(phase);

  if (job?.status === "completed") return "Concluído — 100%";
  if (job?.status === "failed") return "Falhou";

  if (phase === "inserting" && job?.total_rows > 0) {
    return `${phaseLabel} — ${pct}% (${Number(job.processed_rows || 0).toLocaleString("pt-BR")} / ${Number(job.total_rows).toLocaleString("pt-BR")} linhas)`;
  }

  if (phase === "finalizing") {
    return `${phaseLabel} — ${pct}% (gravando status no servidor)`;
  }

  return `${phaseLabel} — ${pct}%`;
}

export function getPollIntervalMs(job) {
  const phase = inferProgressPhase(job);
  if (phase === "finalizing") return 400;
  if (phase === "inserting" && (job?.total_rows || 0) > 0) return 800;
  if (phase === "parsing") return 1500;
  return 1200;
}
