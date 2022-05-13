import {
  BaseFilter,
  DduItem,
  SourceOptions,
} from "https://deno.land/x/ddu_vim@v1.5.0/types.ts";
import { Denops } from "https://deno.land/x/ddu_vim@v1.5.0/deps.ts";

type Params = {
  highlightMatched: string;
  limit: number;
};

function charposToBytepos(input: string, pos: number): number {
  return (new TextEncoder()).encode(input.slice(0, pos)).length;
}

export class Filter extends BaseFilter<Params> {
  async filter(args: {
    denops: Denops;
    sourceOptions: SourceOptions;
    filterParams: Params;
    input: string;
    items: DduItem[];
  }): Promise<DduItem[]> {
    if (args.input == "") {
      return Promise.resolve(args.items);
    }

    const input = args.sourceOptions.ignoreCase
      ? args.input.toLowerCase()
      : args.input;

    let items = args.items;

    // Split input for matchers
    const inputs = input.split(/(?<!\\)\s+/).filter((x) => x != "").map((x) =>
      x.replaceAll(/\\(?=\s)/g, "")
    );
    const limit = args.filterParams.limit;
    for (const subInput of inputs) {
      const filtered = [];
      let filteredLen = 0;
      for (const item of items) {
        const key = args.sourceOptions.ignoreCase
          ? item.matcherKey.toLowerCase()
          : item.matcherKey;
        if (key.includes(subInput)) {
          filtered.push(item);
          filteredLen++;
          if (filteredLen >= limit) {
            break;
          }
        }
      }

      items = filtered;
    }

    if (args.filterParams.highlightMatched == "") {
      return Promise.resolve(items);
    }

    // Highlight matched text
    return Promise.resolve(
      items.map(
        (item) => {
          const display = item.display ?? item.word;
          const matcherKey = args.sourceOptions.ignoreCase
            ? display.toLowerCase()
            : display;
          let highlights =
            item.highlights?.filter((hl) => hl.name != "matched") ?? [];
          for (const subInput of inputs) {
            const start = matcherKey.lastIndexOf(subInput);
            if (start >= 0) {
              highlights.push({
                name: "matched",
                "hl_group": args.filterParams.highlightMatched,
                col: charposToBytepos(matcherKey, start) + 1,
                width: (new TextEncoder()).encode(subInput).length,
              });
            }
          }

          return {
            ...item,
            highlights: highlights,
          };
        },
      ),
    );
  }

  params(): Params {
    return {
      highlightMatched: "",
      limit: 1000,
    };
  }
}
