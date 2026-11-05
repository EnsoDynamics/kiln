// The browser view's entry: bundled fonts, the theme, and the app (PRD AC-LOOK-04).
import "@fontsource/instrument-serif/latin-400.css";
import "@fontsource/instrument-serif/latin-ext-400.css";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-ext-400.css";
import "@fontsource/inter/latin-500.css";
import "@fontsource/inter/latin-ext-500.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-ext-600.css";
import "@fontsource/jetbrains-mono/latin-400.css";
import "@fontsource/jetbrains-mono/latin-ext-400.css";
import "@fontsource/jetbrains-mono/latin-500.css";
import "@fontsource/jetbrains-mono/latin-ext-500.css";
import "./theme.css";
import { mount } from "svelte";
import App from "./App.svelte";
import { pageConfig } from "./lib/api.js";

mount(App, { target: document.getElementById("app")!, props: { config: pageConfig(document) } });
