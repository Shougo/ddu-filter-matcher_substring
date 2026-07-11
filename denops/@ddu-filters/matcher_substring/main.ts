import type { DduItem, ItemHighlight } from "@shougo/ddu-vim/types";
import { BaseFilter, type FilterArguments } from "@shougo/ddu-vim/filter";

type Params = {
  highlightMatched: string;
  limit: number;
  maxLength: number;
};

type MatchMode = "negate" | "word" | "prefix" | "suffix" | "contains";

type Token = {
  mode: MatchMode;
  value: string;
};

function charposToBytepos(input: string, pos: number): number {
  return (new TextEncoder()).encode(input.slice(0, pos)).length;
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseToken(input: string): Token {
  if (input.startsWith("!")) {
    return { mode: "negate", value: input.slice(1) };
  }
  if (input.startsWith("<")) {
    return { mode: "word", value: input.slice(1) };
  }
  if (input.startsWith("^")) {
    return { mode: "prefix", value: input.slice(1) };
  }
  if (input.endsWith("$")) {
    return { mode: "suffix", value: input.slice(0, -1) };
  }
  return { mode: "contains", value: input };
}

function splitInput(input: string): Token[] {
  return input
    .split(/(?<!\\)\s+/)
    .filter((x) => x !== "")
    .map((x) => x.replaceAll(/\\(?=\s)/g, ""))
    .map(parseToken);
}

function matchesToken(
  matcherKey: string,
  token: Token,
  ignoreCase: boolean,
): boolean {
  const key = ignoreCase ? matcherKey.toLowerCase() : matcherKey;
  const value = ignoreCase ? token.value.toLowerCase() : token.value;

  switch (token.mode) {
    case "negate":
      return !key.includes(value);
    case "word":
      return new RegExp(`\\b${escapeRegExp(value)}`, ignoreCase ? "i" : "")
        .test(matcherKey);
    case "prefix":
      return key.startsWith(value);
    case "suffix":
      return key.endsWith(value);
    case "contains":
      return key.includes(value);
  }
}

/** Small concurrency mapper that preserves input order. */
async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => R,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let idx = 0;

  async function worker() {
    while (true) {
      const i = idx++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]);
    }
  }

  const n = Math.max(1, Math.min(concurrency, items.length));
  const workers: Promise<void>[] = [];
  for (let i = 0; i < n; i++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return results;
}

export class Filter extends BaseFilter<Params> {
  override async filter(args: FilterArguments<Params>): Promise<DduItem[]> {
    if (args.input === "") {
      return args.items;
    }

    const ignoreCase = args.sourceOptions.ignoreCase &&
      !(args.sourceOptions.smartCase && /[A-Z]/.test(args.input));
    const tokens = splitInput(
      ignoreCase ? args.input.toLowerCase() : args.input,
    );

    const filtered = args.items.filter((item) => {
      if (!item.matcherKey) return false;
      if (item.matcherKey.length > args.filterParams.maxLength) {
        return false;
      }
      for (const token of tokens) {
        if (!matchesToken(item.matcherKey, token, ignoreCase)) {
          return false;
        }
      }
      return true;
    }).slice(0, args.filterParams.limit);

    if (args.filterParams.highlightMatched === "") {
      return filtered;
    }

    const encoder = new TextEncoder();
    const concurrency = 4;

    const workerFn = (item: DduItem): DduItem => {
      const display = item.display ?? item.word;
      const key = ignoreCase ? display.toLowerCase() : display;
      const previous = Array.isArray(item.highlights)
        ? item.highlights.slice()
        : [];
      const highlights: ItemHighlight[] = previous;

      for (const token of tokens) {
        if (token.mode === "negate") {
          continue;
        }

        const needle = ignoreCase ? token.value.toLowerCase() : token.value;
        const start = key.lastIndexOf(needle);
        if (start < 0) {
          continue;
        }

        highlights.push({
          name: "matched",
          hl_group: args.filterParams.highlightMatched,
          col: charposToBytepos(display, start) + 1,
          width: encoder.encode(needle).length,
        });
      }

      return {
        ...item,
        highlights,
      };
    };

    return await mapWithConcurrency(filtered, concurrency, workerFn);
  }

  override params(): Params {
    return {
      highlightMatched: "",
      limit: 1000,
      maxLength: 500,
    };
  }
}
