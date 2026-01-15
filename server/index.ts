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
const gameState = {
  seats: new Array(9).fill(null) as any[],
  communityCards: [] as any[],
  dealerIndex: -1,
  phase: 'PREFLOP'
};

io.on('connection', (socket: Socket) => {
  socket.emit('init', getPublicState());

  socket.on('sit', ({ name, seatIndex }) => {
    if (!gameState.seats[seatIndex]) {
      const isFirstPlayer = gameState.seats.every(s => s === null);
      gameState.seats[seatIndex] = {
        id: socket.id,
        name,
        score: 0, // 新增：初始积分
        hand: [], 
        slots: { 1: [], 2: [], 3: [] },
        shownSlots: [],
        isFolded: false,
        isShowing: false 
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

  // --- 新增：更新积分事件 ---
  socket.on('update-score', ({ seatIndex, score }) => {
    const p = gameState.seats[seatIndex];
    if (p) {
      // 允许输入负数，转换失败则保持原值
      const val = parseInt(score);
      if (!isNaN(val)) {
        p.score = val;
        io.emit('update', getPublicState());
      }
    }
  });

  socket.on('fold', ({ seatIndex }) => {
    const p = gameState.seats[seatIndex];
    if (p) {
      p.isFolded = true;
      io.emit('update', getPublicState());
    }
  });

  socket.on('show-hand', ({ seatIndex }) => {
    const p = gameState.seats[seatIndex];
    if (p) {
      p.isShowing = true; 
      io.emit('update', getPublicState());
    }
  });

  socket.on('show-slot', ({ seatIndex, slotId }) => {
    const p = gameState.seats[seatIndex];
    if (p) {
      if (!p.shownSlots.includes(slotId)) {
        p.shownSlots.push(slotId);
        io.emit('update', getPublicState());
      }
    }
  });

  socket.on('move-card', ({ seatIndex, cardId, target }) => {
    const p = gameState.seats[seatIndex];
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
        nextIdx = (nextIdx + 1) % 9;
        loopCount++;
      } while (!gameState.seats[nextIdx] && loopCount < 9);
      if (gameState.seats[nextIdx]) gameState.dealerIndex = nextIdx;

      gameState.seats.forEach(p => {
        if (p) {
          p.hand = [];
          for(let i=0; i<7; i++) p.hand.push(deck.deal());
          p.slots = { 1: [], 2: [], 3: [] };
          p.shownSlots = []; 
          p.isFolded = false;
          p.isShowing = false;
        }
      });
      io.emit('update', getPublicState());
    } 
    else if (action === 'deal-flop') {
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
    else if (action === 'hard-reset') {
      deck.reset();
      gameState.communityCards = [];
      gameState.dealerIndex = -1;
      gameState.seats = new Array(9).fill(null);
      io.emit('update', getPublicState());
      io.emit('force-reload');
    }
  });

  socket.on('get-my-hand', (seatIndex, callback) => {
      const p = gameState.seats[seatIndex];
      if (p && p.id === socket.id) {
        callback({ hand: p.hand, slots: p.slots });
      } else {
        callback({ hand: [], slots: { 1: [], 2: [], 3: [] } });
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
        hand: s.isShowing ? s.hand : null,
        slots: publicSlots,
        shownSlots: s.shownSlots || []
      };
    })
  };
}

httpServer.listen(3000, () => console.log('Server running on 3000'));
