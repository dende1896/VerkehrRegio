const axios = require('axios');

const cities = [
    { name: 'Hamburg', bbox: '9.757,53.395,10.325,53.984' },
    { name: 'Hannover', bbox: '9.639,52.318,9.851,52.460' },
    { name: 'Bremen', bbox: '8.635,53.011,8.967,53.220' },
    { name: 'Berlin', bbox: '13.088,52.338,13.761,52.675' },
    { name: 'Dresden', bbox: '13.628,51.002,13.882,51.110' },
    { name: 'München', bbox: '11.360,48.061,11.722,48.248' },
    { name: 'Frankfurt am Main', bbox: '8.499,50.020,8.800,50.202' },
    { name: 'Nürnberg', bbox: '11.002,49.387,11.143,49.511' },
    { name: 'Düsseldorf', bbox: '6.687,51.160,6.867,51.312' },
    { name: 'Essen', bbox: '6.937,51.391,7.079,51.487' },
    { name: 'Dortmund', bbox: '7.369,51.455,7.554,51.570' },
    { name: 'Köln', bbox: '6.832,50.833,7.162,51.084' }
];

module.exports = async (req, res) => {
    const apiKey = process.env.HERE_API_KEY || req.query.apiKey;
    const locationReferencing = req.query.locationReferencing || 'shape';
    const responseattributes = req.query.responseattributes || 'sh,fc';
    const jamFactorThreshold = parseInt(req.query.jamFactor, 10) || 4;

    try {
        const results = await Promise.all(cities.map(async city => {
            const url = 'https://data.traffic.hereapi.com/v7/flow';
            const params = {
                apiKey: apiKey,
                in: `bbox:${city.bbox}`,
                locationReferencing: locationReferencing,
                responseattributes: responseattributes
            };

            const response = await axios.get(url, { params });
            const data = response.data;

            const filteredResults = data.results.filter(result =>
                result.currentFlow && result.currentFlow.jamFactor >= jamFactorThreshold
            ).map(result => {
                const direction = result.location.shape.links[0].points.length > 1 ? 
                    `from ${result.location.shape.links[0].points[0].lat},${result.location.shape.links[0].points[0].lng} to ${result.location.shape.links[0].points[1].lat},${result.location.shape.links[0].points[1].lng}` :
                    "N/A";
                return {
                    location: result.location,
                    currentFlow: result.currentFlow,
                    jamFactorExplanation: explainJamFactor(result.currentFlow.jamFactor),
                    direction: direction
                };
            });

            return {
                city: city.name,
                data: filteredResults
            };
        }));

        res.status(200).json(results);
    } catch (error) {
        console.error('Error fetching data from HERE API:', error);
        res.status(500).json({ error: 'Internal Server Error' });
        if (error.response) {
            console.error(error.response.data);
        }
    }
};

function explainJamFactor(jamFactor) {
    if (jamFactor >= 0 && jamFactor < 2) return "No congestion";
    if (jamFactor >= 2 && jamFactor < 4) return "Light congestion";
    if (jamFactor >= 4 && jamFactor < 6) return "Moderate congestion";
    if (jamFactor >= 6 && jamFactor < 8) return "Heavy congestion";
    if (jamFactor >= 8 && jamFactor < 10) return "Severe congestion";
    if (jamFactor === 10) return "Road blocked";
    return "Unknown";
}
