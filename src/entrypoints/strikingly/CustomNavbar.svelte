<script lang="ts">
  import { onMount, tick } from "svelte";
  import {
    extractNavDataAndTheme,
    removeNavbar,
    type ExtractedNavData,
  } from "@/lib/replaceNavbar";

  let navData = $state<ExtractedNavData | null>(null);

  onMount(async () => {
    navData = extractNavDataAndTheme(document);

    console.log("NAV DATA", navData); // DO NOT REMOVE

    if (navData == null) {
      return;
    }

    await tick();
    removeNavbar(document);
  });

  function styleValue(value: string | null | undefined, fallback: string) {
    if (value == null || value.trim().length === 0) {
      return fallback;
    }

    return value;
  }

  function backgroundColor() {
    return styleValue(navData?.theme.backgroundColor, "#ffffff");
  }

  function textColor() {
    return styleValue(navData?.theme.textColor, "#111827");
  }

  function brandHref() {
    return document.location.href;
  }
</script>

{#if navData != null}
  <nav
    data-startover-extra-custom-navbar=""
    style:position={"relative"}
    style:top={"0"}
    style:z-index={"30"}
    style:width={"100%"}
    style:box-sizing={"border-box"}
    style:background-color={backgroundColor()}
    style:color={textColor()}
    style:border-bottom={"1px solid"}
    style:border-color={textColor()}
    style:font-family={"sans-serif"}
  >
    <div
      style:max-width={"1280px"}
      style:margin={"0 auto"}
      style:padding={"16px 20px"}
      style:box-sizing={"border-box"}
    >
      <div
        style:display={"flex"}
        style:flex-wrap={"wrap"}
        style:align-items={"center"}
        style:justify-content={"space-between"}
        style:gap={"24px"}
      >
        <a
          href={brandHref()}
          style:display={"inline-flex"}
          style:align-items={"center"}
          style:gap={"12px"}
          style:min-width={"0"}
          style:text-decoration={"none"}
          style:color={textColor()}
        >
          {#if navData.img != null}
            <img
              src={navData.img}
              alt={navData.title ?? "Site logo"}
              style:width={"64px"}
              style:height={"64px"}
              style:flex-shrink={"0"}
              style:object-fit={"contain"}
            />
          {/if}
          {#if navData.title != null}
            <span
              style:font-size={"18px"}
              style:font-weight={"700"}
              style:line-height={"1.2"}
            >
              {navData.title}
            </span>
          {/if}
        </a>

        <div
          style:display={"flex"}
          style:flex-wrap={"wrap"}
          style:align-items={"center"}
          style:justify-content={"flex-end"}
          style:gap={"20px"}
        >
          {#each navData.links as link}
            <a
              href={link.href}
              style:text-decoration={"none"}
              style:font-size={"14px"}
              style:font-weight={"700"}
              style:line-height={"1.4"}
              style:color={textColor()}
            >
              {link.label}
            </a>
          {/each}

          {#if navData.navBtn != null}
            <a
              href={navData.navBtn.href}
              style:display={"inline-flex"}
              style:align-items={"center"}
              style:justify-content={"center"}
              style:padding={"12px 16px"}
              style:border={"1px solid"}
              style:border-color={textColor()}
              style:border-radius={"1000px"}
              style:background-color={textColor()}
              style:color={backgroundColor()}
              style:text-decoration={"none"}
              style:font-size={"14px"}
              style:font-weight={"700"}
              style:line-height={"1.2"}
            >
              {navData.navBtn.label}
            </a>
          {/if}
        </div>
      </div>
    </div>
  </nav>
{/if}

<style>
  a:hover {
    text-decoration: underline !important;
  }
</style>
