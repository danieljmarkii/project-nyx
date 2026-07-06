import { CAT_BREEDS, DOG_BREEDS, breedsForSpecies, filterBreeds, resolveBreedFieldState } from './breeds';

// The exact strings the v0.1 lists shipped. Every one must survive into the new
// list — otherwise an existing pet carrying that breed silently drops to the
// free-text "Other" path when the profile is reopened. This is the guard behind
// the owner-friendly renames (German Shepherd / Poodle / Pit Bull Terrier) that
// intentionally diverge from strict AKC show-ring naming.
const LEGACY_CAT = [
  'Domestic Shorthair', 'Maine Coon', 'Ragdoll', 'Bengal', 'British Shorthair', 'Persian',
  'Siamese', 'Abyssinian', 'Scottish Fold', 'Sphynx', 'Russian Blue', 'Norwegian Forest Cat',
  'American Shorthair', 'Birman', 'Burmese',
];
const LEGACY_DOG = [
  'Mixed breed', 'Labrador Retriever', 'French Bulldog', 'Golden Retriever', 'German Shepherd',
  'Bulldog', 'Poodle', 'Beagle', 'Rottweiler', 'Dachshund', 'Pembroke Welsh Corgi',
  'Australian Shepherd', 'Yorkshire Terrier', 'Boxer', 'Cavalier King Charles Spaniel',
  'Doberman Pinscher', 'Great Dane', 'Miniature Schnauzer', 'Siberian Husky', 'Boston Terrier',
  'Bernese Mountain Dog', 'Shih Tzu', 'Havanese', 'Border Collie', 'Pit Bull Terrier',
];

describe('breed lists', () => {
  it.each([['cat', CAT_BREEDS], ['dog', DOG_BREEDS]] as const)(
    '%s list has no duplicate entries',
    (_species, list) => {
      expect(new Set(list).size).toBe(list.length);
    },
  );

  it.each([['cat', CAT_BREEDS], ['dog', DOG_BREEDS]] as const)(
    '%s entries are all non-empty and trimmed',
    (_species, list) => {
      for (const b of list) {
        expect(b.length).toBeGreaterThan(0);
        expect(b).toBe(b.trim());
      }
    },
  );

  it('is meaningfully more robust than the v0.1 lists (15 cats / 25 dogs)', () => {
    expect(CAT_BREEDS.length).toBeGreaterThanOrEqual(60);
    expect(DOG_BREEDS.length).toBeGreaterThanOrEqual(250);
  });

  it('keeps every legacy cat breed so existing pets still match the picker', () => {
    for (const b of LEGACY_CAT) expect(CAT_BREEDS).toContain(b);
  });

  it('keeps every legacy dog breed so existing pets still match the picker', () => {
    for (const b of LEGACY_DOG) expect(DOG_BREEDS).toContain(b);
  });

  it('pins the non-pedigree catch-alls to the very top', () => {
    expect(CAT_BREEDS.slice(0, 4)).toEqual([
      'Domestic Shorthair', 'Domestic Mediumhair', 'Domestic Longhair', 'Mixed breed',
    ]);
    expect(DOG_BREEDS[0]).toBe('Mixed breed');
  });

  it('surfaces popular breeds above the alphabetical remainder', () => {
    // A cat owner sees Maine Coon without searching — before the first purely
    // alphabetical entry (Aegean).
    expect(CAT_BREEDS.indexOf('Maine Coon')).toBeLessThan(CAT_BREEDS.indexOf('Aegean'));
    // The most-owned dog breeds sit before the alphabetical mass (Affenpinscher
    // is the first AKC "A"), so they aren't pushed past the picker's render cap.
    for (const b of ['Labrador Retriever', 'French Bulldog', 'Golden Retriever']) {
      expect(DOG_BREEDS.indexOf(b)).toBeGreaterThan(-1);
      expect(DOG_BREEDS.indexOf(b)).toBeLessThan(DOG_BREEDS.indexOf('Affenpinscher'));
    }
  });

  it('keeps the remainder after the pinned block alphabetical', () => {
    const catTail = CAT_BREEDS.slice(CAT_BREEDS.indexOf('Aegean'));
    expect(catTail).toEqual([...catTail].sort((a, b) => a.localeCompare(b)));
    const dogTail = DOG_BREEDS.slice(DOG_BREEDS.indexOf('Affenpinscher'));
    expect(dogTail).toEqual([...dogTail].sort((a, b) => a.localeCompare(b)));
  });

  it('folds AKC show-ring size varieties into owner-friendly names', () => {
    expect(DOG_BREEDS).toContain('Poodle');
    expect(DOG_BREEDS).not.toContain('Poodle (Standard)');
    expect(DOG_BREEDS).toContain('German Shepherd');
    expect(DOG_BREEDS).not.toContain('German Shepherd Dog');
    // A common cross AKC doesn't register but real owners have.
    expect(DOG_BREEDS).toContain('Goldendoodle');
  });
});

describe('breedsForSpecies', () => {
  it('returns the matching list for cats and dogs', () => {
    expect(breedsForSpecies('cat')).toBe(CAT_BREEDS);
    expect(breedsForSpecies('dog')).toBe(DOG_BREEDS);
  });

  it('returns an empty list for "other" (the free-text path)', () => {
    expect(breedsForSpecies('other')).toEqual([]);
  });
});

describe('resolveBreedFieldState', () => {
  it('opens empty (not free-text) when no breed is stored', () => {
    expect(resolveBreedFieldState(null, 'cat')).toEqual({ breed: '', isOther: false });
    expect(resolveBreedFieldState('', 'dog')).toEqual({ breed: '', isOther: false });
  });

  it('keeps an in-list breed on the picker path (not free-text)', () => {
    expect(resolveBreedFieldState('Maine Coon', 'cat')).toEqual({ breed: 'Maine Coon', isOther: false });
    expect(resolveBreedFieldState('Labrador Retriever', 'dog')).toEqual({
      breed: 'Labrador Retriever',
      isOther: false,
    });
  });

  it('routes a breed absent from the species list to the free-text field', () => {
    // A real breed, but on the wrong species → not in that list → free text.
    expect(resolveBreedFieldState('Maine Coon', 'dog')).toEqual({ breed: 'Maine Coon', isOther: true });
    expect(resolveBreedFieldState('Wolfhound mix', 'dog')).toEqual({
      breed: 'Wolfhound mix',
      isOther: true,
    });
  });

  it('routes any breed on an "other"-species pet to free text (empty list)', () => {
    expect(resolveBreedFieldState('Rabbit', 'other')).toEqual({ breed: 'Rabbit', isOther: true });
  });
});

describe('filterBreeds', () => {
  const SAMPLE = ['Abyssinian', 'Maine Coon', 'Ragdoll', 'Russian Blue', 'Siamese'];

  it('returns the list unchanged (same reference) for an empty or whitespace query', () => {
    expect(filterBreeds(SAMPLE, '')).toBe(SAMPLE);
    expect(filterBreeds(SAMPLE, '   ')).toBe(SAMPLE);
  });

  it('matches a substring case-insensitively', () => {
    expect(filterBreeds(SAMPLE, 'russ')).toEqual(['Russian Blue']);
    expect(filterBreeds(SAMPLE, 'COON')).toEqual(['Maine Coon']);
  });

  it('matches accented breeds when the owner types plain ASCII', () => {
    const ACCENTED = ['Löwchen', 'Grand Basset Griffon Vendéen', 'Poodle'];
    expect(filterBreeds(ACCENTED, 'lowchen')).toEqual(['Löwchen']);
    expect(filterBreeds(ACCENTED, 'vendeen')).toEqual(['Grand Basset Griffon Vendéen']);
  });

  it('matches anywhere in the name and preserves list order', () => {
    expect(filterBreeds(SAMPLE, 'an')).toEqual(['Abyssinian', 'Russian Blue']);
  });

  it('trims the query before matching', () => {
    expect(filterBreeds(SAMPLE, '  coon  ')).toEqual(['Maine Coon']);
  });

  it('returns an empty array when nothing matches', () => {
    expect(filterBreeds(SAMPLE, 'zzz')).toEqual([]);
  });
});
