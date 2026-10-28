"""Print the folder name for a secret door code.

The door on the homepage (assets/js/door.js) hashes whatever is typed and
looks for a page at /x/<id>/. To add a code, run this with the code and create
x/<id>/index.html. To retire one, delete the folder.

Usage: python3 tools/door-id.py DEALBREAKER [MORE CODES...]
"""
import hashlib
import sys


def door_id(code):
    # Spaces never matter: "DEAL BREAKER" and "DEALBREAKER" are one code.
    code = "".join(code.split()).upper()
    return hashlib.sha256(f"undisclosed-door:{code}".encode()).hexdigest()[:16]


if __name__ == "__main__":
    for code in sys.argv[1:]:
        print(f"{door_id(code)}  {''.join(code.split()).upper()}")
