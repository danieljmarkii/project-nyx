// ──────────────────────────────────────────────────────────────────────────
// OnboardingScreen — pet name + species
// Mirrors app/onboarding/pet.tsx
// ──────────────────────────────────────────────────────────────────────────

function OnboardingScreen({ onComplete }) {
  const [name, setName] = React.useState('');
  const [species, setSpecies] = React.useState(null);
  const canContinue = name.trim().length > 0 && species !== null;

  return (
    <div style={{
      flex: 1, background: nyxColors.light, height: '100%',
      display: 'flex', flexDirection: 'column', justifyContent: 'center',
      padding: 24,
    }}>
      <div style={{
        fontSize: 28, fontWeight: 500, color: nyxColors.dark,
        letterSpacing: -0.3, marginBottom: 8,
      }}>Tell us about your pet.</div>
      <div style={{
        fontSize: 15, color: nyxColors.textSecondary, lineHeight: 1.5,
        marginBottom: 32,
      }}>This is all we need to get started. Everything else can be added later.</div>

      <NyxSectionLabel label="Name" style={{ marginBottom: 8 }} />
      <input
        value={name}
        onChange={e => setName(e.target.value)}
        placeholder="e.g. Luna"
        style={{
          border: `1px solid ${nyxColors.border}`, borderRadius: 8,
          padding: '13px 16px',
          fontSize: 15, color: nyxColors.textPrimary,
          background: nyxColors.surface,
          marginBottom: 24,
          fontFamily: 'inherit', outline: 'none',
        }}
      />

      <NyxSectionLabel label="Species" style={{ marginBottom: 8 }} />
      <div style={{ display: 'flex', gap: 8, marginBottom: 32 }}>
        {['dog', 'cat', 'other'].map(s => (
          <div key={s} style={{ flex: 1 }}>
            <NyxFilterChip
              label={s[0].toUpperCase() + s.slice(1)}
              active={species === s}
              variant="filled"
              onPress={() => setSpecies(s)}
            />
          </div>
        ))}
      </div>

      <NyxPrimaryButton
        label="Continue"
        onPress={() => canContinue && onComplete({ name: name.trim(), species })}
        disabled={!canContinue}
      />
    </div>
  );
}

Object.assign(window, { OnboardingScreen });
