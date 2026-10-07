// Minimal PGN reader/writer with comments and variations.
// parsePgn() returns { headers, root } where root is a move tree:
//   node = { san, comment, children: [node], parent }
// The root holds no move; its comment is the game introduction. children[0]
// is always the main continuation, further children are alternative moves.
// buildTree() replays the tree with chess.js and adds from/to/fen/ply.
(function (root) {
  const RESULTS = ['1-0', '0-1', '1/2-1/2', '*'];
  const newNode = (san, parent) => ({ san, comment: '', children: [], parent });

  function parsePgn(text) {
    const headers = {};
    const top = newNode(null, null);
    let cur = top;
    const stack = [];
    let preComment = ''; // comment right after "(" belongs to the next move
    let varStart = false;
    let i = 0;

    const addComment = (c) => {
      c = c.replace(/\s+/g, ' ').trim();
      if (!c) return;
      if (varStart) preComment = preComment ? `${preComment} ${c}` : c;
      else cur.comment = cur.comment ? `${cur.comment} ${c}` : c;
    };

    while (i < text.length) {
      const ch = text[i];
      if (/\s/.test(ch)) { i++; continue; }
      if (ch === '[') {
        const end = text.indexOf(']', i);
        const m = text.slice(i, end + 1).match(/^\[(\w+)\s+"(.*)"\]$/);
        if (m) headers[m[1]] = m[2];
        i = end === -1 ? text.length : end + 1;
        continue;
      }
      if (ch === '{' || ch === ';') {
        const end = text.indexOf(ch === '{' ? '}' : '\n', i);
        addComment(text.slice(i + 1, end === -1 ? text.length : end));
        i = end === -1 ? text.length : end + 1;
        continue;
      }
      if (ch === '(') {
        // An alternative to the last move: branch from the position before it.
        stack.push(cur);
        cur = cur.parent || cur;
        varStart = true;
        preComment = '';
        i++;
        continue;
      }
      if (ch === ')') {
        if (stack.length) cur = stack.pop();
        varStart = false;
        i++;
        continue;
      }

      let j = i;
      while (j < text.length && !/[\s{}();\[]/.test(text[j])) j++;
      let tok = text.slice(i, j);
      i = j;
      if (RESULTS.includes(tok)) { if (!stack.length) headers.Result = headers.Result || tok; continue; }
      tok = tok.replace(/^\d+\.+/, ''); // "12.e4" or "12..." prefix
      tok = tok.replace(/[!?]+$/, '').replace(/^0-0-0/, 'O-O-O').replace(/^0-0/, 'O-O');
      if (!/^[KQRBNa-hO]/.test(tok)) continue; // move numbers, NAGs, annotation symbols
      const node = newNode(tok, cur);
      if (preComment) { node.preComment = preComment; preComment = ''; }
      cur.children.push(node);
      cur = node;
      varStart = false;
    }
    return { headers, root: top };
  }

  // Replays every line with chess.js, normalising SAN and adding from/to/fen/ply.
  // Throws a readable error on the first illegal move.
  function buildTree(ChessCtor, top) {
    top.fen = new ChessCtor().fen();
    top.ply = 0;
    const walk = (node, inVariation) => {
      node.children.forEach((child, idx) => {
        const game = new ChessCtor(node.fen);
        const mv = game.move(child.san, { sloppy: true });
        const ply = node.ply + 1;
        if (!mv) {
          const num = Math.ceil(ply / 2);
          const where = inVariation || idx > 0 ? ' (in an alternative line)' : '';
          throw new Error(`Illegal or unreadable move "${child.san}" at ${num}${ply % 2 ? '.' : '...'}${where}`);
        }
        Object.assign(child, { san: mv.san, from: mv.from, to: mv.to, fen: game.fen(), ply });
        if (child.preComment) {
          child.comment = child.comment ? `${child.preComment} ${child.comment}` : child.preComment;
          delete child.preComment;
        }
        walk(child, inVariation || idx > 0);
      });
    };
    walk(top, false);
    return top;
  }

  function toPgn(top, result) {
    const clean = (c) => c.replace(/[{}]/g, '');
    const moveText = (n, needNum) =>
      n.ply % 2 ? `${Math.ceil(n.ply / 2)}. ${n.san}` : needNum ? `${n.ply / 2}... ${n.san}` : n.san;

    // Writes the continuation after `node`, with alternatives after each main move.
    const line = (node, needNum, out) => {
      while (node.children.length) {
        const [main, ...alts] = node.children;
        out.push(moveText(main, needNum));
        needNum = false;
        if (main.comment) { out.push(`{${clean(main.comment)}}`); needNum = true; }
        alts.forEach((alt) => {
          const sub = [moveText(alt, true)];
          if (alt.comment) sub.push(`{${clean(alt.comment)}}`);
          line(alt, !!alt.comment, sub);
          out.push(`(${sub.join(' ')})`);
          needNum = true;
        });
        node = main;
      }
      return out;
    };

    const out = [];
    if (top.comment) out.push(`{${clean(top.comment)}}`);
    line(top, false, out);
    out.push(result || '*');
    return out.join(' ');
  }

  const mainLine = (top) => {
    const nodes = [];
    for (let n = top.children[0]; n; n = n.children[0]) nodes.push(n);
    return nodes;
  };

  const api = { parsePgn, buildTree, toPgn, mainLine };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PGN = api;
})(this);
