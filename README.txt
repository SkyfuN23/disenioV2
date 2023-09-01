FRONTEND:

En el programa lo único que se puede escribir es CUIT, IMPORTE y DESCRIPCION.

Con respecto al CUIT, al escribir el último número (como anterior programa) busca en la base de 
datos de AFIP y trae todos los datos. Darle formato XX-XXXXXXXX-X y sacar flechitas.
Vamos a mostrar en el div con class "muestraRazonSocial" la razón social o 
nombre de la persona, y en el div con class "muestraCondFrenteIva" si es MONOTRIBUTISTA, 
RESPONSABLE INSCRIPTO o EXENTO o CONSUMIDOR FINAL. En caso de que el campo de CUIT no tenga nada
debe aparecer CONSUMIDOR FINAL. 
A tener en cuenta: Cuando se recarga o se abre la pagina debe aparecer el CUIT sin nada y 
COND. FRENTE AL IVA: CONSUMIDOR FINAL, y luego al boton LIMPIAR DATOS se le asigna la 
funcion de recargar la pagina.

Al TOTAL hay que agregarle un signo $ fijo y ponerle formato 45,000.50

BOTON ENVIAR:

Al apretar el boton enviar debe detectar si es CONSUMIDOR FINAL u OTRO.

-Si es OTRO (o sea EXENTO, RESPONSABLE INSCRIPTO o MONOTRIBUTISTA) se abre un MODAL para confirmar factura

-Si es CONSUMIDOR FINAL debe analizar si es un importe > 45000 o no.
En caso de que el importe sea mayor a 45000, se debe agregar 3 INPUT
NOMBRE: (NO TIENE QUE SER OBLIGATORIO PARA MANDAR)
DNI: (TIENE QUE SER OBLIGATORIO)
DOMICILIO: (NO TIENE QUE SER OBLIGATORIO)
Estas 3 cosas van a salir impresas

BACKEND:

Vamos a tomar los datos y hacer la factura que corresponda (mismo que anterior programa)

Si es MONOTRIBUTISTA o RESPONSABLE INSCRIPTO, se hace FACTURA A
Si es EXENTO o CONSUMIDOR FINAL se hace factura B


EN LA FACTURA (mismo que antes):

En MONOTRIBUTISTA, RESPONSABLE INSCRIPTO, EXENTO vamos a obtener datos de AFIP (incluido domicilio que no se usó
para la factura)

En CONSUMIDOR FINAL, si fue mayor a 45000 vamos a imprimir DNI, NOMBRE, DOMICILIO que llenamos en el modal