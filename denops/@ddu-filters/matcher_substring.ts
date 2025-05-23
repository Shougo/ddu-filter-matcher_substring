import {
  type DduItem,
  type SourceOptions,
} from "jsr:@shougo/ddu-vim@~7.0.0/types";
import { BaseFilter } from "jsr:@shougo/ddu-vim@~7.0.0/filter";

import type { Denops } from "jsr:@denops/core@~7.0.0";

type Params = {
  highlightMatched: string;
  limit: number;
};

function charposToBytepos(input: string, pos: number): number {
  return (new TextEncoder()).encode(input.slice(0, pos)).length;
}

export class Filter extends BaseFilter<Params> {
  override filter(args: {
    denops: Denops;
    sourceOptions: SourceOptions;
    filterParams: Params;
    input: string;
    items: DduItem[];
  }): Promise<DduItem[]> {
    if (args.input == "") {
      return Promise.resolve(args.items);
    }

    const ignoreCase = args.sourceOptions.ignoreCase &&
      !(args.sourceOptions.smartCase && /[A-Z]/.test(args.input));
    const input = ignoreCase ? args.input.toLowerCase() : args.input;

    // Split input for matchers
    const inputs = input.split(/(?<!\\)\s+/).filter((x) => x !== "").map((x) =>
      x.replaceAll(/\\(?=\s)/g, "")
    );
    const limit = args.filterParams.limit;
    const items = inputs.reduce(
      (items, input) =>
        items.filter(({ matcherKey }) => {
          if (input.startsWith("!")) {
            const negatedInput = input.slice(1);
            return ignoreCase
              ? !matcherKey.toLowerCase().includes(negatedInput.toLowerCase())
              : !matcherKey.includes(negatedInput);
          } else {
            return ignoreCase
              ? matcherKey.toLowerCase().includes(input.toLowerCase())
              : matcherKey.includes(input);
          }
        }),
      args.items,
    ).slice(0, limit);

    if (args.filterParams.highlightMatched === "") {
      return Promise.resolve(items);
    }

    // Highlight matched text
    return Promise.resolve(
      items.map(
        (item) => {
          const display = item.display ?? item.word;
          const matcherKey = ignoreCase ? display.toLowerCase() : display;
          const highlights = item.highlights ?? [];
          for (const subInput of inputs) {
            // Skip ignored input
            if (subInput.startsWith("!")) {
              continue;
            }

            const start = matcherKey.lastIndexOf(subInput);
            if (start >= 0) {
              highlights.push({
                name: "matched",
                hl_group: args.filterParams.highlightMatched,
                col: charposToBytepos(matcherKey, start) + 1,
                width: (new TextEncoder()).encode(subInput).length,
              });
            }
          }

          return {
            ...item,
            highlights,
          };
        },
      ),
    );
  }

  override params(): Params {
    return {
      highlightMatched: "",
      limit: 1000,
    };
  }
}
