from pathlib import Path
import hashlib
import json

folder = Path(__file__).resolve().parent
manifest = json.loads((folder / "manifest.json").read_text())
output = folder.parent / manifest["output_file"]
temporary = output.with_suffix(output.suffix + ".restoring")
digest = hashlib.sha256()
try:
    with temporary.open("wb") as target:
        for part in manifest["parts"]:
            data = (folder / part["file"]).read_bytes()
            if len(data) != part["bytes"] or hashlib.sha256(data).hexdigest() != part["sha256"]:
                raise ValueError("Damaged or missing part: " + part["file"])
            target.write(data)
            digest.update(data)
    if temporary.stat().st_size != manifest["bytes"] or digest.hexdigest() != manifest["sha256"]:
        raise ValueError("Restored video failed its integrity check.")
    temporary.replace(output)
    print("Restored and verified:", output)
except Exception:
    temporary.unlink(missing_ok=True)
    raise
