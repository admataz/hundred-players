<script>
  export let player;
  export let xPos = 0;
  export let yPos = 0;
</script>

<style>
  .player {
    position: absolute;
    border: 2px solid #000;
    padding: 2px;
    border-radius: 5px;
  }
  .team-0{
      border-color: red
  }

  .team-1{
      border-color: blue;
  }
</style>

<div class="player team-{player.team}" style="top:{`${yPos}px`}; left:{`${xPos}px`}">{player.info.name}</div>
