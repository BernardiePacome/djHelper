export interface TextSegment {
  text: string;
  match: boolean;
}

export function normalizeSearchText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ø/gi, 'o')
    .toLocaleLowerCase();
}

export function searchTerms(query: string): string[] {
  return normalizeSearchText(query).split(/\s+/).filter(Boolean);
}

export function matchesAllTerms(text: string, terms: string[]): boolean {
  const haystack = normalizeSearchText(text);
  return terms.every((term) => haystack.includes(term));
}

// Splits text into runs so the parts matching a search term can be underlined. Matching ignores
// case and accents, so positions found in the normalized text are mapped back to the original.
export function highlightMatches(text: string, query: string): TextSegment[] {
  const terms = searchTerms(query);
  if (terms.length === 0 || text === '') {
    return [{ text, match: false }];
  }

  let normalized = '';
  const starts: number[] = [];
  const ends: number[] = [];
  let position = 0;
  for (const char of text) {
    const normalizedChar = normalizeSearchText(char);
    for (let i = 0; i < normalizedChar.length; i++) {
      starts.push(position);
      ends.push(position + char.length);
    }
    normalized += normalizedChar;
    position += char.length;
  }

  const marked = new Array<boolean>(text.length).fill(false);
  for (const term of terms) {
    for (let index = normalized.indexOf(term); index !== -1; index = normalized.indexOf(term, index + 1)) {
      marked.fill(true, starts[index], ends[index + term.length - 1]);
    }
  }

  const segments: TextSegment[] = [];
  let runStart = 0;
  for (let i = 1; i <= text.length; i++) {
    if (i === text.length || marked[i] !== marked[runStart]) {
      segments.push({ text: text.slice(runStart, i), match: marked[runStart] });
      runStart = i;
    }
  }

  return segments;
}
