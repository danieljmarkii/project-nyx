// The finding identity the phone folds on and the server logs (Engines v3 PR-11a).
import { correlationCluster, findingIdentity } from './findingIdentity';
import { foldIdentity } from './signalFold';
import type { SignalFinding } from './signal';

const FINDINGS = [
  { type: 'food_symptom_correlation', symptomType: 'vomit', protein: 'chicken', proteins: ['turkey', 'chicken'] },
  { type: 'food_symptom_correlation', symptomType: 'itch', protein: 'beef' },
  { type: 'incident_red_flag', incidentType: 'diarrhea' },
  { type: 'trial_response' },
  { type: 'intake_decline', trigger: 'refused_normal_food' },
  { type: 'symptom_chronicity', symptomType: 'vomit' },
  { type: 'stood_down', symptomType: 'cough' },
];

describe('findingIdentity', () => {
  it('names each finding by type + the noun its sentence is about', () => {
    expect(FINDINGS.map(findingIdentity)).toEqual([
      'food_symptom_correlation:vomit:chicken+turkey',
      'food_symptom_correlation:itch:beef',
      'incident_red_flag:diarrhea',
      'trial_response',
      'intake_decline:refused_normal_food',
      'symptom_chronicity:vomit',
      'stood_down:cough',
    ]);
  });

  it('every key starts with its own type (migration 075 signal_shown_log_key_names_its_type)', () => {
    for (const f of FINDINGS) {
      const key = findingIdentity(f);
      expect(key === f.type || key.startsWith(`${f.type}:`)).toBe(true);
    }
  });

  it('is the phone\'s foldIdentity: one derivation, not a mirror', () => {
    for (const f of FINDINGS) expect(foldIdentity(f as unknown as SignalFinding)).toBe(findingIdentity(f));
  });

  it('CUL-1213: a cached row without the symptom or trigger keeps the shape it was keyed on', () => {
    expect(findingIdentity({ type: 'food_symptom_correlation', protein: 'beef' })).toBe('food_symptom_correlation:beef');
    expect(findingIdentity({ type: 'intake_decline' })).toBe('intake_decline');
  });

  it('a correlation cluster falls back to the single protein on rows cached before multi-protein findings', () => {
    expect(correlationCluster({ protein: 'lamb' })).toEqual(['lamb']);
    expect(correlationCluster({ protein: 'lamb', proteins: [] })).toEqual(['lamb']);
    expect(correlationCluster({ protein: 'lamb', proteins: ['duck'] })).toEqual(['duck']);
  });
});
