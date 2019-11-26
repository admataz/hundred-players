require('dotenv').config()

const conf = {
  twitter: {
    consumer_key: process.env.TWITTER_CONSUMER_KEY,
    consumer_secret: process.env.TWITTER_CONSUMER_SECRET,
    access_token_key: process.env.TWITTER_ACCESS_TOKEN_KEY,
    access_token_secret: process.env.TWITTER_ACCESS_TOKEN_SECRET,
  },
  pusher: {
    appId: process.env.PUSHER_API_APP_ID,
    key: process.env.PUSHER_API_KEY,
    secret: process.env.PUSHER_API_SECRET,
    cluster: process.env.PUSHER_API_CLUSTER,
    encrypted: true
    },
  server: {
    logging: process.env.LOG_LEVEL ? {
      level: process.env.LOG_LEVEL,
      prettyPrint: process.env.LOG_LEVEL === 'debug'
    } : false,
    port: process.env.PORT || '3001'
  }
}

module.exports = conf