import React, { memo, useState, useCallback } from 'react';
import {
  Box, Typography, Tabs, Tab, Table, TableBody, TableCell,
  TableHead, TableRow, Button, Chip,
} from '@mui/material';
import { useStore, selPositions, selOpenOrders, selOrderHistory } from '../../store';
import { cancelOrder } from '../../api/binance';
import { refreshAccountData } from '../../api/accountData';
import { mkNotif } from '../../store';
import { formatFixed, formatSigned } from '../../utils/format';

const hdr = { borderBottom: '1px solid #0e0e1e', color: '#4b5563', fontSize: 10, py: 0.6, px: 1, fontFamily: 'monospace' };
const cel = { borderBottom: '1px solid #0e0e1e05', color: '#9ca3af', fontSize: 11, py: 0.5, px: 1, fontFamily: 'monospace' };

const PositionsPanel = memo(function PositionsPanel({ activeTab: controlledTab, hideTabs }) {
  const isControlled = controlledTab !== undefined;
  const [tab, setTab] = useState(0);
  const currentTab = isControlled ? controlledTab : tab;
  const handleTab = isControlled ? undefined : (_, v) => setTab(v);
  const positions  = useStore(selPositions);
  const openOrders = useStore(selOpenOrders);
  const history    = useStore(selOrderHistory);
  const pushNotif  = useStore(s => s.pushNotif);
  const setWallet  = useStore(s => s.setWallet);
  const setOpenOrders = useStore(s => s.setOpenOrders);
  const setOrderHistory = useStore(s => s.setOrderHistory);
  const category   = useStore(s => s.activeCategory);

  const handleCancel = useCallback(async (sym, orderId) => {
    try {
      const res = await cancelOrder(category === 'linear' ? 'linear' : 'spot', sym, orderId);
      if (res.retCode === 0) {
        pushNotif(mkNotif('warning', '⚪ Order Cancelled', `Order ${orderId.slice(0, 8)}... cancelled`));
        const refreshData = async () => {
          try {
            await refreshAccountData(category, { setWallet, setOpenOrders, setOrderHistory });
          } catch (e) {}
        };
        refreshData();
        setTimeout(refreshData, 800);
      }
    } catch (e) {}
  }, [category, pushNotif, setWallet, setOpenOrders, setOrderHistory]);

  const tabs = [
    `Positions (${positions.length})`,
    `Open Orders (${openOrders.length})`,
    'Order History',
  ];

  return (
    <Box sx={{ bgcolor: '#06060f', height: '100%', display: 'flex', flexDirection: 'column' }}>
      {!hideTabs && (
        <Tabs value={currentTab} onChange={handleTab}
          sx={{ minHeight: 32, borderBottom: '1px solid #0e0e1e',
            '& .MuiTab-root': { fontSize: 11, minHeight: 32, color: '#6b7280', textTransform: 'none', py: 0 },
            '& .Mui-selected': { color: '#f7a600' },
            '& .MuiTabs-indicator': { bgcolor: '#f7a600', height: 1.5 },
          }}>
          {tabs.map((t, i) => <Tab key={i} label={t} />)}
        </Tabs>
      )}
      <Box sx={{ flex: 1, overflow: 'auto' }}>
        {currentTab === 0 && <PositionsTable rows={positions} />}
        {currentTab === 1 && <OpenOrdersTable rows={openOrders} onCancel={handleCancel} />}
        {currentTab === 2 && <HistoryTable rows={history} />}
      </Box>
    </Box>
  );
});

export default PositionsPanel;

const PositionsTable = memo(function PositionsTable({ rows }) {
  if (!rows.length) return <Empty msg="No open positions" />;
  return (
    <Table size="small" stickyHeader>
      <TableHead>
        <TableRow>
          {['Symbol','Side','Size','Entry','Mark','Liq.','Unrealised PnL','ROE%','TP','SL'].map((h, idx) =>
            <TableCell key={h} sx={{
              ...hdr,
              display: {
                xs: idx >= 7 ? 'none' : 'table-cell',  // hide ROE%, TP, SL on mobile
                sm: 'table-cell',
              },
            }}>{h}</TableCell>)}
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map((p, i) => {
          const pnl = parseFloat(p.unrealisedPnl || 0);
          return (
            <TableRow key={i} sx={{ '&:hover': { bgcolor: '#ffffff04' } }}>
              <TableCell sx={{ ...cel, color: '#e5e7eb', fontWeight: 600 }}>{p.symbol}</TableCell>
              <TableCell sx={cel}>
                <SideChip side={p.side} />
              </TableCell>
              <TableCell sx={cel}>{p.size}</TableCell>
              <TableCell sx={cel}>{formatFixed(p.avgPrice)}</TableCell>
              <TableCell sx={cel}>{formatFixed(p.markPrice)}</TableCell>
              <TableCell sx={{ ...cel, color: '#f6465d' }}>{formatFixed(p.liqPrice)}</TableCell>
              <TableCell sx={{ ...cel, color: pnl >= 0 ? '#00d98b' : '#f6465d' }}>
                {formatSigned(pnl, 4)}
              </TableCell>
              <TableCell sx={{ ...cel, display: { xs: 'none', sm: 'table-cell' }, color: pnl >= 0 ? '#00d98b' : '#f6465d' }}>
                {p.curRealisedPnl ? formatFixed(p.curRealisedPnl) : '—'}%
              </TableCell>
              <TableCell sx={{ ...cel, display: { xs: 'none', sm: 'table-cell' }, color: '#00d98b' }}>{p.takeProfit || '—'}</TableCell>
              <TableCell sx={{ ...cel, display: { xs: 'none', sm: 'table-cell' }, color: '#f6465d' }}>{p.stopLoss || '—'}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
});

const OpenOrdersTable = memo(function OpenOrdersTable({ rows, onCancel }) {
  if (!rows.length) return <Empty msg="No open orders" />;
  return (
    <Table size="small" stickyHeader>
      <TableHead>
        <TableRow>
          {['Symbol','Side','Type','Price','Qty','Filled','TP','SL','Status','Action'].map((h, idx) =>
            <TableCell key={h} sx={{
              ...hdr,
              display: {
                xs: idx >= 6 ? 'none' : 'table-cell',  // hide TP, SL, Status, Action on mobile
                sm: 'table-cell',
              },
            }}>{h}</TableCell>)}
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.map((o, i) => (
          <TableRow key={i} sx={{ '&:hover': { bgcolor: '#ffffff04' } }}>
            <TableCell sx={{ ...cel, color: '#e5e7eb' }}>{o.symbol}</TableCell>
            <TableCell sx={cel}><SideChip side={o.side} /></TableCell>
            <TableCell sx={cel}>{o.orderType}</TableCell>
            <TableCell sx={cel}>{formatFixed(o.price)}</TableCell>
            <TableCell sx={cel}>{o.qty}</TableCell>
            <TableCell sx={cel}>{o.cumExecQty || '0'}</TableCell>
            <TableCell sx={{ ...cel, display: { xs: 'none', sm: 'table-cell' }, color: '#00d98b' }}>{o.takeProfit || '—'}</TableCell>
            <TableCell sx={{ ...cel, display: { xs: 'none', sm: 'table-cell' }, color: '#f6465d' }}>{o.stopLoss || '—'}</TableCell>
            <TableCell sx={{ ...cel, display: { xs: 'none', sm: 'table-cell' } }}>
              <StatusChip status={o.orderStatus} />
            </TableCell>
            <TableCell sx={{ ...cel, display: { xs: 'none', sm: 'table-cell' } }}>
              <Button size="small" onClick={() => onCancel(o.symbol, o.orderId)}
                sx={{ color: '#f6465d', fontSize: 10, minWidth: 0, p: '2px 6px',
                  '&:hover': { bgcolor: '#f6465d18' } }}>
                Cancel
              </Button>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
});

const HistoryTable = memo(function HistoryTable({ rows }) {
  if (!rows.length) return <Empty msg="No order history" />;
  return (
    <Table size="small" stickyHeader>
      <TableHead>
        <TableRow>
          {['Symbol','Side','Type','Avg Price','Qty','Status','TP','SL','Time'].map((h, idx) =>
            <TableCell key={h} sx={{
              ...hdr,
              display: {
                xs: idx >= 6 ? 'none' : 'table-cell',  // hide TP, SL, Time on mobile
                sm: 'table-cell',
              },
            }}>{h}</TableCell>)}
        </TableRow>
      </TableHead>
      <TableBody>
        {rows.slice(0, 100).map((o, i) => (
          <TableRow key={i} sx={{ '&:hover': { bgcolor: '#ffffff04' } }}>
            <TableCell sx={{ ...cel, color: '#e5e7eb' }}>{o.symbol}</TableCell>
            <TableCell sx={cel}><SideChip side={o.side} /></TableCell>
            <TableCell sx={cel}>{o.orderType}</TableCell>
            <TableCell sx={cel}>{formatFixed(o.avgPrice || o.price)}</TableCell>
            <TableCell sx={cel}>{o.qty}</TableCell>
            <TableCell sx={cel}><StatusChip status={o.orderStatus} /></TableCell>
            <TableCell sx={{ ...cel, display: { xs: 'none', sm: 'table-cell' }, color: '#00d98b' }}>{o.takeProfit || '—'}</TableCell>
            <TableCell sx={{ ...cel, display: { xs: 'none', sm: 'table-cell' }, color: '#f6465d' }}>{o.stopLoss || '—'}</TableCell>
            <TableCell sx={{ ...cel, display: { xs: 'none', sm: 'table-cell' } }}>{o.createdTime ? new Date(parseInt(o.createdTime)).toLocaleString() : '—'}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
});

function SideChip({ side }) {
  return (
    <Typography sx={{ color: side === 'Buy' ? '#00d98b' : '#f6465d', fontSize: 11, fontWeight: 600 }}>
      {side}
    </Typography>
  );
}

function StatusChip({ status }) {
  const colors = {
    Filled: '#00d98b', Cancelled: '#6b7280', Rejected: '#f6465d',
    New: '#f7a600', PartiallyFilled: '#60a5fa',
  };
  return (
    <Chip label={status} size="small"
      sx={{ bgcolor: `${colors[status] || '#6b7280'}18`,
        color: colors[status] || '#6b7280',
        fontSize: 9, height: 16,
        '& .MuiChip-label': { px: 0.8 } }} />
  );
}

function Empty({ msg }) {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 80 }}>
      <Typography sx={{ color: '#2a2d4a', fontSize: 12 }}>{msg}</Typography>
    </Box>
  );
}
