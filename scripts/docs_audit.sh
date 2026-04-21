#!/usr/bin/env bash
set -euo pipefail

ROOT="${1:-.}"
cd "$ROOT"

MD_FILES_STR="$(rg --files -g '*.md' -g '!**/node_modules/**' | sort)"
IFS=$'\n' read -r -d '' -a MD_FILES < <(printf '%s\0' "$MD_FILES_STR")

failures=0

print_fail() {
  echo "[FAIL] $1"
  failures=$((failures + 1))
}

print_warn() {
  echo "[WARN] $1"
}

echo "Running docs audit on ${#MD_FILES[@]} markdown files"

# 1) Naming convention
NAME_BAD=()
for f in "${MD_FILES[@]}"; do
  b="$(basename "$f")"
  if [[ "$f" != 000_Company_Memory/* && "$f" != 001_Source_Intake/* ]]; then
    continue
  fi
  if [[ "$b" == "AGENT.md" || "$b" == "README.md" || "$b" == "ARK_Master.md" || "$b" == "Document_Metadata_And_Related_References_Template.md" ]]; then
    continue
  fi
  if [[ "$b" =~ ^README_.+\.md$ ]]; then
    continue
  fi
  if [[ "$b" =~ ^[0-9]{3}(\.[0-9]+)?_[A-Za-z0-9_]+\.md$ ]]; then
    continue
  fi
  if [[ "$b" == "ARK_Master_Orchestrator.md" || "$b" == "Standard_Document_Format.md" ]]; then
    continue
  fi
  NAME_BAD+=("$f")
done
if ((${#NAME_BAD[@]} > 0)); then
  print_fail "Naming convention violations (${#NAME_BAD[@]}):"
  printf '  - %s\n' "${NAME_BAD[@]}"
else
  echo "[PASS] Naming convention"
fi

# 2) Metadata header completeness
META_BAD=()
for f in "${MD_FILES[@]}"; do
  if [[ "$f" != 000_Company_Memory/* && "$f" != 001_Source_Intake/* ]]; then
    continue
  fi
  b="$(basename "$f")"
  if [[ "$b" == "AGENT.md" || "$b" == "ARK_Master.md" ]]; then
    continue
  fi
  if ! head -n 40 "$f" | rg -q '^\*\*Version:\*\*'; then
    META_BAD+=("$f")
    continue
  fi
  if ! head -n 40 "$f" | rg -q '^\*\*Last Updated:\*\*'; then
    META_BAD+=("$f")
    continue
  fi
  if ! head -n 40 "$f" | rg -q '^\*\*Author/Editor:\*\*'; then
    META_BAD+=("$f")
    continue
  fi
  if ! head -n 40 "$f" | rg -q '^\*\*Status:\*\*'; then
    META_BAD+=("$f")
    continue
  fi
done
if ((${#META_BAD[@]} > 0)); then
  print_fail "Metadata header missing fields (${#META_BAD[@]}):"
  printf '  - %s\n' "${META_BAD[@]}"
else
  echo "[PASS] Metadata header completeness"
fi

# 3) Template placeholders present
PLACEHOLDER_BAD=()
for f in "${MD_FILES[@]}"; do
  if ! head -n 20 "$f" | rg -q '^\*\*Status:\*\* Template'; then
    continue
  fi
  if ! rg -q '\[[A-Z][A-Z0-9_ ]+\]' "$f"; then
    PLACEHOLDER_BAD+=("$f")
  fi
done
if ((${#PLACEHOLDER_BAD[@]} > 0)); then
  print_fail "Missing template placeholder tokens (${#PLACEHOLDER_BAD[@]}):"
  printf '  - %s\n' "${PLACEHOLDER_BAD[@]}"
else
  echo "[PASS] Template placeholders"
fi

# 4) Legacy / invalid path references
LEGACY_PAT='10_Execution_Engine|01_Corporate_Strategy|LegacyCompany|Legacy Ops|PulseOS(?! Lite Open Source)|/Users/|file://|pitch_deck\.md|ai_sales_agent_prompt\.md'
if rg --pcre2 -n "$LEGACY_PAT" --glob '*.md' -g '!**/node_modules/**' -g '!000_Company_Memory/101_System_Overview/README_Document_Governance.md' >/tmp/docs_audit_legacy.out; then
  print_fail "Legacy/invalid path references found:"
  sed 's/^/  - /' /tmp/docs_audit_legacy.out
else
  echo "[PASS] Legacy path reference check"
fi

# 5) Duplicate canonical templates (deprecated files must not exist)
DUP_BAD=()
for deprecated in \
  "000_Company_Memory/203_Sales_Enablement_Hub/203.1_Core_Pitch_Decks/pitch_deck.md"; do
  if [[ -f "$deprecated" ]]; then
    DUP_BAD+=("$deprecated")
  fi
done
if ((${#DUP_BAD[@]} > 0)); then
  print_fail "Deprecated duplicate template files exist (${#DUP_BAD[@]}):"
  printf '  - %s\n' "${DUP_BAD[@]}"
else
  echo "[PASS] Duplicate canonical template check"
fi

# 6) Agent relationship metadata completeness
AGENT_BAD=()
for f in "${MD_FILES[@]}"; do
  if [[ "$f" =~ _Agent\.md$ ]] || [[ "$f" =~ /000_Company_Memory/000_Agent_Shortcuts/[0-9]{3}\.[0-9]+_.*\.md$ ]]; then
    if [[ "$f" =~ README_Agents\.md$ ]]; then
      continue
    fi
    if ! rg -q '^## Dependencies$' "$f"; then
      AGENT_BAD+=("$f")
      continue
    fi
    if ! rg -q '^## Recommended File Reads$' "$f"; then
      AGENT_BAD+=("$f")
      continue
    fi
    if ! rg -q '^## Upstream Dependencies$' "$f"; then
      AGENT_BAD+=("$f")
      continue
    fi
    if ! rg -q '^## Downstream Dependents$' "$f"; then
      AGENT_BAD+=("$f")
      continue
    fi
  fi
done
if ((${#AGENT_BAD[@]} > 0)); then
  print_fail "Agent relationship metadata missing required sections (${#AGENT_BAD[@]}):"
  printf '  - %s\n' "${AGENT_BAD[@]}"
else
  echo "[PASS] Agent relationship metadata check"
fi

# 7) Agent registry integrity
REGISTRY_FILE="000_Company_Memory/501_Agents_and_Workflows/agent_registry.yaml"
if [[ ! -f "$REGISTRY_FILE" ]]; then
  print_fail "Agent registry file missing: $REGISTRY_FILE"
else
  REGISTRY_IDS="$(rg '^[[:space:]]+- id:' "$REGISTRY_FILE" | sed -E 's/^[[:space:]]+- id:[[:space:]]*\"?([^\"[:space:]]+)\"?/\1/' || true)"
  if [[ -z "$REGISTRY_IDS" ]]; then
    print_fail "Agent registry contains no ids"
  else
    DUP_IDS="$(printf '%s\n' "$REGISTRY_IDS" | sort | uniq -d || true)"
    if [[ -n "$DUP_IDS" ]]; then
      print_fail "Duplicate registry ids found:"
      printf '  - %s\n' $DUP_IDS
    else
      echo "[PASS] Agent registry id uniqueness"
    fi
  fi

  REGISTRY_DOCS="$(rg '^[[:space:]]+entry_doc:' "$REGISTRY_FILE" | sed -E 's/^[[:space:]]+entry_doc:[[:space:]]*\"?([^\"[:space:]]+)\"?/\1/' || true)"
  MISSING_ENTRY_DOCS=()
  for p in $REGISTRY_DOCS; do
    if [[ ! -f "$p" ]]; then
      MISSING_ENTRY_DOCS+=("$p")
    fi
  done
  if ((${#MISSING_ENTRY_DOCS[@]} > 0)); then
    print_fail "Registry entry_doc paths missing (${#MISSING_ENTRY_DOCS[@]}):"
    printf '  - %s\n' "${MISSING_ENTRY_DOCS[@]}"
  else
    echo "[PASS] Registry entry_doc path existence"
  fi

  REGISTRY_REFS="$(rg '^[[:space:]]+(depends_on|fallback_agents|downstream):' "$REGISTRY_FILE" | rg -o 'agent-[a-z0-9.-]+' || true)"
  UNKNOWN_REFS=()
  for ref in $REGISTRY_REFS; do
    if ! printf '%s\n' "$REGISTRY_IDS" | rg -qx "$ref"; then
      UNKNOWN_REFS+=("$ref")
    fi
  done
  if ((${#UNKNOWN_REFS[@]} > 0)); then
    print_fail "Registry references unknown agent ids (${#UNKNOWN_REFS[@]}):"
    printf '  - %s\n' "${UNKNOWN_REFS[@]}" | sort -u
  else
    echo "[PASS] Registry reference integrity"
  fi

  AGENT_FILES="$(rg --files 000_Company_Memory/102_Corporate_Strategy_and_Foundation 000_Company_Memory/103_Corporate_Operations 000_Company_Memory/104_Finance_and_Financial_Planning 000_Company_Memory/105_Technical_Infrastructure_and_Security 000_Company_Memory/106_Legal_and_Compliance 000_Company_Memory/201_Market_Intelligence_and_ICP 000_Company_Memory/202_Go-to-Market_Strategy 000_Company_Memory/203_Sales_Enablement_Hub 000_Company_Memory/301_Client_Delivery_and_Onboarding 000_Company_Memory/302_Analytics_and_Performance_Intelligence 000_Company_Memory/401_Strategic_Partnerships 000_Company_Memory/402_Fundraising -g '*.md' | rg '_Agent\.md$' | sort || true)"
  ORPHAN_AGENTS=()
  for af in $AGENT_FILES; do
    if ! printf '%s\n' "$REGISTRY_DOCS" | rg -qx "$af"; then
      ORPHAN_AGENTS+=("$af")
    fi
  done
  if ((${#ORPHAN_AGENTS[@]} > 0)); then
    print_fail "Agent docs not represented in registry (${#ORPHAN_AGENTS[@]}):"
    printf '  - %s\n' "${ORPHAN_AGENTS[@]}"
  else
    echo "[PASS] Registry coverage of agent docs"
  fi
fi

if ((failures > 0)); then
  echo
  echo "Docs audit completed with ${failures} failing check group(s)."
  exit 1
fi

echo
echo "Docs audit completed successfully."
