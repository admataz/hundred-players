# hundred players

An experimental game I created for a lightning talk at [London Node User Group](https://lnug.org) in November 2019

The basic idea is to use available technologies to create an online game that could take multiple partipants at the same time and allow a shared, emergent experience with attendees. 

In this experiment I use 
- [Pusher Channels](https://pusher.com/channels) to handle the sockets and pub/sub messaging for subscribed users
- [Fastify](https://www.fastify.io/) as the node.js application server to manage user authentication and hosting the game
- [Svelte.js](https://svelte.dev) for the actual client-side game 

All original code is open source [ICS](./license.txt) license

© Adam Davis 2019


