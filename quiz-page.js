// The dedicated quiz page (quiz.html). Questions come from quizzes.js and are
// played on the built-in games. Progress is shared with the games page: first-try
// solves are marked as solved, misses become Review cards there.
(() => {
  const REVIEW_KEY = 'chess-classics-review-v1';
  const CHECK_DEPTH = 14;
  const CLOSE_ENOUGH = 0.08; // same tolerance as Guess the move on the games page
  const DAY = 24 * 60 * 60 * 1000;
  const GLYPHS = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
  const FILES = 'abcdefgh';
  const CATS = [['all', 'All questions'], ...window.QUIZ_CATEGORIES];
  const LABELS = Object.fromEntries(window.QUIZ_CATEGORIES);
  const BLURBS = {
    all: 'Every question from every category, mixed.',
    opening: 'Opening names, gambits, and the early mistakes that decided games.',
    strategy: 'Development, plans and quiet moves that prepare the attack.',
    tactics: 'Sacrifices, forks and combinations from the masters.',
    endgame: 'Mating patterns and finishing off a won game.'
  };
  const ICONS = { all: '♚', opening: '♟', strategy: '♜', tactics: '♞', endgame: '♛' };

  const $ = (sel) => document.querySelector(sel);
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  const store = {
    get(key, fallback) {
      try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
      catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
    }
  };
  // Re-read before every write, so a games page open in another tab isn't overwritten.
  const loadReview = () => Object.assign({ cards: {}, solved: {} }, store.get(REVIEW_KEY, {}));
  function updateReview(fn) {
    const r = loadReview();
    fn(r);
    store.set(REVIEW_KEY, r);
  }

  // ---------- questions ----------
  const quizPly = (at) => { const m = /^(\d+)(\.|\.\.\.)$/.exec(at); return m ? 2 * Number(m[1]) - (m[2] === '.' ? 2 : 1) : -1; };
  const lines = new Map();
  function lineOf(gameId) {
    if (!lines.has(gameId)) {
      const g = window.DEFAULT_GAMES.find((x) => x.id === gameId);
      let line = [];
      try { if (g) { const root = PGN.buildTree(Chess, PGN.parsePgn(g.pgn).root); line = [root, ...PGN.mainLine(root)]; } }
      catch { /* a broken game has no questions */ }
      lines.set(gameId, line);
    }
    return lines.get(gameId);
  }

  // Same shape as the quiz items of the games page, so Review cards work there.
  const ALL = window.QUIZZES.map((q) => {
    const ply = quizPly(q.at);
    const node = lineOf(q.game)[ply];
    if (!node) return null;
    return { id: `q:${q.id}`, kind: 'quiz', cat: q.cat, gameId: q.game, ply, fen: node.fen, question: q.q,
      solution: q.solution, exact: !!q.exact, options: q.options, move: q.move, explain: q.explain };
  }).filter(Boolean);
  const inCat = (cat) => ALL.filter((q) => cat === 'all' || q.cat === cat);

  // ---------- state ----------
  const R = { cat: 'all', items: [], i: 0, results: {} }; // results: id -> true (first try) | false
  const Q = {};    // current question: { item, tries, hinted, done, picked, order, checking }
  const B = { fen: null, last: null, selected: null, wrong: null, orientation: 'w', clickable: false };

  function show(view) {
    ['pick', 'run', 'done'].forEach((v) => {
      const n = $(`#view-${v}`);
      n.classList.toggle('hidden', v !== view);
      if (v === 'run') n.classList.toggle('grid', view === 'run');
    });
    window.scrollTo({ top: 0 });
  }

  // ---------- category picker ----------
  function renderPicker() {
    const solved = loadReview().solved;
    $('#cat-grid').replaceChildren(...CATS.map(([key, label]) => {
      const qs = inCat(key);
      const n = qs.filter((q) => solved[q.id]).length;
      const b = el('button', 'text-left bg-slate-800/60 hover:bg-slate-800 ring-1 ring-slate-700/60 hover:ring-amber-500/60 rounded-xl p-4 flex gap-4 items-start');
      b.appendChild(el('span', 'text-4xl leading-none text-amber-400 w-10 text-center', ICONS[key] + '︎'));
      const body = el('div', 'flex-1 min-w-0');
      const head = el('div', 'flex items-baseline justify-between gap-2');
      head.appendChild(el('span', 'font-semibold', label));
      head.appendChild(el('span', 'text-xs text-slate-400', `${n} / ${qs.length} solved`));
      body.appendChild(head);
      body.appendChild(el('p', 'mt-1 text-sm text-slate-400', BLURBS[key]));
      const bar = el('div', 'mt-3 h-1.5 rounded-full bg-slate-900 overflow-hidden');
      const fill = el('div', 'h-full bg-emerald-500');
      fill.style.width = `${qs.length ? (100 * n) / qs.length : 0}%`;
      bar.appendChild(fill);
      body.appendChild(bar);
      b.appendChild(body);
      b.addEventListener('click', () => { location.hash = key; });
      return b;
    }));
  }

  // ---------- rounds ----------
  function startRound(cat, items) {
    const solved = loadReview().solved;
    Object.assign(R, {
      cat,
      // Unsolved questions first; the sort is stable, so the file order is kept.
      items: items || inCat(cat).sort((a, b) => (solved[a.id] ? 1 : 0) - (solved[b.id] ? 1 : 0)),
      i: 0,
      results: {}
    });
    if (!R.items.length) return goPicker();
    show('run');
    showQuestion();
  }

  function goPicker() {
    Engine.stop();
    if (location.hash) history.pushState('', '', location.pathname);
    renderPicker();
    show('pick');
  }

  function showQuestion() {
    const item = R.items[R.i];
    const order = item.options ? item.options.map((_, i) => i) : [];
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    Object.assign(Q, { item, tries: 0, hinted: false, done: false, picked: new Set(), order, checking: false,
      msg: null });
    const node = lineOf(item.gameId)[item.ply];
    Object.assign(B, { fen: item.fen, last: node.from ? [node.from, node.to] : null, selected: null, wrong: null,
      orientation: item.ply % 2 ? 'b' : 'w', clickable: !item.options });
    render();
  }

  function finish(how, san, cmp) {
    const { item } = Q;
    const success = how !== 'shown' && Q.tries === 0 && !Q.hinted;
    Q.done = true;
    R.results[item.id] = success;
    updateReview((r) => {
      if (success) r.solved[item.id] = true;
      else r.cards[item.id] = { ...item, box: 0, due: Date.now() + DAY };
    });
    const label = (s) => `${Math.ceil((item.ply + 1) / 2)}${item.ply % 2 ? '...' : '.'} ${s}`;
    let text;
    if (item.options) text = how === 'shown' ? `The answer: ${item.options[0]}.` : '✓ Correct!';
    else if (how === 'exact') text = `✓ ${label(san)} is right!`;
    else if (how === 'close') text = `✓ ${label(san)} works too (${fmtScore(cmp.mine)}). The game move was ${label(item.solution)}.`;
    else text = `The answer is ${label(item.solution)}.`;
    if (!success) text += ' It comes back in Review tomorrow.';
    Q.msg = { text, tone: how === 'shown' ? 'text-amber-300' : 'text-emerald-400' };
    const shown = item.options ? item.move : how === 'shown' ? item.solution : san;
    if (shown) playOnBoard(shown);
    B.clickable = false;
    render();
  }

  function playOnBoard(san) {
    const c = new Chess(Q.item.fen);
    const m = c.move(san);
    if (!m) return;
    Object.assign(B, { fen: c.fen(), last: [m.from, m.to], selected: null, wrong: null });
  }

  function next() {
    if (Q.checking) return;
    if (!Q.done) R.results[Q.item.id] = R.results[Q.item.id] ?? null; // skipped
    if (++R.i < R.items.length) return showQuestion();
    Engine.stop();
    renderDone();
    show('done');
  }

  // ---------- answering ----------
  function pick(i) {
    if (Q.done || Q.picked.has(i)) return;
    if (i === 0) return finish('exact');
    Q.tries++;
    Q.picked.add(i);
    Q.msg = { text: '✗ Not quite. Try again.', tone: 'text-red-400' };
    render();
  }

  async function tryMove(from, to) {
    const { item } = Q;
    const c = new Chess(item.fen);
    const m = c.move({ from, to, promotion: 'q' });
    if (!m) return;
    if (m.san === item.solution) return finish('exact', m.san);
    B.selected = null;
    B.wrong = [from, to];
    if (item.exact) {
      Q.tries++;
      Q.msg = { text: `✗ ${m.san} is not the move. Try again.`, tone: 'text-red-400' };
      return render();
    }
    Q.msg = { text: `Checking ${m.san} with the engine…`, tone: 'text-slate-400' };
    Q.checking = true;
    render();
    let cmp = null;
    try { cmp = await closeEnough(c.fen(), fenAfter(item.fen, item.solution), item.ply % 2 ? 'b' : 'w'); }
    catch { /* engine unavailable: only the exact answer counts */ }
    if (Q.item !== item) return;
    Q.checking = false;
    if (cmp && cmp.close) return finish('close', m.san, cmp);
    Q.tries++;
    Q.msg = cmp
      ? { text: `✗ ${m.san} is not good enough (${fmtScore(cmp.mine)}, the best move keeps ${fmtScore(cmp.target)}). Try again.`, tone: 'text-red-400' }
      : { text: `✗ ${m.san} is not the move. Try again.`, tone: 'text-red-400' };
    render();
  }

  function hint() {
    if (Q.done || Q.checking || Q.item.options) return;
    Q.hinted = true;
    B.wrong = null;
    B.selected = new Chess(Q.item.fen).move(Q.item.solution).from;
    Q.msg = { text: 'Hint: the highlighted piece moves.', tone: 'text-amber-300' };
    render();
  }

  function reveal() {
    if (Q.done || Q.checking) return;
    finish('shown');
  }

  // ---------- engine ----------
  const fenAfter = (fen, san) => { const c = new Chess(fen); c.move(san); return c.fen(); };
  const winChance = (s) => s.mate !== undefined
    ? (s.mate === 0 ? (s.winner === 'w' ? 1 : -1) : Math.sign(s.mate))
    : 2 / (1 + Math.exp(-0.00368208 * s.cp)) - 1;
  const fmtScore = (s) => s.mate !== undefined
    ? (s.mate === 0 ? (s.winner === 'w' ? '1-0' : '0-1') : `${s.mate > 0 ? '+' : '−'}M${Math.abs(s.mate)}`)
    : `${s.cp >= 0 ? '+' : '−'}${(Math.abs(s.cp) / 100).toFixed(1)}`;

  // Score from White's point of view.
  async function evalFen(fen) {
    const c = new Chess(fen);
    if (c.in_checkmate()) return { mate: 0, winner: c.turn() === 'w' ? 'b' : 'w' };
    if (c.game_over()) return { cp: 0 };
    await Engine.start();
    const info = await Engine.analyse(fen, { depth: CHECK_DEPTH });
    if (!info) throw new Error('Engine search was interrupted');
    const sign = c.turn() === 'b' ? -1 : 1;
    return info.score.mate !== undefined ? { mate: info.score.mate * sign } : { cp: info.score.cp * sign };
  }

  async function closeEnough(myFen, targetFen, mover) {
    const mine = await evalFen(myFen);
    const target = await evalFen(targetFen);
    const loss = (mover === 'w' ? 1 : -1) * (winChance(target) - winChance(mine));
    return { close: loss <= CLOSE_ENOUGH, mine, target };
  }

  // ---------- rendering ----------
  function render() {
    renderBoard();
    const { item } = Q;
    const game = window.DEFAULT_GAMES.find((g) => g.id === item.gameId);
    const total = R.items.length;
    const firstTry = Object.values(R.results).filter((v) => v === true).length;
    $('#run-score').textContent = `${firstTry} correct on the first try`;
    $('#run-bar').style.width = `${(100 * (R.i + (Q.done ? 1 : 0))) / total}%`;
    $('#run-progress').textContent = `Question ${R.i + 1} of ${total} · ${LABELS[item.cat]}`;
    $('#run-game').textContent = `${game.white} vs ${game.black}, ${[game.event, game.year].filter(Boolean).join(', ')}`;
    const side = item.ply % 2 ? 'Black' : 'White';
    $('#run-question').textContent = item.options ? item.question : `${side} to move. ${item.question}`;

    const box = $('#run-choices');
    box.replaceChildren(...(item.options ? Q.order.map((i, n) => {
      const right = Q.done && i === 0;
      const wrong = Q.picked.has(i);
      const cls = right ? 'bg-emerald-600 text-white font-medium'
        : wrong ? 'bg-red-950/70 text-red-300'
        : Q.done ? 'bg-slate-800 text-slate-500' : 'bg-slate-700 hover:bg-slate-600';
      const b = el('button', `text-left rounded-lg px-3 py-2 text-sm flex gap-3 ${cls}`);
      b.appendChild(el('span', 'font-mono opacity-60', right ? '✓' : wrong ? '✗' : String(n + 1)));
      b.appendChild(el('span', '', item.options[i]));
      b.disabled = Q.done || wrong;
      b.addEventListener('click', () => pick(i));
      return b;
    }) : []));
    box.classList.toggle('hidden', !item.options);

    const msg = Q.msg || (item.options ? null : { text: 'Play your move on the board.', tone: 'text-slate-400' });
    $('#run-msg').textContent = msg ? msg.text : '';
    $('#run-msg').className = `mt-3 text-sm ${msg ? msg.tone : ''}`;
    $('#run-explain').classList.toggle('hidden', !Q.done);
    $('#run-explain').textContent = Q.done ? item.explain : '';
    $('#btn-hint').classList.toggle('hidden', Q.done || !!item.options);
    $('#btn-show').classList.toggle('hidden', Q.done);
    $('#btn-next').textContent = Q.done ? (R.i + 1 < total ? 'Next' : 'See results') : 'Skip';
  }

  function renderBoard() {
    const board = $('#board');
    board.replaceChildren();
    const chess = new Chess(B.fen);
    const grid = chess.board();
    const turn = chess.turn();
    let checkSq = null;
    if (chess.in_check()) {
      grid.forEach((row, r) => row.forEach((p, f) => {
        if (p && p.type === 'k' && p.color === turn) checkSq = FILES[f] + (8 - r);
      }));
    }
    const targets = B.selected ? chess.moves({ square: B.selected, verbose: true }).map((m) => m.to) : [];
    for (let i = 0; i < 64; i++) {
      const r = B.orientation === 'w' ? Math.floor(i / 8) : 7 - Math.floor(i / 8);
      const f = B.orientation === 'w' ? i % 8 : 7 - (i % 8);
      const sq = FILES[f] + (8 - r);
      const piece = grid[r][f];
      const cell = el('div', `sq ${(r + f) % 2 ? 'dark' : 'light'}`);
      cell.dataset.sq = sq;
      if (B.last && B.last.includes(sq)) cell.classList.add('last');
      if (sq === checkSq) cell.classList.add('check');
      if (sq === B.selected) cell.classList.add('sel');
      if (B.wrong && B.wrong.includes(sq)) cell.classList.add('wrong');
      if (targets.includes(sq)) cell.classList.add('target', piece ? 'occupied' : 'empty');
      if (piece) cell.appendChild(el('span', `piece ${piece.color}`, GLYPHS[piece.type] + '︎'));
      if (i >= 56) cell.appendChild(el('span', 'coord file', FILES[f]));
      if (i % 8 === 0) cell.appendChild(el('span', 'coord rank', String(8 - r)));
      board.appendChild(cell);
    }
    const game = window.DEFAULT_GAMES.find((g) => g.id === Q.item.gameId);
    const label = (color) => {
      const wrap = el('span', 'inline-flex items-center gap-2');
      wrap.appendChild(el('span', `inline-block w-3 h-3 rounded-full ring-1 ring-slate-500 ${color === 'w' ? 'bg-white' : 'bg-slate-950'}`));
      wrap.appendChild(el('span', '', color === 'w' ? game.white : game.black));
      return wrap;
    };
    const top = B.orientation === 'w' ? 'b' : 'w';
    $('#top-player').replaceChildren(label(top));
    $('#bottom-player').replaceChildren(label(top === 'w' ? 'b' : 'w'));
    $('#turn').textContent = chess.in_checkmate() ? 'Checkmate' : `${turn === 'w' ? 'White' : 'Black'} to move`;
  }

  function renderDone() {
    const total = R.items.length;
    const right = R.items.filter((q) => R.results[q.id] === true).length;
    const missed = R.items.filter((q) => R.results[q.id] !== true);
    $('#done-title').textContent = `${right} of ${total} on the first try`;
    $('#done-text').textContent = right === total ? 'A perfect round!'
      : `${LABELS[R.cat] || 'All questions'}. Questions you missed or skipped are listed below; missed ones also come back in Review on the games page.`;
    $('#done-missed').replaceChildren(...missed.map((q) => {
      const g = window.DEFAULT_GAMES.find((x) => x.id === q.gameId);
      const li = el('li', 'flex gap-2');
      li.appendChild(el('span', 'text-red-400 shrink-0', R.results[q.id] === false ? '✗' : '–'));
      li.appendChild(el('span', 'text-slate-300', `${q.question} `));
      li.lastChild.appendChild(el('span', 'text-slate-500', `(${g.white} vs ${g.black})`));
      return li;
    }));
    $('#btn-retry').classList.toggle('hidden', !missed.length);
  }

  // ---------- wiring ----------
  $('#board').addEventListener('click', (e) => {
    const cell = e.target.closest('.sq');
    if (!cell || !B.clickable || Q.done || Q.checking) return;
    const sq = cell.dataset.sq;
    const chess = new Chess(B.fen);
    if (B.selected && chess.moves({ square: B.selected, verbose: true }).some((m) => m.to === sq)) {
      return tryMove(B.selected, sq);
    }
    const piece = chess.get(sq);
    B.wrong = null;
    B.selected = piece && piece.color === chess.turn() && B.selected !== sq ? sq : null;
    renderBoard();
  });
  $('#btn-hint').addEventListener('click', hint);
  $('#btn-show').addEventListener('click', reveal);
  $('#btn-next').addEventListener('click', next);
  $('#btn-back').addEventListener('click', goPicker);
  $('#btn-cats').addEventListener('click', goPicker);
  $('#btn-again').addEventListener('click', () => startRound(R.cat));
  $('#btn-retry').addEventListener('click', () => startRound(R.cat, R.items.filter((q) => R.results[q.id] !== true)));
  document.addEventListener('keydown', (e) => {
    if ($('#view-run').classList.contains('hidden') || !Q.item) return;
    if ((e.key === 'Enter' || e.key === 'ArrowRight') && Q.done) { e.preventDefault(); next(); }
    else if (/^[1-9]$/.test(e.key) && Q.item.options && !Q.done) {
      const i = Q.order[Number(e.key) - 1];
      if (i !== undefined) pick(i);
    }
  });

  // quiz.html#tactics opens a category directly.
  function route() {
    const cat = decodeURIComponent(location.hash.slice(1));
    if (CATS.some(([k]) => k === cat)) startRound(cat);
    else { renderPicker(); show('pick'); }
  }
  window.addEventListener('hashchange', route);
  route();
})();
