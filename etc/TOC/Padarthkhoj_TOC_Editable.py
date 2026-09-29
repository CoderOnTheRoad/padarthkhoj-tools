#!/usr/bin/env python3
"""Build the editable Padarthkhoj graphical TOC PowerPoint.

The editable PowerPoint engine is implemented in JavaScript because it exports
native PowerPoint objects reliably. This Python entry point makes the builder
easy to run while keeping all slide text, panels, atoms, bonds, plots, tables,
and arrows independently editable.
"""
from pathlib import Path
import os
import subprocess

ROOT = Path(__file__).resolve().parent
NODE = Path("/Users/souravghosh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node")
BUILDER = ROOT / ".codex_build" / "padarthkhoj_toc" / "build_toc.mjs"
OUTPUT = ROOT / "Padarthkhoj_TOC_Editable.pptx"
PREVIEW = ROOT / "Padarthkhoj_TOC_Preview.png"

def main() -> None:
    env = os.environ.copy()
    env["NODE_PATH"] = "/Users/souravghosh/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules"
    subprocess.run([str(NODE), str(BUILDER), str(OUTPUT), str(PREVIEW)], check=True, env=env)
    print(f"Created: {OUTPUT}")
    print(f"Preview: {PREVIEW}")

if __name__ == "__main__":
    main()
