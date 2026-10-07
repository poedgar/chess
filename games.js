// Built-in library of famous games. Commentary lives inside the PGN as {braces}:
// a comment before the first move is the game introduction, every other comment
// belongs to the move right before it. Alternative lines go in (parentheses).
window.DEFAULT_GAMES = [
  {
    id: 'opera-game',
    white: 'Paul Morphy',
    black: 'Duke Karl / Count Isouard',
    event: 'Paris Opera',
    year: '1858',
    result: '1-0',
    opening: 'Philidor Defence',
    tags: ['development', 'open lines', 'sacrifice'],
    pgn: `{Played in a box at the Paris Opera during a performance of The Barber of Seville. Morphy's opponents play passively and grab material, while Morphy develops every piece with tempo. It is the classic lesson on rapid development and open lines.}
1. e4 e5 2. Nf3 d6 {The Philidor Defence: solid, but a bit passive.}
3. d4 Bg4 {Pins the knight, but it gives up the bishop pair after the exchange.}
4. dxe5 Bxf3 {Black must give up the bishop.} (4... dxe5 {Recapturing loses a pawn:} 5. Qxd8+ Kxd8 6. Nxe5 {White wins a pawn, and the knight now attacks both the g4-bishop and f7.})
5. Qxf3 dxe5 6. Bc4 {Threatening Qxf7#. White is already well ahead in development.}
6... Nf6 7. Qb3 {A double attack on f7 and b7.}
7... Qe7 {Defends f7, but now the queen blocks the f8-bishop, so Black's kingside stays stuck.}
8. Nc3 {Morphy keeps developing instead of grabbing the b7 pawn. Development first!}
8... c6 9. Bg5 {Pins the f6-knight. Black's position is almost paralysed.}
9... b5 {Trying to drive the bishop away and gain space, but it opens lines toward Black's own king.}
10. Nxb5 {The first sacrifice. Lines matter more than material when the enemy king is still in the centre.}
10... cxb5 11. Bxb5+ Nbd7 12. O-O-O {Castling brings the rook to the open d-file with tempo on the pinned knight.}
12... Rd8 13. Rxd7 {Removing a defender. White gives back material to keep the attack going.}
13... Rxd7 14. Rd1 {Bringing up the last piece. Every white piece now takes part in the attack.}
14... Qe6 {Black tries to unpin by offering a queen trade.}
15. Bxd7+ Nxd7 16. Qb8+ {The famous queen sacrifice. It pulls the knight away from d7.}
16... Nxb8 17. Rd8# {Mate with only a rook and bishop left. A model of fast development, open lines and pins.}
1-0`
  },
  {
    id: 'immortal-game',
    white: 'Adolf Anderssen',
    black: 'Lionel Kieseritzky',
    event: 'London (casual game)',
    year: '1851',
    result: '1-0',
    opening: "King's Gambit Accepted, Bishop's Gambit",
    tags: ['romantic', 'sacrifice', 'mating net'],
    pgn: `{The most famous game of the Romantic era. White sacrifices a bishop, both rooks and finally the queen, then mates with the three minor pieces that are left. Black grabs material while White develops.}
1. e4 e5 2. f4 {The King's Gambit: White gives a pawn to open the f-file and control the centre.}
2... exf4 3. Bc4 Qh4+ 4. Kf1 {White's king has lost the right to castle, but the black queen is exposed and will become a target.}
4... b5 {The Bryan Counter-Gambit, which diverts the bishop from the a2-g8 diagonal.}
5. Bxb5 Nf6 6. Nf3 {Developing with tempo against the queen.}
6... Qh6 7. d3 Nh5 {Threatening ...Ng3+. Black keeps moving the same pieces.}
8. Nh4 Qg5 9. Nf5 {The knight is very strong on f5, eyeing g7 and d6.}
9... c6 10. g4 {A pawn sacrifice that gains time against the h5-knight.}
10... Nf6 11. Rg1 {Anderssen ignores the attacked bishop on b5 and gives it up to keep the initiative.}
11... cxb5 12. h4 Qg6 13. h5 Qg5 14. Qf3 {Threatening Bxf4, which would trap the black queen.}
14... Ng8 {A sad retreat. After 14 moves Black's only developed piece is the queen.}
15. Bxf4 Qf6 16. Nc3 Bc5 {Black attacks the rook on g1 and threatens ...Bxg1.}
17. Nd5 {Development over material! The knight jumps in with a threat on the queen.}
17... Qxb2 18. Bd6 {This offers both rooks. The bishop takes away e7 and f8 from the black king.}
18... Bxg1 {Taking the second rook. A more stubborn defence was 18...Qxa1+ first.} (18... Qxa1+ 19. Ke2 Qb2 {Black keeps the queen near the defence, but the position is still very difficult.})
19. e5 {Shutting the queen off from the defence of g7.}
19... Qxa1+ 20. Ke2 Na6 {Black is a queen's worth of material up, but has no defenders near the king.}
21. Nxg7+ Kd8 22. Qf6+ {The final sacrifice. The queen pulls the knight away from g8.}
22... Nxf6 23. Be7# {Mate by a bishop and two knights. White has given up two rooks, a bishop and the queen.}
1-0`
  },
  {
    id: 'evergreen-game',
    white: 'Adolf Anderssen',
    black: 'Jean Dufresne',
    event: 'Berlin (casual game)',
    year: '1852',
    result: '1-0',
    opening: 'Evans Gambit',
    tags: ['evans gambit', 'king in centre', 'combination'],
    pgn: `{Steinitz called this game "the evergreen in Anderssen's laurel wreath". Black builds a counter-attack on g2, but Anderssen's attack against the king stuck in the centre arrives first.}
1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. b4 {The Evans Gambit. White offers a pawn to gain time with c3 and d4.}
4... Bxb4 5. c3 Ba5 6. d4 exd4 7. O-O d3 {Black returns a pawn to keep the centre closed. This is a common defensive idea.}
8. Qb3 Qf6 9. e5 {Gains time on the queen and cuts it off from the defence.}
9... Qg6 10. Re1 Nge7 11. Ba3 {The bishop stops Black from castling kingside by eyeing e7 and f8.}
11... b5 {Black gives back a pawn to get the queen's rook into play.}
12. Qxb5 Rb8 13. Qa4 Bb6 14. Nbd2 Bb7 15. Ne4 Qf5 16. Bxd3 Qh5 {Black threatens ...Qxf3 and mate on g2. White has to act quickly.}
17. Nf6+ {Opening the g-file for Black too, but White's attack is faster.}
17... gxf6 18. exf6 Rg8 {Black threatens ...Qxf3 and ...Rxg2+.}
19. Rad1 {A calm move with a hidden point: the rook joins the attack on the d-file. One of the most famous quiet moves in chess.}
19... Qxf3 20. Rxe7+ {This starts the combination.}
20... Nxe7 21. Qxd7+ {A queen sacrifice that opens the d-file.}
21... Kxd7 22. Bf5+ {Double check! The king must move.}
22... Ke8 23. Bd7+ Kf8 24. Bxe7# {A mating pattern built on double check and the bishop pair.}
1-0`
  },
  {
    id: 'game-of-the-century',
    white: 'Donald Byrne',
    black: 'Robert James Fischer',
    event: 'Rosenwald Memorial, New York',
    year: '1956',
    result: '0-1',
    opening: 'Grünfeld Defence (by transposition)',
    tags: ['queen sacrifice', 'windmill', 'endgame technique'],
    pgn: `{13-year-old Bobby Fischer gives up his queen for a crushing attack and a mass of material. Hans Kmoch called it "The Game of the Century". Watch how Black's pieces work together after the sacrifice.}
1. Nf3 Nf6 2. c4 g6 3. Nc3 Bg7 4. d4 O-O 5. Bf4 d5 6. Qb3 dxc4 7. Qxc4 c6 8. e4 Nbd7 9. Rd1 Nb6 10. Qc5 Bg4 {Black has finished developing while White's king is still in the centre.}
11. Bg5 {White plays a natural developing move, but it is a mistake. 11.Be2 was safer.}
11... Na4 {A brilliant shot. The knight cannot be taken safely.} 12. Qa3 (12. Nxa4 Nxe4 {The knight attacks both the queen on c5 and the bishop on g5, and the e-file opens against White's king.}) 12... Nxc3 13. bxc3 Nxe4 {Black wins a pawn and opens the e-file against the uncastled king.}
14. Bxe7 Qb6 15. Bc4 Nxc3 16. Bc5 Rfe8+ 17. Kf1 Be6 {The famous queen sacrifice. If White takes the queen, Black's minor pieces start a "windmill" of checks.}
18. Bxb6 Bxc4+ 19. Kg1 Ne2+ 20. Kf1 Nxd4+ {A discovered check that picks up material while the king is driven back and forth.}
21. Kg1 Ne2+ 22. Kf1 Nc3+ 23. Kg1 axb6 {Black has a rook, two bishops and a pawn for the queen, and White's position is in ruins.}
24. Qb4 Ra4 25. Qxb6 Nxd1 26. h3 Rxa2 27. Kh2 Nxf2 28. Re1 Rxe1 29. Qd8+ Bf8 30. Nxe1 Bd5 31. Nf3 Ne4 {Black's pieces now go after the white king.}
32. Qb8 b5 33. h4 h5 34. Ne5 Kg7 {Breaking the pin on f8 and freeing the bishop.}
35. Kg1 Bc5+ 36. Kf1 Ng3+ 37. Ke1 Bb4+ 38. Kd1 Bb3+ 39. Kc1 Ne2+ 40. Kb1 Nc3+ 41. Kc1 Rc2# {A mating net made of minor pieces and a rook. The black queen is long gone.}
0-1`
  },
  {
    id: 'kasparov-immortal',
    white: 'Garry Kasparov',
    black: 'Veselin Topalov',
    event: 'Hoogovens, Wijk aan Zee',
    year: '1999',
    result: '1-0',
    opening: 'Pirc Defence',
    tags: ['rook sacrifice', 'king hunt', 'calculation'],
    pgn: `{"Kasparov's Immortal". A rook sacrifice on move 24 starts a king hunt that drags Black's king from b8 all the way to d1, deep inside White's camp.}
1. e4 d6 2. d4 Nf6 3. Nc3 g6 4. Be3 Bg7 5. Qd2 c6 6. f3 b5 7. Nge2 Nbd7 8. Bh6 Bxh6 9. Qxh6 Bb7 10. a3 e5 11. O-O-O Qe7 12. Kb1 a6 13. Nc1 O-O-O {Both kings are now on the queenside. White's queen on h6 has nothing to attack on the kingside, so the fight moves to the centre and the queenside.}
14. Nb3 exd4 15. Rxd4 c5 16. Rd1 Nb6 17. g3 Kb8 18. Na5 Ba8 19. Bh3 d5 20. Qf4+ Ka7 21. Rhe1 d4 22. Nd5 Nbxd5 23. exd5 Qd6 {Black blockades the d-pawn. It looks solid.}
24. Rxd4 {One of the most famous sacrifices in chess. Kasparov saw the king hunt that follows many moves deep.}
24... cxd4 25. Re7+ Kb6 26. Qxd4+ Kxa5 27. b4+ Ka4 28. Qc3 {Threatening Qb3 mate. The black king is trapped among its own pieces.}
28... Qxd5 29. Ra7 {A quiet rook move, aiming at the a8-bishop and the king's escape squares.}
29... Bb7 30. Rxb7 Qc4 31. Qxf6 Kxa3 32. Qxa6+ Kxb4 33. c3+ {A pawn check that keeps driving the king forward.}
33... Kxc3 34. Qa1+ Kd2 35. Qb2+ Kd1 {The black king has walked all the way to White's back rank.}
36. Bf1 {Another quiet move that cuts off the queen and threatens Qe2 mate.}
36... Rd2 37. Rd7 Rxd7 38. Bxc4 bxc4 39. Qxh8 {The tactics are over. White is a clean exchange and a pawn up.}
39... Rd3 40. Qa8 c3 41. Qa4+ Ke1 42. f4 f5 43. Kc1 Rd2 44. Qa7 {Black resigned. The c-pawn falls and White's extra material wins.}
1-0`
  }
];
