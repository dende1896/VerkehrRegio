const express = require('express');
const filteredFlow = require('./api/filtered_flow');

const app = express();
const port = process.env.PORT || 3002;

app.get('/', (req, res) => {
    res.send('Willkommen beim Traffic API Server');
});

app.get('/api/traffic', filteredFlow);

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
