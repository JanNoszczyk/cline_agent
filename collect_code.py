import os

def collect_code(directory, extensions=None, exclude_dirs=None):
    """Recursively collect code from a directory and return a structured text format."""
    if extensions is None:
        extensions = [".py", ".js", ".ts", ".java", ".cpp", ".c", ".html", ".css"]  # Modify as needed
    if exclude_dirs is None:
        exclude_dirs = {".git", "__pycache__", "node_modules", "venv"}

    collected_code = []

    for root, dirs, files in os.walk(directory):
        # Skip excluded directories
        dirs[:] = [d for d in dirs if d not in exclude_dirs]

        for file in files:
            if any(file.endswith(ext) for ext in extensions):
                file_path = os.path.join(root, file)
                try:
                    with open(file_path, "r", errors="ignore") as f:
                        code = f.read()
                    collected_code.append(f"\n### FILE: {file_path} ###\n{code}")
                except Exception as e:
                    print(f"Skipping {file_path}: {e}")

    return "\n".join(collected_code)

directory = "./src/"  # Change this to the target directory
all_code = collect_code(directory)

# Save it to a file (optional)
with open("all_code.txt", "w") as f:
    f.write(all_code)

print("Code collected successfully! Ready to input into LLM.")