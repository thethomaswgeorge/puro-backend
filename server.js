/**
 * Puro – Stream backend
 *
 * Handles server-side Stream operations that require the API secret:
 *   POST /stream/bootstrap  – create/upsert a user in Stream and return a signed token
 *   GET  /stream/timeline   – fetch a user's flat timeline feed
 *   POST /stream/follow     – follow another user
 *   POST /stream/unfollow   – unfollow another user
 *
 * Setup:
 *   1. cp backend/.env.example backend/.env
 *   2. Fill in your Stream API key + secret (from https://dashboard.getstream.io)
 *   3. cd backend && npm install && node server.js
 */

require('dotenv').config();
const express = require('express');
const { StreamClient } = require('@stream-io/node-sdk');

const PORT = process.env.PORT ?? 3000;
const STREAM_API_KEY = process.env.STREAM_API_KEY;
const STREAM_API_SECRET = process.env.STREAM_API_SECRET;

if (!STREAM_API_KEY || !STREAM_API_SECRET) {
    console.error(
        '\n❌  Missing STREAM_API_KEY or STREAM_API_SECRET in backend/.env\n' +
        '    Copy backend/.env.example → backend/.env and fill in your keys.\n'
    );
    process.exit(1);
}

const streamClient = new StreamClient(STREAM_API_KEY, STREAM_API_SECRET);
const app = express();
app.use(express.json());

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', ts: new Date().toISOString() });
});

// ─── POST /stream/bootstrap ───────────────────────────────────────────────────
// Body: { userId: string, name?: string, image?: string }
// Returns: { userId: string, token: string }
app.post('/stream/bootstrap', async (req, res) => {
    const { userId, name, image } = req.body ?? {};

    if (!userId) {
        return res.status(400).json({ error: 'userId is required' });
    }

    try {
        // Upsert the user in Stream
        await streamClient.upsertUsers([
            {
                id: userId,
                ...(name ? { name } : {}),
                ...(image ? { image } : {}),
            },
        ]);

        // Self-follow so the user's own posts appear on their timeline feed
        const timelineFeed = streamClient.feed('timeline', userId);
        await timelineFeed.follow('user', userId);

        // Generate a short-lived user token (24 h)
        const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 24;
        const token = streamClient.generateUserToken({ user_id: userId, exp: expiresAt });

        return res.json({ userId, token });
    } catch (err) {
        console.error('[bootstrap]', err);
        return res.status(500).json({ error: err.message ?? 'Bootstrap failed' });
    }
});

// ─── GET /stream/timeline ─────────────────────────────────────────────────────
// Query: { userId, limit?, offset? }
// Returns Stream timeline feed activities
app.get('/stream/timeline', async (req, res) => {
    const { userId, limit = '20', offset = '0' } = req.query;

    if (!userId) {
        return res.status(400).json({ error: 'userId is required' });
    }

    try {
        const feed = streamClient.feed('timeline', userId);
        const result = await feed.get({ limit: Number(limit), offset: Number(offset) });
        return res.json(result);
    } catch (err) {
        console.error('[timeline]', err);
        return res.status(500).json({ error: err.message ?? 'Failed to fetch timeline' });
    }
});

// ─── POST /stream/follow ──────────────────────────────────────────────────────
// Body: { followerId: string, followingId: string }
app.post('/stream/follow', async (req, res) => {
    const { followerId, followingId } = req.body ?? {};

    if (!followerId || !followingId) {
        return res.status(400).json({ error: 'followerId and followingId are required' });
    }

    try {
        const timelineFeed = streamClient.feed('timeline', followerId);
        await timelineFeed.follow('user', followingId);
        return res.json({ success: true });
    } catch (err) {
        console.error('[follow]', err);
        return res.status(500).json({ error: err.message ?? 'Follow failed' });
    }
});

// ─── POST /stream/unfollow ────────────────────────────────────────────────────
// Body: { followerId: string, followingId: string }
app.post('/stream/unfollow', async (req, res) => {
    const { followerId, followingId } = req.body ?? {};

    if (!followerId || !followingId) {
        return res.status(400).json({ error: 'followerId and followingId are required' });
    }

    try {
        const timelineFeed = streamClient.feed('timeline', followerId);
        await timelineFeed.unfollow('user', followingId);
        return res.json({ success: true });
    } catch (err) {
        console.error('[unfollow]', err);
        return res.status(500).json({ error: err.message ?? 'Unfollow failed' });
    }
});

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`\n🚀  Puro backend running on http://localhost:${PORT}\n`);
});
