<script>
    export let scoreline = [0,0]
    
</script>

<style>
.scoreboard{
    display: flex;
    justify-content: center;
}
.score{
    border-radius: 10px;
    background: black;
    color: gold;
    padding: 10px;
    flex: 0 1 64px;
    margin: 4px;
    text-align: center;
    font-size: 32px;
}

.team {
    width: 10px;
margin: 4px;
}

.team-1{
    background-color: red;
}

.team-0{
    background-color: blue;
}

</style>


<div class="scoreboard">
    <div class="team team-1"></div>
    <div class="score">{scoreline[1]}</div>
    <div class="score">{scoreline[0]}</div>
    <div class="team team-0"></div>
</div>