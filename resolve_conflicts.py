#!/usr/bin/env python3
"""
Script to automatically resolve merge conflicts by keeping HEAD version
"""
import re
import sys
from pathlib import Path

def resolve_conflicts_keep_ours(file_path):
    """Resolve conflicts in a file by keeping HEAD (ours) version"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
    except Exception as e:
        print(f"Error reading {file_path}: {e}")
        return False
    
    # Check if file has conflicts
    if '<<<<<<< HEAD' not in content:
        print(f"No conflicts in {file_path}")
        return True
    
    # Pattern to match conflict blocks
    # Captures: <<<<<<< HEAD\n(content)\n=======\n(content)\n>>>>>>> hash
    pattern = r'<<<<<<< HEAD\n(.*?)\n=======\n(.*?)\n>>>>>>> [a-f0-9]+'
    
    # Replace with HEAD version (group 1)
    resolved = re.sub(pattern, r'\1', content, flags=re.DOTALL)
    
    # Check if all conflicts were resolved
    if '<<<<<<< HEAD' in resolved or '=======' in resolved or '>>>>>>>' in resolved:
        # Try line-by-line approach for remaining conflicts
        lines = resolved.split('\n')
        result_lines = []
        in_conflict = False
        keep_lines = []
        
        i = 0
        while i < len(lines):
            line = lines[i]
            
            if line.startswith('<<<<<<< HEAD'):
                in_conflict = True
                keep_lines = []
                i += 1
                continue
            elif line.startswith('=======') and in_conflict:
                # Skip until we find the end marker
                i += 1
                while i < len(lines) and not lines[i].startswith('>>>>>>>'):
                    i += 1
                # Add the kept lines
                result_lines.extend(keep_lines)
                in_conflict = False
                keep_lines = []
                i += 1
                continue
            elif line.startswith('>>>>>>>') and in_conflict:
                result_lines.extend(keep_lines)
                in_conflict = False
                keep_lines = []
                i += 1
                continue
            
            if in_conflict:
                keep_lines.append(line)
            else:
                result_lines.append(line)
            
            i += 1
        
        resolved = '\n'.join(result_lines)
    
    # Write resolved content
    try:
        with open(file_path, 'w', encoding='utf-8', newline='\n') as f:
            f.write(resolved)
        print(f"✓ Resolved conflicts in {file_path}")
        return True
    except Exception as e:
        print(f"Error writing {file_path}: {e}")
        return False

def main():
    # List of files with conflicts
    files = [
        r"cordigram-web\app\(auth)\signup\page.tsx",
        r"cordigram-backend\package-lock.json",
        r"cordigram-backend\src\profiles\profiles.controller.ts",
        r"cordigram-web\ui\Sidebar\sidebar.tsx",
        r"cordigram-web\ui\Sidebar\sidebar.module.css",
        r"cordigram-web\package-lock.json",
        r"cordigram-web\app\(main)\page.tsx",
        r"cordigram-web\app\(main)\create\page.tsx",
        r"cordigram-web\app\(main)\create\create.module.css",
        r"cordigram-backend\src\posts\posts.service.ts",
        r"cordigram-backend\src\posts\posts.module.ts",
        r"cordigram-backend\src\posts\posts.controller.ts",
        r"cordigram-backend\src\posts\post.schema.ts",
        r"cordigram-backend\package.json",
    ]
    
    base_path = Path(__file__).parent
    success_count = 0
    
    for file_rel in files:
        file_path = base_path / file_rel
        if file_path.exists():
            if resolve_conflicts_keep_ours(file_path):
                success_count += 1
        else:
            print(f"File not found: {file_path}")
    
    print(f"\n{'='*60}")
    print(f"Resolved {success_count}/{len(files)} files")
    print(f"{'='*60}")
    
    return 0 if success_count == len(files) else 1

if __name__ == '__main__':
    sys.exit(main())
