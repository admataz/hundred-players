<script>
  export let player;
  export let xPos = 0;
  export let yPos = 0;
</script>

<style>
  .player {
    position: absolute;
  }
</style>

<div class="player" style="top:{`${yPos}px`}; left:{`${xPos}px`}">{player.info.name}</div>
