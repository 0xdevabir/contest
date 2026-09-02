#!/usr/bin/env bash
# Generates runner/seccomp-profile.json: Docker's own default seccomp
# profile (an allowlist covering the whole non-namespaced syscall surface a
# container normally needs) with the syscalls from the "Sandbox hardening"
# table in docs/phases/PHASE-03-judge-engine.md explicitly denied.
#
# Hand-authoring a seccomp allowlist from scratch is exactly how you end up
# with a profile that's either wrong (breaks legitimate programs) or a no-op
# (silently permissive) — starting from Docker's reviewed default and
# subtracting is the safe way to do this. Requires `jq`; regenerate whenever
# the deny list below changes or Docker's default profile is updated.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

DEFAULT_PROFILE_URL="https://raw.githubusercontent.com/moby/moby/master/profiles/seccomp/default.json"
DENY_SYSCALLS=(ptrace mount umount umount2 keyctl add_key request_key bpf perf_event_open userfaultfd
  unshare setns clone3)

command -v jq >/dev/null || { echo "jq is required" >&2; exit 1; }

tmp="$(mktemp)"
curl -fsSL "$DEFAULT_PROFILE_URL" -o "$tmp"

# `clone` itself stays allowed (fork() needs it) — only namespace-creating
# clone flags are denied, via defaultAction's syscalls.args match on Docker's
# default profile already covers CLONE_NEWUSER etc. for the `clone` entry;
# what we add here is unconditional denial of clone3, which bypasses that
# arg-based filtering entirely on newer kernels/glibc.
deny_json="$(printf '%s\n' "${DENY_SYSCALLS[@]}" | jq -R . | jq -s .)"

jq --argjson deny "$deny_json" '
  # Strip any allow-rule referencing a denied syscall name, then append one
  # explicit SCMP_ACT_ERRNO rule per denied syscall so it fails closed with
  # EPERM instead of falling through to the profile default.
  .syscalls = (
    [.syscalls[] | .names |= (map(select(. as $n | ($deny | index($n)) | not)))]
    | map(select(.names | length > 0))
  )
  + [{ names: $deny, action: "SCMP_ACT_ERRNO", args: [] }]
' "$tmp" > seccomp-profile.json

rm -f "$tmp"
echo "wrote runner/seccomp-profile.json denying: ${DENY_SYSCALLS[*]}"
echo "roll out in log-only mode first (SCMP_ACT_LOG instead of SCMP_ACT_ERRNO), review denials, then enforce — see D-hardening rollout risk in PHASE-03-judge-engine.md"
