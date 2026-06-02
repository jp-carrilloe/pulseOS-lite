const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
} as const;

export type Tone = "info" | "success" | "warning" | "danger" | "muted";

function useColor() {
  return Boolean(process.stdout?.isTTY);
}

function paint(text: string, ...codes: string[]) {
  if (!useColor()) return text;
  return `${codes.join("")}${text}${ANSI.reset}`;
}

export function bold(text: string) {
  return paint(text, ANSI.bold);
}

export function dim(text: string) {
  return paint(text, ANSI.dim);
}

export function tone(text: string, variant: Tone) {
  switch (variant) {
    case "success":
      return paint(text, ANSI.green);
    case "warning":
      return paint(text, ANSI.yellow);
    case "danger":
      return paint(text, ANSI.red);
    case "muted":
      return paint(text, ANSI.dim);
    case "info":
    default:
      return paint(text, ANSI.cyan);
  }
}

export function section(title: string) {
  return `${bold(tone(title, "info"))}\n${dim("─".repeat(Math.max(12, title.length)))}`;
}

export function bullet(text: string, variant: Tone = "muted") {
  const marker =
    variant === "success"
      ? tone("+", "success")
      : variant === "warning"
        ? tone("!", "warning")
        : variant === "danger"
          ? tone("x", "danger")
          : tone(">", "info");
  return `${marker} ${text}`;
}

export function kv(label: string, value: string, variant: Tone = "muted") {
  return `${bold(`${label}:`)} ${tone(value, variant)}`;
}

export function actionBlock(title: string, lines: string[], variant: Tone = "warning") {
  const heading = bold(tone(title, variant));
  const body = lines.map((line) => `${tone("→", variant)} ${line}`).join("\n");
  return `${heading}\n${body}`;
}

/**
 * Starts a terminal spinner with a status message.
 * Returns a stop function: call stop() to clear the spinner line.
 * Call stop(finalLine) to replace the spinner with a final message.
 */
export function spinner(text: string): (finalLine?: string) => void {
  const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  let i = 0;
  const isTTY = Boolean(process.stdout?.isTTY);

  if (!isTTY) {
    process.stdout.write(`${text}\n`);
    return (finalLine?: string) => {
      if (finalLine) process.stdout.write(`${finalLine}\n`);
    };
  }

  process.stdout.write(`${frames[0]} ${text}`);
  const timer = setInterval(() => {
    process.stdout.write(`\r${frames[i % frames.length]} ${text}`);
    i++;
  }, 80);

  return (finalLine?: string) => {
    clearInterval(timer);
    if (finalLine) {
      process.stdout.write(`\r${finalLine}\n`);
    } else {
      process.stdout.write("\r\x1b[K"); // clear line
    }
  };
}
