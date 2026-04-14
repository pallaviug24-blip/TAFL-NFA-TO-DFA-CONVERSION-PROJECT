/**
 * ui.js
 * ══════════════════════════════════════════════════════
 * UI controller:
 *  • Tab switching
 *  • Cytoscape.js graph rendering
 *  • Step-by-step playback
 *  • Export (JSON, PNG)
 *  • Dark/light theme toggle
 *  • Button handlers
 * ══════════════════════════════════════════════════════
 */

'use strict';

const AE = window.AutomataEngine;

/* ─────────────────────────────────────────────────────
   APP STATE
───────────────────────────────────────────────────── */
const state = {
  nfa: null,
  dfa: null,
  minDFA: null,
  subsetSteps: [],
  minSteps: [],
  currentGraph: 'nfa',   // 'nfa' | 'dfa' | 'min'
  stepType: 'subset',
  stepIndex: 0,
  stepTimer: null,
  cy: null
};

/* ─────────────────────────────────────────────────────
   CYTOSCAPE SETUP
───────────────────────────────────────────────────── */

function initCytoscape() {
  state.cy = cytoscape({
    container: document.getElementById('cy'),
    style: getCyStyle(),
    layout: { name: 'cose' },
    elements: [],
    wheelSensitivity: 0.3
  });
}

function getCyStyle() {
  const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
  const bg2 = isDark ? '#1c2030' : '#ffffff';
  const text = isDark ? '#e2e6f0' : '#1a1e30';
  const border = isDark ? '#2a2f45' : '#d0d5e8';

  return [
    {
      selector: 'node',
      style: {
        'background-color': bg2,
        'border-color': border,
        'border-width': 2,
        'label': 'data(label)',
        'color': text,
        'font-family': 'Space Mono, monospace',
        'font-size': '10px',
        'text-valign': 'center',
        'text-halign': 'center',
        'width': 'label',
        'height': 'label',
        'padding': '12px',
        'shape': 'ellipse',
        'text-wrap': 'wrap',
        'text-max-width': '80px'
      }
    },
    {
      selector: 'node[type="start"]',
      style: {
        'border-color': '#4fd1c5',
        'border-width': 3,
        'background-color': 'rgba(79,209,197,0.12)',
      }
    },
    {
      selector: 'node[type="final"]',
      style: {
        'border-color': '#34d399',
        'border-width': 3,
        'background-color': 'rgba(52,211,153,0.12)',
      }
    },
    {
      selector: 'node[type="startfinal"]',
      style: {
        'border-color': '#fbbf24',
        'border-width': 3,
        'background-color': 'rgba(251,191,36,0.12)',
      }
    },
    {
      selector: 'node[type="dead"]',
      style: {
        'border-color': '#5a6480',
        'border-style': 'dashed',
        'color': '#5a6480',
        'background-color': 'rgba(90,100,128,0.08)',
      }
    },
    {
      selector: 'node.highlighted',
      style: {
        'background-color': 'rgba(79,209,197,0.3)',
        'border-color': '#4fd1c5',
        'border-width': 4,
      }
    },
    {
      selector: 'edge',
      style: {
        'width': 2,
        'line-color': '#3a4060',
        'target-arrow-color': '#3a4060',
        'target-arrow-shape': 'triangle',
        'curve-style': 'bezier',
        'label': 'data(label)',
        'color': isDark ? '#8892aa' : '#4a5275',
        'font-family': 'Space Mono, monospace',
        'font-size': '9px',
        'text-rotation': 'autorotate',
        'text-margin-y': -8,
        'loop-direction': '45deg',
        'loop-sweep': '-45deg',
        'control-point-step-size': 40
      }
    },
    {
      selector: 'edge[symbol="ε"]',
      style: {
        'line-style': 'dashed',
        'line-color': '#a78bfa',
        'target-arrow-color': '#a78bfa',
        'color': '#a78bfa'
      }
    },
    {
      selector: 'edge.highlighted',
      style: {
        'line-color': '#4fd1c5',
        'target-arrow-color': '#4fd1c5',
        'width': 3
      }
    }
  ];
}

/* ─────────────────────────────────────────────────────
   GRAPH RENDERING
───────────────────────────────────────────────────── */

function renderGraph(graphType) {
  state.currentGraph = graphType;

  // Update viz tab buttons
  document.querySelectorAll('.viz-tab').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.graph === graphType);
  });

  let automaton = null;
  if (graphType === 'nfa') automaton = state.nfa;
  else if (graphType === 'dfa') automaton = state.dfa;
  else if (graphType === 'min') automaton = state.minDFA;

  if (!automaton) {
    showVizPlaceholder(true);
    return;
  }
  showVizPlaceholder(false);

  const elements = buildCyElements(automaton, graphType);
  state.cy.elements().remove();
  state.cy.add(elements);
  state.cy.style(getCyStyle());

  const layout = state.cy.layout({
    name: 'cose',
    animate: true,
    animationDuration: 600,
    nodeRepulsion: () => 8000,
    idealEdgeLength: () => 120,
    numIter: 1000,
    fit: true,
    padding: 40
  });
  layout.run();
}

function buildCyElements(automaton, graphType) {
  const elements = [];
  const alphabet = [...automaton.alphabet];

  // Determine if NFA or DFA
  const isNFA = graphType === 'nfa' && automaton.transitions &&
    [...automaton.transitions.values()].some(m => m instanceof Map &&
      [...m.values()].some(v => v instanceof Set && v.size > 1));

  // Nodes
  for (const s of automaton.states) {
    const isStart = s === automaton.start;
    const isFinal = automaton.finals.has(s);
    const isDead = s === '∅';

    let nodeType = 'normal';
    if (isDead) nodeType = 'dead';
    else if (isStart && isFinal) nodeType = 'startfinal';
    else if (isStart) nodeType = 'start';
    else if (isFinal) nodeType = 'final';

    // Label: for merged min DFA states, show nicely
    const label = s.startsWith('{') ? s.replace(/[{}]/g, '').split(',').join('\n') : s;

    elements.push({
      data: { id: s, label, type: nodeType, isFinal, isStart, isDead }
    });
  }

  // Edges — group by (from, to) to merge labels
  const edgeMap = new Map();

  if (graphType === 'nfa') {
    for (const [from, symMap] of automaton.transitions) {
      for (const [sym, targets] of symMap) {
        for (const to of targets) {
          const key = `${from}|||${to}`;
          if (!edgeMap.has(key)) edgeMap.set(key, { from, to, labels: new Set() });
          edgeMap.get(key).labels.add(sym);
        }
      }
    }
  } else {
    // DFA transitions: Map<string, string>
    for (const [from, symMap] of automaton.transitions) {
      for (const [sym, to] of symMap) {
        if (!to) continue;
        const key = `${from}|||${to}`;
        if (!edgeMap.has(key)) edgeMap.set(key, { from, to, labels: new Set() });
        edgeMap.get(key).labels.add(sym);
      }
    }
  }

  let edgeIndex = 0;
  for (const [key, edge] of edgeMap) {
    const label = [...edge.labels].sort().join(', ');
    const hasEps = edge.labels.has('ε');
    elements.push({
      data: {
        id: 'e' + edgeIndex++,
        source: edge.from,
        target: edge.to,
        label,
        symbol: hasEps ? 'ε' : null
      }
    });
  }

  return elements;
}

function showVizPlaceholder(show) {
  document.getElementById('cy-container').style.display = show ? 'none' : 'block';
  const ph = document.getElementById('viz-placeholder');
  ph.classList.toggle('show', show);
}

/* ─────────────────────────────────────────────────────
   STEP-BY-STEP
───────────────────────────────────────────────────── */

function getActiveSteps() {
  return state.stepType === 'subset' ? state.subsetSteps : state.minSteps;
}

function renderAllStepCards() {
  const steps = getActiveSteps();
  const container = document.getElementById('steps-content');
  if (steps.length === 0) {
    container.innerHTML = '<p class="placeholder-text">No steps available. Convert an NFA or minimize a DFA first.</p>';
    updateStepCounter();
    return;
  }

  container.innerHTML = '';
  steps.forEach((step, i) => {
    const div = document.createElement('div');
    div.className = 'step-card' + (i < state.stepIndex ? ' done' : '') + (i === state.stepIndex ? ' active' : '');
    div.id = `step-card-${i}`;
    div.innerHTML = `<div class="step-title">${step.title}</div><div class="step-detail">${step.detail}</div>`;
    container.appendChild(div);
  });

  updateStepCounter();
  scrollToActiveStep();
}

function updateStepCards() {
  const steps = getActiveSteps();
  steps.forEach((_, i) => {
    const card = document.getElementById(`step-card-${i}`);
    if (!card) return;
    card.className = 'step-card' + (i < state.stepIndex ? ' done' : '') + (i === state.stepIndex ? ' active' : '');
  });
  scrollToActiveStep();
  updateStepCounter();
}

function scrollToActiveStep() {
  const active = document.querySelector('.step-card.active');
  if (active) active.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function updateStepCounter() {
  const steps = getActiveSteps();
  document.getElementById('step-counter').textContent =
    steps.length === 0 ? '0 / 0' : `${state.stepIndex + 1} / ${steps.length}`;
}

/* ─────────────────────────────────────────────────────
   TABLE RENDERING
───────────────────────────────────────────────────── */

/**
 * renderNFATable(nfa, targetId)
 * ─────────────────────────────
 * Reusable function that writes an NFA transition table
 * into ANY element by id.  Adds a brief fade so updates
 * don't look jarring.
 *
 * @param {object|null} nfa      – NFA object (or null for placeholder)
 * @param {string}      targetId – id of the container element
 * @param {string}      [placeholder] – custom placeholder text
 */
function renderNFATable(nfa, targetId, placeholder) {
  const el = document.getElementById(targetId);
  if (!el) return;

  const ph = placeholder || 'No NFA built yet.';

  // Kick off fade-out
  el.classList.add('refreshing');
  el.classList.remove('refreshed');

  // Minimal async gap so the browser paints the fade before we replace content
  requestAnimationFrame(() => {
    el.innerHTML = nfa ? AE.buildNFATableHTML(nfa) : `<p class="placeholder-text">${ph}</p>`;
    // Trigger fade-in on next frame
    requestAnimationFrame(() => {
      el.classList.remove('refreshing');
      el.classList.add('refreshed');
    });
  });
}

function updateAllTables() {
  // Tab-5 tables — use the shared helper
  renderNFATable(state.nfa, 'table-nfa');

  document.getElementById('table-dfa').innerHTML =
    state.dfa ? AE.buildDFATableHTML(state.dfa) : '<p class="placeholder-text">No DFA converted yet.</p>';

  document.getElementById('table-min').innerHTML =
    state.minDFA ? AE.buildDFATableHTML(state.minDFA) : '<p class="placeholder-text">No minimization done yet.</p>';

  // Also keep the live preview in Tab-1 in sync
  renderNFATable(
    state.nfa,
    'nfa-table-preview',
    'Start typing or click <strong>Build NFA</strong> to see the table.'
  );
}

/* ─────────────────────────────────────────────────────
   TOAST
───────────────────────────────────────────────────── */
let toastTimer = null;
function showToast(msg, type = '') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast ${type}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = 'toast hidden'; }, 3000);
}

/* ─────────────────────────────────────────────────────
   TAB SWITCHING
───────────────────────────────────────────────────── */

function switchTab(tabName) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === `tab-${tabName}`));

  if (tabName === 'visualize') {
    renderGraph(state.currentGraph);
    setTimeout(() => state.cy && state.cy.fit(40), 200);
  }
  if (tabName === 'tables') updateAllTables();
  if (tabName === 'steps') renderAllStepCards();
}

/* ─────────────────────────────────────────────────────
   PIPELINE STATUS  (for Regex tab)
───────────────────────────────────────────────────── */
function setPipelineStep(id, status, detail) {
  const el = document.getElementById(id);
  if (!el) return;
  el.className = `pipeline-step ${status}`;
  el.querySelector('.step-status').textContent = detail || status;
}

function resetPipeline() {
  ['step-parse', 'step-nfa', 'step-dfa', 'step-min'].forEach(id => setPipelineStep(id, 'idle', 'waiting'));
}

/* ─────────────────────────────────────────────────────
   EXPORT
───────────────────────────────────────────────────── */

function exportJSON() {
  const dfa = state.minDFA || state.dfa;
  if (!dfa) { showToast('No DFA to export.', 'error'); return; }

  const obj = {
    states: [...dfa.states],
    alphabet: [...dfa.alphabet],
    start: dfa.start,
    finals: [...dfa.finals],
    transitions: {}
  };
  for (const [from, symMap] of dfa.transitions) {
    obj.transitions[from] = {};
    for (const [sym, to] of symMap) obj.transitions[from][sym] = to;
  }

  const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'dfa.json'; a.click();
  URL.revokeObjectURL(url);
  showToast('DFA exported as JSON ✓', 'success');
}

function exportPNG() {
  if (!state.cy || state.cy.elements().length === 0) {
    showToast('No graph to export.', 'error'); return;
  }
  const png = state.cy.png({ scale: 2, bg: '#0d0f17', full: true });
  const a = document.createElement('a');
  a.href = png; a.download = `${state.currentGraph}-graph.png`; a.click();
  showToast('Graph exported as PNG ✓', 'success');
}

/* ─────────────────────────────────────────────────────
   ERROR DISPLAY
───────────────────────────────────────────────────── */
function showError(id, msg) {
  const el = document.getElementById(id);
  el.innerHTML = msg;
  el.classList.remove('hidden');
}
function hideError(id) {
  document.getElementById(id).classList.add('hidden');
}

/* ─────────────────────────────────────────────────────
   BUTTON HANDLERS
───────────────────────────────────────────────────── */

// Build NFA
document.getElementById('buildNfa').addEventListener('click', () => {
  hideError('nfa-error');
  const { nfa, error } = AE.parseNFAInput();
  if (error) { showError('nfa-error', error); return; }

  state.nfa = nfa;
  state.dfa = null;
  state.minDFA = null;
  state.subsetSteps = [];
  state.minSteps = [];

  document.getElementById('nfa-status').textContent =
    `NFA built: ${nfa.states.size} states, alphabet {${[...nfa.alphabet].join(',')}}`;

  updateAllTables();
  showToast('NFA built successfully ✓', 'success');
});

// NFA → DFA
document.getElementById('nfaToDfa').addEventListener('click', () => {
  if (!state.nfa) { showToast('Build an NFA first.', 'error'); return; }

  const { dfa, steps } = AE.nfaToDFA(state.nfa);
  state.dfa = dfa;
  state.subsetSteps = steps;
  state.stepIndex = 0;

  updateAllTables();
  renderAllStepCards();
  showToast(`DFA constructed: ${dfa.states.size} states ✓`, 'success');
  document.getElementById('nfa-status').textContent =
    `DFA: ${dfa.states.size} states, ${dfa.finals.size} final states`;
});

// Minimize DFA
document.getElementById('minimizeDfa').addEventListener('click', () => {
  if (!state.dfa) { showToast('Convert to DFA first.', 'error'); return; }

  const { minDFA, steps } = AE.minimizeDFA(state.dfa);
  state.minDFA = minDFA;
  state.minSteps = steps;
  state.stepIndex = 0;

  updateAllTables();
  renderAllStepCards();
  showToast(`Minimized DFA: ${minDFA.states.size} states ✓`, 'success');
});

// Reset
document.getElementById('resetAll').addEventListener('click', () => {
  state.nfa = null; state.dfa = null; state.minDFA = null;
  state.subsetSteps = []; state.minSteps = [];
  state.stepIndex = 0;
  clearInterval(state.stepTimer); state.stepTimer = null;

  document.getElementById('nfa-table-preview').innerHTML = '<p class="placeholder-text">Start typing or click <strong>Build NFA</strong> to see the table.</p>';
  document.getElementById('nfa-status').textContent = 'Ready';
  hideError('nfa-error');
  updateAllTables();

  if (state.cy) state.cy.elements().remove();
  showVizPlaceholder(true);

  document.getElementById('steps-content').innerHTML = '<p class="placeholder-text">Convert an NFA to DFA or minimize a DFA first.</p>';
  updateStepCounter();

  resetPipeline();
  showToast('Reset complete.', '');
});

// Convert Regex
document.getElementById('convertRegex').addEventListener('click', async () => {
  const pattern = document.getElementById('regex-input').value.trim();
  hideError('regex-error');

  if (!pattern) { showError('regex-error', 'Please enter a regular expression.'); return; }

  resetPipeline();

  // Step 1: Parse
  setPipelineStep('step-parse', 'running', 'parsing…');
  await delay(200);

  const { nfa, alphabet, error } = AE.regexToNFA(pattern);
  if (error) {
    setPipelineStep('step-parse', 'error', 'failed');
    showError('regex-error', `Regex parse error: ${error}`);
    return;
  }
  setPipelineStep('step-parse', 'done', `parsed (${nfa.states.size} states)`);

  // Step 2: NFA
  setPipelineStep('step-nfa', 'running', 'building…');
  await delay(300);
  state.nfa = nfa;
  setPipelineStep('step-nfa', 'done', `${nfa.states.size} NFA states`);

  // Step 3: DFA
  setPipelineStep('step-dfa', 'running', 'subset construction…');
  await delay(300);
  const { dfa, steps: subSteps } = AE.nfaToDFA(nfa);
  state.dfa = dfa;
  state.subsetSteps = subSteps;
  state.stepIndex = 0;
  setPipelineStep('step-dfa', 'done', `${dfa.states.size} DFA states`);

  // Step 4: Minimize
  setPipelineStep('step-min', 'running', 'minimizing…');
  await delay(300);
  const { minDFA, steps: minSteps } = AE.minimizeDFA(dfa);
  state.minDFA = minDFA;
  state.minSteps = minSteps;
  setPipelineStep('step-min', 'done', `${minDFA.states.size} min states`);

  updateAllTables();
  showToast(`Regex pipeline complete ✓  NFA:${nfa.states.size} → DFA:${dfa.states.size} → Min:${minDFA.states.size}`, 'success');
});

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// Step controls
document.getElementById('stepPrev').addEventListener('click', () => {
  if (state.stepIndex > 0) { state.stepIndex--; updateStepCards(); }
});
document.getElementById('stepNext').addEventListener('click', () => {
  const steps = getActiveSteps();
  if (state.stepIndex < steps.length - 1) { state.stepIndex++; updateStepCards(); }
});

document.getElementById('stepPlay').addEventListener('click', function () {
  if (state.stepTimer) {
    clearInterval(state.stepTimer);
    state.stepTimer = null;
    this.textContent = '▶ Auto Play';
    return;
  }
  this.textContent = '⏸ Pause';
  const speed = parseInt(document.getElementById('stepSpeed').value);
  state.stepTimer = setInterval(() => {
    const steps = getActiveSteps();
    if (state.stepIndex >= steps.length - 1) {
      clearInterval(state.stepTimer); state.stepTimer = null;
      document.getElementById('stepPlay').textContent = '▶ Auto Play';
      return;
    }
    state.stepIndex++;
    updateStepCards();
  }, speed);
});

document.getElementById('stepType').addEventListener('change', function () {
  state.stepType = this.value;
  state.stepIndex = 0;
  renderAllStepCards();
});

// Viz graph tabs
document.querySelectorAll('.viz-tab').forEach(btn => {
  btn.addEventListener('click', () => renderGraph(btn.dataset.graph));
});

document.getElementById('fitGraph').addEventListener('click', () => {
  state.cy && state.cy.fit(40);
});
document.getElementById('layoutGraph').addEventListener('click', () => {
  if (!state.cy) return;
  state.cy.layout({
    name: 'cose',
    animate: true,
    animationDuration: 600,
    nodeRepulsion: () => 8000,
    idealEdgeLength: () => 120,
    numIter: 1000,
    fit: true,
    padding: 40
  }).run();
});

// NFA tab tabs
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => switchTab(tab.dataset.tab));
});

// Theme toggle
document.getElementById('themeToggle').addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme');
  document.documentElement.setAttribute('data-theme', current === 'dark' ? 'light' : 'dark');
  if (state.cy) state.cy.style(getCyStyle());
});

// Export buttons
document.getElementById('exportJson').addEventListener('click', exportJSON);
document.getElementById('exportImg').addEventListener('click', exportPNG);

// Example presets (NFA tab)
document.querySelectorAll('.ex-btn[data-example]').forEach(btn => {
  btn.addEventListener('click', () => {
    const ex = AE.NFA_EXAMPLES[btn.dataset.example];
    if (!ex) return;
    document.getElementById('nfa-states').value = ex.states;
    document.getElementById('nfa-alphabet').value = ex.alphabet;
    document.getElementById('nfa-start').value = ex.start;
    document.getElementById('nfa-finals').value = ex.finals;
    document.getElementById('nfa-transitions').value = ex.transitions;
    showToast(`Loaded example: ${btn.textContent}`, '');
  });
});

// Regex quick-load
document.querySelectorAll('.ex-btn[data-regex]').forEach(btn => {
  btn.addEventListener('click', () => {
    document.getElementById('regex-input').value = btn.dataset.regex;
    showToast(`Loaded: ${btn.dataset.regex}`, '');
  });
});

/* ─────────────────────────────────────────────────────
   LIVE TABLE — update preview while user edits inputs
───────────────────────────────────────────────────── */

(function attachLiveTableListeners() {
  // IDs of all fields that feed the NFA definition
  const fieldIds = ['nfa-states', 'nfa-alphabet', 'nfa-start', 'nfa-finals', 'nfa-transitions'];

  // Debounce so we don't re-parse on every keystroke
  let liveTimer = null;
  function onNfaInputChange() {
    clearTimeout(liveTimer);
    liveTimer = setTimeout(() => {
      const { nfa, error } = AE.parseNFAInput();
      if (!error && nfa) {
        // Update live preview only — don't stomp state.nfa here,
        // that stays reserved for explicit "Build NFA" clicks.
        renderNFATable(nfa, 'nfa-table-preview',
          'Start typing or click <strong>Build NFA</strong> to see the table.');
        // Show a soft status hint
        document.getElementById('nfa-status').textContent =
          `Preview: ${nfa.states.size} states · ${nfa.alphabet.size} symbols (click Build NFA to confirm)`;
      } else {
        // Silently show placeholder if parse fails mid-edit
        renderNFATable(null, 'nfa-table-preview',
          'Start typing or click <strong>Build NFA</strong> to see the table.');
        document.getElementById('nfa-status').textContent = 'Ready';
      }
    }, 350);   // 350 ms debounce — responsive but not spammy
  }

  fieldIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('input', onNfaInputChange);
      el.addEventListener('change', onNfaInputChange);
    }
  });
})();


initCytoscape();
showVizPlaceholder(true);
updateStepCounter();
showToast('Welcome! Build an NFA or enter a Regex to begin.', '');
