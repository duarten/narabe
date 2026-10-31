import { For } from 'solid-js';

const BULLET = /^\s*[-*]\s+/;

// Claude writes breakdowns in Markdown, using paragraphs, bullets and bold.
// Each line is its own block, as a lone line break is meant as one.
function parseBlocks(text) {
  const blocks = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    if (!BULLET.test(line)) {
      blocks.push({ text: line.trim() });
    } else if (blocks.at(-1)?.items) {
      blocks.at(-1).items.push(line.replace(BULLET, ''));
    } else {
      blocks.push({ items: [line.replace(BULLET, '')] });
    }
  }
  return blocks;
}

// Splitting on a captured group puts the bold parts at the odd indices
const withBold = (text) =>
  text
    .split(/\*\*(.+?)\*\*/)
    .map((part, i) => (i % 2 ? <strong>{part}</strong> : part));

function GrammarText(props) {
  return (
    <For each={parseBlocks(props.text)}>
      {(block) =>
        block.items ? (
          <ul>
            <For each={block.items}>{(item) => <li>{withBold(item)}</li>}</For>
          </ul>
        ) : (
          <p>{withBold(block.text)}</p>
        )
      }
    </For>
  );
}

export default GrammarText;
