import axios from 'axios';
import CryptoJS from 'crypto-js';

export const API_KEY =
  process.env.REACT_APP_API_KEY ||
  process.env.API_KEY ||
  '';
export const API_SECRET =
  process.env.REACT_APP_SECRET_KEY ||
  process.env.REACT_APP_API_SECRET ||
  process.env.SECRET_KEY ||
  '';

export const SPOT_BASE_URL = '/api';
export const FUTURES_BASE_URL = '/fapi';

const spotClient = axios.create({ baseURL: SPOT_BASE_URL, timeout: 10000 });
const futuresClient = axios.create({ baseURL: FUTURES_BASE_URL, timeout: 10000 });

// recvWindow lớn để chịu được network lag, nhưng không quá 60000 (Binance limit)
const RECV_WINDOW = 10000;
const MAX_RETRIES = 2;

const WATCH_SYMBOLS = [
  'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'XRPUSDT',
  'DOGEUSDT', 'ADAUSDT', 'AVAXUSDT', 'DOTUSDT', 'LINKUSDT',
  'MATICUSDT', 'UNIUSDT', 'LTCUSDT', 'ATOMUSDT', 'NEARUSDT',
];

const intervalMap = {
  1: '1m', 3: '3m', 5: '5m', 15: '15m', 30: '30m',
  60: '1h', 120: '2h', 240: '4h', 360: '6h', 720: '12h',
  D: '1d', W: '1w', M: '1M',
};

// ─────────────────────────────────────────────────────────────────────────────
//  CLOCK SYNC
//  Vấn đề gốc: Date.now() của trình duyệt có thể lệch server vài giây.
//  Giải pháp: đo offset = serverTime - localTime, cộng vào mỗi timestamp gửi đi.
//  Chi tiết fix so với version cũ:
//    1. timestamp được tạo NGAY LÚC gửi request (không phải lúc build config)
//       → tránh bị stale nếu request bị delay/queue
//    2. Signature được ký CÙNG LÚC với timestamp đó
//       → đảm bảo timestamp trong QS và trong signature luôn khớp nhau
//    3. Median filter 3 samples → loại nhiễu network jitter
//    4. Auto re-sync mỗi 5 phút + khi tab refocus (sau khi máy ngủ)
// ─────────────────────────────────────────────────────────────────────────────

const clockSync = {
  offset: 0,
  ready: false,
  syncing: false,
  lastSyncAt: 0,
  STALE_MS: 5 * 60 * 1000,
  SAMPLES: 3,

  async _measureOnce() {
    const t0 = Date.now();
    const { data } = await axios.get('/api/v3/time', { timeout: 4000 });
    const t1 = Date.now();
    return data.serverTime - Math.floor((t0 + t1) / 2);
  },

  async sync(force = false) {
    const stale = Date.now() - this.lastSyncAt > this.STALE_MS;
    if (!force && !stale && this.ready) return this.offset;

    // Nếu đang sync → đợi xong rồi trả offset mới, không sync song song
    if (this.syncing) {
      await new Promise(res => {
        const t = setInterval(() => { if (!this.syncing) { clearInterval(t); res(); } }, 80);
      });
      return this.offset;
    }

    this.syncing = true;
    try {
      const samples = [];
      for (let i = 0; i < this.SAMPLES; i++) {
        try { samples.push(await this._measureOnce()); } catch { /* bỏ qua sample lỗi */ }
        if (i < this.SAMPLES - 1) await new Promise(r => setTimeout(r, 150));
      }
      if (samples.length === 0) throw new Error('All samples failed');

      // Median → loại outlier (spike latency)
      samples.sort((a, b) => a - b);
      const median = samples[Math.floor(samples.length / 2)];

      if (this.ready && Math.abs(median - this.offset) > 10_000) {
        console.warn(`[ClockSync] Drift >10s detected (${median - this.offset}ms). Máy vừa thức dậy?`);
      }

      this.offset = median;
      this.ready = true;
      this.lastSyncAt = Date.now();
      console.log(`[ClockSync] OK — offset=${median}ms | samples=[${samples.join(', ')}]ms`);
      return this.offset;
    } catch (e) {
      console.warn('[ClockSync] Sync failed, giữ offset cũ:', e.message);
      return this.offset;
    } finally {
      this.syncing = false;
    }
  },

  now() { return Date.now() + this.offset; },

  syncIfStale() {
    if (Date.now() - this.lastSyncAt > this.STALE_MS) {
      this.sync().catch(() => {});
    }
  },
};

clockSync.sync().catch(() => {});
setInterval(() => clockSync.sync().catch(() => {}), 5 * 60 * 1000);
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      console.log('[ClockSync] Tab active — force re-sync...');
      clockSync.sync(true).catch(() => {});
    }
  });
}

export const syncTime = () => clockSync.sync(true);

const lotSizeCache = new Map();

async function getLotSize(symbol, category = 'spot') {
  const key = `${category}:${symbol}`;
  if (lotSizeCache.has(key)) return lotSizeCache.get(key);

  const url = category === 'linear'
    ? '/fapi/v1/exchangeInfo'
    : '/api/v3/exchangeInfo';

  const { data } = await axios.get(url, { params: { symbol }, timeout: 8000 });
  const info = data.symbols?.find(s => s.symbol === symbol);
  const lot  = info?.filters?.find(f => f.filterType === 'LOT_SIZE');
  const price = info?.filters?.find(f => f.filterType === 'PRICE_FILTER');

  const result = {
    stepSize:  parseFloat(lot?.stepSize  || '0.00001'),
    minQty:    parseFloat(lot?.minQty    || '0.00001'),
    maxQty:    parseFloat(lot?.maxQty    || '9000'),
    tickSize:  parseFloat(price?.tickSize || '0.01'),
  };
  lotSizeCache.set(key, result);
  return result;
}

function floorToStep(value, step) {
  if (!step || step === 0) return value;
  const precision = Math.round(-Math.log10(step));
  const factor = Math.pow(10, precision);
  return Math.floor(parseFloat(value) * factor) / factor;
}

function clientFor(category = 'spot') {
  return category === 'linear' ? futuresClient : spotClient;
}

function sign(queryString) {
  return CryptoJS.HmacSHA256(queryString, API_SECRET).toString();
}

function cleanParams(params = {}) {
  return Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== undefined && v !== '' && v !== null)
  );
}

async function signedRequest(category, method, path, params = {}, retryCount = 0) {
  const client = clientFor(category);

  if (!clockSync.ready) await clockSync.sync();
  clockSync.syncIfStale();

  const buildSignedConfig = () => {
    const base = cleanParams({ ...params, recvWindow: RECV_WINDOW });

    const timestamp = clockSync.now();
    const payload = { ...base, timestamp };
    const qs = Object.entries(payload)
      .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
      .join('&');

    const signature = sign(qs);

    return {
      method,
      url: path,
      params: { ...payload, signature },
      headers: { 'X-MBX-APIKEY': API_KEY },
    };
  };
  try {
    const { data } = await client.request(buildSignedConfig());
    return data;
  } catch (error) {
    const code = error?.response?.data?.code;

    if (code === -1021 && retryCount < MAX_RETRIES) {
      console.warn(`[Binance] -1021 timestamp error, retry ${retryCount + 1}/${MAX_RETRIES}`);
      await clockSync.sync(true);
      return signedRequest(category, method, path, params, retryCount + 1);
    }

    throw error;
  }
}

function ok(result)   { return { retCode: 0, retMsg: 'OK', result }; }
function fail(error)  {
  const d = error?.response?.data;
  console.error('[Binance]', d || error?.message);
  return { retCode: d?.code || -1, retMsg: d?.msg || error?.message || 'Unknown error', result: {} };
}

function normalizeTicker(t = {}) {
  return {
    symbol:       t.symbol || t.s,
    lastPrice:    t.lastPrice || t.c,
    price24hPcnt: String((parseFloat(t.priceChangePercent ?? t.P ?? 0) || 0) / 100),
    highPrice24h: t.highPrice || t.h,
    lowPrice24h:  t.lowPrice  || t.l,
    volume24h:    t.volume    || t.v,
    turnover24h:  t.quoteVolume || t.q,
  };
}

function normalizeSide(side) {
  return side === 'BUY' ? 'Buy' : side === 'SELL' ? 'Sell' : side;
}

function normalizeType(type) {
  if (!type) return type;
  return type.charAt(0).toUpperCase() + type.slice(1).toLowerCase()
    .replace(/_(.)/g, (_, c) => c.toUpperCase());
}

function normalizeStatus(status) {
  const map = {
    NEW: 'New', PARTIALLY_FILLED: 'PartiallyFilled', FILLED: 'Filled',
    CANCELED: 'Cancelled', CANCELLED: 'Cancelled',
    REJECTED: 'Rejected', EXPIRED: 'Cancelled',
  };
  return map[status] || status;
}

function normalizeOrder(o = {}) {
  return {
    symbol:      o.symbol,
    orderId:     String(o.orderId),
    side:        normalizeSide(o.side),
    orderType:   normalizeType(o.type),
    price:       o.price,
    qty:         o.origQty,
    cumExecQty:  o.executedQty,
    avgPrice:    o.avgPrice,
    orderStatus: normalizeStatus(o.status),
    createdTime: String(o.time || o.updateTime || Date.now()),
    takeProfit:  '',
    stopLoss:    '',
  };
}

export const getKline = async (symbol, interval = '15', limit = 300, category = 'spot') => {
  const client = clientFor(category);
  const path = category === 'linear' ? '/v1/klines' : '/v3/klines';
  const { data } = await client.get(path, {
    params: { symbol, interval: intervalMap[interval] || interval, limit },
  });
  return ok({ list: data.map(([t, o, h, l, c, v]) => [String(t), o, h, l, c, v]) });
};

export const getAllTickers = async (category = 'spot') => {
  const client = clientFor(category);
  const path = category === 'linear' ? '/v1/ticker/24hr' : '/v3/ticker/24hr';
  const { data } = await client.get(path);
  return ok({ list: data.map(normalizeTicker) });
};

export const getTicker = async (symbol, category = 'spot') => {
  const client = clientFor(category);
  const path = category === 'linear' ? '/v1/ticker/24hr' : '/v3/ticker/24hr';
  const { data } = await client.get(path, { params: { symbol } });
  return ok({ list: [normalizeTicker(data)] });
};

export const getWalletBalance = async () => {
  const [spot, futures] = await Promise.allSettled([
    signedRequest('spot', 'GET', '/v3/account'),
    signedRequest('linear', 'GET', '/v2/account'),
  ]);

  const map = new Map();
  let spotUsdtWallet = 0;
  if (spot.status === 'fulfilled') {
    (spot.value?.balances || []).forEach(b => {
      const equity = parseFloat(b.free || 0) + parseFloat(b.locked || 0);
      if (equity <= 0) return;
      if (b.asset === 'USDT') spotUsdtWallet = equity;
      map.set(b.asset, {
        coin: b.asset,
        equity: String(equity),
        walletBalance: String(equity),
        availableToWithdraw: b.free,
        unrealisedPnl: '0',
      });
    });
  }

  let futuresEquity = 0;
  let futuresPnl = 0;
  if (futures.status === 'fulfilled') {
    futuresEquity = parseFloat(futures.value?.totalWalletBalance || 0);
    futuresPnl = parseFloat(futures.value?.totalUnrealizedProfit || 0);
    (futures.value?.assets || []).forEach(a => {
      const wb = parseFloat(a.walletBalance || 0);
      const av = parseFloat(a.availableBalance || 0);
      const upnl = parseFloat(a.unrealizedProfit || 0);
      if (wb === 0 && av === 0 && upnl === 0) return;
      const cur = map.get(a.asset) || { coin: a.asset };
      map.set(a.asset, {
        ...cur,
        equity:              String((parseFloat(cur.equity || 0) + wb + upnl).toFixed(8)),
        walletBalance:       String((parseFloat(cur.walletBalance || 0) + wb).toFixed(8)),
        availableToWithdraw: String((parseFloat(cur.availableToWithdraw || 0) + av).toFixed(8)),
        unrealisedPnl:       String((parseFloat(cur.unrealisedPnl || 0) + upnl).toFixed(8)),
      });
    });
  }

  return ok({
    list: [{
      totalEquity:  String((spotUsdtWallet + futuresEquity + futuresPnl).toFixed(8)),
      totalPerpUPL: String(futuresPnl.toFixed(8)),
      coin: [...map.values()],
    }],
  });
};

export const getPositions = async (category = 'linear') => {
  if (category !== 'linear') return ok({ list: [] });
  try {
    const data = await signedRequest('linear', 'GET', '/v2/positionRisk');
    return ok({
      list: data.map(p => {
        const amount = parseFloat(p.positionAmt || 0);
        return {
          symbol: p.symbol,
          side: amount >= 0 ? 'Buy' : 'Sell',
          size: String(Math.abs(amount)),
          avgPrice: p.entryPrice,
          markPrice: p.markPrice,
          liqPrice: p.liquidationPrice,
          unrealisedPnl: p.unRealizedProfit,
          curRealisedPnl: '',
          takeProfit: '',
          stopLoss: '',
        };
      }),
    });
  } catch (e) {
    return fail(e);
  }
};

export const getOpenOrders = async (category = 'spot', symbol = '') => {
  try {
    const path = category === 'linear' ? '/v1/openOrders' : '/v3/openOrders';
    const data = await signedRequest(category, 'GET', path, symbol ? { symbol } : {});
    return ok({ list: data.map(normalizeOrder) });
  } catch (e) {
    return fail(e);
  }
};

export const getOrderHistory = async (category = 'spot', limit = 100) => {
  const path = category === 'linear' ? '/v1/allOrders' : '/v3/allOrders';
  const rows = await Promise.all(
    WATCH_SYMBOLS.map(symbol =>
      signedRequest(category, 'GET', path, { symbol, limit: Math.min(limit, 100) })
        .then(list => list.map(normalizeOrder))
        .catch(() => [])
    )
  );
  return ok({
    list: rows.flat()
      .sort((a, b) => parseInt(b.createdTime || 0) - parseInt(a.createdTime || 0))
      .slice(0, limit),
  });
};

export const getTradeHistory = async (category = 'spot', limit = 100) => {
  const path = category === 'linear' ? '/v1/userTrades' : '/v3/myTrades';
  const rows = await Promise.all(
    WATCH_SYMBOLS.map(symbol =>
      signedRequest(category, 'GET', path, { symbol, limit: Math.min(limit, 100) })
        .then(list => list)
        .catch(() => [])
    )
  );
  return ok({ list: rows.flat().slice(0, limit) });
};

export const placeOrder = async (params) => {
  const category = params.category === 'linear' ? 'linear' : 'spot';
  const isMarket = params.orderType === 'Market';

  const { stepSize, minQty, maxQty, tickSize } = await getLotSize(params.symbol, category);
  const quantity = floorToStep(params.qty, stepSize);

  if (quantity < minQty) {
    return fail({ message: `Quantity ${quantity} < minQty ${minQty}` });
  }
  if (quantity > maxQty) {
    return fail({ message: `Quantity ${quantity} > maxQty ${maxQty}` });
  }

  const price = isMarket ? undefined : floorToStep(params.price, tickSize);

  const payload = {
    symbol: params.symbol,
    side: params.side.toUpperCase(),
    type: params.orderType.toUpperCase(),
    quantity,
    ...(isMarket ? {} : { timeInForce: params.timeInForce || 'GTC', price }),
  };

  const path = category === 'linear' ? '/v1/order' : '/v3/order';
  try {
    const data = await signedRequest(category, 'POST', path, payload);
    return ok({ orderId: String(data.orderId), ...normalizeOrder(data) });
  } catch (e) {
    return fail(e);
  }
};

export const cancelOrder = async (category, symbol, orderId) => {
  const path = category === 'linear' ? '/v1/order' : '/v3/order';
  try {
    const data = await signedRequest(category, 'DELETE', path, { symbol, orderId: Number(orderIdn )});
    return ok({ orderId: String(data.orderId), ...normalizeOrder(data) });
  } catch (e) {
    return fail(e);
  }
};

export const setLeverage = async (symbol, buyLev) => {
  try {
    const data = await signedRequest('linear', 'POST', '/v1/leverage', {
      symbol,
      leverage: buyLev,
      });
    return ok(data);
  } catch (e) {
    return fail(e);
  }
};

export const startFuturesListenKey = async () => {
  const { data } = await futuresClient.post('/v1/listenKey', null, {
    headers: { 'X-MBX-APIKEY': API_KEY },
  });
  return data.listenKey;
};

export const keepAliveFuturesListenKey = async (listenKey) => {
  return futuresClient.put('/v1/listenKey', null, {
    params: { listenKey },
    headers: { 'X-MBX-APIKEY': API_KEY },
  });
};

export const createSpotWsAuthParams = () => {
  const timestamp = clockSync.now();  // dùng offset đã hiệu chỉnh
  const payload   = `apiKey=${API_KEY}&timestamp=${timestamp}`;
  const signature = CryptoJS.HmacSHA256(payload, API_SECRET).toString();
  return { apiKey: API_KEY, timestamp, signature };
};