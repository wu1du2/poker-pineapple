import express from 'express';
import { createServer } from 'http';
import { Server, Socket } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

// ESM 路径修复
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: "*" } });

// 托管前端
app.use(express.static(path.join(__dirname, '../dist')));

// --- 筹码和公共牌逻辑保持不变 ---
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
    this.cards.sort(() => Math.random() - 0.5);
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
        hand: [], // 这里存放“未分配”的手牌
        slots: { 1: [], 2: [], 3: [] }, // 新增：3个牌槽
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
      p.isShowing = true;
      io.emit('update', getPublicState());
    }
  });

  // --- 新增：卡牌移动逻辑 (手牌 <-> 牌槽) ---
  socket.on('move-card', ({ seatIndex, cardId, target }) => {
    const p = gameState.seats[seatIndex];
    if (!p || p.id !== socket.id) return; // 安全检查

    // 1. 寻找这张牌在哪里 (hand 还是 slots)
    let sourceLocation = 'hand';
    let cardIndex = p.hand.findIndex((c: any) => c.id === cardId);
    let card = null;

    if (cardIndex !== -1) {
      card = p.hand[cardIndex];
    } else {
      // 没在手牌，找找牌槽
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

    if (!card) return; // 没找到牌

    // 2. 执行移动
    // 如果目标是 'hand' (收回手牌)
    if (target === 'hand') {
      if (sourceLocation === 'hand') return; // 已经在手牌了
      // 从牌槽移除
      const slotNum = parseInt(sourceLocation.split('-')[1]);
      p.slots[slotNum].splice(cardIndex, 1);
      // 加回手牌
      p.hand.push(card);
    } 
    // 如果目标是牌槽 (1, 2, 3)
    else {
      const slotNum = parseInt(target);
      if (isNaN(slotNum) || slotNum < 1 || slotNum > 3) return;
      
      // 检查容量：每个牌槽最多2张
      if (p.slots[slotNum].length >= 2) return;

      // 从源头移除
      if (sourceLocation === 'hand') {
        p.hand.splice(cardIndex, 1);
      } else {
        const srcSlot = parseInt(sourceLocation.split('-')[1]);
        p.slots[srcSlot].splice(cardIndex, 1);
      }
      // 加入目标牌槽
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
          // --- 修改：发7张牌 ---
          p.hand = [];
          for(let i=0; i<7; i++) p.hand.push(deck.deal());
          
          // --- 修改：重置牌槽 ---
          p.slots = { 1: [], 2: [], 3: [] };

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
      // 返回手牌和牌槽数据
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
      // 如果亮牌，显示 slots 和 hand；否则隐藏
      // 注意：这里我们假设亮牌后，牌槽和剩余手牌都展示
      return { 
        ...s, 
        hand: s.isShowing ? s.hand : null,
        slots: s.isShowing ? s.slots : { 1: [], 2: [], 3: [] }
      };
    })
  };
}

httpServer.listen(3000, () => console.log('Server running on 3000'));
