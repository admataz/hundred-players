<script>
  export let xPos = 0;
  export let yPos = 0;
</script>

<style>
  .ball {
    position: absolute;
    border: 1px solid #000;
    border-radius: 50%;
    width: 20px;
    height: 20px; 
  }
</style>

<div class="ball" style="top:{`${yPos}px`}; left:{`${xPos}px`}" />
