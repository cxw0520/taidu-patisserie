const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
app.use(express.json({ limit: '50mb' }));

// Enable CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.post('/data', (req, res) => {
  console.log('Received data!');
  const dataPath = path.resolve(__dirname, 'may_data.json');
  fs.writeFileSync(dataPath, JSON.stringify(req.body, null, 2), 'utf8');
  console.log('Saved to', dataPath);
  res.json({ status: 'ok' });
});

app.listen(3001, () => {
  console.log('Temp server listening on port 3001');
});
