import {
  BaseFilter,
  DduItem,
  SourceOptions,
} from "https://deno.land/x/ddu_vim@v0.13/types.ts";
import { Denops } from "https://deno.land/x/ddu_vim@v0.13/deps.ts";

type Params = Record<never, never>;

export class Filter extends BaseFilter<Params> {
  filter(args: {
    denops: Denops;
    sourceOptions: SourceOptions;
    input: string;
    items: DduItem[];
  }): Promise<DduItem[]> {
    if (args.input == "") {
      return Promise.resolve(args.items);
    }

    const input = args.sourceOptions.ignoreCase
      ? args.input.toLowerCase()
      : args.input;
    return args.sourceOptions.ignoreCase
      ? Promise.resolve(args.items.filter(
        (item) => item.matcherKey.toLowerCase().includes(input),
      ))
      : Promise.resolve(args.items.filter(
        (item) => item.matcherKey.includes(input),
      ));
  }

  params(): Params {
    return {};
  }
}
