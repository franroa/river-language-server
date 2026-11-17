#!/usr/bin/env python3
"""
Test script to verify the enhanced scraper extracts nested block properties correctly
"""

import sys
import os
sys.path.append(os.path.dirname(__file__))

from scrape_components import AlloyComponentScraper
import json

def test_loki_relabel():
    """Test scraping loki.relabel component specifically"""
    scraper = AlloyComponentScraper()
    
    print("Testing enhanced scraper with loki.relabel...")
    
    # Extract just the loki.relabel component
    component_info = scraper.extract_component_info('loki', 'loki.relabel')
    
    if not component_info:
        print("❌ Failed to extract component info")
        return False
    
    print(f"✅ Successfully extracted component: {component_info['name']}")
    print(f"   Description: {component_info['description'][:100]}...")
    
    # Check if blocks were extracted
    if 'blocks' in component_info and component_info['blocks']:
        print(f"✅ Found {len(component_info['blocks'])} blocks:")
        for block_name, block_info in component_info['blocks'].items():
            print(f"   - {block_name}: {block_info.get('description', 'No description')}")
            
            # Check if block has properties
            if 'properties' in block_info and block_info['properties']:
                print(f"     Properties ({len(block_info['properties'])}):")
                for prop_name, prop_info in block_info['properties'].items():
                    print(f"       * {prop_name} ({prop_info.get('type', 'unknown')}) - {prop_info.get('description', 'No description')[:50]}...")
            else:
                print(f"     No properties found")
    else:
        print("❌ No blocks found")
    
    # Check specifically for 'rule' block and its properties
    if 'rule' in component_info.get('blocks', {}):
        rule_block = component_info['blocks']['rule']
        rule_props = rule_block.get('properties', {})
        
        expected_props = ['action', 'source_labels', 'target_label', 'regex', 'replacement', 'separator', 'modulus']
        found_props = list(rule_props.keys())
        
        print(f"\n🔍 Rule block analysis:")
        print(f"   Expected properties: {expected_props}")
        print(f"   Found properties: {found_props}")
        
        missing_props = set(expected_props) - set(found_props)
        extra_props = set(found_props) - set(expected_props)
        
        if not missing_props:
            print(f"✅ All expected properties found!")
        else:
            print(f"⚠️  Missing properties: {missing_props}")
            
        if extra_props:
            print(f"ℹ️  Extra properties found: {extra_props}")
    else:
        print("❌ 'rule' block not found")
    
    return True

if __name__ == "__main__":
    test_loki_relabel()