import React, { memo, useState, useCallback } from 'react';
import {
  Box, Typography, Button, TextField, Slider, Chip, Switch,
  FormControlLabel, Tooltip, CircularProgress, Divider,
} from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { useStore, selSymbol, selCategory, selOrderForm, selWallet, mkNotif } from '../../store';
import { useShallow } from 'zustand/react/shallow';
import { placeOrder, setLeverage as apiSetLeverage, getWalletBalance, getOpenOrders, getOrderHistory } from '../../api/binance';

const PCT = [25, 50, 75, 100];

const inputSx = {
  '& .MuiOutlinedInput-root': {
    bgcolor: '#0a0a18', color: '#e5e7eb', fontFamily: 'monospace', fontSize: 12,
    '& fieldset': { borderColor: '#1a1a2e' },
    '&:hover fieldset': { borderColor: '#2a2d4a' },
    '&.Mui-focused fieldset': { borderColor: '#f7a600' },
  },
  '& .MuiInputLabel-root': { color: '#4b5563', fontSize: 11 },
  '& .MuiInputLabel-root.Mui-focused': { color: '#f7a600' },
};

// Estimate liquidation price
function estLiqPrice(side, entryPrice, leverage) {
  if (!entryPrice || !leverage) return null;
  const e = parseFloat(entryPrice);
  const l = parseFloat(leverage);
  if (!e || !l) return null;
  // Simplified: entry ± (entry / leverage) * maintenance margin factor (0.5%)
  const mm = 0.005;
  if (side === 'Buy') return e * (1 - 1 / l + mm);
  return e * (1 + 1 / l - mm);
}

const OrderForm = memo(function OrderForm() {
  const symbol   = useStore(selSymbol);
  const category = useStore(selCategory);
  const form     = useStore(useShallow(selOrderForm));
  const wallet   = useStore(useShallow(selWallet));
  const ticker   = useStore(s => s.tickers[symbol]);

  const {
    setOrderSide, setOrderType, setOrderPrice, setOrderQty, setLeverage,
    setTpEnabled, setSlEnabled, setTpPrice, setSlPrice, pushNotif,
    setWallet, setOpenOrders, setOrderHistory,
  } = useStore(useShallow(s => ({
    setOrderSide: s.setOrderSide, setOrderType: s.setOrderType,
    setOrderPrice: s.setOrderPrice, setOrderQty: s.setOrderQty,
    setLeverage: s.setLeverage,
    setTpEnabled: s.setTpEnabled, setSlEnabled: s.setSlEnabled,
    setTpPrice: s.setTpPrice, setSlPrice: s.setSlPrice,
    pushNotif: s.pushNotif,
    setWallet: s.setWallet,
    setOpenOrders: s.setOpenOrders,
    setOrderHistory: s.setOrderHistory,
  })));

  const [submitting, setSubmitting] = useState(false);
  const isFuture = category === 'linear';

  const lastPrice = parseFloat(ticker?.lastPrice || 0);
  const availUSDT = parseFloat(wallet.coins.find(c => c.coin === 'USDT')?.availableToWithdraw || 0);
  const base      = symbol.replace('USDT', '');
  const availBase = parseFloat(wallet.coins.find(c => c.coin === base)?.availableToWithdraw || 0);

  const liqPrice  = isFuture
    ? estLiqPrice(form.side, form.price || lastPrice, form.leverage)
    : null;

  const entryP  = parseFloat(form.price) || lastPrice;
  const estCost = parseFloat(form.qty || 0) * entryP;
  const margin  = isFuture ? (estCost / form.leverage).toFixed(2) : null;

  function handlePct(pct) {
    const avail = form.side === 'Buy' ? availUSDT : availBase;
    if (form.side === 'Buy') {
      const p = entryP;
      if (p > 0) setOrderQty(((avail * pct / 100) / p / (isFuture ? 1 : 1)).toFixed(6));
    } else {
      setOrderQty((avail * pct / 100).toFixed(6));
    }
  }

  const handleSubmit = useCallback(async () => {
    if (!form.qty || parseFloat(form.qty) <= 0) {
      pushNotif(mkNotif('error', '❌ Validation Error', 'Please enter a quantity'));
      return;
    }
    setSubmitting(true);
    try {
      if (isFuture) {
        await apiSetLeverage(symbol, form.leverage, form.leverage).catch(() => {});
      }
      const params = {
        category: isFuture ? 'linear' : 'spot',
        symbol,
        side:      form.side,
        orderType: form.type,
        qty:       form.qty,
        timeInForce: form.type === 'Market' ? 'IOC' : 'GTC',
        ...(form.type === 'Limit' && { price: form.price }),
        ...(isFuture && { positionIdx: 0 }),
        ...(form.tpEnabled && form.tpPrice && { takeProfit: form.tpPrice }),
        ...(form.slEnabled && form.slPrice && { stopLoss:   form.slPrice }),
      };
      const res = await placeOrder(params);
      if (res.retCode === 0) {
        pushNotif(mkNotif('success', `✅ Order Placed`, `${form.side} ${form.qty} ${symbol} @ ${form.type === 'Market' ? 'Market' : form.price}`));
        setOrderQty('');
        setTpPrice(''); setSlPrice('');

        const refreshData = async () => {
          try {
            const [bal, spotOrders, linearOrders, histRes] = await Promise.all([
              getWalletBalance(),
              getOpenOrders('spot'),
              getOpenOrders('linear'),
              getOrderHistory(category === 'linear' ? 'linear' : 'spot', 100),
            ]);
            const list = bal?.result?.list?.[0];
            if (list) {
              setWallet(list.coin || [], parseFloat(list.totalEquity || 0), parseFloat(list.totalPerpUPL || 0));
            }
            setOpenOrders([
              ...(spotOrders?.result?.list || []),
              ...(linearOrders?.result?.list || []),
            ]);
            setOrderHistory(histRes?.result?.list || []);
          } catch (e) {
            console.error('Failed to refresh data:', e);
          }
        };
        refreshData();
        setTimeout(refreshData, 800);
      } else {
        pushNotif(mkNotif('error', '❌ Order Failed', res.retMsg || 'Unknown error'));
      }
    } catch (e) {
      pushNotif(mkNotif('error', '❌ Network Error', e.message));
    } finally {
      setSubmitting(false);
    }
  }, [form, symbol, isFuture, category, setWallet, setOpenOrders, setOrderHistory, pushNotif]);

  return (
    <Box sx={{ bgcolor: '#06060f', height: '100%', display: 'flex', flexDirection: 'column', p: 1.5, gap: 1, overflowY: 'auto' }}>
      {/* Buy/Sell */}
      <Box sx={{ display: 'flex', borderRadius: 1, overflow: 'hidden', border: '1px solid #0e0e1e' }}>
        {['Buy', 'Sell'].map(s => (
          <Button key={s} fullWidth onClick={() => setOrderSide(s)}
            sx={{
              py: 0.8, borderRadius: 0, fontWeight: 700, fontSize: 13, textTransform: 'none',
              bgcolor: form.side === s ? (s === 'Buy' ? '#00d98b' : '#f6465d') : 'transparent',
              color:   form.side === s ? '#000' : '#6b7280',
              '&:hover': { bgcolor: form.side === s ? (s === 'Buy' ? '#00c47a' : '#e03050') : '#ffffff08' },
            }}>
            {s}
          </Button>
        ))}
      </Box>

      {/* Order type */}
      <Box sx={{ display: 'flex', gap: 0.5 }}>
        {['Limit', 'Market'].map(t => (
          <Button key={t} size="small" onClick={() => setOrderType(t)}
            sx={{
              px: 1.5, py: 0.3, fontSize: 11, textTransform: 'none', borderRadius: 1,
              color:   form.type === t ? '#f7a600' : '#6b7280',
              bgcolor: form.type === t ? '#f7a60015' : 'transparent',
              border:  '1px solid', borderColor: form.type === t ? '#f7a60040' : '#0e0e1e',
              '&:hover': { bgcolor: '#ffffff08' },
            }}>
            {t}
          </Button>
        ))}
      </Box>

      {/* Leverage (futures only) */}
      {isFuture && (
        <Box>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.3 }}>
            <Typography sx={{ fontSize: 10, color: '#6b7280' }}>Leverage</Typography>
            <Chip label={`${form.leverage}×`} size="small"
              sx={{ bgcolor: '#f7a60020', color: '#f7a600', height: 18, fontSize: 10, fontWeight: 700 }} />
          </Box>
          <Slider value={form.leverage} min={1} max={100}
            onChange={(_, v) => setLeverage(v)}
            sx={{ color: '#f7a600', py: 0.5,
              '& .MuiSlider-rail': { bgcolor: '#1a1a2e' },
              '& .MuiSlider-thumb': { width: 10, height: 10 },
            }} />
          <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
            {[1, 10, 25, 50, 75, 100].map(v => (
              <Button key={v} size="small" onClick={() => setLeverage(v)}
                sx={{ minWidth: 0, px: 0.5, py: 0, fontSize: 9, color: form.leverage === v ? '#f7a600' : '#4b5563', '&:hover': { color: '#f7a600' } }}>
                {v}×
              </Button>
            ))}
          </Box>
        </Box>
      )}

      {/* Price */}
      {form.type === 'Limit' && (
        <TextField label="Price (USDT)" value={form.price} onChange={e => setOrderPrice(e.target.value)}
          size="small" fullWidth sx={inputSx}
          InputProps={{ endAdornment: (
            <Button size="small" onClick={() => setOrderPrice(lastPrice.toString())}
              sx={{ color: '#f7a600', fontSize: 10, minWidth: 0, px: 0.5, py: 0 }}>Last</Button>
          )}} />
      )}

      {/* Qty */}
      <TextField label={`Amount (${base})`} value={form.qty} onChange={e => setOrderQty(e.target.value)}
        size="small" fullWidth sx={inputSx} />

      {/* Pct buttons */}
      <Box sx={{ display: 'flex', gap: 0.5 }}>
        {PCT.map(p => (
          <Button key={p} size="small" onClick={() => handlePct(p)}
            sx={{ flex: 1, py: 0.3, fontSize: 10, color: '#6b7280',
              border: '1px solid #1a1a2e', borderRadius: 1,
              '&:hover': { border: '1px solid #f7a600', color: '#f7a600' } }}>
            {p}%
          </Button>
        ))}
      </Box>

      {/* TP/SL */}
      <Box sx={{ border: '1px solid #0e0e1e', borderRadius: 1, p: 1 }}>
        <Typography sx={{ fontSize: 10, color: '#6b7280', mb: 0.5, fontWeight: 600 }}>TP / SL</Typography>
        <Box sx={{ display: 'flex', gap: 0.5, mb: 0.5, alignItems: 'center' }}>
          <Switch size="small" checked={form.tpEnabled} onChange={e => setTpEnabled(e.target.checked)}
            sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: '#00d98b' },
                  '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: '#00d98b' } }} />
          <TextField label="Take Profit" value={form.tpPrice} onChange={e => setTpPrice(e.target.value)}
            size="small" disabled={!form.tpEnabled} fullWidth sx={{ ...inputSx,
              '& .MuiOutlinedInput-root.Mui-focused fieldset': { borderColor: '#00d98b' },
              '& .MuiInputLabel-root.Mui-focused': { color: '#00d98b' },
            }} />
        </Box>
        <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
          <Switch size="small" checked={form.slEnabled} onChange={e => setSlEnabled(e.target.checked)}
            sx={{ '& .MuiSwitch-switchBase.Mui-checked': { color: '#f6465d' },
                  '& .MuiSwitch-switchBase.Mui-checked + .MuiSwitch-track': { bgcolor: '#f6465d' } }} />
          <TextField label="Stop Loss" value={form.slPrice} onChange={e => setSlPrice(e.target.value)}
            size="small" disabled={!form.slEnabled} fullWidth sx={{ ...inputSx,
              '& .MuiOutlinedInput-root.Mui-focused fieldset': { borderColor: '#f6465d' },
              '& .MuiInputLabel-root.Mui-focused': { color: '#f6465d' },
            }} />
        </Box>
      </Box>

      {/* Summary */}
      <Box sx={{ bgcolor: '#0a0a18', borderRadius: 1, p: 1, display: 'flex', flexDirection: 'column', gap: 0.3 }}>
        <SumRow label="Available" value={`${form.side === 'Buy' ? availUSDT.toFixed(2) + ' USDT' : availBase.toFixed(6) + ' ' + base}`} />
        {estCost > 0 && <SumRow label="Est. Cost"   value={`≈ ${estCost.toFixed(2)} USDT`} />}
        {margin      && <SumRow label="Margin"      value={`≈ ${margin} USDT`} />}
        {liqPrice    && (
          <SumRow label={
            <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.3 }}>
              Est. Liq. Price
              <Tooltip title="Estimated liquidation price based on leverage and maintenance margin (simplified)" arrow>
                <InfoOutlinedIcon sx={{ fontSize: 11, color: '#4b5563', cursor: 'help' }} />
              </Tooltip>
            </Box>
          } value={liqPrice.toFixed(2)} valueColor="#f6465d" />
        )}
      </Box>

      {/* Submit */}
      <Button fullWidth variant="contained" onClick={handleSubmit} disabled={submitting}
        sx={{
          mt: 'auto', py: 1.2, fontWeight: 700, fontSize: 14,
          bgcolor: form.side === 'Buy' ? '#00d98b' : '#f6465d',
          color: '#000',
          '&:hover': { bgcolor: form.side === 'Buy' ? '#00c47a' : '#e03050' },
          '&:disabled': { bgcolor: '#1a1a2e', color: '#4b5563' },
        }}>
        {submitting
          ? <CircularProgress size={18} sx={{ color: '#000' }} />
          : `${form.side} ${base}`}
      </Button>
    </Box>
  );
});

export default OrderForm;

function SumRow({ label, value, valueColor }) {
  return (
    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <Box component="span" sx={{ fontSize: 10, color: '#4b5563' }}>
        {typeof label === 'string'
          ? <Typography component="span" sx={{ fontSize: 10, color: 'inherit' }}>{label}</Typography>
          : label}
      </Box>
      <Typography sx={{ fontSize: 10, color: valueColor || '#9ca3af', fontFamily: 'monospace' }}>{value}</Typography>
    </Box>
  );
}
