import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { Launch } from './launch';

const Client = require('node-rest-client').Client;
 
const client = new Client();

const apiBase = 'https://api.aerisapi.com/forecasts/';
const apiClient = 'HVptD2sYYxVqQ883K7Bkq';
const apiSecret = 'u56EL25cFJ9GACs6oVTL2PgPBLYd9lkasSFTzxdl';

admin.initializeApp(functions.config().firebase);
const db = admin.firestore();

interface DataPoint {
    Name: string,
    Value: number,
    Threshold: number,
    HighValue: boolean,
}

interface DataReturn {
    LaunchLocation: string,
    LaunchDate: Date,
    Predictors: DataPoint[];
}

export const ReadEndpoint = functions.https.onRequest(async (request, response) => {

    let loc = request.query.loc;
    let day = new Date(Date.parse(request.query.date));

    console.log('Input data', loc, day, request.query.date)
    if (!loc){
        loc = '32899'
    }

    if (!day){
        day = new Date();
    }

    const data = await readEndpoint(loc, day);

    response.send(JSON.stringify(data));
});

export const GetLaunchData = functions.https.onRequest(async (request, response) => {

    let loc = request.query.loc;
    let day = new Date(Date.parse(request.query.date));

    console.log('Input data', loc, day, request.query.date)
    if (!loc){
        loc = '32899'
    }

    if (!day){
        day = new Date();
    }

    const data = await readEndpoint(loc, day);
    const period = data.response[0].periods[0];

    // Save forecast in FireStore
    await CreateForecastFirestore(period, day, "rNWcF4xUu6KGee57570k");

    const outputValues: DataPoint[] = [];
    outputValues.push(CalcWindSpeed(period.windSpeedMaxKTS, 30));
    outputValues.push(CalcTStorm(period.weatherPrimaryCoded));

    const output: DataReturn = {
        LaunchDate: day,
        LaunchLocation: loc,
        Predictors: outputValues
    }

    response.send(output);
});


async function readEndpoint(loc: string, time: Date): Promise<any> {

    let day = time;

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

    const url = 'https://api.aerisapi.com/forecasts/' + loc + query + '&1hr&limit=1&client_id=' + apiClient + '&client_secret=' + apiSecret;
    console.log('checking url', url);


    const dataOut = await callendpoint(url);

    console.log('Returned data', dataOut);

    return await callendpoint(url);
}

export const UpdateLaunches = functions.https.onRequest(async (request, response) => {

    const url = "https://launchlibrary.net/1.4/launch";
    const data:Launch[] = await callendpoint(url);
    console.log('Launch Data', data);

    for (let item of data){
        const ref = await db.collection('Launches').doc(item.id).set(item);
    }

    response.send(data.length + ' launches updates!');
});

function callendpoint(url: string): Promise<any> {
    return new Promise(function(resolve, reject) {
        client.get(url, (data, getresponse) => {
            console.log('Resolving');
            resolve(data);
        });
    });
}

export const TestCreateForecast = functions.https.onRequest(async (request, response) => {

    const pct: number = request.query.pct ? request.query.pct : 10;
    const date: Date = request.query.date ? new Date(Date.parse(request.query.date)) : new Date((new Date()).setDate((new Date()).getDate() + 10));
    
    console.log('Data import', date, request.query.date);

    const launchId="rNWcF4xUu6KGee57570k";

    await CreateForecastFirestore(pct, date, launchId);

    response.send('document added!');
});

async function CreateForecastFirestore(forecast: any, forecastDate: Date, launchId: string){

    const newDocRef = await db.collection('Launches').doc(launchId).collection('Forecast').doc();

    const setDoc = await newDocRef.set({
        DateCalculated: new Date(),
        ForecastDate: forecastDate,
        Forecast: JSON.stringify(forecast)
    });
        
}

function CalcWindSpeed(curSpeed: number, threshold: number): DataPoint {
    return {
        Name: 'Wind Speed (KTS)',
        Value: curSpeed,
        Threshold: threshold,
        HighValue: true,
    }
}

function CalcTStorm(weatherPrimaryCoded: string): DataPoint {

    const type = weatherPrimaryCoded.split(":");

    let curPct = 0;

    if (type[2] === "T") {
        curPct = calcCovergePct(type[1]);
    }

    return {
        Name: 'T Storm Likleyhood',
        Value: curPct,
        Threshold: 1,
        HighValue: true,
    }
}

function calcCovergePct(str: string): number {
    
    if (str === "VL"){
        return 0.15;
    }

    if (str === "L"){
        return 0.30;
    }

    if (str === "H"){
        return 0.75;
    }

    if (str === "VH"){
        return 1;
    }

    return 0.5
}