const enum TypeLog {
  log = "[log]",
  error = "[error]"
}

interface Log {
  type: TypeLog,
  time: Date,
  message: string
}

const notifyEvery: number = 1;
const logsLimit: number = 100;
const joiner: string = "\n";
const label: string = "just-files";
const show: string = "Show All Collected Logs";

const formatDate = (date: Date): string => {
  const pad = (n: number) => n.toString().padStart(2, '0');
  const padMs = (n: number) => n.toString().padStart(3, '0');
  return `${date.getFullYear()}-` +
         `${pad(date.getMonth() + 1)}-` +
         `${pad(date.getDate())} ` +
         `${pad(date.getHours())}:` +
         `${pad(date.getMinutes())}:` +
         `${pad(date.getSeconds())}.` +
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

  static log(...args: any[]): void {
    const message = args.map((arg) => 
      typeof arg === 'object' ? stringify(arg) : String(arg)
    ).join(joiner);
    this.logs.push(
      { type: TypeLog.log, time: new Date(), message: message }
    );
    this.printIfIsMaxOrNotify();
  }

  static error(...args: any[]): void {
    const message = args.map((arg) => 
      typeof arg === 'object' ? stringify(arg) : String(arg)
    ).join(joiner);
    this.logs.push(
      { type: TypeLog.error, time: new Date(), message: message }
    );
    this.printIfIsMaxOrNotify();
  }

  static print() {
    this.logs.forEach((log) => console.log(
      `${formatDate(log.time)} ${log.type} ${label}: ${log.message}`
    ));
    this.logs = [];
  }
}
