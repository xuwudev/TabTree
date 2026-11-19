import type { BrowserTab } from '../tabs/tabs';

const stopWords = new Set(
  'about all and are browser can com documentation edge for from guide home how index into latest more new official online page search site tab than that the their this through use using was what when where which will with you your'.split(' '),
);

export function folderName(tabs: BrowserTab[]): string {
  const ranked = rankKeywords(tabs);
  const sharedDomain = tabs[0]?.domain;
  const best = ranked[0];
  if (best?.count >= 2) return capitalize(best.label);
  if (sharedDomain && tabs.every(tab => tab.domain === sharedDomain)) return sharedDomain;
  return ranked.length ? ranked.slice(0, 2).map(entry => capitalize(entry.label)).join(' / ') : 'Related tabs';
}

export function topicName(tabs: BrowserTab[], omit = ''): string {
  const omittedWords = new Set(omit.toLowerCase().match(/[\p{L}\p{N}+#.]+/gu));
  const differs = ({ label }: { label: string }) =>
    !label.toLowerCase().split(' ').some(word => omittedWords.has(word));
  const common = rankKeywords(tabs).find(entry => entry.count >= 2 && differs(entry));
  const tab = tabs[0];
  if (common) return capitalize(common.label);
  if (!tab) return 'Open tabs';
  if (/^(about:blank|new tab)$/i.test(tab.title)) return 'New tabs';
  const words = rankKeywords([tab]).filter(differs);
  const phrase = words.find(entry => entry.position === 0 && entry.label.includes(' '));
  return capitalize(phrase?.label ?? words[0]?.label ?? (tab.domain || tab.title));
}

function rankKeywords(tabs: BrowserTab[]) {
  const keywords = new Map<string, { label: string; count: number; position: number }>();
  for (const tab of tabs) {
    const parts = tab.title.split(/\s+(?:[-–—|·])\s+|[|:]/u).slice(0, 3);
    const seen = new Set<string>();
    parts.forEach((part, position) => {
      const words = part.match(/[\p{L}\p{N}][\p{L}\p{N}+#.]*/gu) ?? [];
      const useful = (word: string) => word.length > 1 && /\p{L}/u.test(word) && !stopWords.has(word.toLowerCase());
      for (let i = 0; i < words.length; i++) {
        if (!useful(words[i])) continue;
        const candidates = [words[i]];
        if (words[i + 1] && useful(words[i + 1])) candidates.push(`${words[i]} ${words[i + 1]}`);
        for (const label of candidates) {
          const key = label.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          const entry = keywords.get(key) ?? { label, count: 0, position: 0 };
          entry.count++;
          entry.position += position;
          keywords.set(key, entry);
        }
      }
    });
  }

  const score = (entry: { label: string; count: number; position: number }) =>
    entry.count * 4 - entry.position + (entry.label.includes(' ') ? (entry.count > 1 ? 1 : -1) : 0);
  return [...keywords.values()].sort((a, b) => score(b) - score(a));
}

function capitalize(text: string): string {
  return text.charAt(0).toLocaleUpperCase() + text.slice(1);
}
