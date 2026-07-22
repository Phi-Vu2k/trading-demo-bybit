import React, { memo, useMemo } from 'react';
import { Box, Typography, Grid, Chip } from '@mui/material';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import { useStore, selWallet } from '../../store';
import { useShallow } from 'zustand/react/shallow';
import { useAllTickersWS, useTickerWSForSymbols } from '../../hooks/useBinanceWS';
import { formatAmount, formatCurrency, formatFixed, formatSigned } from '../../utils/format';

const COLORS = ['#f7a600','#00d98b','#60a5fa','#a78bfa','#f472b6','#34d399','#fb923c','#e879f9'];

const Portfolio = memo(function Portfolio() {
  const { coins, total, pnl } = useStore(useShallow(selWallet));
  const ticker = useStore(s => s.tickers);
  const category = useStore(s => s.activeCategory);

  // Keep the default watchlist tickers live
  useAllTickersWS(category);

  // Also subscribe tickers for coins the user actually holds that are not
  // in the default watchlist (so their USD value updates in real time).
  const heldSymbols = useMemo(() => {
    const set = new Set();
    coins.forEach(c => {
      if (!c.coin || c.coin === 'USDT' || c.coin === 'USDC') return;
      set.add(`${c.coin}USDT`);
    });
    return [...set];
  }, [coins]);
  useTickerWSForSymbols(heldSymbols, category);

  // Filter coins with balance
  const active = coins.filter(c => parseFloat(c.walletBalance || c.equity || 0) > 0.0001);

  // Build USD values using ticker prices
  const withUSD = active.map(c => {
    let usdVal = 0;
    if (c.coin === 'USDT' || c.coin === 'USDC') {
      usdVal = parseFloat(c.walletBalance || c.equity || 0);
    } else {
      const sym = `${c.coin}USDT`;
      const price = parseFloat(ticker[sym]?.lastPrice || 0);
      usdVal = parseFloat(c.walletBalance || c.equity || 0) * price;
    }
    return { ...c, usdVal };
  }).sort((a, b) => b.usdVal - a.usdVal);

  const totalUSD = withUSD.reduce((s, c) => s + c.usdVal, 0) || total;

  const pieData = withUSD.slice(0, 8).map(c => ({
    name: c.coin,
    value: c.usdVal,
    pct: totalUSD > 0 ? ((c.usdVal / totalUSD) * 100).toFixed(1) : '0',
  }));

  const barData = withUSD.slice(0, 10).map(c => ({
    coin: c.coin,
    usd: parseFloat(c.usdVal.toFixed(2)),
    balance: parseFloat(c.walletBalance || c.equity || 0),
  }));

  const isPnlUp = pnl >= 0;

  return (
    <Box sx={{ p: { xs: 1, sm: 2 }, height: '100%', overflowY: 'auto', bgcolor: '#06060f' }}>
      {/* Summary cards */}
      <Grid container spacing={1.5} sx={{ mb: 2 }}>
        <Grid item xs={12} sm={4}>
          <StatCard
            icon={<AccountBalanceWalletIcon sx={{ color: '#f7a600', fontSize: 20 }} />}
            label="Total Equity"
            value={formatCurrency(totalUSD)}
            sub="Unified account"
            color="#f7a600"
          />
        </Grid>
        <Grid item xs={12} sm={4}>
          <StatCard
            icon={isPnlUp
              ? <TrendingUpIcon sx={{ color: '#00d98b', fontSize: 20 }} />
              : <TrendingDownIcon sx={{ color: '#f6465d', fontSize: 20 }} />}
            label="Unrealised PnL"
            value={formatSigned(pnl, 2, '$')}
            sub="Perpetual futures"
            color={isPnlUp ? '#00d98b' : '#f6465d'}
          />
        </Grid>
        <Grid item xs={12} sm={4}>
          <StatCard
            icon={<AccountBalanceWalletIcon sx={{ color: '#60a5fa', fontSize: 20 }} />}
            label="Assets Held"
            value={active.length}
            sub="Unique tokens"
            color="#60a5fa"
          />
        </Grid>
      </Grid>

      <Grid container spacing={1.5}>
        {/* Pie chart */}
        <Grid item xs={12} md={5}>
          <Box sx={{ bgcolor: '#0a0a18', borderRadius: 2, p: 2, border: '1px solid #0e0e1e' }}>
            <Typography sx={{ fontSize: 12, color: '#9ca3af', mb: 1, fontWeight: 600 }}>Allocation</Typography>
            {pieData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" innerRadius={55} outerRadius={85}
                      paddingAngle={2} dataKey="value">
                      {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip
                      contentStyle={{ bgcolor: '#0a0a18', border: '1px solid #1a1a2e', borderRadius: 8, fontSize: 11 }}
                      formatter={(v, n, p) => [`${formatCurrency(v)} (${p.payload.pct}%)`, p.payload.name]}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, mt: 1 }}>
                  {pieData.map((d, i) => (
                    <Box key={d.name} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: COLORS[i % COLORS.length] }} />
                      <Typography sx={{ fontSize: 10, color: '#6b7280' }}>{d.name} {d.pct}%</Typography>
                    </Box>
                  ))}
                </Box>
              </>
            ) : <Empty />}
          </Box>
        </Grid>

        {/* Bar chart */}
        <Grid item xs={12} md={7}>
          <Box sx={{ bgcolor: '#0a0a18', borderRadius: 2, p: 2, border: '1px solid #0e0e1e' }}>
            <Typography sx={{ fontSize: 12, color: '#9ca3af', mb: 1, fontWeight: 600 }}>USD Value by Asset</Typography>
            {barData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={barData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#0e0e1e" />
                  <XAxis dataKey="coin" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} />
                  <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} />
                  <Tooltip
                    contentStyle={{ bgcolor: '#0a0a18', border: '1px solid #1a1a2e', borderRadius: 8, fontSize: 11 }}
                    formatter={v => [formatCurrency(v), 'USD Value']}
                  />
                  <Bar dataKey="usd" radius={[3, 3, 0, 0]}>
                    {barData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <Empty />}
          </Box>
        </Grid>

        {/* Coin table */}
        <Grid item xs={12}>
          <Box sx={{ bgcolor: '#0a0a18', borderRadius: 2, p: 2, border: '1px solid #0e0e1e' }}>
            <Typography sx={{ fontSize: 12, color: '#9ca3af', mb: 1.5, fontWeight: 600 }}>Asset Details</Typography>
            {withUSD.length > 0 ? (
              <Box>
                <Box sx={{ display: 'flex', pb: 0.5, borderBottom: '1px solid #0e0e1e', mb: 0.5 }}>
                  {['Coin', 'Balance', 'Available', 'USD Value', 'Allocation', 'Unrealised PnL'].map(h => (
                    <Typography key={h} sx={{ flex: 1, fontSize: 10, color: '#4b5563' }}>{h}</Typography>
                  ))}
                </Box>
                {withUSD.map(c => {
                  const upnl = parseFloat(c.unrealisedPnl || 0);
                  return (
                    <Box key={c.coin} sx={{ display: 'flex', py: 0.8, borderBottom: '1px solid #0e0e1e05',
                      '&:hover': { bgcolor: '#ffffff03' } }}>
                      <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box sx={{ width: 24, height: 24, borderRadius: '50%', bgcolor: '#1a1a2e',
                          display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <Typography sx={{ fontSize: 9, color: '#f7a600', fontWeight: 700 }}>
                            {c.coin.slice(0, 2)}
                          </Typography>
                        </Box>
                        <Typography sx={{ fontSize: 12, color: '#e5e7eb', fontWeight: 600 }}>{c.coin}</Typography>
                      </Box>
                      <Typography sx={{ flex: 1, fontSize: 11, color: '#9ca3af', fontFamily: 'monospace', alignSelf: 'center' }}>
                        {formatAmount(c.walletBalance || c.equity)}
                      </Typography>
                      <Typography sx={{ flex: 1, fontSize: 11, color: '#9ca3af', fontFamily: 'monospace', alignSelf: 'center' }}>
                        {formatAmount(c.availableToWithdraw)}
                      </Typography>
                      <Typography sx={{ flex: 1, fontSize: 11, color: '#e5e7eb', fontFamily: 'monospace', alignSelf: 'center' }}>
                        {formatCurrency(c.usdVal)}
                      </Typography>
                      <Box sx={{ flex: 1, alignSelf: 'center' }}>
                        <Chip label={`${totalUSD > 0 ? ((c.usdVal / totalUSD) * 100).toFixed(1) : 0}%`}
                          size="small" sx={{ bgcolor: '#f7a60018', color: '#f7a600', fontSize: 9, height: 16 }} />
                      </Box>
                      <Typography sx={{ flex: 1, fontSize: 11, color: upnl >= 0 ? '#00d98b' : '#f6465d', fontFamily: 'monospace', alignSelf: 'center' }}>
                        {upnl !== 0 ? formatSigned(upnl, 4) : '—'}
                      </Typography>
                    </Box>
                  );
                })}
              </Box>
            ) : <Empty />}
          </Box>
        </Grid>
      </Grid>
    </Box>
  );
});

export default Portfolio;

function StatCard({ icon, label, value, sub, color }) {
  return (
    <Box sx={{ bgcolor: '#0a0a18', borderRadius: 2, p: 2, border: '1px solid #0e0e1e', display: 'flex', gap: 1.5 }}>
      <Box sx={{ mt: 0.3 }}>{icon}</Box>
      <Box>
        <Typography sx={{ fontSize: 10, color: '#4b5563' }}>{label}</Typography>
        <Typography sx={{ fontSize: 20, fontWeight: 700, color, fontFamily: 'monospace', lineHeight: 1.2 }}>
          {value}
        </Typography>
        <Typography sx={{ fontSize: 10, color: '#6b7280' }}>{sub}</Typography>
      </Box>
    </Box>
  );
}

function Empty() {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 100 }}>
      <Typography sx={{ color: '#2a2d4a', fontSize: 12 }}>No data — connect your account</Typography>
    </Box>
  );
}
