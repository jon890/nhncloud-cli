import Table from "cli-table3";

export interface OutputOptions {
  json?: boolean;
  quiet?: boolean;
}

export function truncate(text: string, maxLen = 50): string {
  const oneLine = text.replace(/[\r\n]+/g, " ").trim();
  return oneLine.length > maxLen ? oneLine.slice(0, maxLen) + "…" : oneLine;
}

export function printTable(headers: string[], rows: string[][]): void {
  if (rows.length === 0) {
    process.stdout.write("결과 없음\n");
    return;
  }
  const table = new Table({ head: headers });
  for (const row of rows) {
    table.push(row);
  }
  process.stdout.write(table.toString() + "\n");
}

export function printJson(data: unknown): void {
  process.stdout.write(JSON.stringify(data, null, 2) + "\n");
}

export function printQuiet(ids: string[]): void {
  if (ids.length === 0) return;
  process.stdout.write(ids.join("\n") + "\n");
}

export function output(
  opts: OutputOptions,
  data: {
    headers: string[];
    rows: string[][];
    raw: unknown;
    ids: string[];
  },
): void {
  if (opts.json) {
    printJson(data.raw);
  } else if (opts.quiet) {
    printQuiet(data.ids);
  } else {
    printTable(data.headers, data.rows);
  }
}
