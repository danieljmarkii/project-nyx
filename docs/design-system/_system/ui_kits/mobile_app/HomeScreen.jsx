// ──────────────────────────────────────────────────────────────────────────
// HomeScreen — Signal / Today / Trend
// Mirrors components/home/{SignalZone,TodayZone,TrendZone}.tsx
// ──────────────────────────────────────────────────────────────────────────

function SignalZone({ pet, events }) {
  const hasEnough = events.length >= 7;
  if (hasEnough) {
    return (
      <NyxCard elevated>
        <NyxSectionLabel label="Signal" style={{ marginBottom: 16 }} />
        <div style={{
          fontFamily: "'Newsreader', Georgia, serif",
          fontSize: 22, fontWeight: 400, lineHeight: 1.3,
          letterSpacing: -0.3, color: nyxColors.textPrimary,
        }}>
          Vomiting dropped 60% in the two weeks after switching proteins — the diet trial appears to be working.
        </div>
      </NyxCard>
    );
  }

  // Empty / building state — warm radial backdrop hints the AI is "building"
  return (
    <NyxCard elevated style={{ position: 'relative', overflow: 'hidden' }}>
      {/* Soft warm aurora — only on the empty state, very subtle */}
      <div style={{
        position: 'absolute', top: -40, right: -40,
        width: 200, height: 200, borderRadius: '50%',
        background: `radial-gradient(circle, ${nyxColors.momentGlow}28 0%, ${nyxColors.accent}10 50%, transparent 75%)`,
        pointerEvents: 'none',
      }} />
      <div style={{ position: 'relative' }}>
        <NyxSectionLabel label="Signal" style={{ marginBottom: 16 }} />
        <div style={{
          fontFamily: "'Newsreader', Georgia, serif",
          fontSize: 22, fontWeight: 400, lineHeight: 1.3,
          letterSpacing: -0.3, color: nyxColors.textPrimary,
          marginBottom: 20,
        }}>
          Getting to know {pet.name}.
        </div>
        <div style={{
          fontSize: 14, color: nyxColors.textSecondary, lineHeight: 1.5, marginBottom: 16,
        }}>
          Keep logging and {pet.name}'s first pattern will surface in about a week.
        </div>
        <div style={{
          fontSize: 11, fontWeight: 500, color: nyxColors.textTertiary,
          textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8,
        }}>What the signal looks like:</div>
        {[
          "Vomiting dropped 60% in the two weeks after switching proteins — the diet trial appears to be working.",
          "Itching tends to peak 3–6 hours after meals containing chicken. No reaction to salmon-based foods.",
        ].map((t, i) => (
          <div key={i} style={{
            display: 'flex', gap: 10, padding: 14,
            background: nyxColors.subtle, borderRadius: 10, marginBottom: 8,
          }}>
            <div style={{ width: 2, borderRadius: 1, background: nyxColors.accent, opacity: 0.5 }} />
            <div style={{ flex: 1, fontSize: 13, lineHeight: 1.55, opacity: 0.65 }}>{t}</div>
          </div>
        ))}
      </div>
    </NyxCard>
  );
}

function TodayZone({ pet, events, onAdd, onSeeAll }) {
  // Today zone shows only events whose date label starts with "Today"
  const today = events.filter(e => (e.date || '').startsWith('Today'));
  const isEmpty = today.length === 0;
  const shown = today.slice(0, 3);
  const remaining = today.length - 3;

  return (
    <NyxCard>
      <NyxSectionLabel label="Today" style={{ marginBottom: 8 }} />
      {isEmpty ? (
        <div onClick={onAdd} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          paddingTop: 8, paddingBottom: 8, cursor: 'pointer',
        }}>
          <div style={{ fontSize: 15, color: nyxColors.textSecondary, lineHeight: 1.5, flex: 1 }}>
            Nothing logged yet — how's {pet.name} doing?
          </div>
          <div style={{ fontSize: 15, color: nyxColors.textSecondary, marginLeft: 16 }}>→</div>
        </div>
      ) : (
        <div onClick={onSeeAll} style={{ cursor: 'pointer', marginTop: 4 }}>
          {shown.map((e, i) => <EventStripRow key={e.id} event={e} showBorder={i > 0} />)}
          {remaining > 0 && (
            <div style={{
              fontSize: 13, color: nyxColors.accent, fontWeight: 500,
              paddingTop: 10, marginTop: 2,
              borderTop: `1px solid ${nyxColors.border}`,
            }}>
              {remaining} more event{remaining === 1 ? '' : 's'} today →
            </div>
          )}
        </div>
      )}
    </NyxCard>
  );
}

function EventStripRow({ event, showBorder }) {
  const isMeal = event.event_type === 'meal';
  const isSymptom = ['vomit', 'diarrhea', 'lethargy', 'itch'].includes(event.event_type);
  const config = {
    meal: { label: 'Meal', emoji: '🍽' },
    vomit: { label: 'Vomit', emoji: '🤢' },
    diarrhea: { label: 'Loose stool', emoji: '💩' },
    stool_normal: { label: 'Stool', emoji: '💩' },
    lethargy: { label: 'Lethargy', emoji: '😴' },
    itch: { label: 'Itch/Scratch', emoji: '🐾' },
    other: { label: 'Other', emoji: '➕' },
  }[event.event_type] || { label: 'Event', emoji: '·' };

  const bc = isMeal && event.food_brand ? brandColor(event.food_brand) : null;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 10,
      paddingTop: 10, paddingBottom: 10,
      borderTop: showBorder ? `1px solid ${nyxColors.border}` : 'none',
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: 16,
        background: isMeal ? nyxColors.accentLight
                  : isSymptom ? nyxColors.eventSymptomLight
                  : nyxColors.light,
        display: 'grid', placeItems: 'center', fontSize: 15,
      }}>{config.emoji}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 15, fontWeight: 500, color: nyxColors.textPrimary }}>{config.label}</div>
        {isMeal && event.food_product_name ? (
          <div style={{
            fontSize: 13, color: nyxColors.textSecondary, marginTop: 1,
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            {bc && <span style={{ width: 6, height: 6, borderRadius: 3, background: bc, flexShrink: 0 }} />}
            {event.food_product_name}
          </div>
        ) : null}
      </div>
      <div style={{ fontSize: 13, color: nyxColors.textSecondary }}>{event.time}</div>
    </div>
  );
}

function TrendZone({ pet, events }) {
  const symptoms = events.filter(e => ['vomit', 'diarrhea', 'lethargy', 'itch'].includes(e.event_type));
  const hasEnough = events.length >= 7;
  if (!hasEnough) {
    return (
      <NyxCard>
        <NyxSectionLabel label="Trend" style={{ marginBottom: 16 }} />
        <div style={{ fontSize: 15, color: nyxColors.textSecondary, lineHeight: 1.5 }}>
          A few more days of logs and we'll be able to show {pet.name}'s pattern.
        </div>
      </NyxCard>
    );
  }
  // Bars — fake 14-day data, last point is "today"
  const buckets = [0, 2, 3, 1, 4, 0, 2, 0, 1, 0, 0, 1, 0, 1];
  const max = Math.max(...buckets, 1);
  const maxH = 72;
  return (
    <NyxCard>
      <NyxSectionLabel label="Trend" style={{ marginBottom: 16 }} />
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom: 4 }}>
        <div style={{ fontSize: 15, fontWeight: 500, color: nyxColors.textPrimary }}>Vomit</div>
        <div style={{ fontSize: 13, fontWeight: 500, color: nyxColors.textPrimary }}>3 this week</div>
      </div>
      <div style={{ fontSize: 13, color: nyxColors.accent, marginBottom: 16 }}>↓ from 8 last week — improving</div>
      <div style={{ display:'flex', alignItems:'flex-end', height: maxH, gap: 2 }}>
        {buckets.map((c, i) => {
          const h = c > 0 ? Math.max(4, Math.round((c/max) * maxH)) : 0;
          return (
            <div key={i} style={{ flex: 1, height: maxH, display:'flex', alignItems:'flex-end' }}>
              <div style={{
                width:'100%',
                height: h > 0 ? h : maxH,
                background: h > 0 ? nyxColors.eventSymptom : nyxColors.chartEmpty,
                opacity: h > 0 ? 1 : 0.35,
                borderRadius: 2,
              }} />
            </div>
          );
        })}
      </div>
      <div style={{ display:'flex', justifyContent:'space-between', marginTop: 6 }}>
        <div style={{ fontSize: 11, color: nyxColors.textSecondary }}>May 1</div>
        <div style={{ fontSize: 11, color: nyxColors.textSecondary }}>Today</div>
      </div>
    </NyxCard>
  );
}

function HomeScreen({ pet, events, onOpenLog, onSeeAll }) {
  return (
    <div style={{
      flex: 1, background: nyxColors.light, overflowY: 'auto',
      padding: 24, paddingTop: 56, paddingBottom: 100,
      display: 'flex', flexDirection: 'column', gap: 24,
      height: '100%', boxSizing: 'border-box',
    }}>
      <SignalZone pet={pet} events={events} />
      <TodayZone pet={pet} events={events} onAdd={onOpenLog} onSeeAll={onSeeAll} />
      <TrendZone pet={pet} events={events} />
    </div>
  );
}

Object.assign(window, { HomeScreen, SignalZone, TodayZone, TrendZone, EventStripRow });
