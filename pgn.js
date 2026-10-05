// Minimal PGN reader/writer focused on main-line moves and {comments}.
// parsePgn() returns { headers, moves: [san], comments: { ply: text } } where
// ply 0 is the introduction and ply N is the comment after the N-th half-move.
// Variations "( ... )" and NAGs "$n" are skipped.
(function (root) {
  const RESULTS = ['1-0', '0-1', '1/2-1/2', '*'];

  function parsePgn(text) {
    const headers = {};
    const moves = [];
    const comments = {};
    let i = 0;
    let depth = 0; // variation nesting

    const addComment = (c) => {
      c = c.replace(/\s+/g, ' ').trim();
      if (!c || depth > 0) return;
      const ply = moves.length;
      comments[ply] = comments[ply] ? comments[ply] + ' ' + c : c;
    };

    while (i < text.length) {
      const ch = text[i];
      if (/\s/.test(ch)) { i++; continue; }
      if (ch === '[') {
        const end = text.indexOf(']', i);
        const m = text.slice(i, end + 1).match(/^\[(\w+)\s+"(.*)"\]$/);
        if (m && depth === 0) headers[m[1]] = m[2];
        i = end === -1 ? text.length : end + 1;
        continue;
      }
      if (ch === '{') {
        const end = text.indexOf('}', i);
        addComment(text.slice(i + 1, end === -1 ? text.length : end));
        i = end === -1 ? text.length : end + 1;
        continue;
      }
      if (ch === ';') {
        const end = text.indexOf('\n', i);
        addComment(text.slice(i + 1, end === -1 ? text.length : end));
        i = end === -1 ? text.length : end + 1;
        continue;
      }
      if (ch === '(') { depth++; i++; continue; }
      if (ch === ')') { depth = Math.max(0, depth - 1); i++; continue; }

      let j = i;
      while (j < text.length && !/[\s{}();\[]/.test(text[j])) j++;
      let tok = text.slice(i, j);
      i = j;
      if (depth > 0) continue;
      if (RESULTS.includes(tok)) { headers.Result = headers.Result || tok; continue; }
      if (/^\$\d+$/.test(tok)) continue;
      tok = tok.replace(/^\d+\.+/, ''); // "12.e4" or "12..." prefix
      tok = tok.replace(/[!?]+$/, '').replace(/^0-0-0/, 'O-O-O').replace(/^0-0/, 'O-O');
      if (!tok || /^\d+\.*$/.test(tok)) continue;
      moves.push(tok);
    }
    return { headers, moves, comments };
  }

  // Replays SAN moves with chess.js and returns verbose moves. Throws with a
  // readable message on the first illegal move.
  function validateMoves(ChessCtor, sans) {
    const game = new ChessCtor();
    return sans.map((san, idx) => {
      const mv = game.move(san, { sloppy: true });
      if (!mv) {
        const num = Math.floor(idx / 2) + 1;
        throw new Error(`Illegal or unreadable move "${san}" at ${num}${idx % 2 ? '...' : '.'}`);
      }
      return mv;
    });
  }

  function toPgn(moves, comments, result) {
    const clean = (c) => c.replace(/[{}]/g, '');
    const out = [];
    if (comments[0]) out.push(`{${clean(comments[0])}}`);
    moves.forEach((san, idx) => {
      const ply = idx + 1;
      if (idx % 2 === 0) out.push(`${idx / 2 + 1}. ${san}`);
      else if (comments[idx]) out.push(`${(idx + 1) / 2}... ${san}`);
      else out.push(san);
      if (comments[ply]) out.push(`{${clean(comments[ply])}}`);
    });
    out.push(result || '*');
    return out.join(' ');
  }

  const api = { parsePgn, validateMoves, toPgn };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PGN = api;
})(this);
