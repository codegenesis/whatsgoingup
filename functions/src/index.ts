import * as functions from 'firebase-functions';

const Client = require('node-rest-client').Client;
 
const client = new Client();

const apiBase = 'https://api.aerisapi.com/forecasts/';
const apiClient = 'HVptD2sYYxVqQ883K7Bkq';
const apiSecret = 'u56EL25cFJ9GACs6oVTL2PgPBLYd9lkasSFTzxdl';

const admin = require('firebase-admin');
admin.initializeApp();
const db = admin.firestore();

// // Start writing Firebase Functions
// // https://firebase.google.com/docs/functions/typescript
//
export const ReadEndpoint = functions.https.onRequest(async (request, response) => {

    let zip = request.query.zip;
    let day = new Date(Date.parse(request.query.date));

    console.log('Input data', zip, day, request.query.date)
    if (!zip){
        zip = '32899'
    }

    if (!day){
        day = new Date();
    }

    const limit = new Date();

    //Limit the date to 14 days out max
    limit.setDate(limit.getDate() + 14);
    if (day.valueOf() > limit.valueOf()){
        day = limit;
    }


    const unixDate = parseInt((day.getTime() / 1000).toFixed(0));

    const query = '?from=' + unixDate + '&to=' + unixDate + '&filter=1hr'

    const url = 'https://api.aerisapi.com/forecasts/' + zip + query + '&1hr&limit=1&client_id=' + apiClient + '&client_secret=' + apiSecret;
    console.log('checking url', url);

    client.get(url, (data, getresponse) => {
        response.send(JSON.stringify(data));
    });
});

export const TestCreateForecast = functions.https.onRequest(async (request, response) => {

    const pct: number = request.query.pct ? request.query.pct : 10;
    const date: Date = request.query.date ? request.query.pct : (new Date()).setDate((new Date()).getDate() + 10);
    
    const launchId="rNWcF4xUu6KGee57570k";

    await CreateForecastFirestore(pct, date, launchId);

    response.send('document added!');
});

async function CreateForecastFirestore(forecastPct: number, forecastDate: Date, launchId: string){


    const newDocRef = await db.collection('Launches').doc(launchId).colletion('Forecast').doc();

    const setDoc = await newDocRef.set({
        DateCalculated: new Date(),
        ForecastDate: forecastDate,
        ForecastPctFail: forecastPct
    });
        
}