/**
 * Client-side mirror of backend message search parsing (keep in sync with
 * cordigram-backend/src/messages/message-search-query.parser.ts).
 */

export type MessageSearchHasType = "image" | "file";

export interface ParsedMessageSearchFilters {
  from?: string;
  in?: string;
  has?: MessageSearchHasType;
}

export interface ParsedMessageSearch {
  text: string;
  filters: ParsedMessageSearchFilters;
}

function readFilterValue(s: string, start: number): { value: string; end: number } {
  let i = start;
  if (s[i] === '"') {
    const endQuote = s.indexOf('"', i + 1);
    if (endQuote === -1) {
      return { value: s.slice(i + 1), end: s.length };
    }
    return { value: s.slice(i + 1, endQuote), end: endQuote + 1 };
  }
  let end = i;
  while (end < s.length) {
    if (/\s/.test(s[end])) break;
    const tail = s.slice(end);
    if (/^(from|in|has):/i.test(tail)) break;
    end++;
  }
  return { value: s.slice(i, end).trim(), end };
}

function skipSpaces(s: string, i: number): number {
  let j = i;
  while (j < s.length && /\s/.test(s[j])) j++;
  return j;
}

function mapHasValue(raw: string): MessageSearchHasType {
  const v = raw.trim().toLowerCase();
  if (["file", "files", "attachment", "attachments"].includes(v)) {
    return "file";
  }
  return "image";
}

export function parseMessageSearchQuery(input: string): ParsedMessageSearch {
  const filters: ParsedMessageSearchFilters = {};
  const textParts: string[] = [];
  const s = input.trim();
  let i = 0;

  while (i < s.length) {
    i = skipSpaces(s, i);
    if (i >= s.length) break;
    const rest = s.slice(i);
    const fm = /^(from|in|has):/i.exec(rest);
    if (fm) {
      i += fm[0].length;
      const { value, end } = readFilterValue(s, i);
      i = skipSpaces(s, end);
      const key = fm[1].toLowerCase();
      if (key === "from") filters.from = value;
      else if (key === "in") filters.in = value;
      else if (key === "has") filters.has = mapHasValue(value);
    } else {
      let end = i;
      while (end < s.length) {
        if (/\s/.test(s[end])) break;
        const tail = s.slice(end);
        if (/^(from|in|has):/i.test(tail)) break;
        end++;
      }
      textParts.push(s.slice(i, end));
      i = end;
    }
  }

  return {
    text: textParts.join(" ").replace(/\s+/g, " ").trim(),
    filters,
  };
}

export function parseMessageSearchQueryForDm(input: string): ParsedMessageSearch {
  const base = parseMessageSearchQuery(input);
  const { in: _drop, ...rest } = base.filters;
  return {
    text: base.text,
    filters: rest,
  };
}

export function highlightTermsFromParsed(parsed: ParsedMessageSearch): string[] {
  const terms = parsed.text.split(/\s+/).filter(Boolean);
  return terms;
}
