import * as functions from 'firebase-functions';

const Client = require('node-rest-client').Client;
 
const client = new Client();

const apiBase = 'https://api.aerisapi.com/forecasts/';
const apiClient = 'HVptD2sYYxVqQ883K7Bkq';
const apiSecret = 'u56EL25cFJ9GACs6oVTL2PgPBLYd9lkasSFTzxdl';

// // Start writing Firebase Functions
// // https://firebase.google.com/docs/functions/typescript
//
export const ReadEndpoint = functions.https.onRequest(async (request, response) => {

    let zip = request.query.zip;
    let day = new Date(Date.parse(request.query.date));

    console.log('Input data', zip, day)
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

    const url = 'https://api.aerisapi.com/forecasts/' + zip + '?filter=from=' + day.valueOf() + '&1hr&limit=1&client_id=' + apiClient + '&client_secret=' + apiSecret;
    
    client.get(url, (data, getresponse) => {
        response.send(JSON.stringify(data));
    });
});