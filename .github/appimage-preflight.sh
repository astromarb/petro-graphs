#!/bin/bash
# AppRun entry point for the Petro Graphs AppImage.
# Checks for WebKit2GTK 4.1 before launching the binary and shows a
# human-readable error if the library is missing.

if ! ldconfig -p 2>/dev/null | grep -q 'libwebkit2gtk-4\.1\.so'; then
  TITLE="Petro Graphs — Missing System Library"
  MSG="Petro Graphs requires WebKit2GTK 4.1, which is not installed on this system.\n\nInstall it with your package manager, then re-launch:\n\n  Ubuntu / Debian:\n    sudo apt install libwebkit2gtk-4.1-0\n\n  Fedora / RHEL:\n    sudo dnf install webkit2gtk4.1\n\n  Arch Linux:\n    sudo pacman -S webkit2gtk-4.1\n\n  openSUSE:\n    sudo zypper install libwebkit2gtk-4_1-0"

  if   command -v zenity   &>/dev/null; then
    zenity --error --title="$TITLE" --text="$MSG" --width=480 2>/dev/null
  elif command -v kdialog  &>/dev/null; then
    kdialog --error "$(printf '%b' "$MSG")" --title "$TITLE" 2>/dev/null
  elif command -v xmessage &>/dev/null; then
    xmessage -center "$(printf '%b' "$MSG")"
  else
    printf '\n%s\n\n%b\n\n' "$TITLE" "$MSG" >&2
  fi
  exit 1
fi

exec "$APPDIR/petro-graphs" "$@"
