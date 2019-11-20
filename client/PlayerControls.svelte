<script>

import {createEventDispatcher} from 'svelte'
const dispatch = createEventDispatcher();

export let dir = {hForce: 0, vForce: 0}
export let activeKeys = new Map();
export let sequence = '';

const onKeyDown = (evt) => {
    // debounce
    if(activeKeys.get(evt.key)){
        return
    }
    activeKeys.set(evt.key, true)
    
    switch(evt.key){
        case 'j':
        case 'ArrowDown':
            sequence = `${sequence}j`
            dir = {hForce:0, vForce:1}
            return
        case 'k':
        case 'ArrowUp':
            sequence = `${sequence}k`
            dir = {hForce:0, vForce:-1}
            return
        case 'h':
        case 'ArrowLeft':
            sequence = `${sequence}h`
            dir = {vForce:0, hForce:-1}
            return
        case 'l':
        case 'ArrowRight':
            sequence = `${sequence}l`
            dir = {vForce:0, hForce:1}
            return
        case 'a':
            sequence = `${sequence}a`
            return
        case 'b':
            sequence = `${sequence}b`
            return
        default: 
            return null
    }
}

const onKeyUp = (evt) => {
    activeKeys.set(evt.key, false)
    if(sequence.match('kkjjhlhlba')){
        console.log('Konami!!')
        sequence = '';
    }
    switch(evt.key){
        case 'j':
        case 'ArrowDown':
        case 'k':
        case 'ArrowUp':
        case 'h':
        case 'ArrowLeft':
        case 'l':
        case 'ArrowRight':
            dir = {vForce:0, hForce:0}
            return
        default: 
            return null
    }
}
$: dispatch('controls', dir)

</script>



<svelte:window on:keydown={onKeyDown}  on:keyup={onKeyUp}  />

