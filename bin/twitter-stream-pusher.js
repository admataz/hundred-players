const config = require('../config');
const Twitter = require('twitter');
const twclient = new Twitter(config.twitter);
const Pusher = require('pusher');
const pusher = new Pusher(config.pusher) 

const args = process.argv.slice(2);

if(!args.length){
    throw('specify a track for the twitter status updates')
}

const stream = twclient.stream('statuses/filter', { track: args[0] });

stream.on('data', function(chunk){
    console.log(chunk.text.toString())
    pusher.trigger('lnug-game-cheers', 'twitter-hoorah', {tweet: chunk.text.toString()})
})
