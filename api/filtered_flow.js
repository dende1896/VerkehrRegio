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

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function getAlternateRoutes(origin, destination, apiKey) {
    const url = 'https://router.hereapi.com/v8/routes';
    const params = {
        transportMode: 'car',
        origin: origin,
        destination: destination,
        return: 'polyline,summary',
        apiKey: apiKey
    };

    try {
        const response = await axios.get(url, { params });
        return response.data.routes;
    } catch (error) {
        console.error('Error fetching alternate routes:', error);
        return [];
    }
}

function explainJamFactor(jamFactor) {
    if (jamFactor >= 0 && jamFactor < 2) return "No congestion";
    if (jamFactor >= 2 && jamFactor < 4) return "Light congestion";
    if (jamFactor >= 4 && jamFactor < 6) return "Moderate congestion";
    if (jamFactor >= 6 && jamFactor < 8) return "Heavy congestion";
    if (jamFactor >= 8 && jamFactor < 10) return "Severe congestion";
    if (jamFactor === 10) return "Road blocked";
    return "Unknown";
}

module.exports = async (req, res) => {
    const apiKey = process.env.HERE_API_KEY || req.query.apiKey;
    const bbox = req.query.bbox || null;
    const locationReferencing = req.query.locationReferencing || 'shape';
    const responseattributes = req.query.responseattributes || 'sh,fc';
    const jamFactorThreshold = parseInt(req.query.jamFactor, 10) || 4;

    if (!bbox) {
        res.status(400).json({ error: 'Bounding Box (bbox) parameter is required' });
        return;
    }

    const [west, south, east, north] = bbox.split(',').map(Number);
    const centerLat = (south + north) / 2;
    const centerLng = (west + east) / 2;

    try {
        const results = [];
        const urlFlow = 'https://data.traffic.hereapi.com/v7/flow';
        const urlIncidents = 'https://data.traffic.hereapi.com/v7/incidents';
        const params = {
            apiKey: apiKey,
            in: `bbox:${bbox}`,
            locationReferencing: locationReferencing,
            responseattributes: responseattributes
        };

        const [responseFlow, responseIncidents] = await Promise.all([
            axios.get(urlFlow, { params }),
            axios.get(urlIncidents, { params })
        ]);

        const flowData = responseFlow.data;
        const incidentsData = responseIncidents.data;

        const filteredResults = flowData.results.filter(result =>
            result.currentFlow &&
            result.currentFlow.jamFactor >= jamFactorThreshold &&
            result.currentFlow.speed <= 20
        ).map(async result => {
            const direction = result.location.shape.links[0].points.length > 1 ? 
                `from ${result.location.shape.links[0].points[0].lat},${result.location.shape.links[0].points[0].lng} to ${result.location.shape.links[0].points[1].lat},${result.location.shape.links[0].points[1].lng}` :
                "N/A";
            
            const matchingIncidents = incidentsData.results.filter(incident => 
                incident.location.shape && incident.location.shape.links.some(link =>
                    link.points.some(point =>
                        result.location.shape.links.some(resLink =>
                            resLink.points.some(resPoint =>
                                point.lat === resPoint.lat && point.lng === resPoint.lng
                            )
                        )
                    )
                )
            );

            const causes = matchingIncidents.map(incident => incident.incidentDetails.description.value).join(', ') || "Unbekannt";
            const streetNames = result.location.shape.links
                .map(link => link.names ? link.names.map(name => name.value).join(', ') : result.location.description || "Unbekannte Straße")
                .join(', ');
            const directionName = matchingIncidents.map(incident => incident.roadNumbers ? incident.roadNumbers.join(', ') : "Unbekannte Richtung").join(', ') || "Unbekannt";

            // Calculate alternate routes
            const alternativeRoutes = await getAlternateRoutes(
                `${result.location.shape.links[0].points[0].lat},${result.location.shape.links[0].points[0].lng}`,
                `${result.location.shape.links[0].points[1].lat},${result.location.shape.links[0].points[1].lng}`,
                apiKey
            );

            return {
                location: result.location,
                currentFlow: result.currentFlow,
                jamFactorExplanation: explainJamFactor(result.currentFlow.jamFactor),
                direction: direction,
                cause: causes,
                alternativeRoutes: alternativeRoutes.map(route => route.sections[0].summary.text).join(', ') || "Keine Alternativrouten verfügbar",
                streets: streetNames,
                directionName: directionName
            };
        });

        const finalResults = await Promise.all(filteredResults);
        results.push({
            bbox: bbox,
            data: finalResults
        });

        await sleep(500);
        res.status(200).json(results);
    } catch (error) {
        console.error('General Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};
