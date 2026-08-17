"""Build the Field Tech knowledge base bundled into the Worker.

WHAT THIS DOES
--------------
Walks a source folder of training material (PDF, DOCX, and Markdown files),
converts every document to plain Markdown text, stitches them into one big
string, and writes that string to `src/knowledge.ts`.

The Worker imports `KNOWLEDGE_BASE` from that generated file and sends it to
Claude as a cached system block (see src/chat.ts). This is why there is no
vector database or retrieval step: the entire corpus rides along in context,
and prompt caching keeps that cheap.

WHEN TO RUN IT
--------------
Any time the source documents change. Regenerate, then commit and push
`src/knowledge.ts` — the push triggers a Cloudflare deploy. See README §6.

USAGE
-----
    python scripts/build-knowledge.py
    python scripts/build-knowledge.py --source "path/to/training folder"
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

# --- Third-party document converters ---
# pymupdf4llm: PDF  -> Markdown.  mammoth: DOCX -> Markdown/HTML.
# Both are optional at import time so we can print a friendly install hint
# instead of a raw ImportError traceback.
try:
    import pymupdf4llm
except ImportError:
    sys.exit("Missing pymupdf4llm. Run: pip install -r scripts/requirements.txt")

try:
    import mammoth
except ImportError:
    sys.exit("Missing mammoth. Run: pip install -r scripts/requirements.txt")


# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

# Default source folder: the OneDrive "Field Tech Training Guides and Exams"
# project. Override on the command line with --source.
DEFAULT_SOURCE = (
    Path.home()
    / "OneDrive - RJ Machine"
    / "Documents"
    / "Claude"
    / "Projects"
    / "Field Tech Training Guides and Exams"
)

# Where the generated corpus module is written (repo-root/src/knowledge.ts).
OUT_FILE = Path(__file__).resolve().parent.parent / "src" / "knowledge.ts"

# Files/folders to skip — not useful as text context for the bot.
SKIP_EXACT = {"CLAUDE.md"}                                      # project meta, not training content
SKIP_SUFFIXES = {".png", ".jpg", ".jpeg", ".gif", ".xlsx", ".html"}  # images / sheets / raw html
SKIP_DIRS = {"scripts", ".git", "node_modules"}                # never descend into these


# ---------------------------------------------------------------------------
# Per-format converters
# ---------------------------------------------------------------------------

def convert_pdf(path: Path) -> str:
    """PDF -> Markdown text."""
    return pymupdf4llm.to_markdown(str(path))


# mammoth's default image handler inlines every embedded image as a giant
# base64 data URI. That balloons the corpus ~100x (a single Word doc went from
# a few KB of text to 1.45M characters) and gives Claude nothing useful, since
# it can't "see" a base64 blob in text. So we drop image content entirely.
_DROP_IMAGE = mammoth.images.img_element(lambda image: {"src": ""})

# Belt-and-suspenders: strip any data-URI images that still slip through, in
# both Markdown (![alt](data:...)) and HTML (<img src="data:...">) form.
_DATA_URI_MD = re.compile(r"!\[[^\]]*\]\(data:[^)]+\)")
_DATA_URI_HTML = re.compile(r'<img[^>]*src="data:[^"]+"[^>]*/?>')


def convert_docx(path: Path) -> str:
    """DOCX -> Markdown text, with embedded images stripped out."""
    with path.open("rb") as f:
        result = mammoth.convert_to_markdown(f, convert_image=_DROP_IMAGE)
    body = result.value
    body = _DATA_URI_MD.sub("[image]", body)
    body = _DATA_URI_HTML.sub("[image]", body)
    return body


def convert_md(path: Path) -> str:
    """Markdown -> text (read as-is)."""
    # utf-8-sig transparently strips a byte-order mark if Notepad/Word added
    # one; it behaves like plain UTF-8 otherwise.
    return path.read_text(encoding="utf-8-sig")


# ---------------------------------------------------------------------------
# Collection and assembly
# ---------------------------------------------------------------------------

def collect_docs(source: Path) -> list[tuple[str, str]]:
    """Convert every supported file under `source`.

    Returns a list of (display_title, markdown_body) tuples, one per document,
    sorted by path so the corpus is deterministic between builds.
    """
    out: list[tuple[str, str]] = []

    for path in sorted(source.rglob("*")):
        if not path.is_file():
            continue
        # Skip anything inside an excluded directory (scripts/, .git/, ...).
        if any(part in SKIP_DIRS for part in path.relative_to(source).parts):
            continue
        if path.name in SKIP_EXACT:
            continue
        if path.suffix.lower() in SKIP_SUFFIXES:
            continue

        title = path.stem  # filename without extension, used as the section label
        try:
            if path.suffix.lower() == ".pdf":
                body = convert_pdf(path)
            elif path.suffix.lower() == ".docx":
                body = convert_docx(path)
            elif path.suffix.lower() == ".md":
                body = convert_md(path)
            else:
                print(f"  SKIP (unknown): {path.name}", file=sys.stderr)
                continue
        except Exception as e:
            # One bad file shouldn't abort the whole build — log and move on.
            print(f"  ERROR: {path.name}: {e}", file=sys.stderr)
            continue

        if not body.strip():
            print(f"  SKIP (empty): {path.name}", file=sys.stderr)
            continue

        out.append((title, body.strip()))
        print(f"  OK   ({len(body):>7,} chars): {path.name}")

    return out


def build_corpus(docs: list[tuple[str, str]]) -> str:
    """Join all documents into one string, each under a `=== SOURCE: ... ===`
    header so the model can cite which document an answer came from."""
    parts: list[str] = []
    for title, body in docs:
        parts.append(f"\n\n=== SOURCE: {title} ===\n\n{body}")
    return "".join(parts).strip()


def write_module(corpus: str) -> None:
    """Write the corpus to src/knowledge.ts as an exported const string."""
    OUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    # json.dumps gives us a correctly-escaped JS string literal: it handles
    # quotes, backslashes, newlines, and dollar signs so the .ts file is valid.
    escaped = json.dumps(corpus)
    contents = (
        "// AUTO-GENERATED by scripts/build-knowledge.py — DO NOT EDIT BY HAND.\n"
        "// Regenerate with: npm run build-knowledge\n\n"
        f"export const KNOWLEDGE_BASE: string = {escaped};\n"
    )
    OUT_FILE.write_text(contents, encoding="utf-8")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--source",
        type=Path,
        default=DEFAULT_SOURCE,
        help=f"Source folder (default: {DEFAULT_SOURCE})",
    )
    args = parser.parse_args()

    if not args.source.exists():
        sys.exit(f"Source folder not found: {args.source}")

    print(f"Reading from: {args.source}")
    docs = collect_docs(args.source)

    if not docs:
        sys.exit("No documents converted. Check source folder.")

    corpus = build_corpus(docs)
    write_module(corpus)

    # Summary — the token estimate is rough (~4 chars/token) but good enough to
    # sanity-check that the corpus still fits comfortably in the model's context.
    print()
    print(f"Wrote {OUT_FILE}")
    print(f"  Documents: {len(docs)}")
    print(f"  Characters: {len(corpus):,}")
    print(f"  Approx tokens: {len(corpus) // 4:,} (rough estimate)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
