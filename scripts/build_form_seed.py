#!/usr/bin/env python3
"""Turn the GAU alumni questionnaire responses into profiles the portal can hold for people to claim.

Reads  private/form_responses.json   (exported from the Google Sheet — personal data, never published)
Writes private/seed_respondents.json (for the portal's admin-only import tool)

Nothing here goes on the public website: every profile is created hidden ("pending"), and only
becomes visible if that person signs in, claims it, and an administrator approves them.
"""
import json, re, sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "private" / "form_responses.json"
OUT = ROOT / "private" / "seed_respondents.json"

# Campus codes people actually typed, mapped to full names.
CAMPUS = {
    "CPCA": "C. P. College of Agriculture (CPCA), Sardarkrushinagar",
    "BACA": "B. A. College of Agriculture (BACA), Anand",
    "ACHF": "ASPEE College of Horticulture & Forestry (ACHF), Navsari",
    "ASPEE": "ASPEE College of Horticulture & Forestry (ACHF), Navsari",
    "CAET": "College of Agricultural Engineering & Technology (CAET)",
    "NAU": "Navsari Agricultural University (NAU)",
    "JAU": "Junagadh Agricultural University (JAU)",
    "AAU": "Anand Agricultural University (AAU)",
    "SDAU": "Sardarkrushinagar Dantiwada Agricultural University (SDAU)",
    "GAU": "Gujarat Agricultural University (GAU)",
}
# A campus code beats a university code when both appear ("B.Sc CPCA SDAU 2003" -> CPCA).
CAMPUS_FIRST = ["CPCA", "BACA", "ACHF", "ASPEE", "CAET", "NAU", "JAU", "AAU", "SDAU", "GAU"]

PROFESSION = {
    "government servant": "Government Service",
    "private sector employee": "Private Sector",
    "self employed": "Self Employed / Business",
    "student": "Student",
    "farming": "Farming",
    "retired": "Retired",
    "pensioner": "Retired",
    "bank": "Banking & Finance",
    "atma": "Government Service",
    "ngo": "NGO / Development Sector",
    "not working": "Not stated",
}

def clean(s):
    return re.sub(r"\s+", " ", (s or "").strip()).strip(" ,-")

def campus_of(text):
    up = (text or "").upper()
    for code in CAMPUS_FIRST:
        if re.search(rf"\b{code}\b", up):
            return CAMPUS[code], code
    return None, None

def year_of(text):
    years = re.findall(r"\b(19[5-9]\d|20[0-4]\d)\b", text or "")
    return int(years[-1]) if years else None

def degree_of(text):
    t = clean(text)
    m = re.match(r"^((?:B|M)\.?\s?(?:Sc|Tech|E|A|B\.?A)\.?[^,\-–]{0,40}|Ph\.?\s?D\.?[^,\-–]{0,40}|Diploma[^,\-–]{0,40})", t, re.I)
    return clean(m.group(1))[:160] if m else (t[:160] or None)

def level_of(text):
    t = (text or "").upper()
    if "PH" in t and "D" in t.replace(".", ""): return "PhD"
    if t.startswith("M") or "M.SC" in t or "MSC" in t or "M.TECH" in t: return "PG"
    if "DIPLOMA" in t: return "Diploma"
    if t.startswith("B") or "B.SC" in t or "BSC" in t: return "UG"
    return None

def profession_of(text):
    t = clean(text).lower()
    for key, label in PROFESSION.items():
        if key in t:
            return label, (clean(text)[:120] if label in ("Government Service", "Private Sector", "Self Employed / Business") and len(t) > 40 else None)
    return "Other", clean(text)[:120] or None

COUNTRIES = ("india", "usa", "united states", "uk", "united kingdom", "canada", "australia",
             "uae", "germany", "netherlands", "new zealand", "qatar", "oman", "kenya", "nepal")

def place_of(text):
    t = clean(text).replace("Work-", "").replace("work-", "")
    parts = [clean(p) for p in re.split(r"[,\-–/]", t) if clean(p)]
    if not parts:
        return None, None
    country = None
    if parts and parts[-1].lower() in COUNTRIES:
        country = "India" if parts[-1].lower() == "india" else parts[-1].title()
        parts = parts[:-1]
    city = parts[0].title() if parts else None
    return (city[:80] if city else None), (country or ("India" if t else None))

def main():
    if not SRC.exists():
        sys.exit(f"missing {SRC} — export the Google Sheet first")
    raw = json.loads(SRC.read_text())
    rows = raw["rows"]
    hdr = list(rows[0].keys())
    col = lambda frag: next(h for h in hdr if frag.lower() in h.lower())
    C = {k: col(v) for k, v in {
        "email": "Email Address", "name": "Full Name", "phone": "Mobile number",
        "dob": "Date of Birth", "ug": "Graduation Batch, College", "pg": "Highest Post Graduation",
        "prof": "Current Profession", "place": "Current Place of Residence",
        "linkedin": "LinkedIn", "structure": "legal structure", "priorities": "priorities/ opinions",
        "membership": "willing to become a Member", "volunteer": "volunteer specialised",
        "remarks": "additional remarks",
    }.items()}

    people, skipped, seen = [], [], set()
    for r in rows:
        email = clean(r[C["email"]]).lower()
        name = clean(r[C["name"]])
        if not email or "@" not in email or not name:
            skipped.append({"name": name, "email": email, "why": "no usable name or email"}); continue
        if email in seen:
            skipped.append({"name": name, "email": email, "why": "duplicate email — kept the first"}); continue
        seen.add(email)

        ug_text, pg_text = clean(r[C["ug"]]), clean(r[C["pg"]])
        campus_name, campus_code = campus_of(ug_text)
        batch = year_of(ug_text)
        prof_label, prof_detail = profession_of(r[C["prof"]])
        city, country = place_of(r[C["place"]])
        linkedin = clean(r[C["linkedin"]])

        education = []
        if ug_text and ug_text.upper() not in ("NA", "N/A", "-"):
            education.append({"level": level_of(ug_text) or "UG", "program": degree_of(ug_text),
                              "campus": campus_name, "end_year": batch, "is_cpca": campus_code == "CPCA"})
        if pg_text and pg_text.upper() not in ("NA", "N/A", "-"):
            pg_campus, pg_code = campus_of(pg_text)
            education.append({"level": level_of(pg_text) or "PG", "program": degree_of(pg_text),
                              "campus": pg_campus, "end_year": year_of(pg_text), "is_cpca": pg_code == "CPCA"})

        people.append({
            "full_name": name, "email": email,
            "phone": re.sub(r"[^\d+]", "", clean(r[C["phone"]]))[:20] or None,
            "dob": clean(r[C["dob"]]) or None,
            "campus": campus_name, "campus_code": campus_code, "batch_year": batch,
            "profession": prof_label, "profession_detail": prof_detail,
            "city": city, "country": country,
            "linkedin": linkedin if linkedin.startswith("http") else None,
            "education": education,
            # association answers — kept private, for the committee forming the body
            "association": {
                "structure": clean(r[C["structure"]]) or None,
                "priorities": clean(r[C["priorities"]]) or None,
                "membership": clean(r[C["membership"]]) or None,
                "volunteer": clean(r[C["volunteer"]]) or None,
                "remarks": clean(r[C["remarks"]]) or None,
            },
            "source": "GAU alumni questionnaire 2025",
        })

    OUT.write_text(json.dumps({"source": raw["source"], "people": people}, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"OK: {len(people)} people -> {OUT.relative_to(ROOT)}   ({len(skipped)} skipped)")
    print("\ncampus:", dict(Counter(p['campus_code'] or '—' for p in people).most_common()))
    print("profession:", dict(Counter(p['profession'] for p in people).most_common()))
    print("with batch year:", sum(1 for p in people if p['batch_year']), "| with city:", sum(1 for p in people if p['city']),
          "| with LinkedIn:", sum(1 for p in people if p['linkedin']), "| with education rows:", sum(1 for p in people if p['education']))
    for s in skipped:
        print("  SKIPPED:", s["why"], "—", s["name"][:40])
    no_campus = [p["full_name"] for p in people if not p["campus_code"]]
    if no_campus:
        print(f"\n  {len(no_campus)} without a recognised campus (they can set it themselves):", ", ".join(no_campus[:5]), "…")

if __name__ == "__main__":
    main()
