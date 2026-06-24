// Safe formula engine for computed custom-field columns.
// Pure + dependency-free so it can be unit-tested in isolation and can NEVER eval()
// arbitrary code (no `eval`/`Function`, no access to globals) — a hand-written
// tokenizer + precedence-climbing parser + tree-walking evaluator only.
// Used by components/useCustomColumns.tsx to render read-only `formula` columns.

export type FormulaValue = number | string | null;
export type RefResolver = (name: string) => FormulaValue;
export interface FormulaResult { value: FormulaValue; error?: string }

const MAX_LEN = 2000;
const MAX_TOKENS = 600;

class FErr extends Error {}

type Tok =
  | { t: 'num'; v: number }
  | { t: 'str'; v: string }
  | { t: 'ref'; v: string }
  | { t: 'id'; v: string }
  | { t: 'op'; v: string }
  | { t: 'punc'; v: string };

function tokenize(src: string): Tok[] {
  const toks: Tok[] = [];
  let i = 0;
  const n = src.length;
  const isDigit = (c: string) => c >= '0' && c <= '9';
  const isIdStart = (c: string) => /[A-Za-z_]/.test(c);
  const isId = (c: string) => /[A-Za-z0-9_]/.test(c);
  while (i < n) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { i++; continue; }
    if (c === '{') {
      const end = src.indexOf('}', i + 1);
      if (end < 0) throw new FErr('Unclosed { in field reference');
      toks.push({ t: 'ref', v: src.slice(i + 1, end).trim() });
      i = end + 1; continue;
    }
    if (c === '"' || c === "'") {
      const end = src.indexOf(c, i + 1);
      if (end < 0) throw new FErr('Unclosed string literal');
      toks.push({ t: 'str', v: src.slice(i + 1, end) });
      i = end + 1; continue;
    }
    if (isDigit(c) || (c === '.' && isDigit(src[i + 1] || ''))) {
      let j = i + 1;
      while (j < n && (isDigit(src[j]) || src[j] === '.')) j++;
      const numStr = src.slice(i, j);
      const num = Number(numStr);
      if (isNaN(num)) throw new FErr('Bad number: ' + numStr);
      toks.push({ t: 'num', v: num });
      i = j; continue;
    }
    if (isIdStart(c)) {
      let j = i + 1;
      while (j < n && isId(src[j])) j++;
      toks.push({ t: 'id', v: src.slice(i, j) });
      i = j; continue;
    }
    const two = src.slice(i, i + 2);
    if (two === '==' || two === '!=' || two === '<>' || two === '<=' || two === '>=') { toks.push({ t: 'op', v: two }); i += 2; continue; }
    if (c === '+' || c === '-' || c === '*' || c === '/' || c === '%' || c === '^') { toks.push({ t: 'op', v: c }); i++; continue; }
    if (c === '=') { toks.push({ t: 'op', v: '==' }); i++; continue; }
    if (c === '<' || c === '>') { toks.push({ t: 'op', v: c }); i++; continue; }
    if (c === '(' || c === ')' || c === ',') { toks.push({ t: 'punc', v: c }); i++; continue; }
    throw new FErr('Unexpected character: ' + c);
  }
  if (toks.length > MAX_TOKENS) throw new FErr('Formula too complex');
  return toks;
}

type Node =
  | { k: 'num'; v: number }
  | { k: 'str'; v: string }
  | { k: 'ref'; v: string }
  | { k: 'un'; op: string; a: Node }
  | { k: 'bin'; op: string; a: Node; b: Node }
  | { k: 'call'; name: string; args: Node[] };

const PREC: Record<string, number> = {
  '==': 1, '!=': 1, '<>': 1, '<': 1, '<=': 1, '>': 1, '>=': 1,
  '+': 2, '-': 2, '*': 3, '/': 3, '%': 3, '^': 4,
};
const RIGHT = new Set(['^']);

function parse(toks: Tok[]): Node {
  let p = 0;
  const peek = (): Tok | undefined => toks[p];
  const next = (): Tok | undefined => toks[p++];

  function parseExpr(minPrec: number): Node {
    let left = parseUnary();
    for (;;) {
      const tk = peek();
      if (!tk || tk.t !== 'op' || !(tk.v in PREC)) break;
      const prec = PREC[tk.v];
      if (prec < minPrec) break;
      next();
      const nextMin = RIGHT.has(tk.v) ? prec : prec + 1;
      const right = parseExpr(nextMin);
      left = { k: 'bin', op: tk.v, a: left, b: right };
    }
    return left;
  }
  function parseUnary(): Node {
    const tk = peek();
    if (tk && tk.t === 'op' && (tk.v === '-' || tk.v === '+')) { next(); return { k: 'un', op: tk.v, a: parseUnary() }; }
    return parsePrimary();
  }
  function parsePrimary(): Node {
    const tk = next();
    if (!tk) throw new FErr('Unexpected end of formula');
    if (tk.t === 'num') return { k: 'num', v: tk.v };
    if (tk.t === 'str') return { k: 'str', v: tk.v };
    if (tk.t === 'ref') return { k: 'ref', v: tk.v };
    if (tk.t === 'id') {
      const nx = peek();
      if (nx && nx.t === 'punc' && nx.v === '(') {
        next();
        const args: Node[] = [];
        const after = peek();
        if (!(after && after.t === 'punc' && after.v === ')')) {
          args.push(parseExpr(0));
          for (;;) { const cm = peek(); if (cm && cm.t === 'punc' && cm.v === ',') { next(); args.push(parseExpr(0)); } else break; }
        }
        const close = next();
        if (!close || close.t !== 'punc' || close.v !== ')') throw new FErr('Expected ) after ' + tk.v + '(');
        return { k: 'call', name: tk.v.toUpperCase(), args };
      }
      const up = tk.v.toUpperCase();
      if (up === 'TRUE') return { k: 'num', v: 1 };
      if (up === 'FALSE') return { k: 'num', v: 0 };
      if (up === 'PI') return { k: 'num', v: Math.PI };
      if (up === 'BLANK' || up === 'NULL') return { k: 'str', v: '' };
      throw new FErr('Unknown name "' + tk.v + '" — reference a column as {Field name}');
    }
    if (tk.t === 'punc' && tk.v === '(') {
      const e = parseExpr(0);
      const close = next();
      if (!close || close.t !== 'punc' || close.v !== ')') throw new FErr('Expected )');
      return e;
    }
    throw new FErr('Unexpected token: ' + String(tk.v));
  }

  const node = parseExpr(0);
  if (p < toks.length) throw new FErr('Unexpected trailing input in formula');
  return node;
}

const isNumericStr = (s: string) => s.trim() !== '' && !isNaN(Number(s));
function toNum(v: FormulaValue): number {
  if (v === null || v === '') return 0;
  if (typeof v === 'number') return v;
  const n = Number(v);
  if (isNaN(n)) throw new FErr('"' + v + '" is not a number');
  return n;
}
function toStr(v: FormulaValue): string {
  if (v === null) return '';
  return typeof v === 'number' ? String(v) : v;
}

function evalNode(node: Node, resolve: RefResolver): FormulaValue {
  switch (node.k) {
    case 'num': return node.v;
    case 'str': return node.v;
    case 'ref': { const r = resolve(node.v); return r === undefined ? null : r; }
    case 'un': { const a = toNum(evalNode(node.a, resolve)); return node.op === '-' ? -a : a; }
    case 'bin': return evalBin(node.op, node.a, node.b, resolve);
    case 'call': return evalCall(node.name, node.args, resolve);
    default: throw new FErr('Bad node');
  }
}

function evalBin(op: string, aN: Node, bN: Node, resolve: RefResolver): FormulaValue {
  if (op === '+' || op === '-' || op === '*' || op === '/' || op === '%' || op === '^') {
    const a = toNum(evalNode(aN, resolve));
    const b = toNum(evalNode(bN, resolve));
    switch (op) {
      case '+': return a + b;
      case '-': return a - b;
      case '*': return a * b;
      case '/': if (b === 0) throw new FErr('Divide by zero'); return a / b;
      case '%': if (b === 0) throw new FErr('Divide by zero'); return a % b;
      case '^': return Math.pow(a, b);
    }
  }
  const av = evalNode(aN, resolve);
  const bv = evalNode(bN, resolve);
  const numeric = (typeof av === 'number' || av === null || (typeof av === 'string' && isNumericStr(av))) &&
                  (typeof bv === 'number' || bv === null || (typeof bv === 'string' && isNumericStr(bv)));
  if (numeric) {
    const a = toNum(av); const b = toNum(bv);
    switch (op) {
      case '==': return a === b ? 1 : 0;
      case '!=': case '<>': return a !== b ? 1 : 0;
      case '<': return a < b ? 1 : 0;
      case '<=': return a <= b ? 1 : 0;
      case '>': return a > b ? 1 : 0;
      case '>=': return a >= b ? 1 : 0;
    }
  }
  const a = toStr(av); const b = toStr(bv);
  switch (op) {
    case '==': return a === b ? 1 : 0;
    case '!=': case '<>': return a !== b ? 1 : 0;
    case '<': return a < b ? 1 : 0;
    case '<=': return a <= b ? 1 : 0;
    case '>': return a > b ? 1 : 0;
    case '>=': return a >= b ? 1 : 0;
  }
  throw new FErr('Bad operator ' + op);
}

function evalCall(name: string, args: Node[], resolve: RefResolver): FormulaValue {
  const nums = () => args.map((a) => toNum(evalNode(a, resolve)));
  const need = (k: number) => { if (args.length < k) throw new FErr(name + '() needs ' + k + ' argument(s)'); };
  switch (name) {
    case 'SUM': return nums().reduce((s, x) => s + x, 0);
    case 'AVG': { const a = nums(); if (!a.length) throw new FErr('AVG() needs arguments'); return a.reduce((s, x) => s + x, 0) / a.length; }
    case 'MIN': { const a = nums(); if (!a.length) throw new FErr('MIN() needs arguments'); return Math.min(...a); }
    case 'MAX': { const a = nums(); if (!a.length) throw new FErr('MAX() needs arguments'); return Math.max(...a); }
    case 'ROUND': { need(1); const a = nums(); const d = a.length > 1 ? a[1] : 0; const f = Math.pow(10, d); return Math.round(a[0] * f) / f; }
    case 'ABS': need(1); return Math.abs(toNum(evalNode(args[0], resolve)));
    case 'CEIL': need(1); return Math.ceil(toNum(evalNode(args[0], resolve)));
    case 'FLOOR': need(1); return Math.floor(toNum(evalNode(args[0], resolve)));
    case 'SQRT': { need(1); const x = toNum(evalNode(args[0], resolve)); if (x < 0) throw new FErr('SQRT of a negative number'); return Math.sqrt(x); }
    case 'IF': { if (args.length < 2 || args.length > 3) throw new FErr('IF(condition, then, [else])'); const c = toNum(evalNode(args[0], resolve)); return c !== 0 ? evalNode(args[1], resolve) : (args.length > 2 ? evalNode(args[2], resolve) : ''); }
    case 'CONCAT': return args.map((a) => toStr(evalNode(a, resolve))).join('');
    case 'LEN': need(1); return toStr(evalNode(args[0], resolve)).length;
    case 'UPPER': need(1); return toStr(evalNode(args[0], resolve)).toUpperCase();
    case 'LOWER': need(1); return toStr(evalNode(args[0], resolve)).toLowerCase();
    case 'TRIM': need(1); return toStr(evalNode(args[0], resolve)).trim();
    default: throw new FErr('Unknown function ' + name + '()');
  }
}

// Evaluate a formula expression. `resolve(name)` returns a referenced column's value
// (number | string | null). NEVER throws — parse/eval errors come back as { error }.
export function evalFormula(expr: string, resolve: RefResolver): FormulaResult {
  try {
    if (!expr || !expr.trim()) return { value: null };
    if (expr.length > MAX_LEN) throw new FErr('Formula too long');
    const toks = tokenize(expr);
    if (!toks.length) return { value: null };
    const ast = parse(toks);
    const safeResolve: RefResolver = (name) => { try { const r = resolve(name); return r === undefined ? null : r; } catch { return null; } };
    const value = evalNode(ast, safeResolve);
    if (typeof value === 'number' && !isFinite(value)) throw new FErr('Result is not a finite number');
    return { value };
  } catch (e) {
    return { value: null, error: e instanceof Error ? e.message : 'Formula error' };
  }
}

// Field names referenced by a formula (for dependency hints / validation).
export function formulaRefs(expr: string): string[] {
  const out: string[] = [];
  const re = /\{([^}]+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(expr || '')) !== null) { const nm = m[1].trim(); if (nm && !out.includes(nm)) out.push(nm); }
  return out;
}
