import React from "react";
import ReactDOM from "react-dom/client";
import { io } from "socket.io-client";
import "../src/index.css";
import App from "./App.jsx";

const IPV4 = "192.168.0.32"; //PONER IPCONFIG EN CMD Y LUEGO LA IPV4
export const socket = io(`http://${IPV4}:4000`); //PONER IPCONFIG EN CMD Y LUEGO LA IPV4

socket.on("connect", () => {
  document.querySelector("#databaseStatus").textContent = "Conectado";
  document.querySelector("#databaseStatus").style.color = "#156927";
});

socket.on("connect_error", (error) => {
  document.querySelector("#databaseStatus").textContent = "Desconectado";
  document.querySelector("#databaseStatus").style.color = "rgb(215, 90, 90)";
});

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
