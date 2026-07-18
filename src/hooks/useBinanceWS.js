import { useEffect, useRef, useMemo } from 'react';
import { useStore } from '../store';
import { subOrderbook, subTicker, subKline, subPrivate } from '../api/wsManager';
import { getKline, getWalletBalance, getPositions, getOpenOrders } from '../api/binance';
import { mkNotif } from '../store';
import { WATCH_SYMBOLS } from '../constants/symbols';
import { formatPrice } from '../utils/format';

export function useOrderbookWS(symbol, category) {
  const setOrderbook = useStore(s => s.setOrderbook);
  const patchOrderbook = useStore(s => s.patchOrderbook);

  useEffect(() => {
    if (!symbol) return;
    setOrderbook({ a: [], b: [], ts: 0 });

    const unsub = subOrderbook(symbol, category, (data, msg) => {
      if (msg.type === 'snapshot') {
        setOrderbook({ a: data.a || [], b: data.b || [], ts: data.ts || 0 });
      } else {
        patchOrderbook({ a: data.a || [], b: data.b || [], ts: data.ts });
      }
    });
    return unsub;
  }, [symbol, category, setOrderbook, patchOrderbook]);
}

export function useTickerWS(symbol, category) {
  const setTicker = useStore(s => s.setTicker);

  useEffect(() => {
    if (!symbol) return;
    const unsub = subTicker(symbol, category, data => {
      setTicker(symbol, data);
    });
    return unsub;
  }, [symbol, category, setTicker]);
}

export function useAllTickersWS(category) {
  const setTicker = useStore(s => s.setTicker);

  useEffect(() => {
    const unsubs = WATCH_SYMBOLS.map(sym =>
      subTicker(sym, category, data => setTicker(sym, data))
    );
    return () => unsubs.forEach(fn => fn());
  }, [category, setTicker]);
}

// Subscribe tickers for a custom list of symbols (e.g. coins the user actually holds).
// De-dupes against any previously subscribed topics via the WS manager itself.
export function useTickerWSForSymbols(symbols, category) {
  const setTicker = useStore(s => s.setTicker);
  const key = useMemo(
    () => (Array.isArray(symbols) ? [...new Set(symbols)].sort().join('|') : ''),
    [symbols]
  );

  useEffect(() => {
    if (!key) return;
    const list = key.split('|').filter(Boolean);
    const unsubs = list.map(sym =>
      subTicker(sym, category, data => setTicker(sym, data))
    );
    return () => unsubs.forEach(fn => fn());
  }, [key, category, setTicker]);
}

export function useKlineWS(symbol, interval, category, onUpdate) {
  const onUpdateRef = useRef(onUpdate);
  onUpdateRef.current = onUpdate;

  useEffect(() => {
    if (!symbol) return;
    let cancelled = false;

    getKline(symbol, interval, 1000, category === 'linear' ? 'linear' : 'spot').then(res => {
      if (cancelled || !res?.result?.list) return;
      const candles = res.result.list
        .map(([t, o, h, l, c, v]) => ({
          time: parseInt(t) / 1000,
          open: parseFloat(o),
          high: parseFloat(h),
          low: parseFloat(l),
          close: parseFloat(c),
          volume: parseFloat(v),
        }))
        .sort((a, b) => a.time - b.time);
      onUpdateRef.current?.({ type: 'snapshot', candles });
    }).catch(() => {});

    const unsub = subKline(symbol, interval, category, data => {
      if (!data?.[0]) return;
      const k = data[0];
      onUpdateRef.current?.({
        type: 'update',
        candle: {
          time: parseInt(k.start) / 1000,
          open: parseFloat(k.open),
          high: parseFloat(k.high),
          low: parseFloat(k.low),
          close: parseFloat(k.close),
          volume: parseFloat(k.volume),
        },
      });
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, [symbol, interval, category]);
}

export function usePrivateData() {
  const setWallet = useStore(s => s.setWallet);
  const setPositions = useStore(s => s.setPositions);
  const setOpenOrders = useStore(s => s.setOpenOrders);
  const mergeSpotBalances = useStore(s => s.mergeSpotBalances);
  const mergeFuturesBalances = useStore(s => s.mergeFuturesBalances);
  const setCoinUpnl = useStore(s => s.setCoinUpnl);
  const pushNotif = useStore(s => s.pushNotif);

  useEffect(() => {
    async function load() {
      try {
        const [bal, pos, spotOrders, linearOrders] = await Promise.all([
          getWalletBalance(),
          getPositions('linear'),
          getOpenOrders('spot'),
          getOpenOrders('linear'),
        ]);

        applyWallet(bal, setWallet);
        setPositions(pos?.result?.list?.filter(p => parseFloat(p.size) > 0) || []);
        setOpenOrders([
          ...(spotOrders?.result?.list || []),
          ...(linearOrders?.result?.list || []),
        ]);
      } catch (e) {
        console.error('Private REST load error', e?.response?.data || e);
      }
    }
    load();
  }, [setWallet, setPositions, setOpenOrders]);

  useEffect(() => {
    // Wallet updates from WS (spot + futures) - no REST roundtrip needed
    const unWallet = subPrivate('wallet', (payload) => {
      if (!payload) return;
      if (payload.kind === 'spotBalances') {
        mergeSpotBalances(payload.coins || []);
      } else if (payload.kind === 'futuresBalances') {
        mergeFuturesBalances(payload.balances || []);
      }
    });

    // Position updates from WS futures ACCOUNT_UPDATE stream
    const unPos = subPrivate('position', (positions) => {
      if (Array.isArray(positions)) {
        // Update positions list
        setPositions(positions.filter(p => parseFloat(p.size) > 0));
        // Update unrealisedPnl on each affected coin (quote asset stripped from symbol)
        positions.forEach(p => {
          if (!p.symbol) return;
          const coin = p.symbol.replace(/USDT$|USDC$|BUSD$/, '');
          if (p.unrealisedPnl != null) setCoinUpnl(coin, p.unrealisedPnl);
        });
      }
    });

    const unOrder = subPrivate('order', data => {
      if (!Array.isArray(data)) return;
      data.forEach(o => {
        applyOrderUpdate(o);

        const color = o.side === 'Buy' ? 'Buy' : 'Sell';
        let type = 'info';
        let title = '';
        if (o.orderStatus === 'Filled') {
          type = 'success';
          title = 'Order Filled';
        } else if (o.orderStatus === 'Cancelled') {
          type = 'warning';
          title = 'Order Cancelled';
        } else if (o.orderStatus === 'New') {
          title = 'Order Placed';
        } else if (o.orderStatus === 'PartiallyFilled') {
          title = 'Partially Filled';
        } else if (o.orderStatus === 'Rejected') {
          type = 'error';
          title = 'Order Rejected';
        }
        if (title) {
          pushNotif(mkNotif(type, title, `${color} ${o.qty} ${o.symbol} @ ${o.price || 'Market'}`, { order: o }));
        }
      });
    });

    const unExec = subPrivate('execution', data => {
      if (!Array.isArray(data)) return;
      data.forEach(e => {
        applyExecutionUpdate(e);
        pushNotif(mkNotif(
          'success',
          'Trade Executed',
          `${e.side} ${e.execQty} ${e.symbol} @ ${formatPrice(e.execPrice)}`,
          { execution: e }
        ));
      });
    });

    return () => {
      unWallet();
      unPos();
      unOrder();
      unExec();
    };
  }, [setWallet, setPositions, pushNotif, mergeSpotBalances, mergeFuturesBalances, setCoinUpnl]);
}

function applyWallet(data, setWallet) {
  const list = data?.result?.list?.[0];
  if (!list) return;
  const coins = list.coin || [];
  const total = parseFloat(list.totalEquity || 0);
  const pnl = parseFloat(list.totalPerpUPL || 0);
  setWallet(coins, total, pnl);
}

function isActiveOrder(status) {
  return status === 'New' || status === 'PartiallyFilled';
}

function isTerminalOrder(status) {
  return status === 'Filled' || status === 'Cancelled' || status === 'Rejected';
}

function upsertOrder(list, order) {
  const idx = list.findIndex(x => x.orderId === order.orderId);
  if (idx < 0) return [order, ...list];
  const next = [...list];
  next[idx] = { ...next[idx], ...order };
  return next;
}

function applyOrderUpdate(order) {
  if (!order?.orderId) return;

  useStore.setState(s => {
    let openOrders = [...s.openOrders];
    let orderHistory = [...s.orderHistory];
    const openIdx = openOrders.findIndex(x => x.orderId === order.orderId);

    if (isActiveOrder(order.orderStatus)) {
      if (openIdx >= 0) openOrders[openIdx] = { ...openOrders[openIdx], ...order };
      else openOrders = [order, ...openOrders];
    } else {
      openOrders = openOrders.filter(x => x.orderId !== order.orderId);
    }

    if (isTerminalOrder(order.orderStatus) || orderHistory.some(x => x.orderId === order.orderId)) {
      orderHistory = upsertOrder(orderHistory, order)
        .sort((a, b) => parseInt(b.createdTime || 0) - parseInt(a.createdTime || 0))
        .slice(0, 100);
    }

    return { openOrders, orderHistory };
  });
}

function applyExecutionUpdate(execution) {
  if (!execution?.orderId) return;
  if (execution.orderStatus && execution.orderStatus !== 'Filled') return;

  useStore.setState(s => {
    const existing =
      s.openOrders.find(x => x.orderId === execution.orderId) ||
      s.orderHistory.find(x => x.orderId === execution.orderId);

    const filledOrder = {
      ...(existing || {}),
      symbol: execution.symbol || existing?.symbol,
      orderId: execution.orderId,
      side: execution.side || existing?.side,
      price: existing?.price || execution.execPrice,
      avgPrice: execution.execPrice || existing?.avgPrice,
      qty: existing?.qty || execution.qty || execution.execQty,
      cumExecQty: execution.cumExecQty || execution.execQty || existing?.cumExecQty,
      orderStatus: 'Filled',
      createdTime: existing?.createdTime || String(Date.now()),
      takeProfit: existing?.takeProfit || '',
      stopLoss: existing?.stopLoss || '',
    };

    return {
      openOrders: s.openOrders.filter(x => x.orderId !== execution.orderId),
      orderHistory: upsertOrder(s.orderHistory, filledOrder)
        .sort((a, b) => parseInt(b.createdTime || 0) - parseInt(a.createdTime || 0))
        .slice(0, 100),
    };
  });
}
