import "@fontsource/inter/400.css";
import "./style.css";
import { label } from "./label.js";
import data from "./data.json";
import logoUrl from "./logo.svg";
import iconUrl from "./icon.svg";
import markUrl from "@/mark.svg";

const $ = (id) => document.querySelector(`#${id}`);

$("env").textContent = `${import.meta.env.MODE} ${import.meta.env.VITE_SITE_NAME}`;
$("data").textContent = data.items.join(",");
$("logo").src = logoUrl;
$("icon").src = iconUrl;
$("mark").src = markUrl;

// Two lazily loaded chunks that share a module, so the build emits a shared chunk.
Promise.all([import("./lazy-a.js"), import("./lazy-b.js")]).then(([a, b]) => {
  $("lazy-a").textContent = a.describe();
  $("lazy-b").textContent = b.describe();
});

const target = $("greeting");
target.textContent = label("loading");
fetch("/api/greeting")
  .then((response) => response.json())
  .then(({ greeting }) => {
    target.textContent = label(greeting);
  });
