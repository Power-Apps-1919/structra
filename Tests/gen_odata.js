const fs = require('fs');

// OData and special character keys common in Power Platform / Microsoft Graph
const odata = {
  '@odata.context': 'https://graph.microsoft.com/v1.0/$metadata#users',
  '@odata.nextLink': 'https://graph.microsoft.com/v1.0/users?$skip=10',
  '@odata.count': 100,
  'value': [
    {
      '@odata.type': '#microsoft.graph.user',
      'id': '123',
      'displayName': 'John Doe',
      'mail@example': 'john@corp.com',
      '$select': ['id', 'displayName'],
      'address/city': 'Seattle',
      'name.first': 'John',
      'tags[0]': 'admin',
      'key with spaces': 'value',
      '#ref': { '$id': '1', '$values': [1, 2, 3] },
      'nested.dotted.key': { 'another.dot': { 'deep.er': 'found it' } }
    }
  ],
  '$metadata': { '$schema': 'v4', '@id': '/api/v1' }
};

const json = JSON.stringify(odata, null, 4);
fs.writeFileSync('edge_odata.json', json);
console.log('edge_odata.json: ' + json.split('\n').length + ' lines');
