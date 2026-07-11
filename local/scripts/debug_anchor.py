from pathlib import Path

anchor = "- `src/navigation.js`: `setCurrentComment` accepts a second parameter `scrollIntoView` (default `true`). The focus button calls this with `false` to avoid unnecessary scrolling when the user is already looking at the comment.\n"
text = Path("AGENTS.md").read_text()
print(repr(anchor))
print("FOUND" if anchor in text else "NOT FOUND")
