import type { InstitutionType, Role } from "@prisma/client";
import { prisma } from "../../src/lib/db";

type SeedInstitution = {
  slug: string;
  name: string;
  shortName: string;
  type: InstitutionType;
  district?: string;
  division?: string;
  websiteUrl?: string;
  domains?: { domain: string; roleHint?: Role }[];
};

/**
 * ~65 Bangladeshi institutions covering public universities, engineering &
 * technology universities, agricultural universities, and the major private
 * universities. Domains are only listed where publicly documented — an
 * institution with no domain row simply gets no automatic verification until
 * an admin adds one via /admin/institutions.
 */
export const INSTITUTIONS: SeedInstitution[] = [
  // -- Public: general & science ---------------------------------------
  { slug: "du", name: "University of Dhaka", shortName: "DU", type: "PUBLIC_UNIVERSITY", district: "Dhaka", division: "Dhaka", websiteUrl: "https://www.du.ac.bd", domains: [{ domain: "du.ac.bd" }] },
  { slug: "ru", name: "University of Rajshahi", shortName: "RU", type: "PUBLIC_UNIVERSITY", district: "Rajshahi", division: "Rajshahi", websiteUrl: "https://www.ru.ac.bd", domains: [{ domain: "ru.ac.bd" }] },
  { slug: "cu", name: "University of Chittagong", shortName: "CU", type: "PUBLIC_UNIVERSITY", district: "Chattogram", division: "Chattogram", websiteUrl: "https://www.cu.ac.bd", domains: [{ domain: "cu.ac.bd" }] },
  { slug: "ku", name: "Khulna University", shortName: "KU", type: "PUBLIC_UNIVERSITY", district: "Khulna", division: "Khulna", websiteUrl: "https://ku.ac.bd", domains: [{ domain: "ku.ac.bd" }] },
  { slug: "ju", name: "Jahangirnagar University", shortName: "JU", type: "PUBLIC_UNIVERSITY", district: "Dhaka", division: "Dhaka", websiteUrl: "https://juniv.edu", domains: [{ domain: "juniv.edu" }] },
  { slug: "jnu", name: "Jagannath University", shortName: "JnU", type: "PUBLIC_UNIVERSITY", district: "Dhaka", division: "Dhaka", websiteUrl: "https://jnu.ac.bd", domains: [{ domain: "jnu.ac.bd" }] },
  { slug: "sust", name: "Shahjalal University of Science and Technology", shortName: "SUST", type: "PUBLIC_UNIVERSITY", district: "Sylhet", division: "Sylhet", websiteUrl: "https://sust.edu", domains: [{ domain: "sust.edu" }, { domain: "student.sust.edu", roleHint: "STUDENT" }] },
  { slug: "iu-kushtia", name: "Islamic University, Bangladesh", shortName: "IU", type: "PUBLIC_UNIVERSITY", district: "Kushtia", division: "Khulna", websiteUrl: "https://iu.ac.bd" },
  { slug: "cou", name: "Comilla University", shortName: "CoU", type: "PUBLIC_UNIVERSITY", district: "Cumilla", division: "Chattogram", websiteUrl: "https://cou.ac.bd" },
  { slug: "brur", name: "Begum Rokeya University, Rangpur", shortName: "BRUR", type: "PUBLIC_UNIVERSITY", district: "Rangpur", division: "Rangpur", websiteUrl: "https://brur.ac.bd" },
  { slug: "bu", name: "University of Barishal", shortName: "BU", type: "PUBLIC_UNIVERSITY", district: "Barishal", division: "Barishal", websiteUrl: "https://bu.ac.bd" },
  { slug: "jkkniu", name: "Jatiya Kabi Kazi Nazrul Islam University", shortName: "JKKNIU", type: "PUBLIC_UNIVERSITY", district: "Mymensingh", division: "Mymensingh", websiteUrl: "https://jkkniu.edu.bd" },
  { slug: "nu", name: "National University, Bangladesh", shortName: "NU", type: "NATIONAL_UNIVERSITY_COLLEGE", district: "Gazipur", division: "Dhaka", websiteUrl: "https://nu.ac.bd" },
  { slug: "bou", name: "Bangladesh Open University", shortName: "BOU", type: "PUBLIC_UNIVERSITY", district: "Gazipur", division: "Dhaka", websiteUrl: "https://bou.ac.bd" },
  { slug: "varendra", name: "Varendra University", shortName: "VU", type: "PRIVATE_UNIVERSITY", district: "Rajshahi", division: "Rajshahi", websiteUrl: "https://vu.edu.bd" },
  { slug: "rmstu", name: "Rangamati Science and Technology University", shortName: "RMSTU", type: "PUBLIC_UNIVERSITY", district: "Rangamati", division: "Chattogram", websiteUrl: "https://rmstu.edu.bd" },

  // -- Public: engineering & technology ---------------------------------
  { slug: "buet", name: "Bangladesh University of Engineering and Technology", shortName: "BUET", type: "PUBLIC_UNIVERSITY", district: "Dhaka", division: "Dhaka", websiteUrl: "https://www.buet.ac.bd", domains: [{ domain: "buet.ac.bd" }] },
  { slug: "ruet", name: "Rajshahi University of Engineering & Technology", shortName: "RUET", type: "PUBLIC_UNIVERSITY", district: "Rajshahi", division: "Rajshahi", websiteUrl: "https://www.ruet.ac.bd", domains: [{ domain: "ruet.ac.bd" }, { domain: "student.ruet.ac.bd", roleHint: "STUDENT" }] },
  { slug: "cuet", name: "Chittagong University of Engineering & Technology", shortName: "CUET", type: "PUBLIC_UNIVERSITY", district: "Chattogram", division: "Chattogram", websiteUrl: "https://www.cuet.ac.bd", domains: [{ domain: "cuet.ac.bd" }] },
  { slug: "kuet", name: "Khulna University of Engineering & Technology", shortName: "KUET", type: "PUBLIC_UNIVERSITY", district: "Khulna", division: "Khulna", websiteUrl: "https://kuet.ac.bd", domains: [{ domain: "kuet.ac.bd" }, { domain: "stud.kuet.ac.bd", roleHint: "STUDENT" }] },
  { slug: "duet", name: "Dhaka University of Engineering & Technology, Gazipur", shortName: "DUET", type: "PUBLIC_UNIVERSITY", district: "Gazipur", division: "Dhaka", websiteUrl: "https://duet.ac.bd" },
  { slug: "iut", name: "Islamic University of Technology", shortName: "IUT", type: "PUBLIC_UNIVERSITY", district: "Gazipur", division: "Dhaka", websiteUrl: "https://iutoic-dhaka.edu", domains: [{ domain: "iutoic-dhaka.edu" }] },
  { slug: "mist", name: "Military Institute of Science and Technology", shortName: "MIST", type: "PUBLIC_UNIVERSITY", district: "Dhaka", division: "Dhaka", websiteUrl: "https://www.mist.ac.bd", domains: [{ domain: "mist.ac.bd" }] },
  { slug: "bup", name: "Bangladesh University of Professionals", shortName: "BUP", type: "PUBLIC_UNIVERSITY", district: "Dhaka", division: "Dhaka", websiteUrl: "https://bup.edu.bd" },
  { slug: "butex", name: "Bangladesh University of Textiles", shortName: "BUTEX", type: "PUBLIC_UNIVERSITY", district: "Dhaka", division: "Dhaka", websiteUrl: "https://butex.edu.bd" },
  { slug: "nstu", name: "Noakhali Science and Technology University", shortName: "NSTU", type: "PUBLIC_UNIVERSITY", district: "Noakhali", division: "Chattogram", websiteUrl: "https://nstu.edu.bd" },
  { slug: "hstu", name: "Hajee Mohammad Danesh Science and Technology University", shortName: "HSTU", type: "PUBLIC_UNIVERSITY", district: "Dinajpur", division: "Rangpur", websiteUrl: "https://hstu.ac.bd" },
  { slug: "pstu", name: "Patuakhali Science and Technology University", shortName: "PSTU", type: "PUBLIC_UNIVERSITY", district: "Patuakhali", division: "Barishal", websiteUrl: "https://pstu.ac.bd" },
  { slug: "mbstu", name: "Mawlana Bhashani Science and Technology University", shortName: "MBSTU", type: "PUBLIC_UNIVERSITY", district: "Tangail", division: "Dhaka", websiteUrl: "https://mbstu.ac.bd" },
  { slug: "pust", name: "Pabna University of Science and Technology", shortName: "PUST", type: "PUBLIC_UNIVERSITY", district: "Pabna", division: "Rajshahi", websiteUrl: "https://pust.ac.bd" },
  { slug: "just", name: "Jashore University of Science and Technology", shortName: "JUST", type: "PUBLIC_UNIVERSITY", district: "Jashore", division: "Khulna", websiteUrl: "https://just.edu.bd" },
  { slug: "bsmrstu", name: "Bangabandhu Sheikh Mujibur Rahman Science and Technology University", shortName: "BSMRSTU", type: "PUBLIC_UNIVERSITY", district: "Gopalganj", division: "Dhaka", websiteUrl: "https://bsmrstu.edu.bd" },

  // -- Public: agriculture & veterinary ----------------------------------
  { slug: "bau", name: "Bangladesh Agricultural University", shortName: "BAU", type: "PUBLIC_UNIVERSITY", district: "Mymensingh", division: "Mymensingh", websiteUrl: "https://bau.edu.bd", domains: [{ domain: "bau.edu.bd" }] },
  { slug: "bsmrau", name: "Bangabandhu Sheikh Mujibur Rahman Agricultural University", shortName: "BSMRAU", type: "PUBLIC_UNIVERSITY", district: "Gazipur", division: "Dhaka", websiteUrl: "https://bsmrau.edu.bd" },
  { slug: "sau", name: "Sher-e-Bangla Agricultural University", shortName: "SAU", type: "PUBLIC_UNIVERSITY", district: "Dhaka", division: "Dhaka", websiteUrl: "https://sau.edu.bd" },
  { slug: "sylhet-au", name: "Sylhet Agricultural University", shortName: "SAU-Sylhet", type: "PUBLIC_UNIVERSITY", district: "Sylhet", division: "Sylhet", websiteUrl: "https://sau.ac.bd" },
  { slug: "cvasu", name: "Chittagong Veterinary and Animal Sciences University", shortName: "CVASU", type: "PUBLIC_UNIVERSITY", district: "Chattogram", division: "Chattogram", websiteUrl: "https://cvasu.ac.bd" },

  // -- Private universities ----------------------------------------------
  { slug: "diu", name: "Daffodil International University", shortName: "DIU", type: "PRIVATE_UNIVERSITY", district: "Dhaka", division: "Dhaka", websiteUrl: "https://daffodilvarsity.edu.bd", domains: [{ domain: "diu.edu.bd" }, { domain: "s.diu.edu.bd", roleHint: "STUDENT" }] },
  { slug: "nsu", name: "North South University", shortName: "NSU", type: "PRIVATE_UNIVERSITY", district: "Dhaka", division: "Dhaka", websiteUrl: "https://www.northsouth.edu", domains: [{ domain: "northsouth.edu" }] },
  { slug: "bracu", name: "BRAC University", shortName: "BRACU", type: "PRIVATE_UNIVERSITY", district: "Dhaka", division: "Dhaka", websiteUrl: "https://www.bracu.ac.bd", domains: [{ domain: "bracu.ac.bd" }, { domain: "g.bracu.ac.bd", roleHint: "STUDENT" }] },
  { slug: "aiub", name: "American International University-Bangladesh", shortName: "AIUB", type: "PRIVATE_UNIVERSITY", district: "Dhaka", division: "Dhaka", websiteUrl: "https://www.aiub.edu", domains: [{ domain: "aiub.edu" }] },
  { slug: "iub", name: "Independent University, Bangladesh", shortName: "IUB", type: "PRIVATE_UNIVERSITY", district: "Dhaka", division: "Dhaka", websiteUrl: "https://www.iub.edu.bd", domains: [{ domain: "iub.edu.bd" }] },
  { slug: "aust", name: "Ahsanullah University of Science and Technology", shortName: "AUST", type: "PRIVATE_UNIVERSITY", district: "Dhaka", division: "Dhaka", websiteUrl: "https://www.aust.edu", domains: [{ domain: "aust.edu" }] },
  { slug: "ewu", name: "East West University", shortName: "EWU", type: "PRIVATE_UNIVERSITY", district: "Dhaka", division: "Dhaka", websiteUrl: "https://ewubd.edu", domains: [{ domain: "ewubd.edu" }] },
  { slug: "uiu", name: "United International University", shortName: "UIU", type: "PRIVATE_UNIVERSITY", district: "Dhaka", division: "Dhaka", websiteUrl: "https://www.uiu.ac.bd", domains: [{ domain: "uiu.ac.bd" }, { domain: "bscse.uiu.ac.bd", roleHint: "STUDENT" }] },
  { slug: "bubt", name: "Bangladesh University of Business and Technology", shortName: "BUBT", type: "PRIVATE_UNIVERSITY", district: "Dhaka", division: "Dhaka", websiteUrl: "https://bubt.edu.bd" },
  { slug: "seu", name: "Southeast University", shortName: "SEU", type: "PRIVATE_UNIVERSITY", district: "Dhaka", division: "Dhaka", websiteUrl: "https://www.seu.edu.bd" },
  { slug: "uap", name: "University of Asia Pacific", shortName: "UAP", type: "PRIVATE_UNIVERSITY", district: "Dhaka", division: "Dhaka", websiteUrl: "https://www.uap-bd.edu", domains: [{ domain: "uap-bd.edu" }] },
  { slug: "gub", name: "Green University of Bangladesh", shortName: "GUB", type: "PRIVATE_UNIVERSITY", district: "Dhaka", division: "Dhaka", websiteUrl: "https://green.edu.bd" },
  { slug: "primeasia", name: "Primeasia University", shortName: "Primeasia", type: "PRIVATE_UNIVERSITY", district: "Dhaka", division: "Dhaka", websiteUrl: "https://www.primeasia.edu.bd" },
  { slug: "stamford", name: "Stamford University Bangladesh", shortName: "Stamford", type: "PRIVATE_UNIVERSITY", district: "Dhaka", division: "Dhaka", websiteUrl: "https://www.stamforduniversity.edu.bd" },
  { slug: "ulab", name: "University of Liberal Arts Bangladesh", shortName: "ULAB", type: "PRIVATE_UNIVERSITY", district: "Dhaka", division: "Dhaka", websiteUrl: "https://ulab.edu.bd" },
  { slug: "nub", name: "Northern University Bangladesh", shortName: "NUB", type: "PRIVATE_UNIVERSITY", district: "Dhaka", division: "Dhaka", websiteUrl: "https://nub.ac.bd" },
  { slug: "iubat", name: "International University of Business Agriculture and Technology", shortName: "IUBAT", type: "PRIVATE_UNIVERSITY", district: "Dhaka", division: "Dhaka", websiteUrl: "https://www.iubat.edu", domains: [{ domain: "iubat.edu" }] },
  { slug: "city-university", name: "City University", shortName: "City University", type: "PRIVATE_UNIVERSITY", district: "Dhaka", division: "Dhaka", websiteUrl: "https://cityuniversity.edu.bd" },
  { slug: "wub", name: "World University of Bangladesh", shortName: "WUB", type: "PRIVATE_UNIVERSITY", district: "Dhaka", division: "Dhaka", websiteUrl: "https://wub.edu.bd" },
  { slug: "uttara-university", name: "Uttara University", shortName: "Uttara University", type: "PRIVATE_UNIVERSITY", district: "Dhaka", division: "Dhaka", websiteUrl: "https://uttarauniversity.edu.bd" },
  { slug: "manarat", name: "Manarat International University", shortName: "Manarat", type: "PRIVATE_UNIVERSITY", district: "Dhaka", division: "Dhaka", websiteUrl: "https://manarat.ac.bd" },
  { slug: "presidency", name: "Presidency University", shortName: "Presidency", type: "PRIVATE_UNIVERSITY", district: "Dhaka", division: "Dhaka", websiteUrl: "https://www.presidency.edu.bd" },
  { slug: "central-womens", name: "Central Women's University", shortName: "CWU", type: "PRIVATE_UNIVERSITY", district: "Dhaka", division: "Dhaka", websiteUrl: "https://cwu.edu.bd" },
  { slug: "ndub", name: "Notre Dame University Bangladesh", shortName: "NDUB", type: "PRIVATE_UNIVERSITY", district: "Dhaka", division: "Dhaka", websiteUrl: "https://ndub.edu.bd" },

  // -- Private universities outside Dhaka ---------------------------------
  { slug: "iiuc", name: "International Islamic University Chittagong", shortName: "IIUC", type: "PRIVATE_UNIVERSITY", district: "Chattogram", division: "Chattogram", websiteUrl: "https://www.iiuc.ac.bd" },
  { slug: "southern-university", name: "Southern University Bangladesh", shortName: "Southern University", type: "PRIVATE_UNIVERSITY", district: "Chattogram", division: "Chattogram", websiteUrl: "https://southern.ac.bd" },
  { slug: "premier-university", name: "Premier University", shortName: "Premier University", type: "PRIVATE_UNIVERSITY", district: "Chattogram", division: "Chattogram", websiteUrl: "https://puc.ac.bd" },
  { slug: "leading-university", name: "Leading University", shortName: "Leading University", type: "PRIVATE_UNIVERSITY", district: "Sylhet", division: "Sylhet", websiteUrl: "https://lus.ac.bd" },
  { slug: "metropolitan-university", name: "Metropolitan University", shortName: "Metropolitan University", type: "PRIVATE_UNIVERSITY", district: "Sylhet", division: "Sylhet", websiteUrl: "https://metrouni.edu.bd" },

  // -- Polytechnics & colleges ---------------------------------------------
  { slug: "dhaka-polytechnic", name: "Dhaka Polytechnic Institute", shortName: "DPI", type: "POLYTECHNIC", district: "Dhaka", division: "Dhaka" },
  { slug: "notre-dame-college", name: "Notre Dame College, Dhaka", shortName: "NDC", type: "COLLEGE", district: "Dhaka", division: "Dhaka" },
  { slug: "dhaka-college", name: "Dhaka College", shortName: "Dhaka College", type: "COLLEGE", district: "Dhaka", division: "Dhaka" },

  // -- Catch-all -------------------------------------------------------------
  { slug: "other", name: "Other / Not Listed", shortName: "Other", type: "OTHER" },
];

/** Idempotent upsert keyed on slug. Existing rows are left untouched aside
 * from domain rows, which are (re-)created if missing. */
export async function seedInstitutions() {
  let created = 0;
  for (const inst of INSTITUTIONS) {
    const existing = await prisma.institution.findUnique({ where: { slug: inst.slug } });
    let institutionId = existing?.id;
    if (!existing) {
      const row = await prisma.institution.create({
        data: {
          slug: inst.slug,
          name: inst.name,
          shortName: inst.shortName,
          type: inst.type,
          district: inst.district,
          division: inst.division,
          websiteUrl: inst.websiteUrl,
          verified: inst.slug !== "other",
        },
      });
      institutionId = row.id;
      created++;
    }
    if (!institutionId || !inst.domains) continue;
    for (const d of inst.domains) {
      await prisma.institutionDomain.upsert({
        where: { domain: d.domain },
        update: {},
        create: { domain: d.domain, institutionId, roleHint: d.roleHint },
      });
    }
  }
  return { created, total: INSTITUTIONS.length };
}
