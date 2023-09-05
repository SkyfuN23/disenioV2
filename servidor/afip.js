const fs = require("fs");
const { Wsaa, Wsfe, Wspci } = require("afipjs");

var pem = fs.readFileSync("certdami/pipillas.crt", "utf8");
var key = fs.readFileSync("certdami/pipillas.key", "utf8");

let prev_ta = "";

const confInicial = {
  prod: true,
  debug: false,
  cuit: "20418963906",
};

async function getTA(config) {
  const wsaa = new Wsaa(config);
  wsaa.setCertificate(pem);
  wsaa.setKey(key);
  const ta = wsaa.createTAFromString(prev_ta);
  if (ta.isValid()) {
    return ta;
  }
  const tra = wsaa.createTRA();
  const newTa = await tra.supplicateTA();
  prev_ta = newTa.TA;
  return newTa;
}

async function tiposDeIva() {
  const config = {
    ...confInicial,
    service: "wsfe",
  };
  const TA = await getTA(config);
  const wsfe = new Wsfe(TA, config);
  const response = await wsfe.FEParamGetTiposIva({});
  console.dir(response, { depth: null });
}

function obtenerNombre(cuit, response) {
  let nombre;
  if (cuit[0] === "2") {
    nombre = `${response.personaReturn.datosGenerales.nombre} ${response.personaReturn.datosGenerales.apellido}`;
  } else {
    nombre = `${response.personaReturn.datosGenerales.razonSocial}`;
  }
  return nombre;
}

function obtenerDomicilio(response) {
  let domicilio = `${response.personaReturn.datosGenerales.domicilioFiscal.direccion}`;
  let localidad = `${response.personaReturn.datosGenerales.domicilioFiscal.localidad}`;
  let provincia = `${response.personaReturn.datosGenerales.domicilioFiscal.descripcionProvincia}`;
  return `${domicilio} - ${localidad}, ${provincia}`;
}

function obtenerCondIva(response) {
  if (response.personaReturn.hasOwnProperty("datosMonotributo")) {
    return "MONOTRIBUTO";
  }
  if (response.personaReturn.hasOwnProperty("datosRegimenGeneral")) {
    for (impuesto of response.personaReturn.datosRegimenGeneral.impuesto) {
      if (impuesto.descripcionImpuesto === "IVA") {
        return "RESPONSABLE INSCRIPTO";
      } else if (impuesto.descripcionImpuesto === "IVA EXENTO") {
        return "IVA EXENTO";
      }
    }
    console.log("NO SE ENCONTRO NADA!");
  }
  return "CONSUMIDOR FINAL";
}

async function getPersonaCUIT(cuit) {
  try {
    const config = {
      ...confInicial,
      service: "ws_sr_constancia_inscripcion",
    };
    const TA = await getTA(config);
    const wspci = new Wspci(TA, config);
    const response = await wspci.getPersona_v2({
      cuitRepresentada: "20418963906",
      idPersona: cuit,
    });
    const nombre = obtenerNombre(cuit, response);
    const condIva = obtenerCondIva(response);
    const domicilio = obtenerDomicilio(response);
    return {
      nombre,
      condIva,
      domicilio,
      status: 200,
    };
  } catch (error) {
    return {
      status: 404,
      error: `${error}`,
    };
  }
}

async function facturar({
  cuit,
  total,
  domicilio,
  descripcion,
  razonSocial,
  condIva,
  dni,
  nombre,
  domicilioCF,
  codigoFactura,
}) {
  const config = {
    ...confInicial,
    service: "wsfe",
  };
  const TA = await getTA(config);
  const wsfe = new Wsfe(TA, config);
  const puntoDeVenta = 4;
  const ultimoAutorizado = await wsfe.FECompUltimoAutorizado({
    PtoVta: 4,
    CbteTipo: codigoFactura,
  });

  /**
   * Tipo de documento del comprador
   *
   * Opciones:
   *
   * 80 = CUIT
   * 86 = CUIL
   * 96 = DNI
   * 99 = Consumidor Final
   **/

  let docTipo = 99;
  let docNro = 0;

  let importe_total = parseFloat(total).toFixed(2);
  let importe_gravado = (importe_total / 1.21).toFixed(2);
  let importe_iva = (importe_total - importe_gravado).toFixed(2);
  let importe_exento = 0;

  if (dni.length > 6 && condIva === "CONSUMIDOR FINAL") {
    docTipo = 96;
    docNro = dni;
  }

  if (condIva === "IVA EXENTO") {
    docTipo = 80;
    docNro = cuit;
  }

  if (condIva === "MONOTRIBUTO") {
    docTipo = 80;
    docNro = cuit;
  }

  if (condIva === "RESPONSABLE INSCRIPTO") {
    docTipo = 80;
    docNro = cuit;
  }

  const fecha = new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
    .toISOString()
    .split("T")[0];

  const factura = {
    FeCAEReq: {
      FeCabReq: {
        CantReg: 1,
        PtoVta: puntoDeVenta,
        CbteTipo: codigoFactura,
      },
      FeDetReq: {
        FECAEDetRequest: {
          Concepto: 3,
          DocTipo: docTipo,
          DocNro: docNro,
          CbteDesde: ultimoAutorizado.FECompUltimoAutorizadoResult.CbteNro + 1,
          CbteHasta: ultimoAutorizado.FECompUltimoAutorizadoResult.CbteNro + 1,
          CbteFch: parseInt(fecha.replace(/-/g, "")),
          ImpTotal: importe_total,
          ImpTotConc: 0.0,
          ImpNeto: importe_gravado,
          ImpOpEx: importe_exento,
          ImpTrib: 0.0,
          ImpIVA: importe_iva,
          MonId: "PES",
          MonCotiz: 1,
          Iva: [
            {
              Id: 5,
              BaseImp: importe_gravado,
              Importe: importe_iva,
            },
          ],
        },
      },
    },
  };

  console.dir(factura, { depth: null });

  //const response = await wsfe.FECAESolicitar(factura);
  //console.dir(response, { depth: null });
}

module.exports = {
  getPersonaCUIT,
  facturar,
};
