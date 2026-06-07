// ──────────────────────────────────────────────────────────────────────────
// Project Nyx — shared primitives
// Card · Button · Chip · Badge · SectionLabel · TabBar · FAB
// Direct ports of components/ui/* from danieljmarkii/project-nyx
// ──────────────────────────────────────────────────────────────────────────

const nyxColors = {
  // v1.2 — Linear Clean palette (May 2026). Cool neutrals, vivid mint
  // accent, hot rose symptom. Replaces the v1.1 warm-cream pass.
  accent: '#00C2A8',
  accentLight: '#E0FBF7',
  dark: '#0A0A0A',
  mid: '#262626',
  light: '#FAFAFA',
  surface: '#FFFFFF',
  subtle: '#F5F5F5',
  textPrimary: '#0A0A0A',
  textSecondary: '#525252',
  textTertiary: '#737373',
  textDisabled: '#A3A3A3',
  border: '#EAEAEA',
  borderStrong: '#D4D4D4',
  eventSymptom: '#F43F5E',
  eventSymptomLight: '#FFE4E6',
  chartEmpty: '#F0F0F0',
  // Earned color — used ONLY in completion / milestone moments. The single
  // warm element retained in v1.2; everything else is true cool grey.
  momentGlow: '#FBBF24',
};

// Brand color per food brand. Used as a small accent on food tiles ONLY.
// Not invented — these are the brands' actual identity colors at modest size.
const brandColors = {
  'Fancy Feast':     '#C0463A',
  'Open Farm':       '#1F5945',
  'Stella & Chewy':  '#2C6FA6',
  'Weruva':          '#E8A33C',
  'Royal Canin':     '#8B1F2E',
  'Hill\u2019s':     '#1C4E7A',
  // Fallback for unknown brands
  _default:          '#525252',
};
function brandColor(brand) { return brandColors[brand] || brandColors._default; }

function NyxCard({ children, elevated, noPadding, style }) {
  return (
    <div
      style={{
        background: nyxColors.surface,
        borderRadius: 16,
        padding: noPadding ? 0 : 24,
        border: elevated ? 'none' : `1px solid ${nyxColors.border}`,
        boxShadow: elevated ? '0 2px 10px rgba(0,0,0,0.10)' : 'none',
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function NyxSectionLabel({ label, style }) {
  return (
    <div
      style={{
        fontSize: 11,
        fontWeight: 500,
        color: nyxColors.textSecondary,
        textTransform: 'uppercase',
        letterSpacing: 0.8,
        ...style,
      }}
    >
      {label}
    </div>
  );
}

function NyxBadge({ label, variant = 'muted' }) {
  const palette = {
    symptom: { bg: nyxColors.eventSymptomLight, fg: nyxColors.eventSymptom },
    accent:  { bg: nyxColors.accentLight,       fg: nyxColors.accent },
    muted:   { bg: nyxColors.light,             fg: nyxColors.textSecondary },
  }[variant];
  return (
    <span style={{
      display: 'inline-block', background: palette.bg, color: palette.fg,
      fontSize: 11, fontWeight: 500, padding: '3px 8px', borderRadius: 6,
      alignSelf: 'flex-start',
    }}>{label}</span>
  );
}

function NyxFilterChip({ label, active, onPress, variant = 'default' }) {
  const filled = variant === 'filled';
  const style = active
    ? (filled
        ? { bg: nyxColors.dark, border: nyxColors.dark, fg: '#fff' }
        : { bg: nyxColors.accentLight, border: nyxColors.accent, fg: nyxColors.accent })
    : { bg: nyxColors.surface, border: nyxColors.border, fg: nyxColors.textSecondary };
  return (
    <button
      onClick={onPress}
      style={{
        padding: '6px 12px',
        background: style.bg,
        border: `1px solid ${style.border}`,
        borderRadius: 999,
        color: style.fg,
        fontSize: 13,
        fontWeight: 500,
        cursor: 'pointer',
        fontFamily: 'inherit',
        whiteSpace: 'nowrap',
      }}
    >{label}</button>
  );
}

function NyxPrimaryButton({ label, onPress, disabled, variant = 'primary', style }) {
  const base = {
    padding: '14px 20px',
    borderRadius: 16,
    border: '1px solid transparent',
    fontSize: 15,
    fontWeight: 500,
    fontFamily: 'inherit',
    cursor: disabled ? 'default' : 'pointer',
    width: '100%',
  };
  const variants = {
    primary: { background: nyxColors.dark, color: '#fff' },
    secondary: { background: 'transparent', color: nyxColors.textSecondary, borderColor: nyxColors.border },
    destructive: { background: 'transparent', color: '#C0392B' },
  };
  return (
    <button
      onClick={disabled ? undefined : onPress}
      disabled={disabled}
      style={{
        ...base, ...variants[variant],
        ...(disabled ? { background: nyxColors.border, color: nyxColors.textTertiary } : {}),
        ...style,
      }}
    >{label}</button>
  );
}

function NyxTabBar({ current, onChange }) {
  const tabs = ['Home', 'History', 'Pet'];
  return (
    <div style={{
      display: 'flex', height: 80, paddingBottom: 24, paddingTop: 10,
      background: nyxColors.surface,
      borderTop: `1px solid ${nyxColors.border}`,
    }}>
      {tabs.map(t => (
        <button key={t}
          onClick={() => onChange(t)}
          style={{
            flex: 1, background: 'none', border: 0, cursor: 'pointer',
            fontFamily: 'inherit',
            fontSize: 13, fontWeight: 500, letterSpacing: 0.4,
            color: current === t ? nyxColors.dark : nyxColors.textTertiary,
          }}
        >{t}</button>
      ))}
    </div>
  );
}

function NyxFAB({ open, onToggle }) {
  return (
    <button
      onClick={onToggle}
      aria-label={open ? 'Close menu' : 'Log event'}
      style={{
        position: 'absolute', bottom: 96, right: 20,
        width: 56, height: 56, borderRadius: 28,
        background: nyxColors.dark,
        border: 0, cursor: 'pointer',
        display: 'grid', placeItems: 'center',
        boxShadow: '0 2px 6px rgba(0,0,0,0.25)',
        zIndex: 5,
      }}
    >
      <div style={{
        width: 20, height: 20, position: 'relative',
        transform: open ? 'rotate(45deg)' : 'rotate(0)',
        transition: 'transform 180ms cubic-bezier(0.2,0.7,0.2,1)',
      }}>
        <span style={{ position:'absolute', left:0, top:9, width:20, height:2, background:'#fff', borderRadius:1 }} />
        <span style={{ position:'absolute', left:9, top:0, width:2, height:20, background:'#fff', borderRadius:1 }} />
      </div>
    </button>
  );
}

function NyxFABMenu({ visible, onClose, onPick }) {
  if (!visible) return null;
  return (
    <>
      <div onClick={onClose} style={{ position:'absolute', inset:0, background:'transparent', zIndex:4 }} />
      <div style={{
        position:'absolute', bottom: 160, right: 20, minWidth: 240,
        background: nyxColors.surface, border: `1px solid ${nyxColors.border}`,
        borderRadius: 16, paddingTop: 8, paddingBottom: 8,
        boxShadow: '0 4px 12px rgba(0,0,0,0.12)', zIndex: 5,
      }}>
        <div style={{
          fontSize: 11, fontWeight: 500, color: nyxColors.textSecondary,
          textTransform: 'uppercase', letterSpacing: 0.6,
          padding: '8px 16px 4px',
        }}>Recent meals</div>
        {[
          { brand: 'Fancy Feast', product: 'Chunky Chicken' },
          { brand: 'Open Farm', product: 'Homestead Turkey' },
        ].map(f => (
          <div key={f.product}
            onClick={() => onPick({ type: 'meal', food: f })}
            style={{
              display:'flex', alignItems:'center', gap:12,
              padding:'8px 16px', cursor:'pointer',
            }}
          >
            <span style={{ fontSize:18, width:24, textAlign:'center' }}>🍽</span>
            <span style={{ fontSize:15, color: nyxColors.textPrimary, fontWeight:500, flex:1 }}>
              {f.brand} {f.product}
            </span>
          </div>
        ))}
        <div onClick={() => onPick({ type: 'new-meal' })} style={{
          display:'flex', alignItems:'center', gap:12,
          padding:'8px 16px', cursor:'pointer',
        }}>
          <span style={{ fontSize:18, width:24, textAlign:'center' }}>✚</span>
          <span style={{ fontSize:15, color: nyxColors.textSecondary, fontWeight:500 }}>New meal</span>
        </div>

        <div style={{ height:1, background: nyxColors.border, margin:'8px 0' }} />

        <div style={{ display:'flex', gap:8, padding:'8px 16px' }}>
          <button onClick={() => onPick({ type: 'vomit' })} style={{
            flex:1, padding:'10px', background: nyxColors.eventSymptomLight,
            border:0, borderRadius: 16, cursor:'pointer',
            display:'flex', flexDirection:'column', alignItems:'center', gap:4,
            minHeight: 52, fontFamily:'inherit',
          }}>
            <span style={{ fontSize: 18 }}>🤢</span>
            <span style={{ fontSize: 12, color: nyxColors.eventSymptom, fontWeight: 500 }}>Vomit</span>
          </button>
          <button onClick={() => onPick({ type: 'diarrhea' })} style={{
            flex:1, padding:'10px', background: nyxColors.eventSymptomLight,
            border:0, borderRadius: 16, cursor:'pointer',
            display:'flex', flexDirection:'column', alignItems:'center', gap:4,
            minHeight: 52, fontFamily:'inherit',
          }}>
            <span style={{ fontSize: 18 }}>💩</span>
            <span style={{ fontSize: 12, color: nyxColors.eventSymptom, fontWeight: 500 }}>Loose stool</span>
          </button>
        </div>

        <div style={{ height:1, background: nyxColors.border, margin:'8px 0' }} />

        <div onClick={() => onPick({ type: 'open-log' })} style={{
          display:'flex', alignItems:'center', gap:12,
          padding:'8px 16px', cursor:'pointer',
        }}>
          <span style={{ fontSize:18, width:24, textAlign:'center' }}>➕</span>
          <span style={{ fontSize:15, color: nyxColors.textPrimary, fontWeight:500 }}>More events</span>
        </div>
      </div>
    </>
  );
}

Object.assign(window, {
  nyxColors, brandColors, brandColor,
  NyxCard, NyxSectionLabel, NyxBadge, NyxFilterChip, NyxPrimaryButton,
  NyxTabBar, NyxFAB, NyxFABMenu,
});
