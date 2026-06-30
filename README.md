# Aseguradora ProSalud Frontend

Interfaz web (SPA) que funciona como **simulador / banco de pruebas** del validador externo de cobertura de pólizas. Permite consultar la [**Aseguradora ProSalud API**](../aseguradora-prosalud-api), verificar su estado (healthcheck), **registrar nuevos asegurados** con su porcentaje de cobertura y visualizar si una póliza está **APROBADA** (con su porcentaje de cobertura) o **RECHAZADA**.

>Este simulador toca el proveedor directamente solo por ser un banco de pruebas. En producción, únicamente el **Adaptador Aseguradora** debe invocar la API — nunca el SPA del usuario interno.

## Arquitectura y Tecnologías

- **React 19** con **Vite 8** (HMR, build de producción)
- **Tailwind CSS v4** (entrada `@import "tailwindcss";` en `src/index.css`)
- **ESLint** para linting
- Consumo de la API vía `fetch` con autenticación por **API Key** en cabecera

## Iniciar el Proyecto

### Requisitos previos

- **Node.js 22** (o >= 18)
- La [Aseguradora ProSalud API](../aseguradora-prosalud-api) corriendo en `http://localhost:4001`

### Instalación

```bash
npm install
```

### Desarrollo

```bash
npm run dev
```

La aplicación arranca en `http://localhost:5173` (si el puerto está ocupado, Vite usa el siguiente disponible). El simulador verifica automáticamente `GET /health` al cargar.

### Build de producción

```bash
npm run build
npm run preview   # previsualiza el build localmente
```

## Configuración

La conexión al proveedor está definida en `src/App.jsx`:

| Constante  | Valor por defecto          | Descripción                                       |
| ---------- | -------------------------- | ------------------------------------------------- |
| `BASE_URL` | `http://localhost:4001`    | URL base de la Aseguradora ProSalud API           |
| `API_KEY`  | `prosalud_secret_key_2026` | Clave enviada en la cabecera `X-Api-Key`          |

> El backend ya habilita **CORS**. Si cambias el puerto del front y la petición se bloquea, revisa la configuración de `cors` en `aseguradora-prosalud-api/src/app.js`.

## Contrato de la API

### Validación de cobertura

- **Ruta:** `GET /api/v1/asegurados/validar`
- **Headers:** `X-Api-Key: <API_KEY>`
- **Query params:** `tipoDocumento` (`DNI` | `CE` | `PASAPORTE`) y `numeroDocumento`

```
GET /api/v1/asegurados/validar?tipoDocumento=DNI&numeroDocumento=12345678
```

- **Respuesta — APROBADA (200):**

```json
{
  "asegurado": true,
  "numeroPoliza": "POL-2024-001",
  "plan": "Plan Salud Plus",
  "porcentajeCobertura": 80,
  "vigencia": { "fechaInicio": "2024-01-01", "fechaFin": "2026-12-31" }
}
```

- **Respuesta — RECHAZADA (200):** la API **no** detalla el motivo (no existe, vencida o suspendida se resuelven todos igual).

```json
{ "asegurado": false }
```

### Registro de asegurados

La pestaña **"Registrar asegurado"** da de alta un nuevo asegurado con su póliza.

- **Ruta:** `POST /api/v1/asegurados`
- **Headers:** `X-Api-Key: <API_KEY>`, `Content-Type: application/json`
- **Body obligatorio:** `nombre`, `apellido`, `tipoDocumento`, `numeroDocumento`, `porcentajeCobertura` (0–100).
- **Body opcional:** `plan` (UI), y `numeroPoliza` / `fechaInicio` (hoy) / `fechaFin` (+1 año) / `estado` (`VIGENTE`) que el backend autogenera si se omiten.
- **Respuestas:** `201` creado · `400` datos inválidos · `409` documento o póliza duplicados · `401` API Key.

Tras un alta exitosa, el botón **"Validar este documento →"** salta a la pestaña de validación con los datos ya cargados.

### Validación del número de documento

El número se valida en el cliente (y también en el servidor) según el tipo:

| Tipo        | Regla                                | Ejemplo     |
| ----------- | ------------------------------------ | ----------- |
| `DNI`       | Exactamente **8 dígitos** numéricos  | `12345678`  |
| `CE`        | **6 a 12** caracteres alfanuméricos  | `CE123456`  |
| `PASAPORTE` | **6 a 12** caracteres alfanuméricos  | `US9988776` |

Para `DNI` el campo solo acepta dígitos y se limita a 8; para `CE`/`PASAPORTE` acepta alfanuméricos hasta 12. El botón de registro permanece deshabilitado hasta que el documento cumpla la regla de su tipo.

## Datos de Prueba

Provienen del seed real del backend (`sql/02_seed.sql`). La UI los expone como accesos rápidos:

| Tipo | Documento  | Resultado                          |
| ---- | ---------- | ---------------------------------- |
| DNI  | `12345678` | Aprobada · 80% (Plan Salud Plus)   |
| DNI  | `87654321` | Aprobada · 50% (Plan Básico)       |
| CE   | `CE123456` | Aprobada · 100% (Plan Premium)     |
| DNI  | `11223344` | Rechazada (póliza vencida)         |
| DNI  | `99999999` | Rechazada (asegurado no existe)    |

## Estructura del Proyecto

- `/src/App.jsx`: Componente principal — todo el simulador (formulario, healthcheck y resultado)
- `/src/main.jsx`: Punto de entrada de React
- `/src/index.css`: Estilos globales e importación de Tailwind
- `/src/assets`: Recursos estáticos
- `/public`: Archivos públicos servidos tal cual

## Scripts

- `npm run dev`: Inicia el servidor de desarrollo
- `npm run build`: Genera el build de producción
- `npm run preview`: Previsualiza localmente el build de producción
- `npm run lint`: Ejecuta ESLint
