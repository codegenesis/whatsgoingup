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

const cors = require('cors')({ origin: true });

async function CalcLaunchPredictors(loc: string, day: Date, launchId: string = null, update: boolean = false): Promise<DataReturn> {

  const output: DataReturn = {
    LaunchDate: day,
    LaunchLocation: loc,
    Predictors: []
  }

  let data: any = [];

  if (update) {
    data = await readEndpoint(loc, day);
  } else {
    data = await getlatestforecast(launchId);
  }

  if (data) {

    if (launchId) {
      // Save forecast in FireStore
      await CreateForecastFirestore(data, day, launchId);
    }

    const outputValues: DataPoint[] = [];
    outputValues.push(CalcWindSpeed(data.windSpeedMaxKTS, 30));
    outputValues.push(CalcTStorm(data.weatherPrimaryCoded));
    outputValues.push(CalcCloudCoverage(data.cloudsCoded));

    output.Predictors = outputValues;
  }

  return output;
}

// Gets the latest forecast from the db rather than the endpoint
async function getlatestforecast(launchId: string) {

  const ref = await db.collection('Launches').doc(String(launchId)).collection('Forecast');

  const launchRef = await ref.orderBy('DateCalculated', 'desc').limit(1).get()

  if (launchRef.docs.length > 0) {

    const val = await launchRef.docs[0].data();
    const json = JSON.parse(val.Forecast);
    console.log('Found exting forecast', val.DateCalculated);
    return json;
  }

  return null;
}

// Reads the weather endpoint to return forecast
async function readEndpoint(loc: string, time: Date): Promise<any> {

  let day = time;

  if (!day) {
    day = new Date();
  }

  const limit = new Date();

  //Limit the date to 14 days out max
  limit.setDate(limit.getDate() + 14);
  if (day.valueOf() > limit.valueOf()) {
    day = limit;
  }

  const unixDate = parseInt((day.getTime() / 1000).toFixed(0));

  const query = '?from=' + unixDate + '&to=' + unixDate + '&filter=1hr'

  const url = apiBase + loc + query + '&1hr&limit=1&client_id=' + apiClient + '&client_secret=' + apiSecret;
  console.log('checking url', url);


  const dataOut = await callendpoint(url);

  console.log('Returned data', dataOut);

  const data = await callendpoint(url);

  try {
    return data.response[0].periods[0];
  } catch {
    return null;
  }

}

// Load one prediction
export const LoadPrediciton = functions.https.onRequest(async (request, response) => {

  let launch = 1059;
  if (request.query.launch) {
    launch = request.query.launch;
  }

  //Get the specified launch
  try {
    const launchRef = await db.collection('Launches').doc(String(launch)).get();
    const data = launchRef.data();
    const pad = data.location.pads[0];

    if (pad) {
      const loc = pad.latitude + ',' + pad.longitude;
      const date = new Date(Date.parse(data.net));
      const pred = await CalcLaunchPredictors(loc, date, String(data.id));
      response.send(pred);
    }

    response.send('No Pad for specified launch');


  } catch {
    response.send('Can\'t find specified launch');
  }

});

export const LoadLaunches = functions.https.onRequest(async (request, response) => {
  cors(request, response, async () => {
    const launchesRef = db.collection('Launches');
    const snapshot = await launchesRef.get();

    let dataOut: any[] = [];

    await asyncForEach(snapshot.docs, async (doc) => {
      const data = doc.data();
      const pad = data.location.pads[0];

      if (pad) {
        const loc = pad.latitude + ',' + pad.longitude;
        const date = new Date(Date.parse(data.net));
        const pred = await CalcLaunchPredictors(loc, date, String(data.id));

        data.WGUPred = pred;
      }

      dataOut.push(data);
    });

    dataOut.sort((a, b) => Date.parse(a.windowstart) - Date.parse(b.windowstart));
    dataOut = dataOut.filter(d => Date.parse(d.windowstart) > (Date.now()).valueOf());

    response.send(dataOut);
  });
});

export const UpdateLaunchList = functions.https.onRequest(async (request, response) => {

  const url = "https://launchlibrary.net/1.4/launch?mode=verbose";
  const data: Launch[] = (await callendpoint(url)).launches;
  console.log('Launch Data', data);

  for (let item of data) {

    const docId = String(item.id);
    console.log('editing doc path', docId, item);

    const ref = await db.collection('Launches').doc(String(item.id)).set(item);
  }

  response.send(data.length + ' launches updates!');
});

export const UpdateForecasts = functions.https.onRequest(async (request, response) => {
  cors(request, response, async () => {
    const launchesRef = db.collection('Launches');
    const snapshot = await launchesRef.get();

    const dataOut: any[] = [];

    await asyncForEach(snapshot.docs, async (doc) => {
      const data = doc.data();
      const pad = data.location.pads[0];

      if (pad) {
        const loc = pad.latitude + ',' + pad.longitude;
        const date = new Date(Date.parse(data.net));
        const pred = await CalcLaunchPredictors(loc, date, String(data.id), true);

        data.WGUPred = pred;
      }

      dataOut.push(data);
    });


    response.send(dataOut);
  });
});

async function asyncForEach(array, callback) {
  for (let index = 0; index < array.length; index++) {
    await callback(array[index], index, array)
  }
}

function callendpoint(url: string): Promise<any> {
  return new Promise(function (resolve) {
    client.get(url, (data) => {
      console.log('Resolving');
      resolve(data);
    });
  });
}

async function CreateForecastFirestore(forecast: any, forecastDate: Date, launchId: string) {

  const newDocRef = await db.collection('Launches').doc(launchId).collection('Forecast').doc();


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

function CalcCloudCoverage(cloudCovCoded: string): DataPoint {

  const type = cloudCovCoded.split(":");

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

  if (str === "CL") {
    return 0.07;
  }

  if (str === "FW") {
    return 0.32;
  }

  if (str === "SC") {
    return 0.50;
  }

  if (str === "BK") {
    return 80;
  }

  if (str === "OV") {
    return 100;
  }

  return 0.5
}