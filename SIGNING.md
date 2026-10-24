# Firma digital con SignPath Foundation

Pasos que solo puede hacer el titular del proyecto (yo no puedo crear cuentas ni claves):

1. Solicita el programa gratuito para código abierto en https://signpath.org (formulario "apply"). Piden, entre otras cosas, una licencia de código abierto aprobada (este repositorio es MIT), un repositorio público y que el programa no sea malicioso ni potencialmente no deseado. Un desinstalador que borra claves del registro puede revisarse con más cuidado: explica que pide confirmación y guarda copias.
2. Cuando te aprueben, en SignPath crea el proyecto con identificador `barredor`, una política `release-signing` y una configuración de artefacto que firme el `.exe` que contiene el zip subido.
3. En GitHub (Settings > Secrets and variables > Actions):
   - Secret `SIGNPATH_API_TOKEN`: el token de API de SignPath.
   - Variable `SIGNPATH_ORGANIZATION_ID`: el identificador de tu organización en SignPath.
4. Para publicar: `git tag v1.0.1 && git push origin v1.0.1`. La automatización construye, firma y crea el Release con el `.exe` firmado.

Hasta que SignPath te apruebe, el paso de firma falla. Mientras tanto usa el instalador sin firmar de `npm run dist`.
