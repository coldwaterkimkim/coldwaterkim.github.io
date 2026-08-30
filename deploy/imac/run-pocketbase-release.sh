#!/bin/bash
set -euo pipefail

# CWK_ATOMIC_POCKETBASE_LAUNCHER_V1
# Resolve the release pointer once so a concurrent restart can never combine a
# binary from one generation with migrations from another generation.
RUNTIME_ROOT="${IMAC_RUNTIME_ROOT:-$HOME/.local/share/coldwaterkim/home-server}"
RELEASES_ROOT="$RUNTIME_ROOT/releases/pocketbase"
GENERATIONS_ROOT="$RELEASES_ROOT/generations"
CURRENT_LINK="$RELEASES_ROOT/current"

if [[ ! -L "$CURRENT_LINK" ]]; then
    echo "PocketBase release pointer is missing or is not a symbolic link: $CURRENT_LINK" >&2
    exit 1
fi

current_target="$(readlink "$CURRENT_LINK")"
if [[ ! "$current_target" =~ ^generations/[0-9a-f]{40,64}-[0-9a-f]{64}$ ]]; then
    echo "PocketBase release pointer target is invalid: $current_target" >&2
    exit 1
fi
generation_path="$RELEASES_ROOT/$current_target"
if [[ ! -d "$generation_path" || -L "$generation_path" ]]; then
    echo "PocketBase release generation is not a real directory: $generation_path" >&2
    exit 1
fi
generations_root_real="$(cd -P "$GENERATIONS_ROOT" 2>/dev/null && pwd)" || {
    echo "PocketBase generations root cannot be resolved: $GENERATIONS_ROOT" >&2
    exit 1
}
generation_expected="$generations_root_real/${current_target#generations/}"

release_dir="$(cd -P "$CURRENT_LINK" 2>/dev/null && pwd)" || {
    echo "PocketBase release pointer cannot be resolved: $CURRENT_LINK" >&2
    exit 1
}

case "$release_dir" in
    "$generation_expected") ;;
    *)
        echo "PocketBase release pointer escapes the generations root: $release_dir" >&2
        exit 1
        ;;
esac

if [[ ! -x "$release_dir/pocketbase" || ! -d "$release_dir/pb_migrations" || ! -f "$release_dir/manifest.json" ]]; then
    echo "PocketBase release generation is incomplete: $release_dir" >&2
    exit 1
fi

filtered_args=()
for argument in "$@"; do
    case "$argument" in
        --migrationsDir=*) ;;
        *) filtered_args+=("$argument") ;;
    esac
done

exec "$release_dir/pocketbase" "${filtered_args[@]}" "--migrationsDir=$release_dir/pb_migrations"
