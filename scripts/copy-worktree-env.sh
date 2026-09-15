#!/bin/sh
set -eu

# Copy ignored .env files from the primary checkout into the current linked
# worktree. Existing worktree files are preserved unless --force is supplied.

force=false
dry_run=false

for argument in "$@"; do
  case "$argument" in
    --force) force=true ;;
    --dry-run) dry_run=true ;;
    *)
      echo "usage: $0 [--force] [--dry-run]" >&2
      exit 2
      ;;
  esac
done

worktree_root=$(git rev-parse --show-toplevel)
common_git_dir=$(git rev-parse --path-format=absolute --git-common-dir)
primary_root=$(dirname "$common_git_dir")

if [ "$worktree_root" = "$primary_root" ]; then
  echo "environment copy skipped: already in the primary checkout"
  exit 0
fi

if [ ! -d "$primary_root" ]; then
  echo "environment copy failed: primary checkout was not found" >&2
  exit 1
fi

umask 077

find "$primary_root" \
  \( -type d \( -name .git -o -name node_modules -o -name .next -o -name Pods -o -name build -o -name dist \) -prune \) -o \
  \( -type f -name '.env*' -print \) |
while IFS= read -r source_file; do
  relative_path=${source_file#"$primary_root"/}
  file_name=$(basename "$relative_path")
  relative_directory=$(dirname "$relative_path")

  case "$file_name" in
    *.example|*.example.*) continue ;;
  esac

  # Only copy ignored files. Tracked fixtures such as .env.test are intentionally
  # left to Git and never treated as local credentials.
  if ! git -C "$primary_root" check-ignore -q -- "$relative_path"; then
    continue
  fi

  # Skip legacy checkouts, caches, and other ignored directory trees. The
  # destination directory itself must belong to the active repository layout.
  if [ "$relative_directory" != "." ] && git -C "$primary_root" check-ignore -q -- "$relative_directory"; then
    continue
  fi

  destination="$worktree_root/$relative_path"
  if [ -e "$destination" ] && [ "$force" = false ]; then
    echo "kept $relative_path"
    continue
  fi

  if [ "$dry_run" = true ]; then
    echo "would copy $relative_path"
  else
    mkdir -p "$(dirname "$destination")"
    cp -p "$source_file" "$destination"
    echo "copied $relative_path"
  fi
done

if [ "$dry_run" = true ]; then
  echo "environment copy dry run complete"
else
  echo "environment copy complete"
fi
