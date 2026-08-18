[flujo_evidencia_y_usuarios_cemmu.md](https://github.com/user-attachments/files/31179101/flujo_evidencia_y_usuarios_cemmu.md)
# Esquema de Procesos — Módulo de Evidencia Digital y Gestión de Usuarios CeMMU

Documento descriptivo de arquitectura, flujos operativos y protocolos de seguridad para la incorporación del módulo de **Gestión de Usuarios, Organizaciones y Evidencia Audiovisual Digital** en la plataforma del Centro de Monitoreo de Movilidad Urbana (CeMMU).

---

## 1. Visión General de la Arquitectura

```mermaid
flowchart TD
    subgraph Roles ["👥 Roles y Actores"]
        ADM["🛡️ Administrador CeMMU"]
        OP["🎧 Operador CeMMU"]
        EXT["⚖️ Usuario Externo<br/>(MPF / Fiscalía / Juzgado)"]
    end

    subgraph Portal ["🌐 Plataforma Web CeMMU"]
        AUTH["🔐 Módulo de Autenticación & JWT"]
        USR_MGR["👥 Gestión de Usuarios y Orgs"]
        EVI_INGEST["📤 Ingesta de Evidencia (Upload)"]
        REPO["📂 Repositorio & Buscador"]
    end

    subgraph SecurityStorage ["🛡️ Almacenamiento & Criptografía"]
        AES["🔒 Cifrado AES-256-CBC at-rest"]
        SHA["🛡️ Hasheado SHA-256 (Cadena Custodia)"]
        TOKENS["🔑 Generator de Tokens Temporales"]
        DB[(🗄️ PostgreSQL)]
        FS[("📁 Storage Físico Cifrado<br/>(/data/evidencia/)")]
    end

    ADM --> USR_MGR
    OP --> EVI_INGEST
    EXT --> REPO

    USR_MGR --> DB
    EVI_INGEST --> AES
    EVI_INGEST --> SHA
    AES --> FS
    SHA --> DB
    REPO --> TOKENS
    TOKENS --> AES
```

---

## 2. Flujo 1: Gestión de Usuarios y Organizaciones

### Descripción del Proceso
Permite administrar las identidades digitales de la plataforma, diferenciando el personal interno del CeMMU de los organismos judiciales solicitantes.

```mermaid
sequenceDiagram
    autonumber
    actor Admin as Administrador CeMMU
    participant DB as PostgreSQL
    actor User as Usuario Nuevo (Operador/Externo)

    Note over Admin, DB: 1. Alta de Organización y Usuario
    Admin->>DB: Registra Organización (ej: Fiscalía N°3)
    Admin->>DB: Crea Usuario asociando Rol + Organización + Clave Inicial
    DB-->>Admin: Usuario creado (must_change_password = true)

    Note over User, DB: 2. Primer Inicio de Sesión (Onboarding)
    User->>DB: Inicia sesión en /login con clave inicial
    DB-->>User: Retorna JWT token (must_change_password: true)
    User->>User: Sistema redirige automáticamente a /cambiar-clave
    User->>DB: Define contraseña personal (Min 8 car, 1 mayús, 1 num)
    DB-->>User: Actualiza Hash (must_change_password = false)
    
    Note over User: Redirección automática según rol:<br/>- Externo → /repositorio<br/>- Operador/Admin → /
```

---

## 3. Flujo 2: Ingesta de Evidencia Digital (Upload de Cámaras)

### Descripción del Proceso
Los operadores del CeMMU receptan o extraen fragmentos de video provenientes de las **4 cámaras por unidad de colectivo**:
1. **Frontal (calle)**
2. **Escalera de ascenso**
3. **Asiento del chofer**
4. **Fondo interior**

```mermaid
sequenceDiagram
    autonumber
    actor Operador as Operador CeMMU
    participant Express as Servidor Backend (Express)
    participant Crypto as Módulo Criptográfico
    participant FS as Almacenamiento Cifrado (Disco)
    participant DB as PostgreSQL

    Operador->>Express: Selecciona Línea, Interno, Cámara, Fecha/Hora, Expediente, Descrip. + Archivo (Máx 50MB)
    
    Note over Express, DB: Validación de Reglas de Negocio
    Express->>DB: Consulta si el Expediente ya posee 4 archivos (Límite máximo)
    alt Expediente Completo (>= 4 archivos)
        Express-->>Operador: Rechaza solicitud (Máximo 4 archivos por expediente)
    else Vacante Disponible (< 4 archivos)
        Express->>Crypto: Calcula Hash SHA-256 del archivo original
        Crypto-->>Express: Retorna Checksum único (Integridad probatoria)
        
        Express->>Crypto: Cifra archivo mediante AES-256-CBC (Clave hex 32-bytes)
        Crypto->>FS: Guarda archivo cifrado (.enc) en /data/evidencia/AAAA/MM/
        
        Express->>DB: Inserta registro de metadata + Hash + Ruta Cifrada
        Express->>DB: Registra evento en audit_log (IP, Usuario, Archivo)
        Express-->>Operador: Retorna Confirmación + Checksum SHA-256
    end
```

---

## 4. Flujo 3: Consulta y Descarga Segura (Doble Verificación)

### Descripción del Proceso
Garantiza que la evidencia sea accesible únicamente por personal autenticado, protegiendo la descarga mediante un enlace temporal y verificación cruzada.

```mermaid
sequenceDiagram
    autonumber
    actor Solicitante as Usuario Autenticado (Externo/CeMMU)
    participant Express as Backend Express
    participant DB as PostgreSQL
    participant Crypto as Decryptor Stream
    participant FS as Storage Cifrado

    Solicitante->>Express: Consulta /repositorio con Filtros (Línea, Interno, Expediente, Fecha)
    Express->>DB: Query sobre vista activa de evidencia
    DB-->>Express: Retorna listado de coincidencias
    Express-->>Solicitante: Renderiza Tarjetas de Evidencia con Checksum SHA-256

    Note over Solicitante, FS: Solicitud de Descarga (Doble Verificación)
    Solicitante->>Express: Clic en "📥 Descargar" (Envía Header Bearer JWT + Solicitud)
    Express->>DB: Genera Token de Descarga On-The-Fly (Expiración + Límite descargas)
    
    Express->>DB: Verifica 1) JWT Válido + 2) Token Activo y no Expirado
    alt Validación Exitosa
        Express->>DB: Incrementa contador de descargas
        Express->>DB: Registra evento 'download' en audit_log
        Express->>Crypto: Solicita Stream de Desencriptación
        FS->>Crypto: Lee bytes cifrados (.enc) + IV
        Crypto->>Express: Desencripta al vuelo (On-The-Fly) sin tocar disco en claro
        Express-->>Solicitante: Transfiere archivo original desencriptado (Attachment HTTP)
    else Validación Fallida
        Express-->>Solicitante: Error 401/410 (Sesión o Token inválido/expirado)
    end
```

---

## 5. Matriz de Roles y Permisos

| Módulo / Funcionalidad | Administrador CeMMU | Operador CeMMU | Usuario Externo (MPF/Juzgado) |
|---|:---:|:---:|:---:|
| **Acceso a Panel Registros Frecuencia** | ✅ | ✅ | ❌ |
| **Acceso a Dashboard Analítico** | ✅ | ❌ | ❌ |
| **Gestión de Usuarios (CRUD)** | ✅ | ❌ | ❌ |
| **Gestión de Organizaciones (CRUD)** | ✅ | ❌ | ❌ |
| **Resetear Claves de Terceros** | ✅ | ❌ | ❌ |
| **Upload de Evidencia Digital** | ✅ | ✅ | ❌ |
| **Consulta de Repositorio** | ✅ | ✅ | ✅ |
| **Descarga Directa de Archivos** | ✅ | ✅ | ✅ |
| **Generación de Enlaces Temporales** | ✅ | ✅ | ❌ |
| **Eliminación Definitiva de Evidencia** | ✅ | ❌ | ❌ |
| **Consulta de Logs de Auditoría** | ✅ | ❌ | ❌ |

---

## 6. Ficha Técnica de Seguridad

- **Cifrado en Reposo (At-Rest):** Algoritmo **AES-256-CBC** con Vector de Inicialización (IV) de 16 bytes antepuesto por archivo.
- **Integridad Probatoria:** Hash **SHA-256** calculado pre-cifrado para garantizar la preservación de la cadena de custodia.
- **Trazabilidad Inalterable:** Tabla `audit_log` donde se registra automáticamente cada inicio de sesión, cambio de clave, creación de usuarios, subida de archivos y descargas realizadas con dirección IP y timestamp.
- **Eliminación Física (Hard Delete):** La desvinculación de registros elimina físicamente las entidades de PostgreSQL resguardando automáticamente los registros de auditoría históricos mediante nulificación de claves foráneas.
