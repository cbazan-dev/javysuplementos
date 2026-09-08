# Sistema de diseño — Javy Suplementos

Fuente única de verdad de estilos. **No hardcodees colores en los componentes**:
usa las variables (tokens) definidas en [`css/tokens.css`](../css/tokens.css).

## Cómo carga

- `css/tokens.css` se incluye en **todas** las páginas públicas y **después** de
  `css/styles.css`, así que sus valores mandan.
- El panel admin (`admin.html`) es autocontenido: define su propio set `--pb-*`
  en `css/admin-dashboard.css`, pero con **los mismos valores** que estos tokens
  (misma paleta, un solo look).

## Base en capas (tema oscuro, menos negro)

Antes el body era negro puro (`#000`), lo que cansaba la vista. Ahora es un
azul-gris muy oscuro en capas para dar profundidad:

| Token | Valor | Uso |
|---|---|---|
| `--bg-0` | `#0b0e15` | Fondo base del body |
| `--bg-1` | `#10141d` | Secciones principales |
| `--bg-2` | `#161c28` | Superficies elevadas (nav, bloques) |
| `--surface-1` | `#1a2130` | Cards / paneles |
| `--surface-2` | `#141a25` | Bloques secundarios |
| `--surface-3` | `#202836` | Superficie más elevada / hover |
| `--surface-input` | `#131a26` | Inputs, selects, buscadores |

## Texto

`--text` (#e9eef7) principal · `--muted` (#a9b4c6) secundario · `--muted-2`
(#7c8799) terciario/hints.

## Color con significado (un color = un uso)

| Token | Color | Significa |
|---|---|---|
| `--brand` / `--brand-strong` | azul #0191c6 | Marca, enlaces, foco, acentos primarios |
| `--accent` | cyan #5ab4e9 | Precios y links de marca |
| `--cta` / `--cta-strong` / `--success` | verde #00e676 | **Acción principal**: Agregar, Guardar, Crear, éxito |
| `--danger` / `--danger-soft` | rojo #ff4f6b | Error / destructivo: Eliminar |
| `--warning` | ámbar #ffb300 | Advertencia / pendiente |
| `--hot` | rosa #ff2e63 | Acento cálido pequeño (badges/promos) |

Tintes de fondo suaves de estado: `--brand-tint`, `--cta-tint`, `--danger-tint`,
`--warning-tint`.

## Espaciado, radios, sombras

- **Espaciado** (escala 4·8): `--sp-1`…`--sp-8` = 4, 8, 12, 16, 24, 32, 48, 64px.
- **Radios**: `--radius-sm/md/lg/xl` (10–16px) y `--radius-pill`.
- **Sombras**: `--shadow-sm/-/-lg`. **Foco**: `--ring`.

## Botones

Componente único en [`css/components/buttons.css`](../css/components/buttons.css):
`.btn` + variante (`--primary` verde / `--secondary` azul / `--ghost` neutro /
`--danger` rojo) + tamaño (`--sm` / `--lg`) + modificadores (`--block`, `.btn__icon`).
Los botones a medida existentes (`.pdp__cta`, `.testimonials-btn`, `.ad-btn`…) se
migran a este componente de forma incremental.

## Breakpoints (estándar propuesto)

`480px` (mobile grande), `768px` (tablet), `1024px` (desktop). La migración de los
breakpoints dispares existentes es gradual.
