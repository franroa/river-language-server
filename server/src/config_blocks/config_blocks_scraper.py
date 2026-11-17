#!/usr/bin/env python3
"""
Configuration blocks scraper for Grafana Alloy documentation.
Extracts configuration block structure, arguments, and creates LSP-compatible snippets.
Based on the refactored component scraper.
"""

import requests
from bs4 import BeautifulSoup, Tag
import re
import json
from typing import Dict, List, Any, Optional
from urllib.parse import urljoin, urlparse
import sys

class AlloyConfigBlockScraper:
    def __init__(self, base_url: str):
        self.base_url = base_url
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (compatible; AlloyConfigScraper/1.0)'
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

    def parse_config_blocks_index(self, html_content: str) -> List[Dict[str, str]]:
        """Parse the main configuration blocks index page to find all config blocks."""
        soup = BeautifulSoup(html_content, 'html.parser')
        config_blocks = []

        # Look for the main content area with config block links
        main_content = soup.find('main')
        if not main_content:
            main_content = soup.find('div', class_='content')
        if not main_content:
            main_content = soup

        # Find all links that point to configuration blocks
        if isinstance(main_content, Tag):
            for link in main_content.find_all('a', href=True):
                if isinstance(link, Tag):
                    href = link.get('href')
                    if href and isinstance(href, str):
                        # Check if this is a configuration block link
                        if '/config-blocks/' in href and not href.endswith('/config-blocks/'):
                            full_url = urljoin(self.base_url, href)
                            block_name = self.extract_block_name_from_url(href)
                            if block_name:
                                config_blocks.append({
                                    'name': block_name,
                                    'url': full_url,
                                    'title': link.get_text().strip()
                                })

        # Remove duplicates
        seen = set()
        unique_blocks = []
        for block in config_blocks:
            if block['name'] not in seen:
                seen.add(block['name'])
                unique_blocks.append(block)

        return unique_blocks

    def extract_block_name_from_url(self, url: str) -> Optional[str]:
        """Extract block name from URL path."""
        # Extract the last part of the path as the block name
        parts = url.strip('/').split('/')
        if parts and parts[-1]:
            return parts[-1]
        return None

    def parse_config_block_page(self, html_content: str, block_name: str) -> Dict[str, Any]:
        """Parse a configuration block documentation page."""
        soup = BeautifulSoup(html_content, 'html.parser')

        config_block_data = {
            'name': block_name,
            'title': self.extract_block_title(soup),
            'usage': self.extract_usage_block(soup),
            'arguments': self.extract_arguments_table(soup),
            'blocks': self.extract_blocks_table(soup),
            'examples': self.extract_examples(soup),
            'lsp_structure': {}
        }

        # Build LSP structure
        config_block_data['lsp_structure'] = self.build_lsp_structure(config_block_data)

        return config_block_data

    def extract_block_title(self, soup: BeautifulSoup) -> str:
        """Extract configuration block title from the page."""
        # Look for the main heading
        h1 = soup.find('h1')
        if h1 and isinstance(h1, Tag):
            return h1.get_text().strip()
        return "Unknown Configuration Block"

    def extract_usage_block(self, soup: BeautifulSoup) -> str:
        """Extract the usage code block."""
        # Look for code blocks that might contain usage examples
        code_blocks = soup.find_all('pre')
        
        for code_block in code_blocks:
            if isinstance(code_block, Tag):
                code_text = code_block.get_text().strip()
                # Check if this looks like a configuration block usage
                if '{' in code_text and '}' in code_text:
                    return code_text
        
        return ""

    def extract_arguments_table(self, soup: BeautifulSoup) -> List[Dict[str, Any]]:
        """Extract arguments table data."""
        arguments = []

        # Find tables that might contain arguments/properties
        tables = soup.find_all('table')
        
        for table in tables:
            if isinstance(table, Tag):
                # Check if this table contains argument-like information
                table_text = table.get_text().lower()
                if any(keyword in table_text for keyword in ['name', 'type', 'description', 'default', 'required']):
                    table_args = self.extract_table_arguments(table)
                    if table_args:
                        arguments.extend(table_args)

        return arguments

    def extract_table_arguments(self, table: Tag) -> List[Dict[str, Any]]:
        """Extract arguments from a specific table element."""
        arguments = []

        if not table or not hasattr(table, 'find_all'):
            return arguments

        rows = table.find_all('tr')
        if len(rows) < 2:  # Need header + at least one data row
            return arguments

        # Get header row to understand column structure
        header_row = rows[0]
        if isinstance(header_row, Tag):
            header_cells = header_row.find_all(['th', 'td'])
            header_texts = [cell.get_text().strip().lower() if isinstance(cell, Tag) else '' for cell in header_cells]

            # Find column indices
            name_col = next((i for i, h in enumerate(header_texts) if 'name' in h), 0)
            type_col = next((i for i, h in enumerate(header_texts) if 'type' in h), 1)
            desc_col = next((i for i, h in enumerate(header_texts) if 'description' in h), 2)
            default_col = next((i for i, h in enumerate(header_texts) if 'default' in h), 3)
            required_col = next((i for i, h in enumerate(header_texts) if 'required' in h), 4)

            # Skip header row, process data rows
            for row in rows[1:]:
                if isinstance(row, Tag):
                    cells = row.find_all(['td', 'th'])
                    if len(cells) >= 2:  # At least name and one other field
                        arg_data = {
                            'name': cells[name_col].get_text().strip() if name_col < len(cells) and isinstance(cells[name_col], Tag) else '',
                            'type': cells[type_col].get_text().strip() if type_col < len(cells) and isinstance(cells[type_col], Tag) else 'string',
                            'description': cells[desc_col].get_text().strip() if desc_col < len(cells) and isinstance(cells[desc_col], Tag) else '',
                            'default': cells[default_col].get_text().strip() if default_col < len(cells) and isinstance(cells[default_col], Tag) else '',
                            'required': required_col < len(cells) and isinstance(cells[required_col], Tag) and 'yes' in cells[required_col].get_text().lower()
                        }
                        if arg_data['name']:  # Only add if we have a name
                            arguments.append(arg_data)

        return arguments

    def extract_blocks_table(self, soup: BeautifulSoup) -> List[Dict[str, Any]]:
        """Extract nested blocks table data."""
        blocks = []

        # Find the Blocks section
        blocks_section = soup.find('h2', string='Blocks')
        if not blocks_section:
            # Try alternative headings
            blocks_section = soup.find('h2', string=re.compile(r'blocks?', re.I))

        if not blocks_section or not isinstance(blocks_section, Tag):
            return blocks

        # Find the table after the Blocks section
        table = blocks_section.find_next('table')
        if not table or not isinstance(table, Tag):
            return blocks

        # Parse table rows
        rows = table.find_all('tr')
        if len(rows) < 2:  # Need header + at least one data row
            return blocks

        # Skip header row, process data rows
        for row in rows[1:]:
            if isinstance(row, Tag):
                cells = row.find_all(['td', 'th'])
                if len(cells) >= 2:
                    block_name = cells[0].get_text().strip() if isinstance(cells[0], Tag) else ''

                    # Check if there's a link in the block name cell
                    block_url = None
                    if isinstance(cells[0], Tag):
                        link_element = cells[0].find('a')
                        if link_element and isinstance(link_element, Tag):
                            href = link_element.get('href')
                            if href and isinstance(href, str):
                                block_url = urljoin(self.base_url, href)

                    block_data = {
                        'block': block_name,
                        'description': cells[1].get_text().strip() if len(cells) > 1 and isinstance(cells[1], Tag) else '',
                        'required': len(cells) > 2 and isinstance(cells[2], Tag) and 'yes' in cells[2].get_text().lower(),
                        'url': block_url
                    }
                    blocks.append(block_data)

        return blocks

    def extract_examples(self, soup: BeautifulSoup) -> List[str]:
        """Extract code examples from the page."""
        examples = []
        
        # Look for example sections
        example_headings = soup.find_all(['h2', 'h3', 'h4'], string=re.compile(r'example', re.I))
        
        for heading in example_headings:
            if isinstance(heading, Tag):
                # Find code blocks after each example heading
                current_element = heading
                for _ in range(10):  # Look ahead up to 10 elements
                    current_element = current_element.find_next_sibling()
                    if not current_element:
                        break
                    
                    # Stop if we hit another heading of same or higher level
                    if isinstance(current_element, Tag) and current_element.name and current_element.name.startswith('h'):
                        heading_level = int(heading.name[1]) if heading.name else 2
                        current_level = int(current_element.name[1])
                        if current_level <= heading_level:
                            break
                    
                    # Collect code blocks
                    if isinstance(current_element, Tag) and current_element.name == 'pre':
                        example_text = current_element.get_text().strip()
                        if example_text:
                            examples.append(example_text)

        # Also look for standalone code blocks
        if not examples:
            code_blocks = soup.find_all('pre')
            for code_block in code_blocks:
                if isinstance(code_block, Tag):
                    code_text = code_block.get_text().strip()
                    if '{' in code_text and '}' in code_text and len(code_text.split('\n')) > 1:
                        examples.append(code_text)

        return examples

    def build_lsp_structure(self, config_block_data: Dict[str, Any]) -> Dict[str, Any]:
        """Build the LSP-compatible structure from extracted data."""
        structure = {
            'block_name': config_block_data['name'],
            'title': config_block_data['title'],
            'arguments': {},
            'blocks': {},
            'required_blocks': [],
            'examples': config_block_data.get('examples', [])
        }

        # Process arguments
        for arg in config_block_data['arguments']:
            structure['arguments'][arg['name']] = {
                'type': arg['type'],
                'description': arg['description'],
                'default': arg['default'],
                'required': arg['required']
            }

        # Process blocks
        for block in config_block_data['blocks']:
            block_name = block['block']
            structure['blocks'][block_name] = {
                'description': block['description'],
                'required': block['required'],
                'url': block.get('url')
            }

            if block['required']:
                structure['required_blocks'].append(block_name)

        return structure

    def generate_lsp_snippet(self, config_block_data: Dict[str, Any]) -> str:
        """Generate LSP-compatible snippet for configuration block."""
        structure = config_block_data['lsp_structure']
        block_name = structure['block_name']

        snippet_parts = []

        # Configuration block declaration
        snippet_parts.append(f'{block_name} {{')

        placeholder_counter = 1

        # Add required arguments first
        required_args = [
            arg_name for arg_name, arg_info in structure['arguments'].items()
            if arg_info.get('required', False)
        ]

        for arg_name in required_args:
            arg_info = structure['arguments'][arg_name]
            if arg_info.get('default'):
                snippet_parts.append(f'  {arg_name} = {arg_info["default"]}')
            else:
                snippet_parts.append(f'  {arg_name} = "${{{placeholder_counter}}}"')
                placeholder_counter += 1

        # Add required blocks
        for block_name_inner in structure['required_blocks']:
            block_info = structure['blocks'][block_name_inner]
            snippet_parts.append(f'  {block_name_inner} {{')
            snippet_parts.append(f'    ${{{placeholder_counter}}}')
            placeholder_counter += 1
            snippet_parts.append('  }')

        # Add optional arguments (commented out)
        optional_args = [
            arg_name for arg_name, arg_info in structure['arguments'].items()
            if not arg_info.get('required', False)
        ]

        if optional_args:
            snippet_parts.append('')
            snippet_parts.append('  // Optional arguments:')
            for arg_name in optional_args:
                arg_info = structure['arguments'][arg_name]
                default_val = arg_info.get('default', '""')
                snippet_parts.append(f'  // {arg_name} = {default_val}')

        # Add optional blocks (commented out)
        optional_blocks = [
            block_name_inner for block_name_inner, block_info in structure['blocks'].items()
            if not block_info.get('required', False)
        ]

        if optional_blocks:
            snippet_parts.append('')
            snippet_parts.append('  // Optional blocks:')
            for block_name_inner in optional_blocks:
                snippet_parts.append(f'  // {block_name_inner} {{')
                snippet_parts.append('  //   ...')
                snippet_parts.append('  // }')

        snippet_parts.append('}')

        return '\n'.join(snippet_parts)

    def scrape_all_config_blocks(self, index_url: str) -> Dict[str, Dict[str, Any]]:
        """Scrape all configuration blocks from the index page."""
        print(f"Fetching configuration blocks index from: {index_url}")
        
        html_content = self.fetch_page(index_url)
        if not html_content:
            print("Failed to fetch index page", file=sys.stderr)
            return {}

        config_blocks = self.parse_config_blocks_index(html_content)
        print(f"Found {len(config_blocks)} configuration blocks")

        all_blocks_data = {}

        for block_info in config_blocks:
            print(f"\nScraping {block_info['name']}...")
            
            block_html = self.fetch_page(block_info['url'])
            if not block_html:
                print(f"Failed to fetch {block_info['name']}")
                continue

            block_data = self.parse_config_block_page(block_html, block_info['name'])
            
            # Generate template
            template = self.generate_lsp_snippet(block_data)
            block_data['template'] = template

            all_blocks_data[block_info['name']] = block_data

            # Print summary
            print(f"  Title: {block_data['title']}")
            print(f"  Arguments: {len(block_data['arguments'])}")
            print(f"  Blocks: {len(block_data['blocks'])}")
            print(f"  Examples: {len(block_data['examples'])}")

        return all_blocks_data

    def save_all_blocks_data(self, all_blocks_data: Dict[str, Dict[str, Any]], output_file: str) -> None:
        """Save all configuration blocks data to JSON file."""
        with open(output_file, 'w', encoding='utf-8') as f:
            json.dump(all_blocks_data, f, indent=2, ensure_ascii=False)

def main():
    if len(sys.argv) < 2:
        print("Usage: python config_blocks_scraper.py <index_url> [output_file]")
        print("Example: python config_blocks_scraper.py https://grafana.com/docs/alloy/latest/reference/config-blocks/")
        sys.exit(1)

    index_url = sys.argv[1]
    output_file = sys.argv[2] if len(sys.argv) > 2 else "config_blocks_data.json"

    scraper = AlloyConfigBlockScraper(index_url)
    all_blocks_data = scraper.scrape_all_config_blocks(index_url)

    if all_blocks_data:
        # Save to file
        scraper.save_all_blocks_data(all_blocks_data, output_file)
        print(f"\nAll configuration blocks data saved to {output_file}")
        
        # Print summary
        print(f"\nSummary: Scraped {len(all_blocks_data)} configuration blocks")
        for block_name, block_data in all_blocks_data.items():
            print(f"  {block_name}: {block_data['title']}")
    else:
        print("No configuration blocks data extracted")
        sys.exit(1)

if __name__ == "__main__":
    main()