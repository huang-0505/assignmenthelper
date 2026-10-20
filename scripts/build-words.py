"""Daily vocabulary list. Source: www.wordfrequency.info (top 5,000 COCA lemmas, free sample).

Download https://www.wordfrequency.info/samples/wordFrequency.xlsx, then run
    python3 scripts/build-words.py path/to/wordFrequency.xlsx
The site asks that any copy of the list clearly names www.wordfrequency.info as its source.
"""
import json
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
M = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
# Words used mostly as nouns, verbs, adjectives or adverbs. Words mostly used as articles, pronouns,
# prepositions, conjunctions, numbers or interjections ("the", "it", "in", "yeah") are left out:
# she already knows them. The first part of speech listed is the word's most frequent one.
CONTENT = set("nvjr")

book = zipfile.ZipFile(sys.argv[1])
strings = [
    "".join(t.text or "" for t in si.iter(M + "t"))
    for si in ET.fromstring(book.read("xl/sharedStrings.xml"))
]
rows = []
# Sheet 2 is "1 lemmas": rank, lemma, PoS, frequency columns.
with book.open("xl/worksheets/sheet2.xml") as sheet:
    for _, el in ET.iterparse(sheet):
        if el.tag != M + "row":
            continue
        cells = {}
        for c in el:
            v = c.find(M + "v")
            if v is not None:
                col = "".join(ch for ch in c.get("r") if ch.isalpha())
                cells[col] = strings[int(v.text)] if c.get("t") == "s" else v.text
        el.clear()
        if cells.get("A", "").isdigit():
            rows.append((int(cells["A"]), str(cells["B"]), str(cells["C"])))

words = {}
for rank, lemma, pos in sorted(rows):
    entry = words.setdefault(lemma, [lemma, ""])
    if pos not in entry[1]:
        entry[1] += pos
kept = [
    entry
    for entry in words.values()
    if entry[1][0] in CONTENT and entry[0].replace("-", "").isalpha()
]
(ROOT / "data" / "words.json").write_text(
    json.dumps(
        {
            "source": "www.wordfrequency.info",
            "note": "Top 5,000 lemmas of the Corpus of Contemporary American English, most frequent first; content words only. Each entry is [word, parts of speech].",
            "words": kept,
        },
        ensure_ascii=False,
        separators=(",", ":"),
    )
    + "\n"
)
print(f"{len(kept)} words from {len(rows)} entries")
