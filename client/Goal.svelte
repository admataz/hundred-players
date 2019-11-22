<script>
  export let side = "left";
  export let size = 80;
  export let pos = 20;
</script>

<style>
  .goal {
    border: 1px solid #000;
    width: 10px;
    position: absolute;
  }
</style>

<div class="goal" style="height:{size}px; top:{pos}px;  bottom:{pos}px; {side}:0" />
