export const BRAND = {
  name: "DIU ContestHub",
  prefix: "DIU",
  wordmark: "ContestHub",
  university: "Daffodil International University",
  tagline: "Exam-style C training and live contests",
  shortDescription:
    "Practice C programming, run code against hidden tests, and compete in live inter-university contests with DIU, NSU, AIUB, and BRAC.",
  description:
    "DIU ContestHub is the competitive programming platform of Daffodil International University: 700 exam-style C problems across 7 difficulty tiers (Very Easy to Extreme), an instant C judge that compiles with gcc/clang and returns AC, WA, TLE, RE, MLE, or CE verdicts in milliseconds, and live inter-university programming contests between DIU, NSU, AIUB, and BRAC.",
  keywords: [
    "online judge",
    "C programming judge",
    "online C compiler",
    "competitive programming",
    "C practice problems",
    "programming contest",
    "online coding contest",
    "C exam preparation",
    "exam-style C problems",
    "university programming contest",
    "DIU ContestHub",
    "Daffodil International University",
    "NSU programming contest",
    "AIUB programming contest",
    "BRAC programming contest",
    "ICPC practice",
    "Bangladesh programming contest",
    "hidden test cases",
    "AC WA TLE",
    "gcc clang judge",
  ],
  siteUrl:
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    process.env.APP_URL?.replace(/\/$/, "") ||
    "https://diucontesthub.local",
  twitterHandle: "@diucontesthub",
  supportEmail: "noreply@diucontesthub.local",
} as const;
