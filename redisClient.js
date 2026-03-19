const redis = require('redis');

const client = redis.createClient({
    url: 'redis://localhost:6379' // Update if your Redis URL is different
});

client.on('error', (err) => console.log('Redis Client Error', err));

async function connectRedis() {
    await client.connect();
    console.log('Connected to Redis');
}

connectRedis();

module.exports = client;