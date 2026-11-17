#!/usr/bin/env python3
"""
Update just the prometheus category with the fixed scraper
"""

from scrape_components import AlloyComponentScraper
import os

def update_prometheus_components():
    scraper = AlloyComponentScraper()
    
    print("Processing prometheus category with improved scraper...")
    
    # Get components in prometheus category
    components_list = scraper.get_components_in_category('prometheus')
    print(f"Found prometheus components: {components_list}")
    
    # Extract detailed info for each component
    category_components = []
    for component_name in components_list:
        print(f"  Extracting info for: {component_name}")
        comp_info = scraper.extract_component_info('prometheus', component_name)
        if comp_info:
            category_components.append(comp_info)
            print(f"    Description: {comp_info['description'][:50]}...")
            print(f"    Required attributes: {comp_info['required_attributes']}")
            print(f"    Blocks: {list(comp_info['blocks'].keys())}")
            
            # Show block requirements
            for block_name, block_info in comp_info['blocks'].items():
                if block_info.get('required'):
                    print(f"      Required block: {block_name}")
    
    # Generate TypeScript file
    if category_components:
        ts_content = scraper.generate_typescript_file('prometheus', category_components)
        
        # Write to file
        output_file = "components/prometheus.ts"
        os.makedirs("components", exist_ok=True)
        
        with open(output_file, 'w', encoding='utf-8') as f:
            f.write(ts_content)
        
        print(f"\nGenerated: {output_file}")
        
        # Show the specific prometheus.remote_write snippet
        for comp in category_components:
            if comp['name'] == 'prometheus.remote_write':
                snippet = scraper._generate_component_snippet(comp)
                print(f"\nprometheus.remote_write snippet:")
                print(f"```")
                print(snippet.replace('\\n', '\n').replace('\\t', '\t'))
                print(f"```")
                break
    else:
        print("No prometheus components found!")

if __name__ == "__main__":
    update_prometheus_components()