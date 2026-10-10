# Where apps put an owner's medicines, and what they call it
**Date:** 2026-10-09 · 🧊 Frozen point-in-time research artifact. Do not version-bump; correct additively (§V). · **Method:** one isolated web sweep (about 60 tool calls). App Store facts come from Apple's iTunes lookup API (US storefront), so they are the developers' own marketing copy, not labels read off the apps' screens. No app was installed and no screenshot was inspected. · **Commissioned for:** the medication revamp's round 2 (CUL-1698): should the Foods tab widen into one place for foods, medicines and supplements, and what would owners call it?

> **What this is.** Evidence, not decisions (`docs/research/README.md`). The one-line implications are tagged `[inferred]` and are not rulings. It extends `2026-09-medication-competitive-landscape.md` (the medication features themselves) and does not repeat it.

Claims are tagged `[verified-primary]` (read at the source), `[secondary]` (a review, a search snippet or a forum says so) or `[inferred]` (reasoning). The four claims marked **checked at use** were fetched again at their sources by the session that committed this brief (§V).

## TL;DR

1. **No app checked puts an owner's foods and medicines in one list.** The closest is Petfetti, which offers three separate libraries side by side (food, medications, parasite treatments). Most pet apps keep medicines inside health records or reminders; human health apps give medicines a screen of their own called *Medications*.
2. **Where supplements go depends on the kind of app.** Medication apps (Apple Health, CareClinic, Bearable) treat them like medicines, with schedules; nutrition apps (Cronometer, MyFitnessPal) log them as food. Most pet apps never mention supplements.
3. **US rules have no supplement category for animals.** The FDA and AAFCO classify a product as either food or a new animal drug, by its intended use. The NASC seal is a voluntary industry program.
4. **Elimination-trial guidance treats flavoured medicines, supplements and pill treats as part of the diet**: stopped or swapped, while heartworm and other preventives continue. A 2014 study found undeclared soy, pork or beef in such products.
5. **No evidence turned up for a word owners use for one place holding both.** "Pantry" appears only in tiny food-only apps and collides with charity "pet food pantry" programs; "medicine cabinet" means a home first-aid kit. Vet diet-history forms ask about foods, supplements and medications as separate questions.

## §1 Navigation: where medicines live

**Pet apps**
- **Petfetti** (29 ratings, id 6471319447): "Custom libraries for food, medications and parasite treatments." Its website lists "Food library", "Medication library" and "Antiparasitics library" under "More features", and never mentions supplements. Whether the three share one screen could not be confirmed. `[verified-primary]` **Checked at use.**
- **DogLog** (1,366 ratings, id 1229529595): one activity log whose entry types include Food and Medicine ("Log activities, such as giving food, going on a walk, and giving medication"). A log, not a library. `[verified-primary]`
- **11pets** (id 1232470530): "medication reminders and appointment scheduling", "health records". Tab names not found. `[verified-primary]`
- **GreatPetCare** (sold by "Pawprint Acquisition, LLC", id 934948619): "the one place for managing medical records, feeding instructions, reminders". That it is the renamed Pawprint app is a guess. `[verified-primary]`, `[inferred]`
- **PetDesk** (506,904 ratings, id 631377773): "MEDICATION REQUESTS / Easily request medication refills for your pets." A refill request to the clinic, not an owner's list. `[verified-primary]`
- **Chewy** (1.19M ratings, id 1149449468): under "PHARMACY & VET SUPPORT", "Medicine Reminders - Add your pet's current medications…"; elsewhere "Food shop and pharmacy". Placement inside the app unverified. `[verified-primary]`
- **Pet Pill Reminder & Tracker** (3 ratings, id 6755349743): "Inventory tracking"; "Keep each pet's medications and records separate." `[verified-primary]`
- **Petora** (2 ratings, id 6763283919): its "pantry" holds "food products, serving sizes, and nutrition values"; medications live in "medical records: vaccinations, medications, treatment plans". `[verified-primary]`

**Human apps**
- **Apple Health:** "tap Browse, then tap Medications", then "scroll to Your Medications" (support.apple.com/en-us/105064). `[verified-primary]`
- **Medisafe:** "Tap on 'Medications'", beside the pillbox home screen (help-center.medisafe.com/en/articles/8103148, dated 2023-08-22) `[verified-primary]`; a 2021 review lists the bottom bar as Home Page, Updates, Medications, More `[secondary]`.
- **CareClinic** (id 1455648231): "Medication Library", "Exercise Library". `[verified-primary]`
- **Bearable** (id 1482581097): a section headed "MEDICATION AND TREATMENTS"; food is tracked separately. `[verified-primary]`
- **Guava** (id 1622255863): medications and pill counts, and a separate "Food diary". `[verified-primary]`
- **MyFitnessPal** (id 341232718) and **Lose It!** (id 297368629) now log GLP-1 medication inside nutrition apps. Placement unverified. `[verified-primary]`

**Words seen as screen or section names:** Medications, Medication Library, Food library, pantry (food only), Inventory, Pharmacy, medical or health records, Treatments. "Cabinet" and "Supplies" did not appear as a screen name in any verified app.

`[inferred]` The pattern in the wild is separate collections of different kinds side by side, never one mixed list; "Library" is developers' copy, not owners' speech.

## §2 Supplements: medicine or food?

- **Apple Health** covers "the medications, vitamins, and supplements you take" in the same Medications feature (support.apple.com/en-us/105064). `[verified-primary]`
- **CareClinic:** "Medication Tracker for prescriptions, birth control, vitamins, supplements". `[verified-primary]`
- **Bearable:** "Log medication, supplements and treatments." `[verified-primary]`
- **Cronometer:** supplements go in the food diary, through a "Supplements" tab in food search (support article 360018955211, read only as a search snippet; the page returned 403) `[secondary]`; forum staff suggest saving a daily supplement as a custom food `[secondary]`.
- **MyFitnessPal:** owners log supplements as food entries (community forum). `[secondary, weak]`
- **Paws** (id 6759272028, 2 ratings): "reminders for food, medicine, supplements", a type of its own. Petfetti's and 11pets' copy never mentions supplements. `[verified-primary]`
- **FDA:** DSHEA "does not apply to animal food, including pet food… Thus, there is no 'dietary supplement' regulatory classification"; products "are either 'food' or 'new animal drugs' depending on their intended use" (fda.gov/animal-veterinary/products/animal-foods-feeds, content current as of 09/15/2025). `[verified-primary]` **Checked at use.**
- **AAFCO:** "There is no separate category for 'supplements' for animals" (aafco.org/resources/startups/definition-of-food-drugs/). `[verified-primary]`
- **NASC:** formed 2001 (nasc.cc/historical-summary/) `[verified-primary]`; its Quality Seal is voluntary and audit-based `[secondary]`.

`[inferred]` Neither apps nor regulators settle whether a supplement is a medicine or a food; it depends on how it is used.

## §3 Elimination diet trials

- **Tufts Petfoodology, *Elimination Diet Trial Plan*** (PDF author L. Freeman, created 2022-04-01): "Dietary supplements should be discontinued unless specifically recommended by your veterinarian (and known not to contain any ingredients that could trigger allergies)." "Avoid any flavored medications, such as heartworm or flea/tick preventative. However, it is very important for your pet to continue to receive heartworm and other preventatives during the diet trial so talk to your veterinarian about unflavored options or topical preventatives that are put on the skin." "If your pet requires medications and you give pills in foods or pill wrap products, you'll need to talk to your veterinarian about different ways to ensure your pets gets their pills without foods during the diet trial." The plan carries a field for the vet: *Recommended method to administer pills*. `[verified-primary]` **Checked at use.**
- **C. Yamazaki, DVM, DACVD (dvm360, 2023):** "no other treats, bones, flavored medications, supplements, or parasiticides should be offered"; "flavored joint supports should be discontinued or replaced with a hypoallergenic version if available" (dvm360.com/view/seven-tips-for-optimizing-an-elimination-diet-trial). `[verified-primary]`
- **VCA, written by the Canadian Academy of Veterinary Nutrition:** "Carefully examine everything given by mouth… including treats, supplements, pet toothpaste, and flavored medications." `[verified-primary]`
- **Parr & Remillard, *JAAHA* 2014;50(5):298–304:** ELISA found soy, pork or beef in flavoured products, including a heartworm preventive and an arthritis supplement, that did not match their labels. Read through a dvm360 Journal Scan and an abstract snippet; the journal page returned 403. `[secondary]`

`[inferred]` During a trial a flavoured medicine or supplement counts as something the pet ate, whichever screen it lives on.

## §4 Owner words

- **No survey research on what owners call this place was found.** The absence is the finding.
- **The Ohio State University Veterinary Medical Center diet history form** asks as separate questions: "Do you give any dietary supplements to your pet (for example: vitamins, glucosamine, fatty acids, or any other supplements)?"; "Please list… ALL foods, treats, snacks, and any other foods that your pet is currently eating"; "Is your pet receiving any medications?"; and "Do you use food (e.g., Pill Pockets, cheese, bread, peanut butter, etc.) to administer medications?" (vmc.vet.osu.edu/sites/default/files/documents/diet-history-form.pdf). `[verified-primary]` **Checked at use.** The WSAVA extended diet history form is laid out the same way `[secondary]`.
- **"Pantry":** only in app copy (Petora; "PetPantry", 0 ratings), food only `[verified-primary]`; among animal-welfare groups "pet food pantry" means a charity food bank `[weak]`.
- **"Medicine cabinet":** vet and retail articles use it for a home first-aid kit `[secondary, weak]`.
- **"Meds":** Petfetti's copy ("meals, meds, vaccines") `[verified-primary]`; owner forum threads track "meds, or supplements" as separate items `[secondary, weak]`.
- **Owners often don't tell vets about supplements:** in a Colorado State University cancer-centre survey, 65% of pets were given herbs or other alternative medicine and 35% of owners told their vet (AAHA NEWStat, 2006-11). `[secondary]`

`[inferred]` Owners and vets talk in item words (food, treats, meds, supplements); no container word appears in the evidence.

## §V Verification notes

**Checked at use (2026-10-09, by the session that committed this brief, CUL-1698).** Four claims were fetched again at their sources and hold as worded here: Petfetti's App Store line (iTunes lookup, 29 ratings); the FDA Animal Foods & Feeds page (both sentences, content current as of 09/15/2025); the Tufts trial plan (all three sentences, read from the PDF); the Ohio State diet history form (questions 9, 14, 15 and 16, read from the PDF).

**Could not be verified:** the in-app tab names of 11pets, PetDesk, Chewy, MyTherapy, MyFitnessPal and Cronometer's mobile app; whether Petfetti's three libraries share one screen. Blocked at the source: Cronometer's support article, the WSAVA form, the JAAHA abstract, a University of Guelph course page (403); the NASC Quality Seal page (404). One search snippet described a "KibbleClock" app with a single stock list for "kibble, wet food, litter, treats, medicine, and grooming gear"; no US App Store listing was found, so it stays unconfirmed and is not counted in TL;DR 1.
