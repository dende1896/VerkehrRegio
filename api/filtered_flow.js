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

        try {
            const [responseFlow, responseIncidents] = await Promise.all([
                axios.get(urlFlow, { params }),
                axios.get(urlIncidents, { params })
            ]);

            const flowData = responseFlow.data;
            const incidentsData = responseIncidents.data;

            const filteredResults = flowData.results.filter(result =>
                result.currentFlow &&
                result.currentFlow.jamFactor >= jamFactorThreshold &&
                result.currentFlow.speed <= 20 // Begrenzung auf Abschnitte mit geringer Geschwindigkeit
            ).map(result => {
                const direction = result.location.shape.links[0].points.length > 1 ? 
                    `from ${result.location.shape.links[0].points[0].lat},${result.location.shape.links[0].points[0].lng} to ${result.location.shape.links[0].points[1].lat},${result.location.shape.links[0].points[1].lng}` :
                    "N/A";
                
                // Suchen nach Vorfällen, die die gleiche Strecke betreffen
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

                // Extrahieren von Straßennamen
                const streetNames = result.location.shape.links.map(link => link.names.map(name => name.value)).flat().join(', ') || "Unbekannte Straße";

                return {
                    location: result.location,
                    currentFlow: result.currentFlow,
                    jamFactorExplanation: explainJamFactor(result.currentFlow.jamFactor),
                    direction: direction,
                    cause: causes,
                    streets: streetNames,
                    alternativeRoutes: [] // Placeholder for alternative routes
                };
            }).sort((a, b) => b.currentFlow.jamFactor - a.currentFlow.jamFactor) // Sortierung nach Jam-Faktor
            .slice(0, 10); // Begrenzung auf die Top 10 Ergebnisse

            for (const result of filteredResults) {
                const origin = `${result.location.shape.links[0].points[0].lat},${result.location.shape.links[0].points[0].lng}`;
                const destination = `${result.location.shape.links[0].points.slice(-1)[0].lat},${result.location.shape.links[0].points.slice(-1)[0].lng}`;

                const alternativeRoutes = await getAlternativeRoutes(apiKey, origin, destination);
                result.alternativeRoutes = alternativeRoutes || ["Keine Alternativrouten verfügbar"];
            }

            results.push({
                bbox: bbox,
                data: filteredResults
            });

            // Wartezeit von 500ms zwischen den Anfragen
            await sleep(500);
        } catch (error) {
            console.error(`Error fetching data for bbox ${bbox}:`, error.response ? error.response.data : error.message);
            results.push({
                bbox: bbox,
                error: error.response ? error.response.data : error.message
            });
        }

        res.status(200).json(results);
    } catch (error) {
        console.error('General Error:', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
};

async function getAlternativeRoutes(apiKey, origin, destination) {
    const url = 'https://router.hereapi.com/v8/routes';
    const params = {
        origin: origin,
        destination: destination,
        return: 'routeLabels,summary',
        transportMode: 'car',
        alternatives: 3,
        apiKey: apiKey
    };

    try {
        const response = await axios.get(url, { params });
        return response.data.routes.map(route => ({
            id: route.id,
            labels: route.sections.map(section => section.routeLabels).flat().map(label => label.name).join(', '),
            summary: route.sections.map(section => ({
                baseDuration: section.summary.baseDuration,
                duration: section.summary.duration,
                length: section.summary.length
            }))
        }));
    } catch (error) {
        console.error('Error fetching alternative routes:', error);
        return null;
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
