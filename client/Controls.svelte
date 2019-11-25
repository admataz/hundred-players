<script>
  import { createEventDispatcher } from "svelte";
  const dispatch = createEventDispatcher();

  export let dir = { hForce: 0, vForce: 0 };
  export let activeKeys = new Map();
  export let sequence = "";

  function goLeft() {
    sequence = `${sequence}h`;
    dir = { vForce: 0, hForce: -1 };
  }

  function goRight() {
    sequence = `${sequence}l`;
    dir = { vForce: 0, hForce: 1 };
  }

  function goUp() {
    sequence = `${sequence}k`;
    dir = { hForce: 0, vForce: -1 };
  }

  function goDown() {
    sequence = `${sequence}j`;
    dir = { hForce: 0, vForce: 1 };
  }

  function hitA() {
    sequence = `${sequence}a`;
  }
  function hitB() {
    sequence = `${sequence}b`;
  }

  function goStop() {
    dir = { vForce: 0, hForce: 0 };
  }

  const onKeyDown = evt => {
    // debounce
    if (activeKeys.get(evt.key)) {
      return;
    }
    activeKeys.set(evt.key, true);

    switch (evt.key) {
      case "j":
      case "ArrowDown":
        goDown();
        return;
      case "k":
      case "ArrowUp":
        goUp();
        return;
      case "h":
      case "ArrowLeft":
        goLeft();
        return;
      case "l":
      case "ArrowRight":
        goRight();
        return;
      case "a":
        hitA();
        return;
      case "b":
        hitB();
        return;
      default:
        return null;
    }
  };

  const onKeyUp = evt => {
    activeKeys.set(evt.key, false);
    if (sequence.match("kkjjhlhlba")) {
      console.log("Konami!!");
      sequence = "";
    }
    switch (evt.key) {
      case "j":
      case "ArrowDown":
      case "k":
      case "ArrowUp":
      case "h":
      case "ArrowLeft":
      case "l":
      case "ArrowRight":
        goStop();
        return;
      default:
        return null;
    }
  };
  $: dispatch("controls", dir);
</script>

<style>
.controls-container{
    bottom: 0;
    width: 100%;

}
  .controls {
    display: flex;
    flex-direction: column;
    width: 100%;
    border: 1px solid #000;
      
  }
  .controls .button-row{
      display: flex;
      width: 100%;
      justify-content: center;
      align-content: center;
  }

  button{
      flex: 1;
      margin: 2px;
      max-width: 100px;
      height: 48px;
      border-radius: 21px;
      border-color: #000;
      border-width: 4px;
  }
  .minor-buttons button{
      padding: 2px;
      height: 42px;
      max-width: 42px 
  }
</style>

<svelte:window on:keydown={onKeyDown} on:keyup={onKeyUp} />
<div class="controls-container">
<div class="controls">
  <div class="button-row minor-buttons">
    <button on:mousedown={hitA} on:mouseup={goStop} on:touchstart={hitA} on:touchend={goStop}>A</button>
    <button on:mousedown={hitB} on:mouseup={goStop} on:touchstart={hitB} on:touchend={goStop}>B</button>
  </div>
  <div class="button-row">
    <button on:mousedown={goUp} on:mouseup={goStop} on:touchstart={goUp} on:touchend={goStop}>Up</button>
  </div>
  <div class="button-row">
    <button on:mousedown={goLeft} on:mouseup={goStop} on:touchstart={goLeft} on:touchend={goStop}>left</button>
    <button on:mousedown={goRight} on:mouseup={goStop} on:touchstart={goRight} on:touchend={goStop}>right</button>
  </div>
  <div class="button-row">
    <button on:mousedown={goDown} on:mouseup={goStop} on:touchstart={goDown} on:touchend={goStop}>down</button>
  </div>
</div>

</div>
