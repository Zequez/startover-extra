import "virtual:uno.css";
import Dashboard from "./Sidepanel.svelte";
import { mount } from "svelte";

mount(Dashboard, {
  target: document.getElementById("app")!,
});
