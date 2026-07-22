import React from 'react';
import { Box } from '@mui/material';
import TradingChart from '../components/chart/TradingChart';
import Orderbook from '../components/trading/Orderbook';
import OrderForm from '../components/trading/OrderForm';
import SymbolList from '../components/trading/SymbolList';
import PositionsPanel from '../components/trading/PositionsPanel';
import MobileBottomPanel from '../components/trading/MobileBottomPanel';

export default function TradePage() {
  return (
    <Box sx={{ flex: 1, display: 'flex', overflow: 'hidden', gap: '1px', bgcolor: '#0e0e1e' }}>
      {/* SymbolList sidebar — hidden on mobile */}
      <Box sx={{ width: 195, flexShrink: 0, bgcolor: '#06060f', overflow: 'hidden',
        display: { xs: 'none', md: 'block' } }}>
        <SymbolList />
      </Box>

      {/* Center column */}
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1px', overflow: 'hidden', bgcolor: '#0e0e1e' }}>
        <Box sx={{ flex: { xs: 1, md: '0 0 62%' }, overflow: 'hidden', bgcolor: '#06060f', minHeight: { xs: 200, md: 0 } }}>
          <TradingChart />
        </Box>
        {/* Desktop: PositionsPanel */}
        <Box sx={{ flex: 1, overflow: 'hidden', bgcolor: '#06060f', minHeight: 0,
          display: { xs: 'none', md: 'block' } }}>
          <PositionsPanel />
        </Box>
        {/* Mobile: Bottom tabs (Orderbook + Trade + Positions + Open + History) */}
        <Box sx={{ display: { xs: 'block', md: 'none' }, flexShrink: 0 }}>
          <MobileBottomPanel />
        </Box>
      </Box>

      {/* Right panel — hidden on mobile */}
      <Box sx={{ width: 275, flexShrink: 0, display: { xs: 'none', md: 'flex' }, flexDirection: 'column', gap: '1px', bgcolor: '#0e0e1e' }}>
        <Box sx={{ flex: 1, overflow: 'hidden', bgcolor: '#06060f', minHeight: 0 }}>
          <Orderbook />
        </Box>
        <Box sx={{ flexShrink: 0, height: 440, bgcolor: '#06060f', overflow: 'hidden' }}>
          <OrderForm />
        </Box>
      </Box>
    </Box>
  );
}