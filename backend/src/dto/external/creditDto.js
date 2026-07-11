const TERMINAL_STATUSES = new Set(["success", "failed"]);

export function isTerminalCreditStatus(status) {
  return TERMINAL_STATUSES.has(status);
}

export function toExternalCreditAcceptedDto(row) {
  return {
    consultation: {
      id: row.id,
      status: row.status,
      createdAt: row.created_at,
    },
  };
}

export function toExternalCreditPollingDto(row) {
  const consultation = {
    id: row.id,
    documentMasked: row.document_masked,
    status: row.status,
    isTerminal: isTerminalCreditStatus(row.status),
    createdAt: row.created_at,
  };

  if (row.started_at) {
    consultation.startedAt = row.started_at;
  }

  if (isTerminalCreditStatus(row.status)) {
    consultation.finishedAt = row.finished_at;
    consultation.approved = row.approved;
    consultation.resultDetail = row.result_detail;
    if (row.status === "failed" && row.error_message) {
      consultation.errorMessage = row.error_message;
    }
    if (row.duration_seconds != null) {
      consultation.durationSeconds = Number(row.duration_seconds);
    }
  }

  return { consultation };
}
