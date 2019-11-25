<script>
import {createEventDispatcher} from 'svelte'
const dispatch = createEventDispatcher()

export let username
export const onSubmit = (evt) =>  {
    dispatch('submit', username)
}


</script>

<form id="registrationForm" on:submit|preventDefault={onSubmit}>
  <label>your initials</label>
  <input bind:value={username} autofocus maxlength="2" size="2">
  <input type="submit" value="go">
</form>