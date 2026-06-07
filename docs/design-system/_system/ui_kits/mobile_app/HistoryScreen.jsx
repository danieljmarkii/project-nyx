// ──────────────────────────────────────────────────────────────────────────
// HistoryScreen — filter chips + event rows
// Mirrors app/(tabs)/history.tsx + components/history/EventRow.tsx
// ──────────────────────────────────────────────────────────────────────────

function HistoryScreen({ events }) {
  const [range, setRange] = React.useState('14d');
  const [filter, setFilter] = React.useState('all');
  const [expandedId, setExpandedId] = React.useState(null);

  const filtered = events.filter(e => {
    if (filter === 'all') return true;
    if (filter === 'meals') return e.event_type === 'meal';
    if (filter === 'symptoms') return ['vomit','diarrhea','lethargy','itch'].includes(e.event_type);
    if (filter === 'stool') return ['stool_normal','diarrhea'].includes(e.event_type);
    return true;
  });

  // Group by date label
  const grouped = {};
  filtered.forEach(e => {
    grouped[e.date] = grouped[e.date] || [];
    grouped[e.date].push(e);
  });

  return (
    <div style={{
      flex: 1, background: nyxColors.surface,
      display: 'flex', flexDirection: 'column',
      height: '100%', overflowY: 'auto',
    }}>
      {/* Range chips */}
      <div style={{
        padding: '16px 24px 8px', display: 'flex', gap: 8, flexWrap: 'wrap',
        borderBottom: `1px solid ${nyxColors.border}`,
      }}>
        <NyxFilterChip label="7 days" active={range==='7d'} onPress={() => setRange('7d')} />
        <NyxFilterChip label="14 days" active={range==='14d'} onPress={() => setRange('14d')} />
        <NyxFilterChip label="30 days" active={range==='30d'} onPress={() => setRange('30d')} />
        <NyxFilterChip label="All" active={range==='all'} onPress={() => setRange('all')} />
      </div>
      {/* Type filters */}
      <div style={{
        padding: '12px 24px', display: 'flex', gap: 8, flexWrap: 'wrap',
        borderBottom: `1px solid ${nyxColors.border}`,
      }}>
        <NyxFilterChip variant="filled" label="All events" active={filter==='all'} onPress={() => setFilter('all')} />
        <NyxFilterChip variant="filled" label="Meals" active={filter==='meals'} onPress={() => setFilter('meals')} />
        <NyxFilterChip variant="filled" label="Symptoms" active={filter==='symptoms'} onPress={() => setFilter('symptoms')} />
        <NyxFilterChip variant="filled" label="Stool" active={filter==='stool'} onPress={() => setFilter('stool')} />
      </div>

      {Object.keys(grouped).length === 0 ? (
        <div style={{ padding: 48, textAlign: 'center', color: nyxColors.textSecondary, fontSize: 15, lineHeight: 1.5 }}>
          No events match these filters.
        </div>
      ) : Object.entries(grouped).map(([date, items]) => (
        <div key={date}>
          <div style={{
            padding: '20px 24px 8px',
            fontSize: 11, fontWeight: 500, color: nyxColors.textSecondary,
            textTransform: 'uppercase', letterSpacing: 0.8,
          }}>{date}</div>
          {items.map(e => (
            <HistoryRow
              key={e.id}
              event={e}
              expanded={expandedId === e.id}
              onToggle={() => setExpandedId(expandedId === e.id ? null : e.id)}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function HistoryRow({ event, expanded, onToggle }) {
  const config = EVENT_TYPES[event.event_type] || { label: 'Event', emoji: '·', symptom: false };
  const isSymptom = config.symptom;
  const isMeal = event.event_type === 'meal';
  const bc = isMeal && event.food_brand ? brandColor(event.food_brand) : null;
  const foodLabel = event.food_brand && event.food_product_name
    ? `${event.food_brand} · ${event.food_product_name}`
    : (event.food_product_name || null);

  return (
    <div
      onClick={onToggle}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 16,
        padding: '16px 24px',
        borderBottom: `1px solid ${nyxColors.border}`,
        background: expanded ? nyxColors.light : nyxColors.surface,
        cursor: 'pointer',
      }}
    >
      <div style={{
        width: 36, height: 36, borderRadius: 18, marginTop: 2,
        background: isSymptom ? nyxColors.eventSymptomLight
                  : isMeal    ? nyxColors.accentLight
                              : nyxColors.light,
        display: 'grid', placeItems: 'center', fontSize: 16,
      }}>{config.emoji}</div>
      <div style={{ flex: 1 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ fontSize: 15, fontWeight: 500, color: nyxColors.textPrimary }}>{config.label}</div>
          <div style={{ fontSize: 13, color: nyxColors.textSecondary }}>{event.time}</div>
        </div>
        {foodLabel && (
          <div style={{
            fontSize: 13, color: nyxColors.textSecondary, marginTop: 4,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            {bc && <span style={{ width: 6, height: 6, borderRadius: 3, background: bc, flexShrink: 0 }} />}
            {foodLabel}
          </div>
        )}
        {event.severity && (
          <div style={{ marginTop: 6 }}>
            <NyxBadge variant="symptom" label={`Severity ${event.severity}`} />
          </div>
        )}
        {expanded && (
          <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {event.notes && (
              <div style={{ fontSize: 14, color: nyxColors.textPrimary, lineHeight: 1.45 }}>{event.notes}</div>
            )}
            <div style={{
              display:'flex', gap: 16, paddingTop: 8, marginTop: 4,
              borderTop: `1px solid ${nyxColors.border}`,
            }}>
              <span style={{ fontSize: 14, color: nyxColors.accent, fontWeight: 500 }}>View</span>
              <span style={{ fontSize: 14, color: nyxColors.accent, fontWeight: 500 }}>Edit</span>
              <span style={{ fontSize: 14, color: nyxColors.eventSymptom }}>Remove</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { HistoryScreen, HistoryRow });
