// --- Default seed data -----------------------------------------------
const SEED = window.THEORY_SEED || [];
// --- State -----------------------------------------------------------
// ─── Default seed data ───────────────────────────────────────────────
// ─── State ───────────────────────────────────────────────────────────
let LINES = JSON.parse(JSON.stringify(SEED));
let currentFilename = 'chess-notes.json';
let unsaved = false;

function markUnsaved() {
  unsaved = true;
  document.getElementById('save-btn').style.borderColor = 'var(--accent)';
  document.getElementById('save-btn').style.color = 'var(--accent)';
}
function markSaved() {
  unsaved = false;
  document.getElementById('save-btn').style.borderColor = '';
  document.getElementById('save-btn').style.color = '';
}

function normalizeTheoryData(data) {
  if(!Array.isArray(data)) throw new Error('Expected a JSON array.');
  if(typeof Chess !== 'function') throw new Error('Chess rules are unavailable, so moves cannot be validated.');

  const ids = new Set();
  let blockCount = 0;
  const readString = (value, path, fallback='') => {
    if(value === undefined) return fallback;
    if(typeof value !== 'string') throw new Error(`${path} must be text.`);
    return value;
  };
  const readObject = (value, path) => {
    if(!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${path} must be an object.`);
    return value;
  };

  const normalizeBlocks = (blocks, path, depth=0) => {
    if(!Array.isArray(blocks)) throw new Error(`${path} must be an array.`);
    if(depth > 32) throw new Error(`${path} is nested too deeply.`);

    return blocks.map((rawBlock, blockIndex) => {
      blockCount++;
      if(blockCount > 50000) throw new Error('Notebook contains too many content blocks.');
      const blockPath = `${path}[${blockIndex}]`;
      const block = readObject(rawBlock, blockPath);

      if(block.type === 'text'){
        return { type:'text', content:readString(block.content, `${blockPath}.content`) };
      }

      if(block.type === 'line'){
        const moves = block.moves === undefined ? [] : block.moves;
        if(!Array.isArray(moves)) throw new Error(`${blockPath}.moves must be an array.`);
        const game = new Chess();
        const normalizedMoves = moves.map((rawMove, moveIndex) => {
          const movePath = `${blockPath}.moves[${moveIndex}]`;
          const move = readObject(rawMove, movePath);
          const san = readString(move.san, `${movePath}.san`).trim();
          if(!san) throw new Error(`${movePath}.san cannot be empty.`);
          let result = null;
          try { result = game.move(san, { sloppy:true }); } catch(_) {}
          if(!result) throw new Error(`${movePath}.san is not legal from the preceding position.`);
          return { san, comment:readString(move.comment, `${movePath}.comment`) };
        });
        return {
          type:'line',
          label:readString(block.label, `${blockPath}.label`),
          popularity:readString(block.popularity, `${blockPath}.popularity`),
          moves:normalizedMoves
        };
      }

      if(block.type === 'tabs'){
        const tabs = block.tabs === undefined ? [] : block.tabs;
        if(!Array.isArray(tabs)) throw new Error(`${blockPath}.tabs must be an array.`);
        return {
          type:'tabs',
          tabs:tabs.map((rawTab, tabIndex) => {
            const tabPath = `${blockPath}.tabs[${tabIndex}]`;
            const tab = readObject(rawTab, tabPath);
            return {
              label:readString(tab.label, `${tabPath}.label`),
              blocks:normalizeBlocks(tab.blocks === undefined ? [] : tab.blocks, `${tabPath}.blocks`, depth + 1)
            };
          })
        };
      }

      throw new Error(`${blockPath}.type must be text, line, or tabs.`);
    });
  };

  return data.map((rawEntry, entryIndex) => {
    const path = `Entry ${entryIndex + 1}`;
    const entry = readObject(rawEntry, path);
    const title = readString(entry.title, `${path}.title`).trim();
    if(!title) throw new Error(`${path}.title cannot be empty.`);
    const rawTags = entry.tags === undefined ? [] : entry.tags;
    if(!Array.isArray(rawTags)) throw new Error(`${path}.tags must be an array.`);
    const tags = rawTags.map((tag, tagIndex) => readString(tag, `${path}.tags[${tagIndex}]`));
    const id = readString(entry.id, `${path}.id`, `entry-import-${Date.now()}-${entryIndex}`).trim();
    if(!id) throw new Error(`${path}.id cannot be empty.`);
    if(ids.has(id)) throw new Error(`${path}.id duplicates another entry.`);
    ids.add(id);
    return {
      id,
      title,
      tags,
      date:readString(entry.date, `${path}.date`),
      blocks:normalizeBlocks(entry.blocks === undefined ? [] : entry.blocks, `${path}.blocks`)
    };
  });
}

function replaceTheoryData(candidate) {
  const normalized = normalizeTheoryData(candidate);
  const previous = LINES;
  LINES = normalized;
  try {
    renderView();
    return normalized;
  } catch(err) {
    LINES = previous;
    renderView();
    throw err;
  }
}

// ─── JSON File I/O ───────────────────────────────────────────────────
document.getElementById('load-btn').addEventListener('click', () => {
  document.getElementById('file-inp').click();
});

document.getElementById('file-inp').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      replaceTheoryData(data);
      currentFilename = file.name;
      document.getElementById('json-filename').textContent = file.name;
      markSaved();
      toast('Loaded ' + file.name, 'ok');
    } catch(err) {
      toast('Invalid JSON: ' + err.message, 'err');
    }
  };
  reader.readAsText(file);
  e.target.value = '';
});

// ─── Save / Submit ───────────────────────────────────────────────────
// Remote submissions stay disabled until they can be handled by a controlled
// server endpoint. Never ship webhook credentials in browser-delivered code.

function doLocalSave() {
  const blob = new Blob([JSON.stringify(LINES, null, 2)], {type: 'application/json'});
  const a = document.createElement('a');
  const objectUrl = URL.createObjectURL(blob);
  a.href = objectUrl;
  a.download = currentFilename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(objectUrl), 0);
  markSaved();
  toast('Saved ' + currentFilename, 'ok');
}

document.getElementById('save-btn').addEventListener('click', () => openSaveModal());


// ─── Chess Engine ────────────────────────────────────────────────────
const BASE='pieces/cburnett/';
function mkPS(){
  const sq=getSq();
  const img=piece=>`<img src="${BASE}${piece}.svg" width="${sq}" height="${sq}" alt="" aria-hidden="true">`;
  return {wK:img('wK'),wQ:img('wQ'),wR:img('wR'),wB:img('wB'),wN:img('wN'),wP:img('wP'),bK:img('bK'),bQ:img('bQ'),bR:img('bR'),bB:img('bB'),bN:img('bN'),bP:img('bP')};
}
const PS=mkPS();
function getSq(){return parseInt(getComputedStyle(document.documentElement).getPropertyValue('--sq'))||56;}
function f2b(fen){return fen.split(' ')[0].split('/').map(row=>{const r=[];for(const ch of row){if('12345678'.includes(ch))for(let i=0;i<+ch;i++)r.push(null);else r.push((ch===ch.toUpperCase()?'w':'b')+ch.toUpperCase());}return r;});}
function applyMv(board,san,turn){const b=board.map(r=>[...r]);let s=san.replace(/[+#!?]/g,'');if(s==='O-O'||s==='0-0'){const rk=turn==='w'?7:0;b[rk][4]=null;b[rk][7]=null;b[rk][6]=turn+'K';b[rk][5]=turn+'R';return b;}if(s==='O-O-O'||s==='0-0-0'){const rk=turn==='w'?7:0;b[rk][4]=null;b[rk][0]=null;b[rk][2]=turn+'K';b[rk][3]=turn+'R';return b;}let promo=null;if(s.includes('=')){promo=turn+s.split('=')[1].toUpperCase();s=s.split('=')[0];}const isCap=s.includes('x');s=s.replace('x','');const df=s.slice(-2,-1).charCodeAt(0)-97,dr=8-parseInt(s.slice(-1));const pc=s[0]===s[0].toUpperCase()&&!'abcdefgh'.includes(s[0])?s[0]:'P';const piece=turn+pc,hint=s.slice(pc==='P'?0:1,-2).replace('x','');let sR=-1,sF=-1;for(let r=0;r<8&&sR===-1;r++)for(let f=0;f<8&&sR===-1;f++){if(b[r][f]!==piece)continue;if(hint){if(!isNaN(hint)){if(r!==8-parseInt(hint))continue}else{if(f!==hint.charCodeAt(0)-97)continue}}if(canR(b,r,f,dr,df,piece,turn,isCap)){sR=r;sF=f;}}if(sR===-1)return b;if(piece[1]==='P'&&isCap&&!b[dr][df])b[turn==='w'?dr+1:dr-1][df]=null;b[dr][df]=promo||piece;b[sR][sF]=null;return b;}
function canR(board,r,f,dr,df,piece,turn,isCap){const type=piece[1],dr_=dr-r,df_=df-f;if(type==='P'){const dir=turn==='w'?-1:1;if(!isCap){if(df_!==0)return false;if(dr_===dir&&!board[dr][df])return true;const sr=turn==='w'?6:1;if(r===sr&&dr_===2*dir&&!board[r+dir][f]&&!board[dr][df])return true;}else return dr_===dir&&Math.abs(df_)===1;return false;}if(type==='N')return(Math.abs(dr_)===2&&Math.abs(df_)===1)||(Math.abs(dr_)===1&&Math.abs(df_)===2);if(type==='K')return Math.abs(dr_)<=1&&Math.abs(df_)<=1;if(type==='R'){if(dr_!==0&&df_!==0)return false;return clr(board,r,f,dr,df);}if(type==='B'){if(Math.abs(dr_)!==Math.abs(df_))return false;return clr(board,r,f,dr,df);}if(type==='Q'){if(dr_!==0&&df_!==0&&Math.abs(dr_)!==Math.abs(df_))return false;return clr(board,r,f,dr,df);}return false;}
function clr(board,r,f,dr,df){const sr=Math.sign(dr-r),sf=Math.sign(df-f);let cr=r+sr,cf=f+sf;while(cr!==dr||cf!==df){if(board[cr][cf])return false;cr+=sr;cf+=sf;}return true;}
function getAnn(c){if(!c)return null;if(c.startsWith('??')||c.toLowerCase().includes('blunder'))return{s:'??',cls:'ann-blunder'};if(c.startsWith('?!')||c.toLowerCase().includes('inaccuracy'))return{s:'?!',cls:'ann-inaccuracy'};if(c.startsWith('?')&&!c.startsWith('?!'))return{s:'?',cls:'ann-mistake'};if(c.startsWith('!!'))return{s:'!!',cls:'ann-brilliant'};if(c.startsWith('!')&&!c.startsWith('!!'))return{s:'!',cls:'ann-good'};return null;}
function drawArr(canvas, fR, fF, tR, tF){
  const parent = canvas.parentElement || canvas;
  const rect = parent.getBoundingClientRect();
  const size = Math.min(rect.width, rect.height);
  const sq = size / 8;

  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;

  canvas.width = Math.max(1, Math.round(size * dpr));
  canvas.height = Math.max(1, Math.round(size * dpr));
  canvas.style.width = size + 'px';
  canvas.style.height = size + 'px';

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, size, size);

  if(fR < 0 || tR < 0) return;

  const x1 = (fF + 0.5) * sq;
  const y1 = (fR + 0.5) * sq;
  const x2 = (tF + 0.5) * sq;
  const y2 = (tR + 0.5) * sq;

  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.sqrt(dx*dx + dy*dy) || 1;

  const ux = dx / len;
  const uy = dy / len;
  const px = -uy;
  const py = ux;

  const headLength = sq * 0.34;
  const headWidth = sq * 0.22;
  const lineWidth = Math.max(4, sq * 0.12);

  const startX = x1 + ux * (sq * 0.18);
  const startY = y1 + uy * (sq * 0.18);
  const endX = x2 - ux * headLength;
  const endY = y2 - uy * headLength;

  ctx.strokeStyle = 'rgba(165, 148, 192, 0.82)';
  ctx.fillStyle = 'rgba(165, 148, 192, 0.82)';
  ctx.lineWidth = lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.lineTo(endX, endY);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(endX + px * headWidth, endY + py * headWidth);
  ctx.lineTo(endX - px * headWidth, endY - py * headWidth);
  ctx.closePath();
  ctx.fill();
}
function renderBrd(grid,canvas,board,lF,lT,anim=false,flipped=false,checkSquare=null){
  const PS=mkPS();
  grid.innerHTML='';

  const disp = (r,f) => flipped ? { r: 7-r, f: 7-f } : { r, f };
  const checkDisp = checkSquare ? disp(checkSquare.r, checkSquare.f) : null;

  for(let dr=0;dr<8;dr++) for(let df=0;df<8;df++){
    const sqEl=document.createElement('div');
    sqEl.className='sq '+(((dr+df)%2===0)?'light':'dark');

    if(checkDisp && checkDisp.r === dr && checkDisp.f === df) sqEl.classList.add('king-in-check');

    const coords = flipped ? { r:7-dr, f:7-df } : { r:dr, f:df };
    const p=board[coords.r]?.[coords.f];
    const hideToPiece = !!anim && lT && lT.r === coords.r && lT.f === coords.f;
    if(p && PS[p] && !hideToPiece){
      const w=document.createElement('div');
      w.className='piece';
      w.innerHTML=PS[p];
      sqEl.appendChild(w);
    }
    grid.appendChild(sqEl);
  }

  const from = lF ? disp(lF.r, lF.f) : null;
  const to = lT ? disp(lT.r, lT.f) : null;
  drawArr(canvas, from ? from.r : -1, from ? from.f : -1, to ? to.r : -1, to ? to.f : -1);
}
function idxToSq(r,f){return String.fromCharCode(97+f)+(8-r);} 
function pieceCodeFromChessJs(piece){if(!piece)return null;return (piece.color==='w'?'w':'b') + piece.type.toUpperCase();}
function boardFromChessJs(game){const src=game.board();const out=[];for(let r=0;r<8;r++){const row=[];for(let f=0;f<8;f++)row.push(pieceCodeFromChessJs(src[r][f]));out.push(row);}return out;}
function checkedKingSquareFromGame(game){
  if(!game || typeof game.in_check !== 'function' || !game.in_check()) return null;
  const board = game.board();
  const turn = game.turn();
  for(let r=0;r<8;r++){
    for(let f=0;f<8;f++){
      const p = board[r][f];
      if(p && p.type === 'k' && p.color === turn){
        return { r, f };
      }
    }
  }
  return null;
}

function buildEditorBoardInput(block,sanBox,refreshComments,onEngineLineChange){
  const shell=el('div','ed-board-shell');
  const top=el('div','ed-board-top');
  const status=el('div','ed-board-status');
  const tools=el('div','ed-board-tools');
  let evalTimer=null;
  top.appendChild(status); top.appendChild(tools); shell.appendChild(top);

  const editorStudy=el('div','study-layout');
  editorStudy.style.alignItems='stretch';
  editorStudy.style.gap='16px';

  const evalShell=el('div','eval-shell');
  const evalWrap=el('div','eval-wrap');
  const evalBar=el('div','eval-bar');
  const evalBlack=el('div','eval-black');
  const evalMarker=el('div','eval-marker');
  const evalTop = el('div','eval-score top');
  const evalBottom = el('div','eval-score bottom');
  evalTop.textContent = '';
  evalBottom.textContent = '0.0';
  evalBar.appendChild(evalTop);
  evalBar.appendChild(evalBottom);
  evalBar.appendChild(evalBlack);
  evalBar.appendChild(evalMarker);
  const evalMeta=el('div','eval-meta');
  const evalText=el('div','eval-text'); evalText.textContent='0.0';
  const evalState=el('div','eval-state'); evalState.textContent='idle';
  evalMeta.appendChild(evalText); evalMeta.appendChild(evalState); evalWrap.appendChild(evalBar); evalWrap.appendChild(evalMeta); evalShell.appendChild(evalWrap);

  const coords=el('div','board-coords');
  const rl=el('div','rank-labels');
  for(let r=8;r>=1;r--){const s=document.createElement('span');s.textContent=r;rl.appendChild(s);}
  const gWrap=el('div','board-gwrap');
  const grid=el('div','board-grid');
  const ac=document.createElement('canvas'); ac.className='board-arrow-layer';
  gWrap.appendChild(grid); gWrap.appendChild(ac);
  const fl=el('div','file-labels');
  'abcdefgh'.split('').forEach(l=>{const s=document.createElement('span');s.textContent=l;fl.appendChild(s);});
  coords.appendChild(rl); coords.appendChild(gWrap); coords.appendChild(document.createElement('div')); coords.appendChild(fl);
  evalShell.appendChild(coords);
  editorStudy.appendChild(evalShell);
  shell.style.position='relative';
  shell.appendChild(editorStudy);

  const hint=el('div','ed-board-hint');
  hint.textContent='Click or drag pieces. Legal moves show dots and rings. Notation is added automatically. Promotions let you choose a piece.';
  shell.appendChild(hint);

  const evalUi = { bar: evalBar, black: evalBlack, marker: evalMarker, text: evalText, state: evalState, top: evalTop, bottom: evalBottom };

  let selected=null;
  let boardFlipped=false;
  let lastFrom=null;
  let lastTo=null;
  let pendingPromotion=null;
  let suppressClick=false;
  let hoverTarget=null;
  let activeBoard=null;
  let activeTurn='w';
  let activeBadIndex=-1;
  let dragState=null;
  let dragGhost=null;
  let dragHoldTimer=null;
  let pendingDragStart=null;
  let cleanupDone=false;
  let _stateCache=null;
  let _stateCacheKey=null;

  const selectBtn=el('button','ed-board-btn sel'); selectBtn.textContent='Board input';
  tools.appendChild(selectBtn);

  const undoBtn=el('button','ed-board-btn'); undoBtn.textContent='Undo';
  undoBtn.onclick=()=>{
    if(!block.moves.length) return;
    block.moves.pop();
    invalidateStateCache();
    sanBox.value=(block.moves||[]).map(m=>m.san).filter(Boolean).join(' ');
    refreshComments();
    selected=null; lastFrom=null; lastTo=null; hoverTarget=null; pendingPromotion=null;
    rerender();
  };
  tools.appendChild(undoBtn);

  const clearBtn=el('button','ed-board-btn'); clearBtn.textContent='Clear';
  clearBtn.onclick=()=>{
    block.moves=[];
    invalidateStateCache();
    sanBox.value='';
    refreshComments();
    selected=null; lastFrom=null; lastTo=null; hoverTarget=null; pendingPromotion=null;
    rerender();
  };
  tools.appendChild(clearBtn);

  const flipBtn=el('button','ed-board-btn'); flipBtn.textContent='Flip';
  flipBtn.onclick=()=>{boardFlipped=!boardFlipped; hoverTarget=null; rerender();};
  tools.appendChild(flipBtn);


  function clearPromotionOverlay(){
    const ex = gWrap.querySelector('.promo-inline');
    if(ex) ex.remove();
  }


  function renderPromotionOverlay(){
    clearPromotionOverlay();
    if(!pendingPromotion) return;

    const targetSq = pendingPromotion.square || pendingPromotion.to;
    const color = pendingPromotion.color || pendingPromotion.turn || 'w';
    const overlay = el('div','promo-inline');

    const addCancel = () => {
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'promo-inline-cancel';
      cancel.textContent = '×';
      cancel.title = 'Cancel promotion';
      cancel.setAttribute('aria-label', 'Cancel promotion');
      cancel.addEventListener('pointerup', (ev)=>{
        ev.preventDefault();
        ev.stopPropagation();
        pendingPromotion = null;
        selected = null;
        hoverTarget = null;
        rerender();
      });
      cancel.addEventListener('click', (ev)=>{
        ev.preventDefault();
        ev.stopPropagation();
      });
      overlay.appendChild(cancel);
    };

    if(color === 'b') addCancel();

    ['Q','N','R','B'].forEach(pc=>{
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'promo-inline-btn';
      btn.title = {Q:'Queen',N:'Knight',R:'Rook',B:'Bishop'}[pc];
      btn.setAttribute('aria-label', btn.title);
      btn.innerHTML = `<img src="${BASE}${color}${pc}.svg" alt="${btn.title}">`;
      btn.addEventListener('pointerup', (ev)=>{
        ev.preventDefault();
        ev.stopPropagation();
        finishPromotion(pc);
      });
      btn.addEventListener('click', (ev)=>{
        ev.preventDefault();
        ev.stopPropagation();
      });
      overlay.appendChild(btn);
    });

    if(color === 'w') addCancel();

    const boardHost = gWrap;
    if(getComputedStyle(boardHost).position === 'static') boardHost.style.position = 'relative';

    const size = Math.min(boardHost.clientWidth || (sqPx()*8), boardHost.clientHeight || (sqPx()*8));
    const sq = size / 8;
    const overlayHeight = sq * 4 + sq * 0.72;
    const vis = boardToDisplay(targetSq.r, targetSq.f);

    let left = vis.f * sq;
    let top = color === 'w' ? (vis.r * sq) - (overlayHeight - sq) : (vis.r * sq);

    left = Math.max(0, Math.min(left, size - sq));
    top = Math.max(0, Math.min(top, size - overlayHeight));

    overlay.style.left = left + 'px';
    overlay.style.top = top + 'px';

    boardHost.appendChild(overlay);
  }

  function cloneBoard(board){ return board.map(row=>row.slice()); }
  function sameBoard(a,b){ return JSON.stringify(a)===JSON.stringify(b); }
  function sqName(r,f){ return String.fromCharCode(97+f)+(8-r); }
  function sqPx(){ return parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sq')) || 56; }
  function boardToDisplay(r,f){
    return boardFlipped ? { r: 7 - r, f: 7 - f } : { r, f };
  }
  function piecePrefix(piece){ return piece[1]==='P' ? '' : piece[1]; }
  function sameSq(a,b){ return !!a && !!b && a.r===b.r && a.f===b.f; }
  function boardPieceAt(r,f,board){ return board?.[r]?.[f] || null; }

  function removeGhost(){
    if(dragGhost){ dragGhost.remove(); dragGhost=null; }
  }
  function ensureGhost(pieceCode){
    removeGhost();
    dragGhost=document.createElement('div');
    dragGhost.className='drag-ghost';
    dragGhost.innerHTML=PS[pieceCode] || '';
    document.body.appendChild(dragGhost);
  }
  function moveGhost(x,y){
    if(!dragGhost) return;
    dragGhost.style.left = x + 'px';
    dragGhost.style.top = y + 'px';
  }
  function uiSquareToBoard(rDisp, fDisp){
    return boardFlipped ? { r: 7-rDisp, f: 7-fDisp } : { r: rDisp, f: fDisp };
  }
  function boardToUiSquare(r,f){
    return boardFlipped ? { r: 7-r, f: 7-f } : { r, f };
  }
  function squareFromPoint(x,y){
    const elAt = document.elementFromPoint(x,y);
    if(!elAt) return null;
    const sq = elAt.closest('.sq[data-r][data-f]');
    if(!sq || !grid.contains(sq)) return null;
    return { r: +sq.dataset.r, f: +sq.dataset.f };
  }

  function stateFromMoves(){
    const cacheKey = (block.moves||[]).map(m=>m.san||'').join(',');
    if(_stateCache && _stateCacheKey === cacheKey) return _stateCache;

    if(typeof Chess !== 'function'){
      _stateCache = {
        board: f2b('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'),
        turn: 'w', badIndex: -1,
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        game: null
      };
      _stateCacheKey = cacheKey;
      return _stateCache;
    }

    const game = new Chess();
    let badIndex = -1;
    for(let i=0;i<(block.moves||[]).length;i++){
      const san = (block.moves[i]?.san || '').trim();
      if(!san) continue;
      const res = game.move(san, { sloppy: true });
      if(!res){ badIndex = i; break; }
    }

    _stateCache = {
      board: boardFromChessJs(game),
      turn: game.turn(),
      badIndex,
      fen: game.fen(),
      game,
      checkSquare: checkedKingSquareFromGame(game)
    };
    _stateCacheKey = cacheKey;
    return _stateCache;
  }

  function invalidateStateCache(){ _stateCache = null; _stateCacheKey = null; }

  function sqToCoords(square){
    return {
      r: 8 - parseInt(square[1], 10),
      f: square.charCodeAt(0) - 97
    };
  }

  function coordsToSq(r, f){
    return String.fromCharCode(97 + f) + (8 - r);
  }

  function commitMoveResult(res){
    if(!res || !res.san) return false;
    block.moves.push({ san: res.san, comment: '' });
    invalidateStateCache();
    sanBox.value = (block.moves||[]).map(m=>m.san).filter(Boolean).join(' ');
    refreshComments();
    lastFrom = sqToCoords(res.from);
    lastTo = sqToCoords(res.to);
    selected = null;
    hoverTarget = null;
    pendingPromotion = null;
    rerender();
    return true;
  }

  function finishPromotion(pieceCode){
    if(!pendingPromotion || typeof Chess !== 'function') return;
    const game = new Chess(pendingPromotion.fen);
    const res = game.move({
      from: coordsToSq(pendingPromotion.from.r, pendingPromotion.from.f),
      to: coordsToSq(pendingPromotion.to.r, pendingPromotion.to.f),
      promotion: String(pieceCode || 'Q').toLowerCase()
    });
    if(!res){
      pendingPromotion = null;
      selected = null;
      hoverTarget = null;
      rerender();
      return;
    }
    commitMoveResult(res);
  }

  function legalTargetsFor(board, turn, from){
    const out = [];
    const state = stateFromMoves();
    if(state.badIndex >= 0 || !state.game) return out;

    const square = coordsToSq(from.r, from.f);
    const moves = state.game.moves({ square, verbose: true }) || [];
    for(const mv of moves){
      const to = sqToCoords(mv.to);
      out.push({
        r: to.r,
        f: to.f,
        capture: !!mv.captured
      });
    }
    return out;
  }

  function tryMove(from, to, board, turn){
    const state = stateFromMoves();
    if(state.badIndex >= 0 || !state.game) return false;

    const fromSq = coordsToSq(from.r, from.f);
    const toSq = coordsToSq(to.r, to.f);

    const legal = (state.game.moves({ square: fromSq, verbose: true }) || []).find(m => m.to === toSq);
    if(!legal){
      selected = null;
      hoverTarget = null;
      rerender();
      return false;
    }

    if(legal.flags && legal.flags.includes('p')){
      pendingPromotion = {
        fen: state.game.fen(),
        turn: state.game.turn(),
        color: state.game.turn(),
        from: { r: from.r, f: from.f },
        to: { r: to.r, f: to.f },
        square: { r: to.r, f: to.f }
      };
      rerender();
      return true;
    }

    const res = state.game.move({ from: fromSq, to: toSq, promotion: 'q' });
    if(!res){
      selected = null;
      hoverTarget = null;
      rerender();
      return false;
    }

    return commitMoveResult(res);
  }

  function queueEditorEval(board, turn){
    clearTimeout(evalTimer);
    if(pendingPromotion){
      setEvalStatus(evalUi, 'promotion');
      return;
    }
    evalTimer = setTimeout(()=>{
      const state = stateFromMoves();
      const fen = state.fen || (boardOnlyFen(board)+' '+turn+' - - 0 1');
      requestEval(
        fen,
        turn,
        payload=>{
          updateEvalUI(evalUi, payload);
          if(onEngineLineChange) onEngineLineChange(payload, fen);
        },
        txt=>setEvalStatus(evalUi, txt),
        18
      );
    }, 150);
  }

  function renderLegalMarker(sqEl, isCapture){
    const marker = document.createElement('div');
    marker.className = isCapture ? 'capture-ring' : 'move-dot';
    sqEl.appendChild(marker);
  }

  function applyHoverHighlight(nextSq){
    const prev = grid.querySelector('.sq.drag-target');
    if(prev) prev.classList.remove('drag-target');
    if(nextSq){
      const sqEl = grid.querySelector(`.sq[data-r="${nextSq.r}"][data-f="${nextSq.f}"]`);
      if(sqEl) sqEl.classList.add('drag-target');
    }
  }

  function currentLegalTargetsMap(){
    if(!selected || activeBadIndex >= 0 || pendingPromotion) return new Map();
    return new Map(legalTargetsFor(activeBoard, activeTurn, selected).map(t => [t.r + ',' + t.f, t]));
  }

  function rerender(){
    const { board, turn, badIndex, checkSquare } = stateFromMoves();
    activeBoard = board; activeTurn = turn; activeBadIndex = badIndex;
    if(badIndex>=0){
      status.textContent='Invalid SAN at move '+(badIndex+1)+': '+(block.moves[badIndex]?.san||'');
      setEvalStatus(evalUi, 'invalid', true);
    } else if(pendingPromotion){
      status.textContent=(turn==='w'?'White':'Black')+' promotion — choose a piece';
    } else if(dragState && selected){
      status.textContent=(turn==='w'?'White':'Black')+' to move — dragging '+sqName(selected.r,selected.f);
    } else if(selected){
      status.textContent=(turn==='w'?'White':'Black')+' to move — selected '+sqName(selected.r,selected.f);
    } else {
      status.textContent=(turn==='w'?'White':'Black')+' to move';
    }
    renderPromotionOverlay();
    grid.innerHTML='';
    const legalTargets = (selected && badIndex<0 && !pendingPromotion) ? legalTargetsFor(board, turn, selected) : [];
    const legalMap = new Map(legalTargets.map(t => [t.r+','+t.f, t]));
    for(let rr=0; rr<8; rr++){
      for(let ff=0; ff<8; ff++){
        const { r, f } = boardFlipped ? { r:7-rr, f:7-ff } : { r:rr, f:ff };
        const sqEl=document.createElement('div');
        sqEl.className='sq '+(((rr+ff)&1)?'dark':'light');
        if(checkSquare && checkSquare.r === r && checkSquare.f === f) sqEl.classList.add('king-in-check');
        sqEl.dataset.r = String(r);
        sqEl.dataset.f = String(f);
        if(selected && selected.r===r && selected.f===f) sqEl.classList.add('hl-from');
        if(lastTo && lastTo.r===r && lastTo.f===f) sqEl.classList.add('hl-to');
        if(hoverTarget && hoverTarget.r===r && hoverTarget.f===f) sqEl.classList.add('drag-target');

        const legal = legalMap.get(r+','+f);
        const p=board[r][f];
        if(legal && !(selected && selected.r===r && selected.f===f)) renderLegalMarker(sqEl, legal.capture);
        if(p && PS[p]){
          const w=document.createElement('div');
          w.className='piece';
          if(dragState && dragState.from && dragState.from.r===r && dragState.from.f===f) w.classList.add('drag-hidden');
          w.innerHTML=PS[p];
          sqEl.appendChild(w);
        }
        sqEl.addEventListener('click',()=>onSquareClick(r,f,board,turn,badIndex));
        sqEl.addEventListener('pointerdown',ev=>onSquarePointerDown(ev,r,f,board,turn,badIndex));
        sqEl.addEventListener('pointerenter',()=>{
          if(!dragState) return;
          const legalMap = currentLegalTargetsMap();
          const nextHover = legalMap.has(r + ',' + f) ? { r, f } : null;
          hoverTarget = nextHover;
          applyHoverHighlight(hoverTarget);
        });
        grid.appendChild(sqEl);
      }
    }
    applyHoverHighlight(hoverTarget);
    const arrowFrom = lastFrom ? (boardFlipped ? { r: 7 - lastFrom.r, f: 7 - lastFrom.f } : lastFrom) : null;
    const arrowTo = lastTo ? (boardFlipped ? { r: 7 - lastTo.r, f: 7 - lastTo.f } : lastTo) : null;
    drawArr(ac, arrowFrom ? arrowFrom.r : -1, arrowFrom ? arrowFrom.f : -1, arrowTo ? arrowTo.r : -1, arrowTo ? arrowTo.f : -1);
    if(badIndex<0) queueEditorEval(board, turn);
  }

  function onSquareClick(r,f,board,turn,badIndex){
    if(suppressClick){ suppressClick=false; return; }
    if(badIndex>=0 || pendingPromotion || dragState) return;
    const piece=board[r][f];
    if(selected){
      if(piece && piece[0]===turn){
        selected={r,f};
        hoverTarget=null;
        rerender();
        return;
      }
      tryMove(selected, {r,f}, board, turn);
      return;
    }
    if(piece && piece[0]===turn){
      selected={r,f};
      hoverTarget=null;
      rerender();
    }
  }

  function clearPendingDrag(){
    if(dragHoldTimer){
      clearTimeout(dragHoldTimer);
      dragHoldTimer = null;
    }
    pendingDragStart = null;
  }

  function beginDrag(from, piece, x, y){
    selected = { r: from.r, f: from.f };
    dragState = { from: { r: from.r, f: from.f }, piece };
    hoverTarget = null;
    suppressClick = true;
    ensureGhost(piece);
    moveGhost(x, y);
    rerender();
  }

  function onSquarePointerDown(ev,r,f,board,turn,badIndex){
    if(badIndex>=0 || pendingPromotion) return;
    if(ev.button !== 0) return;
    const piece = board[r][f];
    if(!piece || piece[0] !== turn) return;
    ev.preventDefault();
    clearPendingDrag();
    suppressClick = false;
    pendingDragStart = {
      pointerId: ev.pointerId,
      from: { r, f },
      piece,
      startX: ev.clientX,
      startY: ev.clientY
    };
    dragHoldTimer = setTimeout(()=>{
      if(!pendingDragStart) return;
      beginDrag(pendingDragStart.from, pendingDragStart.piece, pendingDragStart.startX, pendingDragStart.startY);
      clearPendingDrag();
    }, 180);
  }

  function globalPointerMove(ev){
    if(dragState){
      suppressClick = true;
      moveGhost(ev.clientX, ev.clientY);
      const sq = squareFromPoint(ev.clientX, ev.clientY);
      const legalMap = currentLegalTargetsMap();
      const nextHover = (sq && legalMap.has(sq.r + ',' + sq.f)) ? sq : null;
      if((!nextHover && hoverTarget) || (nextHover && !sameSq(nextHover, hoverTarget))){
        hoverTarget = nextHover;
        applyHoverHighlight(hoverTarget);
      }
      return;
    }
    if(pendingDragStart && ev.pointerId === pendingDragStart.pointerId){
      const dx = ev.clientX - pendingDragStart.startX;
      const dy = ev.clientY - pendingDragStart.startY;
      if((dx*dx + dy*dy) >= 64){
        beginDrag(pendingDragStart.from, pendingDragStart.piece, ev.clientX, ev.clientY);
        clearPendingDrag();
      }
    }
  }

  function globalPointerUp(ev){
    if(dragState){
      const from = dragState.from;
      const board = activeBoard;
      const turn = activeTurn;
      const sq = squareFromPoint(ev.clientX, ev.clientY);
      const legalTargets = (activeBadIndex>=0) ? [] : legalTargetsFor(board, turn, from);
      const isLegalDrop = !!sq && legalTargets.some(t => t.r===sq.r && t.f===sq.f);
      removeGhost();
      dragState = null;
      hoverTarget = null;
      applyHoverHighlight(null);
      if(!sq || sameSq(sq, from) || activeBadIndex>=0 || !isLegalDrop){
        rerender();
        return;
      }
      tryMove(from, sq, board, turn);
      return;
    }

    if(pendingDragStart && ev.pointerId === pendingDragStart.pointerId){
      const from = pendingDragStart.from;
      const board = activeBoard;
      const turn = activeTurn;
      const piece = board[from.r][from.f];
      clearPendingDrag();

      if(!piece || piece[0] !== turn || activeBadIndex>=0 || pendingPromotion) return;

      if(selected && selected.r === from.r && selected.f === from.f){
        selected = null;
        hoverTarget = null;
      } else {
        selected = { r: from.r, f: from.f };
        hoverTarget = null;
      }
      rerender();
    }
  }

  if(!cleanupDone){
    document.addEventListener('pointermove', globalPointerMove);
    document.addEventListener('pointerup', globalPointerUp);
    document.addEventListener('pointercancel', globalPointerUp);
    cleanupDone = true;
  }

  rerender();
  return shell;
}



function payloadToCp(payload){
  if(!payload) return null;
  if(payload.type === 'cp') return Number(payload.value || 0) * 100;
  if(payload.type === 'mate'){
    const sign = Number(payload.value || 0) >= 0 ? 1 : -1;
    return sign * 100000;
  }
  return null;
}

function cloneGameFromFen(fen){
  if(typeof Chess !== 'function') return null;
  try { return new Chess(fen); } catch(_) { return null; }
}

function materialForColor(board, color){
  const values = { P:1, N:3, B:3, R:5, Q:9, K:0 };
  let total = 0;
  for(const row of board || []){
    for(const piece of row || []){
      if(!piece) continue;
      if(piece[0] === color) total += values[piece[1]] || 0;
    }
  }
  return total;
}

function uciFromMoveResult(res){
  if(!res?.from || !res?.to) return '';
  return res.from + res.to + (res.promotion || '');
}

function analyzeFenPromise(fen, turn, depth = 18, options = {}){
  return new Promise(resolve => {
    let settled = false;
    const finish = payload => {
      if(settled) return;
      settled = true;
      resolve(payload || null);
    };
    const targetDepth = Math.max(8, Number(depth) || 18);
    const timer = setTimeout(() => finish(null), Math.max(9000, targetDepth * 650));
    try {
      if(options?.parallel){
        requestParallelEval(fen, turn, targetDepth, !!options?.forceFresh).then(payload => {
          clearTimeout(timer);
          finish(payload);
        }).catch(() => {
          clearTimeout(timer);
          finish(null);
        });
        return;
      }
      requestEval(
        fen,
        turn,
        payload => {
          clearTimeout(timer);
          finish(payload);
        },
        () => {},
        targetDepth,
        options || {}
      );
    } catch(_) {
      clearTimeout(timer);
      finish(null);
    }
  });
}

const BRILLIANT_NEAR_BEST_CP = 30;
const BRILLIANT_STABILITY_CP = 45;
const BRILLIANT_REPLY_DROP_CP = 60;
const BRILLIANT_ALREADY_WINNING_CP = 350;
const BRILLIANT_NOT_BAD_AFTER_CP = -40;
const BRILLIANT_MIN_SAC_VALUE = 1;
const BRILLIANT_MAX_RESULTS = 8;
const BRILLIANT_PARALLEL_TASKS = Math.max(2, Math.min(4, Number((typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 4) || 4) - 1));
const BRILLIANT_TT = {
  sacNodes: new Map(),
  continuations: new Map(),
  findings: new Map(),
};
const BRILLIANT_MODE_CONFIGS = {
  quick: { key:'quick', label:'Quick', scanDepth:10, confirmDepth:16, replyDepth:16, replyQuickDepth:8, continuationDepth:18, maxShortlist:6, maxDeepReplies:4, treeMaxPly:24, treeNodeCap:2500 },
  deep: { key:'deep', label:'Deep', scanDepth:12, confirmDepth:20, replyDepth:20, replyQuickDepth:8, continuationDepth:22, maxShortlist:8, maxDeepReplies:6, treeMaxPly:80, treeNodeCap:12000 },
  unlimited: { key:'unlimited', label:'Unlimited', scanDepth:14, confirmDepth:24, replyDepth:24, replyQuickDepth:10, continuationDepth:26, maxShortlist:10, maxDeepReplies:8, treeMaxPly:160, treeNodeCap:50000 }
};

function getBrilliantModeConfig(mode){
  return BRILLIANT_MODE_CONFIGS[mode] || BRILLIANT_MODE_CONFIGS.deep;
}

function scoreForMover(cp, mover){
  if(cp == null) return null;
  return mover === 'w' ? cp : -cp;
}

function formatBrilliantScore(cp){
  if(cp == null) return 'n/a';
  if(Math.abs(cp) >= 99999) return cp > 0 ? '+M' : '-M';
  const pawns = (cp / 100).toFixed(2);
  return (cp > 0 ? '+' : '') + pawns;
}

function formatBrilliantGap(cp){
  if(cp == null) return 'n/a';
  return (Math.abs(cp) / 100).toFixed(2);
}

function moveSpecFromVerbose(move){
  return {
    from: move.from,
    to: move.to,
    promotion: move.promotion || undefined
  };
}

function squareToCoords(square){
  return {
    r: 8 - parseInt(String(square || '')[1], 10),
    f: String(square || '')[0].charCodeAt(0) - 97
  };
}

function inBounds(r, f){
  return r >= 0 && r < 8 && f >= 0 && f < 8;
}

function boardPiece(board, r, f){
  return inBounds(r, f) ? (board?.[r]?.[f] || null) : null;
}

function isSquareDefendedByBoard(board, targetR, targetF, color){
  if(!inBounds(targetR, targetF)) return false;

  const pawnRow = color === 'w' ? targetR + 1 : targetR - 1;
  for(const df of [-1, 1]){
    const pawn = boardPiece(board, pawnRow, targetF + df);
    if(pawn === color + 'P') return true;
  }

  const knightOffsets = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
  for(const [dr, df] of knightOffsets){
    const piece = boardPiece(board, targetR + dr, targetF + df);
    if(piece === color + 'N') return true;
  }

  const kingOffsets = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
  for(const [dr, df] of kingOffsets){
    const piece = boardPiece(board, targetR + dr, targetF + df);
    if(piece === color + 'K') return true;
  }

  const lineDirs = [
    { dr:-1, df:0, pieces:['R','Q'] },
    { dr:1, df:0, pieces:['R','Q'] },
    { dr:0, df:-1, pieces:['R','Q'] },
    { dr:0, df:1, pieces:['R','Q'] },
    { dr:-1, df:-1, pieces:['B','Q'] },
    { dr:-1, df:1, pieces:['B','Q'] },
    { dr:1, df:-1, pieces:['B','Q'] },
    { dr:1, df:1, pieces:['B','Q'] }
  ];
  for(const dir of lineDirs){
    let r = targetR + dir.dr;
    let f = targetF + dir.df;
    while(inBounds(r, f)){
      const piece = boardPiece(board, r, f);
      if(piece){
        if(piece[0] === color && dir.pieces.includes(piece[1])) return true;
        break;
      }
      r += dir.dr;
      f += dir.df;
    }
  }

  return false;
}

function pieceValue(piece){
  if(!piece) return 0;
  const values = { P:1, N:3, B:3, R:5, Q:9, K:0 };
  const key = String(piece).toUpperCase().slice(-1);
  return values[key] || 0;
}

function materialSwingForMove(beforeBoard, afterBoard, mover){
  return materialForColor(beforeBoard, mover) - materialForColor(afterBoard, mover);
}

function brilliantReasonFromSacrifice(sacValue){
  if(sacValue >= 9) return 'Queen sacrifice';
  if(sacValue >= 5) return 'Rook sacrifice';
  if(sacValue >= 3) return 'Piece sacrifice';
  return 'Material investment';
}

function findPieceCoords(board, pieceCode){
  for(let r = 0; r < 8; r++){
    for(let f = 0; f < 8; f++){
      if(board?.[r]?.[f] === pieceCode) return { r, f };
    }
  }
  return null;
}

function isSlidingPieceForDirection(piece, dir){
  const kind = String(piece || '').slice(-1);
  if(!dir) return false;
  if(kind === 'Q') return true;
  if((dir.dr === 0 || dir.df === 0) && kind === 'R') return true;
  if((dir.dr !== 0 && dir.df !== 0) && kind === 'B') return true;
  return false;
}

function isClearanceSacrifice(startBoard, fromCoords, mover, enemyColor){
  const enemyKing = findPieceCoords(startBoard, enemyColor + 'K');
  if(!enemyKing) return false;

  const dirs = [
    { dr:-1, df:0 }, { dr:1, df:0 }, { dr:0, df:-1 }, { dr:0, df:1 },
    { dr:-1, df:-1 }, { dr:-1, df:1 }, { dr:1, df:-1 }, { dr:1, df:1 }
  ];

  for(const dir of dirs){
    let r = fromCoords.r - dir.dr;
    let f = fromCoords.f - dir.df;
    let friendlySlider = null;
    while(inBounds(r, f)){
      const piece = boardPiece(startBoard, r, f);
      if(piece){
        if(piece[0] === mover && isSlidingPieceForDirection(piece, dir)){
          friendlySlider = { r, f, piece };
        }
        break;
      }
      r -= dir.dr;
      f -= dir.df;
    }
    if(!friendlySlider) continue;

    r = fromCoords.r + dir.dr;
    f = fromCoords.f + dir.df;
    while(inBounds(r, f)){
      if(r === enemyKing.r && f === enemyKing.f) return true;
      const piece = boardPiece(startBoard, r, f);
      if(piece) break;
      r += dir.dr;
      f += dir.df;
    }
  }
  return false;
}

function sacrificeCategoryLabel(category){
  switch(category){
    case 'direct_hanging': return 'Direct hanging sacrifice';
    case 'apparent': return 'Apparent sacrifice';
    case 'clearance': return 'Clearance sacrifice';
    case 'deflection': return 'Deflection sacrifice';
    case 'positional': return 'Positional sacrifice';
    default: return 'Sacrifice';
  }
}

function classifySacrificeCandidate(startBoard, res, mover, postMoveReplies){
  const enemyColor = mover === 'w' ? 'b' : 'w';
  const movedPieceValue = pieceValue(startBoard?.[8 - parseInt(res.from[1], 10)]?.[res.from.charCodeAt(0) - 97]);
  const capturedValue = pieceValue(res.captured);
  const fromCoords = squareToCoords(res.from);
  const toCoords = squareToCoords(res.to);
  const destinationDefended = isSquareDefendedByBoard(startBoard, toCoords.r, toCoords.f, enemyColor);
  const capturedWasHanging = capturedValue > 0 && !destinationDefended;
  const recaptureExists = (postMoveReplies || []).some(reply => reply.captured && reply.to === res.to);
  const quietOfferValue = !capturedValue && destinationDefended && recaptureExists ? movedPieceValue : 0;
  const apparentSacValue = destinationDefended && recaptureExists && movedPieceValue > capturedValue ? (movedPieceValue - capturedValue) : 0;
  const sacValue = Math.max(quietOfferValue, apparentSacValue);
  const isRealSacrifice = destinationDefended && recaptureExists;
  const isMeaningfulSacrifice = isRealSacrifice && movedPieceValue >= 3 && sacValue >= BRILLIANT_MIN_SAC_VALUE;
  let category = 'positional';
  if(isClearanceSacrifice(startBoard, fromCoords, mover, enemyColor)) category = 'clearance';
  else if(capturedValue > 0 && destinationDefended && recaptureExists) category = 'deflection';
  else if(quietOfferValue > 0) category = 'direct_hanging';
  else if(apparentSacValue > 0) category = 'apparent';

  return {
    movedPieceValue,
    capturedValue,
    destinationDefended,
    capturedWasHanging,
    recaptureExists,
    sacValue,
    isRealSacrifice,
    isMeaningfulSacrifice,
    category,
    categoryLabel: sacrificeCategoryLabel(category),
    reason: `${sacrificeCategoryLabel(category)} · ${movedPieceValue >= 9
      ? 'Queen sacrifice'
      : movedPieceValue >= 5
        ? 'Rook sacrifice'
        : movedPieceValue >= 3
          ? 'Piece sacrifice'
          : (quietOfferValue > apparentSacValue ? brilliantReasonFromSacrifice(quietOfferValue) : brilliantReasonFromSacrifice(apparentSacValue || quietOfferValue))}`
  };
}

function replyAcceptsSacrifice(reply, candidate){
  return !!reply?.captured && reply.to === candidate.to;
}

async function analyzeReplyContinuation(replyState, mover, replyEval, config){
  const continuationKey = `${replyState.fen()}|${mover}|${config.key}`;
  const cached = BRILLIANT_TT.continuations.get(continuationKey);
  if(cached && cached.depth >= config.continuationDepth){
    return cached.result ? { ...cached.result } : null;
  }

  const firstPvMove = Array.isArray(replyEval?.pv) ? replyEval.pv[0] : '';
  if(!firstPvMove) return null;

  const continuation = cloneGameFromFen(replyState.fen());
  if(!continuation) return null;
  const continuationRes = applyUciMove(continuation, firstPvMove);
  if(!continuationRes) return null;

  const continuationEval = await analyzeFenPromise(
    continuation.fen(),
    continuation.turn(),
    config.continuationDepth,
    { forceFresh:true, parallel:true }
  );
  const continuationScore = scoreForMover(payloadToCp(continuationEval), mover);
  if(continuationScore == null) return null;

  const result = {
    score: continuationScore,
    san: continuationRes.san,
    pvSan: pvToSan(continuation.fen(), continuationEval?.pv || [], 8)
  };
  BRILLIANT_TT.continuations.set(continuationKey, { depth: config.continuationDepth, result });
  return { ...result };
}

async function runLimited(items, limit, workerFn){
  const results = new Array(items.length);
  let index = 0;
  const workerCount = Math.max(1, Math.min(limit || 1, items.length || 0));
  if(!workerCount) return results;

  async function runOne(){
    while(true){
      const current = index++;
      if(current >= items.length) break;
      results[current] = await workerFn(items[current], current);
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => runOne()));
  return results;
}

function positionHasSacrificeCandidate(node){
  const cacheKey = `${node?.fen}|${node?.turn}`;
  if(BRILLIANT_TT.sacNodes.has(cacheKey)) return BRILLIANT_TT.sacNodes.get(cacheKey);
  const game = cloneGameFromFen(node?.fen);
  if(!game){
    BRILLIANT_TT.sacNodes.set(cacheKey, false);
    return false;
  }
  const legalMoves = game.moves({ verbose:true }) || [];
  for(const move of legalMoves){
    const nextGame = cloneGameFromFen(node.fen);
    if(!nextGame) continue;
    const res = nextGame.move(moveSpecFromVerbose(move));
    if(!res) continue;
    const postMoveReplies = nextGame.moves({ verbose:true }) || [];
    const sac = classifySacrificeCandidate(node.board, res, node.turn, postMoveReplies);
    if(sac.isMeaningfulSacrifice && !sac.capturedWasHanging){
      BRILLIANT_TT.sacNodes.set(cacheKey, true);
      return true;
    }
  }
  BRILLIANT_TT.sacNodes.set(cacheKey, false);
  return false;
}

async function findBrilliantCandidatesAtPosition(start, rootEval, onProgress, frontierIndex, config, onFinding){
  const emitFinding = typeof onFinding === 'function'
    ? item => {
        try {
          onFinding(item);
        } catch(err) {
          console.error('Brilliant finder live render failed', err);
        }
      }
    : null;
  const findingsKey = `${start.fen}|${start.turn}|${config.key}`;
  const cached = BRILLIANT_TT.findings.get(findingsKey);
  if(cached && cached.depth >= config.confirmDepth){
    const cachedResults = cached.result.map(item => ({
      ...item,
      path: Array.isArray(item.path) ? item.path.slice() : []
    }));
    if(emitFinding){
      cachedResults.forEach(item => emitFinding({
        ...item,
        path: Array.isArray(item.path) ? item.path.slice() : []
      }));
    }
    return cachedResults;
  }

  const rootGame = cloneGameFromFen(start.fen);
  if(!rootGame) return [];

  const mover = start.turn;
  const rootScore = scoreForMover(payloadToCp(rootEval), mover);
  const legalMoves = rootGame.moves({ verbose:true }) || [];
  if(!legalMoves.length) return [];

  const bestScore = rootScore == null ? -Infinity : rootScore;
  const candidateResults = await runLimited(legalMoves, BRILLIANT_PARALLEL_TASKS, async (move, i) => {
    if(typeof onProgress === 'function') onProgress({
      stage:'moves',
      frontierIndex,
      current:i + 1,
      total:legalMoves.length,
      san:move.san,
      path:start.path || []
    });

    const nextGame = cloneGameFromFen(start.fen);
    if(!nextGame) return null;
    const res = nextGame.move(moveSpecFromVerbose(move));
    if(!res) return null;

    const postMoveReplies = nextGame.moves({ verbose:true }) || [];
    const sac = classifySacrificeCandidate(start.board, res, mover, postMoveReplies);
    if(!sac.isMeaningfulSacrifice) return null;
    if(sac.capturedWasHanging) return null;

    const shallowEval = await analyzeFenPromise(nextGame.fen(), nextGame.turn(), config.scanDepth, { parallel:true });
    const shallowScore = scoreForMover(payloadToCp(shallowEval), mover);
    if(shallowScore == null) return null;
    if(rootScore != null && shallowScore < rootScore - (BRILLIANT_NEAR_BEST_CP * 2)) return null;

    const deepEval = await analyzeFenPromise(nextGame.fen(), nextGame.turn(), config.confirmDepth, { forceFresh:true, parallel:true });
    const deepScore = scoreForMover(payloadToCp(deepEval), mover);
    if(deepScore == null) return null;
    if(rootScore != null && deepScore < rootScore - BRILLIANT_NEAR_BEST_CP) return null;

    return {
      san: res.san,
      uci: uciFromMoveResult(res),
      sacValue: sac.sacValue,
      shallowScore,
      deepScore,
      stability: (shallowScore == null || deepScore == null) ? null : Math.abs(deepScore - shallowScore),
      pvSan: pvToSan(nextGame.fen(), deepEval?.pv || [], 8),
      afterFen: nextGame.fen(),
      to: res.to,
      reason: res.captured ? `Apparent ${sac.reason.toLowerCase()}` : sac.reason
    };
  });

  const candidates = candidateResults.filter(Boolean);

  if(!Number.isFinite(bestScore)) return [];

  const shortlist = candidates
    .filter(candidate => bestScore - candidate.deepScore <= BRILLIANT_NEAR_BEST_CP)
    .sort((a, b) => (b.sacValue - a.sacValue) || (b.deepScore - a.deepScore) || a.san.localeCompare(b.san))
    .slice(0, config.maxShortlist);

  const findingResults = await runLimited(shortlist, BRILLIANT_PARALLEL_TASKS, async (candidate, i) => {
    const replyGame = cloneGameFromFen(candidate.afterFen);
    if(!replyGame) return null;
    const replies = (replyGame.moves({ verbose:true }) || []).slice().sort((a, b) => {
      return Number(replyAcceptsSacrifice(b, candidate)) - Number(replyAcceptsSacrifice(a, candidate));
    });

    let worstReplyScore = candidate.deepScore;
    let worstReplySan = '';
    let worstContinuationSan = '';
    let foundAcceptance = false;
    const replySnapshots = [];

    const snapshotResults = await runLimited(replies, BRILLIANT_PARALLEL_TASKS, async (reply, j) => {
      if(typeof onProgress === 'function') onProgress({
        stage:'replies',
        frontierIndex,
        current:j + 1,
        total:replies.length,
        san:candidate.san,
        reply:reply.san,
        candidateIndex:i + 1,
        candidateTotal:shortlist.length,
        path:start.path || []
      });

      const replyState = cloneGameFromFen(candidate.afterFen);
      if(!replyState) return null;
      const replyRes = replyState.move(moveSpecFromVerbose(reply));
      if(!replyRes) return null;
      const acceptance = replyAcceptsSacrifice(reply, candidate);

      const quickEval = await analyzeFenPromise(replyState.fen(), replyState.turn(), config.replyQuickDepth, { parallel:true });
      const quickScore = scoreForMover(payloadToCp(quickEval), mover);
      if(quickScore == null) return null;

      return {
        acceptance,
        san: replyRes.san,
        fen: replyState.fen(),
        turn: replyState.turn(),
        quickScore
      };
    });

    for(const snapshot of snapshotResults.filter(Boolean)){
      replySnapshots.push(snapshot);
      if(snapshot.acceptance) foundAcceptance = true;
      if(snapshot.quickScore < worstReplyScore){
        worstReplyScore = snapshot.quickScore;
        worstReplySan = snapshot.san;
        worstContinuationSan = '';
      }
    }

    const deepReplyPool = replySnapshots
      .slice()
      .sort((a, b) => {
        if(Number(b.acceptance) !== Number(a.acceptance)) return Number(b.acceptance) - Number(a.acceptance);
        return a.quickScore - b.quickScore;
      })
      .slice(0, config.maxDeepReplies);

    const deepResults = await runLimited(deepReplyPool, BRILLIANT_PARALLEL_TASKS, async snapshot => {
      const replyEval = await analyzeFenPromise(snapshot.fen, snapshot.turn, config.replyDepth, { forceFresh:true, parallel:true });
      const replyScore = scoreForMover(payloadToCp(replyEval), mover);
      if(replyScore == null) return null;

      let resolvedScore = replyScore;
      let continuationSan = '';
      const replyState = cloneGameFromFen(snapshot.fen);
      if(replyState){
        const continuation = await analyzeReplyContinuation(replyState, mover, replyEval, config);
        if(continuation?.score != null){
          resolvedScore = continuation.score;
          continuationSan = continuation.san || '';
        }
      }

      return { resolvedScore, san: snapshot.san, continuationSan, acceptance: snapshot.acceptance };
    });

    let bestAcceptance = null;
    let bestDecline = null;
    let bestDefense = null;

    for(const result of deepResults.filter(Boolean)){
      if(result.acceptance && (!bestAcceptance || result.resolvedScore < bestAcceptance.score)){
        bestAcceptance = { san: result.san, score: result.resolvedScore, continuationSan: result.continuationSan };
      }
      if(!result.acceptance && (!bestDecline || result.resolvedScore < bestDecline.score)){
        bestDecline = { san: result.san, score: result.resolvedScore, continuationSan: result.continuationSan };
      }
      if(!bestDefense || result.resolvedScore < bestDefense.score){
        bestDefense = { san: result.san, score: result.resolvedScore, continuationSan: result.continuationSan };
      }
      if(result.resolvedScore < worstReplyScore){
        worstReplyScore = result.resolvedScore;
        worstReplySan = result.san;
        worstContinuationSan = result.continuationSan;
      }
    }

    const notAlreadyWinning = rootScore == null ? true : rootScore < BRILLIANT_ALREADY_WINNING_CP;
    const stableEnough = candidate.stability == null || candidate.stability <= BRILLIANT_STABILITY_CP;
    const replyHolds = worstReplyScore >= candidate.deepScore - BRILLIANT_REPLY_DROP_CP;
    const notBadAfterMove = worstReplyScore >= BRILLIANT_NOT_BAD_AFTER_CP;
    const stillNearBestAfterDefense = rootScore == null ? true : worstReplyScore >= rootScore - BRILLIANT_NEAR_BEST_CP;
    const sacrificeCanBeAccepted = foundAcceptance;

    if(notAlreadyWinning && stableEnough && replyHolds && notBadAfterMove && stillNearBestAfterDefense && sacrificeCanBeAccepted){
      const found = {
        path: (start.path || []).slice(),
        pathPly: frontierIndex,
        san: candidate.san,
        uci: candidate.uci,
        sacValue: candidate.sacValue,
        score: candidate.deepScore,
        rootScore,
        bestGap: bestScore - candidate.deepScore,
        worstReplySan,
        worstReplyScore,
        worstContinuationSan,
        bestAcceptanceSan: bestAcceptance?.san || '',
        bestAcceptanceScore: bestAcceptance?.score ?? null,
        bestDeclineSan: bestDecline?.san || '',
        bestDeclineScore: bestDecline?.score ?? null,
        bestDefenseSan: bestDefense?.san || worstReplySan,
        bestDefenseScore: bestDefense?.score ?? worstReplyScore,
        stability: candidate.stability,
        pvSan: candidate.pvSan,
        reason: candidate.reason
      };
      if(emitFinding){
        emitFinding({
          ...found,
          path: Array.isArray(found.path) ? found.path.slice() : []
        });
      }
      return found;
    }
    return null;
  });

  const finalFindings = findingResults.filter(Boolean);
  BRILLIANT_TT.findings.set(findingsKey, {
    depth: config.confirmDepth,
    result: finalFindings.map(item => ({
      ...item,
      path: Array.isArray(item.path) ? item.path.slice() : []
    }))
  });
  return finalFindings;
}

async function findBrilliantMovesFromPosition(moves, onProgress, mode='deep', onFinding){
  const config = getBrilliantModeConfig(mode);
  const built = buildStatesFromMoves(moves || []);
  const states = built.states || [];
  const start = states[states.length - 1];
  if(!start?.fen) return [];

  const findings = [];
  const seenNodes = new Set();
  let exploredNodes = 0;

  async function visit(node, ply){
    if(!node?.fen || ply > config.treeMaxPly || exploredNodes >= config.treeNodeCap) return;
    const nodeKey = `${ply}|${node.fen}`;
    if(seenNodes.has(nodeKey)) return;
    seenNodes.add(nodeKey);
    exploredNodes++;

    if(typeof onProgress === 'function'){
      onProgress({
        stage:'tree',
        depth: ply,
        explored: exploredNodes,
        total: config.treeNodeCap,
        path: node.path || []
      });
    }

    const game = cloneGameFromFen(node.fen);
    if(!game) return;
    const legalMoves = game.moves({ verbose:true }) || [];
    if(!legalMoves.length) return;

    if(positionHasSacrificeCandidate(node)){
      const rootEval = await analyzeFenPromise(node.fen, node.turn, config.confirmDepth, { forceFresh:true, parallel:true });
      if(rootEval){
        const localFindings = await findBrilliantCandidatesAtPosition(node, rootEval, onProgress, ply, config, onFinding);
        findings.push(...localFindings);
      }
    }

    if(ply >= config.treeMaxPly || exploredNodes >= config.treeNodeCap) return;

    for(const move of legalMoves){
      if(exploredNodes >= config.treeNodeCap) break;
      const nextGame = cloneGameFromFen(node.fen);
      if(!nextGame) continue;
      const res = nextGame.move(moveSpecFromVerbose(move));
      if(!res) continue;
      await visit({
        fen: nextGame.fen(),
        turn: nextGame.turn(),
        board: boardFromChessJs(nextGame),
        path: [...(node.path || []), res.san]
      }, ply + 1);
    }
  }

  await visit({
    fen: start.fen,
    turn: start.turn,
    board: start.board,
    path: []
  }, 0);

  const deduped = [];
  const seenFindings = new Set();
  for(const item of findings){
    const key = [...(item.path || []), item.san].join(' ');
    if(seenFindings.has(key)) continue;
    seenFindings.add(key);
    deduped.push(item);
  }

  return deduped
    .sort((a, b) => (a.bestGap - b.bestGap) || (b.sacValue - a.sacValue) || (b.score - a.score))
    .slice(0, BRILLIANT_MAX_RESULTS);
}

function closeBrilliantMoveFinder(){
  document.body.classList.remove('brilliant-page-open');
  document.getElementById('brilliant-panel')?.remove();
  document.getElementById('brilliant-top-btn')?.classList.remove('active');
}

function openBrilliantMoveFinder(initialMoves = [], label = 'custom position'){
  if(edOpen) closeEd();
  const existing = document.getElementById('brilliant-panel');
  if(existing) existing.remove();

  document.body.classList.add('brilliant-page-open');
  document.getElementById('brilliant-top-btn')?.classList.add('active');

  const panel = document.createElement('div');
  panel.id = 'brilliant-panel';

  const panelHead = document.createElement('div');
  panelHead.className = 'ed-head';
  panelHead.innerHTML = '<span class="ed-head-title">Brilliant Move Finder</span>';
  const panelClose = document.createElement('button');
  panelClose.className = 'ed-close';
  panelClose.type = 'button';
  panelClose.textContent = '✕';
  panelClose.onclick = closeBrilliantMoveFinder;
  panelHead.appendChild(panelClose);
  panel.appendChild(panelHead);

  const pageBody = document.createElement('div');
  pageBody.className = 'brilliant-page-body';

  const card = document.createElement('div');
  card.className = 'practice-card practice-room brilliant-page-card';

  const head = document.createElement('div');
  head.className = 'practice-room-head';
  const copy = document.createElement('div');
  copy.className = 'practice-room-copy';
  copy.innerHTML = `<div class="practice-room-title">Brilliant Move Finder</div><div class="practice-room-sub">Build a starting position for <strong>${esc(label)}</strong>, then scan every legal move from that position. The finder now spends the extra depth inside each candidate and every legal reply instead of walking forward through unrelated engine-line positions.</div>`;
  const closeBtn = document.createElement('button');
  closeBtn.className = 'hbtn practice-close';
  closeBtn.type = 'button';
  closeBtn.textContent = 'Close';
  closeBtn.onclick = closeBrilliantMoveFinder;
  head.appendChild(copy);
  head.appendChild(closeBtn);
  card.appendChild(head);

  const block = {
    moves: (initialMoves || []).map(move => ({ san: move.san, comment: move.comment || '' }))
  };
  const BRILLIANT_START_STORAGE_KEY = 'chess-notes-brilliant-start-position';
  let scanStartMoves = (block.moves || []).map(move => ({ san: move.san, comment: move.comment || '' }));
  if(!scanStartMoves.length){
    try {
      const saved = JSON.parse(localStorage.getItem(BRILLIANT_START_STORAGE_KEY) || 'null');
      if(Array.isArray(saved?.moves) && saved.moves.length){
        block.moves = saved.moves.map(move => ({ san: move.san, comment: move.comment || '' }));
        scanStartMoves = block.moves.map(move => ({ san: move.san, comment: move.comment || '' }));
        if(saved.label) label = saved.label;
      }
    } catch(_) {}
  }

  const editor = document.createElement('div');
  editor.style.cssText = 'display:flex;flex-direction:column;gap:10px;';
  const field = document.createElement('div');
  field.className = 'ed-field';
  field.innerHTML = '<label class="ed-label">Moves to starting position</label>';
  const lineRow = document.createElement('div');
  lineRow.className = 'editor-line-row';
  const sanBox = document.createElement('input');
  sanBox.className = 'ed-input ed-mono';
  sanBox.placeholder = 'Leave blank for the initial position, or enter SAN moves like e4 e5 Nf3 Nc6';
  sanBox.value = (block.moves || []).map(move => move.san).filter(Boolean).join(' ');
  lineRow.appendChild(sanBox);

  const engineBox = document.createElement('div');
  engineBox.className = 'engine-line-box';
  const engineLabel = document.createElement('div');
  engineLabel.className = 'engine-line-label';
  engineLabel.textContent = 'Engine line';
  const engineValue = document.createElement('div');
  engineValue.className = 'engine-line-value empty';
  engineValue.textContent = 'Build a starting position to preview the engine line.';
  engineBox.appendChild(engineLabel);
  engineBox.appendChild(engineValue);
  lineRow.appendChild(engineBox);
  field.appendChild(lineRow);
  const fieldHint = document.createElement('div');
  fieldHint.className = 'practice-strength-hint';
  fieldHint.textContent = 'You can enter moves in the text box or use the board below. The scan starts from the final position you build.';
  field.appendChild(fieldHint);
  editor.appendChild(field);

  let brilliantMode = 'deep';
  const modeField = document.createElement('div');
  modeField.className = 'ed-field';
  modeField.innerHTML = '<label class="ed-label">Search mode</label>';
  const modeSelect = document.createElement('select');
  modeSelect.className = 'ed-select';
  modeSelect.innerHTML = `
    <option value="quick">Quick</option>
    <option value="deep" selected>Deep</option>
    <option value="unlimited">Unlimited</option>
  `;
  const modeHint = document.createElement('div');
  modeHint.className = 'practice-strength-hint';
  function updateModeHint(){
    const cfg = getBrilliantModeConfig(brilliantMode);
    modeHint.textContent = `${cfg.label} mode: confirm depth ${cfg.confirmDepth}, reply depth ${cfg.replyDepth}, up to ${cfg.treeNodeCap} positions.`;
  }
  modeSelect.oninput = e => {
    brilliantMode = e.target.value || 'deep';
    updateModeHint();
  };
  updateModeHint();
  modeField.appendChild(modeSelect);
  modeField.appendChild(modeHint);
  editor.appendChild(modeField);

  const boardHost = document.createElement('div');
  editor.appendChild(boardHost);

  function updateEngineLine(payload, fen){
    const line = pvToSan(fen, payload?.pv || []);
    engineValue.textContent = line || 'No principal variation yet.';
    engineValue.classList.toggle('empty', !line);
  }

  function renderBoardInput(){
    boardHost.innerHTML = '';
    boardHost.appendChild(buildEditorBoardInput(block, sanBox, ()=>{}, updateEngineLine));
  }

  sanBox.addEventListener('input', e => {
    const tokens = e.target.value.trim().split(/\s+/).filter(Boolean);
    block.moves = tokens.map(san => ({ san, comment:'' }));
    engineValue.textContent = tokens.length ? 'Updating engine line...' : 'Build a starting position to preview the engine line.';
    engineValue.classList.toggle('empty', true);
    renderBoardInput();
  });

  renderBoardInput();
  card.appendChild(editor);

  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;gap:10px;flex-wrap:wrap;';
  const runBtn = document.createElement('button');
  runBtn.className = 'hbtn primary-btn';
  runBtn.type = 'button';
  runBtn.textContent = 'Find in engine lines';
  const backBtn = document.createElement('button');
  backBtn.className = 'hbtn';
  backBtn.type = 'button';
  backBtn.textContent = 'Go back to starting position';
  backBtn.disabled = !scanStartMoves.length;
  backBtn.onclick = () => {
    block.moves = scanStartMoves.map(move => ({ san: move.san, comment:'' }));
    sanBox.value = scanStartMoves.map(move => move.san).filter(Boolean).join(' ');
    engineValue.textContent = 'Updating engine line...';
    engineValue.classList.add('empty');
    renderBoardInput();
    window.requestAnimationFrame(() => {
      boardHost.scrollIntoView({ behavior:'smooth', block:'start' });
    });
  };
  const saveStartBtn = document.createElement('button');
  saveStartBtn.className = 'hbtn';
  saveStartBtn.type = 'button';
  saveStartBtn.textContent = 'Save starting position';
  saveStartBtn.onclick = () => {
    const currentMoves = (block.moves || []).map(move => ({ san: move.san, comment:'' }));
    try {
      localStorage.setItem(BRILLIANT_START_STORAGE_KEY, JSON.stringify({
        label,
        moves: currentMoves
      }));
      scanStartMoves = currentMoves.map(move => ({ san: move.san, comment:'' }));
      backBtn.disabled = !scanStartMoves.length;
      status.textContent = currentMoves.length ? 'Starting position saved for Brilliant Finder.' : 'Empty starting position saved for Brilliant Finder.';
      status.className = 'practice-status ok';
    } catch(_) {
      status.textContent = 'Could not save the starting position in this browser.';
      status.className = 'practice-status err';
    }
  };
  const resetBtn = document.createElement('button');
  resetBtn.className = 'hbtn';
  resetBtn.type = 'button';
  resetBtn.textContent = 'Reset position';
  resetBtn.onclick = () => {
    block.moves = [];
    sanBox.value = '';
    engineValue.textContent = 'Build a starting position to preview the engine line.';
    engineValue.classList.add('empty');
    renderBoardInput();
  };
  actions.appendChild(runBtn);
  actions.appendChild(backBtn);
  actions.appendChild(saveStartBtn);
  actions.appendChild(resetBtn);
  card.appendChild(actions);

  const status = document.createElement('div');
  status.className = 'practice-status';
  status.textContent = 'Ready to scan this starting position.';
  card.appendChild(status);

  const results = document.createElement('div');
  results.style.cssText = 'display:flex;flex-direction:column;gap:10px;';
  const resultsTitle = document.createElement('div');
  resultsTitle.className = 'engine-line-label';
  resultsTitle.textContent = 'Brilliant moves found';
  resultsTitle.style.display = 'none';
  results.appendChild(resultsTitle);
  card.appendChild(results);

  function renderFinding(item, baseMoves, foundKeys){
    if(!item || !results?.isConnected) return false;
    const key = [...(item.path || []), item.san].join(' ');
    if(foundKeys.has(key)) return false;
    foundKeys.add(key);
    resultsTitle.style.display = 'block';
    const box = document.createElement('div');
    box.className = 'engine-line-box';
    const prefix = item.path && item.path.length ? `After ${item.path.join(' ')} -> ` : '';
    const replyParts = [];
    if(item.bestAcceptanceSan) replyParts.push(`Best acceptance: ${item.bestAcceptanceSan} (${formatBrilliantScore(item.bestAcceptanceScore)})`);
    if(item.bestDeclineSan) replyParts.push(`Best decline: ${item.bestDeclineSan} (${formatBrilliantScore(item.bestDeclineScore)})`);
    if(item.bestDefenseSan) replyParts.push(`Best defense: ${item.bestDefenseSan} (${formatBrilliantScore(item.bestDefenseScore)})`);
    const replyText = replyParts.length ? replyParts.join(' | ') : (item.worstReplySan ? `${item.worstReplySan} keeps the eval at ${formatBrilliantScore(item.worstReplyScore)}` : 'No legal reply improves the defense');
    const pvText = item.pvSan ? ` PV: ${item.pvSan}` : '';
    const fullLine = [...baseMoves, ...(item.path || []), item.san].filter(Boolean).join(' ');
    box.innerHTML = `<div class="engine-line-label">${esc(prefix + item.san)} | ${esc(item.reason)}</div><div class="engine-line-value">Eval ${formatBrilliantScore(item.score)} | best-gap ${formatBrilliantGap(item.bestGap)} | sacrifice value ${item.sacValue} | ${esc(replyText)}${esc(pvText)}</div>`;
    const actionRow = document.createElement('div');
    actionRow.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-top:8px;';
    const loadBtn = document.createElement('button');
    loadBtn.className = 'hbtn';
    loadBtn.type = 'button';
    loadBtn.textContent = 'Load on board';
    loadBtn.onclick = () => {
      block.moves = fullLine.split(/\s+/).filter(Boolean).map(san => ({ san, comment:'' }));
      sanBox.value = fullLine;
      engineValue.textContent = 'Updating engine line...';
      engineValue.classList.add('empty');
      renderBoardInput();
      window.requestAnimationFrame(() => {
        boardHost.scrollIntoView({ behavior:'smooth', block:'start' });
      });
    };
    actionRow.appendChild(loadBtn);
    box.appendChild(actionRow);
    const movesLabel = document.createElement('div');
    movesLabel.className = 'engine-line-label';
    movesLabel.style.marginTop = '8px';
    movesLabel.textContent = 'Moves to reach this brilliant move';
    const movesBox = document.createElement('textarea');
    movesBox.className = 'ed-textarea ed-mono';
    movesBox.readOnly = true;
    movesBox.value = fullLine;
    movesBox.style.minHeight = '76px';
    movesBox.style.resize = 'vertical';
    box.appendChild(movesLabel);
    box.appendChild(movesBox);
    results.appendChild(box);
    return true;
  }

  runBtn.onclick = async () => {
    runBtn.disabled = true;
    results.innerHTML = '';
    results.appendChild(resultsTitle);
    resultsTitle.style.display = 'none';
    scanStartMoves = (block.moves || []).map(move => ({ san: move.san, comment:'' }));
    backBtn.disabled = !scanStartMoves.length;
    status.textContent = 'Analyzing start position...';
    status.className = 'practice-status';
    try {
      const baseMoves = (block.moves || []).map(move => move.san).filter(Boolean);
      const foundKeys = new Set();
      let liveFoundCount = 0;
      const findings = await findBrilliantMovesFromPosition(block.moves || [], progress => {
        if(progress.stage === 'tree') {
          status.textContent = `Scanning deep reply tree depth ${progress.depth} (${progress.explored}/${progress.total} positions)`;
          return;
        }
        if(progress.stage === 'moves') {
          status.textContent = `Checking legal move ${progress.current} of ${progress.total}: ${progress.san}`;
          return;
        }
        if(progress.stage === 'replies') {
          status.textContent = `Checking replies for ${progress.san} (${progress.current}/${progress.total})`;
        }
      }, brilliantMode, item => {
        try {
          if(renderFinding(item, baseMoves, foundKeys)){
            liveFoundCount++;
            status.textContent = `Found ${liveFoundCount} brilliant-move candidate${liveFoundCount === 1 ? '' : 's'} so far...`;
            status.className = 'practice-status ok';
          }
        } catch(err) {
          console.error('Brilliant finder could not render a live result', err);
        }
      });
      if(!findings.length){
        status.textContent = 'No brilliant-move candidates were found in the scanned engine-line positions from this start.';
        status.className = 'practice-status';
      } else {
        status.textContent = `Found ${findings.length} brilliant-move candidate${findings.length === 1 ? '' : 's'} in the scanned engine lines.`;
        status.className = 'practice-status ok';
        findings.forEach(item => { renderFinding(item, baseMoves, foundKeys); });
      }
    } catch(_) {
      status.textContent = 'The brilliant move finder could not finish this scan.';
      status.className = 'practice-status err';
    } finally {
      runBtn.disabled = false;
    }
  };

  pageBody.appendChild(card);
  panel.appendChild(pageBody);
  document.body.appendChild(panel);
}

function buildLineWidget(moves){
  if(typeof Chess !== 'function'){
    const err = el('div','comment-box');
    err.textContent = 'Saved line viewer needs the chess.js library to load first.';
    return err;
  }
  const game = new Chess();
  const states = [{
    board: boardFromChessJs(game),
    from: null,
    to: null,
    san: '',
    turn: game.turn(),
    comment: '',
    fen: game.fen(),
    checkSquare: checkedKingSquareFromGame(game)
  }];
  for(const mv of moves){
    try {
      const before = game.turn();
      const res = game.move(mv.san, { sloppy: true });
      if(!res) continue;
      states.push({
        board: boardFromChessJs(game),
        from: { r: 8 - parseInt(res.from[1],10), f: res.from.charCodeAt(0) - 97 },
        to:   { r: 8 - parseInt(res.to[1],10),   f: res.to.charCodeAt(0) - 97 },
        san: mv.san,
        turn: game.turn(),
        comment: mv.comment || '',
        fen: game.fen(),
        checkSquare: checkedKingSquareFromGame(game)
      });
    } catch(_) {}
  }

  const layout = el('div','study-layout');

  const evalShell = el('div','eval-shell');
  const evalWrap = el('div','eval-wrap');
  const evalBar = el('div','eval-bar');
  const evalBlack = el('div','eval-black');
  const evalMarker = el('div','eval-marker');
  const evalTop = el('div','eval-score top');
  const evalBottom = el('div','eval-score bottom');
  evalTop.textContent = '';
  evalBottom.textContent = '0.0';
  evalBar.appendChild(evalTop);
  evalBar.appendChild(evalBottom);
  evalBar.appendChild(evalBlack);
  evalBar.appendChild(evalMarker);
  const evalMeta = el('div','eval-meta');
  const evalText = el('div','eval-text'); evalText.textContent = '0.0';
  const evalState = el('div','eval-state'); evalState.textContent = 'idle';
  evalMeta.appendChild(evalText);
  evalMeta.appendChild(evalState);
  evalWrap.appendChild(evalBar);
  evalWrap.appendChild(evalMeta);
  evalShell.appendChild(evalWrap);

  const evalUi = { bar: evalBar, black: evalBlack, marker: evalMarker, text: evalText, state: evalState, top: evalTop, bottom: evalBottom };

  const bw = el('div','board-wrap');
  const coords = el('div','board-coords');
  const rl = el('div','rank-labels');
  for(let i=8;i>=1;i--){ const s=document.createElement('span'); s.textContent=i; rl.appendChild(s); }
  const gw = el('div','board-gwrap');
  gw.setAttribute('role','img');
  gw.setAttribute('aria-label','Practice chess position');
  gw.setAttribute('role','img');
  gw.setAttribute('aria-label',`Chess position at move 0 of ${moves.length}`);
  const grid = el('div','board-grid'); const ac = document.createElement('canvas'); ac.className='board-arrow-layer'; gw.appendChild(grid); gw.appendChild(ac);
  const fl = el('div','file-labels');
  'abcdefgh'.split('').forEach(ch=>{ const s=document.createElement('span'); s.textContent=ch; fl.appendChild(s); });
  coords.appendChild(rl); coords.appendChild(gw); coords.appendChild(fl); bw.appendChild(coords);

  const mp = el('div','move-panel');
  const nav = el('div','move-nav');
  const b1 = el('button','mv-btn'); b1.textContent='⏮'; b1.setAttribute('aria-label','First move');
  const b2 = el('button','mv-btn'); b2.textContent='◀'; b2.setAttribute('aria-label','Previous move');
  const playBtn = el('button','mv-btn'); playBtn.textContent='▶'; playBtn.setAttribute('aria-label','Play line');
  const flipBtn = el('button','mv-btn'); flipBtn.textContent='⇅'; flipBtn.setAttribute('aria-label','Flip board');
  const b3 = el('button','mv-btn'); b3.textContent='▶'; b3.setAttribute('aria-label','Next move');
  const b4 = el('button','mv-btn'); b4.textContent='⏭'; b4.setAttribute('aria-label','Last move');
  const ctr = el('div','mv-ctr'); ctr.textContent='0 / '+moves.length;
  const leftControls = el('div','mv-left-controls');
  leftControls.appendChild(b1);
  leftControls.appendChild(b2);
  leftControls.appendChild(playBtn);
  leftControls.appendChild(b3);
  leftControls.appendChild(b4);
  leftControls.appendChild(ctr);
  leftControls.appendChild(flipBtn);
  nav.appendChild(leftControls);

  const ml = el('div','move-list-inner');
  const cmt = el('div','comment-box empty'); cmt.textContent='Navigate moves to see annotations.';

  let moveNo = 1;
  for(let i=0;i<moves.length;i+=2){
    const row = el('div','mp');
    const num = el('div','mn'); num.textContent = moveNo + '.';
    row.appendChild(num);
    const w = moves[i];
    const wb = el('button','mb'); wb.dataset.ply = String(i+1); wb.textContent = w.san || ''; wb.setAttribute('aria-label',`Move ${i+1}: ${w.san || 'unknown'}`);
    wb.onclick = ()=>goto(i+1); row.appendChild(wb);
    if(i+1 < moves.length){
      const b = moves[i+1];
      const bb = el('button','mb'); bb.dataset.ply = String(i+2); bb.textContent = b.san || ''; bb.setAttribute('aria-label',`Move ${i+2}: ${b.san || 'unknown'}`);
      bb.onclick = ()=>goto(i+2); row.appendChild(bb);
    }
    ml.appendChild(row); moveNo++;
  }

  mp.appendChild(nav); mp.appendChild(ml); mp.appendChild(cmt);
  layout.appendChild(evalShell); layout.appendChild(bw); layout.appendChild(mp);

  let ply = 0;
  let flipped = false;
  let playTimer = null;

  function stopPlay(){
    if(playTimer){
      clearInterval(playTimer);
      playTimer = null;
    }
    playBtn.textContent = '▶';
    playBtn.setAttribute('aria-label','Play line');
    playBtn.classList.remove('active');
  }

  function startPlay(){
    stopPlay();
    playBtn.textContent = '⏸';
    playBtn.setAttribute('aria-label','Pause line');
    playBtn.classList.add('active');
    playTimer = setInterval(() => {
      if(ply >= moves.length){
        stopPlay();
        return;
      }
      goto(ply + 1);
    }, 700);
  }

  function goto(p, requestEngine=true){
    if(p < 0) p = 0;
    if(p > moves.length) p = moves.length;
    const prevPly = ply;
    ply = p;
    const s = states[ply];

    const doAnim = Math.abs(ply - prevPly) === 1 && s.from && s.to && typeof gw !== 'undefined';
    let movingPiece = null;
    if(doAnim){
      const prevState = states[prevPly];
      if(prevState && prevState.board && s.from){
        movingPiece = prevState.board[s.from.r]?.[s.from.f] || null;
      }
    }

    renderBrd(grid, ac, s.board, s.from, s.to, !!movingPiece, flipped, s.checkSquare);
    gw.setAttribute('aria-label',`Chess position at move ${ply} of ${moves.length}`);

    if(doAnim && movingPiece){
      const ghost = document.createElement('div');
      ghost.className = 'line-move-ghost';
      ghost.innerHTML = mkPS()[movingPiece] || '';

      const sq = Math.min(gw.clientWidth || (getSq()*8), gw.clientHeight || (getSq()*8)) / 8;
      const start = flipped ? { r: 7 - s.from.r, f: 7 - s.from.f } : s.from;
      const end = flipped ? { r: 7 - s.to.r, f: 7 - s.to.f } : s.to;

      ghost.style.width = sq + 'px';
      ghost.style.height = sq + 'px';
      ghost.style.left = (start.f * sq) + 'px';
      ghost.style.top = (start.r * sq) + 'px';
      gw.appendChild(ghost);

      requestAnimationFrame(() => {
        ghost.style.transform = `translate3d(${(end.f - start.f) * sq}px, ${(end.r - start.r) * sq}px, 0)`;
      });

      setTimeout(() => {
        ghost.remove();
        renderBrd(grid, ac, s.board, s.from, s.to, false, flipped, s.checkSquare);
      }, 190);
    }

    ctr.textContent = ply + ' / ' + moves.length;
    ml.querySelectorAll('.mb').forEach(b => b.classList.toggle('active', +b.dataset.ply === ply));
    const active = ml.querySelector('.mb.active');
    if(active) active.scrollIntoView({ block:'nearest', behavior:'smooth' });

    if(ply > 0 && moves[ply-1].comment){
      cmt.textContent = moves[ply-1].comment;
      cmt.classList.remove('empty');
    } else if(ply === 0){
      cmt.textContent = 'Navigate moves to see annotations.';
      cmt.classList.add('empty');
    } else {
      cmt.textContent = '—';
      cmt.classList.add('empty');
    }

    if (requestEngine && s && s.fen && typeof requestEval === 'function') {
      try {
        requestEval(
          s.fen,
          s.turn,
          payload => updateEvalUI(evalUi, payload),
          txt => setEvalStatus(evalUi, txt),
          18
        );
      } catch(_) {}
    }

    if(ply >= moves.length) stopPlay();
  }

  b1.onclick = ()=>{ stopPlay(); goto(0); };
  b2.onclick = ()=>{ stopPlay(); goto(ply-1); };
  b3.onclick = ()=>{ stopPlay(); goto(ply+1); };
  b4.onclick = ()=>{ stopPlay(); goto(moves.length); };
  flipBtn.onclick = ()=>{ flipped = !flipped; renderBrd(grid, ac, states[ply].board, states[ply].from, states[ply].to, false, flipped, states[ply].checkSquare); };
  playBtn.onclick = ()=>{ playTimer ? stopPlay() : startPlay(); };

  layout.addEventListener('click', ()=>{ window._activeGoto = (delta)=> goto(ply+delta); });
  layout.addEventListener('keydown',e=>{
    if(e.key!=='ArrowLeft' && e.key!=='ArrowRight') return;
    if(e.target?.closest('button,input,textarea,select,[role="tab"],[contenteditable="true"]')) return;
    e.preventDefault();
    e.stopPropagation();
    stopPlay();
    goto(ply + (e.key==='ArrowLeft' ? -1 : 1));
  });
  // Paint the saved line immediately; start the 10 MB engine only after the
  // reader actually navigates or plays the board.
  goto(0, false);
  return layout;
}

function buildStatesFromMoves(moves){
  if(typeof Chess !== 'function'){
    return {
      states: [{
        board: f2b('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'),
        from: null,
        to: null,
        san: '',
        turn: 'w',
        comment: '',
        fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
        checkSquare: null
      }],
      game: null
    };
  }

  const game = new Chess();
  const states = [{
    board: boardFromChessJs(game),
    from: null,
    to: null,
    san: '',
    turn: game.turn(),
    comment: '',
    fen: game.fen(),
    checkSquare: checkedKingSquareFromGame(game)
  }];

  for(const mv of moves || []){
    try {
      const res = game.move(mv.san, { sloppy: true });
      if(!res) continue;
      states.push({
        board: boardFromChessJs(game),
        from: { r: 8 - parseInt(res.from[1],10), f: res.from.charCodeAt(0) - 97 },
        to:   { r: 8 - parseInt(res.to[1],10),   f: res.to.charCodeAt(0) - 97 },
        san: mv.san,
        turn: game.turn(),
        comment: mv.comment || '',
        fen: game.fen(),
        checkSquare: checkedKingSquareFromGame(game)
      });
    } catch(_) {}
  }

  return { states, game };
}

function openPracticeSetup(moves, label='Line'){
  const returnFocus = document.activeElement;
  const overlay = el('div','practice-overlay');
  overlay.setAttribute('role','dialog');
  overlay.setAttribute('aria-modal','true');
  overlay.setAttribute('aria-label',`Practice ${label}`);
  const card = el('div','practice-card practice-setup');
  const close = ()=>{ overlay.remove(); returnFocus?.focus(); };

  const head = el('div','practice-head');
  const copy = document.createElement('div');
  const title = el('div','practice-title');
  title.textContent = 'Practice line';
  copy.appendChild(title);
  const sub = el('div','practice-sub');
  sub.textContent = `Start from "${label}" and continue from that saved position against Stockfish.`;
  copy.appendChild(sub);
  const closeBtn = el('button','hbtn practice-close');
  closeBtn.textContent = 'Close';
  closeBtn.onclick = close;
  head.appendChild(copy);
  head.appendChild(closeBtn);
  card.appendChild(head);

  const grid = el('div','practice-color-grid');
  [
    { color:'w', label:'Play White', sub:'Board stays on White.', piece:'wK' },
    { color:'b', label:'Play Black', sub:'Board flips to Black automatically.', piece:'bK' }
  ].forEach(opt=>{
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'practice-color-btn';
    btn.innerHTML = `<img src="${BASE}${opt.piece}.svg" alt="${opt.label}"><strong>${opt.label}</strong><small>${opt.sub}</small>`;
    btn.onclick = ()=>{
      const room = buildPracticeRoom(moves, label, opt.color, close);
      card.replaceWith(room);
      room.querySelector('.practice-close')?.focus();
    };
    grid.appendChild(btn);
  });
  card.appendChild(grid);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
  overlay.addEventListener('keydown',event=>{
    trapDialogFocus(event,overlay);
    if(event.key==='Escape') close();
  });
  closeBtn.focus();
}

function buildPracticeRoom(seedMoves, label, userColor, closeRoom){
  const card = el('div','practice-card practice-room');
  const head = el('div','practice-room-head');
  const copy = el('div','practice-room-copy');
  const roomTitle = el('div','practice-room-title');
  roomTitle.textContent = `Practice: ${label}`;
  const roomSub = el('div','practice-room-sub');
  roomSub.textContent = `Playing as ${userColor === 'w' ? 'White' : 'Black'} from the saved line position.`;
  copy.appendChild(roomTitle);
  copy.appendChild(roomSub);
  const closeBtn = el('button','hbtn practice-close');
  closeBtn.textContent = 'Close';
  closeBtn.onclick = closeRoom;
  head.appendChild(copy);
  head.appendChild(closeBtn);
  card.appendChild(head);

  const extraMoves = [];
  let states = [];
  let ply = 0;
  let selected = null;
  let hoverTarget = null;
  let flipped = userColor === 'b';
  let botThinking = false;
  let botFen = '';
  let dragState = null;
  let dragGhost = null;
  let dragHoldTimer = null;
  let pendingDragStart = null;
  let pendingPromotion = null;
  let cleanupDone = false;
  let practiceElo = 1600;
  let _cachedGame = null;
  let _cachedGameFen = null;
  const playerTurn = userColor;
  const engineTurn = userColor === 'w' ? 'b' : 'w';
  const PRACTICE_MIN_ELO = 100;
  const PRACTICE_MAX_ELO = 3200;
  const practiceDepthFromElo = elo => Math.max(1, Math.min(18, Math.round(1 + ((elo - PRACTICE_MIN_ELO) / (PRACTICE_MAX_ELO - PRACTICE_MIN_ELO)) * 17)));
  const practiceSkillFromElo = elo => Math.max(0, Math.min(20, Math.round(((elo - PRACTICE_MIN_ELO) / (PRACTICE_MAX_ELO - PRACTICE_MIN_ELO)) * 20)));
  const practiceThinkMsFromElo = elo => Math.round(200 + ((elo - PRACTICE_MIN_ELO) / (PRACTICE_MAX_ELO - PRACTICE_MIN_ELO)) * 1600);
  const practiceMultiPvFromElo = elo => {
    const weakness = 1 - ((Math.max(PRACTICE_MIN_ELO, Math.min(PRACTICE_MAX_ELO, elo)) - PRACTICE_MIN_ELO) / (PRACTICE_MAX_ELO - PRACTICE_MIN_ELO));
    return weakness > 0.8 ? 4 : weakness > 0.6 ? 3 : weakness > 0.35 ? 2 : 1;
  };

  const layout = el('div','study-layout');
  const evalShell = el('div','eval-shell');
  const evalWrap = el('div','eval-wrap');
  const evalBar = el('div','eval-bar');
  const evalBlack = el('div','eval-black');
  const evalMarker = el('div','eval-marker');
  const evalTop = el('div','eval-score top');
  const evalBottom = el('div','eval-score bottom');
  evalTop.textContent = '';
  evalBottom.textContent = '0.0';
  evalBar.appendChild(evalTop);
  evalBar.appendChild(evalBottom);
  evalBar.appendChild(evalBlack);
  evalBar.appendChild(evalMarker);
  const evalMeta = el('div','eval-meta');
  const evalText = el('div','eval-text'); evalText.textContent = '0.0';
  const evalState = el('div','eval-state'); evalState.textContent = '';
  evalMeta.appendChild(evalText);
  evalMeta.appendChild(evalState);
  evalWrap.appendChild(evalBar);
  evalWrap.appendChild(evalMeta);
  evalShell.appendChild(evalWrap);
  const evalUi = { bar: evalBar, black: evalBlack, marker: evalMarker, text: evalText, state: evalState, top: evalTop, bottom: evalBottom };

  const bw = el('div','board-wrap');
  const coords = el('div','board-coords');
  const rl = el('div','rank-labels');
  for(let i=8;i>=1;i--){ const s=document.createElement('span'); s.textContent=i; rl.appendChild(s); }
  const gw = el('div','board-gwrap');
  const grid = el('div','board-grid');
  const ac = document.createElement('canvas'); ac.className='board-arrow-layer';
  gw.appendChild(grid); gw.appendChild(ac);
  const fl = el('div','file-labels');
  'abcdefgh'.split('').forEach(ch=>{ const s=document.createElement('span'); s.textContent=ch; fl.appendChild(s); });
  coords.appendChild(rl); coords.appendChild(gw); coords.appendChild(fl); bw.appendChild(coords);

  const mp = el('div','move-panel');
  const strengthBox = el('div','practice-strength');
  const strengthTop = el('div','practice-strength-top');
  const strengthLabel = el('label','practice-strength-label'); strengthLabel.textContent = 'Bot Difficulty';
  const strengthValue = el('div','practice-strength-value');
  strengthTop.appendChild(strengthLabel);
  strengthTop.appendChild(strengthValue);
  const strengthSlider = document.createElement('input');
  strengthSlider.className = 'practice-strength-slider';
  strengthSlider.type = 'range';
  strengthSlider.min = String(PRACTICE_MIN_ELO);
  strengthSlider.max = String(PRACTICE_MAX_ELO);
  strengthSlider.step = '100';
  strengthSlider.value = String(practiceElo);
  strengthSlider.id = 'practice-strength-' + Math.random().toString(36).slice(2,8);
  strengthLabel.htmlFor = strengthSlider.id;
  const strengthHint = el('div','practice-strength-hint');
  strengthBox.appendChild(strengthTop);
  strengthBox.appendChild(strengthSlider);
  strengthBox.appendChild(strengthHint);
  const nav = el('div','move-nav');
  const b1 = el('button','mv-btn'); b1.textContent='⏮'; b1.setAttribute('aria-label','First move');
  const b2 = el('button','mv-btn'); b2.textContent='◀'; b2.setAttribute('aria-label','Previous move');
  const flipBtn = el('button','mv-btn'); flipBtn.textContent='⇅'; flipBtn.setAttribute('aria-label','Flip board');
  const b3 = el('button','mv-btn'); b3.textContent='▶'; b3.setAttribute('aria-label','Next move');
  const b4 = el('button','mv-btn'); b4.textContent='⏭'; b4.setAttribute('aria-label','Last move');
  const ctr = el('div','mv-ctr');
  const leftControls = el('div','mv-left-controls');
  [b1,b2,b3,b4,ctr,flipBtn].forEach(node=>leftControls.appendChild(node));
  nav.appendChild(leftControls);
  const ml = el('div','move-list-inner');
  const moveForm = document.createElement('form');
  moveForm.className = 'practice-move-form';
  const moveInputId = 'practice-move-' + Math.random().toString(36).slice(2,8);
  const moveLabel = document.createElement('label');
  moveLabel.htmlFor = moveInputId;
  moveLabel.textContent = 'Keyboard move';
  const moveInput = document.createElement('input');
  moveInput.id = moveInputId;
  moveInput.type = 'text';
  moveInput.inputMode = 'text';
  moveInput.maxLength = 5;
  moveInput.autocomplete = 'off';
  moveInput.placeholder = 'e2e4';
  moveInput.setAttribute('aria-describedby', moveInputId + '-hint');
  const moveSubmit = document.createElement('button');
  moveSubmit.type = 'submit';
  moveSubmit.className = 'hbtn';
  moveSubmit.textContent = 'Play move';
  const moveHint = document.createElement('div');
  moveHint.id = moveInputId + '-hint';
  moveHint.className = 'practice-move-hint';
  moveHint.textContent = 'Enter coordinate notation, such as e2e4. Add q, r, b, or n for promotion.';
  moveForm.append(moveLabel, moveInput, moveSubmit, moveHint);
  const status = el('div','practice-status');
  status.setAttribute('role','status');
  status.setAttribute('aria-live','polite');
  mp.appendChild(strengthBox); mp.appendChild(nav); mp.appendChild(ml); mp.appendChild(moveForm); mp.appendChild(status);
  layout.appendChild(evalShell); layout.appendChild(bw); layout.appendChild(mp);
  card.appendChild(layout);

  const coordsToSq = (r,f)=>String.fromCharCode(97+f)+(8-r);
  const sqToCoords = square=>({ r: 8 - parseInt(square[1],10), f: square.charCodeAt(0) - 97 });

  function getCombinedMoves(){
    return (seedMoves || []).map(mv=>({ san: mv.san, comment: mv.comment || '' })).concat(extraMoves);
  }

  function setPracticeStatus(text, kind=''){
    status.textContent = text;
    status.className = 'practice-status' + (kind ? ' ' + kind : '');
  }

  function renderPracticeStrength(){
    const depth = practiceDepthFromElo(practiceElo);
    strengthValue.textContent = `${practiceElo} Elo`;
    strengthHint.textContent = `Fast response mode. 3200 still searches deeper, but move time is capped so strong practice stays snappy.`;
  }

  function clearPromotionOverlay(){
    const ex = gw.querySelector('.promo-inline');
    if(ex) ex.remove();
  }

  function renderPromotionOverlay(){
    clearPromotionOverlay();
    if(!pendingPromotion) return;

    const targetSq = pendingPromotion.square || pendingPromotion.to;
    const color = pendingPromotion.color || pendingPromotion.turn || 'w';
    const overlay = el('div','promo-inline');

    const addCancel = () => {
      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'promo-inline-cancel';
      cancel.textContent = 'x';
      cancel.title = 'Cancel promotion';
      cancel.setAttribute('aria-label', 'Cancel promotion');
      cancel.addEventListener('pointerup', ev => {
        ev.preventDefault();
        ev.stopPropagation();
        pendingPromotion = null;
        selected = null;
        hoverTarget = null;
        drawBoard();
        moveInput.focus();
      });
      cancel.addEventListener('click', ev => {
        ev.preventDefault();
        ev.stopPropagation();
        pendingPromotion = null;
        selected = null;
        hoverTarget = null;
        drawBoard();
        moveInput.focus();
      });
      overlay.appendChild(cancel);
    };

    if(color === 'b') addCancel();

    ['Q','N','R','B'].forEach(pc => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'promo-inline-btn';
      btn.title = {Q:'Queen',N:'Knight',R:'Rook',B:'Bishop'}[pc];
      btn.setAttribute('aria-label', btn.title);
      btn.innerHTML = `<img src="${BASE}${color}${pc}.svg" alt="${btn.title}">`;
      btn.addEventListener('pointerup', ev => {
        ev.preventDefault();
        ev.stopPropagation();
        finishPromotion(pc);
      });
      btn.addEventListener('click', ev => {
        ev.preventDefault();
        ev.stopPropagation();
        finishPromotion(pc);
      });
      overlay.appendChild(btn);
    });

    if(color === 'w') addCancel();

    if(getComputedStyle(gw).position === 'static') gw.style.position = 'relative';
    const size = Math.min(gw.clientWidth || 0, gw.clientHeight || 0) || ((parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--sq')) || 56) * 8);
    const sq = size / 8;
    const overlayHeight = sq * 4 + sq * 0.72;
    const vis = flipped ? { r: 7 - targetSq.r, f: 7 - targetSq.f } : { r: targetSq.r, f: targetSq.f };

    let left = vis.f * sq;
    let top = color === 'w' ? (vis.r * sq) - (overlayHeight - sq) : (vis.r * sq);
    left = Math.max(0, Math.min(left, size - sq));
    top = Math.max(0, Math.min(top, size - overlayHeight));

    overlay.style.left = left + 'px';
    overlay.style.top = top + 'px';
    gw.appendChild(overlay);
  }

  function currentState(){
    return states[ply];
  }

  function currentGame(){
    const state = currentState();
    if(!state?.fen || typeof Chess !== 'function') return null;
    if(_cachedGame && _cachedGameFen === state.fen) return _cachedGame;
    try {
      _cachedGame = new Chess(state.fen);
      _cachedGameFen = state.fen;
      return _cachedGame;
    } catch(_) { return null; }
  }

  function invalidatePracticeGame(){
    _cachedGame = null;
    _cachedGameFen = null;
  }

  function rebuildStates(){
    states = buildStatesFromMoves(getCombinedMoves()).states;
    ply = Math.min(ply, states.length - 1);
  }

  function renderMoveList(){
    ml.innerHTML = '';
    const combined = getCombinedMoves();
    let moveNo = 1;
    for(let i=0;i<combined.length;i+=2){
      const row = el('div','mp');
      const num = el('div','mn'); num.textContent = moveNo + '.';
      row.appendChild(num);
      const w = combined[i];
      const wb = el('button','mb'); wb.dataset.ply = String(i+1); wb.textContent = w?.san || ''; wb.setAttribute('aria-label',`Move ${i+1}: ${w?.san || 'unknown'}`);
      wb.onclick = ()=>goto(i+1);
      row.appendChild(wb);
      if(i+1 < combined.length){
        const b = combined[i+1];
        const bb = el('button','mb'); bb.dataset.ply = String(i+2); bb.textContent = b?.san || ''; bb.setAttribute('aria-label',`Move ${i+2}: ${b?.san || 'unknown'}`);
        bb.onclick = ()=>goto(i+2);
        row.appendChild(bb);
      }
      ml.appendChild(row);
      moveNo++;
    }
  }

  function maybeRequestEval(){
    const state = currentState();
    if(!state?.fen) return;
    const livePosition = ply === states.length - 1;
    const game = livePosition ? currentGame() : null;
    if(pendingPromotion || (livePosition && (botThinking || game?.turn() === engineTurn))) return;
    requestEval(state.fen, state.turn, payload=>updateEvalUI(evalUi, payload), txt=>setEvalStatus(evalUi, txt), 18);
  }

  function finishPromotion(pieceCode){
    if(!pendingPromotion || typeof Chess !== 'function') return;
    const game = new Chess(pendingPromotion.fen);
    const res = game.move({
      from: coordsToSq(pendingPromotion.from.r, pendingPromotion.from.f),
      to: coordsToSq(pendingPromotion.to.r, pendingPromotion.to.f),
      promotion: String(pieceCode || 'Q').toLowerCase()
    });
    if(!res){
      pendingPromotion = null;
      selected = null;
      hoverTarget = null;
      drawBoard();
      return;
    }
    pendingPromotion = null;
    pushMove(res, 'player');
  }

  function tryPlayerMove(from, to, requestedPromotion=''){
    const game = currentGame();
    if(!game || botThinking || ply !== states.length - 1 || game.turn() !== playerTurn || game.game_over() || pendingPromotion) return false;
    const fromSq = coordsToSq(from.r, from.f);
    const toSq = coordsToSq(to.r, to.f);
    const legal = (game.moves({ square: fromSq, verbose: true }) || []).find(mv => mv.to === toSq);
    if(!legal) return false;

    if(legal.flags && legal.flags.includes('p')){
      const promotion = String(requestedPromotion || '').toLowerCase();
      if(promotion && !['q','r','b','n'].includes(promotion)) return false;
      pendingPromotion = {
        fen: game.fen(),
        turn: game.turn(),
        color: game.turn(),
        from: { r: from.r, f: from.f },
        to: { r: to.r, f: to.f },
        square: { r: to.r, f: to.f }
      };
      selected = null;
      hoverTarget = null;
      if(promotion){
        finishPromotion(promotion);
        return true;
      }
      drawBoard();
      requestAnimationFrame(()=>gw.querySelector('.promo-inline-btn')?.focus());
      return true;
    }

    if(requestedPromotion) return false;

    const res = game.move({ from: fromSq, to: toSq, promotion: 'q' });
    if(!res) return false;
    selected = null;
    hoverTarget = null;
    pushMove(res, 'player');
    return true;
  }

  moveForm.addEventListener('submit', event => {
    event.preventDefault();
    const uci = moveInput.value.trim().toLowerCase();
    if(!/^[a-h][1-8][a-h][1-8][qrbn]?$/.test(uci)){
      setPracticeStatus('Use coordinate notation such as e2e4 or e7e8q.', 'err');
      moveInput.focus();
      return;
    }
    const from = sqToCoords(uci.slice(0,2));
    const to = sqToCoords(uci.slice(2,4));
    if(!tryPlayerMove(from, to, uci[4] || '')){
      setPracticeStatus('That move is not legal in the current practice position.', 'err');
      moveInput.select();
      return;
    }
    moveInput.value = '';
  });

  function renderLegalMarkerLocal(sqEl, isCapture){
    const marker = document.createElement('div');
    marker.className = isCapture ? 'capture-ring' : 'move-dot';
    sqEl.appendChild(marker);
  }

  function sameSq(a,b){ return !!a && !!b && a.r===b.r && a.f===b.f; }

  function removeGhost(){
    if(dragGhost){ dragGhost.remove(); dragGhost = null; }
  }

  function ensureGhost(pieceCode){
    removeGhost();
    dragGhost = document.createElement('div');
    dragGhost.className = 'drag-ghost';
    dragGhost.innerHTML = PS[pieceCode] || '';
    document.body.appendChild(dragGhost);
  }

  function moveGhost(x,y){
    if(!dragGhost) return;
    dragGhost.style.left = x + 'px';
    dragGhost.style.top = y + 'px';
  }

  function squareFromPoint(x,y){
    const elAt = document.elementFromPoint(x,y);
    if(!elAt) return null;
    const sq = elAt.closest('.sq[data-r][data-f]');
    if(!sq || !grid.contains(sq)) return null;
    return { r: +sq.dataset.r, f: +sq.dataset.f };
  }

  function applyHoverHighlight(nextSq){
    const prev = grid.querySelector('.sq.drag-target');
    if(prev) prev.classList.remove('drag-target');
    if(nextSq){
      const sqEl = grid.querySelector(`.sq[data-r="${nextSq.r}"][data-f="${nextSq.f}"]`);
      if(sqEl) sqEl.classList.add('drag-target');
    }
  }

  function clearPendingDrag(){
    if(dragHoldTimer){
      clearTimeout(dragHoldTimer);
      dragHoldTimer = null;
    }
    pendingDragStart = null;
  }

  function beginDrag(from, piece, x, y){
    selected = { r: from.r, f: from.f };
    dragState = { from: { r: from.r, f: from.f }, piece };
    hoverTarget = null;
    ensureGhost(piece);
    moveGhost(x, y);
    drawBoard();
  }

  // Build fixed squares once, update in-place on each drawBoard call
  let _sqEls = null;
  let _lastFlipped = null;

  function buildGrid(){
    grid.innerHTML = '';
    _sqEls = [];
    for(let rr=0; rr<8; rr++){
      for(let ff=0; ff<8; ff++){
        const sqEl = document.createElement('div');
        sqEl.className = 'sq ' + (((rr+ff)&1) ? 'dark' : 'light');
        sqEl.addEventListener('pointerdown', ev => {
          const r = +sqEl.dataset.r, f = +sqEl.dataset.f;
          onSquarePointerDown(ev, r, f);
        });
        sqEl.addEventListener('pointerenter', () => {
          if(!dragState) return;
          const r = +sqEl.dataset.r, f = +sqEl.dataset.f;
          const key = r + ',' + f;
          const nextHover = _curLegalTargets && _curLegalTargets.has(key) ? { r, f } : null;
          hoverTarget = nextHover;
          applyHoverHighlight(hoverTarget);
        });
        grid.appendChild(sqEl);
        _sqEls.push(sqEl);
      }
    }
  }

  let _curLegalTargets = null;

  function drawBoard(){
    const state = currentState();
    const game = currentGame();

    // Rebuild grid if flip orientation changed
    if(_sqEls === null || _lastFlipped !== flipped){
      buildGrid();
      _lastFlipped = flipped;
    }

    // Compute legal targets once
    _curLegalTargets = new Map();
    if(selected && game && ply === states.length - 1 && game.turn() === playerTurn){
      (game.moves({ square: coordsToSq(selected.r, selected.f), verbose: true }) || []).forEach(mv=>{
        const target = sqToCoords(mv.to);
        _curLegalTargets.set(target.r + ',' + target.f, { capture: !!mv.captured });
      });
    }

    // Update each square in-place
    for(let rr=0; rr<8; rr++){
      for(let ff=0; ff<8; ff++){
        const { r, f } = flipped ? { r:7-rr, f:7-ff } : { r:rr, f:ff };
        const sqEl = _sqEls[rr*8+ff];
        sqEl.dataset.r = String(r);
        sqEl.dataset.f = String(f);

        // Reset classes (keep base color)
        const base = 'sq ' + (((rr+ff)&1) ? 'dark' : 'light');
        let cls = base;
        if(state.checkSquare && state.checkSquare.r===r && state.checkSquare.f===f) cls += ' king-in-check';
        if(selected && selected.r===r && selected.f===f) cls += ' hl-from';
        if(state.to && state.to.r===r && state.to.f===f) cls += ' hl-to';
        if(hoverTarget && hoverTarget.r===r && hoverTarget.f===f) cls += ' drag-target';
        sqEl.className = cls;

        // Piece
        const piece = state.board[r]?.[f];
        const wantHidden = !!(dragState && dragState.from && dragState.from.r===r && dragState.from.f===f);
        const pieceHtml = (piece && PS[piece]) ? PS[piece] : '';

        // Legal marker dot/ring (not on selected square)
        const legal = _curLegalTargets.get(r + ',' + f);
        const showDot = !!(legal && !(selected && selected.r===r && selected.f===f));

        // Only update innerHTML when content actually changes
        const wantPieceHtml = pieceHtml ? `<div class="piece${wantHidden?' drag-hidden':''}">${pieceHtml}</div>` : '';
        const wantDot = showDot ? `<div class="${legal.capture?'capture-ring':'move-dot'}"></div>` : '';
        const want = wantPieceHtml + wantDot;
        if(sqEl.innerHTML !== want) sqEl.innerHTML = want;
      }
    }

    applyHoverHighlight(hoverTarget);
    const from = state.from ? (flipped ? { r:7-state.from.r, f:7-state.from.f } : state.from) : null;
    const to   = state.to   ? (flipped ? { r:7-state.to.r,   f:7-state.to.f   } : state.to)   : null;
    drawArr(ac, from?from.r:-1, from?from.f:-1, to?to.r:-1, to?to.f:-1);
    renderPromotionOverlay();
  }

  function goto(nextPly){
    ply = Math.max(0, Math.min(nextPly, states.length - 1));
    invalidatePracticeGame();
    selected = null;
    ctr.textContent = `${ply} / ${states.length - 1}`;
    gw.setAttribute('aria-label',`Practice chess position at move ${ply} of ${states.length - 1}`);
    ml.querySelectorAll('.mb').forEach(btn => btn.classList.toggle('active', +btn.dataset.ply === ply));
    const active = ml.querySelector('.mb.active');
    if(active) active.scrollIntoView({ block:'nearest', behavior:'smooth' });
    drawBoard();

    const game = currentGame();
    if(!game){
      setPracticeStatus('Practice room could not load this position.', 'err');
      return;
    }
    if(ply !== states.length - 1){
      setPracticeStatus('Viewing an earlier move. Jump to the latest move to keep playing.');
      return;
    }
    if(game.game_over()){
      setPracticeStatus('Game over. Review the move list or close to practice again.', 'ok');
      return;
    }
    if(pendingPromotion){
      setPracticeStatus((playerTurn === 'w' ? 'White' : 'Black') + ' promotion - choose a piece.');
      return;
    }
    if(game.turn() === playerTurn){
      setPracticeStatus(`Your move as ${playerTurn === 'w' ? 'White' : 'Black'}.`);
    } else if(botThinking){
    setPracticeStatus('Stockfish is thinking...');
    } else {
      setPracticeStatus('Stockfish to move.');
      maybeBotMove();
      return;
    }
    maybeRequestEval();
  }

  function pushMove(res, source){
    extraMoves.push({ san: res.san, comment: source === 'engine' ? 'Stockfish' : '' });
    pendingPromotion = null;
    rebuildStates();
    renderMoveList();
    goto(states.length - 1);
  }

  function maybeBotMove(){
    const game = currentGame();
    if(!game || botThinking || ply !== states.length - 1 || game.turn() !== engineTurn || game.game_over()) return;
    botThinking = true;
    const requestFen = game.fen();
    botFen = requestFen;
    setPracticeStatus('Stockfish is thinking...');
    requestBestMove(requestFen, game.turn(), (bestmove, failureStatus='')=>{
      if(requestFen !== (currentState()?.fen || '')){
        botThinking = false;
        return;
      }
      botThinking = false;
      if(!bestmove){
        const unavailable = ['engine unavailable','engine error','engine timeout'].includes(failureStatus);
        setPracticeStatus(unavailable
          ? 'Stockfish is unavailable right now. Return to the latest move to retry.'
          : 'Stockfish could not find a legal move here.', 'err');
        return;
      }
      const fresh = currentGame();
      if(!fresh || fresh.fen() !== botFen) return;
      const res = applyUciMove(fresh, bestmove);
      if(!res?.san){
        setPracticeStatus('Stockfish could not find a legal move here.', 'err');
        return;
      }
      pushMove(res, 'engine');
    }, engineStatus=>{
      if(!botThinking || botFen !== requestFen) return;
      if(['engine unavailable','engine error','engine timeout'].includes(engineStatus)){
        botThinking = false;
        setPracticeStatus('Stockfish is unavailable right now. Return to the latest move to retry.', 'err');
      }
    }, {
      thinkMs: practiceThinkMsFromElo(practiceElo),
      depth: practiceDepthFromElo(practiceElo),
      skill: practiceSkillFromElo(practiceElo),
      elo: practiceElo,
      multiPv: practiceMultiPvFromElo(practiceElo)
    });
  }

  function handleSquareClick(r, f){
    const game = currentGame();
    if(!game || botThinking || ply !== states.length - 1 || game.turn() !== playerTurn || game.game_over() || dragState || pendingPromotion) return;
    const piece = game.board()[r]?.[f];
    if(selected){
      if(piece && piece.color === playerTurn){
        selected = { r, f };
        drawBoard();
        return;
      }
      if(!tryPlayerMove(selected, { r, f })) return;
      return;
    }
    if(piece && piece.color === playerTurn){
      selected = { r, f };
      hoverTarget = null;
      drawBoard();
    }
  }

  function onSquarePointerDown(ev, r, f){
    if(ev.button !== 0) return;
    const game = currentGame();
    if(!game || botThinking || ply !== states.length - 1 || game.turn() !== playerTurn || game.game_over() || pendingPromotion) return;
    const piece = game.board()[r]?.[f];
    const isOwnPiece = !!(piece && piece.color === playerTurn);
    // Always record tap origin so globalPointerUp can attempt a move on any square
    clearPendingDrag();
    pendingDragStart = {
      pointerId: ev.pointerId,
      from: { r, f },
      piece: isOwnPiece ? ((piece.color === 'w' ? 'w' : 'b') + piece.type.toUpperCase()) : null,
      startX: ev.clientX,
      startY: ev.clientY
    };
    if(isOwnPiece){
      ev.preventDefault();
      dragHoldTimer = setTimeout(()=>{
        if(!pendingDragStart || !pendingDragStart.piece) return;
        beginDrag(pendingDragStart.from, pendingDragStart.piece, pendingDragStart.startX, pendingDragStart.startY);
        clearPendingDrag();
      }, 180);
    }
  }

  function globalPointerMove(ev){
    if(dragState){
      moveGhost(ev.clientX, ev.clientY);
      const sq = squareFromPoint(ev.clientX, ev.clientY);
      const game = currentGame();
      const legalTargets = new Map();
      if(selected && game && ply === states.length - 1 && game.turn() === playerTurn){
        (game.moves({ square: coordsToSq(selected.r, selected.f), verbose: true }) || []).forEach(mv=>{
          const target = sqToCoords(mv.to);
          legalTargets.set(target.r + ',' + target.f, { capture: !!mv.captured });
        });
      }
      const nextHover = (sq && legalTargets.has(sq.r + ',' + sq.f)) ? sq : null;
      if((!nextHover && hoverTarget) || (nextHover && !sameSq(nextHover, hoverTarget))){
        hoverTarget = nextHover;
        applyHoverHighlight(hoverTarget);
      }
      return;
    }
    if(pendingDragStart && ev.pointerId === pendingDragStart.pointerId){
      const dx = ev.clientX - pendingDragStart.startX;
      const dy = ev.clientY - pendingDragStart.startY;
      if((dx*dx + dy*dy) >= 64){
        beginDrag(pendingDragStart.from, pendingDragStart.piece, ev.clientX, ev.clientY);
        clearPendingDrag();
      }
    }
  }

  function globalPointerUp(ev){
    if(dragState){
      const from = dragState.from;
      const sq = squareFromPoint(ev.clientX, ev.clientY);
      removeGhost();
      dragState = null;
      hoverTarget = null;
      applyHoverHighlight(null);
      if(!sq || sameSq(sq, from)){
        drawBoard();
        return;
      }
      if(!tryPlayerMove(from, sq)){
        drawBoard();
        return;
      }
      return;
    }
    if(pendingDragStart && ev.pointerId === pendingDragStart.pointerId){
      const from = pendingDragStart.from;
      clearPendingDrag();
      const game = currentGame();
      if(!game || botThinking || ply !== states.length - 1 || game.turn() !== playerTurn || game.game_over() || pendingPromotion) return;
      const piece = game.board()[from.r]?.[from.f];
      const isOwnPiece = !!(piece && piece.color === playerTurn);
      if(isOwnPiece){
        // Tap on own piece: select or deselect
        if(selected && selected.r === from.r && selected.f === from.f){
          selected = null;
          hoverTarget = null;
        } else {
          selected = { r: from.r, f: from.f };
          hoverTarget = null;
        }
        drawBoard();
      } else if(selected){
        // Tap on empty/opponent while piece selected: attempt move
        if(!tryPlayerMove(selected, from)){
          selected = null;
          hoverTarget = null;
          drawBoard();
        }
      }
    }
  }

  b1.onclick = ()=>goto(0);
  b2.onclick = ()=>goto(ply - 1);
  b3.onclick = ()=>goto(ply + 1);
  b4.onclick = ()=>goto(states.length - 1);
  flipBtn.onclick = ()=>{ flipped = !flipped; hoverTarget = null; drawBoard(); };
  strengthSlider.oninput = ()=>{
    practiceElo = +strengthSlider.value || 1600;
    renderPracticeStrength();
    setPracticeStatus(botThinking ? `Difficulty updated to ${practiceElo} Elo. Stockfish will use it on the next move.` : `Difficulty set to ${practiceElo} Elo.`);
  };

  if(!cleanupDone){
    document.addEventListener('pointermove', globalPointerMove);
    document.addEventListener('pointerup', globalPointerUp);
    document.addEventListener('pointercancel', globalPointerUp);
    cleanupDone = true;
  }

  rebuildStates();
  renderMoveList();
  renderPracticeStrength();

  // Auto-replay seed moves so user sees the position being reached
  function autoReplay(targetPly, done){
    if(targetPly <= 0){ goto(0); done && done(); return; }
    goto(0);
    let i = 1;
    function step(){
      if(i > targetPly){ done && done(); return; }
      goto(i);
      i++;
      setTimeout(step, 120);
    }
    setTimeout(step, 80);
  }

  const seedEnd = states.length - 1;
  if(seedEnd > 0){
    autoReplay(seedEnd, ()=>{
      if(currentGame() && currentGame().turn() === engineTurn) maybeBotMove();
    });
  } else {
    goto(0);
    if(currentGame() && currentGame().turn() === engineTurn) maybeBotMove();
  }

  return card;
}



// ─── Eval / Stockfish ───────────────────────────────────────────────
const STOCKFISH_WASM_URL = new URL('./stockfish/stockfish-18-lite-single.js', window.location.href).href;
const STOCKFISH_ASM_URL = new URL('./stockfish/stockfish-18-asm.js', window.location.href).href;
const ENGINE = {
  worker: null,
  ready: false,
  uciOk: false,
  queue: [],
  latestJob: 0,
  current: null,
  started: false,
  mode: '',
  bootTimer: null,
  searchTimer: null,
  cache: new Map(),
  lastFen: '',
};
const PARALLEL_EVAL_POOL_SIZE = Math.max(2, Math.min(4, Number((typeof navigator !== 'undefined' ? navigator.hardwareConcurrency : 4) || 4) - 1));
const EVAL_POOL = {
  workers: [],
  queue: [],
  latestJob: 0,
  started: false,
};

const ENGINE_SEARCH_MS = 2800;
const ENGINE_HARD_TIMEOUT_MS = 4200;
const ENGINE_PV_CACHE_PLY = 16;

function createStockfishWorker(url){
  const workerCode = `self.importScripts(${JSON.stringify(url)});`;
  const blobUrl = URL.createObjectURL(new Blob([workerCode], { type: 'application/javascript' }));
  try {
    return new Worker(blobUrl);
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

function resetEngineState(){
  ENGINE.ready = false;
  ENGINE.uciOk = false;
  ENGINE.current = null;
  if(ENGINE.searchTimer){
    clearTimeout(ENGINE.searchTimer);
    ENGINE.searchTimer = null;
  }
}

function terminateEngineWorker(){
  if(!ENGINE.worker) return;
  try { ENGINE.worker.terminate(); } catch(_) {}
  ENGINE.worker = null;
}

function failEngineJobs(finalStatus){
  if(ENGINE.bootTimer){
    clearTimeout(ENGINE.bootTimer);
    ENGINE.bootTimer = null;
  }
  if(ENGINE.searchTimer){
    clearTimeout(ENGINE.searchTimer);
    ENGINE.searchTimer = null;
  }
  const jobs = [ENGINE.current, ...ENGINE.queue].filter(Boolean);
  ENGINE.current = null;
  ENGINE.queue = [];
  ENGINE.ready = false;
  ENGINE.uciOk = false;
  ENGINE.started = false;
  for(const job of jobs){
    try {
      if(job.kind === 'move') job.onMove?.(null, finalStatus);
      else job.onEval?.(null);
    } catch(_) {}
    try { job.onStatus?.(finalStatus); } catch(_) {}
  }
}

function terminateEvalPool(){
  const abandoned = [];
  for(const entry of EVAL_POOL.workers){
    if(entry?.timer){
      clearTimeout(entry.timer);
      entry.timer = null;
    }
    if(entry?.worker){
      try { entry.worker.terminate(); } catch(_) {}
    }
    if(entry?.currentJob) abandoned.push(entry.currentJob);
  }
  abandoned.push(...EVAL_POOL.queue);
  EVAL_POOL.workers = [];
  EVAL_POOL.queue = [];
  EVAL_POOL.started = false;
  const resolved = new Set();
  for(const job of abandoned){
    if(!job || resolved.has(job.id)) continue;
    resolved.add(job.id);
    if(job.queueTimer) clearTimeout(job.queueTimer);
    job.resolve(null);
  }
}

function bootEngine(url, mode){
  const interruptedJob = ENGINE.current;
  if(interruptedJob && !ENGINE.queue.some(job => job.id === interruptedJob.id)) ENGINE.queue.unshift(interruptedJob);
  terminateEngineWorker();
  resetEngineState();
  ENGINE.mode = mode;

  const queued = ENGINE.queue[ENGINE.queue.length - 1];
  if(queued?.onStatus) queued.onStatus(mode === 'wasm' ? 'loading engine' : 'loading fallback');

  // Use importScripts blob trick — works on file://, GitHub Pages, and all static hosts
  // A tiny inline worker fetches and runs the engine script via importScripts
  try {
    ENGINE.worker = createStockfishWorker(url);
  } catch(err) {
    if(mode !== 'asm'){
      bootEngine(STOCKFISH_ASM_URL, 'asm');
      return;
    }
    failEngineJobs('engine unavailable');
    return;
  }

  ENGINE.worker.onmessage = e => handleEngineMsg(typeof e.data === 'string' ? e.data : '');
  ENGINE.worker.onerror = () => {
    if(mode !== 'asm'){
      const q = ENGINE.queue[ENGINE.queue.length - 1];
      if(q?.onStatus) q.onStatus('wasm failed, falling back');
      bootEngine(STOCKFISH_ASM_URL, 'asm');
      return;
    }
    terminateEngineWorker();
    failEngineJobs('engine error');
  };

  if(ENGINE.bootTimer) clearTimeout(ENGINE.bootTimer);
  ENGINE.bootTimer = setTimeout(() => {
    if(!ENGINE.ready){
      if(mode !== 'asm'){
        const q = ENGINE.current || ENGINE.queue[ENGINE.queue.length - 1];
        if(q?.onStatus) q.onStatus('engine fallback');
        bootEngine(STOCKFISH_ASM_URL, 'asm');
      } else {
        terminateEngineWorker();
        failEngineJobs('engine unavailable');
      }
    }
  }, 7000);

  ENGINE.worker.postMessage('uci');
}

function initEngine(){
  if(ENGINE.started) return;
  ENGINE.started = true;
  bootEngine(STOCKFISH_WASM_URL, 'wasm');
}

function handleEvalPoolMsg(entry, line){
  if(!line) return;

  if(line === 'uciok'){
    entry.uciOk = true;
    if(entry.worker){
      entry.worker.postMessage('setoption name UCI_AnalyseMode value true');
      entry.worker.postMessage('setoption name Skill Level value 20');
      entry.worker.postMessage('setoption name MultiPV value 1');
      entry.worker.postMessage('isready');
    }
    return;
  }

  if(line === 'readyok'){
    entry.ready = true;
    flushEvalPoolQueue();
    return;
  }

  const job = entry.currentJob;
  if(!job) return;

  if(line.startsWith('bestmove')){
    if(entry.timer){
      clearTimeout(entry.timer);
      entry.timer = null;
    }
    job.resolve(cloneEvalPayload(job.lastPayload));
    entry.currentJob = null;
    flushEvalPoolQueue();
    return;
  }

  if(line.startsWith('info ') && line.includes(' score ')){
    let payload = null;
    const mate = line.match(/score mate (-?\d+)/);
    if(mate){
      const raw = parseInt(mate[1], 10);
      const signed = job.turn === 'b' ? -raw : raw;
      payload = { type:'mate', value:signed };
    } else {
      const cp = line.match(/score cp (-?\d+)/);
      if(cp){
        const raw = parseInt(cp[1], 10) / 100;
        const signed = job.turn === 'b' ? -raw : raw;
        payload = { type:'cp', value:signed };
      }
    }

    if(payload){
      const pvMatch = line.match(/\spv\s+(.+)$/);
      job.bestPv = pvMatch ? pvMatch[1].trim().split(/\s+/).filter(Boolean) : (job.bestPv || []);
      payload.pv = job.bestPv.slice();
      job.lastPayload = cloneEvalPayload(payload);
      ENGINE.cache.set(job.fen, cloneEvalPayload(payload));
      cachePrincipalVariation(job, payload, job.bestPv);
    }
  }
}

function spawnEvalPoolWorker(url, mode){
  const entry = {
    worker: null,
    ready: false,
    uciOk: false,
    currentJob: null,
    timer: null,
    mode
  };

  try {
    entry.worker = createStockfishWorker(url);
  } catch(_) {
    if(mode !== 'asm') return spawnEvalPoolWorker(STOCKFISH_ASM_URL, 'asm');
    return null;
  }

  entry.worker.onmessage = e => handleEvalPoolMsg(entry, typeof e.data === 'string' ? e.data : '');
  entry.worker.onerror = () => {
    const job = entry.currentJob;
    if(entry.timer){
      clearTimeout(entry.timer);
      entry.timer = null;
    }
    if(job){
      job.resolve(cloneEvalPayload(job.lastPayload));
      entry.currentJob = null;
    }
    if(mode !== 'asm'){
      try { entry.worker.terminate(); } catch(_) {}
      const fallback = spawnEvalPoolWorker(STOCKFISH_ASM_URL, 'asm');
      if(fallback){
        const idx = EVAL_POOL.workers.indexOf(entry);
        if(idx >= 0) EVAL_POOL.workers[idx] = fallback;
      } else {
        EVAL_POOL.workers = EVAL_POOL.workers.filter(candidate => candidate !== entry);
      }
    } else {
      EVAL_POOL.workers = EVAL_POOL.workers.filter(candidate => candidate !== entry);
    }
    if(!EVAL_POOL.workers.length){
      const queued = EVAL_POOL.queue.splice(0);
      queued.forEach(pending => {
        if(pending.queueTimer) clearTimeout(pending.queueTimer);
        pending.resolve(null);
      });
    }
    flushEvalPoolQueue();
  };

  entry.worker.postMessage('uci');
  return entry;
}

function initEvalPool(){
  if(EVAL_POOL.started) return;
  EVAL_POOL.started = true;
  for(let i = 0; i < PARALLEL_EVAL_POOL_SIZE; i++){
    const entry = spawnEvalPoolWorker(STOCKFISH_WASM_URL, 'wasm');
    if(entry) EVAL_POOL.workers.push(entry);
  }
}

function flushEvalPoolQueue(){
  for(const entry of EVAL_POOL.workers){
    if(!entry?.worker || !entry.ready || entry.currentJob || !EVAL_POOL.queue.length) continue;
    const job = EVAL_POOL.queue.shift();
    if(!job) continue;
    if(job.queueTimer){
      clearTimeout(job.queueTimer);
      job.queueTimer = null;
    }
    entry.currentJob = job;
    job.bestPv = [];
    job.lastPayload = null;
    entry.worker.postMessage('stop');
    entry.worker.postMessage('setoption name UCI_AnalyseMode value true');
    entry.worker.postMessage('setoption name Skill Level value 20');
    entry.worker.postMessage('setoption name MultiPV value 1');
    entry.worker.postMessage('position fen ' + job.fen);
    entry.worker.postMessage('go depth ' + Math.max(1, Math.min(40, Math.round(job.depth))));
    entry.timer = setTimeout(() => {
      if(entry.currentJob === job){
        try { entry.worker.postMessage('stop'); } catch(_) {}
        job.resolve(cloneEvalPayload(job.lastPayload));
        entry.currentJob = null;
        entry.timer = null;
        flushEvalPoolQueue();
      }
    }, Math.max(ENGINE_HARD_TIMEOUT_MS, 1200 + (Math.max(1, Number(job.depth) || 1) * 500)));
  }
}

function requestParallelEval(fen, turn, depth, forceFresh=false){
  return new Promise(resolve => {
    if(!forceFresh && ENGINE.cache.has(fen)){
      resolve(cloneEvalPayload(ENGINE.cache.get(fen)));
      return;
    }
    initEvalPool();
    if(!EVAL_POOL.workers.length){
      resolve(null);
      return;
    }
    let settled = false;
    const settle = payload => {
      if(settled) return;
      settled = true;
      resolve(cloneEvalPayload(payload));
    };
    const job = {
      id: ++EVAL_POOL.latestJob,
      fen,
      turn,
      depth: Math.max(8, Number(depth) || 18),
      forceFresh,
      resolve:settle,
      queueTimer:null
    };
    job.queueTimer = setTimeout(() => {
      const idx = EVAL_POOL.queue.indexOf(job);
      if(idx >= 0) EVAL_POOL.queue.splice(idx, 1);
      settle(null);
    }, Math.max(9000, job.depth * 650));
    EVAL_POOL.queue.push(job);
    flushEvalPoolQueue();
  });
}

function finishCurrentSearch(finalStatus){
  if(ENGINE.searchTimer){
    clearTimeout(ENGINE.searchTimer);
    ENGINE.searchTimer = null;
  }
  if(ENGINE.worker){
    try { ENGINE.worker.postMessage('stop'); } catch(_) {}
  }
  if(ENGINE.current?.onStatus){
    ENGINE.current.onStatus(finalStatus || (ENGINE.mode === 'asm' ? 'ready (fallback)' : 'ready'));
  }
  ENGINE.current = null;
}

function cloneEvalPayload(payload){
  return payload ? { type: payload.type, value: payload.value, pv: Array.isArray(payload.pv) ? payload.pv.slice() : [] } : null;
}

function applyUciMove(chess, uci){
  if(!uci || uci === '(none)' || uci.length < 4) return null;
  return chess.move({
    from: uci.slice(0,2),
    to: uci.slice(2,4),
    promotion: uci[4] || undefined,
  });
}

function cachePrincipalVariation(job, payload, pvMoves){
  if(!payload || !Array.isArray(pvMoves) || !pvMoves.length || typeof Chess !== 'function') return;

  let chess;
  try {
    chess = new Chess(job.fen);
  } catch(_) {
    return;
  }

  for(const uci of pvMoves.slice(0, ENGINE_PV_CACHE_PLY)){
    if(!applyUciMove(chess, uci)) break;
    ENGINE.cache.set(chess.fen(), cloneEvalPayload(payload));
  }
}

function configureEngineForJob(job){
  if(!ENGINE.worker) return;
  if(job.kind === 'move'){
    const skill = Math.max(0, Math.min(20, Math.round(job.skill ?? 20)));
    ENGINE.worker.postMessage('setoption name UCI_AnalyseMode value false');
    ENGINE.worker.postMessage('setoption name Skill Level value ' + skill);
    ENGINE.worker.postMessage('setoption name MultiPV value ' + Math.max(1, Math.min(8, job.multiPv || 1)));
  } else {
    ENGINE.worker.postMessage('setoption name UCI_AnalyseMode value true');
    ENGINE.worker.postMessage('setoption name Skill Level value 20');
    ENGINE.worker.postMessage('setoption name MultiPV value 1');
  }
}

function scoreMoveCandidateFromInfo(line){
  const pvMatch = line.match(/\spv\s+([a-h][1-8][a-h][1-8][nbrq]?)/i);
  if(!pvMatch) return null;

  const multiPvMatch = line.match(/\bmultipv\s+(\d+)/i);
  const mate = line.match(/score mate (-?\d+)/i);
  const cp = line.match(/score cp (-?\d+)/i);
  let score = null;

  if(mate){
    const raw = parseInt(mate[1], 10);
    score = raw > 0 ? 100000 - Math.abs(raw) : -100000 + Math.abs(raw);
  } else if(cp){
    score = parseInt(cp[1], 10);
  }

  if(score === null || Number.isNaN(score)) return null;
  return {
    move: pvMatch[1],
    score,
    multipv: multiPvMatch ? parseInt(multiPvMatch[1], 10) : 1
  };
}

function pickMoveForDifficulty(job, fallbackMove){
  if(!job?.moveCandidates?.length) return fallbackMove;

  const sorted = job.moveCandidates
    .slice()
    .sort((a, b) => b.score - a.score || a.multipv - b.multipv);
  const unique = [];
  const seen = new Set();
  for(const cand of sorted){
    if(!cand?.move || seen.has(cand.move)) continue;
    seen.add(cand.move);
    unique.push(cand);
  }
  if(!unique.length) return fallbackMove;

  const elo = Math.max(100, Math.min(3200, job.elo || 3200));
  const weakness = 1 - ((elo - 100) / 3100);
  if(weakness <= 0.02) return unique[0].move;

  const maxRank = unique.length - 1;
  const targetRank = Math.round(weakness * maxRank);
  const jitter = Math.max(1, Math.round(weakness * 2));
  const minRank = Math.max(0, targetRank - jitter);
  const maxRankWindow = Math.min(maxRank, targetRank + jitter);
  const pickRank = Math.min(maxRank, Math.max(0, minRank + Math.floor(Math.random() * (maxRankWindow - minRank + 1))));
  const picked = unique[pickRank]?.move || unique[0].move || fallbackMove;

  if(weakness > 0.75 && unique[maxRank]?.move && Math.random() < 0.35){
    return unique[maxRank].move;
  }
  if(weakness > 0.5 && unique.length >= 3 && Math.random() < 0.4){
    return unique[Math.min(maxRank, pickRank + 1)]?.move || picked;
  }
  return picked;
}

function beginTimedSearch(job){
  if(!ENGINE.worker) return;
  if(ENGINE.searchTimer){
    clearTimeout(ENGINE.searchTimer);
    ENGINE.searchTimer = null;
  }

  job.bestPv = [];
  job.lastPayload = null;
  job.moveCandidates = [];
  job.onStatus('thinking');
  ENGINE.worker.postMessage('stop');
  configureEngineForJob(job);
  ENGINE.worker.postMessage('position fen ' + job.fen);

  const wantsDepth = job.kind === 'eval' && Number(job.depth) > 0;
  if(wantsDepth){
    ENGINE.worker.postMessage('go depth ' + Math.max(1, Math.min(40, Math.round(job.depth))));
  } else {
    ENGINE.worker.postMessage('go movetime ' + (job.thinkMs || ENGINE_SEARCH_MS));
  }

  const timeoutMs = wantsDepth
    ? Math.max(ENGINE_HARD_TIMEOUT_MS, 1600 + (Math.max(1, Number(job.depth) || 1) * 650))
    : Math.max(ENGINE_HARD_TIMEOUT_MS, (job.thinkMs || ENGINE_SEARCH_MS) + 1200);

  ENGINE.searchTimer = setTimeout(() => {
    const timedOut = ENGINE.current;
    if(timedOut?.kind === 'move'){
      try { timedOut.onMove?.(null, 'engine timeout'); } catch(_) {}
    } else if(timedOut?.kind === 'eval' && timedOut.lastPayload){
      try { timedOut.onEval?.(cloneEvalPayload(timedOut.lastPayload)); } catch(_) {}
    }
    finishCurrentSearch('engine timeout');
    flushEngineQueue();
  }, timeoutMs);
}

function handleEngineMsg(line){
  if(!line) return;

  if(line === 'uciok'){
    ENGINE.uciOk = true;
    if(ENGINE.worker){
      ENGINE.worker.postMessage('setoption name UCI_AnalyseMode value true');
      ENGINE.worker.postMessage('isready');
    }
    return;
  }

  if(line === 'readyok'){
    ENGINE.ready = true;
    if(ENGINE.bootTimer) {
      clearTimeout(ENGINE.bootTimer);
      ENGINE.bootTimer = null;
    }
    const queued = ENGINE.current || ENGINE.queue[ENGINE.queue.length - 1];
    if(queued?.onStatus) queued.onStatus(ENGINE.mode === 'asm' ? 'ready (fallback)' : 'ready');
    flushEngineQueue();
    return;
  }

  if(line.startsWith('bestmove')){
    const bestmove = line.match(/^bestmove\s+(\S+)/);
    if(bestmove && ENGINE.current?.kind === 'move' && ENGINE.current.onMove){
      ENGINE.current.onMove(pickMoveForDifficulty(ENGINE.current, bestmove[1]));
    }
    if(bestmove && ENGINE.current?.lastPayload){
      const pv = ENGINE.current.bestPv?.length ? ENGINE.current.bestPv : [bestmove[1]];
      cachePrincipalVariation(ENGINE.current, ENGINE.current.lastPayload, pv);
    }
    finishCurrentSearch(ENGINE.mode === 'asm' ? 'saved (fallback)' : 'saved');
    flushEngineQueue();
    return;
  }

  if(!ENGINE.current) return;
  const job = ENGINE.current;

  if(job.kind === 'move'){
    if(line.startsWith('info ') && line.includes(' score ') && line.includes(' pv ')){
      const candidate = scoreMoveCandidateFromInfo(line);
      if(candidate){
        const idx = job.moveCandidates.findIndex(item => item.move === candidate.move);
        if(idx >= 0) job.moveCandidates[idx] = candidate;
        else job.moveCandidates.push(candidate);
      }
    }
    return;
  }

  if(line.startsWith('info ') && line.includes(' score ')){
    let payload = null;

    const mate = line.match(/score mate (-?\d+)/);
    if(mate){
      const raw = parseInt(mate[1], 10);
      // FEN encodes side to move — Stockfish score is from side-to-move's perspective
      // job.turn is stored as the side AFTER the move (side to move in the position)
      const signed = job.turn === 'b' ? -raw : raw;
      payload = { type:'mate', value:signed };
    } else {
      const cp = line.match(/score cp (-?\d+)/);
      if(cp){
        const raw = parseInt(cp[1], 10) / 100;
        const signed = job.turn === 'b' ? -raw : raw;
        payload = { type:'cp', value:signed };
      }
    }

    if(payload){
      const pvMatch = line.match(/\spv\s+(.+)$/);
      job.bestPv = pvMatch ? pvMatch[1].trim().split(/\s+/).filter(Boolean) : job.bestPv;
      payload.pv = job.bestPv.slice();
      job.lastPayload = cloneEvalPayload(payload);
      ENGINE.cache.set(job.fen, cloneEvalPayload(payload));
      cachePrincipalVariation(job, payload, job.bestPv);
      job.onEval(cloneEvalPayload(payload));
    }
  }
}

function flushEngineQueue(){
  if(!ENGINE.ready || !ENGINE.queue.length || !ENGINE.worker || ENGINE.current) return;

  const moveIndex = ENGINE.queue.findIndex(job => job.kind === 'move');
  const jobIndex = moveIndex >= 0 ? moveIndex : 0;
  const job = ENGINE.queue.splice(jobIndex, 1)[0];
  if(!job) return;

  for(let i = ENGINE.queue.length - 1; i >= 0; i--){
    const queued = ENGINE.queue[i];
    if(queued.kind === 'eval' && queued.fen === job.fen){
      ENGINE.queue.splice(i, 1);
    }
  }

  ENGINE.current = job;
  ENGINE.lastFen = job.fen;
  beginTimedSearch(job);
}

function requestEval(fen, turn, onEval, onStatus, depth=18, options={}){
  const cfg = typeof depth === 'object' ? depth : { ...(options || {}), depth };
  const targetDepth = Math.max(8, Number(cfg.depth) || 18);
  const forceFresh = !!cfg.forceFresh;
  const thinkMs = Math.max(400, Number(cfg.thinkMs) || ENGINE_SEARCH_MS);

  if(!forceFresh && ENGINE.cache.has(fen)){
    onEval(cloneEvalPayload(ENGINE.cache.get(fen)));
    onStatus(ENGINE.mode === 'asm' ? 'cached (fallback)' : 'cached');
    return;
  }

  ENGINE.queue = ENGINE.queue.filter(job => !(job.kind === 'eval' && job.fen === fen));
  const job = { id: ++ENGINE.latestJob, kind:'eval', fen, turn, onEval, onStatus, depth: targetDepth, thinkMs, forceFresh };
  ENGINE.queue.push(job);

  initEngine();
  if(!ENGINE.started) return;

  if(!ENGINE.uciOk || !ENGINE.ready){
    onStatus(ENGINE.mode === 'asm' ? 'loading fallback' : 'loading engine');
    return;
  }

  flushEngineQueue();
}

function requestBestMove(fen, turn, onMove, onStatus=()=>{}, options={}){
  ENGINE.queue = ENGINE.queue.filter(job => !(job.kind === 'move' && job.fen === fen));
  const thinkMs = typeof options === 'number' ? options : (options.thinkMs || 1800);
  const depth = typeof options === 'object' ? options.depth : undefined;
  const skill = typeof options === 'object' ? options.skill : undefined;
  const elo = typeof options === 'object' ? options.elo : undefined;
  const multiPv = typeof options === 'object' ? options.multiPv : undefined;
  const job = { id: ++ENGINE.latestJob, kind:'move', fen, turn, onMove, onStatus, thinkMs, depth, skill, elo, multiPv };
  ENGINE.queue.push(job);

  initEngine();
  if(!ENGINE.started) return;

  if(!ENGINE.uciOk || !ENGINE.ready){
    onStatus(ENGINE.mode === 'asm' ? 'loading fallback' : 'loading engine');
    return;
  }

  flushEngineQueue();
}

function clamp(n,min,max){ return Math.max(min, Math.min(max, n)); }
function evalToPct(score){
  const capped = clamp(score, -8, 8);
  return 50 - (capped / 8) * 50;
}
function pvToSan(fen, pvMoves, limit=8){
  if(typeof Chess !== 'function' || !Array.isArray(pvMoves) || !pvMoves.length) return '';
  let game;
  try {
    game = new Chess(fen);
  } catch(_) {
    return pvMoves.slice(0, limit).join(' ');
  }

  const sanMoves = [];
  for(const uci of pvMoves.slice(0, limit)){
    const res = applyUciMove(game, uci);
    if(!res?.san) break;
    sanMoves.push(res.san);
  }
  return sanMoves.join(' ');
}
function formatEvalHover(payload){
  if(payload?.type === 'mate'){
    const sign = payload.value > 0 ? '+' : payload.value < 0 ? '-' : '';
    return sign + 'm' + Math.abs(payload.value);
  }
  if(payload?.type === 'cp'){
    const val = Math.abs(payload.value).toFixed(1);
    if(payload.value > 0) return '+' + val;
    if(payload.value < 0) return '-' + val;
    return '0.0';
  }
  return '0.0';
}
function formatEvalDisplay(payload){
  if(payload?.type === 'mate') return 'm' + Math.abs(payload.value);
  if(payload?.type === 'cp') return Math.abs(payload.value).toFixed(1);
  return '0.0';
}
function boardOnlyFen(board){
  return board.map(row=>{
    let out='', run=0;
    row.forEach(cell=>{
      if(!cell) run++;
      else {
        if(run){ out += String(run); run = 0; }
        const ch = cell[1];
        out += cell[0] === 'w' ? ch : ch.toLowerCase();
      }
    });
    if(run) out += String(run);
    return out;
  }).join('/');
}
function stateFen(state){
  return boardOnlyFen(state.board) + ' ' + state.turn + ' ' + (state.castling || '-') + ' - 0 1';
}
function updateEvalUI(ui, payload){
  let pct = 50;
  const text = formatEvalDisplay(payload);
  const hoverText = formatEvalHover(payload);
  let winner = '';
  if(payload?.type === 'mate'){
    const s = payload.value > 0 ? 8 : -8;
    pct = evalToPct(s);
    winner = payload.value > 0 ? 'white' : payload.value < 0 ? 'black' : '';
  } else if(payload?.type === 'cp'){
    pct = evalToPct(payload.value);
    winner = payload.value > 0 ? 'white' : payload.value < 0 ? 'black' : '';
  }
  const mobile = window.matchMedia('(max-width: 768px)').matches;
  if(mobile){
    ui.black.style.width = pct + '%';
    ui.black.style.height = '100%';
    ui.marker.style.left = pct + '%';
    ui.marker.style.top = '0';
  } else {
    ui.black.style.height = pct + '%';
    ui.black.style.width = '100%';
    ui.marker.style.top = pct + '%';
    ui.marker.style.left = '0';
  }
  ui.text.textContent = text;
  ui.top.textContent = winner === 'black' ? text : '';
  ui.bottom.textContent = winner === 'white' || !winner ? text : '';
  ui.bar.title = hoverText;
  ui.top.title = hoverText;
  ui.bottom.title = hoverText;
}
function queueEval(){ /* deprecated shim */ }
function setEvalStatus(ui, text, isErr=false){
  ui.state.textContent = isErr ? text : '';
  const ok = ['ready','ready (fallback)','cached','cached (fallback)','saved','saved (fallback)'].includes(text);
  ui.state.className = 'eval-state' + (ok ? ' ready' : '') + (isErr ? ' err' : '');
}

// ─── Markdown renderer ────────────────────────────────────────────────
function renderMarkdown(raw){
  const lines = (raw||'').split('\n');
  let html = '';
  let inOl = false, inUl = false;

  function closeList(){
    if(inOl){ html+='</ol>'; inOl=false; }
    if(inUl){ html+='</ul>'; inUl=false; }
  }

  function inlineFormat(text){
    return text
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
      .replace(/\*(.+?)\*/g,'<em>$1</em>')
      .replace(/`(.+?)`/g,'<code>$1</code>');
  }

  for(let i=0; i<lines.length; i++){
    const line = lines[i];
    const olMatch = line.match(/^(\d+)\.\s+(.*)/);
    const ulMatch = line.match(/^[-*]\s+(.*)/);
    const h2Match = line.match(/^##\s+(.*)/);
    const h3Match = line.match(/^###\s+(.*)/);

    if(h2Match){
      closeList();
      html+=`<h2>${inlineFormat(h2Match[1])}</h2>`;
    } else if(h3Match){
      closeList();
      html+=`<h3>${inlineFormat(h3Match[1])}</h3>`;
    } else if(olMatch){
      if(inUl){ html+='</ul>'; inUl=false; }
      if(!inOl){ html+='<ol>'; inOl=true; }
      html+=`<li>${inlineFormat(olMatch[2])}</li>`;
    } else if(ulMatch){
      if(inOl){ html+='</ol>'; inOl=false; }
      if(!inUl){ html+='<ul>'; inUl=true; }
      html+=`<li>${inlineFormat(ulMatch[1])}</li>`;
    } else if(line.trim()===''){
      closeList();
      // blank line = paragraph break (absorbed, next text opens new <p>)
      if(html && !html.endsWith('</p>') && !html.endsWith('</h2>') && !html.endsWith('</h3>') && !html.endsWith('</ol>') && !html.endsWith('</ul>')){
        html+='</p>';
      }
    } else {
      closeList();
      if(!html.endsWith('>') || html.endsWith('</p>') || html.endsWith('</h2>') || html.endsWith('</h3>') || html.endsWith('</ol>') || html.endsWith('</ul>')){
        html+=`<p>${inlineFormat(line)}`;
      } else {
        html+=` ${inlineFormat(line)}`;
      }
    }
  }
  closeList();
  if(html && !html.endsWith('>')) html+='</p>';
  return html;
}

function uniqueList(values){
  return Array.from(new Set((values || []).map(v => String(v || '').trim()).filter(Boolean)));
}

function buildEntryTitleFromLine(entry, block){
  const sourceTitle = String(entry?.title || '').trim();
  const lineLabel = String(block?.label || '').trim();
  if(sourceTitle && lineLabel){
    return lineLabel.toLowerCase().includes(sourceTitle.toLowerCase())
      ? lineLabel
      : `${sourceTitle} — ${lineLabel}`;
  }
  return lineLabel || sourceTitle || 'New Line Entry';
}

function buildLineEntry(entry, block){
  const title = buildEntryTitleFromLine(entry, block);
  const lineCopy = JSON.parse(JSON.stringify(block || { type:'line', label:'', popularity:'', moves:[] }));
  const moveList = (lineCopy.moves || []).map(mv => mv.san).filter(Boolean);
  const previewMoves = moveList.slice(0, 10).join(' ');
  const previewSuffix = moveList.length > 10 ? ' ...' : '';
  const overview = [
    '## Overview',
    entry?.title ? `Created from **${entry.title}**.` : 'Created from a saved line.',
    lineCopy.popularity ? `Popularity: **${lineCopy.popularity}**.` : '',
    previewMoves ? `Move order: \`${previewMoves}${previewSuffix}\`` : ''
  ].filter(Boolean).join('\n\n');

  return {
    id: 'entry-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
    title,
    tags: uniqueList([...(entry?.tags || []), 'line']),
    date: new Date().toISOString().slice(0, 10),
    blocks: [
      { type:'text', content: overview },
      { type:'tabs', tabs: [{ label: lineCopy.label || 'Main Line', blocks: [lineCopy] }] }
    ]
  };
}

function createEntryFromLine(entry, block){
  const newEntry = buildLineEntry(entry, block);
  LINES.push(newEntry);
  markUnsaved();
  renderView();
  openEd(LINES.length - 1);
  toast('New entry created from line','ok');
}

function ecoMovesToSavedLine(movesText){
  const cleaned = String(movesText || '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/\b\d+\.(\.\.)?/g, ' ')
    .replace(/\b(1-0|0-1|1\/2-1\/2|\*)\b/g, ' ')
    .replace(/[;,]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const tokens = cleaned.split(' ').filter(Boolean).filter(token => /^(O-O(-O)?|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](=[QRBN])?[+#]?|[a-h]x?[a-h][1-8](=[QRBN])?[+#]?|[a-h][1-8](=[QRBN])?[+#]?|[a-h][1-8][+#]?)$/i.test(token));
  return tokens.map(san => ({ san, comment:'' }));
}

function groupEcoEntries(entries){
  const groups = new Map();
  (entries || []).forEach((entry, idx) => {
    const code = String(entry?.code || '').trim().toUpperCase();
    if(!code) return;
    if(!groups.has(code)){
      groups.set(code, {
        code,
        name: String(entry?.name || '').trim(),
        rows: [],
        sortIndex: idx
      });
    }
    const group = groups.get(code);
    if(!group.name && entry?.name) group.name = String(entry.name).trim();
    group.rows.push({
      code,
      name: String(entry?.name || '').trim(),
      moves: String(entry?.moves || '').trim(),
      articleUrl: String(entry?.articleUrl || '').trim()
    });
  });
  return Array.from(groups.values()).sort((a,b) => a.sortIndex - b.sortIndex);
}

function commonPrefixLength(sequences){
  if(!sequences.length) return 0;
  const minLen = Math.min(...sequences.map(seq => seq.length));
  let idx = 0;
  while(idx < minLen){
    const move = sequences[0][idx];
    if(sequences.some(seq => seq[idx] !== move)) break;
    idx++;
  }
  return idx;
}

function slugifyEcoEntryTitle(title){
  return String(title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'opening';
}

function splitEcoName(name){
  const fullName = String(name || '').trim();
  if(!fullName) return { title:'Unnamed Opening', label:'Main Line' };
  const parts = fullName.split(': ');
  if(parts.length > 1){
    return {
      title: parts[0].trim() || fullName,
      label: parts.slice(1).join(': ').trim() || 'Main Line'
    };
  }
  const commaParts = fullName.split(', ');
  if(commaParts.length > 1){
    return {
      title: commaParts[0].trim() || fullName,
      label: commaParts.slice(1).join(', ').trim() || 'Main Line'
    };
  }
  return { title: fullName, label:'Main Line' };
}

function buildEcoEntryId(title){
  return `entry-eco-${slugifyEcoEntryTitle(title)}`;
}

function buildEcoEntriesForGroup(group){
  const code = String(group?.code || '').trim().toUpperCase();
  const openings = new Map();

  (group?.rows || []).forEach(row => {
    const savedMoves = ecoMovesToSavedLine(row.moves);
    if(!savedMoves.length) return;
    const parsed = splitEcoName(row.name);
    if(!openings.has(parsed.title)) openings.set(parsed.title, []);
    openings.get(parsed.title).push({
      label: parsed.label || 'Main Line',
      moves: savedMoves
    });
  });

  return Array.from(openings.entries()).map(([title, tabs]) => ({
    id: buildEcoEntryId(title),
    title,
    tags: code ? [code] : [],
    date: new Date().toISOString().slice(0, 10),
    blocks: [
      {
        type:'tabs',
        tabs: tabs.map(tab => ({
          label: tab.label || 'Main Line',
          blocks: [
            {
              type:'line',
              label: tab.label || 'Main Line',
              popularity:'',
              moves: tab.moves
            }
          ]
        }))
      }
    ]
  }));
}

function findEcoEntryIndexById(id){
  return LINES.findIndex(entry => String(entry?.id || '').trim() === String(id || '').trim());
}

function ensureEcoGroupEntries(group){
  const builtEntries = buildEcoEntriesForGroup(group);
  const results = [];
  builtEntries.forEach(entry => {
    const existingIdx = findEcoEntryIndexById(entry.id);
    if(existingIdx >= 0){
      results.push({ id: entry.id, idx: existingIdx, created: false });
      return;
    }
    LINES.push(entry);
    results.push({ id: entry.id, idx: LINES.length - 1, created: true });
  });
  if(results.some(result => result.created)) markUnsaved();
  return results;
}

function openEntryPageByIndex(idx){
  const entry = LINES[idx];
  if(!entry) return;
  if(edOpen) closeEd();
  renderView();
  requestAnimationFrame(() => {
    const entryElement=document.getElementById(entry.id);
    entryElement?._ensureContent?.();
    entryElement?.scrollIntoView({ behavior:'smooth', block:'start' });
  });
}

function importEcoGroup(group){
  const results = ensureEcoGroupEntries(group);
  renderEcoList(ECO_CACHE || ECO_FALLBACK, document.getElementById('eco-search')?.value || '');
  if(results.length) openEntryPageByIndex(results[0].idx);
  const createdCount = results.filter(result => result.created).length;
  toast(createdCount ? `Generated ${createdCount} opening page${createdCount === 1 ? '' : 's'}` : 'Opening pages opened','ok');
}

function ensureEcoEntries(entries){
  const groups = groupEcoEntries(entries);
  let added = 0;
  groups.forEach(group => {
    const results = ensureEcoGroupEntries(group);
    added += results.filter(result => result.created).length;
  });
  return added;
}
// ─── View rendering ──────────────────────────────────────────────────
// We need to stamp tab buttons with the same IDs used in the nav tree.
// We do a pre-pass to assign IDs, then buildBlocks uses them.

function assignTabIds(blocks, nodeList){
  // nodeList is the result of collectTabTree(blocks)
  // We need to match them up: each tabs block maps to a slice of nodeList
  let nodeIdx = 0;
  for(const block of blocks){
    if(block.type==='tabs'){
      (block.tabs||[]).forEach((tab, ti)=>{
        const node = nodeList[nodeIdx]; nodeIdx++;
        if(node){
          tab._navId = node.id;
          assignTabIds(tab.blocks||[], node.children||[]);
        }
      });
    }
  }
}

function buildBlocks(blocks, container, entry, parentNavId){
  for(const block of blocks){
    if(block.type==='text'){
      const wrap=document.createElement('div');wrap.className='block block-text-wrap';
      const textEl=document.createElement('div');textEl.className='block-text';
      textEl.innerHTML=renderMarkdown(block.content);
      const ttsBtn=document.createElement('button');ttsBtn.className='tts-btn';ttsBtn.title='Read aloud';ttsBtn.textContent='🔊';
      let utterance=null;
      const pickVoice = () => {
        const voices = window.speechSynthesis.getVoices();
        const score = v => {
          const n = v.name;
          if(!v.lang.startsWith('en')) return -1;
          if(n.includes('Natural')) return 100;
          if(n.includes('Online')) return 90;
          if(n.includes('Neural')) return 85;
          if(/Google (UK English Female|US English)/.test(n)) return 80;
          if(/Microsoft (Aria|Emma|Jenny|Guy|Ana|Christopher|Eric|Brian)/.test(n)) return 75;
          if(/Samantha|Karen|Daniel|Moira|Tessa/.test(n)) return 60;
          if(n.toLowerCase().includes('female') || n.toLowerCase().includes('woman')) return 40;
          return 10;
        };
        return voices.filter(v => v.lang.startsWith('en')).sort((a,b) => score(b)-score(a))[0] || voices[0];
      };
      ttsBtn.onclick=()=>{
        if(window.speechSynthesis.speaking){
          window.speechSynthesis.cancel();
          ttsBtn.textContent='🔊';
          ttsBtn.classList.remove('speaking');
          return;
        }
        const text=(block.content||'').replace(/[#*`_~]/g,'').replace(/\n+/g,' ').trim();
        utterance=new SpeechSynthesisUtterance(text);
        utterance.rate=0.88;
        utterance.pitch=1.0;
        utterance.volume=1.0;
        const trySpeak = () => {
          const chosen = pickVoice();
          if(chosen) utterance.voice = chosen;
          utterance.onend=()=>{ ttsBtn.textContent='🔊'; ttsBtn.classList.remove('speaking'); };
          utterance.onerror=()=>{ ttsBtn.textContent='🔊'; ttsBtn.classList.remove('speaking'); };
          ttsBtn.textContent='⏹️';
          ttsBtn.classList.add('speaking');
          window.speechSynthesis.speak(utterance);
        };
        if(window.speechSynthesis.getVoices().length){ trySpeak(); }
        else { window.speechSynthesis.onvoiceschanged = () => { window.speechSynthesis.onvoiceschanged=null; trySpeak(); }; }
      };
      // pen inline-edit button
      const editBtn=document.createElement('button');editBtn.className='edit-txt-btn';editBtn.title='Edit text';editBtn.textContent='✏️';
      editBtn.onclick=()=>{
        if(window.speechSynthesis.speaking){ window.speechSynthesis.cancel(); ttsBtn.textContent='🔊'; ttsBtn.classList.remove('speaking'); }
        textEl.style.display='none';
        btnGroup.style.display='none';
        const ta=document.createElement('textarea');ta.className='inline-edit-ta';ta.value=block.content||'';
        ta.rows=Math.max(4, (block.content||'').split('\n').length+1);
        const actions=document.createElement('div');actions.className='inline-edit-actions';
        const saveBtn=document.createElement('button');saveBtn.className='inline-save-btn';saveBtn.textContent='Save';
        const cancelBtn=document.createElement('button');cancelBtn.className='inline-cancel-btn';cancelBtn.textContent='Cancel';
        const finish=()=>{ ta.remove(); actions.remove(); textEl.style.display=''; btnGroup.style.display=''; };
        saveBtn.onclick=()=>{ block.content=ta.value; textEl.innerHTML=renderMarkdown(block.content); markUnsaved(); finish(); };
        cancelBtn.onclick=()=>finish();
        actions.appendChild(saveBtn); actions.appendChild(cancelBtn);
        wrap.appendChild(ta); wrap.appendChild(actions);
        ta.focus();
      };
      const btnGroup=document.createElement('div');btnGroup.className='txt-btn-group';
      btnGroup.appendChild(ttsBtn);btnGroup.appendChild(editBtn);
      wrap.appendChild(textEl);
      wrap.appendChild(btnGroup);
      container.appendChild(wrap);
    } else if(block.type==='line'){
      const el=document.createElement('div');el.className='block block-line';
      const hdr=document.createElement('div');hdr.className='block-line-header';
      const lbl=document.createElement('span');lbl.className='block-line-label';lbl.textContent=block.label||'Line';hdr.appendChild(lbl);
      if(block.popularity){
        const parsedPct=parseInt(block.popularity,10);
        const pct=Number.isFinite(parsedPct)?Math.max(0,Math.min(100,parsedPct)):0;
        const pw=document.createElement('div');pw.className='pop-wrap';
        const bar=document.createElement('div');bar.className='pop-bar';
        const fill=document.createElement('div');fill.className='pop-fill';fill.style.width=pct+'%';
        const label=document.createElement('span');label.className='pop-pct';label.textContent=block.popularity;
        bar.appendChild(fill);pw.append(bar,label);hdr.appendChild(pw);
      }
      const actionGroup=document.createElement('div');actionGroup.className='line-action-group';
      if(parentNavId){
        const lineMapIco=document.createElement('button');lineMapIco.className='line-map-btn';lineMapIco.title='Find on map';lineMapIco.textContent='📍';
        lineMapIco.onclick=()=>{
          const overlay=document.getElementById('map-overlay');
          if(!overlay.classList.contains('open')){
            overlay.classList.add('open'); renderStats(); renderMap();
            setTimeout(()=>{ if(window.mapFocusNavId) window.mapFocusNavId(parentNavId); }, 80);
          } else {
            if(window.mapFocusNavId) window.mapFocusNavId(parentNavId);
          }
        };
        actionGroup.appendChild(lineMapIco);
      }
      const practiceBtn=document.createElement('button');practiceBtn.className='hbtn';practiceBtn.type='button';practiceBtn.textContent='Practice';practiceBtn.onclick=()=>openPracticeSetup(block.moves||[], block.label||'Line');actionGroup.appendChild(practiceBtn);
      hdr.appendChild(actionGroup);
      el.appendChild(hdr);const body=document.createElement('div');body.className='block-line-body';body.appendChild(buildLineWidget(block.moves||[]));el.appendChild(body);container.appendChild(el);
    } else if(block.type==='tabs'){
      const wrap=document.createElement('div');wrap.className='block block-tabs';
      const nav=document.createElement('div');nav.className='tabs-nav';nav.setAttribute('role','tablist');
      const panels=[];
      const buttons=[];
      const renderers=[];
      const tabGroupId=stampId();
      (block.tabs||[]).forEach((tab,i)=>{
        const btn=document.createElement('button');
        btn.className='tab-btn'+(i===0?' active':'');
        btn.type='button';
        btn.id=tabGroupId+'-tab-'+i;
        btn.setAttribute('role','tab');
        btn.setAttribute('aria-selected',String(i===0));
        btn.tabIndex=i===0?0:-1;
        if(tab._navId) btn.setAttribute('data-tab-nav-id', tab._navId);
        const labelSpan=document.createElement('span');labelSpan.textContent=tab.label;
        btn.appendChild(labelSpan);
        if(tab._navId){
          const mapIco=document.createElement('span');mapIco.className='tab-map-ico';mapIco.title='Find on map';mapIco.textContent='📍';
          mapIco.addEventListener('click',e=>{
            e.stopPropagation();
            const overlay=document.getElementById('map-overlay');
            if(!overlay.classList.contains('open')){
              overlay.classList.add('open'); renderStats(); renderMap();
              setTimeout(()=>{ if(window.mapFocusNavId) window.mapFocusNavId(tab._navId); }, 80);
            } else {
              if(window.mapFocusNavId) window.mapFocusNavId(tab._navId);
            }
          });
          btn.appendChild(mapIco);
        }
        const panel=document.createElement('div');panel.className='tab-panel'+(i===0?' active':'');
        panel.id=tabGroupId+'-panel-'+i;
        panel.setAttribute('role','tabpanel');
        panel.setAttribute('aria-labelledby',btn.id);
        panel.setAttribute('aria-hidden',String(i!==0));
        btn.setAttribute('aria-controls',panel.id);
        const renderPanel=()=>{
          if(panel.dataset.rendered==='true') return;
          buildBlocks(tab.blocks||[],panel,entry,tab._navId||parentNavId);
          panel.dataset.rendered='true';
        };
        panels.push(panel);buttons.push(btn);renderers.push(renderPanel);
        btn.addEventListener('click',()=>{
          buttons.forEach((button,index)=>{
            const selected=button===btn;
            button.classList.toggle('active',selected);
            button.setAttribute('aria-selected',String(selected));
            button.tabIndex=selected?0:-1;
            panels[index].classList.toggle('active',selected);
            panels[index].setAttribute('aria-hidden',String(!selected));
          });
          renderPanel();
        });
        btn.addEventListener('keydown',event=>{
          if(event.key!=='ArrowLeft'&&event.key!=='ArrowRight'&&event.key!=='Home'&&event.key!=='End') return;
          event.preventDefault();
          let next=i;
          if(event.key==='ArrowLeft') next=(i-1+buttons.length)%buttons.length;
          if(event.key==='ArrowRight') next=(i+1)%buttons.length;
          if(event.key==='Home') next=0;
          if(event.key==='End') next=buttons.length-1;
          buttons[next]?.click();
          buttons[next]?.focus();
        });
        nav.appendChild(btn);
      });
      wrap.appendChild(nav);panels.forEach(p=>wrap.appendChild(p));container.appendChild(wrap);
      renderers[0]?.();
    }
  }
}

function buildEntry(entry, idx, tabTree, deferContent=false){
  // tabTree passed in from renderView so IDs are shared with nav
  assignTabIds(entry.blocks||[], tabTree);

  const wrap=document.createElement('article');wrap.className='entry';wrap.id=entry.id;
  const hdr=document.createElement('div');hdr.className='entry-header';
  const titleTag=idx===0?'h1':'h2';
  hdr.innerHTML=`<div class="entry-eyebrow">ENTRY ${String(idx+1).padStart(2,'0')}</div><${titleTag} class="entry-title">${esc(entry.title)}</${titleTag}><div class="entry-meta"><span>${esc(entry.date||'')}</span>${(entry.tags||[]).map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div>`;
  wrap.appendChild(hdr);
  let rendered=false;
  let loadBtn=null;
  const ensureContent=()=>{
    if(rendered) return;
    rendered=true;
    loadBtn?.remove();
    buildBlocks(entry.blocks||[], wrap, entry);
  };
  Object.defineProperty(wrap,'_ensureContent',{value:ensureContent});
  if(deferContent){
    loadBtn=el('button','deferred-entry-btn');
    loadBtn.type='button';
    loadBtn.textContent='Open '+(entry.title||'this entry');
    loadBtn.onclick=ensureContent;
    wrap.appendChild(loadBtn);
  } else ensureContent();
  return wrap;
}

// ─── Tree nav ────────────────────────────────────────────────────────
// Each tab block rendered in the main view gets a unique id stamped on it.
// Clicking a nav leaf scrolls to the entry AND programmatically clicks the
// chain of tab buttons needed to reveal that panel.

let navTabRegistry = {}; // id -> { tabBtnEl, parentIds[] }

function stampId(){ return 'tb-'+(Math.random().toString(36).slice(2)); }

// Walk a block array and collect tab structure for nav tree building.
// Returns array of { label, id, children } where children is the same shape.
function collectTabTree(blocks){
  const result = [];
  for(const block of blocks){
    if(block.type==='tabs'){
      for(const tab of (block.tabs||[])){
        const node = { label: tab.label, id: stampId(), children: collectTabTree(tab.blocks||[]) };
        result.push(node);
      }
    }
  }
  return result;
}

// Build the DOM for an entry's tab tree, registering activator functions.
// activatorChain: array of functions to call in order to open ancestor tabs.
function buildNavTree(nodes, container, depth, activatorChain, entryId){
  for(const node of nodes){
    const wrap = el('div','tree-entry');
    const hasChildren = node.children && node.children.length > 0;

    const row = el('div','tree-row');
    row.dataset.navId = node.id;

    // Indent spacer (depth * 10px beyond base)
    if(depth > 0){
      const ind = el('span',''); ind.style.width=(depth*10)+'px'; ind.style.flexShrink='0';
      row.appendChild(ind);
    }

    // Toggle arrow
    const tog = el('button','tree-toggle'+(hasChildren?'':' leaf'));tog.type='button';
    tog.textContent = '▶';
    if(hasChildren){
      tog.setAttribute('aria-label','Expand '+node.label);
      tog.setAttribute('aria-expanded','false');
    } else {
      tog.disabled=true;
      tog.tabIndex=-1;
      tog.setAttribute('aria-hidden','true');
    }
    row.appendChild(tog);

    // Label
    const lbl = el('button','tree-label d'+Math.min(depth,4));lbl.type='button';
    lbl.textContent = node.label;
    row.appendChild(lbl);

    wrap.appendChild(row);

    // Children container
    let childWrap = null;
    let open = false;
    if(hasChildren){
      childWrap = el('div','tree-children');
      buildNavTree(node.children, childWrap, depth+1, [...activatorChain, node.id], entryId);
      wrap.appendChild(childWrap);

       tog.addEventListener('click', e=>{
        e.stopPropagation();
        open = !open;
         tog.classList.toggle('open', open);
         tog.setAttribute('aria-expanded',String(open));
        childWrap.classList.toggle('open', open);
      });
    }

    // Store activator in registry
    navTabRegistry[node.id] = { activatorChain: [...activatorChain], selfId: node.id, entryId };

    // Click row -> activate this tab (and all ancestors)
    row.addEventListener('click', ()=>{
      activateNavLeaf(node.id);
      // Also expand children if any
      if(hasChildren && !open){
        open = true;
        tog.classList.add('open');
        tog.setAttribute('aria-expanded','true');
        if(childWrap) childWrap.classList.add('open');
      }
    });

    container.appendChild(wrap);
  }
}

function activateNavLeaf(leafId){
  document.querySelectorAll('.tree-row.active-leaf').forEach(r=>r.classList.remove('active-leaf'));
  document.querySelectorAll('.tree-row.in-path').forEach(r=>r.classList.remove('in-path'));

  const reg = navTabRegistry[leafId];
  if(!reg) return;
  document.getElementById(reg.entryId)?._ensureContent?.();

  const allIds = [...reg.activatorChain, leafId];

  // Mark nav path
  allIds.forEach(id=>{
    const row = document.querySelector(`.tree-row[data-nav-id="${id}"]`);
    if(row) row.classList.add('in-path');
  });
  const selfRow = document.querySelector(`.tree-row[data-nav-id="${leafId}"]`);
  if(selfRow){ selfRow.classList.add('active-leaf'); selfRow.scrollIntoView({block:'nearest'}); }

  // Click tab buttons outer -> inner with small delays so each panel renders before the next click
  function clickChain(ids, idx){
    if(idx >= ids.length){
      // All tabs clicked — now scroll to the leaf tab button
      setTimeout(()=>{
        const leafBtn = document.querySelector(`[data-tab-nav-id="${leafId}"]`);
        if(leafBtn){
          leafBtn.scrollIntoView({behavior:'smooth', block:'center'});
        } else {
          // top level entry fallback
          const entry = document.querySelector(`[data-nav-id="${leafId}"]`)?.closest('.entry');
          if(entry) entry.scrollIntoView({behavior:'smooth', block:'start'});
        }
      }, 60);
      return;
    }
    const tabBtn = document.querySelector(`[data-tab-nav-id="${ids[idx]}"]`);
    if(tabBtn) tabBtn.click();
    setTimeout(()=> clickChain(ids, idx+1), 30);
  }
  clickChain(allIds, 0);
}

function renderView(){
  navTabRegistry = {};
  const mainEl=document.getElementById('smain');
  const navEl=document.getElementById('snav');
  mainEl.innerHTML='';
  // Clear nav except label
  Array.from(navEl.children).forEach(c=>{if(!c.classList.contains('nav-label'))c.remove();});

  if(LINES.length===0){
    mainEl.innerHTML=`<div class="empty-state"><div class="big">♟</div><p>No entries yet. Hit "New entry" to start, or load a JSON file.</p></div>`;
  } else {
    LINES.forEach((entry, i)=>{
      // Generate tab tree ONCE so nav IDs match what gets stamped on tab buttons
      const tabTree = collectTabTree(entry.blocks||[]);

      // Build main view entry (passes tabTree so assignTabIds uses same IDs)
      mainEl.appendChild(buildEntry(entry, i, tabTree, i>0));
      if(i < LINES.length-1){ const hr=document.createElement('hr'); hr.className='entry-divider'; mainEl.appendChild(hr); }

      // Build nav tree node for this entry
      const entryWrap = el('div','tree-entry');
      const hasChildren = (collectTabTree(entry.blocks||[])).length > 0;
  

      const row = el('div','tree-row');

      // No indent for root
      const tog = el('button','tree-toggle'+(hasChildren?'':' leaf'));tog.type='button';
      tog.textContent='▶';
      if(hasChildren){
        tog.setAttribute('aria-label','Expand '+(entry.title||'entry'));
        tog.setAttribute('aria-expanded','false');
      } else {
        tog.disabled=true;
        tog.tabIndex=-1;
        tog.setAttribute('aria-hidden','true');
      }
      row.appendChild(tog);

      const lbl = el('button','tree-label d0');lbl.type='button';
      lbl.textContent = entry.title || '(untitled)';
      row.appendChild(lbl);

      if(entry.tags&&entry.tags[0]){
        const tag=el('span','tree-tag'); tag.textContent=entry.tags[0]; row.appendChild(tag);
      }

      const editBtn=el('button','tree-edit'); editBtn.type='button';editBtn.textContent='✎'; editBtn.title='Edit';editBtn.setAttribute('aria-label','Edit '+(entry.title||'entry'));
      editBtn.addEventListener('click',e=>{e.stopPropagation();openEd(i);});
      row.appendChild(editBtn);

      entryWrap.appendChild(row);

      let open = false;
      let childWrap = null;
      if(hasChildren){
        childWrap = el('div','tree-children');
        buildNavTree(tabTree, childWrap, 1, [], entry.id);
        entryWrap.appendChild(childWrap);

        tog.addEventListener('click', e=>{
          e.stopPropagation();
          open=!open;
          tog.classList.toggle('open',open);
          tog.setAttribute('aria-expanded',String(open));
          childWrap.classList.toggle('open',open);
        });
      }

      // Click entry row -> scroll to entry + expand
      row.addEventListener('click',()=>{
        const entryElement=document.getElementById(entry.id);
        entryElement?._ensureContent?.();
        entryElement?.scrollIntoView({behavior:'smooth'});
        if(hasChildren && !open){
          open=true; tog.classList.add('open');
          tog.setAttribute('aria-expanded','true');
          if(childWrap) childWrap.classList.add('open');
        }
      });

      navEl.appendChild(entryWrap);
    });
  }
  document.getElementById('entry-count').textContent=LINES.length+(LINES.length===1?' entry':' entries');
}

// ─── EDITOR ─────────────────────────────────────────────────────────
let edOpen=false, edIdx=null, edEntry=null;

function openEd(idx){
  edOpen=true; edIdx=idx;
  edEntry = idx===null
    ? {id:'entry-'+Date.now(), title:'', tags:[], date:new Date().toISOString().slice(0,10), blocks:[]}
    : JSON.parse(JSON.stringify(LINES[idx]));
  document.body.classList.add('editor-page-open');
  renderEd();
  document.getElementById('toggle-btn').classList.add('active');
}

function closeEd(){
  edOpen=false; edEntry=null; edIdx=null;
  document.body.classList.remove('editor-page-open');
  document.getElementById('toggle-btn').classList.remove('active');
  document.getElementById('editor-panel')?.remove();
}

function renderEd(){
  let panel=document.getElementById('editor-panel');
  if(!panel){ panel=document.createElement('div'); panel.id='editor-panel'; document.body.appendChild(panel); }

  panel.innerHTML='';

  // Head
  const head=el('div','ed-head');
  head.innerHTML=`<span class="ed-head-title">${edIdx===null?'New Entry Page':'Editor Page'}</span>`;
  const closeBtn=el('button','ed-close'); closeBtn.textContent='✕'; closeBtn.onclick=closeEd;
  head.appendChild(closeBtn);
  panel.appendChild(head);

  // Body
  const body=el('div','ed-body');

  // Meta fields
  body.appendChild(sectionLabel('Entry Info'));

  const titleField=el('div','ed-field');
  titleField.innerHTML='<label class="ed-label">Title</label>';
  const titleIn=el('input','ed-input'); titleIn.placeholder='e.g. Caro-Kann Advance Variation';
  titleIn.value=edEntry.title||'';
  titleIn.oninput=e=>{edEntry.title=e.target.value;};
  titleField.appendChild(titleIn); body.appendChild(titleField);

  const dateField=el('div','ed-field');
  dateField.innerHTML='<label class="ed-label">Date</label>';
  const dateIn=el('input','ed-input'); dateIn.type='date';
  dateIn.value=edEntry.date||'';
  dateIn.oninput=e=>{edEntry.date=e.target.value;};
  dateField.appendChild(dateIn); body.appendChild(dateField);

  const tagsField=el('div','ed-field');
  tagsField.innerHTML='<label class="ed-label">Tags <span style="color:var(--muted2);font-weight:normal;text-transform:none;letter-spacing:0;">(press Enter or comma to add)</span></label>';
  const tagsWrap=el('div','tags-wrap');
  tagsWrap.id='tags-wrap';
  renderTagPills(tagsWrap);
  const tagIn=el('input','tag-input'); tagIn.placeholder='opening, tactics…';
  tagsWrap.appendChild(tagIn);
  tagIn.addEventListener('keydown',e=>{
    if((e.key==='Enter'||e.key===','||e.key===' ')&&tagIn.value.trim()){
      e.preventDefault();
      const v=tagIn.value.replace(/,/g,'').trim();
      if(v&&!edEntry.tags.includes(v)){edEntry.tags.push(v);renderTagPills(tagsWrap,tagIn);}
      tagIn.value='';
    } else if(e.key==='Backspace'&&!tagIn.value&&edEntry.tags.length){
      edEntry.tags.pop(); renderTagPills(tagsWrap,tagIn);
    }
  });
  tagsWrap.addEventListener('click',()=>tagIn.focus());
  tagsField.appendChild(tagsWrap); body.appendChild(tagsField);

  // Blocks
  body.appendChild(sectionLabel('Blocks'));
  const blocksWrap=el('div','blocks-list'); blocksWrap.id='ed-blocks';
  body.appendChild(blocksWrap);

  const addRow=el('div','add-block-row');
  ['text','line','tabs'].forEach(type=>{
    const btn=el('button','add-block-btn');
    btn.textContent='+ '+type;
    btn.onclick=()=>{ addBlock(edEntry.blocks,type,()=>renderBlocksList(blocksWrap)); };
    addRow.appendChild(btn);
  });
  body.appendChild(addRow);

  // JSON editor link
  const jsonRow=el('div','');
  jsonRow.style.cssText='display:flex;gap:6px;margin-top:4px;';
  const jsonBtn=el('button','edbtn sm'); jsonBtn.textContent='⌥ Edit raw JSON'; jsonBtn.onclick=openJsonModal;
  jsonRow.appendChild(jsonBtn);
  body.appendChild(jsonRow);

  // Delete entry
  if(edIdx!==null){
    const delBtn=el('button','edbtn dng'); delBtn.textContent='Delete entry';
    delBtn.onclick=()=>{
      if(!confirm('Delete this entry?')) return;
      LINES.splice(edIdx,1); markUnsaved(); renderView(); closeEd();
      toast('Entry deleted','ok');
    };
    body.appendChild(delBtn);
  }

  panel.appendChild(body);

  // Footer
  const foot=el('div','ed-foot');
  const cancelBtn=el('button','edbtn'); cancelBtn.textContent='Cancel'; cancelBtn.onclick=closeEd;
  const saveBtn=el('button','edbtn primary'); saveBtn.textContent='Save entry'; saveBtn.onclick=saveEd;
  foot.appendChild(cancelBtn); foot.appendChild(saveBtn);
  panel.appendChild(foot);

  renderBlocksList(blocksWrap);
}

function renderTagPills(wrap,inputEl){
  // Remove all pills
  wrap.querySelectorAll('.tag-pill').forEach(p=>p.remove());
  const ref = inputEl || wrap.querySelector('.tag-input');
  edEntry.tags.forEach((tag,i)=>{
    const pill=el('span','tag-pill');
    pill.innerHTML=`${esc(tag)}<button title="Remove">×</button>`;
    pill.querySelector('button').onclick=()=>{ edEntry.tags.splice(i,1); renderTagPills(wrap,ref); };
    wrap.insertBefore(pill,ref||null);
  });
}

function sectionLabel(txt){
  const d=el('div','ed-section-label'); d.textContent=txt; return d;
}

// ─── Block list renderer ─────────────────────────────────────────────
function renderBlocksList(wrap){
  wrap.innerHTML='';
  edEntry.blocks.forEach((block,i)=>{ wrap.appendChild(buildBlockItem(block,i,edEntry.blocks,()=>renderBlocksList(wrap))); });
}

function buildBlockItem(block, i, blockArr, refresh, _depth, _parentMoves){
  const depth = _depth || 0;
  const item=el('div','bitem');

  // Header
  const head=el('div','bitem-head');
  const handle=el('span','drag-handle'); handle.textContent='⠿'; handle.title='Drag to reorder';
  const badge=el('span','btype-badge bt-'+block.type); badge.textContent=block.type;
  const preview=el('span','bitem-title');
  preview.textContent=block.type==='text'?(block.content||'').slice(0,50)||'(empty)'
    :block.type==='line'?(block.label||'Unnamed line')
    :'Tabs: '+(block.tabs||[]).map(t=>t.label).join(', ');
  const actions=el('div','bitem-actions');
  const upBtn=makeIconBtn('↑','Move up'); upBtn.onclick=()=>{ if(i>0){[blockArr[i-1],blockArr[i]]=[blockArr[i],blockArr[i-1]];refresh();} };
  const dnBtn=makeIconBtn('↓','Move down'); dnBtn.onclick=()=>{ if(i<blockArr.length-1){[blockArr[i],blockArr[i+1]]=[blockArr[i+1],blockArr[i]];refresh();} };
  const dupBtn=makeIconBtn('⧉','Duplicate block'); dupBtn.onclick=()=>{
    const copy = JSON.parse(JSON.stringify(block));
    // Give line blocks a slightly different label so you can tell them apart
    if(copy.label) copy.label = copy.label + ' (copy)';
    blockArr.splice(i+1, 0, copy);
    refresh();
  };
  const delBtn=makeIconBtn('✕','Delete block'); delBtn.classList.add('del'); delBtn.onclick=()=>{ blockArr.splice(i,1); refresh(); };
  actions.appendChild(upBtn); actions.appendChild(dnBtn); actions.appendChild(dupBtn); actions.appendChild(delBtn);
  head.appendChild(handle); head.appendChild(badge); head.appendChild(preview); head.appendChild(actions);
  item.appendChild(head);

  // Body
  const body=el('div','bitem-body');


  if(block.type==='text'){
    // Toolbar
    const toolbar = el('div','text-toolbar');
    const toolbarActions = [
      { label:'##', title:'Heading', prefix:'## ' },
      { label:'###', title:'Sub-heading', prefix:'### ' },
      null, // separator
      { label:'1.', title:'Ordered list item', prefix:'1. ' },
      { label:'–', title:'Bullet list item', prefix:'- ' },
      null,
      { label:'B', title:'Bold', wrap:['**','**'] },
      { label:'I', title:'Italic', wrap:['*','*'], style:'font-style:italic' },
      { label:'`', title:'Inline code', wrap:['`','`'] },
    ];
    toolbarActions.forEach(action=>{
      if(!action){ const sep=el('div','tb-sep'); toolbar.appendChild(sep); return; }
      const btn=document.createElement('button');
      btn.textContent=action.label; btn.title=action.title;
      if(action.style) btn.style.cssText=action.style;
      btn.onclick=()=>{
        const ta=item.querySelector('textarea');
        const start=ta.selectionStart, end=ta.selectionEnd;
        const sel=ta.value.slice(start,end);
        let newText, newCursor;
        if(action.wrap){
          const [open,close]=action.wrap;
          newText=ta.value.slice(0,start)+open+sel+close+ta.value.slice(end);
          newCursor=start+open.length+sel.length+close.length;
        } else {
          // prefix: insert at start of line
          const lineStart=ta.value.lastIndexOf('\n',start-1)+1;
          newText=ta.value.slice(0,lineStart)+action.prefix+ta.value.slice(lineStart);
          newCursor=start+action.prefix.length;
        }
        ta.value=newText; block.content=newText;
        ta.focus(); ta.setSelectionRange(newCursor,newCursor);
        preview.textContent=(block.content||'').slice(0,50)||'(empty)';
      };
      toolbar.appendChild(btn);
    });
    body.appendChild(toolbar);

    const ta=el('textarea','ed-textarea text-toolbar-ta'); ta.value=block.content||''; ta.placeholder='Text content… supports **bold**, *italic*, ## Heading, 1. lists, - bullets';
    ta.oninput=e=>{block.content=e.target.value; preview.textContent=(block.content||'').slice(0,50)||'(empty)';};
    body.appendChild(ta);
    const hint=el('div','text-hint'); hint.textContent='Markdown: ## H2  ### H3  1. ordered  - bullet  **bold**  *italic*  `code`';
    body.appendChild(hint);
  }

  else if(block.type==='line'){
    const lIn=el('input','ed-input'); lIn.placeholder='Label e.g. Advance — main line'; lIn.value=block.label||'';
    lIn.oninput=e=>{block.label=e.target.value; preview.textContent=block.label||'Unnamed line';};
    body.appendChild(lIn);

    const pIn=el('input','ed-input'); pIn.placeholder='Popularity e.g. 66%'; pIn.value=block.popularity||'';
    pIn.oninput=e=>{block.popularity=e.target.value;};
    body.appendChild(pIn);

    body.appendChild(buildMovesEditor(block, _parentMoves || []));
  }

  else if(block.type==='tabs'){
    body.appendChild(buildTabsEditor(block,()=>{preview.textContent='Tabs: '+(block.tabs||[]).map(t=>t.label).join(', ');},depth,_parentMoves||[]));
  }

  item.appendChild(body);
  return item;
}

// ─── Moves editor ─────────────────────────────────────────────────────
function buildMovesEditor(block, parentMoves){
  if(!block.moves) block.moves=[];
  const wrap=el('div','');
  wrap.style.cssText='display:flex;flex-direction:column;gap:8px;';

  const sanLabel=el('div','ed-label');
  sanLabel.textContent='Moves (SAN updates automatically from board clicks)';
  wrap.appendChild(sanLabel);

  const lineRow=el('div','editor-line-row');
  const sanBox=el('input','ed-input ed-mono');
  sanBox.value=(block.moves||[]).map(m=>m.san).filter(Boolean).join(' ');
  sanBox.placeholder='e4 c6 d4 d5 exd5 cxd5 c4 Nf6';
  sanBox.style.cssText='font-size:12px;letter-spacing:.03em;';
  lineRow.appendChild(sanBox);

  if(parentMoves && parentMoves.length > 0){
    const inheritBtn = el('button','ed-board-btn');
    inheritBtn.textContent = '⬆ Inherit';
    inheritBtn.title = 'Prepend moves from the previous tab';
    inheritBtn.style.cssText = 'flex-shrink:0;font-size:11px;padding:5px 10px;white-space:nowrap;';
    inheritBtn.onclick = () => {
      const parentSan  = parentMoves.map(m => m.san).filter(Boolean).join(' ');
      const currentSan = sanBox.value.trim();
      // Only prepend if current doesn't already start with parent moves
      const newVal = currentSan.startsWith(parentSan)
        ? currentSan
        : (parentSan + (currentSan ? ' ' + currentSan : ''));
      sanBox.value = newVal;
      sanBox.dispatchEvent(new Event('input'));
      sanBox.focus();
    };
    lineRow.appendChild(inheritBtn);
  }
  const engineBox=el('div','engine-line-box');
  const engineLabel=el('div','engine-line-label'); engineLabel.textContent='Engine line';
  const engineValue=el('div','engine-line-value empty'); engineValue.textContent='Waiting for a valid position.';
  engineBox.appendChild(engineLabel);
  engineBox.appendChild(engineValue);
  lineRow.appendChild(engineBox);
  wrap.appendChild(lineRow);

  const cmtLabel=el('div','ed-label');
  cmtLabel.style.marginTop='4px';
  cmtLabel.textContent='Annotations (optional)';
  wrap.appendChild(cmtLabel);

  const cmtList=el('div','');
  cmtList.style.cssText='display:flex;flex-direction:column;gap:3px;';

  function refreshComments(){
    cmtList.innerHTML='';
    (block.moves||[]).forEach((mv,mi)=>{
      const row=el('div','');
      row.style.cssText='display:grid;grid-template-columns:60px 1fr;gap:5px;align-items:center;';
      const lbl=el('span','');
      lbl.style.cssText='font-size:10px;color:var(--muted2);font-family:monospace;text-align:right;padding-right:4px;';
      lbl.textContent=Math.floor(mi/2+1)+(mi%2===0?'w':'b')+' '+mv.san;
      const cmtIn=el('input','ed-input');
      cmtIn.value=mv.comment||'';
      cmtIn.placeholder='annotation…';
      cmtIn.style.fontSize='12px';
      cmtIn.oninput=e=>{mv.comment=e.target.value;};
      row.appendChild(lbl);
      row.appendChild(cmtIn);
      cmtList.appendChild(row);
    });
  }

  sanBox.oninput=e=>{
    const tokens=e.target.value.trim().split(/\s+/).filter(Boolean);
    const oldMoves=block.moves||[];
    block.moves=tokens.map((san,i)=>({ san, comment: oldMoves[i]?.comment||'' }));
    engineValue.textContent = tokens.length ? 'Updating engine line�' : 'Waiting for a valid position.';
    engineValue.classList.add('empty');
    refreshComments();
  };

  function updateEngineLine(payload, fen){
    const line = pvToSan(fen, payload?.pv || []);
    engineValue.textContent = line || 'No principal variation yet.';
    engineValue.classList.toggle('empty', !line);
  }

  wrap.appendChild(buildEditorBoardInput(block,sanBox,refreshComments,updateEngineLine));
  wrap.appendChild(cmtList);
  refreshComments();
  return wrap;
}

// ─── Tabs editor ─────────────────────────────────────────────────────
function buildTabsEditor(block, onchange, _depth, _parentMoves){
  if(!block.tabs) block.tabs=[];
  const depth = _depth || 0;
  const wrap=el('div',''); wrap.style.cssText=`display:flex;flex-direction:column;gap:4px;`;

  function redrawTabs(){
    wrap.innerHTML='';
    block.tabs.forEach((tab,ti)=>{
      const tabItem=el('div','tab-ed-item');

      const tHead=el('div','tab-ed-head');
      const togBtn=el('button','icobtn tab-tog'); togBtn.textContent='▶'; togBtn.title='Expand/collapse';
      const tabLblIn=el('input','ed-input tab-ed-label'); tabLblIn.value=tab.label||''; tabLblIn.placeholder='Tab label';
      tabLblIn.oninput=e=>{tab.label=e.target.value;if(onchange)onchange();};
      const tabActions=el('div','bitem-actions');
      const upBtn=makeIconBtn('↑',''); upBtn.onclick=()=>{if(ti>0){[block.tabs[ti-1],block.tabs[ti]]=[block.tabs[ti],block.tabs[ti-1]];redrawTabs();}};
      const dnBtn=makeIconBtn('↓',''); dnBtn.onclick=()=>{if(ti<block.tabs.length-1){[block.tabs[ti],block.tabs[ti+1]]=[block.tabs[ti+1],block.tabs[ti]];redrawTabs();}};
      const delBtn=makeIconBtn('✕','Remove tab'); delBtn.classList.add('del');
      delBtn.onclick=()=>{block.tabs.splice(ti,1);redrawTabs();if(onchange)onchange();};
      tabActions.appendChild(upBtn); tabActions.appendChild(dnBtn); tabActions.appendChild(delBtn);
      tHead.appendChild(togBtn); tHead.appendChild(tabLblIn); tHead.appendChild(tabActions);

      const tBody=el('div','tab-ed-body'); tBody.style.display='none';

      // Toggle expand/collapse
      togBtn.onclick=()=>{
        const open = tBody.style.display !== 'none';
        tBody.style.display = open ? 'none' : '';
        togBtn.textContent = open ? '▶' : '▼';
      };

      // Nested blocks inside this tab
      if(!tab.blocks) tab.blocks=[];
      const nestedWrap=el('div','blocks-list'); nestedWrap.style.marginBottom='4px';
      function refreshNested(){
        nestedWrap.innerHTML='';
        const thisTabLineMoves = (tab.blocks||[]).find(b=>b.type==='line')?.moves || [];
        // If this tab has its own line, use it as context for nested tabs; otherwise pass the ancestor context down.
        const contextForChildren = thisTabLineMoves.length ? thisTabLineMoves : (_parentMoves||[]);
        tab.blocks.forEach((b,bi)=>{
          const movesToPass = b.type==='tabs' ? contextForChildren : (_parentMoves||[]);
          nestedWrap.appendChild(buildBlockItem(b,bi,tab.blocks,refreshNested,depth+1,movesToPass));
        });
      }
      refreshNested();
      tBody.appendChild(nestedWrap);

      const addRow=el('div','add-block-row');
      ['text','line','tabs'].forEach(type=>{
        const btn=el('button','add-block-btn'); btn.textContent='+ '+type;
        btn.onclick=()=>{addBlock(tab.blocks,type,refreshNested);};
        addRow.appendChild(btn);
      });
      tBody.appendChild(addRow);

      tabItem.appendChild(tHead); tabItem.appendChild(tBody);
      wrap.appendChild(tabItem);
    });

    const addTabBtn=el('button','add-row-btn'); addTabBtn.textContent='+ Add tab';
    addTabBtn.onclick=()=>{block.tabs.push({label:'New Tab',blocks:[]});redrawTabs();if(onchange)onchange();};
    wrap.appendChild(addTabBtn);
  }

  redrawTabs();
  return wrap;
}

function addBlock(blockArr, type, refresh){
  if(type==='text') blockArr.push({type:'text',content:''});
  if(type==='line') blockArr.push({type:'line',label:'',popularity:'',moves:[]});
  if(type==='tabs') blockArr.push({type:'tabs',tabs:[{label:'Tab 1',blocks:[]}]});
  refresh();
}

// ─── Save entry ──────────────────────────────────────────────────────
function getActiveMainTabs(){
  const active = [];
  document.querySelectorAll('#smain .tab-btn.active').forEach(btn=>{
    active.push(btn.textContent.trim());
  });
  return active;
}

function restoreMainTabs(labels){
  if(!labels.length) return;
  labels.forEach(label=>{
    const btn = Array.from(document.querySelectorAll('#smain .tab-btn'))
      .find(b => b.textContent.trim() === label);
    if(btn) btn.click();
  });
}

function getOpenTabLabels(){
  const open = [];
  document.querySelectorAll('#editor-panel .tab-ed-head').forEach(head=>{
    const togBtn = head.querySelector('.tab-tog');
    if(togBtn && togBtn.textContent === '▼'){
      const lbl = head.querySelector('.tab-ed-label')?.value;
      if(lbl) open.push(lbl);
    }
  });
  return open;
}

function restoreOpenTabs(labels){
  if(!labels.length) return;
  document.querySelectorAll('#editor-panel .tab-ed-head').forEach(head=>{
    const lbl = head.querySelector('.tab-ed-label')?.value;
    if(lbl && labels.includes(lbl)){
      const togBtn = head.querySelector('.tab-tog');
      if(togBtn && togBtn.textContent === '▶'){
        togBtn.click();
      }
    }
  });
}

function saveEd(){
  if(!edEntry.title.trim()){ toast('Title required','err'); return; }
  if(!edEntry.id) edEntry.id='entry-'+Date.now();
  const candidate=JSON.parse(JSON.stringify(LINES));
  const savedIdx=edIdx===null?candidate.length:edIdx;
  if(edIdx===null) candidate.push(edEntry);
  else candidate[edIdx]=edEntry;
  try {
    LINES=normalizeTheoryData(candidate);
  } catch(err) {
    toast('Cannot save entry: '+err.message,'err');
    return;
  }
  markUnsaved();
  const openTabs = getOpenTabLabels();
  const activeMainTabs = getActiveMainTabs();
  const editorScrollY = document.getElementById('editor-panel')?.querySelector('.ed-body')?.scrollTop || 0;
  const mainScrollY = document.getElementById('smain').scrollTop;
  renderView();
  requestAnimationFrame(()=>{
    restoreMainTabs(activeMainTabs);
    openEd(savedIdx);
    requestAnimationFrame(()=>{ requestAnimationFrame(()=>{
      document.getElementById('smain').scrollTop = mainScrollY;
      restoreOpenTabs(openTabs);
      const edBody = document.getElementById('editor-panel')?.querySelector('.ed-body');
      if(edBody) edBody.scrollTop = editorScrollY;
    });});
  });
  toast('Entry saved — remember to export JSON','ok');
}

// ─── Raw JSON modal ──────────────────────────────────────────────────
function openJsonModal(){
  const returnFocus=document.activeElement;
  const backdrop=el('div','json-modal-backdrop');
  const modal=el('div','json-modal');
  modal.setAttribute('role','dialog');
  modal.setAttribute('aria-modal','true');
  modal.setAttribute('aria-labelledby','json-modal-title');
  const head=el('div','json-modal-head');
  head.innerHTML=`<span class="json-modal-title" id="json-modal-title">Edit raw JSON</span>`;
  const close=()=>{backdrop.remove();returnFocus?.focus();};
  const xBtn=el('button','ed-close'); xBtn.textContent='✕'; xBtn.setAttribute('aria-label','Close JSON editor'); xBtn.onclick=close;
  head.appendChild(xBtn);
  modal.appendChild(head);

  const body=el('div','json-modal-body');
  const ta=document.createElement('textarea');
  ta.setAttribute('aria-label','Opening notebook JSON');
  ta.value=JSON.stringify(LINES,null,2);
  body.appendChild(ta); modal.appendChild(body);

  const errDiv=el('div','json-err'); modal.appendChild(errDiv);

  const foot=el('div','json-modal-foot');
  const cancelBtn=el('button','edbtn sm'); cancelBtn.textContent='Cancel'; cancelBtn.onclick=close;
  const applyBtn=el('button','edbtn primary sm'); applyBtn.textContent='Apply';
  applyBtn.onclick=()=>{
    try{
      const parsed=JSON.parse(ta.value);
      replaceTheoryData(parsed); markUnsaved(); backdrop.remove();
      toast('JSON applied','ok');
    } catch(e){ errDiv.textContent='Error: '+e.message; }
  };
  foot.appendChild(cancelBtn); foot.appendChild(applyBtn);
  modal.appendChild(foot);

  backdrop.appendChild(modal);
  document.body.appendChild(backdrop);
  backdrop.addEventListener('click',e=>{if(e.target===backdrop)close();});
  backdrop.addEventListener('keydown',e=>{
    trapDialogFocus(e,backdrop);
    if(e.key==='Escape') close();
  });
  ta.focus();
}

// ─── Helpers ─────────────────────────────────────────────────────────
function el(tag,cls){ const e=document.createElement(tag); if(cls) e.className=cls; return e; }
function makeIconBtn(txt,title){ const b=el('button','icobtn'); b.textContent=txt; b.title=title; return b; }
function esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
function toast(msg,type=''){const t=document.getElementById('toast');t.textContent=msg;t.className='toast show'+(type?' '+type:'');clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove('show'),2800);}

// ─── Global arrow key navigation ─────────────────────────────────────
window.addEventListener('keydown', e=>{
  if(e.key==='ArrowLeft' || e.key==='ArrowRight'){
    if(e.defaultPrevented) return;
    if(e.target?.closest('button,input,textarea,select,[role="tab"],[contenteditable="true"]')) return;
    if(window._activeGoto){
      e.preventDefault();
      window._activeGoto(e.key==='ArrowLeft' ? -1 : 1);
    }
  }
});

// ─── Header buttons ──────────────────────────────────────────────────
document.getElementById('new-btn').addEventListener('click',()=>openEd(null));
document.getElementById('toggle-btn').addEventListener('click',()=>{
  if(edOpen) closeEd();
  else if(LINES.length>0) openEd(0);
  else openEd(null);
});
document.getElementById('brilliant-top-btn').addEventListener('click',()=>openBrilliantMoveFinder());

// Warn before leaving with unsaved changes
window.addEventListener('beforeunload',e=>{ if(unsaved){ e.preventDefault(); e.returnValue=''; } });

// ─── Map ─────────────────────────────────────────────────────────────
const NODE_COLORS = ['#988CAD','#8a9bb5','#4a9d6f','#df8533','#ca3431'];

// Heatmap color scale: cool (sparse) -> warm (dense)
// blue -> teal -> green -> yellow -> orange -> red
function heatColor(t){
  // t = 0..1, 0=cold/sparse, 1=hot/dense
  const stops = [
    [0.0,  [80, 120, 200]],   // cool blue
    [0.25, [80, 180, 180]],   // teal
    [0.5,  [80, 180, 100]],   // green
    [0.7,  [220, 180, 50]],   // yellow
    [0.85, [230, 120, 40]],   // orange
    [1.0,  [210, 50,  50]],   // red
  ];
  let i=0;
  while(i < stops.length-2 && t > stops[i+1][0]) i++;
  const a=stops[i], b=stops[i+1];
  const f=(t-a[0])/(b[0]-a[0]);
  const r=Math.round(a[1][0]+(b[1][0]-a[1][0])*f);
  const g=Math.round(a[1][1]+(b[1][1]-a[1][1])*f);
  const bl=Math.round(a[1][2]+(b[1][2]-a[1][2])*f);
  return `rgb(${r},${g},${bl})`;
}

function countVariations(blocks){
  let count = 0;
  for(const b of blocks||[]){
    if(b.type==='tabs'){ count += b.tabs.length; for(const t of b.tabs) count += countVariations(t.blocks||[]); }
    if(b.type==='line') count++;
  }
  return count;
}

function buildMapNodes(){
  const nodes=[], links=[];
  let id=0;
  function addNode(label, parentId, depth, navId){
    const nid=id++;
    const varCount = 0;
    nodes.push({id:nid, label, depth, parentId, navId, varCount});
    if(parentId!==null) links.push({source:parentId, target:nid});
    return nid;
  }
  function walkBlocks(blocks, parentId, depth){
    for(const b of blocks||[]){
      if(b.type==='tabs'){
        for(const t of b.tabs){
          const varCount = countVariations(t.blocks||[]);
          const nid = addNode(t.label, parentId, depth, t._navId||null);
          nodes[nid].varCount = varCount;
          walkBlocks(t.blocks||[], nid, depth+1);
        }
      }
    }
  }
  for(const entry of LINES){
    const varCount = countVariations(entry.blocks||[]);
    const rootId = addNode(entry.title, null, 0, null);
    nodes[rootId].varCount = varCount;
    nodes[rootId].entryId = entry.id;
    walkBlocks(entry.blocks||[], rootId, 1);
  }
  return {nodes, links};
}

function layoutNodes(nodes, links){
  const W = document.getElementById('map-canvas-wrap').clientWidth || 1200;
  const H = document.getElementById('map-canvas-wrap').clientHeight || 800;

  // Tag every node with its entry root id
  const roots = nodes.filter(n => n.depth === 0);
  function tagEntry(nid, entryId){
    nodes[nid].entryId = entryId;
    nodes.filter(n => n.parentId === nid).forEach(c => tagEntry(c.id, entryId));
  }
  roots.forEach(r => tagEntry(r.id, r.id));

  // Place entry clusters far apart — grid if many, else spread on a large circle
  const cols  = Math.ceil(Math.sqrt(roots.length));
  const rows  = Math.ceil(roots.length / cols);
  const cellW = W / cols;
  const cellH = H / rows;
  const clusterCenters = {};
  roots.forEach((root, ri) => {
    const col = ri % cols, row = Math.floor(ri / cols);
    const cx = cellW * col + cellW / 2;
    const cy = cellH * row + cellH / 2;
    clusterCenters[root.id] = { cx, cy };
    root.x = cx; root.y = cy; root.vx = 0; root.vy = 0;
  });

  // Place children in a tight radial burst around their cluster center
  function placeChildren(parentId, angle, spread){
    const children = nodes.filter(n => n.parentId === parentId);
    const p = nodes[parentId];
    children.forEach((c, ci) => {
      const a = angle + (ci - (children.length - 1) / 2) * spread;
      const d = 100 + c.depth * 60;
      c.x = p.x + Math.cos(a) * d + (Math.random() - 0.5) * 40;
      c.y = p.y + Math.sin(a) * d + (Math.random() - 0.5) * 40;
      c.vx = 0; c.vy = 0;
      placeChildren(c.id, a, Math.max(0.2, spread * 0.55));
    });
  }
  roots.forEach((root, ri) => {
    const startAngle = (ri / Math.max(roots.length, 1)) * Math.PI * 2;
    placeChildren(root.id, startAngle, Math.PI * 0.9);
  });

  // Simulation
  for(let iter = 0; iter < 400; iter++){
    const cool = Math.max(0.1, 1 - iter / 450);

    // Repulsion — cross-entry repulsion is much stronger to keep clusters separate
    for(let i = 0; i < nodes.length; i++){
      for(let j = i + 1; j < nodes.length; j++){
        const ni = nodes[i], nj = nodes[j];
        const dx = ni.x - nj.x, dy = ni.y - nj.y;
        const dist = Math.sqrt(dx*dx + dy*dy) || 1;
        const crossEntry = ni.entryId !== nj.entryId;
        const strength = crossEntry
          ? 80000 / (dist * dist)   // strong inter-cluster repulsion
          :  5000 / (dist * dist);  // normal intra-cluster repulsion
        const fx = dx/dist*strength, fy = dy/dist*strength;
        ni.vx += fx; ni.vy += fy;
        nj.vx -= fx; nj.vy -= fy;
      }
    }

    // Attraction along links (only intra-cluster links exist)
    links.forEach(l => {
      const a = nodes[l.source], b = nodes[l.target];
      const dx = b.x - a.x, dy = b.y - a.y;
      const dist = Math.sqrt(dx*dx + dy*dy) || 1;
      const ideal = 90 + b.depth * 35;
      const force = (dist - ideal) * 0.05;
      const fx = dx/dist*force, fy = dy/dist*force;
      a.vx += fx; a.vy += fy;
      b.vx -= fx; b.vy -= fy;
    });

    // Each node is pulled gently toward its cluster center
    nodes.forEach(n => {
      const c = clusterCenters[n.entryId];
      if(!c) return;
      n.vx += (c.cx - n.x) * 0.004;
      n.vy += (c.cy - n.y) * 0.004;
    });

    nodes.forEach(n => {
      n.x += n.vx * cool; n.y += n.vy * cool;
      n.vx *= 0.8; n.vy *= 0.8;
    });
  }
}

function computeStats(){
  let totalLines=0, totalMoves=0, totalTabs=0, totalText=0, maxDepth=0, maxBranch=0, maxBranchLabel='';
  const depthCounts={};

  function walkBlocks(blocks, depth){
    for(const b of blocks||[]){
      if(b.type==='line'){
        totalLines++;
        totalMoves+=(b.moves||[]).length;
      }
      if(b.type==='text') totalText++;
      if(b.type==='tabs'){
        const n=b.tabs.length;
        totalTabs+=n;
        if(n>maxBranch){ maxBranch=n; maxBranchLabel=b.tabs.map(t=>t.label).join(', ').slice(0,40); }
        for(const t of b.tabs) walkBlocks(t.blocks||[], depth+1);
      }
      maxDepth=Math.max(maxDepth,depth);
      depthCounts[depth]=(depthCounts[depth]||0)+1;
    }
  }

  for(const entry of LINES) walkBlocks(entry.blocks||[], 1);

  const avgMoves = totalLines ? (totalMoves/totalLines).toFixed(1) : 0;
  const totalNodes = Object.values(depthCounts).reduce((a,b)=>a+b,0);

  return { totalLines, totalMoves, totalTabs, totalText, maxDepth, avgMoves, maxBranch, maxBranchLabel, totalNodes, depthCounts };
}

function renderStats(){
  const s = computeStats();
  const el2 = (tag,cls,txt)=>{ const e=document.createElement(tag); if(cls)e.className=cls; if(txt!==undefined)e.textContent=txt; return e; };
  const wrap = document.getElementById('stats-content');
  wrap.innerHTML='';

  function statRow(label, value, highlight=false){
    const row=el2('div','stat-row'+(highlight?' stat-highlight':''));
    row.appendChild(el2('span','stat-label',label));
    row.appendChild(el2('span','stat-value',value));
    return row;
  }

  // Overview group
  const g1=el2('div','stat-group');
  g1.appendChild(el2('div','stat-group-label','Overview'));
  g1.appendChild(statRow('Entries',LINES.length, true));
  g1.appendChild(statRow('Theory lines',s.totalLines, true));
  g1.appendChild(statRow('Total moves',s.totalMoves, true));
  wrap.appendChild(g1);

  // Structure group
  const g2=el2('div','stat-group');
  g2.appendChild(el2('div','stat-group-label','Structure'));
  g2.appendChild(statRow('Total tabs',s.totalTabs));
  g2.appendChild(statRow('Text blocks',s.totalText));
  g2.appendChild(statRow('Max depth',s.maxDepth+' levels'));
  g2.appendChild(statRow('Avg moves/line',s.avgMoves));
  g2.appendChild(statRow('Most branched',s.maxBranch+' tabs'));
  wrap.appendChild(g2);

  // Depth distribution bars
  const g3=el2('div','stat-group');
  g3.appendChild(el2('div','stat-group-label','Depth distribution'));
  const maxCount = Math.max(...Object.values(s.depthCounts||{1:1}));
  Object.entries(s.depthCounts).sort((a,b)=>+a[0]-+b[0]).forEach(([depth,count])=>{
    const barWrap=el2('div','stat-bar-wrap');
    const lbl=el2('div','stat-bar-label');
    lbl.innerHTML=`<span>Level ${depth}</span><span>${count} blocks</span>`;
    const bar=el2('div','stat-bar');
    const fill=el2('div','stat-bar-fill');
    fill.style.width=`${(count/maxCount)*100}%`;
    bar.appendChild(fill); barWrap.appendChild(lbl); barWrap.appendChild(bar);
    g3.appendChild(barWrap);
  });
  wrap.appendChild(g3);

  // Fun fact
  const g4=el2('div','stat-group');
  g4.appendChild(el2('div','stat-group-label','Fun fact'));
  const funFacts = [
    `If you played every line back to back that's ${s.totalMoves} moves of theory.`,
    `Your deepest variation goes ${s.maxDepth} levels deep.`,
    `You've written ${s.totalText} annotation blocks.`,
    `Average line is ${s.avgMoves} moves long.`,
    `Most branched point has ${s.maxBranch} options.`,
  ];
  const fact=el2('div','stat-fun', funFacts[Math.floor(Math.random()*funFacts.length)]);
  g4.appendChild(fact);
  wrap.appendChild(g4);
}

function renderMap(){
  const svg = document.getElementById('map-svg');
  svg.innerHTML='';
  const ns='http://www.w3.org/2000/svg';

  const {nodes, links} = buildMapNodes();
  layoutNodes(nodes, links);

  // Pan/zoom state
  let panX=0, panY=0, scale=1;
  let isPanning=false, startX=0, startY=0;

  const g = document.createElementNS(ns,'g');
  g.setAttribute('id','map-g');
  svg.appendChild(g);

  function applyTransform(){ g.setAttribute('transform',`translate(${panX},${panY}) scale(${scale})`); }

  const svgEl = svg;
  window.mapFocusNavId = function(navId){
    const node = nodes.find(n => String(n.navId) === String(navId));
    if(!node) return;
    const W = svgEl.clientWidth || 1200;
    const H = svgEl.clientHeight || 800;
    scale = 1.8;
    panX = W/2 - node.x * scale;
    panY = H/2 - node.y * scale;
    applyTransform();
    // Flash highlight
    const grpEl = svgEl.querySelector(`[data-nav-id="${navId}"]`);
    if(grpEl){
      grpEl.style.filter='drop-shadow(0 0 12px #a594c0)';
      setTimeout(()=>{ grpEl.style.filter=''; }, 1200);
    }
  };

  // Draw links
  const maxVar2 = Math.max(1, ...nodes.map(n=>n.varCount));
  links.forEach(l=>{
    const a=nodes[l.source], b=nodes[l.target];
    const line=document.createElementNS(ns,'line');
    line.setAttribute('x1',a.x); line.setAttribute('y1',a.y);
    line.setAttribute('x2',b.x); line.setAttribute('y2',b.y);
    const t = Math.min(1, a.varCount/maxVar2);
    const col = heatColor(t);
    line.setAttribute('stroke', col);
    line.setAttribute('stroke-opacity','0.25');
    line.setAttribute('stroke-width','1.5');
    g.appendChild(line);
  });

  // Draw nodes — compute max varCount for normalization
  const maxVar = Math.max(1, ...nodes.map(n=>n.varCount));

  nodes.forEach(n=>{
    // Heat based on varCount relative to max
    const t = n.depth===0 ? Math.min(1, n.varCount/maxVar) : Math.min(1, n.varCount/maxVar);
    const color = heatColor(t);
    // Size: root nodes bigger, also scale slightly with varCount
    const baseR = n.depth===0 ? 22 : Math.max(7, 15 - n.depth*1.5);
    const r = Math.min(baseR + Math.sqrt(n.varCount)*1.2, baseR*1.8);

    const grp = document.createElementNS(ns,'g');
    grp.setAttribute('class','map-node');
    grp.setAttribute('transform',`translate(${n.x},${n.y})`);
    if(n.navId) grp.setAttribute('data-nav-id', n.navId);

    // Glow circle
    const glow = document.createElementNS(ns,'circle');
    glow.setAttribute('r', r+4);
    glow.setAttribute('fill', color);
    glow.setAttribute('opacity','0.12');
    grp.appendChild(glow);

    // Main circle
    const circle = document.createElementNS(ns,'circle');
    circle.setAttribute('r', r);
    circle.setAttribute('fill', color);
    circle.setAttribute('opacity','0.9');
    grp.appendChild(circle);

    // Label
    const label = document.createElementNS(ns,'text');
    label.setAttribute('text-anchor','middle');
    label.setAttribute('dy', r+13);
    label.setAttribute('fill','#bababa');
    label.setAttribute('font-size', n.depth===0?'12':'10');
    label.setAttribute('font-family','Noto Sans, sans-serif');
    // Truncate long labels
    const maxLen = 24;
    label.textContent = n.label.length > maxLen ? n.label.slice(0,maxLen)+'…' : n.label;
    grp.appendChild(label);

    // Variation count badge
    if(n.varCount > 0){
      const badge = document.createElementNS(ns,'text');
      badge.setAttribute('text-anchor','middle');
      badge.setAttribute('dy','4');
      badge.setAttribute('fill','#fff');
      badge.setAttribute('font-size','9');
      badge.setAttribute('font-weight','700');
      badge.setAttribute('font-family','Noto Sans Mono, monospace');
      badge.textContent = n.varCount;
      grp.appendChild(badge);
    }

    // Click to navigate
    grp.addEventListener('click',()=>{
      document.getElementById('map-overlay').classList.remove('open');
      if(n.entryId){
        document.getElementById(n.entryId)?.scrollIntoView({behavior:'smooth'});
      } else if(n.navId){
        activateNavLeaf(n.navId);
      }
    });

    // Drag node
    let dragging=false, dx=0, dy=0;
    grp.addEventListener('mousedown',e=>{
      e.stopPropagation();
      dragging=true;
      dx=e.clientX/scale-n.x; dy=e.clientY/scale-n.y;
    });
    window.addEventListener('mousemove',e=>{
      if(!dragging)return;
      n.x=e.clientX/scale-dx; n.y=e.clientY/scale-dy;
      grp.setAttribute('transform',`translate(${n.x},${n.y})`);
      // Update links
      g.querySelectorAll('line').forEach((line,i)=>{
        const l=links[i];
        if(!l)return;
        const a=nodes[l.source],b=nodes[l.target];
        line.setAttribute('x1',a.x);line.setAttribute('y1',a.y);
        line.setAttribute('x2',b.x);line.setAttribute('y2',b.y);
      });
    });
    window.addEventListener('mouseup',()=>{ dragging=false; });

    g.appendChild(grp);
  });

  // Pan
  const wrap = document.getElementById('map-canvas-wrap');
  wrap.addEventListener('mousedown',e=>{
    isPanning=true; startX=e.clientX-panX; startY=e.clientY-panY;
    wrap.classList.add('dragging');
  });
  window.addEventListener('mousemove',e=>{
    if(!isPanning)return;
    panX=e.clientX-startX; panY=e.clientY-startY;
    applyTransform();
  });
  window.addEventListener('mouseup',()=>{ isPanning=false; wrap.classList.remove('dragging'); });

  // Zoom
  wrap.addEventListener('wheel',e=>{
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    scale = Math.max(0.2, Math.min(3, scale*delta));
    applyTransform();
  },{passive:false});

  applyTransform();
}

let mapReturnFocus = null;
document.getElementById('map-btn').addEventListener('click',()=>{
  mapReturnFocus = document.activeElement;
  document.getElementById('map-overlay').classList.add('open');
  renderStats();
  renderMap();
  document.getElementById('map-close').focus();
});
document.getElementById('map-close').addEventListener('click',()=>{
  document.getElementById('map-overlay').classList.remove('open');
  mapReturnFocus?.focus();
});

// ─── Boot ────────────────────────────────────────────────────────────
renderView();

// ─── Homepage ────────────────────────────────────────────────────────
const ECO_SOURCE_URL = 'https://raw.githubusercontent.com/hayatbiralem/eco.json/master/eco_interpolated.json';
const ECO_FALLBACK = [
  { code:'A00', name:'Irregular openings', moves:'1. Nh3' },
  { code:'A01', name:'Nimzowitsch-Larsen Attack', moves:'1. b3' },
  { code:'A02', name:'Bird Opening', moves:'1. f4' },
  { code:'A40', name:"Queen's Pawn Game", moves:'1. d4' },
  { code:'B12', name:'Caro-Kann Defense', moves:'1. e4 c6' },
  { code:'B20', name:'Sicilian Defence', moves:'1. e4 c5' },
  { code:'C20', name:"King's Pawn Game", moves:'1. e4 e5' },
  { code:'C50', name:'Italian Game', moves:'1. e4 e5 2. Nf3 Nc6 3. Bc4' },
  { code:'C60', name:'Ruy Lopez', moves:'1. e4 e5 2. Nf3 Nc6 3. Bb5' },
  { code:'D00', name:"Queen's Pawn Game", moves:'1. d4 d5' }
];
let ECO_CACHE = null;
let ECO_LOAD_PROMISE = null;

function normalizeEcoText(text){
  return String(text || '').replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' ').trim();
}

async function loadEcoEntries(force=false){
  if(ECO_CACHE && !force) return ECO_CACHE;
  if(ECO_LOAD_PROMISE && !force) return ECO_LOAD_PROMISE;

  if(typeof fetch !== 'function'){
    ECO_CACHE = ECO_FALLBACK.slice();
    const added = ensureEcoEntries(ECO_CACHE);
    if(added){ renderView(); }
    return ECO_CACHE;
  }

  ECO_LOAD_PROMISE = fetch(ECO_SOURCE_URL)
    .then(res => {
      if(!res.ok) throw new Error('ECO source unavailable');
      return res.json();
    })
    .then(data => {
      const seen = new Set();
      const entries = Object.values(data || {})
        .map(item => ({
          code: String(item?.eco || '').trim().toUpperCase(),
          name: normalizeEcoText(item?.name || ''),
          moves: normalizeEcoText(item?.moves || '')
        }))
        .filter(entry => entry.code && entry.moves)
        .filter(entry => {
          const key = [entry.code, entry.name, entry.moves].join('|');
          if(seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      if(!entries.length) throw new Error('No ECO entries found');
      ECO_CACHE = entries;
      return entries;
    })
    .catch(() => {
      ECO_CACHE = ECO_FALLBACK.slice();
      return ECO_CACHE;
    })
    .finally(() => {
      ECO_LOAD_PROMISE = null;
    });

  return ECO_LOAD_PROMISE;
}

function renderEcoList(entries, query=''){
  const list = document.getElementById('eco-list');
  const status = document.getElementById('eco-status');
  if(!list || !status) return;

  const groups = groupEcoEntries(entries);
  const q = normalizeEcoText(query).toLowerCase();
  const filtered = !q ? groups : groups.filter(group => {
    const hay = [group.code, group.name, ...group.rows.map(row => `${row.name} ${row.moves}`)].join(' ').toLowerCase();
    return hay.includes(q);
  });

  list.innerHTML = '';
  if(!filtered.length){
    status.textContent = q ? 'No ECO entries matched that search.' : 'No ECO entries available.';
    return;
  }

  status.textContent = `${filtered.length} ECO entries ${q ? 'matched' : 'loaded'}.`;
  filtered.slice(0, 250).forEach(group => {
    const card = document.createElement('div');
    card.style.cssText = 'padding:16px;background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius);display:flex;flex-direction:column;gap:10px;';
    const title = group.name ? `${group.code} — ${group.name}` : group.code;
    const openingCount = buildEcoEntriesForGroup(group).length;
    const countLabel = `${openingCount} opening${openingCount === 1 ? '' : 's'}`;
    const titleEl = document.createElement('div');
    titleEl.style.cssText = 'font-size:13px;font-weight:700;color:var(--text2);line-height:1.4;';
    titleEl.textContent = title;
    const countEl = document.createElement('div');
    countEl.style.cssText = 'font-size:11px;color:var(--muted);';
    countEl.textContent = countLabel;
    const descriptionEl = document.createElement('div');
    descriptionEl.style.cssText = 'font-size:12px;color:var(--muted);line-height:1.7;';
    descriptionEl.textContent = 'Generate opening entries for this ECO code and open the first page.';
    card.append(titleEl, countEl, descriptionEl);
    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';
    const addBtn = document.createElement('button');
    addBtn.className = 'hbtn';
    addBtn.type = 'button';
    addBtn.style.fontSize = '11px';
    addBtn.textContent = 'Open page';
    addBtn.onclick = ()=>{
      importEcoGroup(group);
    };
    actions.appendChild(addBtn);
    card.appendChild(actions);
    list.appendChild(card);
  });

  if(filtered.length > 250){
    const more = document.createElement('div');
    more.style.cssText = 'grid-column:1 / -1;font-size:12px;color:var(--muted);padding:4px 2px;';
    more.textContent = `Showing first 250 of ${filtered.length} matching ECO entries. Refine your search to narrow it down.`;
    list.appendChild(more);
  }
}

async function ensureEcoList(force=false){
  const status = document.getElementById('eco-status');
  if(status) status.textContent = force ? 'Reloading ECO list…' : 'Loading ECO list…';
  try {
    const entries = await loadEcoEntries(force);
    renderEcoList(entries, document.getElementById('eco-search')?.value || '');
    const usingFallback = entries.length === ECO_FALLBACK.length && entries.every((entry, idx) => entry.code === ECO_FALLBACK[idx]?.code);
    if(status && usingFallback) status.textContent = 'Loaded fallback ECO entries.';
  } catch(err){
    ECO_CACHE = ECO_FALLBACK.slice();
    renderEcoList(ECO_CACHE, document.getElementById('eco-search')?.value || '');
    if(status) status.textContent = 'Loaded fallback ECO entries.';
  }
}

let contributorsReturnFocus = null;
function openContributors(){
  contributorsReturnFocus = document.activeElement;
  document.getElementById('contributors-overlay').style.display = 'flex';
  document.getElementById('contributors-close').focus();
}
function closeContributors(){
  document.getElementById('contributors-overlay').style.display = 'none';
  contributorsReturnFocus?.focus();
}

const contributorsBtn = document.getElementById('contributors-btn');

if(contributorsBtn) contributorsBtn.addEventListener('click', openContributors);

// ─── Settings ────────────────────────────────────────────────────────
const SETTINGS_KEY = 'ost_settings';
const DEFAULTS = { sq: 56, textSize: 15 };

function loadSettings(){
  try {
    const parsed=JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}');
    return {
      sq: Math.max(32,Math.min(80,Number(parsed.sq)||DEFAULTS.sq)),
      textSize: Math.max(12,Math.min(22,Number(parsed.textSize)||DEFAULTS.textSize)),
    };
  }
  catch(e){ return {...DEFAULTS}; }
}
function saveSettings(s){
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); return true; }
  catch(e){ toast('Settings could not be saved in this browser','err'); return false; }
}

function applySettings(s){
  const configured=Math.max(32,Math.min(80,Number(s.sq)||DEFAULTS.sq));
  const available=Math.max(24,Math.floor((document.documentElement.clientWidth-62)/8));
  const squareSize=window.matchMedia('(max-width: 768px)').matches?Math.min(configured,available):configured;
  document.documentElement.style.setProperty('--sq', squareSize + 'px');
  document.documentElement.style.setProperty('--text-size', s.textSize + 'px');
}

function openSettings(){
  const s = loadSettings();
  const overlay = document.getElementById('settings-overlay');
  if(overlay.style.display !== 'flex') overlay._returnFocus = document.activeElement;
  overlay.style.display = 'flex';

  const slider = document.getElementById('sq-slider');
  const sqVal  = document.getElementById('sq-val');
  slider.value = s.sq;
  sqVal.textContent = s.sq + 'px';
  slider.oninput = () => {
    sqVal.textContent = slider.value + 'px';
    const ns = loadSettings(); ns.sq = parseInt(slider.value); saveSettings(ns); applySettings(ns);
  };

  const txtSlider = document.getElementById('txt-slider');
  const txtVal    = document.getElementById('txt-val');
  txtSlider.value = s.textSize;
  txtVal.textContent = s.textSize + 'px';
  txtSlider.oninput = () => {
    txtVal.textContent = txtSlider.value + 'px';
    const ns = loadSettings(); ns.textSize = parseInt(txtSlider.value); saveSettings(ns); applySettings(ns);
  };
  document.getElementById('settings-close').focus();
}
function closeSettings(){
  const overlay = document.getElementById('settings-overlay');
  overlay.style.display = 'none';
  overlay._returnFocus?.focus();
}
function resetSettings(){ saveSettings({...DEFAULTS}); applySettings(DEFAULTS); openSettings(); }

document.getElementById('settings-btn').addEventListener('click', openSettings);

// Apply saved settings on boot
applySettings(loadSettings());
let settingsResizeFrame=0;
window.addEventListener('resize',()=>{
  cancelAnimationFrame(settingsResizeFrame);
  settingsResizeFrame=requestAnimationFrame(()=>applySettings(loadSettings()));
},{passive:true});
