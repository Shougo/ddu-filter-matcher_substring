import type { DduItem, ItemHighlight } from "@shougo/ddu-vim/types";
import { BaseFilter, type FilterArguments } from "@shougo/ddu-vim/filter";

type Params = {
  highlightMatched: string;
  limit: number;
  maxLength: number;
};

function charposToBytepos(input: string, pos: number): number {
  return (new TextEncoder()).encode(input.slice(0, pos)).length;
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
  // Indicate this filter's highlight stage is parallel-safe.
  // Core should check this flag before parallelizing filters.
  static parallelSafe = true;

  override async filter(args: FilterArguments<Params>): Promise<DduItem[]> {
    if (args.input === "") {
      return args.items;
    }

    const ignoreCase = args.sourceOptions.ignoreCase &&
      !(args.sourceOptions.smartCase && /[A-Z]/.test(args.input));
    const rawInput = args.input;
    const input = ignoreCase ? rawInput.toLowerCase() : rawInput;

    // Split input for matchers (same semantics as original)
    const inputs = input.split(/(?<!\\)\s+/).filter((x) => x !== "").map((x) =>
      x.replaceAll(/\\(?=\s)/g, "")
    );

    const limit = args.filterParams.limit;
    const maxLength = args.filterParams.maxLength;

    // Phase A: Sequential filtering to ensure 'limit' semantics are consistent.
    let filtered: DduItem[] = args.items;
    for (const sub of inputs) {
      filtered = filtered.filter(({ matcherKey }) => {
        if (!matcherKey) return false;
        if (matcherKey.length > maxLength) {
          return false;
        }

        const lowerKey = matcherKey.toLowerCase();
        if (sub.startsWith("!")) {
          const negatedInput = sub.slice(1);
          return ignoreCase
            ? !lowerKey.includes(negatedInput.toLowerCase())
            : !matcherKey.includes(negatedInput);
        } else if (sub.startsWith("<")) {
          // NOTE: If the input starts with "<", perform a regular expression
          // match with word boundaries.
          const escaped = sub.slice(1).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const regex = new RegExp(`\\b${escaped}`, ignoreCase ? "i" : "");
          return regex.test(matcherKey);
        } else if (sub.startsWith("^")) {
          // If the input starts with "^", match the beginning of the string
          const prefix = sub.slice(1);
          return ignoreCase
            ? lowerKey.startsWith(prefix.toLowerCase())
            : matcherKey.startsWith(prefix);
        } else if (sub.endsWith("$")) {
          // If the input ends with "$", match the end of the string
          const suffix = sub.slice(0, -1);
          return ignoreCase
            ? lowerKey.endsWith(suffix.toLowerCase())
            : matcherKey.endsWith(suffix);
        } else {
          // Default behavior: check if "input" is included in "matcherKey"
          return ignoreCase
            ? lowerKey.includes(sub.toLowerCase())
            : matcherKey.includes(sub);
        }
      });
      if (filtered.length === 0) break;
    }
    filtered = filtered.slice(0, limit);

    // If no highlight is requested, return filtered results directly.
    if (args.filterParams.highlightMatched === "") {
      return filtered;
    }

    // Phase B: Highlight mapping (parallelizable).
    // Make sure to NOT mutate shared arrays: create a shallow copy of highlights.
    const encoder = new TextEncoder();
    // Default concurrency; core could pass this as an option in future.
    const concurrency = 4;

    const workerFn = (item: DduItem): DduItem => {
      const display = item.display ?? item.word;
      const matcherKey = ignoreCase ? display.toLowerCase() : display;

      const previous = Array.isArray(item.highlights)
        ? item.highlights.slice()
        : [];
      const highlights: ItemHighlight[] = previous;

      for (const subRaw of inputs) {
        if (subRaw.startsWith("!")) {
          continue;
        }

        const start = matcherKey.lastIndexOf(subRaw);
        if (start >= 0) {
          highlights.push({
            name: "matched",
            hl_group: args.filterParams.highlightMatched,
            col: charposToBytepos(matcherKey, start) + 1,
            width: encoder.encode(subRaw).length,
          });
        }
      }

      // Return a new item; avoid mutating the original item object in-place.
      return {
        ...item,
        highlights,
      };
    };

    const result = await mapWithConcurrency(filtered, concurrency, workerFn);
    return result;
  }

  override params(): Params {
    return {
      highlightMatched: "",
      limit: 1000,
      maxLength: 500,
    };
  }
}
