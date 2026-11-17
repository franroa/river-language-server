const { getCachedWorkspaceComponents } = require('./server/src/utils');

// Test component data loading
async function debugComponentData() {
    console.log('=== DEBUGGING COMPONENT DATA LOADING ===\n');

    try {
        const allComponentData = getCachedWorkspaceComponents({ all: () => [], keys: () => [] });

        console.log('Available components count:', Object.keys(allComponentData).length);
        console.log('Sample components:', Object.keys(allComponentData).slice(0, 10));

        if (allComponentData['prometheus.scrape']) {
            console.log('\n✅ prometheus.scrape found!');
            const componentData = allComponentData['prometheus.scrape'];
            console.log('Component data keys:', Object.keys(componentData));
            console.log('Has usage:', !!componentData.usage);
            console.log('Has lsp_structure:', !!componentData.lsp_structure);

            if (componentData.lsp_structure) {
                console.log('lsp_structure keys:', Object.keys(componentData.lsp_structure));
                console.log('Has arguments:', !!componentData.lsp_structure.arguments);
                console.log('Has blocks:', !!componentData.lsp_structure.blocks);
            }
        } else {
            console.log('\n❌ prometheus.scrape NOT found');
        }

    } catch (error) {
        console.error('Error loading component data:', error);
    }
}

debugComponentData();