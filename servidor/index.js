const { Server } = require("socket.io");
const { getPersonaCUIT } = require("./afip");

const PUERTO = 4000;

const io = new Server(PUERTO, {
  cors: {
    origin: "*",
  },
});

io.on("connection", (socket) => {
  socket.on("buscar-cuit", async (cuit) => {
    const data = await getPersonaCUIT(cuit);
    if (data.status === 404) {
      socket.emit("error-buscar-cuit", data.error);
    } else {
      socket.emit("buscar-cuit", data);
    }
  });
  socket.on("factura", (factura) => {
    console.log(factura);
  });
});
