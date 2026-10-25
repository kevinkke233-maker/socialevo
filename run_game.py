#!/usr/bin/env python3
"""Start the standalone game, or explicitly opt into fresh local paired play."""
from __future__ import annotations

import argparse
import os
from pathlib import Path
import runpy


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--host", default="127.0.0.1", help="Bind address; default: localhost only")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--paired", action="store_true", help="Enable local accounts, two games, questionnaires and saved progress")
    parser.add_argument("--data-dir", type=Path, help="New empty local data directory, or one previously created by this release")
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error("The port must be between 1 and 65535.")
    if args.paired and args.host not in ("127.0.0.1", "localhost"):
        parser.error("Paired account mode is local only; use 127.0.0.1 or localhost.")
    if args.data_dir and not args.paired:
        parser.error("--data-dir requires --paired.")
    root = Path(__file__).resolve().parent
    os.environ["HOST"] = args.host
    os.environ["PORT"] = str(args.port)
    os.environ["ANONYMOUS_LOCAL_PAIR_MODE"] = "1" if args.paired else "0"
    if args.data_dir:
        os.environ["ANONYMOUS_LOCAL_DATA_DIR"] = str(args.data_dir.expanduser().absolute())
    os.chdir(root)
    runpy.run_path(str(root / "server.py"), run_name="__main__")


if __name__ == "__main__":
    main()
