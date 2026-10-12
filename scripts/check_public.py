"""Check tracked files (or source files before Git initialization) for secrets."""

import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SKIP = {".git", ".runtime", ".venv", "__pycache__", "node_modules"}
RULES = {
    "private_key": re.compile(rb"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    "service_token": re.compile(rb"(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{50,}|sk-[A-Za-z0-9_-]{32,}|AKIA[0-9A-Z]{16})"),
    "email": re.compile(rb"[A-Za-z0-9_.+%-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}"),
    "local_user_path": re.compile(rb"(?:C:\\\\Users\\\\[^\\\\\s]+|/Users/[^/\s]+|/home/[^/\s]+)"),
    "credential_assignment": re.compile(rb"(?i)(?:api[_-]?key|password|client[_-]?secret)\s*[:=]\s*[\"'][^\"'\r\n]{12,}[\"']"),
}


def source_paths():
    result = subprocess.run(["git", "ls-files", "-z"], cwd=ROOT, capture_output=True)
    if result.returncode == 0 and result.stdout:
        return [ROOT / p.decode() for p in result.stdout.split(b"\0") if p]
    return [p for p in ROOT.rglob("*") if p.is_file() and not any(part in SKIP for part in p.relative_to(ROOT).parts)]


def main():
    findings = []
    paths = source_paths()
    for path in paths:
        if path.name == "check_public.py":
            continue
        relative = str(path.relative_to(ROOT))
        if path.suffix in {".sqlite", ".sqlite3", ".db", ".pdf", ".docx", ".zip"} or path.name.startswith(".env") and path.name != ".env.example":
            findings.append((relative, "private_artifact"))
        raw = path.read_bytes()
        for name, pattern in RULES.items():
            if pattern.search(raw):
                findings.append((relative, name))
    for path, kind in findings:
        print(f"Review required: {path} ({kind})")
    print(f"Checked {len(paths)} source files; {len(findings)} findings.")
    raise SystemExit(bool(findings))


if __name__ == "__main__":
    main()
