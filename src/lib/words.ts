import data from "../../data/words.json";

/** COCA's most frequent words, most frequent first. Source: www.wordfrequency.info (credit required). */
export const WORDS = data.words as [string, string][];
export const WORDS_SOURCE = "https://www.wordfrequency.info";
/** Part-of-speech codes in the list, as the abbreviations she knows from dictionaries. */
export const POS: Record<string, string> = {
  n: "n.",
  v: "v.",
  j: "adj.",
  r: "adv.",
  i: "prep.",
  p: "pron.",
  c: "conj.",
  d: "det.",
  m: "num.",
  u: "int.",
  a: "art.",
  x: "neg.",
  t: "to",
  e: "there",
};
