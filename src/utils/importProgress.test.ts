import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ImportJobProgressInput } from "../types/import";
import {
  getHeartbeatAgeMs,
  getImportProgressLabel,
  getImportProgressPercent,
  getPollIntervalMs,
  inferProgressPhase,
  isImportStalled,
  translateProgressPhase,
} from "./importProgress";

function makeJob(overrides: ImportJobProgressInput = {}): ImportJobProgressInput {
  return {
    id: 1,
    status: "processing",
    ...overrides,
  };
}

describe("importProgress", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-11T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("inferProgressPhase", () => {
    it("retorna queued sem job", () => {
      expect(inferProgressPhase(null)).toBe("queued");
    });

    it("usa progress_phase quando persistida", () => {
      expect(inferProgressPhase(makeJob({ progress_phase: "parsing" }))).toBe("parsing");
    });

    it("retorna queued para status queued", () => {
      expect(inferProgressPhase(makeJob({ status: "queued" }))).toBe("queued");
    });

    it("retorna status terminal para completed e failed", () => {
      expect(inferProgressPhase(makeJob({ status: "completed" }))).toBe("completed");
      expect(inferProgressPhase(makeJob({ status: "failed" }))).toBe("failed");
    });

    it("infere parsing pelo current_step", () => {
      expect(inferProgressPhase(makeJob({ current_step: "Parseando planilha Excel" }))).toBe(
        "parsing"
      );
    });

    it("infere reading pelo current_step", () => {
      expect(inferProgressPhase(makeJob({ current_step: "Lendo arquivo na memória" }))).toBe(
        "reading"
      );
    });

    it("infere inserting quando há total_rows", () => {
      expect(
        inferProgressPhase(makeJob({ total_rows: 1000, processed_rows: 10, current_step: "" }))
      ).toBe("inserting");
    });

    it("infere finalizing quando processed_rows >= total_rows", () => {
      expect(
        inferProgressPhase(makeJob({ total_rows: 500, processed_rows: 500, current_step: "" }))
      ).toBe("finalizing");
    });
  });

  describe("translateProgressPhase", () => {
    it("traduz fases conhecidas", () => {
      expect(translateProgressPhase("inserting")).toBe("Inserindo no banco");
      expect(translateProgressPhase("finalizing")).toBe("Finalizando");
    });

    it("retorna traço para valor vazio", () => {
      expect(translateProgressPhase("")).toBe("—");
    });
  });

  describe("getHeartbeatAgeMs", () => {
    it("calcula idade do heartbeat", () => {
      const job = makeJob({ heartbeat_at: "2026-07-11T11:58:00.000Z" });
      expect(getHeartbeatAgeMs(job)).toBe(2 * 60 * 1000);
    });

    it("retorna null sem heartbeat", () => {
      expect(getHeartbeatAgeMs(makeJob())).toBeNull();
    });
  });

  describe("isImportStalled", () => {
    it("detecta travamento após 3 minutos sem heartbeat", () => {
      const job = makeJob({
        status: "processing",
        heartbeat_at: "2026-07-11T11:56:00.000Z",
      });
      expect(isImportStalled(job)).toBe(true);
    });

    it("não marca stalled em jobs concluídos", () => {
      const job = makeJob({
        status: "completed",
        heartbeat_at: "2026-07-11T11:00:00.000Z",
      });
      expect(isImportStalled(job)).toBe(false);
    });
  });

  describe("getImportProgressPercent", () => {
    it("retorna 100 para completed e 0 para failed", () => {
      expect(getImportProgressPercent(makeJob({ status: "completed" }))).toBe(100);
      expect(getImportProgressPercent(makeJob({ status: "failed" }))).toBe(0);
    });

    it("calcula sub-progresso na fase inserting", () => {
      const pct = getImportProgressPercent(
        makeJob({ progress_phase: "inserting", total_rows: 1000, processed_rows: 500 })
      );
      expect(pct).toBeGreaterThan(38);
      expect(pct).toBeLessThan(92);
    });
  });

  describe("getImportProgressLabel", () => {
    it("formata label com contagem de linhas na inserção", () => {
      const label = getImportProgressLabel(
        makeJob({
          status: "processing",
          progress_phase: "inserting",
          total_rows: 1000,
          processed_rows: 250,
        })
      );
      expect(label).toContain("Inserindo no banco");
      expect(label).toContain("250");
      expect(label).toContain("1.000");
    });

    it("retorna mensagem de concluído", () => {
      expect(getImportProgressLabel(makeJob({ status: "completed" }))).toBe("Concluído — 100%");
    });
  });

  describe("getPollIntervalMs", () => {
    it("usa intervalo mais curto na finalização", () => {
      expect(getPollIntervalMs(makeJob({ progress_phase: "finalizing" }))).toBe(400);
    });

    it("usa intervalo médio na inserção com linhas", () => {
      expect(
        getPollIntervalMs(
          makeJob({ progress_phase: "inserting", total_rows: 100, processed_rows: 1 })
        )
      ).toBe(800);
    });

    it("usa intervalo padrão na fila", () => {
      expect(getPollIntervalMs(makeJob({ status: "queued" }))).toBe(1200);
    });
  });
});
