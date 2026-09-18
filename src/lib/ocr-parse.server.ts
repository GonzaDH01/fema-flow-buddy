// Parseo tolerante de la respuesta del modelo: a veces viene con ```json,
// con texto alrededor o cortada por límite de tokens.
export function parseModelJson(content: string): unknown | null {
  const clean = content
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();

  try {
    return JSON.parse(clean);
  } catch {
    // ignore
  }

  const start = clean.indexOf("{");
  if (start === -1) return null;
  const candidate = clean.slice(start);
  try {
    return JSON.parse(candidate);
  } catch {
    // ignore
  }

  // Intento de reparación para JSON truncado: cerrar strings/llaves abiertas.
  let inString = false;
  let escaped = false;
  const stack: string[] = [];
  for (const ch of candidate) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      if (inString) escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{" || ch === "[") stack.push(ch);
    else if (ch === "}" || ch === "]") stack.pop();
  }

  let repaired = candidate.replace(/,\s*$/, "");
  if (inString) repaired += '"';
  repaired = repaired.replace(/,\s*$/, "");
  while (stack.length) {
    const open = stack.pop();
    repaired += open === "[" ? "]" : "}";
  }
  try {
    return JSON.parse(repaired);
  } catch {
    return null;
  }
}
