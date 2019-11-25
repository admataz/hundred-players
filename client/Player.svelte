<script>
  export let player;
  export let xPos = 0;
  export let yPos = 0;
</script>

<style>
  .player {
    fill: none;
    stroke-width: 2;
    stroke: #fff;
  }

  .player-name {
    font-size: 10px;
    text-transform: uppercase;
    fill: #999;
  }
  .team-0 {
    fill: red;
  }

  .team-1 {
    fill: blue;
  }
</style>

<svg y="{yPos}%" x="{xPos}%" overflow="visible">
  <text class="player-name team-{player.team}" x="12" y="5">
    {player.info.name}
  </text>
    <rect
    class="player team-{player.team}"
    width="20"
    height="20"
    rx="5"
    x="-10"
    y="-10" />
    <circle
      r="2"
      fill="yellow"
      />
</svg>


 