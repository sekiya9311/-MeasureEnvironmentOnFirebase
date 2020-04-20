import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

// Start writing Firebase Functions
// https://firebase.google.com/docs/functions/typescript

export const helloWorld = functions.https.onRequest((_, response) => {
  response.send("Hello from Firebase!");
});

admin.initializeApp();
const firestore = admin.firestore();

export const addCO2 = functions.https.onCall(async (data, _) => {
  const co2 = data.co2 as Number;
  const nowTimestamp = admin.firestore
    .Timestamp.fromMillis(Date.now());
  const addObj = {
    co2,
    created_at: nowTimestamp
  };

  await firestore
    .collection('measure_items')
    .add(addObj);
});
