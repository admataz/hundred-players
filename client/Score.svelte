<script>
    export let scoreline = [0,0]
    
</script>

<style>
.scoreboard{
    position: flex;
}
.score{
    border-radius: 10px;
    background: black;
    color: gold;
    padding: 10px;
}

</style>


<div class="scoreboard">
    <div class="score">{scoreline[0]}</div>

    <div class="score">{scoreline[1]}</div>
</div>