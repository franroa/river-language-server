# Go-to-Definition Demo

This demonstrates the go-to-definition functionality added to the Alloy LSP.

## How it works

1. **Component References**: When you place your cursor on a component reference like:
   ```
   forward_to = [prometheus.remote_write.default.receiver]
                 ^-- cursor here
   ```

2. **Definition Search**: The LSP will:
   - Parse the component reference to extract `prometheus.remote_write` and `default`
   - Search for the definition: `prometheus.remote_write "default" { ... }`
   - First check the current document
   - Then search other .alloy files in the same folder

3. **Navigation**: The editor will navigate to the line where the component is defined.

## Test Files

- `test_definition_source.alloy` - Contains component definitions
- `test_definition_consumer.alloy` - Contains component references

## Example Usage

In `test_definition_consumer.alloy`, place your cursor on:
- `prometheus.remote_write.default` (line 6) → should navigate to `test_definition_source.alloy` line 3
- `prometheus.remote_write.backup` (line 13) → should navigate to `test_definition_source.alloy` line 9
- `loki.write.main` (line 20) → should navigate to `test_definition_source.alloy` line 15

## Implementation Details

The implementation includes:
- Pattern matching for component references (`component.type.label.receiver`)
- Cross-file search capability
- Proper position calculation using VSCode Language Server API
- Fallback to filesystem reading for unopened files