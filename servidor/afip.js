const fs = require("fs");
const { Wsaa, Wsfe, Wspci } = require("afipjs");
const { print } = require("pdf-to-printer");
const puppeteer = require("puppeteer");
const qr = require('qr-image')

//CAMBIAR CERTIFICADO
var pem = fs.readFileSync("certdiseño/disenio.crt", "utf8");
var key = fs.readFileSync("certdiseño/disenio.key", "utf8");

let prev_ta = "";
let lastService = "wsfe";

const CUIT = 30688093240;

const confInicial = {
  prod: true,
  debug: false,
  cuit: CUIT, //CAMBIAR CUIT
};

async function getTA(config) {
  const wsaa = new Wsaa(config);
  wsaa.setCertificate(pem);
  wsaa.setKey(key);
  const ta = wsaa.createTAFromString(prev_ta);
  if (ta.isValid() && lastService === config.service) {
    return ta;
  }
  const tra = wsaa.createTRA();
  const newTa = await tra.supplicateTA();
  prev_ta = newTa.TA;
  lastService = config.service;
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

//CAMBIAR PERSONA REPRESENTADA
async function getPersonaCUIT(cuit) {
  try {
    const config = {
      ...confInicial,
      service: "ws_sr_constancia_inscripcion",
    };
    const TA = await getTA(config);
    const wspci = new Wspci(TA, config);
    const response = await wspci.getPersona_v2({
      cuitRepresentada: CUIT,
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

  const numeroComprobante =
    ultimoAutorizado.FECompUltimoAutorizadoResult.CbteNro + 1;

  let docTipo = 99;
  let docNro = 0;

  let importe_total = parseFloat(total).toFixed(2);
  let importe_gravado = (importe_total / 1.21).toFixed(2);
  let importe_iva = (importe_total - importe_gravado).toFixed(2);

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

  // ESTO ES PARA CbteFch
  const fecha = new Date(Date.now() - new Date().getTimezoneOffset() * 60000)
    .toISOString()
    .split("T")[0];

  // ESTO ES PARA EL FchServDesde, FchServHasta y FchVtoPago
  const today = new Date();
  const year = today.getFullYear();
  const month = (today.getMonth() + 1).toString().padStart(2, "0");
  const day = today.getDate().toString().padStart(2, "0");
  const formattedDate = parseInt(year + month + day);
  const fecha_servicio_desde = formattedDate;
  const fecha_servicio_hasta = formattedDate;
  const fecha_vencimiento_pago = formattedDate;

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
          CbteDesde: numeroComprobante,
          CbteHasta: numeroComprobante,
          CbteFch: parseInt(fecha.replace(/-/g, "")),
          FchServDesde: fecha_servicio_desde,
          FchServHasta: fecha_servicio_hasta,
          FchVtoPago: fecha_vencimiento_pago,
          ImpTotal: importe_total,
          ImpTotConc: 0.0,
          ImpNeto: importe_gravado,
          ImpOpEx: 0,
          ImpTrib: 0.0,
          ImpIVA: importe_iva,
          MonId: "PES",
          MonCotiz: 1,
          Iva: {
            AlicIva: [
              {
                Id: 5,
                BaseImp: importe_gravado,
                Importe: importe_iva,
              }
            ]
          }
        },
      },
    },
  };

  const response = await wsfe.FECAESolicitar(factura);

  //console.dir(response, { depth: null });

  const CAE = response.FECAESolicitarResult.FeDetResp.FECAEDetResponse[0].CAE;
  const vtoCAE =
    response.FECAESolicitarResult.FeDetResp.FECAEDetResponse[0].CAEFchVto;

  let formattedDateString = year + "-" + month + "-" + day;
  let object = {
    ver: 1,
    fecha: formattedDateString,
    cuit: CUIT,
    ptoVta: puntoDeVenta,
    tipoCmp: codigoFactura,
    nroCmp: numeroComprobante,
    importe: parseFloat(importe_total),
    moneda: "PES",
    ctz: 1,
    tipoDocRec: docTipo,
    nroDocRec: parseFloat(docNro),
    tipoCodAut: "E",
    codAut: parseInt(CAE),
  };
  const jsonString = JSON.stringify(object);
  const buffer = Buffer.from(jsonString, "utf-8");
  const base64String = buffer.toString("base64");
  let qr_svg = qr.image(
    `https://serviciosweb.afip.gob.ar/genericos/comprobantes/cae.aspx?p=${base64String}`,
    { type: "png" }
  );
  qr_svg.pipe(fs.createWriteStream("./images/qr-afip.png"));

  const data = {
    docNro,
    docTipo,
    domicilio,
    descripcion,
    razonSocial,
    condIva,
    nombre,
    domicilioCF,
    codigoFactura,
    numeroComprobante,
    importe_total,
    importe_gravado,
    importe_iva,
    CAE,
    vtoCAE,
  };

  await crearPDF(data, "ORIGINAL");
  await crearPDF(data, "DUPLICADO");
}

async function crearPDF(
  {
    docNro,
    docTipo,
    domicilio,
    descripcion,
    razonSocial,
    condIva,
    nombre,
    domicilioCF,
    codigoFactura,
    numeroComprobante,
    importe_total,
    importe_gravado,
    importe_iva,
    CAE,
    vtoCAE,
  },
  copia
) {
  const style = `
  <style>
    .container {
      margin-left: 9px;
      /* margin-top: 2px; */
      width: 20cm;
      height: 14.01cm;
      border: 1px solid;
      position: relative;
  }
  
  .cajaOriginal {
      position: relative;
      border-bottom: 1px solid;
      width: 20cm;
      height: 0.5cm;
  }
  
  .cajaGrande {
      border-bottom: 1px solid;
      width: 20cm;
      height: 4cm;
      position: relative;
  }
  
  .cajaB {
      width: 1.5cm;
      height: 1.5cm;
      border: 1px solid;
      border-top: 0;
      position: absolute;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      top: 1cm;
      left: calc(51% - 1cm);
      transform: translateY(-66%);
  }
  
  .lineaDivisoria {
      height: 2.505cm;
      border-right: 1px solid;
      border-top: 0;
      position: absolute;
      left: calc(54.88% - 1cm);
      transform: translateY(60%);
  }
  
  .contenidoCajaGrande {
      display: flex;
  }
  
  .cajaDiseño {
      width: 10cm;
      height: 4cm;
      display: flex;
      flex-direction: column;
      justify-content: space-around;
  }
  
  .cajaFactura {
      width: 10cm;
      height: 4cm;
  }
  
  .b {
      font-size: 30px;
      font-weight: bold;
  }
  
  .original {
      font-weight: bold;
      text-align: center;
      padding-top: 1px;
  }
  
  .titulo {
      font-weight: bold;
      font-size: 25px;
      text-align: center;
      color: rgb(35, 35, 129);
  }
  
  .infoDiseño {
      margin-left: 8px;
      font-size: 13px;
      font-weight: bold;
  }
  
  .cod {
      font-size: 10px;
      font-weight: bold;
  }
  
  .factura {
      font-weight: bold;
      font-size: 25px;
      margin-left: 50px;
      margin-top: 12px;
  }
  
  .nroOrden {
      display: flex;
  }
  
  .nroFactura {
      margin-left: 16px;
      margin-top: 10px;
      display: flex;
      justify-content: space-evenly;
      font-weight: bold;
      font-size: 13px;
  }
  
  .datosAFIP {
      font-size: 13px;
      font-weight: bold;
      margin-top: 4px;
      margin-left: 50px;
  }
  
  .flexInfoDiseño {
      display: flex;
      font-size: 13px;
  }
  
  .infoDiseñoDatos {
      margin-left: 7px;
  }
  
  .nroDatos {
      margin-left: 7px;
      font-size: 14px;
  }
  
  .contenedorDatosAFIP {
      display: flex;
  }
  
  .infoFecha {
      margin-left: 7px;
      font-size: 14px;
  }
  
  .datosAFIPcontenido {
      font-size: 13px;
      margin-top: 4px;
      margin-left: 7px;
  }
  
  .cajaCliente {
      margin-top: 2px;
      border-top: 1px solid;
      border-bottom: 1px solid;
      height: 2cm;
      font-size: 13px;
      display: flex;
  }
  
  .grupo1 {
      width: 8cm;
      padding-left: 8px;
      display: flex;
      flex-direction: column;
      justify-content: space-around;
  }
  
  .grupo2 {
      width: 12cm;
      height: 2cm;
      display: flex;
      flex-direction: column;
      justify-content: space-around;
      padding-right: 8px;
  }
  
  .tituloCliente {
      font-weight: bold;
  }
  
  .cliente {
      display: flex;
  }
  
  .contenidoCliente {
      font-size: 13px;
      margin-left: 7px;
  }
  
  .descripcion {
      width: 12cm;
      font-size: 13px;
  }
  
  .subtotales {
      width: 4cm;
      font-size: 13px;
  }
  
  th {
      border: 1px solid;
      border-bottom: 1px solid;
      background-color: rgb(232, 232, 232);
  }
  
  td {
      font-size: 14px;
  }
  
  .tdDescripcion {
      padding-left: 15px;
  }
  
  .tdSubtotales {
      text-align: center;
  }
  
  .tabla {
      height: 4.3cm;
      border-bottom: 1px solid;
      position: relative;
  }
  
  .contenedorFooter {
      height: 114px;
      display: flex;
  }
  
  .divQR {
      padding-left: 1px;
      width: 10cm;
      display: flex;
      align-items: center;
  }
  
  .divTotal {
      width: 10cm;
      display: flex;
      align-items: center;
  }
  
  .qr {
      width: 30%;
  }
  
  .CAE {
      font-size: 13px;
      font-weight: bold;
      padding-bottom: 7px;
      padding-top: 7px;
      padding-left: 7px;
  }
  
  .comprobanteAutorizado {
      font-size: 15px;
      font-style: italic;
  }
  
  .contenedorCAE {
      display: flex;
  }
  
  .infoCAE {
      font-size: 13px;
      padding-bottom: 7px;
      padding-top: 7px;
      padding-left: 7px;
  }
  
  .importeTitulo {
      font-size: 14px;
      font-weight: bold;
      padding-top: 7px;
      padding-bottom: 7px;
  }
  
  .flexImporte {
      display: flex;
  }
  
  .infoImporte {
      font-size: 14px;
      padding-top: 7px;
      padding-bottom: 7px;
      padding-left: 10px;
      font-weight: bolder;
  }
  
  .grupoTitulos {
      text-align: right;
      padding-left: 2.6cm;
  }
    </style>`;

  const htmlContent = `
<!DOCTYPE html>
<html lang="en">

<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Document</title>
    ${style}
</head>

<body>
    <div class="container">
        <div class="cajaOriginal">
            <div class="original">${copia}</div>
        </div>
        <div class="cajaGrande">
            <div class="cajaB">
                <div class="b">${codigoFactura === 6 ? "B" : "A"}</div>
                <div class="cod">COD. 00${codigoFactura}</div>
            </div>
            <div class="lineaDivisoria"></div>
            <div class="contenidoCajaGrande">
                <div class="cajaDiseño">
                    <div class="titulo">DISEÑO INTERIOR <br> Revestimiento y Decoración</div>
                    <div class="flexInfoDiseño">
                        <div class="infoDiseño">Razón Social:</div>
                        <div class="infoDiseñoDatos">MAS DANIEL SEBASTIAN Y FERNANDO S H</div>
                    </div>
                    <div class="flexInfoDiseño">
                        <div class="infoDiseño">Domicilio Comercial:</div>
                        <div class="infoDiseñoDatos">Zelarrayan 376 - Bahia Blanca, Buenos Aires</div>
                    </div>
                    <div class="infoDiseño">Condición frente al IVA:&nbsp; &nbsp;IVA Responsable Inscripto</div>
                </div>
                <div class="cajaFactura">
                    <div class="factura">FACTURA</div>
                    <div class="nroFactura">
                        <div class="nroOrden">
                            <div>Punto de Venta:</div>
                            <div class="nroDatos">00004</div>
                        </div>
                        <div class="nroOrden">
                            <div>Comp. Nro:</div>
                            <div class="nroDatos">${numeroComprobante
      .toString()
      .padStart(8, "0")}</div>
                        </div>
                    </div>
                    <div class="contenedorDatosAFIP datosAFIP">
                        <div>Fecha de Emisión:</div>
                        <div class="infoFecha">${new Date().toLocaleDateString()}</div>
                    </div>
                    <div class="contenedorDatosAFIP">
                        <div class="datosAFIP">CUIT:</div>
                        <div class="datosAFIPcontenido">30688093240</div>
                    </div>
                    <div class="contenedorDatosAFIP">
                        <div class="datosAFIP">Ingresos Brutos:</div>
                        <div class="datosAFIPcontenido">30-68809324-0</div>
                    </div>
                    <div class="contenedorDatosAFIP">
                        <div class="datosAFIP">Fecha de Inicio de Actividades:</div>
                        <div class="datosAFIPcontenido">01/01/1997</div>
                    </div>
                </div>
            </div>
        </div>
        <div class="cajaCliente">
            <div class="grupo1">
                <div class="cliente">
                    <div class="tituloCliente">CUIT/DNI:</div>
                    <div class="contenidoCliente">${docNro === 0 ? "" : docNro
    }</div>
                </div>
                <div class="cliente">
                    <div class="tituloCliente">Condición frente al IVA:</div>
                    <div class="contenidoCliente">${condIva}</div>
                </div>
            </div>
            <div class="grupo2">
                <div class="cliente">
                    <div class="tituloCliente">Apellido y Nombre / Razón Social:</div>
                    <div class="contenidoCliente">${docTipo === 96 ? nombre : razonSocial
    }</div>
                </div>
                <div class="cliente">
                    <div class="tituloCliente">Domicilio:</div>
                    <div class="contenidoCliente">${docTipo === 96 ? domicilioCF : domicilio
    }</div>
                </div>
            </div>
        </div>
        <div class="tabla">
            <table>
                <thead>
                    <tr>
                        <th class="descripcion">Descripción</th>
                        <th class="subtotales">${codigoFactura == 6 ? "" : "Subtotal"
    }</th>
                        <th class="subtotales">${codigoFactura == 6 ? "Subtotal" : "Subtotal C/IVA"
    }</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td class="tdDescripcion">${descripcion}</td>
                        <td class="tdSubtotales">${codigoFactura == 6 ? "" : importe_gravado
    }</td>
                        <td class="tdSubtotales">${importe_total}</td>
                    </tr>
                </tbody>
            </table>
        </div>
        <div class="contenedorFooter">
            <div class="divQR">
                <img class="qr" src="./images/qr-afip.png" alt="">
                <div>
                    <div class="CAE comprobanteAutorizado">Comprobante Autorizado</div>
                    <div class="contenedorCAE">
                        <div class="CAE">
                            CAE:
                        </div>
                        <div class="infoCAE">
                            ${CAE}
                        </div>
                    </div>
                    <div class="contenedorCAE">
                        <div class="CAE">
                            Vencimiento CAE:
                        </div>
                        <div class="infoCAE">
                            ${vtoCAE}
                        </div>
                    </div>
                </div>
            </div>
            <div class="divTotal">
                <div class="grupoTitulos">
                    <div class="importeTitulo">${codigoFactura == 6
      ? "Subtotal"
      : "Importe Neto Gravado: $"
    }</div>
                    <div class="importeTitulo">${codigoFactura == 6 ? "" : "IVA 21%: $"
    }</div>
                    <div class="importeTitulo">Importe Total: $</div>
                </div>
                <div>
                    <div class="infoImporte">${codigoFactura == 6 ? importe_total : importe_gravado
    }</div>
                    <div class="infoImporte">${codigoFactura == 6 ? "" : importe_iva
    }</div>
                    <div class="infoImporte">${importe_total}</div>
                </div>
            </div>
        </div>
    </div>

</body>

</html>`;

  const browser = await puppeteer.launch({
    headless: "new",
  });
  const page = await browser.newPage();
  fs.writeFileSync("index.html", htmlContent);
  const htmlPath = `${__dirname}/index.html`;

  await page.goto(`file://${htmlPath}`);

  const path = `facturas/${numeroComprobante}-${copia === "ORIGINAL" ? "O" : "D"
    }.pdf`;

  await page.pdf({
    path,
    format: "A4",
    printBackground: true,
  });

  await browser.close();

  await print(path);
}

module.exports = {
  getPersonaCUIT,
  facturar,
};
