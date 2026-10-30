#!/usr/bin/env python3
"""Deterministic verifier for an AI-written vet-report summary (bake-off R-3).

Usage:
    python3 verify.py FACTS.json SUMMARY.json [--quiet]

FACTS.json   a fact table (see spec.md §2): {"fixture", "year", "pet", "facts": [...],
             "lexicon": {...}, "forbidden_names": [...], "safety_live": bool,
             "intake_not_directly_observed": bool, "require_any_sentence": [[...]],
             "conditional": [...]}
SUMMARY.json {"sentences": [{"text": "...", "cites": ["L1", ...]}, ...]}

Prints a JSON report on stdout. Exit code 0 = pass, 1 = fail, 2 = bad input.

What it checks (spec.md §4). It is deliberately strict and deliberately only lexical:
it checks what was said, never what was implied. Meaning is the second-model check's and
the blind judges' job.
  structure    3-6 sentences, <=55 words each, every sentence cites >=1 known fact id
  numbers      every number (digits, decimals, %, spelled-out, once/twice) is in a cited fact
  dates        every date (Mon D, D Mon, ISO, ranges and lists) and weekday is in a cited fact
  times        every clock time is in a cited fact
  terms        every food, protein and drug named is named by a cited fact
  quotes       every quoted span is a verbatim owner quote from a cited fact, attributed to the owner;
               an owner quote may not appear unquoted
  banned       phrase classes H1, H2, H3, H4, H7, AP, MIN, VAGUE, RATE, REL, VOICE (a waivable
               single-word match is waived only when that exact word is in a cited fact's text)
  names        no person names (forbidden_names, or "Dr. X")
  required     every required fact is cited; each cited fact's must_say groups appear in the
               sentences that cite it; table-level required phrases; "intake not directly observed"
               verbatim when true; conditional citations (e.g. naming a food requires the
               association-limit fact)
  safety       when a safety flag is live, sentence 1 cites a live band fact
"""

import json
import re
import sys

VERIFIER_VERSION = "bakeoff-1"

MONTHS = {
    "jan": 1, "january": 1, "feb": 2, "february": 2, "mar": 3, "march": 3, "apr": 4, "april": 4,
    "may": 5, "jun": 6, "june": 6, "jul": 7, "july": 7, "aug": 8, "august": 8,
    "sep": 9, "sept": 9, "september": 9, "oct": 10, "october": 10, "nov": 11, "november": 11,
    "dec": 12, "december": 12,
}
MONTH_RE = (r"(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|June?|July?|Aug(?:ust)?|"
            r"Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\.?")
# A continuation day after a month-day ("Jun 2, 14, 21 and 27", "Jun 5 to 19") counts as a date
# only when it is followed by punctuation, a list word or the end, so "Jun 29, 3 readings" keeps
# its 3 as a number and "May 18 to 31.8 kg" keeps its 31.8.
CONT_FOLLOW = r"(?=\s*(?:,|;|:|\)|\.(?!\d)|\band\b|\bor\b|\bto\b|$))"
MD_RE = re.compile(
    r"\b(" + MONTH_RE + r")\s+(\d{1,2})(?:st|nd|rd|th)?\b(?:,?\s+(20\d\d))?"
    r"((?:\s*(?:,|and|&|to|through|–|-)\s*\d{1,2}(?!\d)" + CONT_FOLLOW + r")*)",
    re.I,
)
DM_RE = re.compile(r"\b(\d{1,2})\s+(" + MONTH_RE + r")\b(?:,?\s+(20\d\d))?", re.I)
ISO_RE = re.compile(r"\b(20\d\d)-(\d\d)-(\d\d)\b")
TIME_RE = re.compile(r"\b(\d{1,2}):(\d\d)\b")
WEEKDAY_RE = re.compile(r"\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)s?\b", re.I)
NUM_RE = re.compile(r"(?<![\w.])\d{1,3}(?:,\d{3})+(?:\.\d+)?(?!\d)|(?<![\w.])\d+(?:\.\d+)?")
WORD_NUMS = {
    "zero": 0, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7,
    "eight": 8, "nine": 9, "ten": 10, "eleven": 11, "twelve": 12, "thirteen": 13, "fourteen": 14,
    "fifteen": 15, "sixteen": 16, "seventeen": 17, "eighteen": 18, "nineteen": 19, "twenty": 20,
    "thirty": 30, "forty": 40, "fifty": 50, "sixty": 60, "seventy": 70, "eighty": 80, "ninety": 90,
    "hundred": 100, "dozen": 12, "once": 1, "twice": 2, "thrice": 3,
}
WORD_NUM_RE = re.compile(r"\b(" + "|".join(WORD_NUMS) + r")\b", re.I)
QUOTE_RE = re.compile(r"“([^”]+)”|\"([^\"]+)\"")

# Names not in the record that a writer might still produce: fabricated foods, proteins, drugs.
GENERIC_FOODS = [
    "chicken liver", "chicken", "beef", "lamb", "pork", "turkey", "duck", "salmon", "whitefish",
    "fish", "tuna", "venison", "rabbit", "kangaroo", "egg", "eggs", "dairy", "cheese", "milk",
    "soy", "cereal", "wheat", "corn", "rice", "liver", "peanut butter", "jerky",
]
GENERIC_DRUGS = [
    "apoquel", "oclacitinib", "nexgard", "afoxolaner", "simparica", "bravecto", "revolution",
    "maropitant", "cerenia", "prednisolone", "prednisone", "steroid", "steroids", "metronidazole",
    "antibiotic", "antibiotics", "famotidine", "omeprazole", "ondansetron", "mirtazapine",
    "capromorelin", "entyce", "cytopoint", "lokivetmab", "cyclosporine", "atopica",
    "antihistamine", "antihistamines", "probiotic", "probiotics", "fortiflora", "antiemetic",
]

# (class, regex, waivable). Waivable single-word matches are waived when the exact matched text
# appears in a cited fact's text (the fact's own code-written words). Multi-word deferral and
# reassurance classes are never waived.
BANNED = [
    # H1 - trial read as clean or adherent
    ("H1", r"\bstuck\b|\bstick(?:s|ing)? (?:to|with)\b", False),
    ("H1", r"\bkept (?:to|on)\b", False),
    ("H1", r"\bstay(?:ed|ing|s)? on\b", False),
    ("H1", r"\bremain(?:ed|ing|s)? on\b", False),
    ("H1", r"\badher\w*", False),
    ("H1", r"\bcomplian\w*|\bcompliant\b", False),
    ("H1", r"(?<!not )(?<!not a )\bclean\b", False),
    ("H1", r"\bstrict(?:ly)?\b", False),
    ("H1", r"\bfaithful\w*", False),
    ("H1", r"\bon track\b|\bas directed\b|\bas prescribed\b|\bfollowed the (?:diet|trial|plan)\b", False),
    ("H1", r"\bapart from\b|\bexcept for\b|\baside from\b|\bother than\b|\bbesides\b|\botherwise\b", False),
    ("H1", r"\bexclusive(?:ly)?\b", False),
    # H2 - cause or improvement implied
    ("H2", r"\bimprov\w*", False),
    ("H2", r"\bbetter\b", False),
    ("H2", r"\bresolv\w*|\bsettl\w*|\bsubsid\w*|\bcalm\w*", False),
    ("H2", r"\beas(?:ed|ing|es)\b", False),
    ("H2", r"\brespon(?:d|ded|ding|ds|se|sive)\b", False),
    ("H2", r"\bworking\b|\beffective\w*|\bhelp(?:ed|ing|s)?\b", False),
    ("H2", r"\bbecause\b|\bdue to\b|\bcaus\w*|\btrigger\w*|\bled to\b|\blead(?:s|ing)? to\b|\bthanks to\b", False),
    ("H2", r"\bresult(?:ed|s|ing)? (?:in|from)\b|\bas a result\b", False),
    ("H2", r"\bfell\b|\bfall(?:en|ing|s)?\b|\bdrop(?:ped|ping|s)?\b|\bdecreas\w*|\bdown (?:from|to)\b|\btail(?:ed|ing) off\b", False),
    ("H2", r"\bdeclin\w*|\breduc\w*", True),
    ("H2", r"\bhalv\w*|\bhalf as\b|\bdoubled\b|\btripled\b", False),
    ("H2", r"\btrend\w*", True),
    ("H2", r"\bsince (?:starting|beginning|the switch|switching|the change|the diet|the trial)\b", True),
    ("H2", r"\b(?:after|following) (?:starting|the switch|switching|the change|the start)\b", False),
    # H3 - refusal softened or read as preference
    ("H3", r"\bpicky\b|\bfussy\b|\bfussiness\b|\bfinicky\b|\bchoosy\b|\bselective\b", False),
    ("H3", r"\bprefer\w*", False),
    ("H3", r"\bliked\b|\blikes\b|\bdislik\w*|\bdidn'?t like\b|\bnot keen\b", False),
    ("H3", r"\binterest(?:ed)?\b|\bappetite for\b|\bnose\b|\benjoy\w*|\btast(?:e|es|y)\b|\bpalatab\w*", False),
    ("H3", r"\bbored\b|\btired of\b|\breluctan\w*|\bunwilling\w*|\bhesita\w*", False),
    # H4 - reassurance from absence
    ("H4", r"\bnormal(?:ly)?\b|\bhealthy\b|\bfine\b|(?<!as )\bwell\b|\bstable\b|\bsteady\b", False),
    ("H4", r"\bunremarkable\b|\breassur\w*|\ball clear\b|\bclear(?:ed)?\b", True),
    ("H4", r"\bno (?:concern\w*|worries)\b|\bnothing (?:concerning|worrying|alarming|of note|unusual)\b", False),
    ("H4", r"\b(?:symptom|itch|vomit)[- ]free\b|\bfree of\b|\bquiet(?:er)?\b", False),
    ("H4", r"\bno (?:further|more|new|other) (?:episodes?|itching|vomiting|signs?|entries)\b", False),
    ("H4", r"\bno (?:itching|itch|vomiting|episodes?|signs?|symptoms?)\b", False),
    ("H4", r"\bgood\b|\bgreat\b|\bthriv\w*|\bmend\w*|\brecover\w*|\bback to\b|\bdoing\b", False),
    # H7 - safety deferred or softened (never waived)
    ("H7", r"\b(?:at|for|until) (?:the|her|his|their) (?:next )?(?:visit|recheck|appointment|check-?up)\b", False),
    ("H7", r"\bnext visit\b|\bcan wait\b|\bno rush\b|\bnot urgent\b|\broutine\b|\bwhen convenient\b", False),
    ("H7", r"\bmonitor (?:at home|for now)\b|\bkeep an eye\b|\bwatch and wait\b|\bfor now\b", False),
    # AP - assessment, plan, diagnosis (disease words waivable when verbatim in a cited fact)
    ("AP", r"\bconsistent with\b|\bsuggest\w*|\bindicat\w*|\blikely\b|\bprobabl\w*", False),
    ("AP", r"\bpossibl[ey]\b", True),
    ("AP", r"(?<!not a )\bdiagnos\w*", False),
    ("AP", r"\ballerg\w*|\bibd\b|\benteropath\w*|\bpancreatit\w*|\bkidney\b|\brenal\b|\bhyperthyroid\w*|\bcancer\b|\blymphoma\b|\bobstruct\w*", False),
    ("AP", r"\blipidosis\b|\bhepatic\b", True),
    ("AP", r"\brecommend\w*|\bshould\b|\bconsider\w*|\badvis\w*|\bneeds? to\b|\bmust\b|\bworth (?:a|checking|considering|discussing|asking)\b", False),
    ("AP", r"\brule out\b|\bdifferential\w*|\bwork-?up\b|\bbloodwork\b|\bx-?ray\w*|\bradiograph\w*|\bultrasound\b|\bbiops\w*", False),
    ("AP", r"\bswitch (?:to|back)\b|\brestart\w*|\bextend\w*|\bstop the (?:trial|diet)\b", False),
    # MIN - minimizers
    ("MIN", r"\bonly\b|\bjust\b|\bmerely\b|\bbarely\b", True),
    ("MIN", r"\bmild\w*|\bslight\w*|\boccasional\w*|\ba little\b|\ba few\b|\bminor\b|\bsmall\b", False),
    # VAGUE - quantities without a denominator
    ("VAGUE", r"\bseveral\b|\bmany\b|\bmost days\b|\bfrequent\w*|\brarely\b|\boften\b|\ba handful\b", False),
    ("VAGUE", r"\bsome days\b|\bregular(?:ly)?\b|\bintermittent\w*|\bsporadic\w*|\bnumerous\b|\bmultiple\b", False),
    ("VAGUE", r"\bmostly\b|\bmainly\b|\blargely\b|\busually\b|\btypically\b|\bgenerally\b|\bnearly (?:every|all)\b|\balmost (?:every|all)\b", False),
    ("VAGUE", r"\b(?:mid|early|late)[- ]?(?:" + MONTH_RE + r"|month|week|trial)\b", False),
    # RATE - invented rates
    ("RATE", r"\bevery other day\b|\bper (?:week|day|month)\b|\btimes a (?:day|week|month)\b|/(?:week|day|wk)\b|~|\baverag\w*", False),
    ("RATE", r"\babout every\b|\broughly\b|\bapproximately\b", False),
    ("RATE", r"\b(?:a|per|each) (?:week|day|month)\b", False),
    # REL - relative time
    ("REL", r"\btoday\b|\byesterday\b|\brecent(?:ly)?\b|\blately\b|\bthis week\b|\blast week\b|\bso far\b|\bcurrently\b", True),
    # VOICE
    ("VOICE", r"!", False),
    ("VOICE", r"\byou(?:r|rs|rself)?\b", False),
]
BANNED_C = [(c, re.compile(p, re.I), w) for c, p, w in BANNED]
SAFE_MASKS = [r"\bnot a diagnosis\b", r"\bintake not directly observed\b"]


def norm(s):
    s = s.replace("−", "-").replace("–", "-").replace("—", " - ")
    s = s.replace("’", "'").replace("‘", "'").replace(" ", " ")
    return re.sub(r"\s+", " ", s).strip()


def fnum(x):
    try:
        return round(float(str(x).replace(",", "")), 6)
    except ValueError:
        return None


def iso(y, m, d):
    return "%04d-%02d-%02d" % (int(y), int(m), int(d))


def extract_dates(text, year):
    """Return (dates, masked_text). Dates are ISO strings; masked text has them blanked."""
    dates = []
    spans = []
    for m in ISO_RE.finditer(text):
        dates.append(iso(m.group(1), m.group(2), m.group(3)))
        spans.append(m.span())
    for m in MD_RE.finditer(text):
        if any(a <= m.start() < b for a, b in spans):
            continue
        mon = MONTHS[m.group(1).lower().rstrip(".")]
        y = m.group(3) or year
        dates.append(iso(y, mon, m.group(2)))
        for d in re.findall(r"\d{1,2}", m.group(4) or ""):
            dates.append(iso(y, mon, d))
        spans.append(m.span())
    for m in DM_RE.finditer(text):
        if any(a <= m.start() < b for a, b in spans):
            continue
        mon = MONTHS[m.group(2).lower().rstrip(".")]
        dates.append(iso(m.group(3) or year, mon, m.group(1)))
        spans.append(m.span())
    masked = list(text)
    for a, b in spans:
        for i in range(a, b):
            masked[i] = " "
    return dates, "".join(masked)


def extract_times(text):
    times = ["%02d:%s" % (int(h), mm) for h, mm in TIME_RE.findall(text)]
    return times, TIME_RE.sub(" ", text)


def extract_numbers(text):
    nums = [fnum(n) for n in NUM_RE.findall(text)]
    nums += [float(WORD_NUMS[w.lower()]) for w in WORD_NUM_RE.findall(text)]
    return [n for n in nums if n is not None]


def build_term_index(table):
    """alias (lowercase) -> (kind, canonical). Longest aliases first when matching."""
    idx = {}
    lex = table.get("lexicon", {})
    for kind in ("foods", "drugs"):
        for canon, aliases in lex.get(kind, {}).items():
            for a in [canon] + list(aliases):
                idx[a.lower()] = (kind, canon)
    for g in GENERIC_FOODS:
        idx.setdefault(g, ("proteins", g.rstrip("s") if g == "eggs" else g))
    for g in GENERIC_DRUGS:
        idx.setdefault(g, ("drugs", g))
    return idx


def term_regex(alias):
    return re.compile(r"(?<![\w/])" + re.escape(alias) + r"(?![\w/])", re.I)


def extract_terms(text, idx):
    found = []
    masked = text
    for alias in sorted(idx, key=len, reverse=True):
        rx = term_regex(alias)
        if rx.search(masked):
            found.append(idx[alias])
            masked = rx.sub(lambda m: " " * len(m.group(0)), masked)
    return found, masked


def fact_profile(f, table, idx):
    text = norm(f.get("text", ""))
    year = str(table.get("year", "2026"))
    qtext = QUOTE_RE.sub(" ", text)
    dates, rest = extract_dates(qtext, year)
    times, rest = extract_times(rest)
    terms, rest = extract_terms(rest, idx)
    nums = extract_numbers(rest)
    quotes = [a or b for a, b in QUOTE_RE.findall(text)]
    return {
        "text": text.lower(),
        "numbers": set(nums) | {fnum(n) for n in f.get("numbers", [])},
        "dates": set(dates) | set(f.get("dates", [])),
        "times": set(times),
        "weekdays": {w.lower() for w in WEEKDAY_RE.findall(text)},
        "terms": {t for t in terms} | {("foods", x) for x in f.get("foods", [])}
                 | {("drugs", x) for x in f.get("drugs", [])} | {("proteins", x) for x in f.get("proteins", [])},
        "quotes": [norm(q).lower() for q in quotes + f.get("quotes", [])],
    }


def verify(table, summary):
    errors, warnings, out_sentences = [], [], []
    facts = {f["id"]: f for f in table["facts"]}
    idx = build_term_index(table)
    prof = {fid: fact_profile(f, table, idx) for fid, f in facts.items()}
    year = str(table.get("year", "2026"))
    sents = summary.get("sentences")
    if not isinstance(sents, list):
        raise ValueError("summary.sentences must be a list")

    def err(i, check, detail):
        errors.append({"sentence": i, "check": check, "detail": detail})

    if not 3 <= len(sents) <= 6:
        err(None, "structure", "expected 3-6 sentences, got %d" % len(sents))

    cited_by = {}
    for i, s in enumerate(sents, 1):
        text = norm(s.get("text", ""))
        cites = s.get("cites", [])
        rec = {"i": i, "text": text, "cites": cites}
        if not cites:
            err(i, "structure", "sentence cites no fact")
        unknown = [c for c in cites if c not in facts]
        if unknown:
            err(i, "structure", "unknown fact ids: %s" % unknown)
        cites = [c for c in cites if c in facts]
        for c in cites:
            cited_by.setdefault(c, []).append(i)
        words = len(text.split())
        if words > 55:
            err(i, "structure", "sentence has %d words (max 55)" % words)
        if len(re.findall(r"[.?]\s+[A-Z]", text)) > 0:
            warnings.append({"sentence": i, "check": "structure", "detail": "looks like more than one sentence"})

        allowed_nums = set().union(*[prof[c]["numbers"] for c in cites]) if cites else set()
        allowed_dates = set().union(*[prof[c]["dates"] for c in cites]) if cites else set()
        allowed_times = set().union(*[prof[c]["times"] for c in cites]) if cites else set()
        allowed_wd = set().union(*[prof[c]["weekdays"] for c in cites]) if cites else set()
        allowed_terms = set().union(*[prof[c]["terms"] for c in cites]) if cites else set()
        allowed_quotes = [q for c in cites for q in prof[c]["quotes"]]
        all_quotes = sorted({q for p in prof.values() for q in p["quotes"]})
        cited_text = " ".join(prof[c]["text"] for c in cites)

        # quotes
        quotes = [norm(a or b) for a, b in QUOTE_RE.findall(text)]
        for q in quotes:
            ql = q.lower().strip(" .,;")
            if not any(ql and ql in aq for aq in allowed_quotes):
                err(i, "quotes", "quoted text is not a verbatim owner quote in a cited fact: %r" % q)
            elif "owner" not in text.lower():
                err(i, "quotes", "owner quote is not attributed to the owner in the sentence")
        body = QUOTE_RE.sub(" ", text)
        for aq in all_quotes:
            if len(aq.split()) >= 3 and aq in body.lower():
                err(i, "quotes", "owner's words appear without quotation marks: %r" % aq)
        rec["quotes"] = quotes

        # dates, times, weekdays, terms, numbers
        dates, rest = extract_dates(body, year)
        for d in dates:
            if d not in allowed_dates:
                err(i, "dates", "date %s is not in a cited fact" % d)
        times, rest = extract_times(rest)
        for t in times:
            if t not in allowed_times:
                err(i, "times", "time %s is not in a cited fact" % t)
        for w in WEEKDAY_RE.findall(rest):
            if w.lower() not in allowed_wd:
                err(i, "dates", "weekday %r is not in a cited fact" % w)
        rest = WEEKDAY_RE.sub(" ", rest)
        terms, rest = extract_terms(rest, idx)
        for kind, canon in terms:
            ok = (kind, canon) in allowed_terms
            if not ok and kind == "proteins":
                ok = canon in cited_text
            if not ok:
                err(i, "terms", "%s %r is not named by a cited fact" % (kind[:-1], canon))
        for m in SAFE_MASKS:
            rest = re.sub(m, " ", rest, flags=re.I)
        nums = extract_numbers(rest)
        for n in nums:
            if n not in allowed_nums:
                err(i, "numbers", "number %s is not in a cited fact" % (int(n) if n == int(n) else n))
        rec.update({"dates": dates, "times": times, "terms": [c for _, c in terms],
                    "numbers": [int(n) if n == int(n) else n for n in nums]})

        # names
        for name in table.get("forbidden_names", []):
            if re.search(r"(?<!\w)" + re.escape(name) + r"(?!\w)", QUOTE_RE.sub(" ", text), re.I):
                err(i, "names", "names a person: %r" % name)
        if re.search(r"\bDr\.?\s+[A-Z]", text):
            err(i, "names", "names a doctor")

        # banned phrases (screen the body with quotes, names and safe phrases masked)
        screen = rest
        for cls, rx, waivable in BANNED_C:
            for m in rx.finditer(screen):
                hit = m.group(0)
                if waivable and hit.lower() in cited_text:
                    warnings.append({"sentence": i, "check": "banned-waived", "detail": "%s %r (in a cited fact's text)" % (cls, hit)})
                    continue
                err(i, "banned:" + cls, "%r" % hit)
        out_sentences.append(rec)

    # required facts and must-say groups
    for fid, f in facts.items():
        if f.get("required") and fid not in cited_by:
            err(None, "required", "required fact %s is not cited (%s)" % (fid, f.get("kind", "")))
        if fid in cited_by:
            joined = " ".join(norm(sents[i - 1].get("text", "")).lower() for i in cited_by[fid])
            for group in f.get("must_say", []):
                if not any(norm(alt).lower() in joined for alt in group):
                    err(cited_by[fid][0], "required-clause",
                        "fact %s is cited but its sentences lack one of %s" % (fid, group))

    alltext = " ".join(norm(s.get("text", "")).lower() for s in sents)
    for group in table.get("require_any_sentence", []):
        if not any(norm(a).lower() in alltext for a in group):
            err(None, "required-clause", "summary lacks one of %s" % group)
    if table.get("intake_not_directly_observed") and "intake not directly observed" not in alltext:
        err(None, "required-clause", "summary lacks 'intake not directly observed' (true for this record)")
    for rule in table.get("conditional", []):
        if rule.get("when") == "mentions_any":
            terms_l = [t.lower() for t in rule["terms"]]
            hit = any(term_regex(t).search(QUOTE_RE.sub(" ", norm(s.get("text", "")))) for s in sents for t in terms_l)
            if hit and rule["cite"] not in cited_by:
                err(None, "conditional", "summary names %s but does not cite %s (%s)" % (
                    "/".join(rule["terms"][:4]), rule["cite"], rule.get("why", "")))

    # safety first
    if table.get("safety_live"):
        live = {f["id"] for f in table["facts"] if f.get("role") == "band" and f.get("live")}
        first = set(sents[0].get("cites", [])) if sents else set()
        if not (first & live):
            err(1, "safety", "a safety flag is live; sentence 1 must cite a live band fact %s" % sorted(live))

    return {
        "verifier": VERIFIER_VERSION,
        "fixture": table.get("fixture"),
        "pass": not errors,
        "error_count": len(errors),
        "errors": errors,
        "warnings": warnings,
        "facts_cited": sorted(cited_by),
        "sentences": out_sentences,
    }


def main(argv):
    args = [a for a in argv[1:] if not a.startswith("--")]
    if len(args) != 2:
        print(__doc__, file=sys.stderr)
        return 2
    try:
        with open(args[0], encoding="utf-8") as fh:
            table = json.load(fh)
        with open(args[1], encoding="utf-8") as fh:
            summary = json.load(fh)
        report = verify(table, summary)
    except (OSError, ValueError, KeyError, TypeError) as e:
        print(json.dumps({"pass": False, "input_error": str(e)}))
        return 2
    print(json.dumps(report, indent=None if "--quiet" in argv else 2, ensure_ascii=False))
    return 0 if report["pass"] else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
