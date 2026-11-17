#!/usr/bin/env python3
"""
Refactored scraper for Grafana Alloy OTLP receiver component documentation.
Extracts component structure, arguments, blocks, and creates LSP-compatible snippets.
"""

import requests
from bs4 import BeautifulSoup, Tag
import re
import json
from typing import Dict, List, Any, Optional
from urllib.parse import urljoin, urlparse
import sys

class AlloyComponentScraper:
    def __init__(self, base_url: str):
        self.base_url = base_url
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (compatible; AlloyScraper/1.0)'
        })

    def fetch_page(self, url: str) -> Optional[str]:
        """Fetch page content with error handling."""
        try:
            response = self.session.get(url, timeout=30)
            response.raise_for_status()
            return response.text
        except Exception as e:
            print(f"Error fetching {url}: {e}", file=sys.stderr)
            return None

    def parse_component_page(self, html_content: str) -> Dict[str, Any]:
        """Parse the component documentation page."""
        soup = BeautifulSoup(html_content, 'html.parser')

        component_data = {
            'name': self.extract_component_name(soup),
            'usage': self.extract_usage_block(soup),
            'arguments': self.extract_arguments_table(soup),
            'blocks': self.extract_blocks_table(soup),
            'lsp_structure': {}
        }

        # Build LSP structure
        component_data['lsp_structure'] = self.build_lsp_structure(component_data)

        return component_data

    def extract_component_name(self, soup: BeautifulSoup) -> str:
        """Extract component name from the page."""
        # Look for the main heading
        h1 = soup.find('h1')
        if h1:
            return h1.get_text().strip()
        return "Unknown Component"

    def extract_usage_block(self, soup: BeautifulSoup) -> str:
        """Extract the usage code block."""
        # Look for the usage section
        usage_section = soup.find('h2', string='Usage')
        if usage_section:
            # Find the next code block
            code_block = usage_section.find_next('pre')
            if code_block:
                return code_block.get_text().strip()
        return ""

    def extract_arguments_table(self, soup: BeautifulSoup) -> List[Dict[str, Any]]:
        """Extract arguments table data."""
        arguments = []

        # Find the Arguments section
        args_section = soup.find('h2', string='Arguments')
        if not args_section:
            return arguments

        # Find the table after the Arguments section
        table = args_section.find_next('table')
        if not table or not hasattr(table, 'find_all'):
            return arguments

        # Parse table rows
        if not isinstance(table, Tag):
            return arguments
        rows = table.find_all('tr')
        if len(rows) < 2:  # Need header + at least one data row
            return arguments

        # Skip header row, process data rows
        for row in rows[1:]:
            if not isinstance(row, Tag):
                continue
            cells = row.find_all(['td', 'th'])
            if len(cells) >= 4:
                arg_data = {
                    'name': cells[0].get_text().strip(),
                    'type': cells[1].get_text().strip(),
                    'description': cells[2].get_text().strip(),
                    'default': cells[3].get_text().strip() if len(cells) > 3 else '',
                    'required': len(cells) > 4 and 'yes' in cells[4].get_text().lower()
                }
                arguments.append(arg_data)

        return arguments

    def extract_blocks_table(self, soup: BeautifulSoup) -> List[Dict[str, Any]]:
        """Extract blocks table data."""
        blocks = []

        # Find the Blocks section
        blocks_section = soup.find('h2', string='Blocks')
        if not blocks_section:
            return blocks

        # Find the table after the Blocks section
        table = blocks_section.find_next('table')
        if not table or not hasattr(table, 'find_all'):
            return blocks

        # Parse table rows
        if not isinstance(table, Tag):
            return blocks
        rows = table.find_all('tr')
        if len(rows) < 2:  # Need header + at least one data row
            return blocks

        # Skip header row, process data rows
        for row in rows[1:]:
            if not isinstance(row, Tag):
                continue
            cells = row.find_all(['td', 'th'])
            if len(cells) >= 3:
                block_name = cells[0].get_text().strip()

                # Check if there's a link in the block name cell
                block_url = None
                if isinstance(cells[0], Tag):
                    link_element = cells[0].find('a')  # type: ignore
                    if link_element and isinstance(link_element, Tag):
                        href = link_element.get('href')  # type: ignore
                        if href and isinstance(href, str):
                            block_url = urljoin(self.base_url, href)

                block_data = {
                    'block': block_name,
                    'description': cells[1].get_text().strip(),
                    'required': 'yes' in cells[2].get_text().lower(),
                    'url': block_url
                }
                blocks.append(block_data)

        return blocks

    def extract_nested_block_info(self, block_url: str, block_name: str) -> Optional[Dict[str, Any]]:
        """Extract detailed information from a nested block's documentation page."""
        if not block_url:
            return None

        html_content = self.fetch_page(block_url)
        if not html_content:
            return None

        soup = BeautifulSoup(html_content, 'html.parser')

        # For nested blocks, we want to extract information specific to that block
        # Look for sections that match the block name
        nested_info = {
            'arguments': self.extract_block_arguments(soup, block_name),
            'blocks': self.extract_nested_blocks_only(soup, block_name),
            'usage': self.extract_usage_block(soup)
        }

        return nested_info

    def extract_block_arguments(self, soup: BeautifulSoup, block_name: str) -> List[Dict[str, Any]]:
        """Extract arguments specific to a block from its documentation page."""
        arguments = []

        # Find the specific section for this block
        block_section = None
        for heading in soup.find_all(['h2', 'h3', 'h4']):
            if isinstance(heading, Tag):
                heading_text = heading.get_text().strip().lower()
                # Look for headings that contain the block name
                # More flexible matching: check if block name is in heading
                if block_name.lower() in heading_text:
                    block_section = heading
                    break

        # If no specific section found, try to find any heading that might be related
        if not block_section:
            for heading in soup.find_all(['h2', 'h3', 'h4']):
                if isinstance(heading, Tag):
                    heading_text = heading.get_text().strip().lower()
                    # Look for headings that might contain block-related content
                    if any(keyword in heading_text for keyword in ['arguments', 'configuration', 'settings']):
                        block_section = heading
                        break

        if block_section:
            # Found the block's section, extract arguments from tables within this section
            current_element = block_section

            # Look for tables within this section (before the next heading of same or higher level)
            section_level = int(block_section.name[1])  # h2, h3, h4 -> 2, 3, 4
            tables_found = []

            for _ in range(20):  # Search within next 20 elements
                current_element = current_element.find_next_sibling()
                if not current_element:
                    break

                # Stop if we hit another heading of same or higher level
                if isinstance(current_element, Tag) and current_element.name.startswith('h') and int(current_element.name[1]) <= section_level:
                    break

                # Collect tables within this section
                if isinstance(current_element, Tag) and current_element.name == 'table':
                    tables_found.append(current_element)

            # Extract arguments from all tables found in this section
            for table in tables_found:
                table_args = self.extract_table_arguments(table)
                if table_args:
                    arguments.extend(table_args)

        # Special handling for output block - look for specific property tables
        if block_name == 'output' and not arguments:
            # Look for any table that contains output-specific properties
            for table in soup.find_all('table'):
                if isinstance(table, Tag):
                    table_text = table.get_text().lower()
                    if any(prop in table_text for prop in ['metrics', 'logs', 'traces']):
                        table_args = self.extract_table_arguments(table)
                        if table_args:
                            # Only include output-related properties
                            output_props = [arg for arg in table_args if arg['name'] in ['metrics', 'logs', 'traces']]
                            arguments.extend(output_props)

            # If still no arguments found, use hardcoded output properties
            if not arguments:
                arguments = [
                    {
                        'name': 'metrics',
                        'type': 'list(otelcol.Consumer)',
                        'description': 'List of consumers to send metrics to.',
                        'default': '[]',
                        'required': False
                    },
                    {
                        'name': 'logs',
                        'type': 'list(otelcol.Consumer)',
                        'description': 'List of consumers to send logs to.',
                        'default': '[]',
                        'required': False
                    },
                    {
                        'name': 'traces',
                        'type': 'list(otelcol.Consumer)',
                        'description': 'List of consumers to send traces to.',
                        'default': '[]',
                        'required': False
                    }
                ]

        return arguments

    def extract_table_arguments(self, table: Tag) -> List[Dict[str, Any]]:
        """Extract arguments from a specific table element."""
        arguments = []

        if not table or not hasattr(table, 'find_all'):
            return arguments

        rows = table.find_all('tr')
        if len(rows) < 2:  # Need header + at least one data row
            return arguments

        # Skip header row, process data rows
        for row in rows[1:]:
            if not isinstance(row, Tag):
                continue
            cells = row.find_all(['td', 'th'])
            if len(cells) >= 3:
                arg_data = {
                    'name': cells[0].get_text().strip(),
                    'type': cells[1].get_text().strip() if len(cells) > 1 else 'string',
                    'description': cells[2].get_text().strip() if len(cells) > 2 else '',
                    'default': cells[3].get_text().strip() if len(cells) > 3 else '',
                    'required': len(cells) > 4 and 'yes' in cells[4].get_text().lower()
                }
                arguments.append(arg_data)

        return arguments

    def extract_nested_blocks_only(self, soup: BeautifulSoup, parent_block: str) -> List[Dict[str, Any]]:
        """Extract only blocks that are children of the specified parent block."""
        blocks = []

        # Find the Blocks section
        blocks_section = soup.find('h2', string='Blocks')
        if not blocks_section:
            return blocks

        # Find the table after the Blocks section
        table = blocks_section.find_next('table')
        if not table or not hasattr(table, 'find_all'):
            return blocks

        # Parse table rows
        if not isinstance(table, Tag):
            return blocks
        rows = table.find_all('tr')
        if len(rows) < 2:  # Need header + at least one data row
            return blocks

        # Skip header row, process data rows
        for row in rows[1:]:
            if not isinstance(row, Tag):
                continue
            cells = row.find_all(['td', 'th'])
            if len(cells) >= 3:
                block_name = cells[0].get_text().strip()

                # Only include blocks that are children of the parent block
                # Skip the parent block itself and top-level blocks
                if ' > ' in block_name and block_name.startswith(parent_block + ' > '):
                    # Extract the child part (everything after "parent > ")
                    child_part = block_name[len(parent_block) + 3:]  # +3 for " > "

                    # Check if there's a link in the block name cell
                    link_element = None
                    if isinstance(cells[0], Tag):
                        link_element = cells[0].find('a')  # type: ignore

                    block_url = None
                    if link_element and isinstance(link_element, Tag):
                        href = link_element.get('href')  # type: ignore
                        if href and isinstance(href, str):
                            block_url = urljoin(self.base_url, href)

                    block_data = {
                        'block': child_part,  # Use just the child part
                        'description': cells[1].get_text().strip(),
                        'required': 'yes' in cells[2].get_text().lower(),
                        'url': block_url
                    }
                    blocks.append(block_data)

        return blocks

    def build_lsp_structure(self, component_data: Dict[str, Any]) -> Dict[str, Any]:
        """Build the LSP-compatible structure from extracted data."""
        structure = {
            'component': component_data['name'],
            'arguments': {},
            'blocks': {},
            'required_blocks': [],
            'conditional_blocks': {}
        }

        # Process arguments
        for arg in component_data['arguments']:
            structure['arguments'][arg['name']] = {
                'type': arg['type'],
                'description': arg['description'],
                'default': arg['default'],
                'required': arg['required']
            }

        # Process blocks and build hierarchy
        block_hierarchy = {}

        for block in component_data['blocks']:
            block_path = block['block']
            parts = block_path.split(' > ')

            if block['required']:
                structure['required_blocks'].append(block_path)

            # Build nested structure
            current_level = block_hierarchy
            for i, part in enumerate(parts):
                if part not in current_level:
                    current_level[part] = {
                        'description': block['description'] if i == len(parts) - 1 else '',
                        'required': block['required'] if i == len(parts) - 1 else False,
                        'children': {}
                    }

                    # If this block has a URL, extract nested information
                    if i == len(parts) - 1 and block.get('url'):
                        nested_info = self.extract_nested_block_info(block['url'], block_path)
                        if nested_info:
                            current_level[part]['arguments'] = nested_info['arguments']
                            current_level[part]['nested_blocks'] = nested_info['blocks']
                            current_level[part]['usage'] = nested_info['usage']

                current_level = current_level[part]['children']

        structure['blocks'] = block_hierarchy

        # Identify conditional blocks (blocks that are required only if parent exists)
        self.identify_conditional_blocks(structure)

        return structure

    def identify_conditional_blocks(self, structure: Dict[str, Any]) -> None:
        """Identify blocks that are conditionally required."""
        conditional_blocks = {}

        def traverse_blocks(blocks, parent_path=""):
            for block_name, block_info in blocks.items():
                current_path = f"{parent_path}.{block_name}" if parent_path else block_name

                if block_info.get('children'):
                    # If this block has children, check if any children are required
                    has_required_children = any(
                        child_info.get('required', False)
                        for child_info in block_info['children'].values()
                    )

                    if has_required_children:
                        required_children = [
                            child_name for child_name, child_info in block_info['children'].items()
                            if child_info.get('required', False)
                        ]
                        conditional_blocks[current_path] = {
                            'condition': f"when {block_name} block is present",
                            'required_children': required_children
                        }

                    # Recurse into children
                    traverse_blocks(block_info['children'], current_path)

        traverse_blocks(structure['blocks'])
        structure['conditional_blocks'] = conditional_blocks

    def generate_lsp_snippet(self, component_data: Dict[str, Any]) -> str:
        """Generate LSP-compatible snippet with nested block support."""
        structure = component_data['lsp_structure']

        snippet_parts = []

        # Component declaration
        snippet_parts.append(f'{structure["component"]} "${{1:default}}" {{')

        # Add required blocks with nested structure
        for required_block in structure['required_blocks']:
            if ' > ' not in required_block:  # Top-level required block
                self.add_block_with_nested(snippet_parts, structure['blocks'], required_block, "  ")

        # Add optional blocks with nested structure
        def add_optional_blocks(blocks, indent="  "):
            for block_name, block_info in blocks.items():
                if not block_info.get('required', False):
                    self.add_block_with_nested(snippet_parts, blocks, block_name, indent)

        add_optional_blocks(structure['blocks'])

        snippet_parts.append('}')

        return '\n'.join(snippet_parts)

    def add_block_with_nested(self, snippet_parts: List[str], blocks: Dict[str, Any],
                            block_name: str, indent: str) -> None:
        """Add a block with its nested structure to the snippet."""
        if block_name not in blocks:
            return

        block_info = blocks[block_name]
        snippet_parts.append(f'{indent}{block_name} {{')

        # Add block-specific arguments/properties
        if block_name == 'output':
            # Hardcoded output block properties (most common and important)
            output_props = ['metrics', 'logs', 'traces']
            for prop in output_props:
                snippet_parts.append(f'{indent}  {prop} = []')
        elif block_info.get('arguments'):
            for i, arg in enumerate(block_info['arguments']):
                arg_name = arg['name']
                if arg_name == 'endpoint' and block_name in ['grpc', 'http']:
                    # Use appropriate default endpoints
                    default_endpoint = "0.0.0.0:4317" if block_name == 'grpc' else "0.0.0.0:4318"
                    snippet_parts.append(f'{indent}  {arg_name} = "{default_endpoint}"')
                elif arg.get('required', False):
                    # For other required arguments, add with placeholder
                    if arg.get('default', '').strip():
                        snippet_parts.append(f'{indent}  {arg_name} = {arg["default"]}')
                    else:
                        snippet_parts.append(f'{indent}  {arg_name} = "${{{i + 2}}}"')

        # Add nested blocks recursively
        if block_info.get('children'):
            self.add_nested_children(snippet_parts, block_info['children'], indent + "  ")

        # Add placeholder for additional content if no arguments or children
        if not block_info.get('arguments') and not block_info.get('children'):
            snippet_parts.append(f'{indent}  $0')

        snippet_parts.append(f'{indent}}}')

    def add_nested_children(self, snippet_parts: List[str], children: Dict[str, Any], indent: str) -> None:
        """Recursively add nested children blocks."""
        for child_name, child_info in children.items():
            if child_info.get('required', False):
                snippet_parts.append(f'{indent}{child_name} {{')
                if child_info.get('children'):
                    self.add_nested_children(snippet_parts, child_info['children'], indent + "  ")
                else:
                    snippet_parts.append(f'{indent}  $0')
                snippet_parts.append(f'{indent}}}')

    def save_component_data(self, component_data: Dict[str, Any], output_file: str) -> None:
        """Save component data to JSON file."""
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(component_data, f, indent=2, ensure_ascii=False)

def main():
    if len(sys.argv) != 2:
        print("Usage: python refactored_scraped.py <component_url>")
        sys.exit(1)

    component_url = sys.argv[1]

    scraper = AlloyComponentScraper(component_url)
    html_content = scraper.fetch_page(component_url)

    if not html_content:
        print("Failed to fetch page content", file=sys.stderr)
        sys.exit(1)

    component_data = scraper.parse_component_page(html_content)

    # Generate template from the LSP snippet
    template = scraper.generate_lsp_snippet(component_data)
    component_data['template'] = template

    # Print extracted data
    print("Component Name:", component_data['name'])
    print("\nUsage:")
    print(component_data['usage'])
    print("\nArguments:")
    for arg in component_data['arguments']:
        print(f"  - {arg['name']} ({arg['type']}): {arg['description']}")
    print("\nBlocks:")
    for block in component_data['blocks']:
        print(f"  - {block['block']}: {block['description']} ({'Required' if block['required'] else 'Optional'})")
        if block.get('url'):
            print(f"    URL: {block['url']}")

    print("\nLSP Structure:")
    print(json.dumps(component_data['lsp_structure'], indent=2))

    print("\nGenerated LSP Template:")
    print(template)

    # Save to file
    output_file = component_data['name'].replace('.', '_') + ".json"
    scraper.save_component_data(component_data, output_file)
    print(f"\nComponent data saved to {output_file}")

if __name__ == "__main__":
    main()
