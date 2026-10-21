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
  /** 面试, 生活, 职场 or 地道表达. */
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
 * Interview, workplace and everyday-life vocabulary beyond the basics. Themes take turns, so each
 * day's words mix all of them.
 */
export const WORDS: WordEntry[] = Array.from(
  { length: Math.max(...themes.map((theme) => theme.length)) },
  (_, i) => themes.flatMap((theme) => theme[i] ?? []),
).flat();
export const ENTRY = new Map(WORDS.map((entry) => [entry.word, entry]));
