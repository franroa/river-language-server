#!/usr/bin/env python3
"""
Bulk scraper for Grafana Alloy components documentation.
Scrapes all components from the components page and processes each one.
"""

import requests
from bs4 import BeautifulSoup, Tag
import re
import subprocess
import sys
import os
from typing import List
from urllib.parse import urljoin

class BulkComponentScraper:
    def __init__(self, base_url: str = "https://grafana.com"):
        self.base_url = base_url
        self.session = requests.Session()
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (compatible; BulkAlloyScraper/1.0)'
        })

    def fetch_page(self, url: str) -> str:
        """Fetch page content with error handling."""
        try:
            response = self.session.get(url, timeout=30)
            response.raise_for_status()
            return response.text
        except Exception as e:
            print(f"Error fetching {url}: {e}", file=sys.stderr)
            return ""

    def extract_component_urls(self, html_content: str) -> List[str]:
        """Extract all component URLs from the components page."""
        soup = BeautifulSoup(html_content, 'html.parser')
        component_urls = []

        # Find all links that match the component pattern
        for link in soup.find_all('a'):
            if isinstance(link, Tag):
                href = link.get('href')
                if href and isinstance(href, str):
                    # Match URLs like /docs/alloy/latest/reference/components/.../
                    if re.match(r'/docs/alloy/latest/reference/components/[^/]+/[^/]+/?$', href):
                        full_url = urljoin(self.base_url, href)
                        if full_url not in component_urls:
                            component_urls.append(full_url)

        return sorted(component_urls)

    def scrape_component(self, component_url: str) -> bool:
        """Scrape a single component using the refactored_scraped.py script."""
        try:
            print(f"Scraping: {component_url}")
            # Run the refactored_scraped.py script with the component URL
            result = subprocess.run([
                sys.executable,
                os.path.join(os.path.dirname(__file__), 'refactored_scraped.py'),
                component_url
            ], capture_output=True, text=True, timeout=60)

            if result.returncode == 0:
                print(f"✓ Successfully scraped: {component_url}")
                return True
            else:
                print(f"✗ Failed to scrape: {component_url}")
                print(f"Error: {result.stderr}", file=sys.stderr)
                return False

        except subprocess.TimeoutExpired:
            print(f"✗ Timeout scraping: {component_url}")
            return False
        except Exception as e:
            print(f"✗ Error scraping {component_url}: {e}")
            return False

    def scrape_all_components(self) -> None:
        """Scrape all components from the components page."""
        components_page_url = "https://grafana.com/docs/alloy/latest/reference/components/"
        print(f"Fetching components page: {components_page_url}")

        html_content = self.fetch_page(components_page_url)
        if not html_content:
            print("Failed to fetch components page", file=sys.stderr)
            sys.exit(1)

        component_urls = self.extract_component_urls(html_content)
        print(f"Found {len(component_urls)} component URLs")

        if not component_urls:
            print("No component URLs found", file=sys.stderr)
            sys.exit(1)

        # Print all found URLs for verification
        print("\nComponent URLs to scrape:")
        for i, url in enumerate(component_urls, 1):
            print(f"{i:3d}. {url}")

        print(f"\nStarting bulk scraping of {len(component_urls)} components...\n")

        success_count = 0
        fail_count = 0

        for i, component_url in enumerate(component_urls, 1):
            print(f"[{i:3d}/{len(component_urls)}] ", end="")
            if self.scrape_component(component_url):
                success_count += 1
            else:
                fail_count += 1

        print("\nScraping completed!")
        print(f"Successful: {success_count}")
        print(f"Failed: {fail_count}")
        print(f"Total: {len(component_urls)}")

def main():
    if len(sys.argv) > 1:
        base_url = sys.argv[1]
        scraper = BulkComponentScraper(base_url)
    else:
        scraper = BulkComponentScraper()

    scraper.scrape_all_components()

if __name__ == "__main__":
    main()