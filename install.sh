#!/bin/sh
# Authensor Installer — The open-source safety stack for AI agents
# Usage: curl -fsSL https://raw.githubusercontent.com/authensor/authensor/main/install.sh | sh
# Flags: --no-interactive  skip prompts (CI mode)
#        --with-safeclaw   also install SafeClaw agent gating
set -e

# ── Defaults ──────────────────────────────────────────────────────
INTERACTIVE=true
INSTALL_SAFECLAW=false
MIN_NODE=18
for arg in "$@"; do
  case "$arg" in
    --no-interactive) INTERACTIVE=false ;;
    --with-safeclaw)  INSTALL_SAFECLAW=true ;;
  esac
done

# ── Color support ─────────────────────────────────────────────────
if [ -t 1 ] && command -v tput >/dev/null 2>&1 && [ "$(tput colors 2>/dev/null || echo 0)" -ge 8 ]; then
  BOLD=$(tput bold) DIM=$(tput setaf 8) GREEN=$(tput setaf 2)
  CYAN=$(tput setaf 6) RED=$(tput setaf 1) YELLOW=$(tput setaf 3) RESET=$(tput sgr0)
else
  BOLD="" DIM="" GREEN="" CYAN="" RED="" YELLOW="" RESET=""
fi

info()  { printf '%s[info]%s  %s\n'  "$CYAN"   "$RESET" "$1"; }
ok()    { printf '%s[ok]%s    %s\n'  "$GREEN"  "$RESET" "$1"; }
warn()  { printf '%s[warn]%s  %s\n'  "$YELLOW" "$RESET" "$1"; }
fail()  { printf '%s[error]%s %s\n'  "$RED"    "$RESET" "$1"; exit 1; }

# ── OS detection ──────────────────────────────────────────────────
detect_os() {
  case "$(uname -s)" in
    Darwin)  OS="macOS" ;;
    Linux)
      if [ -n "${WSL_DISTRO_NAME:-}" ] || grep -qis microsoft /proc/version 2>/dev/null; then
        OS="WSL"
      else
        OS="Linux"
      fi ;;
    *)       OS="unknown" ;;
  esac
  info "Detected OS: ${BOLD}${OS}${RESET}"
}

# ── Prerequisite checks ──────────────────────────────────────────
check_node() {
  if ! command -v node >/dev/null 2>&1; then
    fail "Node.js is not installed. Install Node.js >= ${MIN_NODE} from https://nodejs.org"
  fi
  NODE_VER=$(node -e "process.stdout.write(String(process.versions.node.split('.')[0]))")
  if [ "$NODE_VER" -lt "$MIN_NODE" ]; then
    fail "Node.js v${NODE_VER} found, but >= ${MIN_NODE} is required. Please upgrade: https://nodejs.org"
  fi
  ok "Node.js v$(node --version | tr -d 'v') detected"
}

check_npm() {
  if ! command -v npm >/dev/null 2>&1; then
    fail "npm is not installed. It should ship with Node.js — try reinstalling Node."
  fi
  ok "npm v$(npm --version) detected"
}

check_npx() {
  if ! command -v npx >/dev/null 2>&1; then
    warn "npx not found; falling back to npm exec"
  fi
}

# ── Prompt helper (respects --no-interactive) ─────────────────────
ask_yes() {
  if [ "$INTERACTIVE" = false ]; then return 1; fi
  printf '%s%s [y/N] %s' "$BOLD" "$1" "$RESET"
  read -r answer </dev/tty 2>/dev/null || return 1
  case "$answer" in y|Y|yes|Yes) return 0 ;; *) return 1 ;; esac
}

# ── Install packages ──────────────────────────────────────────────
install_cli() {
  info "Installing ${BOLD}authensor${RESET} CLI globally..."
  npm install -g authensor || fail "npm install failed. If you see EACCES, see https://docs.npmjs.com/resolving-eacces-permissions-errors"
  ok "authensor CLI installed"
}

install_safeclaw() {
  info "Installing ${BOLD}@authensor/safeclaw${RESET} globally..."
  npm install -g @authensor/safeclaw || warn "SafeClaw install failed — you can retry later with: npm install -g @authensor/safeclaw"
  ok "SafeClaw installed"
}

# ── Project init ──────────────────────────────────────────────────
run_init() {
  if command -v authensor >/dev/null 2>&1; then
    info "Running ${BOLD}authensor init${RESET}..."
    authensor init || warn "authensor init exited with an error — you can run it again manually"
  else
    warn "authensor command not found in PATH — run 'authensor init' manually after opening a new shell"
  fi
}

# ── Welcome banner ────────────────────────────────────────────────
print_banner() {
  printf '\n%s' "$CYAN"
  printf '    _         _   _                               \n'
  printf '   / \\  _   _| |_| |__   ___ _ __  ___  ___  _ __\n'
  printf '  / _ \\| | | | __| ._ \\ / _ \\ ._ \\/ __|/ _ \\| ._|\n'
  printf ' / ___ \\ |_| | |_| | | |  __/ | | \\__ \\ (_) | |  \n'
  printf '/_/   \\_\\__,_|\\__|_| |_|\\___|_| |_|___/\\___/|_|  \n'
  printf '%s\n' "$RESET"
}

print_next_steps() {
  printf '\n%s── Next steps ─────────────────────────────────────%s\n' "$BOLD" "$RESET"
  printf '  1. %sauthensor init%s        Create a policy in the current project\n' "$GREEN" "$RESET"
  printf '  2. %sauthensor dev%s         Start the local control plane\n' "$GREEN" "$RESET"
  printf '  3. %sauthensor status%s      Verify everything is running\n' "$GREEN" "$RESET"
  if [ "$INSTALL_SAFECLAW" = true ]; then
    printf '  4. %ssafeclaw%s              Launch the gated agent\n' "$GREEN" "$RESET"
  fi
  printf '\n  Docs:  https://github.com/authensor/authensor\n'
  printf '  Discord: https://discord.gg/authensor\n\n'
}

# ── Main ──────────────────────────────────────────────────────────
main() {
  print_banner
  detect_os
  check_node
  check_npm
  check_npx

  install_cli

  if [ "$INSTALL_SAFECLAW" = true ]; then
    install_safeclaw
  elif [ "$INTERACTIVE" = true ]; then
    if ask_yes "Also install SafeClaw (local agent gating)?"; then
      install_safeclaw
    fi
  fi

  if [ "$INTERACTIVE" = true ]; then
    if ask_yes "Run 'authensor init' now to set up this project?"; then
      run_init
    fi
  fi

  print_next_steps
  ok "Installation complete."
}

main "$@"
