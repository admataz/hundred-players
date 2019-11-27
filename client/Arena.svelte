<script>
  import { createEventDispatcher } from "svelte";
  import Player from "./Player.svelte";
  import Ball from "./Ball.svelte";
  import Goal from "./Goal.svelte";
  export let playerPositions = {};
  export let renderedPlayers = [];
  export let currentPlayers = [];
  export let ballPos = {
    xPos: 50,
    yPos: 50,
    speed: 0,
    hForce: 1,
    vForce: 1
  };

  const dispatch = createEventDispatcher();

  export let playerFriction = 0.05;
  export let ballFriction = 0.08;

  export let arenaSize = { width: 100, height: 100 };
  export let goalSize = 30;
  export let collisionProximity = 2.8;
  export let kickVariation = 1.5;

  let containerWidth;
  let containerHeight;

  const animStep = () => {
    Object.entries(playerPositions).forEach(([key, p]) => {
      if (p.speed > playerFriction / 2) {
        p.speed -= playerFriction;
      } else {
        p.speed = 0;
      }
      if (ballPos.speed > ballFriction / 2) {
        ballPos.speed -= ballFriction;
      } else {
        ballPos.speed = 0;
      }

      const newxPos = p.xPos + p.hForce * p.speed;
      if (0 < newxPos && arenaSize.width > newxPos) {
        p.xPos = newxPos;
      }

      const newyPos = p.yPos + p.vForce * p.speed;
      if (0 < newyPos && arenaSize.height > newyPos) {
        p.yPos = newyPos;
      }

      if (
        Math.abs(ballPos.xPos - p.xPos) <= collisionProximity &&
        Math.abs(ballPos.yPos - p.yPos) <= collisionProximity
      ) {
        ballPos.speed = p.speed * 2;
        if (p.xPos > ballPos.xPos) {
          ballPos.hForce = -1 * (Math.random() * kickVariation);
          ballPos.xPos -= collisionProximity;
        } else {
          ballPos.hForce = Math.random() * kickVariation;
          ballPos.xPos += collisionProximity;
        }

        if (p.yPos > ballPos.yPos) {
          ballPos.yPos -= collisionProximity;
          ballPos.vForce = -1 * (Math.random() * kickVariation);
        } else {
          ballPos.yPos += collisionProximity;
          ballPos.vForce = Math.random() * kickVariation;
        }
        dispatch("ballcollide", ballPos);
      }
    });

    renderedPlayers = currentPlayers.map(m => ({
      ...m,
      ...playerPositions[m.id]
    }));

    if (ballPos.xPos >= arenaSize.width) {
      if (
        arenaSize.height / 2 - goalSize / 2 < ballPos.yPos &&
        arenaSize.height / 2 + goalSize / 2 > ballPos.yPos
      ) {
        dispatch("goooooal", "right");
      } else {
        ballPos.hForce = -1;
      }
    }

    if (ballPos.xPos < 0) {
      if (
        arenaSize.height / 2 - goalSize / 2 < ballPos.yPos &&
        arenaSize.height / 2 + goalSize / 2 > ballPos.yPos
      ) {
        dispatch("goooooal", "left");
      } else {
        ballPos.hForce = 1;
      }
    }

    if (ballPos.yPos >= arenaSize.height) {
      ballPos.vForce = -1;
    }

    if (ballPos.yPos < 0) {
      ballPos.vForce = 1;
    }

    ballPos = {
      ...ballPos,
      xPos: ballPos.xPos + ballPos.hForce * ballPos.speed,
      yPos: ballPos.yPos + ballPos.vForce * ballPos.speed
    };
    window.requestAnimationFrame(animStep);
  };
  animStep();

  $: goalPosts = {
    top: arenaSize.height / 2 - goalSize / 2,
    bottom: arenaSize.height / 2 + goalSize / 2
  };
</script>

<style>
  main {
    border: 1px solid #000;
    position: relative;
  }
  .svgcanvas {
    width: 100%;
    height: 100%;
    position: absolute;
  }
  .linemarkings {
    position: absolute;
    width: 100%;
    height: 100%;
  }

  .playingfield {
    background: green;
    width: 100%;
    height: 100%;
    position: relative;
  }

  .line {
    stroke: white;
    opacity: 0.5;
    stroke-width: 5;
    fill: none;
  }
</style>

<main class="playingfield">
  <svg class="linemarkings">
    <g class="line">
      <circle cx="50%" cy="50%" r="20%" />
      <circle cx="50%" cy="50%" r="5" />
      <line x1="50%" x2="50%" y1="0" y2="100%" />
    </g>
  </svg>

  <svg class="svgcanvas">
    <Goal side="left" {goalPosts} size={goalSize} />
    <Goal side="right" {goalPosts} size={goalSize} />
    <Ball {...ballPos} />
    {#each renderedPlayers as player}
      <Player {player} xPos={player.xPos} yPos={player.yPos} konami={player.konamiEnabled} />
    {/each}
  </svg>

</main>
