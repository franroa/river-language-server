// Let's examine the actual brace structure
const testContent = `loki.process "test" {
  forward_to = []
  
  stage.labels {
    values = {
      level  = "level",
      method = "method",
      request_route_formated = "request_route_formated",
      status                 = "status",
      msg                    = "msg",
      app                    = "app",
      environment            = "environment",
      customer               = "customer",
    }
  }

  stage.structured_metadata {
    values = {
      msg_content = "msg",
      event_time  = "timestamp",
    }
  }
}`;

const lines = testContent.split('\n');

console.log('Brace structure analysis:');
lines.forEach((line, i) => {
  const openBraces = (line.match(/\{/g) || []).length;
  const closeBraces = (line.match(/\}/g) || []).length;
  if (openBraces > 0 || closeBraces > 0) {
    console.log(`Line ${i}: "${line}" -> +${openBraces} -${closeBraces}`);
  }
});

console.log('\nThe problem is in the block context detection algorithm:');
console.log('When we reach line 14 ("}"), it pops from the stack twice:');
console.log('- First "}" closes the values map (line 13)');
console.log('- Second "}" closes stage.labels (line 14)');
console.log('But the algorithm is incorrectly closing loki.process too!');

console.log('\nThe issue is that the algorithm pops from blockStack for EVERY closing brace,');
console.log('but it should only pop when a brace closes a BLOCK (not a map/array value).');

console.log('\nCorrect behavior should be:');
console.log('- Line 13: "}" closes values map -> no stack change (this is a value, not a block)');
console.log('- Line 14: "}" closes stage.labels -> pop stage.labels from stack');
console.log('- Line 16: stage.structured_metadata opens -> push to stack');
console.log('- Line 22: "}" closes loki.process -> pop loki.process from stack');