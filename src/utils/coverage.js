export function maskCep(value) {
  const digits = value.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

/** Ordena fachadas/números: 3, 26, 100, 111, 1004… (não 100, 1004, 1095, 111). */
export function compareAddressNumbers(a, b) {
  const sa = String(a ?? "").trim();
  const sb = String(b ?? "").trim();
  return sa.localeCompare(sb, "pt-BR", { numeric: true, sensitivity: "base" });
}

export function sortAddressNumbers(values) {
  return [...values].sort(compareAddressNumbers);
}
