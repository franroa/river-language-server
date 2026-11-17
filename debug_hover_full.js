const { provideHover } = require('./server/out/hoverProvider');
const { getWordAtPosition } = require('./server/src/utils');

// Test content with prometheus.scrape
const content = `prometheus.scrape "metrics" {
	targets = []
	forward_to = []
}`;

console.log('=== FULL HOVER DEBUG ===\n');
console.log('Test content:');
console.log(content);
console.log('\n');

const document = {
    getText: () => content,
    positionAt: (offset) => ({ line: 0, character: offset }),
    uri: 'file://test_hover.alloy'
};

// Create mock documents map
const mockDocuments = {
    get: (uri) => uri === 'file://test_hover.alloy' ? document : undefined,
    all: () => [document],
    keys: () => ['file://test_hover.alloy'],
    listen: () => {},
    onDidChangeContent: () => {},
    onDidClose: () => {},
    onDidOpen: () => {},
    onDidSave: () => {},
    onWillSave: () => {},
};

// Test word detection at different positions
console.log('=== WORD DETECTION TEST ===');
const testPositions = [
    { line: 0, character: 0 }, // "p" in prometheus
    { line: 0, character: 10 }, // "." in prometheus.scrape
    { line: 0, character: 15 }, // "s" in scrape
];

for (const pos of testPositions) {
    const word = getWordAtPosition(document, pos);
    console.log(`Position (${pos.line}, ${pos.character}): "${word}"`);
}
console.log('\n');

// Test hover at prometheus.scrape position (line 0, character 0)
console.log('=== HOVER TEST ===');
const hoverParams = {
    textDocument: { uri: document.uri },
    position: { line: 0, character: 0 } // Position of "p" in prometheus
};

async function testHover() {
    try {
        console.log('Calling provideHover...');
        const hoverResult = await provideHover(hoverParams, mockDocuments);

        if (hoverResult) {
            console.log('✅ Hover result found!');
            console.log('Result structure:', Object.keys(hoverResult));

            if (hoverResult.contents) {
                console.log('Contents type:', typeof hoverResult.contents);

                if (hoverResult.contents.value) {
                    console.log('Contents preview (first 300 chars):');
                    console.log(hoverResult.contents.value.substring(0, 300) + '...');
                } else if (hoverResult.contents.kind) {
                    console.log('Contents kind:', hoverResult.contents.kind);
                    console.log('Contents:', hoverResult.contents);
                } else {
                    console.log('Contents:', hoverResult.contents);
                }
            }

            if (hoverResult.range) {
                console.log('Range:', hoverResult.range);
            }
        } else {
            console.log('❌ No hover result found');
        }
    } catch (error) {
        console.error('Error in hover test:', error);
        console.error('Stack trace:', error.stack);
    }
}

testHover();