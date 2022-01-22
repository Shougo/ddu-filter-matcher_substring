import { BaseFilter, DduItem, SourceOptions } from "https://deno.land/x/ddu_vim@v0.1.0/types.ts";
import { Denops } from "https://deno.land/x/ddu_vim@v0.1.0/deps.ts";

type Params = Record<never, never>;

export class Filter extends BaseFilter<Params> {
  filter(args: {
    denops: Denops;
    sourceOptions: SourceOptions;
    input: string;
    items: DduItem[];
  }): Promise<DduItem[]> {
    const input = args.sourceOptions.ignoreCase
      ? args.input.toLowerCase()
      : args.input;
    return Promise.resolve(args.items.filter(
      (item) =>
        args.sourceOptions.ignoreCase
          ? item.matcherKey.toLowerCase().includes(input)
          : item.matcherKey.includes(input),
    ));
  }

  params(): Params {
    return {};
  }
}
