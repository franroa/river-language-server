#!/usr/bin/env python3
"""
Patch the scraper to fix the required vs recommended logic
"""

def patch_scraper_logic():
    """Patch the scraper file to fix the required vs recommended logic"""
    
    # Read the original file
    with open('scrape_components.py', 'r') as f:
        content = f.read()
    
    # The key issue is in lines around 492-508 where blocks found in usage are marked as required
    # We need to change this logic to mark them as recommended instead
    
    old_block_logic = '''                    # If we see it in usage, determine if it's required or recommended
                    if current_block not in info['blocks']:
                        info['blocks'][current_block] = {
                            'description': f'Configuration block for {current_block}',
                            'required': not is_commented,  # If commented out, it's recommended, not required
                            'properties': {}
                        }
                        status = "recommended" if is_commented else "required"
                        print(f"    Found new usage block: {current_block} (marked as {status})")
                    else:
                        # Override documentation based on usage context
                        if not is_commented:
                            info['blocks'][current_block]['required'] = True
                            print(f"    Found existing usage block: {current_block} (marked as required)")
                        else:
                            # If it's commented out, keep it as optional/recommended
                            info['blocks'][current_block]['required'] = False
                            print(f"    Found existing usage block: {current_block} (kept as recommended)")'''
    
    new_block_logic = '''                    # CORRECTED LOGIC: Usage examples show recommended blocks, not required
                    if current_block not in info['blocks']:
                        info['blocks'][current_block] = {
                            'description': f'Configuration block for {current_block}',
                            'required': False,  # Usage examples show recommended, not required
                            'recommended': True,  # Mark as recommended
                            'properties': {}
                        }
                        print(f"    Found new usage block: {current_block} (marked as recommended)")
                    else:
                        # Block exists from docs - don't override required status
                        # But mark as recommended since it appears in usage
                        if not info['blocks'][current_block].get('required', False):
                            info['blocks'][current_block]['recommended'] = True
                            print(f"    Found existing usage block: {current_block} (marked as recommended)")
                        else:
                            print(f"    Found existing usage block: {current_block} (keeping required from docs)")'''
    
    # Apply the patch
    if old_block_logic in content:
        content = content.replace(old_block_logic, new_block_logic)
        print("✓ Patched block logic to mark usage blocks as recommended")
    else:
        print("✗ Could not find block logic to patch")
    
    # Also need to update property logic to mark as recommended when not already required
    old_property_logic = '''                            # New property found only in usage examples - mark as recommended
                            info['blocks'][current_block]['properties'][prop_match] = {
                                'required': False,  # Usage examples show recommended properties, not required
                                'recommended': True,  # Mark as recommended instead of required
                                'type': prop_type,
                                'description': f'{prop_match} configuration'
                            }'''
    
    new_property_logic = '''                            # New property found only in usage examples - mark as recommended
                            info['blocks'][current_block]['properties'][prop_match] = {
                                'required': False,  # Usage examples show recommended properties
                                'recommended': True,  # Mark as recommended
                                'type': prop_type,
                                'description': f'{prop_match} configuration'
                            }'''
    
    # The property logic is already correct, so we don't need to change it
    
    # Write the patched file
    with open('scrape_components_patched.py', 'w') as f:
        f.write(content)
    
    print("✓ Created patched scraper file: scrape_components_patched.py")

if __name__ == "__main__":
    patch_scraper_logic()