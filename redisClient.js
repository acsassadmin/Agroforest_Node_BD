const redis = require('redis');

const client = redis.createClient({
  url: 'redis://localhost:6379',
  socket: {
    connectTimeout: 10000,
    reconnectStrategy: (retries) => Math.min(retries * 50, 5000) // backoff
  }
});

client.on('error', (err) => console.error('Redis Client Error', err));
client.on('connect', () => console.log('Redis connecting...'));
client.on('ready', () => console.log('Redis ready'));
client.on('end', () => console.log('Redis connection closed'));

async function connectRedis() {
  try {
    await client.connect();
    console.log('Connected to Redis');
  } catch (err) {
    console.error('Failed to connect to Redis:', err);
    // optional: retry logic or process.exit(1)
  }
}

connectRedis();

module.exports = client;
