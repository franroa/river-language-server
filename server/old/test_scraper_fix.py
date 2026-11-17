#!/usr/bin/env python3
"""
Test script to verify that the scraper correctly identifies required fields
"""

from scrape_components import AlloyComponentScraper

def test_loki_rules_kubernetes():
    """Test scraping of loki.rules.kubernetes component"""
    scraper = AlloyComponentScraper()
    
    # Extract info for just this component
    comp_info = scraper.extract_component_info('loki', 'loki.rules.kubernetes')
    
    print(f"Component: {comp_info['name']}")
    print(f"Description: {comp_info['description']}")
    print(f"Arguments found: {list(comp_info['arguments'].keys())}")
    print(f"Required attributes: {comp_info['required_attributes']}")
    
    # Check if 'address' is properly identified as required
    if 'address' in comp_info['arguments']:
        address_arg = comp_info['arguments']['address']
        print(f"Address argument: {address_arg}")
        if address_arg['required']:
            print("✅ SUCCESS: 'address' is correctly identified as required")
        else:
            print("❌ FAILED: 'address' should be required but is marked as optional")
    else:
        print("❌ FAILED: 'address' argument not found at all")
    
    return comp_info

if __name__ == "__main__":
    test_loki_rules_kubernetes()