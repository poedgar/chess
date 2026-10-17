// Quizzes on positions from the built-in games, in four categories.
// `at` is the move to be played: '16.' is White's 16th move, '11...' Black's 11th.
// A quiz either asks for a move on the board (`solution`, in SAN; `exact` means
// only that move counts, without asking the engine about alternatives) or is a
// multiple-choice question (`options`, the first one is correct; the order is
// shuffled when shown). `move` is shown on the board after a choice is answered.
// "Play the answer" replays the game from the quiz position for `plies` half-moves
// (default 4, never past the end of the game).
window.QUIZ_CATEGORIES = [
  ['opening', 'Beginnings'],
  ['strategy', 'Strategy'],
  ['tactics', 'Tactics'],
  ['endgame', 'Endings']
];

window.QUIZZES = [
  // ---------- beginnings ----------
  {
    id: 'opera-philidor', cat: 'opening', game: 'opera-game', at: '3.',
    q: 'Black defended e5 with 2...d6. What is this opening called?',
    options: ['Philidor Defence', "Petrov's Defence", 'Pirc Defence', 'Scandinavian Defence'],
    explain: 'The Philidor Defence (1.e4 e5 2.Nf3 d6) is solid but passive: the d6-pawn shuts in the f8-bishop.'
  },
  {
    id: 'opera-dxe5', cat: 'opening', game: 'opera-game', at: '4...', move: 'Bxf3',
    q: 'Black played 4...Bxf3 here. Why not simply recapture with 4...dxe5?',
    options: [
      'After 5.Qxd8+ Kxd8 6.Nxe5 White wins a pawn and hits the g4-bishop and f7',
      'The d6-pawn is pinned, so 4...dxe5 is illegal',
      'It runs into mate in one',
      'It loses the queen to a discovered attack'
    ],
    explain: 'Trading queens first removes the defender of the g4-bishop. Black gives up the bishop pair to keep material level.'
  },
  {
    id: 'immortal-kings-gambit', cat: 'opening', game: 'immortal-game', at: '2.', solution: 'f4', exact: true,
    q: "Play the King's Gambit: offer a pawn to open the f-file and fight for the centre.",
    explain: "2.f4 is the King's Gambit, the favourite opening of the Romantic era. If Black takes, White hopes to play d4 and use the f-file."
  },
  {
    id: 'evergreen-evans', cat: 'opening', game: 'evergreen-game', at: '4.', solution: 'b4', exact: true,
    q: 'Play the Evans Gambit: give a pawn to gain time for c3 and d4.',
    explain: '4.b4 deflects the c5-bishop. After 4...Bxb4 5.c3 White gains a tempo on the bishop and builds a big centre with d4.'
  },
  {
    id: 'evergreen-d3', cat: 'opening', game: 'evergreen-game', at: '7...', move: 'd3',
    q: 'Black is two pawns up. Instead of 7...dxc3, Dufresne played 7...d3, giving a pawn back. What is the idea?',
    options: [
      'Keep the centre closed, so White gets fewer open lines against the uncastled king',
      'Prepare ...d2 and promote the pawn',
      'Attack the white queen on d1',
      'Trap the c4-bishop'
    ],
    explain: 'Taking on c3 would give White even more development and open lines. Returning a pawn to keep lines closed is a common defensive idea in gambits.'
  },
  {
    id: 'reti-caro-kann', cat: 'opening', game: 'reti-tartakower', at: '2.',
    q: 'Black answered 1.e4 with 1...c6, planning ...d5. What is this defence called?',
    options: ['Caro-Kann Defence', 'Sicilian Defence', 'French Defence', "Alekhine's Defence"],
    explain: 'The Caro-Kann prepares ...d5 without shutting in the c8-bishop, which is the main difference from the French (1...e6).'
  },
  {
    id: 'byrne-be2', cat: 'opening', game: 'game-of-the-century', at: '11.', move: 'Bg5',
    q: 'Fischer has finished developing and castled. Byrne played the natural 11.Bg5?, a mistake. What was the safer plan?',
    options: [
      '11.Be2, finishing development so the king can castle',
      '11.Qxe7, grabbing a pawn',
      '11.Kd2, walking the king to the queenside',
      '11.g4, starting a pawn storm'
    ],
    explain: "With the king still on e1, White should castle first. After 11.Bg5? Fischer's 11...Na4!! exploits the uncastled king and the loose queen on c5."
  },
  {
    id: 'deepblue-nxe6', cat: 'opening', game: 'deep-blue-kasparov', at: '8.', plies: 6, solution: 'Nxe6',
    q: '7...h6 is a known mistake in this Caro-Kann line. Punish it the way Deep Blue did.',
    explain: '8.Nxe6! gives a knight to keep Black\'s king stuck in the centre. After 8...Qe7 9.O-O fxe6 10.Bg6+ Kd8 the king can never castle.'
  },

  // ---------- strategy ----------
  {
    id: 'opera-nc3', cat: 'strategy', game: 'opera-game', at: '8.', move: 'Nc3',
    q: 'White could take a pawn with 8.Qxb7. Morphy played 8.Nc3 instead. Why?',
    options: [
      'Development first: one more piece joins while Black\'s kingside is still stuck',
      '8.Qxb7 would lose the queen',
      'To prepare castling on the kingside',
      'To prepare a pawn storm on the queenside'
    ],
    explain: 'Black\'s queen on e7 blocks the f8-bishop, so Black is far behind in development. Morphy keeps bringing pieces out and lets the lead in development decide the game.'
  },
  {
    id: 'opera-ooo', cat: 'strategy', game: 'opera-game', at: '12.', solution: 'O-O-O',
    q: 'Find the move that tucks the king away and brings a rook to the open d-file, hitting the pinned knight.',
    explain: '12.O-O-O! does two jobs at once. The rook on d1 attacks d7, which is pinned against the black king.'
  },
  {
    id: 'immortal-rg1', cat: 'strategy', game: 'immortal-game', at: '11.', move: 'Rg1',
    q: 'The bishop on b5 is attacked by the c6-pawn. Anderssen played 11.Rg1 and let it go. What was the thinking?',
    options: [
      'Keeping the initiative matters more than one bishop',
      'The bishop is defended, so ...cxb5 is impossible',
      'Rg1 prepares castling kingside',
      'White wants to trade rooks to reach an endgame'
    ],
    explain: 'The rook defends g4, and h4 next will chase the queen again. Black wins material but keeps losing time with the queen.'
  },
  {
    id: 'immortal-nd5', cat: 'strategy', game: 'immortal-game', at: '17.', solution: 'Nd5',
    q: 'Black threatens ...Bxg1. Ignore it and bring another piece into the attack with a threat.',
    explain: '17.Nd5! attacks the queen on f6 and threatens Nc7+, forking king and rook. Development counts more than material here.'
  },
  {
    id: 'evergreen-ba3', cat: 'strategy', game: 'evergreen-game', at: '11.', solution: 'Ba3',
    q: 'Black wants to castle kingside. Find the bishop move that stops it.',
    explain: '11.Ba3 eyes e7 and f8. Black\'s king can no longer escape to g8 safely and stays in the centre.'
  },
  {
    id: 'evergreen-rad1', cat: 'strategy', game: 'evergreen-game', at: '19.', plies: 11, solution: 'Rad1',
    q: 'Black threatens ...Qxf3 and ...Rxg2+. Anderssen found a famous quiet move that brings his last piece into play. Find it.',
    explain: '19.Rad1!! adds the rook to the d-file. When Black grabs on f3, the combination 20.Rxe7+ Nxe7 21.Qxd7+!! Kxd7 22.Bf5+ follows.'
  },
  {
    id: 'deepblue-knight-down', cat: 'strategy', game: 'deep-blue-kasparov', at: '11.', move: 'Bf4',
    q: 'White is a knight down. Why is White still clearly better?',
    options: [
      'Black\'s king has lost the right to castle and is stuck in the centre',
      'White wins the knight back by force on the next move',
      'Black\'s queen is trapped on e7',
      'White has two extra pawns'
    ],
    explain: 'The e-file will open and Black\'s pieces get in each other\'s way. Deep Blue builds the attack calmly with Bf4, a4 and Re1.'
  },
  {
    id: 'kasparov-ra7', cat: 'strategy', game: 'kasparov-immortal', at: '29.', move: 'Ra7',
    q: 'Topalov has just taken on d5. Kasparov played the quiet 29.Ra7. What is the rook aiming at?',
    options: [
      'The a8-bishop and the squares around the black king',
      'Doubling on the e-file',
      'Defending the white king on b1',
      'Trapping the black queen on d5'
    ],
    explain: 'With the king on a4, every square matters. Ra7 attacks the bishop and controls the a-file, so the king hunt can continue.'
  },
  {
    id: 'lasker-rf3', cat: 'strategy', game: 'lasker-bauer', at: '19.', plies: 7, solution: 'Rf3',
    q: 'Black\'s king has lost its pawn shield. Bring the rook into the attack along the third rank.',
    explain: '19.Rf3 is a classic rook lift. It threatens Rh3+ and mate, so Black has to give up the queen.'
  },

  // ---------- tactics ----------
  {
    id: 'opera-nxb5', cat: 'tactics', game: 'opera-game', at: '10.', plies: 7, solution: 'Nxb5',
    q: 'Black\'s last move ...b5 opened lines near the king. Find the sacrifice that rips them open.',
    explain: '10.Nxb5! gives a knight for two pawns. With Black\'s king in the centre, open lines are worth more than material.'
  },
  {
    id: 'immortal-bd6', cat: 'tactics', game: 'immortal-game', at: '18.', plies: 11, solution: 'Bd6',
    q: 'Find the stunning bishop move that offers both rooks.',
    explain: '18.Bd6!! takes e7 and f8 away from the black king and blocks the d-pawn. Black can grab both rooks, but White\'s pieces are all aimed at the king.'
  },
  {
    id: 'evergreen-rxe7', cat: 'tactics', game: 'evergreen-game', at: '20.', plies: 9, solution: 'Rxe7+',
    q: 'Black has just taken on f3 and threatens mate on g2. Start the combination with a check.',
    explain: '20.Rxe7+ Nxe7 21.Qxd7+!! Kxd7 22.Bf5+ (double check) Ke8 23.Bd7+ Kf8 24.Bxe7#.'
  },
  {
    id: 'fischer-na4', cat: 'tactics', game: 'game-of-the-century', at: '11...', plies: 5, solution: 'Na4',
    q: 'White\'s queen on c5 and king on e1 are loose. Find Fischer\'s brilliant knight move.',
    explain: '11...Na4!! If 12.Nxa4 Nxe4, the knight attacks the queen and the g5-bishop and opens the e-file. The c3-knight was guarding e4.'
  },
  {
    id: 'fischer-be6', cat: 'tactics', game: 'game-of-the-century', at: '17...', plies: 13, solution: 'Be6',
    q: 'Black\'s queen is attacked. Fischer did not move it. Find his move.',
    explain: '17...Be6!! After 18.Bxb6 Bxc4+ the "windmill" of discovered checks with the knight collects a mass of material.'
  },
  {
    id: 'reti-qd8', cat: 'tactics', game: 'reti-tartakower', at: '9.', plies: 5, solution: 'Qd8+',
    q: 'Black just took the knight on e4. Punish it with a queen sacrifice.',
    explain: '9.Qd8+!! Kxd8 10.Bg5+ is a double check from the bishop and the d1-rook, and mate follows on the next move.'
  },
  {
    id: 'kasparov-rxd4', cat: 'tactics', game: 'kasparov-immortal', at: '24.', plies: 9, solution: 'Rxd4',
    q: 'Black has blockaded the d-pawn and looks solid. Find the rook sacrifice that starts a king hunt.',
    explain: '24.Rxd4!! cxd4 25.Re7+ drives the king out: 25...Kb6 26.Qxd4+ Kxa5 27.b4+ Ka4 28.Qc3 and the king is trapped.'
  },
  {
    id: 'lasker-nh5', cat: 'tactics', game: 'lasker-bauer', at: '14.', plies: 7, solution: 'Nh5',
    q: 'The f6-knight is the key defender of h7. Remove it.',
    explain: '14.Nh5 offers a trade of the defender. After 14...Nxh5 the h7-pawn is ready for the first bishop sacrifice.'
  },
  {
    id: 'lasker-bxh7', cat: 'tactics', game: 'lasker-bauer', at: '15.', plies: 5, solution: 'Bxh7+',
    q: 'The defender is gone. Start the double bishop sacrifice.',
    explain: '15.Bxh7+! Kxh7 16.Qxh5+ Kg8 17.Bxg7! and the second bishop strips the king completely.'
  },
  {
    id: 'lasker-qd7', cat: 'tactics', game: 'lasker-bauer', at: '22.', solution: 'Qd7',
    q: 'The attack forced Black to give up the queen. Now find the fork that wins more material.',
    explain: '22.Qd7! attacks both the e7-bishop and the b7-bishop. One of them falls.'
  },

  // ---------- endings ----------
  {
    id: 'opera-mate', cat: 'endgame', game: 'opera-game', at: '16.', plies: 3, solution: 'Qb8+',
    q: 'Mate in 2. The d7-knight is the only defender of d8.',
    explain: '16.Qb8+!! Nxb8 17.Rd8#. The queen sacrifice pulls the knight away, and rook and bishop deliver mate.'
  },
  {
    id: 'immortal-mate', cat: 'endgame', game: 'immortal-game', at: '22.', plies: 3, solution: 'Qf6+',
    q: 'Mate in 2. White has only a queen and three minor pieces left. Use them.',
    explain: '22.Qf6+!! Nxf6 23.Be7#. Mate with a bishop and two knights after giving up both rooks, a bishop and the queen.'
  },
  {
    id: 'evergreen-mate', cat: 'endgame', game: 'evergreen-game', at: '22.', plies: 5, solution: 'Bf5+',
    q: 'Mate in 3. Start with a double check.',
    explain: '22.Bf5+ (double check from the bishop and the d1-rook) Ke8 23.Bd7+ Kf8 24.Bxe7#. If 22...Kc6, then 23.Bd7#.'
  },
  {
    id: 'reti-mate', cat: 'endgame', game: 'reti-tartakower', at: '10.', plies: 3, solution: 'Bg5+',
    q: 'Mate in 2. The black king stands on the open d-file.',
    explain: '10.Bg5+ is a double check, so only a king move helps. 10...Kc7 11.Bd8# or 10...Ke8 11.Rd8#.'
  },
  {
    id: 'fischer-mate', cat: 'endgame', game: 'game-of-the-century', at: '41...', solution: 'Rc2#',
    q: 'Mate in 1. The rook and minor pieces have built a net around the white king.',
    explain: '41...Rc2#. The b3-bishop protects the rook, the rook covers b2 and d2, and the c3-knight covers b1 and d1.'
  },
  {
    id: 'kasparov-bf1', cat: 'endgame', game: 'kasparov-immortal', at: '36.', plies: 8, move: 'Bf1',
    q: 'The black king has walked all the way to d1. Kasparov played the quiet 36.Bf1. What does it threaten?',
    options: ['Qe2 mate', 'Rxb5, winning a pawn', 'Rd7, winning the d8-rook', 'Qc1+, forcing a queen trade'],
    explain: 'Bf1 attacks the queen and guards e2, so Qe2# is threatened. Black has to give back material to stop it.'
  },
  {
    id: 'kasparov-qxh8', cat: 'endgame', game: 'kasparov-immortal', at: '39.', solution: 'Qxh8',
    q: 'The king hunt is over. Cash in: win material and head for a won endgame.',
    explain: '39.Qxh8 takes the rook. White is a clean exchange and a pawn up, and the rest is technique.'
  }
];
