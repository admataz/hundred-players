module.exports = function (fastify, opts, next) {
    fastify.post('/register', function (request, reply) {
        const {username} = request.body

        const token = fastify.jwt.sign({ username })
        reply.send({ token })
    })
  
    next()
  }