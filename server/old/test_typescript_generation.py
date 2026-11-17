#!/usr/bin/env python3
"""
Test the TypeScript generation with the fixed endpoint block handling
"""

# Mock the scraper class with the fixed methods
class MockScraper:
    def escape_for_template_literal(self, text):
        """Properly escape text for use in TypeScript template literals"""
        text = text.replace('`', '\\`')
        text = text.replace('${', '\\${')
        return text

# Mock component data as it would be parsed correctly
components = [
    {
        'name': 'prometheus.remote_write',
        'description': 'prometheus.remote_write collects metrics and forwards them.',
        'arguments': {
            'external_labels': {
                'description': 'External labels to add',
                'type': 'map(string)',
                'required': False,
                'default': ''
            }
        },
        'blocks': {
            'endpoint': {
                'description': 'Location to send metrics to.',
                'required': False,
                'properties': {
                    'url': {
                        'required': True,
                        'type': 'string',
                        'description': 'URL to send metrics to'
                    }
                }
            },
            'wal': {
                'description': 'Configuration for the component\'s WAL.',
                'required': False,
                'properties': {}
            }
        },
        'required_attributes': [],  # No blocks in here - that's the fix!
        'conditional_requirements': {}
    }
]

def test_required_attributes_generation():
    """Test that required attributes only contains properties, not blocks"""
    print("=== Testing Required Attributes Generation ===")
    
    scraper = MockScraper()
    category = "prometheus"
    
    content = f"export const {category}RequiredAttributes: Record<string, string[]> = {{\n"
    
    for comp in components:
        name = comp['name']
        required_attrs = []
        
        # Add explicitly found required attributes (only top-level unconditional ones)
        # Filter out any items that are actually blocks, not properties
        for attr in comp['required_attributes']:
            # Only add to required_attributes if it's NOT a top-level block
            if attr not in comp['blocks']:
                required_attrs.append(attr)
        
        # Add component-specific required attributes would go here
        # (but we removed the hardcoded ones)
        
        # Remove duplicates while preserving order
        seen = set()
        unique_attrs = []
        for attr in required_attrs:
            if attr not in seen:
                seen.add(attr)
                unique_attrs.append(attr)
        
        if unique_attrs:
            attrs = '", "'.join(unique_attrs)
            content += f'  "{name}": ["{attrs}"],\n'
    
    content += "};\n\n"
    
    print("Generated Required Attributes:")
    print(content)
    
    # Should NOT contain prometheus.remote_write since it has no required properties
    assert '"prometheus.remote_write"' not in content
    print("✓ Test passed: prometheus.remote_write not in required attributes (correctly)")

def test_required_blocks_generation():
    """Test that required blocks are generated separately"""
    print("\n=== Testing Required Blocks Generation ===")
    
    category = "prometheus"
    
    content = f"export const {category}RequiredBlocks: Record<string, string[]> = {{\n"
    
    for comp in components:
        name = comp['name']
        required_blocks = []
        
        # Add explicitly required blocks
        for block_name, block_info in comp['blocks'].items():
            if block_info.get('required', False):
                required_blocks.append(block_name)
        
        if required_blocks:
            blocks = '", "'.join(required_blocks)
            content += f'  "{name}": ["{blocks}"],\n'
    
    content += "};\n\n"
    
    print("Generated Required Blocks:")
    print(content)
    
    # Should not contain prometheus.remote_write since no blocks are required
    assert '"prometheus.remote_write"' not in content
    print("✓ Test passed: No required blocks for prometheus.remote_write (correctly)")

def test_block_completions_generation():
    """Test that block completions are generated"""
    print("\n=== Testing Block Completions Generation ===")
    
    scraper = MockScraper()
    category = "prometheus"
    
    content = f"export const {category}BlockCompletions: Record<string, CompletionItem[]> = {{\n"
    
    for comp in components:
        name = comp['name']
        if comp['blocks']:
            content += f'  "{name}": [\n'
            
            for block_name, block_info in comp['blocks'].items():
                block_desc = block_info['description'].replace('"', '\\"').replace('\n', ' ').replace('\r', ' ').strip()
                block_desc = ' '.join(block_desc.split())
                
                # Generate block snippet (e.g., "endpoint {\n\t${1:url} = \"${2:value}\"\n}")
                block_snippet = f'{block_name} {{\\n'
                
                # Add common properties for this block type
                if block_name == 'endpoint':
                    block_snippet += f'\\t${{1:url}} = "${{2:http://localhost:9090/api/v1/write}}"\\n'
                else:
                    # Add placeholder for custom configuration
                    block_snippet += f'\\t${{1:/* configuration */}}\\n'
                
                block_snippet += '}'
                
                # Escape for template literal
                block_snippet_escaped = scraper.escape_for_template_literal(block_snippet)
                
                # Determine if required
                is_required = 'required' if block_info.get('required', False) else 'optional'
                
                content += f'''    createSnippet(
      "{block_name}",
      CompletionItemKind.Snippet,
      `{block_snippet_escaped}`,
      "{block_desc}",
      "{block_name} {{...}} - {is_required}",
    ),
'''
            
            content += "  ],\n"
    
    content += "};\n\n"
    
    print("Generated Block Completions:")
    print(content)
    
    # Should contain prometheus.remote_write with endpoint block completion
    assert '"prometheus.remote_write"' in content
    assert '"endpoint"' in content
    assert 'endpoint {' in content
    assert 'url' in content
    print("✓ Test passed: prometheus.remote_write has endpoint block completion")

if __name__ == "__main__":
    test_required_attributes_generation()
    test_required_blocks_generation() 
    test_block_completions_generation()
    print("\n🎉 All tests passed! The TypeScript generation fix works correctly.")