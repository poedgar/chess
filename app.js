(() => {
  const STORAGE_KEY = 'chess-classics-library-v1';
  const PREFS_KEY = 'chess-classics-prefs-v1';
  const EVALS_KEY = 'chess-classics-evals-v1';
  const LIVE_DEPTH = 20;    // live analysis of the current position
  const ANALYZE_DEPTH = 16; // per position when analysing a whole game
  const CHECK_DEPTH = 14;   // quick check of a guess in Guess the move / training
  const CLOSE_ENOUGH = 0.08; // a guess within this much winning chance of the target move counts as good
  const REVIEW_KEY = 'chess-classics-review-v1';
  const REVIEW_DAYS = [1, 3, 7, 16, 35]; // spaced-review intervals; a card is learned after the last one
  const DAY = 24 * 60 * 60 * 1000;
  const ENGINE_ERROR = 'Engine unavailable. It loads from the internet, so check your connection.';
  const GLYPHS = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
  const FILES = 'abcdefgh';
  const icon = (d) => `<svg viewBox="0 0 24 24" class="w-5 h-5 mx-auto" fill="currentColor">${d}</svg>`;
  const PLAY_ICON = icon('<path d="M7 5v14l11-7z"/>');
  const PAUSE_ICON = icon('<path d="M7 5h4v14H7zM13 5h4v14h-4z"/>');
  const { MOVE_NAGS, POS_NAGS } = PGN;
  const MOVE_NAG_ORDER = [3, 1, 5, 6, 2, 4];
  const POS_NAG_ORDER = [10, 13, 14, 15, 16, 17, 18, 19];
  const NAG_LABELS = { 3: 'Brilliant', 1: 'Good move', 5: 'Interesting', 6: 'Inaccuracy', 2: 'Mistake', 4: 'Blunder',
    10: 'Equal', 13: 'Unclear', 14: 'White is slightly better', 15: 'Black is slightly better',
    16: 'White is better', 17: 'Black is better', 18: 'White is winning', 19: 'Black is winning' };

  const $ = (sel) => document.querySelector(sel);
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  // ---------- storage ----------
  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
      catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
    }
  };

  let library = store.get(STORAGE_KEY, null) || structuredClone(window.DEFAULT_GAMES);
  const prefs = Object.assign({ lastId: null, quizSide: 'w', engine: false, quizCat: 'all' }, store.get(PREFS_KEY, {}));
  const saveLibrary = () => store.set(STORAGE_KEY, library);
  const savePrefs = () => store.set(PREFS_KEY, prefs);

  // ---------- state ----------
  // The game is a move tree (see pgn.js). children[0] continues the current
  // line; any further children are alternative moves from that position.
  const S = {
    game: null,       // library entry
    root: null,       // tree root (start position, holds the introduction)
    node: null,       // current position
    nodes: new Map(), // id -> node, for clicks in the move list
    orientation: 'w',
    mode: 'replay',
    playing: null,    // autoplay interval
    selected: null,   // selected square on the board
    wrong: null,      // quiz: [from, to] of last wrong try
    hinted: false,
    score: { points: 0, tries: 0 },
    timer: null,      // quiz: pending opponent reply
    checking: false,  // a guess is being checked by the engine
    trainer: null,    // puzzle / review session, see startTrainer()
    promo: null,      // pending promotion { from, to }
    // Engine evaluations by position, always from White's point of view:
    // fenKey -> { score: { cp } | { mate }, depth, pv: [uci] }
    evals: new Map(Object.entries(store.get(EVALS_KEY, {}))),
    live: null,       // { node, score, depth, pv } shown in the engine panel
    engineState: 'off', // off | loading | ready | error
    analyzing: false,
    analyzingAll: false, // analysing the whole library (for puzzles), not just the open game
    analyzeMsg: '',
    allMsg: ''           // progress of the whole-library analysis, shown in the Puzzles panel
  };
  // Spaced review cards and solved puzzles: { cards: { id: card }, solved: { puzzleId: true } }
  const review = Object.assign({ cards: {}, solved: {} }, store.get(REVIEW_KEY, {}));
  const saveReview = () => store.set(REVIEW_KEY, review);
  let nextId = 1;

  const emptyTree = () => PGN.buildTree(Chess, PGN.parsePgn('').root);
  const index = (node) => {
    node.id = nextId++;
    S.nodes.set(node.id, node);
    node.children.forEach(index);
  };

  function loadGame(id) {
    stopAutoplay();
    clearTimeout(S.timer);
    if (S.analyzing && !S.analyzingAll) { S.analyzing = false; Engine.stop(); }
    S.analyzeMsg = '';
    S.live = null;
    const game = library.find((g) => g.id === id) || library[0];
    let root = emptyTree();
    if (game) {
      try { root = PGN.buildTree(Chess, PGN.parsePgn(game.pgn).root); }
      catch (err) { alert(`Could not load "${title(game)}": ${err.message}`); }
    }
    S.nodes = new Map();
    index(root);
    Object.assign(S, {
      game: game || null, root, node: root,
      selected: null, wrong: null, hinted: false,
      score: { points: 0, tries: 0 },
      orientation: S.mode === 'quiz' ? prefs.quizSide : 'w'
    });
    if (game) { prefs.lastId = game.id; savePrefs(); }
    renderLibrary();
    render();
    if (S.mode === 'quiz') quizStep();
  }

  function saveTree() {
    S.game.pgn = PGN.toPgn(S.root, S.game.result);
    saveLibrary();
  }

  const title = (g) => `${g.white} vs ${g.black}`;
  const mainLine = () => PGN.mainLine(S.root);
  const isMain = (node) => {
    for (let n = node; n.parent; n = n.parent) if (n.parent.children[0] !== n) return false;
    return true;
  };
  // Last game position this node shares with the main line.
  const mainAncestor = (node) => {
    let n = node;
    while (!isMain(n)) n = n.parent;
    return n;
  };
  const moveLabel = (n) => `${Math.ceil(n.ply / 2)}${n.ply % 2 ? '.' : '...'} ${n.san}`;
  const qualityNag = (n) => n.nags && n.nags.find((x) => MOVE_NAGS[x]);
  const posNag = (n) => n.nags && n.nags.find((x) => POS_NAGS[x]);

  // ---------- evaluations ----------
  const fenKey = (fen) => fen.split(' ').slice(0, 4).join(' ');

  // Finished positions are scored directly, without asking the engine.
  function terminalFen(fen) {
    const c = new Chess(fen);
    return c.in_checkmate() ? { score: { mate: 0, winner: c.turn() === 'w' ? 'b' : 'w' }, depth: 99, pv: [] }
      : c.game_over() ? { score: { cp: 0 }, depth: 99, pv: [] } : null;
  }
  function terminal(node) {
    if (!('term' in node)) node.term = terminalFen(node.fen);
    return node.term;
  }
  const evalOf = (node) => terminal(node) || S.evals.get(fenKey(node.fen)) || null;

  // White's winning chances in [-1, 1] (the curve lichess uses).
  const winChance = (s) => s.mate !== undefined
    ? (s.mate === 0 ? (s.winner === 'w' ? 1 : -1) : Math.sign(s.mate))
    : 2 / (1 + Math.exp(-0.00368208 * s.cp)) - 1;
  const fmtScore = (s) => s.mate !== undefined
    ? (s.mate === 0 ? (s.winner === 'w' ? '1-0' : '0-1') : `${s.mate > 0 ? '+' : '−'}M${Math.abs(s.mate)}`)
    : `${s.cp >= 0 ? '+' : '−'}${(Math.abs(s.cp) / 100).toFixed(1)}`;

  // Engine scores are from the side to move; store them from White's side.
  function fromEngine(info, fen) {
    const sign = fen.split(' ')[1] === 'b' ? -1 : 1;
    const score = info.score.mate !== undefined ? { mate: info.score.mate * sign } : { cp: info.score.cp * sign };
    return { score, depth: info.depth, pv: info.pv.slice(0, 12) };
  }

  let evalsSaveTimer = null;
  function storeEval(fen, e) {
    const key = fenKey(fen);
    const old = S.evals.get(key);
    if (old && old.depth > e.depth) return;
    S.evals.set(key, e);
    clearTimeout(evalsSaveTimer);
    evalsSaveTimer = setTimeout(() => store.set(EVALS_KEY, Object.fromEntries(S.evals)), 1000);
  }

  // Evaluation of any position, asking the engine when nothing deep enough is stored.
  async function evalFen(fen, depth = CHECK_DEPTH) {
    const term = terminalFen(fen);
    if (term) return term;
    const known = S.evals.get(fenKey(fen));
    if (known && known.depth >= depth) return known;
    await Engine.start();
    const info = await Engine.analyse(fen, { depth });
    if (!info) throw new Error('Engine search was interrupted');
    const e = fromEngine(info, fen);
    storeEval(fen, e);
    return e;
  }

  // Is the position after my move about as good for the mover as after the target move?
  async function closeEnough(myFen, targetFen, mover) {
    const mine = await evalFen(myFen);
    const target = await evalFen(targetFen);
    const loss = (mover === 'w' ? 1 : -1) * (winChance(target.score) - winChance(mine.score));
    return { close: loss <= CLOSE_ENOUGH, mine: mine.score, target: target.score };
  }

  const fenAfter = (fen, san) => { const c = new Chess(fen); c.move(san); return c.fen(); };
  const labelAt = (ply, san) => `${Math.ceil(ply / 2)}${ply % 2 ? '.' : '...'} ${san}`;

  function uciToSan(fen, uci) {
    const m = new Chess(fen).move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
    return m ? m.san : uci;
  }

  function pvText(node, pv, max) {
    const c = new Chess(node.fen);
    const out = [];
    let ply = node.ply;
    for (const uci of pv.slice(0, max)) {
      const m = c.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] });
      if (!m) break;
      ply++;
      out.push(ply % 2 ? `${Math.ceil(ply / 2)}. ${m.san}` : out.length ? m.san : `${ply / 2}... ${m.san}`);
    }
    return out.join(' ');
  }

  // How much the move changed the mover's winning chances, judged by the engine.
  function engineVerdict(node) {
    if (!node.parent) return null;
    const before = evalOf(node.parent);
    const after = evalOf(node);
    if (!before || !after) return null;
    const mover = node.ply % 2 ? 1 : -1;
    const loss = mover * (winChance(before.score) - winChance(after.score));
    const best = before.pv && before.pv[0];
    const playedBest = best && best.slice(0, 4) === node.from + node.to;
    let nag = null;
    if (!playedBest) nag = loss >= 0.3 ? 4 : loss >= 0.2 ? 2 : loss >= 0.1 ? 6 : null;
    return { before, after, nag, best: playedBest ? null : best };
  }

  // The mark shown for a move: your own annotation wins over the engine's.
  function markOf(node) {
    const q = qualityNag(node);
    if (q) return { nag: q, engine: false };
    if (S.mode !== 'replay') return null;
    const v = engineVerdict(node);
    return v && v.nag ? { nag: v.nag, engine: true } : null;
  }

  function appendNags(target, node) {
    const mark = markOf(node);
    if (mark) {
      const n = el('span', `nag q-${mark.nag}${mark.engine ? ' engine' : ''}`, MOVE_NAGS[mark.nag]);
      n.title = `${mark.engine ? 'Engine: ' : ''}${NAG_LABELS[mark.nag]}`;
      target.appendChild(n);
    }
    const p = posNag(node);
    if (p) {
      const n = el('span', 'nag pos', POS_NAGS[p]);
      n.title = NAG_LABELS[p];
      target.appendChild(n);
    }
  }

  // ---------- openings and the library index ----------
  // Positions are compared without the en-passant field, so transpositions match.
  const posKey = (fen) => fen.split(' ').slice(0, 3).join(' ');
  const OPENING_BY_POS = new Map();
  window.OPENINGS.forEach(([eco, name, moves]) => {
    try {
      const line = PGN.mainLine(PGN.buildTree(Chess, PGN.parsePgn(moves).root));
      OPENING_BY_POS.set(posKey(line[line.length - 1].fen), { eco, name });
    } catch (err) { console.warn(`Opening "${name}": ${err.message}`); }
  });

  // The deepest named opening on the way to this position.
  function openingAt(node) {
    for (let n = node; n; n = n.parent) {
      const o = OPENING_BY_POS.get(posKey(n.fen));
      if (o) return o;
    }
    return null;
  }

  // Main lines of every library game, rebuilt only when a game's PGN changes.
  const libIndex = new Map(); // game id -> { pgn, line: [root, ...main line], opening }
  function indexOf(game) {
    let entry = libIndex.get(game.id);
    if (!entry || entry.pgn !== game.pgn) {
      let line = [];
      try {
        const root = PGN.buildTree(Chess, PGN.parsePgn(game.pgn).root);
        line = [root, ...PGN.mainLine(root)];
      } catch { /* an invalid game simply has no positions */ }
      const named = line.length ? openingAt(line[line.length - 1]) : null;
      entry = { pgn: game.pgn, line, opening: named };
      libIndex.set(game.id, entry);
    }
    return entry;
  }
  // The open game uses its live tree, so unsaved positions and evaluations line up.
  const lineOf = (game) => (S.game && game.id === S.game.id ? [S.root, ...mainLine()] : indexOf(game).line);

  // Other library games that reached this position, grouped by the move they played next.
  function explorerRows(node) {
    const key = posKey(node.fen);
    const rows = new Map();
    library.forEach((g) => {
      if (S.game && g.id === S.game.id) return;
      const line = indexOf(g).line;
      const i = line.findIndex((n) => posKey(n.fen) === key);
      if (i < 0) return;
      const next = line[i + 1];
      const label = next ? labelAt(next.ply, next.san) : 'Game ended here';
      if (!rows.has(label)) rows.set(label, []);
      rows.get(label).push({ game: g, ply: i });
    });
    return [...rows.entries()].sort((a, b) => b[1].length - a[1].length);
  }

  function openGameAt(id, ply) {
    if (S.mode !== 'replay') setMode('replay');
    loadGame(id);
    goTo([S.root, ...mainLine()][ply] || S.root);
  }

  const training = () => S.mode === 'puzzle' || S.mode === 'review' || S.mode === 'quizzes';

  // ---------- rendering ----------
  function render() {
    renderBoard();
    renderInfo();
    renderNote();
    renderMoves();
    renderVarBar();
    renderQuiz();
    renderEngine();
    renderEvalGraph();
    renderExplorer();
    renderTrainer();
    $('#nav-bar').classList.toggle('opacity-40', training());
    requestLive();
  }

  function renderExplorer() {
    const show = !!S.game && S.mode === 'replay';
    $('#explorer-card').classList.toggle('hidden', !show);
    if (!show) return;
    const o = openingAt(S.node);
    $('#opening-name').textContent = o ? o.name : S.node === S.root ? 'Starting position' : 'No named opening yet';
    $('#opening-eco').textContent = o ? o.eco : '';
    const rows = explorerRows(S.node);
    const list = $('#explorer-list');
    if (!rows.length) {
      list.replaceChildren(el('p', 'text-xs text-slate-500', 'No other game in your library reached this position.'));
      return;
    }
    const count = rows.reduce((n, [, hits]) => n + hits.length, 0);
    list.replaceChildren(el('p', 'text-xs text-slate-400', `${count} other game${count === 1 ? '' : 's'} in your library reached this position:`));
    rows.forEach(([label, hits]) => {
      const row = el('div', 'flex items-baseline gap-2 text-sm');
      row.appendChild(el('span', 'font-mono text-sky-200 shrink-0 w-20', label));
      const games = el('div', 'flex flex-col min-w-0');
      hits.forEach(({ game, ply }) => {
        const b = el('button', 'truncate text-left text-slate-300 hover:text-amber-400 hover:underline', `${title(game)}${game.year ? `, ${game.year}` : ''}`);
        b.title = 'Open this game at this position';
        b.addEventListener('click', () => openGameAt(game.id, ply));
        games.appendChild(b);
      });
      row.appendChild(games);
      list.appendChild(row);
    });
  }

  function renderBoard() {
    const board = $('#board');
    board.replaceChildren();
    const node = S.node;
    const chess = new Chess(node.fen);
    const grid = chess.board(); // grid[0] is rank 8
    const turn = chess.turn();
    let checkSq = null;
    if (chess.in_check()) {
      grid.forEach((row, r) => row.forEach((p, f) => {
        if (p && p.type === 'k' && p.color === turn) checkSq = FILES[f] + (8 - r);
      }));
    }
    const targets = S.selected
      ? chess.moves({ square: S.selected, verbose: true }).map((m) => m.to)
      : [];

    for (let i = 0; i < 64; i++) {
      const r = S.orientation === 'w' ? Math.floor(i / 8) : 7 - Math.floor(i / 8);
      const f = S.orientation === 'w' ? i % 8 : 7 - (i % 8);
      const sq = FILES[f] + (8 - r);
      const piece = grid[r][f];
      const cell = el('div', `sq ${(r + f) % 2 ? 'dark' : 'light'}`);
      cell.dataset.sq = sq;
      if (node.from && (sq === node.from || sq === node.to)) cell.classList.add('last');
      if (sq === checkSq) cell.classList.add('check');
      if (sq === S.selected) cell.classList.add('sel');
      if (S.wrong && S.wrong.includes(sq)) cell.classList.add('wrong');
      if (targets.includes(sq)) cell.classList.add('target', piece ? 'occupied' : 'empty');
      if (piece) cell.appendChild(el('span', `piece ${piece.color}`, GLYPHS[piece.type] + '︎'));
      if (sq === node.to) {
        const mark = markOf(node);
        if (mark) cell.appendChild(el('span', `badge q-${mark.nag}`, MOVE_NAGS[mark.nag]));
      }
      if (i >= 56) cell.appendChild(el('span', 'coord file', FILES[f]));
      if (i % 8 === 0) cell.appendChild(el('span', 'coord rank', String(8 - r)));
      board.appendChild(cell);
    }

    const g = S.game;
    const label = (name, color) => {
      const wrap = el('span', 'inline-flex items-center gap-2');
      wrap.appendChild(el('span', `inline-block w-3 h-3 rounded-full ring-1 ring-slate-500 ${color === 'w' ? 'bg-white' : 'bg-slate-950'}`));
      wrap.appendChild(el('span', '', name || ''));
      return wrap;
    };
    const top = S.orientation === 'w' ? 'b' : 'w';
    $('#top-player').replaceChildren(label(g ? (top === 'w' ? g.white : g.black) : '', top));
    $('#bottom-player').replaceChildren(label(g ? (top === 'w' ? g.black : g.white) : '', top === 'w' ? 'b' : 'w'));

    const main = isMain(node);
    let status = `${turn === 'w' ? 'White' : 'Black'} to move`;
    if (chess.in_checkmate()) status = 'Checkmate';
    else if (chess.in_stalemate()) status = 'Stalemate';
    else if (main && node !== S.root && !node.children.length && g) status = `Final position · ${g.result}`;
    $('#turn').textContent = status;
    const total = mainLine().length;
    $('#ply-label').textContent = !total || training() ? '' : main ? `Move ${node.ply} / ${total}` : 'Alternative line';
  }

  function renderInfo() {
    const g = S.game;
    $('#g-title').textContent = g ? title(g) : 'No games yet';
    // The opening name and tags could give away a puzzle or quiz answer.
    const hide = training();
    $('#g-meta').textContent = g
      ? [g.event, g.year, hide ? '' : g.opening, g.result].filter(Boolean).join(' · ')
      : 'Add a game to get started.';
    $('#g-tags').replaceChildren(...((g && !hide && g.tags) || []).map((t) =>
      el('span', 'text-[11px] bg-slate-700/80 text-slate-300 rounded-full px-2 py-0.5', t)));
    $('#btn-edit-game').disabled = $('#btn-delete-game').disabled = !g;
  }

  function renderNote() {
    $('#note-card').classList.toggle('hidden', training());
    const node = S.node;
    const main = isMain(node);
    const titleEl = $('#note-title');
    titleEl.textContent = node === S.root ? 'Introduction' : moveLabel(node);
    if (node !== S.root) {
      appendNags(titleEl, node);
      const mark = markOf(node);
      const label = [mark && !mark.engine ? NAG_LABELS[mark.nag] : '', main ? '' : 'alternative'].filter(Boolean).join(' · ');
      if (label) titleEl.appendChild(el('span', 'ml-2 text-xs font-normal text-slate-400', label));
    }
    renderVerdict();
    renderNagEditor();
    const p = $('#note-text');
    if (node.comment) {
      p.textContent = node.comment;
      p.className = 'mt-2 text-sm leading-relaxed whitespace-pre-line text-slate-100';
    } else {
      p.textContent = node === S.root
        ? 'No introduction yet. Use the arrows or ← → keys to step through the game.'
        : 'No commentary for this move. Click ✎ Edit to add your own notes.';
      p.className = 'mt-2 text-sm leading-relaxed whitespace-pre-line text-slate-500 italic';
    }
    $('#note-editor').classList.add('hidden');
    p.classList.remove('hidden');
    $('#btn-edit-note').classList.toggle('invisible', !S.game);

    // Every move already recorded from this position, so alternatives are easy to find.
    const kids = S.mode === 'quiz' ? [] : node.children;
    $('#branches').classList.toggle('hidden', kids.length < 2);
    $('#branch-list').replaceChildren(...(kids.length < 2 ? [] : kids.map((child, i) => {
      const b = el('button', `text-sm font-mono rounded px-2 py-1 ${i === 0 ? 'bg-slate-600 hover:bg-slate-500' : 'bg-sky-900/70 hover:bg-sky-800 text-sky-100'}`,
        moveLabel(child));
      if (i === 0) b.appendChild(el('span', 'ml-1 text-[10px] text-slate-300 font-sans', isMain(child) ? 'game' : 'main'));
      b.addEventListener('click', () => goTo(child));
      return b;
    })));
  }

  function renderVerdict() {
    const p = $('#engine-verdict');
    const v = S.mode === 'replay' && S.node.parent ? engineVerdict(S.node) : null;
    p.classList.toggle('hidden', !v);
    if (!v) return;
    p.replaceChildren(el('span', 'text-slate-400', `Engine: ${fmtScore(v.before.score)} → ${fmtScore(v.after.score)}`));
    if (v.nag) {
      p.appendChild(el('span', `nag q-${v.nag} ml-2`, `${MOVE_NAGS[v.nag]} ${NAG_LABELS[v.nag]}`));
      if (v.best) {
        const ply = S.node.ply;
        const best = `${Math.ceil(ply / 2)}${ply % 2 ? '.' : '...'} ${uciToSan(S.node.parent.fen, v.best)}`;
        const b = el('button', 'ml-2 text-sky-300 hover:underline', `Best was ${best}`);
        b.title = 'Show the better move on the board';
        b.addEventListener('click', () => {
          goTo(S.node.parent);
          playMove({ from: v.best.slice(0, 2), to: v.best.slice(2, 4), promotion: v.best[4] });
        });
        p.appendChild(b);
      }
    }
  }

  function renderNagEditor() {
    const node = S.node;
    const show = !!S.game && node !== S.root && S.mode === 'replay';
    $('#nag-editor').classList.toggle('hidden', !show);
    if (!show) return;
    const chip = (n, glyphs) => {
      const b = el('button', `nag-btn${MOVE_NAGS[n] ? ` q-${n}` : ''}${node.nags.includes(n) ? ' on' : ''}`, glyphs[n]);
      b.title = NAG_LABELS[n];
      b.addEventListener('click', () => toggleNag(n));
      return b;
    };
    $('#nag-move').replaceChildren(...MOVE_NAG_ORDER.map((n) => chip(n, MOVE_NAGS)));
    $('#nag-pos').replaceChildren(...POS_NAG_ORDER.map((n) => chip(n, POS_NAGS)));
  }

  // One move-quality mark and one position mark per move; clicking again clears it.
  function toggleNag(n) {
    const node = S.node;
    const group = MOVE_NAGS[n] ? MOVE_NAGS : POS_NAGS;
    const had = node.nags.includes(n);
    node.nags = node.nags.filter((x) => !group[x]);
    if (!had) node.nags.push(n);
    saveTree();
    renderBoard();
    renderNote();
    renderMoves();
  }

  function moveSpan(node, text) {
    const span = el('span', 'mv', text);
    appendNags(span, node);
    if (node.comment) { span.classList.add('has-note'); span.title = node.comment; }
    if (node === S.node) span.classList.add('cur');
    span.dataset.id = node.id;
    return span;
  }

  // An alternative line written inline: "11... Qe7 12. Nf3 (12. Bd3 Qf6) 12... Nf6".
  function inlineLine(first, out) {
    out.appendChild(moveSpan(first, moveLabel(first)));
    let needNum = false;
    for (let node = first; node.children.length; ) {
      const [main, ...alts] = node.children;
      out.appendChild(moveSpan(main, main.ply % 2 || needNum ? moveLabel(main) : main.san));
      needNum = false;
      alts.forEach((alt) => {
        out.appendChild(el('span', 'num', '('));
        inlineLine(alt, out);
        out.appendChild(el('span', 'num', ')'));
        needNum = true;
      });
      node = main;
    }
  }

  function renderMoves() {
    const box = $('#moves');
    box.replaceChildren();
    if (training()) {
      box.appendChild(el('p', 'text-slate-500 font-sans text-sm', 'Moves are hidden while you train.'));
      return;
    }
    const quiz = S.mode === 'quiz'; // only show the moves already played, so the list gives nothing away
    const grid = el('div', 'grid grid-cols-[2.5rem_1fr_1fr] gap-y-0.5 items-center');
    const num = (n) => el('span', 'text-slate-500 text-right pr-2', `${Math.ceil(n.ply / 2)}.`);

    let prev = S.root;
    let rowOpen = false; // a white move is waiting for black's reply in this row
    while (prev.children.length && !(quiz && prev === S.node)) {
      const [main, ...alts] = prev.children;
      if (main.ply % 2) { grid.appendChild(num(main)); grid.appendChild(moveSpan(main, main.san)); rowOpen = true; }
      else {
        if (!rowOpen) { grid.appendChild(num(main)); grid.appendChild(el('span', 'text-slate-500 px-1', '…')); }
        grid.appendChild(moveSpan(main, main.san));
        rowOpen = false;
      }
      if (alts.length) {
        if (rowOpen) grid.appendChild(el('span', 'text-slate-500 px-1', '…'));
        const block = el('div', 'col-span-3 var-block my-1 ml-3 pl-2 space-y-0.5 text-[13px] text-sky-200/90');
        alts.forEach((alt) => {
          const line = el('div', 'var-line leading-relaxed');
          inlineLine(alt, line);
          block.appendChild(line);
        });
        grid.appendChild(block);
        rowOpen = false;
      }
      prev = main;
    }
    if (rowOpen) grid.appendChild(el('span'));
    box.appendChild(grid);
    if (S.game && S.root.children.length && !(quiz && S.node.children.length)) box.appendChild(el('div', 'mt-2 text-center text-slate-400', S.game.result));
    const cur = box.querySelector('.cur');
    if (cur) cur.scrollIntoView({ block: 'nearest' });
    else box.scrollTop = 0;
  }

  function renderVarBar() {
    const bar = $('#var-bar');
    const show = S.mode === 'replay' && !!S.game;
    bar.classList.toggle('hidden', !show);
    bar.classList.toggle('flex', show);
    if (!show) return;
    const inVariation = !isMain(S.node);
    $('#var-label').textContent = inVariation
      ? 'You are in an alternative line.'
      : 'Tip: play any move on the board to explore an alternative.';
    $('#var-label').className = inVariation ? 'text-sky-300' : 'text-slate-400 text-xs';
    $('#btn-mainline').classList.toggle('hidden', !inVariation);
    // The last game move can be removed too, e.g. moves added after the game ended.
    $('#btn-del-line').classList.toggle('hidden', !inVariation && (S.node === S.root || S.node.children.length > 0));
  }

  function renderLibrary() {
    const q = $('#search').value.trim().toLowerCase();
    const list = $('#library');
    list.replaceChildren();
    const matches = library.filter((g) => {
      const named = indexOf(g).opening;
      return [g.white, g.black, g.event, g.year, g.opening, named && named.name, ...(g.tags || [])]
        .join(' ').toLowerCase().includes(q);
    });
    if (!matches.length) list.appendChild(el('li', 'text-sm text-slate-500 px-2 py-3', 'No games found.'));
    matches.forEach((g) => {
      const active = S.game && S.game.id === g.id;
      const li = el('li');
      const btn = el('button', `w-full text-left rounded-lg px-3 py-2 ${active ? 'bg-amber-500/15 ring-1 ring-amber-500/60' : 'hover:bg-slate-700/60'}`);
      btn.appendChild(el('div', 'text-sm font-medium leading-snug', title(g)));
      btn.appendChild(el('div', 'text-xs text-slate-400 mt-0.5', [g.event, g.year].filter(Boolean).join(', ') + (g.result ? ` · ${g.result}` : '')));
      btn.addEventListener('click', () => {
        if (training()) setMode('replay');
        loadGame(g.id);
      });
      li.appendChild(btn);
      list.appendChild(li);
    });
  }

  // ---------- navigation ----------
  function goTo(node) {
    if (!node) return;
    clearTimeout(S.timer);
    hidePromo();
    S.node = node;
    S.selected = null;
    S.wrong = null;
    S.hinted = false;
    render();
    if (S.mode === 'quiz') quizStep();
  }

  const lineEnd = (node) => { while (node.children.length) node = node.children[0]; return node; };
  const nav = {
    first: () => training() || goTo(S.root),
    prev: () => training() || goTo(S.node.parent),
    next: () => training() || goTo(S.node.children[0]),
    last: () => training() || goTo(lineEnd(S.node))
  };

  function stopAutoplay() {
    clearInterval(S.playing);
    S.playing = null;
    $('#btn-play').innerHTML = PLAY_ICON;
  }

  function toggleAutoplay() {
    if (S.playing) return stopAutoplay();
    if (S.mode !== 'replay') setMode('replay');
    if (!S.node.children.length) goTo(S.root);
    $('#btn-play').innerHTML = PAUSE_ICON;
    S.playing = setInterval(() => {
      if (!S.node.children.length) return stopAutoplay();
      goTo(S.node.children[0]);
    }, 1600);
  }

  // ---------- playing moves on the board ----------
  function onBoardClick(e) {
    if (!S.game || S.promo) return;
    const cell = e.target.closest('.sq');
    if (!cell) return;
    if (S.checking) return;
    if (S.mode === 'quiz' && (!S.node.children.length || sideToMove() !== prefs.quizSide)) return;
    if (training() && !(S.trainer && S.trainer.item && !S.trainer.item.options && !S.trainer.done && S.node === S.trainer.node)) return;
    const sq = cell.dataset.sq;
    const chess = new Chess(S.node.fen);

    if (S.selected) {
      const options = chess.moves({ square: S.selected, verbose: true }).filter((m) => m.to === sq);
      if (options.length) {
        const from = S.selected;
        if (options.some((m) => m.promotion)) return showPromo(from, sq, chess.turn());
        return submitMove({ from, to: sq });
      }
    }
    const piece = chess.get(sq);
    S.wrong = null;
    S.selected = piece && piece.color === chess.turn() && S.selected !== sq ? sq : null;
    renderBoard();
  }

  function showPromo(from, to, color) {
    S.promo = { from, to };
    $('#promo-choices').replaceChildren(...['q', 'r', 'b', 'n'].map((p) => {
      const b = el('button', 'w-14 h-14 rounded-lg bg-[#eedfc4] hover:bg-amber-200 flex items-center justify-center');
      const glyph = el('span', `piece ${color}`, GLYPHS[p] + '︎');
      glyph.style.fontSize = '2.6rem';
      b.appendChild(glyph);
      b.addEventListener('click', () => {
        hidePromo();
        submitMove({ from, to, promotion: p });
      });
      return b;
    }));
    $('#promo').classList.replace('hidden', 'flex');
  }

  function hidePromo() {
    S.promo = null;
    $('#promo').classList.replace('flex', 'hidden');
  }

  function submitMove(move) {
    if (S.mode === 'quiz') return tryMove(move.from, move.to, move.promotion);
    if (training()) return trainerMove(move);
    return playMove(move);
  }

  // Follows an existing move if it was already recorded, otherwise adds it as
  // a new alternative from the current position and saves the game.
  function playMove({ from, to, promotion }) {
    const chess = new Chess(S.node.fen);
    const mv = chess.move({ from, to, promotion: promotion || 'q' });
    if (!mv) return;
    const existing = S.node.children.find((c) => c.san === mv.san);
    if (existing) return goTo(existing);
    const node = { san: mv.san, from: mv.from, to: mv.to, fen: chess.fen(), ply: S.node.ply + 1,
      comment: '', nags: [], children: [], parent: S.node };
    S.node.children.push(node);
    index(node);
    saveTree();
    goTo(node);
  }

  function deleteLine() {
    const node = S.node;
    if (!node.parent || (isMain(node) && node.children.length)) return;
    const after = node.children.length ? ' and the moves after it' : '';
    const warning = isMain(node) ? ' It is the last move of the game itself.' : '';
    if (!confirm(`Delete ${moveLabel(node)}${after}?${warning}`)) return;
    const parent = node.parent;
    parent.children = parent.children.filter((c) => c !== node);
    const drop = (n) => { S.nodes.delete(n.id); n.children.forEach(drop); };
    drop(node);
    saveTree();
    goTo(parent);
  }

  // ---------- engine ----------
  function enableEngine(on) {
    prefs.engine = on;
    savePrefs();
    if (!on) {
      clearTimeout(liveTimer);
      if (!S.analyzing) Engine.stop();
      S.live = null;
      renderEngine();
      return;
    }
    if (S.engineState === 'ready') return requestLive();
    S.engineState = 'loading';
    renderEngine();
    Engine.start().then(
      () => { S.engineState = 'ready'; requestLive(); },
      () => { S.engineState = 'error'; renderEngine(); });
  }

  let liveTimer = null;
  function requestLive() {
    clearTimeout(liveTimer);
    if (!prefs.engine || S.mode !== 'replay' || S.analyzing || !S.game) {
      if (!S.analyzing && S.engineState === 'ready') Engine.stop();
      return;
    }
    const node = S.node;
    const known = evalOf(node);
    S.live = { node, ...(known || {}) };
    renderEngine();
    if (S.engineState !== 'ready' || (known && known.depth >= LIVE_DEPTH)) { Engine.stop(); return; }
    // A short delay so stepping quickly through moves doesn't start a search per move.
    liveTimer = setTimeout(() => {
      Engine.analyse(node.fen, {
        depth: LIVE_DEPTH,
        onInfo: (info) => {
          if (S.node !== node || info.depth < (known ? known.depth : 1)) return;
          S.live = { node, ...fromEngine(info, node.fen) };
          renderEngine();
        }
      }).then((info) => {
        if (!info) return;
        storeEval(node.fen, fromEngine(info, node.fen));
        if (S.node === node || S.node.parent === node) refreshEvalViews();
      }, () => { S.engineState = 'error'; renderEngine(); });
    }, 150);
  }

  // Redraws everything that shows evaluations, without restarting the engine.
  function refreshEvalViews() {
    renderBoard();
    renderNote();
    renderMoves();
    renderEngine();
    renderEvalGraph();
  }

  function renderEngine() {
    const quiz = S.mode !== 'replay';
    $('#engine-card').classList.toggle('hidden', quiz || !S.game);
    $('#engine-toggle').checked = prefs.engine;
    const on = prefs.engine && !quiz && !!S.game;
    const live = on && S.live && S.live.node === S.node ? S.live : null;

    let score = '';
    let detail = 'Turn on to see the evaluation and the best move.';
    if (on) {
      if (S.engineState === 'loading') detail = 'Loading Stockfish…';
      else if (S.engineState === 'error') detail = 'Engine unavailable. It loads from the internet, so check your connection.';
      else if (live && live.score) {
        score = fmtScore(live.score);
        detail = live.depth === 99 ? 'Game over' : `depth ${live.depth}`;
      } else detail = S.analyzing ? 'Analysing the game…' : 'Thinking…';
    }
    $('#engine-score').textContent = score;
    $('#engine-depth').textContent = detail;

    $('#eval-bar').classList.toggle('hidden', !on);
    const fill = $('#eval-fill');
    fill.style.height = `${50 + 50 * (live && live.score ? winChance(live.score) : 0)}%`;
    fill.style.top = S.orientation === 'w' ? 'auto' : '0';
    fill.style.bottom = S.orientation === 'w' ? '0' : 'auto';

    const pv = live && live.pv && live.pv.length ? live.pv : null;
    $('#engine-line').classList.toggle('hidden', !pv);
    $('#engine-pv').textContent = pv ? pvText(S.node, pv, 8) : '';
    drawArrow(pv ? pv[0] : null);

    $('#btn-analyze').textContent = S.analyzing && !S.analyzingAll ? 'Stop' : 'Analyze game';
    $('#btn-analyze').disabled = S.analyzingAll;
    $('#analyze-status').classList.toggle('hidden', !S.analyzeMsg || S.analyzingAll);
    $('#analyze-status').textContent = S.analyzeMsg;
  }

  function drawArrow(uci) {
    const layer = $('#arrow-layer');
    if (!uci) { layer.innerHTML = ''; return; }
    const xy = (sq) => {
      const f = FILES.indexOf(sq[0]);
      const r = Number(sq[1]) - 1;
      return S.orientation === 'w' ? [f + 0.5, 7.5 - r] : [7.5 - f, r + 0.5];
    };
    const [x1, y1] = xy(uci.slice(0, 2));
    const [x2, y2] = xy(uci.slice(2, 4));
    const color = 'rgba(56,189,248,.85)';
    layer.innerHTML = `<defs><marker id="arrowhead" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="2.6" markerHeight="2.6" orient="auto">
      <path d="M0,0 L10,5 L0,10 z" fill="${color}"/></marker></defs>
      <line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="0.16" stroke-linecap="round" marker-end="url(#arrowhead)"/>`;
  }

  // Analyses the main line of each game in `games`; returns true when it ran to the end.
  async function runAnalysis(games, onProgress) {
    S.analyzing = true;
    clearTimeout(liveTimer);
    S.analyzeMsg = 'Loading Stockfish…';
    onProgress();
    try { await Engine.start(); }
    catch {
      S.analyzing = false;
      S.analyzeMsg = ENGINE_ERROR;
      onProgress();
      return false;
    }
    for (const [g, game] of games.entries()) {
      const positions = lineOf(game);
      for (let i = 0; i < positions.length; i++) {
        if (!S.analyzing) return false;
        const known = evalOf(positions[i]);
        if (known && known.depth >= ANALYZE_DEPTH) continue;
        S.analyzeMsg = games.length > 1
          ? `Analysing game ${g + 1} of ${games.length} (${title(game)}), position ${i + 1} of ${positions.length}…`
          : `Analysing position ${i + 1} of ${positions.length}…`;
        onProgress(i);
        const info = await Engine.analyse(positions[i].fen, { depth: ANALYZE_DEPTH });
        if (!info) { S.analyzing = false; return false; } // stopped
        storeEval(positions[i].fen, fromEngine(info, positions[i].fen));
      }
    }
    S.analyzing = false;
    return true;
  }

  function stopAnalysis() {
    S.analyzing = false;
    Engine.stop();
  }

  async function analyzeGame() {
    if (S.analyzing) return stopAnalysis();
    const game = S.game;
    if (!game) return;
    const finished = await runAnalysis([game], (i) => {
      if (S.game !== game) return;
      renderEngine();
      renderEvalGraph();
      if (i % 5 === 0) renderMoves();
    });
    if (S.game !== game) return; // another game was opened meanwhile
    if (S.analyzeMsg !== ENGINE_ERROR) S.analyzeMsg = finished ? analysisSummary() : 'Analysis stopped.';
    render();
  }

  const isAnalysed = (game) => lineOf(game).every((n) => { const e = evalOf(n); return e && e.depth >= ANALYZE_DEPTH; });

  // Analyses every game that still needs it, so their mistakes can become puzzles.
  async function analyzeAll() {
    if (S.analyzing) return stopAnalysis();
    const todo = library.filter((g) => !isAnalysed(g));
    if (!todo.length) return;
    S.analyzingAll = true;
    const finished = await runAnalysis(todo, () => { S.allMsg = S.analyzeMsg; renderTrainer(); });
    S.analyzingAll = false;
    S.allMsg = S.analyzeMsg === ENGINE_ERROR ? ENGINE_ERROR
      : finished ? '' : 'Analysis stopped. Puzzles from the games analysed so far are ready.';
    S.analyzeMsg = '';
    if (S.mode === 'puzzle') startTrainer('puzzle');
    else render();
  }

  function analysisSummary() {
    const counts = { w: { 6: 0, 2: 0, 4: 0 }, b: { 6: 0, 2: 0, 4: 0 } };
    mainLine().forEach((n) => {
      const v = engineVerdict(n);
      if (v && v.nag) counts[n.ply % 2 ? 'w' : 'b'][v.nag]++;
    });
    const side = (c) => `${c[6]} inaccurac${c[6] === 1 ? 'y' : 'ies'}, ${c[2]} mistake${c[2] === 1 ? '' : 's'}, ${c[4]} blunder${c[4] === 1 ? '' : 's'}`;
    return `Engine check done. White: ${side(counts.w)}. Black: ${side(counts.b)}. Marks with lighter colour in the move list come from the engine.`;
  }

  // ---------- evaluation graph ----------
  let graphLine = [];
  function renderEvalGraph() {
    const wrap = $('#eval-graph');
    const line = S.game ? [S.root, ...mainLine()] : [];
    const pts = line.map((n, i) => { const e = evalOf(n); return e ? { i, n, w: winChance(e.score) } : null; }).filter(Boolean);
    const show = S.mode === 'replay' && pts.length >= 2;
    wrap.classList.toggle('hidden', !show);
    graphLine = show ? line : [];
    if (!show) return;
    const svg = $('#eval-svg');
    const W = svg.clientWidth || 500;
    const H = svg.clientHeight || 96;
    const N = Math.max(1, line.length - 1);
    const x = (i) => 4 + (i / N) * (W - 8);
    const y = (w) => H / 2 - w * (H / 2 - 6);
    const curve = pts.map((p) => `${x(p.i).toFixed(1)},${y(p.w).toFixed(1)}`).join(' L');
    const area = `M${x(pts[0].i).toFixed(1)},${H} L${curve} L${x(pts[pts.length - 1].i).toFixed(1)},${H} Z`;
    const cur = line.indexOf(mainAncestor(S.node));
    const markers = pts.filter((p) => p.i > 0).map((p) => {
      const v = engineVerdict(p.n);
      return v && (v.nag === 2 || v.nag === 4)
        ? `<circle cx="${x(p.i).toFixed(1)}" cy="${y(p.w).toFixed(1)}" r="4.5" class="q-${v.nag}" style="fill:var(--q)" stroke="#0f172a" stroke-width="2"/>`
        : '';
    }).join('');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    svg.innerHTML = `<rect width="${W}" height="${H}" fill="#0f172a"/>
      <path d="${area}" fill="#e2e8f0" fill-opacity=".88"/>
      <line x1="0" x2="${W}" y1="${H / 2}" y2="${H / 2}" stroke="#64748b" stroke-width="1" stroke-dasharray="3 3"/>
      ${cur >= 0 ? `<line x1="${x(cur)}" x2="${x(cur)}" y1="0" y2="${H}" stroke="#f59e0b" stroke-width="2"/>` : ''}
      <line id="eval-cross" x1="0" x2="0" y1="0" y2="${H}" stroke="#94a3b8" stroke-width="1" visibility="hidden"/>
      ${markers}`;
  }

  function graphIndex(e) {
    const svg = $('#eval-svg');
    const rect = svg.getBoundingClientRect();
    const N = Math.max(1, graphLine.length - 1);
    const i = Math.round(((e.clientX - rect.left - 4) / (rect.width - 8)) * N);
    return { i: Math.max(0, Math.min(N, i)), rect, N };
  }

  function onGraphHover(e) {
    if (!graphLine.length) return;
    const { i, rect, N } = graphIndex(e);
    const node = graphLine[i];
    const ev = evalOf(node);
    const v = engineVerdict(node);
    const tip = $('#eval-tip');
    tip.textContent = `${i === 0 ? 'Start' : moveLabel(node)}   ${ev ? fmtScore(ev.score) : 'not analysed'}${v && v.nag ? `   ${MOVE_NAGS[v.nag]} ${NAG_LABELS[v.nag]}` : ''}`;
    tip.classList.remove('hidden');
    const px = 4 + (i / N) * (rect.width - 8);
    const left = Math.max(0, Math.min(rect.width - tip.offsetWidth, px - tip.offsetWidth / 2));
    tip.style.left = `${left}px`;
    tip.style.top = `${$('#eval-svg').offsetTop - tip.offsetHeight - 4}px`;
    const cross = $('#eval-cross');
    cross.setAttribute('x1', px); cross.setAttribute('x2', px);
    cross.setAttribute('visibility', 'visible');
  }

  function hideGraphHover() {
    $('#eval-tip').classList.add('hidden');
    const cross = $('#eval-cross');
    if (cross) cross.setAttribute('visibility', 'hidden');
  }

  // ---------- modes ----------
  function setMode(mode) {
    // Leaving a training position: go back to the real position in the game.
    if (S.trainer && S.trainer.node) S.node = S.trainer.node;
    S.trainer = null;
    S.mode = mode;
    stopAutoplay();
    clearTimeout(S.timer);
    hidePromo();
    S.selected = null;
    S.wrong = null;
    document.querySelectorAll('.mode-btn').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
    $('#quiz-side-wrap').classList.toggle('hidden', mode !== 'quiz');
    $('#quiz-side-wrap').classList.toggle('flex', mode === 'quiz');
    $('#quiz-panel').classList.toggle('hidden', mode !== 'quiz');
    if (mode === 'quiz') {
      S.score = { points: 0, tries: 0 };
      S.orientation = prefs.quizSide;
      if (S.node) S.node = mainAncestor(S.node); // the quiz follows the game itself
    }
    if (!S.node) return;
    if (training()) return startTrainer(mode);
    render();
    if (mode === 'quiz') quizStep();
  }

  // ---------- puzzles and spaced review ----------
  // A training item is a position from a library game plus the move to find:
  // { id, kind: 'puzzle' | 'game' | 'quiz', gameId, ply, fen, solution (SAN), gameMove?, gameNag? }
  // Quiz items may instead ask a multiple-choice question (options, the first is right).

  // Every move marked ? or ?? (by you or by the engine) whose better move is known.
  function collectPuzzles() {
    const items = [];
    library.forEach((game) => {
      const line = lineOf(game);
      for (let i = 1; i < line.length; i++) {
        const node = line[i];
        const before = evalOf(line[i - 1]);
        const best = before && before.pv && before.pv[0];
        if (!best || best.slice(0, 4) === node.from + node.to) continue;
        const manual = qualityNag(node);
        const v = engineVerdict(node);
        const nag = manual === 2 || manual === 4 ? manual : v && (v.nag === 2 || v.nag === 4) ? v.nag : null;
        if (!nag) continue;
        items.push({ id: `p:${game.id}:${i - 1}`, kind: 'puzzle', gameId: game.id, ply: i - 1, fen: line[i - 1].fen,
          solution: uciToSan(line[i - 1].fen, best), gameMove: node.san, gameNag: nag });
      }
    });
    return items;
  }

  // Leitner boxes: a card moves up a box when you get it right and back to the
  // first box when you miss it. After the last box it counts as learned.
  function addCard(item) {
    review.cards[item.id] = { ...item, box: 0, due: Date.now() + REVIEW_DAYS[0] * DAY };
    saveReview();
    renderModeButtons();
  }

  function gradeCard(id, success) {
    const card = review.cards[id];
    if (!card) return;
    if (!success) card.box = 0;
    else if (card.box + 1 >= REVIEW_DAYS.length) { delete review.cards[id]; saveReview(); return; }
    else card.box++;
    card.due = Date.now() + REVIEW_DAYS[card.box] * DAY;
    saveReview();
  }

  const dueCards = () => Object.values(review.cards).filter((c) => c.due <= Date.now()).sort((a, b) => a.due - b.due);

  function renderModeButtons() {
    const n = dueCards().length;
    const badge = $('#review-count');
    badge.textContent = String(n);
    badge.classList.toggle('hidden', !n);
  }

  function startTrainer(kind) {
    let items;
    if (kind === 'puzzle') {
      // Unsolved puzzles first; the sort is stable, so games keep their order.
      items = collectPuzzles().sort((a, b) => (review.solved[a.id] ? 1 : 0) - (review.solved[b.id] ? 1 : 0));
    } else if (kind === 'quizzes') {
      items = collectQuizzes(prefs.quizCat).sort((a, b) => (review.solved[a.id] ? 1 : 0) - (review.solved[b.id] ? 1 : 0));
    } else items = dueCards();
    S.trainer = { kind, items, i: -1, item: null, node: null, msg: null };
    nextItem();
  }

  function nextItem() {
    const T = S.trainer;
    while (++T.i < T.items.length) if (showItem(T.items[T.i])) return;
    T.item = null;
    render();
  }

  function showItem(item) {
    const game = library.find((g) => g.id === item.gameId);
    const target = game && lineOf(game)[item.ply];
    if (!target || posKey(target.fen) !== posKey(item.fen)) {
      // The game was deleted or edited; this card no longer points anywhere.
      if (review.cards[item.id]) { delete review.cards[item.id]; saveReview(); }
      return false;
    }
    if (!S.game || S.game.id !== game.id) loadGame(game.id);
    const node = [S.root, ...mainLine()][item.ply];
    // Answer options are shown in random order; options[0] is the right one.
    const order = item.options ? item.options.map((_, i) => i) : [];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    Object.assign(S.trainer, { item, node, tries: 0, hinted: false, done: false, msg: null, order, picked: new Set() });
    S.orientation = node.ply % 2 === 0 ? 'w' : 'b';
    goTo(node);
    return true;
  }

  async function trainerMove({ from, to, promotion }) {
    const T = S.trainer;
    const { item, node } = T;
    const chess = new Chess(node.fen);
    const san = chess.move({ from, to, promotion: promotion || 'q' }).san;
    if (san === item.solution) return finishItem(san, 'exact');
    S.selected = null;
    S.wrong = [from, to];
    if (item.kind === 'puzzle' && san === item.gameMove) {
      T.tries++;
      T.msg = { text: `✗ ${san} is the move from the game, the one to improve on. Try another.`, tone: 'text-red-400' };
      renderBoard();
      return renderTrainer();
    }
    if (item.exact) { // the question asks for one specific move, so the engine is not consulted
      T.tries++;
      T.msg = { text: `✗ ${san} is not the move. Try again.`, tone: 'text-red-400' };
      renderBoard();
      return renderTrainer();
    }
    T.msg = { text: `Checking ${san} with the engine…`, tone: 'text-slate-400' };
    renderBoard();
    renderTrainer();
    S.checking = true;
    let cmp = null;
    try { cmp = await closeEnough(chess.fen(), fenAfter(node.fen, item.solution), node.ply % 2 ? 'b' : 'w'); }
    catch { /* engine unavailable: only the exact answer counts */ }
    S.checking = false;
    if (S.trainer !== T || T.item !== item) return;
    if (cmp && cmp.close) return finishItem(san, 'close', cmp);
    T.tries++;
    T.msg = cmp
      ? { text: `✗ ${san} is not good enough (${fmtScore(cmp.mine)}, the best move keeps ${fmtScore(cmp.target)}). Try again.`, tone: 'text-red-400' }
      : { text: `✗ ${san} is not the move. Try again.`, tone: 'text-red-400' };
    renderTrainer();
  }

  // how: 'exact' | 'close' (as good as the answer) | 'shown' (gave up)
  function finishItem(san, how, cmp) {
    const T = S.trainer;
    const { item } = T;
    const success = how !== 'shown' && T.tries === 0 && !T.hinted;
    T.done = true;
    if (T.kind === 'review') gradeCard(item.id, success);
    else if (success) { review.solved[item.id] = true; saveReview(); }
    else addCard(item);

    const ply = T.node.ply + 1;
    const parts = [];
    if (item.options) parts.push(how === 'shown' ? `The answer: ${item.options[0]}.` : '✓ Correct!');
    else if (how === 'exact') parts.push(`✓ ${labelAt(ply, san)} is right!`);
    else if (how === 'close') parts.push(`✓ ${labelAt(ply, san)} works too (${fmtScore(cmp.mine)}). The ${item.kind === 'puzzle' ? "engine's" : 'game'} move was ${labelAt(ply, item.solution)}.`);
    else parts.push(`The answer is ${labelAt(ply, item.solution)}.`);
    if (item.kind === 'puzzle') parts.push(`In the game, ${labelAt(ply, item.gameMove)} was a ${NAG_LABELS[item.gameNag].toLowerCase()}.`);
    if (!success) parts.push(T.kind === 'review' ? 'It comes back tomorrow.' : 'Added to Review, so it comes back tomorrow.');
    else if (T.kind === 'review') {
      const card = review.cards[item.id];
      parts.push(card ? `Next review in ${REVIEW_DAYS[card.box]} days.` : 'Learned! It leaves the review deck.');
    }
    T.msg = { text: parts.join(' '), tone: how === 'shown' ? 'text-amber-300' : 'text-emerald-400' };
    if (!item.options) showTemp(T.node, how === 'shown' ? item.solution : san);
    else if (item.move) showTemp(T.node, item.move); // the move the question was about
    else render();
  }

  function pickChoice(i) {
    const T = S.trainer;
    if (!T || !T.item || T.done || T.picked.has(i)) return;
    if (i === 0) return finishItem(null, 'exact');
    T.tries++;
    T.picked.add(i);
    T.msg = { text: '✗ Not quite. Try again.', tone: 'text-red-400' };
    renderTrainer();
  }

  // Shows a move on the board without adding it to the game.
  function showTemp(parent, san) {
    const c = new Chess(parent.fen);
    const m = c.move(san);
    S.node = { san: m.san, from: m.from, to: m.to, fen: c.fen(), ply: parent.ply + 1,
      comment: '', nags: [], children: [], parent };
    S.selected = null;
    S.wrong = null;
    render();
  }

  function trainerHint() {
    const T = S.trainer;
    if (!T || !T.item || T.item.options || T.done || S.checking) return;
    T.hinted = true;
    S.wrong = null;
    S.selected = new Chess(T.node.fen).move(T.item.solution).from;
    T.msg = { text: 'Hint: the highlighted piece moves.', tone: 'text-amber-300' };
    renderBoard();
    renderTrainer();
  }

  function trainerSolution() {
    const T = S.trainer;
    if (!T || !T.item || T.done || S.checking) return;
    T.tries++;
    finishItem(null, 'shown');
  }

  const whenText = (due) => {
    const hours = Math.max(1, Math.round((due - Date.now()) / 3600000));
    return hours < 20 ? `in about ${hours} hour${hours === 1 ? '' : 's'}` : hours < 36 ? 'tomorrow' : `in ${Math.round(hours / 24)} days`;
  };

  function trainerPrompt(T) {
    const { item, node } = T;
    const game = S.game;
    const side = node.ply % 2 ? 'Black' : 'White';
    const from = `${title(game)}${game.year ? `, ${game.year}` : ''}`;
    if (item.kind === 'quiz') return item.options ? item.question : `${side} to move. ${item.question}`;
    if (item.kind === 'game') return `${side} to move. From ${from}: what did ${node.ply % 2 ? game.black : game.white} play here?`;
    return `${side} to move. In ${from}, ${labelAt(node.ply + 1, item.gameMove)} was a ${NAG_LABELS[item.gameNag].toLowerCase()}. Find a better move.`;
  }

  function trainerEmptyText(T, unanalysed) {
    if (T.kind === 'quizzes') {
      const where = prefs.quizCat === 'all' ? '' : ` in ${QUIZ_LABELS[prefs.quizCat]}`;
      return T.items.length
        ? `You have been through all ${T.items.length} quizzes${where}. Pick a category above to go again.`
        : `No quizzes${where} right now. They are built on the built-in games: use Restore below the library to bring back games you deleted or changed.`;
    }
    if (T.kind === 'puzzle') {
      if (T.items.length) return `You have been through all ${T.items.length} puzzles. Click Puzzles again to go round once more.`;
      return unanalysed
        ? `No puzzles yet. Puzzles come from the mistakes the engine finds, and ${unanalysed} game${unanalysed === 1 ? ' is' : 's are'} not analysed yet. Analysing takes a few minutes.`
        : 'No puzzles: the engine found no mistakes or blunders in your games.';
    }
    const cards = Object.values(review.cards);
    if (T.items.length) return `Review done for now.${cards.length ? ` Next one ${whenText(Math.min(...cards.map((c) => c.due)))}.` : ''}`;
    if (!cards.length) return 'Nothing to review. Moves you miss in Guess the move, and puzzles and quizzes you cannot solve, come back here, spaced out over the following days.';
    return `Nothing due right now. ${cards.length} position${cards.length === 1 ? ' is' : 's are'} waiting; the next one is due ${whenText(Math.min(...cards.map((c) => c.due)))}.`;
  }

  function renderTrainer() {
    renderModeButtons();
    const on = training() && !!S.trainer;
    $('#trainer-panel').classList.toggle('hidden', !on);
    if (!on) return;
    const T = S.trainer;
    const puzzles = T.kind === 'puzzle';
    const quizzes = T.kind === 'quizzes';
    const unanalysed = puzzles ? library.filter((g) => !isAnalysed(g)).length : 0;
    renderQuizCats(quizzes);
    $('#trainer-progress').textContent = T.item
      ? [`${{ puzzle: 'Puzzle', review: 'Review', quizzes: 'Quiz' }[T.kind]} ${T.i + 1} of ${T.items.length}`,
        T.item.kind === 'quiz' ? QUIZ_LABELS[T.item.cat] : '',
        !T.done && T.kind !== 'review' && review.solved[T.item.id] ? 'solved before' : ''].filter(Boolean).join(' · ')
      : '';
    const msg = !T.item ? { text: trainerEmptyText(T, unanalysed), tone: 'text-slate-300' }
      : T.msg || { text: trainerPrompt(T), tone: 'text-slate-300' };
    $('#trainer-msg').textContent = msg.text;
    $('#trainer-msg').className = `mt-1 ${msg.tone}`;
    $('#trainer-status').textContent = puzzles ? S.allMsg || '' : '';
    $('#trainer-status').classList.toggle('hidden', !(puzzles && S.allMsg));
    renderChoices(T);
    const explain = T.item && T.done && T.item.explain;
    $('#trainer-explain').classList.toggle('hidden', !explain);
    $('#trainer-explain').textContent = explain || '';
    $('#btn-t-hint').classList.toggle('hidden', !T.item || T.done || !!T.item.options);
    $('#btn-t-solution').classList.toggle('hidden', !T.item || T.done);
    $('#btn-t-next').classList.toggle('hidden', !T.item);
    $('#btn-t-next').textContent = T.done ? 'Next' : 'Skip';
    const showAnalyze = puzzles && (unanalysed > 0 || S.analyzingAll);
    $('#btn-t-analyze').classList.toggle('hidden', !showAnalyze);
    $('#btn-t-analyze').textContent = S.analyzingAll ? 'Stop analysis'
      : `Analyze ${unanalysed} game${unanalysed === 1 ? '' : 's'} for puzzles`;
  }

  // ---------- quizzes ----------
  // Quizzes (quizzes.js) point at positions in the built-in games. A quiz is
  // offered only while its game is in the library with the same moves up to it.
  const QUIZ_LABELS = Object.fromEntries(window.QUIZ_CATEGORIES);
  const quizPly = (at) => { const m = /^(\d+)(\.|\.\.\.)$/.exec(at); return m ? 2 * Number(m[1]) - (m[2] === '.' ? 2 : 1) : -1; };
  const builtInLines = new Map(); // game id -> [root, ...main line] of the built-in version
  function builtInLine(id) {
    if (!builtInLines.has(id)) {
      const d = window.DEFAULT_GAMES.find((g) => g.id === id);
      let line = [];
      try { if (d) { const root = PGN.buildTree(Chess, PGN.parsePgn(d.pgn).root); line = [root, ...PGN.mainLine(root)]; } }
      catch { /* a broken built-in game has no quizzes */ }
      builtInLines.set(id, line);
    }
    return builtInLines.get(id);
  }

  function collectQuizzes(cat) {
    return window.QUIZZES.filter((q) => cat === 'all' || q.cat === cat).map((q) => {
      const ply = quizPly(q.at);
      const pos = builtInLine(q.game)[ply];
      const game = library.find((g) => g.id === q.game);
      const now = game && lineOf(game)[ply];
      if (!pos || !now || posKey(pos.fen) !== posKey(now.fen)) return null;
      return { id: `q:${q.id}`, kind: 'quiz', cat: q.cat, gameId: q.game, ply, fen: pos.fen, question: q.q,
        solution: q.solution, exact: !!q.exact, options: q.options, move: q.move, explain: q.explain };
    }).filter(Boolean);
  }

  function renderQuizCats(show) {
    const box = $('#quiz-cats');
    box.classList.toggle('hidden', !show);
    if (!show) return;
    const cats = [['all', 'All'], ...window.QUIZ_CATEGORIES];
    box.replaceChildren(...cats.map(([key, label]) => {
      const qs = window.QUIZZES.filter((q) => key === 'all' || q.cat === key);
      const solved = qs.filter((q) => review.solved[`q:${q.id}`]).length;
      const on = prefs.quizCat === key;
      const b = el('button', `rounded-full px-3 py-1 text-xs ${on ? 'bg-amber-500 text-slate-900 font-semibold' : 'bg-slate-700 hover:bg-slate-600 text-slate-200'}`, label);
      b.appendChild(el('span', `ml-1.5 ${on ? 'text-slate-800' : 'text-slate-400'}`, `${solved}/${qs.length}`));
      b.title = `${solved} of ${qs.length} solved on the first try`;
      b.addEventListener('click', () => {
        if (S.checking) return;
        prefs.quizCat = key;
        savePrefs();
        startTrainer('quizzes');
      });
      return b;
    }));
  }

  function renderChoices(T) {
    const box = $('#trainer-choices');
    const item = T.item;
    box.classList.toggle('hidden', !(item && item.options));
    if (!item || !item.options) return box.replaceChildren();
    box.replaceChildren(...T.order.map((i) => {
      const right = T.done && i === 0;
      const wrong = T.picked.has(i);
      const cls = right ? 'bg-emerald-600 text-white font-medium'
        : wrong ? 'bg-red-950/70 text-red-300'
        : T.done ? 'bg-slate-800 text-slate-500' : 'bg-slate-700 hover:bg-slate-600';
      const b = el('button', `text-left rounded px-3 py-1.5 ${cls}`, `${right ? '✓ ' : wrong ? '✗ ' : ''}${item.options[i]}`);
      b.disabled = T.done || wrong;
      b.addEventListener('click', () => pickChoice(i));
      return b;
    }));
  }

  // ---------- guess-the-move mode ----------

  const sideToMove = () => (S.node.ply % 2 === 0 ? 'w' : 'b');
  const quizMsg = (text, tone = 'text-slate-300') => {
    const p = $('#quiz-msg');
    p.textContent = text;
    p.className = tone;
  };

  function quizStep() {
    if (S.mode !== 'quiz' || !S.game) return;
    clearTimeout(S.timer);
    if (!S.node.children.length) {
      quizMsg(`End of game (${S.game.result}). You scored ${S.score.points} out of ${S.score.tries}. Moves you missed come back in Review. Press ⏮ to try again.`, 'text-amber-300');
      return;
    }
    if (sideToMove() !== prefs.quizSide) {
      quizMsg('Opponent is moving…', 'text-slate-400');
      S.timer = setTimeout(() => goTo(S.node.children[0]), 700);
      return;
    }
    const name = prefs.quizSide === 'w' ? S.game.white : S.game.black;
    quizMsg(`Your turn: what did ${name} play here?`);
  }

  function renderQuiz() {
    const { points, tries } = S.score;
    $('#quiz-score').textContent = tries ? `· ${points}/${tries} points` : '';
  }

  // A position you could not find on the first try comes back in Review.
  function rememberMiss(node) {
    addCard({ id: `g:${S.game.id}:${node.ply}`, kind: 'game', gameId: S.game.id, ply: node.ply,
      fen: node.fen, solution: node.children[0].san });
  }

  async function tryMove(from, to, promotion) {
    const node = S.node;
    const expected = node.children[0];
    const firstTry = !S.wrong && !S.hinted;
    const chess = new Chess(node.fen);
    const san = chess.move({ from, to, promotion: promotion || 'q' }).san;
    if (san === expected.san) {
      if (firstTry) S.score.points++;
      else rememberMiss(node);
      S.score.tries++;
      goTo(expected);
      if (S.node.children.length) {
        quizMsg(`✓ Correct, ${san}! ${sideToMove() !== prefs.quizSide ? 'Opponent is moving…' : ''}`, 'text-emerald-400');
      }
      return;
    }
    S.selected = null;
    S.wrong = [from, to];
    renderBoard();

    // Not the game move, but maybe just as good: ask the engine.
    quizMsg(`Checking ${san} with the engine…`, 'text-slate-400');
    S.checking = true;
    let cmp = null;
    try { cmp = await closeEnough(chess.fen(), expected.fen, sideToMove()); } catch { /* engine unavailable */ }
    S.checking = false;
    if (S.mode !== 'quiz' || S.node !== node) return;
    if (cmp && cmp.close && firstTry) {
      S.score.points += 0.5;
      S.score.tries++;
      goTo(expected);
      quizMsg(`≈ ${san} is about as good as the game move (${fmtScore(cmp.mine)} vs ${fmtScore(cmp.target)}). Half a point! The game went ${moveLabel(expected)}.`, 'text-sky-300');
      clearTimeout(S.timer);
      S.timer = setTimeout(quizStep, 3000);
      return;
    }
    if (cmp && cmp.close) {
      quizMsg(`≈ ${san} is about as good as the game move, but find what was actually played to continue.`, 'text-sky-300');
      return;
    }
    quizMsg(cmp
      ? `✗ ${san} is weaker than the game move (${fmtScore(cmp.mine)} vs ${fmtScore(cmp.target)}). Try again.`
      : `✗ ${san} is legal, but it is not what was played. Try again.`, 'text-red-400');
  }

  function hint() {
    if (S.mode !== 'quiz' || !S.node.children.length || sideToMove() !== prefs.quizSide) return;
    S.hinted = true;
    S.wrong = null;
    S.selected = S.node.children[0].from;
    renderBoard();
    quizMsg('Hint: the highlighted piece moves.', 'text-amber-300');
  }

  function reveal() {
    if (S.mode !== 'quiz' || S.checking || !S.node.children.length || sideToMove() !== prefs.quizSide) return;
    S.score.tries++;
    rememberMiss(S.node);
    const move = S.node.children[0];
    goTo(move);
    quizMsg(`The game move was ${move.san}. Read the note, then continue.`, 'text-amber-300');
    clearTimeout(S.timer);
    S.timer = setTimeout(quizStep, 2500);
  }

  // ---------- commentary editing ----------
  function editNote() {
    if (!S.game) return;
    $('#note-input').value = S.node.comment || '';
    $('#note-text').classList.add('hidden');
    $('#note-editor').classList.remove('hidden');
    $('#note-input').focus();
  }

  function saveNote() {
    S.node.comment = $('#note-input').value.trim();
    saveTree();
    renderNote();
    renderMoves();
  }

  // ---------- add / edit games ----------
  const dialog = $('#game-dialog');
  const form = $('#game-form');
  let editingId = null;

  function openGameDialog(game) {
    editingId = game ? game.id : null;
    $('#dialog-title').textContent = game ? 'Edit game' : 'Add a game';
    form.reset();
    $('#form-error').classList.add('hidden');
    if (game) {
      ['white', 'black', 'event', 'year', 'opening', 'result', 'pgn'].forEach((k) => { form.elements[k].value = game[k] || ''; });
      form.elements.tags.value = (game.tags || []).join(', ');
    }
    dialog.showModal();
  }

  function fillFromHeaders() {
    const { headers } = PGN.parsePgn(form.elements.pgn.value);
    const map = { white: headers.White, black: headers.Black, event: headers.Event || headers.Site,
      year: (headers.Date || '').slice(0, 4).replace(/\?/g, ''), opening: headers.Opening, result: headers.Result };
    Object.entries(map).forEach(([k, v]) => {
      if (v && v !== '?' && (!form.elements[k].value || k === 'result')) form.elements[k].value = v;
    });
  }

  // Builds a library entry from a PGN + metadata; throws on invalid moves.
  function buildGame(meta, pgn) {
    const parsed = PGN.parsePgn(pgn);
    if (!parsed.root.children.length) throw new Error('No moves found in the PGN.');
    PGN.buildTree(Chess, parsed.root);
    const h = parsed.headers;
    return {
      id: meta.id || `g-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      white: meta.white || h.White || 'White',
      black: meta.black || h.Black || 'Black',
      event: meta.event || h.Event || '',
      year: meta.year || (h.Date || '').slice(0, 4).replace(/\?/g, ''),
      opening: meta.opening || h.Opening || '',
      result: meta.result || h.Result || '*',
      tags: meta.tags || [],
      pgn: pgn.trim()
    };
  }

  function onSubmit(e) {
    e.preventDefault();
    const f = form.elements;
    try {
      const game = buildGame({
        id: editingId,
        white: f.white.value.trim(), black: f.black.value.trim(),
        event: f.event.value.trim(), year: f.year.value.trim(),
        opening: f.opening.value.trim(), result: f.result.value,
        tags: f.tags.value.split(',').map((t) => t.trim()).filter(Boolean)
      }, f.pgn.value);
      const idx = library.findIndex((g) => g.id === game.id);
      if (idx >= 0) library[idx] = game; else library.unshift(game);
      saveLibrary();
      dialog.close();
      loadGame(game.id);
    } catch (err) {
      const p = $('#form-error');
      p.textContent = err.message;
      p.classList.remove('hidden');
    }
  }

  function deleteGame() {
    if (!S.game || !confirm(`Delete "${title(S.game)}" from your library?`)) return;
    library = library.filter((g) => g.id !== S.game.id);
    saveLibrary();
    loadGame(library[0] && library[0].id);
  }

  // ---------- import / export ----------
  function exportLibrary() {
    const blob = new Blob([JSON.stringify(library, null, 2)], { type: 'application/json' });
    const a = el('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'chess-classics-library.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  async function importFile(file) {
    const text = await file.text();
    const added = [];
    const errors = [];
    if (/^\s*[\[{]/.test(text) && !/^\s*\[\w+\s+"/.test(text)) {
      let data;
      try { data = JSON.parse(text); } catch { return alert('That file is not valid JSON.'); }
      const items = Array.isArray(data) ? data : data.games || [];
      items.forEach((g, i) => {
        try { added.push(buildGame({ ...g, tags: Array.isArray(g.tags) ? g.tags : [] }, g.pgn || '')); }
        catch (err) { errors.push(`Game ${i + 1}: ${err.message}`); }
      });
    } else {
      // One or more PGN games, each starting with header tags.
      text.split(/\n\s*\n(?=\s*\[)/).filter((s) => s.trim()).forEach((chunk, i) => {
        try { added.push(buildGame({}, chunk)); }
        catch (err) { errors.push(`Game ${i + 1}: ${err.message}`); }
      });
    }
    added.forEach((g) => {
      const idx = library.findIndex((x) => x.id === g.id);
      if (idx >= 0) library[idx] = g; else library.push(g);
    });
    saveLibrary();
    renderLibrary();
    if (added.length) loadGame(added[0].id);
    alert(`Imported ${added.length} game(s).${errors.length ? '\n\nSkipped:\n' + errors.join('\n') : ''}`);
  }

  function restoreDefaults() {
    const missing = window.DEFAULT_GAMES.filter((d) => !library.some((g) => g.id === d.id));
    const changed = window.DEFAULT_GAMES.filter((d) => library.some((g) => g.id === d.id && g.pgn !== d.pgn));
    library.push(...structuredClone(missing));
    let updated = 0;
    if (changed.length && confirm(`${changed.length} built-in game(s) differ from the latest built-in version, either because you edited them or because the app was updated.\n\nReplace them with the latest version? Your own notes, marks and lines in those games will be lost.`)) {
      changed.forEach((d) => { library[library.findIndex((g) => g.id === d.id)] = structuredClone(d); });
      updated = changed.length;
    }
    if (!missing.length && !updated) return alert('Nothing to restore.');
    saveLibrary();
    renderLibrary();
    if (S.game && changed.some((d) => d.id === S.game.id) && updated) loadGame(S.game.id);
    alert(`Restored ${missing.length} and updated ${updated} built-in game(s).`);
  }

  // ---------- wiring ----------
  document.querySelectorAll('[data-nav]').forEach((b) => b.addEventListener('click', () => { stopAutoplay(); nav[b.dataset.nav](); }));
  document.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
  $('#btn-play').addEventListener('click', toggleAutoplay);
  $('#btn-flip').addEventListener('click', () => { S.orientation = S.orientation === 'w' ? 'b' : 'w'; renderBoard(); renderEngine(); });
  $('#board').addEventListener('click', onBoardClick);
  $('#promo').addEventListener('click', (e) => { if (e.target.id === 'promo') { hidePromo(); renderBoard(); } });
  $('#moves').addEventListener('click', (e) => {
    const m = e.target.closest('[data-id]');
    if (!m) return;
    stopAutoplay();
    if (S.mode !== 'replay') setMode('replay');
    goTo(S.nodes.get(Number(m.dataset.id)));
  });
  $('#btn-mainline').addEventListener('click', () => goTo(mainAncestor(S.node)));
  $('#btn-del-line').addEventListener('click', deleteLine);
  $('#search').addEventListener('input', renderLibrary);
  $('#btn-add').addEventListener('click', () => openGameDialog(null));
  $('#btn-edit-game').addEventListener('click', () => openGameDialog(S.game));
  $('#btn-delete-game').addEventListener('click', deleteGame);
  $('#btn-cancel').addEventListener('click', () => dialog.close());
  form.elements.pgn.addEventListener('change', fillFromHeaders);
  form.addEventListener('submit', onSubmit);
  $('#btn-edit-note').addEventListener('click', editNote);
  $('#btn-note-save').addEventListener('click', saveNote);
  $('#btn-note-cancel').addEventListener('click', renderNote);
  $('#btn-hint').addEventListener('click', hint);
  $('#btn-reveal').addEventListener('click', reveal);
  $('#quiz-side').addEventListener('change', (e) => {
    prefs.quizSide = e.target.value;
    savePrefs();
    setMode('quiz');
  });
  $('#btn-t-hint').addEventListener('click', trainerHint);
  $('#btn-t-solution').addEventListener('click', trainerSolution);
  $('#btn-t-next').addEventListener('click', () => { if (S.trainer && !S.checking) nextItem(); });
  $('#btn-t-analyze').addEventListener('click', analyzeAll);
  $('#engine-toggle').addEventListener('change', (e) => enableEngine(e.target.checked));
  $('#btn-analyze').addEventListener('click', analyzeGame);
  $('#btn-play-best').addEventListener('click', () => {
    const best = S.live && S.live.node === S.node && S.live.pv && S.live.pv[0];
    if (best) playMove({ from: best.slice(0, 2), to: best.slice(2, 4), promotion: best[4] });
  });
  $('#eval-svg').addEventListener('mousemove', onGraphHover);
  $('#eval-svg').addEventListener('mouseleave', hideGraphHover);
  $('#eval-svg').addEventListener('click', (e) => {
    if (graphLine.length) { stopAutoplay(); goTo(graphLine[graphIndex(e).i]); }
  });
  let resizeTimer = null;
  window.addEventListener('resize', () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(renderEvalGraph, 100); });
  $('#btn-export').addEventListener('click', exportLibrary);
  $('#btn-restore').addEventListener('click', restoreDefaults);
  $('#file-import').addEventListener('change', (e) => {
    if (e.target.files[0]) importFile(e.target.files[0]);
    e.target.value = '';
  });

  document.addEventListener('keydown', (e) => {
    if (dialog.open || /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    const keys = { ArrowLeft: nav.prev, ArrowRight: nav.next, Home: nav.first, End: nav.last };
    if (keys[e.key]) { e.preventDefault(); stopAutoplay(); keys[e.key](); }
    else if (e.key === ' ') { e.preventDefault(); toggleAutoplay(); }
    else if (e.key === 'f' || e.key === 'F') $('#btn-flip').click();
    else if (e.key === 'Escape' && S.promo) { hidePromo(); renderBoard(); }
  });

  $('#quiz-side').value = prefs.quizSide;
  setMode('replay');
  loadGame(prefs.lastId);
  if (prefs.engine) enableEngine(true);
})();
