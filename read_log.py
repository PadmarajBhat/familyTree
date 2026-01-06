import os

try:
    with open("backend_stdout.log", "rb") as f:
        try:
            f.seek(-2000, os.SEEK_END)
        except OSError:
            pass # File is smaller than 2000 bytes
        print(f.read().decode('utf-8', errors='replace'))
except Exception as e:
    print(f"Error reading file: {e}")
