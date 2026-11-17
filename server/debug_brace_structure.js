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
    console.log(`Line ${i}: "${line}" -> +${openBraces} -{closeBraces}`);
  }
});

console.log('\nExpected structure:');
console.log('Line 0: loki.process { (opens loki.process)');
console.log('Line 3: stage.labels { (opens stage.labels)');
console.log('Line 4: values = { (opens values map)');
console.log('Line 13: } (closes values map)');
console.log('Line 14: } (closes stage.labels)');
console.log('Line 16: stage.structured_metadata { (opens stage.structured_metadata)');
console.log('Line 17: values = { (opens values map)');
console.log('Line 20: } (closes values map)');  
console.log('Line 21: } (closes stage.structured_metadata)');
console.log('Line 22: } (closes loki.process)');

console.log('\nCounting total braces:');
let total = 0;
lines.forEach((line, i) => {
  const openBraces = (line.match(/\{/g) || []).length;
  const closeBraces = (line.match(/\}/g) || []).length;
  total += openBraces - closeBraces;
  if (openBraces > 0 || closeBraces > 0) {
    console.log(`Line ${i}: total depth = ${total}`);
  }
});