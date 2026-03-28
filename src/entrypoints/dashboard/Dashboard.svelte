<script lang="ts">
  let iframe: HTMLIFrameElement = null!;

  onMount(() => {
    console.log(iframe);
  });

  const SPACEPORT = "https://spaceport.mystrikingly.com/";
</script>

<div class="text-white bg-slate-600 h-screen w-screen flex">
  <aside class="w-50 shrink-0">
    <button>Spaceport</button>
  </aside>
  <div class="grow bg-slate-500 flex items-center justify-center p-6">
    <iframe
      bind:this={iframe}
      title="Stage"
      src="https://4feelings.mystrikingly.com/"
      class="w-full h-full bg-white"
    ></iframe>
  </div>
</div>
