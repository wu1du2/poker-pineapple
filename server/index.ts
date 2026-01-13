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

const CHIP_VALUES = [1, 5, 25, 100];
const SUITS = ['♠', '♥', '♣', '♦'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

const EXCHANGE_RATES: any = {
  'SPLIT_100': { from: 100, to: 25, cost: 1, gain: 4 },
  'SPLIT_25':  { from: 25,  to: 5,  cost: 1, gain: 5 },
  'SPLIT_5':   { from: 5,   to: 1,  cost: 1, gain: 5 },
  'MERGE_1':   { from: 1,   to: 5,  cost: 5, gain: 1 },
  'MERGE_5':   { from: 5,   to: 25, cost: 5, gain: 1 },
  'MERGE_25':  { from: 25,  to: 100, cost: 4, gain: 1 }
};

class Deck {
  cards: any[] = [];
  constructor() { this.reset(); }
  reset() {
    this.cards = [];
    for (let s of SUITS) for (let r of RANKS) 
      this.cards.push({ suit: s, rank: r, color: (s === '♥' || s === '♦') ? 'red' : 'black', id: s+r });
    // Fisher-Yates 洗牌
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
  pot: { 1: 0, 5: 0, 25: 0, 100: 0 } as any,
  communityCards: [] as any[],
  dealerIndex: -1,
  phase: 'PREFLOP'
};

function moveChip(source: any, target: any, val: number, count = 1) {
  if (source[val] >= count) {
    source[val] -= count;
    if (!target[val]) target[val] = 0;
    target[val] += count;
    return true;
  }
  return false;
}

io.on('connection', (socket: Socket) => {
  socket.emit('init', getPublicState());

  socket.on('sit', ({ name, seatIndex }) => {
    if (!gameState.seats[seatIndex]) {
      const isFirstPlayer = gameState.seats.every(s => s === null);
      gameState.seats[seatIndex] = {
        id: socket.id,
        name,
        buyInCount: 1,
        stack: { 100: 4, 25: 20, 5: 15, 1: 25 }, 
        betArea: { 100: 0, 25: 0, 5: 0, 1: 0 },
        hand: [], 
        slots: { 1: [], 2: [], 3: [] },
        shownSlots: [], // 新增：记录哪些道已经亮出
        isFolded: false,
        isShowing: false // 全亮标志
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

  socket.on('buy-in', ({ seatIndex }) => {
    const p = gameState.seats[seatIndex];
    if (p) {
      const maxChip = 100;
      if (!p.stack[maxChip]) p.stack[maxChip] = 0;
      p.stack[maxChip] += 10;
      if (!p.buyInCount) p.buyInCount = 1;
      p.buyInCount++;
      io.emit('update', getPublicState());
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
      p.isShowing = true; // 全亮
      io.emit('update', getPublicState());
    }
  });

  // --- 新增：单独亮某一道 ---
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

  socket.on('chip-action', ({ action, value, seatIndex }) => {
    const p = gameState.seats[seatIndex];
    if (!p) return;
    if (action === 'BET') moveChip(p.stack, p.betArea, value);
    else if (action === 'RETRIEVE') moveChip(p.betArea, p.stack, value);
    else if (action === 'TAKE_POT') {
      CHIP_VALUES.forEach(v => moveChip(gameState.pot, p.stack, v, gameState.pot[v]));
    }
    io.emit('update', getPublicState());
  });

  socket.on('exchange', ({ seatIndex, type }) => {
    const p = gameState.seats[seatIndex];
    const rule = EXCHANGE_RATES[type];
    if (p && rule) {
      if (p.stack[rule.from] >= rule.cost) {
        p.stack[rule.from] -= rule.cost;
        if(!p.stack[rule.to]) p.stack[rule.to] = 0;
        p.stack[rule.to] += rule.gain;
        io.emit('update', getPublicState());
      }
    }
  });

  socket.on('collect-pot', () => {
    gameState.seats.forEach(p => {
      if (p) CHIP_VALUES.forEach(v => moveChip(p.betArea, gameState.pot, v, p.betArea[v]));
    });
    io.emit('update', getPublicState());
  });

  socket.on('control', (action) => {
    if (action === 'new-game') {
      deck.reset();
      gameState.communityCards = [];
      gameState.pot = { 1: 0, 5: 0, 25: 0, 100: 0 };
      
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
          p.shownSlots = []; // 重置单独亮牌状态
          p.isFolded = false;
          p.isShowing = false;
          CHIP_VALUES.forEach(v => moveChip(p.betArea, p.stack, v, p.betArea[v]));
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
      gameState.pot = { 1: 0, 5: 0, 25: 0, 100: 0 };
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
      
      // 构造 slots 数据：
      // 如果全亮 (isShowing) 或者 该道在 shownSlots 里，则显示真实数据
      // 否则显示空数组（前端渲染为牌背）
      const publicSlots: any = { 1: [], 2: [], 3: [] };
      for (let i = 1; i <= 3; i++) {
        const isSlotShown = s.isShowing || (s.shownSlots && s.shownSlots.includes(i));
        if (isSlotShown) {
          publicSlots[i] = s.slots[i];
        } else {
          // 隐藏状态：只告诉前端有几张牌，不给具体内容
          // 但为了简单，我们这里给空数组，前端根据 length 渲染牌背
          // 注意：为了让前端知道有几张牌背，我们需要构造假对象或者只传长度
          // 这里为了兼容现有前端逻辑，我们传输一个“带长度的空数组”或者“假卡牌”
          // 最简单的做法：直接传真实数据，但把 rank/suit 抹掉？
          // 不，为了安全，我们只传占位符
          publicSlots[i] = new Array(s.slots[i].length).fill({ id: 'hidden' }); 
        }
      }

      return { 
        ...s, 
        hand: s.isShowing ? s.hand : null,
        slots: publicSlots,
        // 把 shownSlots 也传给前端，用于 UI 判断是否高亮
        shownSlots: s.shownSlots || []
      };
    })
  };
}

httpServer.listen(3000, () => console.log('Server running on 3000'));
