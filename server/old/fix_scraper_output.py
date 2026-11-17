#!/usr/bin/env python3
"""
Fix scraper output by copying files from components/ to aux_component/ 
and updating the export structure to match LSP expectations.
"""

import os
import shutil
import glob

def copy_generated_files():
    """Copy generated TypeScript files from components/ to aux_component/"""
    source_dir = "components"
    target_dir = "aux_component"
    
    if not os.path.exists(source_dir):
        print(f"Source directory {source_dir} not found")
        return
    
    os.makedirs(target_dir, exist_ok=True)
    
    # Get all .ts files from components directory
    ts_files = glob.glob(os.path.join(source_dir, "*.ts"))
    
    for ts_file in ts_files:
        filename = os.path.basename(ts_file)
        target_file = os.path.join(target_dir, filename)
        
        print(f"Copying {ts_file} -> {target_file}")
        shutil.copy2(ts_file, target_file)
    
    print(f"Copied {len(ts_files)} TypeScript files to {target_dir}")

def update_exports():
    """Update the main exports to include the missing exports that the LSP expects"""
    index_file = "aux_component/index.ts"
    
    if not os.path.exists(index_file):
        print(f"Index file {index_file} not found")
        return
    
    with open(index_file, 'r') as f:
        content = f.read()
    
    # Add missing exports that the LSP componentData.ts expects
    missing_exports = [
        "export const allBlockCompletions = {};",
        "export const allNestedBlockProperties = {};", 
        "export const requiredBlocks = {};",
    ]
    
    # Check if exports are already present
    for export_line in missing_exports:
        if export_line.split('=')[0].strip() not in content:
            content += "\n" + export_line + "\n"
            print(f"Added missing export: {export_line.split('=')[0].strip()}")
    
    with open(index_file, 'w') as f:
        f.write(content)
    
    print("Updated exports in index.ts")

def main():
    print("Fixing scraper output...")
    copy_generated_files()
    update_exports() 
    print("Done!")

if __name__ == "__main__":
    main()