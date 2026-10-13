"""Build a browser-only demo from tracked public web assets."""

import argparse
import json
import re
import shutil
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENTRY_FILES = ("index.html", "app.js", "planner.js", "icons.js", "styles.css", "catalog.json")
REQUIRED_ASSETS = ("assets/logo.svg", "assets/fonts/SUIT-Variable.woff2", "assets/fonts/OFL.txt",
                   "assets/design/design-01.png", "assets/design/design-02.png", "assets/design/design-03.png")
AUTO_MODE = '<meta id="runtime-config" name="family-trip-mode" content="auto">'
STATIC_MODE = '<meta id="runtime-config" name="family-trip-mode" content="static">'


def tracked_assets(root):
    result = subprocess.run(["git", "ls-files", "-z", "--", "web/assets/"], cwd=root,
                            capture_output=True, check=True)
    return [Path(p.decode("utf-8")).relative_to("web")
            for p in result.stdout.split(b"\0") if p]


def build_site(output, root=ROOT):
    root, output = Path(root).resolve(), Path(output).resolve()
    source = root / "web"
    if output == root or output.is_relative_to(source) or source.is_relative_to(output):
        raise ValueError("Output must be separate from the source directory")
    if output.exists() and any(output.iterdir()):
        raise ValueError("Output directory must be empty; remove the previous build first")
    files = [Path(p) for p in ENTRY_FILES] + tracked_assets(root)
    if not set(map(Path, REQUIRED_ASSETS)).issubset(files):
        raise ValueError("Required design or font assets are not tracked")
    for relative in files:
        path = source / relative
        if path.is_symlink() or not path.resolve().is_relative_to(source) or not path.is_file():
            raise ValueError(f"Unsafe or missing source: {relative}")
        if relative not in map(Path, ENTRY_FILES) and not (
            relative.suffix in {".svg", ".png", ".woff2"} or relative.as_posix() == "assets/fonts/OFL.txt"
        ):
            raise ValueError(f"Unexpected public asset: {relative}")
    html = (source / "index.html").read_text(encoding="utf-8")
    if html.count(AUTO_MODE) != 1:
        raise ValueError("Expected one runtime configuration marker")
    output.mkdir(parents=True, exist_ok=True)
    for relative in files:
        target = output / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source / relative, target)
    (output / "index.html").write_text(html.replace(AUTO_MODE, STATIC_MODE), encoding="utf-8")
    (output / ".nojekyll").write_text("", encoding="utf-8")
    check_site(output)
    return len(files) + 1


def check_site(output):
    output = Path(output).resolve()
    html = (output / "index.html").read_text(encoding="utf-8")
    if STATIC_MODE not in html:
        raise ValueError("Public demo must disable the backend")
    references = re.findall(r'(?:src|href)="([^"#]+)"', html)
    for name in ("app.js", "planner.js", "icons.js"):
        references += re.findall(r"from ['\"]([^'\"]+)['\"]", (output / name).read_text(encoding="utf-8"))
    references += re.findall(r'url\(["\']?([^"\')]+)', (output / "styles.css").read_text(encoding="utf-8"))
    catalog = json.loads((output / "catalog.json").read_text(encoding="utf-8"))
    references += [p["illustration"] for p in catalog["places"]]
    references += list(REQUIRED_ASSETS)
    for reference in references:
        if reference.startswith(("https://", "http://")):
            continue
        if reference.startswith("/"):
            raise ValueError(f"Asset must support repository subpaths: {reference}")
        target = (output / reference).resolve()
        if not target.is_relative_to(output) or not target.exists():
            raise ValueError(f"Missing or unsafe public resource: {reference}")


def main():
    parser = argparse.ArgumentParser(description="Build the static family travel demo")
    parser.add_argument("--output", type=Path, default=ROOT / "dist")
    args = parser.parse_args()
    count = build_site(args.output)
    print(f"Built {count} public files. Backend requests disabled. No runtime data included.")


if __name__ == "__main__":
    main()
