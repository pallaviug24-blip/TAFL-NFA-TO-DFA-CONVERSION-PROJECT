/**
 * automata.js
 * ══════════════════════════════════════════════════════
 * Core algorithms for:
 *  • NFA representation & ε-closure
 *  • NFA → DFA (subset construction)
 *  • DFA minimization (table-filling / Hopcroft)
 *  • Regex → NFA (Thompson's construction)
 * ══════════════════════════════════════════════════════
 */

'use strict';

/* ─────────────────────────────────────────────────────
   UTILITY
───────────────────────────────────────────────────── */

/**
 * Sort and join a set of strings to produce a canonical state name.
 * e.g. Set(['q1','q0']) → '{q0,q1}'
 */
function setName(stateSet) {
  const arr = [...stateSet].sort();
  return '{' + arr.join(',') + '}';
}

function setsEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

/* ─────────────────────────────────────────────────────
   NFA STRUCTURE
   nfa = {
     states: Set<string>,
     alphabet: Set<string>,
     transitions: Map<string, Map<string, Set<string>>>,
       // state → symbol → Set of next-states
     start: string,
     finals: Set<string>
   }
───────────────────────────────────────────────────── */

/**
 * Build an NFA object from raw user input.
 * Transitions array format: [{from, symbol, to}]
 */
function buildNFA(states, alphabet, transitionLines, start, finals) {
  const nfa = {
    states: new Set(states),
    alphabet: new Set(alphabet),
    transitions: new Map(),
    start,
    finals: new Set(finals)
  };

  // Initialize transition table
  for (const s of states) {
    nfa.transitions.set(s, new Map());
    for (const sym of [...alphabet, 'ε']) {
      nfa.transitions.get(s).set(sym, new Set());
    }
  }

  // Fill transitions
  for (const t of transitionLines) {
    const { from, symbol, to } = t;
    if (!nfa.transitions.has(from)) nfa.transitions.set(from, new Map());
    const symMap = nfa.transitions.get(from);
    if (!symMap.has(symbol)) symMap.set(symbol, new Set());
    symMap.get(symbol).add(to);
  }

  return nfa;
}

/* ─────────────────────────────────────────────────────
   ε-CLOSURE
───────────────────────────────────────────────────── */

/**
 * Compute ε-closure of a set of NFA states.
 * Returns a Set of reachable states via ε-transitions only.
 */
function epsilonClosure(nfa, stateSet) {
  const closure = new Set(stateSet);
  const stack = [...stateSet];

  while (stack.length > 0) {
    const state = stack.pop();
    const stateMap = nfa.transitions.get(state);
    if (!stateMap) continue;
    const epsTargets = stateMap.get('ε') || new Set();
    for (const t of epsTargets) {
      if (!closure.has(t)) {
        closure.add(t);
        stack.push(t);
      }
    }
  }

  return closure;
}

/**
 * Compute the set of NFA states reachable from stateSet on a given symbol,
 * then take the ε-closure.
 */
function move(nfa, stateSet, symbol) {
  const result = new Set();
  for (const state of stateSet) {
    const stateMap = nfa.transitions.get(state);
    if (!stateMap) continue;
    const targets = stateMap.get(symbol) || new Set();
    for (const t of targets) result.add(t);
  }
  return epsilonClosure(nfa, result);
}

/* ─────────────────────────────────────────────────────
   NFA → DFA  (SUBSET CONSTRUCTION)
───────────────────────────────────────────────────── */

/**
 * Convert NFA to DFA using subset construction.
 * Returns { dfa, steps }
 *
 * dfa = {
 *   states: Set<string>,  (names like '{q0,q1}')
 *   alphabet: Set<string>,
 *   transitions: Map<string, Map<string, string>>,
 *   start: string,
 *   finals: Set<string>,
 *   stateMap: Map<string, Set<string>>  (DFA state name → NFA state set)
 * }
 *
 * steps = array of step objects for visualization
 */
function nfaToDFA(nfa) {
  const alphabet = [...nfa.alphabet].filter(s => s !== 'ε');
  const steps = [];
  const dfa = {
    states: new Set(),
    alphabet: new Set(alphabet),
    transitions: new Map(),
    start: null,
    finals: new Set(),
    stateMap: new Map()
  };

  // Start with ε-closure of NFA start state
  const startClosure = epsilonClosure(nfa, new Set([nfa.start]));
  const startName = setName(startClosure);

  dfa.start = startName;
  dfa.states.add(startName);
  dfa.stateMap.set(startName, startClosure);

  if ([...startClosure].some(s => nfa.finals.has(s))) {
    dfa.finals.add(startName);
  }

  steps.push({
    type: 'init',
    title: 'Initialization',
    detail: `Start with ε-closure of NFA start state <code>${nfa.start}</code> = <code>${startName}</code>`,
    currentState: startName,
    symbol: null,
    result: startName
  });

  const queue = [startClosure];
  const visited = new Set([startName]);

  while (queue.length > 0) {
    const currentSet = queue.shift();
    const currentName = setName(currentSet);

    dfa.transitions.set(currentName, new Map());

    for (const sym of alphabet) {
      const nextSet = move(nfa, currentSet, sym);

      if (nextSet.size === 0) {
        // Dead state
        const deadName = '∅';
        dfa.transitions.get(currentName).set(sym, deadName);

        steps.push({
          type: 'transition',
          title: `${currentName} on '${sym}'`,
          detail: `From state <code>${currentName}</code> on input <code>${sym}</code>, move gives ∅ (dead state).`,
          currentState: currentName,
          symbol: sym,
          result: deadName
        });

        if (!dfa.states.has(deadName)) {
          dfa.states.add(deadName);
          dfa.stateMap.set(deadName, new Set());
          dfa.transitions.set(deadName, new Map());
          for (const s2 of alphabet) {
            dfa.transitions.get(deadName).set(s2, deadName);
          }
        }
        continue;
      }

      const nextName = setName(nextSet);

      // Compute epsilon closure detail for step
      const moveResult = new Set();
      for (const s of currentSet) {
        const sm = nfa.transitions.get(s);
        if (sm) { (sm.get(sym) || new Set()).forEach(t => moveResult.add(t)); }
      }
      const epsClosed = epsilonClosure(nfa, moveResult);

      steps.push({
        type: 'transition',
        title: `${currentName} on '${sym}'`,
        detail: `From <code>${currentName}</code> on <code>${sym}</code>: `
              + `move = <code>{${[...moveResult].sort().join(',')}}</code>, `
              + `ε-closure = <code>${nextName}</code>`,
        currentState: currentName,
        symbol: sym,
        result: nextName
      });

      dfa.transitions.get(currentName).set(sym, nextName);

      if (!visited.has(nextName)) {
        visited.add(nextName);
        dfa.states.add(nextName);
        dfa.stateMap.set(nextName, nextSet);

        if ([...nextSet].some(s => nfa.finals.has(s))) {
          dfa.finals.add(nextName);
          steps.push({
            type: 'final',
            title: `Final state detected`,
            detail: `<code>${nextName}</code> contains NFA final state(s), so it is a DFA final state.`,
            currentState: nextName,
            symbol: null,
            result: nextName
          });
        }

        queue.push(nextSet);
      }
    }
  }

  steps.push({
    type: 'complete',
    title: 'DFA Construction Complete',
    detail: `DFA has <code>${dfa.states.size}</code> states: <code>${[...dfa.states].join(', ')}</code>`,
    currentState: null,
    symbol: null,
    result: null
  });

  return { dfa, steps };
}

/* ─────────────────────────────────────────────────────
   DFA MINIMIZATION  (Table-filling / Hopcroft's idea)
───────────────────────────────────────────────────── */

/**
 * Minimize a DFA using partition refinement.
 * Returns { minDFA, steps, partitions }
 */
function minimizeDFA(dfa) {
  const alphabet = [...dfa.alphabet];
  const states = [...dfa.states].filter(s => s !== '∅' || dfa.transitions.has(s));
  const steps = [];

  // Remove unreachable states
  const reachable = new Set();
  const reach_q = [dfa.start];
  reachable.add(dfa.start);
  while (reach_q.length > 0) {
    const cur = reach_q.shift();
    const trans = dfa.transitions.get(cur);
    if (!trans) continue;
    for (const sym of alphabet) {
      const next = trans.get(sym);
      if (next && !reachable.has(next)) {
        reachable.add(next);
        reach_q.push(next);
      }
    }
  }
  const workStates = states.filter(s => reachable.has(s));

  // Initial partition: final states vs non-final
  const finals = workStates.filter(s => dfa.finals.has(s));
  const nonFinals = workStates.filter(s => !dfa.finals.has(s));
  let partitions = [];
  if (finals.length > 0) partitions.push(new Set(finals));
  if (nonFinals.length > 0) partitions.push(new Set(nonFinals));

  steps.push({
    type: 'init',
    title: 'Initial Partition',
    detail: `Partition P0: Final states = <code>{${finals.join(',')}}</code>, `
          + `Non-final = <code>{${nonFinals.join(',')}}</code>`,
    partitions: partitions.map(p => [...p])
  });

  // Refinement loop
  let changed = true;
  let round = 0;
  while (changed) {
    changed = false;
    round++;
    const newPartitions = [];

    for (const group of partitions) {
      // Find which partition each state goes to per symbol
      const getGroupId = (state) => {
        for (let i = 0; i < partitions.length; i++) {
          if (partitions[i].has(state)) return i;
        }
        return -1;
      };

      // Try to split this group
      const statesArr = [...group];
      const signature = (s) =>
        alphabet.map(sym => {
          const trans = dfa.transitions.get(s);
          const next = trans ? trans.get(sym) : null;
          return next ? getGroupId(next) : -1;
        }).join(',');

      const sigMap = new Map();
      for (const s of statesArr) {
        const sig = signature(s);
        if (!sigMap.has(sig)) sigMap.set(sig, new Set());
        sigMap.get(sig).add(s);
      }

      if (sigMap.size > 1) {
        changed = true;
        const subgroups = [...sigMap.values()];
        newPartitions.push(...subgroups);

        steps.push({
          type: 'split',
          title: `Round ${round}: Split group`,
          detail: `Group <code>{${statesArr.join(',')}}</code> splits into `
                + subgroups.map(sg => `<code>{${[...sg].join(',')}}</code>`).join(', '),
          partitions: newPartitions.map(p => [...p])
        });
      } else {
        newPartitions.push(group);
      }
    }

    if (changed) {
      partitions = newPartitions;
      steps.push({
        type: 'partition',
        title: `After Round ${round}`,
        detail: `Partitions: ${partitions.map(p => `<code>{${[...p].join(',')}}</code>`).join(', ')}`,
        partitions: partitions.map(p => [...p])
      });
    }
  }

  steps.push({
    type: 'stable',
    title: 'Partitions Stable',
    detail: `No further splitting possible. Final partitions: ${partitions.map(p => `<code>{${[...p].join(',')}}</code>`).join(', ')}`
  });

  // Build minimized DFA
  // Pick a representative for each partition
  const repOf = new Map();   // state → representative
  const partName = new Map(); // partition set → name

  for (const part of partitions) {
    const arr = [...part].sort();
    const rep = arr[0];
    const name = arr.length === 1 ? rep : '{' + arr.join(',') + '}';
    partName.set(part, name);
    for (const s of part) repOf.set(s, name);
  }

  const minDFA = {
    states: new Set(),
    alphabet: new Set(alphabet),
    transitions: new Map(),
    start: repOf.get(dfa.start),
    finals: new Set(),
    mergedGroups: []
  };

  for (const part of partitions) {
    const name = partName.get(part);
    minDFA.states.add(name);
    minDFA.transitions.set(name, new Map());

    // Final?
    const anyFinal = [...part].some(s => dfa.finals.has(s));
    if (anyFinal) minDFA.finals.add(name);

    // Transitions (use any rep from this partition)
    const rep = [...part][0];
    const repTrans = dfa.transitions.get(rep);
    if (repTrans) {
      for (const sym of alphabet) {
        const next = repTrans.get(sym);
        if (next) minDFA.transitions.get(name).set(sym, repOf.get(next) || next);
      }
    }

    if (part.size > 1) {
      minDFA.mergedGroups.push({ name, states: [...part] });
    }
  }

  steps.push({
    type: 'complete',
    title: 'Minimization Complete',
    detail: `Minimized DFA has <code>${minDFA.states.size}</code> states (down from <code>${workStates.length}</code>). `
          + (minDFA.mergedGroups.length
              ? `Merged: ${minDFA.mergedGroups.map(g => `<code>{${g.states.join(',')}}</code>→<code>${g.name}</code>`).join(', ')}`
              : 'No states were merged.')
  });

  return { minDFA, steps, partitions };
}

/* ─────────────────────────────────────────────────────
   REGEX → NFA  (THOMPSON'S CONSTRUCTION)
───────────────────────────────────────────────────── */

let _stateCounter = 0;
function freshState() { return 'n' + (_stateCounter++); }
function resetStateCounter() { _stateCounter = 0; }

/**
 * NFA fragment = { start: string, accept: string, transitions: [] }
 * transitions: [{from, symbol, to}]
 */

function fragmentForChar(c) {
  const s = freshState(), a = freshState();
  return {
    start: s, accept: a,
    states: new Set([s, a]),
    transitions: [{ from: s, symbol: c, to: a }]
  };
}

function fragmentConcat(f1, f2) {
  // f1.accept --ε--> f2.start
  return {
    start: f1.start,
    accept: f2.accept,
    states: new Set([...f1.states, ...f2.states]),
    transitions: [
      ...f1.transitions,
      { from: f1.accept, symbol: 'ε', to: f2.start },
      ...f2.transitions
    ]
  };
}

function fragmentUnion(f1, f2) {
  const s = freshState(), a = freshState();
  return {
    start: s, accept: a,
    states: new Set([s, a, ...f1.states, ...f2.states]),
    transitions: [
      { from: s, symbol: 'ε', to: f1.start },
      { from: s, symbol: 'ε', to: f2.start },
      ...f1.transitions,
      ...f2.transitions,
      { from: f1.accept, symbol: 'ε', to: a },
      { from: f2.accept, symbol: 'ε', to: a }
    ]
  };
}

function fragmentStar(f) {
  const s = freshState(), a = freshState();
  return {
    start: s, accept: a,
    states: new Set([s, a, ...f.states]),
    transitions: [
      { from: s, symbol: 'ε', to: f.start },
      { from: s, symbol: 'ε', to: a },
      ...f.transitions,
      { from: f.accept, symbol: 'ε', to: f.start },
      { from: f.accept, symbol: 'ε', to: a }
    ]
  };
}

function fragmentPlus(f) {
  // f+ = f · f*
  const fCopy = cloneFragment(f);
  return fragmentConcat(f, fragmentStar(fCopy));
}

function fragmentOptional(f) {
  const s = freshState(), a = freshState();
  return {
    start: s, accept: a,
    states: new Set([s, a, ...f.states]),
    transitions: [
      { from: s, symbol: 'ε', to: f.start },
      { from: s, symbol: 'ε', to: a },
      ...f.transitions,
      { from: f.accept, symbol: 'ε', to: a }
    ]
  };
}

function cloneFragment(f) {
  // Deep clone with fresh state names
  const stateRename = new Map();
  for (const s of f.states) stateRename.set(s, freshState());
  const newTransitions = f.transitions.map(t => ({
    from: stateRename.get(t.from),
    symbol: t.symbol,
    to: stateRename.get(t.to)
  }));
  return {
    start: stateRename.get(f.start),
    accept: stateRename.get(f.accept),
    states: new Set([...f.states].map(s => stateRename.get(s))),
    transitions: newTransitions
  };
}

/* ── Regex Parser (recursive descent) ── */

class RegexParser {
  constructor(pattern) {
    this.src = pattern.trim();
    this.pos = 0;
  }

  peek() { return this.pos < this.src.length ? this.src[this.pos] : null; }
  consume() { return this.src[this.pos++]; }
  expect(c) {
    if (this.peek() !== c) throw new Error(`Expected '${c}' at position ${this.pos}`);
    return this.consume();
  }

  // expression = term ('|' term)*
  parseExpression() {
    let left = this.parseTerm();
    while (this.peek() === '|') {
      this.consume();
      const right = this.parseTerm();
      left = fragmentUnion(left, right);
    }
    return left;
  }

  // term = factor+  (implicit concatenation)
  parseTerm() {
    let result = null;
    while (this.peek() !== null && this.peek() !== ')' && this.peek() !== '|') {
      const f = this.parseFactor();
      result = result ? fragmentConcat(result, f) : f;
    }
    if (!result) throw new Error('Empty term in regex');
    return result;
  }

  // factor = atom ('*' | '+' | '?')*
  parseFactor() {
    let f = this.parseAtom();
    while (['*', '+', '?'].includes(this.peek())) {
      const op = this.consume();
      if (op === '*') f = fragmentStar(f);
      else if (op === '+') f = fragmentPlus(f);
      else if (op === '?') f = fragmentOptional(f);
    }
    return f;
  }

  // atom = char | '(' expression ')'
  parseAtom() {
    const c = this.peek();
    if (c === null || c === ')' || c === '|') throw new Error('Unexpected token at pos ' + this.pos);
    if (c === '(') {
      this.consume();
      const f = this.parseExpression();
      this.expect(')');
      return f;
    }
    if (c === 'ε' || c === 'e') {
      this.consume();
      // epsilon literal → match empty string
      const s = freshState(), a = freshState();
      return {
        start: s, accept: a,
        states: new Set([s, a]),
        transitions: [{ from: s, symbol: 'ε', to: a }]
      };
    }
    this.consume();
    return fragmentForChar(c);
  }

  parse() {
    const f = this.parseExpression();
    if (this.pos < this.src.length) {
      throw new Error(`Unexpected character '${this.src[this.pos]}' at position ${this.pos}`);
    }
    return f;
  }
}

/**
 * Convert a regex string to an NFA.
 * Returns { nfa, alphabet, error }
 */
function regexToNFA(pattern) {
  resetStateCounter();
  try {
    const parser = new RegexParser(pattern);
    const fragment = parser.parse();

    // Extract alphabet (non-epsilon symbols used)
    const alphabet = new Set();
    for (const t of fragment.transitions) {
      if (t.symbol !== 'ε') alphabet.add(t.symbol);
    }

    const nfa = buildNFA(
      [...fragment.states],
      [...alphabet],
      fragment.transitions,
      fragment.start,
      [fragment.accept]
    );

    return { nfa, alphabet: [...alphabet], error: null };
  } catch (e) {
    return { nfa: null, alphabet: [], error: e.message };
  }
}

/* ─────────────────────────────────────────────────────
   PARSING USER INPUT
───────────────────────────────────────────────────── */

function parseNFAInput() {
  const statesRaw = document.getElementById('nfa-states').value.trim();
  const alphabetRaw = document.getElementById('nfa-alphabet').value.trim();
  const startRaw = document.getElementById('nfa-start').value.trim();
  const finalsRaw = document.getElementById('nfa-finals').value.trim();
  const transitionsRaw = document.getElementById('nfa-transitions').value.trim();

  const errors = [];

  const states = statesRaw.split(',').map(s => s.trim()).filter(Boolean);
  const alphabet = alphabetRaw.split(',').map(s => s.trim()).filter(Boolean);
  const start = startRaw;
  const finals = finalsRaw.split(',').map(s => s.trim()).filter(Boolean);

  if (states.length === 0) errors.push('No states defined.');
  if (alphabet.length === 0) errors.push('No alphabet defined.');
  if (!start) errors.push('No start state defined.');
  if (!states.includes(start)) errors.push(`Start state '${start}' not in states list.`);
  for (const f of finals) {
    if (!states.includes(f)) errors.push(`Final state '${f}' not in states list.`);
  }

  const transitionLines = [];
  const rawLines = transitionsRaw.split('\n').map(l => l.trim()).filter(Boolean);
  for (const line of rawLines) {
    const parts = line.split(',');
    if (parts.length !== 3) { errors.push(`Invalid transition line: "${line}"`); continue; }
    const [from, symbol, to] = parts.map(p => p.trim());
    if (!states.includes(from)) errors.push(`Transition from unknown state '${from}'.`);
    if (!states.includes(to)) errors.push(`Transition to unknown state '${to}'.`);
    transitionLines.push({ from, symbol, to });
  }

  if (errors.length > 0) return { error: errors.join('<br>'), nfa: null };

  const nfa = buildNFA(states, alphabet, transitionLines, start, finals);
  return { error: null, nfa };
}

/* ─────────────────────────────────────────────────────
   TRANSITION TABLE HTML
───────────────────────────────────────────────────── */

function buildNFATableHTML(nfa) {
  const alphabet = [...nfa.alphabet, 'ε'];
  let html = '<table><thead><tr><th>State</th>';
  for (const sym of alphabet) html += `<th>${sym}</th>`;
  html += '</tr></thead><tbody>';

  for (const state of [...nfa.states].sort()) {
    let cls = '';
    if (state === nfa.start && nfa.finals.has(state)) cls = 'is-start is-final';
    else if (state === nfa.start) cls = 'is-start';
    else if (nfa.finals.has(state)) cls = 'is-final';

    const prefix = (state === nfa.start ? '→' : '') + (nfa.finals.has(state) ? '*' : '');
    html += `<tr><td class="${cls}">${prefix}${state}</td>`;

    for (const sym of alphabet) {
      const stateMap = nfa.transitions.get(state);
      const targets = stateMap ? (stateMap.get(sym) || new Set()) : new Set();
      const tStr = [...targets].sort().join(', ') || '—';
      html += `<td>${tStr}</td>`;
    }
    html += '</tr>';
  }

  html += '</tbody></table>';
  return html;
}

function buildDFATableHTML(dfa) {
  const alphabet = [...dfa.alphabet];
  let html = '<table><thead><tr><th>State</th>';
  for (const sym of alphabet) html += `<th>${sym}</th>`;
  html += '</tr></thead><tbody>';

  for (const state of [...dfa.states].sort()) {
    const isDead = state === '∅';
    let cls = '';
    if (state === dfa.start && dfa.finals.has(state)) cls = 'is-start is-final';
    else if (state === dfa.start) cls = 'is-start';
    else if (dfa.finals.has(state)) cls = 'is-final';
    else if (isDead) cls = 'is-dead';

    const prefix = (state === dfa.start ? '→' : '') + (dfa.finals.has(state) ? '*' : '');
    html += `<tr><td class="${cls}">${prefix}${state}</td>`;

    for (const sym of alphabet) {
      const trans = dfa.transitions.get(state);
      const next = trans ? (trans.get(sym) || '—') : '—';
      html += `<td>${next}</td>`;
    }
    html += '</tr>';
  }

  html += '</tbody></table>';
  return html;
}

/* ─────────────────────────────────────────────────────
   EXAMPLE NFA PRESETS
───────────────────────────────────────────────────── */

const NFA_EXAMPLES = {
  abb: {
    states: 'q0,q1,q2,q3',
    alphabet: 'a,b',
    start: 'q0',
    finals: 'q3',
    transitions: 'q0,a,q0\nq0,b,q0\nq0,a,q1\nq1,b,q2\nq2,b,q3'
  },
  aorbstar: {
    states: 'q0,q1,q2,q3,q4',
    alphabet: 'a,b',
    start: 'q0',
    finals: 'q4',
    transitions: 'q0,ε,q1\nq0,ε,q3\nq1,a,q2\nq3,b,q4\nq2,ε,q0\nq4,ε,q0\nq0,ε,q4'
  },
  epsilon: {
    states: 'q0,q1,q2',
    alphabet: 'a,b',
    start: 'q0',
    finals: 'q2',
    transitions: 'q0,ε,q1\nq1,a,q1\nq1,ε,q2\nq2,b,q2'
  }
};

// Export everything needed by ui.js
window.AutomataEngine = {
  buildNFA,
  epsilonClosure,
  move,
  nfaToDFA,
  minimizeDFA,
  regexToNFA,
  parseNFAInput,
  buildNFATableHTML,
  buildDFATableHTML,
  NFA_EXAMPLES
};
