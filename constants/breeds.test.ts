import { CAT_BREEDS, DOG_BREEDS, breedsForSpecies, filterBreeds } from './breeds';

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

  it('pins the non-pedigree catch-alls first, then sorts the remainder', () => {
    expect(CAT_BREEDS.slice(0, 4)).toEqual([
      'Domestic Shorthair', 'Domestic Mediumhair', 'Domestic Longhair', 'Mixed breed',
    ]);
    expect(DOG_BREEDS[0]).toBe('Mixed breed');

    const catTail = CAT_BREEDS.slice(4);
    expect(catTail).toEqual([...catTail].sort((a, b) => a.localeCompare(b)));
    const dogTail = DOG_BREEDS.slice(1);
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
