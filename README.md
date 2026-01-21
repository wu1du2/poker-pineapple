# 菠萝扑克游戏 (Poker Pineapple)

一个基于 Vue 3 + TypeScript + Vite 开发的在线多人扑克牌游戏应用，支持实时游戏状态同步和会话恢复功能。

## 项目简介

本项目是一个在线菠萝扑克游戏平台，提供以下核心功能：

- **多人在线游戏**：支持最多6人同时游戏
- **实时通信**：基于 Socket.io 实现游戏状态实时同步
- **会话恢复**：玩家断线后可以重新连接恢复游戏会话
- **游戏流程**：完整的扑克游戏流程，包括发牌、翻牌、转牌、河牌等
- **座位管理**：玩家可以选择座位加入游戏
- **游戏控制**：支持新建游戏、发公共牌、重置游戏等功能

## 技术栈

- **前端**：Vue 3 + TypeScript + Vite
- **后端**：Node.js + Express + Socket.io
- **开发工具**：TypeScript、tsx

## 安装和启动

### 环境要求

- Node.js 18.x 或更高版本
- npm 或 yarn 包管理器

### 安装依赖

```bash
# 安装前端和后端依赖
npm install
```

### 启动项目


build
npm install && npm run build

start
npm run server

winget install Cloudflare.cloudflared
cloudflared tunnel --url http://localhost:3000

#### 开发模式

### 访问游戏

启动后，服务在 `http://localhost:3000` 运行。


## 使用说明

1. **加入游戏**：选择一个空位，输入用户名加入游戏
2. **开始游戏**：第一个加入的玩家自动成为庄家，点击"新建游戏"开始
3. **游戏操作**：
   - 每位玩家会获得7张手牌
   - 可以将手牌拖放到3个插槽中进行组合
4. **游戏控制**：
   - 新建游戏：开始新一轮游戏
   - 发转牌/河牌：发放公共牌
   - 重置游戏：清空所有游戏数据

## 项目结构

```
poker-pineapple/
├── src/              # 前端源码
│   ├── components/   # Vue 组件
│   ├── App.vue       # 主应用组件
│   └── main.ts       # 入口文件
├── server/           # 后端源码
│   └── index.ts      # 服务器主文件
├── public/           # 静态资源
├── dist/             # 构建输出
├── package.json      # 项目配置
└── vite.config.ts    # Vite 配置
```

