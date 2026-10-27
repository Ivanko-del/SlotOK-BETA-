// ╔══════════════════════════════════════════════════════════════╗
// ║  ШАХИ — повний рушій з нуля (без зовнішніх бібліотек)        ║
// ╚══════════════════════════════════════════════════════════════╝

const CHESS_INITIAL_BOARD = [
  ['bR','bN','bB','bQ','bK','bB','bN','bR'],
  ['bP','bP','bP','bP','bP','bP','bP','bP'],
  [null,null,null,null,null,null,null,null],
  [null,null,null,null,null,null,null,null],
  [null,null,null,null,null,null,null,null],
  [null,null,null,null,null,null,null,null],
  ['wP','wP','wP','wP','wP','wP','wP','wP'],
  ['wR','wN','wB','wQ','wK','wB','wN','wR'],
];

const CHESS_PIECE_UNICODE = {
  wK:'♔', wQ:'♕', wR:'♖', wB:'♗', wN:'♘', wP:'♙',
  bK:'♚', bQ:'♛', bR:'♜', bB:'♝', bN:'♞', bP:'♟',
};

const CHESS_PIECE_VALUE = { P:1, N:3, B:3, R:5, Q:9, K:0 };

// ── Допоміжні ──
function chessCloneBoard(board) { return board.map(row => row.slice()); }
function chessInBounds(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }
function chessColorOf(piece) { return piece ? piece[0] : null; }
function chessTypeOf(piece) { return piece ? piece[1] : null; }
function chessEnemyColor(color) { return color === 'w' ? 'b' : 'w'; }

// ── Пошук короля ──
function chessFindKing(board, color) {
  for(let r = 0; r < 8; r++) for(let c = 0; c < 8; c++) {
    if(board[r][c] === color + 'K') return { r, c };
  }
  return null;
}

// ── Чи атакована клітинка кольором byColor (без урахування шаху власному королю — сирі атаки) ──
function chessIsSquareAttacked(board, tr, tc, byColor) {
  // Пішаки
  const pawnDir = byColor === 'w' ? 1 : -1; // білий пішак атакує "вгору" з точки зору row (бо в byColor row звідки атакує = tr + pawnDir)
  for(const dc of [-1, 1]) {
    const r = tr + pawnDir, c = tc + dc;
    if(chessInBounds(r,c) && board[r][c] === byColor + 'P') return true;
  }
  // Коні
  const knightDeltas = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
  for(const [dr,dc] of knightDeltas) {
    const r = tr+dr, c = tc+dc;
    if(chessInBounds(r,c) && board[r][c] === byColor + 'N') return true;
  }
  // Король (сусідні клітинки)
  for(let dr=-1; dr<=1; dr++) for(let dc=-1; dc<=1; dc++) {
    if(!dr && !dc) continue;
    const r = tr+dr, c = tc+dc;
    if(chessInBounds(r,c) && board[r][c] === byColor + 'K') return true;
  }
  // Ковзні фігури: слон/ферзь по діагоналях, тура/ферзь по лініях
  const diagDirs = [[-1,-1],[-1,1],[1,-1],[1,1]];
  for(const [dr,dc] of diagDirs) {
    let r = tr+dr, c = tc+dc;
    while(chessInBounds(r,c)) {
      const p = board[r][c];
      if(p) {
        if(chessColorOf(p) === byColor && (chessTypeOf(p)==='B' || chessTypeOf(p)==='Q')) return true;
        break;
      }
      r += dr; c += dc;
    }
  }
  const straightDirs = [[-1,0],[1,0],[0,-1],[0,1]];
  for(const [dr,dc] of straightDirs) {
    let r = tr+dr, c = tc+dc;
    while(chessInBounds(r,c)) {
      const p = board[r][c];
      if(p) {
        if(chessColorOf(p) === byColor && (chessTypeOf(p)==='R' || chessTypeOf(p)==='Q')) return true;
        break;
      }
      r += dr; c += dc;
    }
  }
  return false;
}

function chessIsInCheck(board, color) {
  const king = chessFindKing(board, color);
  if(!king) return false;
  return chessIsSquareAttacked(board, king.r, king.c, chessEnemyColor(color));
}

// ── Псевдо-легальні ходи однієї фігури (без фільтра "не залишати короля під шахом") ──
function chessPseudoMoves(board, r, c, state) {
  const piece = board[r][c];
  if(!piece) return [];
  const color = chessColorOf(piece), type = chessTypeOf(piece);
  const moves = [];
  const push = (tr, tc, flags) => { if(chessInBounds(tr,tc)) moves.push({ from:{r,c}, to:{r:tr,c:tc}, flags: flags||{} }); };

  if(type === 'P') {
    const dir = color === 'w' ? -1 : 1;
    const startRow = color === 'w' ? 6 : 1;
    const promoRow = color === 'w' ? 0 : 7;
    // Один крок вперед
    if(chessInBounds(r+dir,c) && !board[r+dir][c]) {
      push(r+dir, c, { promotion: r+dir === promoRow });
      // Два кроки зі старту
      if(r === startRow && !board[r+2*dir][c]) push(r+2*dir, c, { doubleStep:true });
    }
    // Взяття по діагоналі
    for(const dc of [-1,1]) {
      const tr=r+dir, tc=c+dc;
      if(chessInBounds(tr,tc)) {
        const target = board[tr][tc];
        if(target && chessColorOf(target) !== color) push(tr, tc, { capture:true, promotion: tr===promoRow });
        // En passant
        else if(!target && state.enPassantTarget && state.enPassantTarget.r===tr && state.enPassantTarget.c===tc) {
          push(tr, tc, { enPassant:true });
        }
      }
    }
  }
  else if(type === 'N') {
    const deltas = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
    for(const [dr,dc] of deltas) {
      const tr=r+dr, tc=c+dc;
      if(!chessInBounds(tr,tc)) continue;
      const target = board[tr][tc];
      if(!target || chessColorOf(target) !== color) push(tr, tc, { capture: !!target });
    }
  }
  else if(type === 'B' || type === 'R' || type === 'Q') {
    const dirs = type === 'B' ? [[-1,-1],[-1,1],[1,-1],[1,1]]
               : type === 'R' ? [[-1,0],[1,0],[0,-1],[0,1]]
               : [[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]];
    for(const [dr,dc] of dirs) {
      let tr=r+dr, tc=c+dc;
      while(chessInBounds(tr,tc)) {
        const target = board[tr][tc];
        if(!target) { push(tr,tc,{}); }
        else { if(chessColorOf(target) !== color) push(tr,tc,{capture:true}); break; }
        tr+=dr; tc+=dc;
      }
    }
  }
  else if(type === 'K') {
    for(let dr=-1; dr<=1; dr++) for(let dc=-1; dc<=1; dc++) {
      if(!dr && !dc) continue;
      const tr=r+dr, tc=c+dc;
      if(!chessInBounds(tr,tc)) continue;
      const target = board[tr][tc];
      if(!target || chessColorOf(target) !== color) push(tr,tc,{capture: !!target});
    }
    // Рокіровка
    const rights = state.castling[color];
    const row = color === 'w' ? 7 : 0;
    if(r === row && c === 4 && !chessIsInCheck(board, color)) {
      // Коротка (королівський фланг)
      if(rights.k && !board[row][5] && !board[row][6] && board[row][7] === color+'R') {
        if(!chessIsSquareAttacked(board, row, 5, chessEnemyColor(color)) &&
           !chessIsSquareAttacked(board, row, 6, chessEnemyColor(color))) {
          push(row, 6, { castle:'k' });
        }
      }
      // Довга (ферзевий фланг)
      if(rights.q && !board[row][1] && !board[row][2] && !board[row][3] && board[row][0] === color+'R') {
        if(!chessIsSquareAttacked(board, row, 3, chessEnemyColor(color)) &&
           !chessIsSquareAttacked(board, row, 2, chessEnemyColor(color))) {
          push(row, 2, { castle:'q' });
        }
      }
    }
  }
  return moves;
}

// ── Застосувати хід (повертає НОВИЙ board + оновлений state) ──
function chessApplyMove(board, state, move, promoChoice) {
  const newBoard = chessCloneBoard(board);
  const { from, to, flags } = move;
  const piece = newBoard[from.r][from.c];
  const color = chessColorOf(piece);
  // Ручне клонування замість JSON.parse(JSON.stringify(state)) — цей виклик
  // тепер відбувається мільйони разів під час пошуку ходу для AI, і JSON-клон
  // маленького об'єкта в рази повільніший за пряме копіювання полів.
  const newState = {
    turn: state.turn,
    castling: { w: { k: state.castling.w.k, q: state.castling.w.q }, b: { k: state.castling.b.k, q: state.castling.b.q } },
    enPassantTarget: state.enPassantTarget ? { r: state.enPassantTarget.r, c: state.enPassantTarget.c } : null,
    lastMove: state.lastMove,
  };

  let capturedPiece = newBoard[to.r][to.c];

  // En passant capture — з'їдена пішка стоїть НЕ на цільовій клітинці
  if(flags.enPassant) {
    const capRow = color === 'w' ? to.r + 1 : to.r - 1;
    capturedPiece = newBoard[capRow][to.c];
    newBoard[capRow][to.c] = null;
  }

  newBoard[to.r][to.c] = piece;
  newBoard[from.r][from.c] = null;

  // Промоція
  if(flags.promotion) {
    newBoard[to.r][to.c] = color + (promoChoice || 'Q');
  }

  // Рокіровка — переставити туру
  if(flags.castle === 'k') {
    const row = from.r;
    newBoard[row][5] = newBoard[row][7]; newBoard[row][7] = null;
  } else if(flags.castle === 'q') {
    const row = from.r;
    newBoard[row][3] = newBoard[row][0]; newBoard[row][0] = null;
  }

  // Оновити права рокіровки
  if(chessTypeOf(piece) === 'K') { newState.castling[color].k = false; newState.castling[color].q = false; }
  if(chessTypeOf(piece) === 'R') {
    if(from.c === 0) newState.castling[color].q = false;
    if(from.c === 7) newState.castling[color].k = false;
  }
  // Якщо з'їли туру суперника на її стартовій клітинці — теж гасимо права
  if(to.r === 0 || to.r === 7) {
    if(to.c === 0) newState.castling[chessEnemyColor(color)].q = false;
    if(to.c === 7) newState.castling[chessEnemyColor(color)].k = false;
  }

  // En passant ціль для НАСТУПНОГО ходу
  newState.enPassantTarget = null;
  if(flags.doubleStep) {
    newState.enPassantTarget = { r: (from.r + to.r) / 2, c: from.c };
  }

  newState.turn = chessEnemyColor(state.turn);
  newState.lastMove = { from, to };

  return { board: newBoard, state: newState, capturedPiece };
}

// ── Усі легальні ходи кольору (фільтр: не залишати свого короля під шахом) ──
function chessAllLegalMoves(board, color, state) {
  const legal = [];
  for(let r = 0; r < 8; r++) for(let c = 0; c < 8; c++) {
    const piece = board[r][c];
    if(!piece || chessColorOf(piece) !== color) continue;
    const pseudo = chessPseudoMoves(board, r, c, state);
    for(const m of pseudo) {
      const { board: testBoard } = chessApplyMove(board, state, m, 'Q');
      if(!chessIsInCheck(testBoard, color)) legal.push(m);
    }
  }
  return legal;
}

function chessGameStatus(board, color, state) {
  const legal = chessAllLegalMoves(board, color, state);
  const inCheck = chessIsInCheck(board, color);
  if(legal.length === 0) {
    return inCheck ? 'checkmate' : 'stalemate';
  }
  return inCheck ? 'check' : 'normal';
}

// ── Проста оцінка позиції (для AI) ──
const CHESS_PST_PAWN = [ // бонус за просунуту/центральну пішку (з точки зору білих, row0=верх)
  [0,0,0,0,0,0,0,0],[5,5,5,5,5,5,5,5],[1,1,2,3,3,2,1,1],[0.5,0.5,1,2.5,2.5,1,0.5,0.5],
  [0,0,0,2,2,0,0,0],[0.5,-0.5,-1,0,0,-1,-0.5,0.5],[0.5,1,1,-2,-2,1,1,0.5],[0,0,0,0,0,0,0,0]
];
function chessEvaluate(board) {
  let score = 0;
  for(let r=0;r<8;r++) for(let c=0;c<8;c++) {
    const p = board[r][c]; if(!p) continue;
    const val = CHESS_PIECE_VALUE[chessTypeOf(p)];
    const sign = chessColorOf(p) === 'w' ? 1 : -1;
    score += sign * val;
    if(chessTypeOf(p) === 'P') {
      const pst = chessColorOf(p) === 'w' ? CHESS_PST_PAWN[r] : CHESS_PST_PAWN[7-r];
      score += sign * pst[c] * 0.1;
    }
    // Легкий бонус за контроль центру для коня/слона
    if((chessTypeOf(p)==='N' || chessTypeOf(p)==='B') && r>=2 && r<=5 && c>=2 && c<=5) score += sign * 0.15;
  }
  return score;
}

// ── AI: вибір ходу за складністю ──
function chessOrderMoves(moves) {
  // Спочатку взяття — рухає найкращі кандидати наперед, тому альфа-бета
  // відсікає набагато більше гілок (без цього порядок ходів випадковий,
  // і відсічення майже не спрацьовує).
  return moves.slice().sort((a, b) => (b.flags.capture ? 1 : 0) - (a.flags.capture ? 1 : 0));
}

// Негамакс з альфа-бета відсіканням, оцінка завжди з точки зору сторони color.
// Раніше "hard" рахував лише 2 півходи і взагалі не відсікав гілки (alpha/beta
// рахувались, але ніколи не використовувались щоб перервати перебір) — бот
// бачив лише "мій хід → найгірша відповідь суперника з перших 12", тому легко
// пропускав прості тактики на 3+ ходи. Тепер повний перебір на глибину depth
// з реальним відсіканням — на порядок сильніша гра при тій самій швидкості.
function chessNegamax(board, state, depth, alpha, beta, color) {
  const legal = chessAllLegalMoves(board, color, state);
  if(!legal.length) {
    if(chessIsInCheck(board, color)) return -99000 - depth; // мат нам; глибший мат — менш терміновий, тож trade-off у мінус з запасом
    return 0; // пат
  }
  if(depth === 0) return chessEvaluate(board) * (color === 'w' ? 1 : -1);

  let best = -Infinity;
  for(const m of chessOrderMoves(legal)) {
    const { board: nb, state: ns } = chessApplyMove(board, state, m, 'Q');
    const val = -chessNegamax(nb, ns, depth - 1, -beta, -alpha, chessEnemyColor(color));
    if(val > best) best = val;
    if(best > alpha) alpha = best;
    if(alpha >= beta) break; // відсікання гілки
  }
  return best;
}

const CHESS_AI_DEPTH = { medium: 2, hard: 3 };

function chessAiPickMove(board, color, state, difficulty) {
  const legal = chessAllLegalMoves(board, color, state);
  if(!legal.length) return null;

  if(difficulty === 'easy') {
    // Легка вага в бік захоплень, але переважно випадково
    const captures = legal.filter(m => m.flags.capture);
    if(captures.length && Math.random() < 0.4) return captures[Math.floor(Math.random()*captures.length)];
    return legal[Math.floor(Math.random()*legal.length)];
  }

  // medium/hard: повний негамакс з альфа-бета відсіканням на відповідну глибину
  const depth = CHESS_AI_DEPTH[difficulty] || CHESS_AI_DEPTH.hard;
  const enemyColor = chessEnemyColor(color);
  let bestMove = null, bestScore = -Infinity;
  let alpha = -Infinity;
  const beta = Infinity;
  for(const m of chessOrderMoves(legal)) {
    const { board: nb, state: ns } = chessApplyMove(board, state, m, 'Q');
    const val = -chessNegamax(nb, ns, depth - 1, -beta, -alpha, enemyColor);
    if(val > bestScore) { bestScore = val; bestMove = m; }
    if(bestScore > alpha) alpha = bestScore;
  }
  return bestMove || legal[Math.floor(Math.random()*legal.length)];
}

// ── Позначення ходу алгебраїчною нотацією (спрощено, для історії) ──
function chessMoveNotation(piece, move) {
  const files = 'abcdefgh';
  const type = chessTypeOf(piece);
  const toSq = files[move.to.c] + (8 - move.to.r);
  if(move.flags.castle === 'k') return 'O-O';
  if(move.flags.castle === 'q') return 'O-O-O';
  const letter = type === 'P' ? '' : type;
  const cap = move.flags.capture || move.flags.enPassant ? 'x' : '';
  const fromFile = type === 'P' && cap ? files[move.from.c] : '';
  return letter + fromFile + cap + toSq + (move.flags.promotion ? '=Q' : '');
}

// ╔══════════════════════════════════════════════════════════════╗
// ║  ШАХИ — ігровий флоу: vs AI, vs Гравець (PvP), UI            ║
// ╚══════════════════════════════════════════════════════════════╝

let chessGame = null; // { board, state, mode:'ai'|'pvp', color, bet, aiDifficulty, roomId, selected, legalForSelected, gameOver }
let chessRoomListener = null;

const CHESS_AI_PAYOUT = { easy: 1.8, medium: 3, hard: 5 };

function chessNewState() {
  return { turn:'w', castling:{w:{k:true,q:true},b:{k:true,q:true}}, enPassantTarget:null, lastMove:null };
}

// ── ЗАПУСК ГРИ ПРОТИ AI ──
let chessSelectedMode = 'ai';
let chessSelectedDifficulty = 'easy';

function chessSwitchMode(mode) {
  chessSelectedMode = mode;
  document.getElementById('chessModeAiBtn')?.classList.toggle('selected', mode === 'ai');
  document.getElementById('chessModePvpBtn')?.classList.toggle('selected', mode === 'pvp');
  document.getElementById('chessAiOptions')?.classList.toggle('hidden', mode !== 'ai');
  document.getElementById('chessPvpRoomsPanel')?.classList.toggle('hidden', mode !== 'pvp');
  const startBtn = document.getElementById('chessStartBtn');
  if(startBtn) startBtn.classList.toggle('hidden', mode === 'pvp');
  if(mode === 'pvp') loadChessRooms();
}

function chessSelectDifficulty(diff) {
  chessSelectedDifficulty = diff;
  ['Easy','Medium','Hard'].forEach(d => {
    document.getElementById('chessDiff'+d)?.classList.toggle('selected', d.toLowerCase() === diff);
  });
}

function chessStartFromSetup() {
  if(chessSelectedMode === 'ai') {
    startChessVsAi(chessSelectedDifficulty);
  }
  // pvp режим стартує через createChessRoom()/joinChessRoom() напряму з кнопок списку кімнат
}

function startChessVsAi(difficulty) {
  const betInput = document.getElementById('chessBetAmount');
  const bet = validateBet(betInput ? betInput.value : 0);
  if(!bet) return;
  db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(-bet));
  addWager(bet); trackQuest('totalGames',1); trackLbStat('wager',bet); trackLbStat('games',1);
  publishLiveBet('Шахи ♟️','♟️', bet, difficulty);

  chessGame = {
    board: chessCloneBoard(CHESS_INITIAL_BOARD),
    state: chessNewState(),
    mode: 'ai', color: 'w', bet, aiDifficulty: difficulty,
    selected: null, legalForSelected: [], gameOver: false, capturedByWhite: [], capturedByBlack: [],
  };
  document.getElementById('chessSetupPanel')?.classList.add('hidden');
  document.getElementById('chessGameArea')?.classList.remove('hidden');
  chessUpdateStatusLine('🎮 Твій хід (граєш білими)');
  renderChessBoard();
}

// ── КЛІК ПО КЛІТИНЦІ ──
function chessSquareClick(r, c) {
  if(!chessGame || chessGame.gameOver) return;
  if(chessGame.mode === 'ai' && chessGame.state.turn !== chessGame.color) return; // хід AI, чекаємо
  if(chessGame.mode === 'pvp' && chessGame.state.turn !== chessGame.color) return; // хід суперника

  const board = chessGame.board;
  const piece = board[r][c];

  // Якщо вже є вибрана фігура — спробувати зробити хід
  if(chessGame.selected) {
    const move = chessGame.legalForSelected.find(m => m.to.r === r && m.to.c === c);
    if(move) {
      chessExecuteMove(move);
      return;
    }
    // Клік по іншій своїй фігурі — перевибір
    if(piece && chessColorOf(piece) === chessGame.color) {
      chessSelectSquare(r, c);
    } else {
      chessGame.selected = null; chessGame.legalForSelected = [];
      renderChessBoard();
    }
    return;
  }

  // Нічого не вибрано — вибрати якщо своя фігура
  if(piece && chessColorOf(piece) === chessGame.color) {
    chessSelectSquare(r, c);
  }
}

function chessSelectSquare(r, c) {
  const board = chessGame.board;
  const allLegal = chessAllLegalMoves(board, chessGame.color, chessGame.state);
  const forThisPiece = allLegal.filter(m => m.from.r === r && m.from.c === c);
  chessGame.selected = { r, c };
  chessGame.legalForSelected = forThisPiece;
  renderChessBoard();
}

// ── ВИКОНАННЯ ХОДУ (з обробкою промоції) ──
function chessExecuteMove(move, promoChoice) {
  if(move.flags.promotion && !promoChoice) {
    chessShowPromotionPicker(move);
    return;
  }
  const piece = chessGame.board[move.from.r][move.from.c];
  const { board, state, capturedPiece } = chessApplyMove(chessGame.board, chessGame.state, move, promoChoice || 'Q');
  if(capturedPiece) {
    if(chessColorOf(capturedPiece) === 'w') chessGame.capturedByBlack.push(capturedPiece);
    else chessGame.capturedByWhite.push(capturedPiece);
  }
  chessGame.board = board;
  chessGame.state = state;
  chessGame.selected = null;
  chessGame.legalForSelected = [];
  chessAddMoveToHistory(piece, move);
  playSound('click');

  if(chessGame.mode === 'pvp') {
    chessSyncMoveToFirebase(move, promoChoice || 'Q');
  }

  renderChessBoard();

  const status = chessGameStatus(chessGame.board, chessGame.state.turn, chessGame.state);
  if(status === 'checkmate' || status === 'stalemate') {
    chessHandleGameEnd(status);
    return;
  }
  chessUpdateStatusLine(status === 'check' ? '⚠️ Шах!' : (chessGame.state.turn === chessGame.color ? '🎮 Твій хід' : '⏳ Хід суперника'));

  // Хід AI
  if(chessGame.mode === 'ai' && chessGame.state.turn !== chessGame.color && !chessGame.gameOver) {
    setTimeout(chessAiTurn, 700 + Math.random()*600);
  }
}

function chessAiTurn() {
  if(!chessGame || chessGame.gameOver) return;
  const aiColor = chessEnemyColor(chessGame.color);
  const move = chessAiPickMove(chessGame.board, aiColor, chessGame.state, chessGame.aiDifficulty);
  if(!move) { chessHandleGameEnd('stalemate'); return; }
  const piece = chessGame.board[move.from.r][move.from.c];
  let promoChoice = 'Q';
  const { board, state, capturedPiece } = chessApplyMove(chessGame.board, chessGame.state, move, promoChoice);
  if(capturedPiece) {
    if(chessColorOf(capturedPiece) === 'w') chessGame.capturedByBlack.push(capturedPiece);
    else chessGame.capturedByWhite.push(capturedPiece);
  }
  chessGame.board = board;
  chessGame.state = state;
  chessAddMoveToHistory(piece, move);
  playSound('click');
  renderChessBoard();

  const status = chessGameStatus(chessGame.board, chessGame.state.turn, chessGame.state);
  if(status === 'checkmate' || status === 'stalemate') { chessHandleGameEnd(status); return; }
  chessUpdateStatusLine(status === 'check' ? '⚠️ Шах!' : '🎮 Твій хід');
}

function chessHandleGameEnd(status) {
  // Гвард ставиться тут, а не лише в місцях виклику — без нього прямий
  // повторний виклик (напр. з консолі) знову платив би виграш за ту саму
  // партію щоразу, оскільки сама функція нічого не перевіряла.
  if(!chessGame || chessGame.gameOver) return;
  chessGame.gameOver = true;
  const loserColor = chessGame.state.turn; // хто зараз мав ходити — той без ходів
  let resultText, profit = -chessGame.bet, playerWon = false, isDraw = false;

  if(status === 'stalemate') {
    resultText = '🤝 Пат! Нічия.';
    isDraw = true; profit = 0;
  } else {
    // checkmate
    playerWon = loserColor !== chessGame.color;
    if(chessGame.mode === 'ai') {
      if(playerWon) {
        const mult = CHESS_AI_PAYOUT[chessGame.aiDifficulty] || 2;
        profit = Math.floor(chessGame.bet * mult) - chessGame.bet;
        resultText = `🏆 Мат! Ти переміг AI (${chessGame.aiDifficulty}) — +${formatNumber(profit)}₴`;
      } else {
        resultText = `💀 Мат! AI переміг — -${formatNumber(chessGame.bet)}₴`;
      }
    } else {
      // PvP: без цього тексту notify() падав і виграш ніколи не виплачувався
      resultText = playerWon
        ? `🏆 Мат! Ти переміг — +₴${formatNumber(Math.floor(chessGame.bet * 2 * 0.95))}`
        : `💀 Мат! Суперник переміг — -₴${formatNumber(chessGame.bet)}`;
    }
  }

  if(chessGame.mode === 'ai') {
    if(isDraw) {
      db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(chessGame.bet));
    } else if(playerWon) {
      const mult = CHESS_AI_PAYOUT[chessGame.aiDifficulty] || 2;
      const payout = Math.floor(chessGame.bet * mult);
      db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(payout));
      trackLbStat('wins', payout); trackLbStat('profit', payout - chessGame.bet);
      if(payout - chessGame.bet >= 500) addToWinFeed('Шахи', payout - chessGame.bet, mult);
      updateStreak(true);
    } else {
      trackLbStat('profit', -chessGame.bet);
      updateStreak(false);
    }
    recordBalanceHistory();
    addToHistory('Шахи vs AI: ' + (isDraw ? 'нічия' : playerWon ? '+'+(Math.floor(chessGame.bet*(CHESS_AI_PAYOUT[chessGame.aiDifficulty]||2))-chessGame.bet) : '-'+chessGame.bet));
  }

  chessUpdateStatusLine(resultText);
  notify(resultText, isDraw ? 'info' : playerWon ? 'success' : 'error');
  const setupBtn = document.getElementById('chessPlayAgainBtn');
  if(setupBtn) setupBtn.classList.remove('hidden');

  if(chessGame.mode === 'pvp') {
    chessResolvePvpGame(status, loserColor);
  }
}

function chessPlayAgain() {
  document.getElementById('chessSetupPanel')?.classList.remove('hidden');
  document.getElementById('chessGameArea')?.classList.add('hidden');
  document.getElementById('chessPlayAgainBtn')?.classList.add('hidden');
  chessGame = null;
  if(chessRoomListener) { chessRoomListener(); chessRoomListener = null; }
}

// ── ПРОМОЦІЯ — вибір фігури ──
function chessShowPromotionPicker(move) {
  const pieces = ['Q','R','B','N'];
  const names = { Q:'Ферзь', R:'Тура', B:'Слон', N:'Кінь' };
  const color = chessGame.color;
  const html = modalCloseBtn('chessPromo') +
    '<div style="font-family:var(--font-display);font-size:14px;color:var(--accent);margin-bottom:14px;padding-right:36px;">♟️ Оберіть фігуру для перетворення</div>' +
    '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;">' +
    pieces.map(p => `<div onclick="chessConfirmPromotion('${p}')" style="background:var(--surface-1);border:1px solid var(--line);border-radius:var(--r-lg);padding:16px 4px;text-align:center;cursor:pointer;">
      <div style="font-size:36px;">${CHESS_PIECE_UNICODE[color+p]}</div>
      <div style="font-size:10px;color:var(--fg-3);margin-top:4px;">${names[p]}</div>
    </div>`).join('') +
    '</div>';
  window._chessPendingPromoMove = move;
  openModal('chessPromo', html);
}
function chessConfirmPromotion(pieceType) {
  closeModal('chessPromo');
  const move = window._chessPendingPromoMove;
  window._chessPendingPromoMove = null;
  chessExecuteMove(move, pieceType);
}

// ── ІСТОРІЯ ХОДІВ ──
function chessAddMoveToHistory(piece, move) {
  const el = document.getElementById('chessMoveHistory');
  if(!el) return;
  const notation = chessMoveNotation(piece, move);
  const span = document.createElement('span');
  span.style.cssText = 'display:inline-block;padding:2px 6px;margin:2px;background:var(--surface-1);border-radius:var(--r-xs);font-size:11px;color:var(--fg-2);';
  span.textContent = notation;
  el.appendChild(span);
  el.scrollLeft = el.scrollWidth;
}

function chessUpdateStatusLine(text) {
  const el = document.getElementById('chessStatusLine');
  if(el) el.textContent = text;
}

// ── РЕНДЕР ДОШКИ ──
function renderChessBoard() {
  const boardEl = document.getElementById('chessBoardGrid');
  if(!boardEl || !chessGame) return;
  const flipped = chessGame.color === 'b';
  const board = chessGame.board;
  const inCheck = chessIsInCheck(board, chessGame.state.turn);
  const kingPos = inCheck ? chessFindKing(board, chessGame.state.turn) : null;

  let html = '';
  for(let visR = 0; visR < 8; visR++) {
    for(let visC = 0; visC < 8; visC++) {
      const r = flipped ? 7 - visR : visR;
      const c = flipped ? 7 - visC : visC;
      const piece = board[r][c];
      const isLight = (r + c) % 2 === 0;
      const isSelected = chessGame.selected && chessGame.selected.r === r && chessGame.selected.c === c;
      const isLegalTarget = chessGame.legalForSelected.some(m => m.to.r === r && m.to.c === c);
      const isLastMoveSquare = chessGame.state.lastMove && ((chessGame.state.lastMove.from.r===r && chessGame.state.lastMove.from.c===c) || (chessGame.state.lastMove.to.r===r && chessGame.state.lastMove.to.c===c));
      const isKingInCheck = kingPos && kingPos.r === r && kingPos.c === c;

      let bg = isLight ? '#3a3530' : '#211d1a';
      if(isLastMoveSquare) bg = isLight ? '#5a5030' : '#3a3018';
      if(isKingInCheck) bg = '#5a1818';
      if(isSelected) bg = '#3d5a30';

      html += `<div class="chess-sq" onclick="chessSquareClick(${r},${c})" style="background:${bg};position:relative;">`;
      if(piece) {
        const isWhite = chessColorOf(piece) === 'w';
        html += `<span style="font-size:min(8.5vw,32px);color:${isWhite?'var(--fg)':'var(--on-accent)'};text-shadow:${isWhite?'0 1px 2px rgb(var(--shade-rgb) / 0.6)':'0 1px 1px rgb(var(--tint-rgb) / 0.15)'};user-select:none;">${CHESS_PIECE_UNICODE[piece]}</span>`;
      }
      if(isLegalTarget) {
        html += piece ? '<div class="chess-capture-ring"></div>' : '<div class="chess-move-dot"></div>';
      }
      html += '</div>';
    }
  }
  boardEl.innerHTML = html;

  // Captured pieces display
  const capW = document.getElementById('chessCapturedByWhite');
  const capB = document.getElementById('chessCapturedByBlack');
  if(capW) capW.textContent = chessGame.capturedByWhite.map(p => CHESS_PIECE_UNICODE[p]).join(' ');
  if(capB) capB.textContent = chessGame.capturedByBlack.map(p => CHESS_PIECE_UNICODE[p]).join(' ');
}

// ╔══════════════════════════════════════════════════════════════╗
// ║  ШАХИ PvP — онлайн через Firebase (той самий безпечний        ║
// ║  transaction-патерн що і в Coinflip/RPS/Predict)              ║
// ╚══════════════════════════════════════════════════════════════╝

function createChessRoom() {
  const betInput = document.getElementById('chessBetAmount');
  const bet = validateBet(betInput ? betInput.value : 0);
  if(!bet) return;
  db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(-bet));
  addWager(bet);
  const roomRef = db.ref('pvp_chess').push();
  roomRef.set({
    creator: currentUser, bet, status: 'waiting',
    board: JSON.stringify(CHESS_INITIAL_BOARD),
    gameState: JSON.stringify(chessNewState()),
    createdAt: Date.now(),
  });
  notify('♟️ Кімнату створено! Очікуємо суперника...', 'info');
  // Хост зникне до того, як хтось приєднається — кімната не має висіти
  // в лобі вічно, а ставка не має пропасти.
  roomRef.onDisconnect().update({ status: 'cancelled' });
  db.ref('users/'+currentUser+'/balance').onDisconnect().set(firebase.database.ServerValue.increment(bet));
  chessListenOwnRoom(roomRef.key, bet);
}

function chessListenOwnRoom(roomId, bet) {
  db.ref('pvp_chess/'+roomId).on('value', snap => {
    const r = snap.val();
    if(!r) return;
    if(r.status === 'active' && !chessGame) {
      chessGame = {
        board: JSON.parse(r.board), state: JSON.parse(r.gameState),
        mode: 'pvp', color: 'w', bet, roomId,
        selected: null, legalForSelected: [], gameOver: false, capturedByWhite: [], capturedByBlack: [],
      };
      document.getElementById('chessSetupPanel')?.classList.add('hidden');
      document.getElementById('chessGameArea')?.classList.remove('hidden');
      chessUpdateStatusLine('🎮 Суперник приєднався! Твій хід (білі)');
      renderChessBoard();
      // Суперник приєднався — обидві ставки в грі: зникнення будь-кого з
      // гравців тепер має повертати ставки обом, а не забирати кімнату.
      db.ref('pvp_chess/'+roomId).onDisconnect().cancel();
      db.ref('users/'+currentUser+'/balance').onDisconnect().cancel();
      db.ref('pvp_chess/'+roomId).onDisconnect().update({ status: 'abandoned', abandonedBy: currentUser });
      chessListenRoomMoves(roomId);
    }
  });
}

function loadChessRooms() {
  const el = document.getElementById('chessRoomsList');
  if(!el) return;
  db.ref('pvp_chess').orderByChild('status').equalTo('waiting').limitToLast(20).once('value').then(snap => {
    const rooms = snap.val() || {};
    const entries = Object.entries(rooms).filter(([,r]) => r.creator !== currentUser);
    if(!entries.length) { el.innerHTML = '<div style="color:var(--fg-4);text-align:center;padding:16px;">Немає активних кімнат. Створи свою!</div>'; return; }
    el.innerHTML = entries.map(([id, r]) => `
      <div style="display:flex;justify-content:space-between;align-items:center;background:var(--surface-1);border-radius:var(--r-md);padding:10px 12px;margin-bottom:8px;">
        <div><div style="font-weight:700;font-size:13px;">${r.creator}</div><div style="font-size:11px;color:var(--fg-3);">Ставка: ₴${formatNumber(r.bet)}</div></div>
        <button onclick="joinChessRoom('${id}',${r.bet})" style="background:var(--special);color:var(--on-special);border:none;border-radius:var(--r-md);padding:8px 16px;font-weight:800;font-size:12px;cursor:pointer;">Прийняти</button>
      </div>`).join('');
  });
}

function joinChessRoom(roomId, bet) {
  if((userData.balance||0) < bet) return notify('Недостатньо коштів', 'error');
  db.ref('pvp_chess/'+roomId+'/status').transaction(current => {
    // current===null означає лише, що клієнт ще не кешував це значення
    // (loadChessRooms читає once() і одразу відписується) — не факт, що
    // кімнату справді зайнято. Дозволяємо спробу; SDK перевірить реальне
    // значення на сервері і сам заретраїть/абортує транзакцію коректно.
    if(current === 'waiting' || current === null) return 'joining';
    return;
  }, (err, committed) => {
    if(!committed) { notify('Кімнату вже зайнято', 'error'); loadChessRooms(); return; }
    db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(-bet));
    addWager(bet);
    db.ref('pvp_chess/'+roomId).update({ joiner: currentUser, status: 'active' });
    chessGame = {
      board: chessCloneBoard(CHESS_INITIAL_BOARD), state: chessNewState(),
      mode: 'pvp', color: 'b', bet, roomId,
      selected: null, legalForSelected: [], gameOver: false, capturedByWhite: [], capturedByBlack: [],
    };
    document.getElementById('chessSetupPanel')?.classList.add('hidden');
    document.getElementById('chessGameArea')?.classList.remove('hidden');
    chessUpdateStatusLine('⏳ Хід суперника (білі ходять першими)');
    renderChessBoard();
    // Якщо я зникну під час гри — суперник побачить статус 'abandoned' і
    // поверне ставки обом (див. chessListenRoomMoves).
    db.ref('pvp_chess/'+roomId).onDisconnect().update({ status: 'abandoned', abandonedBy: currentUser });
    chessListenRoomMoves(roomId);
  });
}

function chessSyncMoveToFirebase(move, promoChoice) {
  if(!chessGame.roomId) return;
  db.ref('pvp_chess/'+chessGame.roomId).update({
    board: JSON.stringify(chessGame.board),
    gameState: JSON.stringify(chessGame.state),
    lastMoveBy: currentUser,
  });
}

function chessListenRoomMoves(roomId) {
  chessRoomListener = db.ref('pvp_chess/'+roomId).on('value', snap => {
    const r = snap.val();
    if(!r || !chessGame) return;
    if(r.status === 'abandoned') {
      db.ref('pvp_chess/'+roomId+'/status').transaction(cur => cur === 'abandoned' ? 'finished' : undefined, (err, committed) => {
        if(err || !committed) return;
        db.ref('users/'+currentUser+'/balance').set(firebase.database.ServerValue.increment(r.bet));
        if(r.abandonedBy && r.abandonedBy !== currentUser) db.ref('users/'+r.abandonedBy+'/balance').set(firebase.database.ServerValue.increment(r.bet));
        notify('Суперник відключився. Ставку повернено.', 'info');
        chessUpdateStatusLine('🔌 Суперник вийшов з гри — ставку повернено.');
      });
      chessGame.gameOver = true;
      if(chessRoomListener) { chessRoomListener(); chessRoomListener = null; }
      const setupBtn = document.getElementById('chessPlayAgainBtn');
      if(setupBtn) setupBtn.classList.remove('hidden');
      return;
    }
    if(chessGame.gameOver) return;
    // Синхронізуємось тільки якщо хід зробив СУПЕРНИК (не ми самі)
    if(r.lastMoveBy && r.lastMoveBy !== currentUser) {
      const newBoard = JSON.parse(r.board);
      const newState = JSON.parse(r.gameState);
      chessGame.board = newBoard;
      chessGame.state = newState;
      chessGame.selected = null; chessGame.legalForSelected = [];
      renderChessBoard();
      const status = chessGameStatus(chessGame.board, chessGame.state.turn, chessGame.state);
      if(status === 'checkmate' || status === 'stalemate') { chessHandleGameEnd(status); return; }
      chessUpdateStatusLine(status === 'check' ? '⚠️ Шах!' : (chessGame.state.turn === chessGame.color ? '🎮 Твій хід' : '⏳ Хід суперника'));
    }
  });
}

// Виплата PvP-гри — той самий безпечний "хто перший встиг" патерн
function chessResolvePvpGame(status, loserColor) {
  if(!chessGame.roomId) return;
  // Гра природно завершилась (мат/пат) — "abandoned on disconnect" більше
  // не актуальний для жодного з двох клієнтів, інакше пізніше закриття
  // вкладки переписало б уже завершену кімнату назад у 'abandoned'.
  db.ref('pvp_chess/'+chessGame.roomId).onDisconnect().cancel();
  db.ref('pvp_chess/'+chessGame.roomId+'/resolved').transaction(current => {
    if(current) return; // вже хтось виплатив
    return true;
  }, (err, committed) => {
    if(!committed) return;
    db.ref('pvp_chess/'+chessGame.roomId).once('value').then(snap => {
      const r = snap.val();
      if(!r) return;
      const totalPot = r.bet * 2;
      const payout = Math.floor(totalPot * 0.95); // 5% комісія
      if(status === 'stalemate') {
        db.ref('users/'+r.creator+'/balance').set(firebase.database.ServerValue.increment(r.bet));
        db.ref('users/'+r.joiner+'/balance').set(firebase.database.ServerValue.increment(r.bet));
      } else {
        const winnerColor = loserColor === 'w' ? 'b' : 'w';
        const winnerUser = winnerColor === 'w' ? r.creator : r.joiner;
        db.ref('users/'+winnerUser+'/balance').set(firebase.database.ServerValue.increment(payout));
        trackLbStat('wins', payout);
        if(winnerUser === currentUser) addToWinFeed('Шахи PvP', payout - chessGame.bet, 1.9);
      }
      db.ref('pvp_chess/'+chessGame.roomId).update({ status: 'finished' });
    });
  });
}

