<script>    
    import {slide} from 'svelte/transition/'
    export let messages = [];
    let currentMessageIndex = 0
    let currentMessageText = ''
    let displayMessageText = false
    let messagePosition = 100
    
    function switchMessages(){
        if(!messages.length){
            return
        }
        displayMessageText = false
            

        setTimeout(()=>{
            currentMessageIndex +=1;
            currentMessageText = messages[currentMessageIndex%messages.length].tweet
            displayMessageText = true
            messagePosition = 100;
            
        }, 1000)
    }

    let messageTimer = setInterval(switchMessages, 10000)

    function scrollMessage(){
        messagePosition -= 1;
        window.requestAnimationFrame(scrollMessage);
    }
    scrollMessage();

</script>

<style>
  .received-messages {
    background-color: #000;
    color: #fff;
    width: 100%;
    height: 24px;
    position: relative;
    overflow: hidden;
    font-size: 12px;
    padding: 2px;
  }

  .message {
    position: absolute;
    white-space: nowrap;
  }



    
  

</style>

<div class="received-messages">
    {#if displayMessageText}
    <div class="message" transition:slide  style="left:{messagePosition}px">{currentMessageText}</div>
    {/if}

</div>
