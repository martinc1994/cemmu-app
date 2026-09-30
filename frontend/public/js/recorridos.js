/**
 * Catálogo Oficial de Líneas, Ramales y Puntos de Control CeMMU
 * Fuente: LineasRecorridos.xlsx
 * Incluye direcciones oficiales y coordenadas GPS (Lat, Long) para cartografía
 */

const RECORRIDOS = [
  // Línea 1
  { linea: "1", ramal: "Mitre", valor: "L1 Mitre", direccion: "9 de Julio 1900", coordenadas: "-26.856647255514257, -65.21097120824176", lat: -26.856647255514257, lng: -65.21097120824176 },
  { linea: "1", ramal: "Salta", valor: "L1 Salta", direccion: "9 de Julio 1900", coordenadas: "-26.856647255514257, -65.21097120824176", lat: -26.856647255514257, lng: -65.21097120824176 },

  // Línea 3
  { linea: "3", ramal: "Lavalle", valor: "L3 Lavalle", direccion: "Lavalle 2300", coordenadas: "-26.83395703527508, -65.23468769309511", lat: -26.83395703527508, lng: -65.23468769309511 },
  { linea: "3", ramal: "Piedras", valor: "L3 Piedras", direccion: "General Paz 2300", coordenadas: "-26.83063099788736, -65.2333572168177", lat: -26.83063099788736, lng: -65.2333572168177 },

  // Línea 4
  { linea: "4", ramal: "Colombres", valor: "L4 Colombres", direccion: "Mario Bravo 400", coordenadas: "-26.830399903178737, -65.17655551320043", lat: -26.830399903178737, lng: -65.17655551320043 },
  { linea: "4", ramal: "Colombres Costanera", valor: "L4 Colombres Costanera", direccion: "Mario Bravo 400", coordenadas: "-26.830399903178737, -65.17655551320043", lat: -26.830399903178737, lng: -65.17655551320043 },
  { linea: "4", ramal: "Mercofrut", valor: "L4 Mercofrut", direccion: "Av. Democracia 50", coordenadas: "-26.868805012582456, -65.20861568210655", lat: -26.868805012582456, lng: -65.20861568210655 },
  { linea: "4", ramal: "Mercofrut Alejandro Heredia", valor: "L4 Mercofrut Alejandro Heredia", direccion: "Av. Democracia 50", coordenadas: "-26.868805012582456, -65.20861568210655", lat: -26.868805012582456, lng: -65.20861568210655 },
  { linea: "4", ramal: "Mercofrut Autopista", valor: "L4 Mercofrut Autopista", direccion: "Av. Democracia 50", coordenadas: "-26.868805012582456, -65.20861568210655", lat: -26.868805012582456, lng: -65.20861568210655 },

  // Línea 5
  { linea: "5", ramal: "Agrimensor", valor: "L5 Agrimensor", direccion: "25 de Mayo 1900", coordenadas: "-26.804884274870748, -65.19859593928943", lat: -26.804884274870748, lng: -65.19859593928943 },
  { linea: "5", ramal: "B. Oeste (25 de Mayo)", valor: "L5 B. Oeste (25 de Mayo)", direccion: "25 de Mayo 1900", coordenadas: "-26.804884274870748, -65.19859593928943", lat: -26.804884274870748, lng: -65.19859593928943 },
  { linea: "5", ramal: "B. Oeste (Funes)", valor: "L5 B. Oeste (Funes)", direccion: "25 de Mayo 1900", coordenadas: "-26.804884274870748, -65.19859593928943", lat: -26.804884274870748, lng: -65.19859593928943 },
  { linea: "5", ramal: "El Molino (SEOC)", valor: "L5 El Molino (SEOC)", direccion: "25 de Mayo 1900", coordenadas: "-26.804884274870748, -65.19859593928943", lat: -26.804884274870748, lng: -65.19859593928943 },

  // Línea 6
  { linea: "6", ramal: "San Alberto", valor: "L6 San Alberto", direccion: "Buenos Aires 1700", coordenadas: "-26.854070141702895, -65.21184893832763", lat: -26.854070141702895, lng: -65.21184893832763 },
  { linea: "6", ramal: "San José (Cangallo)", valor: "L6 San José (Cangallo)", direccion: "Buenos Aires 1700", coordenadas: "-26.854070141702895, -65.21184893832763", lat: -26.854070141702895, lng: -65.21184893832763 },
  { linea: "6", ramal: "San José (Democracia)", valor: "L6 San José (Democracia)", direccion: "Buenos Aires 1700", coordenadas: "-26.854070141702895, -65.21184893832763", lat: -26.854070141702895, lng: -65.21184893832763 },

  // Línea 7
  { linea: "7", ramal: "AGET", valor: "L7 AGET", direccion: "Rivadavia 2100", coordenadas: "-26.802722617237563, -65.19492141807899", lat: -26.802722617237563, lng: -65.19492141807899 },
  { linea: "7", ramal: "Occonors", valor: "L7 Occonors", direccion: "Rivadavia 2100", coordenadas: "-26.802722617237563, -65.19492141807899", lat: -26.802722617237563, lng: -65.19492141807899 },

  // Línea 8
  { linea: "8", ramal: "El Bosque", valor: "L8 El Bosque", direccion: "Av. Benjamín Aráoz 950", coordenadas: "-26.83556335634568, -65.18200339207327", lat: -26.83556335634568, lng: -65.18200339207327 },
  { linea: "8", ramal: "San Cayetano (Sáenz Peña)", valor: "L8 San Cayetano (Sáenz Peña)", direccion: "Berutti 500", coordenadas: "-26.855081019045684, -65.19466185887457", lat: -26.855081019045684, lng: -65.19466185887457 },
  { linea: "8", ramal: "San Cayetano (Terán)", valor: "L8 San Cayetano (Terán)", direccion: "Berutti 500", coordenadas: "-26.855081019045684, -65.19466185887457", lat: -26.855081019045684, lng: -65.19466185887457 },

  // Línea 9
  { linea: "9", ramal: "Bulnes", valor: "L9 Bulnes", direccion: "Av. Pres. Néstor Kirchner 2300", coordenadas: "-26.837774940105756, -65.23568830453632", lat: -26.837774940105756, lng: -65.23568830453632 },
  { linea: "9", ramal: "Viamonte", valor: "L9 Viamonte", direccion: "Av. Pres. Néstor Kirchner 2300", coordenadas: "-26.837774940105756, -65.23568830453632", lat: -26.837774940105756, lng: -65.23568830453632 },

  // Línea 10
  { linea: "10", ramal: "San Cayetano", valor: "L10 San Cayetano", direccion: "Berutti 200", coordenadas: "-26.80679831785621, -65.14236685267007", lat: -26.80679831785621, lng: -65.14236685267007 },
  { linea: "10", ramal: "Villa Amalia", valor: "L10 Villa Amalia", direccion: "Congreso 2700", coordenadas: "-26.866629101730116, -65.21156141180815", lat: -26.866629101730116, lng: -65.21156141180815 },

  // Línea 11
  { linea: "11", ramal: "11 de Marzo", valor: "L11 11 de Marzo", direccion: "Av. Américo Vespucio 1700", coordenadas: "-26.85429434278507, -65.23079025439108", lat: -26.85429434278507, lng: -65.23079025439108 },
  { linea: "11", ramal: "Manantial Sur", valor: "L11 Manantial Sur", direccion: "Antonio Perez Palavecino 2899", coordenadas: "-26.866442330187947, -65.25299992700963", lat: -26.866442330187947, lng: -65.25299992700963 },
  { linea: "11", ramal: "Villa Angelina", valor: "L11 Villa Angelina", direccion: "Jujuy 4300", coordenadas: "-26.88289296267311, -65.22753057294312", lat: -26.88289296267311, lng: -65.22753057294312 },

  // Línea 12
  { linea: "12", ramal: "Municipal", valor: "L12 Municipal", direccion: "Ramírez de Velazco 1700", coordenadas: "-26.79669198513023, -65.21553436604661", lat: -26.79669198513023, lng: -65.21553436604661 },
  { linea: "12", ramal: "Smata", valor: "L12 Smata", direccion: "Santiago del Estero 200", coordenadas: "-26.825024500170215, -65.19879443197794", lat: -26.825024500170215, lng: -65.19879443197794 },

  // Línea 17
  { linea: "17", ramal: "Alem Universidad", valor: "L17 Alem Universidad", direccion: "Alem 1200", coordenadas: "-26.844484400656285, -65.22232678257619", lat: -26.844484400656285, lng: -65.22232678257619 },
  { linea: "17", ramal: "Chañaritos", valor: "L17 Chañaritos", direccion: "Amador Lucero 3200", coordenadas: "-26.86507720366796, -65.24090521516837", lat: -26.86507720366796, lng: -65.24090521516837 },
  { linea: "17", ramal: "Ejército Argentino", valor: "L17 Ejército Argentino", direccion: "Alem 1200", coordenadas: "-26.844484400656285, -65.22232678257619", lat: -26.844484400656285, lng: -65.22232678257619 },
  { linea: "17", ramal: "Roca Universidad", valor: "L17 Roca Universidad", direccion: "Alem 1200", coordenadas: "-26.844484400656285, -65.22232678257619", lat: -26.844484400656285, lng: -65.22232678257619 },
  { linea: "17", ramal: "Terán Roca", valor: "L17 Terán Roca", direccion: "Alem 1200", coordenadas: "-26.844484400656285, -65.22232678257619", lat: -26.844484400656285, lng: -65.22232678257619 },
  { linea: "17", ramal: "Terán San Lorenzo", valor: "L17 Terán San Lorenzo", direccion: "Alem 1200", coordenadas: "-26.844484400656285, -65.22232678257619", lat: -26.844484400656285, lng: -65.22232678257619 },

  // Línea 18
  { linea: "18", ramal: "Antihorario", valor: "L18 Antihorario", direccion: "Av. Sáenz Peña 800", coordenadas: "-26.843273060838108, -65.19965085502058", lat: -26.843273060838108, lng: -65.19965085502058 },
  { linea: "18", ramal: "Horario", valor: "L18 Horario", direccion: "Av. Sáenz Peña 800", coordenadas: "-26.843273060838108, -65.19965085502058", lat: -26.843273060838108, lng: -65.19965085502058 },

  // Línea 19
  { linea: "19", ramal: "Antihorario", valor: "L19 Antihorario", direccion: "Av. América 1700", coordenadas: "-26.798807365140895, -65.24584220269058", lat: -26.798807365140895, lng: -65.24584220269058 },
  { linea: "19", ramal: "Horario", valor: "L19 Horario", direccion: "Av. América 1700", coordenadas: "-26.798807365140895, -65.24584220269058", lat: -26.798807365140895, lng: -65.24584220269058 }
];

// Diccionario de compatibilidad con versiones previas de nombres (para migración transparente de localStorage / historial)
const RECORRIDOS_ALIASES = {
  "L3 Marcos Paz": "L3 Piedras",
  "L3 Auxiliar": "L3 Piedras",
  "L4 Colombres-Costanera": "L4 Colombres Costanera",
  "L4 Mercofrut-Autopista": "L4 Mercofrut Autopista",
  "L4 Mercofrut-A. Heredia": "L4 Mercofrut Alejandro Heredia",
  "L5 El Molino-SEOC": "L5 El Molino (SEOC)",
  "L5 Oeste x 25": "L5 B. Oeste (25 de Mayo)",
  "L5 Oeste x Dean Funes": "L5 B. Oeste (Funes)",
  "L6 San Jose x Cangallo": "L6 San José (Cangallo)",
  "L6 San Jose x Democracia": "L6 San José (Democracia)",
  "L7 O' connors": "L7 Occonors",
  "L7 O'connors": "L7 Occonors",
  "L8 San Cayetano x S. Peña": "L8 San Cayetano (Sáenz Peña)",
  "L8 San Cayetano x B. Teran": "L8 San Cayetano (Terán)",
  "L10 V. Amalia": "L10 Villa Amalia",
  "L11 B 11 de Marzo": "L11 11 de Marzo",
  "L11 V. Angelina": "L11 Villa Angelina",
  "L12 SMATA Manantial Sur": "L12 Smata",
  "L12 SMATA San Miguel": "L12 Smata",
  "L17 Alem-Universidad": "L17 Alem Universidad",
  "L17 Ejercito Arg": "L17 Ejército Argentino",
  "L17 Ejercito Argentino": "L17 Ejército Argentino",
  "L17 Roca-Universidad": "L17 Roca Universidad",
  "L17 Teran-Roca": "L17 Terán Roca",
  "L17 Teran-San Lorenzo": "L17 Terán San Lorenzo"
};

/**
 * Busca un recorrido por su valor exacto o alias
 */
function buscarRecorrido(valor) {
  if (!valor) return null;
  const normalizado = RECORRIDOS_ALIASES[valor] || valor;
  return RECORRIDOS.find(r => r.valor === normalizado) ||
         RECORRIDOS.find(r => r.valor.toLowerCase() === normalizado.toLowerCase()) || null;
}

/**
 * Obtiene la dirección (Punto de control) asociada a un recorrido
 */
function obtenerPuntoDeControl(valor) {
  const item = buscarRecorrido(valor);
  return item ? item.direccion : "";
}

// Exponer en window para el navegador
if (typeof window !== "undefined") {
  window.RECORRIDOS = RECORRIDOS;
  window.RECORRIDOS_ALIASES = RECORRIDOS_ALIASES;
  window.buscarRecorrido = buscarRecorrido;
  window.obtenerPuntoDeControl = obtenerPuntoDeControl;
}

// Exportar para Node.js si se requiere en backend
if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    RECORRIDOS,
    RECORRIDOS_ALIASES,
    buscarRecorrido,
    obtenerPuntoDeControl
  };
}
