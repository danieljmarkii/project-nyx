// The one thing standing between `lib/dietTrial.trialFoodKey` and a silent
// client/server split on food identity (B-417 PR 7).
//
// `generate-report` cannot import `lib/food.foodIntakeKey` — `lib/food.ts` carries
// an extensionless `import type … from './db'`, which Deno will not resolve and
// which pulls the expo-sqlite stack into the type graph — so the Edge Function
// reads its §5.4 identity from `lib/dietTrial.trialFoodKey` instead. Two
// implementations of one key is precisely the shape that produced three off-diet
// predicates, so this suite is the counter-force: jest CAN see both, and asserts
// they are the same function over inputs the app actually produces.
//
// If this fails, do NOT "fix" it by editing one side to match. The two keys index
// the same rows: the client's food cache and the trial's allowed set are matched
// against each other on this string, so a divergence classifies a compliant
// owner's prescribed diet as an off-diet exposure on the vet report.
import { trialFoodKey } from './dietTrial';
import { foodIntakeKey } from './food';

const BRANDS = [
  'Royal Canin',
  'royal canin',
  'ROYAL CANIN',
  "Hill's",
  'Zuke’s',
  '',
  '  ',
  'Ziwi Peak',
  'Purina Pro Plan',
];
const PRODUCTS = [
  'Hydrolyzed Protein HP',
  'hydrolyzed protein hp',
  'Mini Naturals',
  'z/d',
  '',
  ' ',
  'Air-Dried Venison',
];

describe('trialFoodKey ≡ foodIntakeKey', () => {
  it('agrees on every brand × product combination', () => {
    for (const brand of BRANDS) {
      for (const product of PRODUCTS) {
        expect(trialFoodKey(brand, product)).toBe(foodIntakeKey(brand, product));
      }
    }
  });

  it('folds case, which is what makes a re-photographed bag the same food (§5.4)', () => {
    expect(trialFoodKey('Royal Canin', 'Hydrolyzed Protein HP')).toBe(
      trialFoodKey('ROYAL CANIN', 'hydrolyzed protein hp'),
    );
  });

  it('keeps brand and product on opposite sides of the separator', () => {
    // Without a separator "Ziwi" + "Peak Venison" and "Ziwi Peak" + "Venison"
    // would collide, and a brand-renamed capture of one food would silently
    // become another. The unit separator is what stops that.
    expect(trialFoodKey('Ziwi', 'Peak Venison')).not.toBe(trialFoodKey('Ziwi Peak', 'Venison'));
  });

  it('tolerates the nulls the report layer actually hands it', () => {
    // `meals ⋈ food_items` is a LEFT JOIN: an un-hydrated or archived food row
    // yields null brand/product. The client passes `?? ''`; the server passes the
    // nulls straight through, so the null-coalescing has to live in the helper or
    // the two sides diverge on exactly the rows most likely to be mis-classified.
    expect(trialFoodKey(null, null)).toBe(foodIntakeKey('', ''));
    expect(trialFoodKey(null, 'z/d')).toBe(foodIntakeKey('', 'z/d'));
    expect(trialFoodKey("Hill's", null)).toBe(foodIntakeKey("Hill's", ''));
  });
});
