"""Build the Field Tech knowledge base from monday.com.

WHAT THIS DOES
--------------
Reads the two RP boards + the Directory Skills Catalog doc described in
`scripts/monday-config.json`, pulls their content through the monday.com
GraphQL API, stitches it into one corpus string, and writes `src/knowledge.ts`
(the same output the old OneDrive builder produced, so nothing downstream
changes).

WHY NO PDF PARSING
------------------
The RP Document Library board already runs its own "Extract File Data" workflow
that posts each document's full text into the item's Updates thread. So we read
the structured columns + the Updates thread + Notes — we do NOT open the
attached PDFs/DOCX. Items with no extracted text yet are flagged in the log for
an owner to run the monday extract button (we don't re-parse files here).

This replaces the OneDrive source. The old `build-knowledge.py` is kept as
dormant reference only.

USAGE
-----
    set MONDAY_API_TOKEN=...            (PowerShell:  $env:MONDAY_API_TOKEN="...")
    python scripts/build_knowledge_monday.py
    python scripts/build_knowledge_monday.py --dry-run     # fetch + report, don't write
    python scripts/build_knowledge_monday.py --config path --out path
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

try:
    import requests
except ImportError:
    sys.exit("Missing requests. Run: pip install -r scripts/requirements.txt")


# ---------------------------------------------------------------------------
# Configuration / constants
# ---------------------------------------------------------------------------

MONDAY_API_URL = "https://api.monday.com/v2"
MONDAY_API_VERSION = "2024-10"

DEFAULT_CONFIG = Path(__file__).resolve().parent / "monday-config.json"
DEFAULT_OUT = Path(__file__).resolve().parent.parent / "src" / "knowledge.ts"
# Reference docs that aren't in monday yet (training guides, ENG-TB bulletins).
# Every .md/.txt here is appended to the corpus so it survives monday rebuilds.
DEFAULT_SUPPLEMENTAL = Path(__file__).resolve().parent / "supplemental"

# Below this many characters of *actual content* (updates + notes), a Document
# Library item is treated as "not yet extracted" and flagged for the owner to
# run monday's Extract button. (Decision: 500 chars; tunable.)
THIN_CONTENT_CHARS = 500

# Page size for items_page pagination. Both boards are small (<200 items); 50
# keeps each GraphQL call well under monday's complexity budget.
PAGE_SIZE = 50

# The item fields we pull for every board item. `$cols` restricts column_values
# to the allow-list from the config (keeps noise + payload down).
_ITEM_FIELDS = """
  id
  name
  group { id title }
  column_values(ids: $cols) { id text }
  updates(limit: 50) { text_body }
  subitems { name column_values { id text } }
"""


# ---------------------------------------------------------------------------
# monday.com API helpers
# ---------------------------------------------------------------------------

def monday_request(session: requests.Session, query: str, variables: dict) -> dict:
    """POST a GraphQL query and return its `data`, raising on any error."""
    resp = session.post(
        MONDAY_API_URL,
        json={"query": query, "variables": variables},
        timeout=60,
    )
    resp.raise_for_status()
    payload = resp.json()
    # monday returns HTTP 200 even for GraphQL errors — check the body.
    if "errors" in payload:
        raise RuntimeError(f"monday API error: {json.dumps(payload['errors'])[:800]}")
    return payload["data"]


def make_session(token: str) -> requests.Session:
    s = requests.Session()
    s.headers.update({
        "Authorization": token,
        "API-Version": MONDAY_API_VERSION,
        "Content-Type": "application/json",
    })
    return s


# ---------------------------------------------------------------------------
# Doc fetching (the Directory Skills Catalog)
# ---------------------------------------------------------------------------

def _block_text(content: str | None) -> str:
    """Pull plain text out of one monday doc block's `content` JSON string.

    Doc blocks store their text as a Quill-style deltaFormat: a list of
    `{"insert": "..."}` runs. We concatenate the inserts.
    """
    if not content:
        return ""
    try:
        data = json.loads(content)
    except (ValueError, TypeError):
        return ""
    runs = data.get("deltaFormat") or []
    return "".join(r.get("insert", "") for r in runs if isinstance(r, dict)).strip()


def fetch_doc_text(session: requests.Session, object_id: str) -> str:
    """Fetch a monday doc and flatten its blocks to lightly-formatted markdown."""
    query = """
      query ($ids: [ID!]) {
        docs(object_ids: $ids) { name blocks { type content } }
      }
    """
    data = monday_request(session, query, {"ids": [str(object_id)]})
    docs = data.get("docs") or []
    if not docs:
        return ""

    parts: list[str] = []
    for block in docs[0].get("blocks") or []:
        text = _block_text(block.get("content"))
        if not text:
            continue
        btype = (block.get("type") or "").lower()
        if "title" in btype:                 # headings
            parts.append("# " + text)
        elif "bullet" in btype or "list" in btype:
            parts.append("- " + text)
        else:
            parts.append(text)
    return "\n\n".join(parts)


# ---------------------------------------------------------------------------
# Board item fetching
# ---------------------------------------------------------------------------

def fetch_board_items(session: requests.Session, board_id: str, col_ids: list[str]) -> list[dict]:
    """Return all items on a board, paginating through items_page."""
    first_query = f"""
      query ($board: [ID!], $cols: [String!]) {{
        boards(ids: $board) {{
          items_page(limit: {PAGE_SIZE}) {{ cursor items {{ {_ITEM_FIELDS} }} }}
        }}
      }}
    """
    next_query = f"""
      query ($cols: [String!], $cursor: String!) {{
        next_items_page(limit: {PAGE_SIZE}, cursor: $cursor) {{
          cursor items {{ {_ITEM_FIELDS} }}
        }}
      }}
    """

    data = monday_request(session, first_query, {"board": [str(board_id)], "cols": col_ids})
    page = data["boards"][0]["items_page"]
    items = list(page["items"])
    cursor = page["cursor"]

    # `cursor` is null once there are no more pages.
    while cursor:
        data = monday_request(session, next_query, {"cols": col_ids, "cursor": cursor})
        page = data["next_items_page"]
        items.extend(page["items"])
        cursor = page["cursor"]

    return items


# ---------------------------------------------------------------------------
# Corpus assembly (pure functions — no network, easy to test)
# ---------------------------------------------------------------------------

def _col_text(item: dict, col_id: str) -> str:
    """Return the display text of one column on an item ('' if empty)."""
    for cv in item.get("column_values") or []:
        if cv.get("id") == col_id:
            return (cv.get("text") or "").strip()
    return ""


def _updates_text(item: dict) -> str:
    """Concatenate the item's Updates thread (where extracted doc text lives)."""
    bodies = [
        (u.get("text_body") or "").strip()
        for u in (item.get("updates") or [])
    ]
    return "\n\n".join(b for b in bodies if b)


def _subitems_text(item: dict) -> str:
    """Render subitems (used by MPL WLAK items) as a simple bulleted block."""
    lines: list[str] = []
    for sub in item.get("subitems") or []:
        cols = "; ".join(
            (cv.get("text") or "").strip()
            for cv in (sub.get("column_values") or [])
            if (cv.get("text") or "").strip()
        )
        name = (sub.get("name") or "").strip()
        lines.append(f"- {name}" + (f" — {cols}" if cols else ""))
    return "\n".join(lines)


def status_of(item: dict, status_filter: dict | None) -> str:
    """The item's status text, per the configured status column ('' if none)."""
    if not status_filter or "column" not in status_filter:
        return ""
    return _col_text(item, status_filter["column"])


def passes_status_filter(item: dict, status_filter: dict | None) -> bool:
    """Apply the board's include/exclude status rules from the config."""
    if not status_filter:
        return True
    status = status_of(item, status_filter)
    include = status_filter.get("include")
    exclude = status_filter.get("exclude") or []
    if include:                      # allow-list wins if present
        return status in include
    return status not in exclude


def format_item(board_name: str, board_cfg: dict, item: dict) -> tuple[str, str, bool]:
    """Build one corpus section for an item.

    Returns (section_title, section_body, thin) where `thin` flags an item whose
    extracted content is missing/too short (candidate for monday re-extraction).
    """
    title = item.get("name") or f"item {item.get('id')}"
    col_titles = {c["id"]: c["title"] for c in board_cfg.get("include_columns", [])}

    lines: list[str] = [f"Board: {board_name}"]
    group = (item.get("group") or {}).get("title")
    if group:
        lines.append(f"Group: {group}")

    # One "Title: value" line per non-empty allow-listed column.
    for col_id, col_title in col_titles.items():
        val = _col_text(item, col_id)
        if val:
            lines.append(f"{col_title}: {val}")

    meta_block = "\n".join(lines)

    # Content = the full extracted document text (Document Library) and/or notes.
    content_parts: list[str] = []
    updates = _updates_text(item)
    if updates:
        content_parts.append(updates)
    subs = _subitems_text(item)
    if subs:
        content_parts.append("Subitems:\n" + subs)
    content = "\n\n".join(content_parts)

    # "Thin" only matters for boards that are supposed to carry extracted document
    # text (the Document Library). Master Parts List rows legitimately have no long
    # text, so we don't flag those. We measure updates+subitems; the Notes column
    # already shows up in the metadata block above.
    expects_full_text = bool(board_cfg.get("expects_full_text"))
    thin = expects_full_text and len(content) < THIN_CONTENT_CHARS

    body = meta_block
    if content:
        body += "\n\n" + content
    elif expects_full_text:
        body += "\n\n[No extracted text found in monday for this item — run the " \
                "Extract File Data button on this item to populate its Updates thread.]"

    return title, body, thin


def read_supplemental(folder: Path) -> list[tuple[str, str]]:
    """Load reference docs not yet in monday (training guides, bulletins).

    Each .md/.txt file in scripts/supplemental/ becomes a corpus section. The
    section title is the file's first '# ' heading if present, else its filename.
    """
    out: list[tuple[str, str]] = []
    if not folder.exists():
        return out
    for path in sorted(folder.glob("*")):
        if not path.is_file() or path.suffix.lower() not in (".md", ".txt"):
            continue
        text = path.read_text(encoding="utf-8-sig").strip()
        if not text:
            continue
        title = path.stem
        first = text.splitlines()[0].strip()
        if first.startswith("# "):
            title = first[2:].strip()
        out.append((title, text))
    return out


def assemble_corpus(sections: list[tuple[str, str]]) -> str:
    """Join (title, body) sections in the shared `=== SOURCE: <title> ===` format."""
    parts = [f"\n\n=== SOURCE: {title} ===\n\n{body}" for title, body in sections]
    return "".join(parts).strip()


def write_module(corpus: str, out_file: Path) -> None:
    """Write the corpus to src/knowledge.ts as an exported const string."""
    out_file.parent.mkdir(parents=True, exist_ok=True)
    escaped = json.dumps(corpus)  # safe JS string literal (quotes, newlines, etc.)
    contents = (
        "// AUTO-GENERATED by scripts/build_knowledge_monday.py — DO NOT EDIT BY HAND.\n"
        "// Regenerate with: npm run build-knowledge\n\n"
        f"export const KNOWLEDGE_BASE: string = {escaped};\n"
    )
    out_file.write_text(contents, encoding="utf-8")


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> int:
    # Windows consoles default to cp1252, which can't encode ™ / emoji that
    # appear in item names and log lines. Force UTF-8 output so printing the
    # progress/flag report never crashes the run.
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG)
    parser.add_argument("--out", type=Path, default=DEFAULT_OUT)
    parser.add_argument("--dry-run", action="store_true",
                        help="Fetch and report sizes, but don't write knowledge.ts")
    args = parser.parse_args()

    token = os.environ.get("MONDAY_API_TOKEN")
    if not token:
        sys.exit("MONDAY_API_TOKEN environment variable is not set.")

    if not args.config.exists():
        sys.exit(f"Config not found: {args.config}")
    cfg = json.loads(args.config.read_text(encoding="utf-8"))

    session = make_session(token)
    sections: list[tuple[str, str]] = []
    flagged: list[str] = []

    # 1) The Directory Skills Catalog doc (index + orienting context).
    catalog = cfg.get("catalog_doc") or {}
    if catalog.get("include_in_corpus") and catalog.get("object_id"):
        print(f"Fetching catalog doc {catalog['object_id']} ...")
        doc_text = fetch_doc_text(session, catalog["object_id"])
        if doc_text.strip():
            sections.append((catalog.get("title", "Directory Skills Catalog"), doc_text))
            print(f"  OK   ({len(doc_text):>7,} chars)")
        else:
            print("  WARN: catalog doc returned no text")

    # 2) Each board's items.
    for board in cfg.get("boards", []):
        board_name = board["name"]
        col_ids = [c["id"] for c in board.get("include_columns", [])]
        status_filter = board.get("status_filter")
        print(f"Fetching board '{board_name}' ({board['id']}) ...")

        items = fetch_board_items(session, board["id"], col_ids)
        kept = 0
        for item in items:
            if not passes_status_filter(item, status_filter):
                continue
            title, body, thin = format_item(board_name, board, item)
            sections.append((title, body))
            kept += 1
            if thin:
                flagged.append(f"{board_name} / {title}")
        print(f"  {kept} items kept ({len(items)} fetched, "
              f"{len(items) - kept} filtered out by status)")

    # 3) Supplemental reference docs (training guides, bulletins) not yet in monday.
    for title, body in read_supplemental(DEFAULT_SUPPLEMENTAL):
        sections.append((title, body))
        print(f"Supplemental: {title} ({len(body):,} chars)")

    corpus = assemble_corpus(sections)

    # Report
    print()
    print(f"Sections: {len(sections)}")
    print(f"Characters: {len(corpus):,}")
    print(f"Approx tokens: {len(corpus) // 4:,} (rough; Sonnet 5 tokenizes ~30% higher)")
    if flagged:
        print(f"\nWARNING: {len(flagged)} item(s) with little/no extracted text "
              f"(run monday's Extract button on these):")
        for f in flagged:
            print(f"    - {f}")

    if args.dry_run:
        print("\n--dry-run: not writing knowledge.ts")
        return 0

    write_module(corpus, args.out)
    print(f"\nWrote {args.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
