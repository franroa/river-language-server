#!/usr/bin/env python3
"""
Test script to debug the scraper issues
"""

import sys
sys.path.append('/home/froa/Projects/alloy/river_lsp/server/src')

from scrape_components import AlloyComponentScraper

def test_escaping():
    """Test the escaping functions"""
    scraper = AlloyComponentScraper()
    
    # Test cases that might break
    test_strings = [
        'Simple text',
        'Text with "quotes"',
        "Text with 'single quotes'",
        'Text with ${placeholder}',
        'Text with `backticks`',
        'Text with\nnewlines',
        'Text with\tTabs',
        'Text with\\backslashes',
        'Mixed: "quotes" and ${placeholders} and `backticks`',
        ''  # Empty string
    ]
    
    print("Testing escape_for_string_literal:")
    for text in test_strings:
        try:
            escaped = scraper.escape_for_string_literal(text)
            print(f"  '{text}' -> '{escaped}'")
        except Exception as e:
            print(f"  ERROR with '{text}': {e}")
    
    print("\nTesting escape_for_template_literal:")
    for text in test_strings:
        try:
            escaped = scraper.escape_for_template_literal(text)
            print(f"  '{text}' -> '{escaped}'")
        except Exception as e:
            print(f"  ERROR with '{text}': {e}")

def test_component_generation():
    """Test generating a simple component"""
    scraper = AlloyComponentScraper()
    
    # Create a test component
    test_comp = {
        'name': 'test.component',
        'category': 'test', 
        'description': 'A test component with "quotes" and ${placeholders}',
        'arguments': {
            'url': {
                'description': 'URL endpoint with "quotes"',
                'type': 'string',
                'required': True,
                'default': ''
            },
            'enabled': {
                'description': 'Enable the component',
                'type': 'bool',
                'required': False,
                'default': 'true'
            }
        },
        'blocks': {
            'endpoint': {
                'description': 'Endpoint configuration with ${placeholders}',
                'required': True,
                'properties': {
                    'url': {
                        'type': 'string',
                        'description': 'The URL to connect to',
                        'required': True,
                        'default': ''
                    }
                }
            }
        },
        'required_attributes': ['url'],
        'conditional_requirements': {},
        'exports': {}
    }
    
    try:
        print("Generating TypeScript for test component...")
        ts_content = scraper.generate_typescript_file('test', [test_comp])
        
        # Write to test file
        with open('/home/froa/Projects/alloy/river_lsp/server/test_output.ts', 'w', encoding='utf-8') as f:
            f.write(ts_content)
        
        print("Test TypeScript file written to test_output.ts")
        print(f"Generated content length: {len(ts_content)} characters")
        
        # Show first 500 chars
        print("First 500 characters of generated content:")
        print(ts_content[:500])
        print("...")
        
    except Exception as e:
        print(f"ERROR generating TypeScript: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    print("=== Testing Escaping Functions ===")
    test_escaping()
    
    print("\n=== Testing Component Generation ===")
    test_component_generation()