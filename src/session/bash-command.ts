// Whether a session's Bash call runs `git commit` or `git push`, read the way the shell splits
// the command (technical design, "Output and progress", "Reading a Bash command"). Heredoc
// bodies and quoted text are data; commands inside script files or `bash -c '…'` aren't read.

/**
 * The git subcommands the command's simple commands run, in order.
 *
 *   gitSubcommands("git add -A && git -C ../wt commit -F - <<'EOF'\ngit push later\nEOF")  // ["add", "commit"]
 *   gitSubcommands('M=x git push -u origin feature/x')                                      // ["push"]
 */
export function gitSubcommands(command: string): string[] {
  const subcommands: string[] = [];
  for (const words of simpleCommands(command)) {
    const subcommand = gitSubcommandOf(words);
    if (subcommand !== undefined) subcommands.push(subcommand);
  }
  return subcommands;
}

export function runsGitCommit(command: string): boolean {
  return gitSubcommands(command).includes("commit");
}

export function runsGitPush(command: string): boolean {
  return gitSubcommands(command).includes("push");
}

const LEADING_KEYWORDS = new Set(["do", "then", "else", "{"]);
/** Global options that take the next word as their value. */
const GIT_OPTIONS_WITH_VALUE = new Set(["-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path", "--config-env"]);

function gitSubcommandOf(words: string[]): string | undefined {
  let index = 0;
  while (index < words.length && (LEADING_KEYWORDS.has(words[index]!) || /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[index]!))) index++;
  if (words[index] !== "git") return undefined;
  index++;
  while (index < words.length && words[index]!.startsWith("-")) {
    if (GIT_OPTIONS_WITH_VALUE.has(words[index]!)) index++;
    index++;
  }
  return words[index];
}

interface Scanner {
  text: string;
  position: number;
}

/**
 * Splits a command into simple commands, each a list of words, at `&&`, `||`, `;`, `|`, `&`,
 * newlines, `(`, `)`, and the commands inside unquoted `$(…)` and backticks.
 */
export function simpleCommands(command: string): string[][] {
  const commands: string[][] = [];
  scanList({ text: command, position: 0 }, commands, undefined);
  return commands;
}

/**
 * Scans commands until the end of the text, or until `stop` (`)` for `$(`, a backtick for
 * a backtick substitution) at depth zero. Found commands are pushed onto `commands`, or
 * dropped when `commands` is undefined (a substitution inside quotes is data).
 */
function scanList(scanner: Scanner, commands: string[][] | undefined, stop: ")" | "`" | undefined): void {
  let words: string[] = [];
  let word: string | undefined;
  const pendingHeredocs: { delimiter: string; stripTabs: boolean }[] = [];
  let skipNextWord = false;

  const endWord = () => {
    if (word !== undefined) {
      if (skipNextWord) skipNextWord = false;
      else words.push(word);
    }
    word = undefined;
  };
  const endCommand = () => {
    endWord();
    if (words.length > 0) commands?.push(words);
    words = [];
  };
  const append = (text: string) => (word = (word ?? "") + text);

  const { text } = scanner;
  while (scanner.position < text.length) {
    const char = text[scanner.position]!;
    const next = text[scanner.position + 1];

    if (stop !== undefined && char === stop) {
      scanner.position++;
      endCommand();
      return;
    }
    if (char === "\n") {
      scanner.position++;
      endCommand();
      for (const heredoc of pendingHeredocs.splice(0)) skipHeredocBody(scanner, heredoc.delimiter, heredoc.stripTabs);
      continue;
    }
    if (char === " " || char === "\t" || char === "\r") {
      scanner.position++;
      endWord();
      continue;
    }
    if (char === "#" && word === undefined) {
      while (scanner.position < text.length && text[scanner.position] !== "\n") scanner.position++;
      continue;
    }
    if (char === "\\") {
      if (next === "\n") scanner.position += 2;
      else {
        append(next ?? "");
        scanner.position += 2;
      }
      continue;
    }
    if (char === "'") {
      const end = text.indexOf("'", scanner.position + 1);
      const close = end === -1 ? text.length : end;
      append(text.slice(scanner.position + 1, close));
      scanner.position = close + 1;
      continue;
    }
    if (char === '"') {
      scanner.position++;
      append(scanDoubleQuoted(scanner));
      continue;
    }
    if (char === "$" && next === "(") {
      scanner.position += 2;
      if (text[scanner.position] === "(") {
        skipArithmetic(scanner);
      } else {
        scanList(scanner, commands, ")");
      }
      append("$(…)");
      continue;
    }
    if (char === "$" && next === "{") {
      const end = text.indexOf("}", scanner.position);
      const close = end === -1 ? text.length : end;
      append(text.slice(scanner.position, close + 1));
      scanner.position = close + 1;
      continue;
    }
    if (char === "`") {
      scanner.position++;
      scanList(scanner, commands, "`");
      append("`…`");
      continue;
    }
    if (char === "<" && next === "<" && text[scanner.position + 2] !== "<") {
      endWord();
      scanner.position += 2;
      const stripTabs = text[scanner.position] === "-";
      if (stripTabs) scanner.position++;
      while (text[scanner.position] === " " || text[scanner.position] === "\t") scanner.position++;
      pendingHeredocs.push({ delimiter: readHeredocDelimiter(scanner), stripTabs });
      continue;
    }
    if (char === "<" || char === ">") {
      // A redirection: drop a file-descriptor number before it, and its target after it.
      if (word !== undefined && /^\d+$/.test(word)) word = undefined;
      endWord();
      scanner.position++;
      while (text[scanner.position] === ">" || text[scanner.position] === "<" || text[scanner.position] === "&" || text[scanner.position] === "|") {
        scanner.position++;
      }
      if (/\d|-/.test(text[scanner.position] ?? "") && text[scanner.position - 1] === "&") {
        while (/[\d-]/.test(text[scanner.position] ?? "")) scanner.position++;
        continue;
      }
      skipNextWord = true;
      continue;
    }
    if (char === "&" || char === "|" || char === ";" || char === "(" || char === ")") {
      scanner.position++;
      endCommand();
      continue;
    }
    append(char);
    scanner.position++;
  }
  endCommand();
}

/** Reads a double-quoted string's contents up to its closing quote; substitutions in it are data. */
function scanDoubleQuoted(scanner: Scanner): string {
  const { text } = scanner;
  let value = "";
  while (scanner.position < text.length) {
    const char = text[scanner.position]!;
    if (char === '"') {
      scanner.position++;
      return value;
    }
    if (char === "\\") {
      // As in Bash, a backslash escapes only $, `, ", \ and a newline; before anything else it stays.
      const next = text[scanner.position + 1] ?? "";
      if (next === "\n") value += "";
      else if ("$`\"\\".includes(next) && next !== "") value += next;
      else value += `\\${next}`;
      scanner.position += 2;
      continue;
    }
    if (char === "$" && text[scanner.position + 1] === "(") {
      scanner.position += 2;
      scanList(scanner, undefined, ")");
      value += "$(…)";
      continue;
    }
    if (char === "`") {
      scanner.position++;
      scanList(scanner, undefined, "`");
      value += "`…`";
      continue;
    }
    value += char;
    scanner.position++;
  }
  return value;
}

function skipArithmetic(scanner: Scanner): void {
  let depth = 1;
  while (scanner.position < scanner.text.length && depth > 0) {
    const char = scanner.text[scanner.position]!;
    if (char === "(") depth++;
    else if (char === ")") depth--;
    scanner.position++;
  }
  // `$((…))` closes with two parentheses; the loop consumed the inner one.
  if (scanner.text[scanner.position] === ")") scanner.position++;
}

function readHeredocDelimiter(scanner: Scanner): string {
  const { text } = scanner;
  let delimiter = "";
  while (scanner.position < text.length) {
    const char = text[scanner.position]!;
    if (char === "'" || char === '"') {
      const end = text.indexOf(char, scanner.position + 1);
      const close = end === -1 ? text.length : end;
      delimiter += text.slice(scanner.position + 1, close);
      scanner.position = close + 1;
      continue;
    }
    if (char === "\\") {
      delimiter += text[scanner.position + 1] ?? "";
      scanner.position += 2;
      continue;
    }
    if (/[\s;&|<>()]/.test(char)) break;
    delimiter += char;
    scanner.position++;
  }
  return delimiter;
}

function skipHeredocBody(scanner: Scanner, delimiter: string, stripTabs: boolean): void {
  const { text } = scanner;
  while (scanner.position < text.length) {
    const end = text.indexOf("\n", scanner.position);
    const lineEnd = end === -1 ? text.length : end;
    let line = text.slice(scanner.position, lineEnd).replace(/\r$/, "");
    if (stripTabs) line = line.replace(/^\t+/, "");
    scanner.position = end === -1 ? text.length : end + 1;
    if (line === delimiter) return;
  }
}
