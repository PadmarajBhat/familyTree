
try:
    with open("backend_debug.log", "r") as f:
        content = f.read()
    with open("log_dump.txt", "w") as f_out:
        f_out.write(content)
    print("Dumped logs.")
except Exception as e:
    print(f"Error: {e}")
