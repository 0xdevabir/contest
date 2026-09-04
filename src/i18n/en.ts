/**
 * Source-of-truth dictionary. `bn.ts` is typed as `Dict`, so a missing or
 * extra key in the Bangla translation is a compile error — see D1 of
 * docs/phases/PHASE-14-i18n-pwa.md.
 *
 * Keep values as plain strings with `{placeholder}` tokens; interpolate them
 * with `t()` from `./index`. Technical terms (verdict codes, algorithm
 * names) deliberately stay in English in both locales — that is the
 * community's actual usage.
 */
export const en = {
  nav: {
    problems: "Problems",
    contests: "Contests",
    leaderboard: "Leaderboard",
    institutions: "Institutions",
    courses: "My courses",
    notifications: "Notifications",
    profile: "Profile",
    settings: "Settings",
    admin: "Admin",
    teacher: "Teacher",
    login: "Log in",
    register: "Sign up",
    logout: "Log out",
    signedInAs: "Signed in as {name}",
    skipToContent: "Skip to content",
  },

  common: {
    save: "Save",
    saving: "Saving…",
    saved: "Saved",
    cancel: "Cancel",
    submit: "Submit",
    run: "Run",
    copy: "Copy",
    copied: "Copied",
    loading: "Loading…",
    retry: "Retry",
    close: "Close",
    back: "Back",
    next: "Next",
    previous: "Previous",
    search: "Search",
    viewAll: "View all",
    error: "Something went wrong",
    tryAgain: "Try again",
    yes: "Yes",
    no: "No",
    optional: "Optional",
  },

  auth: {
    loginTitle: "Welcome back",
    loginSubtitle: "Log in to keep track of your progress.",
    emailLabel: "Email",
    passwordLabel: "Password",
    loginButton: "Log in",
    loginPending: "Logging in…",
    registerPrompt: "New here?",
    registerLink: "Create an account",
    forgotPassword: "Forgot password?",
    registerTitle: "Create your account",
    registerSubtitle: "Free forever. No credit card, no ads.",
    registerButton: "Create account",
    nameLabel: "Full name",
    institutionLabel: "Institution",
    invalidCredentials: "Incorrect email or password.",
    accountCreated: "Account created — check your email to verify it.",
  },

  judge: {
    verdict: {
      AC: "Accepted",
      WA: "Wrong Answer",
      CE: "Compile Error",
      RE: "Runtime Error",
      TLE: "Time Limit Exceeded",
      MLE: "Memory Limit Exceeded",
      SKIP: "Not Auto-Judged",
      ERROR: "Judge Error",
      PA: "Partial",
      OLE: "Output Limit Exceeded",
      IE: "Judge Unavailable",
      PENDING: "Queued",
      JUDGING: "Judging",
    },
    runButton: "Run",
    submitButton: "Submit",
    running: "Running…",
    judging: "Judging…",
    queued: "Queued for judging",
    testsPassed: "{passed}/{total} tests passed",
    slowestTest: "Slowest test",
    signInToSubmit: "Sign in to submit an answer.",
    verdictAnnounced: "Verdict: {verdict}",
  },

  problem: {
    question: "Question {n}",
    solved: "Solved",
    difficulty: "Difficulty",
    timeLimit: "Time limit",
    memoryLimit: "Memory limit",
    sampleInput: "Sample input",
    sampleOutput: "Sample output",
    customInput: "Custom input",
    tabQuestion: "Question",
    tabCode: "Code",
    panelTerminal: "Terminal",
    panelTests: "Tests",
    resetCode: "Reset code",
    languageUnavailable: "Not available in Bangla yet — showing the English statement.",
    toggleLanguage: "Read in {locale}",
  },

  contest: {
    startsIn: "Starts in {time}",
    endsIn: "Ends in {time}",
    ended: "Ended",
    live: "Live",
    standings: "Standings",
    registered: "Registered",
    register: "Register",
    solvedCountOne: "{count} solved",
    solvedCountOther: "{count} solved",
  },

  offline: {
    youAreOffline: "You're offline — showing cached data.",
    backOnline: "Back online.",
    submissionQueuedOne: "1 submission queued — will send when you're back online.",
    submissionQueuedOther: "{count} submissions queued — will send when you're back online.",
    submissionSent: "Queued submission sent.",
    draftRestored: "Restored your last draft for this problem.",
    installApp: "Install app",
    updateAvailable: "An update is ready.",
    reloadToUpdate: "Reload to update",
  },

  a11y: {
    ariaLiveVerdict: "Judge result",
    contrastNote: "Meets WCAG 2.1 AA contrast",
  },
} as const;

export type Dict = typeof en;
