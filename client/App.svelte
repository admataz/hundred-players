<script>
  import Pusher from "pusher-js";
  import Login from "./Login.svelte";
  import Controls from "./Controls.svelte";
  import Arena from "./Arena.svelte";
  import Score from "./Score.svelte";
  import ReceivedMessages from './ReceivedMessages.svelte'

  export let pusher = null;
  export let usertoken = null;
  export let pusherChannel = null;
  export let messagesChannel = null;
  export let isGameHost = false;

  let receivedMessages = [];
  let currentPlayers = [];
  let me = null;
  let playerPositions = {};
  let playerDefaultStartPos = {
    xPos: 0,
    yPos: 0,
    vForce: 0,
    hForce: 0,
    speed: 3
  };
  let startBallPos = {
    xPos: 50,
    yPos: 50,
    speed: 0,
    hForce: 1,
    vForce: 1
  };
  let ballPos = { ...startBallPos };
  let scoreline = [0, 0];
  let arenaSize = { width: 100, height: 100 };
  let playerSpeed = 1;

  const setCurrentMembers = pusherMembers => {
    const members = [];
    if (!pusherMembers) {
      return members;
    }
    pusherMembers.each(m => {
      members.push(m);
    });

    isGameHost = pusherChannel.members.me.id === members[0].id;
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
    messagesChannel = pusher.subscribe("lnug-game-cheers");

    pusherChannel.bind("pusher:subscription_succeeded", function(members) {
      currentPlayers = setCurrentMembers(pusherChannel.members);
      me = pusherChannel.members.me;
      const team = currentPlayers.length % 2;

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
      if (isGameHost) {
        pusherChannel.trigger("client-init", { scoreline });
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

    pusherChannel.bind("client-init", function({ scoreline }, meta) {
      updateScoreline(scoreline);
    });

    pusherChannel.bind("client-goal", function(data, meta) {
      updateScoreline(data);
      updateBallPosition(startBallPos);
    });

    messagesChannel.bind('twitter-hoorah', function(data){
      receivedMessages = [...receivedMessages, data]
    })
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
      speed: playerSpeed
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
    if (isGameHost) {
      ballPos = startBallPos;
      updateScoreline(newScoreline);
      pusherChannel.trigger("client-goal", newScoreline);
    }
  };

  const onBallCollide = evt => {
    if (isGameHost) {
      updateBallPosition(evt.detail);
      pusherChannel.trigger("client-ball-bounce", evt.detail);
    }
  };
</script>

<style>
  .gamearea {
    display: flex;
    flex-direction: column;
    justify-content: center;
    height: 100%;
  }
  .scoreboard{
      flex: 0 1 0;
      background-color: #999;
  }
  .arena{
      flex: 1

  }
  .controls{
    background-color: #efefef;
      flex: 0 1 0;
  }
 
 .messagesbanner{
   flex: 0 1 0;

 }


</style>

{#if !usertoken}

  <Login on:submit={onSubmit} />
{:else}

  <div class="gamearea">
    <div class="messagesbanner">
       <ReceivedMessages messages={receivedMessages} />
    </div>
    <div class="scoreboard">
      <Score {scoreline} />
    </div>

    <div class="arena">
      <Arena
        {playerPositions}
        {currentPlayers}
        {ballPos}
        on:ballcollide={onBallCollide}
        on:goooooal={onGoal} />
    </div>

    <div class="controls">
      <Controls on:controls={onPlayerControl} />
      <div class="greeting">
        {#if me}Hello {me.info.name}!{/if}
      </div>
    </div>


  </div>
{/if}
