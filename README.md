# Barredor

**Desinstala programas de Windows y revisa los restos que dejan en tu equipo.**

Aplicación de escritorio desarrollada con Electron, con interfaz en español, asistente de desinstalación y herramientas de mantenimiento.

[Guía de uso](#uso-paso-a-paso) · [Ejecutar desde el código](#ejecutar-desde-el-código) · [Crear instalador](#crear-el-instalador-para-windows) · [Comunicar un problema](https://github.com/fcoleonlorente-prog/barredor/issues)

> **Estado del proyecto:** la versión declarada en el código es 1.0.0. En la revisión de documentación del 24 de octubre de 2026 no había versiones publicadas en GitHub Releases. El número de versión no acredita pruebas de compatibilidad ni una auditoría de seguridad.

## ¿Qué puedes hacer?

| Función | Descripción |
| --- | --- |
| Inventario de programas | Buscar por nombre, editor o comentario; consultar detalles y organizar por grupos. |
| Desinstalación asistida | Lanzar el desinstalador del programa y revisar después claves del registro, archivos y carpetas. |
| Análisis de restos | Elegir entre los modos Seguro, Moderado y Avanzado. |
| Desinstalación forzada | Buscar restos por nombre, carpeta o ejecutable cuando el programa ya no aparece o quedó eliminado a medias. |
| Desinstalación rápida | Procesar varios programas con una confirmación inicial y limpieza automática de coincidencias fuertes. |
| Gestor de inicio | Consultar y administrar entradas de inicio automático. |
| Herramientas de limpieza | Acceder a limpiadores de archivos basura, navegadores, Office y Windows. |
| Copias y exportación | Gestionar las copias disponibles y exportar el inventario a HTML o TXT. |
| Personalización | Cambiar entre tema claro y oscuro, vistas de iconos, lista o detalles. |

También incluye un modo cazador, herramientas de Windows y funciones de sobrescritura de archivos y espacio libre. Estas últimas no deben interpretarse como una garantía certificada de eliminación de datos.

## Antes de empezar

Barredor puede modificar el registro y eliminar datos. **Revisa cada selección antes de confirmar.** Una coincidencia clasificada como fuerte es un criterio del programa, no una garantía de que sea prescindible.

- Guarda tus documentos y cierra el programa que vayas a desinstalar.
- Conserva una copia independiente de tus datos importantes.
- Empieza con el asistente normal y el modo **Seguro**. El asistente selecciona **Moderado** inicialmente: cámbialo si quieres comenzar con menor alcance.
- Eleva los permisos únicamente cuando una operación los necesite.
- No utilices la desinstalación rápida como primera prueba: automatiza la eliminación de restos.
- Las copias del registro no equivalen a una copia completa del equipo ni recuperan todos los archivos borrados.

## Instalación y requisitos

El proyecto está orientado a **Windows** y utiliza herramientas del sistema como PowerShell y el registro. No se ofrece aquí una matriz de versiones de Windows o arquitecturas verificadas.

Para trabajar desde el código necesitas Git, Node.js y npm. La instalación de dependencias y la creación del instalador pueden requerir conexión a Internet.

### Ejecutar desde el código

Abre CMD o PowerShell y ejecuta cada línea por separado:

```powershell
git clone https://github.com/fcoleonlorente-prog/barredor.git
cd barredor
npm ci
npm start
```

Si descargaste el repositorio como ZIP, extráelo y abre la terminal dentro de la carpeta que contiene `package.json`; después ejecuta las dos últimas líneas.

### Crear el instalador para Windows

Desde la carpeta del proyecto, con las dependencias instaladas:

```powershell
npm run dist
```

El script utiliza **electron-builder** para generar un instalador **NSIS** en `dist/`. La configuración permite elegir la carpeta de instalación y crear accesos directos en el escritorio y el menú Inicio.

La configuración actual desactiva `signAndEditExecutable`; este repositorio no acredita un instalador firmado. Antes de distribuir un ejecutable, comprueba su procedencia y pruébalo en un entorno de Windows preparado para pruebas.

## Uso paso a paso

### 1. Buscar el programa

Abre **Desinstalador** y escribe su nombre o editor en el buscador. Selecciona un resultado y comprueba los detalles, especialmente el nombre y la ubicación.

Puedes cambiar entre las vistas **Iconos**, **Lista** y **Detalles**. Con el botón derecho puedes consultar la carpeta de instalación, añadir comentarios o asignar grupos.

### 2. Abrir el asistente

Pulsa **Desinstalar** y elige la profundidad del análisis:

| Modo | Alcance descrito por la interfaz |
| --- | --- |
| Seguro | Carpeta de instalación y claves con el nombre exacto del programa. |
| Moderado | Amplía la búsqueda a ubicaciones habituales, como AppData y el menú Inicio. |
| Avanzado | Búsqueda más amplia con nombres flexibles e identificadores. Requiere una revisión especialmente cuidadosa. |

El asistente intenta preparar copias del registro y un punto de restauración según las opciones activadas y los permisos disponibles. **Comprueba el registro de mensajes:** si falla el punto de restauración, el proceso puede continuar.

### 3. Completar la desinstalación original

Sigue las instrucciones del desinstalador del propio programa. Espera a que termine antes de buscar restos. El botón **Escanear ahora** permite omitir la espera; úsalo solo cuando hayas comprobado que el desinstalador ha finalizado.

### 4. Revisar las claves del registro

Los resultados en **negrita** son coincidencias fuertes que pueden seleccionarse para borrar. Las coincidencias débiles se muestran como información y no se eliminan mediante esta limpieza.

Desmarca cualquier elemento sobre el que tengas dudas. Antes de borrar una clave seleccionada, el proceso principal intenta exportar una copia; si esa copia falla, omite el borrado de esa clave.

### 5. Revisar archivos y carpetas

Comprueba las rutas y elimina solo los restos que reconozcas. La limpieza de restos utiliza la Papelera de reciclaje por defecto, salvo que cambies esa opción.

Esta regla **no se aplica a todas las herramientas**: el limpiador de basura elimina directamente, y otras limpiezas muestran avisos de que no se pueden deshacer.

### 6. Leer el resumen

Comprueba el número de elementos borrados y los fallos indicados. Si necesitas recuperar una clave, consulta el **Gestor de copias**. Los archivos enviados a la Papelera se recuperan desde la Papelera de Windows.

## Desinstalación forzada y rápida

**Forzada:** sirve para buscar restos de un programa ausente o eliminado a medias. Introduce su nombre o selecciona su carpeta o ejecutable. No lanza el desinstalador original; revisa los resultados antes de borrar.

**Rápida:** selecciona uno o varios programas con `Ctrl + clic` y pulsa **Desinstalación rápida**. Tras la confirmación inicial, los procesa uno a uno y elimina automáticamente los restos clasificados como fuertes. No cierres Barredor mientras trabaja.

## Copias y datos locales

Puedes abrir esta ubicación desde **Windows + R**:

```text
%APPDATA%\Barredor
```

| Ubicación | Contenido |
| --- | --- |
| `%APPDATA%\Barredor\config.json` | Opciones, grupos, comentarios y exclusiones. |
| `%APPDATA%\Barredor\copias` | Archivos de copia administrados por la aplicación. |
| `%APPDATA%\Barredor\selftest.json` | Informe generado por la autoprueba. |

No borres las copias hasta comprobar que el equipo y las aplicaciones funcionan correctamente.

## Solución de problemas

| Problema | Qué comprobar |
| --- | --- |
| La terminal no reconoce `npm` | Comprueba que Node.js y npm estén instalados; abre una terminal nueva y ejecuta `node --version` y `npm --version`. |
| PowerShell bloquea `npm.ps1` | Prueba el mismo comando con `npm.cmd` o utiliza CMD. No hace falta cambiar la política de ejecución para este paso. |
| `npm start` no encuentra el proyecto | Ejecuta el comando en la carpeta que contiene `package.json` y completa antes `npm ci`. |
| Acceso denegado al limpiar | Cierra el programa afectado. Si requiere permisos sobre ubicaciones protegidas, vuelve a abrir Barredor como administrador y revisa de nuevo la operación. |
| No aparece un programa | Pulsa **Actualizar** y revisa los filtros y opciones de programas de sistema y actualizaciones. |
| No se crea el punto de restauración | Lee el mensaje del asistente. No des por hecho que existe un punto de restauración si se muestra un fallo. |
| Un resto marcado no se elimina | Puede ser una coincidencia débil, estar excluido, bloqueado o en uso. Consulta el resumen; no fuerces el borrado manual sin identificarlo. |

Para informar de un fallo, abre una [incidencia](https://github.com/fcoleonlorente-prog/barredor/issues) indicando tu versión de Windows, versión de Barredor, pasos para reproducirlo y mensaje exacto. Oculta nombres de usuario, rutas personales y otros datos sensibles de las capturas o informes.

## Desarrollo y comprobaciones

| Comando | Función |
| --- | --- |
| `npm ci` | Instalar las dependencias del archivo de bloqueo. |
| `npm start` | Abrir la aplicación con Electron. |
| `npm run selftest` | Ejecutar la autoprueba integrada. |
| `npm run dist` | Generar el instalador de Windows en `dist/`. |

La autoprueba comprueba la interfaz, consulta programas y ejecuta escaneos. También crea archivos temporales propios para probar la sobrescritura y la Papelera, y escribe un informe local. Por eso no es una prueba estrictamente de solo lectura. Su resultado no sustituye la validación manual en Windows.

### Estructura del proyecto

| Ruta | Responsabilidad |
| --- | --- |
| `main.js` | Ventanas, comunicación IPC y coordinación de operaciones del sistema. |
| `preload.js` | Puente entre la interfaz y el proceso principal. |
| `lib/programs.js` | Inventario, desinstalación y búsqueda de restos. |
| `lib/tools.js` | Herramientas de mantenimiento. |
| `lib/util.js` | Configuración, copias, procesos y validaciones de rutas y claves. |
| `renderer/` | Interfaz, estilos y asistentes. |

Para proponer mejoras, explica el problema, incluye pasos para comprobar la solución y evita operaciones destructivas en las pruebas. Las correcciones de documentación también son bienvenidas.

## Límites y funciones pendientes

- El menú marca como **Próximamente** el monitor de instalación, la base de datos online de logs y la activación y licencias.
- El código incluye acciones para abrir búsquedas en Google y webs de programas mediante el navegador externo; no debe presentarse como una aplicación sin ninguna posibilidad de acceso a Internet.
- Los mecanismos de exclusión y copia reducen determinados riesgos, pero no garantizan una limpieza sin errores.
- No se afirma compatibilidad universal, recuperación completa ni eliminación certificada de información.

## Licencia y créditos

`package.json` declara la licencia **MIT**. En la revisión del 24 de octubre de 2026 no se encontró un archivo `LICENSE`; queda pendiente incorporar el texto y la atribución que correspondan al titular.

El README original indica que el proyecto se creó con **ClonaKit**.

---

Documentación contrastada con [la configuración del proyecto](package.json), [el proceso principal](main.js), [el asistente](renderer/uninstaller.js) y [las utilidades de datos y copias](lib/util.js).
