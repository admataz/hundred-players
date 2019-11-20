<script>
import {createEventDispatcher} from 'svelte'
const dispatch = createEventDispatcher()

export let username
export const onSubmit = (evt) =>  {
    dispatch('submit', username)
}


</script>

<form id="registrationForm" on:submit|preventDefault={onSubmit}>
  <input bind:value={username} autofocus>
  <input type="submit" value="go">
</form>