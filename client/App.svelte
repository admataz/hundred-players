<script>
  import Pusher from "pusher-js";
  import Login from "./Login.svelte";
  import PlayerControls from "./PlayerControls.svelte";
  import Arena from "./Arena.svelte";

  export let pusher = null;
  export let usertoken = null;
  export let pusherChannel = null;

  let currentPlayers = [];
  let me = null;
  let playerPositions = {};
  let playerDefaultStartPos = { xPos: 0, yPos: 0 };

  const setCurrentMembers = pusherMembers => {
    const members = [];
    if (!pusherMembers) {
      return members;
    }
    pusherMembers.each(m => {
      members.push(m);
    });
    return members;
  };

  const pusherInit = () => {
    pusher = new Pusher("5682fcdf7df3eb814416", {
      cluster: "eu",
      forceTLS: true,
      auth: {
        headers: {
          authorization: `Bearer ${usertoken}`
        }
      }
    });
    
    pusherChannel = pusher.subscribe("presence-lnug-channel");

    pusherChannel.bind("pusher:subscription_succeeded", function(members) {
      currentPlayers = setCurrentMembers(pusherChannel.members);
      me = pusherChannel.members.me;
    });

    pusherChannel.bind("pusher:member_added", function(member) {
      currentPlayers = setCurrentMembers(pusherChannel.members);
      pusherChannel.trigger("client-member-acceleration", playerPositions[me.id]);
    });

    pusherChannel.bind("pusher:member_removed", function(member) {
      currentPlayers = setCurrentMembers(pusherChannel.members);
    });

    pusherChannel.bind("client-member-acceleration", function(data, meta) {
      updatePlayerPositions(meta.user_id, data);
    });
  };

  const onSubmit = async evt => {
    const response = await fetch("/register", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ username: evt.detail })
    });

    const data = await response.json();
    usertoken = data.token;

    if (usertoken) {
      pusherInit()
    }
  };

  const updatePlayerPositions = (id, position) => {
    playerPositions = {
      ...playerPositions,
      [id]: position
    };
  };

  const onPlayerControl = evt => {
    const position = {
        ...playerDefaultStartPos,
        ...playerPositions[me.id],
        ...evt.detail,
        speed: 7
    };
    updatePlayerPositions(me.id, position);
    pusherChannel.trigger("client-member-acceleration", position);
  };
</script>

{#if !usertoken}
  <Login on:submit={onSubmit} />
{/if}

{#if me}
  <h1>Hello {me.info.name}!</h1>
  <PlayerControls on:controls={onPlayerControl} />
{/if}

{#if usertoken}
  <Arena {playerPositions} {currentPlayers} />
{/if}
