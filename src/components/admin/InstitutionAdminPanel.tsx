"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Plus, ShieldCheck, ShieldOff } from "lucide-react";

type Institution = {
  id: string;
  slug: string;
  name: string;
  shortName: string;
  type: string;
  district: string | null;
  division: string | null;
  websiteUrl: string | null;
  verified: boolean;
  memberCount: number;
  domains: { id: string; domain: string; roleHint: string | null }[];
};

const TYPES = [
  "PUBLIC_UNIVERSITY",
  "PRIVATE_UNIVERSITY",
  "NATIONAL_UNIVERSITY_COLLEGE",
  "POLYTECHNIC",
  "COLLEGE",
  "SCHOOL",
  "OTHER",
];

export function InstitutionAdminPanel({ initial }: { initial: Institution[] }) {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  async function createInstitution(fd: FormData) {
    setError(null);
    const body = {
      slug: String(fd.get("slug") || "")
        .trim()
        .toLowerCase(),
      name: String(fd.get("name") || "").trim(),
      shortName: String(fd.get("shortName") || "").trim(),
      type: String(fd.get("type") || "PRIVATE_UNIVERSITY"),
      district: String(fd.get("district") || "").trim(),
      division: String(fd.get("division") || "").trim(),
      websiteUrl: String(fd.get("websiteUrl") || "").trim(),
      verified: fd.get("verified") === "on",
    };
    const res = await fetch("/api/admin/institutions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      setError(data.message || "Could not create institution");
      return;
    }
    setCreating(false);
    router.refresh();
  }

  async function toggleVerified(inst: Institution) {
    setError(null);
    const res = await fetch(`/api/admin/institutions/${inst.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verified: !inst.verified }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      setError(data.message || "Could not update");
      return;
    }
    router.refresh();
  }

  async function addDomain(institutionId: string, fd: FormData) {
    setError(null);
    const domain = String(fd.get("domain") || "")
      .trim()
      .toLowerCase();
    const roleHint = String(fd.get("roleHint") || "");
    const res = await fetch(`/api/admin/institutions/${institutionId}/domains`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domain, roleHint: roleHint || undefined }),
    });
    const data = await res.json();
    if (!res.ok || !data.ok) {
      setError(data.message || "Could not add domain");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-5">
      {error && (
        <p className="rounded-lg border border-[var(--danger)]/30 bg-[var(--danger)]/5 px-3 py-2 text-xs text-[var(--danger)]">
          {error}
        </p>
      )}

      <div className="panel overflow-hidden">
        <button
          type="button"
          onClick={() => setCreating((v) => !v)}
          className="flex w-full items-center justify-between px-4 py-3 text-sm font-medium"
        >
          <span className="flex items-center gap-2">
            <Plus size={14} /> Add institution
          </span>
          {creating ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
        {creating && (
          <form
            className="grid gap-3 border-t border-[var(--line)] p-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              void createInstitution(new FormData(e.currentTarget));
            }}
          >
            <TextField name="slug" label="Slug" placeholder="diu" required />
            <TextField name="shortName" label="Short name" placeholder="DIU" required />
            <TextField
              name="name"
              label="Full name"
              placeholder="Daffodil International University"
              required
              wide
            />
            <label className="block">
              <span className="field-label">Type</span>
              <select name="type" defaultValue="PRIVATE_UNIVERSITY" className="field mt-1.5">
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.replaceAll("_", " ")}
                  </option>
                ))}
              </select>
            </label>
            <TextField name="district" label="District" placeholder="Dhaka" />
            <TextField name="division" label="Division" placeholder="Dhaka" />
            <TextField name="websiteUrl" label="Website" placeholder="https://…" wide />
            <label className="flex items-center gap-2 text-sm sm:col-span-2">
              <input type="checkbox" name="verified" />
              Mark verified (visible on public leaderboards)
            </label>
            <div className="sm:col-span-2">
              <button type="submit" className="btn btn-primary !py-2 !text-xs">
                Create
              </button>
            </div>
          </form>
        )}
      </div>

      <div className="panel overflow-hidden">
        <div className="divide-y divide-[var(--line-soft)]">
          {initial.map((inst) => (
            <div key={inst.id} className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <button
                    type="button"
                    onClick={() => setExpanded(expanded === inst.id ? null : inst.id)}
                    className="text-left"
                  >
                    <p className="font-medium">{inst.name}</p>
                    <p className="mt-0.5 font-mono text-[10px] text-[var(--muted)]">
                      {inst.slug} · {inst.memberCount} members · {inst.domains.length} domain
                      {inst.domains.length === 1 ? "" : "s"}
                    </p>
                  </button>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => void toggleVerified(inst)}
                    className={`btn !py-1.5 !text-xs ${
                      inst.verified ? "btn-ghost" : "btn-primary"
                    }`}
                  >
                    {inst.verified ? <ShieldOff size={13} /> : <ShieldCheck size={13} />}
                    {inst.verified ? "Unverify" : "Verify"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setExpanded(expanded === inst.id ? null : inst.id)}
                    className="btn btn-ghost !py-1.5 !text-xs"
                  >
                    {expanded === inst.id ? "Hide" : "Domains"}
                  </button>
                </div>
              </div>

              {expanded === inst.id && (
                <div className="mt-3 border-t border-[var(--line-soft)] pt-3">
                  <ul className="space-y-1.5">
                    {inst.domains.map((d) => (
                      <li key={d.id} className="font-mono text-xs text-[var(--muted)]">
                        @{d.domain}
                        {d.roleHint ? ` · ${d.roleHint} hint` : ""}
                      </li>
                    ))}
                    {inst.domains.length === 0 && (
                      <li className="text-xs text-[var(--muted)]">No domains registered.</li>
                    )}
                  </ul>
                  <form
                    className="mt-3 flex flex-wrap items-center gap-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void addDomain(inst.id, new FormData(e.currentTarget));
                      e.currentTarget.reset();
                    }}
                  >
                    <input
                      name="domain"
                      placeholder="diu.edu.bd"
                      className="field !py-1.5 !text-xs"
                      required
                    />
                    <select name="roleHint" className="field !py-1.5 !text-xs" defaultValue="">
                      <option value="">No role hint</option>
                      <option value="STUDENT">Student</option>
                      <option value="TEACHER">Teacher</option>
                    </select>
                    <button type="submit" className="btn btn-ghost !py-1.5 !text-xs">
                      Add domain
                    </button>
                  </form>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function TextField({
  name,
  label,
  placeholder,
  required,
  wide,
}: {
  name: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  wide?: boolean;
}) {
  return (
    <label className={`block ${wide ? "sm:col-span-2" : ""}`}>
      <span className="field-label">{label}</span>
      <input name={name} placeholder={placeholder} required={required} className="field mt-1.5" />
    </label>
  );
}
