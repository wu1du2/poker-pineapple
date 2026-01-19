import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, '../dist')));

const SUITS = ['♠', '♥', '♣', '♦'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

class Deck {
  cards: any[] = [];
  constructor() { this.reset(); }
  reset() {
    this.cards = [];
    for (let s of SUITS) for (let r of RANKS) 
      this.cards.push({ suit: s, rank: r, color: (s === '♥' || s === '♦') ? 'red' : 'black', id: s+r });
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
  }
  deal() { return this.cards.pop(); }
}

const deck = new Deck();

const SEAT_COUNT = 6;

const gameState = {
  seats: new Array(SEAT_COUNT).fill(null) as any[],
  communityCards: [] as any[],
  dealerIndex: -1,
  billboard: "公告板 (点击编辑)",
  phase: 'PREFLOP'
};

io.on('connection', (socket: Socket) => {
  socket.emit('init', getPublicState());

  // --- 新增：会话恢复机制 ---
  socket.on('restore-session', (token) => {
    if (!token) return;
    let found = false;
    gameState.seats.forEach((seat, index) => {
      // 如果找到该 Token 对应的座位，更新 Socket ID
      if (seat && seat.token === token) {
        seat.id = socket.id; // 关键：更新为最新的 Socket ID
        found = true;
        // 告诉前端：你已经找回了这个座位
        socket.emit('session-restored', { seatIndex: index });
      }
    });
    if (found) {
      console.log(`Player restored session: ${token} -> ${socket.id}`);
      io.emit('update', getPublicState());
    }
  });

  // --- 修改：入座时绑定 Token ---
  socket.on('sit', ({ name, seatIndex, token }) => {
    if (!gameState.seats[seatIndex]) {
      const isFirstPlayer = gameState.seats.every(s => s === null);
      gameState.seats[seatIndex] = {
        id: socket.id,
        token: token, // 绑定 Token
        name,
        score: 0, 
        hand: [], 
        slots: { 1: [], 2: [], 3: [] },
        shownSlots: [],
        isFolded: false,
        isShowing: false,
        isReady: false 
      };
      if (isFirstPlayer) gameState.dealerIndex = seatIndex;
      io.emit('update', getPublicState());
    }
  });

  socket.on('update-name', ({ seatIndex, name }) => {
    const p = gameState.seats[seatIndex];
    if (p) {
      p.name = name.substring(0, 12);
      io.emit('update', getPublicState());
    }
  });

  socket.on('update-score', ({ seatIndex, score }) => {
    const p = gameState.seats[seatIndex];
    if (p) {
      const val = parseInt(score);
      if (!isNaN(val)) {
        p.score = val;
        io.emit('update', getPublicState());
      }
    }
  });

  socket.on('update-billboard', (text) => {
    gameState.billboard = text;
    io.emit('update', getPublicState());
  });

  socket.on('fold', ({ seatIndex }) => {
    const p = gameState.seats[seatIndex];
    // 增加 ID 校验，防止旧连接操作
    if (p && p.id === socket.id) {
      p.isFolded = true;
      io.emit('update', getPublicState());
    }
  });

  socket.on('show-hand', ({ seatIndex }) => {
    const p = gameState.seats[seatIndex];
    if (p && p.id === socket.id) {
      p.isShowing = true; 
      io.emit('update', getPublicState());
    }
  });

  socket.on('show-slot', ({ seatIndex, slotId }) => {
    const p = gameState.seats[seatIndex];
    if (p && p.id === socket.id) {
      if (!p.shownSlots.includes(slotId)) {
        p.shownSlots.push(slotId);
        io.emit('update', getPublicState());
      }
    }
  });

  socket.on('move-card', ({ seatIndex, cardId, target }) => {
    const p = gameState.seats[seatIndex];
    // 严格校验 ID
    if (!p || p.id !== socket.id) return; 

    let sourceLocation = 'hand';
    let cardIndex = p.hand.findIndex((c: any) => c.id === cardId);
    let card = null;

    if (cardIndex !== -1) {
      card = p.hand[cardIndex];
    } else {
      for (let i = 1; i <= 3; i++) {
        const idx = p.slots[i].findIndex((c: any) => c.id === cardId);
        if (idx !== -1) {
          sourceLocation = `slot-${i}`;
          card = p.slots[i][idx];
          cardIndex = idx;
          break;
        }
      }
    }

    if (!card) return; 

    if (target === 'hand') {
      if (sourceLocation === 'hand') return; 
      const slotNum = parseInt(sourceLocation.split('-')[1]);
      p.slots[slotNum].splice(cardIndex, 1);
      p.hand.push(card);
    } 
    else {
      const slotNum = parseInt(target);
      if (isNaN(slotNum) || slotNum < 1 || slotNum > 3) return;
      if (p.slots[slotNum].length >= 2) return;

      if (sourceLocation === 'hand') {
        p.hand.splice(cardIndex, 1);
      } else {
        const srcSlot = parseInt(sourceLocation.split('-')[1]);
        p.slots[srcSlot].splice(cardIndex, 1);
      }
      p.slots[slotNum].push(card);
    }

    io.emit('update', getPublicState());
  });

  socket.on('control', (action) => {
    if (action === 'new-game') {
      deck.reset();
      gameState.communityCards = [];
      
      let nextIdx = gameState.dealerIndex;
      let loopCount = 0;
      do {
        nextIdx = (nextIdx + 1) % SEAT_COUNT;
        loopCount++;
      } while (!gameState.seats[nextIdx] && loopCount < SEAT_COUNT);
      if (gameState.seats[nextIdx]) gameState.dealerIndex = nextIdx;

      gameState.seats.forEach(p => {
        if (p) {
          p.hand = [];
          for(let i=0; i<7; i++) p.hand.push(deck.deal());
          p.slots = { 1: [], 2: [], 3: [] };
          p.shownSlots = []; 
          p.isFolded = false;
          p.isShowing = false;
          p.isReady = false;
        }
      });

      gameState.communityCards.push(deck.deal(), deck.deal(), deck.deal());
      io.emit('update', getPublicState());
    } 
    else if (action === 'deal-turn') {
      gameState.communityCards.push(deck.deal());
      io.emit('update', getPublicState());
    }
    else if (action === 'deal-river') {
      gameState.communityCards.push(deck.deal());
      io.emit('update', getPublicState());
    }
  });

  socket.on('hard-reset', () => {
      deck.reset();
      gameState.communityCards = [];
      gameState.dealerIndex = -1;
      gameState.seats = new Array(SEAT_COUNT).fill(null);
      gameState.billboard = "公告板 (点击编辑)";
      io.emit('update', getPublicState());
      io.emit('force-reload');
    });

  socket.on('get-my-hand', (seatIndex, callback) => {
      const p = gameState.seats[seatIndex];
      // 这里的 p.id 已经是 restore-session 更新过的最新 ID
      if (p && p.id === socket.id) {
        callback({ hand: p.hand, slots: p.slots });
      } else {
        callback({ hand: [], slots: { 1: [], 2: [], 3: [] } });
      }
  });

  // 新增：处理Ready事件
  socket.on('ready', ({ seatIndex, ready }) => {
    const p = gameState.seats[seatIndex];
    if (p && p.id === socket.id) {
      p.isReady = ready;
      io.emit('update', getPublicState());
      
      // 检查所有玩家是否都Ready
      const allReady = gameState.seats.every(seat => seat === null || seat.isReady);
      if (allReady) {
        io.emit('all-players-ready');
      }
    }
  });
});

function getPublicState() {
  return {
    ...gameState,
    seats: gameState.seats.map(s => {
      if (!s) return null;
      
      const publicSlots: any = { 1: [], 2: [], 3: [] };
      for (let i = 1; i <= 3; i++) {
        const isSlotShown = s.isShowing || (s.shownSlots && s.shownSlots.includes(i));
        if (isSlotShown) {
          publicSlots[i] = s.slots[i];
        } else {
          publicSlots[i] = new Array(s.slots[i].length).fill({ id: 'hidden' }); 
        }
      }

      return { 
        ...s, 
        token: undefined, // 关键：不要把 token 广播给其他人
        hand: s.isShowing ? s.hand : null,
        slots: publicSlots,
        shownSlots: s.shownSlots || []
      };
    })
  };
}

httpServer.listen(3000, () => console.log('Server running on 3000'));
