# 📈 ExplodeX — Interfaz web

Frontend de un **proyecto experimental** para análisis de mercados, seguimiento de señales y ejercicios de simulación (*paper trading*).

> **Aviso:** la aplicación es una herramienta de investigación y práctica; no representa asesoría financiera ni garantiza resultados de inversión.

## Stack

- **Next.js 15**, React 19 y TypeScript
- Tailwind CSS
- KlineCharts para visualización de velas
- Integración con la API de ExplodeX

## Secciones del proyecto

La estructura `app/` contiene apartados para:

- `practice/` — práctica y simulación
- `scanner/` — búsqueda y revisión de oportunidades
- `market/` y `coin/` — análisis de mercado y activos
- `alerts/` y `plans/` — alertas y planes
- `paper/`, `trades/` y `journal/` — operaciones simuladas y registro
- `stats/`, `positions/` y `settings/` — estadísticas, posiciones y ajustes

La presencia de un apartado no implica que todas sus funciones estén listas para producción.

## Ejecutar localmente

```bash
npm install
npm run dev
```

Para compilar:

```bash
npm run build
```

La interfaz necesita un backend disponible. La plantilla `.env.example` contiene la variable `NEXT_PUBLIC_API_BASE_URL` para indicar la dirección pública de la API. Configúrala según tu entorno, sin exponer secretos en variables `NEXT_PUBLIC_*`.

## Estructura básica

```text
app/         # Rutas y páginas
components/  # Paneles, gráficos y componentes
lib/         # Integración de API y lógica auxiliar
```

## Backend y pruebas

Consulta [explodex-backend](https://github.com/daniel102sa1/explodex-backend), donde se implementan servicios con FastAPI y existen pruebas de backend.

## Estado

**Experimental y en evolución.** Antes de cualquier uso real, valida integraciones, seguridad, datos, experiencia de usuario y resultados de simulación.

**Autor:** [Jeancarlo Daniel Rodríguez Pivaral](https://github.com/daniel102sa1)
