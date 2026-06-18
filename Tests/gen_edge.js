const fs = require('fs');

// Edge case 1: Single primitive top-level values
fs.writeFileSync('edge_string.json', '"hello world"');
fs.writeFileSync('edge_number.json', '42');
fs.writeFileSync('edge_null.json', 'null');
fs.writeFileSync('edge_bool.json', 'true');

// Edge case 2: Keys with dots, brackets, special chars (path confusion)
const test_keys = {
  'a.b.c': 'dot in key',
  '[0]': 'bracket key',
  'key"quote': 'quote in key',
  '<script>alert(1)</script>': 'xss attempt',
  'data-ln': '999',
  'data-path': 'fake/path',
  'class': 'j-line',
  '': 'empty key',
  ' ': 'space key',
  '\\n\\t': 'escape chars'
};
fs.writeFileSync('edge_special_keys.json', JSON.stringify(test_keys, null, 4));

// Edge case 3: Deeply nested (50 levels) - stack depth test
let deep = 'deep_value';
for (let i = 0; i < 50; i++) { deep = { ['level' + i]: deep }; }
fs.writeFileSync('edge_deep_nest.json', JSON.stringify(deep, null, 4));

// Edge case 4: Array with 200 items where items 100+ are primitives (chunked primitives)
const mixedArr = [];
for (let i = 0; i < 200; i++) {
  if (i < 50) mixedArr.push({ id: i, val: 'obj' });
  else if (i < 100) mixedArr.push([i, i+1]);
  else if (i < 150) mixedArr.push(i);
  else if (i < 175) mixedArr.push(null);
  else mixedArr.push('str_' + i);
}
fs.writeFileSync('edge_chunked_mixed.json', JSON.stringify(mixedArr, null, 4));

// Edge case 5: Object with 200+ keys (not an array, no chunking)
const bigObj = {};
for (let i = 0; i < 250; i++) { bigObj['key_' + String(i).padStart(3, '0')] = i % 3 === 0 ? { nested: i } : i; }
fs.writeFileSync('edge_big_object.json', JSON.stringify(bigObj, null, 4));

// Edge case 6: Array containing mix of empty/non-empty at chunk boundary
const boundaryArr = [];
for (let i = 0; i < 110; i++) {
  if (i === 99 || i === 100 || i === 101) boundaryArr.push({});
  else if (i % 10 === 0) boundaryArr.push([]);
  else boundaryArr.push({ x: i, arr: i % 5 === 0 ? [] : [i] });
}
fs.writeFileSync('edge_chunk_boundary.json', JSON.stringify(boundaryArr, null, 4));

// Edge case 7: Single-element structures
const singles = {
  oneKey: { only: 'value' },
  oneArr: [42],
  oneNested: { a: [{ b: 'c' }] },
  emptyAll: { a: {}, b: [], c: { d: {} }, e: [[]] }
};
fs.writeFileSync('edge_singles.json', JSON.stringify(singles, null, 4));

// Print line counts
const files = ['edge_special_keys.json','edge_deep_nest.json','edge_chunked_mixed.json','edge_big_object.json','edge_chunk_boundary.json','edge_singles.json'];
files.forEach(f => {
  const content = fs.readFileSync(f, 'utf-8');
  console.log(f + ': ' + content.split('\n').length + ' lines');
});
console.log('edge_string.json: 1 line');
console.log('edge_number.json: 1 line');
console.log('edge_null.json: 1 line');
console.log('edge_bool.json: 1 line');
