const Pusher = require('pusher');
const crypto = require('crypto');
const config = require('../config')

const pusher = new Pusher(config.pusher) 

module.exports = async function(fastify, opts) {
  fastify.get(
    "/start",
    {
      preValidation: [fastify.authenticate]
    },

    async function(request, reply) {
      return request.user;
    }
  );

  fastify.post(
    "/pusher/auth",
    {
      preValidation: [fastify.authenticate]
    },
    async function(request, reply) {
      reply.header('Access-Control-Allow-Origin', '*');
      reply.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      var socketId = request.body.socket_id;
      var channel = request.body.channel_name;
      let presenceData = {
        user_info: {name: request.user.username},
        user_id: crypto.randomBytes(16).toString('hex')
      }
      var auth = pusher.authenticate(socketId, channel, presenceData);
      reply.send(auth);
    }
  );
};
