<script>
import {createEventDispatcher} from 'svelte'
const dispatch = createEventDispatcher()

export let username
export const onSubmit = (evt) =>  {
    dispatch('submit', username)
}
</script>

<style>
.registration-form-container{
  width: 100%;
  height: 100%;
  border: 3px solid #000;
  display: flex;
  justify-content: center;
  align-items: center;
  background: green;
}

#registrationForm{
  display: flex;
  justify-content: center;
  align-items: center;
  flex-direction: column;
  width: 340px;
  height: 340px;
  background: rgba(255, 255, 255, 0.5);
  padding: 20px;
  border: 2px solid yellow;
  text-align:center;
}

label{
  margin: 10px;
  font-size: 24px;
  font-weight: bold;
}

.input-text{
  width: 3em;
  font-size: 24px;
  font-weight: bold;
  text-align: center;
  display:block;
}

.input-button{
  width: 64px;
  height: 64px;
  display:block;
  border-radius: 50%;
  border: 2px solid #000;
}

</style>
<div class="registration-form-container">
<form id="registrationForm" on:submit|preventDefault={onSubmit}>

  <label>Your initials <br/>(2 characters)</label>
  <input class="input-text" bind:value={username} autofocus maxlength="2" size="2">
  <input class="input-button" type="submit" value="go">
</form>
</div>