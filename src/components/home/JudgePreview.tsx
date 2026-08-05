const CODE_LINES: { tokens: { t: string; c?: string }[] }[] = [
  { tokens: [{ t: "#include", c: "pre" }, { t: " " }, { t: "<stdio.h>", c: "str" }] },
  { tokens: [] },
  {
    tokens: [
      { t: "int", c: "kw" },
      { t: " main" },
      { t: "(", c: "punc" },
      { t: "void", c: "kw" },
      { t: ")", c: "punc" },
      { t: " {", c: "punc" },
    ],
  },
  {
    tokens: [
      { t: "    long long", c: "kw" },
      { t: " n, sum = " },
      { t: "0", c: "num" },
      { t: ";", c: "punc" },
    ],
  },
  {
    tokens: [
      { t: "    scanf" },
      { t: "(", c: "punc" },
      { t: '"%lld"', c: "str" },
      { t: ", &n" },
      { t: ");", c: "punc" },
    ],
  },
  {
    tokens: [
      { t: "    for", c: "kw" },
      { t: " (" , c: "punc" },
      { t: "long long", c: "kw" },
      { t: " i = " },
      { t: "1", c: "num" },
      { t: "; i <= n; i++" },
      { t: ")", c: "punc" },
      { t: " sum += i;" },
    ],
  },
  {
    tokens: [
      { t: "    printf" },
      { t: "(", c: "punc" },
      { t: '"%lld\\n"', c: "str" },
      { t: ", sum" },
      { t: ");", c: "punc" },
    ],
  },
  {
    tokens: [
      { t: "    return", c: "kw" },
      { t: " " },
      { t: "0", c: "num" },
      { t: ";", c: "punc" },
    ],
  },
  { tokens: [{ t: "}", c: "punc" }] },
];

const TOKEN_COLOR: Record<string, string> = {
  kw: "text-[var(--info)]",
  str: "text-[var(--accent-soft)]",
  num: "text-[var(--warn)]",
  pre: "text-[var(--muted-dim)]",
  punc: "text-[var(--muted)]",
};

const TESTS = [
  { label: "Sample #1", time: "4 ms" },
  { label: "Hidden #2", time: "6 ms" },
  { label: "Hidden #3 · n = 10⁹", time: "11 ms" },
];

export function JudgePreview() {
  return (
    <figure
      aria-label="Preview of the C judge running a submitted solution"
      className="panel min-w-0 overflow-hidden"
    >
      <div className="flex items-center justify-between border-b border-[var(--line)] bg-[var(--sunken)] pr-4">
        <div className="flex" role="tablist" aria-label="Editor tabs">
          <span
            role="tab"
            aria-selected="true"
            className="border-r border-[var(--line)] border-b-2 border-b-[var(--accent)] bg-[var(--bg-panel)] px-4 py-2.5 font-mono text-xs text-[var(--text)]"
          >
            main.c
          </span>
          <span
            role="tab"
            aria-selected="false"
            className="border-r border-[var(--line)] px-4 py-2.5 font-mono text-xs text-[var(--muted-dim)]"
          >
            stdin
          </span>
        </div>
        <span className="font-mono text-[10px] tracking-wider text-[var(--muted-dim)] uppercase">
          C · 1000 ms · 256 MB
        </span>
      </div>

      <pre
        aria-label="Submitted C source code"
        className="overflow-x-auto px-4 py-4 font-mono text-[11.5px] leading-[1.8] sm:px-5 sm:text-[12.5px]"
      >
        <code>
          {CODE_LINES.map((line, i) => (
            <div key={i} className="flex gap-4">
              <span
                aria-hidden
                className="w-4 shrink-0 select-none text-right text-[var(--muted-dim)]/60"
              >
                {i + 1}
              </span>
              <span className="whitespace-pre">
                {line.tokens.length === 0
                  ? " "
                  : line.tokens.map((tok, j) => (
                      <span key={j} className={tok.c ? TOKEN_COLOR[tok.c] : undefined}>
                        {tok.t}
                      </span>
                    ))}
              </span>
            </div>
          ))}
        </code>
      </pre>

      <div className="border-t border-[var(--line)] bg-[var(--sunken)]">
        <div className="flex items-center justify-between px-4 py-3 sm:px-5">
          <span className="flex items-center gap-2 font-mono text-xs font-semibold text-[var(--accent)]">
            <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
            ACCEPTED
          </span>
          <span className="font-mono text-[11px] text-[var(--muted-dim)]">
            3/3 tests · 21 ms total
          </span>
        </div>
        <ul className="divide-y divide-[var(--line-soft)] border-t border-[var(--line-soft)]">
          {TESTS.map((t) => (
            <li
              key={t.label}
              className="flex items-center justify-between px-4 py-2.5 font-mono text-[11px] sm:px-5"
            >
              <span className="text-[var(--muted)]">{t.label}</span>
              <span className="flex items-center gap-3">
                <span className="tnum text-[var(--muted-dim)]">{t.time}</span>
                <span className="text-[var(--accent)]">AC</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </figure>
  );
}

