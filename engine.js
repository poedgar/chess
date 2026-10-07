// Stockfish running in a Web Worker. Loaded from cdnjs, so it works when the
// page is opened straight from disk: the script is fetched and started from a
// blob URL. The faster WebAssembly build is preferred, asm.js is the fallback.
//
// Engine.analyse(fen, { depth, onInfo }) resolves with the final search info
// { depth, score: { cp } | { mate }, pv: [uci] } (score is from the side to
// move), or with null when a newer request replaced it or Engine.stop() ran.
window.Engine = (() => {
  const BASE = 'https://cdnjs.cloudflare.com/ajax/libs/stockfish.js/10.0.2/';
  let worker = null;
  let starting = null;
  let current = null; // job being searched
  let queued = null;  // next job; only the newest request is kept

  const blobWorker = (code) =>
    new Worker(URL.createObjectURL(new Blob([code], { type: 'application/javascript' })));

  async function createWorker() {
    if (typeof WebAssembly === 'object') {
      try {
        const res = await fetch(BASE + 'stockfish.wasm.js');
        if (!res.ok) throw new Error(res.statusText);
        // The build looks for "stockfish.wasm" next to itself, which a blob URL can't resolve.
        const code = (await res.text()).replace(/(["'])stockfish\.wasm\1/g, JSON.stringify(BASE + 'stockfish.wasm'));
        return blobWorker(code);
      } catch { /* fall back to asm.js */ }
    }
    return blobWorker(`importScripts(${JSON.stringify(BASE + 'stockfish.js')});`);
  }

  function start() {
    if (starting) return starting;
    starting = new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Engine did not start')), 20000);
      createWorker().then((w) => {
        worker = w;
        w.onerror = () => { clearTimeout(timeout); reject(new Error('Engine failed to load')); };
        w.onmessage = (e) => {
          const line = String(e.data);
          if (line === 'readyok') { clearTimeout(timeout); resolve(); }
          else onLine(line);
        };
        w.postMessage('uci');
        w.postMessage('isready');
      }, (err) => { clearTimeout(timeout); reject(err); });
    });
    starting.catch(() => { starting = null; worker = null; });
    return starting;
  }

  function parseInfo(line) {
    if (/ (lower|upper)bound/.test(line) || / multipv ([2-9]|\d\d)/.test(line)) return null;
    const depth = line.match(/ depth (\d+)/);
    const score = line.match(/ score (cp|mate) (-?\d+)/);
    if (!depth || !score) return null;
    const pv = line.match(/ pv (.+)$/);
    return {
      depth: Number(depth[1]),
      score: { [score[1]]: Number(score[2]) },
      pv: pv ? pv[1].trim().split(/\s+/) : []
    };
  }

  function onLine(line) {
    if (!current) return;
    if (line.startsWith('info')) {
      const info = parseInfo(line);
      if (!info) return;
      current.last = info;
      if (!current.stopping && current.onInfo) current.onInfo(info);
    } else if (line.startsWith('bestmove')) {
      const job = current;
      current = null;
      job.resolve(job.stopping ? null : job.last);
      pump();
    }
  }

  function pump() {
    if (current) {
      if (queued && !current.stopping) { current.stopping = true; worker.postMessage('stop'); }
      return;
    }
    if (!queued) return;
    current = queued;
    queued = null;
    worker.postMessage(`position fen ${current.fen}`);
    worker.postMessage(`go depth ${current.depth}`);
  }

  function analyse(fen, { depth = 18, onInfo } = {}) {
    return new Promise((resolve, reject) => {
      if (queued) queued.resolve(null);
      queued = { fen, depth, onInfo, resolve, last: null };
      start().then(pump, (err) => {
        if (queued) { queued = null; }
        reject(err);
      });
    });
  }

  function stop() {
    if (queued) { queued.resolve(null); queued = null; }
    if (current && !current.stopping) { current.stopping = true; worker.postMessage('stop'); }
  }

  return { start, analyse, stop };
})();
