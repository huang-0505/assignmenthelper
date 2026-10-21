import data from "../../data/words.json";

export type WordEntry = {
  word: string;
  pos: string;
  /** Chinese meaning. */
  zh: string;
  /** A common collocation; empty when the entry is a phrase already. */
  phrase: string;
  /** Example sentence with the word in [brackets]. */
  example: string;
  /** 职场, 面试, 生活 or 地道表达. */
  tag: string;
};

const themes = data.themes.map(({ tag, words }) =>
  words.map(([word, pos, zh, phrase, example]): WordEntry => ({
    word,
    pos,
    zh,
    phrase,
    example,
    tag,
  })),
);
/**
 * Interview, workplace and everyday-life vocabulary beyond the basics. Each theme is spread evenly
 * over the whole list, so every day mixes them in the same proportions; the workplace words from the
 * Business Service List are the largest share.
 */
export const WORDS: WordEntry[] = themes
  .flatMap((theme, t) =>
    theme.map((entry, i) => ({ entry, at: (i + 0.5) / theme.length, t })),
  )
  .sort((a, b) => a.at - b.at || a.t - b.t)
  .map(({ entry }) => entry);
export const WORDS_SOURCE =
  "https://www.newgeneralservicelist.com/business-service-list";
export const ENTRY = new Map(WORDS.map((entry) => [entry.word, entry]));
