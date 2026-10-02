# Issues de SonarQube

- **Instancia:** https://sonarqube.migob.mx
- **Generado:** 2026-08-26T19:22:40.407Z
- **Issues en este documento:** 1
- **Totales del filtro:** 1 abiertos · 0 cerrados · 0 reabiertos
- **Esfuerzo estimado por SonarQube:** 4min
- **Filtro aplicado:** `{"estado":"open","projectKey":["jal_OPENSIR-FRONTEND"],"impactSeverity":["BLOCKER"],"soloReabiertos":false}`

> La fecha de detección la reporta SonarQube y es exacta. La de cierre es la fecha en que atm-tools observó que el issue ya no aparecía: su precisión es la frecuencia de sincronización, y lo corregido antes de la primera sincronización no está registrado.

## Resumen por gravedad

| Gravedad | Issues |
|---|---:|
| Bloqueante | 1 |

## jal_OPENSIR-FRONTEND

### `src/components/BusquedaAvanzadaPadrones/columns/contribuyente.tsx`

- **Refactor this function to not always return the same value.**
  - línea 12 · Bloqueante · Mantenibilidad · esfuerzo 4min
  - regla: [`typescript:S3516`](#regla-typescript-s3516)

---

# Apéndice · Reglas

Qué significa cada regla y cómo se corrige, según SonarQube. Una entrada por regla, referenciada desde los issues de arriba.

## <a id="regla-typescript-s3516"></a>`typescript:S3516` — Function returns should not be invariant

_lenguaje: ts · categoría: INTENTIONAL_

### ¿Por qué es un problema?

When a function has multiple `return` statements and returns the same value in more than one of them, it can lead to several potential
problems:

- It can make the code more difficult to understand and maintain, as the reader may be unsure why the same value is being returned multiple times. This can introduce ambiguity and increase the chances of misunderstanding the function’s intent.
- The use of multiple return statements with the same value might lead someone to assume that each return corresponds to a distinct case or outcome. However, if they all return the same value, it can be misleading and may indicate an oversight or mistake in the code.
- When the function needs to be modified or extended in the future, having multiple identical return statements can make it harder to implement changes correctly across all occurrences. This can introduce bugs and inconsistencies in the codebase.
- Code readability is crucial for maintainability and collaboration. Having repetitive return statements can lead to unnecessary code duplication, which should be avoided in favor of creating modular and clean code.
- This often happens in functions that perform a conditional side effect but always return the same value.

This rule raises an issue when a function contains several `return` statements that all return the same value.

```ts
function f(a, g) { // Noncompliant: 'f' returns 'false' on 3 different return statements
  if (a < 0) {
    return false;
  }
  if (a > 10) {
    g(a); // side effect
    return false;
  }
  return false;
}
```

To address this, you should refactor the function to use a single return statement with a variable storing the value to be returned. This way, the
code becomes more concise, easier to understand, and reduces the likelihood of introducing errors when making changes in the future. By using a single
return point, you can also enforce consistency and prevent unexpected return values.

```ts
function f(a, g) {
  if (a > 10) {
    g(a); // side effect
  }
  return false;
}
```

### Referencias

#### Documentation

- MDN web docs - [`return`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Statements/return)
- MDN web docs - [Function return values](https://developer.mozilla.org/en-US/docs/Learn/JavaScript/Building_blocks/Return_values)
