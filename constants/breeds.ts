// Breed source lists for the pet profile breed picker.
//
// Extracted from EditPetModal (was a 15-item cat list + 25-item dog list living
// inline) so the data has one home and a future onboarding breed step can reuse
// it. The lists are deliberately comprehensive — breed carries breed-specific
// disease risk (Maine Coon→HCM, Persian→PKD, Doberman→DCM, Dalmatian→urate
// stones), so an accurate, complete list has clinical value on the vet report,
// not just competitive parity.
//
// Sourcing (verified 2026-07):
//   • Cats — the union of the TICA (championship) and CFA recognized breeds,
//     cross-checked against Wikipedia's "List of cat breeds".
//   • Dogs — the full American Kennel Club breed directory.
//
// Ordering: the non-pedigree / catch-all entries are pinned to the top (they are
// the highest-frequency real answers and can't be found by typing a pedigree
// name); everything after is alphabetical. The picker's search box is the real
// navigation for a list this long.

type BreedSpecies = 'dog' | 'cat' | 'other';

// ── Pinned, non-pedigree entries ────────────────────────────────────────────
// Most cats are non-pedigreed; "Domestic <coat>hair" is how shelters and vets
// classify them, so it leads. CompanAIn (the competitor that prompted this) drops
// these in favour of "Mixed/Unknown" — a gap for the majority of real cats.
const CAT_COMMON = ['Domestic Shorthair', 'Domestic Mediumhair', 'Domestic Longhair', 'Mixed breed'];
const DOG_COMMON = ['Mixed breed'];

// ── Cat pedigree breeds (TICA ∪ CFA) ────────────────────────────────────────
// Established, distinct breeds only. Show-ring coat-length *divisions* (e.g.
// "Bengal Longhair", "Scottish Fold Longhair", "Maine Coon Polydactyl") are
// folded into their parent, while genuinely distinct long/short-hair breeds are
// kept as their own entry (Balinese, Cymric, Somali, Himalayan, Exotic
// Shorthair, British/Oriental Longhair).
const CAT_PEDIGREE = [
  'Abyssinian', 'Aegean', 'American Bobtail', 'American Curl', 'American Shorthair',
  'American Wirehair', 'Australian Mist', 'Balinese', 'Bambino', 'Bengal', 'Birman',
  'Bombay', 'British Longhair', 'British Shorthair', 'Burmese', 'Burmilla', 'Chartreux',
  'Chausie', 'Colorpoint Shorthair', 'Cornish Rex', 'Cymric', 'Devon Rex', 'Donskoy',
  'Egyptian Mau', 'European Burmese', 'Exotic Shorthair', 'Havana Brown', 'Highlander',
  'Himalayan', 'Japanese Bobtail', 'Khao Manee', 'Korat', 'Kurilian Bobtail', 'LaPerm',
  'Lykoi', 'Maine Coon', 'Manx', 'Minuet', 'Munchkin', 'Nebelung', 'Norwegian Forest Cat',
  'Ocicat', 'Oriental Longhair', 'Oriental Shorthair', 'Persian', 'Peterbald', 'Pixiebob',
  'Ragamuffin', 'Ragdoll', 'Russian Blue', 'Savannah', 'Scottish Fold', 'Scottish Straight',
  'Selkirk Rex', 'Serengeti', 'Siamese', 'Siberian', 'Singapura', 'Snowshoe', 'Somali',
  'Sphynx', 'Thai', 'Tonkinese', 'Toybob', 'Toyger', 'Turkish Angora', 'Turkish Van',
];

// ── Dog breeds (AKC directory) ──────────────────────────────────────────────
// The AKC list, minus the show-ring names that diverge from what owners say —
// those are re-added in owner-friendly form in DOG_EXTRA below (so "German
// Shepherd Dog", "Poodle (Standard/Miniature/Toy)" and "Manchester Terrier
// (Standard/Toy)" are intentionally absent here).
const DOG_AKC = [
  'Affenpinscher', 'Afghan Hound', 'Airedale Terrier', 'Akita', 'Alaskan Klee Kai',
  'Alaskan Malamute', 'American Bulldog', 'American English Coonhound', 'American Eskimo Dog',
  'American Foxhound', 'American Hairless Terrier', 'American Leopard Hound',
  'American Staffordshire Terrier', 'American Water Spaniel', 'Anatolian Shepherd Dog',
  'Appenzeller Sennenhund', 'Australian Cattle Dog', 'Australian Kelpie', 'Australian Shepherd',
  'Australian Stumpy Tail Cattle Dog', 'Australian Terrier', 'Azawakh', 'Barbado da Terceira',
  'Barbet', 'Basenji', 'Basset Fauve de Bretagne', 'Basset Hound', 'Bavarian Mountain Scent Hound',
  'Beagle', 'Bearded Collie', 'Beauceron', 'Bedlington Terrier', 'Belgian Laekenois',
  'Belgian Malinois', 'Belgian Sheepdog', 'Belgian Tervuren', 'Bergamasco Sheepdog',
  'Berger Picard', 'Bernese Mountain Dog', 'Bichon Frise', 'Biewer Terrier',
  'Black and Tan Coonhound', 'Black Russian Terrier', 'Bloodhound', 'Blue Picardy Spaniel',
  'Bluetick Coonhound', 'Boerboel', 'Bohemian Shepherd', 'Bolognese', 'Border Collie',
  'Border Terrier', 'Borzoi', 'Boston Terrier', 'Bouvier des Ardennes', 'Bouvier des Flandres',
  'Boxer', 'Boykin Spaniel', 'Bracco Italiano', 'Braque du Bourbonnais', 'Braque Francais Pyrenean',
  'Braque Saint-Germain', 'Brazilian Terrier', 'Briard', 'Brittany', 'Broholmer', 'Brussels Griffon',
  'Bull Terrier', 'Bulldog', 'Bullmastiff', 'Cairn Terrier', 'Calupoh', 'Canaan Dog',
  'Canadian Eskimo Dog', 'Cane Corso', 'Cardigan Welsh Corgi', 'Carolina Dog',
  'Catahoula Leopard Dog', 'Caucasian Shepherd Dog', 'Cavalier King Charles Spaniel',
  'Central Asian Shepherd Dog', 'Cesky Terrier', 'Chesapeake Bay Retriever', 'Chihuahua',
  'Chinese Crested', 'Chinese Shar-Pei', 'Chinook', 'Chow Chow', "Cirneco dell'Etna",
  'Clumber Spaniel', 'Cocker Spaniel', 'Collie', 'Coton de Tulear', 'Croatian Sheepdog',
  'Curly-Coated Retriever', 'Czechoslovakian Vlciak', 'Dachshund', 'Dalmatian',
  'Dandie Dinmont Terrier', 'Danish-Swedish Farmdog', 'Deutscher Wachtelhund', 'Doberman Pinscher',
  'Dogo Argentino', 'Dogue de Bordeaux', 'Drentsche Patrijshond', 'Drever', 'Dutch Shepherd',
  'English Cocker Spaniel', 'English Foxhound', 'English Setter', 'English Springer Spaniel',
  'English Toy Spaniel', 'Entlebucher Mountain Dog', 'Estrela Mountain Dog', 'Eurasier',
  'Field Spaniel', 'Finnish Lapphund', 'Finnish Spitz', 'Flat-Coated Retriever', 'French Bulldog',
  'French Spaniel', 'German Longhaired Pointer', 'German Pinscher', 'German Shorthaired Pointer',
  'German Spitz', 'German Wirehaired Pointer', 'Giant Schnauzer', 'Glen of Imaal Terrier',
  'Golden Retriever', 'Gordon Setter', 'Grand Basset Griffon Vendéen', 'Great Dane',
  'Great Pyrenees', 'Greater Swiss Mountain Dog', 'Greyhound', 'Hamiltonstovare',
  'Hanoverian Scenthound', 'Harrier', 'Havanese', 'Hokkaido', 'Hovawart', 'Ibizan Hound',
  'Icelandic Sheepdog', 'Irish Red and White Setter', 'Irish Setter', 'Irish Terrier',
  'Irish Water Spaniel', 'Irish Wolfhound', 'Italian Greyhound', 'Jagdterrier', 'Japanese Akitainu',
  'Japanese Chin', 'Japanese Spitz', 'Japanese Terrier', 'Kai Ken', 'Karelian Bear Dog', 'Keeshond',
  'Kerry Blue Terrier', 'Kishu Ken', 'Komondor', 'Korean Jindo Dog', 'Kromfohrlander', 'Kuvasz',
  'Labrador Retriever', 'Lagotto Romagnolo', 'Lakeland Terrier', 'Lancashire Heeler',
  'Lapponian Herder', 'Large Munsterlander', 'Leonberger', 'Lhasa Apso', 'Löwchen', 'Maltese',
  'Mastiff', 'Miniature American Shepherd', 'Miniature Bull Terrier', 'Miniature Pinscher',
  'Miniature Schnauzer', 'Mountain Cur', 'Mudi', 'Neapolitan Mastiff', 'Nederlandse Kooikerhondje',
  'Newfoundland', 'Norfolk Terrier', 'Norrbottenspets', 'Norwegian Buhund', 'Norwegian Elkhound',
  'Norwegian Lundehund', 'Norwich Terrier', 'Nova Scotia Duck Tolling Retriever', 'Old Danish Pointer',
  'Old English Sheepdog', 'Otterhound', 'Papillon', 'Parson Russell Terrier', 'Pekingese',
  'Pembroke Welsh Corgi', 'Peruvian Inca Orchid', 'Petit Basset Griffon Vendéen', 'Pharaoh Hound',
  'Plott Hound', 'Pointer', 'Polish Lowland Sheepdog', 'Pomeranian', 'Pont-Audemer Spaniel',
  'Porcelaine', 'Portuguese Podengo', 'Portuguese Podengo Pequeno', 'Portuguese Pointer',
  'Portuguese Sheepdog', 'Portuguese Water Dog', 'Presa Canario', 'Pudelpointer', 'Pug', 'Puli',
  'Pumi', 'Pyrenean Mastiff', 'Pyrenean Shepherd', 'Rafeiro do Alentejo', 'Rat Terrier',
  'Redbone Coonhound', 'Rhodesian Ridgeback', 'Romanian Carpathian Shepherd',
  'Romanian Mioritic Shepherd Dog', 'Rottweiler', 'Russell Terrier', 'Russian Toy',
  'Russian Tsvetnaya Bolonka', 'Saarloos Wolfhond', 'Saint Bernard', 'Saluki', 'Samoyed',
  'Schapendoes', 'Schipperke', 'Scottish Deerhound', 'Scottish Terrier', 'Sealyham Terrier',
  'Segugio Italiano', 'Shetland Sheepdog', 'Shiba Inu', 'Shih Tzu', 'Shikoku Ken', 'Siberian Husky',
  'Silken Windhound', 'Silky Terrier', 'Skye Terrier', 'Sloughi', 'Slovakian Wirehaired Pointer',
  'Slovensky Cuvac', 'Slovensky Kopov', 'Small Munsterlander', 'Smooth Fox Terrier',
  'Soft Coated Wheaten Terrier', 'Spanish Mastiff', 'Spanish Water Dog', 'Spinone Italiano',
  'Stabyhoun', 'Staffordshire Bull Terrier', 'Standard Schnauzer', 'Sussex Spaniel',
  'Swedish Lapphund', 'Swedish Vallhund', 'Taiwan Dog', 'Teddy Roosevelt Terrier', 'Thai Bangkaew',
  'Thai Ridgeback', 'Tibetan Mastiff', 'Tibetan Spaniel', 'Tibetan Terrier', 'Tornjak', 'Tosa',
  'Toy Fox Terrier', 'Transylvanian Hound', 'Treeing Tennessee Brindle', 'Treeing Walker Coonhound',
  'Vizsla', 'Volpino Italiano', 'Weimaraner', 'Welsh Springer Spaniel', 'Welsh Terrier',
  'West Highland White Terrier', 'Wetterhoun', 'Whippet', 'Wire Fox Terrier',
  'Wirehaired Pointing Griffon', 'Wirehaired Vizsla', 'Working Kelpie', 'Xoloitzcuintli',
  'Yakutian Laika', 'Yorkshire Terrier',
];

// Owner-facing names AKC lists under show-ring conventions, plus the ubiquitous
// crosses AKC doesn't register but that are among the most-owned dogs. Size
// varieties (Poodle, Manchester Terrier) collapse to one entry — size is already
// captured by the weight field, and owners say "Poodle", not "Poodle (Toy)".
// "German Shepherd" and "Pit Bull Terrier" also preserve the strings the prior
// shipped list used, so existing pets keep matching the picker.
const DOG_EXTRA = [
  'German Shepherd', 'Poodle', 'Manchester Terrier', 'Pit Bull Terrier',
  'Aussiedoodle', 'Bernedoodle', 'Cavachon', 'Cavapoo', 'Chiweenie', 'Cockapoo',
  'Goldendoodle', 'Labradoodle', 'Maltipoo', 'Morkie', 'Pomsky', 'Puggle',
  'Schnoodle', 'Sheepadoodle', 'Shih-Poo', 'Yorkipoo',
];

// Most-owned breeds, surfaced right below the catch-alls so the common answer is
// visible without searching — the one virtue of the old short list. Without this
// a pure-alphabetical list pushes Labrador / French Bulldog / Golden Retriever
// past the picker's render cap, so a scanner can wrongly conclude "my breed
// isn't here" and bail to free-text "Other" (an off-catalog duplicate that
// erodes the breed→risk value the full list exists for). Every entry must also
// appear in the alphabetical source below; it's de-duplicated out of the tail.
const CAT_POPULAR = [
  'Maine Coon', 'Ragdoll', 'Persian', 'Siamese', 'Bengal', 'British Shorthair',
  'Sphynx', 'Scottish Fold', 'Abyssinian', 'American Shorthair',
];
const DOG_POPULAR = [
  'Labrador Retriever', 'French Bulldog', 'Golden Retriever', 'German Shepherd',
  'Poodle', 'Bulldog', 'Beagle', 'Rottweiler', 'Dachshund', 'Yorkshire Terrier',
  'Boxer', 'Pit Bull Terrier',
];

const byName = (a: string, b: string) => a.localeCompare(b);

// [catch-alls, popular, …everything else alphabetical]. The tail is sorted at
// module load (source arrays stay easy to edit) and de-duplicated against the
// pinned block so nothing appears twice.
const pinFirst = (pinned: string[], rest: string[]) => [
  ...pinned,
  ...rest.filter((b) => !pinned.includes(b)),
];

// readonly so the shared, app-wide singletons can't be mutated by a caller (a
// stray .sort()/.push() on the returned reference would corrupt every later read).
export const CAT_BREEDS: readonly string[] = pinFirst(
  [...CAT_COMMON, ...CAT_POPULAR],
  [...CAT_PEDIGREE].sort(byName),
);
export const DOG_BREEDS: readonly string[] = pinFirst(
  [...DOG_COMMON, ...DOG_POPULAR],
  [...DOG_AKC, ...DOG_EXTRA].sort(byName),
);

export function breedsForSpecies(species: BreedSpecies): readonly string[] {
  if (species === 'dog') return DOG_BREEDS;
  if (species === 'cat') return CAT_BREEDS;
  return [];
}

// Strip combining diacritical marks so an owner typing plain ASCII ("lowchen",
// "vendeen") still finds accented breeds ("Löwchen", "…Vendéen") — otherwise
// search, the only real navigation for a list this long, silently sends them to
// "Other" for a breed that IS in the list.
const foldDiacritics = (s: string) =>
  s.normalize('NFD').replace(new RegExp('[\\u0300-\\u036f]', 'g'), '');

// Diacritic- and case-insensitive substring match, preserving list order. Pure +
// exported so the picker's filtering is unit-tested without rendering.
export function filterBreeds(breeds: readonly string[], query: string): readonly string[] {
  const q = foldDiacritics(query.trim().toLowerCase());
  if (!q) return breeds;
  return breeds.filter((b) => foldDiacritics(b.toLowerCase()).includes(q));
}
