import "./style.css";
import { label } from "./label.js";

const target = document.querySelector("#greeting");
target.textContent = label("loading");
fetch("/api/greeting")
  .then((response) => response.json())
  .then(({ greeting }) => {
    target.textContent = label(greeting);
  });
