import React, { useState, memo } from 'react';
import { Box, Tabs, Tab } from '@mui/material';
import Orderbook from './Orderbook';
import OrderForm from './OrderForm';
import PositionsPanel from './PositionsPanel';

const TABS = ['Orderbook', 'Trade', 'Positions', 'Open Orders', 'Order History'];

const MobileBottomPanel = memo(function MobileBottomPanel() {
  const [tab, setTab] = useState(0);

  return (
    <Box sx={{ bgcolor: '#06060f', borderTop: '1px solid #0e0e1e' }}>
      <Tabs value={tab} onChange={(_, v) => setTab(v)}
        variant="scrollable" scrollButtons={false}
        sx={{ minHeight: 32, borderBottom: '1px solid #0e0e1e',
          '& .MuiTab-root': { fontSize: 10, minHeight: 32, color: '#6b7280', textTransform: 'none', py: 0, px: 1.2 },
          '& .Mui-selected': { color: '#f7a600' },
          '& .MuiTabs-indicator': { bgcolor: '#f7a600', height: 1.5 },
        }}>
        {TABS.map((t, i) => <Tab key={i} label={t} />)}
      </Tabs>
      <Box sx={{ height: 180, overflow: 'auto' }}>
        {tab === 0 && <Orderbook />}
        {tab === 1 && <OrderForm />}
        {tab >= 2 && <PositionsPanel hideTabs activeTab={tab - 2} />}
      </Box>
    </Box>
  );
});

export default MobileBottomPanel;
