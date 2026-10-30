"""Add a Figma Make code export to the repo in one command.

Usage (from anywhere, on branch feature/figma-make):
    python prototype/add_figma_export.py path/to/figma-make-export.zip

What it does:
  1. Unzips the export into prototype/figma-make/ (skips node_modules, .git, dist, .env files).
  2. Scans the files for API keys and Round-1 wording; stops if anything is found.
  3. Asks before committing, then commits in the team format and pushes the branch.
Standard library only, works on Windows / macOS / Linux.
"""

import codecs
import re
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
TARGET = ROOT / "prototype" / "figma-make"
BRANCH = "feature/figma-make"
KEEP = {"HOW_TO_ADD.txt"}
SKIP_DIRS = {"node_modules", ".git", "dist", "build", ".next", "__MACOSX", ".vite"}
SKIP_FILES = {".DS_Store", "Thumbs.db"}
TEXT_EXT = {".ts", ".tsx", ".js", ".jsx", ".json", ".css", ".html", ".md", ".txt", ".svg", ".yml", ".yaml", ".cjs", ".mjs"}

# Round-1 words, stored ROT13 so this file passes the same scan it runs.
BANNED = [codecs.decode(w, "rot13") for w in
          ["perqragvny", "irevsvre", "jnyyrg", "fryrpgvir qvfpybfher", "qvtvgny vq", "fq-wjg"]]
KEY_PATTERNS = [
    re.compile(r"gsk_[A-Za-z0-9]{16,}"),  # Groq
    re.compile(r"sk-[A-Za-z0-9]{20,}"),  # OpenAI-style
    re.compile(r"AIza[0-9A-Za-z_\-]{30,}"),  # Google
    re.compile(r"""(api[_-]?key|secret|token)\s*[:=]\s*['"][A-Za-z0-9_\-]{16,}['"]""", re.I),
]

COMMIT_TITLE = "feat(frontend): add Figma Make prototype export for reference"
COMMIT_BODY = """- Export of the 4-screen prototype (Run Task, Gate Log, Review Queue,
  Attack Bench) built in Figma Make with mock data
- Kept in prototype/figma-make so it does not affect frontend/ or CI
- Screens will be ported into frontend/src/pages against the real API"""


def git(*args: str, check: bool = True) -> str:
    out = subprocess.run(["git", *args], cwd=ROOT, capture_output=True, text=True)
    if check and out.returncode != 0:
        sys.exit(f"git {' '.join(args)} failed:\n{out.stderr.strip()}")
    return out.stdout.strip()


def skipped(rel: Path) -> bool:
    return any(p in SKIP_DIRS for p in rel.parts) or rel.name in SKIP_FILES or rel.name.startswith(".env")


def extract(zip_path: Path) -> int:
    with tempfile.TemporaryDirectory() as tmp:
        tmp_dir = Path(tmp)
        with zipfile.ZipFile(zip_path) as zf:
            zf.extractall(tmp_dir)
        src = tmp_dir
        entries = [p for p in src.iterdir() if p.name not in SKIP_DIRS | SKIP_FILES]
        if len(entries) == 1 and entries[0].is_dir():  # zip wraps everything in one folder
            src = entries[0]

        for old in TARGET.iterdir():  # replace any previous export, keep the instructions
            if old.name in KEEP:
                continue
            shutil.rmtree(old) if old.is_dir() else old.unlink()

        count = 0
        for f in src.rglob("*"):
            rel = f.relative_to(src)
            if f.is_dir() or skipped(rel):
                continue
            dest = TARGET / rel
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(f, dest)
            count += 1
        return count


def scan() -> list[str]:
    problems = []
    for f in TARGET.rglob("*"):
        if not f.is_file() or f.suffix.lower() not in TEXT_EXT or f.stat().st_size > 1_000_000:
            continue
        rel = f.relative_to(ROOT).as_posix()
        for n, line in enumerate(f.read_text(encoding="utf-8", errors="ignore").splitlines(), 1):
            low = line.lower()
            for word in BANNED:
                if word in low:
                    problems.append(f"{rel}:{n}  banned word '{word}'")
            if any(p.search(line) for p in KEY_PATTERNS):
                problems.append(f"{rel}:{n}  looks like an API key or secret")
    return problems


def main() -> None:
    if len(sys.argv) != 2:
        sys.exit("Usage: python prototype/add_figma_export.py path/to/export.zip")
    zip_path = Path(sys.argv[1]).expanduser().resolve()
    if not zip_path.is_file() or not zipfile.is_zipfile(zip_path):
        sys.exit(f"Not a zip file: {zip_path}")

    branch = git("rev-parse", "--abbrev-ref", "HEAD")
    if branch != BRANCH:
        sys.exit(f"You are on '{branch}'. Run:  git checkout {BRANCH}   then try again.")
    if not git("config", "user.email", check=False):
        sys.exit('Set your git identity first:\n  git config user.name "Your Name"\n  git config user.email "you@example.com"')

    TARGET.mkdir(parents=True, exist_ok=True)
    count = extract(zip_path)
    print(f"Copied {count} files into prototype/figma-make/")
    has_pkg = (TARGET / "package.json").is_file()
    has_src = (TARGET / "src").is_dir()
    print(f"  package.json: {'yes' if has_pkg else 'NO'}   src/: {'yes' if has_src else 'NO'}")
    if not (has_pkg and has_src):
        print("  Warning: this does not look like a full code export. Check the zip.")

    problems = scan()
    if problems:
        print("\nStopped: fix these first (then run the script again):")
        print("\n".join(f"  - {p}" for p in problems))
        sys.exit(1)
    print("Checks passed: no API keys, no Round-1 wording.")

    if input("\nCommit and push to GitHub now? [y/N] ").strip().lower() != "y":
        print("Not committed. Files are in prototype/figma-make/. Run again when ready.")
        return
    git("add", "prototype/figma-make")
    if not git("diff", "--cached", "--name-only"):
        print("Nothing changed since the last export; nothing to commit.")
        return
    git("commit", "-m", COMMIT_TITLE, "-m", COMMIT_BODY)
    print(f"Committed: {COMMIT_TITLE}")
    git("push", "-u", "origin", BRANCH)
    print(f"Pushed to GitHub. Now open a pull request: {BRANCH} -> main")


if __name__ == "__main__":
    main()
