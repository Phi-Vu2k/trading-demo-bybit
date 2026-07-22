import React, { memo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AppBar, Toolbar, Typography, Box, Chip, Button, Badge, Tooltip, IconButton, SwipeableDrawer, List, ListItem, ListItemButton, ListItemIcon, ListItemText } from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone';
import SearchIcon from '@mui/icons-material/Search';
import { useStore, selUnread, selSymbol, selCategory, selTicker } from '../../store';
import { formatPercent, formatPrice, formatSigned } from '../../utils/format';
import SymbolList from '../trading/SymbolList';

const PAGES = [
  { path: '/',             label: 'Trade',         icon: <ShowChartIcon sx={{ fontSize: 15 }} /> },
  { path: '/portfolio',    label: 'Portfolio',      icon: <AccountBalanceWalletIcon sx={{ fontSize: 15 }} /> },
  { path: '/notifications',label: 'Notifications',  icon: <NotificationsNoneIcon sx={{ fontSize: 15 }} /> },
];

const Header = memo(function Header() {
  const location   = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  const [pairsOpen, setPairsOpen] = useState(false);
  const unread      = useStore(selUnread);
  const pnl         = useStore(s => s.totalPnl);
  const symbol      = useStore(selSymbol);
  const category    = useStore(selCategory);
  const setCategory = useStore(s => s.setCategory);
  const ticker      = useStore(selTicker(symbol));

  const change = ticker?.price24hPcnt ? parseFloat(ticker.price24hPcnt) * 100 : 0;
  const isUp   = change >= 0;

  return (
    <AppBar position="static" elevation={0}
      sx={{ bgcolor: '#06060f', borderBottom: '1px solid #0e0e1e', backgroundImage: 'none' }}>
      <Toolbar sx={{ minHeight: { xs: '40px !important', sm: '44px !important' }, px: { xs: 0.5, sm: 2 }, gap: { xs: 0.5, sm: 2 } }}>
        {/* Mobile: hamburger menu left */}
        <IconButton component="div"
          sx={{ display: { xs: 'inline-flex', sm: 'none' }, color: '#9ca3af', p: 0.5, mr: 0.5 }}
          onClick={() => setNavOpen(true)}>
          <MenuIcon sx={{ fontSize: 20 }} />
        </IconButton>

        {/* Logo + Nav (desktop) */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0.5, sm: 1 }, flexShrink: 0 }}>
          <Box sx={{ width: { xs: 22, sm: 26 }, height: { xs: 22, sm: 26 }, borderRadius: 1,
            background: 'linear-gradient(135deg, #f7a600, #ff6b00)',
            display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ShowChartIcon sx={{ fontSize: { xs: 13, sm: 15 }, color: '#000' }} />
          </Box>
          <Typography sx={{ fontFamily: '"Bebas Neue", Impact, sans-serif',
            fontSize: { xs: 15, sm: 18 }, letterSpacing: 2, color: '#f7a600', lineHeight: 1 }}>
            NEXBIT
          </Typography>
          <Chip label="TESTNET" size="small" sx={{ display: { xs: 'none', sm: 'inline-flex' },
            bgcolor: '#a78bfa20', color: '#a78bfa', fontSize: 8, height: 16, fontWeight: 700,
              '& .MuiChip-label': { px: 0.8 } }} />
        </Box>

        {/* Desktop: market category */}
        <Box sx={{ display: { xs: 'none', sm: 'flex' }, gap: 0.3, p: 0.3, bgcolor: '#0a0a18', borderRadius: 1 }}>
          {[{ v: 'spot', l: 'Spot' }, { v: 'linear', l: 'Futures' }].map(({ v, l }) => (
            <Button key={v} size="small" onClick={() => setCategory(v)}
              sx={{ px: 1.2, py: 0.2, fontSize: 11, fontWeight: 600, borderRadius: 0.8, textTransform: 'none',
                color:   category === v ? '#000' : '#6b7280',
                bgcolor: category === v ? '#f7a600' : 'transparent',
                '&:hover': { bgcolor: category === v ? '#f7a600' : '#ffffff08' } }}>
              {l}
            </Button>
          ))}
        </Box>

        {/* Desktop: symbol + price */}
        {ticker && (
          <Box sx={{ display: { xs: 'none', sm: 'flex' }, alignItems: 'center', gap: 1.5 }}>
            <Typography sx={{ color: '#e5e7eb', fontWeight: 700, fontSize: 14 }}>{symbol}</Typography>
            <Typography sx={{ color: isUp ? '#00d98b' : '#f6465d', fontSize: 13, fontFamily: 'monospace' }}>
              {formatPrice(ticker.lastPrice)}
            </Typography>
            <Chip label={formatPercent(change)} size="small"
              sx={{ bgcolor: isUp ? '#00d98b18' : '#f6465d18',
                color: isUp ? '#00d98b' : '#f6465d',
                fontSize: 10, height: 18 }} />
          </Box>
        )}

        {/* Desktop: nav pages */}
        <Box sx={{ flex: 1, display: { xs: 'none', sm: 'flex' }, justifyContent: 'center', gap: 0.5 }}>
          {PAGES.map(t => {
            const active = location.pathname === t.path;
            return (
              <Button key={t.path} component={Link} to={t.path}
                startIcon={t.path === '/notifications'
                  ? <Badge badgeContent={unread} max={99}
                      sx={{ '& .MuiBadge-badge': { bgcolor: '#f6465d', color: '#fff', fontSize: 8, minWidth: 14, height: 14, top: -2, right: -2 } }}>
                      {t.icon}
                    </Badge>
                  : t.icon}
                sx={{ px: 1.5, py: 0.4, fontSize: 11, textTransform: 'none', borderRadius: 1,
                  color:   active ? '#f7a600' : '#6b7280',
                  bgcolor: active ? '#f7a60012' : 'transparent',
                  borderBottom: active ? '1.5px solid #f7a600' : '1.5px solid transparent',
                  '&:hover': { bgcolor: '#ffffff08', color: '#9ca3af' },
                }}>
                {t.label}
              </Button>
            );
          })}
        </Box>

        {/* Mobile: pairs button right */}
        <IconButton component="div"
          sx={{ display: { xs: 'inline-flex', sm: 'none' }, color: '#9ca3af', p: 0.5, ml: 'auto' }}
          onClick={() => setPairsOpen(true)}>
          <SearchIcon sx={{ fontSize: 18 }} />
        </IconButton>

        {/* PnL */}
        {pnl !== 0 && (
          <Tooltip title="Unrealised PnL (perpetual futures)" arrow>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: { xs: 0.3, sm: 0.8 }, cursor: 'default',
              px: { xs: 0.5, sm: 1 }, py: { xs: 0.2, sm: 0.4 }, borderRadius: 1,
              bgcolor: pnl >= 0 ? '#00d98b10' : '#f6465d10',
              border: `1px solid ${pnl >= 0 ? '#00d98b30' : '#f6465d30'}` }}>
              <Typography sx={{ display: { xs: 'none', sm: 'inline' }, fontSize: 9,
                color: pnl >= 0 ? '#00d98b' : '#f6465d',
                fontWeight: 600, letterSpacing: 0.5 }}>PnL</Typography>
              <Typography sx={{ fontSize: { xs: 10, sm: 12 }, color: pnl >= 0 ? '#00d98b' : '#f6465d',
                fontFamily: 'monospace', fontWeight: 700 }}>
                {formatSigned(pnl, 2, '$')}
              </Typography>
            </Box>
          </Tooltip>
        )}

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
          <Box sx={{ width: { xs: 5, sm: 6 }, height: { xs: 5, sm: 6 }, borderRadius: '50%', bgcolor: '#00d98b',
            flexShrink: 0,
            animation: 'pulse 2s infinite',
            '@keyframes pulse': {
              '0%': { boxShadow: '0 0 0 0 #00d98b60' },
              '70%': { boxShadow: '0 0 0 6px transparent' },
              '100%': { boxShadow: '0 0 0 0 transparent' },
            },
          }} />
          <Typography sx={{ display: { xs: 'none', sm: 'block' }, fontSize: 10, color: '#00d98b', fontWeight: 600 }}>
            WS LIVE
          </Typography>
        </Box>
      </Toolbar>

      {/* Navigation Drawer (mobile) */}
      <SwipeableDrawer
        anchor="left"
        open={navOpen}
        onClose={() => setNavOpen(false)}
        onOpen={() => setNavOpen(true)}
        PaperProps={{ sx: { bgcolor: '#0a0a18', width: 220 } }}
      >
        <Box sx={{ p: 2, borderBottom: '1px solid #0e0e1e' }}>
          <Typography sx={{ color: '#f7a600', fontWeight: 700, fontSize: 14, fontFamily: '"Bebas Neue", Impact, sans-serif', letterSpacing: 2 }}>
            NAVIGATION
          </Typography>
        </Box>
        <List>
          {PAGES.map(t => (
            <ListItem key={t.path} disablePadding>
              <ListItemButton component={Link} to={t.path} onClick={() => setNavOpen(false)}
                selected={location.pathname === t.path}
                sx={{ color: location.pathname === t.path ? '#f7a600' : '#9ca3af',
                  '&.Mui-selected': { bgcolor: '#f7a60012' },
                  '&:hover': { bgcolor: '#ffffff08' } }}>
                <ListItemIcon sx={{ minWidth: 32, color: 'inherit' }}>
                  {t.path === '/notifications'
                    ? <Badge badgeContent={unread} max={99}
                        sx={{ '& .MuiBadge-badge': { bgcolor: '#f6465d', color: '#fff', fontSize: 8, minWidth: 14, height: 14 } }}>
                        {t.icon}
                      </Badge>
                    : t.icon}
                </ListItemIcon>
                <ListItemText primary={t.label} primaryTypographyProps={{ fontSize: 13 }} />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
      </SwipeableDrawer>

      {/* Pairs Drawer (mobile) */}
      <SwipeableDrawer
        anchor="right"
        open={pairsOpen}
        onClose={() => setPairsOpen(false)}
        onOpen={() => setPairsOpen(true)}
        PaperProps={{ sx: { bgcolor: '#06060f', width: 280 } }}
      >
        <Box sx={{ p: 1.5 }}>
          <Typography sx={{ color: '#e5e7eb', fontWeight: 700, fontSize: 13, mb: 1 }}>Select Pair</Typography>
          <SymbolList />
        </Box>
      </SwipeableDrawer>
    </AppBar>
  );
});

export default Header;
