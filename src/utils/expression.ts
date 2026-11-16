/**
 * Tiny recursive-descent evaluator for the Spotlight inline calculator.
 * Deliberately not `eval`: only numbers, + - * / % ^ and parentheses.
 */

type Token =
  | { kind: "number"; value: number }
  | { kind: "op"; value: string }
  | { kind: "lp" }
  | { kind: "rp" };

function tokenize(input: string): Token[] | null {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const char = input[i];
    if (char === " ") {
      i += 1;
      continue;
    }
    if (/[0-9.]/.test(char)) {
      let literal = "";
      while (i < input.length && /[0-9.]/.test(input[i])) {
        literal += input[i];
        i += 1;
      }
      const value = Number(literal);
      if (Number.isNaN(value)) return null;
      tokens.push({ kind: "number", value });
      continue;
    }
    if ("+-*/%^".includes(char)) {
      tokens.push({ kind: "op", value: char });
      i += 1;
      continue;
    }
    if (char === "(") {
      tokens.push({ kind: "lp" });
      i += 1;
      continue;
    }
    if (char === ")") {
      tokens.push({ kind: "rp" });
      i += 1;
      continue;
    }
    return null;
  }
  return tokens;
}

export function evaluateExpression(input: string): number | null {
  const source = input.trim().replace(/^=/, "").trim();
  if (!source) return null;
  const tokens = tokenize(source);
  if (!tokens || tokens.length === 0) return null;

  let position = 0;
  const peek = () => tokens[position];
  const take = () => tokens[position++];

  const parsePrimary = (): number | null => {
    const token = peek();
    if (!token) return null;
    if (token.kind === "number") {
      take();
      return token.value;
    }
    if (token.kind === "lp") {
      take();
      const value = parseExpression();
      if (!value) return null;
      const closing = take();
      if (!closing || closing.kind !== "rp") return null;
      return value;
    }
    if (token.kind === "op" && (token.value === "-" || token.value === "+")) {
      take();
      const value = parsePrimary();
      if (value === null) return null;
      return token.value === "-" ? -value : value;
    }
    return null;
  };

  const parsePower = (): number | null => {
    const base = parsePrimary();
    if (base === null) return null;
    const token = peek();
    if (token && token.kind === "op" && token.value === "^") {
      take();
      const exponent = parsePower();
      if (exponent === null) return null;
      return base ** exponent;
    }
    return base;
  };

  const parseTerm = (): number | null => {
    let value = parsePower();
    if (value === null) return null;
    for (;;) {
      const token = peek();
      if (!token || token.kind !== "op" || !"*/%".includes(token.value)) return value;
      take();
      const right = parsePower();
      if (right === null) return null;
      if (token.value === "*") value *= right;
      else if (token.value === "/") {
        if (right === 0) return null;
        value /= right;
      } else value %= right;
    }
  };

  const parseExpression = (): number | null => {
    let value = parseTerm();
    if (value === null) return null;
    for (;;) {
      const token = peek();
      if (!token || token.kind !== "op" || !"+-".includes(token.value)) return value;
      take();
      const right = parseTerm();
      if (right === null) return null;
      value = token.value === "+" ? value + right : value - right;
    }
  };

  const result = parseExpression();
  if (position !== tokens.length) return null;
  return result !== null && Number.isFinite(result) ? result : null;
}
