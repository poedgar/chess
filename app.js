(() => {
  const STORAGE_KEY = 'chess-classics-library-v1';
  const PREFS_KEY = 'chess-classics-prefs-v1';
  const GLYPHS = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
  const FILES = 'abcdefgh';
  const icon = (d) => `<svg viewBox="0 0 24 24" class="w-5 h-5 mx-auto" fill="currentColor">${d}</svg>`;
  const PLAY_ICON = icon('<path d="M7 5v14l11-7z"/>');
  const PAUSE_ICON = icon('<path d="M7 5h4v14H7zM13 5h4v14h-4z"/>');

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
  const prefs = Object.assign({ lastId: null, quizSide: 'w' }, store.get(PREFS_KEY, {}));
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
    score: { right: 0, tries: 0 },
    timer: null,      // quiz: pending opponent reply
    promo: null       // pending promotion { from, to }
  };
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
      score: { right: 0, tries: 0 },
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

  // ---------- rendering ----------
  function render() {
    renderBoard();
    renderInfo();
    renderNote();
    renderMoves();
    renderVarBar();
    renderQuiz();
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
    $('#ply-label').textContent = !total ? '' : main ? `Move ${node.ply} / ${total}` : 'Alternative line';
  }

  function renderInfo() {
    const g = S.game;
    $('#g-title').textContent = g ? title(g) : 'No games yet';
    $('#g-meta').textContent = g
      ? [g.event, g.year, g.opening, g.result].filter(Boolean).join(' · ')
      : 'Add a game to get started.';
    $('#g-tags').replaceChildren(...((g && g.tags) || []).map((t) =>
      el('span', 'text-[11px] bg-slate-700/80 text-slate-300 rounded-full px-2 py-0.5', t)));
    $('#btn-edit-game').disabled = $('#btn-delete-game').disabled = !g;
  }

  function renderNote() {
    const node = S.node;
    const main = isMain(node);
    $('#note-title').textContent = node === S.root ? 'Introduction' : moveLabel(node) + (main ? '' : '  (alternative)');
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

  function moveSpan(node, text) {
    const span = el('span', 'mv', text);
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
    const grid = el('div', 'grid grid-cols-[2.5rem_1fr_1fr] gap-y-0.5 items-center');
    const num = (n) => el('span', 'text-slate-500 text-right pr-2', `${Math.ceil(n.ply / 2)}.`);

    let prev = S.root;
    let rowOpen = false; // a white move is waiting for black's reply in this row
    while (prev.children.length) {
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
    if (S.game && S.root.children.length) box.appendChild(el('div', 'mt-2 text-center text-slate-400', S.game.result));
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
    const matches = library.filter((g) =>
      [g.white, g.black, g.event, g.year, g.opening, ...(g.tags || [])].join(' ').toLowerCase().includes(q));
    if (!matches.length) list.appendChild(el('li', 'text-sm text-slate-500 px-2 py-3', 'No games found.'));
    matches.forEach((g) => {
      const active = S.game && S.game.id === g.id;
      const li = el('li');
      const btn = el('button', `w-full text-left rounded-lg px-3 py-2 ${active ? 'bg-amber-500/15 ring-1 ring-amber-500/60' : 'hover:bg-slate-700/60'}`);
      btn.appendChild(el('div', 'text-sm font-medium leading-snug', title(g)));
      btn.appendChild(el('div', 'text-xs text-slate-400 mt-0.5', [g.event, g.year].filter(Boolean).join(', ') + (g.result ? ` · ${g.result}` : '')));
      btn.addEventListener('click', () => loadGame(g.id));
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
    first: () => goTo(S.root),
    prev: () => goTo(S.node.parent),
    next: () => goTo(S.node.children[0]),
    last: () => goTo(lineEnd(S.node))
  };

  function stopAutoplay() {
    clearInterval(S.playing);
    S.playing = null;
    $('#btn-play').innerHTML = PLAY_ICON;
  }

  function toggleAutoplay() {
    if (S.playing) return stopAutoplay();
    if (S.mode === 'quiz') setMode('replay');
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
    if (S.mode === 'quiz' && (!S.node.children.length || sideToMove() !== prefs.quizSide)) return;
    const sq = cell.dataset.sq;
    const chess = new Chess(S.node.fen);

    if (S.selected) {
      const options = chess.moves({ square: S.selected, verbose: true }).filter((m) => m.to === sq);
      if (options.length) {
        const from = S.selected;
        if (options.some((m) => m.promotion)) return showPromo(from, sq, chess.turn());
        return S.mode === 'quiz' ? tryMove(from, sq) : playMove({ from, to: sq });
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
        if (S.mode === 'quiz') tryMove(from, to, p);
        else playMove({ from, to, promotion: p });
      });
      return b;
    }));
    $('#promo').classList.replace('hidden', 'flex');
  }

  function hidePromo() {
    S.promo = null;
    $('#promo').classList.replace('flex', 'hidden');
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
      comment: '', children: [], parent: S.node };
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

  // ---------- guess-the-move mode ----------
  function setMode(mode) {
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
      S.score = { right: 0, tries: 0 };
      S.orientation = prefs.quizSide;
      if (S.node) S.node = mainAncestor(S.node); // the quiz follows the game itself
    }
    if (!S.node) return;
    render();
    if (mode === 'quiz') quizStep();
  }

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
      quizMsg(`End of game (${S.game.result}). You found ${S.score.right} of the moves on your first try. Press ⏮ to try again.`, 'text-amber-300');
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
    const { right, tries } = S.score;
    $('#quiz-score').textContent = tries ? `· ${right}/${tries} correct` : '';
  }

  function tryMove(from, to, promotion) {
    const expected = S.node.children[0];
    const firstTry = !S.wrong && !S.hinted;
    const chess = new Chess(S.node.fen);
    const san = chess.move({ from, to, promotion: promotion || 'q' }).san;
    if (san === expected.san) {
      if (firstTry) S.score.right++;
      S.score.tries++;
      goTo(expected);
      if (S.node.children.length) {
        quizMsg(`✓ Correct, ${san}! ${sideToMove() !== prefs.quizSide ? 'Opponent is moving…' : ''}`, 'text-emerald-400');
      }
      return;
    }
    const known = S.node.children.find((c) => c.san === san);
    S.selected = null;
    S.wrong = [from, to];
    renderBoard();
    quizMsg(known
      ? `✗ ${san} is analysed as an alternative here, but it is not what was played. Try again.`
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
    if (S.mode !== 'quiz' || !S.node.children.length || sideToMove() !== prefs.quizSide) return;
    S.score.tries++;
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
    if (!missing.length) return alert('All built-in games are already in your library.');
    library.push(...structuredClone(missing));
    saveLibrary();
    renderLibrary();
    alert(`Restored ${missing.length} built-in game(s).`);
  }

  // ---------- wiring ----------
  document.querySelectorAll('[data-nav]').forEach((b) => b.addEventListener('click', () => { stopAutoplay(); nav[b.dataset.nav](); }));
  document.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
  $('#btn-play').addEventListener('click', toggleAutoplay);
  $('#btn-flip').addEventListener('click', () => { S.orientation = S.orientation === 'w' ? 'b' : 'w'; renderBoard(); });
  $('#board').addEventListener('click', onBoardClick);
  $('#promo').addEventListener('click', (e) => { if (e.target.id === 'promo') { hidePromo(); renderBoard(); } });
  $('#moves').addEventListener('click', (e) => {
    const m = e.target.closest('[data-id]');
    if (!m) return;
    stopAutoplay();
    if (S.mode === 'quiz') setMode('replay');
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
})();
