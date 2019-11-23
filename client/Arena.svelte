<script>
  import { createEventDispatcher } from "svelte";
  import Player from "./Player.svelte";
  import Ball from "./Ball.svelte";
  import Goal from "./Goal.svelte";
  export let playerPositions = {};
  export let renderedPlayers = [];
  export let currentPlayers = [];
  export let ballPos = {
    xPos: 200,
    yPos: 100,
    speed: 0,
    hForce: 1,
    vForce: 1
  };

  const dispatch = createEventDispatcher();

  export let playerFriction = 0.2;
  export let ballFriction = 0.1;

  export let arenaSize = { width: 500, height: 200 };
  export let goalSize = 100;

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

      const newyPos = p.yPos + p.vForce * p.speed
      if (0 <  newyPos && arenaSize.height > newyPos) {
        p.yPos = newyPos
      }

      if (
        Math.abs(ballPos.xPos - p.xPos) < 20 &&
        Math.abs(ballPos.yPos - p.yPos) < 20
      ) {
        ballPos.speed = p.speed * 1.5;
        if (p.xPos > ballPos.xPos) {
          ballPos.hForce = -1 * Math.random();
          ballPos.xPos -= 10;
        } else {
          ballPos.hForce = Math.random();
          ballPos.xPos += 10;
        }

        if (p.yPos > ballPos.yPos) {
          ballPos.yPos -= 10;
          ballPos.vForce = -1 * Math.random();
        } else {
          ballPos.yPos += 10;
          ballPos.vForce = Math.random();
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

  // $: console.log(playerPositions);
</script>

<style>
  main {
    border: 1px solid #000;
    position: relative;
  }
</style>

<main style="width:{arenaSize.width}px; height: {arenaSize.height}px">

  <Goal side="left" />
  <Goal side="right" />
  <Ball {...ballPos} />
  {#each renderedPlayers as player}
    <Player {player} xPos={player.xPos} yPos={player.yPos} />
  {/each}

  <svg />
</main>
