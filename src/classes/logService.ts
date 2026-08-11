import * as vscodes from "../types/vscodes";
import { getKeyByValue } from "./utilManager";

interface Log {
  type: TypeLog,
  time: Date,
  message: string
}

type TypeLog = vscodes.EnumLike<typeof TypeLog>;

const notifyEvery: number = 1;
const logsLimit: number = 100;
const joiner: string = "\n";
const label: string = "just-files";
const show: string = "Show All Collected Logs";
// eslint-disable-next-line @typescript-eslint/naming-convention
const TypeLog = {
  log:   "[log]",
  error: "[error]"
} as const;

const ANSI = { /// values from the current theme
    /// standard Colors
    blue:          "\x1b[34m",
    cyan:          "\x1b[36m",
    green:         "\x1b[32m",
    magenta:       "\x1b[35m",
    red:           "\x1b[31m",
    yellow:        "\x1b[33m",
    /// bright colors
    brightBlue:    "\x1b[94m",
    brightCyan:    "\x1b[96m",
    brightGreen:   "\x1b[92m",
    brightMagenta: "\x1b[95m",
    brightRed:     "\x1b[91m",
    brightYellow:  "\x1b[93m",
    /// text formats
    bold:          "\x1b[1m",
    reset:         "\x1b[0m"
} as const;

const formatDate = (date: Date): string => {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const padMs = (n: number) => n.toString().padStart(3, '0');
  return `${date.getFullYear()}-`       +
         `${pad(date.getMonth() + 1)}-` +
         `${pad(date.getDate())} `      +
         `${pad(date.getHours())}:`     +
         `${pad(date.getMinutes())}:`   +
         `${pad(date.getSeconds())}.`   +
         `${padMs(date.getMilliseconds())}`;
};

const stringify = (value: any): string => {
  let stringified = JSON.stringify(value);
  if (stringified === "{}") {
    stringified = Object.getOwnPropertyNames(value)
      .map((key) => `${key}: ${value[key]}`)
      .join(joiner);
  }
  return stringified;
};

export class LogService {
  private static logs: Log[] = [];

  private static printIfIsMaxOrNotify() {
    const count = this.logs.length;

    if (count >= logsLimit) {
      this.print();
    } else
    if (count > 0 && count % notifyEvery === 0) {
      notifyEvery === 1 ?
        this.print()
      : console.info(
          `${formatDate(new Date())} ${label} extension has ${count}` +
          ` collected messages, use '${show}' command to print them all.`
        );
    }
  }

  private static styleOf = (type: number) => {
    switch (type) {
      case LogService.console.type.error:
        return `${ANSI.brightRed}${ANSI.bold}`;
      case LogService.console.type.debug:
        return `${ANSI.brightMagenta}`;
      case LogService.console.type.warn:
        return `${ANSI.brightYellow}`;
      case LogService.console.type.info:
        return `${ANSI.green}`;
      case LogService.console.type.log:
        return `${ANSI.brightGreen}`;
      case LogService.console.type.trace:
        return `${ANSI.red}${ANSI.bold}`;
      default: return `${ANSI.green}${ANSI.bold}`;
    }
  };

  /**
   * We can use console in a such effective way:
   * 
   * *const style = 
   * "background: yellow; color: black; font-weight: bold;";*
   * 
   * *LogService.console.warn( style, 
   * "FolderProvider", 
   * " :: ", style,
   * "new", \`: ${item.toString()}\`,
   * " :: ", style,
   * "old", \`: ${oldUri.toString()}\`
   * );*
   */
  public static console = (() => {
    const empty = '' as const;
    const cssEmpty =
      "background: none; color: inherit; font-weight: inherit" as const;
    const cssKeywords = [
      "background:", "color:", "padding:", "font-weight:"]     as const;
    const type = {
      log: 1, info: 2, warn: 3, debug: 4, error: 5, trace: 6 } as const;

    type  Type = vscodes.EnumLike<typeof type>;
    type  TypeLike = Type | 0;

    const keyOf  = (value:  Type) => getKeyByValue(type, value);
    const output = (method: TypeLike, args: string[]) => {
      const methodStyle = LogService.styleOf(method);
      const methodType = keyOf(method === 0 ? type.log : method);
      const methodName = methodType as keyof typeof console;
      const formatted: string[] = [];
      const styles: string[] = [];

      let i = 0;
      let lastHasStyle = false;
      while (i < args.length) {
        const text = args[i + 1];
        const rule = args[i];
        if (rule && text && cssKeywords.some(k => rule.includes(k))) {
          lastHasStyle = true;
          formatted.push(`%c${text}`);
          styles.push(rule);
          i += 2; }
        else {
          const text = rule;
          if (lastHasStyle) {
            formatted.push(`%c${methodStyle}${text}`);
            styles.push(cssEmpty); }
          else {
            formatted.push(`${text}`);
          }
          lastHasStyle = false;
          i += 1;
        }
        if (styles.length <= 0) { formatted.unshift(methodStyle); }
      }
      const outputs = console[methodName] as (...data: string[]) => void;
      outputs(formatted.join(empty), ...styles);
    };

    return {
      out:   (...args: string[]) => output(0,          args),
      log:   (...args: string[]) => output(type.log,   args),
      info:  (...args: string[]) => output(type.info,  args),
      warn:  (...args: string[]) => output(type.warn,  args),
      debug: (...args: string[]) => output(type.debug, args),
      error: (...args: string[]) => output(type.error, args),
      trace: (...args: string[]) => output(type.trace, args),
      type: type
    };
  })();

  public static log(...args: unknown[]): void {
    const message = args.map((arg) => 
      typeof arg === 'object' ? stringify(arg) : String(arg)
    ).join(joiner);
    this.logs.push(
      { type: TypeLog.log, time: new Date(), message: message }
    );
    this.printIfIsMaxOrNotify();
  }

  public static error(...args: unknown[]): void {
    const message = args.map((arg) => 
      typeof arg === 'object' ? stringify(arg) : String(arg)
    ).join(joiner);
    this.logs.push(
      { type: TypeLog.error, time: new Date(), message: message }
    );
    this.printIfIsMaxOrNotify();
  }

  public static print() {
    this.logs.forEach((log) => console.log(
      `${formatDate(log.time)} ${log.type} ${label}: ${log.message}`
    ));
    this.logs = [];
  }
}
