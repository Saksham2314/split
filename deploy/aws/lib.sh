# Shared helpers for the AWS scripts in this folder. Sourced, not run.
# Works in Git Bash on Windows as well as Linux/macOS shells.

export AWS_PAGER=""
export MSYS_NO_PATHCONV=1 # stop Git Bash rewriting arguments that look like paths (e.g. /aws/service/...)
# The Windows AWS CLI otherwise prints with the legacy code page and crashes on characters like "●" or "…".
export PYTHONUTF8=1 PYTHONIOENCODING=utf-8

# Sydney: the organization's guardrail (an SCP) allows EC2 only in ap-southeast-2.
REGION="${AWS_REGION:-ap-southeast-2}"
NAME=splitsmart
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
STATE_FILE="$HERE/.env.server" # instance id, IP, hostname (git-ignored; no secrets)

# A freshly installed AWS CLI isn't on PATH until the terminal restarts.
if ! command -v aws > /dev/null; then
  for dir in "/c/Program Files/Amazon/AWSCLIV2" "${LOCALAPPDATA:-}/Programs/Amazon/AWSCLIV2"; do
    dir="$(command -v cygpath > /dev/null && cygpath -u "$dir" 2> /dev/null || printf '%s' "$dir")"
    [ -x "$dir/aws.exe" ] && PATH="$PATH:$dir" && break
  done
fi
command -v aws > /dev/null || { echo "ERROR: AWS CLI not found. Install it: winget install -e --id Amazon.AWSCLI" >&2; exit 1; }

awsr() { aws --region "$REGION" --output text "$@"; }
log() { printf '\n== %s\n' "$*"; }
die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
# The AWS CLI is a Windows program under Git Bash, so file:// paths must be Windows paths.
native_path() { if command -v cygpath > /dev/null; then cygpath -m "$1"; else printf '%s' "$1"; fi; }
none() { [ -z "$1" ] || [ "$1" = "None" ]; }

load_state() {
  [ -f "$STATE_FILE" ] || die "No server recorded in $STATE_FILE. Run create-server.sh first."
  # shellcheck disable=SC1090
  . "$STATE_FILE"
}

# ssm_run <script-file> [timeout-seconds]
# Runs a shell script on the server as root through SSM Run Command (no SSH), prints its output,
# and returns non-zero if it failed. Every run is authorised by IAM and recorded in AWS.
ssm_run() {
  local script="$1" timeout="${2:-1800}" params cmd status polls
  params="$(mktemp)"
  # node and aws are Windows programs under Git Bash: give them Windows paths.
  node -e 'const fs=require("fs");const [f,t,o]=process.argv.slice(1);
    fs.writeFileSync(o, JSON.stringify({commands: fs.readFileSync(f,"utf8").replace(/\r/g,"").split("\n"), executionTimeout: [t]}));' \
    "$(native_path "$script")" "$timeout" "$(native_path "$params")" || { rm -f "$params"; return 1; }
  cmd=$(awsr ssm send-command --instance-ids "$INSTANCE_ID" --document-name AWS-RunShellScript \
    --comment "splitsmart: $(basename "$script")" --parameters "file://$(native_path "$params")" \
    --query Command.CommandId) || { rm -f "$params"; return 1; }
  rm -f "$params"
  none "$cmd" && return 1
  echo "SSM command $cmd"
  # Poll until done, but never longer than the command's own timeout plus a margin.
  polls=$(( timeout / 5 + 60 ))
  while [ "$polls" -gt 0 ]; do
    sleep 5
    polls=$(( polls - 1 ))
    status=$(awsr ssm get-command-invocation --command-id "$cmd" --instance-id "$INSTANCE_ID" --query Status 2> /dev/null || echo Pending)
    case "$status" in Pending | InProgress | Delayed) printf '.' ;; *) break ;; esac
  done
  echo
  awsr ssm get-command-invocation --command-id "$cmd" --instance-id "$INSTANCE_ID" --query StandardOutputContent
  local err
  err=$(awsr ssm get-command-invocation --command-id "$cmd" --instance-id "$INSTANCE_ID" --query StandardErrorContent)
  none "$err" || printf '%s\n' "$err" >&2
  echo "status: $status"
  [ "$status" = "Success" ]
}
