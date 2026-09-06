#!/usr/bin/env bash
# Builds every sandbox image, tags it by date, and writes the resolved
# digests into runner/images.lock.json — the registry (src/lib/judge/languages/images.ts)
# reads that file so workers refuse to start on a mismatch instead of
# silently running a `latest` that drifted from what was security-reviewed.
# CI builds and pushes these; workers never build (see D-images).
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

DATE_TAG="$(date -u +%Y-%m-%d)"
declare -A IMAGES=(
  [c]="codehub-sandbox-c"
  [cpp17]="codehub-sandbox-cpp"
  [cpp20]="codehub-sandbox-cpp"
  [py311]="codehub-sandbox-python"
  [java17]="codehub-sandbox-java"
  [js]="codehub-sandbox-js"
)
declare -A DOCKERFILES=(
  [c]="images/c.Dockerfile"
  [cpp17]="images/cpp.Dockerfile"
  [cpp20]="images/cpp.Dockerfile"
  [py311]="images/python.Dockerfile"
  [java17]="images/java.Dockerfile"
  [js]="images/js.Dockerfile"
)

BUILT_IMAGES=()
for lang in c cpp17 py311 java17 js; do
  image="${IMAGES[$lang]}"
  # cpp17/cpp20 share one image — build it once (keyed by image name, not language id).
  if printf '%s\n' "${BUILT_IMAGES[@]:-}" | grep -qx "$image"; then continue; fi
  echo "==> building $image ($lang) from ${DOCKERFILES[$lang]}"
  docker build -f "${DOCKERFILES[$lang]}" -t "${image}:${DATE_TAG}" -t "${image}:latest" .
  BUILT_IMAGES+=("$image")
done

echo "==> resolving digests"
{
  echo "{"
  first=true
  for lang in "${!IMAGES[@]}"; do
    image="${IMAGES[$lang]}"
    # A pushed image has a registry digest (RepoDigests); a local-only build
    # (dev, or CI before push) falls back to the content-addressable image
    # ID, which is still a real pin — just not resolvable by a remote pull.
    digest="$(docker image inspect --format '{{index .RepoDigests 0}}' "${image}:${DATE_TAG}" 2>/dev/null | sed 's/^.*@//' || true)"
    if [ -z "$digest" ]; then
      digest="$(docker image inspect --format '{{.Id}}' "${image}:${DATE_TAG}" 2>/dev/null | sed 's/^sha256://' || true)"
    fi
    [ "$first" = true ] && first=false || echo ","
    printf '  "%s": { "image": "%s", "digest": "%s", "builtAt": "%s" }' \
      "$lang" "${image}:${DATE_TAG}" "${digest:-}" "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  done
  echo ""
  echo "}"
} > images.lock.json

echo "==> wrote images.lock.json"
cat images.lock.json
