// netlify/functions/get-livekit-token.js
//
// Ye function Netlify ke server pe chalta hai (browser mein nahi).
// LIVEKIT_API_KEY aur LIVEKIT_API_SECRET sirf yahan use hoti hain — kabhi
// frontend code mein nahi jaati. Inhe Netlify Dashboard > Site settings >
// Environment variables mein add karein.
//
// Frontend ye function call karega: /.netlify/functions/get-livekit-token?room=ROOM_NAME&identity=USER_ID&name=USERNAME

import { AccessToken } from "livekit-server-sdk";

export const handler = async function (event) {
  try {
    const params = event.queryStringParameters || {};
    const room = params.room;
    const identity = params.identity;
    const name = params.name || identity;
    const canPublish = params.canPublish === "true";

    if (!room || !identity) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "room aur identity zaroori hain" }),
      };
    }

    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;

    if (!apiKey || !apiSecret) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Server pe LIVEKIT_API_KEY / LIVEKIT_API_SECRET set nahi hain" }),
      };
    }

    const at = new AccessToken(apiKey, apiSecret, {
      identity,
      name,
      ttl: "4h",
    });

    at.addGrant({
      room,
      roomJoin: true,
      canPublish: canPublish,
      canSubscribe: true,
      canPublishData: true,
    });

    const token = await at.toJwt();

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
