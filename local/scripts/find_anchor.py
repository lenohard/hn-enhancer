from pathlib import Path
text = Path("AGENTS.md").read_text()
needle = "- `src/navigation.js`: `setCurrentComment` accepts a second parameter `scrollIntoView`"
idx = text.find(needle)
print(idx)
if idx != -1:
    print(repr(text[idx:idx+len(needle)+120]))
