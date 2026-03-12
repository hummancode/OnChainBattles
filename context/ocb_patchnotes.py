#!/usr/bin/env python3
"""
OnChainBattles — Patch Notes
==============================
Simple patch note tracker with full CRUD.
Data stored as JSON. Export to Markdown for AI or players.
"""

import json
import os
import sys
import copy
from datetime import datetime, date
from pathlib import Path
from typing import Optional

from rich.console import Console
from rich.table import Table
from rich.panel import Panel
from rich.prompt import Prompt, IntPrompt, Confirm
from rich.markdown import Markdown
from rich import box

APP_VERSION = "1.0.0"
console = Console()

CATEGORIES = [
    "Balance",
    "New Content",
    "Mechanics",
    "Bug Fix",
    "Internal",
]


# ── Data ──────────────────────────────────────────────────────────────

def data_path() -> Path:
    base = Path(sys.executable).parent if getattr(sys, 'frozen', False) else Path(__file__).parent
    return base / "patch_notes.json"


def load() -> dict:
    p = data_path()
    if p.exists():
        with open(p, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"patches": [], "unreleased": [], "revoked": []}


def save(data: dict):
    p = data_path()
    tmp = p.with_suffix(".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    tmp.replace(p)


# ── Helpers ───────────────────────────────────────────────────────────

def clear():
    os.system("cls" if os.name == "nt" else "clear")

def pause():
    Prompt.ask("\n[dim]Enter to continue[/dim]")

def pick(items: list[str], title="Choose") -> Optional[int]:
    for i, item in enumerate(items, 1):
        console.print(f"  [cyan]{i}.[/cyan] {item}")
    console.print(f"  [cyan]0.[/cyan] [dim]Cancel[/dim]")
    c = IntPrompt.ask(title, default=0)
    if c < 1 or c > len(items):
        return None
    return c - 1

def make_note() -> Optional[dict]:
    """Prompt user to write a single note entry."""
    console.print(f"\n  Categories: {', '.join(CATEGORIES)}")
    idx = pick(CATEGORIES, "Category")
    if idx is None:
        return None
    cat = CATEGORIES[idx]
    text = Prompt.ask("Note")
    if not text.strip():
        return None
    return {
        "id": datetime.now().strftime("%Y%m%d%H%M%S%f"),
        "category": cat,
        "text": text.strip(),
        "created": datetime.now().isoformat(),
        "edited": None,
    }

def display_notes(notes: list[dict], show_ids=False):
    """Print a list of notes in a readable format."""
    if not notes:
        console.print("[dim]  (empty)[/dim]")
        return
    for i, n in enumerate(notes, 1):
        cat_color = {"Balance": "yellow", "New Content": "green", "Mechanics": "cyan",
                     "Bug Fix": "red", "Internal": "dim"}.get(n["category"], "white")
        edited = " [dim](edited)[/dim]" if n.get("edited") else ""
        prefix = f"  {i}."
        console.print(f"{prefix} [{cat_color}][{n['category']}][/{cat_color}] {n['text']}{edited}")


# ── Actions ───────────────────────────────────────────────────────────

def add_note(data: dict):
    console.print(Panel("[bold]Add Note → Unreleased[/bold]"))
    note = make_note()
    if note:
        data["unreleased"].append(note)
        save(data)
        console.print(f"[green]✓ Added.[/green]")


def view_unreleased(data: dict):
    console.print(Panel("[bold cyan]Unreleased Notes[/bold cyan]"))
    display_notes(data["unreleased"])


def edit_note(data: dict):
    """Edit an unreleased note's text or category."""
    if not data["unreleased"]:
        console.print("[dim]Nothing to edit.[/dim]")
        return
    console.print(Panel("[bold]Edit Unreleased Note[/bold]"))
    display_notes(data["unreleased"])
    idx = IntPrompt.ask("Which #", default=0) - 1
    if idx < 0 or idx >= len(data["unreleased"]):
        return

    note = data["unreleased"][idx]
    console.print(f"\n  Current: [{note['category']}] {note['text']}")

    action = Prompt.ask("Edit [t]ext, [c]ategory, or [b]oth?", choices=["t", "c", "b"], default="t")

    if action in ("t", "b"):
        new_text = Prompt.ask("New text", default=note["text"])
        note["text"] = new_text.strip()
    if action in ("c", "b"):
        cidx = pick(CATEGORIES, "New category")
        if cidx is not None:
            note["category"] = CATEGORIES[cidx]

    note["edited"] = datetime.now().isoformat()
    save(data)
    console.print("[green]✓ Updated.[/green]")


def delete_note(data: dict):
    """Delete an unreleased note permanently."""
    if not data["unreleased"]:
        console.print("[dim]Nothing to delete.[/dim]")
        return
    console.print(Panel("[bold red]Delete Unreleased Note[/bold red]"))
    display_notes(data["unreleased"])
    idx = IntPrompt.ask("Which #", default=0) - 1
    if idx < 0 or idx >= len(data["unreleased"]):
        return
    note = data["unreleased"][idx]
    console.print(f"\n  Will delete: [{note['category']}] {note['text']}")
    if Confirm.ask("Confirm delete?", default=False):
        data["unreleased"].pop(idx)
        save(data)
        console.print("[green]✓ Deleted.[/green]")


def release_patch(data: dict):
    """Promote all unreleased notes into a versioned patch."""
    if not data["unreleased"]:
        console.print("[red]No unreleased notes.[/red]")
        return

    console.print(Panel("[bold green]Release Patch[/bold green]"))
    display_notes(data["unreleased"])

    if data["patches"]:
        console.print(f"\n[dim]Last version: {data['patches'][0]['version']}[/dim]")

    version = Prompt.ask("Version (e.g. 0.2.0)")
    if not version.strip():
        return
    summary = Prompt.ask("One-line summary (optional)", default="")

    patch = {
        "version": version.strip(),
        "date": date.today().isoformat(),
        "summary": summary,
        "notes": copy.deepcopy(data["unreleased"]),
        "released_at": datetime.now().isoformat(),
    }
    data["patches"].insert(0, patch)
    data["unreleased"] = []
    save(data)
    console.print(f"\n[bold green]✓ Released {version}[/bold green]")


def view_history(data: dict):
    """View all released patches."""
    if not data["patches"]:
        console.print("[dim]No patches yet.[/dim]")
        return

    console.print(Panel("[bold cyan]Patch History[/bold cyan]"))
    for patch in data["patches"]:
        revoked = " [red](REVOKED)[/red]" if patch.get("revoked") else ""
        header = f"[bold green][{patch['version']}][/bold green] — {patch['date']}{revoked}"
        if patch.get("summary"):
            header += f"  [dim]{patch['summary']}[/dim]"
        console.print(f"\n{header}")
        console.print("─" * 50)
        display_notes(patch["notes"])


def edit_released_note(data: dict):
    """Edit a note inside an already-released patch."""
    if not data["patches"]:
        console.print("[dim]No patches.[/dim]")
        return

    console.print(Panel("[bold]Edit Released Note[/bold]"))
    versions = [f"{p['version']} — {p['date']}" for p in data["patches"]]
    pidx = pick(versions, "Which patch")
    if pidx is None:
        return

    patch = data["patches"][pidx]
    if not patch["notes"]:
        console.print("[dim]No notes in this patch.[/dim]")
        return

    display_notes(patch["notes"])
    nidx = IntPrompt.ask("Which #", default=0) - 1
    if nidx < 0 or nidx >= len(patch["notes"]):
        return

    note = patch["notes"][nidx]
    console.print(f"\n  Current: [{note['category']}] {note['text']}")
    new_text = Prompt.ask("New text", default=note["text"])
    note["text"] = new_text.strip()
    note["edited"] = datetime.now().isoformat()
    save(data)
    console.print("[green]✓ Updated.[/green]")


def delete_released_note(data: dict):
    """Delete a note from a released patch."""
    if not data["patches"]:
        console.print("[dim]No patches.[/dim]")
        return

    console.print(Panel("[bold red]Delete Released Note[/bold red]"))
    versions = [f"{p['version']} — {p['date']}" for p in data["patches"]]
    pidx = pick(versions, "Which patch")
    if pidx is None:
        return

    patch = data["patches"][pidx]
    if not patch["notes"]:
        console.print("[dim]No notes.[/dim]")
        return

    display_notes(patch["notes"])
    nidx = IntPrompt.ask("Which #", default=0) - 1
    if nidx < 0 or nidx >= len(patch["notes"]):
        return

    note = patch["notes"][nidx]
    console.print(f"\n  Will delete: [{note['category']}] {note['text']}")
    if Confirm.ask("Confirm?", default=False):
        patch["notes"].pop(nidx)
        save(data)
        console.print("[green]✓ Deleted from {patch['version']}.[/green]")


def revoke_patch(data: dict):
    """Revoke an entire patch — marks it revoked and moves notes back to unreleased."""
    if not data["patches"]:
        console.print("[dim]No patches.[/dim]")
        return

    active = [(i, p) for i, p in enumerate(data["patches"]) if not p.get("revoked")]
    if not active:
        console.print("[dim]All patches already revoked.[/dim]")
        return

    console.print(Panel("[bold red]Revoke Patch[/bold red]"))
    labels = [f"{p['version']} — {p['date']} ({len(p['notes'])} notes)" for _, p in active]
    idx = pick(labels, "Revoke which")
    if idx is None:
        return

    real_idx, patch = active[idx]
    console.print(f"\n  This will mark [bold]{patch['version']}[/bold] as revoked.")
    console.print("  Notes will be moved back to Unreleased.")

    if Confirm.ask("Revoke?", default=False):
        # Move notes back
        for note in patch["notes"]:
            data["unreleased"].append(note)
        # Mark patch
        patch["revoked"] = True
        patch["revoked_at"] = datetime.now().isoformat()
        # Also keep a record
        data["revoked"].append({
            "version": patch["version"],
            "date": patch["date"],
            "revoked_at": patch["revoked_at"],
        })
        save(data)
        console.print(f"[green]✓ {patch['version']} revoked. {len(patch['notes'])} notes moved to Unreleased.[/green]")


def search_notes(data: dict):
    """Search across all notes (unreleased + all patches)."""
    query = Prompt.ask("Search").strip().lower()
    if not query:
        return

    results = []

    for note in data["unreleased"]:
        if query in note["text"].lower() or query in note["category"].lower():
            results.append(("[Unreleased]", note))

    for patch in data["patches"]:
        tag = f"[{patch['version']}]"
        if patch.get("revoked"):
            tag += " (revoked)"
        for note in patch["notes"]:
            if query in note["text"].lower() or query in note["category"].lower():
                results.append((tag, note))

    if not results:
        console.print(f"[dim]No results for '{query}'.[/dim]")
        return

    console.print(Panel(f"[bold]Results for '{query}' — {len(results)} found[/bold]"))
    for tag, note in results:
        cat_color = {"Balance": "yellow", "New Content": "green", "Mechanics": "cyan",
                     "Bug Fix": "red", "Internal": "dim"}.get(note["category"], "white")
        console.print(f"  {tag} [{cat_color}][{note['category']}][/{cat_color}] {note['text']}")


# ── Export ────────────────────────────────────────────────────────────

def export_md(data: dict, public=False) -> str:
    lines = ["# OnChainBattles — Patch Notes\n"]

    if data["unreleased"]:
        lines.append("## [Unreleased]\n")
        for n in data["unreleased"]:
            if public and n["category"] == "Internal":
                continue
            lines.append(f"- **[{n['category']}]** {n['text']}")
        lines.append("")

    for patch in data["patches"]:
        if patch.get("revoked"):
            continue
        header = f"## [{patch['version']}] — {patch['date']}"
        if patch.get("summary"):
            lines.append(header)
            lines.append(f"_{patch['summary']}_\n")
        else:
            lines.append(f"{header}\n")
        for n in patch["notes"]:
            if public and n["category"] == "Internal":
                continue
            lines.append(f"- **[{n['category']}]** {n['text']}")
        lines.append("\n---\n")

    return "\n".join(lines)


def do_export(data: dict):
    console.print(Panel("[bold]Export[/bold]"))
    options = ["Full Markdown", "Public Markdown (no Internal)", "Preview in console"]
    idx = pick(options, "Format")
    if idx is None:
        return

    if idx == 2:
        md = export_md(data, public=False)
        console.print()
        console.print(Markdown(md))
        return

    public = (idx == 1)
    md = export_md(data, public=public)
    fname = "PATCH_NOTES_PUBLIC.md" if public else "PATCH_NOTES.md"

    base = Path(sys.executable).parent if getattr(sys, 'frozen', False) else Path(__file__).parent
    out = base / fname
    with open(out, "w", encoding="utf-8") as f:
        f.write(md)
    console.print(f"[green]✓ Saved:[/green] {out}")


# ── Manage Submenu ────────────────────────────────────────────────────

def manage_menu(data: dict):
    """Submenu for edit/delete/revoke operations."""
    while True:
        clear()
        console.print(Panel("[bold]Manage Notes & Patches[/bold]"))
        items = [
            "Edit unreleased note",
            "Delete unreleased note",
            "Edit note in released patch",
            "Delete note from released patch",
            "Revoke entire patch (move notes back to unreleased)",
            "Back to main menu",
        ]
        idx = pick(items, "Action")
        if idx is None or idx == 5:
            return
        if idx == 0:
            edit_note(data)
        elif idx == 1:
            delete_note(data)
        elif idx == 2:
            edit_released_note(data)
        elif idx == 3:
            delete_released_note(data)
        elif idx == 4:
            revoke_patch(data)
        pause()


# ── Main ──────────────────────────────────────────────────────────────

def main():
    data = load()

    while True:
        clear()
        u = len(data["unreleased"])
        p = len([x for x in data["patches"] if not x.get("revoked")])

        console.print(Panel(
            f"[bold cyan]OnChainBattles — Patch Notes[/bold cyan]\n"
            f"[dim]v{APP_VERSION} · {data_path().name}[/dim]",
            box=box.DOUBLE,
        ))
        console.print(f"  [yellow]{u}[/yellow] unreleased · [green]{p}[/green] patches\n")

        menu = [
            "[green]Add Note[/green]",
            "[cyan]View Unreleased[/cyan]",
            "[bold green]Release Patch[/bold green]",
            "[cyan]View History[/cyan]",
            "[magenta]Search[/magenta]",
            "[yellow]Manage[/yellow] (edit / delete / revoke)",
            "[blue]Export[/blue]",
            "[bold red]Quit[/bold red]",
        ]
        for i, item in enumerate(menu, 1):
            console.print(f"  [bold]{i}.[/bold] {item}")

        c = IntPrompt.ask("\nChoice", default=8)

        if c == 1:
            add_note(data)
            pause()
        elif c == 2:
            view_unreleased(data)
            pause()
        elif c == 3:
            release_patch(data)
            pause()
        elif c == 4:
            view_history(data)
            pause()
        elif c == 5:
            search_notes(data)
            pause()
        elif c == 6:
            manage_menu(data)
        elif c == 7:
            do_export(data)
            pause()
        elif c == 8:
            console.print("[dim]Goodbye.[/dim]")
            break


if __name__ == "__main__":
    main()
