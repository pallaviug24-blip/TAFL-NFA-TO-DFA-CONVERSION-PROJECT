# Automata Visualizer
### NFA · DFA · Minimization · Regex Converter

An interactive, browser-based tool for learning and exploring finite automata theory.

---

## Features

| Feature | Description |
|---|---|
| **NFA Input** | Define states, alphabet, transitions (incl. ε), start & final states |
| **NFA → DFA** | Full subset construction with step-by-step explanation |
| **DFA Minimization** | Hopcroft/table-filling partition refinement |
| **Regex → NFA → DFA → Min** | Thompson's construction pipeline |
| **Graph Visualization** | Cytoscape.js interactive graphs for NFA, DFA, Min DFA |
| **Transition Tables** | Side-by-side NFA / DFA / Min DFA tables |
| **Step-by-step Mode** | Animated walkthrough with auto-play |
| **Export** | Download DFA as JSON or graph as PNG |
| **Dark / Light Mode** | Toggle theme |

---

## How to Run

### Option 1 — Open directly in browser
```
Just open index.html in any modern browser.
No build step required — it's pure HTML/CSS/JS.
```

### Option 2 — Local HTTP server (recommended)
```bash
# Python 3
python -m http.server 8080

# Node.js (npx)
npx serve .

# Then open: http://localhost:8080
```

---

## File Structure

```
automata-visualizer/
├── index.html     ← Main HTML (tabs, panels, layout)
├── style.css      ← All styles (dark/light theme, Cytoscape container)
├── automata.js    ← Core algorithms (NFA, DFA, minimization, Thompson's)
├── ui.js          ← UI controller (Cytoscape rendering, buttons, steps)
└── README.md
```

---

## Usage Guide

### Tab 1 — NFA Input
1. Enter comma-separated **States** (e.g. `q0,q1,q2,q3`)
2. Enter **Alphabet** symbols (e.g. `a,b`)
3. Set **Start State** and **Final States**
4. Add **Transitions** one per line: `state,symbol,nextState`
   - Use `ε` for epsilon transitions
5. Click **Build NFA** → **Convert to DFA** → **Minimize DFA**

### Tab 2 — Regex Input
- Enter a regular expression (e.g. `(a|b)*abb`)
- Supported operators: `|` `*` `+` `?` `( )`
- Click **Convert Regex** to run the full pipeline

### Tab 3 — Visualize
- Switch between **NFA Graph**, **DFA Graph**, **Minimized DFA** graph
- Use **Fit** / **Layout** buttons to reorganize

### Tab 4 — Steps
- Select step type (Subset Construction or Minimization)
- Use **Prev / Next** or **Auto Play** with speed control

### Tab 5 — Tables
- Side-by-side NFA, DFA, and Minimized DFA transition tables

---

## Example NFAs (built-in)

| Name | Description | Language |
|---|---|---|
| ends with abb | NFA with 4 states | Strings ending in `abb` |
| (a\|b)* | NFA with ε-transitions | All strings over {a,b} |
| ε-NFA | Epsilon closure demo | a*b* |

---

## Algorithms

- **ε-closure**: BFS over ε-transitions from a state set
- **Subset Construction**: Classic powerset construction (NFA → DFA)
- **DFA Minimization**: Partition refinement (Hopcroft-style)
- **Thompson's Construction**: Recursive regex → NFA fragment composition
- **Regex Parser**: Recursive descent parser supporting `|`, `*`, `+`, `?`, `()`
