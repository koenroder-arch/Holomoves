export default function handler(req, res) {
    // Vercel serverless functions hebben een tijdelijk bestandssysteem.
    // Schrijven naar een lokaal .csv bestand werkt hier niet permanent.
    // Voor nu sturen we een 200 OK terug zodat de frontend niet faalt.
    res.status(200).json({ status: 'success', message: 'Logging is not supported on serverless, but the request was received.' });
}
