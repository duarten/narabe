// Furifont draws furigana into its glyphs, guessing each run of kanji's
// reading from a dictionary. We know the actual reading of every word, so
// when the font's default differs, `font-feature-settings: "salt" n` on the
// run picks the reading it should show, from the lists in the font's
// .ivs.json, and a <ruby> shows those it has no glyph for.
// See https://github.com/antfu/furifont/blob/main/docs/design.md

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

// How a run of kanji shows its reading. A run of several kanji picks among the
// word's readings, the first being the default, and one the lists don't have
// is left to the font's guess. A lone kanji shows its default reading or picks
// among its own, though the font only draws those for a kanji with several:
// 軋 lists きし, but no salt draws it. What the font can't draw gets a <ruby>.
function readingRun(text, reading, { kanji, words, lone }) {
  const isWord = [...text].length > 1;
  if (isWord && !words[text]) return { text };
  const readings = isWord
    ? words[text].map((notation) =>
        [...notation.matchAll(/\[([^\]]*)\]/g)].map((m) => m[1]).join(''),
      )
    : (kanji[text] ?? []);
  const index = readings.indexOf(reading);
  if (isWord ? index === 0 : lone[text] === reading) return { text };
  return index >= 0 && index < 15 && readings.length > 1
    ? { text, salt: index + 1 }
    : { text, ruby: reading };
}

// Splits a word into runs of text, saying how each run of kanji shows its part
// of the reading. A reading that can't be lined up with the word (2人 → ふたり)
// goes over the whole word.
export function rubyRuns(word, reading, lists) {
  const parts = word.split(HAN_RUN).filter(Boolean);
  if (!lists || !reading || !parts.some(isHan)) return [{ text: word }];

  // The kana around each run of kanji must match the reading exactly, which
  // pins down how much of the reading belongs to each run (食べ物 → た, もの)
  const pattern = parts
    .map((part) => (isHan(part) ? '(.+?)' : escapeRegExp(toHiragana(part))))
    .join('');
  const match = toHiragana(reading).match(new RegExp(`^${pattern}$`, 'u'));
  if (!match) return [{ text: word, ruby: reading }];

  let group = 1;
  return parts.map((part) =>
    isHan(part) ? readingRun(part, match[group++], lists) : { text: part },
  );
}
