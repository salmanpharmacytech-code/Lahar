// api/get-livekit-token.js
//
// Ye function Vercel ke server pe chalta hai (browser mein nahi).
// LIVEKIT_API_KEY aur LIVEKIT_API_SECRET sirf yahan use hoti hain — kabhi
// frontend code mein nahi jaati. Inhe Vercel Dashboard > Settings >
// Environment Variables mein add karein.
//
// Frontend ye function call karega: /api/get-livekit-token?room=ROOM_NAME&identity=USER_ID&name=USERNAME

import { AccessToken } from "livekit-server-sdk";

export default async function handler(req, res) {
  try {
    const { room, identity, name, canPublish } = req.query;

    if (!room || !identity) {
      res.status(400).json({ error: "room aur identity zaroori hain" });
      return;
    }

    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;

    if (!apiKey || !apiSecret) {
      res.status(500).json({ error: "Server pe LIVEKIT_API_KEY / LIVEKIT_API_SECRET set nahi hain" });
      return;
    }

    const at = new AccessToken(apiKey, apiSecret, {
      identity,
      name: name || identity,
      ttl: "4h",
    });

    at.addGrant({
      room,
      roomJoin: true,
      canPublish: canPublish === "true",
      canSubscribe: true,
      canPublishData: true,
    });

    const token = await at.toJwt();

    res.status(200).json({ token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
