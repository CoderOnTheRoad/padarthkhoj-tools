from __future__ import annotations

import argparse
from typing import Sequence

from pkdos.commands.summary import generate_summary
from pkdos.commands.sum import run_sum_menu
from pkdos.utils.logging import configure_logging


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="pkdos",
        description="Quantum ESPRESSO PDOS analysis toolkit",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    summary_parser = subparsers.add_parser(
        "summary",
        help="Scan the current directory for PDOS files and write pkdos_summary.txt",
        description="Scan the current directory for Quantum ESPRESSO PDOS files and generate a summary report.",
    )
    summary_parser.set_defaults(func=run_summary)

    sum_parser = subparsers.add_parser(
        "sum",
        help="Start the interactive summation menu",
        description="Run the interactive PDOS summation workflow.",
    )
    sum_parser.set_defaults(func=run_sum)

    return parser


def run_summary(_: argparse.Namespace) -> None:
    configure_logging()
    print("Scanning PDOS files in the current directory...")
    generate_summary()
    print("Summary written to pkdos_summary.txt")


def run_sum(_: argparse.Namespace) -> None:
    configure_logging()
    print("Starting pkdos summation workflow...")
    run_sum_menu()


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    args.func(args)
    return 0
