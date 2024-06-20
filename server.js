const express = require('express');
const axios = require('axios');

const app = express();
const port = process.env.PORT || 3002;

app.get('/', (req, res) => {
    res.send('Willkommen beim Traffic API Server');
});

app.get('/traffic', async (req, res) => {
    const apiKey = 'VQMjbogvO-dEsvWIytu2eq0IrIIO3eD-0lGepbF8hVQ';  // Ersetzen Sie dies durch Ihren tatsächlichen API-Schlüssel
    const bbox = '9.7320,52.3745,9.7420,52.3845';  // Formatierung als 'bbox' Parameter
    const locationReferencing = 'shape';
    const responseattributes = 'sh,fc';
    const jamFactorThreshold = parseInt(req.query.jamFactor, 10) || 3.5;

    const url = 'https://data.traffic.hereapi.com/v7/flow';
    const params = {
        apiKey: apiKey,
        in: `bbox:${bbox}`,  // Verwendung des 'in' Parameters
        locationReferencing: locationReferencing,
        responseattributes: responseattributes
    };

    try {
        const response = await axios.get(url, { params });
        const data = response.data;

        const filteredResults = data.results.filter(result =>
            result.currentFlow && result.currentFlow.jamFactor >= jamFactorThreshold
        );

        res.status(200).json(filteredResults);
    } catch (error) {
        console.error('Error fetching data from HERE API:', error);
        if (error.response) {
            console.error(error.response.data);
            res.status(error.response.status).json(error.response.data);
        } else {
            res.status(500).json({ error: 'Internal Server Error' });
        }
    }
});

app.listen(port, () => {
    console.log(`Server running on port ${port}`);
});
