import React, { useEffect, useState } from "react";
import { socket } from "./main.jsx";

function App() {
  const [cuit, setCuit] = useState("");
  const [total, setTotal] = useState("");
  const [domicilio, setDomicilio] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [razonSocial, setRazonSocial] = useState("");
  const [condIva, setCondIva] = useState("CONSUMIDOR FINAL");

  const [nuevosInputs, setNuevosInputs] = useState(false);

  const handleLimpiar = () => {
    setCuit("");
    setTotal("");
    setDomicilio("");
    setDescripcion("");
    setRazonSocial("");
    setCondIva("CONSUMIDOR FINAL");
  };

  const buscarHandler = () => {
    socket.emit("buscar-cuit", cuit);
    document.querySelector("#buscando").textContent = "Buscando...";
  };

  const enviarHandler = () => {
    if (
      total > 46000 &&
      nuevosInputs === false &&
      condIva === "CONSUMIDOR FINAL"
    ) {
      setNuevosInputs(true);
    } else {
      const factura = {
        cuit,
        total,
        domicilio,
        descripcion,
        razonSocial,
        condIva,
      };
      socket.emit("factura", factura);
    }
  };

  useEffect(() => {
    socket.on("buscar-cuit", (data) => {
      setRazonSocial(data.nombre);
      setCondIva(data.condIva);
      setDomicilio(data.domicilio);
      document.querySelector("#buscando").textContent = "";
    });
    socket.on("error-buscar-cuit", (error) => {
      alert(error);
      document.querySelector("#buscando").textContent = "";
    });
    return () => {
      socket.off("error-buscar-cuit");
      socket.off("buscar-cuit");
    };
  }, []);

  return (
    <div className="contenedorPrincipal">
      <div className="titulo">
        INGRESE EL NUMERO DE CUIT Y CORROBORE LA INFORMACION PROPORCIONADA
        (DEJAR EN BLANCO PARA CONSUMIDOR FINAL)
      </div>
      <button className="btnLimpiar" onClick={handleLimpiar}>
        LIMPIAR DATOS
      </button>
      <div className="contenedorCuit">
        <div className="tituloCuit">CUIT:</div>
        <input
          className="inputCuit"
          type="number"
          value={cuit}
          onChange={(e) => setCuit(e.target.value)}
        />
        <button onClick={buscarHandler} className="botonBuscar">
          Buscar
        </button>
        <span id="buscando"></span>
      </div>
      <div className="contenedorRazonSocial">
        <div className="tituloRazonSocial">RAZON SOCIAL:</div>
        <div className="muestraRazonSocial">{razonSocial}</div>
      </div>
      <div className="contenedorCondFrenteIva">
        <div className="tituloCondFrenteIva">COND. FRENTE AL IVA:</div>
        <div className="muestraCondFrenteIva">{condIva}</div>
      </div>
      <div className="contenedorCondFrenteIva">
        <div className="tituloCondFrenteIva">DOMICILIO:</div>
        <div className="muestraCondFrenteIva">{domicilio}</div>
      </div>
      <div className="contenedorDescripcion">
        <div className="tituloDescripcion">DESCRIPCIÓN</div>
        <input
          className="inputDescripcion"
          value={descripcion}
          onChange={(e) => setDescripcion(e.target.value)}
        />
      </div>
      <div className="contenedorTotal">
        <div className="tituloTotal">TOTAL:</div>
        <input
          className="inputTotal"
          type="number"
          value={total}
          onChange={(e) => setTotal(e.target.value)}
        />
      </div>
      <button
        onClick={() => setNuevosInputs((prev) => !prev)}
        className="btnIdentificar"
      >
        IDENTIFICAR CONSUMIDOR FINAL
      </button>
      {nuevosInputs && (
        <>
          <div>
            <div>DNI:</div>
            <input type="number" />
          </div>
          <div>
            <div>NOMBRE:</div>
            <input type="number" />
          </div>
          <div>
            <div>DOMICILIO:</div>
            <input type="number" />
          </div>
        </>
      )}
      <button onClick={enviarHandler} className="btnEnviar">
        ENVIAR
      </button>
    </div>
  );
}

export default App;
