export interface DiffPart {
  type: "same" | "added" | "removed";
  text: string;
}

// Above this many token pairs the diff is not worked out word by word:
// the old text is shown removed and the new one added.
const MAX_CELLS = 400_000;

/** Words and the whitespace between them, so joining gives the text. */
function tokenize(text: string): string[] {
  return text.match(/\s+|[^\s]+/g) ?? [];
}

/**
 * A word diff of two texts: the parts they share, and the parts only
 * the old text (removed) or only the new text (added) has, in order.
 * Adjacent parts of the same type are merged.
 */
export function diffWords(before: string, after: string): DiffPart[] {
  const a = tokenize(before);
  const b = tokenize(after);
  const parts: DiffPart[] = [];

  const push = (type: DiffPart["type"], text: string) => {
    const last = parts[parts.length - 1];

    if (last?.type === type) {
      last.text += text;
    } else if (text) {
      parts.push({ type, text });
    }
  };

  // The shared start and end need no table.
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) {
    start++;
  }
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }

  push("same", a.slice(0, start).join(""));

  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);

  if (midA.length * midB.length > MAX_CELLS) {
    push("removed", midA.join(""));
    push("added", midB.join(""));
  } else {
    // Longest common subsequence, read back from the start.
    const n = midA.length;
    const m = midB.length;
    const table = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));

    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        table[i][j] =
          midA[i] === midB[j]
            ? table[i + 1][j + 1] + 1
            : Math.max(table[i + 1][j], table[i][j + 1]);
      }
    }

    let i = 0;
    let j = 0;

    while (i < n || j < m) {
      if (i < n && j < m && midA[i] === midB[j]) {
        push("same", midA[i]);
        i++;
        j++;
      } else if (i < n && (j === m || table[i + 1][j] >= table[i][j + 1])) {
        push("removed", midA[i]);
        i++;
      } else {
        push("added", midB[j]);
        j++;
      }
    }
  }

  push("same", a.slice(endA).join(""));

  return parts;
}
