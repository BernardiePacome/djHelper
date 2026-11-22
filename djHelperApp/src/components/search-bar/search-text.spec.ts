import { highlightMatches, normalizeSearchText } from './search-text';

describe('normalizeSearchText', () => {
  it('ignores case and accents, including ø', () => {
    expect(normalizeSearchText('Marten HØRGER')).toBe('marten horger');
    expect(normalizeSearchText('Émilie')).toBe('emilie');
  });
});

describe('highlightMatches', () => {
  it('marks the searched text while keeping the original casing', () => {
    expect(highlightMatches('Gorilla Glue Go', 'go')).toEqual([
      { text: 'Go', match: true },
      { text: 'rilla Glue ', match: false },
      { text: 'Go', match: true },
    ]);
  });

  it('marks every term and every occurrence', () => {
    expect(highlightMatches('Needed You', 'you need')).toEqual([
      { text: 'Need', match: true },
      { text: 'ed ', match: false },
      { text: 'You', match: true },
    ]);
  });

  it('matches across accents and maps back to the original characters', () => {
    expect(highlightMatches('Marten Hørger', 'horg')).toEqual([
      { text: 'Marten ', match: false },
      { text: 'Hørg', match: true },
      { text: 'er', match: false },
    ]);
    expect(highlightMatches('Émilie', 'emi')).toEqual([
      { text: 'Émi', match: true },
      { text: 'lie', match: false },
    ]);
  });

  it('merges overlapping matches into a single run', () => {
    expect(highlightMatches('banana', 'ban ana')).toEqual([{ text: 'banana', match: true }]);
  });

  it('returns the text untouched when nothing matches or the query is blank', () => {
    expect(highlightMatches('Forum', 'zzz')).toEqual([{ text: 'Forum', match: false }]);
    expect(highlightMatches('Forum', '  ')).toEqual([{ text: 'Forum', match: false }]);
    expect(highlightMatches('', 'a')).toEqual([{ text: '', match: false }]);
  });
});
