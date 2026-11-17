TODO List of Future Improvements
Here is the updated list of potential improvements, now including the performance and resource consumption ideas.

Testing Workflow
Scoped Testing: Modify the test runner to accept a component key and run only the test relevant to that specific component. This would require moving logs_input.log and logs_expected.log into their respective component-override directories, making the test suite faster and more modular.

"Golden File" Test Creation: Add a command that runs a test without an logs_expected.log file, captures the actual output from Loki, and then prompts the user: "Save this as the expected output? (y/n)". This would dramatically speed up the creation of new tests.

Result Diffing: When a test fails, provide a keymap (e.g., <leader>tdd for "Test Diff Details") that opens a vimdiff between the logs_expected.log and a temporary file containing the actual (failed) output from Loki.

UI & User Experience
Floating Windows: Convert the test runner's output and the main help window from splits to more modern floating windows for a less disruptive UI.

Notifications: Use vim.notify() for quick status updates like "Test started..." or "Diagram refreshed" instead of printing to the command line, which can be easily missed.

Performance and Resource Consumption
Smarter Caching: The current cache invalidates when any change is made to the buffer. An improvement would be to create a "structural" hash of the component definitions (ignoring comments and formatting). The pipeline would only be re-parsed if this hash changes, making it feel even more responsive.

Lazy Diagram Drawing: For extremely large files, the diagram drawing could be delayed until the window is actually visible or scrolled into view, reducing initial processing time.

Asynchronous Parsing: The parsing of the Alloy file (\_get_parsed_pipeline_data) could be moved to an asynchronous job. This would prevent any "hitching" or UI freezing in Neovim when opening very large or complex configuration files.

Resource Cleanup for Tests: Ensure the Docker container for Loki is not just stopped but also fully removed (docker rm) after tests to prevent dangling containers from consuming disk space over time. (The current script does this, but it's important to maintain).

Code Intelligence & LSP
Diagnostic Integration: Instead of just coloring the diagram, use Neovim's built-in diagnostic system (vim.diagnostic) to add an error directly to the loki.write component in the source code. The error message could be the rich feedback string: Test failed: 2 missing, 1 unexpected.

LSP CodeLens: A more advanced idea would be to integrate with an LSP to provide clickable "CodeLens" actions (e.g., Run Test | Edit Override) that appear as virtual text above component blocks in your .alloy file.

                      TODO List: Future Improvements

Here is the expanded list of possible future improvements for the toolkit.

Testing Workflow & DX
Scoped Testing: This is the highest-impact improvement. Modify the test runner to accept a component key and run only the test relevant to that specific component. This would require moving logs_input.log and logs_expected.log into their respective component-override directories, but would make testing individual components much faster.

"Golden File" Test Creation: Add a command that runs a test without an logs_expected.log file, captures the actual output from Loki, and then prompts the user: "Save this as the expected output? (y/n)". This would make creating new tests incredibly fast.

Result Diffing: When a test fails, provide a keymap (e.g., <leader>tdd for "Test Diff Details") that opens a vimdiff between the logs_expected.log and a temporary file containing the actual (failed) output from Loki. This would be invaluable for debugging complex log transformations.

Test Generation Wizard: Improve the <leader>te command. Instead of just creating a boilerplate file, it could be a wizard that asks for input logs and expected logs, generating all three test files automatically.

UI & User Experience
Floating Windows: Convert the test runner's log output and the main help window from splits to more modern floating windows for a less disruptive UI. A floating terminal could be used for the test runner.

More Granular Notifications: In debug mode, add more notifications for state changes, like when the cursor-follow is triggered or a diagram is about to be re-drawn.

Performance & Resource Consumption
Smarter Caching: The current cache invalidates when any change is made to the buffer (changedtick). An improvement would be to create a "structural" hash of the component definitions (ignoring comments, whitespace changes, and value changes). The pipeline would only be re-parsed if this hash changes (i.e., a block was added/removed/renamed), making it even more responsive.

Asynchronous Parsing: For extremely large files (>5000 lines), the parsing of the Alloy file (\_get_parsed_pipeline_data) could be moved to an asynchronous job using vim.loop.new_work to prevent any "hitching" or UI freezing in Neovim.

Debounced Icon Refresh: The automatic refresh of buffer icons on BufEnter and diagram creation is good, but for very rapid buffer switching, it could be debounced to prevent unnecessary file system scans.

Code Intelligence & LSP
Diagnostic Integration: Instead of only coloring the diagram, use Neovim's built-in diagnostic system (vim.diagnostic) to add an error directly to the loki.write component in the source code. The error message could be the rich feedback string: Test failed: 2 missing, 1 unexpected.

LSP CodeLens: A more advanced idea would be to integrate with an LSP to provide clickable "CodeLens" actions (e.g., Run Test | Edit Override) that appear as virtual text above component blocks in your .alloy file.

Configuration
User Configuration: Move hardcoded values (like the .alloy_tests directory name, Loki image, docker container name, etc.) into a user-configurable config table within one of the scripts, allowing users to easily change them without editing the core logic.

when jumping to the window with the horizontal pipeline, it should jump to the popup diagram, into the first box of the current selected pipeline, or to the first pipeline shown in the popup, if no pipeline is selected
