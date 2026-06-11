// Variable helpers shared by the engine and UI components.

/** Replace {var} placeholders with values from vars. Unknown vars are left as-is. */
export function interpolate(text, vars) {
  if (!text || !vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, name) => (vars[name] != null ? String(vars[name]) : m));
}

const OPS = {
  "==": (a, b) => a === b,
  "!=": (a, b) => a !== b,
  ">=": (a, b) => a >= b,
  "<=": (a, b) => a <= b,
  ">": (a, b) => a > b,
  "<": (a, b) => a < b,
};

/** Evaluate a structured condition { var, op, value } against vars. */
export function evalCond(cond, vars) {
  const fn = OPS[cond.op];
  if (!fn) {
    console.warn(`Unknown condition operator: "${cond.op}"`);
    return false;
  }
  return fn(vars[cond.var] ?? 0, cond.value);
}
