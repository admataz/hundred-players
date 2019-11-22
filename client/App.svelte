<script>
  import Pusher from "pusher-js";
  import Login from "./Login.svelte";
  import PlayerControls from "./PlayerControls.svelte";
  import Arena from "./Arena.svelte";
  import Score from "./Score.svelte";

  export let pusher = null;
  export let usertoken = null;
  export let pusherChannel = null;
  export let isGameHost = false;

  let currentPlayers = [];
  let me = null;
  let playerPositions = {};
  let playerDefaultStartPos = {
    xPos: 0,
    yPos: 0,
    vForce: 0,
    hForce: 0,
    speed: 7
  };
  let startBallPos = {
    xPos: 100,
    yPos: 100,
    speed: 0,
    hForce: 1,
    vForce: 1
  };
  let ballPos = { ...startBallPos };
  let scoreline = [0, 0];
  let arenaSize = { width: 500, height: 200 };

  const setCurrentMembers = pusherMembers => {
    const members = [];
    if (!pusherMembers) {
      return members;
    }
    pusherMembers.each(m => {
      members.push(m);
    });

    isGameHost = pusherChannel.members.me.id === members[0].id
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
      const team = currentPlayers.length % 2

      updatePlayerPositions(me.id, {
        ...playerDefaultStartPos,
        team,
        xPos: team ? arenaSize.width - 10 : 10,
        yPos: Math.random() * arenaSize.height 
      });
    });

    pusherChannel.bind("pusher:member_added", function(member) {
      currentPlayers = setCurrentMembers(pusherChannel.members);
      pusherChannel.trigger("client-player-move", playerPositions[me.id]);
      if(isGameHost){
        pusherChannel.trigger("client-init", {scoreline});
      }
    });

    pusherChannel.bind("pusher:member_removed", function(member) {
      currentPlayers = setCurrentMembers(pusherChannel.members);
    });

    pusherChannel.bind("client-player-move", function(data, meta) {
      updatePlayerPositions(meta.user_id, data);
    });

    pusherChannel.bind("client-ball-bounce", function(data, meta) {
      updateBallPosition(data);
    });

    pusherChannel.bind("client-init", function({scoreline}, meta) {
      updateScoreline(scoreline);
    });

    pusherChannel.bind("client-goal", function(data, meta) {
      updateScoreline(data);
      updateBallPosition(startBallPos);
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
      pusherInit();
    }
  };

  const updatePlayerPositions = (id, position) => {
    playerPositions = {
      ...playerPositions,
      [id]: position
    };
  };

  const updateBallPosition = newBallPos => {
    ballPos = {
      ...startBallPos,
      ...newBallPos
    };
  };

  const updateScoreline = newScoreline => {
    scoreline = newScoreline;
  };

  const onPlayerControl = evt => {
    const position = {
      ...playerDefaultStartPos,
      ...playerPositions[me.id],
      ...evt.detail,
      speed: 7
    };
    updatePlayerPositions(me.id, position);
    pusherChannel.trigger("client-player-move", position);
  };

  const onGoal = evt => {
    const newScoreline = [...scoreline];
    if (evt.detail === "left") {
      newScoreline[0] += 1;
    } else {
      newScoreline[1] += 1;
    }
    if(isGameHost){
      ballPos = startBallPos;
      updateScoreline(newScoreline);
      pusherChannel.trigger("client-goal", newScoreline);
    }

  };

  const onBallCollide = evt => {
    if(isGameHost){
      updateBallPosition(evt.detail);
      pusherChannel.trigger("client-ball-bounce", evt.detail);
    }
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
  <Score {scoreline} />
  <Arena
    {playerPositions}
    {currentPlayers}
    {ballPos}
    on:ballcollide={onBallCollide}
    on:goooooal={onGoal} />
{/if}
