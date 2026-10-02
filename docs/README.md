# Base documental

Documentos generados desde Zoho Projects. Organizados por **tipo** en el primer nivel y por **proyecto** en el segundo.

## Estructura

```
docs/
├── liberaciones/<PROYECTO>/<fecha>.{md,html,pdf}     Documentos de liberación de versión
├── informes-horas/<YYYY-MM>-<EQUIPO>.{md,html,pdf}   Aprobación mensual de horas
├── analisis/<PROYECTO|general>/                      Análisis, diagnósticos y documentación funcional
├── backlogs/<PROYECTO>/                              Planeación y auditorías de backlog
├── calidad/<PROYECTO>/                               SonarQube, pentest, problemas críticos
└── guias/                                            Cómo se generan estos documentos
```

Fuera de `docs/`:

- **`assets/`** — `sigob-5.png`, el logo de portada que usan los HTML y los PDF.
- **`work/`** — archivos de trabajo: JSON de IDs creados, backups de descripciones, previews HTML. **No se versiona** (está en `.gitignore`).

## Convenciones

- **Un documento = tres archivos** con el mismo nombre base: `.md` (fuente), `.html` (maquetado con marca SIGOB) y `.pdf` (lo que se comparte).
- **Fechas en el nombre, formato ISO** (`2026-08-19`), para que ordenen solos.
- Cuando hay **varias versiones del PDF** se conserva el sufijo original de Zoho: `2026-08-19-Ver.260819.1326.pdf`. El `.pdf` sin sufijo es la primera versión.
- Los nombres de proyecto son las **claves cortas del portal**: `TLJ-CAT` (Tlajomulco), `NAVOJOA`, `NAY-ING-STE` (Nayarit), `JAL-OPENSIR` (Jalisco), `PCFDI`, `SIMUN`.

## Contenido actual

### Liberaciones
| Proyecto | Fecha | Archivos |
|---|---|---|
| TLJ-CAT | 2026-07-20 | md · html · pdf · pdf (Ver.260721.034) |
| NAVOJOA | 2026-07-22 | md · html · pdf (Ver.260723.0531) |
| NAY-ING-STE | 2026-08-19 | md · html · pdf (Ver.260818.1710) · pdf (Ver.260819.1326) |

### Informes de horas
| Periodo | Equipo | Archivos |
|---|---|---|
| 2026-08 | LIDERES Y QA FSW | md · html · pdf |

### Análisis
| Proyecto | Documento |
|---|---|
| TLJ-CAT | TP-EXENTOS-SIMUN-2026-07-24 (md · html · pdf) + `evidencia/` con capturas Postman |
| NAY-ING-STE | RIESGO-SALIDA-PRODUCCION-2026-09-08 (md · html · pdf) — análisis de riesgo del hito de remediación |
| SIMUN | CONVENIOS-2026-08-25 (md · html · pdf) |
| general | portal-v4 · DIAGNOSTICO-consulta-caja-padron · EXPLICACION-bugs-cargo-recargos · propuesta-registro-contribuyentes · OPTIMIZACION-endpoints-tramites-2026-08-27 |

### Backlogs
| Proyecto | Documento |
|---|---|
| PCFDI | Backlog-detallado-Plataforma-CFDI · Backlog-nuevos-anadidos · Auditoria-Zoho-vs-Plan |

### Calidad
| Proyecto | Documento |
|---|---|
| JAL-OPENSIR | sonarqube-FRONTEND-2026-08-26 (ALTAS y BLOQUEANTE) |
| NAY-ING-STE | problemas-criticos-2026-07.json |

### Guías
- `PLAYBOOK-documento-liberacion.md` — cómo se arma un documento de liberación desde URLs de Zoho
- `GUIA-ALTA-TAREAS-ZOHO.md` — convenciones para dar de alta tareas y subtareas
- `PLANTILLA-TAREAS-JALISCO.md` y `PLANTILLA-TAREAS-NAYARIT.md` — plantillas de referencia para crear tareas en esos proyectos

## Cómo se generan

```bash
npm run aprobar-horas -- --month=2026-08    # informe de horas → docs/informes-horas/
/liberacion <urls de Zoho>                  # documento de liberación → docs/liberaciones/
node scripts/html-to-pdf.mjs <in.html> <out.pdf>
```
