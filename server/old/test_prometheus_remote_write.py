#!/usr/bin/env python3
"""
Test script to specifically test prometheus.remote_write component scraping
"""

from scrape_components import AlloyComponentScraper

def test_prometheus_remote_write():
    scraper = AlloyComponentScraper()
    
    print("Testing prometheus.remote_write component scraping...")
    
    # Extract info for prometheus.remote_write specifically
    comp_info = scraper.extract_component_info('prometheus', 'prometheus.remote_write')
    
    print(f"\nComponent: {comp_info['name']}")
    print(f"Description: {comp_info['description']}")
    print(f"Arguments: {list(comp_info['arguments'].keys())}")
    print(f"Required attributes: {comp_info['required_attributes']}")
    print(f"Blocks found: {list(comp_info['blocks'].keys())}")
    
    for block_name, block_info in comp_info['blocks'].items():
        print(f"  Block '{block_name}': required={block_info.get('required', False)}")
        if block_info.get('properties'):
            for prop_name, prop_info in block_info['properties'].items():
                print(f"    Property '{prop_name}': required={prop_info.get('required', False)}")
    
    # Generate TypeScript for this component
    ts_content = scraper.generate_typescript_file('prometheus', [comp_info])
    
    # Write the test output
    with open('test_prometheus_output.ts', 'w') as f:
        f.write(ts_content)
    
    print(f"\nGenerated test output saved to test_prometheus_output.ts")
    
    # Show the snippet for prometheus.remote_write
    snippet = scraper._generate_component_snippet(comp_info)
    print(f"\nGenerated snippet for prometheus.remote_write:")
    print(f"```")
    print(snippet)
    print(f"```")

if __name__ == "__main__":
    test_prometheus_remote_write()