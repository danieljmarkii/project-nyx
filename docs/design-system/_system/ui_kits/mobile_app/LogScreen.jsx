// ──────────────────────────────────────────────────────────────────────────
// LogScreen — type grid → food picker / severity / simple → completion
// Mirrors app/log.tsx + components/log/FoodPicker.tsx
// ──────────────────────────────────────────────────────────────────────────

const EVENT_TYPES = {
  meal:         { label: 'Meal',         emoji: '🍽',  hasFood: true,  symptom: false },
  vomit:        { label: 'Vomit',        emoji: '🤢',  hasFood: false, symptom: true  },
  diarrhea:     { label: 'Loose stool',  emoji: '💩',  hasFood: false, symptom: true  },
  stool_normal: { label: 'Stool',        emoji: '💩',  hasFood: false, symptom: false },
  lethargy:     { label: 'Lethargy',     emoji: '😴',  hasFood: false, symptom: true  },
  itch:         { label: 'Itch/Scratch', emoji: '🐾',  hasFood: false, symptom: true  },
  other:        { label: 'Other',        emoji: '➕',  hasFood: false, symptom: false },
};

function LogScreen({ pet, onClose, onConfirm, initialType }) {
  const [step, setStep] = React.useState(initialType ? (EVENT_TYPES[initialType].hasFood ? 'food' : 'simple') : 'type');
  const [type, setType] = React.useState(initialType || null);
  const [severity, setSeverity] = React.useState(null);
  const [notes, setNotes] = React.useState('');
  const [confirmedFood, setConfirmedFood] = React.useState(null);

  function pickType(key) {
    setType(key);
    if (key === 'meal') setStep('food');
    else if (EVENT_TYPES[key].symptom) setStep('symptom');
    else setStep('simple');
  }

  function back() {
    if (step === 'type') onClose();
    else { setType(null); setSeverity(null); setStep('type'); }
  }

  function confirm(payload) {
    setConfirmedFood(payload?.foodBrand || null);
    setStep('complete');
    onConfirm({
      event_type: type,
      severity,
      notes: notes.trim() || null,
      food_product_name: payload?.foodProduct,
      food_brand: payload?.foodBrand,
    });
  }

  if (step === 'complete') return <CompletionState petName={pet.name} type={type} foodBrand={confirmedFood} />;

  return (
    <div style={{
      flex: 1, background: nyxColors.surface, height: '100%',
      display: 'flex', flexDirection: 'column',
    }}>
      {/* header */}
      <div style={{
        display: 'flex', alignItems: 'center',
        padding: '52px 24px 16px',
        borderBottom: `1px solid ${nyxColors.border}`,
      }}>
        title={step === 'type' ? `Log for ${pet.name}` : (step === 'food' ? `What did ${pet.name} eat?` : EVENT_TYPES[type].label)}
        onLeft={back}
        onRight={step === 'type' ? onClose : null}
        leftIcon={step === 'type' ? null : '←'}
        rightIcon={step === 'type' ? '✕' : null}
      />
      {step === 'type' && <TypeGrid onPick={pickType} />}
      {step === 'food' && <FoodPicker onPick={(f) => confirm(f)} />}
      {step === 'symptom' && (
        <SymptomForm
          type={type}
          severity={severity}
          setSeverity={setSeverity}
          notes={notes}
          setNotes={setNotes}
          onConfirm={() => confirm()}
        />
      )}
      {step === 'simple' && (
        <SimpleForm
          type={type}
          notes={notes}
          setNotes={setNotes}
          onConfirm={() => confirm()}
        />
      )}
    </div>
  );
}

function LogHeader({ title, onLeft, onRight, leftIcon, rightIcon }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      padding: '52px 24px 16px',
      borderBottom: `1px solid ${nyxColors.border}`,
    }}>
      <div style={{ width: 32 }}>
        {leftIcon && (
          <button onClick={onLeft} style={{
            background:'none', border:0, cursor:'pointer', fontSize: 22, color: nyxColors.dark,
            padding: 0,
          }}>{leftIcon}</button>
        )}
      </div>
      <div style={{ flex: 1, textAlign: 'center', fontSize: 17, fontWeight: 500, color: nyxColors.dark }}>{title}</div>
      <div style={{ width: 32, textAlign: 'right' }}>
        {rightIcon && (
          <button onClick={onRight} style={{
            background:'none', border:0, cursor:'pointer', fontSize: 18, color: nyxColors.textSecondary,
            padding: 0,
          }}>{rightIcon}</button>
        )}
      </div>
    </div>
  );
}

function TypeGrid({ onPick }) {
  const keys = Object.keys(EVENT_TYPES).filter(k => k !== 'diarrhea');
  return (
    <div style={{
      padding: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16,
      overflowY: 'auto',
    }}>
      {keys.map(k => (
        <button key={k} onClick={() => onPick(k)} style={{
          aspectRatio: 1.3, background: nyxColors.light,
          border: 0, borderRadius: 16, cursor: 'pointer',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
          fontFamily: 'inherit',
        }}>
          <div style={{ fontSize: 28 }}>{EVENT_TYPES[k].emoji}</div>
          <div style={{ fontSize: 15, fontWeight: 500, color: nyxColors.dark }}>{EVENT_TYPES[k].label}</div>
        </button>
      ))}
      <button style={{
        aspectRatio: 1.3, background: nyxColors.surface,
        border: `1px dashed ${nyxColors.border}`, borderRadius: 16, cursor: 'pointer',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8,
        fontFamily: 'inherit',
      }}>
        <div style={{ fontSize: 28 }}>📷</div>
        <div style={{ fontSize: 15, fontWeight: 500, color: nyxColors.dark }}>Attach photo</div>
      </button>
    </div>
  );
}

function FoodPicker({ onPick }) {
  const foods = [
    { brand: 'Fancy Feast', product: 'Chunky Chicken Feast', format: 'WET' },
    { brand: 'Open Farm', product: 'Homestead Turkey & Chicken', format: 'DRY' },
    { brand: 'Stella & Chewy', product: 'Salmon Marie\u2019s Dinner', format: 'FREEZE-DRIED' },
    { brand: 'Open Farm', product: 'Wild Caught Salmon', format: 'WET' },
  ];
  return (
    <div style={{ padding: 16, overflowY: 'auto' }}>
      <div style={{
        fontSize: 11, fontWeight: 500, color: nyxColors.textSecondary,
        textTransform: 'uppercase', letterSpacing: 0.8, marginBottom: 12,
      }}>Recent</div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {foods.map((f, i) => {
          const bc = brandColor(f.brand);
          return (
            <button key={i}
              onClick={() => onPick({ foodBrand: f.brand, foodProduct: f.product })}
              style={{
                textAlign:'left', minHeight: 96,
                border: `1px solid ${nyxColors.border}`, borderRadius: 16,
                background: nyxColors.surface, padding: 16, cursor: 'pointer',
                display:'flex', flexDirection:'column', gap: 8, fontFamily:'inherit',
                position: 'relative', overflow: 'hidden',
              }}
            >
              {/* Brand color dot — small, top-left. Adds identity without inventing color. */}
              <div style={{
                width: 8, height: 8, borderRadius: 4, background: bc,
                position: 'absolute', top: 14, left: 14,
              }} />
              <div style={{
                fontSize: 11, fontWeight: 500,
                color: bc,
                letterSpacing: 0.8, paddingLeft: 14,
              }}>{f.brand.toUpperCase()} · {f.format}</div>
              <div style={{
                fontSize: 15, fontWeight: 500, color: nyxColors.textPrimary,
                lineHeight: 1.3,
              }}>{f.product}</div>
            </button>
          );
        })}
        <button style={{
          minHeight: 96,
          border: `1px dashed ${nyxColors.border}`, borderRadius: 16,
          background: nyxColors.surface, padding: 16, cursor: 'pointer',
          display:'flex', alignItems:'center', justifyContent:'center', gap: 8, fontFamily:'inherit',
        }}>
          <span style={{ fontSize: 18 }}>＋</span>
          <span style={{ fontSize: 14, color: nyxColors.textSecondary, fontWeight: 500 }}>Add new food</span>
        </button>
      </div>
    </div>
  );
}

function SymptomForm({ type, severity, setSeverity, notes, setNotes, onConfirm }) {
  const label = EVENT_TYPES[type].label;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <div style={{ padding: 24, overflowY: 'auto', flex: 1, display:'flex', flexDirection:'column', gap: 24 }}>
        <div style={{ fontSize: 22, fontWeight: 500, color: nyxColors.dark, letterSpacing: -0.3 }}>How severe?</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, paddingBottom: 8 }}>
          {[1,2,3,4,5].map(v => {
            const isSelected = severity === v;
            const fill = 0.15 + (v - 1) * 0.175;
            return (
              <div key={v} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap: 6 }}>
                <button onClick={() => setSeverity(v)} style={{
                  width: 52, height: 52, borderRadius: 26,
                  background: isSelected ? nyxColors.dark : `rgba(26,26,26,${fill})`,
                  color: isSelected || fill > 0.6 ? '#fff' : nyxColors.dark,
                  border: isSelected ? `1px solid ${nyxColors.dark}` : '1px solid transparent',
                  fontSize: 18, fontWeight: 500, cursor: 'pointer', fontFamily:'inherit',
                }}>{v}</button>
                <div style={{ fontSize: 11, color: nyxColors.textSecondary, height: 16 }}>
                  {v===1?'Mild':v===5?'Severe':''}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{ height: 1, background: nyxColors.border }} />
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Add a note (optional)"
          style={{
            fontSize: 15, color: nyxColors.textPrimary,
            border: `1px solid ${nyxColors.border}`, borderRadius: 8,
            padding: 12,
            minHeight: 44, maxHeight: 88,
            fontFamily: 'inherit', resize: 'none', outline: 'none',
          }}
        />
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ fontSize: 14, color: nyxColors.textSecondary }}>May 14 · 9:14 AM</div>
          <div style={{ fontSize: 14, color: nyxColors.accent }}>Change</div>
        </div>
      </div>
      <div style={{ borderTop: `1px solid ${nyxColors.border}`, padding: 16 }}>
        <NyxPrimaryButton
          label={`Log ${label.toLowerCase()}`}
          onPress={onConfirm}
          disabled={severity === null}
        />
      </div>
    </div>
  );
}

function SimpleForm({ type, notes, setNotes, onConfirm }) {
  const label = EVENT_TYPES[type].label;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
      <div style={{ padding: 24, overflowY: 'auto', flex: 1, display:'flex', flexDirection:'column', gap: 16 }}>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Add a note (optional)"
          style={{
            fontSize: 15, color: nyxColors.textPrimary,
            border: `1px solid ${nyxColors.border}`, borderRadius: 8,
            padding: 12,
            minHeight: 44, maxHeight: 88,
            fontFamily: 'inherit', resize: 'none', outline: 'none',
          }}
        />
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ fontSize: 14, color: nyxColors.textSecondary }}>May 14 · 9:14 AM</div>
          <div style={{ fontSize: 14, color: nyxColors.accent }}>Change</div>
        </div>
      </div>
      <div style={{ borderTop: `1px solid ${nyxColors.border}`, padding: 16 }}>
        <NyxPrimaryButton
          label={label === 'Other' ? 'Log event' : `Log ${label.toLowerCase()}`}
          onPress={onConfirm}
        />
      </div>
    </div>
  );
}

function CompletionState({ petName, type, foodBrand }) {
  const [phase, setPhase] = React.useState(0);
  // Phase 0 → 1 (200ms): check appears, glow expands
  // Phase 1 → 2 (700ms): "Logged for Luna" + (optional) food brand line settles in
  React.useEffect(() => {
    const t1 = requestAnimationFrame(() => setPhase(1));
    const t2 = setTimeout(() => setPhase(2), 280);
    return () => { cancelAnimationFrame(t1); clearTimeout(t2); };
  }, []);

  const message = (() => {
    if (!petName) return 'Logged';
    if (type === 'meal' && foodBrand) return `Logged ${foodBrand} for ${petName}`;
    return `Logged for ${petName}`;
  })();

  return (
    <div style={{
      flex: 1, background: nyxColors.surface, height: '100%',
      display:'flex', flexDirection:'column',
      alignItems:'center', justifyContent:'center', gap: 20,
      position: 'relative', overflow: 'hidden',
    }}>
      {/* Radial warm glow — the earned color moment. Expands behind the check. */}
      <div style={{
        position: 'absolute',
        width: phase >= 1 ? 480 : 80,
        height: phase >= 1 ? 480 : 80,
        borderRadius: '50%',
        background: `radial-gradient(circle, ${nyxColors.momentGlow}38 0%, ${nyxColors.momentGlow}10 40%, transparent 70%)`,
        transition: 'width 600ms cubic-bezier(0.2,0.7,0.2,1), height 600ms cubic-bezier(0.2,0.7,0.2,1)',
        pointerEvents: 'none',
      }} />
      {/* Check ring */}
      <div style={{
        width: 88, height: 88, borderRadius: 44,
        background: nyxColors.surface,
        border: `2px solid ${nyxColors.accent}`,
        display: 'grid', placeItems: 'center',
        transform: phase >= 1 ? 'scale(1)' : 'scale(0.6)',
        opacity: phase >= 1 ? 1 : 0,
        transition: 'transform 360ms cubic-bezier(0.34, 1.56, 0.64, 1), opacity 200ms',
        boxShadow: phase >= 1 ? `0 6px 22px ${nyxColors.momentGlow}40` : 'none',
        position: 'relative',
        zIndex: 1,
      }}>
        {/* Hand-drawn check — animates in */}
        <svg width="40" height="40" viewBox="0 0 40 40">
          <path d="M11 21 L18 27 L29 14"
            stroke={nyxColors.accent}
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            style={{
              strokeDasharray: 40,
              strokeDashoffset: phase >= 1 ? 0 : 40,
              transition: 'stroke-dashoffset 360ms cubic-bezier(0.45, 0, 0.2, 1) 120ms',
            }}
          />
        </svg>
      </div>
      <div style={{
        fontFamily: "'Newsreader', Georgia, serif",
        fontSize: 22, fontWeight: 500, color: nyxColors.dark,
        letterSpacing: -0.3,
        opacity: phase >= 2 ? 1 : 0,
        transform: phase >= 2 ? 'translateY(0)' : 'translateY(6px)',
        transition: 'opacity 280ms, transform 280ms',
        textAlign: 'center', padding: '0 24px',
        position: 'relative', zIndex: 1,
      }}>{message}</div>
    </div>
  );
}

Object.assign(window, { LogScreen, EVENT_TYPES });
