import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import * as line from '@line/bot-sdk';

const MEASURE_ITEMS = 'measure_items';

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
  const co2 = data.co2 as Number;
  const nowTimestamp = admin.firestore
    .Timestamp.fromMillis(Date.now());
  const addObj = {
    co2,
    created_at: nowTimestamp
  };

  await firestore
    .collection(MEASURE_ITEMS)
    .add(addObj);
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
      const snapshot = await firestore
        .collection(MEASURE_ITEMS)
        .orderBy('created_at', 'desc')
        .limit(1)
        .get();
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
    then(_ => resp.status(200).send('OK'));
});
