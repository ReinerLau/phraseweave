"""Frozen entry point for the desktop generator and its isolated worker."""

from __future__ import annotations

import multiprocessing
import sys


def main() -> int:
    multiprocessing.freeze_support()
    if sys.argv[1:] == ["--worker"]:
        from worker import main as worker_main

        return worker_main()
    if sys.argv[1:] == ["--service"]:
        from local_service import run_desktop_service

        run_desktop_service()
        return 0
    print("Expected --service or --worker.", file=sys.stderr)
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
