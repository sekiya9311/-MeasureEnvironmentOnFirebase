import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import * as line from '@line/bot-sdk';

const NOW_TIMESTAMP = admin.firestore.Timestamp.now();

const MEASURE_ITEMS = 'measure_items';
const PREV_ALERT_TIME = 'prev_alert_time';
const CURRENT_MEASURE = 'current_measure';

const DANGER_CO2_VALUE = 800;
const MILLI_SECONDS_OF_AN_HOUR = 3600000;


const lineBotClient = new line.Client({
  channelAccessToken: functions.config().linebot.channelaccesstoken as string,
  channelSecret: functions.config().linebot.channelsecret as string
});

// Start writing Firebase Functions
// https://firebase.google.com/docs/functions/typescript

export const helloWorld = functions.https.onRequest((_, response) => {
  response.send("Hello from Firebase!");
});

admin.initializeApp();
const firestore = admin.firestore();

export const addCO2 = functions.region('asia-northeast1').https.onCall(async (data, _) => {
  const co2 = data.co2 as number;
  const addObj = {
    co2,
    created_at: NOW_TIMESTAMP
  };

  await firestore
    .collection(MEASURE_ITEMS)
    .add(addObj);

  {
    const currentMeasureCollection = firestore.collection(CURRENT_MEASURE);
    const currentMeasure = await currentMeasureCollection.get();
    if (currentMeasure.empty) {
      await currentMeasureCollection.add(addObj);
    } else {
      const snapshot = currentMeasure.docs[0];
      await currentMeasureCollection.doc(snapshot.id).update(addObj);
    }
  }

  if (co2 <= DANGER_CO2_VALUE) {
    return;
  }
  const needAlert = async (curCo2: number): Promise<boolean> => {
    const modifiedCo2 = Math.floor(curCo2 / 100) * 100;
    const prevAlertTimeCollection
      = firestore.collection(PREV_ALERT_TIME);
    const prevAlertTime = await prevAlertTimeCollection.get();
    if (prevAlertTime.empty) {
      await prevAlertTimeCollection.add({
        at: NOW_TIMESTAMP,
        co2: modifiedCo2
      });
      return true;
    }
    const prevAlertTimeDocSnapshot = prevAlertTime.docs[0];
    const prevAlertTimeDocSnapshotData = prevAlertTimeDocSnapshot.data();
    const prevAt = prevAlertTimeDocSnapshotData.at as admin.firestore.Timestamp;
    const spanOfPrevAlert = NOW_TIMESTAMP.toDate().getTime() - prevAt.toDate().getTime();
    if (spanOfPrevAlert < MILLI_SECONDS_OF_AN_HOUR) {
      return false;
    }
    
    await prevAlertTimeCollection.doc(prevAlertTimeDocSnapshot.id).update({
        at: NOW_TIMESTAMP,
        co2: modifiedCo2
    });
    return true;
  }
  if (!await needAlert(co2)) {
    return;
  }

  const msg = `Now co2 value is over ${DANGER_CO2_VALUE} [ppm] !!` + '\n'
    + `Current value is ${co2} [ppm]`;
  await lineBotClient.broadcast({
    type: 'text',
    text: msg
  });
});

export const lineBot = functions.region('asia-northeast1').https.onRequest((req, resp) => {
  const events = (req.body.events as line.MessageEvent[]);
  const respTextMessage = (msg: string, event: line.MessageEvent) => {
    return lineBotClient.replyMessage(event.replyToken, {
      type: 'text',
      text: msg
    });
  }
  const respUnsupported = (e: line.MessageEvent) => respTextMessage('Not supported ...', e);
  const res = events.map(async event => {
    if (event.type !== 'message') {
      return respUnsupported(event);
    }
    const message = event.message as line.TextEventMessage;
    if (!message) {
      return respUnsupported(event);
    }

    if (message.text === 'test') {
      return respTextMessage('test response', event);
    }

    if (message.text === 'now') {
      const snapshot = await firestore.collection(CURRENT_MEASURE).get();
      if (snapshot.empty) {
        return respTextMessage('data is nothing...', event);
      }
      
      const data = snapshot.docs[0].data();
      const co2 = data.co2 as Number;
      const createdAt = data.created_at as admin.firestore.Timestamp;
      const text = `Now co2 value : ${co2} [ppm]\n`
        + `at: ${createdAt.toDate().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}`; // My house is in Japan !
      return respTextMessage(text, event);
    }

    return respUnsupported(event);
  });

  return Promise.all(res).
    then(async (_) => {
      resp.status(200).send('OK');
    });
});
