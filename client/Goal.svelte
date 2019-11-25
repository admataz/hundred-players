<script>
  export let side = "left";
  export let size = 80;
  export let goalPosts = {
    top: 10,
    bottom: 10
  }
</script>


<svg 
x="{side==='left'? 0 : 100}%"
y="{goalPosts.top}%"
overflow="visible">
  <rect  
    stroke-width="2"  
    stroke="#fff"
    fill="none"
    stroke-dasharray="4"
    opacity="1"
    width="10"
    height="{size}%"
    x="{side==='left' ? 0 : -10}"
    />

</svg>
