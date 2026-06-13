import { startFuturesListenKey, keepAliveFuturesListenKey, createSpotWsAuthParams } from './binance';

const WS_PUBLIC_SPOT = 'wss://demo-stream.binance.com/stream';
const WS_PUBLIC_LINEAR = 'wss://demo-fstream.binance.com/stream';
const WS_PRIVATE_SPOT = 'wss://demo-ws-api.binance.com/ws-api/v3';
const WS_PRIVATE_LINEAR = 'wss://demo-fstream.binance.com/ws';

const intervalMap = {
  1: '1m',
  3: '3m',
  5: '5m',
  15: '15m',
  30: '30m',
  60: '1h',
  120: '2h',
  240: '4h',
  360: '6h',
  720: '12h',
  D: '1d',
  W: '1w',
  M: '1M',
};

function normalizeTicker(data = {}) {
  return {
    symbol: data.s,
    lastPrice: data.c,
    price24hPcnt: String((parseFloat(data.P || 0) || 0) / 100),
    highPrice24h: data.h,
    lowPrice24h: data.l,
    volume24h: data.v,
    turnover24h: data.q,
  };
}

function normalizeOrderStatus(status) {
  const map = {
    NEW: 'New',
    PARTIALLY_FILLED: 'PartiallyFilled',
    FILLED: 'Filled',
    CANCELED: 'Cancelled',
    REJECTED: 'Rejected',
    EXPIRED: 'Cancelled',
  };
  return map[status] || status;
}

function normalizeOrder(data = {}) {
  return {
    symbol: data.s,
    orderId: String(data.i),
    side: data.S === 'BUY' ? 'Buy' : 'Sell',
    orderType: data.o ? data.o.charAt(0) + data.o.slice(1).toLowerCase() : '',
    price: data.p,
    qty: data.q,
    cumExecQty: data.z,
    avgPrice: data.L && data.L !== '0' ? data.L : data.p,
    orderStatus: normalizeOrderStatus(data.X),
    createdTime: String(data.O || data.E || Date.now()),
    takeProfit: '',
    stopLoss: '',
  };
}

function normalizeExecution(data = {}) {
  return {
    symbol: data.s,
    side: data.S === 'BUY' ? 'Buy' : 'Sell',
    execQty: data.l,
    execPrice: data.L,
    orderId: String(data.i),
  };
}

function normalizeSpotBalances(B) {
  return (B || [])
    .map(b => {
      const free = parseFloat(b.f || 0);
      const locked = parseFloat(b.l || 0);
      const total = free + locked;
      return {
        coin: b.a,
        equity: String(total),
        walletBalance: String(total),
        availableToWithdraw: String(free),
        unrealisedPnl: '0',
      };
    })
    .filter(c => parseFloat(c.equity) > 0);
}

function normalizeFuturesUpdate(a) {
  const balances = (a?.B || []).map(b => ({
    coin: b.a,
    walletBalance: b.wb || '0',
    availableToWithdraw: b.cw || b.wb || '0',
    unrealisedPnl: '0',
  }));
  const positions = (a?.P || []).map(p => {
    const amount = parseFloat(p.pa || 0);
    return {
      symbol: p.s,
      side: amount >= 0 ? 'Buy' : 'Sell',
      size: String(Math.abs(amount)),
      avgPrice: p.ep,
      markPrice: p.mp,
      liqPrice: '',
      unrealisedPnl: p.up,
      curRealisedPnl: p.cr || '0',
      takeProfit: '',
      stopLoss: '',
    };
  });
  return { balances, positions };
}

class WSManager {
  constructor() {
    this._sockets = {};
    this._handlers = {};
    this._reconnectTimers = {};
    this._subscriptions = {};
    this._privateListenKeys = {};
    this._privateKeepAliveTimers = {};
  }

  _wsKey(category) {
    if (category === 'linear') return 'linear';
    if (category === 'private') return 'private';
    return 'spot';
  }

  _url(key) {
    return key === 'linear' ? WS_PUBLIC_LINEAR : WS_PUBLIC_SPOT;
  }

  _privateUrl(category) {
    // Spot uses WS API endpoint directly; Futures uses listenKey appended later
    return category === 'linear' ? WS_PRIVATE_LINEAR : WS_PRIVATE_SPOT;
  }

  _streamForTopic(topic) {
    if (topic.startsWith('tickers.')) {
      return `${topic.split('.')[1].toLowerCase()}@ticker`;
    }
    if (topic.startsWith('orderbook.')) {
      const [, , symbol] = topic.split('.');
      return `${symbol.toLowerCase()}@depth20@100ms`;
    }
    if (topic.startsWith('kline.')) {
      const [, interval, symbol] = topic.split('.');
      return `${symbol.toLowerCase()}@kline_${intervalMap[interval] || interval}`;
    }
    return topic;
  }

  _topicFromStream(stream, data) {
    const streamSymbol = stream.split('@')[0]?.toUpperCase();
    if (stream.includes('@ticker')) return `tickers.${data.s || streamSymbol}`;
    if (stream.includes('@depth')) return `orderbook.25.${data.s || streamSymbol}`;
    if (stream.includes('@kline_')) return `kline.${this._legacyInterval(data.k?.i)}.${data.s || streamSymbol}`;
    return stream;
  }

  _legacyInterval(interval) {
    const map = { '1m': '1', '3m': '3', '5m': '5', '15m': '15', '30m': '30', '1h': '60', '2h': '120', '4h': '240', '6h': '360', '12h': '720', '1d': 'D', '1w': 'W', '1M': 'M' };
    return map[interval] || interval;
  }

  _normalizeMessage(stream, data) {
    if (stream.includes('@ticker')) {
      return { data: normalizeTicker(data), msg: { type: 'delta' } };
    }
    if (stream.includes('@depth')) {
      return {
        data: { a: data.asks || [], b: data.bids || [], ts: data.E || Date.now() },
        msg: { type: 'snapshot' },
      };
    }
    if (stream.includes('@kline_')) {
      const k = data.k;
      return {
        data: [{
          start: k.t,
          open: k.o,
          high: k.h,
          low: k.l,
          close: k.c,
          volume: k.v,
        }],
        msg: { type: k.x ? 'snapshot' : 'delta' },
      };
    }
    return { data, msg: { type: 'delta' } };
  }

  _getOrCreate(key) {
    if (key === 'private') {
      this._ensurePrivateSockets();
      return null;
    }
    if (this._sockets[key]?.readyState === WebSocket.OPEN) return this._sockets[key];
    if (this._sockets[key]?.readyState === WebSocket.CONNECTING) return this._sockets[key];

    const ws = new WebSocket(this._url(key));
    this._sockets[key] = ws;
    this._subscriptions[key] = this._subscriptions[key] || new Set();

    ws.onopen = () => {
      const streams = [...this._subscriptions[key]].map(topic => this._streamForTopic(topic));
      if (streams.length) {
        ws.send(JSON.stringify({ method: 'SUBSCRIBE', params: streams, id: Date.now() }));
      }
    };

    ws.onmessage = e => {
      try {
        const raw = JSON.parse(e.data);
        if (raw.result === null) return;
        const payload = raw.data || raw;
        const stream = raw.stream || this._inferStream(payload);
        if (!stream) return;
        const topic = this._topicFromStream(stream, payload);
        const handlers = this._handlers[topic];
        if (!handlers) return;
        const { data, msg } = this._normalizeMessage(stream, payload);
        handlers.forEach(fn => fn(data, msg));
      } catch {}
    };

    ws.onclose = () => {
      this._reconnectTimers[key] = setTimeout(() => {
        delete this._sockets[key];
        this._getOrCreate(key);
      }, 2000);
    };

    ws.onerror = () => ws.close();
    return ws;
  }

  _inferStream(data) {
    if (data.e === '24hrTicker') return `${data.s.toLowerCase()}@ticker`;
    if (data.e === 'depthUpdate' || data.lastUpdateId) return `${data.s.toLowerCase()}@depth20@100ms`;
    if (data.e === 'kline') return `${data.s.toLowerCase()}@kline_${data.k?.i}`;
    return '';
  }

  async _ensurePrivateSockets() {
    if (this._sockets.privateSpot || this._sockets.privateLinear) return;
    await Promise.all([
      this._connectPrivate('spot'),
      this._connectPrivate('linear'),
    ]);
  }

  async _connectPrivate(category) {
    const key = category === 'linear' ? 'privateLinear' : 'privateSpot';
    if (this._sockets[key]?.readyState === WebSocket.OPEN || this._sockets[key]?.readyState === WebSocket.CONNECTING) return;

    if (category === 'linear') {
      // Futures: still uses listenKey via REST
      await this._connectPrivateFutures(key);
    } else {
      // Spot: uses WebSocket API auth (no more REST listenKey)
      this._connectPrivateSpot(key);
    }
  }

  _connectPrivateSpot(key) {
    try {
      const ws = new WebSocket(WS_PRIVATE_SPOT);
      this._sockets[key] = ws;

      ws.onopen = () => {
        // Authenticate via userDataStream.subscribe.signature
        const authParams = createSpotWsAuthParams();
        ws.send(JSON.stringify({
          id: `spot-auth-${Date.now()}`,
          method: 'userDataStream.subscribe.signature',
          params: authParams,
        }));
      };

      ws.onmessage = e => {
        try {
          const msg = JSON.parse(e.data);
          // Skip auth response (has 'id' field matching our request)
          if (msg.id && typeof msg.id === 'string' && msg.id.startsWith('spot-auth-')) {
            if (msg.error) {
              console.error('[WS] Spot auth failed:', msg.error);
              ws.close();
            }
            return;
          }
          this._handlePrivateMessage(msg);
        } catch {}
      };

      // WS API sends ping frames; browser handles pong automatically.
      // Also send periodic pong to keep connection alive.
      this._privateKeepAliveTimers[key] = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ id: `ping-${Date.now()}`, method: 'ping' }));
        }
      }, 30 * 1000);

      ws.onclose = () => {
        clearInterval(this._privateKeepAliveTimers[key]);
        this._reconnectTimers[key] = setTimeout(() => {
          delete this._sockets[key];
          this._connectPrivate('spot');
        }, 3000);
      };

      ws.onerror = () => ws.close();
    } catch (e) {
      this._reconnectTimers[key] = setTimeout(() => this._connectPrivate('spot'), 10000);
    }
  }

  async _connectPrivateFutures(key) {
    try {
      const listenKey = await startFuturesListenKey();
      this._privateListenKeys[key] = listenKey;
      const ws = new WebSocket(`${WS_PRIVATE_LINEAR}/${listenKey}`);
      this._sockets[key] = ws;

      this._privateKeepAliveTimers[key] = setInterval(() => {
        keepAliveFuturesListenKey(listenKey).catch(() => {});
      }, 30 * 60 * 1000);

      ws.onmessage = e => {
        try {
          this._handlePrivateMessage(JSON.parse(e.data));
        } catch {}
      };

      ws.onclose = () => {
        clearInterval(this._privateKeepAliveTimers[key]);
        this._reconnectTimers[key] = setTimeout(() => {
          delete this._sockets[key];
          this._connectPrivate('linear');
        }, 3000);
      };

      ws.onerror = () => ws.close();
    } catch (e) {
      this._reconnectTimers[key] = setTimeout(() => this._connectPrivate('linear'), 10000);
    }
  }

  _handlePrivateMessage(msg) {
    // Spot wallet updates
    if (msg.e === 'outboundAccountPosition' || msg.e === 'balanceUpdate') {
      const coins = normalizeSpotBalances(msg.B);
      this._handlers.wallet?.forEach(fn => fn({ kind: 'spotBalances', coins }, { type: 'delta' }));
    }

    // Futures wallet + position updates
    if (msg.e === 'ACCOUNT_UPDATE') {
      const { balances, positions } = normalizeFuturesUpdate(msg.a || {});
      if (balances.length) {
        this._handlers.wallet?.forEach(fn => fn({ kind: 'futuresBalances', balances }, { type: 'delta' }));
      }
      if (positions.length) {
        this._handlers.position?.forEach(fn => fn(positions, { type: 'delta' }));
      }
    }

    if (msg.e === 'executionReport' || msg.e === 'ORDER_TRADE_UPDATE') {
      const raw = msg.e === 'ORDER_TRADE_UPDATE' ? msg.o : msg;
      const order = normalizeOrder(raw);
      this._handlers.order?.forEach(fn => fn([order], { type: 'delta' }));
      if (parseFloat(raw.l || 0) > 0) {
        this._handlers.execution?.forEach(fn => fn([normalizeExecution(raw)], { type: 'delta' }));
      }
    }
  }

  subscribe(category, topic, callback) {
    const key = this._wsKey(category);
    if (!this._handlers[topic]) this._handlers[topic] = new Set();
    this._handlers[topic].add(callback);

    if (!this._subscriptions[key]) this._subscriptions[key] = new Set();
    this._subscriptions[key].add(topic);

    const ws = this._getOrCreate(key);
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ method: 'SUBSCRIBE', params: [this._streamForTopic(topic)], id: Date.now() }));
    }

    return () => this.unsubscribe(category, topic, callback);
  }

  unsubscribe(category, topic, callback) {
    const key = this._wsKey(category);
    this._handlers[topic]?.delete(callback);
    if (!this._handlers[topic]?.size) {
      delete this._handlers[topic];
      this._subscriptions[key]?.delete(topic);
      const ws = this._sockets[key];
      if (ws?.readyState === WebSocket.OPEN && key !== 'private') {
        ws.send(JSON.stringify({ method: 'UNSUBSCRIBE', params: [this._streamForTopic(topic)], id: Date.now() }));
      }
    }
  }

  closeAll() {
    Object.values(this._sockets).forEach(ws => ws?.close());
    Object.values(this._reconnectTimers).forEach(clearTimeout);
    Object.values(this._privateKeepAliveTimers).forEach(clearInterval);
    this._sockets = {};
    this._handlers = {};
    this._subscriptions = {};
    this._privateListenKeys = {};
  }
}

export const wsManager = new WSManager();

export function subOrderbook(symbol, category, cb) {
  const topic = `orderbook.25.${symbol}`;
  return wsManager.subscribe(category, topic, cb);
}

export function subTicker(symbol, category, cb) {
  const topic = `tickers.${symbol}`;
  return wsManager.subscribe(category, topic, cb);
}

export function subKline(symbol, interval, category, cb) {
  const topic = `kline.${interval}.${symbol}`;
  return wsManager.subscribe(category, topic, cb);
}

export function subPrivate(topic, cb) {
  return wsManager.subscribe('private', topic, cb);
}
