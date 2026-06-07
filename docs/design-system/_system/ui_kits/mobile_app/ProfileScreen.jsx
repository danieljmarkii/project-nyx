// ──────────────────────────────────────────────────────────────────────────
// ProfileScreen — pet card + conditions + foods
// Cosmetic mirror of app/(tabs)/profile.tsx (heavily simplified)
// ──────────────────────────────────────────────────────────────────────────

function ProfileScreen({ pet }) {
  return (
    <div style={{
      flex: 1, background: nyxColors.light,
      padding: 24, paddingTop: 56, paddingBottom: 100,
      display: 'flex', flexDirection: 'column', gap: 24,
      overflowY: 'auto', height: '100%', boxSizing: 'border-box',
    }}>
      {/* Hero */}
      <div style={{ display:'flex', alignItems:'center', gap: 16 }}>
        <div style={{
          width: 64, height: 64, borderRadius: 32,
          background: `linear-gradient(135deg, ${nyxColors.momentGlow} 0%, ${nyxColors.eventSymptom} 60%, ${nyxColors.accent} 100%)`,
          display: 'grid', placeItems: 'center',
          fontFamily: "'Newsreader', Georgia, serif",
          fontSize: 32, color: '#FFFFFF', letterSpacing: -1.5,
          fontWeight: 400, paddingBottom: 4,
          boxShadow: `0 6px 20px ${nyxColors.momentGlow}40`,
        }}>{pet.name[0].toLowerCase()}</div>
        <div>
          <div style={{ fontSize: 28, fontWeight: 500, color: nyxColors.dark, letterSpacing: -0.3 }}>{pet.name}</div>
          <div style={{ fontSize: 13, color: nyxColors.textSecondary, marginTop: 2 }}>{pet.species} · {pet.breed || 'no breed set'}</div>
        </div>
      </div>

      {/* Diet trial card */}
      <NyxCard>
        <NyxSectionLabel label="Diet trial" style={{ marginBottom: 12 }} />
        <div style={{ fontSize: 15, color: nyxColors.textPrimary, lineHeight: 1.5, marginBottom: 12 }}>
          Day 12 of 56 — turkey-only protocol with Dr. Chen.
        </div>
        <div style={{ height: 6, borderRadius: 3, background: nyxColors.chartEmpty, overflow:'hidden', marginBottom: 8 }}>
          <div style={{ height:'100%', width: '21%', background: nyxColors.accent, borderRadius: 3 }} />
        </div>
        <div style={{ fontSize: 13, color: nyxColors.textSecondary }}>92% meal compliance</div>
      </NyxCard>

      {/* Conditions */}
      <NyxCard>
        <NyxSectionLabel label="Known conditions" style={{ marginBottom: 12 }} />
        <div style={{ display:'flex', flexDirection:'column', gap: 12 }}>
          {pet.conditions.map(c => (
            <div key={c.name} style={{
              display:'flex', justifyContent:'space-between', alignItems:'center',
              paddingTop: 12, borderTop: `1px solid ${nyxColors.border}`,
            }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 500, color: nyxColors.textPrimary }}>{c.name}</div>
                <div style={{ fontSize: 13, color: nyxColors.textSecondary, marginTop: 2 }}>{c.note}</div>
              </div>
              <NyxBadge variant="muted" label={c.status} />
            </div>
          ))}
          <div style={{
            paddingTop: 12, borderTop: `1px solid ${nyxColors.border}`,
            fontSize: 14, color: nyxColors.accent, fontWeight: 500,
          }}>＋ Add condition</div>
        </div>
      </NyxCard>

      {/* Foods */}
      <NyxCard>
        <NyxSectionLabel label="Foods" style={{ marginBottom: 12 }} />
        <div style={{ display:'flex', flexDirection:'column', gap: 0 }}>
          {pet.foods.map((f, i) => (
            <div key={i} style={{
              padding: '12px 0',
              borderBottom: i < pet.foods.length - 1 ? `1px solid ${nyxColors.border}` : 'none',
            }}>
              <div style={{
                fontSize: 11, fontWeight: 500, color: nyxColors.textTertiary,
                letterSpacing: 0.8, textTransform: 'uppercase',
              }}>{f.brand} · {f.format}</div>
              <div style={{ fontSize: 15, fontWeight: 500, color: nyxColors.textPrimary, marginTop: 2 }}>
                {f.product}
              </div>
            </div>
          ))}
        </div>
      </NyxCard>

      <NyxPrimaryButton label="Export report for vet" onPress={() => alert('Report flow not in MVP demo')} variant="secondary" />
    </div>
  );
}

Object.assign(window, { ProfileScreen });
