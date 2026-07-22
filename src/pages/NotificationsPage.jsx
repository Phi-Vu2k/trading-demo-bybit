import React, { memo } from 'react';
import { Box, Typography, Button, Chip } from '@mui/material';
import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import DeleteIcon from '@mui/icons-material/Delete';
import { useStore, selNotifs } from '../store';
import { formatAmount } from '../utils/format';

const iconMap = {
  success: <CheckCircleOutlineIcon sx={{ fontSize: 18, color: '#00d98b' }} />,
  error:   <ErrorOutlineIcon      sx={{ fontSize: 18, color: '#f6465d' }} />,
  warning: <WarningAmberIcon      sx={{ fontSize: 18, color: '#f7a600' }} />,
  info:    <InfoOutlinedIcon      sx={{ fontSize: 18, color: '#60a5fa' }} />,
};
const colorMap = { success: '#00d98b', error: '#f6465d', warning: '#f7a600', info: '#60a5fa' };

const NotificationsPage = memo(function NotificationsPage() {
  const notifs     = useStore(selNotifs);
  const clearNotifs = useStore(s => s.clearNotifs);

  const grouped = groupByDay(notifs);

  return (
    <Box sx={{ p: { xs: 1, sm: 2 }, height: '100%', overflowY: 'auto', bgcolor: '#06060f' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <NotificationsNoneIcon sx={{ color: '#f7a600' }} />
          <Typography sx={{ fontSize: 16, fontWeight: 700, color: '#e5e7eb' }}>Notifications</Typography>
          <Chip label={`${notifs.filter(n => !n.read).length} new`} size="small"
            sx={{ bgcolor: '#f7a60020', color: '#f7a600', fontSize: 10, height: 18 }} />
        </Box>
        <Box>
          <Button startIcon={<DeleteSweepIcon />} size="small" onClick={clearNotifs}
            sx={{ color: '#6b7280', fontSize: 11, textTransform: 'none',
              '&:hover': { color: '#f6465d', bgcolor: '#f6465d10' } }}>
            Clear all
          </Button>
        </Box>
      </Box>

      {notifs.length === 0 ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          height: '50%', gap: 2 }}>
          <NotificationsNoneIcon sx={{ fontSize: 48, color: '#1a1a2e' }} />
          <Typography sx={{ color: '#2a2d4a', fontSize: 13 }}>No notifications yet</Typography>
          <Typography sx={{ color: '#1a1a2e', fontSize: 11 }}>
            Order fills, cancellations and liquidations will appear here
          </Typography>
        </Box>
      ) : (
        Object.entries(grouped).map(([day, items]) => (
          <Box key={day} sx={{ mb: 2 }}>
            <Typography sx={{ fontSize: 10, color: '#4b5563', mb: 1, letterSpacing: 1, fontWeight: 600 }}>
              {day}
            </Typography>
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.5 }}>
              {items.map(n => <NotifCard key={n.id} notif={n} />)}
            </Box>
          </Box>
        ))
      )}
    </Box>
  );
});

export default NotificationsPage;

const NotifCard = memo(function NotifCard({ notif }) {
  const color  = colorMap[notif.type] || '#9ca3af';
  const isNew  = !notif.read;
  const removeNotif = useStore(s => s.removeNotif);

  return (
    <Box sx={{
      display: 'flex', gap: 1, p: 1.5,
      bgcolor: isNew ? `${color}08` : '#0a0a18',
      border: `1px solid ${isNew ? `${color}25` : '#0e0e1e'}`,
      borderRadius: 1.5,
      transition: 'all 0.2s',
    }}>
      <Button
        size="small"
        onClick={(e) => { e.stopPropagation(); removeNotif(notif.id); }}
        sx={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0.1,
          minWidth: 32, width: 32, p: 0.3, borderRadius: 1,
          color: '#4b5563', alignSelf: 'center',
          bgcolor: 'transparent',
          '&:hover': { color: '#f6465d', bgcolor: '#f6465d10' },
        }}
      >
        <DeleteIcon sx={{ fontSize: 14 }} />
        <Typography sx={{ fontSize: 7, lineHeight: 1 }}>Delete</Typography>
      </Button>
      <Box sx={{ mt: 0.2, flexShrink: 0 }}>{iconMap[notif.type] || iconMap.info}</Box>
      <Box sx={{ flex: 1 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <Typography sx={{ fontSize: 12, fontWeight: 600, color: '#e5e7eb' }}>{notif.title}</Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
            {isNew && <Box sx={{ width: 6, height: 6, borderRadius: '50%', bgcolor: color }} />}
            <Typography sx={{ fontSize: 9, color: '#4b5563', ml: 0.5 }}>
              {new Date(notif.ts).toLocaleTimeString()}
            </Typography>
          </Box>
        </Box>
        <Typography sx={{ fontSize: 11, color: '#9ca3af', mt: 0.2 }}>{notif.msg}</Typography>

        {notif.order && (
          <Box sx={{ display: 'flex', gap: 1, mt: 0.5, flexWrap: 'wrap' }}>
            {[
              { l: 'ID',     v: notif.order.orderId?.slice(0, 12) + '...' },
              { l: 'Symbol', v: notif.order.symbol },
              { l: 'Status', v: notif.order.orderStatus },
            ].map(({ l, v }) => (
              <Box key={l} sx={{ display: 'flex', gap: 0.3 }}>
                <Typography sx={{ fontSize: 9, color: '#4b5563' }}>{l}:</Typography>
                <Typography sx={{ fontSize: 9, color: '#6b7280', fontFamily: 'monospace' }}>{v}</Typography>
              </Box>
            ))}
          </Box>
        )}

        {notif.execution && (
          <Box sx={{ display: 'flex', gap: 1, mt: 0.5, flexWrap: 'wrap' }}>
            {[
              { l: 'Fee',  v: formatAmount(notif.execution.execFee || 0) + ' ' + (notif.execution.feeCurrency || '') },
              { l: 'Type', v: notif.execution.execType },
            ].map(({ l, v }) => (
              <Box key={l} sx={{ display: 'flex', gap: 0.3 }}>
                <Typography sx={{ fontSize: 9, color: '#4b5563' }}>{l}:</Typography>
                <Typography sx={{ fontSize: 9, color: '#6b7280', fontFamily: 'monospace' }}>{v}</Typography>
              </Box>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
});

function groupByDay(notifs) {
  const groups = {};
  notifs.forEach(n => {
    const d = new Date(n.ts);
    const today    = new Date(); today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    let label;
    if (d >= today)      label = 'Today';
    else if (d >= yesterday) label = 'Yesterday';
    else label = d.toLocaleDateString();
    if (!groups[label]) groups[label] = [];
    groups[label].push(n);
  });
  return groups;
}
