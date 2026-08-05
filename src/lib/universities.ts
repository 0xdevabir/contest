export const UNIVERSITIES = [
  {
    code: "DIU" as const,
    name: "Daffodil International University",
    shortName: "DIU",
  },
  {
    code: "NSU" as const,
    name: "North South University",
    shortName: "NSU",
  },
  {
    code: "AIUB" as const,
    name: "American International University-Bangladesh",
    shortName: "AIUB",
  },
  {
    code: "BRAC" as const,
    name: "BRAC University",
    shortName: "BRAC",
  },
] as const;

export type UniversityCode = (typeof UNIVERSITIES)[number]["code"];

export function universityLabel(code: string): string {
  return UNIVERSITIES.find((u) => u.code === code)?.name ?? code;
}

export function isUniversityCode(v: string): v is UniversityCode {
  return UNIVERSITIES.some((u) => u.code === v);
}
