// Furifont draws furigana into its glyphs, guessing each run of kanji's
// reading from a dictionary. We know the actual reading of every word, so
// when the font's default differs, `font-feature-settings: "salt" n` on the
// run picks the reading it should show, from the lists in the font's
// .ivs.json. See https://github.com/antfu/furifont/blob/main/docs/design.md

const HAN_RUN = /(\p{sc=Han}+)/u;

const isHan = (text) => HAN_RUN.test(text);

const toHiragana = (text) =>
  text.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Without the lists the font still shows its own guesses, so a failed load
// isn't fatal (and a resource that rejects would throw when read)
export const loadReadingLists = () =>
  import('../assets/furifont/FurifontSansVF.ivs.json')
    .then((m) => m.default)
    .catch((err) => {
      console.error('Failed to load Furifont reading lists:', err);
      return null;
    });

// Same rule as @furifont/helper-web's saltOf: a run of several kanji picks
// among the word's readings, the first being the default; a lone kanji picks
// among its own, unless the font shows that reading anyway. 0 means no salt.
function saltOf(run, reading, { kanji, words, lone }) {
  const isWord = [...run].length > 1;
  const readings = isWord
    ? words[run]?.map((notation) =>
        [...notation.matchAll(/\[([^\]]*)\]/g)].map((m) => m[1]).join(''),
      )
    : kanji[run];
  const index = readings?.indexOf(reading) ?? -1;
  return index >= (isWord ? 1 : 0) && index < 15 && lone[run] !== reading
    ? index + 1
    : 0;
}

// Splits a word into runs of text, giving each run of kanji the salt that
// makes Furifont show its part of the reading. When the reading can't be
// lined up with the word, the font's own guesses are left in place.
export function rubyRuns(word, reading, lists) {
  const parts = word.split(HAN_RUN).filter(Boolean);
  if (!lists || !reading || !parts.some(isHan)) return [{ text: word }];

  // The kana around each run of kanji must match the reading exactly, which
  // pins down how much of the reading belongs to each run (食べ物 → た, もの)
  const pattern = parts
    .map((part) => (isHan(part) ? '(.+?)' : escapeRegExp(toHiragana(part))))
    .join('');
  const match = toHiragana(reading).match(new RegExp(`^${pattern}$`, 'u'));
  if (!match) return [{ text: word }];

  let group = 1;
  return parts.map((part) =>
    isHan(part)
      ? { text: part, salt: saltOf(part, match[group++], lists) }
      : { text: part },
  );
}
