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
  const S = {
    game: null,       // library entry
    sans: [],
    verbose: [],      // chess.js verbose moves
    comments: {},
    fens: [],
    ply: 0,
    orientation: 'w',
    mode: 'replay',
    playing: null,    // autoplay interval
    selected: null,   // quiz: selected square
    wrong: null,      // quiz: [from, to] of last wrong try
    score: { right: 0, tries: 0 },
    timer: null       // quiz: pending opponent reply
  };

  function loadGame(id) {
    stopAutoplay();
    clearTimeout(S.timer);
    const game = library.find((g) => g.id === id) || library[0];
    if (!game) { S.game = null; render(); renderLibrary(); return; }
    const parsed = PGN.parsePgn(game.pgn);
    let verbose = [];
    try { verbose = PGN.validateMoves(Chess, parsed.moves); }
    catch (err) { alert(`Could not load "${title(game)}": ${err.message}`); }
    const chess = new Chess();
    const fens = [chess.fen()];
    verbose.forEach((m) => { chess.move(m.san); fens.push(chess.fen()); });

    Object.assign(S, {
      game, verbose, fens,
      sans: verbose.map((m) => m.san),
      comments: parsed.comments,
      ply: 0, selected: null, wrong: null,
      score: { right: 0, tries: 0 },
      orientation: S.mode === 'quiz' ? prefs.quizSide : 'w'
    });
    prefs.lastId = game.id;
    savePrefs();
    renderLibrary();
    render();
    if (S.mode === 'quiz') quizStep();
  }

  const title = (g) => `${g.white} vs ${g.black}`;

  // ---------- rendering ----------
  function render() {
    renderBoard();
    renderInfo();
    renderNote();
    renderMoves();
    renderQuiz();
  }

  function renderBoard() {
    const board = $('#board');
    board.classList.toggle('quiz', S.mode === 'quiz');
    board.replaceChildren();
    const chess = new Chess(S.fens[S.ply] || undefined);
    const grid = chess.board(); // grid[0] is rank 8
    const last = S.verbose[S.ply - 1];
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
      if (last && (sq === last.from || sq === last.to)) cell.classList.add('last');
      if (sq === checkSq) cell.classList.add('check');
      if (sq === S.selected) cell.classList.add('sel');
      if (S.wrong && S.wrong.includes(sq)) cell.classList.add('wrong');
      if (targets.includes(sq)) cell.classList.add('target', piece ? 'occupied' : 'empty');
      if (piece) cell.appendChild(el('span', `piece ${piece.color}`, GLYPHS[piece.type] + '︎'));
      const bottomRow = i >= 56;
      const leftCol = i % 8 === 0;
      if (bottomRow) cell.appendChild(el('span', 'coord file', FILES[f]));
      if (leftCol) cell.appendChild(el('span', 'coord rank', String(8 - r)));
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
    let status = `${turn === 'w' ? 'White' : 'Black'} to move`;
    if (chess.in_checkmate()) status = 'Checkmate';
    else if (chess.in_stalemate()) status = 'Stalemate';
    else if (S.ply === S.sans.length && S.sans.length && g) status = `Final position · ${g.result}`;
    $('#turn').textContent = status;
    $('#ply-label').textContent = S.sans.length ? `Move ${S.ply} / ${S.sans.length}` : '';
  }

  function renderInfo() {
    const g = S.game;
    $('#g-title').textContent = g ? title(g) : 'No games yet';
    $('#g-meta').textContent = g
      ? [g.event, g.year, g.opening, g.result].filter(Boolean).join(' · ')
      : 'Add a game to get started.';
    const tags = $('#g-tags');
    tags.replaceChildren(...((g && g.tags) || []).map((t) =>
      el('span', 'text-[11px] bg-slate-700/80 text-slate-300 rounded-full px-2 py-0.5', t)));
    $('#btn-edit-game').disabled = $('#btn-delete-game').disabled = !g;
  }

  function moveLabel(ply) {
    const idx = ply - 1;
    const num = Math.floor(idx / 2) + 1;
    return `${num}${idx % 2 ? '...' : '.'} ${S.sans[idx]}`;
  }

  function renderNote() {
    const note = S.comments[S.ply];
    $('#note-title').textContent = S.ply === 0 ? 'Introduction' : moveLabel(S.ply);
    const p = $('#note-text');
    if (note) {
      p.textContent = note;
      p.className = 'mt-2 text-sm leading-relaxed whitespace-pre-line text-slate-100';
    } else {
      p.textContent = S.ply === 0
        ? 'No introduction yet. Use the arrows or ← → keys to step through the game.'
        : 'No commentary for this move. Click ✎ Edit to add your own notes.';
      p.className = 'mt-2 text-sm leading-relaxed whitespace-pre-line text-slate-500 italic';
    }
    $('#note-editor').classList.add('hidden');
    p.classList.remove('hidden');
    $('#btn-edit-note').classList.toggle('invisible', !S.game);
  }

  function renderMoves() {
    const box = $('#moves');
    box.replaceChildren();
    const grid = el('div', 'grid grid-cols-[2.5rem_1fr_1fr] gap-y-0.5 items-center');
    const cell = (ply) => {
      if (ply > S.sans.length) return el('span');
      const span = el('span', 'mv', S.sans[ply - 1]);
      if (S.comments[ply]) { span.classList.add('has-note'); span.title = S.comments[ply]; }
      if (ply === S.ply) span.classList.add('cur');
      span.dataset.ply = ply;
      return span;
    };
    for (let ply = 1; ply <= S.sans.length; ply += 2) {
      grid.appendChild(el('span', 'text-slate-500 text-right pr-2', `${(ply + 1) / 2}.`));
      grid.appendChild(cell(ply));
      grid.appendChild(cell(ply + 1));
    }
    box.appendChild(grid);
    if (S.game) box.appendChild(el('div', 'mt-2 text-center text-slate-400', S.game.result));
    const cur = box.querySelector('.cur');
    if (cur) cur.scrollIntoView({ block: 'nearest' });
    else box.scrollTop = 0;
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
  function goTo(ply) {
    ply = Math.max(0, Math.min(S.sans.length, ply));
    clearTimeout(S.timer);
    S.ply = ply;
    S.selected = null;
    S.wrong = null;
    S.hinted = false;
    render();
    if (S.mode === 'quiz') quizStep();
  }

  const nav = {
    first: () => goTo(0),
    prev: () => goTo(S.ply - 1),
    next: () => goTo(S.ply + 1),
    last: () => goTo(S.sans.length)
  };

  function stopAutoplay() {
    clearInterval(S.playing);
    S.playing = null;
    $('#btn-play').innerHTML = PLAY_ICON;
  }

  function toggleAutoplay() {
    if (S.playing) return stopAutoplay();
    if (S.mode === 'quiz') setMode('replay');
    if (S.ply >= S.sans.length) goTo(0);
    $('#btn-play').innerHTML = PAUSE_ICON;
    S.playing = setInterval(() => {
      if (S.ply >= S.sans.length) return stopAutoplay();
      goTo(S.ply + 1);
    }, 1600);
  }

  // ---------- guess-the-move mode ----------
  function setMode(mode) {
    S.mode = mode;
    stopAutoplay();
    clearTimeout(S.timer);
    S.selected = null;
    S.wrong = null;
    document.querySelectorAll('.mode-btn').forEach((b) => b.classList.toggle('active', b.dataset.mode === mode));
    $('#quiz-side-wrap').classList.toggle('hidden', mode !== 'quiz');
    $('#quiz-side-wrap').classList.toggle('flex', mode === 'quiz');
    $('#quiz-panel').classList.toggle('hidden', mode !== 'quiz');
    if (mode === 'quiz') {
      S.score = { right: 0, tries: 0 };
      S.orientation = prefs.quizSide;
    }
    render();
    if (mode === 'quiz') quizStep();
  }

  const sideToMove = () => (S.ply % 2 === 0 ? 'w' : 'b');
  const quizMsg = (text, tone = 'text-slate-300') => {
    const p = $('#quiz-msg');
    p.textContent = text;
    p.className = tone;
  };

  function quizStep() {
    if (S.mode !== 'quiz' || !S.game) return;
    clearTimeout(S.timer);
    if (S.ply >= S.sans.length) {
      quizMsg(`End of game (${S.game.result}). You found ${S.score.right} of the moves on your first try. Press ⏮ to try again.`, 'text-amber-300');
      return;
    }
    if (sideToMove() !== prefs.quizSide) {
      quizMsg('Opponent is moving…', 'text-slate-400');
      S.timer = setTimeout(() => goTo(S.ply + 1), 700);
      return;
    }
    const name = prefs.quizSide === 'w' ? S.game.white : S.game.black;
    quizMsg(`Your turn: what did ${name} play here?`);
  }

  function renderQuiz() {
    const { right, tries } = S.score;
    $('#quiz-score').textContent = tries ? `· ${right}/${tries} correct` : '';
  }

  function onBoardClick(e) {
    if (S.mode !== 'quiz' || !S.game) return;
    const cell = e.target.closest('.sq');
    if (!cell || S.ply >= S.sans.length || sideToMove() !== prefs.quizSide) return;
    const sq = cell.dataset.sq;
    const chess = new Chess(S.fens[S.ply]);
    const piece = chess.get(sq);

    if (S.selected) {
      const legal = chess.moves({ square: S.selected, verbose: true }).find((m) => m.to === sq);
      if (legal) return tryMove(S.selected, sq);
    }
    S.wrong = null;
    S.selected = piece && piece.color === chess.turn() && S.selected !== sq ? sq : null;
    renderBoard();
  }

  function tryMove(from, to) {
    const expected = S.verbose[S.ply];
    const firstTry = !S.wrong && !S.hinted;
    if (expected.from === from && expected.to === to) {
      if (firstTry) S.score.right++;
      S.score.tries++;
      S.hinted = false;
      const san = expected.san;
      goTo(S.ply + 1);
      if (S.ply < S.sans.length) {
        quizMsg(`✓ Correct, ${san}! ${sideToMove() !== prefs.quizSide ? 'Opponent is moving…' : ''}`, 'text-emerald-400');
      }
      return;
    }
    const chess = new Chess(S.fens[S.ply]);
    const san = chess.move({ from, to, promotion: 'q' }).san;
    S.selected = null;
    S.wrong = [from, to];
    renderBoard();
    quizMsg(`✗ ${san} is legal, but it is not what was played. Try again.`, 'text-red-400');
  }

  function hint() {
    if (S.mode !== 'quiz' || S.ply >= S.sans.length || sideToMove() !== prefs.quizSide) return;
    S.hinted = true;
    S.wrong = null;
    S.selected = S.verbose[S.ply].from;
    renderBoard();
    quizMsg('Hint: the highlighted piece moves.', 'text-amber-300');
  }

  function reveal() {
    if (S.mode !== 'quiz' || S.ply >= S.sans.length || sideToMove() !== prefs.quizSide) return;
    S.score.tries++;
    S.hinted = false;
    const san = S.sans[S.ply];
    goTo(S.ply + 1);
    quizMsg(`The game move was ${san}. Read the note, then continue.`, 'text-amber-300');
    clearTimeout(S.timer);
    S.timer = setTimeout(quizStep, 2500);
  }

  // ---------- commentary editing ----------
  function editNote() {
    if (!S.game) return;
    $('#note-input').value = S.comments[S.ply] || '';
    $('#note-text').classList.add('hidden');
    $('#note-editor').classList.remove('hidden');
    $('#note-input').focus();
  }

  function saveNote() {
    const text = $('#note-input').value.trim();
    if (text) S.comments[S.ply] = text;
    else delete S.comments[S.ply];
    S.game.pgn = PGN.toPgn(S.sans, S.comments, S.game.result);
    saveLibrary();
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
    if (!parsed.moves.length) throw new Error('No moves found in the PGN.');
    PGN.validateMoves(Chess, parsed.moves);
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
  $('#moves').addEventListener('click', (e) => {
    const m = e.target.closest('[data-ply]');
    if (m) { stopAutoplay(); goTo(Number(m.dataset.ply)); }
  });
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
  });

  $('#quiz-side').value = prefs.quizSide;
  setMode('replay');
  loadGame(prefs.lastId);
})();
