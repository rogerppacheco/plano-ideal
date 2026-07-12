function onlyDigits(value) {
  return String(value || "").replace(/\D/g, "");
}

function calcCpfDigit(digits, factorStart) {
  let sum = 0;
  for (let i = 0; i < digits.length; i += 1) {
    sum += Number(digits[i]) * (factorStart - i);
  }
  const mod = (sum * 10) % 11;
  return mod === 10 ? 0 : mod;
}

export function isValidCpf(value) {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
  const base = cpf.slice(0, 9);
  const d1 = calcCpfDigit(base, 10);
  const d2 = calcCpfDigit(base + String(d1), 11);
  return cpf === base + String(d1) + String(d2);
}

function calcCnpjDigit(digits, weights) {
  let sum = 0;
  for (let i = 0; i < weights.length; i += 1) {
    sum += Number(digits[i]) * weights[i];
  }
  const mod = sum % 11;
  return mod < 2 ? 0 : 11 - mod;
}

export function isValidCnpj(value) {
  const cnpj = onlyDigits(value);
  if (cnpj.length !== 14 || /^(\d)\1+$/.test(cnpj)) return false;
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const base = cnpj.slice(0, 12);
  const d1 = calcCnpjDigit(base, w1);
  const d2 = calcCnpjDigit(base + String(d1), w2);
  return cnpj === base + String(d1) + String(d2);
}

export function validateDocument(document, cpfRepresentative = null) {
  const digits = onlyDigits(document);
  if (digits.length === 11) {
    if (!isValidCpf(digits)) {
      return { ok: false, message: "CPF inválido." };
    }
    return { ok: true, document: digits, cpfRepresentative: null };
  }
  if (digits.length === 14) {
    if (!isValidCnpj(digits)) {
      return { ok: false, message: "CNPJ inválido." };
    }
    const rep = onlyDigits(cpfRepresentative);
    if (rep.length !== 11 || !isValidCpf(rep)) {
      return { ok: false, message: "Para CNPJ, informe o CPF do representante (11 dígitos)." };
    }
    return { ok: true, document: digits, cpfRepresentative: rep };
  }
  return { ok: false, message: "Informe um CPF (11 dígitos) ou CNPJ (14 dígitos)." };
}

export function validateOsLookupDocument(document) {
  const digits = onlyDigits(document);
  if (digits.length === 11) {
    if (!isValidCpf(digits)) {
      return { ok: false, message: "CPF inválido." };
    }
    return { ok: true, document: digits };
  }
  if (digits.length === 14) {
    if (!isValidCnpj(digits)) {
      return { ok: false, message: "CNPJ inválido." };
    }
    return { ok: true, document: digits };
  }
  return { ok: false, message: "Informe um CPF (11 dígitos) ou CNPJ (14 dígitos)." };
}

export function maskDocument(document) {
  const digits = onlyDigits(document);
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}`;
  }
  if (digits.length === 14) {
    return `${digits.slice(0, 2)}.${digits.slice(2, 5)}.${digits.slice(5, 8)}/${digits.slice(8, 12)}-${digits.slice(12)}`;
  }
  return digits;
}
